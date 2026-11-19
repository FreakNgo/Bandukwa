export type ControlMode = 'auto' | 'desktop' | 'mobile';
export type LobbyTab = 'solo' | 'host' | 'join';
export type CrosshairColor = 'green' | 'amber' | 'cyan' | 'white';
export type GraphicsQuality = 'auto' | 'low' | 'balanced' | 'high';

export type ReloadStyle =
  | 'ak_rock_lock'
  | 'deagle_heavy_pistol'
  | 'g36_paddle_bolt'
  | 'm1911_speed_slide'
  | 'mp5_hk_slap'
  | 'p90_top_mag'
  | 'scar_bolt_catch';

export type CustomHudId =
  | 'joystick'
  | 'fireLeft'
  | 'shoot'
  | 'ads'
  | 'jump'
  | 'crouch'
  | 'reload'
  | 'swap'
  | 'frag';

export interface CustomHudItemLayout {
  /** Center X in viewport % (6..94) */
  x: number;
  /** Center Y in viewport % (8..94) */
  y: number;
  /** Individual scale multiplier (0.75..1.45) */
  scale: number;
}

export interface HudConfig {
  scale: number;
  opacity: number;
  showRadar: boolean;
  showKillFeed: boolean;
  showStandings: boolean;
  showWeaponStrip: boolean;
  touchLayout: Partial<Record<CustomHudId, CustomHudItemLayout>>;
}

export const DEFAULT_HUD_CONFIG: HudConfig = {
  scale: 1.0,
  opacity: 0.92,
  showRadar: true,
  showKillFeed: true,
  showStandings: true,
  showWeaponStrip: true,
  touchLayout: {},
};

export interface SettingsState {
  sensitivity: number;
  adsMultiplier: number;
  fov: number;
  volume: number;
  shadows: boolean;
  graphicsQuality: GraphicsQuality;
  controlMode: ControlMode;
  botCount: number;
  crosshairColor: CrosshairColor;
  crouchToggle: boolean;
  hudConfig: HudConfig;
}

export const DEFAULT_SETTINGS: SettingsState = {
  sensitivity: 1.0,
  adsMultiplier: 0.7,
  fov: 80,
  volume: 0.75,
  shadows: true,
  graphicsQuality: 'auto',
  controlMode: 'auto',
  botCount: 1,
  crosshairColor: 'green',
  crouchToggle: true,
  hudConfig: DEFAULT_HUD_CONFIG,
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
  tacReloadTime: number;
  emptyReloadTime: number;
  reloadStyle: ReloadStyle;
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

export interface RadarBlip {
  x: number;
  z: number;
  kind: 'enemy' | 'grenade';
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
  reloadStageLabel: string;
  emptyReload: boolean;
  ads: boolean;
  crouching: boolean;
  sprinting: boolean;
  sliding: boolean;
  airborne: boolean;
  deadSeconds: number;
  crosshairGap: number;
  hitMarker: 'none' | 'body' | 'head';
  damageFlash: number;
  damageAngle: number | null;
  callout: string;
  scoreboard: CombatantHudRow[];
  killFeed: KillFeedItem[];
  pointerLocked: boolean;
  playing: boolean;
  started: boolean;
  mapReady: boolean;
  weaponsReady: boolean;
  peerCount: number;
  pingMs: number | null;
  netMode: 'solo' | 'p2p' | 'relay';
  grenades: number;
  maxGrenades: number;
  grenadeRefillProgress: number;
  roomCode: string | null;
  isHostRoom: boolean;
  maxPlayers: number;
  radarPlayer: { x: number; z: number; yaw: number };
  radarBlips: RadarBlip[];
}

export interface LobbyMember {
  id: number;
  name: string;
  cardId: number;
  ready: boolean;
  inGame: boolean;
  isHost: boolean;
  isMe: boolean;
  isBot?: boolean;
}

export interface LobbyChatItem {
  id: number;
  sender: string;
  text: string;
  isSystem?: boolean;
}

