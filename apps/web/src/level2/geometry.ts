import type { SimState } from "@ikaros/contracts";
import { physics } from "@ikaros/sim";
import { C } from "../data/sources";

/**
 * Fase de la órbita igual que en el motor: el satélite está en eclipse en el último tramo de
 * cada vuelta (fracción de eclipse de physics.eclipseFraction). El Sol se coloca de modo que ese
 * tramo quede detrás de la Tierra.
 */
export function orbitGeometry(s: SimState) {
  const alt = s.altitude_km ?? 500;
  const period = physics.orbitalPeriod(C.muEarth, C.earthRadius + alt);
  const ecl = physics.eclipseFraction(alt);
  const phase = (s.resources.mission_elapsed_s % period) / period;
  const angle = 2 * Math.PI * phase;
  // Centro del tramo de eclipse; el Sol, en la dirección opuesta.
  const sunAngle = 2 * Math.PI * (1 - ecl / 2) + Math.PI;
  return { alt, angle, sunAngle, inEclipse: phase > 1 - ecl };
}
