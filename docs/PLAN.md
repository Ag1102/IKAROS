# PLAN RECORTADO — 48 h (NASA Space Apps, 14–15 nov 2026)

Versión amplia guardada en [PLAN-completo.md](PLAN-completo.md). Datos y fuentes en [CONTEXT.md](CONTEXT.md). Sin código aún.

## Alcance (lo que SÍ entra)
1. **Nivel 1 – Tutorial:** reparar un satélite en órbita (1 jugador).
2. **Nivel 3 – Ikaros:** campaña corta + encuentro solar (núcleo del paper AIAA 2008-5712 + extensiones ⚗ teóricas con un aviso único).
3. **Panel de recursos común** (masa, potencia, presupuesto, datos, comunicaciones, tiempo) y **informe post-misión** con causa del éxito/fallo, estructura por los 4 segmentos NASA y comparación con misiones reales.
4. **Asistente de misión sin IA:** textos escritos con fuente NASA.
5. **Modo un jugador siempre funcional**, sin servidor.

## Alcance condicionado (solo si sobra tiempo)
- **Nivel 2 – LEO de observación**, en versión mínima: un objetivo, lanzador con chequeo de compatibilidad.
- **Multijugador de 4 con roles** (el reto lo menciona como "podría"; no es obligatorio). Si no entra, el informe y la UI muestran los 4 roles como "vistas" de una sola persona y se documenta como trabajo futuro.

## Fuera de alcance (se menciona como futuro)
Sandbox, guardar/compartir diseños, ranking, ES/EN completo (solo un idioma), sonido.

## Cronograma por bloques (ajustar a la hora real de inicio)
| Bloque | Entregable | Criterio de listo |
|---|---|---|
| A (≈3 h) | Esqueleto: proyecto web, escena 3D con Tierra, órbita y nave; carpeta `data/` con fuentes | Se ve la Tierra con la nave orbitando |
| B (≈4 h) | Motor de simulación (delta-V, órbita, energía, térmica) + pruebas con casos conocidos del paper | Pruebas verdes (p. ej. 510 × AM0 ≈ 700 kW/m²) |
| C (≈5 h) | **Nivel 1 jugable** de principio a fin + panel de recursos | Se juega y termina con informe |
| D (≈8 h) | **Nivel 3:** hangar, trayectoria a Venus simplificada, encuentro solar (retraer matriz, celdas < 120 °C, ≥ 482 W, CME) | Se gana y se pierde con causa clara |
| E (≈3 h) | Informe post-misión + comparación con misiones reales + asistente | Informe con fuentes citadas |
| F (≈4 h) | Pulido de UI, aviso ⚗, créditos, glosario mínimo | Revisión completa de principio a fin |
| G (≈3 h) | **Envío:** video demo, descripción, créditos, **declaración de uso de herramientas de IA** (obligatoria por el FAQ), despliegue | Enlace público funcionando |
| Extra | Nivel 2 mínimo, luego multijugador | Solo con tiempo restante |

Reglas del recorte: no empezar un bloque sin cerrar el anterior; congelar funciones 4 h antes del envío; el despliegue se prueba desde un dispositivo ajeno.

## Reparto sugerido (ajustar al tamaño real del equipo)
| Rol | Bloques |
|---|---|
| Simulación y datos | B, pruebas, `data/` |
| Frontend 3D y UI | A, C, F |
| Gameplay y niveles | C, D |
| Contenido y envío | E, G, textos del asistente, video |

## Calidad y reglas
- Cada valor numérico con fuente en `data/` y etiqueta `real` o `⚗ teórico`.
- Modelos NASA sin cambios en insignias, banderas ni escudos; lo propio en low poly.
- Verificar la física con **GMAT** si hay tiempo (si no, con los casos del paper).
- Commits con tu identidad, sin trailers de IA, mensajes cortos. La descripción de uso de IA va en el envío (regla oficial).
- Nombre: "Ikaros" con subtítulo propio por la misión real de JAXA.

## Riesgos principales
| Riesgo | Respuesta |
|---|---|
| Falta de tiempo | Recorte arriba; nivel 1 y 3 primero |
| Física del nivel 3 demasiado compleja | Encuentro solar como minijuego de gestión con las ecuaciones del paper; trayectoria Venus simplificada y explicada |
| Fallo del despliegue en la demo | Probar despliegue en el bloque F, no en G |

## Preguntas que cambian el plan
1. ¿A qué hora empieza y termina tu ventana de trabajo?
2. ¿Cuántas personas son y quién hace qué?
3. ¿En qué carpeta se guarda el proyecto y dónde se despliega?
4. ¿Solo español o también inglés?
