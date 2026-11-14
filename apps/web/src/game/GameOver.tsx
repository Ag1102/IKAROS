import type { MissionReport } from "@ikaros/contracts";
import { Stars } from "./Stars";
import { tr } from "../i18n";

/** Cartel grande de fin de misión: gana o pierde, con el motivo principal en una frase. */
export function GameOver({ report }: { report: MissionReport }) {
  const stars = report.outcome === "success" ? 3 : report.outcome === "partial" ? 1 : 0;
  const reason = report.causes[0]?.text;
  return (
    <div className={`gameover gameover-${report.outcome}`} role="alert">
      <p className="gameover-title">
        {report.outcome === "failure"
          ? tr("Misión fallida", "Mission failed")
          : report.outcome === "partial"
            ? tr("Misión a medias", "Partial mission")
            : tr("¡Misión cumplida!", "Mission accomplished!")}
      </p>
      <Stars n={stars} />
      {report.outcome !== "success" && reason && <p className="gameover-reason">{reason}</p>}
    </div>
  );
}
