import { useMemo, useRef, useState } from "react";
import { tr } from "../../../i18n";
import { GameCard, useCountdown, useFinish } from "./common";

const SECONDS = 8;
const CRACKS = 7;

/**
 * ⚗ Nanotecnología: la CME abrió grietas en el casco. Cada clic suelta un enjambre de
 * nanobots sobre una grieta. Hay que sellar casi todas antes de que llegue el plasma.
 */
export function NanoRepair({ onDone, seed }: { onDone: (ok: boolean) => void; seed: number }) {
  const cracks = useMemo(
    () =>
      Array.from({ length: CRACKS }, (_, i) => {
        const a = ((seed * 7 + i * 131) % 360) * (Math.PI / 180);
        const r = 0.18 + (((seed * 13 + i * 71) % 100) / 100) * 0.26;
        return { id: i, x: 50 + Math.cos(a) * r * 100, y: 50 + Math.sin(a) * r * 100, rot: (i * 47) % 180 };
      }),
    [seed],
  );
  const [fixed, setFixed] = useState<Set<number>>(new Set());
  const live = useRef(new Set<number>());
  const { result, finish } = useFinish(onDone);
  const need = CRACKS - 1;
  const seal = (id: number) => {
    if (result) return;
    const next = new Set(live.current).add(id);
    live.current = next;
    setFixed(next);
    if (next.size >= need) {
      finish(
        true,
        tr("Casco sellado: los nanobots aguantan la CME.", "Hull sealed: the nanobots hold off the CME."),
        true,
      );
    }
  };
  const left = useCountdown(
    SECONDS,
    () => finish(false, tr("El plasma entró por las grietas.", "Plasma got in through the cracks."), false),
    !result,
  );
  return (
    <GameCard
      kicker={tr("Eyección de masa coronal", "Coronal mass ejection")}
      title={tr("Repara con nanobots", "Repair with nanobots")}
      hint={tr(
        `Haz clic en las grietas para sellarlas: al menos ${need} de ${CRACKS}.`,
        `Click the cracks to seal them: at least ${need} of ${CRACKS}.`,
      )}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
    >
      <div className="hull">
        <div className="hull-plate" />
        {cracks.map((c) => (
          <button
            key={c.id}
            className={`crack${fixed.has(c.id) ? " sealed" : ""}`}
            style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translate(-50%, -50%) rotate(${c.rot}deg)` }}
            onClick={() => seal(c.id)}
            disabled={fixed.has(c.id) || Boolean(result)}
            aria-label={tr(`Grieta ${c.id + 1}`, `Crack ${c.id + 1}`)}
          />
        ))}
        <span className="hull-count num">
          {fixed.size} / {CRACKS}
        </span>
      </div>
    </GameCard>
  );
}
