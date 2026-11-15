import { tr } from "../i18n";

export interface MenuLevel {
  n: 1 | 2 | 3;
  name: string;
  tag: string;
  text: string;
  ready: boolean;
}

/** Misiones del menú, con sus textos en el idioma actual. */
export function menuLevels(): MenuLevel[] {
  return [
    {
      n: 1,
      name: tr("Acople con la ISS", "Docking with the ISS"),
      tag: "LEO · 415 km",
      text: tr(
        "Persigue a la Estación Espacial y acóplate pilotando el transbordador.",
        "Chase the Space Station and dock by flying the shuttle.",
      ),
      ready: true,
    },
    {
      n: 2,
      name: tr("Observación de la Tierra", "Earth observation"),
      tag: tr("LEO · Heliosíncrona", "LEO · Sun-synchronous"),
      text: tr(
        "Diseña, lanza y opera un satélite en órbita baja durante 3 días.",
        "Design, launch and operate a satellite in low Earth orbit for 3 days.",
      ),
      ready: true,
    },
    {
      n: 3,
      name: "Ikaros",
      tag: tr("Perihelio · 9.5 R☉", "Perihelion · 9.5 R☉"),
      text: tr(
        "Encuentro solar basado en Solar Probe+. Hangar, encuentro e informe.",
        "Solar encounter based on Solar Probe+. Hangar, encounter and report.",
      ),
      ready: true,
    },
  ];
}

/** Misiones del menú en español; solo para lo que no depende del idioma (número y estado). */
export const LEVELS: MenuLevel[] = menuLevels();
