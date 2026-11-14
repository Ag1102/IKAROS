import { describe, expect, it } from "vitest";
import { Level1, apoAlt, previewBurn1 } from "./game";

function toBurn2(g: Level1, dv1: number) {
  g.act({ type: "resolve-event", eventId: "briefing", choice: "ok" });
  g.act({ type: "burn", delta_v_m_s: dv1 });
  for (let i = 0; i < 10000 && g.view().phase === "coast"; i++) g.step(10);
}

describe("nivel 1", () => {
  it("parte con unos 120 m/s de Δv", () => {
    const g = new Level1();
    g.load();
    expect(g.view().dvLeft_ms).toBeCloseTo(120.1, 1);
  });

  it("la quema 1 ideal lleva el apogeo a la altura del objetivo", () => {
    expect(apoAlt(previewBurn1(39))).toBeGreaterThan(534);
    expect(apoAlt(previewBurn1(39))).toBeLessThan(546);
  });

  it("dos quemas correctas logran el encuentro y la nave queda acoplada", () => {
    const g = new Level1();
    g.load();
    toBurn2(g, 39);
    expect(g.view().phase).toBe("burn2");
    g.act({ type: "burn", delta_v_m_s: 38.5 });
    expect(g.view().phase).toBe("toolkit");
    expect(g.view().docked).toBe(true);
  });

  it("una transferencia corta falla y la nave no queda acoplada", () => {
    const g = new Level1();
    g.load();
    toBurn2(g, 25);
    g.act({ type: "burn", delta_v_m_s: 25 });
    expect(g.view().phase).toBe("result");
    expect(g.view().outcome).toBe("failure");
    expect(g.view().docked).toBe(false);
  });

  it("no deja iniciar la reparación con exceso de carga y gana sin la batería", () => {
    const g = new Level1();
    g.load();
    toBurn2(g, 39);
    g.act({ type: "burn", delta_v_m_s: 38.5 });
    for (const id of ["solar-panel", "antenna", "toolkit", "battery"]) {
      g.act({ type: "select-component", slot: "repair-kit", componentId: id });
    }
    g.act({ type: "resolve-event", eventId: "start-repair", choice: "go" });
    expect(g.view().phase).toBe("toolkit");

    g.act({ type: "select-component", slot: "repair-kit", componentId: "battery" });
    g.act({ type: "resolve-event", eventId: "start-repair", choice: "go" });
    expect(g.view().phase).toBe("repair");
    for (let i = 0; i < 200 && g.view().phase === "repair"; i++) g.step(10);
    expect(g.view().outcome).toBe("success");
  });

  it("sin el kit de herramientas la reparación no cabe en la ventana", () => {
    const g = new Level1();
    g.load();
    toBurn2(g, 39);
    g.act({ type: "burn", delta_v_m_s: 38.5 });
    for (const id of ["solar-panel", "antenna"]) {
      g.act({ type: "select-component", slot: "repair-kit", componentId: id });
    }
    g.act({ type: "resolve-event", eventId: "start-repair", choice: "go" });
    for (let i = 0; i < 200 && g.view().phase === "repair"; i++) g.step(10);
    expect(g.view().outcome).toBe("failure");
  });
});
