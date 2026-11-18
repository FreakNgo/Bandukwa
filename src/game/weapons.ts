import * as THREE from 'three';
import type { WeaponSpec } from '../types/game';

/**
 * Easy, responsive CS 1.6-style weapon specs verified against raw vertex silhouettes in guns.json:
 * - DesertEagle, G36C, and MP5 face +Z in raw meshes -> yawOffset = Math.PI so all barrels face -Z
 * - AK47, M1911, P90, SCAR-H natively face -Z -> yawOffset = 0
 * - Laser-accurate first shots, light effortless recoil with fast recovery, and gentle spray climb
 */
export const WEAPON_SPECS: WeaponSpec[] = [
  {
    id: 'AK47',
    name: 'AK-47',
    category: 'Rifle',
    damage: 36,
    headshotMul: 3.0,
    rpm: 610,
    mag: 30,
    reloadTime: 1.9,
    spread: 0.0014,
    adsSpreadMul: 0.4,
    crouchSpreadMul: 0.6,
    moveInaccuracy: 0.011,
    maxSpeed: 6.0,
    auto: true,
    recoilPitch: 0.0062,
    recoilYaw: 0.0014,
    recoilRecovery: 24,
    sprayClimb: 0.0055,
    spraySway: 0.006,
    vmKickZ: 0.024,
    vmKickRot: 0.028,
    soundType: 0,
    yawOffset: 0,
    vmScale: 1.0,
    hipPos: [0.22, -0.195, -0.49],
    adsPos: [0.0, -0.116, -0.38],
    muzzleLocal: [0.0, 0.085, -0.43],
    rightHandLocal: [0.0, -0.025, 0.06],
    leftHandLocal: [-0.01, 0.022, -0.19],
    isPistol: false,
  },
  {
    id: 'DesertEagle',
    name: 'Desert Eagle',
    category: 'Pistol',
    damage: 55,
    headshotMul: 2.8,
    rpm: 290,
    mag: 7,
    reloadTime: 1.65,
    spread: 0.0012,
    adsSpreadMul: 0.38,
    crouchSpreadMul: 0.6,
    moveInaccuracy: 0.008,
    maxSpeed: 6.45,
    auto: false,
    recoilPitch: 0.0105,
    recoilYaw: 0.0012,
    recoilRecovery: 23,
    sprayClimb: 0.006,
    spraySway: 0.0025,
    vmKickZ: 0.032,
    vmKickRot: 0.048,
    soundType: 1,
    yawOffset: Math.PI, // Raw barrel faces +Z
    vmScale: 0.95,
    hipPos: [0.21, -0.185, -0.45],
    adsPos: [0.0, -0.118, -0.36],
    muzzleLocal: [0.0, 0.085, -0.21],
    rightHandLocal: [0.0, -0.03, 0.11],
    leftHandLocal: [-0.012, -0.045, 0.105],
    isPistol: true,
  },
  {
    id: 'G36C',
    name: 'G36C',
    category: 'Rifle',
    damage: 32,
    headshotMul: 2.6,
    rpm: 700,
    mag: 30,
    reloadTime: 1.8,
    spread: 0.0012,
    adsSpreadMul: 0.38,
    crouchSpreadMul: 0.6,
    moveInaccuracy: 0.009,
    maxSpeed: 6.05,
    auto: true,
    recoilPitch: 0.0048,
    recoilYaw: 0.0011,
    recoilRecovery: 25,
    sprayClimb: 0.0042,
    spraySway: 0.0045,
    vmKickZ: 0.02,
    vmKickRot: 0.022,
    soundType: 0,
    yawOffset: Math.PI, // Raw barrel faces +Z
    vmScale: 1.0,
    hipPos: [0.22, -0.21, -0.49],
    adsPos: [0.0, -0.145, -0.38],
    muzzleLocal: [0.0, 0.08, -0.4],
    rightHandLocal: [0.0, -0.035, 0.045],
    leftHandLocal: [-0.01, 0.022, -0.21],
    isPistol: false,
  },
  {
    id: 'M1911',
    name: 'M1911',
    category: 'Pistol',
    damage: 35,
    headshotMul: 2.6,
    rpm: 420,
    mag: 8,
    reloadTime: 1.4,
    spread: 0.0013,
    adsSpreadMul: 0.4,
    crouchSpreadMul: 0.6,
    moveInaccuracy: 0.007,
    maxSpeed: 6.45,
    auto: false,
    recoilPitch: 0.0065,
    recoilYaw: 0.001,
    recoilRecovery: 26,
    sprayClimb: 0.0035,
    spraySway: 0.002,
    vmKickZ: 0.024,
    vmKickRot: 0.036,
    soundType: 1,
    yawOffset: 0,
    vmScale: 0.95,
    hipPos: [0.21, -0.18, -0.44],
    adsPos: [0.0, -0.114, -0.35],
    muzzleLocal: [0.0, 0.082, -0.19],
    rightHandLocal: [0.0, -0.03, 0.1],
    leftHandLocal: [-0.012, -0.045, 0.095],
    isPistol: true,
  },
  {
    id: 'MP5',
    name: 'MP5',
    category: 'SMG',
    damage: 25,
    headshotMul: 2.3,
    rpm: 800,
    mag: 30,
    reloadTime: 1.7,
    spread: 0.0024,
    adsSpreadMul: 0.45,
    crouchSpreadMul: 0.68,
    moveInaccuracy: 0.0065,
    maxSpeed: 6.4,
    auto: true,
    recoilPitch: 0.0038,
    recoilYaw: 0.001,
    recoilRecovery: 26,
    sprayClimb: 0.0032,
    spraySway: 0.004,
    vmKickZ: 0.017,
    vmKickRot: 0.019,
    soundType: 2,
    yawOffset: Math.PI, // Raw barrel faces +Z
    vmScale: 1.0,
    hipPos: [0.22, -0.225, -0.48],
    adsPos: [0.0, -0.162, -0.37],
    muzzleLocal: [0.0, 0.115, -0.35],
    rightHandLocal: [0.0, -0.02, 0.08],
    leftHandLocal: [-0.01, 0.04, -0.17],
    isPistol: false,
  },
  {
    id: 'P90',
    name: 'P90',
    category: 'SMG',
    damage: 23,
    headshotMul: 2.2,
    rpm: 880,
    mag: 50,
    reloadTime: 2.0,
    spread: 0.0028,
    adsSpreadMul: 0.48,
    crouchSpreadMul: 0.68,
    moveInaccuracy: 0.0065,
    maxSpeed: 6.35,
    auto: true,
    recoilPitch: 0.0035,
    recoilYaw: 0.001,
    recoilRecovery: 27,
    sprayClimb: 0.003,
    spraySway: 0.0045,
    vmKickZ: 0.015,
    vmKickRot: 0.018,
    soundType: 2,
    yawOffset: 0,
    vmScale: 1.02,
    hipPos: [0.21, -0.19, -0.47],
    adsPos: [0.0, -0.114, -0.36],
    muzzleLocal: [0.0, 0.035, -0.31],
    rightHandLocal: [0.0, -0.025, 0.04],
    leftHandLocal: [-0.01, -0.015, -0.16],
    isPistol: false,
  },
  {
    id: 'SCAR-H',
    name: 'SCAR-H',
    category: 'Rifle',
    damage: 42,
    headshotMul: 2.8,
    rpm: 520,
    mag: 20,
    reloadTime: 1.95,
    spread: 0.001,
    adsSpreadMul: 0.36,
    crouchSpreadMul: 0.55,
    moveInaccuracy: 0.012,
    maxSpeed: 5.9,
    auto: true,
    recoilPitch: 0.0068,
    recoilYaw: 0.0014,
    recoilRecovery: 24,
    sprayClimb: 0.0052,
    spraySway: 0.005,
    vmKickZ: 0.024,
    vmKickRot: 0.026,
    soundType: 0,
    yawOffset: 0,
    vmScale: 1.0,
    hipPos: [0.22, -0.2, -0.5],
    adsPos: [0.0, -0.136, -0.39],
    muzzleLocal: [0.0, 0.036, -0.44],
    rightHandLocal: [0.0, -0.03, 0.05],
    leftHandLocal: [-0.01, 0.015, -0.19],
    isPistol: false,
  },
];

interface RawGunPart {
  p: string;
  i: string;
  m: number;
}

interface RawGunEntry {
  len: number;
  parts: RawGunPart[];
}

type RawGunMap = Record<string, RawGunEntry>;

function decodeBase64Typed<T extends Float32Array | Uint32Array>(
  b64: string,
  Ctor: new (buffer: ArrayBuffer) => T,
): T {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Ctor(bytes.buffer);
}

const gunMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0x4b5360,
    metalness: 0.72,
    roughness: 0.32,
    side: THREE.DoubleSide,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x22262d,
    metalness: 0.25,
    roughness: 0.62,
    side: THREE.DoubleSide,
  }),
];

export class WeaponModelCache {
  private geometries = new Map<string, Array<{ geo: THREE.BufferGeometry; matIdx: number }>>();
  ready = false;

  async load(): Promise<void> {
    if (this.ready) return;
    const res = await fetch('/assets/weapons/guns.json');
    if (!res.ok) throw new Error('Failed to load weapon geometry pack');
    const raw: RawGunMap = (await res.json()) as RawGunMap;

    for (const spec of WEAPON_SPECS) {
      const entry = raw[spec.id];
      if (!entry) continue;
      const built: Array<{ geo: THREE.BufferGeometry; matIdx: number }> = [];
      for (const part of entry.parts) {
        let geo = new THREE.BufferGeometry();
        geo.setAttribute(
          'position',
          new THREE.BufferAttribute(decodeBase64Typed(part.p, Float32Array), 3),
        );
        geo.setIndex(new THREE.BufferAttribute(decodeBase64Typed(part.i, Uint32Array), 1));
        geo = geo.toNonIndexed();
        geo.computeVertexNormals();
        built.push({ geo, matIdx: part.m === 1 ? 1 : 0 });
      }
      this.geometries.set(spec.id, built);
    }
    this.ready = true;
  }

  createMesh(weaponIdx: number, isViewmodel: boolean): THREE.Group {
    const spec = WEAPON_SPECS[weaponIdx] ?? WEAPON_SPECS[0];
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = spec.yawOffset;

    const parts = this.geometries.get(spec.id);
    if (parts) {
      for (const p of parts) {
        const mesh = new THREE.Mesh(p.geo, gunMaterials[p.matIdx]);
        mesh.castShadow = !isViewmodel;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        inner.add(mesh);
      }
    } else {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.09, spec.isPistol ? 0.24 : 0.6),
        gunMaterials[0],
      );
      fallback.frustumCulled = false;
      inner.add(fallback);
    }

    root.add(inner);
    if (isViewmodel) {
      root.scale.setScalar(spec.vmScale);
    }
    return root;
  }

  dispose(): void {
    this.geometries.forEach((parts) => {
      parts.forEach((p) => p.geo.dispose());
    });
    this.geometries.clear();
  }
}
