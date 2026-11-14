import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MissionReport, MissionSegment } from "@ikaros/contracts";
import { formatNumber } from "./format";

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

const SEGMENTS: { id: MissionSegment; label: string }[] = [
  { id: "launch", label: "Lanzamiento" },
  { id: "space", label: "Espacio" },
  { id: "ground", label: "Tierra" },
  { id: "user", label: "Usuario" },
];

const OUTCOME = { success: "MISIÓN CUMPLIDA", partial: "MISIÓN PARCIAL", failure: "MISIÓN FALLIDA" } as const;

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
          {OUTCOME[report.outcome]} · <span className="num">{formatNumber(report.score)}</span>
        </p>
        <button className="primary" onClick={() => setOpen(true)}>
          Ver informe
        </button>
      </div>
    );
  }
  return createPortal(
    <div className={`debrief debrief-${report.outcome}`} role="dialog" aria-modal="true" aria-labelledby="debrief-h">
      <div className="report">
        <p className="debrief-kicker">Informe post-misión</p>
        <h2 id="debrief-h" className="debrief-outcome">
          {OUTCOME[report.outcome]}
        </h2>
        <p className="debrief-score">
          Puntuación <span className="num">{formatNumber(score)}</span>
        </p>
        <ul className="segments" aria-label="Informe por segmentos de misión">
          {SEGMENTS.map((seg, i) => {
            const causes = report.causes.filter((c) => (c.segment ?? "space") === seg.id);
            return (
              <li key={seg.id} style={{ animationDelay: `${300 + i * 120}ms` }}>
                <b>{seg.label}</b>
                {causes.length === 0 ? (
                  <span className="note">Sin observaciones.</span>
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
            <h3 className="sub">Qué cambiar la próxima vez</h3>
            <ul className="causes">
              {report.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        {report.comparisons && report.comparisons.length > 0 && (
          <>
            <h3 className="sub">Comparación con misiones reales</h3>
            <table className="mini compare">
              <thead>
                <tr>
                  <th>Misión</th>
                  <th>Dato</th>
                  <th>Tu misión</th>
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
            Reiniciar nivel
          </button>
          <button className="scale-btn" onClick={() => setOpen(false)}>
            Ver la escena
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
