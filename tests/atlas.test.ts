import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

interface AtlasLine {
  id: string;
  scenario: string;
  trigger: string;
  kind: string;
  es: string;
  en: string;
  source?: string;
}

const root = join(__dirname, "..");
const lines = JSON.parse(readFileSync(join(root, "content/atlas.json"), "utf8")) as AtlasLine[];
const scenarios = ["level1-repair", "level3-ikaros"];

/** Todo el código del motor, para comprobar que cada disparador existe de verdad. */
const engine = readdirSync(join(root, "packages/sim/src/levels"))
  .map((f) => readFileSync(join(root, "packages/sim/src/levels", f), "utf8"))
  .join("\n");

const SPANISH = /[áéíóúñ¿¡]|\b(el|la|los|las|del|que|con|sin|por|para|una|está)\b/;

describe("Atlas: guion", () => {
  it("ids únicos y textos en los dos idiomas", () => {
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    for (const l of lines) {
      expect(l.es.trim(), l.id).not.toBe("");
      expect(l.en.trim(), l.id).not.toBe("");
      expect(SPANISH.test(l.en), `${l.id}: ${l.en}`).toBe(false);
      expect(["prologue", "guide", "tip", "fact"]).toContain(l.kind);
      // La voz lee mejor sin símbolos: los números y unidades van escritos.
      expect(/[☉Δ°]/.test(l.es + l.en), `${l.id} tiene símbolos que la voz no lee`).toBe(false);
    }
  });

  it("cada nivel tiene prólogo y guía de hangar", () => {
    for (const s of scenarios) {
      expect(lines.filter((l) => l.scenario === s && l.trigger === "prologue").length, s).toBeGreaterThan(0);
      expect(
        lines.some((l) => l.scenario === s && l.trigger === "hangar"),
        s,
      ).toBe(true);
    }
  });

  it("cada disparador existe en el motor de su nivel y no se repite", () => {
    const seen = new Set<string>();
    for (const l of lines) {
      expect(scenarios).toContain(l.scenario);
      if (l.trigger === "prologue") continue;
      const key = `${l.scenario}:${l.trigger}`;
      expect(seen.has(key), `disparador repetido: ${key}`).toBe(false);
      seen.add(key);
      if (l.trigger === "hangar") continue;
      const prefix = `level${l.scenario.slice(5, 6)}:`;
      expect(l.trigger.startsWith(prefix), `${l.id} usa ${l.trigger}`).toBe(true);
      const name = l.trigger.slice(prefix.length);
      // Disparadores con sufijo variable en el motor: fixed-${id}, failure-${component}, attitude-${attitude}.
      const dynamic = /^(fixed|failure|attitude)-/.exec(name);
      const literal = dynamic ? `${prefix}${dynamic[1]}-` : l.trigger;
      expect(engine.includes(literal), `${l.trigger} no aparece en el motor`).toBe(true);
    }
  });

  it("cada línea tiene su voz generada con el texto actual", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "apps/web/public/atlas/manifest.json"), "utf8"),
    ) as Record<string, Record<string, { text: string; voice: string }>>;
    const hash = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 12);
    for (const lang of ["es", "en"] as const) {
      for (const l of lines) {
        expect(
          existsSync(join(root, `apps/web/public/atlas/${lang}/${l.id}.mp3`)),
          `${lang}/${l.id}.mp3`,
        ).toBe(true);
        expect(manifest[lang]?.[l.id]?.text, `voz desactualizada: ${lang}/${l.id}`).toBe(hash(l[lang]));
      }
    }
  });
});
