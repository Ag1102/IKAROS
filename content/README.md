# content/

Game texts written by the team: mission-assistant fun facts, glossary, comparisons with real
missions. Every text carries its source.

- `assistant.json`: list of `ContentEntry` `{ id, trigger, text, source, origin }`. `trigger` matches the
  engine's `SimEvent.trigger` (e.g. `level3:cme`). One trigger can have several texts.
- `glossary.json`: list of `GlossaryEntry` `{ term, definition, source }`.
- Theoretical entries start with ⚗ and carry `origin: "theoretical"`.
