import { describe, expect, it } from "vitest";
import type { SimState } from "@ikaros/contracts";
import { scenario } from "@ikaros/sim";
import { apertureBand, areaToKnob, encounterTimeScale, knobToArea } from "./stability";

const def = scenario("level3-ikaros");
const at = (r_au: number, area: number, extra: Partial<SimState> = {}) =>
  ({
    distance_to_sun_au: r_au,
    array_illuminated_cm2: area,
    power_load_w: 482,
    attitude: "shield-to-sun",
    cell_temperature_c: 90,
    selected: { energy: "pv-cooled" },
    ...extra,
  }) as unknown as SimState;

describe("puzzle de estabilidad del nivel 3", () => {
  it("en el perihelio la zona segura incluye los ~34 cm² del paper", () => {
    const { min, max } = apertureBand(at(9.5 * (696_000 / 149_597_870.7), 34), def);
    expect(min).toBeLessThan(34);
    expect(max).toBeGreaterThan(34);
  });

  it("la zona se estrecha y baja al acercarse al Sol", () => {
    const far = apertureBand(at(0.25, 1000), def);
    const near = apertureBand(at(0.05, 30), def);
    expect(near.max).toBeLessThan(far.max);
    expect(near.max / near.min).toBeLessThan(far.max / far.min + 1e-9);
  });

  it("girar la antena saca los radiadores al sol y achica la zona", () => {
    const shade = apertureBand(at(0.1, 100), def);
    const exposed = apertureBand(at(0.1, 100, { attitude: "antenna-to-earth" }), def);
    expect(exposed.max).toBeLessThan(shade.max);
  });

  it("la perilla logarítmica ida y vuelta", () => {
    const full = 1350;
    for (const a of [1.5, 34, 400, 1350]) expect(knobToArea(areaToKnob(a, full), full)).toBeCloseTo(a, 6);
  });

  it("el tiempo frena fuera de la zona y cerca del Sol", () => {
    const ok = apertureBand(at(0.2, 0), def);
    const mid = (ok.min + ok.max) / 2;
    expect(encounterTimeScale(at(0.2, mid), def)).toBe(43_200);
    expect(encounterTimeScale(at(0.2, ok.max * 3), def)).toBe(900);
    const near = apertureBand(at(0.05, 0), def);
    expect(encounterTimeScale(at(0.05, (near.min + near.max) / 2), def)).toBe(3_600);
  });
});
