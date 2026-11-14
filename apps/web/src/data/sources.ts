// Lectura de data/ y content/ (Persona A). La interfaz no define números propios.
import type { GlossaryEntry, SourcedValue } from "@ikaros/contracts";
import constantsJson from "../../../../data/constants.json";
import paperJson from "../../../../data/paper-solar-probe-plus.json";
import assistantJson from "../../../../content/assistant.json";
import glossaryJson from "../../../../content/glossary.json";

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
};

export const PAPER = {
  cellDesignLimit_c: read(paper, "cell_design_limit_c"),
  cellDegradation_c: read(paper, "cell_degradation_c"),
  mainArrayMaxTilt_deg: read(paper, "main_array_max_tilt_deg"),
  mainArrayLimit_au: read(paper, "main_array_limit_au"),
  minPower_w: read(paper, "min_power_w"),
  perihelionIlluminated_cm2: read(paper, "perihelion_illuminated_cm2"),
};

export interface Fact {
  id: string;
  trigger: string;
  text: string;
  source: string;
  origin: "real" | "theoretical";
}

export const FACTS = assistantJson as Fact[];
export const GLOSSARY = glossaryJson as GlossaryEntry[];

export function factsFor(trigger: string): Fact[] {
  return FACTS.filter((f) => f.trigger === trigger);
}
