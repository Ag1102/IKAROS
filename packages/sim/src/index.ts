// Motor de simulación real: implementa la interfaz Simulation del contrato.
import type { MissionReport, PlayerAction, ScenarioId, SimState, Simulation } from "@ikaros/contracts";
import type { Level } from "./levels/base";
import { Level1 } from "./levels/level1";
import { Level2 } from "./levels/level2";
import { Level3 } from "./levels/level3";

export type { Simulation } from "@ikaros/contracts";
export { scenario } from "./data";
export * as physics from "./physics";

function createLevel(id: ScenarioId, seed: number): Level {
  switch (id) {
    case "level1-repair":
      return new Level1(seed);
    case "level2-leo":
      return new Level2(seed);
    case "level3-ikaros":
      return new Level3(seed);
  }
}

export function createSimulation(): Simulation {
  let level: Level | null = null;
  const current = (): Level => {
    if (!level) throw new Error("Llama a load() antes de usar la simulación.");
    return level;
  };
  return {
    load(scenario: ScenarioId, seed: number): SimState {
      level = createLevel(scenario, seed);
      return level.snapshot();
    },
    step(dt_s: number): SimState {
      const l = current();
      l.step(dt_s);
      return l.snapshot();
    },
    act(action: PlayerAction): SimState {
      const l = current();
      l.act(action);
      return l.snapshot();
    },
    report(): MissionReport {
      return current().report();
    },
  };
}
