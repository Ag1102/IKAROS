import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useFinish, useFrameLoop, useHoldSpace } from "../../../game/minigame";

/**
 * A 0,25 AU la matriz principal se pliega tras el escudo (paper, p. 4). Se mantiene Espacio
 * hasta completar el plegado; soltar antes lo detiene (y cuenta como titubeo).
 */
export function FoldArray({ onDone }: { onDone: (r: Rating) => void }) {
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  const holding = useRef(false);
  const releases = useRef(0);
  const { result, finish } = useFinish(onDone);
  useHoldSpace((down) => {
    if (!down && holding.current && pRef.current < 1) releases.current++;
    holding.current = down;
  });
  useFrameLoop((dt) => {
    if (!holding.current) return;
    pRef.current = Math.min(1, pRef.current + dt / 1.6);
    setP(pRef.current);
    if (pRef.current >= 1) {
      finish(
        true,
        tr("Matriz principal a salvo tras el escudo.", "Main array safe behind the shield."),
        releases.current === 0 ? "perfect" : "good",
      );
    }
  }, !result);
  return (
    <GameCard
      kicker={tr("0,25 AU · 16 soles", "0.25 AU · 16 suns")}
      title={tr("Pliega la matriz principal", "Fold the main array")}
      hint={tr(
        "Mantén Espacio hasta plegarla del todo, sin soltar.",
        "Hold Space until it is fully folded, without letting go.",
      )}
      result={result}
      lesson={lesson("fold")}
      keys={
        <KeyHints>
          <KeyHint keys={[tr("Espacio", "Space")]}>{tr("mantener", "hold")}</KeyHint>
        </KeyHints>
      }
    >
      <div className="fold">
        <div className="fold-wings" style={{ ["--p" as string]: p }}>
          <span />
          <b />
          <span />
        </div>
        <div className="charge-track">
          <div style={{ width: `${p * 100}%` }} />
        </div>
      </div>
    </GameCard>
  );
}
