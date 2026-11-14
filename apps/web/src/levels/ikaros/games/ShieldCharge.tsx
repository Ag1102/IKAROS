import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import { GameCard, useCountdown, useFinish, useFrameLoop } from "./common";

const SECONDS = 7;
const ZONE = [0.7, 0.86] as const;

/**
 * ⚗ Campo HTS: se carga mientras se mantiene pulsado y se descarga al soltar. Hay que
 * sostener la carga en la franja durante 1,5 s seguidos para desviar la CME.
 */
export function ShieldCharge({ onDone }: { onDone: (ok: boolean) => void }) {
  const [charge, setCharge] = useState(0);
  const c = useRef(0);
  const held = useRef(0);
  const [holding, setHolding] = useState(false);
  const { result, finish } = useFinish(onDone);
  useFrameLoop((dt) => {
    c.current = Math.max(0, Math.min(1, c.current + (holding ? 0.45 : -0.35) * dt));
    setCharge(c.current);
    held.current = c.current >= ZONE[0] && c.current <= ZONE[1] ? held.current + dt : 0;
    if (held.current >= 1.5)
      finish(true, tr("Campo estable: la CME se desvía.", "Field stable: the CME is deflected."), true);
  }, !result);
  const left = useCountdown(
    SECONDS,
    () => finish(false, tr("El campo no aguantó la carga.", "The field could not hold the charge."), false),
    !result,
  );
  return (
    <GameCard
      kicker={tr("Eyección de masa coronal", "Coronal mass ejection")}
      title={tr("Carga el campo HTS", "Charge the HTS field")}
      hint={tr(
        "Mantén pulsado para cargar; sostén la aguja en la franja.",
        "Hold to charge; keep the needle in the band.",
      )}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
    >
      <div className="charge">
        <div className="charge-track">
          <i style={{ left: `${ZONE[0] * 100}%`, width: `${(ZONE[1] - ZONE[0]) * 100}%` }} />
          <div style={{ width: `${charge * 100}%` }} />
        </div>
        <button
          className="hold-btn"
          onPointerDown={() => setHolding(true)}
          onPointerUp={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setHolding(true)}
          onKeyUp={() => setHolding(false)}
        >
          {tr("Mantener para cargar", "Hold to charge")}
        </button>
      </div>
    </GameCard>
  );
}
