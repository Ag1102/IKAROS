import { useEffect, useRef, useState, type ReactNode } from "react";
import { tr } from "../../../i18n";

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

/** Marco común de los minijuegos: título, consigna, tiempo y resultado. */
export function GameCard({
  kicker,
  title,
  hint,
  left,
  total,
  theoretical = false,
  result,
  children,
}: {
  kicker: string;
  title: string;
  hint: string;
  left?: number;
  total?: number;
  theoretical?: boolean;
  /** Texto de resultado al terminar (éxito o fallo). */
  result?: { ok: boolean; text: string } | null;
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
      <div className="game-body">{children}</div>
      {result && <p className="game-result">{result.text}</p>}
    </section>
  );
}

/** Muestra el resultado ~1,4 s y luego avisa al director. */
export function useFinish<T>(onDone: (r: T) => void) {
  const [result, setResult] = useState<{ ok: boolean; text: string; value: T } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => doneRef.current(result.value), 1400);
    return () => window.clearTimeout(id);
  }, [result]);
  const finish = (ok: boolean, text: string, value: T) => setResult((r) => r ?? { ok, text, value });
  return { result, finish };
}
