import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContentEntry, GlossaryEntry, ScenarioDefinition, SourcedValue } from "@ikaros/contracts";

const root = join(__dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

function checkValue(where: string, key: string, v: SourcedValue) {
  expect(typeof v.value, `${where}:${key}.value`).toBe("number");
  expect(Number.isFinite(v.value), `${where}:${key}.value`).toBe(true);
  expect(v.unit, `${where}:${key}.unit`).toBeTruthy();
  expect(v.source, `${where}:${key}.source`).toBeTruthy();
  expect(v.retrieved, `${where}:${key}.retrieved`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(["real", "theoretical"], `${where}:${key}.origin`).toContain(v.origin);
}

describe("integridad de data/", () => {
  for (const file of readdirSync(join(root, "data")).filter((f) => f.endsWith(".json"))) {
    it(`${file}: cada valor con unidad, fuente, fecha y origen`, () => {
      const table = read(`data/${file}`) as Record<string, SourcedValue>;
      for (const [k, v] of Object.entries(table)) checkValue(file, k, v);
    });
  }

  for (const file of readdirSync(join(root, "data/scenarios")).filter((f) => f.endsWith(".json"))) {
    it(`scenarios/${file}: parámetros con fuente y componentes en ranuras válidas`, () => {
      const def = read(`data/scenarios/${file}`) as ScenarioDefinition;
      expect(`${def.id}.json`).toBe(file);
      for (const [k, v] of Object.entries(def.params)) checkValue(file, k, v);
      const slots = new Set(def.slots.map((s) => s.id));
      const ids = new Set<string>();
      for (const c of def.components) {
        expect(slots.has(c.slot), `${c.id} en ranura ${c.slot}`).toBe(true);
        expect(ids.has(c.id), `id repetido ${c.id}`).toBe(false);
        ids.add(c.id);
        expect(c.source).toBeTruthy();
        if (c.origin === "theoretical") expect(c.name.startsWith("⚗") || def.id !== "level3-ikaros").toBe(true);
      }
    });
  }
});

describe("integridad de content/", () => {
  it("cada texto del asistente lleva fuente y un disparador", () => {
    const entries = read("content/assistant.json") as ContentEntry[];
    const ids = new Set<string>();
    for (const e of entries) {
      expect(e.text && e.source && e.trigger, e.id).toBeTruthy();
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      if (e.origin === "theoretical") expect(e.text.startsWith("⚗"), e.id).toBe(true);
    }
  });

  it("cada término del glosario lleva fuente", () => {
    for (const g of read("content/glossary.json") as GlossaryEntry[]) {
      expect(g.term && g.definition && g.source).toBeTruthy();
    }
  });
});
