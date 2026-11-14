import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import { GameCard, useCountdown, useFinish, useFrameLoop, useKeys } from "./common";

const SECONDS = 6;
const PER_TAP = 0.065;
const DECAY = 0.22;
const ZONE = [0.62, 0.82] as const;

/**
 * Rumbo a Venus: cada toque sube el empuje y el empuje cae solo. Gana quien lo deja en la
 * franja verde al acabar el tiempo: ni corto (no llega a Venus) ni de más (gasta Δv).
 */
export function TapBoost({
  windowN,
  total,
  onDone,
}: {
  windowN: number;
  total: number;
  onDone: (ok: boolean) => void;
}) {
  const [power, setPower] = useState(0.1);
  const p = useRef(0.1);
  const { result, finish } = useFinish(onDone);
  const running = !result;
  const tap = () => {
    if (!running) return;
    p.current = Math.min(1, p.current + PER_TAP);
    setPower(p.current);
  };
  useFrameLoop((dt) => {
    p.current = Math.max(0, p.current - DECAY * dt * (0.4 + p.current));
    setPower(p.current);
  }, running);
  useKeys((k, e) => {
    if (k === " " || k === "Enter") {
      e.preventDefault();
      tap();
    }
  });
  const left = useCountdown(
    SECONDS,
    () => {
      const ok = p.current >= ZONE[0] && p.current <= ZONE[1];
      finish(
        ok,
        ok
          ? tr("¡Empuje justo! Rumbo a Venus.", "Perfect thrust! Heading to Venus.")
          : p.current < ZONE[0]
            ? tr("Empuje corto: Venus pasa de largo.", "Too little thrust: Venus slips away.")
            : tr("Empuje de más: se gastó el Δv.", "Too much thrust: the Δv is wasted."),
        ok,
      );
    },
    running,
  );
  const inZone = power >= ZONE[0] && power <= ZONE[1];
  return (
    <GameCard
      kicker={tr(`Ventana de Venus ${windowN} de ${total}`, `Venus window ${windowN} of ${total}`)}
      title={tr("Potencia hacia Venus", "Power toward Venus")}
      hint={tr(
        "Toca rápido (o pulsa Espacio) y deja el empuje en la franja verde cuando acabe el tiempo.",
        "Tap fast (or press Space) and keep the thrust in the green band when time runs out.",
      )}
      left={left}
      total={SECONDS}
      result={result}
    >
      <div className="thrust">
        <div className="thrust-track">
          <i className="thrust-zone" style={{ bottom: `${ZONE[0] * 100}%`, height: `${(ZONE[1] - ZONE[0]) * 100}%` }} />
          <div className={`thrust-fill${inZone ? " in" : ""}`} style={{ height: `${power * 100}%` }} />
        </div>
        <button className="tap-btn" onPointerDown={tap} disabled={!running}>
          {tr("¡TAP!", "TAP!")}
        </button>
      </div>
    </GameCard>
  );
}
