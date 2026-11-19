import type { ReloadStyle } from '../types/game';

export type ReloadCueKind =
  | 'none'
  | 'ak_out'
  | 'ak_rock_in'
  | 'ak_rack'
  | 'pistol_drop'
  | 'deagle_slam'
  | 'deagle_slide'
  | 'paddle_drop'
  | 'mag_click'
  | 'mag_tap'
  | 'g36_bolt'
  | 'pistol_seat'
  | 'slide_stop'
  | 'smg_out'
  | 'smg_in'
  | 'hk_lock'
  | 'hk_slap'
  | 'p90_out'
  | 'p90_seat'
  | 'p90_smack'
  | 'smg_rack'
  | 'heavy_out'
  | 'heavy_in'
  | 'bolt_catch';

export interface ReloadStage {
  at: number;
  label: string;
  cue: ReloadCueKind;
}

export interface ReloadViewmodelPose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
}

const TIMELINES: Record<ReloadStyle, { tac: ReloadStage[]; empty: ReloadStage[] }> = {
  ak_rock_lock: {
    tac: [
      { at: 0.0, label: 'Strip Mag', cue: 'ak_out' },
      { at: 0.34, label: 'Rock & Lock', cue: 'ak_rock_in' },
      { at: 0.82, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Strip Mag', cue: 'ak_out' },
      { at: 0.25, label: 'Rock & Lock', cue: 'ak_rock_in' },
      { at: 0.6, label: 'Charge Bolt', cue: 'ak_rack' },
      { at: 0.88, label: 'Ready', cue: 'none' },
    ],
  },
  deagle_heavy_pistol: {
    tac: [
      { at: 0.0, label: 'Drop .50 Mag', cue: 'pistol_drop' },
      { at: 0.36, label: 'Slam Mag', cue: 'deagle_slam' },
      { at: 0.84, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Drop .50 Mag', cue: 'pistol_drop' },
      { at: 0.26, label: 'Slam Mag', cue: 'deagle_slam' },
      { at: 0.62, label: 'Slide Release', cue: 'deagle_slide' },
      { at: 0.88, label: 'Ready', cue: 'none' },
    ],
  },
  g36_paddle_bolt: {
    tac: [
      { at: 0.0, label: 'Paddle Drop', cue: 'paddle_drop' },
      { at: 0.32, label: 'Seat 5.56', cue: 'mag_click' },
      { at: 0.66, label: 'Tap Mag', cue: 'mag_tap' },
      { at: 0.86, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Paddle Drop', cue: 'paddle_drop' },
      { at: 0.25, label: 'Seat 5.56', cue: 'mag_click' },
      { at: 0.58, label: 'Flick Bolt', cue: 'g36_bolt' },
      { at: 0.88, label: 'Ready', cue: 'none' },
    ],
  },
  m1911_speed_slide: {
    tac: [
      { at: 0.0, label: 'Eject Mag', cue: 'pistol_drop' },
      { at: 0.34, label: 'Speed Load', cue: 'pistol_seat' },
      { at: 0.84, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Eject Mag', cue: 'pistol_drop' },
      { at: 0.26, label: 'Speed Load', cue: 'pistol_seat' },
      { at: 0.64, label: 'Slide Stop', cue: 'slide_stop' },
      { at: 0.88, label: 'Ready', cue: 'none' },
    ],
  },
  mp5_hk_slap: {
    tac: [
      { at: 0.0, label: 'Strip 9mm', cue: 'smg_out' },
      { at: 0.34, label: 'Insert 9mm', cue: 'smg_in' },
      { at: 0.84, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Lock Handle', cue: 'hk_lock' },
      { at: 0.24, label: 'Swap 9mm', cue: 'smg_in' },
      { at: 0.62, label: 'H&K Slap', cue: 'hk_slap' },
      { at: 0.87, label: 'Ready', cue: 'none' },
    ],
  },
  p90_top_mag: {
    tac: [
      { at: 0.0, label: 'Unclip Top', cue: 'p90_out' },
      { at: 0.34, label: 'Seat Top Mag', cue: 'p90_seat' },
      { at: 0.68, label: 'Palm Smack', cue: 'p90_smack' },
      { at: 0.88, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Unclip Top', cue: 'p90_out' },
      { at: 0.26, label: 'Seat Top Mag', cue: 'p90_seat' },
      { at: 0.56, label: 'Palm Smack', cue: 'p90_smack' },
      { at: 0.72, label: 'Charge Side', cue: 'smg_rack' },
      { at: 0.9, label: 'Ready', cue: 'none' },
    ],
  },
  scar_bolt_catch: {
    tac: [
      { at: 0.0, label: 'Drop 7.62', cue: 'heavy_out' },
      { at: 0.34, label: 'Lock 7.62', cue: 'heavy_in' },
      { at: 0.84, label: 'Ready', cue: 'none' },
    ],
    empty: [
      { at: 0.0, label: 'Drop 7.62', cue: 'heavy_out' },
      { at: 0.25, label: 'Lock 7.62', cue: 'heavy_in' },
      { at: 0.62, label: 'Bolt Catch', cue: 'bolt_catch' },
      { at: 0.88, label: 'Ready', cue: 'none' },
    ],
  },
};

export function getReloadStages(style: ReloadStyle, empty: boolean): ReloadStage[] {
  const entry = TIMELINES[style];
  return empty ? entry.empty : entry.tac;
}

export function getReloadStageIndex(style: ReloadStyle, progress: number, empty: boolean): number {
  const stages = getReloadStages(style, empty);
  let idx = 0;
  for (let i = 0; i < stages.length; i++) {
    if (progress >= stages[i].at) idx = i;
  }
  return idx;
}

function pulse(progress: number, center: number, width: number): number {
  const d = (progress - center) / width;
  if (d < -1 || d > 1) return 0;
  return Math.cos(d * Math.PI * 0.5) ** 2;
}

export function computeReloadViewmodelPose(
  style: ReloadStyle,
  progress: number,
  empty: boolean,
): ReloadViewmodelPose {
  if (progress <= 0 || progress >= 1) {
    return { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
  }

  const settleStart = empty ? 0.88 : 0.84;
  const baseEnv =
    progress < settleStart
      ? Math.sin(Math.min(1, progress / 0.18) * (Math.PI * 0.5))
      : Math.max(0, 1 - (progress - settleStart) / (1 - settleStart));

  switch (style) {
    case 'ak_rock_lock': {
      // Lift gun cleanly into mid-view, crisp rock-and-lock mag twist, sharp right-side charging handle rack
      const rockBump = pulse(progress, empty ? 0.42 : 0.52, 0.13);
      const rackTilt = empty && progress > 0.58 && progress < 0.88
        ? Math.sin(((progress - 0.58) / 0.3) * Math.PI)
        : 0;
      return {
        px: -0.058 * baseEnv + 0.036 * rackTilt,
        py: 0.022 * baseEnv + 0.028 * rockBump - 0.02 * rackTilt,
        pz: 0.036 * baseEnv + 0.055 * rackTilt,
        rx: 0.26 * baseEnv + 0.2 * rockBump,
        ry: 0.38 * baseEnv - 0.46 * rackTilt,
        rz: 0.44 * baseEnv - 0.62 * rackTilt,
      };
    }

    case 'deagle_heavy_pistol': {
      // Dramatic high-view wrist cant + heavy upward .50 mag slam + crisp slide drop kick
      const slamBump = pulse(progress, empty ? 0.45 : 0.55, 0.12);
      const slideSnap = empty ? pulse(progress, 0.72, 0.1) : 0;
      return {
        px: -0.042 * baseEnv,
        py: 0.028 * baseEnv + 0.042 * slamBump - 0.018 * slideSnap,
        pz: 0.028 * baseEnv + 0.042 * slideSnap,
        rx: 0.38 * baseEnv + 0.24 * slamBump - 0.18 * slideSnap,
        ry: 0.32 * baseEnv,
        rz: 0.48 * baseEnv,
      };
    }

    case 'g36_paddle_bolt': {
      // Clean raised vertical cant, crisp upward base-tap, top folding bolt snap
      const tapBump = pulse(progress, empty ? 0.46 : 0.72, 0.1);
      const boltPull = empty ? pulse(progress, 0.72, 0.12) : 0;
      return {
        px: -0.046 * baseEnv,
        py: 0.018 * baseEnv + 0.034 * tapBump,
        pz: 0.03 * baseEnv + 0.04 * boltPull,
        rx: 0.22 * baseEnv + 0.14 * tapBump,
        ry: 0.28 * baseEnv,
        rz: 0.32 * baseEnv - 0.18 * boltPull,
      };
    }

    case 'm1911_speed_slide': {
      // Crisp tactical chest-high cant keeping sight picture near center
      const seatBump = pulse(progress, empty ? 0.44 : 0.52, 0.11);
      const stopClick = empty ? pulse(progress, 0.72, 0.08) : 0;
      return {
        px: -0.028 * baseEnv,
        py: 0.022 * baseEnv + 0.026 * seatBump,
        pz: 0.018 * baseEnv + 0.028 * stopClick,
        rx: 0.22 * baseEnv + 0.12 * seatBump,
        ry: 0.2 * baseEnv,
        rz: 0.28 * baseEnv,
      };
    }

    case 'mp5_hk_slap': {
      // Raised cocking-tube lock tilt, tight mag swap, decisive downward H&K slap jolt
      const lockPull = empty ? pulse(progress, 0.14, 0.11) : 0;
      const slapJolt = empty ? pulse(progress, 0.72, 0.09) : 0;
      const seatBump = pulse(progress, empty ? 0.45 : 0.54, 0.1);
      return {
        px: -0.055 * baseEnv + 0.03 * slapJolt,
        py: 0.018 * baseEnv - 0.056 * slapJolt + 0.022 * seatBump,
        pz: 0.04 * baseEnv + 0.036 * lockPull,
        rx: 0.24 * baseEnv - 0.32 * slapJolt + 0.14 * lockPull,
        ry: 0.36 * baseEnv,
        rz: 0.52 * baseEnv - 0.4 * slapJolt,
      };
    }

    case 'p90_top_mag': {
      // Bullpup rolls horizontally sideways so player sees top 50rd magazine swap + palm smack clearly
      const smackBump = pulse(progress, empty ? 0.62 : 0.74, 0.1);
      const sideCharge = empty ? pulse(progress, 0.8, 0.09) : 0;
      return {
        px: -0.042 * baseEnv,
        py: -0.028 * baseEnv - 0.042 * smackBump,
        pz: 0.038 * baseEnv + 0.036 * sideCharge,
        rx: -0.14 * baseEnv - 0.2 * smackBump,
        ry: 0.34 * baseEnv,
        rz: 0.74 * baseEnv - 0.2 * smackBump,
      };
    }

    case 'scar_bolt_catch': {
      // Heavy battle rifle cant up & left, solid 7.62 seat thud, crisp lateral left-side bolt-catch slap
      const heavySeat = pulse(progress, empty ? 0.45 : 0.56, 0.12);
      const catchSlap = empty ? pulse(progress, 0.72, 0.09) : 0;
      return {
        px: -0.06 * baseEnv + 0.04 * catchSlap,
        py: 0.014 * baseEnv + 0.03 * heavySeat,
        pz: 0.042 * baseEnv,
        rx: 0.26 * baseEnv + 0.16 * heavySeat,
        ry: 0.38 * baseEnv - 0.18 * catchSlap,
        rz: 0.46 * baseEnv - 0.32 * catchSlap,
      };
    }
  }
}
