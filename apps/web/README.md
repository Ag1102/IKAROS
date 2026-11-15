# apps/web

Game client: 3D scene, interface and level flow.

## Usage

```bash
npm run dev -w @ikaros/web          # dev server
npm run test -w @ikaros/web         # tests (Vitest)
npm run lint -w @ikaros/web         # ESLint
npm run format:check -w @ikaros/web # Prettier
npm run build -w @ikaros/web        # typecheck + production build
```

## Layout

| Folder | Contents |
|---|---|
| `src/levels` | Screens, scenes and minigames for each level, wired to the `@ikaros/sim` engine |
| `src/game` | Shared challenge pieces: frame, scoring, achievements and facts to learn |
| `src/atlas` | Atlas, mission control: script, voice and hologram |
| `src/menu` | 3D menu scene and mission list |
| `src/sim` | `useSimulation` (bridge to the engine), Kepler and geometry for the scenes |
| `src/scene` | Level 1 3D scene, space (Sun, sky, bloom), on-screen sizes and camera |
| `src/ships` | Ships assembled in the hangar and NASA models |
| `src/ui` | Panels, hangar, decisions, report, assistant, glossary and dialogs |
| `src/data` | Reading `data/` and `content/` |
| `public/` | Unmodified NASA models and textures (see `public/CREDITS.md`) |

## Rules

- Physics, data and rules belong to the engine (`packages/sim`, `data/`, `content/`); the
  interface does not define its own numbers.
- Scenes use real distances and sizes; anything that would not be visible at real scale is drawn
  with a minimum on-screen size.
