import type { PlayerAction, SimEvent } from "@ikaros/contracts";
import { formatElapsed } from "./format";
import { tr } from "../i18n";

export const openDecisions = (events: SimEvent[]) => events.filter((e) => e.choices && !e.resolved);

/** Decisiones abiertas del motor (ventanas de Venus, CME, eyección), con su plazo. */
export function Decisions({
  events,
  now_s,
  act,
}: {
  events: SimEvent[];
  now_s: number;
  act: (a: PlayerAction) => void;
}) {
  const open = openDecisions(events);
  if (open.length === 0) return null;
  return (
    <>
      {open.map((ev) => (
        <div key={ev.id} className="decision" role="group" aria-label={tr("Decisión pendiente", "Pending decision")}>
          <p className="decision-text">{ev.text}</p>
          {ev.deadline_s !== undefined && (
            <p className="note">
              {tr("Plazo", "Deadline")}: {formatElapsed(Math.max(0, ev.deadline_s - now_s))}{" "}
              {tr("de misión", "mission time")}.
            </p>
          )}
          <div className="choices">
            {ev.choices?.map((c) => (
              <button
                key={c.id}
                className="choice"
                onClick={() => act({ type: "resolve-event", eventId: ev.id, choice: c.id })}
              >
                <b>
                  {c.label} {c.origin === "theoretical" && <span className="tag tag-theory">⚗</span>}
                </b>
                <span>{c.detail}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
