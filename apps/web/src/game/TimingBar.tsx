import { useRef, useState } from "react";
import type { Lesson } from "./learn";
import { KeyHint, KeyHints } from "./KeyHint";
import { tr } from "../i18n";
import { GameCard, useFinish, useFrameLoop, useKeys, useArmed } from "./minigame";

/**
 * Juego de tiempo: un marcador recorre la barra; se pulsa cuando pasa por la ventana.
 * `attempts` intentos; el resultado es cuántos aciertos hubo.
 */
export function TimingBar({
  kicker,
  title,
  hint,
  button,
  attempts,
  window: win,
  speed,
  theoretical,
  resultText,
  lesson,
  stopOnHit = false,
  onDone,
}: {
  kicker: string;
  title: string;
  hint: string;
  button: string;
  attempts: number;
  window: number;
  speed: number;
  theoretical?: boolean;
  resultText: (hits: number) => { ok: boolean; text: string };
  lesson?: Lesson;
  /** Termina con el primer acierto (los intentos son reservas, no rondas). */
  stopOnHit?: boolean;
  onDone: (hits: number) => void;
}) {
  const [pos, setPos] = useState(0);
  const x = useRef(0);
  const dir = useRef(1);
  const [hits, setHits] = useState<boolean[]>([]);
  const live = useRef<boolean[]>([]);
  const center = useRef(0.3 + Math.random() * 0.4);
  const [winCenter, setWinCenter] = useState(center.current);
  const { result, finish } = useFinish(onDone);
  const { armed, pre } = useArmed();
  useFrameLoop((dt) => {
    x.current += dir.current * speed * dt;
    if (x.current > 1) {
      x.current = 1;
      dir.current = -1;
    } else if (x.current < 0) {
      x.current = 0;
      dir.current = 1;
    }
    setPos(x.current);
  }, !result && armed);
  const press = () => {
    if (result || !armed) return;
    const hit = Math.abs(x.current - center.current) <= win / 2;
    if (live.current.length >= attempts) return;
    const next = [...live.current, hit];
    live.current = next;
    setHits(next);
    center.current = 0.2 + Math.random() * 0.6;
    setWinCenter(center.current);
    if (next.length >= attempts || (stopOnHit && hit)) {
      const n = next.filter(Boolean).length;
      const r = resultText(n);
      finish(r.ok, r.text, n);
    }
  };
  useKeys((k, e) => {
    if (k === " " || k === "Enter") {
      e.preventDefault();
      press();
    }
  });
  return (
    <GameCard
      pre={pre}
      kicker={kicker}
      title={title}
      hint={hint}
      theoretical={theoretical}
      result={result}
      lesson={lesson}
      keys={
        <KeyHints>
          <KeyHint keys={[tr("Espacio", "Space")]}>{button}</KeyHint>
        </KeyHints>
      }
    >
      <div className="timing">
        <div className="timing-track">
          <i style={{ left: `${(winCenter - win / 2) * 100}%`, width: `${win * 100}%` }} />
          <b style={{ left: `${pos * 100}%` }} />
        </div>
        <div className="timing-shots">
          {Array.from({ length: attempts }, (_, i) => (
            <span key={i} className={hits[i] === undefined ? "" : hits[i] ? "hit" : "miss"} />
          ))}
        </div>
        <button className="tap-btn" onClick={press} disabled={Boolean(result)}>
          {button}
        </button>
      </div>
    </GameCard>
  );
}
