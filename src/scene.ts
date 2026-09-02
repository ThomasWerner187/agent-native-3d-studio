import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Diorama } from './diorama';
import { CameraDirector } from './camera-director';
import { tween, cancelCameraTween, tweenCamera, updateTweens, getEase, hasShadowTweens, type CameraPose } from './anim';

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
    background: '#112b32',
    skyTop: '#071017',
    fog: ['#10252c', 45, 115],
    sun: { color: '#a3d9e1', intensity: 2.5, position: [-8, 14, -12] },
    hemi: { sky: '#9abdc6', ground: '#314545', intensity: 1.0 },
    ambient: { color: '#a1b3b7', intensity: 0.25 },
  },
};

export class Studio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly ground: THREE.Mesh;
  readonly director: CameraDirector;
  readonly terrain = new Diorama();
  private composer: EffectComposer;
  private ao: GTAOPass;
  private cinematic = window.innerWidth > 760;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private accentGroup: THREE.Group;
  currentPreset: LightingPreset = 'golden_hour';
  currentIntensity = 1;
  frameStats = { fps: 0, frame_ms: 0, cpu_submit_ms: 0, draw_calls: 0, triangles: 0, shadow_updates: 0 };
  private submitTime = 0;
  private shadowUpdates = 0;
  private sampleTime = 0;
  private sampleFrames = 0;
  private lastFrameAt = 0;

  private skyMaterial: THREE.ShaderMaterial;
  private lastSkyTop = new THREE.Color('#8fa8c4');
  private lastSkyHorizon = new THREE.Color('#eec48f');
  private clock = new THREE.Clock();
  private frameCallbacks: Array<(dt: number) => void> = [];

  // Idle orbit — the lowest authority in the camera hierarchy. After 25 s
  // without any human input or agent call, the camera drifts in a slow
  // cinematic orbit around the scene. Any grab or tool call stops it.
  private lastActivity = performance.now();
  private idleOrbiting = false;
  private idleArmed = false;
  private idleAngle = 0;
  private idleRadius = 12;
  private idleHeight = 5.2;

  /** Every human interaction and every agent call feeds this. */
  noteActivity(): void {
    this.lastActivity = performance.now();
    this.idleArmed = false;
    if (this.idleOrbiting) this.idleOrbiting = false;
  }

  /** Explicitly arm the optional idle orbit for a caller that wants ambience. */
  armIdleOrbit(): void {
    this.idleArmed = true;
    this.lastActivity = performance.now() - 26_000;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.cinematic ? 1.5 : 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.matrixAutoUpdate = false;
    this.scene.updateMatrix();
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture;
    this.scene.environmentIntensity = 0.26;
    environment.dispose(); pmrem.dispose();

    // World-space sky: the fog horizon stays aligned through low camera angles.
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: { skyTop: { value: this.lastSkyTop }, skyHorizon: { value: this.lastSkyHorizon } },
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      vertexShader: `varying vec3 skyPosition;
        void main() { vec4 world = modelMatrix * vec4(position, 1.0); skyPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world; }`,
      fragmentShader: `uniform vec3 skyTop; uniform vec3 skyHorizon; varying vec3 skyPosition;
        void main() { float elevation = normalize(skyPosition - cameraPosition).y;
          vec3 color = mix(skyHorizon, skyTop, smoothstep(0.0, 0.55, elevation));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), this.skyMaterial);
    sky.renderOrder = -100; sky.frustumCulled = false; sky.matrixAutoUpdate = false;
    this.scene.add(sky);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(16.2, 16.5, 22).multiplyScalar(Math.max(1, 1 / this.camera.aspect));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 120;
    // A human grabbing the camera always wins over an in-flight agent camera move.
    this.controls.addEventListener('start', () => {
      cancelCameraTween();
      this.noteActivity();
      this.director.pause('You took the camera');
    });

    this.director = new CameraDirector(this);

    this.hemi = new THREE.HemisphereLight('#ffd9b0', '#8a6f5a', 0.75);
    this.ambient = new THREE.AmbientLight('#fff0dd', 0.35);
    this.sun = new THREE.DirectionalLight('#ffb070', 3.2);
    this.sun.position.set(18, 9, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -16;
    this.sun.shadow.camera.right = 16;
    this.sun.shadow.camera.top = 16;
    this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.radius = 4;
    this.sun.shadow.blurSamples = 12;
    this.sun.shadow.normalBias = 0.02;

    this.accentGroup = new THREE.Group();
    this.accentGroup.visible = false;

    this.scene.add(this.hemi, this.ambient, this.sun, this.accentGroup);

    this.ground = this.terrain.ground;
    this.scene.add(this.terrain.group);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#14232c', roughness: 0.78, metalness: 0.25 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.05;
    this.scene.add(floor);
    const fill = new THREE.DirectionalLight('#c0d9e7', 1.1);
    fill.position.set(5, 7, 15); this.scene.add(fill);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d')!;
    const gradient = shadowContext.createRadialGradient(64, 64, 18, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,.65)'); gradient.addColorStop(0.65, 'rgba(0,0,0,.4)'); gradient.addColorStop(1, 'transparent');
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.04; this.scene.add(shadow);

    this.buildAmbientLife();

    const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    this.ao.updateGtaoMaterial({ radius: 0.55, thickness: 0.7, samples: 8, distanceFallOff: 0.7 });
    this.ao.blendIntensity = 0.8; this.ao.enabled = this.cinematic;
    this.composer.addPass(this.ao);
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.4, 1.25));
    this.composer.addPass(new OutputPass());

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
    const inMeadow = (r = 7) => {
      const a = Math.random() * Math.PI * 2;
      const rad = 1 + Math.sqrt(Math.random()) * Math.min(r, 8);
      return [Math.cos(a) * rad, Math.sin(a) * rad] as const;
    };

    // Fireflies — additive points that float; brightest at night.
    const N = 32;
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
    ffMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - vec2(0.5)));\n#include <alphatest_fragment>');
    };
    this.fireflies = new THREE.Points(ffGeo, ffMat);
    this.scene.add(this.fireflies);
  }

  /** Transient outlines never mutate materials or contaminate snapshots. */
  highlightObjects(ids: string[], color = '#e9b56b'): void {
    for (const id of ids) {
      const entry = this.highlightFind?.(id);
      if (!entry) continue;
      const outline = new THREE.BoxHelper(entry.group, color);
      const mat = outline.material as THREE.LineBasicMaterial;
      mat.transparent = true; mat.opacity = 0.65; mat.depthTest = false;
      outline.renderOrder = 100; this.scene.add(outline);
      tween({ dur: 1200, update: k => { outline.update(); mat.opacity = (1 - k) * 0.65; }, done: () => {
        this.scene.remove(outline); outline.geometry.dispose(); mat.dispose();
      } });
    }
  }

  highlightFind: ((id: string) => { group: THREE.Group } | null) | null = null;

  onFrame(cb: (dt: number) => void): void {
    this.frameCallbacks.push(cb);
  }

  private frame(): void {
    const frameStart = performance.now();
    if (document.hidden) { this.lastFrameAt = 0; this.clock.getDelta(); return; }
    // Keep full-resolution cinematic rendering; avoid wasting 120 Hz on a slow orbit.
    const interval = 1000 / 60;
    if (frameStart - this.lastFrameAt < interval - 0.6) return;
    this.lastFrameAt = Math.max(this.lastFrameAt + interval, frameStart - 0.5);
    this.renderer.info.reset();
    if (hasShadowTweens()) this.invalidateShadows();
    updateTweens(performance.now());
    const dt = this.clock.getDelta();
    this.sampleTime += dt; this.sampleFrames++;
    if (this.sampleTime >= 2) {
      this.frameStats = { fps: Math.round(this.sampleFrames / this.sampleTime), frame_ms: Math.round(this.sampleTime / this.sampleFrames * 1000), cpu_submit_ms: Math.round(this.submitTime / this.sampleFrames * 100) / 100, draw_calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, shadow_updates: this.shadowUpdates };
      this.submitTime = 0; this.shadowUpdates = 0;
      this.sampleTime = 0; this.sampleFrames = 0;
    }
    for (const cb of this.frameCallbacks) cb(dt);
    this.updateIdleOrbit(dt);
    this.director.update(dt);
    this.updateFireflies(dt);
    this.controls.update();
    if (this.renderer.shadowMap.needsUpdate) this.shadowUpdates++;
    this.composer.render();
    this.submitTime += performance.now() - frameStart;
    this.frameStats.draw_calls = this.renderer.info.render.calls;
    this.frameStats.triangles = this.renderer.info.render.triangles;
  }

  private fireflyTime = 0;
  private updateFireflies(dt: number): void {
    const ff = this.fireflies;
    if (!ff || this.reducedMotion) return;
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
    if (this.reducedMotion || !this.idleArmed) return;
    if (!this.idleOrbiting) {
      if (performance.now() - this.lastActivity < 25_000 || document.hidden) return;
      this.idleOrbiting = true;
      const off = this.camera.position.clone().sub(this.controls.target);
      this.idleAngle = Math.atan2(off.x, off.z);
      this.idleRadius = Math.max(2.5, Math.hypot(off.x, off.z));
      this.idleHeight = Math.max(2.5, off.y);
    }
    this.idleAngle += dt * 0.025;
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
    const previousScale = Math.max(1, 1 / this.camera.aspect);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    const factor = Math.max(1, 1 / this.camera.aspect) / previousScale;
    this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near *= factor; this.scene.fog.far *= factor;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  invalidateShadows(): void { this.renderer.shadowMap.needsUpdate = true; }

  setQuality(cinematic: boolean): void {
    this.cinematic = cinematic; this.ao.enabled = cinematic; this.invalidateShadows();
    const ratio = Math.min(window.devicePixelRatio, cinematic ? 1.5 : 1);
    this.renderer.setPixelRatio(ratio); this.composer.setPixelRatio(ratio);
    this.onResize();
  }

  /** Apply a lighting preset, animated over ~700ms. */
  applyLighting(preset: LightingPreset, intensity = 1, azimuthDeg?: number, duration = 700): void {
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
    const toSkyHorizon = new THREE.Color(p.fog[0]);
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
      dur: duration,
      group: 'lighting',
      update: (t) => {
        this.drawSky(
          fromSkyTop.clone().lerp(toSkyTop, t),
          fromSkyHorizon.clone().lerp(toSkyHorizon, t),
        );
        fog.color.copy(fromFogColor).lerp(toFogColor, t);
        const framingScale = Math.max(1, 1 / this.camera.aspect);
        fog.near = THREE.MathUtils.lerp(fromFogNear, p.fog[1] * framingScale, t);
        fog.far = THREE.MathUtils.lerp(fromFogFar, p.fog[2] * framingScale, t);
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

  /** Update sky uniforms; no canvas repaint or texture upload during lighting fades. */
  private drawSky(top: THREE.Color, horizon: THREE.Color): void {
    this.lastSkyTop.copy(top);
    this.lastSkyHorizon.copy(horizon);
  }

  /** Animated camera move to a pose. Human input cancels it (see controls 'start'). */
  flyTo(pose: CameraPose, dur = 950, easing?: string): void {
    this.director.pause('A new camera shot took control');
    tweenCamera(this.camera, this.controls, pose, dur, getEase(easing));
  }
}
