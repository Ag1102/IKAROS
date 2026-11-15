import type { ScenarioDefinition, ScenarioId, SourcedValue } from "@ikaros/contracts";
import constantsJson from "../../../data/constants.json";
import paperJson from "../../../data/paper-solar-probe-plus.json";
import missionsJson from "../../../data/missions.json";
import level1Json from "../../../data/scenarios/level1-repair.json";
import level3Json from "../../../data/scenarios/level3-ikaros.json";
import level1En from "../../../data/en/scenarios/level1-repair.json";
import level3En from "../../../data/en/scenarios/level3-ikaros.json";
import sourcesEn from "../../../data/en/sources.json";

type Table = Record<string, SourcedValue>;

export const constants = constantsJson as Table;
export const paper = paperJson as Table;
export const missions = missionsJson as Table;

const scenarios: Record<ScenarioId, ScenarioDefinition> = {
  "level1-repair": level1Json as ScenarioDefinition,
  "level3-ikaros": level3Json as ScenarioDefinition,
};

/** Idioma de los textos del juego. Los números son los mismos en ambos. */
export type Lang = "es" | "en";

/** Textos en inglés de cada escenario (data/en/scenarios/), por id de ranura y componente. */
interface ScenarioText {
  title: string;
  subtitle: string;
  briefing: string[];
  objectives: string[];
  slots: Record<string, string>;
  components: Record<string, { name: string; description: string }>;
}

const scenariosEn: Record<ScenarioId, ScenarioText> = {
  "level1-repair": level1En,
  "level3-ikaros": level3En,
};

const SOURCES_EN = sourcesEn as Record<string, string>;

/** Traduce una cita de fuente; las que ya están en inglés (títulos, autores) quedan igual. */
export function sourceText(source: string, lang: Lang): string {
  return lang === "en" ? (SOURCES_EN[source] ?? source) : source;
}

const translated = new Map<ScenarioId, ScenarioDefinition>();

export function scenario(id: ScenarioId, lang: Lang = "es"): ScenarioDefinition {
  const def = scenarios[id];
  if (lang === "es") return def;
  const cached = translated.get(id);
  if (cached) return cached;
  const en = scenariosEn[id];
  const out: ScenarioDefinition = {
    ...def,
    title: en.title,
    subtitle: en.subtitle,
    briefing: en.briefing,
    objectives: en.objectives,
    slots: def.slots.map((s) => ({ ...s, label: en.slots[s.id] ?? s.label })),
    components: def.components.map((c) => ({
      ...c,
      name: en.components[c.id]?.name ?? c.name,
      description: en.components[c.id]?.description ?? c.description,
      source: sourceText(c.source, "en"),
    })),
    params: Object.fromEntries(
      Object.entries(def.params).map(([k, p]) => [k, { ...p, source: sourceText(p.source, "en") }]),
    ),
  };
  translated.set(id, out);
  return out;
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
