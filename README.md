# Ikaros

Juego 3D de diseño de misiones espaciales para el NASA Space Apps Challenge 2026
(reto *Space Mission Design Game*). Tres niveles: reparar un satélite, misión LEO de
observación, y Ikaros, basado en el diseño de energía de Solar Probe+ (Landis et al., AIAA 2008-5712).
Lo marcado como ⚗ es teórico y está avisado en el juego.

## Estructura

| Carpeta | Contenido | Dueño |
|---|---|---|
| `apps/web` | Cliente: escena 3D, interfaz, niveles | Persona B |
| `packages/contracts` | Tipos compartidos (el contrato) | Ambas |
| `packages/sim` | Motor de simulación | Persona A |
| `packages/sim-mock` | Simulación falsa para avanzar en paralelo | Persona A |
| `data/` | Datos con fuente y escenarios | Persona A |
| `content/` | Textos del asistente y glosario | Persona A |
| `docs/` | Plan, contexto, diseño de la interfaz | Ambas |

Reglas de trabajo: `docs/PLAN-2-PERSONAS.md`. Pedidos entre personas: `NOTAS.md`.

## Puesta en marcha

```bash
npm install
npm run typecheck
```

## Git

Ramas cortas `a/<tema>` y `b/<tema>`; fusionar a `main` seguido. Cada quien hace commit
con su propia identidad.
