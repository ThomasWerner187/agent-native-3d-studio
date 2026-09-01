import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { tween, cancelCameraTween, tweenCamera, type CameraPose } from './anim';

/**
 * three.js setup: renderer, camera, controls, ground and the five
 * lighting presets. All lighting changes animate smoothly so an agent
 * calling set_lighting produces a visible, cinematic transition.
 */

export const LIGHTING_PRESETS = ['golden_hour', 'night_neon', 'studio', 'overcast', 'moonlit'] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

export function isLightingPreset(p: string): p is LightingPreset {
  return (LIGHTING_PRESETS as readonly string[]).includes(p);
}

interface PresetDef {
  background: string;
  fog: [string, number, number];
  sun: { color: string; intensity: number; position: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
  ambient: { color: string; intensity: number };
  accents?: Array<{ color: string; intensity: number; position: [number, number, number] }>;
}

const PRESETS: Record<LightingPreset, PresetDef> = {
  golden_hour: {
    background: '#eec48f',
    fog: ['#eec48f', 26, 58],
    sun: { color: '#ffb070', intensity: 3.2, position: [18, 9, 8] },
    hemi: { sky: '#ffd9b0', ground: '#8a6f5a', intensity: 0.75 },
    ambient: { color: '#fff0dd', intensity: 0.35 },
  },
  night_neon: {
    background: '#161c30',
    fog: ['#161c30', 18, 46],
    sun: { color: '#7f9fff', intensity: 0.5, position: [-12, 14, -8] },
    hemi: { sky: '#33406e', ground: '#0e1220', intensity: 0.4 },
    ambient: { color: '#2a3354', intensity: 0.3 },
    accents: [
      { color: '#4de3ff', intensity: 14, position: [-6, 2.4, 4] },
      { color: '#ff4de3', intensity: 12, position: [6, 2.4, -3] },
    ],
  },
  studio: {
    background: '#ddd6ca',
    fog: ['#ddd6ca', 34, 70],
    sun: { color: '#ffffff', intensity: 2.6, position: [10, 16, 10] },
    hemi: { sky: '#ffffff', ground: '#b8ada0', intensity: 0.9 },
    ambient: { color: '#ffffff', intensity: 0.5 },
  },
  overcast: {
    background: '#b6b2aa',
    fog: ['#b6b2aa', 22, 54],
    sun: { color: '#d9d4c8', intensity: 1.3, position: [8, 18, 4] },
    hemi: { sky: '#cfcabe', ground: '#8f887c', intensity: 0.95 },
    ambient: { color: '#d8d3c8', intensity: 0.55 },
  },
  moonlit: {
    background: '#1a2338',
    fog: ['#1a2338', 16, 44],
    sun: { color: '#a9c4ff', intensity: 1.0, position: [-14, 12, -6] },
    hemi: { sky: '#46598c', ground: '#1a2030', intensity: 0.35 },
    ambient: { color: '#26304d', intensity: 0.32 },
  },
};

export class Studio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly ground: THREE.Mesh;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private accentGroup: THREE.Group;
  currentPreset: LightingPreset = 'golden_hour';
  currentIntensity = 1;

  private clock = new THREE.Clock();
  private frameCallbacks: Array<(dt: number) => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(9.5, 5.6, 11.5);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.8, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 55;
    // A human grabbing the camera always wins over an in-flight agent camera move.
    this.controls.addEventListener('start', () => cancelCameraTween());

    this.hemi = new THREE.HemisphereLight('#ffd9b0', '#8a6f5a', 0.75);
    this.ambient = new THREE.AmbientLight('#fff0dd', 0.35);
    this.sun = new THREE.DirectionalLight('#ffb070', 3.2);
    this.sun.position.set(18, 9, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -26;
    this.sun.shadow.camera.right = 26;
    this.sun.shadow.camera.top = 26;
    this.sun.shadow.camera.bottom = -26;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;

    this.accentGroup = new THREE.Group();
    this.accentGroup.visible = false;

    this.scene.add(this.hemi, this.ambient, this.sun, this.accentGroup);

    // warm sage meadow
    const groundMat = new THREE.MeshStandardMaterial({ color: '#96a47b', roughness: 1, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(40, 72), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    window.addEventListener('resize', () => this.onResize());

    this.renderer.setAnimationLoop(() => this.frame());
  }

  onFrame(cb: (dt: number) => void): void {
    this.frameCallbacks.push(cb);
  }

  private frame(): void {
    const dt = this.clock.getDelta();
    for (const cb of this.frameCallbacks) cb(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Apply a lighting preset, animated over ~700ms. */
  applyLighting(preset: LightingPreset, intensity = 1, azimuthDeg?: number): void {
    const p = PRESETS[preset];
    this.currentPreset = preset;
    this.currentIntensity = THREE.MathUtils.clamp(intensity, 0, 2);

    const k = this.currentIntensity;
    const az = azimuthDeg != null ? THREE.MathUtils.degToRad(azimuthDeg) : null;

    const toSunPos = new THREE.Vector3(...p.sun.position);
    if (az != null) {
      const r = Math.hypot(p.sun.position[0], p.sun.position[2]);
      toSunPos.set(Math.cos(az) * r, p.sun.position[1], Math.sin(az) * r);
    }

    const fromBg = (this.scene.background as THREE.Color ?? new THREE.Color(p.background)).clone();
    const toBg = new THREE.Color(p.background);
    const fromFogColor = (this.scene.fog as THREE.Fog | null)?.color.clone() ?? toBg.clone();
    const toFogColor = new THREE.Color(p.fog[0]);
    const fromFogNear = (this.scene.fog as THREE.Fog | null)?.near ?? p.fog[1];
    const fromFogFar = (this.scene.fog as THREE.Fog | null)?.far ?? p.fog[2];

    const fromSunColor = this.sun.color.clone();
    const toSunColor = new THREE.Color(p.sun.color);
    const fromSunInt = this.sun.intensity;
    const toSunInt = p.sun.intensity * k;
    const fromSunPos = this.sun.position.clone();

    const fromHemiSky = this.hemi.color.clone();
    const toHemiSky = new THREE.Color(p.hemi.sky);
    const fromHemiGround = this.hemi.groundColor.clone();
    const toHemiGround = new THREE.Color(p.hemi.ground);
    const fromHemiInt = this.hemi.intensity;
    const toHemiInt = p.hemi.intensity * k;

    const fromAmbColor = this.ambient.color.clone();
    const toAmbColor = new THREE.Color(p.ambient.color);
    const fromAmbInt = this.ambient.intensity;
    const toAmbInt = p.ambient.intensity * k;

    if (!this.scene.background) this.scene.background = new THREE.Color();
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(p.fog[0], p.fog[1], p.fog[2]);
    const fog = this.scene.fog as THREE.Fog;

    tween({
      dur: 700,
      group: 'lighting',
      update: (t) => {
        (this.scene.background as THREE.Color).copy(fromBg).lerp(toBg, t);
        fog.color.copy(fromFogColor).lerp(toFogColor, t);
        fog.near = THREE.MathUtils.lerp(fromFogNear, p.fog[1], t);
        fog.far = THREE.MathUtils.lerp(fromFogFar, p.fog[2], t);
        this.sun.color.copy(fromSunColor).lerp(toSunColor, t);
        this.sun.intensity = THREE.MathUtils.lerp(fromSunInt, toSunInt, t);
        this.sun.position.lerpVectors(fromSunPos, toSunPos, t);
        this.hemi.color.copy(fromHemiSky).lerp(toHemiSky, t);
        this.hemi.groundColor.copy(fromHemiGround).lerp(toHemiGround, t);
        this.hemi.intensity = THREE.MathUtils.lerp(fromHemiInt, toHemiInt, t);
        this.ambient.color.copy(fromAmbColor).lerp(toAmbColor, t);
        this.ambient.intensity = THREE.MathUtils.lerp(fromAmbInt, toAmbInt, t);
      },
      done: () => {
        // swap accent lights (neon etc.) after the transition
        this.accentGroup.clear();
        for (const a of p.accents ?? []) {
          const light = new THREE.PointLight(new THREE.Color(a.color), a.intensity * k, 16, 2);
          light.position.set(...a.position);
          this.accentGroup.add(light);
        }
        this.accentGroup.visible = (p.accents?.length ?? 0) > 0;
      },
    });
  }

  /** Animated camera move to a pose. Human input cancels it (see controls 'start'). */
  flyTo(pose: CameraPose, dur = 950): void {
    tweenCamera(this.camera, this.controls, pose, dur);
  }
}
