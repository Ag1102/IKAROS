# Ikaros

Juego 3D de diseño de misiones espaciales para el NASA Space Apps Challenge 2026
(reto *Space Mission Design Game*). Tres niveles: reparar un satélite, misión LEO de
observación, y Ikaros, basado en el diseño de energía de Solar Probe+ (Landis et al., AIAA 2008-5712).
Lo marcado como ⚗ es teórico y está avisado en el juego.

## Estructura

| Carpeta | Contenido | Dueño |
|---|---|---|
| `apps/web` | Cliente: escena 3D, interfaz, niveles | Persona B (Ricardo Díaz) |
| `packages/contracts` | Tipos compartidos (el contrato) | Ambas |
| `packages/sim` | Motor de simulación | Persona A (Camilo Cadena) |
| `packages/sim-mock` | Simulación falsa para avanzar en paralelo | Persona A (Camilo Cadena) |
| `data/` | Datos con fuente y escenarios | Persona A (Camilo Cadena) |
| `content/` | Textos del asistente y glosario | Persona A (Camilo Cadena) |

## Puesta en marcha

```bash
npm install
npm run dev -w @ikaros/web
```

Pruebas, lint y build del cliente: ver `apps/web/README.md`. Motor, datos y contenido:

```bash
npm run typecheck
npm test
npm run telemetry -- level3-ikaros 7
```

## Motor de simulación (`@ikaros/sim`)

```ts
import { createSimulation } from "@ikaros/sim"; // o "@ikaros/sim-mock"

const sim = createSimulation();
let state = sim.load("level3-ikaros", 42);       // misma semilla, misma misión
state = sim.act({ type: "select-component", slot: "energy", componentId: "pv-cooled" });
state = sim.act({ type: "launch" });
state = sim.step(3600);                          // segundos de misión
const report = sim.report();
```

- `step(dt_s)` acepta pasos largos: el motor los parte en subpasos de 60 s.
- La escala de tiempo es del cliente: decide cuántos segundos de misión pasan por fotograma.
- Decisiones (ventanas de Venus, CME, eyección): eventos con `choices` y `deadline_s`;
  se responden con `resolve-event`. Si vence el plazo se resuelven como `timeout`.
- Catálogo del hangar y parámetros de cada nivel: `data/scenarios/*.json` (`ScenarioDefinition`).
- Textos del asistente: `content/assistant.json`, enlazados por `SimEvent.trigger`.
- `packages/sim/src/autopilot.ts` juega los niveles solo; sirve para pruebas y para una demo.

Fórmulas: Hohmann y vis-viva, Tsiolkovsky, Kepler, ec. 1 y 2 de Landis et al. (AIAA 2008-5712).
Las pruebas (`tests/`) comprueban los casos del paper: 510 × AM0 ≈ 700 kW/m², ~34 cm² dan ≥ 482 W,
~10 h dentro de 10 R☉, matriz principal a 74° bajo 180 °C.


## Git

Ramas cortas `a/<tema>` y `b/<tema>`; fusionar a `main` seguido. Cada quien hace commit
con su propia identidad.
