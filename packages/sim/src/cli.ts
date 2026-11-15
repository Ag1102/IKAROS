// Imprime la telemetría de una misión jugada por el piloto automático.
// Uso: npm run telemetry -- [level1-repair|level3-ikaros] [semilla]
import type { ScenarioId, SimState } from "@ikaros/contracts";
import { playLevel1, playLevel3, pickAll } from "./autopilot";
import { createSimulation } from "./index";

const id = (process.argv[2] ?? "level3-ikaros") as ScenarioId;
const seed = Number(process.argv[3] ?? 7);

const fmt = (n: number | undefined, d = 1) => (n === undefined ? "—" : n.toFixed(d));
const hms = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `T+${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function row(s: SimState): string {
  const r = s.resources;
  if (s.scenario === "level3-ikaros") {
    return [
      hms(r.mission_elapsed_s),
      s.phase.padEnd(9),
      `${fmt(s.distance_to_sun_rsun, 2)} R☉`,
      `${fmt(s.speed_km_s)} km/s`,
      `ilum ${fmt(s.array_illuminated_cm2)} cm²`,
      `celda ${fmt(s.cell_temperature_c)} °C`,
      `P ${fmt(r.power_generated_w, 0)}/${fmt(s.power_load_w, 0)} W`,
      `casco ${fmt(s.hull_durability_pct)} %`,
      `datos ${fmt(r.data_stored_mb, 0)} MB`,
      s.health.toUpperCase(),
    ].join("  ");
  }
  return [
    hms(r.mission_elapsed_s),
    s.phase.padEnd(10),
    `alt ${fmt(s.altitude_km, 2)} km`,
    `Δv ${fmt(s.delta_v_remaining_m_s)} m/s`,
    `enlace ${s.comm_window_open ? "ABIERTO" : "cerrado"}`,
    `rep ${fmt(s.repair_progress_pct)} %`,
    `bat ${fmt(s.battery_wh, 0)} Wh`,
    `datos ${fmt(r.data_stored_mb, 0)} MB`,
    s.health.toUpperCase(),
  ].join("  ");
}

function sampled(states: SimState[], every: number) {
  let last = -Infinity;
  for (const s of states) {
    if (s.resources.mission_elapsed_s - last >= every || s.phase === "complete") {
      console.log(row(s));
      last = s.resources.mission_elapsed_s;
    }
  }
}

const trace: SimState[] = [];
let report;
if (id === "level1-repair") {
  const result = playLevel1({ onStep: (s) => trace.push(s) });
  report = result.report;
  sampled(trace, 1800);
} else if (id === "level3-ikaros") {
  const result = playLevel3({ seed, downlink: true, cme: "safe-mode", onStep: (s) => trace.push(s) });
  report = result.report;
  sampled(
    trace.filter((s) => s.phase !== "cruise"),
    6 * 3600,
  );
} else {
  const sim = createSimulation();
  sim.load(id, seed);
  pickAll(sim, {
    objective: "obj-fires",
    instrument: "inst-thermal",
    power: "pwr-small",
    battery: "bat-large",
    comms: "com-xband",
    orbit: "orb-sso",
    launcher: "lv-pegasus",
  });
  let s = sim.act({ type: "launch" });
  while (s.phase !== "complete") {
    s = sim.step(600);
    trace.push(s);
  }
  report = sim.report();
  sampled(trace, 6 * 3600);
}

const events = trace.at(-1)?.events ?? [];
console.log("\nEventos:");
for (const e of events.filter((e) => e.kind !== "info").slice(0, 25))
  console.log(`  ${hms(e.at_s)} [${e.kind}] ${e.text}`);
console.log("\nInforme:", JSON.stringify(report, null, 2));
