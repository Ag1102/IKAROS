import { describe, expect, it } from "vitest";
import type { ScenarioId, Simulation } from "@ikaros/contracts";
import { createSimulation as mock } from "../packages/sim-mock/src/index";
import { createSimulation as real } from "../packages/sim/src/index";

const ids: ScenarioId[] = ["level1-repair", "level3-ikaros"];

describe.each([
  ["sim-mock", mock],
  ["sim", real],
])("%s cumple el contrato", (_name, create: () => Simulation) => {
  for (const id of ids) {
    it(`${id}: load, act, step y report`, () => {
      const sim = create();
      const s0 = sim.load(id, 1);
      expect(s0.scenario).toBe(id);
      expect(s0.phase).toBe("hangar");
      expect(s0.resources.mission_elapsed_s).toBe(0);
      sim.act({ type: "launch" });
      const s1 = sim.step(120);
      expect(s1.resources.mission_elapsed_s).toBeGreaterThanOrEqual(0);
      const r = sim.report();
      expect(r.scenario).toBe(id);
      expect(["success", "partial", "failure"]).toContain(r.outcome);
    });
  }

  it("los estados devueltos son copias", () => {
    const sim = create();
    const s = sim.load("level3-ikaros", 1);
    s.resources.mass_kg = -1;
    expect(sim.step(1).resources.mass_kg).not.toBe(-1);
  });
});
