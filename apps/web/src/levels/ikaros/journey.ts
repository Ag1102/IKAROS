// Geometría del viaje único del nivel 3: Tierra → Venus → Sol → Tierra, en AU sobre la eclíptica.
import type { ScenarioDefinition } from "@ikaros/contracts";
import { anomalyFromDistance, orbitFromApsides, type HelioOrbit } from "../../sim/kepler";
import { C, PAPER } from "../../data/sources";
import { MISSION_EPOCH_DAY, PLANETS, planetAt } from "./planets";

export interface Pt {
  x: number;
  y: number;
}

const param = (def: ScenarioDefinition, key: string) => def.params[key]?.value ?? 0;
const planet = (id: string) => PLANETS.find((p) => p.id === id)!;
/** ⚗ Días del regreso de la cápsula desde la salida del encuentro hasta la Tierra (supuesto del juego). */
export const RETURN_DAYS = 90;

/** Espiral prograda entre dos puntos: el radio y el ángulo se interpolan con suavidad. */
function spiral(a: Pt, b: Pt, f: number): Pt {
  const ra = Math.hypot(a.x, a.y);
  const rb = Math.hypot(b.x, b.y);
  const ta = Math.atan2(a.y, a.x);
  let tb = Math.atan2(b.y, b.x);
  while (tb < ta) tb += 2 * Math.PI;
  const e = f * f * (3 - 2 * f);
  const r = ra + (rb - ra) * e;
  const t = ta + (tb - ta) * f;
  return { x: r * Math.cos(t), y: r * Math.sin(t) };
}

export function journey(def: ScenarioDefinition, perihelion_rsun: number) {
  const flybyDays = param(def, "flyby_interval_s") / 86400;
  const earth0 = planetAt(planet("earth"), MISSION_EPOCH_DAY);
  const venus = planetAt(planet("venus"), MISSION_EPOCH_DAY + flybyDays);
  // La órbita final se gira para que su afelio quede en Venus: desde ahí la sonda cae hacia el Sol.
  const varpi = Math.atan2(venus.y, venus.x) - Math.PI;
  const orbit: HelioOrbit = orbitFromApsides((perihelion_rsun * C.sunRadius) / C.au, param(def, "aphelion_au"), varpi);
  const onOrbit = (r: number, receding: boolean): Pt => {
    const nu = anomalyFromDistance(orbit, r, receding) + varpi;
    return { x: r * Math.cos(nu), y: r * Math.sin(nu) };
  };
  const entry = onOrbit(PAPER.mainArrayLimit_au, false);
  const exit = onOrbit(PAPER.mainArrayLimit_au, true);

  /** Tramo 1: de la Tierra a Venus, f de 0 a 1. */
  const toVenus = (f: number) => spiral(earth0, venus, Math.max(0, Math.min(1, f)));
  /** Tramo 2: de Venus a la entrada del encuentro (0,25 AU), siguiendo la órbita final. */
  const toSun = (f: number) => {
    const rVenus = Math.hypot(venus.x, venus.y);
    const r = rVenus + (PAPER.mainArrayLimit_au - rVenus) * Math.max(0, Math.min(1, f));
    return onOrbit(Math.min(r, orbit.a * (1 + orbit.e) - 1e-6), false);
  };
  /** Tramo 4: de la salida del encuentro a la Tierra el día de llegada. */
  const home = (exitDay: number) => planetAt(planet("earth"), exitDay + RETURN_DAYS);
  const toEarth = (f: number, exitDay: number) => spiral(exit, home(exitDay), Math.max(0, Math.min(1, f)));

  /** Ruta prevista para dibujar: tramo a Venus, caída al Sol y regreso aproximado. */
  const route = (exitDay: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 60; i++) pts.push([toVenus(i / 60).x, toVenus(i / 60).y]);
    for (let i = 0; i <= 40; i++) pts.push([toSun(i / 40).x, toSun(i / 40).y]);
    const rp = (perihelion_rsun * C.sunRadius) / C.au;
    for (let i = 0; i <= 80; i++) {
      const r = PAPER.mainArrayLimit_au - (PAPER.mainArrayLimit_au - rp) * (1 - Math.abs(1 - (2 * i) / 80));
      const p = onOrbit(Math.max(r, rp + 1e-6), i > 40);
      pts.push([p.x, p.y]);
    }
    for (let i = 0; i <= 60; i++) pts.push([toEarth(i / 60, exitDay).x, toEarth(i / 60, exitDay).y]);
    return pts;
  };

  return { orbit, varpi, earth0, venus, entry, exit, flybyDays, toVenus, toSun, toEarth, home, route };
}
