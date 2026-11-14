import { describe, expect, it } from "vitest";
import { checkDesign } from "./catalog";

describe("hangar", () => {
  it("el diseño inicial basado en el paper es válido", () => {
    const c = checkDesign({ parts: ["shield-flat", "pv-primary", "pv-secondary"], launcher: "l-m" });
    expect(c.problems).toEqual([]);
  });

  it("el HTS sin una fuente que cubra su consumo bloquea el lanzamiento", () => {
    const c = checkDesign({ parts: ["shield-flat", "pv-secondary", "hts"], launcher: "l-h" });
    expect(c.problems.some((p) => p.includes("no cubre"))).toBe(true);
  });

  it("detecta masa por encima de la capacidad del lanzador", () => {
    const c = checkDesign({ parts: ["shield-liquid", "pv-secondary", "reactor", "hts"], launcher: "l-m" });
    expect(c.problems.some((p) => p.includes("supera la capacidad"))).toBe(true);
  });

  it("exige exactamente un escudo", () => {
    const c = checkDesign({ parts: ["pv-secondary"], launcher: "l-m" });
    expect(c.problems).toContain("Elige exactamente un escudo térmico.");
  });
});
