import { describe, expect, it } from "vitest";
import { coversLatitude, projectLeo } from "./projection";
import { insertionStars } from "./OrbitLaunch";
import { burnRating, contactRating, fuelRating, timeRating } from "../levels/servicio-orbita/ServicioOrbitaScreen";
import { brakePulse, commandDv, maneuversLeft, suggestedSpeed } from "../levels/servicio-orbita/ProxHud";

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

describe("acople con la ISS (nivel 1)", () => {
  it("el encendido se califica por la distancia a la que deja la ISS", () => {
    expect(burnRating(3)).toBe("perfect");
    expect(burnRating(25)).toBe("good");
    expect(burnRating(45)).toBe("fail");
  });
  it("un contacto lento y centrado es perfecto", () => {
    expect(contactRating(0.03, 0.05)).toBe("perfect");
    expect(contactRating(0.09, 0.05)).toBe("good");
    expect(contactRating(0.03, 0.25)).toBe("good");
  });
  it("la velocidad sugerida baja al acercarse y termina por debajo del límite de contacto", () => {
    expect(suggestedSpeed(122)).toBeGreaterThan(suggestedSpeed(20));
    expect(suggestedSpeed(0)).toBeLessThan(0.1);
  });
  it("estabilizar anula la deriva lateral y limita el cierre sin alejar la nave", () => {
    const p = { x: 50, y: 0.2, z: -0.1 };
    const dv = brakePulse(p, { x: -0.6, y: 0.05, z: -0.02 });
    expect(dv.y).toBeCloseTo(-0.05);
    expect(dv.z).toBeCloseTo(0.02);
    expect(-0.6 + dv.x).toBeCloseTo(-suggestedSpeed(50));
    expect(brakePulse(p, { x: -0.05, y: 0, z: 0 }).x).toBeCloseTo(0);
    expect(0.1 + brakePulse(p, { x: 0.1, y: 0, z: 0 }).x).toBeCloseTo(0);
  });
  it("los mandos son por velocidad: al soltar, la nave deja de desplazarse", () => {
    const p = { x: 80, y: 1, z: -1 };
    const moving = { x: -0.1, y: 0, z: 0.15 };
    expect(0.15 + commandDv(new Set(), false, p, moving).z).toBeCloseTo(0);
    expect(commandDv(new Set(), false, p, moving).x).toBeCloseTo(0);
    expect(commandDv(new Set(["right"]), false, p, { x: 0, y: 0, z: 0 }).z).toBeCloseTo(0.15);
    const w = commandDv(new Set(["fwd"]), false, p, { x: 0, y: 0, z: 0 });
    expect(w.x).toBeLessThan(0);
    const capped = commandDv(new Set(["fwd"]), false, p, { x: -suggestedSpeed(80), y: 0, z: 0 });
    expect(capped.x).toBeCloseTo(0);
  });
  it("equivocarse o demorarse baja la nota", () => {
    expect(fuelRating(80, 60)).toBe("perfect");
    expect(fuelRating(20, 60)).toBe("good");
    expect(fuelRating(5, 120)).toBe("fail");
    expect(timeRating(800, 1500)).toBe("perfect");
    expect(timeRating(200, 1500)).toBe("good");
    expect(timeRating(60, 1500)).toBe("fail");
  });
  it("el combustible útil se cuenta en maniobras: más masa, menos maniobras", () => {
    expect(maneuversLeft(130, 117_000, 313)).toBeGreaterThan(maneuversLeft(130, 130_000, 313));
    expect(maneuversLeft(0, 117_000, 313)).toBe(0);
  });
});
