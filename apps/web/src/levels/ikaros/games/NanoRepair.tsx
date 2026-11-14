import { useMemo, useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useCountdown, useFinish, useKeys, useArmed } from "../../../game/minigame";

const SECONDS = 8;
const LETTERS = ["A", "S", "D", "F", "J", "K", "L"];

/**
 * ⚗ Nanotecnología: la CME abrió grietas en el casco y cada una muestra una letra. Pulsar la
 * letra suelta un enjambre de nanobots que la sella. Hay que sellar casi todas a tiempo.
 */
export function NanoRepair({ onDone, seed }: { onDone: (r: Rating) => void; seed: number }) {
  const cracks = useMemo(
    () =>
      LETTERS.map((letter, i) => {
        const a = ((seed * 7 + i * 131) % 360) * (Math.PI / 180);
        const r = 0.16 + (((seed * 13 + i * 71) % 100) / 100) * 0.26;
        return { id: i, letter, x: 50 + Math.cos(a) * r * 100, y: 50 + Math.sin(a) * r * 100, rot: (i * 47) % 180 };
      }),
    [seed],
  );
  const [fixed, setFixed] = useState<Set<number>>(new Set());
  const live = useRef(new Set<number>());
  const misses = useRef(0);
  const { result, finish } = useFinish(onDone);
  const { armed, pre } = useArmed();
  const need = LETTERS.length - 1;

  const seal = (id: number) => {
    if (result || !armed || live.current.has(id)) return;
    const next = new Set(live.current).add(id);
    live.current = next;
    setFixed(next);
    if (next.size === LETTERS.length) {
      finish(
        true,
        tr("Casco sellado: los nanobots aguantan la CME.", "Hull sealed: the nanobots hold off the CME."),
        misses.current === 0 ? "perfect" : "good",
      );
    }
  };
  useKeys((k) => {
    const i = LETTERS.indexOf(k.toUpperCase());
    if (i >= 0) seal(i);
    else if (k.length === 1) misses.current++;
  });
  const left = useCountdown(
    SECONDS,
    () => {
      const n = live.current.size;
      if (n >= need) finish(true, tr("Casco casi sellado: aguanta.", "Hull nearly sealed: it holds."), "good");
      else finish(false, tr("El plasma entró por las grietas.", "Plasma got in through the cracks."), "fail");
    },
    !result && armed,
  );
  return (
    <GameCard
      pre={pre}
      kicker={tr("Eyección de masa coronal", "Coronal mass ejection")}
      title={tr("Repara con nanobots", "Repair with nanobots")}
      hint={tr("Pulsa la letra de cada grieta para sellarla.", "Press each crack's letter to seal it.")}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
      lesson={lesson("nanobots")}
      keys={
        <KeyHints>
          <KeyHint keys={LETTERS}>{tr("sellar", "seal")}</KeyHint>
        </KeyHints>
      }
    >
      <div className="hull">
        <div className="hull-plate" />
        {cracks.map((c) => (
          <button
            key={c.id}
            className={`crack${fixed.has(c.id) ? " sealed" : ""}`}
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
            onClick={() => seal(c.id)}
            disabled={fixed.has(c.id) || Boolean(result)}
            aria-label={tr(`Grieta ${c.letter}`, `Crack ${c.letter}`)}
          >
            <i style={{ transform: `rotate(${c.rot}deg)` }} />
            <kbd>{c.letter}</kbd>
          </button>
        ))}
        <span className="hull-count num">
          {fixed.size} / {LETTERS.length}
        </span>
      </div>
    </GameCard>
  );
}
