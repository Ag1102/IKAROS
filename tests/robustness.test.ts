import { describe, expect, it } from "vitest";
import type { SimState, Simulation } from "@ikaros/contracts";
import { createSimulation, physics } from "../packages/sim/src/index";
import constants from "../data/constants.json";
import { createSimulation as createMock } from "../packages/sim-mock/src/index";
import { pickAll, REAL_CONFIG } from "../packages/sim/src/autopilot";
import { createRng } from "../packages/sim/src/rng";

const LEO = {
  objective: "obj-fires",
  instrument: "inst-thermal",
  power: "pwr-large",
  battery: "bat-large",
  comms: "com-xband",
  orbit: "orb-sso",
  launcher: "lv-pegasus",
};

function stepMany(sim: Simulation, total_s: number, dt_s: number): SimState {
  let s!: SimState;
  for (let t = 0; t < total_s - 1e-9; t += dt_s) s = sim.step(dt_s);
  return s;
}

/** Nivel 3 ya en el encuentro, con la matriz principal plegada. */
function inEncounter(): Simulation {
  const sim = createSimulation();
  sim.load("level3-ikaros", 1);
  pickAll(sim, REAL_CONFIG);
  let s = sim.act({ type: "launch" });
  while (s.phase === "cruise") {
    const ev = s.events.find((e) => e.choices && !e.resolved);
    s = ev ? sim.act({ type: "resolve-event", eventId: ev.id, choice: "skip" }) : sim.step(86_400);
  }
  sim.act({ type: "stow-main-array" });
  return sim;
}

describe("entradas raras del cliente", () => {
  it("step con Infinity, NaN, cero o negativo no hace nada", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    sim.act({ type: "launch" });
    for (const dt of [Infinity, NaN, 0, -5]) {
      expect(sim.step(dt).resources.mission_elapsed_s).toBe(0);
    }
  });

  it("un step enorme termina y se limita a un año", () => {
    const sim = createSimulation();
    sim.load("level2-leo", 1);
    pickAll(sim, LEO);
    sim.act({ type: "launch" });
    const s = sim.step(1e12);
    expect(s.phase).toBe("complete");
  });

  it("el reloj de misión no corre en el hangar", () => {
    const sim = createSimulation();
    sim.load("level2-leo", 1);
    pickAll(sim, LEO);
    expect(sim.step(500_000).resources.mission_elapsed_s).toBe(0);
    let s = sim.act({ type: "launch" });
    s = sim.step(1);
    expect(s.phase).toBe("operations");
  });

  it("NaN en retract-array o tilt-array se ignora", () => {
    const sim = inEncounter();
    const before = sim.step(60);
    const s = sim.act({ type: "retract-array", fraction: NaN });
    sim.act({ type: "tilt-array", deg: NaN });
    expect(s.array_retraction).toBe(before.array_retraction);
    const after = sim.step(600);
    expect(Number.isFinite(after.cell_temperature_c)).toBe(true);
    expect(Number.isFinite(after.resources.power_generated_w)).toBe(true);
  });

  it("los decimales de la semilla cuentan", () => {
    expect(createRng(0.1)()).not.toBe(createRng(0.2)());
    expect(createRng(0.1)()).toBe(createRng(0.1)());
  });

  it("un escenario desconocido falla con un mensaje claro", () => {
    const sim = createSimulation();
    expect(() => sim.load("level9" as never, 1)).toThrow(/desconocido/);
  });
});

describe("el resultado no depende del tamaño del paso", () => {
  it("nivel 3: una hora en pasos de 1/60 s o de 3600 s da lo mismo", () => {
    const a = inEncounter();
    const b = inEncounter();
    a.act({ type: "set-attitude", attitude: "antenna-to-earth" });
    b.act({ type: "set-attitude", attitude: "antenna-to-earth" });
    const fine = stepMany(a, 600, 1 / 60);
    const coarse = b.step(600);
    expect(fine.cell_temperature_c).toBeCloseTo(coarse.cell_temperature_c ?? 0, 1);
    expect(fine.hull_durability_pct).toBeCloseTo(coarse.hull_durability_pct ?? 0, 2);
    expect(fine.resources.data_stored_mb).toBeCloseTo(coarse.resources.data_stored_mb, 2);
  });

  it("nivel 2: pasos de un fotograma también bajan datos", () => {
    const a = createSimulation();
    const b = createSimulation();
    for (const sim of [a, b]) {
      sim.load("level2-leo", 1);
      pickAll(sim, LEO);
      sim.act({ type: "launch" });
    }
    const fine = stepMany(a, 180, 1 / 60);
    const coarse = b.step(180);
    expect(fine.data_downlinked_mb).toBeGreaterThan(0);
    expect(fine.data_downlinked_mb).toBeCloseTo(coarse.data_downlinked_mb ?? 0, 2);
  });
});

describe("misiones que no se traban", () => {
  it("nivel 1 sin encender termina cuando se cierra la ventana", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    let s = sim.act({ type: "launch" });
    while (s.phase !== "complete") s = sim.step(600);
    expect(s.resources.mission_elapsed_s).toBeLessThanOrEqual(12 * 3600 + 600);
    expect(s.events.at(-1)?.trigger).toBe("level1:timeout");
    expect(sim.report().outcome).toBe("failure");
  });

  it("nivel 1: un encendido gigante hacia abajo no baja de 150 km", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    sim.act({ type: "launch" });
    sim.act({ type: "burn", delta_v_m_s: -1e6 });
    const s = sim.step(3 * 3600);
    expect(s.altitude_km).toBeGreaterThanOrEqual(150);
  });

  it("nivel 2 no da puntos sin lanzar", () => {
    const sim = createSimulation();
    sim.load("level2-leo", 1);
    expect(sim.report().score).toBe(0);
  });

  it("no se puede resolver una decisión tras terminar", () => {
    const sim = createSimulation();
    sim.load("level2-leo", 1);
    pickAll(sim, LEO);
    sim.act({ type: "launch" });
    const s = sim.step(4 * 86_400);
    expect(s.phase).toBe("complete");
    expect(s.events.every((e) => !e.choices || e.resolved)).toBe(true);
  });

  it("clics repetidos no llenan el registro de eventos", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 1);
    let s!: SimState;
    for (let i = 0; i < 50; i++) s = sim.act({ type: "launch" });
    expect(s.events.length).toBeLessThan(10);
  });

  it("el mock llega a complete en los tres niveles", () => {
    for (const id of ["level1-repair", "level2-leo", "level3-ikaros"] as const) {
      const sim = createMock();
      sim.load(id, 1);
      let s = sim.act({ type: "launch" });
      for (let i = 0; i < 400 && s.phase !== "complete"; i++) s = sim.step(86_400);
      expect(s.phase, id).toBe("complete");
      expect(sim.report().outcome).toBe("success");
    }
  });
});

describe("decisiones con pasos largos", () => {
  it("una ventana de Venus no se abre y vence dentro del mismo step", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 1);
    pickAll(sim, REAL_CONFIG);
    sim.act({ type: "launch" });
    // Un año de un golpe: el paso debe detenerse al abrirse la primera ventana.
    const s = sim.step(365 * 86_400);
    const open = s.events.filter((e) => e.trigger === "level3:venus-window" && !e.resolved);
    expect(open).toHaveLength(1);
    expect(s.events.some((e) => e.resolved === "timeout")).toBe(false);
  });
});

describe("respuesta tardía a una decisión", () => {
  it("resolver con timeout cierra la decisión como si venciera el plazo", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 1);
    pickAll(sim, REAL_CONFIG);
    let s = sim.act({ type: "launch" });
    while (!s.events.some((e) => e.trigger === "level3:venus-window")) s = sim.step(86_400);
    const ev = s.events.find((e) => e.trigger === "level3:venus-window")!;
    s = sim.act({ type: "resolve-event", eventId: ev.id, choice: "timeout" });
    expect(s.events.find((e) => e.id === ev.id)?.resolved).toBe("timeout");
    expect(s.perihelion_rsun).toBe(38.7);
  });
});
