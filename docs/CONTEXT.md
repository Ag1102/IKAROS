# Contexto del proyecto — NASA Space Apps 2026: Space Mission Design Game

Reto: https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/
(Beginner/Intermediate, categoría Games. Diseñar y simular una misión completa: masa, potencia,
presupuesto, datos, comunicaciones, tiempo, órbita, lanzador. Multijugador hasta 4 con roles,
eventos aleatorios, reporte post-misión, sandbox.)

## Decisiones del equipo
- Juego 3D en navegador. Modelos abiertos de NASA (GLB, science.nasa.gov/3d-resources) **sin modificar
  banderas, insignias ni escudos**; lo generado por nosotros va en low poly.
- 3 niveles:
  1. Tutorial: reparar un satélite en órbita (servicio tipo Hubble SM-4).
  2. Misión LEO de observación de la Tierra (presupuestos de masa/potencia/datos/downlink, lanzador).
  3. **Misión compleja: Proyecto IKAROS** (antes "Helios"), basada en el documento
     `Proyecto_Helios_Implementacion_NASA_Space_Apps.docx` (abajo).
- Requisito transversal: fidelidad a datos reales de la NASA (cada valor con fuente, fecha y unidad en `data/`).
- Stack propuesto: Vite + React + TypeScript, Three.js (R3F), Zustand, Tailwind, satellite.js + propagador
  propio (RK4), Colyseus/Socket.IO para salas de 4, Supabase para ranking.

---

# PROYECTO IKAROS: RÉCORD SOLAR (nivel 3)

Misión robótica autónoma asistida por IA. Energía: mini reactor de fisión + cosecha termofotovoltaica.
Protección: escudo carbono-carbono, campo magnético HTS, enjambre de nanobots autorreparadores.
**Objetivo:** llegar a 850,000 km del Sol, recolectar muestras de la corona y devolver la cápsula a la
Tierra en 6–9 meses. Referencia citada por el doc: NASA Glenn / AIAA-2008-5712 (sin verificar).

## 1. Fases
| Fase | Objetivo | Trade-off |
|---|---|---|
| 1. Hangar (diseño y presupuesto) | Ensamblar nave con $500M y elegir cohete | Masa, costo, potencia. Masa total > capacidad del cohete bloquea el lanzamiento |
| 2. Descenso (tiempo real) | Sobrevivir al perihelio en viaje de 6–9 meses | Balance energético, radiadores en sombra del escudo, crisis con IA/nanobots |
| 3. Escape y reporte | Eyectar módulo reactor, liberar cápsula | Delta-V de retorno e informe post-misión estilo NASA |

## 2. Componentes (★ = configuración ganadora: $500M, 4,200 kg)
| Categoría | Componente | Costo | Masa | Efecto |
|---|---|---|---|---|
| Escudo | Carbono-Carbono Reforzado ★ | $100M | 650 kg | Hasta 3,000 °C con refrigeración; −85% desgaste térmico |
| Escudo | Metal líquido (Galio/Tungsteno) | $200M | 1,400 kg | Reparte calor, penaliza Delta-V |
| Energía | Mini reactor de fisión ★ | $180M | 800 kg | +450 kW; radiadores en sombra |
| Energía aux. | Paneles termofotovoltaicos ★ | $40M | 150 kg | +70 kW reciclando calor del escudo |
| Defensa activa | Campo magnético HTS ★ | $90M | 450 kg | −120 kW; desvía plasma/CME |
| Nanotecnología | Enjambre de nanobots ★ | $60M | 350 kg | −80 kW; +2.5%/s durabilidad hasta agotar reservas |
| Ciencia y retorno | Sensores corona + cápsula de escape ★ | $30M | 450 kg | −50 kW; cápsula se eyecta para volver |
| Estructura/prop. | Chasis, enfriador líquido y combustible ★ | base | 1,350 kg | −150 kW (bombas de agua presurizada) |

## 3. Motor de simulación
Tick: 1 s de simulación = 1 h de misión. Perihelio crítico: 4–7 días a 850,000 km.

- **Energía neta (kW)** = [450 + 70] − [120 HTS + 80 nanobots + 150 enfriador + 50 sensores] = **+120 kW**.
  Si < 0: HTS se apaga y el desgaste del casco sube +10%/s.
- **Durabilidad(t)** = Durabilidad(t−1) − [Daño_térmico(distancia) × Factor_escudo × Factor_HTS] + Reparación_nanobots.
  En perihelio: −3.0%/s + 2.5%/s = **−0.5%/s**; termina con **28%**.
- **Térmica:** circuito de agua desionizada mantiene la electrónica a 25–30 °C con exterior de 1,400–3,000 °C.
  Radiadores deben quedar en la umbra del escudo; si la nave gira a transmitir sin cerrar la brecha a tiempo,
  el reactor sube +15 °C/s.

## 4. Cronograma y crisis
- Meses 1–3: aproximación y frenado con asistencia gravitacional inversa en Venus.
- Mes 4: perihelio a 850,000 km, >650,000 km/h; se abren las copas colectoras de plasma.
- Meses 5–9: eyección del módulo reactor, cápsula de 450 kg regresa con segunda corrección orbital.
- **CME (temporizador 10 s):** A) sobrecargar HTS con 50 kW de sensores (casco 100%, −30% datos);
  B) inyección de nanobots (−50% de reserva); C) delegar a la IA (80% de éxito).
- **Clímax:** botón [EYECTAR MÓDULO REACTOR] en la ventana exacta: se liberan reactor (800 kg) y estructura;
  solo la cápsula de 450 kg vuelve.

## 5. Telemetría final (JSON)
```json
{
  "mission_name": "Proyecto Ikaros: Misión No Tripulada",
  "status": "SUCCESS",
  "mission_duration_months": 7.5,
  "metrics": {
    "min_distance_km": 850000,
    "historical_record_broken": true,
    "final_hull_durability_percent": 28,
    "net_power_margin_kw": 120,
    "scientific_data_collected_gb": 1420,
    "reactor_module_jettisoned": true,
    "sample_capsule_recovered": true
  },
  "score": 9850,
  "rank_badge": "Leyenda de la Astrodinámica"
}
```

## 6. Roles (modo 4 jugadores)
1. **Ingeniero térmico y estructural:** escudo, nanobots, radiadores; durabilidad > 0 y radiadores en sombra.
2. **Oficial de energía y defensa:** reactor, TPV, HTS; energía neta > 0 y escudo magnético ante CME.
3. **Ingeniero de propulsión y órbita:** lanzador, asistencia Venus, eyección del reactor.
4. **Director científico y telemetría:** sensores, agente IA, antena; muestrear sin sobrecalentar.

---

# ⚠ Puntos a validar contra datos reales (pedido: fidelidad NASA)
Estos números del documento no cuadran con la física o con misiones reales. Hay que decidir si se
corrigen o se declaran explícitamente como ficción ("tecnología futura") en el juego.

1. **850,000 km "del Sol":** el radio solar es ~696,000 km, así que sería ~1.22 R☉ desde el centro
   (~154,000 km sobre la superficie). El récord real de Parker Solar Probe es ~6.1 M km (9.86 R☉),
   ~192 km/s. A 1.22 R☉ la velocidad orbital sería del orden de 500 km/s, no 650,000 km/h (~180 km/s).
2. **Tiempo de 6–9 meses:** Parker necesitó 7 sobrevuelos de Venus en ~6 años para bajar a 9.86 R☉.
   Una sola asistencia en Venus no basta para anular la velocidad orbital terrestre (~29.8 km/s).
3. **Retorno a la Tierra con 450 kg:** el delta-V desde ese perihelio es enorme; el doc lo resuelve
   narrativamente (eyectar reactor), no con cálculo. Conviene un presupuesto de delta-V explícito (Tsiolkovsky).
4. **Reactor de 450 kW con 800 kg:** Kilopower (NASA) apunta a 1–10 kWe con ~400–1,500 kg. Es un salto grande.
5. **Temperaturas:** Parker a 9.86 R☉ ve ~1,400 °C en el escudo; a 1.22 R☉ sería mucho mayor que 3,000 °C.
6. **Referencia AIAA-2008-5712:** ya verificada (ver sección siguiente). Es el paper de Solar Probe+, y
   contradice al documento en varios puntos clave.
7. **Nombre:** "IKAROS" también es una misión real de JAXA (vela solar, 2010). Mejor "Proyecto Ikaros"
   con subtítulo propio, o "Icarus", para no confundir con la misión real.

Opciones de corrección: (a) misión realista tipo Parker (perihelio ~9.86 R☉, múltiples Venus flybys,
campaña de años) o (b) mantener 850,000 km como escenario "futurista" con modo Realista vs. Ficción.

---

# PAPER BASE DE IKAROS (verificado, leído completo)

**Landis, Schmitz, Kinnison, Fraeman, Roufberg, Vernon, Wirzburger. "Solar Power System Design for the
Solar Probe+ Mission." AIAA 2008-5712, 6th IECEC, Cleveland, 28–30 jul 2008. NASA Glenn + JHU/APL.**
PDF: https://ntrs.nasa.gov/api/citations/20090004577/downloads/20090004577.pdf (10 págs.)

**Decisión del equipo:** Ikaros usa información **teórica** (extensiones especulativas), pero el núcleo
debe respetar los datos del paper. Todo lo que no esté en el paper se etiqueta "TEÓRICO" en el juego.

## Datos reales del paper (usar tal cual en `data/`)
| Dato | Valor | Pág. |
|---|---|---|
| Perihelio mínimo | 9.5 R☉ desde el centro (0.044 AU; 8.5 R☉ sobre la superficie; ~6.6 M km). R☉ = 696,000 km | 1–2 |
| Intensidad solar en perihelio | ~510 × AM0 ≈ 700 kW/m² (AM0 = 1,367 W/m²) | 1–2 |
| Trayectoria | Venus gravity assist, 1.er perihelio <4 meses tras el lanzamiento a 0.18 AU; **7 sobrevuelos de Venus**; **24 pasadas** en **6.9 años** | 2 |
| Tiempo cerca del Sol | solo ~10 h a <10 R☉ en la pasada más cercana (3 pasadas ≤9.5 R☉) | 2 |
| Lanzamiento | C3 muy alto, misión limitada por masa | 6 |
| Potencia mínima requerida | **482 W** | 4 |
| Matriz principal | 2 alas × 1.5 m², 32 cadenas × 39 celdas triple unión (GaInP2/GaAs/Ge), reflectores tipo MESSENGER (2 por celda). Útil de 1 AU a ~0.25 AU (16 soles); inclinación hasta ~74° para mantener <180 °C; luego se pliega tras el escudo | 4 |
| Matriz secundaria de alto flujo | 2 matrices, 25 cadenas × 27 celdas concentradoras (~1 cm² c/u), ~28% eficiencia AM0 a 120 °C; lazo de refrigerante bombeado (ΔT 20 °C), radiadores a 100 °C (373 K), 3 por matriz, tras el escudo | 6–7 |
| Retracción de la matriz | se desliza tras un borde de cuchilla; en perihelio solo ~34 cm² de celda iluminada (una cadena parcial) | 7–8 |
| Térmica | Equilibrio αI = (εf+εr)σT⁴ (ec. 1); radiador Ar = [(1−η)/η]/(εσT⁴) por W (ec. 2); σ = 5.67×10⁻⁸ | 3, 5 |
| Límite de celdas | degradación irreversible ≳350 °C | 3 |
| Alternativa Stirling | 38% a 850 °C/90 °C (ASRG); ~26% del sistema; hot-end ~788 K a 0.25 AU; 36% con cold-end 315 K, 28% a 420 K | 5–6 |
| Alternativas descartadas | termoeléctrico (eficiencia muy baja), Stirling (sin herencia de vuelo), nuclear (concepto previo con Jupiter, caro) | 1, 5–6 |
| Conclusión | **Fotovoltaica activamente refrigerada**: menor masa y menor riesgo | 6 |

## Choques entre el documento Helios/Ikaros y el paper
| Documento | Paper | Propuesta |
|---|---|---|
| 850,000 km del Sol | 9.5 R☉ ≈ 6.6 M km | Usar 9.5 R☉ en modo real; 850,000 km solo en modo teórico |
| 6–9 meses total | 1.er perihelio <4 meses, misión 6.9 años | Campaña por perihelios (24 pasadas) o aislar el encuentro final |
| 1 asistencia en Venus | 7 sobrevuelos de Venus | Mecánica de "ventanas de Venus" repetidas |
| Reactor de fisión 450 kW | **No nuclear**; mínimo 482 W; PV | Reactor = módulo TEÓRICO opcional; la base es PV |
| Rejilla de 450+70 kW | potencia del orden de cientos de W | Escalar la economía de potencia a W (real) o kW (teórico) |
| Radiadores en sombra del escudo | igual (radiadores tras el escudo) | **Coincide**: mecánica fiel al paper |
| Enfriamiento con agua presurizada | lazo de refrigerante bombeado | Coincide en concepto |
| 3,000 °C | celdas <120 °C (diseño), <350 °C (límite) | Separar temperatura del escudo vs. de las celdas |
| Escudo carbono-carbono | escudo térmico plano (el material no se detalla en el paper) | Material TEÓRICO/etiquetar fuente aparte (el escudo real de Parker usa carbono-carbono, citar fuente NASA/APL) |
| Campo HTS, nanobots, eyección del reactor, cápsula de retorno | no aparecen | Todo TEÓRICO; sin retorno real (Parker no regresa) |

## Propuesta de mecánica fiel al paper (para el nivel 3)
- **Núcleo real (jugable y verificable):** gestionar la matriz secundaria durante el encuentro: retraer la
  matriz según la distancia para mantener la carga térmica ~constante (mecánica del paper), mantener celdas
  <120 °C, radiadores en sombra, potencia ≥ 482 W, inclinación de la matriz principal (~74°), y trade-off
  PV vs. Stirling vs. nuclear con masa, riesgo y eficiencia del paper.
- **Capa teórica (etiquetada):** reactor, HTS, nanobots, IA y cápsula de retorno, con su costo, masa y
  consumo como supuestos del juego, no datos NASA.
- Interruptor "Modo Paper (real)" vs "Modo Teórico (extensiones)" y nota educativa al final con la fuente.

---

# DECISIÓN: la "IA" del proyecto NO es una integración con ninguna IA

La "IA" / "Agente de Asistencia" del juego es un **personaje narrativo dentro del juego** (diegético) que
da datos curiosos, explicaciones y avisos. **No se conecta a ningún modelo ni API de IA.**

- **Contenido:** textos escritos de antemano (curiosidades, explicaciones de cada concepto, consejos), cada
  uno con fuente NASA citada, guardados en `data/` (JSON/Markdown) y disparados por eventos del juego
  (p. ej. al entrar a 0.25 AU, al retraer la matriz, al abrir una CME).
- **Mecánicas del documento que mencionan IA** (opción C de la CME: "delegar a la IA", 80% de éxito;
  rol Director Científico y Telemetría): se implementan como **reglas deterministas o probabilísticas
  normales** (un número aleatorio con semilla), sin IA real.
- **Stack:** sin SDK de IA, sin claves de API, sin llamadas externas para esto. Funciona offline.
- **Texto en el juego:** presentarlo como "Asistente de misión" (curiosidades y ayuda), no como inteligencia
  artificial real, para no inducir a error a jueces ni estudiantes.

---

# RECURSOS OFICIALES DEL RETO (pestaña Resources) — usar y citar

| Recurso | Uso en el juego |
|---|---|
| **Design and Develop Science Missions** (4 segmentos: lanzamiento, espacio, tierra, usuario) | Estructura del informe y del panel de misión; los 4 segmentos se pueden mapear a los 4 roles |
| **GMAT** (General Mission Analysis Tool, open source, NASA) | Validar nuestra física orbital: correr casos en GMAT y comparar con nuestro motor; citarlo como referencia de verificación |
| **Concept Maturity Levels (JPL), CML 1–4** | Progresión de cada nivel: idea → factibilidad → estudios de compromiso → diseño puntual |
| **Mission Design Lab (MDL)** (Office Hours, Concept Development, Trade Studies, Point Design) | Etapas de diseño por nivel; disciplinas a modelar: potencia, propulsión, térmica, estructura, comunicaciones, actitud, costo y riesgo |
| **NASA Mission Viz** | Referencia de visualización de trayectorias 3D y línea de tiempo |
| **A Learning Game About Telescopes** | Patrón a imitar: opciones restringidas por compatibilidad, 3 niveles, animación de lanzamiento y comparación final con **misiones reales NASA parecidas** (lo haremos en nuestro informe) |
| **CubeSat 101** | Contenido del tutorial y ConOps del nivel 1 y 2 |
| **Reto 2023 "Visualize a Space Mission Using VR"** | Referencia de requisitos: concepto, trayectorias, línea de tiempo, 3D |
| **CSA Digital Games and Activities** | Inspiración educativa; respetar los términos de uso de ese sitio (no es del gobierno de EE. UU.) |

Nota del sitio: NASA no respalda entidades no gubernamentales de EE. UU.; hay que cumplir los términos de datos de cada sitio.

# REGLAS DE LA COMPETENCIA (FAQ oficial, verificado hoy)
- Fechas: el evento es **14–15 nov 2026**. Hoy es 14 nov → el plazo es inmediato. La guía de envío (Project Submission Guide) estaba disponible desde el 13 nov.
- Uso de IA: **permitido** ("tools de Super Intelligence/SI" en el lenguaje del FAQ). Pero **"cada proyecto debe incluir una descripción de cómo se usaron las herramientas de SI durante el desarrollo"**.
  → Debe quedar esa descripción en el envío. Lo que se decide en los commits (autor, trailers) no la sustituye.

# PREFERENCIA SOBRE COMMITS Y ESTILO
- Commits con la identidad git del usuario como único autor. **Sin** `Co-Authored-By` de Claude, **sin** "Generated with…" en commits ni PRs.
- Mensajes de commit cortos y naturales (convención del equipo), sin boilerplate de herramientas.
- Código y comentarios sobrios, estilo del equipo; sin comentarios redundantes ni cabeceras de "generado por".
