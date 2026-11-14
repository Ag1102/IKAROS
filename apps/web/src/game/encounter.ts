import type { SimState } from "@ikaros/contracts";
import { PAPER } from "../data/sources";
import { tr } from "../i18n";

/**
 * Velocidad del tiempo en el encuentro según la distancia al Sol (s de misión por s real):
 * rápido lejos, lento cerca del perihelio, donde está la acción. La pasada dura ~1 min.
 */
export function encounterWarp(r_au: number): number {
  if (r_au > 0.15) return 43_200; // 12 h/s
  if (r_au > 0.08) return 14_400; // 4 h/s
  return 3_600; // 1 h/s
}
export const WARP_MAX = 43_200;
/** Velocidad en peligro: 15 min/s, para ver venir la derrota y poder reaccionar. */
export const WARP_DANGER = 900;

/** ¿Hay que frenar el tiempo? Calor, falta de luz o batería por debajo de la mitad. */
export function inDanger(s: SimState): boolean {
  const battery = (s.battery_wh ?? 0) / Math.max(1, s.battery_capacity_wh ?? 1);
  return balanceOf(s) !== "ok" || battery < 0.5;
}

/** Velocidad del encuentro: la de la distancia, o la de peligro si algo va mal. */
export function encounterSpeed(s: SimState): number {
  return inDanger(s) ? WARP_DANGER : encounterWarp(s.distance_to_sun_au ?? 1);
}

export type Balance = "dark" | "ok" | "hot" | "burning";

/** Estado de la luz sobre la matriz, con los mismos límites que usa el motor (paper). */
export function balanceOf(s: SimState): Balance {
  const cell = s.cell_temperature_c ?? 0;
  if (cell > PAPER.cellDegradation_c) return "burning";
  if (cell > PAPER.cellDesignLimit_c) return "hot";
  if (s.resources.power_generated_w < (s.power_load_w ?? 0)) return "dark";
  return "ok";
}

export function balanceText(b: Balance): string {
  return {
    dark: tr("Falta luz: expón más matriz", "Not enough light: expose more array"),
    ok: tr("¡Equilibrio perfecto!", "Perfect balance!"),
    hot: tr("Demasiada luz: esconde la matriz", "Too much light: hide the array"),
    burning: tr("¡Las celdas se queman!", "The cells are burning!"),
  }[b];
}
