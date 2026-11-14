import { describe, expect, it } from "vitest";
import { DAY_S, Encounter, type EncounterConfig } from "./encounter";
import { trajectoryById } from "./trajectory";

const V7 = trajectoryById("v7");

const PV: EncounterConfig = {
  hasSecondary: true,
  hasReactor: false,
  hasStirling: false,
  liquidShield: false,
  hasHts: false,
  hasNano: false,
  hasCapsule: false,
  extraUse_w: 0,
  perihelion_au: V7.perihelion_au,
  aphelion_au: V7.aphelion_au,
};

function run(cfg: EncounterConfig, policy: (e: Encounter) => number) {
  const e = new Encounter(cfg);
  for (let i = 0; i < 200000 && !e.outcome; i++) {
    e.setExposed(policy(e));
    e.step(30);
  }
  return e;
}

const reference = (e: Encounter) => Math.min(1, 16 / e.suns);

describe("encuentro solar (simulación de prueba)", () => {
  it("el perihelio coincide con el paper: 9,5 R☉ y unas 510 veces AM0", () => {
    const e = new Encounter(PV);
    e.t = e.halfDays * DAY_S;
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

describe("trayectoria", () => {
  it("con 7 sobrevuelos la órbita dura unos 88 días, como la de Parker", async () => {
    const { periodDays } = await import("../sim/kepler");
    const e = new Encounter(PV);
    expect(periodDays(e.orbit.a)).toBeGreaterThan(80);
    expect(periodDays(e.orbit.a)).toBeLessThan(95);
  });

  it("la entrada y la salida del encuentro ocurren a 0,25 AU", () => {
    const e = new Encounter(PV);
    expect(e.distanceAU).toBeCloseTo(0.25, 6);
    e.t = e.durationS;
    expect(e.distanceAU).toBeCloseTo(0.25, 6);
  });

  it("un perihelio más lejano da menos bonificación científica", async () => {
    const { scienceBonus } = await import("./trajectory");
    expect(scienceBonus(trajectoryById("v1").perihelion_au)).toBe(0);
    expect(scienceBonus(V7.perihelion_au)).toBe(300);
  });
});
