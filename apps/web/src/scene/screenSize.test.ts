import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { displaySize } from "./screenSize";
import { anomalyFromDistance, orbitFromApsides, periodDays } from "../sim/kepler";
import { C } from "../data/sources";

const cameraAt = (z: number) => {
  const c = new THREE.PerspectiveCamera();
  c.position.set(0, 0, z);
  return c;
};

describe("escala de la escena", () => {
  it("de cerca, un cuerpo se dibuja a tamaño real", () => {
    expect(displaySize(cameraAt(2), new THREE.Vector3(), 0.7, 0.006)).toBe(0.7);
  });

  it("de lejos, se dibuja con un tamaño mínimo proporcional a la distancia", () => {
    expect(displaySize(cameraAt(1000), new THREE.Vector3(), 0.7, 0.006)).toBeCloseTo(6, 6);
  });
});

describe("órbita de la sonda", () => {
  const q = (9.5 * C.sunRadius) / C.au;
  const orbit = orbitFromApsides(q, 0.723);

  it("con perihelio de 9,5 R☉ y afelio en Venus dura unos 88 días, como Parker", () => {
    expect(periodDays(orbit.a)).toBeGreaterThan(80);
    expect(periodDays(orbit.a)).toBeLessThan(95);
  });

  it("la anomalía deducida de la distancia reproduce esa distancia", () => {
    const r = 0.25;
    for (const receding of [false, true]) {
      const nu = anomalyFromDistance(orbit, r, receding);
      const back = (orbit.a * (1 - orbit.e ** 2)) / (1 + orbit.e * Math.cos(nu));
      expect(back).toBeCloseTo(r, 9);
      expect(Math.sign(nu)).toBe(receding ? 1 : -1);
    }
  });
});
