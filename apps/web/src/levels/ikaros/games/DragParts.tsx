import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { ComponentOption, PlayerAction, ScenarioDefinition, SimState } from "@ikaros/contracts";
import { formatNumber } from "../../../ui/format";
import { tr } from "../../../i18n";

const DROP_ID = "ikaros-drop-zone";
/** Píxeles que hay que mover el puntero para que un toque cuente como arrastre y no como clic. */
const DRAG_THRESHOLD = 6;

interface Drag {
  part: ComponentOption;
  x: number;
  y: number;
  over: boolean;
}

/** Arrastre con eventos de puntero: funciona con ratón y con pantalla táctil. */
function usePartDrag(onDrop: (part: ComponentOption) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const start = useRef<{ part: ComponentOption; x: number; y: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const overZone = (x: number, y: number) => {
    const r = document.getElementById(DROP_ID)?.getBoundingClientRect();
    return Boolean(r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD) return;
      s.moved = true;
      document.body.classList.add("dragging-part");
      setDrag({ part: s.part, x: e.clientX, y: e.clientY, over: overZone(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      document.body.classList.remove("dragging-part");
      setDrag(null);
      // El navegador manda un clic justo después: se ignora si fue un arrastre.
      justDragged.current = Boolean(s?.moved);
      // Si el clic cae en otro elemento (la zona de la sonda), la marca no debe quedar viva.
      window.setTimeout(() => (justDragged.current = false), 0);
      if (s?.moved && overZone(e.clientX, e.clientY)) dropRef.current(s.part);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const begin = (part: ComponentOption) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    start.current = { part, x: e.clientX, y: e.clientY, moved: false };
  };
  /** true (una sola vez) si el gesto que acaba de terminar fue un arrastre. */
  const consumeDrag = () => {
    const was = justDragged.current;
    justDragged.current = false;
    return was;
  };
  return { drag, begin, consumeDrag };
}

/**
 * Piezas del hangar como cartas que se arrastran hasta la sonda. Soltar sobre la sonda (o hacer
 * clic) instala la pieza en su ranura; en las ranuras opcionales, clic sobre una instalada la quita.
 */
export function DragParts({
  def,
  state,
  act,
  onPreview,
}: {
  def: ScenarioDefinition;
  state: SimState;
  act: (a: PlayerAction) => void;
  onPreview?: (slot: string | null, id: string | null) => void;
}) {
  const { drag, begin, consumeDrag } = usePartDrag((part) =>
    act({ type: "select-component", slot: part.slot, componentId: part.id }),
  );
  return (
    <>
      {def.slots.map((slot) => {
        const parts = def.components.filter((c) => c.slot === slot.id);
        const current = state.selected?.[slot.id];
        return (
          <fieldset key={slot.id} className="slot">
            <legend>
              {slot.label}
              {slot.required ? ` · ${tr("obligatorio", "required")}` : ""}
            </legend>
            <div className="part-deck">
              {parts.map((c) => (
                <button
                  key={c.id}
                  className={`part-card${current === c.id ? " installed" : ""}${c.origin === "theoretical" ? " theory" : ""}${drag?.part.id === c.id ? " lifted" : ""}`}
                  onPointerDown={begin(c)}
                  onMouseEnter={() => onPreview?.(c.slot, c.id)}
                  onMouseLeave={() => onPreview?.(null, null)}
                  onClick={() => {
                    if (consumeDrag()) return;
                    act({
                      type: "select-component",
                      slot: c.slot,
                      componentId: current === c.id && !slot.required ? "none" : c.id,
                    });
                  }}
                  aria-pressed={current === c.id}
                  title={c.description}
                >
                  <span className="part-name">{c.name}</span>
                  <span className="part-stats num">
                    {formatNumber(c.mass_kg)} kg · {formatNumber(c.cost_usd_m)} M$
                    {c.power_w !== 0 && ` · ${c.power_w > 0 ? "+" : ""}${formatNumber(c.power_w)} W`}
                  </span>
                  <span className="part-state">
                    {current === c.id ? tr("Instalada", "Installed") : tr("Arrastra a la sonda", "Drag to the probe")}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      {drag &&
        createPortal(
          <div className={`part-ghost${drag.over ? " over" : ""}`} style={{ left: drag.x, top: drag.y }}>
            {drag.part.name}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Zona de la sonda donde se sueltan las piezas. */
export function DropZone({ installed, total }: { installed: number; total: number }) {
  return (
    <div id={DROP_ID} className="drop-zone">
      <span className="drop-label">
        {tr("Suelta aquí las piezas", "Drop parts here")}
        <small className="num">
          {installed} / {total} {tr("ranuras", "slots")}
        </small>
      </span>
    </div>
  );
}
