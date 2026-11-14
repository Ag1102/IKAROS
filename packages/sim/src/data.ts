import type { ScenarioDefinition, ScenarioId, SourcedValue } from "@ikaros/contracts";
import constantsJson from "../../../data/constants.json";
import paperJson from "../../../data/paper-solar-probe-plus.json";
import missionsJson from "../../../data/missions.json";
import level1Json from "../../../data/scenarios/level1-repair.json";
import level2Json from "../../../data/scenarios/level2-leo.json";
import level3Json from "../../../data/scenarios/level3-ikaros.json";

type Table = Record<string, SourcedValue>;

export const constants = constantsJson as Table;
export const paper = paperJson as Table;
export const missions = missionsJson as Table;

const scenarios: Record<ScenarioId, ScenarioDefinition> = {
  "level1-repair": level1Json as ScenarioDefinition,
  "level2-leo": level2Json as ScenarioDefinition,
  "level3-ikaros": level3Json as ScenarioDefinition,
};

export function scenario(id: ScenarioId): ScenarioDefinition {
  return scenarios[id];
}

/** Lee un valor de una tabla de data/ y falla si no existe. */
export function value(table: Table, key: string): number {
  const entry = table[key];
  if (!entry) throw new Error(`Falta el dato "${key}" en data/`);
  return entry.value;
}

export function sourceOf(table: Table, key: string): string {
  const entry = table[key];
  if (!entry) throw new Error(`Falta el dato "${key}" en data/`);
  return entry.source;
}

export const C = {
  muEarth: value(constants, "mu_earth_km3_s2"),
  earthRadius: value(constants, "earth_radius_km"),
  muSun: value(constants, "mu_sun_km3_s2"),
  sunRadius: value(constants, "sun_radius_km"),
  au: value(constants, "au_km"),
  am0: value(constants, "am0_w_m2"),
  sigma: value(constants, "stefan_boltzmann_w_m2_k4"),
  g0: value(constants, "g0_m_s2"),
};
