# Plan para 2 personas en paralelo, sin pisarse

Basado en [PLAN.md](PLAN.md) (48 h). Principio: **cada persona es dueña de carpetas distintas y se hablan solo por un contrato escrito al inicio.**

## Roles
| | Persona A — Simulación, datos y contenido | Persona B — Cliente: 3D, UI y niveles |
|---|---|---|
| Carpetas propias | `packages/sim/`, `data/`, `content/`, `tests/` | `apps/web/` (escena, UI, niveles, assets 3D) |
| Entrega | Motor, fórmulas, escenarios, textos con fuente | Escena 3D, paneles, flujo de cada nivel |
| No toca | `apps/web/` | `packages/sim/`, `data/` |

Archivos compartidos con **un solo dueño**: `package.json` raíz, configuración de herramientas y `README` → Persona A. Si B necesita una dependencia, la pide por mensaje y A la añade (evita conflictos en el archivo de bloqueo).

## El contrato (se escribe en la primera hora, juntos)
Archivo `packages/contracts/index.ts` con solo tipos, por ejemplo: estado de la nave, recursos (masa, potencia, presupuesto, datos, comunicaciones, tiempo), acciones del jugador, eventos (CME, falla), resultado y informe.
- Una vez acordado, **cambia solo con aviso a la otra persona** y un commit propio y pequeño.
- Los escenarios (nivel 1 y nivel 3) viven en `data/scenarios/*.json`: A los define, B los lee. Nada de números dentro del código de B.

## Cómo se evita bloquearse
- **B trabaja contra una simulación falsa** (`packages/sim-mock`, con valores fijos que cumplen el contrato) desde el minuto cero; cuando A termina el motor real, se cambia una línea de importación.
- **A prueba el motor sin interfaz**, con pruebas automáticas y un script de línea de comandos que imprime la telemetría.
- Contenido (curiosidades, glosario, comparaciones con misiones reales): A lo escribe en `content/*.json` con fuente; B solo lo muestra.

## Git
- Rama principal protegida por convención; ramas cortas `a/<tema>` y `b/<tema>`; fusionar a la principal **al menos cada 2 h** y siempre actualizar desde la principal antes de empezar.
- Cada persona hace commit con su propia identidad, mensajes cortos y naturales, sin trailers de IA.
- Un archivo `CODEOWNERS` (o una nota en el README) con las carpetas de cada una.
- Nunca editar archivos de la otra persona: si algo falta, abrir una nota en `NOTAS.md` o avisar.

## Cronograma paralelo
| Bloque | Persona A | Persona B | Punto de sincronización |
|---|---|---|---|
| 0 (≈1 h) | Juntos: contrato, estructura, repo, identidades de git | igual | Repo listo, contrato fijado |
| 1 (≈4 h) | Motor: órbita, delta-V, recursos; datos con fuente | Escena 3D (Tierra, órbita, nave) y sistema de UI con el mock | Se ve la nave orbitando con datos del mock |
| 2 (≈5 h) | Escenario y reglas del nivel 1; pruebas | Nivel 1: flujo, controles, panel de recursos | Nivel 1 jugable con el motor real |
| 3 (≈8 h) | Nivel 3: energía, térmica, matriz retráctil, CME, escenarios de Venus | Nivel 3: hangar, vista de encuentro solar, controles | Nivel 3 de principio a fin |
| 4 (≈4 h) | Informe, comparación con misiones reales, textos del asistente | Pantalla de informe, asistente, pulido visual según [DISENO-UI.md](DISENO-UI.md) | Informe con fuentes |
| 5 (≈4 h) | Revisión de datos y pruebas; descripción de uso de IA para el envío | Despliegue, video demo, créditos | Enlace público probado |
| Extra | Nivel 2 mínimo: datos y reglas | Nivel 2 mínimo: UI | Solo con tiempo |

**Reuniones de sincronización:** 10 minutos al final de cada bloque para fusionar, probar juntos y decidir cambios de contrato.

## Reglas para no pisarse
1. Nadie edita archivos de la otra persona sin avisar.
2. Cambios al contrato: avisar antes, commit separado.
3. Fusionar a la principal pronto y seguido; nada de ramas largas.
4. Los números van en `data/`, nunca en la interfaz.
5. Antes de cortar el trabajo, subir todo a la rama principal.

## Riesgos específicos
| Riesgo | Respuesta |
|---|---|
| El contrato cambia tarde | Congelarlo tras el bloque 2; cambios solo con acuerdo |
| B espera a A | Usa `sim-mock` desde el principio |
| Conflictos en `package.json` | Solo A lo edita |
| Estilos inconsistentes | B sigue [DISENO-UI.md](DISENO-UI.md); A solo entrega datos |
