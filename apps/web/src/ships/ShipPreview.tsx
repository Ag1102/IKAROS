import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Spacecraft, type Selection, type ShipKind } from "./Spacecraft";

/** Modelo de NASA sin modificar, normalizado a tamaño 1 (public/CREDITS.md). */
export function NasaModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { model, scale } = useMemo(() => {
    const model = scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return { model, scale: 1 / Math.max(size.x, size.y, size.z, 1e-9) };
  }, [scene]);
  return <primitive object={model} scale={scale} />;
}

/**
 * Vista previa del hangar: la nave armada gira sobre una plataforma. La pieza que se está
 * mirando en la lista aparece montada y resaltada.
 */
export function ShipPreview({
  kind,
  selected,
  highlight,
  nasaUrl,
}: {
  kind: ShipKind;
  selected: Selection;
  highlight?: string | null;
  /** Si se indica, se muestra este modelo de NASA en lugar del diseño propio. */
  nasaUrl?: string | null;
}) {
  return (
    <Canvas camera={{ position: [1.5, 0.95, -1.35], fov: 35, near: 0.01, far: 50 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1014"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 2]} intensity={2.2} />
      <directionalLight position={[-3, -1, -2]} intensity={0.5} color="#5fb4c4" />
      <group position={[0, 0.05, 0]}>
        {nasaUrl ? (
          <Suspense fallback={null}>
            {/* El modelo de Parker mira a −Z con el escudo; se gira para verlo de frente como el diseño propio. */}
            <group rotation={[0, Math.PI, 0]}>
              <NasaModel url={nasaUrl} />
            </group>
          </Suspense>
        ) : (
          <Spacecraft kind={kind} selected={selected} highlight={highlight} />
        )}
      </group>
      <gridHelper args={[2.4, 12, "#243038", "#16202a"]} position={[0, -0.55, 0]} />
      <OrbitControls autoRotate autoRotateSpeed={1.4} enablePan={false} minDistance={1.2} maxDistance={5} />
    </Canvas>
  );
}
