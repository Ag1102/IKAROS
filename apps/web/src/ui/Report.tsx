import type { MissionReport, MissionSegment } from "@ikaros/contracts";
import { formatNumber } from "./format";
import { tr } from "../i18n";

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

/** Informe post-misión del motor, ordenado por los cuatro segmentos de una misión NASA. */
export function Report({ report, onRestart }: { report: MissionReport; onRestart: () => void }) {
  return (
    <div className="report">
      <p className={report.outcome === "failure" ? "neg-text" : "ok-text"}>
        {outcome(report.outcome)} · {tr("Puntuación", "Score")}{" "}
        <span className="num">{formatNumber(report.score)}</span>
      </p>
      <ul className="segments" aria-label={tr("Informe por segmentos de misión", "Report by mission segment")}>
        {segments().map((seg) => {
          const causes = report.causes.filter((c) => (c.segment ?? "space") === seg.id);
          return (
            <li key={seg.id}>
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
                <th>{tr("Real", "Real")}</th>
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
      <button className="primary" onClick={onRestart}>
        {tr("Reiniciar nivel", "Restart level")}
      </button>
    </div>
  );
}
