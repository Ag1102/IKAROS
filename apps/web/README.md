# apps/web

Cliente del juego (Persona B): escena 3D, interfaz y flujo de los niveles.

## Uso

```bash
npm run dev -w @ikaros/web          # servidor de desarrollo
npm run test -w @ikaros/web         # pruebas (Vitest)
npm run lint -w @ikaros/web         # ESLint
npm run format:check -w @ikaros/web # Prettier
npm run build -w @ikaros/web        # typecheck + build de producción
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/screens` | Pantallas de cada nivel |
| `src/scene` | Escena 3D del nivel 1 y controles de cámara |
| `src/level1` | Reglas provisionales del nivel 1 |
| `src/level3` | Hangar, simulación provisional del encuentro y escena del nivel 3 |
| `src/ui` | Paneles, diálogos, asistente de misión y glosario |
| `src/hooks` | Bucle de juego y atajos de teclado |
| `public/` | Modelos y texturas de NASA sin modificar (ver `public/CREDITS.md`) |

## Pendiente de integración con Persona A

- Las reglas de `src/level1/game.ts` y la simulación de `src/level3/encounter.ts` son
  provisionales: se sustituyen por `@ikaros/sim` cuando el motor implemente el contrato.
- El catálogo de `src/level3/catalog.ts` usa masas y costos de prueba; deben venir de `data/`.
- Los textos de `content/*.json` se cargan solos y reemplazan por `id` a los de `src/ui/facts.ts`.
- Contrato: falta la órbita en `SimState` y acciones propias para iniciar, reiniciar y
  arrancar la reparación (hoy usan `resolve-event`).
