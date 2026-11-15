import { describe, expect, it } from "vitest";
import { scenario } from "@ikaros/sim";
import { MODELED_PARTS, matchesParker } from "./Spacecraft";

// Carga para la estación (nivel 1): va en la bodega del transbordador, no es una pieza de la nave.
const NOT_PARTS = new Set(["objective", "orbit", "launcher", "module", "supplies", "repair"]);

describe("naves del hangar", () => {
  it("cada componente físico de los escenarios tiene modelo 3D", () => {
    for (const id of ["level1-repair", "level3-ikaros"] as const) {
      for (const c of scenario(id).components) {
        if (NOT_PARTS.has(c.slot)) continue;
        expect(MODELED_PARTS.has(c.id), `${id}: ${c.id}`).toBe(true);
      }
    }
  });

  it("solo la configuración del paper muestra el modelo de Parker Solar Probe", () => {
    const real = { energy: "pv-cooled", shield: "shield-cc", science: "corona-sensors" };
    expect(matchesParker(real)).toBe(true);
    expect(matchesParker({ ...real, defense: "hts-field" })).toBe(false);
    expect(matchesParker({ ...real, shield: "shield-liquid-metal" })).toBe(false);
    expect(matchesParker(undefined)).toBe(false);
  });
});
