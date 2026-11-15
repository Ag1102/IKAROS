# Ikaros

A 3D space-mission design game for the NASA Space Apps Challenge 2026
(*Space Mission Design Game* challenge). Two levels: docking with the International Space
Station, and Ikaros, based on the Solar Probe+ power design (Landis et al., AIAA 2008-5712).
Anything marked ⚗ is theoretical and is flagged as such in the game.

## Layout

| Folder | Contents | Owner |
|---|---|---|
| `apps/web` | Client: 3D scene, interface, levels | Ricardo Díaz |
| `packages/contracts` | Shared types (the contract) | Both |
| `packages/sim` | Simulation engine | Camilo Cadena |
| `packages/sim-mock` | Fake simulation for working in parallel | Camilo Cadena |
| `data/` | Sourced data and scenarios | Camilo Cadena |
| `content/` | Assistant texts and glossary | Camilo Cadena |

## Getting started

```bash
npm install
npm run dev -w @ikaros/web
```

Client tests, lint and build: see `apps/web/README.md`. Engine, data and content:

```bash
npm run typecheck
npm test
npm run telemetry -- level3-ikaros 7
```

## Simulation engine (`@ikaros/sim`)

```ts
import { createSimulation } from "@ikaros/sim"; // or "@ikaros/sim-mock"

const sim = createSimulation();
let state = sim.load("level3-ikaros", 42);       // same seed, same mission
state = sim.act({ type: "select-component", slot: "energy", componentId: "pv-cooled" });
state = sim.act({ type: "launch" });
state = sim.step(3600);                          // mission seconds
const report = sim.report();
```

- `step(dt_s)` accepts long steps: the engine splits them into 60 s substeps.
- Time scale belongs to the client: it decides how many mission seconds pass per frame.
- Decisions (Venus windows, CME, ejection) are events with `choices` and `deadline_s`;
  answer them with `resolve-event`. If the deadline passes they resolve as `timeout`.
- Hangar catalog and per-level parameters: `data/scenarios/*.json` (`ScenarioDefinition`).
- Assistant texts: `content/assistant.json`, linked by `SimEvent.trigger`.
- `packages/sim/src/autopilot.ts` plays the levels on its own; useful for tests and demos.

Formulas: Hohmann and vis-viva, Tsiolkovsky, Kepler, eq. 1 and 2 from Landis et al. (AIAA 2008-5712).
The tests (`tests/`) check the paper's cases: 510 × AM0 ≈ 700 kW/m², ~34 cm² give ≥ 482 W,
~10 h inside 10 R☉, main array at 74° below 180 °C.

## Languages (Spanish and English)

The menu has an ES/EN switch (also `?lang=en` in the URL); the choice is remembered in the browser.
Numbers are the same in both languages; only the texts change.

- Interface (`apps/web`): `tr("texto en español", "English text")` from `src/i18n.ts`.
- Engine: `createSimulation({ lang: "en" })`; inside each level, `this.L("español", "English")`.
- Scenarios: English texts live in `data/en/scenarios/<id>.json`, keyed by slot and component id.
- Assistant and glossary: `content/en/assistant.json` (by `id`) and `content/en/glossary.json`.
- Sources cited in Spanish: their translation lives in `data/en/sources.json`.

`tests/i18n.test.ts` fails if a new text has no English version.

## Atlas, mission control

Atlas guides each level by voice: a prologue on entry, what to do in the hangar, and warnings or
fun facts when the engine emits certain events. It speaks the menu's language and can be muted.

- Script: `content/atlas.json` (`trigger`: `prologue`, `hangar` or an engine `SimEvent.trigger`).
- Voice: pre-generated clips in `apps/web/public/atlas/<lang>/<id>.mp3`. If a clip is missing or
  outdated, the line is shown as text only.
- Regenerate the voice after changing the script (Windows, with Argo/Chatterbox local voice):
  `npm run atlas:voz`. Only new or changed lines are rebuilt. `ATLAS_VOZ` points to Argo's `voz`
  folder if it is not in the default path.
- `tests/atlas.test.ts` checks that every trigger exists in the engine and that every line has an
  up-to-date voice clip.

## Git

Short topic branches; merge into `main` often.
