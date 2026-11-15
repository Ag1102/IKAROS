// Dato corto que aparece al terminar cada reto: una idea, con su fuente. Lo ⚗ se marca.
import { tr } from "../i18n";

export interface Lesson {
  text: string;
  source: string;
}

export type LessonId =
  | "venus-boost"
  | "venus-levers"
  | "fold"
  | "stability"
  | "cme"
  | "nanobots"
  | "hts"
  | "reactor"
  | "samples"
  | "eject"
  | "reentry"
  | "hohmann"
  | "eva"
  | "insertion"
  | "inclination"
  | "capture"
  | "cooling"
  | "record"
  | "dive";

export function lesson(id: LessonId): Lesson {
  const P = "Landis et al., AIAA 2008-5712";
  switch (id) {
    case "venus-boost":
      return {
        text: tr(
          "Cada sobrevuelo de Venus frena la sonda respecto al Sol sin gastar combustible: así baja el perihelio.",
          "Each Venus flyby slows the probe relative to the Sun without fuel: that is how the perihelion drops.",
        ),
        source: `${P}, p. 2`,
      };
    case "venus-levers":
      return {
        text: tr(
          "Para aprovechar a Venus hay que pasar por un corredor estrecho: unos kilómetros de error cambian la órbita final.",
          "To use Venus you must fly through a narrow corridor: a few kilometres off changes the final orbit.",
        ),
        source: "NASA JPL, Basics of Space Flight",
      };
    case "fold":
      return {
        text: tr(
          "A 0,25 AU la luz es 16 veces la de la Tierra: la matriz principal se guarda tras el escudo.",
          "At 0.25 AU sunlight is 16 times Earth's: the main array is stowed behind the shield.",
        ),
        source: `${P}, p. 4`,
      };
    case "stability":
      return {
        text: tr(
          "La luz crece con 1/d²: en el perihelio bastan unos 34 cm² de celdas para dar 482 W.",
          "Light grows as 1/d²: at perihelion about 34 cm² of cells give 482 W.",
        ),
        source: `${P}, p. 4 y 7-8`,
      };
    case "cme":
      return {
        text: tr(
          "Parker Solar Probe atravesó eyecciones de masa coronal y midió su plasma desde dentro.",
          "Parker Solar Probe flew through coronal mass ejections and measured their plasma from inside.",
        ),
        source: "NASA, Parker Solar Probe",
      };
    case "nanobots":
      return {
        text: tr(
          "⚗ Los nanobots reparadores son ficción del juego; el escudo real de Parker es de carbono-carbono.",
          "⚗ Repair nanobots are game fiction; Parker's real shield is carbon-carbon composite.",
        ),
        source: "NASA/JHU-APL, Thermal Protection System",
      };
    case "hts":
      return {
        text: tr(
          "⚗ Un campo magnético superconductor como escudo es una idea en estudio, no vuela en ninguna sonda.",
          "⚗ A superconducting magnetic shield is a concept under study; no probe flies one.",
        ),
        source: tr("Supuesto del juego", "Game assumption"),
      };
    case "reactor":
      return {
        text: tr(
          "Las barras de control absorben neutrones y frenan la fisión. Kilopower, el reactor espacial de NASA, apunta a 1-10 kW.",
          "Control rods absorb neutrons and slow fission. Kilopower, NASA's space reactor, targets 1-10 kW.",
        ),
        source: "NASA Glenn, Kilopower",
      };
    case "samples":
      return {
        text: tr(
          "⚗ Parker no recoge muestras: mide partículas y campos en el lugar con sus instrumentos.",
          "⚗ Parker collects no samples: it measures particles and fields in place with its instruments.",
        ),
        source: "NASA, Parker Solar Probe: instrumentos",
      };
    case "eject":
      return {
        text: tr(
          "Stardust y OSIRIS-REx soltaron cápsulas con muestras en la ventana justa para caer en Utah.",
          "Stardust and OSIRIS-REx released sample capsules in the exact window to land in Utah.",
        ),
        source: "NASA, Stardust; NASA, OSIRIS-REx",
      };
    case "reentry":
      return {
        text: tr(
          "Una entrada muy pendiente quema la cápsula; una muy plana la hace rebotar en la atmósfera.",
          "Too steep an entry burns the capsule; too shallow makes it skip off the atmosphere.",
        ),
        source: "NASA, Entry, Descent and Landing",
      };
    case "hohmann":
      return {
        text: tr(
          "La transferencia de Hohmann sube de órbita con dos encendidos y el mínimo combustible.",
          "A Hohmann transfer climbs between orbits with two burns and the least fuel.",
        ),
        source: "NASA JPL, Basics of Space Flight",
      };
    case "eva":
      return {
        text: tr(
          "En la STS-120 (2007) Parazynski cosió el panel P6 roto colgado del brazo robótico de la estación.",
          "On STS-120 (2007) Parazynski stitched the torn P6 array while riding the station's robotic arm.",
        ),
        source: "NASA/ESA, STS-120",
      };
    case "insertion":
      return {
        text: tr(
          "En órbita se cae todo el tiempo, pero tan de lado que la Tierra se curva antes: unos 7,5 km/s a 700 km.",
          "In orbit you fall all the time, but so sideways the Earth curves away: about 7.5 km/s at 700 km.",
        ),
        source: "Ecuación vis-viva · NASA JPL",
      };
    case "inclination":
      return {
        text: tr(
          "La inclinación decide qué latitudes ves: una órbita polar pasa sobre todo el planeta.",
          "Inclination decides which latitudes you see: a polar orbit passes over the whole planet.",
        ),
        source: "NASA Earth Observatory, Catalog of Earth Satellite Orbits",
      };
    case "cooling":
      return {
        text: tr(
          "Un reactor en el espacio no puede tirar el calor al aire: lo lleva un lazo de refrigerante hasta radiadores que miran al vacío, siempre a la sombra del escudo.",
          "A reactor in space cannot dump heat into the air: a coolant loop carries it to radiators facing the void, always in the shield's shadow.",
        ),
        source: "NASA Glenn, Kilopower; Landis et al., AIAA 2008-5712, p. 7",
      };
    case "record":
      return {
        text: tr(
          "El récord real es de Parker Solar Probe: 6,1 millones de km de la superficie del Sol (9,86 R☉), a 192 km/s, el 24 de diciembre de 2024.",
          "The real record belongs to Parker Solar Probe: 6.1 million km from the Sun's surface (9.86 R☉), at 192 km/s, on 24 December 2024.",
        ),
        source: "NASA, Parker Solar Probe",
      };
    case "dive":
      return {
        text: tr(
          "⚗ A 850.000 km la luz es unas 30.000 veces la de la Tierra: ninguna celda solar sobrevive. Por eso la zambullida necesita el reactor, su enfriamiento y el campo magnético.",
          "⚗ At 850,000 km sunlight is about 30,000 times Earth's: no solar cell survives. That is why the dive needs the reactor, its cooling and the magnetic field.",
        ),
        source: tr(
          "Ley del inverso del cuadrado; documento Proyecto Ikaros",
          "Inverse-square law; Proyecto Ikaros document",
        ),
      };
    case "capture":
      return {
        text: tr(
          "Landsat 8 vuelve a fotografiar el mismo lugar cada 16 días desde su órbita heliosíncrona.",
          "Landsat 8 images the same place again every 16 days from its sun-synchronous orbit.",
        ),
        source: "NASA/USGS, Landsat 8",
      };
  }
}
