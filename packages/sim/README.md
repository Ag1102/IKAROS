# @ikaros/sim

Motor de simulación. Uso general en el README raíz. Notas para el cliente:

- En el hangar el reloj de misión no corre: `step` no hace nada hasta `launch`. Los límites de tiempo
  cuentan desde el lanzamiento.
- `step(dt_s)` acepta cualquier tamaño (subpasos internos, máximo un año por llamada) e ignora `dt` no
  finito o ≤ 0. El resultado no depende del tamaño del paso: un paso por fotograma funciona.
- El crucero del nivel 3 dura ~18 meses de misión entre ventanas de Venus: hace falta acelerar el tiempo.
  El encuentro dura ~10 días; lo interesante son ~10 h cerca del perihelio.
- En perihelio la matriz secundaria queda ~97–98 % retraída (~25–35 cm² iluminados de 1350). Conviene
  un control en escala logarítmica sobre `array_illuminated_cm2` y convertirlo a `fraction`.
- Catálogo del hangar y parámetros: `scenario(id)` o `data/scenarios/*.json`. Textos del asistente:
  `content/assistant.json`, por `SimEvent.trigger`.
- `src/autopilot.ts` juega los niveles solo (pruebas, demo o modo atracción).
