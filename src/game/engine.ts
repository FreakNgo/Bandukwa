import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  CombatantHudRow,
  HudSnapshot,
  KillFeedItem,
  RadarBlip,
  SettingsState,
} from '../types/game';
import { soundEngine } from './audio';
import { createCombatantVisual, type CombatantVisual } from './avatars';
import { BotManager, type BotActor } from './bots';
import { TacticalArmsRig } from './hands';
import {
  ARENA_HALF_EXTENT,
  ArenaMap,
  raycastOBB,
  resolvePlayerCollisions,
  SPAWN_POINTS,
} from './map';
import { MAX_ROOM_PLAYERS, P2PManager, type P2PMessage } from './p2p';
import {
  computeReloadViewmodelPose,
  getReloadStageIndex,
  getReloadStages,
} from './reloads';
import { WEAPON_SPECS, WeaponModelCache } from './weapons';

// Module-scope reusable scratch objects (zero GC in render loop)
const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _end = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _hitNorm = new THREE.Vector3();
const _landBurst = new THREE.Vector3();
const _right = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _gThrowVel = new THREE.Vector3();
const _gStep = new THREE.Vector3();
const _gRayDir = new THREE.Vector3();
const _gTarget = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function shortestAngleDiff(a: number, b: number): number {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

interface RemotePeerState {
  id: number;
  name: string;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  pitch: number;
  hp: number;
  kills: number;
  deaths: number;
  weaponIdx: number;
  crouching: boolean;
  lastPos: THREE.Vector3;
  horizSpeed: number;
  stepAccum: number;
  lastFireTime: number;
  visual: CombatantVisual;
}

interface ActiveTracer {
  mesh: THREE.Mesh;
  ttl: number;
}

interface ActiveGrenade {
  mesh: THREE.Group;
  ledMat: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  ttl: number;
  isLocal: boolean;
  bounced: boolean;
}

interface ActiveBlast {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  ttl: number;
  maxTtl: number;
}

interface ActiveDustPuff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  ttl: number;
  maxTtl: number;
}

interface DroppedMag {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  halfH: number;
  ttl: number;
  bounced: boolean;
}

const MAG_DROP_LOOK: Record<string, { sx: number; sy: number; sz: number; col: number }> = {
  ak_rock_lock: { sx: 0.95, sy: 1.18, sz: 1.05, col: 0x6b3a1e },
  deagle_heavy_pistol: { sx: 0.9, sy: 0.85, sz: 0.85, col: 0x9ca3af },
  g36_paddle_bolt: { sx: 0.95, sy: 1.05, sz: 1.0, col: 0x252b33 },
  m1911_speed_slide: { sx: 0.7, sy: 0.78, sz: 0.72, col: 0x4b5563 },
  mp5_hk_slap: { sx: 0.72, sy: 1.12, sz: 0.65, col: 0x181c22 },
  p90_top_mag: { sx: 1.15, sy: 0.34, sz: 2.8, col: 0x6b5b3e },
  scar_bolt_catch: { sx: 1.1, sy: 0.96, sz: 1.15, col: 0x9a8260 },
};

function createBulletHoleTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const outer = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    outer.addColorStop(0, 'rgba(10, 9, 8, 0.96)');
    outer.addColorStop(0.32, 'rgba(26, 22, 18, 0.92)');
    outer.addColorStop(0.58, 'rgba(66, 56, 44, 0.52)');
    outer.addColorStop(1, 'rgba(66, 56, 44, 0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 64, 64);

    // Subtle radial plaster/stone cracks around crater
    ctx.strokeStyle = 'rgba(20, 18, 16, 0.65)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(ang) * 9, 32 + Math.sin(ang) * 9);
      ctx.lineTo(32 + Math.cos(ang + 0.12) * 23, 32 + Math.sin(ang + 0.12) * 23);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class BandukwaEngine {
  readonly isSoftwareGl: boolean;
  readonly isLowSpecDevice: boolean;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly p2p = new P2PManager();

  private container: HTMLElement;
  private sunLight: THREE.DirectionalLight;
  private effectiveQuality: 'low' | 'balanced' | 'high' = 'balanced';
  private autoDowngraded = false;
  private frameEmaMs = 16.6;
  private slowFrameStreak = 0;
  private maxDustPuffs = 24;
  private maxDecals = 40;
  private arenaMap: ArenaMap;
  private weaponCache = new WeaponModelCache();
  private botManager: BotManager;
  private armsRig = new TacticalArmsRig();

  // Viewmodel hierarchy
  private vmRoot = new THREE.Group();
  private vmGunHolder: THREE.Group | null = null;
  private muzzleNode = new THREE.Object3D();
  private muzzleFlash: THREE.Mesh;
  private muzzleLight: THREE.PointLight;
  private flashTimer = 0;

  // Particle & tracer pools
  private readonly MAX_PARTICLES = 450;
  private partPos: Float32Array;
  private partCol: Float32Array;
  private partVel: Float32Array;
  private partMaxCol: Float32Array;
  private partLife: Float32Array;
  private partMaxLife: Float32Array;
  private partCursor = 0;
  private partGeo: THREE.BufferGeometry;
  private tracers: ActiveTracer[] = [];
  private tracerGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
  private tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffeba8,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private decals: THREE.Mesh[] = [];
  private decalGeo = new THREE.PlaneGeometry(0.16, 0.16);
  private decalTex = createBulletHoleTexture();
  private decalMat = new THREE.MeshBasicMaterial({
    map: this.decalTex,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private dustPuffs: ActiveDustPuff[] = [];
  private dustGeo = new THREE.SphereGeometry(0.11, 8, 6);
  private droppedMags: DroppedMag[] = [];
  private droppedMagGeo = new THREE.BoxGeometry(0.036, 0.145, 0.056);

  // Frag grenades & explosions
  private readonly maxGrenades = 2;
  private readonly grenadeRefillSeconds = 14;
  private grenades = 2;
  private grenadeRefillTimer = 0;
  private grenadeThrowAnim = 0;
  private activeGrenades: ActiveGrenade[] = [];
  private activeBlasts: ActiveBlast[] = [];
  private grenadeBodyGeo = new THREE.SphereGeometry(0.085, 10, 8);
  private grenadeCollarGeo = new THREE.CylinderGeometry(0.036, 0.042, 0.045, 8);
  private grenadeLedGeo = new THREE.SphereGeometry(0.02, 6, 6);
  private blastGeo = new THREE.SphereGeometry(1, 16, 12);
  private grenadeBodyMat = new THREE.MeshStandardMaterial({
    color: 0x3b4933,
    roughness: 0.55,
    metalness: 0.25,
  });
  private grenadeCollarMat = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    roughness: 0.35,
    metalness: 0.65,
  });

  // Player state
  private me = { name: 'Operator', kills: 0, deaths: 0 };
  private pos = new THREE.Vector3(0, 0, 30);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private hp = 100;
  private onGround = true;
  private eyeHeight = 1.62;
  private crouching = false;
  private crouchToggled = false;
  private touchCrouching = false;
  private sprinting = false;
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideInitialSpeed = 9.5;
  private slideDirX = 0;
  private slideDirZ = -1;
  private slideDustAccum = 0;
  private landSlowTimer = 0;
  private bobPhase = 0;
  private stepAccum = 0;

  // Combat & CS 1.6 Spray / Recoil
  private weaponIdx = 0;
  private ammo = WEAPON_SPECS.map((w) => w.mag);
  private fireCooldown = 0;
  private reloadTimer = 0;
  private reloadDuration = 1.95;
  private emptyReload = true;
  private reloadCueStage = 0;
  private reloadKickRoll = 0;
  private swapTimer = 0;
  private deadTimer = 0;
  private shotsFired = 0;
  private recoilCamPitch = 0;
  private recoilCamYaw = 0;
  private vmKick = 0;
  private adsMix = 0;
  private screenShake = 0;

  // Remote P2P players
  private remotes = new Map<number, RemotePeerState>();

  // Input state (PC + Touch unified)
  private keys: Record<string, boolean> = {};
  private mouseDown = false;
  private touchFiring = false;
  private adsActive = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private lastMouseX: number | null = null;
  private lastMouseY: number | null = null;

  // Match & Lifecycle state
  private settings: SettingsState;
  private started = false;
  private playing = false;
  private softLocked = false;
  private pointerLocked = false;
  private preferPointerLock = true;
  private mapReady = false;
  private weaponsReady = false;
  private disposed = false;
  private frameId = 0;
  private lastTime = performance.now();
  private netSyncAccum = 0;
  private hudSyncAccum = 0;

  // HUD transient feedback & game sense
  private hitMarker: 'none' | 'body' | 'head' = 'none';
  private hitMarkerTimer = 0;
  private damageFlash = 0;
  private damageAngle: number | null = null;
  private calloutText = '';
  private calloutTimer = 0;
  private streakCount = 0;
  private streakTimer = 0;
  private killFeed: KillFeedItem[] = [];
  private killFeedSeq = 1;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onPauseRequested: () => void;
  onLobbyPacket?: (msg: P2PMessage) => void;
  onLobbyPeerLeft?: (id: number) => void;

  // Bound event listeners
  private onResizeBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onBlurBound: () => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onPointerLockChangeBound: () => void;
  private onContextMenuBound: (e: MouseEvent) => void;

  constructor(
    container: HTMLElement,
    initialSettings: SettingsState,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onPauseRequested: () => void,
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onHudUpdate = onHudUpdate;
    this.onPauseRequested = onPauseRequested;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.isLowSpecDevice =
      this.isSoftwareGl ||
      (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4) ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !this.isLowSpecDevice,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene & atmospheric desert sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd7c5a5);
    this.scene.fog = new THREE.FogExp2(0xd7c5a5, 0.0085);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.04,
      320,
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Three-point warm desert sun + cool sky hemisphere fill + rim light
    const hemi = new THREE.HemisphereLight(0xdcebff, 0x9b8259, 0.72);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff1d4, 1.38);
    this.sunLight.position.set(22, 38, 18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 95;
    this.sunLight.shadow.camera.left = -22;
    this.sunLight.shadow.camera.right = 22;
    this.sunLight.shadow.camera.top = 22;
    this.sunLight.shadow.camera.bottom = -22;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    const rim = new THREE.DirectionalLight(0xaed0ff, 0.32);
    rim.position.set(-28, 20, -30);
    this.scene.add(rim);

    this.applyQualityProfile();
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    // Muzzle flash sprite + dynamic flash light
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = flashCanvas.height = 64;
    const fctx = flashCanvas.getContext('2d');
    if (fctx) {
      const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.32, '#ffd67a');
      grad.addColorStop(1, 'rgba(255,120,0,0)');
      fctx.fillStyle = grad;
      fctx.fillRect(0, 0, 64, 64);
    }
    const flashTex = new THREE.CanvasTexture(flashCanvas);
    flashTex.colorSpace = THREE.SRGBColorSpace;
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), flashMat);
    this.muzzleFlash.visible = false;
    this.muzzleLight = new THREE.PointLight(0xffb45c, 0, 8);
    this.muzzleNode.add(this.muzzleFlash, this.muzzleLight);

    this.vmRoot.add(this.armsRig.group, this.muzzleNode);
    this.camera.add(this.vmRoot);

    // Particle pool
    this.partPos = new Float32Array(this.MAX_PARTICLES * 3);
    this.partCol = new Float32Array(this.MAX_PARTICLES * 3);
    this.partVel = new Float32Array(this.MAX_PARTICLES * 3);
    this.partMaxCol = new Float32Array(this.MAX_PARTICLES * 3);
    this.partLife = new Float32Array(this.MAX_PARTICLES);
    this.partMaxLife = new Float32Array(this.MAX_PARTICLES).fill(1);
    this.partGeo = new THREE.BufferGeometry();
    this.partGeo.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3));
    this.partGeo.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3));
    const particles = new THREE.Points(
      this.partGeo,
      new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    particles.frustumCulled = false;
    this.scene.add(particles);

    // Arena Map & AI Bots
    this.arenaMap = new ArenaMap(this.scene, this.renderer);
    this.botManager = new BotManager(this.scene, this.weaponCache);
    this.botManager.syncCount(this.settings.botCount);

    // Wire P2P callbacks
    this.p2p.onPeerLeft = (id) => {
      this.removeRemote(id);
      this.onLobbyPeerLeft?.(id);
    };
    this.p2p.onMessage = (msg) => this.handleP2PMessage(msg);
    this.p2p.onRoomChange = () => {
      this.syncBotsForMode();
      this.emitHud();
    };
    this.p2p.onPeerCountChange = () => {
      this.syncBotsForMode();
      this.emitHud();
    };
    this.p2p.onPingChange = () => {
      this.emitHud();
    };

    // Context loss safety
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());

    // Bind events
    this.onResizeBound = () => this.handleResize();
    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onBlurBound = () => this.clearInputs();
    this.onMouseMoveBound = (e) => this.handleMouseMove(e);
    this.onMouseDownBound = (e) => this.handleMouseDown(e);
    this.onMouseUpBound = (e) => this.handleMouseUp(e);
    this.onWheelBound = (e) => this.handleWheel(e);
    this.onPointerLockChangeBound = () => this.handlePointerLockChange();
    this.onContextMenuBound = (e) => e.preventDefault();

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound, { capture: true });
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('wheel', this.onWheelBound, { passive: true });
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenuBound);

    this.equipViewmodel();
    this.spawnPlayer();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Load glTF map + normalized weapon geometry packs asynchronously
    this.arenaMap.loadModels().then(() => {
      this.mapReady = true;
      this.emitHud();
    });
    this.weaponCache.load().then(() => {
      this.weaponsReady = true;
      this.equipViewmodel();
      this.botManager.refreshWeaponModels();
      this.remotes.forEach((r) => r.visual.setWeapon(r.weaponIdx, this.weaponCache));
      this.emitHud();
    });

    this.emitHud();
    this.scheduleNextTick();
  }

  // ---- Public API for React UI & Touch HUD ----

  private applyQualityProfile(): void {
    const q = this.settings.graphicsQuality ?? 'auto';
    let tier: 'low' | 'balanced' | 'high';
    if (q === 'auto') {
      if (this.isSoftwareGl || this.autoDowngraded) {
        tier = 'low';
      } else if (this.isLowSpecDevice) {
        tier = 'balanced';
      } else {
        tier = 'high';
      }
    } else {
      tier = q;
    }

    this.effectiveQuality = tier;
    const rawDpr = window.devicePixelRatio || 1;
    const dpr =
      tier === 'low' ? 1 : tier === 'balanced' ? Math.min(rawDpr, 1.35) : Math.min(rawDpr, 1.75);
    this.renderer.setPixelRatio(dpr);

    const wantShadows = !this.isSoftwareGl && this.settings.shadows && tier !== 'low';
    this.renderer.shadowMap.enabled = wantShadows;
    this.sunLight.castShadow = wantShadows;

    const targetShadowSize = tier === 'high' ? 1536 : 1024;
    if (this.sunLight.shadow.mapSize.x !== targetShadowSize) {
      this.sunLight.shadow.mapSize.set(targetShadowSize, targetShadowSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    this.renderer.shadowMap.type = tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.maxDustPuffs = tier === 'low' ? 12 : tier === 'balanced' ? 24 : 36;
    this.maxDecals = tier === 'low' ? 24 : tier === 'balanced' ? 40 : 56;
  }

  private syncBotsForMode(): void {
    const inMultiplayerRoom = this.p2p.roomCode !== null;
    this.botManager.syncCount(inMultiplayerRoom ? 0 : this.settings.botCount);
  }

  updateSettings(next: SettingsState): void {
    const prevQuality = this.settings.graphicsQuality;
    this.settings = { ...next };
    if (prevQuality !== next.graphicsQuality) {
      this.autoDowngraded = false;
    }
    soundEngine.setVolume(next.volume);
    this.applyQualityProfile();
    this.syncBotsForMode();
    this.emitHud();
  }

  deploy(callsign: string, usePointerLock: boolean): void {
    this.me.name = (callsign.trim() || 'Operator').slice(0, 14);
    this.preferPointerLock = usePointerLock;
    soundEngine.unlock();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (!this.started) {
      this.started = true;
      this.spawnPlayer();
    }
    this.syncBotsForMode();
    this.equipViewmodel();
    if (usePointerLock) {
      this.softLocked = true;
      this.setPlaying(true);
      this.requestLock();
    } else {
      this.softLocked = true;
      this.setPlaying(true);
    }
  }

  async hostMultiplayer(callsign: string): Promise<string> {
    this.me.name = (callsign.trim() || 'Operator').slice(0, 14);
    this.botManager.syncCount(0);
    const code = await this.p2p.hostRoom();
    this.syncBotsForMode();
    this.emitHud();
    return code;
  }

  async joinMultiplayer(code: string, callsign: string): Promise<void> {
    this.me.name = (callsign.trim() || 'Operator').slice(0, 14);
    this.botManager.syncCount(0);
    await this.p2p.joinRoom(code);
    this.syncBotsForMode();
    this.emitHud();
  }

  async leaveMultiplayer(): Promise<void> {
    this.remotes.forEach((r) => {
      this.scene.remove(r.visual.root);
      r.visual.dispose();
    });
    this.remotes.clear();
    await this.p2p.leaveRoom();
    this.syncBotsForMode();
    this.emitHud();
  }

  pauseToMenu(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.softLocked = false;
    this.setPlaying(false);
    this.onPauseRequested();
  }

  requestLock(): void {
    const cv = this.renderer.domElement;
    try {
      const maybePromise = cv.requestPointerLock() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          this.softLocked = true;
          this.setPlaying(true);
        });
      }
    } catch {
      this.softLocked = true;
      this.setPlaying(true);
    }
  }

  selectWeapon(idx: number): void {
    if (idx < 0 || idx >= WEAPON_SPECS.length || idx === this.weaponIdx) return;
    this.weaponIdx = idx;
    this.reloadTimer = 0;
    this.reloadCueStage = 0;
    this.swapTimer = 0.24;
    this.equipViewmodel();
    soundEngine.swap();
    this.emitHud();
  }

  cycleWeapon(): void {
    this.selectWeapon((this.weaponIdx + 1) % WEAPON_SPECS.length);
  }

  triggerReload(): void {
    const spec = WEAPON_SPECS[this.weaponIdx];
    if (this.reloadTimer > 0 || this.deadTimer > 0 || this.ammo[this.weaponIdx] >= spec.mag) return;
    this.emptyReload = this.ammo[this.weaponIdx] <= 0;
    this.reloadDuration = this.emptyReload ? spec.emptyReloadTime : spec.tacReloadTime;
    this.reloadTimer = this.reloadDuration;
    this.reloadCueStage = 0;
    this.spawnDroppedMag(spec.reloadStyle);
    const stages = getReloadStages(spec.reloadStyle, this.emptyReload);
    if (stages[0]?.cue) {
      soundEngine.reloadCue(stages[0].cue);
      this.triggerReloadStageEffect(stages[0].cue);
    }
    this.emitHud();
  }

  triggerJump(): void {
    if (!this.playing || this.deadTimer > 0) return;
    if (this.onGround) {
      this.vel.y = 7.45;
      this.onGround = false;
      this.slideTimer = 0;
    }
  }

  private tryStartSlide(): boolean {
    if (!this.playing || this.deadTimer > 0 || !this.onGround) return false;
    if (this.slideTimer > 0 || this.slideCooldown > 0) return false;
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (horizSpeed < 3.6) return false;

    this.slideDirX = this.vel.x / horizSpeed;
    this.slideDirZ = this.vel.z / horizSpeed;
    this.slideInitialSpeed = Math.max(horizSpeed * 1.18, this.sprinting ? 10.8 : 9.4);
    this.vel.x = this.slideDirX * this.slideInitialSpeed;
    this.vel.z = this.slideDirZ * this.slideInitialSpeed;
    this.slideTimer = 0.58;
    this.slideCooldown = 0.28;
    this.slideDustAccum = 0;
    this.crouching = true;
    this.sprinting = false;
    soundEngine.slide();
    this.burstParticles(_landBurst.set(this.pos.x, this.pos.y + 0.08, this.pos.z), 8, [0.78, 0.68, 0.5], 2.6, 0.35);
    return true;
  }

  toggleTouchCrouch(): void {
    if (!this.playing || this.deadTimer > 0) return;
    if (!this.crouching && this.tryStartSlide()) {
      this.emitHud();
      return;
    }
    this.touchCrouching = !this.touchCrouching;
    this.emitHud();
  }

  triggerGrenade(): void {
    if (!this.playing || this.deadTimer > 0 || this.grenades <= 0 || this.grenadeThrowAnim > 0) return;

    this.grenades--;
    this.grenadeThrowAnim = 0.3;
    soundEngine.grenadeThrow();

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, this.camera.up).normalize();

    _org
      .copy(this.camera.position)
      .addScaledVector(_dir, 0.5)
      .addScaledVector(_right, 0.14);
    _org.y = Math.max(0.2, _org.y - 0.08);

    // Raycast to solve ballistic arc straight to where crosshair aims
    let bestT = 22;
    let hitWall = false;
    for (const c of this.arenaMap.colliders) {
      const t = raycastOBB(this.camera.position, _dir, c, _norm);
      if (t !== null && t > 0.6 && t < bestT) {
        bestT = t;
        _hitNorm.copy(_norm);
        hitWall = true;
      }
    }
    if (_dir.y < -1e-4) {
      const tg = -this.camera.position.y / _dir.y;
      if (tg > 0.6 && tg < bestT) {
        bestT = tg;
        hitWall = false;
      }
    }

    if (hitWall) {
      _gTarget
        .copy(this.camera.position)
        .addScaledVector(_dir, bestT)
        .addScaledVector(_hitNorm, 0.38);
      _gTarget.y = Math.max(0.12, _gTarget.y);
    } else if (bestT < 22) {
      _gTarget.copy(this.camera.position).addScaledVector(_dir, bestT);
      _gTarget.y = Math.max(0.12, _gTarget.y);
    } else {
      // Aimed above horizon: project target ~15.5m downrange at ground/mid elevation
      const horizLen = Math.hypot(_dir.x, _dir.z);
      const nx = horizLen > 1e-4 ? _dir.x / horizLen : -Math.sin(this.yaw);
      const nz = horizLen > 1e-4 ? _dir.z / horizLen : -Math.cos(this.yaw);
      const pitchLift = Math.max(0, Math.min(1, _dir.y * 1.4));
      const range = 12 + pitchLift * 5.5;
      _gTarget.set(
        this.camera.position.x + nx * range,
        0.15 + pitchLift * 1.6,
        this.camera.position.z + nz * range,
      );
    }

    const dx = _gTarget.x - _org.x;
    const dy = _gTarget.y - _org.y;
    const dz = _gTarget.z - _org.z;
    const horizDist = Math.hypot(dx, dz);
    const flightTime = Math.max(0.24, Math.min(0.86, horizDist / 15.8));

    _gThrowVel.set(
      dx / flightTime + this.vel.x * 0.14,
      dy / flightTime + 0.5 * 20 * flightTime,
      dz / flightTime + this.vel.z * 0.14,
    );

    this.spawnGrenade(_org, _gThrowVel, true);
    this.p2p.send({
      t: 'g',
      p: [Number(_org.x.toFixed(2)), Number(_org.y.toFixed(2)), Number(_org.z.toFixed(2))],
      v: [Number(_gThrowVel.x.toFixed(2)), Number(_gThrowVel.y.toFixed(2)), Number(_gThrowVel.z.toFixed(2))],
    });
    this.emitHud();
  }

  setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  addLookDelta(dx: number, dy: number): void {
    if (!this.playing) return;
    const base = this.adsActive ? 0.0022 : 0.0036;
    const sens = base * this.settings.sensitivity * (this.adsActive ? this.settings.adsMultiplier : 1);
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch - dy * sens));
  }

  setTouchFire(firing: boolean): void {
    this.touchFiring = firing;
    if (firing && this.playing && !WEAPON_SPECS[this.weaponIdx].auto) {
      this.tryShoot();
    }
  }

  toggleTouchAds(): void {
    this.adsActive = !this.adsActive;
  }

  setAds(active: boolean): void {
    this.adsActive = active;
  }

  // ---- Internal Simulation ----

  private setPlaying(v: boolean): void {
    this.playing = v;
    if (!v) this.clearInputs();
    this.emitHud();
  }

  private clearInputs(): void {
    for (const k in this.keys) this.keys[k] = false;
    this.mouseDown = false;
    this.touchFiring = false;
    this.adsActive = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.lastMouseX = null;
    this.lastMouseY = null;
  }

  private equipViewmodel(): void {
    if (this.vmGunHolder) {
      this.vmRoot.remove(this.vmGunHolder);
    }
    const spec = WEAPON_SPECS[this.weaponIdx];
    this.vmGunHolder = this.weaponCache.createMesh(this.weaponIdx, true);
    this.vmRoot.add(this.vmGunHolder);
    this.muzzleNode.position.set(
      spec.muzzleLocal[0] * spec.vmScale,
      spec.muzzleLocal[1] * spec.vmScale,
      spec.muzzleLocal[2] * spec.vmScale,
    );
  }

  private spawnPlayer(): void {
    let best = SPAWN_POINTS[0];
    let bestScore = -1;
    for (const sp of SPAWN_POINTS) {
      let minDist = 99;
      this.remotes.forEach((r) => {
        minDist = Math.min(minDist, Math.hypot(r.pos.x - sp[0], r.pos.z - sp[1]));
      });
      this.botManager.bots.forEach((b) => {
        minDist = Math.min(minDist, Math.hypot(b.pos.x - sp[0], b.pos.z - sp[1]));
      });
      const score = minDist + Math.random() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    this.pos.set(best[0], 0, best[1]);
    this.vel.set(0, 0, 0);
    // Face inward toward arena center (0, 0)
    this.yaw = Math.atan2(best[0], best[1]);
    this.pitch = 0;
    this.hp = 100;
    this.deadTimer = 0;
    this.crouching = false;
    this.crouchToggled = false;
    this.touchCrouching = false;
    this.sprinting = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.landSlowTimer = 0;
    this.shotsFired = 0;
    this.recoilCamPitch = 0;
    this.recoilCamYaw = 0;
    this.reloadTimer = 0;
    this.reloadCueStage = 0;
    this.grenades = this.maxGrenades;
    this.grenadeRefillTimer = 0;
    this.ammo = WEAPON_SPECS.map((w) => w.mag);
    this.emitHud();
  }

  private canUncrouch(): boolean {
    const r = 0.36;
    for (const c of this.arenaMap.colliders) {
      if (c.bottom < this.pos.y + 1.05 || c.bottom > this.pos.y + 1.7) continue;
      const dx = this.pos.x - c.cx;
      const dz = this.pos.z - c.cz;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const ex = lx - Math.max(-c.hx, Math.min(c.hx, lx));
      const ez = lz - Math.max(-c.hz, Math.min(c.hz, lz));
      if (Math.hypot(ex, ez) < r) return false;
    }
    return true;
  }

  private movePlayer(dt: number): void {
    const spec = WEAPON_SPECS[this.weaponIdx];

    const wantCrouch = Boolean(
      this.keys.ControlLeft ||
        this.keys.ControlRight ||
        this.crouchToggled ||
        this.touchCrouching ||
        (!this.settings.crouchToggle && this.keys.KeyC),
    );
    const shiftHeld = Boolean(this.keys.ShiftLeft || this.keys.ShiftRight);
    const forwardInput =
      (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) -
      (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) +
      this.touchMoveY;
    const strafeInput =
      (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) -
      (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) +
      this.touchMoveX;

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.landSlowTimer = Math.max(0, this.landSlowTimer - dt);

    if (this.slideTimer > 0) {
      this.slideTimer = Math.max(0, this.slideTimer - dt);
      this.crouching = true;
      this.sprinting = false;
      const slideFrac = this.slideTimer / 0.58;
      const slideSpeed = 3.8 + slideFrac * (this.slideInitialSpeed - 3.8);
      const steerX = Math.cos(this.yaw) * strafeInput;
      const steerZ = -Math.sin(this.yaw) * strafeInput;
      this.vel.x = this.slideDirX * slideSpeed + steerX * 1.1;
      this.vel.z = this.slideDirZ * slideSpeed + steerZ * 1.1;

      this.slideDustAccum += dt;
      if (this.slideDustAccum >= 0.07) {
        this.slideDustAccum = 0;
        this.burstParticles(_landBurst.set(this.pos.x, this.pos.y + 0.06, this.pos.z), 3, [0.78, 0.68, 0.5], 1.8, 0.28);
      }

      if (this.slideTimer <= 0 && !wantCrouch && this.canUncrouch()) {
        this.crouching = false;
      }
    } else {
      if (wantCrouch) {
        this.crouching = true;
      } else if (this.crouching && this.canUncrouch()) {
        this.crouching = false;
      }
    }

    const mobileAutoSprint = this.touchMoveY > 0.82;
    const wantSprint =
      (shiftHeld || mobileAutoSprint) &&
      !this.crouching &&
      this.slideTimer <= 0 &&
      !this.adsActive &&
      forwardInput > 0.1;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let wx = -sinY * forwardInput + cosY * strafeInput;
    let wz = -cosY * forwardInput - sinY * strafeInput;
    const wishLen = Math.hypot(wx, wz);
    if (wishLen > 1e-4) {
      wx /= wishLen;
      wz /= wishLen;
    }

    let maxMoveSpeed = spec.maxSpeed;
    if (this.crouching) maxMoveSpeed *= 0.42;
    else if (wantSprint) maxMoveSpeed *= 1.32;
    if (this.adsActive) maxMoveSpeed *= 0.76;
    if (this.landSlowTimer > 0) maxMoveSpeed *= 0.78;

    const wishMag = Math.min(1, wishLen);
    this.sprinting = wantSprint && wishMag > 0.1;
    const targetWishSpeed = maxMoveSpeed * wishMag;

    if (this.slideTimer <= 0) {
      if (this.onGround) {
        // CS 1.6 Ground Friction (fast stop on release & crisp counter-strafing)
        const speed = Math.hypot(this.vel.x, this.vel.z);
        if (speed > 1e-4) {
          const control = Math.max(speed, 1.9);
          const drop = control * 6.4 * dt;
          const newSpeed = Math.max(0, speed - drop);
          const ratio = newSpeed / speed;
          this.vel.x *= ratio;
          this.vel.z *= ratio;
        }
        // CS 1.6 Ground Acceleration
        if (wishMag > 1e-4) {
          const currentSpeed = this.vel.x * wx + this.vel.z * wz;
          const addSpeed = targetWishSpeed - currentSpeed;
          if (addSpeed > 0) {
            const accelSpeed = Math.min(11.5 * dt * targetWishSpeed, addSpeed);
            this.vel.x += accelSpeed * wx;
            this.vel.z += accelSpeed * wz;
          }
        }
      } else if (wishMag > 1e-4) {
        // CS 1.6 Air Acceleration (enables true air-strafing with A/D + mouse curve)
        const airWish = Math.min(targetWishSpeed, 1.15);
        const currentSpeed = this.vel.x * wx + this.vel.z * wz;
        const addSpeed = airWish - currentSpeed;
        if (addSpeed > 0) {
          const accelSpeed = Math.min(18.0 * dt * targetWishSpeed, addSpeed);
          this.vel.x += accelSpeed * wx;
          this.vel.z += accelSpeed * wz;
        }
      }
    }

    if (this.keys.Space && this.onGround) {
      this.triggerJump();
    }

    // Climbable Stairs_01 ladders up to Building_01 rooftops
    let climbing = false;
    for (const lad of this.arenaMap.ladders) {
      const dLad = Math.hypot(this.pos.x - lad.x, this.pos.z - lad.z);
      if (dLad < lad.radius && this.pos.y < lad.topY + 0.15) {
        if (forwardInput > 0.15 || this.keys.Space) {
          climbing = true;
          this.vel.y = 4.6;
          this.onGround = false;
          if (this.pos.y >= lad.topY - 0.35) {
            this.pos.x += lad.pushX * 3.2 * dt;
            this.pos.z += lad.pushZ * 3.2 * dt;
          }
          break;
        }
      }
    }

    if (!climbing) {
      this.vel.y -= 21.5 * dt;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = Math.max(0, this.pos.y + this.vel.y * dt);

    const playerHeight = this.crouching ? 1.18 : 1.7;
    resolvePlayerCollisions(this.pos, this.vel, this.arenaMap.colliders, 0.38, playerHeight);
    const groundY = resolvePlayerCollisions(this.pos, this.vel, this.arenaMap.colliders, 0.38, playerHeight);

    if (this.pos.y <= groundY + 0.002 && this.vel.y <= 0) {
      if (!this.onGround && this.vel.y < -5.8) {
        this.landSlowTimer = 0.12;
        if (!this.crouching) soundEngine.footstep();
        this.burstParticles(_landBurst.set(this.pos.x, groundY + 0.04, this.pos.z), 6, [0.7, 0.6, 0.45], 2.0, 0.35);
      }
      this.pos.y = groundY;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizSpeed > 1.2) {
      this.bobPhase += dt * horizSpeed * 1.45;
      if (!this.crouching && this.slideTimer <= 0 && horizSpeed > 2.6) {
        this.stepAccum += dt * horizSpeed;
        const stepThreshold = this.sprinting ? 2.05 : 2.5;
        if (this.stepAccum > stepThreshold) {
          this.stepAccum = 0;
          soundEngine.footstep();
        }
      }
    }
  }

  private computeCurrentInaccuracy(): number {
    const spec = WEAPON_SPECS[this.weaponIdx];
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    const base =
      spec.spread *
      (this.adsActive ? spec.adsSpreadMul : 1) *
      (this.crouching ? spec.crouchSpreadMul : 1);

    // Easy CS 1.6 arcade accuracy: counter-strafing yields pinpoint precision, gentle moving spread
    const speedFactor =
      horizSpeed > 0.9
        ? Math.min(1.05, (horizSpeed - 0.9) / Math.max(1, spec.maxSpeed - 0.9))
        : 0;
    const movePenalty =
      speedFactor * spec.moveInaccuracy * (this.crouching ? 0.35 : this.sprinting ? 1.1 : 0.85);
    const airPenalty = this.onGround ? 0 : spec.category === 'SMG' ? 0.015 : 0.026;
    const sprayPenalty = Math.min(0.014, this.shotsFired * 0.0012);
    return base + movePenalty + airPenalty + sprayPenalty;
  }

  private tryShoot(): void {
    const spec = WEAPON_SPECS[this.weaponIdx];
    if (this.deadTimer > 0 || this.reloadTimer > 0 || this.fireCooldown > 0 || this.swapTimer > 0.08) {
      return;
    }
    if (this.ammo[this.weaponIdx] <= 0) {
      soundEngine.dryFire();
      this.triggerReload();
      return;
    }

    this.ammo[this.weaponIdx]--;
    this.fireCooldown = 60 / spec.rpm;

    const spread = this.computeCurrentInaccuracy();
    const crouchMul = this.crouching ? 0.72 : 1.0;
    const adsMul = this.adsActive ? 0.65 : 1.0;

    // CS 1.6 deterministic spray climb + S-curve sway on sustained fire (tuned for snappy ease)
    const climb = Math.min(0.055, this.shotsFired * spec.sprayClimb * 0.42) * crouchMul * adsMul;
    const sway =
      Math.sin(this.shotsFired * 0.58) *
      Math.min(1, Math.max(0, this.shotsFired - 3) * 0.14) *
      spec.spraySway *
      0.55 *
      crouchMul *
      adsMul;

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, this.camera.up).normalize();
    _camUp.crossVectors(_right, _dir).normalize();

    _dir.addScaledVector(_camUp, climb + (Math.random() - 0.5) * spread * 2);
    _dir.addScaledVector(_right, sway + (Math.random() - 0.5) * spread * 2);
    _dir.normalize();

    _org.copy(this.camera.position);
    this.muzzleNode.getWorldPosition(_muz);

    let bestT = 200;
    let hitWall = false;
    for (const c of this.arenaMap.colliders) {
      const t = raycastOBB(_org, _dir, c, _norm);
      if (t !== null && t < bestT) {
        bestT = t;
        _hitNorm.copy(_norm);
        hitWall = true;
      }
    }
    if (_dir.y < -1e-5) {
      const tg = -_org.y / _dir.y;
      if (tg > 0 && tg < bestT) {
        bestT = tg;
        _hitNorm.set(0, 1, 0);
        hitWall = true;
      }
    }

    let hitRemote: RemotePeerState | null = null;
    let hitBot: BotActor | null = null;
    let headshot = false;

    const testCylinder = (targetPos: THREE.Vector3, height: number): { t: number; head: boolean } | null => {
      const dx = _org.x - targetPos.x;
      const dz = _org.z - targetPos.z;
      const a = _dir.x * _dir.x + _dir.z * _dir.z;
      if (a < 1e-8) return null;
      const b = 2 * (dx * _dir.x + dz * _dir.z);
      const c = dx * dx + dz * dz - 0.29;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) return null;
      const y = _org.y + _dir.y * t - targetPos.y;
      if (y < 0 || y > height) return null;
      return { t, head: y > height - 0.34 };
    };

    this.remotes.forEach((r) => {
      if (r.hp <= 0) return;
      const res = testCylinder(r.pos, r.crouching ? 1.18 : 1.75);
      if (res && res.t < bestT) {
        bestT = res.t;
        hitRemote = r;
        hitBot = null;
        headshot = res.head;
        hitWall = false;
      }
    });

    for (const bot of this.botManager.bots) {
      if (bot.hp <= 0 || bot.respawnTimer > 0) continue;
      const res = testCylinder(bot.pos, 1.75);
      if (res && res.t < bestT) {
        bestT = res.t;
        hitBot = bot;
        hitRemote = null;
        headshot = res.head;
        hitWall = false;
      }
    }

    _end.copy(_org).addScaledVector(_dir, bestT);
    this.spawnTracer(_muz, _end);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    this.flashTimer = 0.04;
    this.muzzleLight.intensity = 2.2;
    soundEngine.shot(spec.id, 1, true);

    // Snappy camera recoil punch & spray counter increment
    this.shotsFired = Math.min(18, this.shotsFired + 1);
    this.recoilCamPitch = Math.min(0.08, this.recoilCamPitch + spec.recoilPitch * crouchMul * adsMul);
    this.recoilCamYaw += (sway * 0.22 + (Math.random() - 0.5) * spec.recoilYaw) * crouchMul * adsMul;
    this.vmKick = Math.min(1.1, this.vmKick + 0.68);
    this.screenShake = Math.min(0.09, this.screenShake + spec.recoilPitch * 1.5);

    const dmg = Math.round(
      spec.damage * (headshot ? spec.headshotMul : 1) * (bestT > 42 ? 0.85 : 1),
    );

    if (hitBot) {
      this.burstParticles(_end, 14, [1, 0.16, 0.12], 3.2, 0.45);
      this.showHitMarker(headshot);
      hitBot.hp -= dmg;
      if (hitBot.hp <= 0) {
        hitBot.hp = 0;
        hitBot.deaths++;
        hitBot.respawnTimer = 3.0;
        hitBot.visual.root.visible = false;
        this.me.kills++;
        this.registerKillCallout(headshot);
        this.pushKillFeed(this.me.name, hitBot.name, spec.name, headshot);
      } else {
        this.botManager.notifyDamaged(hitBot, this.pos);
      }
    } else if (hitRemote) {
      const target = hitRemote as RemotePeerState;
      this.burstParticles(_end, 14, [1, 0.16, 0.12], 3.2, 0.45);
      this.showHitMarker(headshot);
      this.p2p.send({ t: 'h', to: target.id, d: dmg, hd: headshot ? 1 : 0, w: this.weaponIdx });
    } else if (hitWall) {
      this.spawnWallHit(_end, _hitNorm);
    }

    if (this.p2p.roomCode === null) {
      this.botManager.alertTo(this.pos, 22);
    }

    this.p2p.send({
      t: 'f',
      m: [_muz.x, _muz.y, _muz.z],
      e: [_end.x, _end.y, _end.z],
      w: this.weaponIdx,
      h: hitRemote ? 1 : 0,
      n: hitWall
        ? [Number(_hitNorm.x.toFixed(3)), Number(_hitNorm.y.toFixed(3)), Number(_hitNorm.z.toFixed(3))]
        : undefined,
    });

    this.emitHud();
  }

  private registerKillCallout(headshot: boolean): void {
    this.streakCount = this.streakTimer > 0 ? this.streakCount + 1 : 1;
    this.streakTimer = 6.0;
    if (this.streakCount >= 4) {
      this.calloutText = 'DOMINATING';
    } else if (this.streakCount === 3) {
      this.calloutText = 'TRIPLE KILL';
    } else if (this.streakCount === 2) {
      this.calloutText = 'DOUBLE KILL';
    } else if (headshot) {
      this.calloutText = 'HEADSHOT';
    } else {
      this.calloutText = '';
    }
    if (this.calloutText) {
      this.calloutTimer = 1.65;
      soundEngine.killCallout(headshot);
    }
  }

  private showHitMarker(headshot: boolean): void {
    this.hitMarker = headshot ? 'head' : 'body';
    this.hitMarkerTimer = 0.16;
    soundEngine.hitmarker(headshot);
  }

  private pushKillFeed(killer: string, victim: string, weapon: string, headshot: boolean): void {
    this.killFeed.unshift({
      id: this.killFeedSeq++,
      killer,
      victim,
      weapon,
      headshot,
      timestamp: performance.now(),
    });
    if (this.killFeed.length > 5) this.killFeed.pop();
    this.emitHud();
  }

  private applyDamageToPlayer(
    dmg: number,
    attackerName: string,
    weaponName: string,
    headshot: boolean,
    sourcePos?: THREE.Vector3,
  ): void {
    if (this.deadTimer > 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.damageFlash = 1.0;
    if (sourcePos) {
      const dx = sourcePos.x - this.pos.x;
      const dz = sourcePos.z - this.pos.z;
      if (dx * dx + dz * dz > 0.04) {
        const fwdDot = dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw);
        const rightDot = dx * Math.cos(this.yaw) + dz * -Math.sin(this.yaw);
        this.damageAngle = Math.atan2(rightDot, fwdDot);
      }
    }
    this.screenShake = Math.min(0.28, this.screenShake + 0.16);
    soundEngine.tone(175, 85, 0.12, 0.25, 'sawtooth');
    if (this.hp <= 0) {
      this.deadTimer = 3.0;
      this.me.deaths++;
      this.streakCount = 0;
      this.streakTimer = 0;
      this.crouching = false;
      this.crouchToggled = false;
      this.slideTimer = 0;
      this.slideCooldown = 0;
      soundEngine.death();
      this.pushKillFeed(attackerName, this.me.name, weaponName, headshot);
    }
    this.emitHud();
  }

  // ---- Remote P2P Synchronization ----

  private getOrCreateRemote(id: number, name: string): RemotePeerState {
    const existing = this.remotes.get(id);
    if (existing) return existing;
    const visual = createCombatantVisual(name, 0x3b5875, 0, this.weaponCache);
    this.scene.add(visual.root);
    const state: RemotePeerState = {
      id,
      name,
      pos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      yaw: 0,
      targetYaw: 0,
      pitch: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      weaponIdx: 0,
      crouching: false,
      lastPos: new THREE.Vector3(),
      horizSpeed: 0,
      stepAccum: 0,
      lastFireTime: -10_000,
      visual,
    };
    this.remotes.set(id, state);
    this.emitHud();
    return state;
  }

  private removeRemote(id: number): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.visual.root);
    r.visual.dispose();
    this.remotes.delete(id);
    this.emitHud();
  }

  private handleP2PMessage(m: P2PMessage): void {
    switch (m.t) {
      case 's': {
        if (m.from === undefined) return;
        const r = this.getOrCreateRemote(m.from, String(m.n || 'Player').slice(0, 14));
        r.name = String(m.n || 'Player').slice(0, 14);
        r.targetPos.set(m.p[0], m.p[1], m.p[2]);
        r.targetYaw = m.r;
        r.pitch = m.q;
        r.crouching = Boolean(m.sl);
        r.hp = m.hp;
        if (typeof m.kl === 'number') r.kills = Math.max(r.kills, m.kl);
        if (typeof m.dt === 'number') r.deaths = Math.max(r.deaths, m.dt);
        r.visual.root.visible = r.hp > 0;
        if (r.weaponIdx !== m.w && m.w >= 0 && m.w < WEAPON_SPECS.length) {
          r.weaponIdx = m.w;
          r.visual.setWeapon(m.w, this.weaponCache);
        }
        r.visual.updateLabel(r.name, r.hp);
        break;
      }
      case 'f': {
        if (m.from !== undefined) {
          const shooter = this.remotes.get(m.from);
          if (shooter) shooter.lastFireTime = performance.now();
        }
        _muz.set(m.m[0], m.m[1], m.m[2]);
        _end.set(m.e[0], m.e[1], m.e[2]);
        this.spawnTracer(_muz, _end);
        const dist = this.pos.distanceTo(_muz);
        const spec = WEAPON_SPECS[m.w] ?? WEAPON_SPECS[0];
        soundEngine.shot(spec.id, Math.max(0.08, 1 - dist / 55), false);
        if (m.n) {
          _hitNorm.set(m.n[0], m.n[1], m.n[2]);
          this.spawnWallHit(_end, _hitNorm);
        }
        break;
      }
      case 'g': {
        _org.set(m.p[0], m.p[1], m.p[2]);
        _gThrowVel.set(m.v[0], m.v[1], m.v[2]);
        this.spawnGrenade(_org, _gThrowVel, false);
        const dist = this.pos.distanceTo(_org);
        if (dist < 28) soundEngine.grenadeThrow();
        break;
      }
      case 'h': {
        if (m.to !== this.p2p.myId || this.deadTimer > 0) return;
        const attacker = m.from !== undefined ? this.remotes.get(m.from) : undefined;
        const weaponLabel =
          m.w === -1
            ? 'Frag Grenade'
            : (m.w !== undefined && WEAPON_SPECS[m.w]
                ? WEAPON_SPECS[m.w]
                : attacker
                  ? WEAPON_SPECS[attacker.weaponIdx]
                  : WEAPON_SPECS[0]
              ).name;
        const prevHp = this.hp;
        this.applyDamageToPlayer(m.d, attacker?.name ?? 'Enemy', weaponLabel, Boolean(m.hd), attacker?.pos);
        if (prevHp > 0 && this.hp <= 0) {
          this.p2p.send({
            t: 'k',
            k: m.from ?? 0,
            v: this.p2p.myId,
            w: m.w ?? attacker?.weaponIdx ?? 0,
            hd: m.hd,
          });
        }
        break;
      }
      case 'k': {
        if (m.k === this.p2p.myId && m.v !== this.p2p.myId) {
          this.me.kills++;
          this.registerKillCallout(Boolean(m.hd));
        } else if (m.k !== m.v) {
          const killer = this.remotes.get(m.k);
          if (killer) killer.kills++;
        }
        if (m.v !== this.p2p.myId) {
          const victim = this.remotes.get(m.v);
          if (victim) {
            victim.deaths++;
            victim.hp = 0;
            victim.visual.root.visible = false;
          }
        }
        const killerName = m.k === this.p2p.myId ? this.me.name : this.remotes.get(m.k)?.name ?? 'Player';
        const victimName = m.v === this.p2p.myId ? this.me.name : this.remotes.get(m.v)?.name ?? 'Player';
        const wName = m.w === -1 ? 'Frag Grenade' : WEAPON_SPECS[m.w ?? 0]?.name ?? 'Weapon';
        this.pushKillFeed(killerName, victimName, wName, Boolean(m.hd));
        break;
      }
      case 'bye': {
        this.removeRemote(m.id);
        break;
      }
      case 'lob':
      case 'launch':
      case 'chat': {
        this.onLobbyPacket?.(m);
        break;
      }
    }
  }

  // ---- Grenade Simulation & Explosions ----

  private spawnGrenade(origin: THREE.Vector3, velocity: THREE.Vector3, isLocal: boolean): void {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.grenadeBodyGeo, this.grenadeBodyMat);
    const collar = new THREE.Mesh(this.grenadeCollarGeo, this.grenadeCollarMat);
    collar.position.y = 0.088;
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    const led = new THREE.Mesh(this.grenadeLedGeo, ledMat);
    led.position.set(0, 0.115, 0);
    group.add(body, collar, led);
    group.position.copy(origin);
    this.scene.add(group);

    this.activeGrenades.push({
      mesh: group,
      ledMat,
      pos: origin.clone(),
      vel: velocity.clone(),
      ttl: 1.85,
      isLocal,
      bounced: false,
    });
  }

  private updateGrenades(dt: number): void {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.ttl -= dt;

      g.vel.y -= 20 * dt;
      _gStep.copy(g.vel).multiplyScalar(dt);
      const stepLen = _gStep.length();

      if (stepLen > 1e-4) {
        _gRayDir.copy(_gStep).divideScalar(stepLen);
        let bestT = stepLen + 0.11;
        let hit = false;

        for (const c of this.arenaMap.colliders) {
          const t = raycastOBB(g.pos, _gRayDir, c, _norm);
          if (t !== null && t < bestT) {
            bestT = t;
            _hitNorm.copy(_norm);
            hit = true;
          }
        }

        if (hit) {
          const moveT = Math.max(0, bestT - 0.11);
          g.pos.addScaledVector(_gRayDir, moveT);
          const vn = g.vel.dot(_hitNorm);
          if (vn < 0) {
            if (!g.bounced && vn < -2.2) {
              g.bounced = true;
              soundEngine.grenadeBounce(Math.max(0.1, 1 - this.pos.distanceTo(g.pos) / 28));
            }
            g.vel.addScaledVector(_hitNorm, -1.14 * vn);
            g.vel.multiplyScalar(0.36);
          }
        } else {
          g.pos.add(_gStep);
        }
      }

      // Ground settle & heavy sand damping (minimal bounce so it drops near aim point)
      if (g.pos.y <= 0.11) {
        g.pos.y = 0.11;
        if (!g.bounced && g.vel.y < -2.0) {
          g.bounced = true;
          soundEngine.grenadeBounce(Math.max(0.1, 1 - this.pos.distanceTo(g.pos) / 28));
          g.vel.x *= 0.42;
          g.vel.z *= 0.42;
        }
        if (g.vel.y < -1.6) {
          g.vel.y = -g.vel.y * 0.12;
        } else {
          g.vel.y = 0;
        }
      }

      if (g.pos.y <= 0.14) {
        const sandDrag = Math.exp(-16.0 * dt);
        g.vel.x *= sandDrag;
        g.vel.z *= sandDrag;
        if (Math.hypot(g.vel.x, g.vel.z) < 0.14 && Math.abs(g.vel.y) < 0.1) {
          g.vel.x = 0;
          g.vel.z = 0;
        }
      }

      // Arena perimeter damp
      const bound = ARENA_HALF_EXTENT - 0.15;
      if (g.pos.x < -bound) {
        g.pos.x = -bound;
        g.vel.x = Math.abs(g.vel.x) * 0.28;
      } else if (g.pos.x > bound) {
        g.pos.x = bound;
        g.vel.x = -Math.abs(g.vel.x) * 0.28;
      }
      if (g.pos.z < -bound) {
        g.pos.z = -bound;
        g.vel.z = Math.abs(g.vel.z) * 0.28;
      } else if (g.pos.z > bound) {
        g.pos.z = bound;
        g.vel.z = -Math.abs(g.vel.z) * 0.28;
      }

      g.mesh.position.copy(g.pos);
      const speed = g.vel.length();
      if (speed > 0.2) {
        g.mesh.rotation.x += dt * speed * 1.9;
        g.mesh.rotation.z -= dt * speed * 1.4;
      }

      // Fuse LED warning blink
      if (g.ttl < 0.7) {
        const blink = Math.sin(g.ttl * 38) > 0;
        g.ledMat.color.setHex(blink ? 0xffffff : 0xff2b2b);
      }

      if (g.ttl <= 0) {
        this.detonateGrenade(g);
        this.scene.remove(g.mesh);
        g.ledMat.dispose();
        this.activeGrenades.splice(i, 1);
      }
    }

    // Update shockwave visuals
    for (let i = this.activeBlasts.length - 1; i >= 0; i--) {
      const b = this.activeBlasts[i];
      b.ttl -= dt;
      if (b.ttl <= 0) {
        this.scene.remove(b.mesh);
        this.scene.remove(b.light);
        b.mat.dispose();
        this.activeBlasts.splice(i, 1);
        continue;
      }
      const p = 1 - b.ttl / b.maxTtl;
      const scale = 0.6 + p * 5.6;
      b.mesh.scale.setScalar(scale);
      b.mat.opacity = 0.68 * (1 - p);
      b.light.intensity = 10 * (1 - p);
    }
  }

  private hasBlastLineOfSight(blastOrigin: THREE.Vector3, targetPos: THREE.Vector3): boolean {
    _org.copy(blastOrigin);
    _org.y += 0.25;
    _gTarget.copy(targetPos);
    _gTarget.y += 0.95;
    _gRayDir.subVectors(_gTarget, _org);
    const dist = _gRayDir.length();
    if (dist < 0.2) return true;
    _gRayDir.divideScalar(dist);
    for (const c of this.arenaMap.colliders) {
      const t = raycastOBB(_org, _gRayDir, c, _norm);
      if (t !== null && t < dist - 0.15) {
        return false;
      }
    }
    return true;
  }

  private detonateGrenade(g: ActiveGrenade): void {
    const blastPos = g.pos;
    const distToMe = this.pos.distanceTo(blastPos);

    soundEngine.explosion(Math.max(0.15, 1 - distToMe / 34));
    if (distToMe < 16) {
      this.screenShake = Math.min(0.42, this.screenShake + 0.36 * (1 - distToMe / 16));
    }

    // Visual shockwave + fireball particles (skip dynamic PointLight on low-end GPUs to prevent shader stalls)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8c32,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const blastMesh = new THREE.Mesh(this.blastGeo, mat);
    blastMesh.position.copy(blastPos);
    const light = new THREE.PointLight(0xff9436, this.effectiveQuality === 'low' ? 0 : 10, 14);
    light.position.copy(blastPos);
    light.position.y += 0.4;
    if (this.effectiveQuality !== 'low') {
      this.scene.add(blastMesh, light);
    } else {
      this.scene.add(blastMesh);
    }
    this.activeBlasts.push({ mesh: blastMesh, mat, light, ttl: 0.34, maxTtl: 0.34 });

    const burstScale = this.effectiveQuality === 'low' ? 0.55 : 1;
    this.burstParticles(blastPos, Math.round(46 * burstScale), [1, 0.58, 0.16], 9.2, 0.62);
    this.burstParticles(blastPos, Math.round(24 * burstScale), [0.42, 0.38, 0.34], 5.0, 0.85);

    // Only the throwing client calculates & awards grenade splash damage
    if (!g.isLocal) return;

    const BLAST_RADIUS = 6.5;
    let landedHit = false;

    const computeSplash = (targetPos: THREE.Vector3): number => {
      const d = targetPos.distanceTo(blastPos);
      if (d > BLAST_RADIUS) return 0;
      const falloff = 1 - d / BLAST_RADIUS;
      const raw = 15 + 95 * falloff;
      const coverMul = this.hasBlastLineOfSight(blastPos, targetPos) ? 1 : 0.35;
      return Math.round(raw * coverMul);
    };

    for (const bot of this.botManager.bots) {
      if (bot.hp <= 0 || bot.respawnTimer > 0) continue;
      const dmg = computeSplash(bot.pos);
      if (dmg <= 0) continue;
      landedHit = true;
      bot.hp -= dmg;
      if (bot.hp <= 0) {
        bot.hp = 0;
        bot.deaths++;
        bot.respawnTimer = 3.0;
        bot.visual.root.visible = false;
        this.me.kills++;
        this.registerKillCallout(false);
        this.pushKillFeed(this.me.name, bot.name, 'Frag Grenade', false);
      } else {
        this.botManager.notifyDamaged(bot, blastPos);
      }
    }

    this.remotes.forEach((r) => {
      if (r.hp <= 0) return;
      const dmg = computeSplash(r.pos);
      if (dmg <= 0) return;
      landedHit = true;
      this.p2p.send({ t: 'h', to: r.id, d: dmg, hd: 0, w: -1 });
    });

    if (landedHit) {
      this.showHitMarker(false);
    }

    const selfDmg = Math.round(computeSplash(this.pos) * 0.65);
    if (selfDmg > 0 && this.deadTimer <= 0) {
      this.applyDamageToPlayer(selfDmg, this.me.name, 'Frag Grenade', false, blastPos);
    }
  }

  // ---- VFX Helpers ----

  private burstParticles(
    origin: THREE.Vector3,
    count: number,
    col: [number, number, number],
    speed: number,
    life: number,
  ): void {
    for (let k = 0; k < count; k++) {
      const i = this.partCursor++ % this.MAX_PARTICLES;
      this.partPos[i * 3] = origin.x;
      this.partPos[i * 3 + 1] = origin.y;
      this.partPos[i * 3 + 2] = origin.z;
      this.partVel[i * 3] = (Math.random() - 0.5) * speed;
      this.partVel[i * 3 + 1] = (Math.random() - 0.15) * speed;
      this.partVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.partMaxCol[i * 3] = col[0];
      this.partMaxCol[i * 3 + 1] = col[1];
      this.partMaxCol[i * 3 + 2] = col[2];
      this.partMaxLife[i] = this.partLife[i] = life * (0.6 + Math.random() * 0.4);
    }
  }

  private burstDirectionalSparks(origin: THREE.Vector3, normal: THREE.Vector3, count: number): void {
    for (let k = 0; k < count; k++) {
      const i = this.partCursor++ % this.MAX_PARTICLES;
      this.partPos[i * 3] = origin.x + normal.x * 0.03;
      this.partPos[i * 3 + 1] = origin.y + normal.y * 0.03;
      this.partPos[i * 3 + 2] = origin.z + normal.z * 0.03;
      const outSpeed = 2.4 + Math.random() * 3.6;
      this.partVel[i * 3] = normal.x * outSpeed + (Math.random() - 0.5) * 3.2;
      this.partVel[i * 3 + 1] = normal.y * outSpeed + Math.random() * 2.4;
      this.partVel[i * 3 + 2] = normal.z * outSpeed + (Math.random() - 0.5) * 3.2;
      const hot = k % 3 === 0;
      this.partMaxCol[i * 3] = 1.0;
      this.partMaxCol[i * 3 + 1] = hot ? 0.94 : 0.72;
      this.partMaxCol[i * 3 + 2] = hot ? 0.68 : 0.24;
      this.partMaxLife[i] = this.partLife[i] = 0.16 + Math.random() * 0.18;
    }
  }

  private spawnDustPuff(pos: THREE.Vector3, normal: THREE.Vector3): void {
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.MeshBasicMaterial({
        color: k === 0 ? 0xe0cea8 : 0xc8b38a,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.dustGeo, mat);
      mesh.position
        .copy(pos)
        .addScaledVector(normal, 0.06 + k * 0.04)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.06, Math.random() * 0.05, (Math.random() - 0.5) * 0.06));
      mesh.scale.setScalar(0.55);
      this.scene.add(mesh);

      const vel = new THREE.Vector3(
        normal.x * (1.1 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.75,
        normal.y * (0.9 + Math.random() * 0.7) + 0.55,
        normal.z * (1.1 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.75,
      );
      const maxTtl = 0.34 + Math.random() * 0.12;
      this.dustPuffs.push({ mesh, mat, vel, ttl: maxTtl, maxTtl });
    }
    while (this.dustPuffs.length > this.maxDustPuffs) {
      const old = this.dustPuffs.shift();
      if (old) {
        this.scene.remove(old.mesh);
        old.mat.dispose();
      }
    }
  }

  private spawnWallHit(pos: THREE.Vector3, normal: THREE.Vector3): void {
    this.burstDirectionalSparks(pos, normal, this.effectiveQuality === 'low' ? 6 : 10);
    if (this.effectiveQuality !== 'low') {
      this.spawnDustPuff(pos, normal);
    }
    this.spawnDecal(pos, normal);
    const dist = this.pos.distanceTo(pos);
    soundEngine.wallImpact(Math.max(0.08, 1 - dist / 42));
  }

  private spawnTracer(a: THREE.Vector3, b: THREE.Vector3): void {
    const dist = a.distanceTo(b);
    if (dist < 0.4) return;
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.scale.z = dist;
    mesh.lookAt(b);
    this.scene.add(mesh);
    this.tracers.push({ mesh, ttl: 0.055 });
  }

  private spawnDecal(pos: THREE.Vector3, normal: THREE.Vector3): void {
    if (normal.y < -0.5) return;
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
    mesh.position.copy(pos).addScaledVector(normal, 0.015);
    mesh.lookAt(_end.copy(pos).add(normal));
    mesh.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(mesh);
    this.decals.push(mesh);
    while (this.decals.length > this.maxDecals) {
      const old = this.decals.shift();
      if (old) this.scene.remove(old);
    }
  }

  private spawnDroppedMag(style: string): void {
    const look = MAG_DROP_LOOK[style] ?? MAG_DROP_LOOK.ak_rock_lock;
    const mat = new THREE.MeshStandardMaterial({
      color: look.col,
      roughness: 0.58,
      metalness: 0.35,
    });
    const mesh = new THREE.Mesh(this.droppedMagGeo, mat);
    mesh.scale.set(look.sx, look.sy, look.sz);

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, this.camera.up).normalize();
    _camUp.crossVectors(_right, _dir).normalize();

    mesh.position
      .copy(this.camera.position)
      .addScaledVector(_dir, 0.36)
      .addScaledVector(_right, 0.08)
      .addScaledVector(_camUp, -0.26);
    mesh.rotation.set(Math.random(), this.yaw + 0.4, (Math.random() - 0.5) * 0.6);
    this.scene.add(mesh);

    const vel = new THREE.Vector3()
      .copy(this.vel)
      .multiplyScalar(0.45)
      .addScaledVector(_right, -0.85 - Math.random() * 0.55)
      .addScaledVector(_dir, 0.45);
    vel.y = -1.2 - Math.random() * 0.6;

    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 11,
    );

    this.droppedMags.push({
      mesh,
      mat,
      vel,
      angVel,
      halfH: 0.072 * look.sy,
      ttl: 3.0,
      bounced: false,
    });
    while (this.droppedMags.length > 6) {
      const old = this.droppedMags.shift();
      if (old) {
        this.scene.remove(old.mesh);
        old.mat.dispose();
      }
    }
  }

  private triggerReloadStageEffect(cue: string): void {
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, this.camera.up).normalize();
    _camUp.crossVectors(_right, _dir).normalize();
    _org
      .copy(this.camera.position)
      .addScaledVector(_dir, 0.42)
      .addScaledVector(_right, 0.14)
      .addScaledVector(_camUp, -0.14);

    if (
      cue === 'ak_rack' ||
      cue === 'deagle_slide' ||
      cue === 'g36_bolt' ||
      cue === 'slide_stop' ||
      cue === 'hk_slap' ||
      cue === 'hk_lock' ||
      cue === 'smg_rack' ||
      cue === 'bolt_catch'
    ) {
      this.vmKick = Math.min(1.05, this.vmKick + 0.28);
      this.screenShake = Math.min(0.16, this.screenShake + 0.068);
      this.reloadKickRoll -= 0.032;
      this.burstParticles(_org, 7, [1.0, 0.84, 0.44], 2.2, 0.2);
    } else if (
      cue === 'ak_rock_in' ||
      cue === 'deagle_slam' ||
      cue === 'mag_click' ||
      cue === 'mag_tap' ||
      cue === 'p90_smack' ||
      cue === 'p90_seat' ||
      cue === 'heavy_in' ||
      cue === 'smg_in' ||
      cue === 'pistol_seat'
    ) {
      this.vmKick = Math.min(1.0, this.vmKick + 0.16);
      this.screenShake = Math.min(0.12, this.screenShake + 0.038);
      this.reloadKickRoll += (Math.random() > 0.5 ? 1 : -1) * 0.022;
      this.burstParticles(_org, 4, [0.82, 0.72, 0.56], 1.4, 0.22);
    }
  }

  // ---- Input Handlers ----

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handlePointerLockChange(): void {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (locked) {
      this.softLocked = false;
      this.setPlaying(true);
    } else if (!this.softLocked) {
      this.setPlaying(false);
      if (this.started) this.onPauseRequested();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape' && this.softLocked && this.playing) {
      e.preventDefault();
      this.pauseToMenu();
      return;
    }
    if (!this.playing) return;
    if (
      e.ctrlKey ||
      e.shiftKey ||
      e.metaKey ||
      e.altKey ||
      /^(Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab|ControlLeft|ControlRight|ShiftLeft|ShiftRight)$/.test(e.code)
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.keys[e.code] = true;
    if (e.code === 'KeyR') this.triggerReload();
    if (e.code === 'KeyG' && !e.repeat) this.triggerGrenade();
    if (/^Digit[1-7]$/.test(e.code)) this.selectWeapon(Number(e.code[5]) - 1);
    if (!e.repeat && (e.code === 'ControlLeft' || e.code === 'ControlRight')) {
      this.tryStartSlide();
    }
    if (e.code === 'KeyC' && !e.repeat) {
      if (this.tryStartSlide()) {
        this.emitHud();
      } else if (this.settings.crouchToggle) {
        this.crouchToggled = !this.crouchToggled;
        this.emitHud();
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.playing) return;
    let dx = e.movementX || 0;
    let dy = e.movementY || 0;
    if (!this.pointerLocked && this.softLocked && dx === 0 && dy === 0) {
      if (this.lastMouseX !== null && this.lastMouseY !== null) {
        dx = e.clientX - this.lastMouseX;
        dy = e.clientY - this.lastMouseY;
      }
    }
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    const base = this.adsActive ? 0.0014 : 0.0021;
    const sens = base * this.settings.sensitivity * (this.adsActive ? this.settings.adsMultiplier : 1);
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch - dy * sens));
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.playing) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, a, [role="dialog"]')) return;
    if (this.preferPointerLock && !this.pointerLocked && e.target === this.renderer.domElement) {
      this.requestLock();
    }
    if (e.button === 0) {
      this.mouseDown = true;
      if (!WEAPON_SPECS[this.weaponIdx].auto) this.tryShoot();
    } else if (e.button === 2) {
      this.adsActive = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.adsActive = false;
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.playing) return;
    this.selectWeapon((this.weaponIdx + (e.deltaY > 0 ? 1 : WEAPON_SPECS.length - 1)) % WEAPON_SPECS.length);
  }

  // ---- Main Loop & Software-GL Pacing ----

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawMs = now - this.lastTime;
    const dt = Math.min(rawMs / 1000, 0.05);
    this.lastTime = now;

    // Auto performance guard: step down quality cleanly if sustained <40 FPS on low-end GPUs
    if (
      this.playing &&
      !this.autoDowngraded &&
      this.settings.graphicsQuality === 'auto' &&
      rawMs > 4 &&
      rawMs < 200
    ) {
      this.frameEmaMs = this.frameEmaMs * 0.94 + rawMs * 0.06;
      if (this.frameEmaMs > 25) {
        this.slowFrameStreak++;
        if (this.slowFrameStreak > 90) {
          this.autoDowngraded = true;
          this.applyQualityProfile();
        }
      } else {
        this.slowFrameStreak = Math.max(0, this.slowFrameStreak - 1);
      }
    }

    const spec = WEAPON_SPECS[this.weaponIdx];

    if (this.playing && this.deadTimer <= 0) {
      this.movePlayer(dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if ((this.mouseDown || this.touchFiring) && spec.auto) {
        this.tryShoot();
      }
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        const progress = Math.min(1, 1 - this.reloadTimer / Math.max(0.1, this.reloadDuration));
        const stages = getReloadStages(spec.reloadStyle, this.emptyReload);
        const stageIdx = getReloadStageIndex(spec.reloadStyle, progress, this.emptyReload);
        while (this.reloadCueStage < stageIdx) {
          this.reloadCueStage++;
          const cue = stages[this.reloadCueStage]?.cue;
          if (cue) {
            soundEngine.reloadCue(cue);
            this.triggerReloadStageEffect(cue);
          }
        }
        if (this.reloadTimer <= 0) {
          this.reloadTimer = 0;
          this.reloadCueStage = 0;
          this.ammo[this.weaponIdx] = spec.mag;
          this.vmKick = Math.min(1.0, this.vmKick + 0.1);
          soundEngine.reloadComplete();
          this.emitHud();
        }
      }
    } else if (this.deadTimer > 0) {
      this.deadTimer = Math.max(0, this.deadTimer - dt);
      if (this.deadTimer <= 0) {
        this.spawnPlayer();
      }
    }

    // Grenade recharge & throw animation timer
    this.grenadeThrowAnim = Math.max(0, this.grenadeThrowAnim - dt);
    if (this.started && this.deadTimer <= 0 && this.grenades < this.maxGrenades) {
      this.grenadeRefillTimer += dt;
      if (this.grenadeRefillTimer >= this.grenadeRefillSeconds) {
        this.grenadeRefillTimer = 0;
        this.grenades++;
      }
    } else {
      this.grenadeRefillTimer = 0;
    }

    this.updateGrenades(dt);

    // Update local AI bots ONLY when in Solo vs Bots mode (no multiplayer room active)
    if (this.playing && this.p2p.roomCode === null) {
      this.botManager.update(
        dt,
        this.pos,
        this.deadTimer > 0,
        this.arenaMap.colliders,
        (bot, muz, end, hitPlayer, dmg, head, wallNormal) => {
          this.spawnTracer(muz, end);
          const dist = this.pos.distanceTo(muz);
          soundEngine.shot(WEAPON_SPECS[bot.weaponIdx].id, Math.max(0.1, 1 - dist / 50), false);
          if (hitPlayer && dmg > 0) {
            this.applyDamageToPlayer(dmg, bot.name, WEAPON_SPECS[bot.weaponIdx].name, head, bot.pos);
            if (this.hp <= 0) bot.kills++;
          } else if (wallNormal) {
            this.spawnWallHit(end, wallNormal);
          } else {
            this.burstParticles(end, 6, [1, 0.8, 0.4], 2.4, 0.25);
          }
        },
        (bot) => {
          const dist = this.pos.distanceTo(bot.pos);
          if (dist < 18) {
            soundEngine.remoteFootstep(Math.max(0, 1 - dist / 18));
          }
        },
      );
    }

    // Smooth recoil spring recovery, spray decay & viewmodel animations
    this.swapTimer = Math.max(0, this.swapTimer - dt);
    if (this.fireCooldown <= 0) {
      this.shotsFired = Math.max(0, this.shotsFired - dt * (this.crouching ? 14 : 11));
    }
    this.vmKick = THREE.MathUtils.damp(this.vmKick, 0, 20, dt);
    this.reloadKickRoll = THREE.MathUtils.damp(this.reloadKickRoll, 0, 14, dt);
    this.recoilCamPitch = THREE.MathUtils.damp(this.recoilCamPitch, 0, spec.recoilRecovery, dt);
    this.recoilCamYaw = THREE.MathUtils.damp(this.recoilCamYaw, 0, spec.recoilRecovery, dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 1.8);
    this.adsMix = THREE.MathUtils.damp(this.adsMix, this.adsActive && this.reloadTimer <= 0 ? 1 : 0, 16, dt);

    const targetEye = this.slideTimer > 0 ? 0.84 : this.crouching ? (!this.onGround ? 1.24 : 1.04) : 1.62;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 16, dt);

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobOffset =
      Math.sin(this.bobPhase * 2) *
      0.015 *
      Math.min(horizSpeed / 6, 1.2) *
      (1 - this.adsMix * 0.75) *
      (this.slideTimer > 0 ? 0.15 : this.crouching ? 0.45 : 1);

    // Camera position & rotation (orbit smoothly over compound before deploying)
    if (!this.started) {
      const t = now * 0.0002;
      this.camera.position.set(Math.cos(t) * 16.5, 8.8, Math.sin(t) * 16.5);
      this.camera.lookAt(0, 1.8, 0);
      this.vmRoot.visible = false;
    } else {
      this.vmRoot.visible = this.deadTimer <= 0;
      this.camera.position.set(
        this.pos.x,
        this.pos.y + this.eyeHeight + bobOffset + (this.deadTimer > 0 ? -0.65 : 0),
        this.pos.z,
      );
      const strafeTilt = (this.keys.KeyD ? -0.01 : 0) + (this.keys.KeyA ? 0.01 : 0);
      const slideTilt = this.slideTimer > 0 ? -0.055 : 0;
      const reloadTilt = this.reloadTimer > 0 ? 0.016 : 0;
      const roll = this.deadTimer > 0 ? 0.85 : strafeTilt + slideTilt + reloadTilt + this.reloadKickRoll;
      this.camera.rotation.set(
        this.pitch + this.recoilCamPitch + (Math.random() - 0.5) * this.screenShake * 0.025,
        this.yaw + this.recoilCamYaw + (Math.random() - 0.5) * this.screenShake * 0.025,
        roll,
      );
    }

    // Dynamic FOV (ADS zoom, sprint/slide widen & subtle reload focus shift)
    const baseFov = this.settings.fov;
    const targetFov = this.adsActive
      ? baseFov * 0.72
      : this.reloadTimer > 0
        ? baseFov + 2.2
        : this.slideTimer > 0
          ? baseFov + 5.5
          : this.sprinting
            ? baseFov + 4.5
            : baseFov;
    const nextFov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    // Viewmodel positioning + per-weapon reload choreography
    const reloadProgress =
      this.reloadTimer > 0
        ? Math.max(0, Math.min(1, 1 - this.reloadTimer / Math.max(0.1, this.reloadDuration)))
        : 0;

    const rlPose = computeReloadViewmodelPose(spec.reloadStyle, reloadProgress, this.emptyReload);

    const sprintCant =
      this.sprinting && !this.adsActive && this.reloadTimer <= 0 && this.fireCooldown <= 0 ? 1 : 0;
    const slideCant = this.slideTimer > 0 && !this.adsActive ? 1 : 0;
    const hipX = spec.hipPos[0] + Math.sin(this.bobPhase) * 0.005 * (horizSpeed / 5);
    const hipY = spec.hipPos[1] + Math.abs(Math.cos(this.bobPhase)) * 0.006 * (horizSpeed / 5);
    const hipZ = spec.hipPos[2];

    const vmX = THREE.MathUtils.lerp(hipX, spec.adsPos[0], this.adsMix) + rlPose.px - sprintCant * 0.022;
    const vmY =
      THREE.MathUtils.lerp(hipY, spec.adsPos[1], this.adsMix) -
      this.swapTimer * 0.45 +
      rlPose.py -
      (this.crouching ? 0.016 : 0) -
      sprintCant * 0.028 -
      slideCant * 0.018;
    const vmZ =
      THREE.MathUtils.lerp(hipZ, spec.adsPos[2], this.adsMix) + this.vmKick * spec.vmKickZ + rlPose.pz;

    this.vmRoot.position.set(vmX, vmY, vmZ);
    this.vmRoot.rotation.set(
      this.vmKick * spec.vmKickRot + rlPose.rx - sprintCant * 0.06,
      rlPose.ry + sprintCant * 0.12,
      rlPose.rz + (this.crouching ? 0.035 : 0) + sprintCant * 0.05 + slideCant * 0.12,
    );

    const throwProgress = this.grenadeThrowAnim > 0 ? 1 - this.grenadeThrowAnim / 0.3 : 0;
    this.armsRig.update(
      spec,
      reloadProgress,
      this.vmKick,
      this.adsMix,
      dt,
      throwProgress,
      this.emptyReload,
    );

    // Muzzle flash decay
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // Hitmarker, callout & damage vignette decay
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) this.hitMarker = 'none';
    }
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.calloutText = '';
    }
    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) this.streakCount = 0;
    }
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);
    if (this.damageFlash <= 0.04) {
      this.damageAngle = null;
    }

    // Update particles
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      if (this.partLife[i] > 0) {
        this.partLife[i] -= dt;
        this.partVel[i * 3 + 1] -= 9 * dt;
        this.partPos[i * 3] += this.partVel[i * 3] * dt;
        this.partPos[i * 3 + 1] = Math.max(0, this.partPos[i * 3 + 1] + this.partVel[i * 3 + 1] * dt);
        this.partPos[i * 3 + 2] += this.partVel[i * 3 + 2] * dt;
        const fade = Math.max(0, this.partLife[i] / this.partMaxLife[i]);
        this.partCol[i * 3] = this.partMaxCol[i * 3] * fade;
        this.partCol[i * 3 + 1] = this.partMaxCol[i * 3 + 1] * fade;
        this.partCol[i * 3 + 2] = this.partMaxCol[i * 3 + 2] * fade;
      } else {
        this.partCol[i * 3] = this.partCol[i * 3 + 1] = this.partCol[i * 3 + 2] = 0;
      }
    }
    this.partGeo.attributes.position.needsUpdate = true;
    this.partGeo.attributes.color.needsUpdate = true;

    // Update tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].ttl -= dt;
      if (this.tracers[i].ttl <= 0) {
        this.scene.remove(this.tracers[i].mesh);
        this.tracers.splice(i, 1);
      }
    }

    // Update wall-hit dust puffs
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const puff = this.dustPuffs[i];
      puff.ttl -= dt;
      if (puff.ttl <= 0) {
        this.scene.remove(puff.mesh);
        puff.mat.dispose();
        this.dustPuffs.splice(i, 1);
        continue;
      }
      const p = 1 - puff.ttl / puff.maxTtl;
      puff.mesh.position.addScaledVector(puff.vel, dt);
      puff.vel.multiplyScalar(Math.max(0, 1 - dt * 5.2));
      puff.mesh.scale.setScalar(0.55 + p * 2.15);
      puff.mat.opacity = 0.46 * (1 - p);
    }

    // Update physical dropped magazines
    for (let i = this.droppedMags.length - 1; i >= 0; i--) {
      const m = this.droppedMags[i];
      m.ttl -= dt;
      if (m.ttl <= 0) {
        this.scene.remove(m.mesh);
        m.mat.dispose();
        this.droppedMags.splice(i, 1);
        continue;
      }
      m.vel.y -= 18 * dt;
      m.mesh.position.addScaledVector(m.vel, dt);
      m.mesh.rotation.x += m.angVel.x * dt;
      m.mesh.rotation.y += m.angVel.y * dt;
      m.mesh.rotation.z += m.angVel.z * dt;
      const floorY = Math.max(0.025, m.halfH * 0.45);
      if (m.mesh.position.y <= floorY) {
        m.mesh.position.y = floorY;
        if (!m.bounced && m.vel.y < -1.1) {
          m.bounced = true;
          soundEngine.magClatter();
        }
        m.vel.y = m.vel.y < -1.2 ? -m.vel.y * 0.22 : 0;
        m.vel.x *= 0.45;
        m.vel.z *= 0.45;
        m.angVel.multiplyScalar(0.35);
      }
    }

    // Interpolate & animate articulated remote P2P players (snap on respawn teleports > 6m)
    this.remotes.forEach((r) => {
      r.lastPos.copy(r.pos);
      if (r.pos.distanceToSquared(r.targetPos) > 36) {
        r.pos.copy(r.targetPos);
        r.yaw = r.targetYaw;
      } else {
        const k = Math.min(1, 22 * dt);
        r.pos.lerp(r.targetPos, k);
        r.yaw += shortestAngleDiff(r.yaw, r.targetYaw) * k;
      }
      const instantSpeed = dt > 1e-4 ? Math.hypot(r.pos.x - r.lastPos.x, r.pos.z - r.lastPos.z) / dt : 0;
      r.horizSpeed = r.horizSpeed * 0.75 + instantSpeed * 0.25;
      if (r.hp > 0 && r.horizSpeed > 1.6 && !r.crouching) {
        r.stepAccum += r.horizSpeed * dt;
        if (r.stepAccum > 2.2) {
          r.stepAccum = 0;
          const dist = this.pos.distanceTo(r.pos);
          if (dist < 18) {
            soundEngine.remoteFootstep(Math.max(0, 1 - dist / 18));
          }
        }
      }
      r.visual.root.position.copy(r.pos);
      r.visual.root.rotation.y = r.yaw;
      r.visual.animate(dt, r.horizSpeed, r.crouching, r.pitch, true);
    });

    // Periodic P2P state broadcast (30 Hz on direct P2P WebRTC, 18 Hz on relay)
    const netSyncInterval = this.p2p.netMode === 'p2p' ? 0.033 : 0.055;
    this.netSyncAccum += dt;
    if (this.netSyncAccum >= netSyncInterval) {
      this.netSyncAccum = 0;
      if (this.started && this.p2p.connectedCount > 0) {
        this.p2p.send({
          t: 's',
          n: this.me.name,
          p: [Number(this.pos.x.toFixed(2)), Number(this.pos.y.toFixed(2)), Number(this.pos.z.toFixed(2))],
          r: Number(this.yaw.toFixed(3)),
          q: Number(this.pitch.toFixed(3)),
          w: this.weaponIdx,
          sl: this.crouching ? 1 : 0,
          hp: this.hp,
          kl: this.me.kills,
          dt: this.me.deaths,
        });
      }
    }

    // Periodic HUD refresh (~20 Hz) so React HUD stays crisp without choking frames
    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.05) {
      this.hudSyncAccum = 0;
      this.emitHud();
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  }

  private emitHud(): void {
    const spec = WEAPON_SPECS[this.weaponIdx];
    const spreadGap = this.computeCurrentInaccuracy() * 520;
    const rawGap = Math.max(4, Math.min(28, 4.5 + spreadGap + this.vmKick * 3));

    const rows: CombatantHudRow[] = [
      {
        id: 'me',
        name: this.me.name,
        kills: this.me.kills,
        deaths: this.me.deaths,
        isMe: true,
        isBot: false,
        hp: this.hp,
      },
    ];
    this.remotes.forEach((r) => {
      rows.push({
        id: `p-${r.id}`,
        name: r.name,
        kills: r.kills,
        deaths: r.deaths,
        isMe: false,
        isBot: false,
        hp: r.hp,
      });
    });
    for (const b of this.botManager.bots) {
      rows.push({
        id: b.id,
        name: b.name,
        kills: b.kills,
        deaths: b.deaths,
        isMe: false,
        isBot: true,
        hp: b.hp,
      });
    }
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    // Expire old killfeed entries after 5 seconds
    const now = performance.now();
    this.killFeed = this.killFeed.filter((k) => now - k.timestamp < 5200);

    // Build tactical radar blips (gunfire within 2.8s, sprinting/close enemies <14m, live frag grenades)
    const radarBlips: RadarBlip[] = [];
    for (const b of this.botManager.bots) {
      if (b.hp <= 0 || b.respawnTimer > 0) continue;
      const dist = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
      if (dist < 14 || b.hadLos || now - b.lastFireTime < 2800) {
        radarBlips.push({ x: b.pos.x, z: b.pos.z, kind: 'enemy' });
      }
    }
    this.remotes.forEach((r) => {
      if (r.hp <= 0) return;
      const dist = Math.hypot(r.pos.x - this.pos.x, r.pos.z - this.pos.z);
      if (dist < 14 || r.horizSpeed > 4.2 || now - r.lastFireTime < 2800) {
        radarBlips.push({ x: r.pos.x, z: r.pos.z, kind: 'enemy' });
      }
    });
    for (const g of this.activeGrenades) {
      radarBlips.push({ x: g.pos.x, z: g.pos.z, kind: 'grenade' });
    }

    const activeReloadProgress =
      this.reloadTimer > 0
        ? Math.max(0, Math.min(1, 1 - this.reloadTimer / Math.max(0.1, this.reloadDuration)))
        : 0;
    const reloadStages = getReloadStages(spec.reloadStyle, this.emptyReload);
    const activeReloadLabel =
      this.reloadTimer > 0
        ? (reloadStages[getReloadStageIndex(spec.reloadStyle, activeReloadProgress, this.emptyReload)]?.label ??
          'Reloading')
        : '';

    this.onHudUpdate({
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: 100,
      ammo: this.ammo[this.weaponIdx],
      mag: spec.mag,
      weaponIdx: this.weaponIdx,
      weaponName: spec.name,
      reloading: this.reloadTimer > 0,
      reloadProgress: activeReloadProgress,
      reloadStageLabel: activeReloadLabel,
      emptyReload: this.emptyReload,
      ads: this.adsActive,
      crouching: this.crouching,
      sprinting: this.sprinting,
      sliding: this.slideTimer > 0,
      airborne: !this.onGround,
      deadSeconds: this.deadTimer > 0 ? Math.ceil(this.deadTimer) : 0,
      crosshairGap: Math.round(rawGap),
      hitMarker: this.hitMarker,
      damageFlash: this.damageFlash,
      damageAngle: this.damageAngle,
      callout: this.calloutText,
      scoreboard: rows,
      killFeed: [...this.killFeed],
      pointerLocked: this.pointerLocked,
      playing: this.playing,
      started: this.started,
      mapReady: this.mapReady,
      weaponsReady: this.weaponsReady,
      peerCount: this.p2p.connectedCount,
      pingMs: this.p2p.pingMs,
      netMode: this.p2p.netMode,
      grenades: this.grenades,
      maxGrenades: this.maxGrenades,
      grenadeRefillProgress:
        this.grenades < this.maxGrenades ? this.grenadeRefillTimer / this.grenadeRefillSeconds : 1,
      roomCode: this.p2p.roomCode,
      isHostRoom: this.p2p.isHost,
      maxPlayers: MAX_ROOM_PLAYERS,
      radarPlayer: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
      radarBlips,
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound, { capture: true });
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('wheel', this.onWheelBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenuBound);

    for (const g of this.activeGrenades) {
      this.scene.remove(g.mesh);
      g.ledMat.dispose();
    }
    this.activeGrenades = [];
    for (const b of this.activeBlasts) {
      this.scene.remove(b.mesh);
      this.scene.remove(b.light);
      b.mat.dispose();
    }
    this.activeBlasts = [];

    for (const puff of this.dustPuffs) {
      this.scene.remove(puff.mesh);
      puff.mat.dispose();
    }
    this.dustPuffs = [];

    for (const mag of this.droppedMags) {
      this.scene.remove(mag.mesh);
      mag.mat.dispose();
    }
    this.droppedMags = [];

    this.botManager.dispose();
    this.remotes.forEach((r) => r.visual.dispose());
    this.remotes.clear();
    this.arenaMap.dispose();
    this.weaponCache.dispose();
    this.p2p.dispose();
    this.partGeo.dispose();
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
    this.decalGeo.dispose();
    this.decalTex.dispose();
    this.decalMat.dispose();
    this.dustGeo.dispose();
    this.droppedMagGeo.dispose();
    this.grenadeBodyGeo.dispose();
    this.grenadeCollarGeo.dispose();
    this.grenadeLedGeo.dispose();
    this.blastGeo.dispose();
    this.grenadeBodyMat.dispose();
    this.grenadeCollarMat.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
