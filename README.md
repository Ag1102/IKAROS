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

Pruebas, lint y build del cliente: ver `apps/web/README.md`.

## Git

Ramas cortas `a/<tema>` y `b/<tema>`; fusionar a `main` seguido. Cada quien hace commit
con su propia identidad.
