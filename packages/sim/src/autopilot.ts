// Pilotos automáticos: juegan los niveles con reglas simples (pruebas, CLI y demo).
import type { SimState, Simulation } from "@ikaros/contracts";
import { createSimulation } from "./index";
import * as physics from "./physics";
import { scenario } from "./data";
import paperJson from "../../../data/paper-solar-probe-plus.json";
import constants from "../../../data/constants.json";

const def3 = scenario("level3-ikaros");
const p3 = (k: string) => def3.params[k]!.value;

export function pickAll(sim: Simulation, picks: Record<string, string>): SimState {
  let s!: SimState;
  for (const [slot, id] of Object.entries(picks))
    s = sim.act({ type: "select-component", slot, componentId: id });
  return s;
}

export function resolveOpen(sim: Simulation, s: SimState, trigger: string, choice: string): SimState {
  const ev = s.events.find((e) => e.trigger === trigger && e.choices && !e.resolved);
  return ev ? sim.act({ type: "resolve-event", eventId: ev.id, choice }) : s;
}

/** Retracción que deja el calor del lazo en `margin` de la capacidad del radiador. */
export function idealRetraction(s: SimState, load_w: number, margin = 0.9): number {
  const r = s.distance_to_sun_au ?? 1;
  const I = physics.solarIntensity(r);
  const eta = paperJson.cell_efficiency.value;
  const tRad = physics.toKelvin(paperJson.radiator_temp_c.value);
  const exposed =
    s.attitude === "antenna-to-earth" ? I * p3("radiator_area_m2") * p3("radiator_sun_exposure") : 0;
  const qMax =
    physics.radiatorCapacity(p3("radiator_area_m2"), p3("radiator_emissivity"), tRad) * margin - exposed;
  const areaHeat = qMax / ((1 - eta) * I);
  const areaPower = (load_w * 1.05) / (eta * I);
  const area_m2 = Math.min(areaHeat, Math.max(areaPower, 0));
  const full = p3("secondary_array_area_cm2") / 10_000;
  return Math.min(1, Math.max(0, 1 - area_m2 / full));
}

export interface PilotOptions {
  picks?: Record<string, string>;
  flybys?: boolean;
  retract?: boolean;
  stow?: boolean;
  cme?: string;
  downlink?: boolean;
  seed?: number;
  onStep?: (s: SimState) => void;
}

export const REAL_CONFIG = {
  energy: "pv-cooled",
  shield: "shield-cc",
  science: "corona-sensors",
};

export function playLevel3(opts: PilotOptions = {}) {
  const sim = createSimulation();
  let s = sim.load("level3-ikaros", opts.seed ?? 7);
  pickAll(sim, opts.picks ?? REAL_CONFIG);
  s = sim.act({ type: "launch" });
  let guard = 0;
  while (s.phase !== "complete" && guard++ < 200_000) {
    if (s.phase === "cruise") {
      s = resolveOpen(sim, s, "level3:venus-window", opts.flybys === false ? "skip" : "execute");
      s = sim.step(s.phase === "cruise" ? 86_400 : 60);
      opts.onStep?.(s);
      continue;
    }
    if (s.phase === "encounter") {
      if (opts.stow !== false && !s.main_array_stowed) s = sim.act({ type: "stow-main-array" });
      if (opts.retract !== false) {
        s = sim.act({
          type: "retract-array",
          fraction: idealRetraction(s, Math.max(s.power_load_w ?? 0, paperJson.min_power_w.value)),
        });
      }
      if (opts.cme) s = resolveOpen(sim, s, "level3:cme", opts.cme);
      if (opts.downlink) {
        const far = (s.distance_to_sun_au ?? 0) > 0.15;
        const full = s.resources.data_stored_mb > (s.attitude === "antenna-to-earth" ? 50 : 2000);
        const want = far && full ? "antenna-to-earth" : "shield-to-sun";
        if (s.attitude !== want) s = sim.act({ type: "set-attitude", attitude: want });
      }
      s = sim.step(300);
      opts.onStep?.(s);
      continue;
    }
    if (s.phase === "exit") {
      s = resolveOpen(sim, s, "level3:ejection", "eject");
      s = sim.step(3600);
      opts.onStep?.(s);
      continue;
    }
    break;
  }
  return { sim, state: s, report: sim.report() };
}

export function playLevel1(
  opts: { picks?: Record<string, string>; aim_m_s?: number; onStep?: (s: SimState) => void } = {},
) {
  const sim = createSimulation();
  let s = sim.load("level1-repair", 1);
  pickAll(sim, opts.picks ?? { panel: "panel-spare", antenna: "antenna-spare", toolkit: "toolkit-std" });
  s = sim.act({ type: "launch" });
  const r = (alt: number) => constants.earth_radius_km.value + alt;
  let guard = 0;
  while (s.phase !== "complete" && guard++ < 100_000) {
    if (s.phase === "transfer") {
      const diff = (s.target_altitude_km ?? 0) - (s.altitude_km ?? 0);
      const transferring = s.events.at(-1)?.trigger === "level1:burn";
      if (!transferring && Math.abs(diff) > 0.5) {
        const dv =
          opts.aim_m_s ??
          Math.sign(diff) *
            physics.hohmannDeltaV(
              constants.mu_earth_km3_s2.value,
              r(s.altitude_km ?? 0),
              r(s.target_altitude_km ?? 0),
            ) *
            1000;
        s = sim.act({ type: "burn", delta_v_m_s: dv });
      }
    }
    s = sim.step(60);
    opts.onStep?.(s);
  }
  return { sim, state: s, report: sim.report() };
}
