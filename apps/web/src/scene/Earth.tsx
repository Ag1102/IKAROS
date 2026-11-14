import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { NOISE_GLSL } from "./space/noise.glsl";

const cloudsMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vWorldNormal;
      void main() {
        vPos = position;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSun;
      varying vec3 vPos;
      varying vec3 vWorldNormal;
      ${NOISE_GLSL}
      void main() {
        vec3 p = normalize(vPos);
        // Bandas de nubes: más en latitudes medias y en el ecuador, menos en los subtrópicos.
        float lat = abs(p.y);
        float belts = 0.55 + 0.25 * cos(lat * 9.0);
        float n = fbm(p * 3.2 + vec3(uTime * 0.004, 0.0, uTime * 0.002));
        float c = smoothstep(0.62 - belts * 0.2, 0.92, n * 0.5 + 0.5);
        float light = clamp(dot(vWorldNormal, uSun) * 1.4 + 0.15, 0.0, 1.0);
        gl_FragColor = vec4(vec3(1.0) * light, c * 0.75);
      }`,
    transparent: true,
    depthWrite: false,
  });

const atmosphereMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorldNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorldNormal;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.5);
        // La atmósfera brilla del lado de día y se apaga en la noche.
        float day = smoothstep(-0.3, 0.4, dot(vWorldNormal, uSun));
        gl_FragColor = vec4(vec3(0.32, 0.62, 1.0) * rim * day * 1.3, rim * day);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

/**
 * Tierra con la textura de NASA (Earth (A)) sin modificar (public/CREDITS.md), más una capa
 * de nubes procedural y la atmósfera. `sun` es la dirección del Sol en la escena.
 */
export function Earth({
  radius,
  sun,
  spin = 0.02,
}: {
  radius: number;
  sun?: THREE.Vector3 | (() => THREE.Vector3);
  spin?: number;
}) {
  const body = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const map = useTexture("/textures/earth.jpg");
  const cloudMat = useMemo(cloudsMaterial, []);
  const airMat = useMemo(atmosphereMaterial, []);
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  }, [map]);

  useFrame((_, dt) => {
    if (body.current) body.current.rotation.y += dt * spin;
    if (clouds.current) clouds.current.rotation.y += dt * spin * 1.15;
    cloudMat.uniforms.uTime!.value += dt;
    const dir = typeof sun === "function" ? sun() : sun;
    if (dir) {
      const d = dir.clone().normalize();
      cloudMat.uniforms.uSun!.value.copy(d);
      airMat.uniforms.uSun!.value.copy(d);
    }
  });

  return (
    <group>
      <mesh ref={body}>
        <sphereGeometry args={[radius, 96, 64]} />
        <meshStandardMaterial map={map} roughness={0.9} metalness={0} />
      </mesh>
      <mesh ref={clouds} material={cloudMat} scale={1.008}>
        <sphereGeometry args={[radius, 96, 64]} />
      </mesh>
      <mesh material={airMat} scale={1.035}>
        <sphereGeometry args={[radius, 64, 48]} />
      </mesh>
    </group>
  );
}
