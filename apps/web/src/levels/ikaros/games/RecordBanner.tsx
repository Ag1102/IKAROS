import { useEffect, useRef } from "react";
import { tr } from "../../../i18n";
import { formatNumber } from "../../../ui/format";
import { lesson } from "../../../game/learn";

/**
 * El momento de hacer historia: Ikaros pasa la marca de Parker Solar Probe. Se compara la
 * distancia actual con el récord real y se sigue con Enter (o solo, a los 6 s).
 */
export function RecordBanner({
  distance_rsun,
  speed_km_s,
  parker_rsun,
  dive,
  onDone,
}: {
  distance_rsun: number;
  speed_km_s: number;
  parker_rsun: number;
  dive: boolean;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), 6000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        done.current();
      }
    };
    const armed = window.setTimeout(() => window.addEventListener("keydown", onKey), 600);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(armed);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const times = parker_rsun / Math.max(distance_rsun, 1e-6);
  const fact = lesson("record");
  return (
    <section className="record-banner" role="status" aria-live="assertive">
      <span className="game-kicker">{tr("Ikaros hace historia", "Ikaros makes history")}</span>
      <h2>{tr("¡Récord histórico!", "Historic record!")}</h2>
      <div className="record-compare">
        <div>
          <span>Ikaros</span>
          <b className="num">{formatNumber(distance_rsun, 2)} R☉</b>
          <small className="num">{formatNumber(speed_km_s, 0)} km/s</small>
        </div>
        <div className="vs">vs</div>
        <div>
          <span>Parker Solar Probe</span>
          <b className="num">{formatNumber(parker_rsun, 2)} R☉</b>
          <small className="num">192 km/s</small>
        </div>
      </div>
      <p className="record-times">
        {dive
          ? tr(
              `⚗ ${formatNumber(times, 1)} veces más cerca que Parker, gracias al reactor, su enfriamiento, el campo magnético y los nanobots.`,
              `⚗ ${formatNumber(times, 1)} times closer than Parker, thanks to the reactor, its cooling, the magnetic field and the nanobots.`,
            )
          : tr(
              "Más cerca del Sol que ninguna nave de la historia.",
              "Closer to the Sun than any spacecraft in history.",
            )}
      </p>
      <p className="game-lesson">
        <span className="game-lesson-tag">{tr("Dato", "Fact")}</span> {fact.text}{" "}
        <span className="fact-src">— {fact.source}</span>
      </p>
      <p className="game-next">
        <kbd>Enter</kbd> {tr("seguir", "continue")}
      </p>
    </section>
  );
}
