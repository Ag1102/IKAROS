import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useCountdown, useFinish, useFrameLoop, useKeys } from "../../../game/minigame";

const SECONDS = 6;
const PER_TAP = 0.065;
const DECAY = 0.22;
const ZONE = [0.62, 0.82] as const;
const CENTER = (ZONE[0] + ZONE[1]) / 2;

/**
 * Rumbo a Venus: cada pulsación de Espacio sube el empuje y el empuje cae solo. Gana quien lo
 * deja en la franja verde al acabar el tiempo: ni corto (no llega a Venus) ni de más (gasta Δv).
 */
export function TapBoost({ windowN, total, onDone }: { windowN: number; total: number; onDone: (r: Rating) => void }) {
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
      const v = p.current;
      const inZone = v >= ZONE[0] && v <= ZONE[1];
      const rating: Rating = !inZone ? "fail" : Math.abs(v - CENTER) <= 0.04 ? "perfect" : "good";
      finish(
        inZone,
        inZone
          ? tr("¡Empuje justo! Rumbo a Venus.", "Perfect thrust! Heading to Venus.")
          : v < ZONE[0]
            ? tr("Empuje corto: Venus pasa de largo.", "Too little thrust: Venus slips away.")
            : tr("Empuje de más: se gastó el Δv.", "Too much thrust: the Δv is wasted."),
        rating,
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
        "Pulsa Espacio una y otra vez; al acabar el tiempo el empuje debe quedar en la franja verde.",
        "Press Space again and again; when time runs out the thrust must sit in the green band.",
      )}
      left={left}
      total={SECONDS}
      result={result}
      lesson={lesson("venus-boost")}
      keys={
        <KeyHints>
          <KeyHint keys={[tr("Espacio", "Space")]}>{tr("empuje", "thrust")}</KeyHint>
        </KeyHints>
      }
    >
      <div className="thrust">
        <div className="thrust-track">
          <i className="thrust-zone" style={{ bottom: `${ZONE[0] * 100}%`, height: `${(ZONE[1] - ZONE[0]) * 100}%` }} />
          <div className={`thrust-fill${inZone ? " in" : ""}`} style={{ height: `${power * 100}%` }} />
        </div>
        <button className="tap-btn" onPointerDown={tap} disabled={!running}>
          {tr("Espacio", "Space")}
        </button>
      </div>
    </GameCard>
  );
}
