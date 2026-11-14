import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { C } from "../data/sources";
import { SCENE_UNIT_KM, planeToScene } from "../sim/orbit";

/** Anillo de órbita circular cuyo radio sigue a una altitud que cambia. */
export function OrbitRing({
  altitude,
  inclination_deg,
  color,
  opacity,
  dashed = false,
}: {
  altitude: () => number | null;
  inclination_deg: number;
  color: string;
  opacity: number;
  dashed?: boolean;
}) {
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(...planeToScene(Math.cos(a) * SCENE_UNIT_KM, Math.sin(a) * SCENE_UNIT_KM, inclination_deg)),
      );
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.03, gapSize: 0.02 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.LineLoop(geo, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [color, opacity, dashed, inclination_deg]);
  useFrame(() => {
    const alt = altitude();
    line.visible = alt !== null;
    if (alt !== null) line.scale.setScalar((C.earthRadius + alt) / SCENE_UNIT_KM);
  });
  return <primitive object={line} />;
}
