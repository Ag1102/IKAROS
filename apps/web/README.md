# apps/web

Cliente del juego: escena 3D, interfaz y flujo de los niveles.

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
| `src/levels` | Pantallas, escenas y minijuegos de cada nivel, conectados al motor `@ikaros/sim` |
| `src/game` | Piezas comunes de los retos: marco, puntuación, logros y datos que se aprenden |
| `src/atlas` | Atlas, el control de misión: guion, voz y holograma |
| `src/menu` | Escena 3D del menú y lista de misiones |
| `src/sim` | `useSimulation` (puente con el motor), Kepler y geometría para las escenas |
| `src/scene` | Escena 3D del nivel 1, espacio (Sol, cielo, bloom), tamaños en pantalla y cámara |
| `src/ships` | Naves armadas en el hangar y modelos de NASA |
| `src/ui` | Paneles, hangar, decisiones, informe, asistente, glosario y diálogos |
| `src/data` | Lectura de `data/` y `content/` |
| `public/` | Modelos y texturas de NASA sin modificar (ver `public/CREDITS.md`) |

## Reglas

- La física, los datos y las reglas son del motor (`packages/sim`, `data/`, `content/`); la
  interfaz no define números propios.
- Las escenas usan distancias y tamaños reales; lo que no se vería a escala real se dibuja con un
  tamaño mínimo en pantalla.
