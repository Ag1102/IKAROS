// Lectura de data/ y content/ (Persona A). La interfaz no define números propios.
import type { GlossaryEntry, SourcedValue } from "@ikaros/contracts";
import constantsJson from "../../../../data/constants.json";
import paperJson from "../../../../data/paper-solar-probe-plus.json";
import assistantJson from "../../../../content/assistant.json";
import glossaryJson from "../../../../content/glossary.json";
import assistantEnJson from "../../../../content/en/assistant.json";
import glossaryEnJson from "../../../../content/en/glossary.json";
import { getLang } from "../i18n";

type Table = Record<string, SourcedValue>;
const constants = constantsJson as Table;
const paper = paperJson as Table;

function read(table: Table, key: string): number {
  const v = table[key];
  if (!v) throw new Error(`Falta el dato "${key}" en data/`);
  return v.value;
}

export const C = {
  muEarth: read(constants, "mu_earth_km3_s2"),
  earthRadius: read(constants, "earth_radius_km"),
  sunRadius: read(constants, "sun_radius_km"),
  au: read(constants, "au_km"),
  am0: read(constants, "am0_w_m2"),
};

export const PAPER = {
  cellDesignLimit_c: read(paper, "cell_design_limit_c"),
  cellDegradation_c: read(paper, "cell_degradation_c"),
  mainArrayMaxTilt_deg: read(paper, "main_array_max_tilt_deg"),
  mainArrayLimit_au: read(paper, "main_array_limit_au"),
  minPower_w: read(paper, "min_power_w"),
  perihelionIlluminated_cm2: read(paper, "perihelion_illuminated_cm2"),
  cellEfficiency: read(paper, "cell_efficiency"),
  radiatorTemp_c: read(paper, "radiator_temp_c"),
};

export interface Fact {
  id: string;
  trigger: string;
  text: string;
  source: string;
  origin: "real" | "theoretical";
}

const FACTS = assistantJson as Fact[];
const FACTS_EN = new Map((assistantEnJson as { id: string; text: string; source: string }[]).map((f) => [f.id, f]));
const GLOSSARY_ES = glossaryJson as GlossaryEntry[];
const GLOSSARY_EN = glossaryEnJson as GlossaryEntry[];

/** Glosario en el idioma actual. */
export function glossary(): GlossaryEntry[] {
  return getLang() === "en" ? GLOSSARY_EN : GLOSSARY_ES;
}

/** Textos del asistente para un disparador, en el idioma actual. */
export function factsFor(trigger: string): Fact[] {
  const facts = FACTS.filter((f) => f.trigger === trigger);
  if (getLang() === "es") return facts;
  return facts.map((f) => {
    const en = FACTS_EN.get(f.id);
    return en ? { ...f, text: en.text, source: en.source } : f;
  });
}
