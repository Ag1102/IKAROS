import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ScenarioId, SimEvent } from "@ikaros/contracts";
import atlasJson from "../../../../content/atlas.json";
import { tr, useLang, type Lang } from "../i18n";
import { isMuted, setMuted, speak, stop } from "./voice";
import type { Gesture } from "./Hologram";

const Hologram = lazy(() => import("./Hologram"));

export interface AtlasLine {
  id: string;
  scenario: ScenarioId;
  /** "prologue", "hangar" o un disparador del motor (SimEvent.trigger). */
  trigger: string;
  kind: "prologue" | "guide" | "tip" | "fact";
  es: string;
  en: string;
  source?: string;
}

export const ATLAS_LINES = atlasJson as AtlasLine[];

const textOf = (line: AtlasLine, lang: Lang) => (lang === "en" ? line.en : line.es);

/** Gesto del holograma según el tipo de línea: señala lo que hay que hacer, advierte o explica. */
const gestureOf = (line: AtlasLine | null | undefined, speaking: boolean): Gesture => {
  if (!line) return "idle";
  if (line.kind === "guide") return "point";
  if (line.kind === "tip") return "warn";
  return speaking ? "explain" : "idle";
};

function Holo(props: { gesture: Gesture; visible: boolean; warn?: boolean; className: string }) {
  return (
    <Suspense fallback={<div className={props.className} />}>
      <Hologram {...props} />
    </Suspense>
  );
}

/** Escribe el texto letra a letra; con menos movimiento lo muestra completo. */
function useTypewriter(text: string): string {
  // La cuenta va ligada a su texto: al cambiar de línea no se ve un cuadro con la longitud anterior.
  const [st, setSt] = useState({ text, n: 0 });
  const n = st.text === text ? st.n : 0;
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      setSt({ text, n: text.length });
      return;
    }
    setSt({ text, n: 0 });
    const id = window.setInterval(() => {
      setSt((v) => {
        const cur = v.text === text ? v.n : 0;
        if (cur >= text.length) window.clearInterval(id);
        return { text, n: Math.min(text.length, cur + 1) };
      });
    }, 28);
    return () => window.clearInterval(id);
  }, [text]);
  return text.slice(0, n);
}

function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      className="atlas-btn"
      onClick={(e) => {
        onToggle();
        // Sin foco: así Enter y Espacio siguen llegando al juego, no a este botón.
        e.currentTarget.blur();
      }}
      aria-pressed={muted}
      title={muted ? tr("Activar la voz de Atlas", "Turn Atlas's voice on") : tr("Silenciar a Atlas", "Mute Atlas")}
    >
      {muted ? tr("Voz: no", "Voice: off") : tr("Voz: sí", "Voice: on")}
    </button>
  );
}

function Prologue({
  lines,
  lang,
  muted,
  onToggleMute,
  onDone,
}: {
  lines: AtlasLine[];
  lang: Lang;
  muted: boolean;
  onToggleMute: () => void;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const line = lines[i];
  const text = line ? textOf(line, lang) : "";
  const shown = useTypewriter(text);
  const last = i >= lines.length - 1;

  const next = useCallback(() => {
    stop();
    if (last) onDone();
    else setI((v) => v + 1);
  }, [last, onDone]);

  useEffect(() => {
    if (!line) return;
    let alive = true;
    setSpeaking(true);
    speak(line.id, textOf(line, lang), lang).then(() => {
      if (!alive) return;
      setSpeaking(false);
    });
    return () => {
      alive = false;
    };
  }, [line, lang]);

  // Al terminar de hablar pasa sola a la siguiente línea (la última espera al jugador).
  useEffect(() => {
    if (speaking || last || !line) return;
    const id = window.setTimeout(next, 900);
    return () => window.clearTimeout(id);
  }, [speaking, last, line, next]);

  // Enter/Espacio avanzan y Escape salta. Se escucha en captura y no se deja pasar la tecla:
  // así el hangar o un minijuego no reciben también ese Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        stop();
        onDone();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        next();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, onDone]);

  if (!line) return null;
  return (
    <div className="atlas-prologue" role="dialog" aria-modal="true" aria-labelledby="atlas-prologue-h">
      <div className="atlas-prologue-card">
        <Holo gesture={speaking ? "explain" : "idle"} visible className="atlas-holo large" />
        <p className="atlas-kicker" id="atlas-prologue-h">
          ATLAS · {tr("Control de misión", "Mission control")}
        </p>
        <p className="atlas-prologue-text" aria-live="polite">
          {shown}
          <span className="atlas-caret" aria-hidden="true" />
        </p>
        <div className="atlas-dots" aria-hidden="true">
          {lines.map((l, k) => (
            <i key={l.id} className={k === i ? "on" : k < i ? "done" : ""} />
          ))}
        </div>
        <div className="atlas-actions">
          <MuteButton muted={muted} onToggle={onToggleMute} />
          <button
            className="atlas-btn"
            onClick={() => {
              stop();
              onDone();
            }}
          >
            {tr("Saltar", "Skip")}
          </button>
          <button className="launch-cta atlas-next" onClick={next} autoFocus>
            {last ? tr("Comenzar misión", "Start mission") : tr("Siguiente", "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Comms({
  line,
  lang,
  muted,
  onToggleMute,
  onClose,
}: {
  line: AtlasLine;
  lang: Lang;
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const shown = useTypewriter(textOf(line, lang));
  const label =
    line.kind === "fact"
      ? tr("Dato curioso", "Fun fact")
      : line.kind === "tip"
        ? tr("Ten en cuenta", "Keep in mind")
        : tr("Qué hacer", "What to do");
  return (
    <div className="atlas-body">
      <div className="atlas-head">
        <p className="atlas-kicker">
          ATLAS · <span>{label}</span>
        </p>
        <MuteButton muted={muted} onToggle={onToggleMute} />
        <button className="atlas-btn" onClick={onClose} aria-label={tr("Cerrar", "Close")}>
          ✕
        </button>
      </div>
      <p className="atlas-text">{shown}</p>
      {line.source && <p className="fact-src">— {line.source}</p>}
    </div>
  );
}

/**
 * Atlas, el control de misión: un prólogo al entrar al nivel y avisos con voz cuando el motor
 * emite un evento con línea en content/atlas.json (cada línea suena una vez por partida).
 * El estado vive en la pantalla del nivel, así sobrevive al paso del hangar al vuelo.
 */
export function useAtlas(scenario: ScenarioId, events: SimEvent[]): ReactNode {
  const lang = useLang();
  const [muted, setMutedState] = useState(isMuted());
  const prologueLines = ATLAS_LINES.filter((l) => l.scenario === scenario && l.trigger === "prologue");
  const [inPrologue, setInPrologue] = useState(prologueLines.length > 0);
  const [queue, setQueue] = useState<AtlasLine[]>([]);
  const [current, setCurrent] = useState<AtlasLine | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const spoken = useRef(new Set<string>());
  const seen = useRef(0);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const enqueue = useCallback(
    (trigger: string) => {
      const line = ATLAS_LINES.find((l) => l.scenario === scenario && l.trigger === trigger);
      if (!line || spoken.current.has(line.id)) return;
      spoken.current.add(line.id);
      // Solo las dos más recientes: a alta velocidad de tiempo los avisos viejos ya no sirven.
      setQueue((q) => [...q, line].slice(-2));
    },
    [scenario],
  );

  // Eventos nuevos del motor. Si la lista se acorta, el nivel se reinició: Atlas vuelve a empezar.
  useEffect(() => {
    if (events.length < seen.current) {
      spoken.current.clear();
      seen.current = 0;
      stop();
      setCurrent(null);
      setQueue([]);
      if (!inPrologue) enqueue("hangar");
    }
    const fresh = events.slice(seen.current);
    seen.current = events.length;
    if (inPrologue) return;
    for (const ev of fresh) if (ev.trigger) enqueue(ev.trigger);
  }, [events, inPrologue, enqueue]);

  // Una línea a la vez: suena, se queda unos segundos y da paso a la siguiente.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next!);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    let alive = true;
    let timer = 0;
    setSpeaking(true);
    speak(current.id, textOf(current, lang), lang).then(() => {
      if (!alive) return;
      setSpeaking(false);
      timer = window.setTimeout(() => alive && setCurrent(null), 3500);
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [current, lang]);

  useEffect(() => () => stop(), []);

  if (inPrologue) {
    return (
      <Prologue
        lines={prologueLines}
        lang={lang}
        muted={muted}
        onToggleMute={toggleMute}
        onDone={() => {
          setInPrologue(false);
          enqueue("hangar");
        }}
      />
    );
  }
  // El holograma queda montado (oculto entre líneas) para no crear un lienzo 3D en cada aviso.
  return (
    <aside
      className={`atlas-comms${current ? ` kind-${current.kind}` : " idle"}`}
      aria-live="polite"
      aria-label="Atlas"
      aria-hidden={!current}
    >
      <Holo
        gesture={gestureOf(current, speaking)}
        visible={Boolean(current)}
        warn={current?.kind === "tip"}
        className="atlas-holo"
      />
      {current && (
        <Comms
          key={current.id}
          line={current}
          lang={lang}
          muted={muted}
          onToggleMute={toggleMute}
          onClose={() => {
            stop();
            setCurrent(null);
          }}
        />
      )}
    </aside>
  );
}
