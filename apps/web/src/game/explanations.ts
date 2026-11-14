// Explicaciones del botón «¿Por qué?». Cortas: una idea, la fórmula y la fuente.
import { tr } from "../i18n";

export type WhyKey = "insertion" | "inclination" | "hohmann" | "heat";

export function why(key: WhyKey): { text: string; formula: string; source: string } {
  switch (key) {
    case "insertion":
      return {
        text: tr(
          "Para quedarse en órbita, el satélite debe ir de lado tan rápido que, mientras cae, la Tierra se curva debajo de él. Más lento cae; mucho más rápido escapa.",
          "To stay in orbit, the satellite must move sideways so fast that, as it falls, the Earth curves away beneath it. Slower and it falls; much faster and it escapes.",
        ),
        formula: tr("v = √(μ / r)   ·   escape: √(2μ / r)", "v = √(μ / r)   ·   escape: √(2μ / r)"),
        source: tr(
          "Ecuación vis-viva · NASA JPL, Basics of Space Flight",
          "Vis-viva equation · NASA JPL, Basics of Space Flight",
        ),
      };
    case "inclination":
      return {
        text: tr(
          "La inclinación es el ángulo de la órbita respecto al ecuador. El satélite solo sobrevuela latitudes menores que ella: una órbita ecuatorial nunca ve los bosques del norte.",
          "Inclination is the angle between the orbit and the equator. The satellite only flies over latitudes lower than it: an equatorial orbit never sees the northern forests.",
        ),
        formula: tr("latitud máxima = i   (o 180° − i si i > 90°)", "max latitude = i   (or 180° − i if i > 90°)"),
        source: tr("Geometría orbital · NASA Earth Observatory", "Orbital geometry · NASA Earth Observatory"),
      };
    case "hohmann":
      return {
        text: tr(
          "Para subir de órbita se acelera en la dirección del movimiento. El impulso estira la órbita hacia arriba; al llegar arriba, el motor la vuelve redonda.",
          "To climb, you speed up along your direction of motion. The push stretches the orbit upward; at the top, the engine makes it round again.",
        ),
        formula: tr("Transferencia de Hohmann: Δv = Δv₁ + Δv₂", "Hohmann transfer: Δv = Δv₁ + Δv₂"),
        source: "NASA JPL, Basics of Space Flight",
      };
    case "heat":
      return {
        text: tr(
          "Cerca del Sol la luz es unas 500 veces más fuerte que en la Tierra. La sonda esconde casi toda la matriz solar tras el escudo para recibir siempre la misma cantidad de luz.",
          "Near the Sun, light is about 500 times stronger than at Earth. The probe hides almost all of its solar array behind the shield to keep receiving the same amount of light.",
        ),
        formula: tr(
          "intensidad = 1 / d²   (d en unidades astronómicas)",
          "intensity = 1 / d²   (d in astronomical units)",
        ),
        source: "Landis et al., AIAA 2008-5712",
      };
  }
}
