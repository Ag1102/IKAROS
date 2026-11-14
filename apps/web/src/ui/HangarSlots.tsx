import type { PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { formatNumber } from "./format";

/** Ranuras del hangar leídas del escenario del motor; cada elección va al motor con select-component. */
export function HangarSlots({
  def,
  state,
  act,
}: {
  def: ScenarioDefinition;
  state: SimState;
  act: (a: PlayerAction) => void;
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
              {slot.required ? " (obligatorio)" : ""}
            </legend>
            {options.map((c) => {
              const on = current === c.id;
              return (
                <label key={c.id} className={on ? "part on" : "part"}>
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
                        real
                      </span>
                    ) : (
                      <span className="tag tag-theory">⚗ teórico</span>
                    )}
                    {c.figures_origin === "theoretical" && (
                      <span className="tag tag-test" title="Masa, costo y potencia son supuestos del juego">
                        cifras supuestas
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
                <span className="pn">Ninguno</span>
              </label>
            )}
          </fieldset>
        );
      })}
    </>
  );
}
