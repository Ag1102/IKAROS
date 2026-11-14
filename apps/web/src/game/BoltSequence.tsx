import { useMemo, useRef, useState } from "react";
import { tr } from "../i18n";
import type { Rating } from "./score";
import { lesson } from "./learn";
import { KeyHint, KeyHints } from "./KeyHint";
import { GameCard, useCountdown, useFinish, useKeys, useArmed } from "./minigame";

const SECONDS = 12;
const BOLTS = 3;
const LENGTH = 5;
const ARROWS = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"] as const;
const GLYPH: Record<string, string> = { ArrowUp: "↑", ArrowRight: "→", ArrowDown: "↓", ArrowLeft: "←" };

/**
 * Caminata espacial: cada perno se aprieta repitiendo su secuencia de flechas, como los pasos
 * de un procedimiento de EVA. Un error reinicia el perno. Hay que apretar los 3 a tiempo.
 */
export function BoltSequence({ title, seed, onDone }: { title: string; seed: number; onDone: (r: Rating) => void }) {
  const seqs = useMemo(
    () =>
      Array.from({ length: BOLTS }, (_, b) =>
        Array.from({ length: LENGTH }, (_, i) => ARROWS[(seed * 31 + b * 17 + i * 7 + ((i * b) % 3)) % 4]!),
      ),
    [seed],
  );
  const [bolt, setBolt] = useState(0);
  const [pos, setPos] = useState(0);
  const [shake, setShake] = useState(false);
  const live = useRef({ bolt: 0, pos: 0, mistakes: 0 });
  const { result, finish } = useFinish(onDone);
  const { armed, pre } = useArmed();

  useKeys((k, e) => {
    if (result || !armed || !(ARROWS as readonly string[]).includes(k)) return;
    e.preventDefault();
    const st = live.current;
    const want = seqs[st.bolt]?.[st.pos];
    if (k === want) {
      st.pos++;
      if (st.pos >= LENGTH) {
        st.bolt++;
        st.pos = 0;
        if (st.bolt >= BOLTS) {
          finish(
            true,
            tr("¡Pernos apretados! La pieza queda fija.", "Bolts tightened! The part is secure."),
            st.mistakes === 0 ? "perfect" : "good",
          );
        }
      }
    } else {
      st.mistakes++;
      st.pos = 0;
      setShake(true);
      window.setTimeout(() => setShake(false), 250);
    }
    setBolt(st.bolt);
    setPos(st.pos);
  });
  const left = useCountdown(
    SECONDS,
    () =>
      finish(false, tr("Se acabó el pase: los pernos quedan flojos.", "The pass ended: the bolts stay loose."), "fail"),
    !result && armed,
  );
  const seq = seqs[Math.min(bolt, BOLTS - 1)] ?? [];
  return (
    <GameCard
      pre={pre}
      kicker={tr("Caminata espacial", "Spacewalk")}
      title={title}
      hint={tr("Repite la secuencia de cada perno con las flechas.", "Repeat each bolt's sequence with the arrows.")}
      left={left}
      total={SECONDS}
      result={result}
      lesson={lesson("eva")}
      keys={
        <KeyHints>
          <KeyHint keys={["↑", "→", "↓", "←"]}>{tr("apretar", "tighten")}</KeyHint>
        </KeyHints>
      }
    >
      <div className={`bolts${shake ? " shake" : ""}`}>
        <div className="bolt-count">
          {Array.from({ length: BOLTS }, (_, i) => (
            <span key={i} className={i < bolt ? "done" : i === bolt ? "now" : ""} />
          ))}
        </div>
        <div className="bolt-seq">
          {seq.map((k, i) => (
            <kbd key={i} className={i < pos ? "hit" : i === pos ? "next" : ""}>
              {GLYPH[k]}
            </kbd>
          ))}
        </div>
      </div>
    </GameCard>
  );
}
