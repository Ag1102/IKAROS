import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useCountdown, useFinish, useFrameLoop, useHeldKeys } from "../../../game/minigame";

const SECONDS = 10;
const BAND = [0.4, 0.65] as const;

/**
 * ⚗ Mini reactor: el núcleo se calienta solo y a saltos. ↓ mete las barras de control (enfría)
 * y ↑ las saca. Hay que mantener la temperatura en la franja; si se sale mucho rato, SCRAM.
 */
export function ReactorRods({ onDone, seed }: { onDone: (r: Rating) => void; seed: number }) {
  const [temp, setTemp] = useState(0.5);
  const [rods, setRods] = useState(0.4);
  const t = useRef(0.5);
  const r = useRef(0.4);
  const out = useRef(0);
  const everOut = useRef(0);
  const phase = useRef(seed % 7);
  const held = useHeldKeys(["ArrowUp", "ArrowDown"]);
  const { result, finish } = useFinish(onDone);
  useFrameLoop((dt) => {
    const dir = (held.current.has("ArrowDown") ? 1 : 0) - (held.current.has("ArrowUp") ? 1 : 0);
    r.current = Math.max(0, Math.min(1, r.current + dir * 0.8 * dt));
    setRods(r.current);
    phase.current += dt;
    const surge = 0.22 + 0.18 * Math.sin(phase.current * 1.7) + 0.12 * Math.sin(phase.current * 4.3);
    t.current = Math.max(0, Math.min(1, t.current + (surge - r.current * 0.62) * dt));
    setTemp(t.current);
    const outside = t.current < BAND[0] || t.current > BAND[1];
    if (outside) everOut.current += dt;
    out.current = outside ? out.current + dt : Math.max(0, out.current - dt * 0.5);
    if (out.current > 2.2) {
      finish(
        false,
        tr("SCRAM: el reactor se apagó por seguridad.", "SCRAM: the reactor shut down for safety."),
        "fail",
      );
    }
  }, !result);
  const left = useCountdown(
    SECONDS,
    () =>
      finish(
        true,
        tr("Núcleo estable: energía asegurada.", "Core stable: power secured."),
        everOut.current < 0.6 ? "perfect" : "good",
      ),
    !result,
  );
  const hot = temp > BAND[1];
  return (
    <GameCard
      kicker={tr("Mini reactor de fisión", "Mini fission reactor")}
      title={tr("Estabiliza el núcleo", "Stabilize the core")}
      hint={tr(
        "Las barras dentro enfrían. Mantén el núcleo en la franja azul.",
        "Rods in cool the core. Keep it in the blue band.",
      )}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
      lesson={lesson("reactor")}
      keys={
        <KeyHints>
          <KeyHint keys={["↓"]}>{tr("meter barras", "rods in")}</KeyHint>
          <KeyHint keys={["↑"]}>{tr("sacar barras", "rods out")}</KeyHint>
        </KeyHints>
      }
    >
      <div className="reactor">
        <div className={`core${hot ? " hot" : temp < BAND[0] ? " cold" : ""}`}>
          <div className="core-band" style={{ bottom: `${BAND[0] * 100}%`, height: `${(BAND[1] - BAND[0]) * 100}%` }} />
          <div className="core-level" style={{ height: `${temp * 100}%` }} />
        </div>
        <div className="rods">
          <span>
            {tr("Barras dentro", "Rods in")} <span className="num">{Math.round(rods * 100)} %</span>
          </span>
          <div className="rod-bank" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ height: `${20 + rods * 70}%` }} />
            ))}
          </div>
        </div>
      </div>
    </GameCard>
  );
}
