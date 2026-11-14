import type { MissionReport, MissionSegment } from "@ikaros/contracts";
import { formatNumber } from "./format";

const SEGMENTS: { id: MissionSegment; label: string }[] = [
  { id: "launch", label: "Lanzamiento" },
  { id: "space", label: "Espacio" },
  { id: "ground", label: "Tierra" },
  { id: "user", label: "Usuario" },
];

const OUTCOME = { success: "MISIÓN CUMPLIDA", partial: "MISIÓN PARCIAL", failure: "MISIÓN FALLIDA" } as const;

/** Informe post-misión del motor, ordenado por los cuatro segmentos de una misión NASA. */
export function Report({ report, onRestart }: { report: MissionReport; onRestart: () => void }) {
  return (
    <div className="report">
      <p className={report.outcome === "failure" ? "neg-text" : "ok-text"}>
        {OUTCOME[report.outcome]} · Puntuación <span className="num">{formatNumber(report.score)}</span>
      </p>
      <ul className="segments" aria-label="Informe por segmentos de misión">
        {SEGMENTS.map((seg) => {
          const causes = report.causes.filter((c) => (c.segment ?? "space") === seg.id);
          return (
            <li key={seg.id}>
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
      <button className="primary" onClick={onRestart}>
        Reiniciar nivel
      </button>
    </div>
  );
}
