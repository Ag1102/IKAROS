// Conversión del plano orbital a coordenadas de escena (nivel 1). Las constantes físicas vienen de data/.

/** 1 unidad de escena = 1000 km. */
export const SCENE_UNIT_KM = 1000;

/** Punto del plano orbital (km) → coordenadas de escena. */
export function planeToScene(x_km: number, y_km: number, inclination_deg: number): [number, number, number] {
  const inc = (inclination_deg * Math.PI) / 180;
  return [x_km / SCENE_UNIT_KM, (y_km * Math.sin(inc)) / SCENE_UNIT_KM, (y_km * Math.cos(inc)) / SCENE_UNIT_KM];
}
