import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import { GameCard, useFinish, useFrameLoop } from "./common";

/**
 * A 0,25 AU la matriz principal se pliega tras el escudo (paper, p. 4). Se mantiene pulsado
 * hasta completar el plegado; soltar antes lo detiene.
 */
export function FoldArray({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  const [holding, setHolding] = useState(false);
  const { result, finish } = useFinish<void>(onDone);
  useFrameLoop((dt) => {
    if (!holding) return;
    pRef.current = Math.min(1, pRef.current + dt / 1.6);
    setP(pRef.current);
    if (pRef.current >= 1) {
      finish(true, tr("Matriz principal a salvo tras el escudo.", "Main array safe behind the shield."), undefined);
    }
  }, !result);
  return (
    <GameCard
      kicker={tr("0,25 AU · 16 soles", "0.25 AU · 16 suns")}
      title={tr("Pliega la matriz principal", "Fold the main array")}
      hint={tr(
        "Mantén pulsado hasta plegar del todo: a esta distancia se quemaría.",
        "Hold until it is fully folded: at this distance it would burn.",
      )}
      result={result}
    >
      <div className="fold">
        <div className="fold-wings" style={{ ["--p" as string]: p }}>
          <span />
          <b />
          <span />
        </div>
        <button
          className="hold-btn"
          onPointerDown={() => setHolding(true)}
          onPointerUp={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setHolding(true)}
          onKeyUp={() => setHolding(false)}
        >
          {tr("Mantener para plegar", "Hold to fold")} · {Math.round(p * 100)} %
        </button>
      </div>
    </GameCard>
  );
}
