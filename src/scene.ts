import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { tween, cancelCameraTween, tweenCamera, updateTweens, getEase, type CameraPose } from './anim';

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
  /** Vertical sky gradient: top color and horizon color. */
  skyTop: string;
  fog: [string, number, number];
  sun: { color: string; intensity: number; position: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
  ambient: { color: string; intensity: number };
  accents?: Array<{ color: string; intensity: number; position: [number, number, number] }>;
}

const PRESETS: Record<LightingPreset, PresetDef> = {
  golden_hour: {
    background: '#eec48f',
    skyTop: '#8fa8c4',
    fog: ['#eec48f', 24, 48],
    sun: { color: '#ffb070', intensity: 3.6, position: [18, 9, 8] },
    hemi: { sky: '#ffd9b0', ground: '#8a6f5a', intensity: 0.85 },
    ambient: { color: '#fff0dd', intensity: 0.35 },
  },
  night_neon: {
    background: '#161c30',
    skyTop: '#0a0f1e',
    fog: ['#161c30', 18, 48],
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
    skyTop: '#e9e4da',
    fog: ['#ddd6ca', 30, 46],
    sun: { color: '#ffffff', intensity: 2.6, position: [10, 16, 10] },
    hemi: { sky: '#ffffff', ground: '#b8ada0', intensity: 0.9 },
    ambient: { color: '#ffffff', intensity: 0.5 },
  },
  overcast: {
    background: '#b6b2aa',
    skyTop: '#a3a09a',
    fog: ['#b6b2aa', 20, 44],
    sun: { color: '#d9d4c8', intensity: 1.3, position: [8, 18, 4] },
    hemi: { sky: '#cfcabe', ground: '#8f887c', intensity: 0.95 },
    ambient: { color: '#d8d3c8', intensity: 0.55 },
  },
  moonlit: {
    background: '#1a2338',
    skyTop: '#0d1524',
    fog: ['#1a2338', 16, 50],
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

  private skyCanvas: HTMLCanvasElement;
  private skyTexture: THREE.CanvasTexture;
  private lastSkyTop = new THREE.Color('#8fa8c4');
  private lastSkyHorizon = new THREE.Color('#eec48f');
  private clock = new THREE.Clock();
  private frameCallbacks: Array<(dt: number) => void> = [];

  // Idle orbit — the lowest authority in the camera hierarchy. After 25 s
  // without any human input or agent call, the camera drifts in a slow
  // cinematic orbit around the scene. Any grab or tool call stops it.
  private lastActivity = performance.now();
  private idleOrbiting = false;
  private idleAngle = 0;
  private idleRadius = 12;
  private idleHeight = 5.2;

  /** Every human interaction and every agent call feeds this. */
  noteActivity(): void {
    this.lastActivity = performance.now();
    if (this.idleOrbiting) this.idleOrbiting = false;
  }

  /** Start the idle orbit on the next frame (used by the show finale). */
  armIdleOrbit(): void {
    this.lastActivity = performance.now() - 26_000;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    // vertical gradient sky, drawn on a tiny canvas and repainted during transitions
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2;
    this.skyCanvas.height = 256;
    this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTexture;

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(6.4, 3.0, 7.6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.8, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 55;
    // A human grabbing the camera always wins over an in-flight agent camera move.
    this.controls.addEventListener('start', () => {
      cancelCameraTween();
      this.noteActivity();
    });

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
    this.sun.shadow.radius = 4;
    this.sun.shadow.blurSamples = 12;
    this.sun.shadow.normalBias = 0.02;

    this.accentGroup = new THREE.Group();
    this.accentGroup.visible = false;

    this.scene.add(this.hemi, this.ambient, this.sun, this.accentGroup);

    // warm sage meadow with subtle radial variation baked into a canvas texture
    const groundMat = new THREE.MeshStandardMaterial({ color: '#96a47b', roughness: 1, metalness: 0 });
    groundMat.map = makeGroundTexture();
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(60, 72), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.buildAmbientLife();

    // The studio can tell the HUD when the human grabs the camera.
    this.controls.addEventListener('start', () => this.onHumanGrab?.());

    window.addEventListener('resize', () => this.onResize());

    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Set by main.ts — fired when the user starts dragging/zooming. */
  onHumanGrab?: () => void;

  private fireflies: THREE.Points | null = null;
  private fireflyPhase: number[] = [];

  /**
   * Decorative-only life: grass tufts, flowers and fireflies. These are NOT
   * scene objects (never targeted by tools) — pure art direction.
   */
  private buildAmbientLife(): void {
    const dummy = new THREE.Object3D();
    const inMeadow = (r = 34) => {
      const a = Math.random() * Math.PI * 2;
      const rad = 3.5 + Math.sqrt(Math.random()) * r;
      return [Math.cos(a) * rad, Math.sin(a) * rad] as const;
    };

    // Grass tufts — small cones with per-instance tint/height variation.
    const tuftGeo = new THREE.ConeGeometry(0.09, 0.34, 5);
    tuftGeo.translate(0, 0.17, 0);
    const tuftMat = new THREE.MeshStandardMaterial({ color: '#6f8a5e', roughness: 0.95 });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 420);
    tufts.receiveShadow = true;
    const tuftColor = new THREE.Color();
    for (let i = 0; i < 420; i++) {
      const [x, z] = inMeadow();
      dummy.position.set(x, 0, z);
      dummy.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * Math.PI, (Math.random() - 0.5) * 0.35);
      dummy.scale.setScalar(0.7 + Math.random() * 0.9);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
      tuftColor.setHSL(0.26 + Math.random() * 0.05, 0.3 + Math.random() * 0.15, 0.32 + Math.random() * 0.12);
      tufts.setColorAt(i, tuftColor);
    }
    this.scene.add(tufts);

    // Flowers — tiny stems with warm accent heads.
    const headGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, 64);
    const accents = ['#e8b74f', '#d97f6a', '#b8a5d9', '#f0f0e4'];
    for (let i = 0; i < 64; i++) {
      const [x, z] = inMeadow(26);
      const h = 0.16 + Math.random() * 0.14;
      dummy.position.set(x, h, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.7 + Math.random() * 0.7);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      tuftColor.set(accents[i % accents.length]);
      heads.setColorAt(i, tuftColor);
    }
    this.scene.add(heads);

    // Fireflies — additive points that float; brightest at night.
    const N = 64;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const [x, z] = inMeadow(14);
      pos[i * 3] = x;
      pos[i * 3 + 1] = 0.5 + Math.random() * 2.2;
      pos[i * 3 + 2] = z;
      this.fireflyPhase.push(Math.random() * Math.PI * 2);
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ffMat = new THREE.PointsMaterial({
      color: '#ffd27f', size: 0.09, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(ffGeo, ffMat);
    this.scene.add(this.fireflies);
  }

  /** Pulse objects with an emissive tint — orange for agent, blue for human. */
  highlightObjects(ids: string[], color = '#ff9a3c'): void {
    for (const id of ids) {
      const entry = this.highlightLookup(id);
      if (!entry) continue;
      for (const mat of entry.materials) {
        const target = new THREE.Color(color);
        const from = mat.emissive.clone();
        const baseI = mat.emissiveIntensity;
        mat.emissiveIntensity = 1;
        tween({
          dur: 900,
          update: (k) => {
            // up fast, fade slow
            const pulse = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
            mat.emissive.copy(from).lerp(target, 0.85 * pulse);
          },
          done: () => {
            mat.emissive.copy(from);
            mat.emissiveIntensity = baseI;
          },
        });
      }
    }
  }

  private highlightLookup(id: string): { materials: THREE.MeshStandardMaterial[] } | null {
    return this.highlightFind?.(id) ?? null;
  }

  /** Set by main.ts — looks up a store entry without importing the store here. */
  highlightFind: ((id: string) => { materials: THREE.MeshStandardMaterial[] } | null) | null = null;

  onFrame(cb: (dt: number) => void): void {
    this.frameCallbacks.push(cb);
  }

  private frame(): void {
    updateTweens(performance.now());
    const dt = this.clock.getDelta();
    for (const cb of this.frameCallbacks) cb(dt);
    this.updateIdleOrbit(dt);
    this.updateFireflies(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private fireflyTime = 0;
  private updateFireflies(dt: number): void {
    const ff = this.fireflies;
    if (!ff) return;
    this.fireflyTime += dt;
    const t = this.fireflyTime;
    const pos = ff.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.fireflyPhase.length; i++) {
      pos.setY(i, pos.getY(i) + Math.sin(t * 0.9 + this.fireflyPhase[i]) * 0.0022);
      pos.setX(i, pos.getX(i) + Math.cos(t * 0.5 + this.fireflyPhase[i]) * 0.0016);
    }
    pos.needsUpdate = true;
    const night = this.currentPreset === 'night_neon' || this.currentPreset === 'moonlit';
    const mat = ff.material as THREE.PointsMaterial;
    mat.opacity += ((night ? 0.95 : 0.22) - mat.opacity) * 0.02;
    mat.size = night ? 0.13 : 0.08;
  }

  /** Slow cinematic drift after 25 s of nothing — lowest camera authority. */
  private updateIdleOrbit(dt: number): void {
    if (!this.idleOrbiting) {
      if (performance.now() - this.lastActivity < 25_000 || document.hidden) return;
      this.idleOrbiting = true;
      const off = this.camera.position.clone().sub(this.controls.target);
      this.idleAngle = Math.atan2(off.x, off.z);
      this.idleRadius = Math.max(2.5, Math.hypot(off.x, off.z));
      this.idleHeight = Math.max(2.5, off.y);
    }
    this.idleAngle += dt * 0.1;
    const breathe = 1 + Math.sin(this.idleAngle * 0.7) * 0.06;
    const r = this.idleRadius * breathe;
    this.camera.position.set(
      this.controls.target.x + Math.sin(this.idleAngle) * r,
      this.controls.target.y + this.idleHeight * (1 + Math.sin(this.idleAngle * 0.45) * 0.08),
      this.controls.target.z + Math.cos(this.idleAngle) * r,
    );
    this.camera.lookAt(this.controls.target);
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

    const fromSkyTop = this.lastSkyTop.clone();
    const toSkyTop = new THREE.Color(p.skyTop);
    const fromSkyHorizon = this.lastSkyHorizon.clone();
    const toSkyHorizon = new THREE.Color(p.background);
    const fromFogColor = (this.scene.fog as THREE.Fog | null)?.color.clone() ?? toSkyHorizon.clone();
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

    if (!this.scene.fog) this.scene.fog = new THREE.Fog(p.fog[0], p.fog[1], p.fog[2]);
    const fog = this.scene.fog as THREE.Fog;

    this.drawSky(fromSkyTop, fromSkyHorizon);

    tween({
      dur: 700,
      group: 'lighting',
      update: (t) => {
        this.drawSky(
          fromSkyTop.clone().lerp(toSkyTop, t),
          fromSkyHorizon.clone().lerp(toSkyHorizon, t),
        );
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

  /** Repaint the sky gradient (screen-space canvas texture). */
  private drawSky(top: THREE.Color, horizon: THREE.Color): void {
    this.lastSkyTop.copy(top);
    this.lastSkyHorizon.copy(horizon);
    const ctx = this.skyCanvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(0.55, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${horizon.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    this.skyTexture.needsUpdate = true;
  }

  /** Animated camera move to a pose. Human input cancels it (see controls 'start'). */
  flyTo(pose: CameraPose, dur = 950, easing?: string): void {
    tweenCamera(this.camera, this.controls, pose, dur, getEase(easing));
  }
}

/** Soft mottled meadow texture: radial falloff + scattered blotches. */
function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const base = g.createRadialGradient(256, 256, 40, 256, 256, 256);
  base.addColorStop(0, '#a3b184');
  base.addColorStop(0.6, '#96a47b');
  base.addColorStop(1, '#83936c');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 6 + Math.random() * 26;
    const light = Math.random() > 0.5;
    g.fillStyle = light ? 'rgba(196, 205, 160, 0.05)' : 'rgba(74, 88, 60, 0.05)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // grass tufts: short directional strokes in two greens — reads as a meadow,
  // not a painted circle
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = 2 + Math.random() * 5;
    const ang = Math.random() * Math.PI;
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(120, 138, 88, 0.16)' : 'rgba(66, 80, 52, 0.16)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len - len * 0.4);
    g.stroke();
  }
  // a handful of soft clover patches for rhythm
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    g.fillStyle = 'rgba(88, 104, 66, 0.08)';
    g.beginPath();
    g.arc(x, y, 5 + Math.random() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
