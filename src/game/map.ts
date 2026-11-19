import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ArenaOBB } from '../types/game';

export const ARENA_HALF_EXTENT = 14.0;

export const SPAWN_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-11.8, -11.5], // Slot 0 (Host): NW corner
  [11.8, 11.8],   // Slot 1 (Peer #1): SE corner (opposite Host)
  [11.8, -11.5],  // Slot 2 (Peer #2): NE corner
  [-11.8, 11.8],  // Slot 3 (Peer #3): SW corner (opposite Peer #2)
  [-0.2, -12.0],
  [0.2, 12.2],
  [-11.5, 0.0],
  [11.5, 0.0],
];

export interface LadderZone {
  x: number;
  z: number;
  radius: number;
  topY: number;
  /** Direction vector pointing from ladder base toward rooftop */
  pushX: number;
  pushZ: number;
}

const MODEL_NAMES = [
  'Building_01',
  'Wall_01',
  'Wall_02',
  'Wall_03',
  'WallPart_01',
  'Box_01',
  'Jug_01',
  'Jug_02',
  'Stairs_01',
  'Brick_01',
  'WoodPlank_01',
  'WoodPlank_02',
  'WoodPlank_03',
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

const RAW_DIMENSIONS: Record<ModelName, [number, number, number]> = {
  Building_01: [5.16, 3.5, 5.32],
  Wall_01: [4.0, 2.4, 0.3],
  Wall_02: [1.56, 2.2, 0.34],
  Wall_03: [10.0, 5.0, 0.36],
  WallPart_01: [0.6, 5.25, 0.6],
  Box_01: [0.744, 0.74, 0.744],
  Jug_01: [0.3, 0.495, 0.3],
  Jug_02: [0.296, 0.448, 0.296],
  Stairs_01: [0.68, 3.5, 0.11],
  Brick_01: [0.382, 0.22, 0.22],
  WoodPlank_01: [1.024, 0.034, 0.144],
  WoodPlank_02: [1.034, 0.034, 0.148],
  WoodPlank_03: [1.033, 0.034, 0.153],
};

function createSandTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c4b18d';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const tone = 160 + Math.floor(Math.random() * 50);
      ctx.fillStyle = `rgba(${tone},${tone - 18},${tone - 44},0.34)`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  tex.anisotropy = Math.min(isTouch ? 2 : 4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

interface PlacedProp {
  name: ModelName;
  group: THREE.Group;
  fallback: THREE.Mesh;
}

export class ArenaMap {
  readonly colliders: ArenaOBB[] = [];
  readonly ladders: LadderZone[] = [];
  private placements: PlacedProp[] = [];
  private templates = new Map<ModelName, THREE.Group>();
  private fallbackMat = new THREE.MeshStandardMaterial({ color: 0xb7a78f, roughness: 0.88 });
  private groundTex: THREE.CanvasTexture;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.groundTex = createSandTexture(renderer);
    this.buildTerrain();
    this.buildReferenceCompoundLayout();
  }

  private buildTerrain(): void {
    const arenaGround = new THREE.Mesh(
      new THREE.PlaneGeometry(31, 31),
      new THREE.MeshStandardMaterial({
        map: this.groundTex,
        roughness: 0.96,
        metalness: 0.0,
      }),
    );
    arenaGround.rotation.x = -Math.PI / 2;
    arenaGround.receiveShadow = true;
    this.scene.add(arenaGround);

    const farDesert = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({
        color: 0x9f8d6c,
        roughness: 0.98,
        metalness: 0.0,
      }),
    );
    farDesert.rotation.x = -Math.PI / 2;
    farDesert.position.y = -0.03;
    farDesert.receiveShadow = false;
    this.scene.add(farDesert);
  }

  private addOBB(
    cx: number,
    cz: number,
    widthX: number,
    depthZ: number,
    ry: number,
    bottom: number,
    top: number,
    tag?: string,
  ): void {
    this.colliders.push({
      cx,
      cz,
      hx: widthX * 0.5,
      hz: depthZ * 0.5,
      cos: Math.cos(ry),
      sin: Math.sin(ry),
      bottom,
      top,
      tag,
    });
  }

  private place(
    name: ModelName,
    x: number,
    z: number,
    ry = 0,
    scale = 1,
    y = 0,
    solid = true,
    rx = 0,
    rz = 0,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.order = 'YXZ';
    group.rotation.set(rx, ry, rz);
    group.scale.setScalar(scale);
    this.scene.add(group);

    const d = RAW_DIMENSIONS[name];
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), this.fallbackMat);
    fallback.position.y = d[1] * 0.5;
    fallback.castShadow = true;
    fallback.receiveShadow = true;
    group.add(fallback);

    this.placements.push({ name, group, fallback });

    if (solid) {
      if (name === 'Wall_01') {
        // Wall_01 has an open rectangular peek-slot (x in [-1.6, +1.6], y in [1.5, 2.0])
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        // Bottom half-wall (0..1.5m)
        this.addOBB(x, z, 4.0 * scale, 0.3 * scale, ry, y, y + 1.5 * scale, 'Wall_01_bot');
        // Top lintel (2.0..2.4m)
        this.addOBB(x, z, 4.0 * scale, 0.3 * scale, ry, y + 2.0 * scale, y + 2.4 * scale, 'Wall_01_top');
        // Left & right pillars (1.5..2.0m)
        this.addOBB(
          x - 1.8 * scale * c,
          z + 1.8 * scale * s,
          0.4 * scale,
          0.3 * scale,
          ry,
          y + 1.5 * scale,
          y + 2.0 * scale,
          'Wall_01_L',
        );
        this.addOBB(
          x + 1.8 * scale * c,
          z - 1.8 * scale * s,
          0.4 * scale,
          0.3 * scale,
          ry,
          y + 1.5 * scale,
          y + 2.0 * scale,
          'Wall_01_R',
        );
      } else {
        this.addOBB(x, z, d[0] * scale, d[2] * scale, ry, y, y + d[1] * scale, name);
      }
    }
  }

  private buildReferenceCompoundLayout(): void {
    // 1. Tight 29m x 29m perimeter enclosure (3 x 10m Wall_03 per side + WallPart_01 corner/seam pillars)
    const perimSpan = [-9.65, 0, 9.65];
    const perimEdge = 14.5;
    for (const v of perimSpan) {
      this.place('Wall_03', v, -perimEdge, 0, 1, 0, true);
      this.place('Wall_03', v, perimEdge, 0, 1, 0, true);
      this.place('Wall_03', -perimEdge, v, Math.PI / 2, 1, 0, true);
      this.place('Wall_03', perimEdge, v, Math.PI / 2, 1, 0, true);
    }
    const pillarCoords = [-14.5, -4.85, 4.85, 14.5];
    for (const p of pillarCoords) {
      this.place('WallPart_01', p, -perimEdge, 0, 1, 0, true);
      this.place('WallPart_01', p, perimEdge, 0, 1, 0, true);
    }
    for (const p of [-4.85, 4.85]) {
      this.place('WallPart_01', -perimEdge, p, 0, 1, 0, true);
      this.place('WallPart_01', perimEdge, p, 0, 1, 0, true);
    }

    // 2. Central 2x2 Compound of 4 Building_01 Houses (exact orientation from FPS Map Lite screenshot)
    // Front-left: door (+Z local) faces camera (+Z)
    this.place('Building_01', -3.8, 3.6, 0, 1, 0, true);
    // Front-right: door (+Z local) faces center alley (-X), windows + ladder face +Z
    this.place('Building_01', 3.8, 3.6, -Math.PI / 2, 1, 0, true);
    // Back-left: door faces center alley (+X)
    this.place('Building_01', -3.8, -3.6, Math.PI / 2, 1, 0, true);
    // Back-right: door faces back lane (-Z)
    this.place('Building_01', 3.8, -3.6, Math.PI, 1, 0, true);

    // 3. Rooftop Box_01 stacks (y = 3.5m roof deck) matching the reference screenshot
    const roofCrateScale = 1.25;
    const crateH = 0.74 * roofCrateScale;
    // Front-left roof: iconic 3-crate pyramid
    this.place('Box_01', -4.25, 3.6, 0, roofCrateScale, 3.5, true);
    this.place('Box_01', -3.25, 3.6, 0.04, roofCrateScale, 3.5, true);
    this.place('Box_01', -3.75, 3.6, 0, roofCrateScale, 3.5 + crateH, true);
    // Back-left roof: pair of crates
    this.place('Box_01', -3.6, -3.4, 0.1, roofCrateScale, 3.5, true);
    this.place('Box_01', -4.6, -3.5, -0.05, roofCrateScale, 3.5, true);
    // Back-right roof: crate stack
    this.place('Box_01', 3.8, -3.5, 0.08, roofCrateScale, 3.5, true);

    // 4. Climbable Stairs_01 ladders up to rooftops + ground crates beside ladder
    // Front-right building (+Z wall, right side)
    this.place('Stairs_01', 5.15, 6.22, 0, 1, 0, false);
    this.ladders.push({ x: 5.15, z: 6.55, radius: 1.0, topY: 3.55, pushX: 0, pushZ: -1 });
    // Stacked ground crate pair right beside the front-right ladder (as seen in reference image)
    this.place('Box_01', 3.35, 6.8, 0.04, 1.35, 0, true);
    this.place('Box_01', 3.35, 6.8, -0.05, 1.35, 0.74 * 1.35, true);

    // Back-left building (-Z wall, left side) for symmetrical rooftop access
    this.place('Stairs_01', -5.15, -6.22, Math.PI, 1, 0, false);
    this.ladders.push({ x: -5.15, z: -6.55, radius: 1.0, topY: 3.55, pushX: 0, pushZ: 1 });
    this.place('Box_01', -3.35, -6.8, 0.08, 1.35, 0, true);

    // 5. Foreground & Courtyard Windowed Shooting Walls (Wall_01) with peek-through slots
    // Two foreground Wall_01 barriers visible in reference image
    this.place('Wall_01', -3.4, 10.2, 0, 1, 0, true);
    this.place('Wall_01', 2.9, 9.7, 0, 1, 0, true);
    // Mirror courtyard Wall_01 barriers along back & side lanes
    this.place('Wall_01', 3.4, -10.2, 0, 1, 0, true);
    this.place('Wall_01', -2.9, -9.7, 0, 1, 0, true);
    this.place('Wall_01', -10.3, -1.8, Math.PI / 2, 1, 0, true);
    this.place('Wall_01', 10.3, 1.8, Math.PI / 2, 1, 0, true);

    // 6. Short Wing Walls (Wall_02) attached flush to building corners & flanking lanes
    // Front-left wing extending left from front-left house (exact match to screenshot)
    this.place('Wall_02', -7.15, 6.1, 0, 1, 0, true);
    // Symmetrical back-right wing
    this.place('Wall_02', 7.15, -6.1, 0, 1, 0, true);
    // Outer flank lane Wall_02 cover (visible on left & right edges of screenshot)
    this.place('Wall_02', -10.4, 5.2, 0, 1, 0, true);
    this.place('Wall_02', 10.4, -5.2, 0, 1, 0, true);
    this.place('Wall_02', -12.6, -7.2, 0, 1, 0, true);
    this.place('Wall_02', 12.6, 7.2, 0, 1, 0, true);

    // 7. Authentic Props matching screenshot: Jug inside Wall_01 window slot, leaning WoodPlank, scattered Bricks
    // Jug_01 sitting inside the right foreground Wall_01 window sill (y = 1.50m)
    this.place('Jug_01', 1.65, 9.7, 0.4, 1.15, 1.5, false);
    this.place('Jug_02', -1.65, -9.7, 1.9, 1.15, 1.5, false);
    this.place('Jug_01', -12.3, -7.2, 0.8, 1.2, 0, false);
    this.place('Jug_02', 12.3, 7.2, 2.5, 1.2, 0, false);

    // Leaning WoodPlank against the foreground right Wall_01 (exact detail from reference image)
    this.place('WoodPlank_01', 3.4, 10.05, 0.2, 1.65, 0.48, false, 0.22, Math.PI / 2 - 0.14);
    this.place('WoodPlank_02', -4.2, -9.95, 0, 1.5, 0.02, false);
    this.place('WoodPlank_03', -9.8, 3.6, 1.2, 1.6, 0.02, false);

    // Bricks beside corners
    this.place('Brick_01', -5.4, 6.4, 0.3, 1.35, 0, false);
    this.place('Brick_01', -5.0, 6.55, 1.1, 1.35, 0, false);
    this.place('Brick_01', 5.4, -6.4, 0.8, 1.35, 0, false);
  }

  async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      MODEL_NAMES.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(`/assets/map/${name}.gltf`);
          const root = gltf.scene;
          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root);
          const minY = Number.isFinite(box.min.y) ? box.min.y : 0;

          const container = new THREE.Group();
          root.position.y -= minY;
          root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const mat = mesh.material as THREE.MeshStandardMaterial;
              if (mat) {
                if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.roughness = Math.max(mat.roughness ?? 0.85, 0.65);
              }
            }
          });
          container.add(root);
          this.templates.set(name, container);

          for (const item of this.placements) {
            if (item.name === name) {
              item.group.remove(item.fallback);
              item.group.add(container.clone());
            }
          }
        } catch (err) {
          console.warn(`Could not load map asset ${name}:`, err);
        }
      }),
    );
  }

  dispose(): void {
    this.groundTex.dispose();
    this.fallbackMat.dispose();
  }
}

export function resolvePlayerCollisions(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  colliders: ArenaOBB[],
  radius = 0.38,
  playerHeight = 1.65,
): number {
  let groundY = 0;

  for (const c of colliders) {
    const dx = pos.x - c.cx;
    const dz = pos.z - c.cz;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;

    const clampedX = Math.max(-c.hx, Math.min(c.hx, lx));
    const clampedZ = Math.max(-c.hz, Math.min(c.hz, lz));
    const ex = lx - clampedX;
    const ez = lz - clampedZ;
    const dist = Math.hypot(ex, ez);

    if (dist < radius) {
      if (pos.y >= c.top - 0.04 || (c.top - pos.y <= 0.45 && vel.y <= 0 && pos.y >= c.bottom)) {
        if (pos.y >= c.bottom - 0.1) {
          groundY = Math.max(groundY, c.top);
        }
      } else if (pos.y + playerHeight > c.bottom && pos.y < c.top) {
        let pushLX = 0;
        let pushLZ = 0;
        if (dist > 1e-5) {
          const push = (radius - dist) / dist;
          pushLX = ex * push;
          pushLZ = ez * push;
        } else {
          const toLeft = c.hx + lx;
          const toRight = c.hx - lx;
          const toBack = c.hz + lz;
          const toFront = c.hz - lz;
          const m = Math.min(toLeft, toRight, toBack, toFront);
          if (m === toLeft) pushLX = -(toLeft + radius);
          else if (m === toRight) pushLX = toRight + radius;
          else if (m === toBack) pushLZ = -(toBack + radius);
          else pushLZ = toFront + radius;
        }
        pos.x += pushLX * c.cos + pushLZ * c.sin;
        pos.z += -pushLX * c.sin + pushLZ * c.cos;
      }
    }
  }

  pos.x = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, pos.x));
  pos.z = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, pos.z));
  return groundY;
}

export function raycastOBB(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  c: ArenaOBB,
  outNormal: THREE.Vector3,
): number | null {
  const dx = origin.x - c.cx;
  const dz = origin.z - c.cz;

  const ox = dx * c.cos - dz * c.sin;
  const oz = dx * c.sin + dz * c.cos;
  const rx = dir.x * c.cos - dir.z * c.sin;
  const rz = dir.x * c.sin + dir.z * c.cos;

  const lo = [-c.hx, c.bottom, -c.hz];
  const hi = [c.hx, c.top, c.hz];
  const oo = [ox, origin.y, oz];
  const dd = [rx, dir.y, rz];

  let tMin = 0;
  let tMax = 1e9;
  let hitAxis = -1;
  let hitSign = 0;

  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-8) {
      if (oo[a] < lo[a] || oo[a] > hi[a]) return null;
      continue;
    }
    let t1 = (lo[a] - oo[a]) / dd[a];
    let t2 = (hi[a] - oo[a]) / dd[a];
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitAxis = a;
      hitSign = s;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (hitAxis === -1) return null;

  if (hitAxis === 1) {
    outNormal.set(0, hitSign, 0);
  } else if (hitAxis === 0) {
    outNormal.set(hitSign * c.cos, 0, -hitSign * c.sin);
  } else {
    outNormal.set(hitSign * c.sin, 0, hitSign * c.cos);
  }

  return tMin;
}
