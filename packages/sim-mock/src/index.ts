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
  transfer: 3600,
  repair: 7200,
  operations: 3 * 86_400,
  cruise: 30 * 86_400,
  encounter: 10 * 86_400,
  exit: 86_400,
};

const PHASES: Record<ScenarioId, string[]> = {
  "level1-repair": ["hangar", "transfer", "repair", "complete"],
  "level2-leo": ["hangar", "operations", "complete"],
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
      altitude_km: 400,
      target_altitude_km: 535,
      delta_v_remaining_m_s: 120,
      comm_window_open: false,
      repair_progress_pct: 0,
      mass_capacity_kg: 110,
    };
  }
  if (scenario === "level2-leo") {
    return {
      ...common,
      resources: {
        mass_kg: 180,
        power_generated_w: 220,
        power_consumed_w: 140,
        budget_usd_m: 120,
        data_stored_mb: 0,
        downlink_rate_kbps: 0,
        mission_elapsed_s: 0,
      },
      altitude_km: 700,
      inclination_deg: 98.2,
      battery_wh: 400,
      battery_capacity_wh: 400,
      data_downlinked_mb: 0,
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
          state.comm_window_open = state.resources.mission_elapsed_s % 5400 < 600;
          if (state.phase === "repair" && state.comm_window_open) {
            state.repair_progress_pct = Math.min(100, (state.repair_progress_pct ?? 0) + dt_s / 24);
            if (state.repair_progress_pct >= 100) nextPhase();
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
              state.phase === "transfer" &&
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
