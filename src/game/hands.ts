import * as THREE from 'three';
import type { ReloadStyle, WeaponSpec } from '../types/game';

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

const MAG_APPEARANCE: Record<
  ReloadStyle,
  { sx: number; sy: number; sz: number; bodyCol: number; plateCol: number }
> = {
  ak_rock_lock: { sx: 1.0, sy: 1.18, sz: 1.05, bodyCol: 0x6b3a1e, plateCol: 0x262626 },
  deagle_heavy_pistol: { sx: 0.95, sy: 0.85, sz: 0.85, bodyCol: 0x9ca3af, plateCol: 0x18181b },
  g36_paddle_bolt: { sx: 1.0, sy: 1.05, sz: 1.0, bodyCol: 0x252b33, plateCol: 0xd97706 },
  m1911_speed_slide: { sx: 0.72, sy: 0.78, sz: 0.72, bodyCol: 0x4b5563, plateCol: 0x111827 },
  mp5_hk_slap: { sx: 0.74, sy: 1.15, sz: 0.65, bodyCol: 0x181c22, plateCol: 0x374151 },
  p90_top_mag: { sx: 1.25, sy: 0.28, sz: 3.1, bodyCol: 0x6b5b3e, plateCol: 0x1f2937 },
  scar_bolt_catch: { sx: 1.15, sy: 0.96, sz: 1.2, bodyCol: 0x9a8260, plateCol: 0x292524 },
};

export class TacticalArmsRig {
  readonly group = new THREE.Group();
  private rightHand: THREE.Group;
  private rightForearm: THREE.Group;
  private leftHand: THREE.Group;
  private leftForearm: THREE.Group;
  private magGroup: THREE.Group;
  private magBodyMat: THREE.MeshStandardMaterial;
  private magPlateMat: THREE.MeshStandardMaterial;
  private activeMagStyle: ReloadStyle | null = null;

  private curRight = new THREE.Vector3(0.0, -0.03, 0.06);
  private curLeft = new THREE.Vector3(-0.01, 0.02, -0.19);

  constructor() {
    const r = buildTacticalArm('right');
    const l = buildTacticalArm('left');
    this.rightHand = r.handGroup;
    this.rightForearm = r.forearm;
    this.leftHand = l.handGroup;
    this.leftForearm = l.forearm;

    // Detachable weapon-styled magazine visible during reload choreography
    this.magGroup = new THREE.Group();
    this.magBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1c2026,
      metalness: 0.45,
      roughness: 0.4,
    });
    this.magPlateMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.2,
      roughness: 0.5,
    });
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.135, 0.054), this.magBodyMat);
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.06), this.magPlateMat);
    magPlate.position.y = -0.066;
    const magRounds = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.016, 0.044),
      new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.78, roughness: 0.25 }),
    );
    magRounds.position.y = 0.068;
    this.magGroup.add(magBody, magPlate, magRounds);
    this.magGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
    });
    this.magGroup.visible = false;

    this.group.add(this.rightHand, this.rightForearm, this.leftHand, this.leftForearm, this.magGroup);
  }

  private syncMagAppearance(style: ReloadStyle): void {
    if (this.activeMagStyle === style) return;
    this.activeMagStyle = style;
    const cfg = MAG_APPEARANCE[style];
    this.magGroup.scale.set(cfg.sx, cfg.sy, cfg.sz);
    this.magBodyMat.color.setHex(cfg.bodyCol);
    this.magPlateMat.color.setHex(cfg.plateCol);
  }

  /**
   * @param reloadProgress 0 when not reloading, 0 -> 1 across reload duration
   * @param emptyReload true when reloading from 0 rounds (performs bolt/slide/slap stage)
   * @param throwProgress 0 when not throwing, 0 -> 1 across throw duration
   */
  update(
    spec: WeaponSpec,
    reloadProgress: number,
    recoilKick: number,
    adsMix: number,
    dt: number,
    throwProgress = 0,
    emptyReload = true,
  ): void {
    this.syncMagAppearance(spec.reloadStyle);

    const scale = spec.vmScale;
    const rx = spec.rightHandLocal[0] * scale;
    const ry = spec.rightHandLocal[1] * scale;
    const rz = spec.rightHandLocal[2] * scale;

    const restLx = spec.leftHandLocal[0] * scale;
    const restLy = spec.leftHandLocal[1] * scale;
    const restLz = spec.leftHandLocal[2] * scale;

    let lx = restLx;
    let ly = restLy;
    let lz = restLz;

    const magWellX = 0;
    const magWellY = spec.isPistol ? ry - 0.042 : ry - 0.015;
    const magWellZ = spec.isPistol ? rz + 0.01 : rz - 0.1;

    const reloading = reloadProgress > 0 && reloadProgress < 1;
    const throwing = !reloading && throwProgress > 0 && throwProgress < 1;
    let leftRotX = spec.isPistol ? 0.18 : 0.08;
    let leftRotY = spec.isPistol ? -0.35 : -0.22;
    let leftRotZ = spec.isPistol ? 0.45 : 0.68;

    if (reloading) {
      const style = spec.reloadStyle;
      if (style === 'p90_top_mag') {
        // Horizontal top-mounted 50-round magazine lift, seat & palm smack (+ side charge if empty)
        const topX = 0;
        const topY = ry + 0.095;
        const topZ = rz - 0.11;
        const swapEnd = emptyReload ? 0.72 : 0.88;
        if (reloadProgress < 0.26) {
          const t = smoothstep01(reloadProgress / 0.26);
          lx = THREE.MathUtils.lerp(restLx, topX - 0.02, t);
          ly = THREE.MathUtils.lerp(restLy, topY + 0.16 * t, t);
          lz = THREE.MathUtils.lerp(restLz, topZ, t);
          this.magGroup.visible = t > 0.12;
          this.magGroup.position.set(topX, topY + 0.2 * Math.max(0, t - 0.1), topZ);
          this.magGroup.rotation.set(0.1 * t, 0, -0.22 * t);
          leftRotX = -0.35;
          leftRotZ = 0.2;
        } else if (reloadProgress < swapEnd) {
          const t = smoothstep01((reloadProgress - 0.26) / (swapEnd - 0.26));
          const seatDrop = t < 0.68 ? THREE.MathUtils.lerp(0.22, 0.02, smoothstep01(t / 0.68)) : 0.0;
          const smackBump = t >= 0.68 ? Math.sin(((t - 0.68) / 0.32) * Math.PI) * 0.04 : 0;
          lx = topX - 0.02 * (1 - t);
          ly = topY + seatDrop + smackBump;
          lz = topZ;
          this.magGroup.visible = true;
          this.magGroup.position.set(topX, topY + seatDrop * 0.92, topZ);
          this.magGroup.rotation.set(0, 0, 0);
          leftRotX = -0.25;
          leftRotZ = 0.15;
        } else {
          this.magGroup.visible = false;
          const p = (reloadProgress - swapEnd) / (1 - swapEnd);
          const pull = Math.sin(Math.min(1, p / 0.7) * Math.PI);
          lx = THREE.MathUtils.lerp(topX - 0.04, restLx, smoothstep01(p));
          ly = THREE.MathUtils.lerp(ry + 0.04, restLy, smoothstep01(p));
          lz = THREE.MathUtils.lerp(rz - 0.12 + pull * 0.065, restLz, smoothstep01(p));
        }
      } else if (style === 'mp5_hk_slap' && emptyReload) {
        // Lock front cocking handle -> swap curved 9mm mag -> H&K slap down!
        const tubeX = -0.042;
        const tubeY = ry + 0.12;
        const tubeZ = rz - 0.26;
        if (reloadProgress < 0.24) {
          this.magGroup.visible = false;
          const t = smoothstep01(reloadProgress / 0.24);
          const pull = Math.sin(t * Math.PI);
          lx = THREE.MathUtils.lerp(restLx, tubeX, t);
          ly = THREE.MathUtils.lerp(restLy, tubeY + 0.025 * pull, t);
          lz = THREE.MathUtils.lerp(restLz, tubeZ + 0.055 * pull, t);
          leftRotZ = 0.22;
        } else if (reloadProgress < 0.62) {
          const p = (reloadProgress - 0.24) / 0.38;
          if (p < 0.38) {
            const t = smoothstep01(p / 0.38);
            lx = THREE.MathUtils.lerp(tubeX, magWellX - 0.02, t);
            ly = THREE.MathUtils.lerp(tubeY, magWellY - 0.07 * t, t);
            lz = THREE.MathUtils.lerp(tubeZ, magWellZ, t);
            this.magGroup.visible = true;
            this.magGroup.position.set(magWellX, magWellY - 0.18 * t, magWellZ);
            this.magGroup.rotation.set(0.28 * t, 0, 0);
          } else {
            const t = smoothstep01((p - 0.38) / 0.62);
            const arcY = THREE.MathUtils.lerp(-0.21, 0.0, t);
            lx = magWellX - 0.02 * (1 - t);
            ly = magWellY + arcY;
            lz = magWellZ;
            this.magGroup.visible = true;
            this.magGroup.position.set(magWellX, magWellY + arcY + 0.02, magWellZ);
            this.magGroup.rotation.set(0.2 * (1 - t), 0, 0);
          }
          leftRotZ = 0.25;
        } else if (reloadProgress < 0.87) {
          // H&K Slap downward onto cocking tube
          this.magGroup.visible = false;
          const p = (reloadProgress - 0.62) / 0.25;
          const slap = p < 0.45 ? smoothstep01(p / 0.45) : 1 - smoothstep01((p - 0.45) / 0.55);
          lx = THREE.MathUtils.lerp(magWellX, tubeX, Math.min(1, p * 2.2));
          ly = THREE.MathUtils.lerp(magWellY, tubeY + 0.095 * (1 - slap), Math.min(1, p * 2.2)) - 0.055 * slap;
          lz = THREE.MathUtils.lerp(magWellZ, tubeZ, Math.min(1, p * 2.2));
          leftRotX = -0.42;
          leftRotZ = 0.06;
        } else {
          this.magGroup.visible = false;
          const t = smoothstep01((reloadProgress - 0.87) / 0.13);
          lx = THREE.MathUtils.lerp(tubeX, restLx, t);
          ly = THREE.MathUtils.lerp(tubeY, restLy, t);
          lz = THREE.MathUtils.lerp(tubeZ, restLz, t);
        }
      } else {
        // Mag swap phase (scaled depending on tactical vs empty reload)
        const swapEnd = emptyReload ? 0.6 : 0.84;
        const dropEnd = swapEnd * 0.42;

        if (reloadProgress < dropEnd) {
          const t = smoothstep01(reloadProgress / dropEnd);
          const forwardTilt = style === 'ak_rock_lock' ? -0.055 * t : 0;
          lx = THREE.MathUtils.lerp(restLx, magWellX - 0.022, t);
          ly = THREE.MathUtils.lerp(restLy, magWellY - 0.06 * t, t);
          lz = THREE.MathUtils.lerp(restLz, magWellZ + forwardTilt, t);
          leftRotZ = THREE.MathUtils.lerp(leftRotZ, 0.24, t);
          this.magGroup.visible = t > 0.08;
          this.magGroup.position.set(
            magWellX,
            magWellY - 0.19 * Math.max(0, t - 0.08),
            magWellZ + forwardTilt,
          );
          this.magGroup.rotation.set((style === 'ak_rock_lock' ? 0.48 : 0.2) * t, 0, 0.08 * t);
        } else if (reloadProgress < swapEnd) {
          const t = smoothstep01((reloadProgress - dropEnd) / (swapEnd - dropEnd));
          const arcY = THREE.MathUtils.lerp(-0.21, 0.01, t);
          const rockRot = style === 'ak_rock_lock' ? 0.52 * (1 - t) : 0.14 * (1 - t);
          const tapOffset = style === 'g36_paddle_bolt' && !emptyReload && t > 0.72
            ? -Math.sin(((t - 0.72) / 0.28) * Math.PI) * 0.036
            : 0;
          lx = magWellX - 0.025 * (1 - t);
          ly = magWellY + arcY + tapOffset;
          lz = magWellZ + 0.02 * (1 - t);
          leftRotZ = 0.2;
          this.magGroup.visible = true;
          this.magGroup.position.set(magWellX, magWellY + arcY + 0.02, magWellZ);
          this.magGroup.rotation.set(rockRot, 0, 0);
        } else if (emptyReload && reloadProgress < 0.88) {
          // Empty chamber action: distinct per-gun bolt/slide/paddle motion
          this.magGroup.visible = false;
          const p = (reloadProgress - swapEnd) / (0.88 - swapEnd);
          const grab = smoothstep01(Math.min(1, p / 0.35));
          const act = Math.sin(Math.max(0, Math.min(1, (p - 0.3) / 0.55)) * Math.PI);

          let targetX = -0.045;
          let targetY = ry + 0.09;
          let targetZ = spec.isPistol ? rz - 0.03 : rz - 0.05;

          if (style === 'ak_rock_lock') {
            // Reach across/over receiver to right-side AK charging handle
            targetX = 0.048;
            targetY = ry + 0.098;
            targetZ = rz - 0.07 + act * 0.085;
          } else if (style === 'scar_bolt_catch') {
            // Left-side ping-pong bolt-catch slap
            targetX = -0.058 + act * 0.036;
            targetY = ry + 0.05;
            targetZ = rz - 0.095;
          } else if (style === 'deagle_heavy_pistol' || style === 'm1911_speed_slide') {
            // Thumb / palm slide release
            targetX = -0.03;
            targetY = ry + 0.072;
            targetZ = rz - 0.01 + act * 0.032;
          } else {
            // G36C top folding bolt flick
            targetX = -0.02;
            targetY = ry + 0.13;
            targetZ = rz - 0.08 + act * 0.068;
          }

          lx = THREE.MathUtils.lerp(magWellX, targetX, grab);
          ly = THREE.MathUtils.lerp(magWellY, targetY, grab);
          lz = THREE.MathUtils.lerp(magWellZ, targetZ, grab);
          leftRotX = -0.18;
          leftRotY = 0.28;
          leftRotZ = 0.15;
        } else {
          // Smooth return to foregrip
          this.magGroup.visible = false;
          const settleStart = emptyReload ? 0.88 : swapEnd;
          const t = smoothstep01((reloadProgress - settleStart) / (1 - settleStart));
          lx = THREE.MathUtils.lerp(magWellX - 0.02, restLx, t);
          ly = THREE.MathUtils.lerp(magWellY + 0.03, restLy, t);
          lz = THREE.MathUtils.lerp(magWellZ, restLz, t);
        }
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
