import * as THREE from 'three';
import type { ArenaOBB } from '../types/game';
import { createCombatantVisual, type CombatantVisual } from './avatars';
import { raycastOBB, resolvePlayerCollisions, SPAWN_POINTS } from './map';
import { WEAPON_SPECS, WeaponModelCache } from './weapons';

const BOT_CALLSIGNS = ['Viper', 'Kestrel', 'Nomad', 'Jackal', 'Cobra', 'Atlas'];
const BOT_COLORS = [0x944832, 0x3b5875, 0x5c6b3c, 0x6e4f73, 0x8a6d3b, 0x3d6b66];

const WAYPOINTS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [0, -7.2],
  [0, 7.2],
  [-8.0, 0],
  [8.0, 0],
  [-11.5, -11.0],
  [11.5, -11.0],
  [-11.5, 11.2],
  [11.5, 11.2],
  [-11.8, 2.5],
  [11.8, -2.5],
  [-2.5, 11.8],
  [2.5, -11.8],
];

const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _end = new THREE.Vector3();

export interface BotActor {
  id: string;
  name: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  hp: number;
  kills: number;
  deaths: number;
  weaponIdx: number;
  respawnTimer: number;
  fireCooldown: number;
  hadLos: boolean;
  strafeDir: number;
  strafeTimer: number;
  crouchTimer: number;
  stepAccum: number;
  lastFireTime: number;
  waypoint: [number, number];
  visual: CombatantVisual;
}

export class BotManager {
  bots: BotActor[] = [];

  constructor(
    private scene: THREE.Scene,
    private weaponCache: WeaponModelCache,
  ) {}

  syncCount(count: number): void {
    const clamped = Math.max(0, Math.min(6, count));
    while (this.bots.length > clamped) {
      const removed = this.bots.pop();
      if (removed) {
        this.scene.remove(removed.visual.root);
        removed.visual.dispose();
      }
    }
    while (this.bots.length < clamped) {
      const idx = this.bots.length;
      const name = BOT_CALLSIGNS[idx % BOT_CALLSIGNS.length];
      const wIdx = [0, 2, 4, 6, 5, 1][idx % 6];
      const visual = createCombatantVisual(
        name,
        BOT_COLORS[idx % BOT_COLORS.length],
        wIdx,
        this.weaponCache,
      );
      this.scene.add(visual.root);

      const bot: BotActor = {
        id: `bot-${idx}`,
        name,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        yaw: 0,
        pitch: 0,
        hp: 100,
        kills: 0,
        deaths: 0,
        weaponIdx: wIdx,
        respawnTimer: 0,
        fireCooldown: 1.0 + Math.random() * 1.0,
        hadLos: false,
        strafeDir: Math.random() < 0.5 ? -1 : 1,
        strafeTimer: 1.5,
        crouchTimer: 0,
        stepAccum: 0,
        lastFireTime: -10_000,
        waypoint: WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)],
        visual,
      };
      this.spawnBot(bot);
      this.bots.push(bot);
    }
  }

  alertTo(soundPos: THREE.Vector3, radius = 22): void {
    for (const bot of this.bots) {
      if (bot.hp <= 0 || bot.respawnTimer > 0 || bot.hadLos) continue;
      const dist = Math.hypot(soundPos.x - bot.pos.x, soundPos.z - bot.pos.z);
      if (dist <= radius) {
        bot.waypoint = [
          Math.max(-13, Math.min(13, soundPos.x + (Math.random() - 0.5) * 3.5)),
          Math.max(-13, Math.min(13, soundPos.z + (Math.random() - 0.5) * 3.5)),
        ];
      }
    }
  }

  notifyDamaged(bot: BotActor, attackerPos: THREE.Vector3): void {
    bot.strafeDir = -bot.strafeDir;
    bot.strafeTimer = 0.7 + Math.random() * 0.6;
    if (Math.random() < 0.65) {
      bot.crouchTimer = 0.55 + Math.random() * 0.3;
    }
    if (!bot.hadLos) {
      bot.waypoint = [
        Math.max(-13, Math.min(13, attackerPos.x)),
        Math.max(-13, Math.min(13, attackerPos.z)),
      ];
      bot.fireCooldown = Math.max(bot.fireCooldown, 0.45);
    }
  }

  refreshWeaponModels(): void {
    for (const bot of this.bots) {
      bot.visual.setWeapon(bot.weaponIdx, this.weaponCache);
    }
  }

  spawnBot(bot: BotActor, avoidPos?: THREE.Vector3): void {
    let best = SPAWN_POINTS[0];
    let bestScore = -1;
    for (const sp of SPAWN_POINTS) {
      const dist = avoidPos ? Math.hypot(sp[0] - avoidPos.x, sp[1] - avoidPos.z) : 14;
      const score = dist + Math.random() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    bot.pos.set(best[0], 0, best[1]);
    bot.vel.set(0, 0, 0);
    bot.hp = 100;
    bot.respawnTimer = 0;
    bot.hadLos = false;
    bot.crouchTimer = 0;
    bot.stepAccum = 0;
    bot.lastFireTime = -10_000;
    bot.fireCooldown = 1.0 + Math.random() * 0.8;
    bot.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
    bot.visual.root.visible = true;
    bot.visual.root.position.copy(bot.pos);
    bot.visual.updateLabel(bot.name, bot.hp);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerDead: boolean,
    colliders: ArenaOBB[],
    onBotShoot: (
      bot: BotActor,
      muz: THREE.Vector3,
      end: THREE.Vector3,
      hitPlayer: boolean,
      dmg: number,
      headshot: boolean,
      wallNormal: THREE.Vector3 | null,
    ) => void,
    onBotStep?: (bot: BotActor) => void,
  ): void {
    for (const bot of this.bots) {
      if (bot.respawnTimer > 0) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          this.spawnBot(bot, playerPos);
        }
        continue;
      }

      bot.fireCooldown -= dt;
      if (bot.crouchTimer > 0) bot.crouchTimer = Math.max(0, bot.crouchTimer - dt);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 1.2 + Math.random() * 1.4;
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }

      let hasLos = false;
      const dxP = playerPos.x - bot.pos.x;
      const dzP = playerPos.z - bot.pos.z;
      const distP = Math.hypot(dxP, dzP);

      if (!playerDead && distP < 34 && distP > 0.5) {
        _org.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
        _dir.set(dxP, playerPos.y + 1.4 - (bot.pos.y + 1.45), dzP).normalize();
        let blocked = false;
        for (const c of colliders) {
          const t = raycastOBB(_org, _dir, c, _norm);
          if (t !== null && t < distP) {
            blocked = true;
            break;
          }
        }
        hasLos = !blocked;
      }

      // Add a fair reaction pause when first spotting the player
      if (hasLos && !bot.hadLos) {
        bot.fireCooldown = Math.max(bot.fireCooldown, 0.72);
      }
      bot.hadLos = hasLos;

      let targetYaw = bot.yaw;
      const moveSpeed = 3.5;

      if (hasLos) {
        targetYaw = Math.atan2(-dxP, -dzP);
        const approach = distP > 11 ? 0.55 : distP < 5.5 ? -0.55 : 0;
        const fx = -Math.sin(targetYaw);
        const fz = -Math.cos(targetYaw);
        const rx = Math.cos(targetYaw);
        const rz = -Math.sin(targetYaw);
        const wx = fx * approach + rx * bot.strafeDir * 0.85;
        const wz = fz * approach + rz * bot.strafeDir * 0.85;
        const wl = Math.hypot(wx, wz) || 1;
        bot.vel.x += ((wx / wl) * 3.7 - bot.vel.x) * Math.min(1, 7 * dt);
        bot.vel.z += ((wz / wl) * 3.7 - bot.vel.z) * Math.min(1, 7 * dt);

        // Slower, fairer cadence (~0.85s–1.60s between shots)
        if (bot.fireCooldown <= 0) {
          const spec = WEAPON_SPECS[bot.weaponIdx];
          bot.fireCooldown = 0.85 + Math.random() * 0.75;

          _org.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
          const aimSpread = 0.088 + Math.min(0.055, distP * 0.0018);
          _dir
            .set(
              dxP + (Math.random() - 0.5) * distP * aimSpread,
              playerPos.y + 1.3 - (bot.pos.y + 1.45) + (Math.random() - 0.5) * distP * aimSpread,
              dzP + (Math.random() - 0.5) * distP * aimSpread,
            )
            .normalize();

          let minT = 180;
          let hitWallNormal: THREE.Vector3 | null = null;
          for (const c of colliders) {
            const t = raycastOBB(_org, _dir, c, _norm);
            if (t !== null && t < minT) {
              minT = t;
              hitWallNormal = _norm.clone();
            }
          }
          if (_dir.y < -1e-5) {
            const tg = -_org.y / _dir.y;
            if (tg > 0 && tg < minT) {
              minT = tg;
              hitWallNormal = new THREE.Vector3(0, 1, 0);
            }
          }

          const px = _org.x - playerPos.x;
          const pz = _org.z - playerPos.z;
          const a = _dir.x * _dir.x + _dir.z * _dir.z;
          let hitPlayer = false;
          let headshot = false;
          if (a > 1e-6) {
            const b = 2 * (px * _dir.x + pz * _dir.z);
            const c = px * px + pz * pz - 0.2;
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
              const tHit = (-b - Math.sqrt(disc)) / (2 * a);
              if (tHit > 0 && tHit < minT) {
                const hitY = _org.y + _dir.y * tHit - playerPos.y;
                if (hitY >= 0 && hitY <= 1.72) {
                  minT = tHit;
                  hitPlayer = true;
                  hitWallNormal = null;
                  headshot = hitY > 1.42;
                }
              }
            }
          }

          _muz.set(bot.pos.x, bot.pos.y + (bot.crouchTimer > 0 ? 0.96 : 1.25), bot.pos.z);
          _end.copy(_org).addScaledVector(_dir, minT);
          const dmg = hitPlayer
            ? Math.round(Math.min(18, Math.max(9, spec.damage * (headshot ? 0.55 : 0.35))))
            : 0;
          bot.lastFireTime = performance.now();
          onBotShoot(bot, _muz, _end, hitPlayer, dmg, headshot, hitWallNormal);
        }
      } else {
        const wx = bot.waypoint[0] - bot.pos.x;
        const wz = bot.waypoint[1] - bot.pos.z;
        const distW = Math.hypot(wx, wz);
        if (distW < 2.0) {
          bot.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
        } else {
          targetYaw = Math.atan2(-wx, -wz);
          bot.vel.x += ((wx / distW) * moveSpeed - bot.vel.x) * Math.min(1, 6 * dt);
          bot.vel.z += ((wz / distW) * moveSpeed - bot.vel.z) * Math.min(1, 6 * dt);
        }
      }

      const dyaw = ((targetYaw - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      bot.yaw += dyaw * Math.min(1, 8 * dt);

      bot.vel.y -= 24 * dt;
      const prevX = bot.pos.x;
      const prevZ = bot.pos.z;
      bot.pos.x += bot.vel.x * dt;
      bot.pos.z += bot.vel.z * dt;
      bot.pos.y = Math.max(0, bot.pos.y + bot.vel.y * dt);

      const gy = resolvePlayerCollisions(bot.pos, bot.vel, colliders, 0.38);
      if (bot.pos.y <= gy + 0.01 && bot.vel.y <= 0) {
        bot.pos.y = gy;
        bot.vel.y = 0;
      }

      if (!hasLos && Math.hypot(bot.pos.x - prevX, bot.pos.z - prevZ) < 0.008) {
        bot.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
      }

      const botHorizSpeed = Math.hypot(bot.vel.x, bot.vel.z);
      const isCrouching = bot.crouchTimer > 0;
      const onFloor = Math.abs(bot.vel.y) < 0.4;
      if (onFloor && botHorizSpeed > 1.2 && !isCrouching) {
        bot.stepAccum += botHorizSpeed * dt;
        if (bot.stepAccum > 2.2) {
          bot.stepAccum = 0;
          onBotStep?.(bot);
        }
      }
      bot.visual.root.position.copy(bot.pos);
      bot.visual.root.rotation.y = bot.yaw;
      bot.visual.animate(dt, botHorizSpeed, isCrouching, 0, onFloor);
      bot.visual.updateLabel(bot.name, bot.hp);
    }
  }

  dispose(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.visual.root);
      bot.visual.dispose();
    }
    this.bots = [];
  }
}
