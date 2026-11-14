import { useRef, useState } from "react";
import { tr } from "../../../i18n";
import type { Rating } from "../../../game/score";
import { lesson } from "../../../game/learn";
import { KeyHint, KeyHints } from "../../../game/KeyHint";
import { GameCard, useCountdown, useFinish, useFrameLoop, useKeys, useArmed } from "../../../game/minigame";

const SECONDS = 12;
const RED = 0.9;
const COOLDOWN = 1.1;
const NAMES = () => [tr("Núcleo", "Core"), tr("Escudo", "Shield"), tr("Radiador", "Radiator")];

/**
 * ⚗ Enfriamiento del mini reactor: tres lazos de refrigerante se calientan a distinto ritmo.
 * 1, 2 y 3 abren la válvula de cada lazo (que tarda en volver a estar lista). Ningún lazo
 * debe llegar a la zona roja antes de que acabe el tiempo.
 */
export function CoolantLoops({ onDone }: { onDone: (r: Rating) => void }) {
  const [temps, setTemps] = useState([0.35, 0.3, 0.25]);
  const t = useRef([0.35, 0.3, 0.25]);
  const ready = useRef([0, 0, 0]);
  const [cool, setCool] = useState([0, 0, 0]);
  const peak = useRef(0);
  const rates = useRef([0.11, 0.075, 0.055]);
  const time = useRef(0);
  const { result, finish } = useFinish(onDone);
  const { armed, pre } = useArmed();

  const vent = (i: number) => {
    if (result || !armed || (ready.current[i] ?? 0) > 0) return;
    t.current = t.current.map((x, j) => (j === i ? Math.max(0, x - 0.45) : x));
    ready.current = ready.current.map((x, j) => (j === i ? COOLDOWN : x));
    setTemps(t.current);
  };
  useKeys((k) => {
    const i = ["1", "2", "3"].indexOf(k);
    if (i >= 0) vent(i);
  });
  useFrameLoop((dt) => {
    time.current += dt;
    // El calor sube más deprisa a medida que avanza la zambullida.
    const boost = 1 + time.current / SECONDS;
    t.current = t.current.map((x, i) => Math.min(1, x + (rates.current[i] ?? 0) * boost * dt));
    ready.current = ready.current.map((x) => Math.max(0, x - dt));
    setTemps(t.current);
    setCool(ready.current);
    peak.current = Math.max(peak.current, ...t.current);
    if (t.current.some((x) => x >= 1)) {
      finish(false, tr("¡Sobrecalentamiento! El reactor hace SCRAM.", "Overheat! The reactor SCRAMs."), "fail");
    }
  }, !result && armed);
  const left = useCountdown(
    SECONDS,
    () =>
      finish(
        true,
        tr("Lazos estables: el reactor aguanta la zambullida.", "Loops stable: the reactor holds through the dive."),
        peak.current < RED ? "perfect" : "good",
      ),
    !result && armed,
  );
  return (
    <GameCard
      pre={pre}
      kicker={tr("Kit Ikaros · reactor", "Ikaros kit · reactor")}
      title={tr("Enfría el mini reactor", "Cool the mini reactor")}
      hint={tr(
        "Abre la válvula de cada lazo antes de que llegue al rojo. Cada válvula tarda en recargar.",
        "Open each loop's valve before it reaches red. Each valve takes time to recharge.",
      )}
      left={left}
      total={SECONDS}
      theoretical
      result={result}
      lesson={lesson("cooling")}
      keys={
        <KeyHints>
          <KeyHint keys={["1", "2", "3"]}>{tr("abrir válvula", "open valve")}</KeyHint>
        </KeyHints>
      }
    >
      <div className="loops">
        {temps.map((v, i) => (
          <div key={i} className={`loop${v >= RED ? " hot" : ""}${(cool[i] ?? 0) > 0 ? " venting" : ""}`}>
            <div className="loop-tube">
              <i style={{ bottom: `${RED * 100}%` }} />
              <div style={{ height: `${v * 100}%` }} />
            </div>
            <kbd>{i + 1}</kbd>
            <span>{NAMES()[i]}</span>
          </div>
        ))}
      </div>
    </GameCard>
  );
}
