# data/

Todo valor numérico del juego vive aquí, nunca en el código de la interfaz.

Cada valor lleva: `value`, `unit`, `source` (cita o URL), `retrieved` (fecha) y `origin`
(`real` o `theoretical`). Ejemplo:

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

- `scenarios/`: definición de cada nivel (la escribe el motor, la lee el cliente).
