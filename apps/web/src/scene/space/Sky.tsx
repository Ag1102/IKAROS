import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NOISE_GLSL } from "./noise.glsl";

/**
 * Fondo de cielo: banda tenue de la Vía Láctea con nebulosidad y polvo oscuro, en una esfera
 * que sigue a la cámara. Las estrellas puntuales las pone <Stars> encima.
 */
export function Sky({ radius = 1000, intensity = 1 }: { radius?: number; intensity?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uIntensity: { value: intensity } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uIntensity;
          varying vec3 vDir;
          ${NOISE_GLSL}
          void main() {
            // Plano galáctico inclinado respecto a la escena.
            vec3 n = normalize(vec3(0.25, 0.92, 0.3));
            float b = dot(vDir, n);
            float band = exp(-b * b * 40.0);
            float clouds = fbm(vDir * 4.0) * 0.5 + 0.5;
            float dust = smoothstep(0.45, 0.75, fbm(vDir * 9.0 + 3.0) * 0.5 + 0.5);
            float glow = band * pow(clouds, 1.8) * (1.0 - dust * 0.8);
            vec3 col = mix(vec3(0.03, 0.04, 0.07), vec3(0.11, 0.1, 0.13), clouds) * glow;
            col += vec3(0.004, 0.006, 0.012);
            gl_FragColor = vec4(col * uIntensity, 1.0);
          }`,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [intensity],
  );
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 64, 32]} />
    </mesh>
  );
}
