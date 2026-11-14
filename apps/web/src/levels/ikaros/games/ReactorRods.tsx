import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import { GameCard, useCountdown, useFinish, useFrameLoop, useKeys } from "./common";

const SECONDS = 10;
const BAND = [0.4, 0.65] as const;

/**
 * ⚗ Mini reactor: el núcleo se calienta solo y a saltos. Las barras de control lo enfrían.
 * Hay que mantener la temperatura en la franja; si se sale demasiado tiempo, SCRAM.
 */
export function ReactorRods({ onDone, seed }: { onDone: (ok: boolean) => void; seed: number }) {
  const [temp, setTemp] = useState(0.5);
  const [rods, setRods] = useState(0.4);
  const t = useRef(0.5);
  const out = useRef(0);
  const phase = useRef(seed % 7);
  const { result, finish } = useFinish(onDone);
  useFrameLoop((dt) => {
    phase.current += dt;
    const surge = 0.22 + 0.18 * Math.sin(phase.current * 1.7) + 0.12 * Math.sin(phase.current * 4.3);
    t.current = Math.max(0, Math.min(1, t.current + (surge - rods * 0.62) * dt));
    setTemp(t.current);
    out.current = t.current < BAND[0] || t.current > BAND[1] ? out.current + dt : Math.max(0, out.current - dt * 0.5);
    if (out.current > 2.2) {
      finish(false, tr("SCRAM: el reactor se apagó por seguridad.", "SCRAM: the reactor shut down for safety."), false);
    }
  }, !result);
  useKeys((k, e) => {
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      setRods((r) => Math.max(0, Math.min(1, r + (k === "ArrowUp" ? -0.06 : 0.06))));
    }
  });
  const left = useCountdown(
    SECONDS,
    () => finish(true, tr("Núcleo estable: energía asegurada.", "Core stable: power secured."), true),
    !result,
  );
  const hot = temp > BAND[1];
  return (
    <GameCard
      kicker={tr("Mini reactor de fisión", "Mini fission reactor")}
      title={tr("Estabiliza el núcleo", "Stabilize the core")}
      hint={tr(
        "Mueve las barras de control (arrastra o ↑/↓): más dentro enfría. Mantén el núcleo en la franja.",
        "Move the control rods (drag or ↑/↓): deeper cools. Keep the core in the band.",
      )}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
    >
      <div className="reactor">
        <div className={`core${hot ? " hot" : temp < BAND[0] ? " cold" : ""}`}>
          <div className="core-band" style={{ bottom: `${BAND[0] * 100}%`, height: `${(BAND[1] - BAND[0]) * 100}%` }} />
          <div className="core-level" style={{ height: `${temp * 100}%` }} />
        </div>
        <label className="rods">
          {tr("Barras", "Rods")} <span className="num">{Math.round(rods * 100)} %</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(rods * 100)}
            onChange={(e) => setRods(Number(e.target.value) / 100)}
            disabled={Boolean(result)}
          />
        </label>
      </div>
    </GameCard>
  );
}
