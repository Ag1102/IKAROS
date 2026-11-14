import { useEffect, useState } from "react";
import { tr } from "../i18n";

export type AchievementId = "first-orbit" | "perfect-orbit" | "dock-first-try" | "sun-survivor";

export function achievementName(id: AchievementId): string {
  return {
    "first-orbit": tr("Primera órbita", "First orbit"),
    "perfect-orbit": tr("Órbita perfecta", "Perfect orbit"),
    "dock-first-try": tr("Acople a la primera", "Docked on the first try"),
    "sun-survivor": tr("Sobreviviste al Sol", "You survived the Sun"),
  }[id];
}

const KEY = "ikaros.achievements";
const EVENT = "ikaros:achievement";

function read(): AchievementId[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as AchievementId[];
  } catch {
    return [];
  }
}

/** Desbloquea un logro (una sola vez) y avisa para mostrar el aviso emergente. */
export function unlock(id: AchievementId) {
  const have = read();
  if (have.includes(id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...have, id]));
  } catch {
    // Sin almacenamiento el logro igual se muestra en esta sesión.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** Aviso emergente de logro desbloqueado. */
export function AchievementToast() {
  const [current, setCurrent] = useState<AchievementId | null>(null);
  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      setCurrent((e as CustomEvent<AchievementId>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCurrent(null), 3200);
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);
  if (!current) return null;
  return (
    <div className="achievement" role="status">
      <span className="achievement-tag">{tr("Logro", "Achievement")}</span> {achievementName(current)}
    </div>
  );
}
