# data/

Every numeric value in the game lives here, never in the interface code.

Each value carries: `value`, `unit`, `source` (citation or URL), `retrieved` (date) and `origin`
(`real` or `theoretical`). Example:

```json
{
  "perihelion_radii_rsun": {
    "value": 9.5,
    "unit": "R_sun",
    "source": "Landis et al., AIAA 2008-5712, p. 2",
    "retrieved": "2026-11-14",
    "origin": "real"
  }
}
```

- `scenarios/`: definition of each level (written by the engine, read by the client).
