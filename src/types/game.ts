export type ControlMode = 'auto' | 'desktop' | 'mobile';
export type LobbyTab = 'solo' | 'host' | 'join';
export type CrosshairColor = 'green' | 'amber' | 'cyan' | 'white';

export interface SettingsState {
  sensitivity: number;
  adsMultiplier: number;
  fov: number;
  volume: number;
  shadows: boolean;
  controlMode: ControlMode;
  botCount: number;
  crosshairColor: CrosshairColor;
  crouchToggle: boolean;
}

export const DEFAULT_SETTINGS: SettingsState = {
  sensitivity: 1.0,
  adsMultiplier: 0.7,
  fov: 80,
  volume: 0.75,
  shadows: true,
  controlMode: 'auto',
  botCount: 1,
  crosshairColor: 'green',
  crouchToggle: true,
};

export interface WeaponSpec {
  id: string;
  name: string;
  category: 'Rifle' | 'Pistol' | 'SMG';
  damage: number;
  headshotMul: number;
  rpm: number;
  mag: number;
  reloadTime: number;
  /** Standing first-shot base spread */
  spread: number;
  adsSpreadMul: number;
  crouchSpreadMul: number;
  /** Extra spread added at full running speed (counter-strafe resets this) */
  moveInaccuracy: number;
  /** CS-style weapon movement speed (m/s) */
  maxSpeed: number;
  auto: boolean;
  /** Vertical recoil kick per shot (radians) */
  recoilPitch: number;
  /** Horizontal jitter/sway per shot (radians) */
  recoilYaw: number;
  /** Camera recoil spring recovery speed */
  recoilRecovery: number;
  /** CS-style spray climb rate per continuous shot */
  sprayClimb: number;
  /** CS-style horizontal S-curve sway during sustained spray */
  spraySway: number;
  /** Viewmodel backward Z kick */
  vmKickZ: number;
  /** Viewmodel upward pitch kick */
  vmKickRot: number;
  soundType: 0 | 1 | 2;
  /** Model Y-rotation needed so barrel points along -Z */
  yawOffset: number;
  /** Uniform scale multiplier for viewmodel comfort */
  vmScale: number;
  /** Hip-fire viewmodel position relative to camera */
  hipPos: [number, number, number];
  /** ADS viewmodel position aligning sights to screen center */
  adsPos: [number, number, number];
  /** Barrel muzzle offset in gun local space (after yawOffset) */
  muzzleLocal: [number, number, number];
  /** Right hand grip anchor in gun local space (after yawOffset) */
  rightHandLocal: [number, number, number];
  /** Left hand support/foregrip anchor in gun local space (after yawOffset) */
  leftHandLocal: [number, number, number];
  /** Two-handed pistol cup grip flag */
  isPistol: boolean;
}

export interface ArenaOBB {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  bottom: number;
  top: number;
  tag?: string;
}

export interface CombatantHudRow {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  isMe: boolean;
  isBot: boolean;
  hp: number;
}

export interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  timestamp: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  ammo: number;
  mag: number;
  weaponIdx: number;
  weaponName: string;
  reloading: boolean;
  reloadProgress: number;
  ads: boolean;
  crouching: boolean;
  sprinting: boolean;
  sliding: boolean;
  airborne: boolean;
  deadSeconds: number;
  crosshairGap: number;
  hitMarker: 'none' | 'body' | 'head';
  damageFlash: number;
  scoreboard: CombatantHudRow[];
  killFeed: KillFeedItem[];
  pointerLocked: boolean;
  playing: boolean;
  started: boolean;
  mapReady: boolean;
  weaponsReady: boolean;
  peerCount: number;
  grenades: number;
  maxGrenades: number;
  grenadeRefillProgress: number;
  roomCode: string | null;
  isHostRoom: boolean;
  maxPlayers: number;
}
