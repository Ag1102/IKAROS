# Notas entre Persona A y Persona B

Aquí se dejan los pedidos al otro lado (cambios de contrato, datos que faltan, dependencias).
Formato: fecha, quién pide, qué necesita, estado.

| Fecha | De | Pedido | Estado |
|---|---|---|---|
| 2026-11-14 | A | Para B: el contrato creció sin romper nada. Nuevos: `SourcedValue`, `ScenarioDefinition` (catálogo del hangar en `data/scenarios/*.json`), `ContentEntry`/`GlossaryEntry` (`content/*.json`), `EventChoice` y `deadline_s` en eventos (CME y ventanas de Venus se resuelven con `resolve-event`; si pasa el plazo se resuelve como `timeout`), `trigger` en eventos para el asistente, acciones `tilt-array`, `stow-main-array`, `set-attitude`, y campos opcionales de telemetría en `SimState`. `retract-array.fraction` es la fracción retraída: en perihelio la ventana útil es ~97–98 %, conviene un control en escala logarítmica de área iluminada (`array_illuminated_cm2`). | Hecho |
| 2026-11-14 | A | Para B: `@ikaros/sim-mock` ya funciona (valores fijos). `@ikaros/sim` es el motor real con la misma interfaz: `createSimulation()` en ambos. | Hecho |
