import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { formatNumber } from "./format";
import { tr } from "../i18n";

/** Ranuras del hangar leídas del escenario del motor; cada elección va al motor con select-component. */
export function HangarSlots({
  def,
  state,
  act,
  onPreview,
}: {
  def: ScenarioDefinition;
  state: SimState;
  act: (a: PlayerAction) => void;
  /** Avisa qué opción se está mirando (ratón o teclado), para mostrarla montada en la vista previa. */
  onPreview?: (slot: string | null, componentId: string | null) => void;
}) {
  return (
    <>
      {def.slots.map((slot) => {
        const options = def.components.filter((c) => c.slot === slot.id);
        const current = state.selected?.[slot.id];
        const single = options.length === 1 && !slot.required;
        return (
          <fieldset key={slot.id} className="slot">
            <legend>
              {slot.label}
              {slot.required ? ` (${tr("obligatorio", "required")})` : ""}
            </legend>
            {options.map((c) => {
              const on = current === c.id;
              return (
                <label
                  key={c.id}
                  className={on ? "part on" : "part"}
                  onMouseEnter={() => onPreview?.(slot.id, c.id)}
                  onMouseLeave={() => onPreview?.(null, null)}
                  onFocus={() => onPreview?.(slot.id, c.id)}
                  onBlur={() => onPreview?.(null, null)}
                >
                  <input
                    type={single ? "checkbox" : "radio"}
                    name={slot.id}
                    checked={on}
                    onChange={() =>
                      act({ type: "select-component", slot: slot.id, componentId: on && single ? "none" : c.id })
                    }
                  />
                  <span className="pn">
                    {c.name}{" "}
                    {c.origin === "real" ? (
                      <span className="tag tag-real" title={c.source}>
                        {tr("real", "real")}
                      </span>
                    ) : (
                      <span className="tag tag-theory">⚗ {tr("teórico", "theoretical")}</span>
                    )}
                    {c.figures_origin === "theoretical" && (
                      <span
                        className="tag tag-test"
                        title={tr(
                          "Masa, costo y potencia son supuestos del juego",
                          "Mass, cost and power are game assumptions",
                        )}
                      >
                        {tr("cifras supuestas", "assumed figures")}
                      </span>
                    )}
                  </span>
                  <span className="num">
                    {formatNumber(c.mass_kg)} kg · {formatNumber(c.cost_usd_m)} M$
                    {c.power_w !== 0 && ` · ${c.power_w > 0 ? "+" : ""}${formatNumber(c.power_w)} W`}
                  </span>
                  <span className="pd">{c.description}</span>
                </label>
              );
            })}
            {!slot.required && !single && (
              <label className={current ? "part" : "part on"}>
                <input
                  type="radio"
                  name={slot.id}
                  checked={!current}
                  onChange={() => act({ type: "select-component", slot: slot.id, componentId: "none" })}
                />
                <span className="pn">{tr("Ninguno", "None")}</span>
              </label>
            )}
          </fieldset>
        );
      })}
    </>
  );
}
