import type { RadarBlip } from '../types/game';

interface TacticalRadarProps {
  player: { x: number; z: number; yaw: number };
  blips: RadarBlip[];
  compact?: boolean;
}

// World-space Desert Compound layout footprints (matches src/game/map.ts)
const BUILDINGS: ReadonlyArray<{ x: number; z: number; w: number; d: number }> = [
  { x: -3.8, z: 3.6, w: 5.16, d: 5.32 },
  { x: 3.8, z: 3.6, w: 5.32, d: 5.16 },
  { x: -3.8, z: -3.6, w: 5.32, d: 5.16 },
  { x: 3.8, z: -3.6, w: 5.16, d: 5.32 },
];

const WALLS: ReadonlyArray<{ x: number; z: number; w: number; d: number }> = [
  // Windowed Wall_01 barriers
  { x: -3.4, z: 10.2, w: 4.0, d: 0.36 },
  { x: 2.9, z: 9.7, w: 4.0, d: 0.36 },
  { x: 3.4, z: -10.2, w: 4.0, d: 0.36 },
  { x: -2.9, z: -9.7, w: 4.0, d: 0.36 },
  { x: -10.3, z: -1.8, w: 0.36, d: 4.0 },
  { x: 10.3, z: 1.8, w: 0.36, d: 4.0 },
  // Wing Wall_02 barriers
  { x: -7.15, z: 6.1, w: 1.56, d: 0.34 },
  { x: 7.15, z: -6.1, w: 1.56, d: 0.34 },
  { x: -10.4, z: 5.2, w: 1.56, d: 0.34 },
  { x: 10.4, z: -5.2, w: 1.56, d: 0.34 },
  { x: -12.6, z: -7.2, w: 1.56, d: 0.34 },
  { x: 12.6, z: 7.2, w: 1.56, d: 0.34 },
];

const RADAR_SCALE = 2.65; // SVG units per meter (radius 46 covers ~17.3m)
const MAX_BLIP_R = 42.5;

export function TacticalRadar({ player, blips, compact = false }: TacticalRadarProps) {
  const yawDeg = (player.yaw * 180) / Math.PI;
  const sinY = Math.sin(player.yaw);
  const cosY = Math.cos(player.yaw);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border border-white/15 bg-[#0b0f14]/82 shadow-lg ${
        compact ? 'h-[76px] w-[76px]' : 'h-[108px] w-[108px]'
      }`}
      aria-label="Tactical radar"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <clipPath id="radar-clip">
            <circle cx="50" cy="50" r="47" />
          </clipPath>
          <linearGradient id="radar-fov" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Range rings & cross */}
        <circle cx="50" cy="50" r="47" fill="#0d131b" fillOpacity="0.6" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.7" />
        <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.7" />
        <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,0.05)" strokeWidth="0.6" />
        <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.6" />

        {/* Rotated compound geometry around player heading */}
        <g clipPath="url(#radar-clip)">
          <g
            transform={`translate(50 50) rotate(${yawDeg.toFixed(2)}) scale(${RADAR_SCALE}) translate(${(-player.x).toFixed(2)} ${(-player.z).toFixed(2)})`}
          >
            {/* Arena perimeter */}
            <rect
              x="-14.5"
              y="-14.5"
              width="29"
              height="29"
              fill="rgba(224,206,168,0.06)"
              stroke="rgba(224,206,168,0.34)"
              strokeWidth="0.45"
            />
            {/* 4 compound houses */}
            {BUILDINGS.map((b, idx) => (
              <rect
                key={`b-${idx}`}
                x={b.x - b.w * 0.5}
                y={b.z - b.d * 0.5}
                width={b.w}
                height={b.d}
                rx="0.25"
                fill="rgba(148,163,184,0.28)"
                stroke="rgba(226,232,240,0.4)"
                strokeWidth="0.24"
              />
            ))}
            {/* Tactical cover walls */}
            {WALLS.map((w, idx) => (
              <rect
                key={`w-${idx}`}
                x={w.x - w.w * 0.5}
                y={w.z - w.d * 0.5}
                width={w.w}
                height={w.d}
                fill="rgba(226,232,240,0.5)"
              />
            ))}
          </g>
        </g>

        {/* Forward view cone */}
        <polygon points="50,50 22,8 78,8" fill="url(#radar-fov)" clipPath="url(#radar-clip)" />

        {/* Radar blips (clamped to rim if beyond radius so gunfire direction always shows) */}
        {blips.map((blip, idx) => {
          const dx = blip.x - player.x;
          const dz = blip.z - player.z;
          const rightDist = dx * cosY - dz * sinY;
          const fwdDist = -dx * sinY - dz * cosY;
          let sx = rightDist * RADAR_SCALE;
          let sy = -fwdDist * RADAR_SCALE;
          const len = Math.hypot(sx, sy);
          const clamped = len > MAX_BLIP_R;
          if (clamped) {
            sx = (sx / len) * MAX_BLIP_R;
            sy = (sy / len) * MAX_BLIP_R;
          }
          const cx = 50 + sx;
          const cy = 50 + sy;
          const isGrenade = blip.kind === 'grenade';
          return (
            <g key={`blip-${idx}`}>
              <circle
                cx={cx}
                cy={cy}
                r={isGrenade ? 4.4 : clamped ? 3.8 : 4.8}
                fill={isGrenade ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)'}
              />
              <circle
                cx={cx}
                cy={cy}
                r={isGrenade ? 2.3 : clamped ? 2.1 : 2.6}
                fill={isGrenade ? '#fbbf24' : '#ef4444'}
                stroke="#0b0f14"
                strokeWidth="0.7"
              />
            </g>
          );
        })}

        {/* Local player marker at center */}
        <polygon points="50,44.5 53.8,53 50,51 46.2,53" fill="#f59e0b" stroke="#0b0f14" strokeWidth="0.7" />
      </svg>
    </div>
  );
}
