import { describe, expect, it } from "vitest";
import type { SimState } from "@ikaros/contracts";
import { orbitGeometry } from "./geometry";

const at = (t: number, alt: number) =>
  ({ altitude_km: alt, resources: { mission_elapsed_s: t } }) as unknown as SimState;

describe("escena del nivel 2", () => {
  it("cada vez que el motor marca eclipse, el satélite está en el lado nocturno de la Tierra", () => {
    for (const alt of [500, 700]) {
      for (let t = 0; t < 20_000; t += 37) {
        const g = orbitGeometry(at(t, alt));
        const facingSun = Math.cos(g.angle - g.sunAngle);
        if (g.inEclipse) expect(facingSun).toBeLessThan(0);
      }
    }
  });

  it("hay eclipse en cada vuelta en órbita baja", () => {
    let eclipses = 0;
    for (let t = 0; t < 6000; t += 10) if (orbitGeometry(at(t, 500)).inEclipse) eclipses++;
    expect(eclipses).toBeGreaterThan(0);
  });
});
