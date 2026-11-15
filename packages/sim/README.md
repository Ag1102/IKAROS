# @ikaros/sim

Simulation engine. General usage is in the root README. Notes for the client:

- The mission clock does not run in the hangar: `step` does nothing until `launch`. Time limits
  count from launch.
- `step(dt_s)` accepts any size (internal substeps, at most one year per call) and ignores non-finite
  or ≤ 0 `dt`. The result does not depend on step size: one step per frame works.
- The level 3 cruise lasts ~18 mission months between Venus windows: time acceleration is needed.
  The encounter lasts ~10 days; the interesting part is ~10 h near perihelion.
- At perihelion the secondary array is ~97–98 % retracted (~25–35 cm² lit out of 1350). A
  log-scale control over `array_illuminated_cm2`, converted to `fraction`, works well.
- Hangar catalog and parameters: `scenario(id)` or `data/scenarios/*.json`. Assistant texts:
  `content/assistant.json`, by `SimEvent.trigger`.
- `src/autopilot.ts` plays the levels on its own (tests, demo or attract mode).
