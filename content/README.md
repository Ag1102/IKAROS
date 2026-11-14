# content/

Textos del juego escritos por el equipo: curiosidades del asistente de misión, glosario,
comparaciones con misiones reales. Cada texto lleva su fuente.

- `assistant.json`: lista de `ContentEntry` `{ id, trigger, text, source, origin }`. `trigger` coincide con
  `SimEvent.trigger` del motor (p. ej. `level3:cme`). Un mismo disparador puede tener varios textos.
- `glossary.json`: lista de `GlossaryEntry` `{ term, definition, source }`.
- Lo teórico empieza con ⚗ y lleva `origin: "theoretical"`.
