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
  /** Posición de la cámara respecto a `home` al dejar de seguir (vista general). */
  homeOffset?: THREE.Vector3;
  follow: boolean;
  minDistance: number;
  maxDistance: number;
}

/**
 * Cámara libre: girar, zoom y desplazar con el ratón. Con `follow` activo el objetivo
 * arrastra la cámara con él y se conservan el ángulo y el zoom elegidos.
 */
export function FollowControls({ getTarget, offset, home, homeOffset, follow, minDistance, maxDistance }: Props) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const last = useRef<THREE.Vector3 | null>(null);
  const getTargetRef = useRef(getTarget);
  const offsetRef = useRef(offset);
  const homeRef = useRef(home);
  const homeOffsetRef = useRef(homeOffset);
  const started = useRef(false);
  getTargetRef.current = getTarget;
  offsetRef.current = offset;
  homeRef.current = home;
  homeOffsetRef.current = homeOffset;

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
      // Al montar se respeta la cámara inicial; al apagar el seguimiento, vista general.
      if (started.current && homeOffsetRef.current) camera.position.copy(homeRef.current).add(homeOffsetRef.current);
    }
    started.current = true;
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
