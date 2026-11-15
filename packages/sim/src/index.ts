// Motor de simulación real: implementa la interfaz Simulation del contrato.
import type { MissionReport, PlayerAction, ScenarioId, SimState, Simulation } from "@ikaros/contracts";
import type { Level } from "./levels/base";
import { Level1 } from "./levels/level1";
import { Level3 } from "./levels/level3";
import { sourceText, type Lang } from "./data";

export type { Simulation } from "@ikaros/contracts";
export { scenario, sourceText, type Lang } from "./data";
export * as physics from "./physics";

function createLevel(id: ScenarioId, seed: number, lang: Lang): Level {
  switch (id) {
    case "level1-repair":
      return new Level1(seed, lang);
    case "level3-ikaros":
      return new Level3(seed, lang);
    default:
      throw new Error(`Escenario desconocido: ${String(id)}`);
  }
}

export interface SimulationOptions {
  /** Idioma de los textos del motor (eventos, decisiones e informe). Por defecto, español. */
  lang?: Lang;
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const lang = options.lang ?? "es";
  let level: Level | null = null;
  const current = (): Level => {
    if (!level) throw new Error("Llama a load() antes de usar la simulación.");
    return level;
  };
  return {
    load(scenario: ScenarioId, seed: number): SimState {
      level = createLevel(scenario, seed, lang);
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
      const r = current().report();
      if (lang === "es") return r;
      return {
        ...r,
        causes: r.causes.map((c) => (c.source ? { ...c, source: sourceText(c.source, lang) } : c)),
        comparisons: r.comparisons?.map((c) => ({ ...c, source: sourceText(c.source, lang) })),
      };
    },
  };
}
