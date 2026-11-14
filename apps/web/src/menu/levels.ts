export interface MenuLevel {
  n: 1 | 2 | 3;
  name: string;
  tag: string;
  text: string;
  ready: boolean;
}

export const LEVELS: MenuLevel[] = [
  {
    n: 1,
    name: "Servicio en órbita",
    tag: "LEO · 480 km",
    text: "Reparar un satélite: transferencia de Hohmann y ventanas de comunicación.",
    ready: true,
  },
  {
    n: 2,
    name: "Observación de la Tierra",
    tag: "LEO · Heliosíncrona",
    text: "Diseña, lanza y opera un satélite en órbita baja durante 3 días.",
    ready: true,
  },
  {
    n: 3,
    name: "Ikaros",
    tag: "Perihelio · 9.5 R☉",
    text: "Encuentro solar basado en Solar Probe+. Hangar, encuentro e informe.",
    ready: true,
  },
];
