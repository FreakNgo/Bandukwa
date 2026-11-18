import * as THREE from 'three';
import type { WeaponSpec } from '../types/game';

const _shoulder = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _lookMat = new THREE.Matrix4();

function buildTacticalArm(side: 'left' | 'right'): {
  handGroup: THREE.Group;
  forearm: THREE.Group;
} {
  const s = side === 'right' ? 1 : -1;

  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x2c332d,
    roughness: 0.86,
    metalness: 0.05,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f24,
    roughness: 0.7,
    metalness: 0.12,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x24282e,
    roughness: 0.56,
    metalness: 0.1,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x15181c,
    roughness: 0.34,
    metalness: 0.28,
  });

  const handGroup = new THREE.Group();

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.072), gloveMat);
  palm.position.set(s * 0.012, -0.008, 0.008);
  handGroup.add(palm);

  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.052, 0.058), armorMat);
  knuckle.position.set(s * 0.032, 0.002, -0.002);
  handGroup.add(knuckle);

  const fingerCurl = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.058, 0.036), gloveMat);
  fingerCurl.position.set(-s * 0.014, -0.01, -0.014);
  fingerCurl.rotation.z = s * 0.18;
  handGroup.add(fingerCurl);

  const indexFinger = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.016, 0.044), gloveMat);
  indexFinger.position.set(s * 0.018, 0.02, -0.024);
  handGroup.add(indexFinger);

  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.045), gloveMat);
  thumb.position.set(-s * 0.016, 0.024, 0.014);
  thumb.rotation.set(0.35, s * 0.25, 0);
  handGroup.add(thumb);

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.042, 10), cuffMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(s * 0.006, -0.006, 0.056);
  handGroup.add(cuff);

  const forearm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.048, 0.44, 10), sleeveMat);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.22;
  forearm.add(sleeve);

  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.039, 0.024, 10), armorMat);
  strap.rotation.x = Math.PI / 2;
  strap.position.z = 0.05;
  forearm.add(strap);

  [handGroup, forearm].forEach((grp) =>
    grp.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.frustumCulled = false;
        o.castShadow = false;
        o.receiveShadow = true;
      }
    }),
  );

  return { handGroup, forearm };
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export class TacticalArmsRig {
  readonly group = new THREE.Group();
  private rightHand: THREE.Group;
  private rightForearm: THREE.Group;
  private leftHand: THREE.Group;
  private leftForearm: THREE.Group;
  private magGroup: THREE.Group;

  private curRight = new THREE.Vector3(0.0, -0.03, 0.06);
  private curLeft = new THREE.Vector3(-0.01, 0.02, -0.19);

  constructor() {
    const r = buildTacticalArm('right');
    const l = buildTacticalArm('left');
    this.rightHand = r.handGroup;
    this.rightForearm = r.forearm;
    this.leftHand = l.handGroup;
    this.leftForearm = l.forearm;

    // Detachable tactical magazine visible during reload animation
    this.magGroup = new THREE.Group();
    const magBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.115, 0.046),
      new THREE.MeshStandardMaterial({ color: 0x1c2026, metalness: 0.45, roughness: 0.4 }),
    );
    const magPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.016, 0.052),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.2, roughness: 0.5 }),
    );
    magPlate.position.y = -0.056;
    this.magGroup.add(magBody, magPlate);
    this.magGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
    });
    this.magGroup.visible = false;

    this.group.add(this.rightHand, this.rightForearm, this.leftHand, this.leftForearm, this.magGroup);
  }

  /**
   * @param reloadProgress 0 when not reloading, 0 -> 1 across reload duration
   * @param throwProgress 0 when not throwing, 0 -> 1 across throw duration
   */
  update(
    spec: WeaponSpec,
    reloadProgress: number,
    recoilKick: number,
    adsMix: number,
    dt: number,
    throwProgress = 0,
  ): void {
    const scale = spec.vmScale;
    const rx = spec.rightHandLocal[0] * scale;
    const ry = spec.rightHandLocal[1] * scale;
    const rz = spec.rightHandLocal[2] * scale;

    let lx = spec.leftHandLocal[0] * scale;
    let ly = spec.leftHandLocal[1] * scale;
    let lz = spec.leftHandLocal[2] * scale;

    // Magazine well anchor (in front of pistol grip for rifles/SMGs, bottom of grip for pistols)
    const magWellX = 0;
    const magWellY = spec.isPistol ? ry - 0.05 : ry - 0.02;
    const magWellZ = spec.isPistol ? rz + 0.01 : rz - 0.095;

    // Charging handle / slide anchor
    const rackX = -0.045;
    const rackY = ry + 0.095;
    const rackZ = spec.isPistol ? rz - 0.03 : rz - 0.05;

    const reloading = reloadProgress > 0 && reloadProgress < 1;
    const throwing = !reloading && throwProgress > 0 && throwProgress < 1;
    let leftRotX = spec.isPistol ? 0.18 : 0.08;
    let leftRotY = spec.isPistol ? -0.35 : -0.22;
    let leftRotZ = spec.isPistol ? 0.45 : 0.68;

    if (reloading) {
      if (reloadProgress < 0.24) {
        // Stage 1: Reach to mag well & drop empty magazine
        const t = smoothstep01(reloadProgress / 0.24);
        lx = THREE.MathUtils.lerp(lx, magWellX - 0.02, t);
        ly = THREE.MathUtils.lerp(ly, magWellY - 0.08 * t, t);
        lz = THREE.MathUtils.lerp(lz, magWellZ, t);
        leftRotZ = THREE.MathUtils.lerp(leftRotZ, 0.25, t);
        this.magGroup.visible = t > 0.35;
        this.magGroup.position.set(magWellX, magWellY - 0.24 * Math.max(0, t - 0.35), magWellZ);
        this.magGroup.rotation.set(0.18 * t, 0, 0.08 * t);
      } else if (reloadProgress < 0.62) {
        // Stage 2: Bring fresh magazine up from chest pouch into receiver
        const t = smoothstep01((reloadProgress - 0.24) / 0.38);
        const arcY = THREE.MathUtils.lerp(-0.28, 0.0, t);
        lx = magWellX - 0.025 * (1 - t);
        ly = magWellY + arcY;
        lz = magWellZ + 0.02 * (1 - t);
        leftRotZ = 0.2;
        this.magGroup.visible = true;
        this.magGroup.position.set(magWellX, magWellY + arcY + 0.02, magWellZ);
        this.magGroup.rotation.set(0.12 * (1 - t), 0, 0);
      } else if (reloadProgress < 0.86) {
        // Stage 3: Reach up and rack the charging handle / slide
        this.magGroup.visible = false;
        const p = (reloadProgress - 0.62) / 0.24;
        const grab = smoothstep01(Math.min(1, p / 0.35));
        const pull = Math.sin(Math.max(0, Math.min(1, (p - 0.3) / 0.55)) * Math.PI);
        lx = THREE.MathUtils.lerp(magWellX, rackX, grab);
        ly = THREE.MathUtils.lerp(magWellY, rackY, grab);
        lz = THREE.MathUtils.lerp(magWellZ, rackZ + pull * 0.065, grab);
        leftRotX = -0.15;
        leftRotY = 0.25;
        leftRotZ = 0.15;
      } else {
        // Stage 4: Return smoothly to ready grip
        this.magGroup.visible = false;
        const t = smoothstep01((reloadProgress - 0.86) / 0.14);
        lx = THREE.MathUtils.lerp(rackX, lx, t);
        ly = THREE.MathUtils.lerp(rackY, ly, t);
        lz = THREE.MathUtils.lerp(rackZ, lz, t);
      }
    } else if (throwing) {
      this.magGroup.visible = false;
      const swing = Math.sin(throwProgress * Math.PI);
      lx -= 0.1 * swing;
      ly += 0.09 * swing;
      lz -= 0.19 * swing;
      leftRotX = -0.65 * swing;
      leftRotZ = 0.25;
    } else {
      this.magGroup.visible = false;
    }

    const k = 1 - Math.exp(-26 * dt);
    this.curRight.lerp(_target.set(rx, ry, rz), k);
    this.curLeft.lerp(_target.set(lx, ly, lz), k);

    this.rightHand.position.copy(this.curRight);
    this.rightHand.rotation.set(
      -0.12 - recoilKick * 0.05,
      0.08,
      spec.isPistol ? -0.05 : -0.1,
    );

    this.leftHand.position.copy(this.curLeft);
    this.leftHand.rotation.set(leftRotX, leftRotY, leftRotZ);

    this.orientForearm(this.rightForearm, this.curRight, 0.2 - adsMix * 0.04, -0.24, 0.34);
    this.orientForearm(
      this.leftForearm,
      this.curLeft,
      -0.24 + adsMix * 0.05,
      -0.25 - (reloading ? 0.06 : 0),
      0.32,
    );
  }

  private orientForearm(
    forearm: THREE.Group,
    wristPos: THREE.Vector3,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    forearm.position.copy(wristPos);
    forearm.position.z += 0.045;
    _shoulder.set(sx, sy, sz);
    _dir.subVectors(_shoulder, forearm.position).normalize();
    _lookMat.lookAt(forearm.position, _shoulder, _up);
    forearm.quaternion.setFromRotationMatrix(_lookMat);
    forearm.rotateY(Math.PI);
  }
}
