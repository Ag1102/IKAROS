import { useEffect, useRef, useState, type ReactNode } from "react";
import { tr } from "../i18n";
import type { Rating } from "./score";
import type { Lesson } from "./learn";

/** Cuenta atrás en segundos reales; llama a `onEnd` una sola vez al llegar a cero. */
export function useCountdown(seconds: number, onEnd: () => void, running = true) {
  const [left, setLeft] = useState(seconds);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let raf = 0;
    let done = false;
    const tick = (now: number) => {
      const l = Math.max(0, seconds - (now - start) / 1000);
      setLeft(l);
      if (l <= 0 && !done) {
        done = true;
        endRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seconds, running]);
  return left;
}

/** Bucle por cuadro mientras el juego está activo (dt en segundos). */
export function useFrameLoop(fn: (dt: number) => void, running = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ref.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Teclas pulsadas/soltadas mientras el juego está activo. */
export function useKeys(onDown: (key: string, e: KeyboardEvent) => void, onUp?: (key: string) => void) {
  const down = useRef(onDown);
  const up = useRef(onUp);
  down.current = onDown;
  up.current = onUp;
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.repeat) return;
      down.current(e.key, e);
    };
    const u = (e: KeyboardEvent) => up.current?.(e.key);
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);
}

/** Teclas mantenidas en este momento (para movimientos continuos con las flechas). */
export function useHeldKeys(keys: string[]) {
  const held = useRef(new Set<string>());
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      held.current.add(e.key);
    };
    const u = (e: KeyboardEvent) => held.current.delete(e.key);
    const blur = () => held.current.clear();
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
      window.removeEventListener("blur", blur);
    };
    // Las teclas de cada juego no cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return held;
}

/** Barra espaciadora (o Enter) mantenida: activa mientras se pulsa, en cualquier parte de la página. */
export function useHoldSpace(onChange: (down: boolean) => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (!e.repeat) ref.current(true);
    };
    const u = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") ref.current(false);
    };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);
}

/** Segundos de «Prepárate» antes de que corra el reloj de un reto. */
export const PREROLL_S = 2.4;

/** Cuenta previa: el reto no empieza hasta que pasan PREROLL_S (para leer la consigna). */
export function useArmed(): { armed: boolean; pre: number } {
  const [pre, setPre] = useState(PREROLL_S);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, PREROLL_S - (now - start) / 1000);
      setPre(left);
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return { armed: pre <= 0, pre };
}

/** Marco común de los minijuegos: título, consigna, tiempo y resultado. */
export function GameCard({
  kicker,
  title,
  hint,
  left,
  total,
  theoretical = false,
  result,
  keys,
  lesson,
  pre,
  children,
}: {
  kicker: string;
  title: string;
  hint: string;
  left?: number;
  total?: number;
  theoretical?: boolean;
  /** Texto de resultado al terminar (éxito o fallo). */
  result?: { ok: boolean; text: string; rating?: Rating } | null;
  /** Pistas de teclas del reto. */
  keys?: ReactNode;
  /** Dato que se aprende, visible al terminar. */
  lesson?: Lesson;
  /** Segundos de cuenta previa que quedan (0 = en juego). */
  pre?: number;
  children: ReactNode;
}) {
  return (
    <section className={`game-card${result ? (result.ok ? " game-ok" : " game-fail") : ""}`} aria-live="polite">
      <header>
        <span className="game-kicker">
          {kicker}
          {theoretical && <span className="tag tag-theory">⚗ {tr("teórico", "theoretical")}</span>}
        </span>
        <h2>{title}</h2>
        <p className="game-hint">{hint}</p>
      </header>
      {left !== undefined && total !== undefined && !result && (
        <div className="game-timer" aria-label={tr("Tiempo", "Time")}>
          <div style={{ width: `${(left / total) * 100}%` }} />
          <span className="num">{left.toFixed(1)} s</span>
        </div>
      )}
      <div className="game-body">
        {children}
        {pre !== undefined && pre > 0 && (
          <div className="game-preroll" aria-live="assertive">
            <span>{tr("Prepárate", "Get ready")}</span>
            <b className="num">{Math.ceil(pre)}</b>
          </div>
        )}
      </div>
      {!result && keys}
      {result && <p className="game-result">{result.text}</p>}
      {result && (
        <p className="game-next">
          <kbd>Enter</kbd> {tr("seguir", "continue")}
        </p>
      )}
      {result && lesson && (
        <p className="game-lesson">
          <span className="game-lesson-tag">{tr("Dato", "Fact")}</span> {lesson.text}{" "}
          <span className="fact-src">— {lesson.source}</span>
        </p>
      )}
    </section>
  );
}

/**
 * Muestra el resultado y el dato del reto, y avisa al director: con Enter o Espacio se sigue
 * enseguida; si no, a los 4 s.
 */
export function useFinish<T>(onDone: (r: T) => void) {
  const [result, setResult] = useState<{ ok: boolean; text: string; value: T } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!result) return;
    let sent = false;
    const go = () => {
      if (sent) return;
      sent = true;
      doneRef.current(result.value);
    };
    const id = window.setTimeout(go, 4000);
    // Medio segundo de gracia para no saltar el dato con la misma pulsación del juego.
    const armed = window.setTimeout(() => window.addEventListener("keydown", onKey), 500);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    }
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(armed);
      window.removeEventListener("keydown", onKey);
    };
  }, [result]);
  const finish = (ok: boolean, text: string, value: T) => setResult((r) => r ?? { ok, text, value });
  return { result, finish };
}
