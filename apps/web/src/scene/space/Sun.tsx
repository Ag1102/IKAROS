import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import { NOISE_GLSL } from "./noise.glsl";

export const SUN_RADIUS = 3;

// ---------- Fotosfera ----------

const surfaceVertex = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const surfaceFragment = /* glsl */ `
uniform float uTime;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 p = normalize(vPos);
  // Granulación: celdas pequeñas que hierven, sobre manchas grandes que derivan despacio.
  float cells = fbm(p * 26.0 + vec3(0.0, uTime * 0.08, uTime * 0.05));
  float meso = fbm(p * 6.0 - vec3(uTime * 0.02));
  float spots = smoothstep(0.72, 0.86, snoise(p * 3.1 + 11.0));
  float heat = clamp(0.72 + cells * 0.28 + meso * 0.16 - spots * 0.55, 0.0, 1.0);

  vec3 deep = vec3(0.45, 0.06, 0.0);
  vec3 orange = vec3(1.0, 0.42, 0.06);
  vec3 white = vec3(1.0, 0.9, 0.68);
  vec3 col = mix(deep, orange, smoothstep(0.1, 0.6, heat));
  col = mix(col, white, smoothstep(0.62, 1.0, heat));

  // Oscurecimiento del limbo, como en el Sol real.
  float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
  col *= 0.3 + 0.7 * pow(mu, 0.5);
  col = mix(col * vec3(1.0, 0.55, 0.3), col, smoothstep(0.0, 0.35, mu));
  gl_FragColor = vec4(col * 1.25, 1.0);
}
`;

// ---------- Corona ----------

const coronaVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Halo que mira a la cámara: brillo cercano al limbo y rayos (streamers) que se mueven despacio. */
const coronaFragment = /* glsl */ `
uniform float uTime;
uniform float uExtent;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 q = (vUv - 0.5) * 2.0 * uExtent;
  float r = length(q);
  if (r < 0.98) discard;
  float ang = atan(q.y, q.x);
  float h = r - 1.0;
  float inner = exp(-h * 9.0);
  float rays = 0.5 + 0.5 * snoise(vec3(cos(ang) * 2.2, sin(ang) * 2.2, uTime * 0.05 + h * 0.6));
  rays = pow(rays, 2.5);
  float outer = exp(-h * 1.6) * rays;
  float a = inner * 1.4 + outer * 0.55;
  vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.82, 0.55), inner);
  gl_FragColor = vec4(col * a, a);
}
`;

// ---------- Protuberancias ----------

const prominenceVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const prominenceFragment = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uLife;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  // Plasma que corre a lo largo del arco; se desvanece en los pies y en el borde del tubo.
  float flow = snoise(vec3(vUv.x * 9.0 - uTime * 0.9, vUv.y * 2.5, uSeed));
  float strands = 0.55 + 0.45 * snoise(vec3(vUv.x * 22.0 - uTime * 1.6, vUv.y * 6.0, uSeed + 7.0));
  float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  float edge = sin(vUv.y * 3.14159);
  float a = ends * edge * (0.45 + 0.55 * flow) * strands * uLife;
  vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.7, 0.3), flow * 0.5 + 0.5);
  gl_FragColor = vec4(col * 5.0 * a, a);
}
`;

// ---------- Partículas de eyección ----------

const particleVertex = /* glsl */ `
attribute float aLife;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (14.0 + 26.0 * aLife) * (1.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const particleFragment = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vLife;
  vec3 col = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.85, 0.5), vLife);
  gl_FragColor = vec4(col * 2.5 * a, a);
}
`;

/** Generador simple con semilla para que la escena sea igual en cada carga. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function randomOnSphere(rand: () => number): THREE.Vector3 {
  const u = rand() * 2 - 1;
  const t = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t));
}

interface Prominence {
  geometry: THREE.TubeGeometry;
  material: THREE.ShaderMaterial;
  period: number;
  phase: number;
}

/** Arco de plasma que nace y muere en la superficie. */
function makeProminence(rand: () => number, index: number): Prominence {
  const a = randomOnSphere(rand);
  const side = new THREE.Vector3().crossVectors(a, randomOnSphere(rand)).normalize();
  const span = 0.22 + rand() * 0.35;
  const b = a.clone().applyAxisAngle(side, span);
  const mid = a.clone().add(b).normalize();
  const height = 1.25 + rand() * 0.55;
  const r = SUN_RADIUS * 0.985;
  const curve = new THREE.CatmullRomCurve3([
    a.clone().multiplyScalar(r),
    a
      .clone()
      .lerp(mid, 0.3)
      .normalize()
      .multiplyScalar(r * (1 + (height - 1) * 0.7)),
    mid.clone().multiplyScalar(r * height),
    b
      .clone()
      .lerp(mid, 0.3)
      .normalize()
      .multiplyScalar(r * (1 + (height - 1) * 0.7)),
    b.clone().multiplyScalar(r),
  ]);
  const geometry = new THREE.TubeGeometry(curve, 96, 0.07 + rand() * 0.09, 10, false);
  const material = new THREE.ShaderMaterial({
    vertexShader: prominenceVertex,
    fragmentShader: prominenceFragment,
    uniforms: { uTime: { value: 0 }, uSeed: { value: index * 13.7 }, uLife: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return { geometry, material, period: 7 + rand() * 9, phase: rand() };
}

const PARTICLES = 700;

/** Eyecciones: ráfagas de partículas que salen de un punto de la superficie y se apagan. */
function Eruptions({ speed }: { speed: number }) {
  const points = useRef<THREE.Points>(null);
  const sim = useMemo(() => {
    const rand = seeded(91);
    return {
      rand,
      pos: new Float32Array(PARTICLES * 3),
      vel: new Float32Array(PARTICLES * 3),
      life: new Float32Array(PARTICLES),
      next: 0,
      cooldown: 0.5,
    };
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sim.pos, 3));
    g.setAttribute("aLife", new THREE.BufferAttribute(sim.life, 1));
    return g;
  }, [sim]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05) * speed;
    sim.cooldown -= dt;
    if (sim.cooldown <= 0) {
      // Nueva ráfaga en un punto al azar, sesgada hacia el lado visible.
      sim.cooldown = 2.2 + sim.rand() * 3.5;
      const site = randomOnSphere(sim.rand);
      site.z = Math.abs(site.z) * 0.6 + 0.2;
      site.normalize();
      const count = 90 + Math.floor(sim.rand() * 90);
      for (let k = 0; k < count; k++) {
        const i = sim.next;
        sim.next = (sim.next + 1) % PARTICLES;
        const jitter = randomOnSphere(sim.rand).multiplyScalar(0.35);
        const dir = site.clone().add(jitter).normalize();
        const start = site.clone().multiplyScalar(SUN_RADIUS);
        const v = 0.9 + sim.rand() * 2.2;
        sim.pos.set([start.x, start.y, start.z], i * 3);
        sim.vel.set([dir.x * v, dir.y * v, dir.z * v], i * 3);
        sim.life[i] = 1;
      }
    }
    for (let i = 0; i < PARTICLES; i++) {
      const life = sim.life[i] ?? 0;
      if (life <= 0) continue;
      const o = i * 3;
      // La gravedad del Sol frena el material y lo hace caer en arco.
      const x = sim.pos[o] ?? 0;
      const y = sim.pos[o + 1] ?? 0;
      const z = sim.pos[o + 2] ?? 0;
      const r = Math.hypot(x, y, z) || 1;
      const g = 1.3 / (r * r);
      sim.vel[o] = (sim.vel[o] ?? 0) - (x / r) * g * dt;
      sim.vel[o + 1] = (sim.vel[o + 1] ?? 0) - (y / r) * g * dt;
      sim.vel[o + 2] = (sim.vel[o + 2] ?? 0) - (z / r) * g * dt;
      sim.pos[o] = x + (sim.vel[o] ?? 0) * dt;
      sim.pos[o + 1] = y + (sim.vel[o + 1] ?? 0) * dt;
      sim.pos[o + 2] = z + (sim.vel[o + 2] ?? 0) * dt;
      sim.life[i] = Math.max(0, life - dt * 0.32);
      if (r < SUN_RADIUS * 0.98) sim.life[i] = 0;
    }
    const attrs = points.current?.geometry.attributes;
    if (attrs?.position && attrs.aLife) {
      attrs.position.needsUpdate = true;
      attrs.aLife.needsUpdate = true;
    }
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

const CORONA_EXTENT = 4.5;

/** Sol del menú: fotosfera animada, dos capas de corona, protuberancias y eyecciones. */
export function Sun({ speed = 1 }: { speed?: number }) {
  const group = useRef<THREE.Group>(null);
  const surface = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: surfaceVertex,
        fragmentShader: surfaceFragment,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );
  const corona = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coronaVertex,
        fragmentShader: coronaFragment,
        uniforms: { uTime: { value: 0 }, uExtent: { value: CORONA_EXTENT } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const prominences = useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: 9 }, (_, i) => makeProminence(rand, i));
  }, []);
  const time = useRef(0);

  useFrame((_, delta) => {
    time.current += Math.min(delta, 0.05) * speed;
    const t = time.current;
    surface.uniforms.uTime!.value = t;
    corona.uniforms.uTime!.value = t;
    for (const p of prominences) {
      p.material.uniforms.uTime!.value = t;
      // Cada arco crece, brilla y se apaga en su propio ciclo.
      const cycle = (t / p.period + p.phase) % 1;
      p.material.uniforms.uLife!.value = Math.sin(Math.PI * cycle) ** 1.5;
    }
    if (group.current) group.current.rotation.y = t * 0.02;
  });

  return (
    <group>
      <group ref={group}>
        <mesh material={surface}>
          <sphereGeometry args={[SUN_RADIUS, 128, 128]} />
        </mesh>
        {prominences.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={p.material} />
        ))}
        <Eruptions speed={speed} />
      </group>
      <Billboard>
        <mesh material={corona} renderOrder={-1}>
          <planeGeometry args={[SUN_RADIUS * CORONA_EXTENT * 2, SUN_RADIUS * CORONA_EXTENT * 2]} />
        </mesh>
      </Billboard>
    </group>
  );
}
