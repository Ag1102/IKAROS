// Modelos de NASA 3D Resources usados sin modificar (public/CREDITS.md), con su tamaño real.

export interface NasaModelInfo {
  url: string;
  name: string;
  /** Dimensión mayor real, km. */
  size_km: number;
}

export const MODELS = {
  hubble: { url: "/models/hubble.glb", name: "Hubble Space Telescope", size_km: 0.0132 },
  shuttle: { url: "/models/space-shuttle.glb", name: "Space Shuttle", size_km: 0.0372 },
  landsat: { url: "/models/landsat-8.glb", name: "Landsat 8", size_km: 0.0099 },
  cubesat: { url: "/models/cubesat-2u.glb", name: "CubeSat 2U", size_km: 0.00023 },
  parker: { url: "/models/parker-solar-probe.glb", name: "Parker Solar Probe", size_km: 0.003 },
} satisfies Record<string, NasaModelInfo>;
