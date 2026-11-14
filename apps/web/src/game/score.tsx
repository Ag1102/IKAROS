import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MissionReport } from "@ikaros/contracts";
import { formatNumber } from "../ui/format";
import { tr } from "../i18n";

/** Calificación de un reto: perfecto, bien o fallo. */
export type Rating = "perfect" | "good" | "fail";

const BASE: Record<Rating, number> = { perfect: 300, good: 150, fail: 0 };
const WEIGHT: Record<Rating, number> = { perfect: 1, good: 0.6, fail: 0 };

interface Toast {
  id: number;
  rating: Rating;
  label: string;
  gained: number;
  combo: number;
}

interface ScoreApi {
  points: number;
  combo: number;
  ratings: Rating[];
  /** Registra un reto: suma puntos (con bono de combo) y muestra el aviso. */
  add: (rating: Rating, label: string) => void;
  reset: () => void;
}

const Ctx = createContext<ScoreApi | null>(null);

export function useScore(): ScoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScore fuera de ScoreProvider");
  return v;
}

/** Puntos de piloto del nivel: retos calificados, combos y avisos en pantalla. */
export function ScoreProvider({ children }: { children: ReactNode }) {
  const [points, setPoints] = useState(0);
  const [combo, setCombo] = useState(0);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const comboRef = useRef(0);
  const seq = useRef(0);

  const add = useCallback((rating: Rating, label: string) => {
    const nextCombo = rating === "fail" ? 0 : comboRef.current + 1;
    comboRef.current = nextCombo;
    // Cada reto seguido sin fallar suma un 25 % más, hasta ×2.
    const gained = Math.round(BASE[rating] * (1 + 0.25 * Math.min(4, Math.max(0, nextCombo - 1))));
    setCombo(nextCombo);
    setPoints((p) => p + gained);
    setRatings((r) => [...r, rating]);
    const id = ++seq.current;
    setToasts((t) => [...t, { id, rating, label, gained, combo: nextCombo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1800);
  }, []);

  const reset = useCallback(() => {
    comboRef.current = 0;
    setPoints(0);
    setCombo(0);
    setRatings([]);
    setToasts([]);
  }, []);

  const api = useMemo(() => ({ points, combo, ratings, add, reset }), [points, combo, ratings, add, reset]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="score-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`score-toast score-${t.rating}`}>
            <b>{ratingText(t.rating)}</b>
            <span>{t.label}</span>
            {t.gained > 0 && (
              <span className="num">
                +{formatNumber(t.gained)}
                {t.combo > 1 && ` · ${tr("combo", "combo")} ×${t.combo}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function ratingText(r: Rating): string {
  return { perfect: tr("¡Perfecto!", "Perfect!"), good: tr("¡Bien!", "Good!"), fail: tr("Fallo", "Miss") }[r];
}

/** Marcador pequeño de puntos y combo, para la barra superior del nivel. */
export function ScoreHud() {
  const { points, combo } = useScore();
  const [bump, setBump] = useState(false);
  const last = useRef(points);
  useEffect(() => {
    if (points === last.current) return;
    last.current = points;
    setBump(true);
    const id = window.setTimeout(() => setBump(false), 300);
    return () => window.clearTimeout(id);
  }, [points]);
  return (
    <div className={`score-hud${bump ? " bump" : ""}`} aria-label={tr("Puntos de piloto", "Pilot points")}>
      <span>{tr("Piloto", "Pilot")}</span>
      <b className="num">{formatNumber(points)}</b>
      {combo > 1 && <span className="score-combo">×{combo}</span>}
    </div>
  );
}

/** Proporción de acierto de los retos: 1 si todo fue perfecto. */
export function pilotRatio(ratings: Rating[]): number {
  if (ratings.length === 0) return 0;
  return ratings.reduce((m, r) => m + WEIGHT[r], 0) / ratings.length;
}

/**
 * Estrellas del nivel: el motor manda (sin misión cumplida no hay más de 1) y la destreza
 * en los retos sube la nota. Fallida = 0, parcial = 1, cumplida = 1 a 3.
 */
export function starsFor(outcome: MissionReport["outcome"], ratio: number): number {
  if (outcome === "failure") return 0;
  if (outcome === "partial") return 1;
  return 1 + (ratio >= 0.6 ? 1 : 0) + (ratio >= 0.85 ? 1 : 0);
}
