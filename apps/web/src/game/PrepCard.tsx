import { tr } from "../i18n";

/** Tarjeta del hangar que abre el minijuego de preparación y muestra si ya está superado. */
export function PrepCard({
  title,
  ready,
  done,
  stars,
  onOpen,
}: {
  title: string;
  ready: boolean;
  done: boolean;
  stars?: number;
  onOpen: () => void;
}) {
  return (
    <div className={`prep-card${done ? " done" : ""}`}>
      <span className="prep-title">{title}</span>
      {done && stars !== undefined && <span className="stars small">{"★".repeat(stars)}</span>}
      <button className={done ? "scale-btn" : "primary"} disabled={!ready} onClick={onOpen}>
        {done ? tr("Repetir", "Replay") : tr("Jugar", "Play")}
      </button>
    </div>
  );
}
