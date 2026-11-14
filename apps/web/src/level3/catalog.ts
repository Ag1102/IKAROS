// Catálogo de PRUEBA para el hangar del nivel 3. Los conceptos marcados "real" salen del
// paper AIAA 2008-5712; las masas y costos son valores provisionales hasta que Camilo
// los entregue en data/. Lo marcado "theoretical" (⚗) es ficticio.

import { formatNumber as fmt } from "../ui/format";

export type Origin = "real" | "theoretical";
export type Slot = "shield" | "power" | "extra";

export interface Part {
  id: string;
  slot: Slot;
  name: string;
  note: string;
  mass_kg: number;
  cost_usd_m: number;
  origin: Origin;
  /** Potencia disponible durante el encuentro, W. */
  power_w?: number;
  /** Consumo, W. */
  uses_w?: number;
  source?: string;
}

export const PARTS: Part[] = [
  {
    id: "shield-flat",
    slot: "shield",
    name: "Escudo térmico plano",
    note: "Protege la nave y las matrices del flujo solar.",
    mass_kg: 600,
    cost_usd_m: 90,
    origin: "real",
    source: "Landis et al., AIAA 2008-5712, fig. 1",
  },
  {
    id: "shield-liquid",
    slot: "shield",
    name: "Escudo de metal líquido",
    note: "Reparte mejor el calor, pero pesa mucho más.",
    mass_kg: 1400,
    cost_usd_m: 200,
    origin: "theoretical",
  },
  {
    id: "pv-primary",
    slot: "power",
    name: "Matriz solar principal (2 × 1,5 m²)",
    note: "Sirve de la Tierra hasta ~0,25 AU; luego se pliega tras el escudo.",
    mass_kg: 60,
    cost_usd_m: 25,
    origin: "real",
    power_w: 0,
    source: "Landis et al., p. 4",
  },
  {
    id: "pv-secondary",
    slot: "power",
    name: "Matriz secundaria de alto flujo, refrigerada",
    note: "Celdas concentradoras con lazo de refrigerante; se retrae tras el escudo al acercarse.",
    mass_kg: 120,
    cost_usd_m: 45,
    origin: "real",
    power_w: 482,
    source: "Landis et al., pp. 6–8",
  },
  {
    id: "stirling",
    slot: "power",
    name: "Generador Stirling",
    note: "El paper lo estudió y lo descartó: más masa y sin herencia de vuelo.",
    mass_kg: 180,
    cost_usd_m: 70,
    origin: "real",
    power_w: 482,
    source: "Landis et al., pp. 5–6",
  },
  {
    id: "reactor",
    slot: "power",
    name: "Mini reactor de fisión",
    note: "Potencia constante, sin depender del flujo solar.",
    mass_kg: 800,
    cost_usd_m: 180,
    origin: "theoretical",
    power_w: 450000,
  },
  {
    id: "hts",
    slot: "extra",
    name: "Campo magnético HTS",
    note: "Desvía parte del flujo de plasma: reduce un 10 % la carga térmica.",
    mass_kg: 450,
    cost_usd_m: 90,
    origin: "theoretical",
    uses_w: 120000,
  },
  {
    id: "nano",
    slot: "extra",
    name: "Enjambre de nanobots",
    note: "Repara daño de las celdas a 3 % por hora de misión.",
    mass_kg: 350,
    cost_usd_m: 60,
    origin: "theoretical",
    uses_w: 80000,
  },
  {
    id: "capsule",
    slot: "extra",
    name: "Cápsula de muestras",
    note: "Vuelve con muestras de la corona: +100 puntos si la misión no falla.",
    mass_kg: 450,
    cost_usd_m: 30,
    origin: "theoretical",
    uses_w: 50000,
  },
];

export interface Launcher {
  id: string;
  name: string;
  capacity_kg: number;
  cost_usd_m: number;
}

// Genéricos y de prueba; el paper indica que la misión exige un C3 muy alto y está limitada por masa.
export const LAUNCHERS: Launcher[] = [
  { id: "l-m", name: "Lanzador medio (C3 alto)", capacity_kg: 3500, cost_usd_m: 90 },
  { id: "l-h", name: "Lanzador pesado (C3 alto)", capacity_kg: 5000, cost_usd_m: 150 },
  { id: "l-xh", name: "Lanzador superpesado (C3 alto)", capacity_kg: 7000, cost_usd_m: 250 },
];

export const BASE_MASS_KG = 1350; // chasis, enfriador y combustible
export const BUDGET_USD_M = 500;
import { MIN_POWER_W } from "./constants";
export { MIN_POWER_W };

export interface Design {
  parts: string[];
  launcher: string;
  /** Id de la trayectoria elegida (ver trajectory.ts). */
  trajectory: string;
}

export interface DesignCheck {
  mass_kg: number;
  cost_usd_m: number;
  capacity_kg: number;
  power_w: number;
  /** Consumo de los sistemas adicionales, W. */
  uses_w: number;
  /** Potencia mínima del paper más el consumo adicional, W. */
  required_w: number;
  problems: string[];
}

export function checkDesign(d: Design): DesignCheck {
  const picked = PARTS.filter((p) => d.parts.includes(p.id));
  const launcher = LAUNCHERS.find((l) => l.id === d.launcher);
  const mass = BASE_MASS_KG + picked.reduce((s, p) => s + p.mass_kg, 0);
  const cost = picked.reduce((s, p) => s + p.cost_usd_m, 0) + (launcher?.cost_usd_m ?? 0);
  const power = picked.reduce((s, p) => s + (p.power_w ?? 0), 0);
  const uses = picked.reduce((s, p) => s + (p.uses_w ?? 0), 0);
  const required = MIN_POWER_W + uses;
  const capacity = launcher?.capacity_kg ?? 0;

  const problems: string[] = [];
  if (picked.filter((p) => p.slot === "shield").length !== 1) problems.push("Elige exactamente un escudo térmico.");
  if (!launcher) problems.push("Elige un lanzador.");
  if (power < required) {
    problems.push(
      uses > 0
        ? `La potencia durante el encuentro (${fmt(power)} W) no cubre los ${fmt(MIN_POWER_W)} W mínimos más ${fmt(uses)} W de los sistemas adicionales.`
        : `La potencia durante el encuentro (${fmt(power)} W) no llega al mínimo de ${fmt(MIN_POWER_W)} W.`,
    );
  }
  if (launcher && mass > capacity)
    problems.push(`La masa (${fmt(mass)} kg) supera la capacidad del lanzador (${fmt(capacity)} kg).`);
  if (cost > BUDGET_USD_M)
    problems.push(`El costo (${fmt(cost)} M USD) supera el presupuesto de ${fmt(BUDGET_USD_M)} M USD.`);
  return {
    mass_kg: mass,
    cost_usd_m: cost,
    capacity_kg: capacity,
    power_w: power,
    uses_w: uses,
    required_w: required,
    problems,
  };
}
