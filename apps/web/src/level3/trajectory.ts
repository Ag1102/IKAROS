import { RSUN_KM } from "./constants";
import { AU_KM, helioAt, solveKepler, type HelioOrbit } from "../sim/kepler";

// Trayectorias y planetas del nivel 3. Valores PROVISIONALES hasta que Camilo los pase a data/.
// - Perihelios de la 1.ª asistencia (0,18 AU) y del final tras 7 sobrevuelos (9,5 R☉), y la
//   duración de 6,9 años: Landis et al., AIAA 2008-5712, p. 2.
// - Perihelios intermedios: interpolación geométrica entre esos dos valores (de prueba).
// - Afelio de 0,73 AU, cerca de la órbita de Venus, para que sigan siendo posibles los
//   sobrevuelos: supuesto de prueba.

export interface Trajectory {
  id: string;
  flybys: number;
  label: string;
  perihelion_au: number;
  aphelion_au: number;
  duration_yr: number;
  origin: "paper" | "placeholder";
}

const RP_FIRST = 0.18;
const RP_FINAL = (9.5 * RSUN_KM) / AU_KM;
const interp = (k: number) => RP_FIRST * (RP_FINAL / RP_FIRST) ** ((k - 1) / 6);

export const TRAJECTORIES: Trajectory[] = [
  {
    id: "v1",
    flybys: 1,
    label: "1 sobrevuelo de Venus",
    perihelion_au: RP_FIRST,
    aphelion_au: 0.73,
    duration_yr: 0.33,
    origin: "paper",
  },
  {
    id: "v3",
    flybys: 3,
    label: "3 sobrevuelos de Venus",
    perihelion_au: interp(3),
    aphelion_au: 0.73,
    duration_yr: 2.3,
    origin: "placeholder",
  },
  {
    id: "v5",
    flybys: 5,
    label: "5 sobrevuelos de Venus",
    perihelion_au: interp(5),
    aphelion_au: 0.73,
    duration_yr: 4.6,
    origin: "placeholder",
  },
  {
    id: "v7",
    flybys: 7,
    label: "7 sobrevuelos de Venus",
    perihelion_au: RP_FINAL,
    aphelion_au: 0.73,
    duration_yr: 6.9,
    origin: "paper",
  },
];

export function trajectoryById(id: string): Trajectory {
  return TRAJECTORIES.find((t) => t.id === id) ?? TRAJECTORIES[TRAJECTORIES.length - 1]!;
}

/** Bonificación científica (0–300): más cerca del Sol, más valor. */
export function scienceBonus(perihelion_au: number): number {
  const f = Math.log(RP_FIRST / perihelion_au) / Math.log(RP_FIRST / RP_FINAL);
  return Math.round(300 * Math.min(1, Math.max(0, f)));
}

// Elementos orbitales aproximados (J2000) de JPL, «Approximate Positions of the Planets»
// (E. M. Standish). Se proyectan en el plano de la eclíptica; la inclinación se ignora.
export interface Planet {
  id: string;
  name: string;
  a: number;
  e: number;
  varpi_deg: number;
  L_deg: number;
  /** Variación de la longitud media, grados por siglo juliano. */
  Ldot_deg_cy: number;
  /** Radio medio, km (NASA, fichas planetarias). */
  radius_km: number;
  color: string;
}

export const PLANETS: Planet[] = [
  {
    id: "mercury",
    name: "Mercurio",
    a: 0.38709927,
    e: 0.20563593,
    varpi_deg: 77.45779628,
    L_deg: 252.2503235,
    Ldot_deg_cy: 149472.67411175,
    radius_km: 2439.7,
    color: "#a59e94",
  },
  {
    id: "venus",
    name: "Venus",
    a: 0.72333566,
    e: 0.00677672,
    varpi_deg: 131.60246718,
    L_deg: 181.9790995,
    Ldot_deg_cy: 58517.81538729,
    radius_km: 6051.8,
    color: "#d8c38a",
  },
  {
    id: "earth",
    name: "Tierra",
    a: 1.00000261,
    e: 0.01671123,
    varpi_deg: 102.93768193,
    L_deg: 100.46457166,
    Ldot_deg_cy: 35999.37244981,
    radius_km: 6371.0,
    color: "#5fb4c4",
  },
];

/** Días desde J2000 hasta el lanzamiento de Parker Solar Probe (12 ago 2018); solo sitúa los planetas. */
export const MISSION_EPOCH_DAY = (Date.UTC(2018, 7, 12) - Date.UTC(2000, 0, 1, 12)) / 86400000;

const DEG = Math.PI / 180;

export function planetOrbit(p: Planet): HelioOrbit {
  return { a: p.a, e: p.e, varpi: p.varpi_deg * DEG, tp: 0 };
}

/** Posición del planeta (AU) en el día `d` desde J2000. */
export function planetAt(p: Planet, d: number) {
  const M = ((p.L_deg + (p.Ldot_deg_cy * d) / 36525 - p.varpi_deg) * DEG) % (2 * Math.PI);
  const E = solveKepler(M, p.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + p.e) * Math.sin(E / 2), Math.sqrt(1 - p.e) * Math.cos(E / 2));
  const r = p.a * (1 - p.e * Math.cos(E));
  const ang = p.varpi_deg * DEG + nu;
  return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
}

export { helioAt };
