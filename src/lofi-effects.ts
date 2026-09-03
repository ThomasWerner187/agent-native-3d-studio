import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/** One GPU particle draw; no per-frame CPU particle simulation or buffer uploads. */
export function chimneySmoke() {
  const geometry = new THREE.BufferGeometry();
  const count = 42;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(Float32Array.from({ length: count }, (_, i) => i / count), 1));
  const uniforms = { uTime: { value: 0 }, uHeight: { value: 720 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uTime; uniform float uHeight; attribute float aPhase;
      varying float vLife; varying float vSeed;
      void main() {
        float age = fract(aPhase + uTime * 0.045);
        float seed = fract(aPhase * 17.17);
        vLife = smoothstep(0.0, 0.09, age) * (1.0 - smoothstep(0.4, 1.0, age));
        vSeed = seed + uTime * 0.016;
        vec3 p = vec3(-0.8, 4.83, -0.9);
        p.y += age * 3.8;
        p.x += age * 0.7 + sin(age * 6.0 + uTime * 0.12) * age * 0.55;
        p.z += sin(age * 5.0 + seed * 3.0 + uTime * 0.1) * age * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float scale = length(modelViewMatrix[0].xyz);
        gl_PointSize = (0.24 + age * 1.7) * scale * uHeight * 0.5 * projectionMatrix[1][1] / max(0.1, -mv.z);
      }`,
    fragmentShader: `
      varying float vLife; varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float cloud = noise(uv * 5.0 + vSeed * 7.0) * 0.65 + noise(uv * 11.0 - vSeed * 3.0) * 0.35;
        float edge = 1.0 - smoothstep(0.15, 0.5, length(uv));
        float alpha = edge * cloud * vLife * 0.16;
        gl_FragColor = vec4(mix(vec3(0.36,0.43,0.44), vec3(0.65,0.72,0.7), cloud), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  const size = new THREE.Vector2();
  points.frustumCulled = false;
  points.onBeforeRender = renderer => { uniforms.uHeight.value = renderer.getDrawingBufferSize(size).y; };
  points.userData.dynamic = true;
  return { points, tick: (t: number) => { uniforms.uTime.value = t; } };
}

let reflecting = false;
/** Real scene reflection + layered, world-stable ripples on a fully editable PBR material. */
export function reflectingWater() {
  const reflector = new Reflector(new THREE.CircleGeometry(3.12, 96), { textureWidth: 1024, textureHeight: 1024, multisample: 2, clipBias: 0.002 });
  const captureMaterial = reflector.material as THREE.ShaderMaterial;
  const capture = reflector.onBeforeRender.bind(reflector);
  const time = { value: 0 };
  const water = new THREE.MeshStandardMaterial({ color: '#235f58', roughness: 0.19, metalness: 0.18 });
  water.onBeforeCompile = shader => {
    shader.uniforms.uLofiTime = time;
    shader.uniforms.lofiReflection = captureMaterial.uniforms.tDiffuse;
    shader.uniforms.lofiTextureMatrix = captureMaterial.uniforms.textureMatrix;
    shader.vertexShader = `uniform mat4 lofiTextureMatrix;
      varying vec4 vLofiMirror; varying vec2 vLofiLocal; varying vec3 vLofiTangent; varying vec3 vLofiBitangent;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLofiLocal = position.xy;
      vLofiMirror = lofiTextureMatrix * vec4(position, 1.0);
      vLofiTangent = normalize(normalMatrix * vec3(1.0,0.0,0.0));
      vLofiBitangent = normalize(normalMatrix * vec3(0.0,1.0,0.0));`);
    shader.fragmentShader = `uniform float uLofiTime; uniform sampler2D lofiReflection;
      varying vec4 vLofiMirror; varying vec2 vLofiLocal; varying vec3 vLofiTangent; varying vec3 vLofiBitangent;
      vec2 lofiWaves(vec2 p) {
        float t = uLofiTime;
        vec2 wind = vec2(
          sin(p.x*6.3+p.y*2.1+t*0.58)*0.028 + sin(p.y*11.7-p.x*3.8-t*0.39)*0.013,
          cos(p.y*5.2-p.x*1.7+t*0.47)*0.023 + cos(p.x*13.1+p.y*8.2+t*0.32)*0.009);
        vec2 ring = p - vec2(-0.65, 0.3);
        float radius = length(ring);
        return wind + ring / max(radius, 0.1) * sin(radius * 12.0 - t * 1.35) * 0.016 * exp(-radius * 0.55);
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec2 lofiSlope = lofiWaves(vLofiLocal);
      normal = normalize(normal - vLofiTangent * lofiSlope.x - vLofiBitangent * lofiSlope.y);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 projected = vLofiMirror.xy / vLofiMirror.w;
      vec3 reflected = texture2D(lofiReflection, clamp(projected + lofiSlope * 0.075, 0.001, 0.999)).rgb;
      float fresnel = 0.2 + 0.7 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
      float shore = smoothstep(2.4, 3.12, length(vLofiLocal));
      outgoingLight = mix(outgoingLight, reflected, fresnel * (1.0 - shore * 0.35));
      outgoingLight += vec3(0.04,0.075,0.056) * shore;
      #include <opaque_fragment>`);
  };
  // Reflector's capture closure retains its uniforms; visible surface uses PBR.
  (reflector as THREE.Mesh).material = water;
  reflector.userData.dynamic = true;
  reflector.castShadow = false; reflector.receiveShadow = true;
  reflector.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    // AO override passes need geometry only; never recursively capture other ponds.
    if (reflecting || scene.overrideMaterial) return;
    reflecting = true;
    try { capture(renderer, scene, camera, geometry, material, group); }
    finally { reflecting = false; }
  };
  reflector.userData.dispose = () => { reflector.getRenderTarget().dispose(); captureMaterial.dispose(); };
  reflector.position.y = 0.24; reflector.rotation.x = -Math.PI / 2; reflector.scale.y = 0.7;
  return { surface: reflector, tick: (t: number) => { time.value = t; } };
}
