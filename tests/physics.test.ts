import { describe, expect, it } from "vitest";
import { physics } from "../packages/sim/src/index";
import constants from "../data/constants.json";
import paper from "../data/paper-solar-probe-plus.json";
import level3 from "../data/scenarios/level3-ikaros.json";

const mu = constants.mu_earth_km3_s2.value;
const Re = constants.earth_radius_km.value;
const rsunAu = constants.sun_radius_km.value / constants.au_km.value;

describe("física con casos conocidos", () => {
  it("a 9.5 R☉ la luz es ~510 × AM0 ≈ 700 kW/m² (paper, p. 1-2)", () => {
    const r = paper.perihelion_rsun.value * rsunAu;
    const I = physics.solarIntensity(r);
    expect(I / constants.am0_w_m2.value).toBeCloseTo(paper.perihelion_intensity_am0.value, -1);
    expect(I / 1000).toBeGreaterThan(690);
    expect(I / 1000).toBeLessThan(710);
  });

  it("a 0.25 AU la luz es 16 soles (paper, p. 4)", () => {
    expect(physics.solarIntensity(0.25) / constants.am0_w_m2.value).toBeCloseTo(16, 5);
  });

  it("Hohmann LEO 300 km → GEO cuesta ~3.9 km/s", () => {
    const dv = physics.hohmannDeltaV(mu, Re + 300, Re + 35786);
    expect(dv).toBeGreaterThan(3.85);
    expect(dv).toBeLessThan(3.95);
  });

  it("hohmannTarget invierte a hohmannDeltaV (subida y bajada)", () => {
    const r1 = Re + 400;
    const r2 = Re + 535;
    const dv = physics.hohmannDeltaV(mu, r1, r2);
    expect(physics.hohmannTarget(mu, r1, dv)).toBeCloseTo(r2, 3);
    expect(physics.hohmannTarget(mu, r2, -dv)).toBeCloseTo(r1, 3);
  });

  it("periodo orbital a 1 AU ≈ 365.25 días", () => {
    const P = physics.orbitalPeriod(constants.mu_sun_km3_s2.value, constants.au_km.value);
    expect(P / 86400).toBeCloseTo(365.25, 0);
  });

  it("Tsiolkovsky: Isp 300 s y razón de masas e da 300·g0", () => {
    expect(physics.rocketDeltaV(300, Math.E, 1)).toBeCloseTo(300 * constants.g0_m_s2.value, 6);
  });

  it("ec. 1: matriz principal a 74° y 0.25 AU queda bajo 180 °C (paper, p. 4)", () => {
    const I = physics.solarIntensity(0.25) * Math.cos((74 * Math.PI) / 180);
    const T = physics.toCelsius(
      physics.equilibriumTemperature(
        level3.params.main_array_absorptance.value,
        I,
        level3.params.main_array_emittance_total.value,
      ),
    );
    expect(T).toBeLessThan(paper.main_array_temp_limit_c.value);
    expect(T).toBeGreaterThan(150);
  });

  it("ec. 2: área de radiador por vatio con η 28 % y 373 K", () => {
    const a = physics.radiatorAreaPerWatt(0.28, 0.85, 373.15);
    expect(a * 1000).toBeCloseTo(2.75, 1);
  });

  it("~34 cm² iluminados en perihelio dan ≥ 482 W (paper, p. 4 y 7-8)", () => {
    const I = physics.solarIntensity(paper.perihelion_rsun.value * rsunAu);
    const P = paper.cell_efficiency.value * I * (paper.perihelion_illuminated_cm2.value / 10_000);
    expect(P).toBeGreaterThanOrEqual(paper.min_power_w.value);
  });

  it("~10 h dentro de 10 R☉ en la pasada más cercana (paper, p. 2)", () => {
    const q = paper.perihelion_rsun.value * rsunAu;
    const t = 2 * physics.timeFromPerihelion(q, 0.723, 10 * rsunAu);
    expect(t / 3600).toBeGreaterThan(7);
    expect(t / 3600).toBeLessThan(13);
  });

  it("distanceAt y timeFromPerihelion son inversas", () => {
    const t = physics.timeFromPerihelion(0.0442, 0.723, 0.2);
    expect(physics.distanceAt(0.0442, 0.723, t)).toBeCloseTo(0.2, 6);
    expect(physics.distanceAt(0.0442, 0.723, -t)).toBeCloseTo(0.2, 6);
  });

  it("eclipse en LEO de 500 km ≈ 38 % de la órbita", () => {
    expect(physics.eclipseFraction(500)).toBeGreaterThan(0.35);
    expect(physics.eclipseFraction(500)).toBeLessThan(0.4);
  });
});
