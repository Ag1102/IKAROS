import type * as THREE from "three";

/**
 * Regla de tamaño de los cuerpos en la escena: tamaño real, salvo que así no se vea; entonces
 * se dibuja con un tamaño mínimo proporcional a la distancia a la cámara (`fraction`), de modo
 * que ocupe siempre lo mismo en pantalla. Las distancias no se alteran nunca.
 */
export function displaySize(camera: THREE.Camera, position: THREE.Vector3, realSize: number, fraction: number) {
  return Math.max(realSize, camera.position.distanceTo(position) * fraction);
}

/** Fracción de la distancia a la cámara usada para naves y planetas pequeños. */
export const MARKER_FRACTION = 0.035;
