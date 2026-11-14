import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentEntry } from "@ikaros/contracts";
import { createSimulation } from "../packages/sim/src/index";
import { pickAll, playLevel1, playLevel3, REAL_CONFIG, resolveOpen } from "../packages/sim/src/autopilot";

const triggers = new Set(
  (JSON.parse(readFileSync(join(__dirname, "../content/assistant.json"), "utf8")) as ContentEntry[]).map(
    (e) => e.trigger,
  ),
);

describe("nivel 1: servicio en órbita", () => {
  it("una transferencia de Hohmann exacta acopla y repara todo", () => {
    const { report, state } = playLevel1();
    expect(report.outcome).toBe("success");
    expect(report.metrics.tasks_done).toBe(2);
    expect(report.metrics.delta_v_used_m_s).toBeCloseTo(report.metrics.delta_v_ideal_m_s as number, 1);
    expect(state.phase).toBe("complete");
  });

  it("sin la antena la misión es parcial", () => {
    const { report } = playLevel1({ picks: { panel: "panel-spare", toolkit: "toolkit-std" } });
    expect(report.outcome).toBe("partial");
    expect(report.causes.some((c) => c.text.includes("antena"))).toBe(true);
  });

  it("un encendido excesivo agota el combustible y falla", () => {
    const { report } = playLevel1({ aim_m_s: 400 });
    expect(report.outcome).toBe("failure");
    expect(report.metrics.docked).toBe(false);
  });

  it("bloquea el despegue con sobrepeso", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    pickAll(sim, {
      panel: "panel-spare",
      antenna: "antenna-spare",
      toolkit: "toolkit-std",
      camera: "camera-insp",
    });
    const s = sim.act({ type: "launch" });
    expect(s.phase).toBe("hangar");
    expect(s.events.at(-1)?.trigger).toBe("level1:overweight");
  });

  it("más carga, menos delta-V (Tsiolkovsky)", () => {
    const sim = createSimulation();
    const empty = sim.load("level1-repair", 1).delta_v_remaining_m_s ?? 0;
    const loaded =
      sim.act({ type: "select-component", slot: "panel", componentId: "panel-spare" })
        .delta_v_remaining_m_s ?? 0;
    expect(loaded).toBeLessThan(empty);
  });
});

describe("nivel 3: Ikaros", () => {
  it("configuración del paper bien pilotada llega a 9.5 R☉ y gana", () => {
    const { report } = playLevel3({ downlink: true, cme: "safe-mode" });
    expect(report.outcome).toBe("success");
    expect(report.metrics.min_distance_rsun).toBeCloseTo(9.5, 1);
    expect(report.metrics.minutes_over_cell_limit).toBe(0);
    expect(report.metrics.max_speed_km_s as number).toBeGreaterThan(180);
  });

  it("sin retraer la matriz las celdas se queman y la misión falla", () => {
    const { report } = playLevel3({ retract: false });
    expect(report.outcome).toBe("failure");
    expect(report.metrics.max_cell_temperature_c as number).toBeGreaterThan(350);
  });

  it("sin plegar la matriz principal se destruye", () => {
    const { report } = playLevel3({ stow: false });
    expect(report.metrics.main_array_lost).toBe(true);
  });

  it("sin sobrevuelos de Venus el perihelio no baja y el resultado es parcial", () => {
    const { report } = playLevel3({ flybys: false });
    expect(report.outcome).toBe("partial");
    expect(report.metrics.venus_flybys).toBe(0);
  });

  it("bloquea el lanzamiento si la masa supera la capacidad", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 1);
    pickAll(sim, {
      energy: "fission-reactor",
      shield: "shield-liquid-metal",
      defense: "hts-field",
      repair: "nanobots",
      science: "sensors-capsule",
    });
    const s = sim.act({ type: "launch" });
    expect(s.phase).toBe("hangar");
    expect(s.events.some((e) => e.trigger === "level3:launch-blocked")).toBe(true);
  });

  it("la CME se resuelve sola como timeout al vencer el plazo", () => {
    for (let seed = 1; seed < 20; seed++) {
      const { state } = playLevel3({ seed });
      const cme = state.events.find((e) => e.trigger === "level3:cme");
      if (!cme) continue;
      expect(cme.resolved).toBe("timeout");
      return;
    }
    throw new Error("ninguna semilla generó una CME");
  });

  it("la misma semilla da la misma misión", () => {
    const a = playLevel3({ seed: 42, downlink: true });
    const b = playLevel3({ seed: 42, downlink: true });
    expect(a.report).toEqual(b.report);
  });

  it("el diseño se cierra al lanzar", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 1);
    pickAll(sim, REAL_CONFIG);
    sim.act({ type: "launch" });
    const s = sim.act({ type: "select-component", slot: "energy", componentId: "stirling" });
    expect(s.selected?.energy).toBe("pv-cooled");
  });

  it("una ventana de Venus pide decisión con plazo", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 1);
    pickAll(sim, REAL_CONFIG);
    sim.act({ type: "launch" });
    let s = sim.step(86_400);
    while (!s.events.some((e) => e.trigger === "level3:venus-window")) s = sim.step(86_400);
    const ev = s.events.find((e) => e.trigger === "level3:venus-window");
    expect(ev?.choices?.map((c) => c.id)).toEqual(["execute", "skip"]);
    expect(ev?.deadline_s).toBeGreaterThan(ev?.at_s ?? 0);
    s = resolveOpen(sim, s, "level3:venus-window", "execute");
    expect(s.perihelion_rsun).toBe(25);
  });
});

describe("nivel 2: observación LEO", () => {
  const good = {
    objective: "obj-fires",
    instrument: "inst-thermal",
    power: "pwr-small",
    battery: "bat-large",
    comms: "com-xband",
    orbit: "orb-sso",
    launcher: "lv-pegasus",
  };

  it("un diseño compatible opera 3 días y baja datos", () => {
    const sim = createSimulation();
    sim.load("level2-leo", 3);
    pickAll(sim, good);
    let s = sim.act({ type: "launch" });
    expect(s.phase).toBe("operations");
    while (s.phase !== "complete") s = sim.step(3600);
    const r = sim.report();
    expect(["success", "partial"]).toContain(r.outcome);
    expect(r.metrics.data_downlinked_mb as number).toBeGreaterThan(0);
  });

  it("bloquea un lanzador sin capacidad para la órbita polar", () => {
    const sim = createSimulation();
    sim.load("level2-leo", 3);
    pickAll(sim, { ...good, launcher: "lv-electron" });
    const s = sim.act({ type: "launch" });
    expect(s.resources.mass_kg).toBeGreaterThan(s.mass_capacity_kg ?? Infinity);
    expect(s.phase).toBe("hangar");
    expect(s.events.some((e) => e.trigger === "level2:launch-blocked")).toBe(true);
  });
});

describe("contenido conectado con el motor", () => {
  it("los disparadores principales tienen texto del asistente", () => {
    for (const t of [
      "level1:start",
      "level1:docked",
      "level3:encounter-start",
      "level3:cme",
      "level3:venus-window",
    ]) {
      expect(triggers.has(t), t).toBe(true);
    }
  });
});
