// Constantes y utilidades orbitales para la escena. Mientras el contrato no incluya la
// órbita en SimState, la escena la calcula a partir del estado del nivel.

/** Parámetro gravitacional de la Tierra, km³/s². */
export const MU_EARTH_KM3_S2 = 398600.4418;
/** 1 unidad de escena = 1000 km. */
export const SCENE_UNIT_KM = 1000;

/** Radio ecuatorial de la Tierra, km. */
export const EARTH_RADIUS_KM = 6378.137;

export function orbitalPeriodS(altitude_km: number): number {
  const a = EARTH_RADIUS_KM + altitude_km;
  return 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH_KM3_S2);
}

/** Punto del plano orbital (km) → coordenadas de escena. */
export function planeToScene(x_km: number, y_km: number, inclination_deg: number): [number, number, number] {
  const inc = (inclination_deg * Math.PI) / 180;
  return [x_km / SCENE_UNIT_KM, (y_km * Math.sin(inc)) / SCENE_UNIT_KM, (y_km * Math.cos(inc)) / SCENE_UNIT_KM];
}
