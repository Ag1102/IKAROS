import { useMemo, useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import {
  GameCard,
  useCountdown,
  useFinish,
  useFrameLoop,
  useHeldKeys,
  useKeys,
  useArmed,
} from "../../../game/minigame";

const SECONDS = 15;
const TOL = 0.07;
const SPEED = 0.55;
const NAMES = () => [tr("Cabeceo", "Pitch"), tr("Guiñada", "Yaw"), tr("Alabeo", "Roll")];

/**
 * Entrada a la órbita de Venus: tres palancas que hay que bajar hasta su marca para apuntar la
 * sonda al corredor del sobrevuelo. ←/→ elige palanca y ↑/↓ (mantenidas) la mueven.
 */
export function LeverAlign({ onDone, seed }: { onDone: (r: Rating) => void; seed: number }) {
  const targets = useMemo(
    () => [0, 1, 2].map((i) => 0.2 + (((seed * 9301 + i * 49297) % 233280) / 233280) * 0.6),
    [seed],
  );
  const [vals, setVals] = useState([0.95, 0.95, 0.95]);
  // Valores vivos: varios movimientos pueden llegar antes de que React vuelva a pintar.
  const live = useRef([0.95, 0.95, 0.95]);
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  const { result, finish } = useFinish(onDone);
  const { armed, pre } = useArmed();
  const running = !result;
  const aligned = vals.map((v, i) => Math.abs(v - (targets[i] ?? 0)) <= TOL);
  const held = useHeldKeys(["ArrowUp", "ArrowDown"]);
  const leftRef = useRef(SECONDS);

  const set = (i: number, v: number) => {
    if (!running || !armed) return;
    const next = live.current.map((x, j) => (j === i ? Math.max(0, Math.min(1, v)) : x));
    live.current = next;
    setVals(next);
    if (next.every((x, j) => Math.abs(x - (targets[j] ?? 0)) <= TOL)) {
      finish(
        true,
        tr("Corredor fijado: sobrevuelo en curso.", "Corridor locked: flyby under way."),
        leftRef.current > SECONDS / 2 ? "perfect" : "good",
      );
    }
  };
  const choose = (i: number) => {
    selRef.current = (i + 3) % 3;
    setSel(selRef.current);
  };
  useKeys((k) => {
    if (k === "ArrowLeft") choose(selRef.current - 1);
    else if (k === "ArrowRight") choose(selRef.current + 1);
    else if (k === "1" || k === "2" || k === "3") choose(Number(k) - 1);
  });
  useFrameLoop((dt) => {
    const dir = (held.current.has("ArrowUp") ? 1 : 0) - (held.current.has("ArrowDown") ? 1 : 0);
    if (dir !== 0) set(selRef.current, (live.current[selRef.current] ?? 0) + dir * SPEED * dt);
  }, running && armed);
  const left = useCountdown(
    SECONDS,
    () =>
      finish(
        false,
        tr("Fuera del corredor: se pierde la ventana.", "Out of the corridor: the window is lost."),
        "fail",
      ),
    running && armed,
  );
  leftRef.current = left;

  const drag = (i: number, el: HTMLElement, clientY: number) => {
    const r = el.getBoundingClientRect();
    set(i, 1 - (clientY - r.top) / r.height);
  };
  return (
    <GameCard
      pre={pre}
      kicker={tr("Inserción en Venus", "Venus insertion")}
      title={tr("Baja las palancas", "Pull the levers")}
      hint={tr("Lleva cada palanca hasta su marca ámbar.", "Bring each lever to its amber mark.")}
      left={left}
      total={SECONDS}
      result={result}
      lesson={lesson("venus-levers")}
      keys={
        <KeyHints>
          <KeyHint keys={["←", "→"]}>{tr("palanca", "lever")}</KeyHint>
          <KeyHint keys={["↑", "↓"]}>{tr("mover (mantén)", "move (hold)")}</KeyHint>
        </KeyHints>
      }
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
              onPointerDown={(e) => {
                choose(i);
                drag(i, e.currentTarget, e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.buttons) drag(i, e.currentTarget, e.clientY);
              }}
            >
              <i className="lever-mark" style={{ bottom: `${(targets[i] ?? 0) * 100}%` }} />
              <span className="lever-knob" style={{ bottom: `${v * 100}%` }} />
            </div>
            <span className="lever-name">
              {i + 1} · {NAMES()[i]}
            </span>
          </div>
        ))}
      </div>
    </GameCard>
  );
}
