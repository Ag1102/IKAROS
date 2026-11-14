import { BUDGET_USD_M, LAUNCHERS, PARTS, checkDesign, type Design, type Part, type Slot } from "./catalog";
import { formatNumber } from "../ui/format";

const SLOT_TITLE: Record<Slot, string> = {
  shield: "Escudo térmico (uno)",
  power: "Energía durante el encuentro",
  extra: "Sistemas adicionales",
};

function Badge({ part }: { part: Part }) {
  return part.origin === "theoretical" ? (
    <span className="tag tag-theory" title="Tecnología teórica o ficticia">
      ⚗ teórico
    </span>
  ) : (
    <span className="tag tag-real" title={part.source}>
      paper
    </span>
  );
}

export function Hangar({
  design,
  onChange,
  onLaunch,
  onExit,
  onCredits,
  onGlossary,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onLaunch: () => void;
  onExit: () => void;
  onCredits: () => void;
  onGlossary: () => void;
}) {
  const check = checkDesign(design);
  const toggle = (p: Part) => {
    const has = design.parts.includes(p.id);
    let next = design.parts.filter((id) => id !== p.id);
    if (!has) {
      if (p.slot === "shield") next = next.filter((id) => PARTS.find((x) => x.id === id)?.slot !== "shield");
      next.push(p.id);
    }
    onChange({ ...design, parts: next });
  };
  const pct = (v: number, max: number) => Math.min(100, (v / Math.max(1, max)) * 100);

  return (
    <div className="hangar">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">IKAROS</span>
          <span className="brand-sub">Nivel 3 · Hangar</span>
        </div>
        <div />
        <div />
        <div className="scale">
          <button onClick={onGlossary}>Glosario</button>
          <button onClick={onCredits}>Créditos</button>
          <button onClick={onExit}>Menú</button>
        </div>
      </header>

      <main className="hangar-body">
        <section className="panel">
          <h2>Componentes</h2>
          <p className="stage">
            Etapa de diseño: estudio de compromisos (CML 3). Al lanzar, el diseño queda fijo como diseño puntual (CML
            4).
          </p>
          <p className="note">
            Masas y costos son valores de prueba. Los conceptos «paper» vienen de Landis et al., AIAA 2008-5712; lo
            marcado ⚗ es teórico.
          </p>
          {(["shield", "power", "extra"] as Slot[]).map((slot) => (
            <fieldset key={slot} className="slot">
              <legend>{SLOT_TITLE[slot]}</legend>
              {PARTS.filter((p) => p.slot === slot).map((p) => {
                const on = design.parts.includes(p.id);
                return (
                  <label key={p.id} className={on ? "part on" : "part"}>
                    <input
                      type={slot === "shield" ? "radio" : "checkbox"}
                      name={slot}
                      checked={on}
                      onChange={() => toggle(p)}
                    />
                    <span className="pn">
                      {p.name} <Badge part={p} />
                    </span>
                    <span className="num">
                      {formatNumber(p.mass_kg)} kg · {formatNumber(p.cost_usd_m)} M$
                    </span>
                    <span className="pd">{p.note}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </section>

        <section className="panel summary">
          <h2>Lanzamiento</h2>
          <label htmlFor="launcher" className="note">
            Lanzador
          </label>
          <select
            id="launcher"
            value={design.launcher}
            onChange={(e) => onChange({ ...design, launcher: e.target.value })}
          >
            {LAUNCHERS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {formatNumber(l.capacity_kg)} kg · {formatNumber(l.cost_usd_m)} M$
              </option>
            ))}
          </select>

          <div className="meter">
            <span>Masa</span>
            <span className="num">
              {formatNumber(check.mass_kg)} / {formatNumber(check.capacity_kg)} kg
            </span>
            <div className="bar">
              <div
                className={check.mass_kg > check.capacity_kg ? "over" : ""}
                style={{ width: `${pct(check.mass_kg, check.capacity_kg)}%` }}
              />
            </div>
          </div>
          <div className="meter">
            <span>Costo</span>
            <span className="num">
              {formatNumber(check.cost_usd_m)} / {formatNumber(BUDGET_USD_M)} M USD
            </span>
            <div className="bar">
              <div
                className={check.cost_usd_m > BUDGET_USD_M ? "over" : ""}
                style={{ width: `${pct(check.cost_usd_m, BUDGET_USD_M)}%` }}
              />
            </div>
          </div>
          <div className="meter">
            <span>Potencia en el encuentro</span>
            <span className="num">
              {formatNumber(check.power_w)} / {formatNumber(check.required_w)} W
            </span>
            <div className="bar">
              <div
                className={check.power_w < check.required_w ? "over" : ""}
                style={{ width: `${pct(check.power_w, check.required_w)}%` }}
              />
            </div>
          </div>

          {check.problems.length > 0 ? (
            <ul className="problems">
              {check.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="ok-text">Diseño listo para el lanzamiento.</p>
          )}
          <button className="primary" disabled={check.problems.length > 0} onClick={onLaunch}>
            Lanzar misión
          </button>
        </section>
      </main>
    </div>
  );
}
