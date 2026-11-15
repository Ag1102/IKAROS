import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useCountdown, useFinish, useFrameLoop, useKeys, useArmed } from "../../../game/minigame";

const SECONDS = 9;
const CORRIDOR = 0.22;

/**
 * ⚗ Reentrada de la cápsula: el ángulo de entrada deriva con la atmósfera. Con ←/→ (o los
 * botones) se corrige para mantenerlo en el corredor: muy pendiente se quema, muy plano rebota.
 */
export function Reentry({ onDone }: { onDone: (r: Rating) => void }) {
  const [angle, setAngle] = useState(0);
  const a = useRef(0);
  const drift = useRef(0.3);
  const push = useRef(0);
  const outside = useRef(0);
  const time = useRef(0);
  const everOut = useRef(0);
  const { result, finish } = useFinish(onDone);
  const { armed, pre } = useArmed();
  useFrameLoop((dt) => {
    time.current += dt;
    drift.current = 0.35 * Math.sin(time.current * 0.9) + 0.25 * Math.sin(time.current * 2.3 + 1);
    a.current = Math.max(-1, Math.min(1, a.current + (drift.current + push.current) * dt));
    setAngle(a.current);
    if (Math.abs(a.current) > CORRIDOR) everOut.current += dt;
    outside.current = Math.abs(a.current) > CORRIDOR ? outside.current + dt : Math.max(0, outside.current - dt);
    if (outside.current > 2.4) {
      finish(
        false,
        a.current > 0
          ? tr("Entrada muy pendiente: la cápsula se quemó.", "Too steep: the capsule burned up.")
          : tr("Entrada muy plana: la cápsula rebotó al espacio.", "Too shallow: the capsule skipped off."),
        "fail",
      );
    }
  }, !result && armed);
  useKeys(
    (k, e) => {
      if (k === "ArrowLeft") push.current = -0.9;
      else if (k === "ArrowRight") push.current = 0.9;
      else return;
      e.preventDefault();
    },
    (k) => {
      if (k === "ArrowLeft" || k === "ArrowRight") push.current = 0;
    },
  );
  const left = useCountdown(
    SECONDS,
    () =>
      finish(
        true,
        tr("¡Paracaídas abiertos! La cápsula llega a la Tierra.", "Parachutes out! The capsule reaches Earth."),
        everOut.current < 0.5 ? "perfect" : "good",
      ),
    !result && armed,
  );
  const hold = (v: number) => ({
    onPointerDown: () => (push.current = v),
    onPointerUp: () => (push.current = 0),
    onPointerLeave: () => (push.current = 0),
  });
  return (
    <GameCard
      pre={pre}
      kicker={tr("Regreso a la Tierra", "Return to Earth")}
      title={tr("Mantén el corredor de reentrada", "Hold the reentry corridor")}
      hint={tr("Corrige para que la cápsula no salga de la franja.", "Correct so the capsule stays in the band.")}
      left={left}
      lesson={lesson("reentry")}
      keys={
        <KeyHints>
          <KeyHint keys={["←", "→"]}>{tr("corregir (mantén)", "correct (hold)")}</KeyHint>
        </KeyHints>
      }
      total={SECONDS}
      theoretical
      result={result}
    >
      <div className="reentry">
        <div className="reentry-track">
          <i style={{ left: `${50 - CORRIDOR * 50}%`, width: `${CORRIDOR * 100}%` }} />
          <b style={{ left: `${50 + angle * 50}%` }} />
        </div>
        <div className="reentry-labels">
          <span>{tr("Rebota", "Skips")}</span>
          <span>{tr("Corredor", "Corridor")}</span>
          <span>{tr("Se quema", "Burns")}</span>
        </div>
        <div className="reentry-btns">
          <button className="tap-btn" {...hold(-0.9)}>
            ←
          </button>
          <button className="tap-btn" {...hold(0.9)}>
            →
          </button>
        </div>
      </div>
    </GameCard>
  );
}
