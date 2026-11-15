import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ContentEntry,
  GlossaryEntry,
  MissionReport,
  ScenarioDefinition,
  SimState,
} from "@ikaros/contracts";
import { createSimulation, scenario } from "../packages/sim/src/index";
import { pickAll, playLevel1, playLevel3 } from "../packages/sim/src/autopilot";

const root = join(__dirname, "..");
const read = <T>(p: string) => JSON.parse(readFileSync(join(root, p), "utf8")) as T;

/** Rastro de español: tildes, eñes o palabras de enlace muy frecuentes. */
const SPANISH = /[áéíóúñ¿¡]|\b(el|la|los|las|del|que|con|sin|por|para|una|está)\b/;

function expectEnglish(where: string, text: string | undefined) {
  if (!text) return;
  expect(SPANISH.test(text), `${where}: "${text}"`).toBe(false);
}

function checkRun(where: string, state: SimState, report: MissionReport) {
  for (const ev of state.events) {
    expectEnglish(`${where} evento`, ev.text);
    expectEnglish(`${where} fuente`, ev.source);
    for (const c of ev.choices ?? []) {
      expectEnglish(`${where} opción`, c.label);
      expectEnglish(`${where} opción`, c.detail);
    }
  }
  for (const c of report.causes) {
    expectEnglish(`${where} causa`, c.text);
    expectEnglish(`${where} causa`, c.source);
  }
  for (const a of report.advice ?? []) expectEnglish(`${where} consejo`, a);
  for (const c of report.comparisons ?? []) {
    for (const v of [c.mission, c.metric, c.ours, c.theirs, c.source])
      expectEnglish(`${where} comparación`, v);
  }
}

describe("versión en inglés: contenido", () => {
  it("cada texto del asistente tiene traducción", () => {
    const es = read<ContentEntry[]>("content/assistant.json");
    const en = read<{ id: string; text: string; source: string }[]>("content/en/assistant.json");
    expect(en.map((e) => e.id).sort()).toEqual(es.map((e) => e.id).sort());
    for (const e of en) {
      expectEnglish(e.id, e.text);
      expectEnglish(e.id, e.source);
    }
  });

  it("el glosario tiene las mismas entradas", () => {
    const es = read<GlossaryEntry[]>("content/glossary.json");
    const en = read<GlossaryEntry[]>("content/en/glossary.json");
    expect(en).toHaveLength(es.length);
    for (const g of en) expectEnglish(g.term, `${g.term} ${g.definition} ${g.source}`);
  });

  for (const file of readdirSync(join(root, "data/scenarios")).filter((f) => f.endsWith(".json"))) {
    it(`scenarios/${file}: ranuras, componentes, textos y fuentes en inglés`, () => {
      const es = read<ScenarioDefinition>(`data/scenarios/${file}`);
      const en = scenario(es.id, "en");
      expect(en.components.map((c) => c.id)).toEqual(es.components.map((c) => c.id));
      for (const t of [en.title, en.subtitle, ...en.briefing, ...en.objectives]) expectEnglish(file, t);
      for (const s of en.slots) expectEnglish(`${file} ranura ${s.id}`, s.label);
      for (const c of en.components) {
        expectEnglish(`${file} ${c.id}`, `${c.name} ${c.description} ${c.source}`);
        expect(c.mass_kg).toBe(es.components.find((x) => x.id === c.id)!.mass_kg);
      }
      for (const [k, p] of Object.entries(en.params)) expectEnglish(`${file} ${k}`, p.source);
    });
  }

  it("el español sigue siendo el idioma por defecto", () => {
    expect(scenario("level1-repair").title).toMatch(/^Nivel 1/);
    const sim = createSimulation();
    expect(sim.load("level1-repair", 1).events[0]?.text).toMatch(/acóplate/);
  });
});

describe("versión en inglés: motor", () => {
  it("nivel 1 completo sin textos en español", () => {
    const { state, report } = playLevel1({ lang: "en" });
    expect(report.outcome).toBe("success");
    checkRun("nivel 1", state, report);
  });

  it("nivel 1 fallido sin textos en español", () => {
    const { state, report } = playLevel1({ lang: "en", aim_m_s: 400 });
    checkRun("nivel 1", state, report);
  });

  it("nivel 2 completo sin textos en español", () => {
    const sim = createSimulation({ lang: "en" });
    sim.load("level2-leo", 3);
    pickAll(sim, {
      objective: "obj-fires",
      instrument: "inst-thermal",
      power: "pwr-small",
      battery: "bat-small",
      comms: "com-sband",
      orbit: "orb-equatorial",
      launcher: "lv-electron",
    });
    let s = sim.act({ type: "launch" });
    for (let i = 0; i < 400 && s.phase !== "complete"; i++) s = sim.step(900);
    checkRun("nivel 2", s, sim.report());
  });

  it("nivel 3 con todas las decisiones sin textos en español", () => {
    const picks = {
      energy: "stirling",
      shield: "shield-cc",
      defense: "hts-field",
      science: "sensors-capsule",
    };
    for (const cme of ["hts", "safe-mode"]) {
      const { state, report } = playLevel3({ lang: "en", picks, cme, downlink: true, seed: 11 });
      checkRun(`nivel 3 (${cme})`, state, report);
    }
    const { state, report } = playLevel3({ lang: "en", flybys: false, stow: false, retract: false });
    checkRun("nivel 3 sin maniobras", state, report);
  });
});
