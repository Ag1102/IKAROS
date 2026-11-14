# PLAN — Space Mission Design Game (NASA Space Apps 2026)

Contexto y datos: ver [CONTEXT.md](CONTEXT.md). Este plan no incluye código.

## 0. Decisiones ya tomadas
- Juego 3D en navegador, sin instalación, sin integración con IA (el "asistente" es contenido escrito de antemano).
- Modelos abiertos NASA (GLB) sin modificar banderas, insignias ni escudos; todo lo generado, en low poly.
- 3 niveles: (1) tutorial de reparación de satélite, (2) misión LEO de observación, (3) Ikaros (basado en Landis et al., AIAA 2008-5712).
- Nivel 3: **núcleo fiel al paper** + **extensiones teóricas** (reactor, HTS, nanobots, cápsula de retorno).
  Como es un juego, un **aviso (disclaimer) único** basta: "Las tecnologías marcadas con ⚗ son teóricas/ficticias". Sin interruptor de modos.
- Multijugador cooperativo de hasta 4 con roles (requisito del reto).

## 1. Qué debe cumplir para el reto (checklist de jueces)
| Pide el reto | Dónde lo cubrimos |
|---|---|
| Definir objetivo y requisitos de misión | Pantalla de briefing de cada nivel |
| Diseñar nave e instrumentos | Hangar (niveles 2 y 3) |
| Elegir lanzador y órbita con chequeo de compatibilidad | Nivel 2 (y trayectoria Venus en nivel 3) |
| Masa, potencia, presupuesto, datos, comunicaciones, tiempo | Panel de recursos común a todos los niveles |
| Simular y evaluar | Simulador + informe post-misión |
| Hasta 4 jugadores con roles | Salas cooperativas, 4 consolas |
| Explicar por qué se gana o se pierde | Informe con causa raíz y "por qué" educativo |
| Eventos aleatorios, dificultad, reporte, sandbox | CME, niveles de dificultad, JSON/PDF de reporte, modo sandbox |

## 2. Diseño de los 3 niveles

### Nivel 1 — Tutorial: "Reparar un satélite" (≈10 min, 1 jugador)
Enseña los controles y los conceptos base sin abrumar.
1. Briefing: el satélite perdió un panel solar y su antena.
2. Órbita: qué es altitud y por qué importa (se ve la Tierra y la trayectoria).
3. Rendezvous: ajustar altitud para alcanzarlo (delta-V simple, combustible limitado).
4. Reparación: elegir herramientas (masa/peso limitado) y completar tarea en una ventana de comunicaciones.
5. Resultado: informe corto.
Conceptos introducidos: órbita, delta-V, combustible, ventana de comunicación, masa.

### Nivel 2 — Misión LEO de observación de la Tierra (≈20 min, 1–4 jugadores)
Primer ciclo completo: **Hangar → Lanzamiento → Operación → Informe**.
- Objetivo elegible (p. ej. clima, océanos, incendios) que fija requisitos.
- Componentes: estructura, paneles, baterías, comunicaciones, computadora, control de actitud, instrumentos.
- Lanzador con capacidad a LEO y compatibilidad masa/órbita (bloquea el lanzamiento si no cumple).
- Recursos: masa, potencia, presupuesto, datos, enlace de bajada, vida útil.
- Órbita: altitud, inclinación (polar vs. ecuatorial) y su efecto en cobertura y ventanas de estación terrena.
- Eventos aleatorios: falla de componente, eclipse largo, exceso de datos.
- Roles (en 4 jugadores): Planificación, Diseño de nave, Ciencia, Comunicaciones y recursos.

### Nivel 3 — IKAROS (≈30 min, 1–4 jugadores, el "jefe final")
Base: Solar Probe+ (paper). Estructura de tres fases:
1. **Hangar:** presupuesto, masa y lanzador con C3 muy alto (limitado por masa). Elección de energía: fotovoltaica activamente refrigerada (del paper), Stirling, o ⚗ reactor.
2. **Campaña de acercamiento:** Venus como palanca (ventanas de sobrevuelo; 7 en el paper, abreviados en el juego) para ir bajando el perihelio.
3. **Encuentro solar (el clímax):** ~10 h de misión comprimidas en minutos de juego. El jugador gestiona la matriz secundaria (retraerla según la distancia), temperatura de celdas < 120 °C, radiadores en sombra, potencia ≥ 482 W, y una CME aleatoria.
4. **Salida e informe:** ⚗ eyección del módulo y cápsula de retorno como cierre teórico; informe final.

Reglas que vienen del paper (**datos reales**, ver CONTEXT.md): perihelio 9.5 R☉, 510 × AM0, mínimo 482 W, matriz principal hasta 0.25 AU y luego plegada, límite de celdas 120 °C (diseño) y ~350 °C (degradación), radiadores a 100 °C.

Extensiones ⚗ (supuestos del juego, no datos NASA): reactor de fisión, campo HTS, nanobots, cápsula de retorno, escudo de metal líquido.

Roles (4 jugadores): Térmico/estructural, Energía y defensa, Propulsión y órbita, Ciencia y telemetría. Cada consola ve solo parte de la información; hay que comunicarse (voz o chat de la sala).

## 3. Sistemas transversales
- **Panel de recursos:** masa, potencia, presupuesto, datos, comunicaciones, tiempo; mismo componente en todos los niveles.
- **Motor de simulación:** módulo único y determinista (semilla), independiente del renderizado, para poder probarlo y para que el servidor sea la autoridad en multijugador.
- **Asistente de misión (sin IA):** curiosidades y explicaciones escritas, con fuente NASA citada, activadas por eventos.
- **Puntuación:** éxito de misión, valor científico, uso eficiente de recursos, decisiones y coordinación del equipo.
- **Informe post-misión:** causas de éxito o fallo, y qué cambiar la próxima vez.
- **Sandbox:** sin restricciones, para experimentar.
- **Guardar/compartir/comparar diseños:** exportar a JSON y enlace.
- **Accesibilidad y alcance (Beginner/Intermediate):** textos simples, tutoriales cortos, glosario, idiomas ES/EN.

## 4. Datos y fidelidad NASA
- Carpeta `data/` con **fuente, fecha y unidad por cada valor**; ningún número escrito a mano en la lógica.
- Fuentes: el paper (niveles 3), fichas de lanzadores oficiales, TLE de CelesTrak, JPL Horizons, NASA 3D Resources, Visible Earth / Blue Marble.
- Cada dato lleva una etiqueta: `real` (con cita) o `⚗ teórico` (supuesto del juego).
- Fórmulas: Tsiolkovsky (delta-V), vis-viva y Kepler, equilibrio térmico αI=(εf+εr)σT⁴, radiador Ar=[(1−η)/η]/(εσT⁴) por vatio, enlace de datos simple.
- Verificación: una hoja de pruebas con casos conocidos (por ejemplo, el perihelio de 9.5 R☉ da ~700 kW/m²).

## 5. Arquitectura (alto nivel)
- Cliente web (React + Three.js) con vista 3D y paneles; estado de UI aparte del estado de simulación.
- Servidor de salas (Node) que corre el motor de simulación como autoridad y sincroniza a 4 clientes.
- Persistencia ligera (ranking, diseños guardados).
- Modo un jugador sin servidor (el mismo motor corre en el cliente), para que la demo funcione siempre, incluso sin conexión.

## 6. Arte y 3D
- Modelos NASA (GLB) para Tierra, Sol y satélites de referencia, sin modificar insignias, banderas ni logos.
- Modelos propios en low poly (Blender → GLB): herramientas, módulos, matriz solar, radiadores, cápsula.
- Presupuesto de rendimiento: < 100k polígonos por escena, texturas ≤ 2K, carga < 10 s.
- Estilo visual unificado: paleta limitada, UI tipo consola de misión.

## 7. Hitos (por prioridad, no por fechas; ajustar al plazo real)
1. **Fundamentos:** repositorio, estructura `data/`, motor de simulación con pruebas, visor 3D con Tierra y órbita.
2. **Nivel 1 jugable** de principio a fin (es también la demo mínima).
3. **Panel de recursos + Hangar + informe** (reutilizados por los niveles 2 y 3).
4. **Nivel 2 completo** con lanzador, órbita y eventos.
5. **Nivel 3 (Ikaros):** campaña Venus → encuentro solar → informe.
6. **Multijugador de 4** con roles.
7. **Pulido:** asistente de misión, glosario, sonido, ES/EN, sandbox, guardar/compartir.
8. **Entrega:** video demo, descripción del proyecto, créditos y fuentes de datos.

Si el tiempo aprieta, orden de recorte: sandbox → guardar/compartir → ES/EN → sonido. **No recortar:** niveles 1–3, multijugador, informe e integridad de datos.

## 8. Reparto sugerido del equipo
| Rol | Responsabilidad |
|---|---|
| Simulación y datos | Motor, fórmulas, `data/` con fuentes, pruebas |
| Frontend 3D | Escena, cámaras, UI, panel de recursos |
| Multijugador | Salas, sincronización, roles |
| Arte y contenido | Modelos low poly, textos del asistente, glosario |

## 9. Riesgos
| Riesgo | Mitigación |
|---|---|
| Alcance excesivo para el plazo | Hitos por prioridad; nivel 1 como demo mínima |
| Multijugador inestable en la demo | Modo un jugador siempre disponible; servidor autoritativo y simple |
| Datos mal citados | Etiqueta real/⚗ por cada valor y revisión cruzada |
| Uso indebido de insignias NASA | Usar modelos tal cual; ningún cambio en logos, banderas o escudos; evitar sugerir respaldo de NASA |
| Nombre IKAROS = misión JAXA | Subtítulo propio en la interfaz y nota en créditos |
| Rendimiento 3D | Presupuesto de polígonos y texturas, instancias, carga progresiva |

## 10. Preguntas abiertas
1. ¿Cuál es la fecha límite de entrega y el tamaño del equipo?
2. ¿Idiomas del juego: solo español, o ES/EN?
3. ¿Dónde se aloja (hosting) la demo y en qué carpeta guardamos el proyecto?
4. ¿Más de un escenario de objetivo en el nivel 2, o uno solo bien pulido?

---

## Adenda (recursos del reto y reglas)
- **Plazo:** el evento es 14–15 nov 2026 (hoy es 14). El plan debe recortarse a un núcleo entregable: nivel 1 jugable, nivel 3 con el encuentro solar, panel de recursos e informe; multijugador solo si hay tiempo.
- **Recursos oficiales:** ver CONTEXT.md. Se integran así: 4 segmentos (lanzamiento/espacio/tierra/usuario) como estructura del informe; etapas CML/MDL como pasos de diseño por nivel; GMAT para verificar la física; informe final que compara con misiones NASA reales (patrón del juego de telescopios); CubeSat 101 para el tutorial.
- **Envío:** incluir la descripción obligatoria de cómo se usaron herramientas de IA en el desarrollo (regla del FAQ).
- **Commits:** autoría del usuario, sin trailers de IA (preferencia del usuario).
