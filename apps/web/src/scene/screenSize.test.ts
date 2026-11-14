import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { displaySize } from "./screenSize";
import { AU_KM } from "../sim/kepler";
import { RSUN_KM } from "../level3/constants";
import { trajectoryById } from "../level3/trajectory";

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

  it("el perihelio final queda a 9,5 radios solares del centro del Sol", () => {
    const rp_km = trajectoryById("v7").perihelion_au * AU_KM;
    expect(rp_km / RSUN_KM).toBeCloseTo(9.5, 6);
  });
});
