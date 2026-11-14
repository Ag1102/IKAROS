# Notas entre Persona A y Persona B

Aquí se dejan los pedidos al otro lado (cambios de contrato, datos que faltan, dependencias).
Formato: fecha, quién pide, qué necesita, estado.

| Fecha | De | Pedido | Estado |
|---|---|---|---|
| 2026-11-14 | A | Para B: el contrato creció sin romper nada. Nuevos: `SourcedValue`, `ScenarioDefinition` (catálogo del hangar en `data/scenarios/*.json`), `ContentEntry`/`GlossaryEntry` (`content/*.json`), `EventChoice` y `deadline_s` en eventos (CME y ventanas de Venus se resuelven con `resolve-event`; si pasa el plazo se resuelve como `timeout`), `trigger` en eventos para el asistente, acciones `tilt-array`, `stow-main-array`, `set-attitude`, y campos opcionales de telemetría en `SimState`. `retract-array.fraction` es la fracción retraída: en perihelio la ventana útil es ~97–98 %, conviene un control en escala logarítmica de área iluminada (`array_illuminated_cm2`). | Hecho |
| 2026-11-14 | A | Para B: `@ikaros/sim-mock` ya funciona (valores fijos). `@ikaros/sim` es el motor real con la misma interfaz: `createSimulation()` en ambos. | Hecho |
| 2026-11-14 | A | Para B: en el hangar el reloj de misión no corre (`step` no hace nada hasta `launch`). Los límites de tiempo cuentan desde el lanzamiento. | Info |
| 2026-11-14 | A | Para B: `step(dt_s)` acepta cualquier tamaño (se parte en subpasos y se limita a un año por llamada); ignora `dt` no finito o ≤ 0. El resultado no depende del tamaño del paso, así que un paso por fotograma funciona. | Info |
| 2026-11-14 | A | Para B: el crucero del nivel 3 dura ~18 meses de misión entre ventanas de Venus: hace falta un control de aceleración del tiempo (días o semanas por segundo). El encuentro dura ~10 días; lo interesante son ~10 h cerca del perihelio. | Info |
| 2026-11-14 | A | Para B: en perihelio la matriz secundaria debe quedar ~97–98 % retraída (~25–35 cm² iluminados de 1350). Sugerencia: control en escala logarítmica sobre `array_illuminated_cm2` y convertir a `fraction`. | Info |
| 2026-11-14 | A | Para B: el catálogo del hangar y los parámetros de cada nivel se leen con `scenario(id)` exportado por `@ikaros/sim`, o directamente de `data/scenarios/*.json`. Los textos del asistente se buscan por `SimEvent.trigger` en `content/assistant.json`. | Info |
| 2026-11-14 | A | Para B: `packages/sim/src/autopilot.ts` juega los niveles solo (útil para una demo o modo atracción). | Info |
| 2026-11-14 | A | Para B: cuando crees `apps/web`, pide aquí las dependencias (vite, react, three, etc.); las agrego yo al `package.json` raíz y al lockfile. También agrego `apps/web` a las referencias del `tsconfig.json` raíz y a `format`/CI cuando exista su `tsconfig`. | Pendiente |
| 2026-11-14 | A | Para ambos: `.gitattributes` fija LF en el repo. En Windows conviene `git config core.autocrlf false` o dejar que `.gitattributes` decida. CI corre typecheck, formato y pruebas en cada PR. | Info |
| 2026-11-14 | A | Para ambos: `CODEOWNERS` sigue con `@persona-a`/`@persona-b`; falta poner los usuarios reales de GitHub. | Pendiente |
