# Uso de herramientas de IA en el desarrollo (borrador para el envío)

El FAQ de Space Apps pide describir cómo se usaron las herramientas de IA. Borrador de la parte de Persona A
(simulación, datos y contenido); Persona B completa la suya.

- **Herramienta:** asistente de programación con IA (Claude Code), usado bajo supervisión del equipo.
- **Para qué se usó:** escribir el motor de simulación (`packages/sim`), la simulación falsa (`packages/sim-mock`),
  las pruebas, y pasar a JSON los datos del paper Landis et al. (AIAA 2008-5712) y de fichas públicas de NASA.
- **Qué revisó el equipo:** cada valor de `data/` lleva su fuente; las fórmulas se comprueban con casos conocidos del
  paper en `tests/physics.test.ts`. Los valores marcados con una nota "verificar" deben contrastarse a mano antes
  del envío.
- **Lo que no hace la IA:** el juego no se conecta a ningún modelo ni API. El "asistente de misión" son textos fijos
  escritos con fuente (`content/`); la opción "delegar al asistente" de la CME es un número aleatorio con semilla.
