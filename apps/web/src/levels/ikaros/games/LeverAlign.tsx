import { useMemo, useRef, useState } from "react";
import { tr } from "../../../i18n";
import { GameCard, useCountdown, useFinish, useKeys } from "./common";

const SECONDS = 12;
const TOL = 0.06;
const NAMES = () => [tr("Cabeceo", "Pitch"), tr("Guiñada", "Yaw"), tr("Alabeo", "Roll")];

/**
 * Entrada a la órbita de Venus: tres palancas que hay que bajar hasta su marca para
 * apuntar la sonda al corredor del sobrevuelo. Teclado: ←/→ elige palanca, ↑/↓ la mueve.
 */
export function LeverAlign({ onDone, seed }: { onDone: (ok: boolean) => void; seed: number }) {
  const targets = useMemo(
    () => [0, 1, 2].map((i) => 0.25 + (((seed * 9301 + i * 49297) % 233280) / 233280) * 0.6),
    [seed],
  );
  const [vals, setVals] = useState([0.95, 0.95, 0.95]);
  // Valores vivos: varios movimientos pueden llegar antes de que React vuelva a pintar.
  const live = useRef([0.95, 0.95, 0.95]);
  const [sel, setSel] = useState(0);
  const { result, finish } = useFinish(onDone);
  const running = !result;
  const aligned = vals.map((v, i) => Math.abs(v - (targets[i] ?? 0)) <= TOL);

  const set = (i: number, v: number) => {
    if (!running) return;
    const next = live.current.map((x, j) => (j === i ? Math.max(0, Math.min(1, v)) : x));
    live.current = next;
    setVals(next);
    if (next.every((x, j) => Math.abs(x - (targets[j] ?? 0)) <= TOL)) {
      finish(true, tr("Corredor fijado: sobrevuelo en curso.", "Corridor locked: flyby under way."), true);
    }
  };
  useKeys((k, e) => {
    if (k === "ArrowLeft") setSel((s) => (s + 2) % 3);
    else if (k === "ArrowRight") setSel((s) => (s + 1) % 3);
    else if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      set(sel, (live.current[sel] ?? 0) + (k === "ArrowUp" ? 0.03 : -0.03));
    }
  });
  const left = useCountdown(
    SECONDS,
    () =>
      finish(false, tr("Fuera del corredor: se pierde la ventana.", "Out of the corridor: the window is lost."), false),
    running,
  );

  const drag = (i: number, el: HTMLElement, clientY: number) => {
    const r = el.getBoundingClientRect();
    set(i, 1 - (clientY - r.top) / r.height);
  };
  return (
    <GameCard
      kicker={tr("Inserción en Venus", "Venus insertion")}
      title={tr("Baja las palancas", "Pull the levers")}
      hint={tr(
        "Arrastra cada palanca hasta su marca ámbar. Teclado: ←/→ elige, ↑/↓ mueve.",
        "Drag each lever to its amber mark. Keys: ←/→ select, ↑/↓ move.",
      )}
      left={left}
      total={SECONDS}
      result={result}
    >
      <div className="levers">
        {vals.map((v, i) => (
          <div key={i} className={`lever${sel === i ? " sel" : ""}${aligned[i] ? " ok" : ""}`}>
            <div
              className="lever-slot"
              role="slider"
              aria-label={NAMES()[i]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(v * 100)}
              tabIndex={0}
              onFocus={() => setSel(i)}
              onPointerDown={(e) => {
                setSel(i);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag(i, e.currentTarget, e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.buttons) drag(i, e.currentTarget, e.clientY);
              }}
            >
              <i className="lever-mark" style={{ bottom: `${(targets[i] ?? 0) * 100}%` }} />
              <span className="lever-knob" style={{ bottom: `${v * 100}%` }} />
            </div>
            <span className="lever-name">{NAMES()[i]}</span>
          </div>
        ))}
      </div>
    </GameCard>
  );
}
