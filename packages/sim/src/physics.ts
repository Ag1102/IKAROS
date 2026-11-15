// Fórmulas del motor. Cada función recibe sus parámetros; los valores vienen de data/.
import { C } from "./data";

const K = 273.15;
export const toKelvin = (c: number) => c + K;
export const toCelsius = (k: number) => k - K;

/** Velocidad circular, km/s. */
export function circularVelocity(mu: number, r_km: number): number {
  return Math.sqrt(mu / r_km);
}

/** Vis-viva: velocidad en r para una órbita de semieje a, km/s. */
export function visViva(mu: number, r_km: number, a_km: number): number {
  return Math.sqrt(mu * (2 / r_km - 1 / a_km));
}

/** Delta-V total de una transferencia de Hohmann entre órbitas circulares, km/s. */
export function hohmannDeltaV(mu: number, r1_km: number, r2_km: number): number {
  const at = (r1_km + r2_km) / 2;
  const dv1 = Math.abs(visViva(mu, r1_km, at) - circularVelocity(mu, r1_km));
  const dv2 = Math.abs(circularVelocity(mu, r2_km) - visViva(mu, r2_km, at));
  return dv1 + dv2;
}

/** Tiempo de una transferencia de Hohmann (media elipse), s. */
export function hohmannTime(mu: number, r1_km: number, r2_km: number): number {
  const at = (r1_km + r2_km) / 2;
  return Math.PI * Math.sqrt((at * at * at) / mu);
}

/** Factor máximo de subida que resuelve hohmannTarget. */
export const HOHMANN_MAX_RAISE = 4;

/**
 * Radio final de una transferencia de Hohmann que gasta dv_km_s en total.
 * Positivo sube, negativo baja. Se resuelve por bisección.
 */
export function hohmannTarget(mu: number, r1_km: number, dv_km_s: number): number {
  if (dv_km_s === 0) return r1_km;
  const up = dv_km_s > 0;
  const target = Math.abs(dv_km_s);
  let lo = up ? r1_km : r1_km * 0.5;
  let hi = up ? r1_km * HOHMANN_MAX_RAISE : r1_km;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const dv = hohmannDeltaV(mu, r1_km, mid);
    if (up ? dv < target : dv > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Tsiolkovsky: delta-V con masa inicial y final, m/s. */
export function rocketDeltaV(isp_s: number, m0_kg: number, mf_kg: number): number {
  return isp_s * C.g0 * Math.log(m0_kg / mf_kg);
}

/** Masa de propelente que consume un delta-V, kg. */
export function propellantFor(isp_s: number, m0_kg: number, dv_m_s: number): number {
  return m0_kg * (1 - Math.exp(-Math.abs(dv_m_s) / (isp_s * C.g0)));
}

/** Periodo orbital, s. */
export function orbitalPeriod(mu: number, a_km: number): number {
  return 2 * Math.PI * Math.sqrt((a_km * a_km * a_km) / mu);
}

/** Fracción de la órbita en eclipse para una órbita circular con beta = 0. */
export function eclipseFraction(altitude_km: number): number {
  const r = C.earthRadius + altitude_km;
  return Math.asin(C.earthRadius / r) / Math.PI;
}

/** Intensidad solar a r AU, W/m^2 (ley del inverso del cuadrado). */
export function solarIntensity(r_au: number): number {
  return C.am0 / (r_au * r_au);
}

/** Ec. 1 del paper: equilibrio αI = (εf + εr)σT⁴. Devuelve T en K. */
export function equilibriumTemperature(
  absorptance: number,
  intensity_w_m2: number,
  emittanceTotal: number,
): number {
  return Math.pow((absorptance * intensity_w_m2) / (emittanceTotal * C.sigma), 0.25);
}

/** Ec. 2 del paper: área de radiador por vatio eléctrico, m^2/W. */
export function radiatorAreaPerWatt(efficiency: number, emissivity: number, t_k: number): number {
  return (1 - efficiency) / efficiency / (emissivity * C.sigma * Math.pow(t_k, 4));
}

/** Calor que rechaza un radiador a temperatura t_k, W. */
export function radiatorCapacity(area_m2: number, emissivity: number, t_k: number): number {
  return emissivity * C.sigma * area_m2 * Math.pow(t_k, 4);
}

/** Temperatura de equilibrio de un radiador que rechaza q_w, K. */
export function radiatorTemperature(q_w: number, area_m2: number, emissivity: number): number {
  return Math.pow(Math.max(q_w, 0) / (emissivity * C.sigma * area_m2), 0.25);
}

/** Órbita heliocéntrica con perihelio q y afelio Q (AU). */
export function solarOrbit(q_au: number, Q_au: number) {
  const a_au = (q_au + Q_au) / 2;
  const e = (Q_au - q_au) / (Q_au + q_au);
  const a_km = a_au * C.au;
  const n = Math.sqrt(C.muSun / (a_km * a_km * a_km));
  return { a_au, e, a_km, n };
}

/** Tiempo desde el perihelio hasta la distancia r (rama de salida), s. */
export function timeFromPerihelion(q_au: number, Q_au: number, r_au: number): number {
  const { a_au, e, n } = solarOrbit(q_au, Q_au);
  const cosE = Math.min(1, Math.max(-1, (1 - r_au / a_au) / e));
  const E = Math.acos(cosE);
  return (E - e * Math.sin(E)) / n;
}

/** Distancia al Sol t segundos después del perihelio (negativo = antes), AU. */
export function distanceAt(q_au: number, Q_au: number, t_s: number): number {
  const { a_au, e, n } = solarOrbit(q_au, Q_au);
  const M = n * Math.abs(t_s);
  // Con excentricidades altas (la zambullida) Newton solo converge si arranca en π.
  let E = e > 0.8 ? Math.PI : M;
  for (let i = 0; i < 30; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return a_au * (1 - e * Math.cos(E));
}

/** Relajación térmica exponencial hacia el equilibrio. */
export function relax(current: number, target: number, dt_s: number, tau_s: number): number {
  return current + (target - current) * (1 - Math.exp(-dt_s / tau_s));
}
