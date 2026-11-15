// Progreso del jugador: el nivel 1 está abierto; cada nivel superado con éxito abre el siguiente.
// Se guarda en este navegador; si no hay almacenamiento, vale para la pestaña actual.
import { useSyncExternalStore } from "react";
import type { MissionReport } from "@ikaros/contracts";

const KEY = "ikaros-unlocked";
export const LAST_LEVEL = 2;

function load(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY));
    // Un valor guardado por encima del último nivel se limita a LAST_LEVEL.
    if (Number.isInteger(n) && n >= 1) return Math.min(n, LAST_LEVEL);
  } catch {
    // Sin almacenamiento (modo privado, pruebas): se empieza desde el nivel 1.
  }
  return 1;
}

let unlocked = typeof window !== "undefined" ? load() : 1;
const listeners = new Set<() => void>();

function save(n: number) {
  unlocked = n;
  try {
    window.localStorage.setItem(KEY, String(n));
  } catch {
    // El progreso queda en memoria para esta pestaña.
  }
  for (const l of listeners) l();
}

/** Nivel más alto desbloqueado. */
export function getUnlocked(): number {
  return unlocked;
}

export function isUnlocked(level: number): boolean {
  return level <= unlocked;
}

/** Registra el resultado de un nivel: solo una misión cumplida abre el siguiente. */
export function recordResult(level: number, outcome: MissionReport["outcome"]): void {
  // Un nivel bloqueado no puede abrir otros.
  if (outcome !== "success" || level > unlocked) return;
  const next = Math.min(LAST_LEVEL, level + 1);
  if (next > unlocked) save(next);
}

/** Vuelve a bloquear todo salvo el nivel 1. */
export function resetProgress(): void {
  stars = {};
  try {
    window.localStorage.removeItem(STARS_KEY);
  } catch {
    // Nada que borrar.
  }
  save(1);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Nivel más alto desbloqueado; el componente se vuelve a pintar al cambiar. */
export function useUnlocked(): number {
  return useSyncExternalStore(subscribe, getUnlocked, getUnlocked);
}

// Estrellas por nivel (mejor resultado)

const STARS_KEY = "ikaros-stars-v2";
let stars: Record<number, number> = {};
try {
  stars = JSON.parse(typeof window !== "undefined" ? (window.localStorage.getItem(STARS_KEY) ?? "{}") : "{}");
} catch {
  stars = {};
}

/** Guarda las estrellas de un nivel si mejoran el récord. */
export function recordStars(level: number, n: number): void {
  if (n <= (stars[level] ?? 0)) return;
  stars = { ...stars, [level]: n };
  try {
    window.localStorage.setItem(STARS_KEY, JSON.stringify(stars));
  } catch {
    // Sin almacenamiento el récord vale para esta pestaña.
  }
  for (const l of listeners) l();
}

const getStars = () => stars;

/** Mejores estrellas de cada nivel; se vuelve a pintar al cambiar. */
export function useBestStars(): Record<number, number> {
  return useSyncExternalStore(subscribe, getStars, getStars);
}
