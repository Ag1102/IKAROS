import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useCountdown, useFinish, useFrameLoop, useHoldSpace } from "../../../game/minigame";

const SECONDS = 7;
const ZONE = [0.7, 0.86] as const;

/**
 * ⚗ Campo HTS: se carga mientras se mantiene Espacio y se descarga al soltar. Hay que sostener
 * la carga en la franja 1,5 s seguidos para desviar la CME.
 */
export function ShieldCharge({ onDone }: { onDone: (r: Rating) => void }) {
  const [charge, setCharge] = useState(0);
  const c = useRef(0);
  const held = useRef(0);
  const holding = useRef(false);
  const leftRef = useRef(SECONDS);
  const { result, finish } = useFinish(onDone);
  useHoldSpace((down) => (holding.current = down));
  useFrameLoop((dt) => {
    c.current = Math.max(0, Math.min(1, c.current + (holding.current ? 0.45 : -0.35) * dt));
    setCharge(c.current);
    held.current = c.current >= ZONE[0] && c.current <= ZONE[1] ? held.current + dt : 0;
    if (held.current >= 1.5) {
      finish(
        true,
        tr("Campo estable: la CME se desvía.", "Field stable: the CME is deflected."),
        leftRef.current > 3 ? "perfect" : "good",
      );
    }
  }, !result);
  const left = useCountdown(
    SECONDS,
    () => finish(false, tr("El campo no aguantó la carga.", "The field could not hold the charge."), "fail"),
    !result,
  );
  leftRef.current = left;
  return (
    <GameCard
      kicker={tr("Eyección de masa coronal", "Coronal mass ejection")}
      title={tr("Carga el campo HTS", "Charge the HTS field")}
      hint={tr(
        "Mantén Espacio para cargar y suéltalo para no pasarte.",
        "Hold Space to charge and release so you don't overshoot.",
      )}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
      lesson={lesson("hts")}
      keys={
        <KeyHints>
          <KeyHint keys={[tr("Espacio", "Space")]}>{tr("cargar (mantén)", "charge (hold)")}</KeyHint>
        </KeyHints>
      }
    >
      <div className="charge">
        <div className="charge-track">
          <i style={{ left: `${ZONE[0] * 100}%`, width: `${(ZONE[1] - ZONE[0]) * 100}%` }} />
          <div style={{ width: `${charge * 100}%` }} />
        </div>
      </div>
    </GameCard>
  );
}
