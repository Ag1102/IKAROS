import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MissionReport, MissionSegment } from "@ikaros/contracts";
import { formatNumber } from "./format";
import { tr } from "../i18n";

/** Cuenta animada hasta `target` en ~1,2 s (inmediata si se pide menos movimiento). */
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target]);
  return value;
}

const segments = (): { id: MissionSegment; label: string }[] => [
  { id: "launch", label: tr("Lanzamiento", "Launch") },
  { id: "space", label: tr("Espacio", "Space") },
  { id: "ground", label: tr("Tierra", "Ground") },
  { id: "user", label: tr("Usuario", "User") },
];

const outcome = (o: MissionReport["outcome"]) =>
  ({
    success: tr("MISIÓN CUMPLIDA", "MISSION ACCOMPLISHED"),
    partial: tr("MISIÓN PARCIAL", "PARTIAL MISSION"),
    failure: tr("MISIÓN FALLIDA", "MISSION FAILED"),
  })[o];

/**
 * Informe post-misión del motor, ordenado por los cuatro segmentos de una misión NASA. Se abre
 * a pantalla completa sobre la escena; se puede cerrar para seguir mirándola.
 */
export function Report({ report, onRestart }: { report: MissionReport; onRestart: () => void }) {
  const [open, setOpen] = useState(true);
  const score = useCountUp(report.score);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) {
    return (
      <div className="report-mini">
        <p className={report.outcome === "failure" ? "neg-text" : "ok-text"}>
          {outcome(report.outcome)} · <span className="num">{formatNumber(report.score)}</span>
        </p>
        <button className="primary" onClick={() => setOpen(true)}>
          {tr("Ver informe", "View report")}
        </button>
      </div>
    );
  }
  return createPortal(
    <div className={`debrief debrief-${report.outcome}`} role="dialog" aria-modal="true" aria-labelledby="debrief-h">
      <div className="report">
        <p className="debrief-kicker">{tr("Informe post-misión", "Post-mission report")}</p>
        <h2 id="debrief-h" className="debrief-outcome">
          {outcome(report.outcome)}
        </h2>
        <p className="debrief-score">
          {tr("Puntuación", "Score")} <span className="num">{formatNumber(score)}</span>
        </p>
        <ul className="segments" aria-label={tr("Informe por segmentos de misión", "Report by mission segment")}>
          {segments().map((seg, i) => {
            const causes = report.causes.filter((c) => (c.segment ?? "space") === seg.id);
            return (
              <li key={seg.id} style={{ animationDelay: `${300 + i * 120}ms` }}>
                <b>{seg.label}</b>
                {causes.length === 0 ? (
                  <span className="note">{tr("Sin observaciones.", "No remarks.")}</span>
                ) : (
                  causes.map((c, i) => (
                    <span key={i} className="cause">
                      {c.text}
                      {c.source && <span className="fact-src"> ({c.source})</span>}
                      {c.origin === "theoretical" && <span className="tag tag-theory">⚗</span>}
                    </span>
                  ))
                )}
              </li>
            );
          })}
        </ul>
        {report.advice && report.advice.length > 0 && (
          <>
            <h3 className="sub">{tr("Qué cambiar la próxima vez", "What to change next time")}</h3>
            <ul className="causes">
              {report.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        {report.comparisons && report.comparisons.length > 0 && (
          <>
            <h3 className="sub">{tr("Comparación con misiones reales", "Comparison with real missions")}</h3>
            <table className="mini compare">
              <thead>
                <tr>
                  <th>{tr("Misión", "Mission")}</th>
                  <th>{tr("Dato", "Metric")}</th>
                  <th>{tr("Tu misión", "Your mission")}</th>
                  <th>Real</th>
                </tr>
              </thead>
              <tbody>
                {report.comparisons.map((c) => (
                  <tr key={c.mission + c.metric} title={c.source}>
                    <td>{c.mission}</td>
                    <td>{c.metric}</td>
                    <td className="num">{c.ours}</td>
                    <td className="num">{c.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="debrief-actions">
          <button className="launch-cta" onClick={onRestart}>
            {tr("Reiniciar nivel", "Restart level")}
          </button>
          <button className="scale-btn" onClick={() => setOpen(false)}>
            {tr("Ver la escena", "View the scene")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
