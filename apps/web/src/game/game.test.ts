import { describe, expect, it } from "vitest";
import { coversLatitude, projectLeo } from "./projection";
import { insertionStars } from "./OrbitLaunch";
import { arrivalAltitude } from "./HoldToBurn";

const VC_700 = Math.sqrt(398600.4418 / (6378.137 + 700));

describe("lanzamiento a órbita (nivel 2)", () => {
  it("con la velocidad justa la órbita es circular y da 3 estrellas", () => {
    expect(projectLeo(700, VC_700).outcome).toBe("circular");
    expect(insertionStars(VC_700, 700)).toBe(3);
  });
  it("lento: reentra; muy rápido: escapa; ninguno da estrellas", () => {
    expect(projectLeo(700, VC_700 * 0.95).outcome).toBe("reentry");
    expect(projectLeo(700, VC_700 * 1.42).outcome).toBe("escape");
    expect(insertionStars(VC_700 * 0.95, 700)).toBe(0);
    expect(insertionStars(VC_700 * 1.42, 700)).toBe(0);
  });
  it("un poco rápido da una órbita alargada con menos estrellas", () => {
    expect(insertionStars(VC_700 * 1.01, 700)).toBe(2);
    expect(insertionStars(VC_700 * 1.03, 700)).toBe(1);
  });
  it("la órbita ecuatorial no pasa sobre los bosques del norte; la polar sí", () => {
    expect(coversLatitude(0, 50).ok).toBe(false);
    expect(coversLatitude(98.2, 50).ok).toBe(true);
  });
});

describe("impulso para subir (nivel 1)", () => {
  it("unos 44 m/s llevan de 400 km a ~480 km, como en el motor", () => {
    expect(arrivalAltitude(400, 44.4)).toBeGreaterThan(477);
    expect(arrivalAltitude(400, 44.4)).toBeLessThan(482);
  });
});
