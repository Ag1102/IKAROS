import { describe, expect, it } from "vitest";
import { Encounter, type EncounterConfig } from "./encounter";

const PV: EncounterConfig = {
  hasSecondary: true,
  hasReactor: false,
  hasStirling: false,
  liquidShield: false,
  hasHts: false,
  hasNano: false,
  hasCapsule: false,
  extraUse_w: 0,
};

function run(cfg: EncounterConfig, policy: (e: Encounter) => number) {
  const e = new Encounter(cfg);
  for (let i = 0; i < 100000 && !e.outcome; i++) {
    e.setExposed(policy(e));
    e.step(30);
  }
  return e;
}

const reference = (e: Encounter) => Math.min(1, 16 / e.suns);

describe("encuentro solar (simulación de prueba)", () => {
  it("el perihelio coincide con el paper: 9,5 R☉ y unas 510 veces AM0", () => {
    const e = new Encounter(PV);
    e.t = 21600;
    expect(e.distanceRsun).toBeCloseTo(9.5, 2);
    expect(e.suns).toBeGreaterThan(500);
    expect(e.suns).toBeLessThan(520);
  });

  it("retraer la matriz como indica el paper permite completar la misión", () => {
    expect(run(PV, reference).outcome).toBe("success");
  });

  it("dejar la matriz expuesta destruye las celdas", () => {
    const e = run(PV, () => 1);
    expect(e.outcome).toBe("failure");
    expect(e.damage).toBe(100);
  });

  it("los sistemas teóricos sin potencia suficiente dejan la nave en déficit", () => {
    const e = run({ ...PV, hasHts: true, extraUse_w: 120000 }, reference);
    expect(e.extrasOn).toBe(false);
    expect(e.outcome).toBe("failure");
  });

  it("con reactor, el HTS funciona y baja la temperatura de las celdas", () => {
    const withHts = new Encounter({ ...PV, hasReactor: true, hasHts: true, extraUse_w: 120000 });
    const without = new Encounter({ ...PV, hasReactor: true });
    expect(withHts.extrasOn).toBe(true);
    expect(withHts.cellTemp_c).toBeLessThan(without.cellTemp_c);
  });

  it("los nanobots con potencia reparan daño de las celdas", () => {
    const e = new Encounter({ ...PV, hasReactor: true, hasNano: true, extraUse_w: 80000 });
    e.damage = 10;
    e.setExposed(0);
    e.step(3600);
    expect(e.damage).toBeLessThan(10);
  });

  it("la cápsula suma puntos si la misión no falla", () => {
    const a = run(PV, reference).score;
    const b = run({ ...PV, hasCapsule: true }, reference).score;
    expect(b - a).toBe(100);
  });
});
