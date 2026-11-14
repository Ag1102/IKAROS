// Órbitas keplerianas alrededor del Sol, en unidades astronómicas y días.

/** Constante gravitacional de Gauss: movimiento medio para a = 1 AU, rad/día. */
export const GAUSS_K = 0.01720209895;
export const AU_KM = 149597870.7;
const TWO_PI = Math.PI * 2;

export interface HelioOrbit {
  /** Semieje mayor, AU. */
  a: number;
  e: number;
  /** Longitud del perihelio, rad. */
  varpi: number;
  /** Instante de paso por el perihelio, días. */
  tp: number;
}

export const meanMotion = (a: number) => GAUSS_K / a ** 1.5;
export const periodDays = (a: number) => TWO_PI / meanMotion(a);

export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Posición en el plano de la eclíptica (AU) en el instante t (días). */
export function helioAt(o: HelioOrbit, t: number) {
  let M = (meanMotion(o.a) * (t - o.tp)) % TWO_PI;
  if (M > Math.PI) M -= TWO_PI;
  if (M < -Math.PI) M += TWO_PI;
  const E = solveKepler(M, o.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + o.e) * Math.sin(E / 2), Math.sqrt(1 - o.e) * Math.cos(E / 2));
  const r = o.a * (1 - o.e * Math.cos(E));
  const angle = o.varpi + nu;
  return { r, angle, x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/** Días desde el perihelio hasta que la distancia al Sol vuelve a ser r (rp ≤ r ≤ ra). */
export function timeFromPerihelion(o: HelioOrbit, r: number): number {
  const cosE = Math.min(1, Math.max(-1, (1 - r / o.a) / o.e));
  const E = Math.acos(cosE);
  return (E - o.e * Math.sin(E)) / meanMotion(o.a);
}

export function orbitFromApsides(perihelion_au: number, aphelion_au: number, varpi = 0, tp = 0): HelioOrbit {
  return {
    a: (perihelion_au + aphelion_au) / 2,
    e: (aphelion_au - perihelion_au) / (aphelion_au + perihelion_au),
    varpi,
    tp,
  };
}

/** Puntos de la elipse completa en el plano (AU), para dibujarla. */
export function ellipsePoints(o: Pick<HelioOrbit, "a" | "e" | "varpi">, n = 256): [number, number][] {
  const p = o.a * (1 - o.e * o.e);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const nu = (i / n) * TWO_PI;
    const r = p / (1 + o.e * Math.cos(nu));
    pts.push([r * Math.cos(o.varpi + nu), r * Math.sin(o.varpi + nu)]);
  }
  return pts;
}
