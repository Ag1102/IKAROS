import type { ScenarioDefinition, SimState } from "@ikaros/contracts";
import { physics } from "@ikaros/sim";
import { PAPER } from "../../data/sources";

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;

/**
 * Zona segura de la matriz secundaria a la distancia actual, en cm² iluminados, con la física
 * del motor (ec. 2 del paper): por debajo de `min` no se cubre el consumo; por encima de `max`
 * el lazo de refrigerante no saca todo el calor y las celdas pasan de 120 °C.
 */
export function apertureBand(state: SimState, def: ScenarioDefinition) {
  const r = state.distance_to_sun_au ?? 1;
  const I = physics.solarIntensity(r);
  const eta = PAPER.cellEfficiency;
  const load = Math.max(state.power_load_w ?? 0, PAPER.minPower_w);
  const exposed =
    state.attitude === "antenna-to-earth"
      ? I * param(def, "radiator_area_m2") * param(def, "radiator_sun_exposure")
      : 0;
  const qMax =
    physics.radiatorCapacity(
      param(def, "radiator_area_m2"),
      param(def, "radiator_emissivity"),
      physics.toKelvin(PAPER.radiatorTemp_c),
    ) - exposed;
  const full = param(def, "secondary_array_area_cm2");
  const min = Math.min(full, ((load / (eta * I)) * 10_000) / 1);
  const max = Math.min(full, Math.max(0, (qMax / ((1 - eta) * I)) * 10_000));
  return { min, max, full };
}

/** Escala logarítmica de la perilla: 0 = 1 cm² iluminado, 1 = toda la matriz. */
const DECADES = 3;
export const areaToKnob = (area: number, full: number) =>
  area <= 0 ? 0 : Math.max(0, Math.min(1, 1 + Math.log10(area / full) / DECADES));
export const knobToArea = (k: number, full: number) => full * 10 ** (DECADES * (Math.max(0, Math.min(1, k)) - 1));

/** Velocidad del tiempo en el encuentro: rápido lejos, lento cerca, y lento si algo va mal. */
export function encounterTimeScale(s: SimState, def: ScenarioDefinition): number {
  const r = s.distance_to_sun_au ?? 1;
  const { min, max } = apertureBand(s, def);
  const area = s.array_illuminated_cm2 ?? 0;
  const reactor = s.selected?.energy === "fission-reactor";
  const off = !reactor && (area < min || area > max);
  const systemsDown = s.systems?.reactor === false || s.systems?.hts === false;
  if (off || systemsDown || (s.cell_temperature_c ?? 0) > PAPER.cellDesignLimit_c) return 900;
  // En la zambullida el perihelio se pasa en minutos: hay que frenar mucho para vivirlo.
  if (r < 0.02) return 600;
  if (r > 0.15) return 43_200;
  if (r > 0.08) return 14_400;
  return 3_600;
}
