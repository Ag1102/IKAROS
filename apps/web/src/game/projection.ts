// Proyección de lo que pasaría con los números del jugador, con la física del motor.
import { C } from "../data/sources";

/**
 * Altitud por debajo de la cual el roce con la atmósfera hace reentrar la nave en pocas vueltas.
 * Es el mismo límite que usa el motor en el nivel 1 (MIN_ALTITUDE_KM). Pendiente de pasar a data/.
 */
export const REENTRY_ALTITUDE_KM = 150;
/** Diferencia aceptada entre la velocidad dada y la circular para considerar la órbita circular. */
export const CIRCULAR_TOLERANCE = 0.01;

export type LeoOutcome = "circular" | "elliptical" | "reentry" | "escape";

export interface LeoProjection {
  outcome: LeoOutcome;
  /** Velocidad circular correcta, km/s. */
  vCircular: number;
  /** Velocidad de escape a esa altitud, km/s. */
  vEscape: number;
  /** Semieje mayor (negativo si escapa), km. */
  a_km: number;
  e: number;
  perigeeAlt_km: number;
  /** Infinity si escapa. */
  apogeeAlt_km: number;
  /** true si la inserción ocurre en el perigeo (velocidad mayor que la circular). */
  insertionAtPerigee: boolean;
}

/** Órbita que resulta de insertar el satélite a altitud h con velocidad tangencial v (vis-viva). */
export function projectLeo(alt_km: number, v_km_s: number): LeoProjection {
  const r = C.earthRadius + alt_km;
  const vCircular = Math.sqrt(C.muEarth / r);
  const vEscape = Math.sqrt((2 * C.muEarth) / r);
  const v = Math.max(0, v_km_s);
  const insertionAtPerigee = v >= vCircular;
  if (v >= vEscape) {
    const a = 1 / (2 / r - (v * v) / C.muEarth);
    return {
      outcome: "escape",
      vCircular,
      vEscape,
      a_km: a,
      e: 1 - r / a,
      perigeeAlt_km: alt_km,
      apogeeAlt_km: Infinity,
      insertionAtPerigee: true,
    };
  }
  const a = 1 / (2 / r - (v * v) / C.muEarth);
  const e = Math.abs(r / a - 1);
  const rp = a * (1 - e);
  const ra = a * (1 + e);
  const perigeeAlt = rp - C.earthRadius;
  const outcome: LeoOutcome =
    perigeeAlt < REENTRY_ALTITUDE_KM
      ? "reentry"
      : Math.abs(v / vCircular - 1) <= CIRCULAR_TOLERANCE
        ? "circular"
        : "elliptical";
  return {
    outcome,
    vCircular,
    vEscape,
    a_km: a,
    e,
    perigeeAlt_km: perigeeAlt,
    apogeeAlt_km: ra - C.earthRadius,
    insertionAtPerigee,
  };
}

/** ¿La traza llega a la latitud que pide el objetivo científico? */
export function coversLatitude(inclination_deg: number, targetLat_deg: number) {
  const maxLat = inclination_deg <= 90 ? inclination_deg : 180 - inclination_deg;
  return { maxLat, ok: maxLat >= targetLat_deg };
}
