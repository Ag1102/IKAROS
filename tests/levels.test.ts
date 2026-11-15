import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentEntry } from "@ikaros/contracts";
import { createSimulation } from "../packages/sim/src/index";
import {
  LEVEL1_CARGO,
  level1BurnDv,
  pickAll,
  playLevel1,
  playLevel3,
  REAL_CONFIG,
  resolveOpen,
} from "../packages/sim/src/autopilot";

const triggers = new Set(
  (JSON.parse(readFileSync(join(__dirname, "../content/assistant.json"), "utf8")) as ContentEntry[]).map(
    (e) => e.trigger,
  ),
);

describe("nivel 1: acople con la ISS", () => {
  it("con el adelanto justo y un contacto suave se acopla con toda la carga", () => {
    const { report, state } = playLevel1();
    expect(report.outcome).toBe("success");
    expect(report.metrics.docked).toBe(true);
    expect(report.metrics.cargo_delivered_kg).toBe(15_338);
    expect(report.metrics.rendezvous_miss_km as number).toBeLessThan(5);
    expect(report.metrics.delta_v_used_m_s as number).toBeLessThan(
      (report.metrics.delta_v_ideal_m_s as number) + 2,
    );
    expect(state.phase).toBe("complete");
  });

  it("encender antes o después del adelanto cuesta combustible en la aproximación final", () => {
    const exact = playLevel1().report.metrics;
    const early = playLevel1({ burnEarly_deg: 0.4 }).report.metrics;
    const late = playLevel1({ burnEarly_deg: -0.4 }).report.metrics;
    for (const m of [early, late]) {
      expect(m.terminal_dv_m_s as number).toBeGreaterThan(exact.terminal_dv_m_s as number);
      expect(m.fuel_left_kg as number).toBeLessThan(exact.fuel_left_kg as number);
    }
  });

  it("encender muy pronto deja la ISS lejos y sin combustible para repetir", () => {
    const { report, state } = playLevel1({ burnEarly_deg: 2 });
    expect(report.outcome).toBe("failure");
    expect(state.events.some((e) => e.trigger === "level1:miss-fuel")).toBe(true);
  });

  it("un contacto rápido es un choque", () => {
    const { report, state } = playLevel1({ contactSpeed: 0.2 });
    expect(report.outcome).toBe("failure");
    expect(state.events.at(-1)?.trigger).toBe("level1:collision");
  });

  it("llegar sin carga es una misión parcial", () => {
    expect(playLevel1({ picks: {} }).report.outcome).toBe("partial");
  });

  it("sin compensación la deriva orbital también se pilota", () => {
    const { report } = playLevel1({ assist: false });
    expect(report.outcome).toBe("success");
    expect(report.metrics.rcs_pulses as number).toBeGreaterThan(
      playLevel1().report.metrics.rcs_pulses as number,
    );
  });

  it("un encendido excesivo pasa de la ISS y falla", () => {
    const { report } = playLevel1({ aim_m_s: 400 });
    expect(report.outcome).toBe("failure");
    expect(report.metrics.docked).toBe(false);
  });

  it("bloquea el despegue con sobrepeso", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    pickAll(sim, { module: "harmony", supplies: "supplies-large" });
    const s = sim.act({ type: "launch" });
    expect(s.phase).toBe("hangar");
    expect(s.events.at(-1)?.trigger).toBe("level1:overweight");
  });

  it("más carga, menos delta-V (Tsiolkovsky)", () => {
    const sim = createSimulation();
    const empty = sim.load("level1-repair", 1).delta_v_remaining_m_s ?? 0;
    const loaded =
      sim.act({ type: "select-component", slot: "module", componentId: "harmony" }).delta_v_remaining_m_s ??
      0;
    expect(loaded).toBeLessThan(empty);
  });

  it("esperar junto a la estación gasta combustible y la ventana se acaba", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    pickAll(sim, LEVEL1_CARGO);
    let s = sim.act({ type: "launch" });
    while ((s.target_lead_deg ?? 0) > (s.ideal_lead_deg ?? 0)) s = sim.step(20);
    s = sim.act({ type: "burn", delta_v_m_s: level1BurnDv(s) });
    while (s.phase !== "approach") s = sim.step(60);
    const fuel0 = s.fuel_kg ?? 0;
    s = sim.step(600);
    expect(s.fuel_kg ?? 0).toBeLessThan(fuel0 - 15);
    while (s.phase === "approach") s = sim.step(60);
    expect(s.events.at(-1)?.trigger).toBe("level1:approach-timeout");
    expect(sim.report().outcome).toBe("failure");
  });

  it("con la carga máxima el combustible útil al llegar es justo", () => {
    const heavy = playLevel1();
    const light = playLevel1({ picks: { supplies: "supplies-small" } });
    expect(heavy.report.outcome).toBe("success");
    expect(heavy.report.metrics.fuel_left_kg as number).toBeLessThan(
      light.report.metrics.fuel_left_kg as number,
    );
    expect((heavy.report.metrics.fuel_left_kg as number) - 200).toBeLessThan(300);
  });

  it("salir del corredor demasiado tiempo provoca el aborto", () => {
    const sim = createSimulation();
    sim.load("level1-repair", 1);
    let s = sim.act({ type: "launch" });
    while ((s.target_lead_deg ?? 0) > (s.ideal_lead_deg ?? 0)) s = sim.step(20);
    s = sim.act({ type: "burn", delta_v_m_s: level1BurnDv(s) });
    while (s.phase !== "approach") s = sim.step(60);
    s = sim.act({ type: "rcs", x: 0, y: 0.5, z: 0 });
    while (s.phase === "approach") s = sim.step(1);
    expect(sim.report().outcome).toBe("failure");
    expect(s.events.some((e) => e.trigger === "level1:corridor")).toBe(true);
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
    expect(s.perihelion_rsun).toBe(9.5);
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

describe("nivel 3: zambullida Ikaros ⚗", () => {
  const KIT = {
    energy: "fission-reactor",
    shield: "shield-cc",
    defense: "hts-field",
    repair: "nanobots",
    science: "sensors-capsule",
  };

  function play(picks: Record<string, string>, dive: boolean) {
    const sim = createSimulation();
    let s = sim.load("level3-ikaros", 5);
    pickAll(sim, picks);
    s = sim.act({ type: "launch" });
    const offered: string[] = [];
    for (let i = 0; i < 20_000 && s.phase !== "complete"; i++) {
      const ev = s.events.find((e) => e.choices && !e.resolved);
      if (ev) {
        offered.push(ev.trigger ?? "");
        const choice =
          ev.trigger === "level3:venus-window"
            ? "execute"
            : ev.trigger === "level3:ikaros-dive"
              ? dive
                ? "dive"
                : "stay"
              : ev.trigger === "level3:cme"
                ? "hts"
                : "eject";
        s = sim.act({ type: "resolve-event", eventId: ev.id, choice });
        continue;
      }
      if (s.phase === "encounter" && !s.main_array_stowed) s = sim.act({ type: "stow-main-array" });
      s = sim.step(s.phase === "cruise" ? 86_400 : 300);
    }
    return { report: sim.report(), offered };
  }

  it("con el kit se ofrece y se logra la zambullida a 850.000 km, récord sobre Parker", () => {
    const { report, offered } = play(KIT, true);
    expect(offered).toContain("level3:ikaros-dive");
    expect(report.metrics.ikaros_dive).toBe(true);
    expect(report.metrics.min_distance_rsun as number).toBeLessThan(1.3);
    expect(report.metrics.historical_record_broken).toBe(true);
    expect(report.metrics.hts_blocked_pct as number).toBeGreaterThan(0);
    expect(report.outcome).not.toBe("failure");
    // Viaje único: un solo sobrevuelo de Venus y la cápsula vuelve con las muestras.
    expect(offered.filter((t) => t === "level3:venus-window")).toHaveLength(1);
    expect(report.metrics.capsule_recovered).toBe(true);
  });

  it("sin campo HTS ni nanobots no hay zambullida, pero 9,5 R☉ ya supera a Parker", () => {
    const { offered } = play(REAL_CONFIG, true);
    expect(offered).not.toContain("level3:ikaros-dive");
    // Con la matriz bien pilotada (piloto automático), la configuración del paper bate el récord.
    const { report } = playLevel3({ downlink: true, cme: "safe-mode" });
    expect(report.metrics.min_distance_rsun as number).toBeCloseTo(9.5, 1);
    expect(report.metrics.historical_record_broken).toBe(true);
  });

  it("quedarse en 9,5 R☉ con el kit es una opción válida", () => {
    const { report } = play(KIT, false);
    expect(report.metrics.ikaros_dive).toBe(false);
  });
});

describe("nivel 3: sistemas ⚗ del kit Ikaros", () => {
  it("con el reactor apagado no hay energía y la batería baja", () => {
    const sim = createSimulation();
    sim.load("level3-ikaros", 2);
    pickAll(sim, {
      energy: "fission-reactor",
      shield: "shield-cc",
      defense: "hts-field",
      repair: "nanobots",
      science: "sensors-capsule",
    });
    let s = sim.act({ type: "launch" });
    while (s.phase === "cruise") {
      const ev = s.events.find((e) => e.choices && !e.resolved);
      s = ev
        ? sim.act({ type: "resolve-event", eventId: ev.id, choice: ev.choices![0]!.id })
        : sim.step(86_400);
    }
    s = sim.step(600);
    expect(s.resources.power_generated_w).toBeGreaterThan(1000);
    s = sim.act({ type: "set-system", system: "reactor", on: false });
    const battery = s.battery_wh ?? 0;
    s = sim.step(3600);
    expect(s.systems?.reactor).toBe(false);
    expect(s.resources.power_generated_w).toBeLessThan(100);
    expect(s.battery_wh ?? 0).toBeLessThan(battery);
  });
});
