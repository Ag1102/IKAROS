// Simulación falsa con valores fijos que cumple el contrato, para que apps/web
// avance sin esperar al motor real. No hay física: solo pasa el tiempo y cambian las fases.
import type {
  MissionReport,
  PlayerAction,
  ScenarioId,
  SimEvent,
  SimState,
  Simulation,
} from "@ikaros/contracts";

export type { Simulation } from "@ikaros/contracts";

/** Segundos de misión que dura cada fase en el mock antes de pasar a la siguiente. */
const PHASE_DURATION_S: Record<string, number> = {
  phasing: 3600,
  rendezvous: 5400,
  approach: 1200,
  cruise: 30 * 86_400,
  encounter: 10 * 86_400,
  exit: 86_400,
};

const PHASES: Record<ScenarioId, string[]> = {
  "level1-repair": ["hangar", "phasing", "rendezvous", "approach", "complete"],
  "level3-ikaros": ["hangar", "cruise", "encounter", "exit", "complete"],
};

function baseState(scenario: ScenarioId): SimState {
  const common = {
    scenario,
    health: "nominal" as const,
    phase: "hangar",
    events: [] as SimEvent[],
    selected: {},
  };
  if (scenario === "level1-repair") {
    return {
      ...common,
      resources: {
        mass_kg: 700,
        power_generated_w: 1500,
        power_consumed_w: 900,
        budget_usd_m: 50,
        data_stored_mb: 0,
        downlink_rate_kbps: 0,
        mission_elapsed_s: 0,
      },
      altitude_km: 345,
      target_altitude_km: 415,
      inclination_deg: 51.6,
      delta_v_remaining_m_s: 60,
      fuel_kg: 2200,
      fuel_capacity_kg: 2200,
      fuel_reserve_kg: 200,
      target_lead_deg: 12,
      ideal_lead_deg: 1.4,
      in_daylight: true,
      rcs_assist: true,
      in_corridor: true,
      mass_capacity_kg: 16000,
    };
  }
  return {
    ...common,
    resources: {
      mass_kg: 2450,
      power_generated_w: 666,
      power_consumed_w: 482,
      budget_usd_m: 500,
      data_stored_mb: 0,
      downlink_rate_kbps: 0,
      mission_elapsed_s: 0,
    },
    distance_to_sun_km: 37_400_000,
    distance_to_sun_rsun: 53.7,
    distance_to_sun_au: 0.25,
    solar_intensity_suns: 16,
    perihelion_rsun: 38.7,
    venus_flybys_done: 0,
    speed_km_s: 60,
    cell_temperature_c: 95,
    radiator_temperature_c: 80,
    hull_durability_pct: 100,
    array_retraction: 0,
    array_illuminated_cm2: 1350,
    array_tilt_deg: 74,
    main_array_stowed: false,
    main_array_temperature_c: 150,
    attitude: "shield-to-sun",
    radiators_shaded: true,
    power_load_w: 482,
    battery_wh: 1500,
    battery_capacity_wh: 1500,
    nanobot_reserve_pct: 100,
  };
}

export function createSimulation(): Simulation {
  let state: SimState = baseState("level3-ikaros");
  let eventCount = 0;
  let phaseStart = 0;

  const push = (text: string, kind: SimEvent["kind"] = "info", extra: Partial<SimEvent> = {}) => {
    state.events = [
      ...state.events,
      { id: `mock-${++eventCount}`, at_s: state.resources.mission_elapsed_s, kind, text, ...extra },
    ];
  };

  const nextPhase = () => {
    const list = PHASES[state.scenario];
    const i = list.indexOf(state.phase);
    state.phase = list[Math.min(i + 1, list.length - 1)] ?? state.phase;
    phaseStart = state.resources.mission_elapsed_s;
    push(`Fase: ${state.phase}`, "info", { trigger: `${state.scenario}:${state.phase}` });
  };

  return {
    load(scenario, _seed) {
      state = baseState(scenario);
      eventCount = 0;
      phaseStart = 0;
      push("Simulación falsa cargada (sim-mock).", "info", { trigger: `${scenario}:start` });
      return structuredClone(state);
    },

    step(dt_s) {
      if (!Number.isFinite(dt_s) || dt_s <= 0 || state.phase === "hangar" || state.phase === "complete") {
        return structuredClone(state);
      }
      state.resources.mission_elapsed_s += dt_s;
      const limit = PHASE_DURATION_S[state.phase];
      if (limit !== undefined && state.resources.mission_elapsed_s - phaseStart >= limit) nextPhase();
      if (state.phase !== "hangar" && state.phase !== "complete") {
        state.resources.data_stored_mb += dt_s * 0.01;
        if (state.scenario === "level3-ikaros") {
          // Oscila entre 0.25 AU y el perihelio para que la escena tenga movimiento.
          const t = state.resources.mission_elapsed_s / 86_400;
          const au = 0.044 + 0.206 * Math.abs(Math.cos(t / 3));
          state.distance_to_sun_au = au;
          state.distance_to_sun_km = au * 149_597_870.7;
          state.distance_to_sun_rsun = state.distance_to_sun_km / 696_000;
          state.solar_intensity_suns = 1 / (au * au);
        }
        if (state.scenario === "level1-repair") {
          // La ISS se acerca sola y el acercamiento final avanza a 0.1 m/s.
          state.target_lead_deg = Math.max(0, (state.target_lead_deg ?? 0) - dt_s / 1000);
          if (state.phase === "approach") {
            const x = Math.max(0, (state.rel_position_m?.x ?? 122) - dt_s * 0.1);
            state.rel_position_m = { x, y: 0, z: 0 };
            state.rel_velocity_m_s = { x: -0.1, y: 0, z: 0 };
          }
        }
      }
      return structuredClone(state);
    },

    act(action: PlayerAction) {
      switch (action.type) {
        case "select-component":
          state.selected = { ...state.selected, [action.slot]: action.componentId };
          break;
        case "launch":
          if (state.phase === "hangar") nextPhase();
          break;
        case "burn":
          if (state.altitude_km !== undefined) {
            state.altitude_km += action.delta_v_m_s * 1.8;
            state.delta_v_remaining_m_s = Math.max(
              0,
              (state.delta_v_remaining_m_s ?? 0) - Math.abs(action.delta_v_m_s),
            );
            if (
              state.phase === "phasing" &&
              Math.abs(state.altitude_km - (state.target_altitude_km ?? 0)) < 2
            ) {
              nextPhase();
            }
          }
          break;
        case "retract-array":
          state.array_retraction = action.fraction;
          state.array_illuminated_cm2 = 1350 * (1 - action.fraction);
          break;
        case "tilt-array":
          state.array_tilt_deg = action.deg;
          break;
        case "stow-main-array":
          state.main_array_stowed = true;
          break;
        case "set-attitude":
          state.attitude = action.attitude;
          state.radiators_shaded = action.attitude === "shield-to-sun";
          break;
        case "resolve-event":
          state.events = state.events.map((e) =>
            e.id === action.eventId ? { ...e, resolved: action.choice } : e,
          );
          break;
        case "rcs":
          if (state.rel_velocity_m_s) {
            state.rel_velocity_m_s = {
              x: state.rel_velocity_m_s.x + action.x,
              y: state.rel_velocity_m_s.y + action.y,
              z: state.rel_velocity_m_s.z + action.z,
            };
          }
          break;
        case "set-assist":
          state.rcs_assist = action.on;
          break;
        case "set-system":
        case "set-time-scale":
          break;
      }
      return structuredClone(state);
    },

    report(): MissionReport {
      return {
        scenario: state.scenario,
        outcome: state.phase === "complete" ? "success" : "partial",
        score: state.phase === "complete" ? 5000 : 0,
        causes: [{ text: "Informe falso del sim-mock.", segment: "space", origin: "theoretical" }],
        metrics: { mission_elapsed_s: state.resources.mission_elapsed_s },
        advice: ["Cambiar a @ikaros/sim para ver resultados reales."],
        comparisons: [],
      };
    },
  };
}
