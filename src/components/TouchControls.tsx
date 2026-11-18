import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bomb, Crosshair, Flame, RefreshCw, Repeat } from 'lucide-react';

interface TouchControlsProps {
  ads: boolean;
  crouching: boolean;
  sprinting: boolean;
  sliding: boolean;
  grenades: number;
  onMove: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onFireChange: (firing: boolean) => void;
  onToggleAds: () => void;
  onJump: () => void;
  onToggleCrouch: () => void;
  onReload: () => void;
  onNextWeapon: () => void;
  onGrenade: () => void;
}

export function TouchControls({
  ads,
  crouching,
  sprinting,
  sliding,
  grenades,
  onMove,
  onLookDelta,
  onFireChange,
  onToggleAds,
  onJump,
  onToggleCrouch,
  onReload,
  onNextWeapon,
  onGrenade,
}: TouchControlsProps) {
  const joyPointerId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const lookPointerId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const firePointerId = useRef<number | null>(null);
  const fireLast = useRef({ x: 0, y: 0 });

  const [joyActive, setJoyActive] = useState(false);
  const [joyCenter, setJoyCenter] = useState<{ x: number; y: number } | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [sprintEngage, setSprintEngage] = useState(false);

  const MAX_RADIUS = 48;

  const updateJoy = (cx: number, cy: number) => {
    const dx = cx - joyOrigin.current.x;
    const dy = cy - joyOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(MAX_RADIUS, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 0 ? Math.sin(angle) * clamped : 0;
    const nx = kx / MAX_RADIUS;
    const ny = -ky / MAX_RADIUS;
    setKnobOffset({ x: kx, y: ky });
    setSprintEngage(ny > 0.82);
    onMove(nx, ny);
  };

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joyPointerId.current !== null) return;
    joyPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);

    // Floating joystick spawns right under thumb inside the left movement pad
    const rect = e.currentTarget.getBoundingClientRect();
    const pad = 54;
    const clampedX = Math.max(rect.left + pad, Math.min(rect.right - pad, e.clientX));
    const clampedY = Math.max(rect.top + pad, Math.min(rect.bottom - pad, e.clientY));
    joyOrigin.current = { x: clampedX, y: clampedY };
    setJoyCenter({ x: clampedX - rect.left, y: clampedY - rect.top });
    setJoyActive(true);
    updateJoy(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerId.current) return;
    e.stopPropagation();
    updateJoy(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerId.current) return;
    e.stopPropagation();
    joyPointerId.current = null;
    setJoyActive(false);
    setJoyCenter(null);
    setKnobOffset({ x: 0, y: 0 });
    setSprintEngage(false);
    onMove(0, 0);
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== null) return;
    lookPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    lookPointerId.current = null;
  };

  // Drag-to-aim while holding the primary Fire button
  const handleFireDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    firePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    fireLast.current = { x: e.clientX, y: e.clientY };
    onFireChange(true);
  };

  const handleFireMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== firePointerId.current) return;
    e.stopPropagation();
    const dx = e.clientX - fireLast.current.x;
    const dy = e.clientY - fireLast.current.y;
    fireLast.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleFireUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== firePointerId.current) return;
    e.stopPropagation();
    firePointerId.current = null;
    onFireChange(false);
  };

  const showSlideMode = sprinting || sliding;

  return (
    <div className="hud-lock pointer-events-none fixed inset-0 z-20">
      {/* Right-half touch aim surface */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="pointer-events-auto absolute inset-y-0 right-0 w-[56%]"
        aria-label="Touch aim zone"
      />

      {/* Left-side floating virtual movement joystick zone */}
      <div
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        className="pointer-events-auto absolute bottom-0 left-0 h-[55%] w-[44%]"
        aria-label="Movement joystick zone"
      >
        <div
          style={
            joyCenter
              ? { left: `${joyCenter.x}px`, top: `${joyCenter.y}px`, transform: 'translate(-50%, -50%)' }
              : undefined
          }
          className={`${
            joyCenter ? 'absolute' : 'absolute bottom-14 left-5 sm:bottom-16 sm:left-7'
          } flex h-28 w-28 items-center justify-center rounded-full border transition-colors ${
            sprintEngage
              ? 'border-amber-400/90 bg-[#0b0f14]/65'
              : joyActive
                ? 'border-white/35 bg-[#0b0f14]/60'
                : 'border-white/18 bg-[#0b0f14]/45'
          }`}
        >
          <span
            className={`absolute -top-5 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${
              sprintEngage ? 'bg-amber-500 text-slate-950' : 'text-[#94a3b8]/75'
            }`}
          >
            SPRINT
          </span>
          <div
            style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
            className={`h-12 w-12 rounded-full border shadow-lg ${
              sprintEngage
                ? 'border-amber-200 bg-amber-400'
                : 'border-amber-400/75 bg-amber-500/85'
            }`}
          />
        </div>
      </div>

      {/* Left-thumb secondary quick-fire button (for simultaneous aim + shoot) */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          onFireChange(true);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onFireChange(false);
        }}
        onPointerCancel={() => onFireChange(false)}
        className="pointer-events-auto absolute bottom-48 left-5 flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-amber-400/45 bg-[#0b0f14]/75 text-amber-400 active:scale-95 sm:left-7"
        aria-label="Left quick fire"
      >
        <Flame className="h-5 w-5" />
        <span className="font-mono text-[8px] font-bold">FIRE</span>
      </button>

      {/* Right-thumb ergonomic action cluster */}
      <div className="pointer-events-auto absolute right-4 bottom-14 flex flex-col items-end gap-2.5 sm:right-6 sm:bottom-16">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={grenades <= 0}
            onPointerDown={(e) => {
              e.stopPropagation();
              onGrenade();
            }}
            className="relative flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95 disabled:opacity-40"
            aria-label="Throw frag grenade"
          >
            <Bomb className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-[8px] font-bold text-[#cbd5e1]">FRAG</span>
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[9px] font-bold tabular-nums text-slate-950">
              {grenades}
            </span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onNextWeapon();
            }}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
            aria-label="Next weapon"
          >
            <Repeat className="h-4 w-4" />
            <span className="font-mono text-[8px] font-bold text-[#cbd5e1]">SWAP</span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onReload();
            }}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
            aria-label="Reload"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="font-mono text-[8px] font-bold text-[#cbd5e1]">RLD</span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleAds();
            }}
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border active:scale-95 ${
              ads
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-white/15 bg-[#0b0f14]/75 text-white'
            }`}
            aria-label="Aim down sights"
          >
            <Crosshair className="h-4 w-4" />
            <span className="font-mono text-[8px] font-bold">ADS</span>
          </button>
        </div>

        <div className="flex items-end gap-2.5">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onJump();
              }}
              className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
              aria-label="Jump"
            >
              <ArrowUp className="h-4 w-4" />
              <span className="font-mono text-[8px] font-bold text-[#cbd5e1]">JUMP</span>
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onToggleCrouch();
              }}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border active:scale-95 ${
                crouching || sliding
                  ? 'border-amber-400 bg-amber-500 text-slate-950'
                  : showSlideMode
                    ? 'border-amber-400/80 bg-amber-500/20 text-amber-300'
                    : 'border-white/15 bg-[#0b0f14]/75 text-white'
              }`}
              aria-label="Crouch or slide"
            >
              <ArrowDown className="h-4 w-4" />
              <span className="font-mono text-[8px] font-bold">
                {showSlideMode ? 'SLIDE' : 'CRCH'}
              </span>
            </button>
          </div>

          {/* Primary Fire + Drag-to-Aim button */}
          <button
            type="button"
            onPointerDown={handleFireDown}
            onPointerMove={handleFireMove}
            onPointerUp={handleFireUp}
            onPointerCancel={handleFireUp}
            className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 border-amber-300/85 bg-amber-500/90 text-slate-950 shadow-xl active:scale-95"
            aria-label="Fire and aim weapon"
          >
            <Flame className="h-8 w-8" />
            <span className="font-mono text-[9px] font-bold">SHOOT</span>
          </button>
        </div>
      </div>
    </div>
  );
}
