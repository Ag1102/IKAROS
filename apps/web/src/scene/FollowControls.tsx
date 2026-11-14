import { useEffect, useRef, type ElementRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  /** Punto que la cámara acompaña cuando `follow` está activo. */
  getTarget: () => THREE.Vector3;
  /** Posición de la cámara respecto al objetivo al empezar a seguirlo. */
  offset: () => THREE.Vector3;
  /** Punto de giro al dejar de seguir. Si no se indica, se queda donde estaba el objetivo. */
  home?: THREE.Vector3;
  follow: boolean;
  minDistance: number;
  maxDistance: number;
}

/**
 * Cámara libre: girar, zoom y desplazar con el ratón. Con `follow` activo el objetivo
 * arrastra la cámara con él y se conservan el ángulo y el zoom elegidos.
 */
export function FollowControls({ getTarget, offset, home, follow, minDistance, maxDistance }: Props) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const last = useRef<THREE.Vector3 | null>(null);
  const getTargetRef = useRef(getTarget);
  const offsetRef = useRef(offset);
  const homeRef = useRef(home);
  getTargetRef.current = getTarget;
  offsetRef.current = offset;
  homeRef.current = home;

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (follow) {
      const t = getTargetRef.current();
      camera.position.copy(t).add(offsetRef.current());
      c.target.copy(t);
      last.current = t.clone();
    } else if (homeRef.current) {
      c.target.copy(homeRef.current);
    }
    c.update();
  }, [follow, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const t = getTargetRef.current();
    if (follow && last.current) {
      camera.position.add(t.clone().sub(last.current));
      c.target.copy(t);
    }
    last.current = t;
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableZoom
      zoomSpeed={0.9}
      rotateSpeed={0.6}
      panSpeed={0.8}
      minDistance={minDistance}
      maxDistance={maxDistance}
    />
  );
}
