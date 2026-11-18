import * as THREE from 'three';
import { WeaponModelCache } from './weapons';

export interface CombatantVisual {
  root: THREE.Group;
  weaponPivot: THREE.Group;
  weaponMesh: THREE.Group;
  weaponIdx: number;
  labelSprite: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTex: THREE.CanvasTexture;
  updateLabel: (name: string, hp: number) => void;
  setWeapon: (idx: number, cache: WeaponModelCache) => void;
  animate: (
    dt: number,
    horizSpeed: number,
    crouching: boolean,
    pitch: number,
    onGround: boolean,
  ) => void;
  dispose: () => void;
}

interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
}

function buildLeg(
  side: -1 | 1,
  bduMat: THREE.Material,
  gearMat: THREE.Material,
  bootMat: THREE.Material,
  accentMat: THREE.Material,
): LegRig {
  const hip = new THREE.Group();
  hip.position.set(side * 0.115, 0.82, 0);

  // Upper leg / thigh
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.4, 0.165), bduMat);
  thigh.position.y = -0.2;
  hip.add(thigh);

  // Drop-leg holster on right thigh, utility pouch on left thigh
  const legPouch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.11), gearMat);
  legPouch.position.set(side * 0.082, -0.2, 0);
  hip.add(legPouch);

  // Knee joint
  const knee = new THREE.Group();
  knee.position.set(0, -0.4, 0);
  hip.add(knee);

  const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.1, 0.05), gearMat);
  kneePad.position.set(0, 0, -0.085);
  knee.add(kneePad);

  // Lower leg / shin
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.34, 0.14), bduMat);
  shin.position.y = -0.17;
  knee.add(shin);

  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.035, 0.148), accentMat);
  strap.position.y = -0.08;
  knee.add(strap);

  // Combat boot
  const boot = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.11, 0.23), bootMat);
  boot.position.set(0, -0.365, -0.035);
  knee.add(boot);

  return { hip, knee };
}

export function createCombatantVisual(
  name: string,
  accentHex: number,
  weaponIdx: number,
  weaponCache: WeaponModelCache,
): CombatantVisual {
  const root = new THREE.Group();

  const vestMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.62,
    metalness: 0.14,
  });
  const bduMat = new THREE.MeshStandardMaterial({
    color: 0x2c333c,
    roughness: 0.82,
    metalness: 0.06,
  });
  const gearMat = new THREE.MeshStandardMaterial({
    color: 0x171a20,
    roughness: 0.45,
    metalness: 0.25,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x141518,
    roughness: 0.68,
    metalness: 0.15,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0x21272e,
    roughness: 0.42,
    metalness: 0.28,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.18,
    metalness: 0.68,
    emissive: 0x3f2200,
    emissiveIntensity: 0.45,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x9b7a62,
    roughness: 0.78,
    metalness: 0.02,
  });

  // Lower body: articulated legs
  const leftLeg = buildLeg(-1, bduMat, gearMat, bootMat, vestMat);
  const rightLeg = buildLeg(1, bduMat, gearMat, bootMat, vestMat);
  root.add(leftLeg.hip, rightLeg.hip);

  // Pelvis & tactical belt (moves downward during crouch)
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.y = 0.82;
  root.add(pelvisGroup);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.23), bduMat);
  pelvis.position.y = 0.02;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.25), gearMat);
  belt.position.y = 0.08;
  pelvisGroup.add(pelvis, belt);

  // Upper body: armored torso, plate carrier, pouches, neck & detailed tactical helmet
  const upperBody = new THREE.Group();
  upperBody.position.y = 0.1;
  pelvisGroup.add(upperBody);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.24), bduMat);
  chest.position.y = 0.24;
  const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.28), vestMat);
  carrier.position.y = 0.26;
  upperBody.add(chest, carrier);

  // Front magazine pouches
  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.14, 0.055), gearMat);
    pouch.position.set(i * 0.105, 0.19, -0.155);
    upperBody.add(pouch);
  }

  // Rear tactical pack
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.12), gearMat);
  pack.position.set(0, 0.27, 0.18);
  upperBody.add(pack);

  // Shoulder pauldrons
  for (const s of [-1, 1] as const) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.18), vestMat);
    shoulder.position.set(s * 0.25, 0.43, 0);
    upperBody.add(shoulder);
  }

  // Neck & Head + Ballistic CS-style Helmet
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.1, 10), gearMat);
  neck.position.y = 0.52;
  upperBody.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.67;
  upperBody.add(headGroup);

  const balaclava = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), gearMat);
  headGroup.add(balaclava);

  const faceMask = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.075, 0.05), skinMat);
  faceMask.position.set(0, 0.025, -0.115);
  headGroup.add(faceMask);

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.072, 0.075), visorMat);
  goggles.position.set(0, 0.032, -0.13);
  headGroup.add(goggles);

  const helmetDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.168, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    helmetMat,
  );
  helmetDome.position.y = 0.015;
  headGroup.add(helmetDome);

  const helmetBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.176, 0.035, 14), helmetMat);
  helmetBrim.position.y = 0.022;
  headGroup.add(helmetBrim);

  const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.045), gearMat);
  nvgMount.position.set(0, 0.08, -0.165);
  headGroup.add(nvgMount);

  for (const s of [-1, 1] as const) {
    const earcup = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 10), gearMat);
    earcup.rotation.z = Math.PI / 2;
    earcup.position.set(s * 0.165, -0.01, 0.01);
    headGroup.add(earcup);
  }

  // Weapon & Articulated Two-Arm Rig (pivots smoothly with pitch!)
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.19, 0.36, -0.06);
  upperBody.add(weaponPivot);

  const rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.24), bduMat);
  rightUpperArm.position.set(0.04, -0.04, -0.06);
  rightUpperArm.rotation.set(0.22, 0.18, 0);
  const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.085, 0.1), gearMat);
  rightGlove.position.set(0.0, -0.06, -0.17);

  const leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.26), bduMat);
  leftUpperArm.position.set(-0.34, -0.06, -0.08);
  leftUpperArm.rotation.set(0.15, -0.58, 0);
  const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.22), bduMat);
  leftForearm.position.set(-0.14, -0.05, -0.25);
  leftForearm.rotation.set(0.05, -0.68, 0);
  const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.085, 0.1), gearMat);
  leftGlove.position.set(-0.02, -0.04, -0.34);

  weaponPivot.add(rightUpperArm, rightGlove, leftUpperArm, leftForearm, leftGlove);

  let weaponMesh = weaponCache.createMesh(weaponIdx, false);
  weaponMesh.position.set(0.01, -0.01, -0.24);
  weaponPivot.add(weaponMesh);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Overhead nametag + compact HP bar
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true }),
  );
  labelSprite.scale.set(1.5, 0.375, 1);
  labelSprite.position.y = 2.02;
  root.add(labelSprite);

  let lastName = '';
  let lastHp = -1;
  let walkCycle = Math.random() * Math.PI * 2;
  let crouchMix = 0;

  const updateLabel = (nextName: string, hp: number) => {
    const cleanHp = Math.max(0, Math.round(hp));
    if (nextName === lastName && cleanHp === lastHp) return;
    lastName = nextName;
    lastHp = cleanHp;

    const ctx = labelCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(11, 15, 20, 0.78)';
    ctx.beginPath();
    ctx.roundRect(16, 8, 224, 46, 10);
    ctx.fill();

    ctx.fillStyle = '#eef2f6';
    ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nextName.slice(0, 14), 128, 25);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(36, 42, 184, 5);
    const ratio = cleanHp / 100;
    ctx.fillStyle = ratio > 0.45 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(36, 42, 184 * ratio, 5);
    labelTex.needsUpdate = true;
  };

  updateLabel(name, 100);

  let currentWeaponIdx = weaponIdx;
  let builtWithCache = weaponCache.ready;
  const setWeapon = (idx: number, cache: WeaponModelCache) => {
    if (idx === currentWeaponIdx && weaponMesh && (builtWithCache || !cache.ready)) return;
    currentWeaponIdx = idx;
    builtWithCache = cache.ready;
    weaponPivot.remove(weaponMesh);
    weaponMesh = cache.createMesh(idx, false);
    weaponMesh.position.set(0.01, -0.01, -0.24);
    weaponPivot.add(weaponMesh);
  };

  const animate = (
    dt: number,
    horizSpeed: number,
    crouching: boolean,
    pitch: number,
    onGround: boolean,
  ) => {
    const targetCrouch = crouching ? 1 : 0;
    crouchMix += (targetCrouch - crouchMix) * Math.min(1, 14 * dt);

    const speedFactor = Math.min(1, horizSpeed / 6.2);
    if (horizSpeed > 0.25 && onGround) {
      walkCycle += dt * horizSpeed * 2.15;
    }

    const stride = onGround ? Math.sin(walkCycle) * 0.56 * speedFactor : 0.22;
    const bounce = onGround ? Math.abs(Math.cos(walkCycle)) * 0.03 * speedFactor : 0;

    // Crouch bends hips forward (+X), knees backward (-X), and drops pelvis
    const crouchHipAngle = crouchMix * 0.85;
    const crouchKneeAngle = crouchMix * -1.45;
    const airTuckHip = !onGround ? 0.55 : 0;
    const airTuckKnee = !onGround ? -0.95 : 0;

    const hipBaseY = 0.82 - crouchMix * 0.34 + bounce;
    leftLeg.hip.position.y = hipBaseY;
    rightLeg.hip.position.y = hipBaseY;
    pelvisGroup.position.y = hipBaseY;

    leftLeg.hip.rotation.x = stride + crouchHipAngle + airTuckHip;
    rightLeg.hip.rotation.x = -stride + crouchHipAngle + airTuckHip;
    leftLeg.knee.rotation.x = Math.min(0, -Math.max(0, -stride) * 0.7 + crouchKneeAngle + airTuckKnee);
    rightLeg.knee.rotation.x = Math.min(0, -Math.max(0, stride) * 0.7 + crouchKneeAngle + airTuckKnee);

    upperBody.rotation.x = -crouchMix * 0.14;
    const clampedPitch = Math.max(-1.0, Math.min(1.0, pitch));
    headGroup.rotation.x = clampedPitch * 0.55;
    weaponPivot.rotation.x = clampedPitch * 0.85;

    labelSprite.position.y = 2.02 - crouchMix * 0.45;
  };

  const dispose = () => {
    labelTex.dispose();
    labelSprite.material.dispose();
    vestMat.dispose();
    bduMat.dispose();
    gearMat.dispose();
    bootMat.dispose();
    helmetMat.dispose();
    visorMat.dispose();
    skinMat.dispose();
  };

  return {
    root,
    weaponPivot,
    weaponMesh,
    weaponIdx: currentWeaponIdx,
    labelSprite,
    labelCanvas,
    labelTex,
    updateLabel,
    setWeapon,
    animate,
    dispose,
  };
}
