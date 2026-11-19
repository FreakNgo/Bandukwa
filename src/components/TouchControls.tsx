import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bomb, Crosshair, Flame, RefreshCw, Repeat } from 'lucide-react';
import type { CustomHudId, HudConfig } from '../types/game';

interface TouchControlsProps {
  ads: boolean;
  crouching: boolean;
  sprinting: boolean;
  sliding: boolean;
  reloading: boolean;
  lowAmmo: boolean;
  grenades: number;
  hudConfig: HudConfig;
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
  reloading,
  lowAmmo,
  grenades,
  hudConfig,
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

  const MAX_RADIUS = 46;
  const { opacity, scale: globalScale, touchLayout } = hudConfig;

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

  // Drag-to-aim while holding the primary circular Shoot button
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
  const circleBtnBase =
    'pointer-events-auto touch-none select-none flex flex-col items-center justify-center rounded-full border backdrop-blur-sm shadow-lg transition-transform active:scale-90';

  const getCustomStyle = (id: CustomHudId): React.CSSProperties | undefined => {
    const custom = touchLayout[id];
    if (!custom) return { opacity };
    return {
      position: 'fixed',
      left: `${custom.x}%`,
      top: `${custom.y}%`,
      opacity,
      transform: `translate(-50%, -50%) scale(${custom.scale * globalScale})`,
    };
  };

  const customJoy = touchLayout.joystick;

  const renderRightButton = (id: CustomHudId, inArc: boolean) => {
    const isCustom = Boolean(touchLayout[id]);
    if (inArc && isCustom) return null;
    if (!inArc && !isCustom) return null;

    const style = isCustom ? getCustomStyle(id) : { opacity };

    switch (id) {
      case 'swap':
        return (
          <button
            key={id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onNextWeapon();
            }}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-[114px] bottom-[112px]'
            } h-11 w-11 border-white/18 bg-[#0b0f14]/75 text-white`}
            aria-label="Next weapon"
          >
            <Repeat className="h-4 w-4" />
            <span className="font-mono text-[7.5px] font-bold text-[#cbd5e1]">SWAP</span>
          </button>
        );
      case 'frag':
        return (
          <button
            key={id}
            type="button"
            disabled={grenades <= 0}
            onPointerDown={(e) => {
              e.stopPropagation();
              onGrenade();
            }}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-[58px] bottom-[118px]'
            } h-11 w-11 border-white/18 bg-[#0b0f14]/75 text-white disabled:opacity-40`}
            aria-label="Throw frag grenade"
          >
            <Bomb className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-[7.5px] font-bold text-[#cbd5e1]">FRAG</span>
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[9px] font-bold tabular-nums text-slate-950">
              {grenades}
            </span>
          </button>
        );
      case 'reload':
        return (
          <button
            key={id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onReload();
            }}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-[6px] bottom-[86px]'
            } h-12 w-12 ${
              lowAmmo && !reloading
                ? 'border-amber-400 bg-amber-500/25 text-amber-300'
                : 'border-white/18 bg-[#0b0f14]/75 text-white'
            }`}
            aria-label="Reload"
          >
            <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin text-amber-400' : ''}`} />
            <span className="font-mono text-[8px] font-bold">RLD</span>
          </button>
        );
      case 'jump':
        return (
          <button
            key={id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onJump();
            }}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-[80px] bottom-[62px]'
            } h-12 w-12 border-white/18 bg-[#0b0f14]/75 text-white`}
            aria-label="Jump"
          >
            <ArrowUp className="h-4 w-4" />
            <span className="font-mono text-[8px] font-bold text-[#cbd5e1]">JUMP</span>
          </button>
        );
      case 'crouch':
        return (
          <button
            key={id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleCrouch();
            }}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-[134px] bottom-[28px]'
            } h-12 w-12 ${
              crouching || sliding
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : showSlideMode
                  ? 'border-amber-400/80 bg-amber-500/25 text-amber-300'
                  : 'border-white/18 bg-[#0b0f14]/75 text-white'
            }`}
            aria-label="Crouch or slide"
          >
            <ArrowDown className="h-4 w-4" />
            <span className="font-mono text-[8px] font-bold">{showSlideMode ? 'SLIDE' : 'CRCH'}</span>
          </button>
        );
      case 'ads':
        return (
          <button
            key={id}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleAds();
            }}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-[84px] bottom-[4px]'
            } h-12 w-12 ${
              ads ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-white/18 bg-[#0b0f14]/75 text-white'
            }`}
            aria-label="Aim down sights"
          >
            <Crosshair className="h-4 w-4" />
            <span className="font-mono text-[8px] font-bold">ADS</span>
          </button>
        );
      case 'shoot':
        return (
          <button
            key={id}
            type="button"
            onPointerDown={handleFireDown}
            onPointerMove={handleFireMove}
            onPointerUp={handleFireUp}
            onPointerCancel={handleFireUp}
            style={style}
            className={`${circleBtnBase} ${
              isCustom ? '' : 'absolute right-0 bottom-0'
            } h-[76px] w-[76px] border-2 border-amber-200/90 bg-amber-500/90 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.4)]`}
            aria-label="Fire and aim weapon"
          >
            <Flame className="h-7 w-7" />
            <span className="font-mono text-[9px] font-extrabold tracking-wide">SHOOT</span>
          </button>
        );
      default:
        return null;
    }
  };

  const rightIds: CustomHudId[] = ['swap', 'frag', 'reload', 'jump', 'crouch', 'ads', 'shoot'];

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="hud-lock pointer-events-none fixed inset-0 z-20 select-none"
    >
      {/* Right-half touch aim surface */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="pointer-events-auto touch-none absolute inset-y-0 right-0 w-[56%]"
        aria-label="Touch aim zone"
      />

      {/* Left-side floating virtual circular movement joystick zone */}
      <div
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        className="pointer-events-auto touch-none absolute bottom-0 left-0 h-[56%] w-[44%]"
        aria-label="Movement joystick zone"
      >
        <div
          style={
            joyCenter
              ? {
                  left: `${joyCenter.x}px`,
                  top: `${joyCenter.y}px`,
                  opacity,
                  transform: `translate(-50%, -50%) scale(${(customJoy?.scale ?? 1) * globalScale})`,
                }
              : customJoy
                ? {
                    position: 'fixed',
                    left: `${customJoy.x}%`,
                    top: `${customJoy.y}%`,
                    opacity,
                    transform: `translate(-50%, -50%) scale(${customJoy.scale * globalScale})`,
                  }
                : { opacity, transform: `scale(${globalScale})`, transformOrigin: 'bottom left' }
          }
          className={`${
            joyCenter || customJoy ? 'absolute' : 'absolute bottom-5 left-4 sm:bottom-8 sm:left-6'
          } flex h-28 w-28 items-center justify-center rounded-full border transition-colors ${
            sprintEngage
              ? 'border-amber-400/90 bg-[#0b0f14]/65'
              : joyActive
                ? 'border-white/35 bg-[#0b0f14]/60'
                : 'border-white/18 bg-[#0b0f14]/45'
          }`}
        >
          <span
            className={`absolute -top-5 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider ${
              sprintEngage ? 'bg-amber-500 text-slate-950' : 'text-[#94a3b8]/80'
            }`}
          >
            SPRINT
          </span>
          <div
            style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
            className={`h-12 w-12 rounded-full border shadow-lg ${
              sprintEngage ? 'border-amber-200 bg-amber-400' : 'border-amber-400/75 bg-amber-500/85'
            }`}
          />
        </div>
      </div>

      {/* Left-thumb circular quick-fire button */}
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
        style={
          touchLayout.fireLeft
            ? getCustomStyle('fireLeft')
            : { opacity, transform: `scale(${globalScale})`, transformOrigin: 'bottom left' }
        }
        className={`${circleBtnBase} ${
          touchLayout.fireLeft ? '' : 'absolute bottom-36 left-4 sm:bottom-44 sm:left-6'
        } h-[52px] w-[52px] border-amber-400/60 bg-[#0b0f14]/72 text-amber-400`}
        aria-label="Left quick fire"
      >
        <Flame className="h-5 w-5" />
        <span className="font-mono text-[8px] font-bold leading-none">FIRE</span>
      </button>

      {/* Default right-thumb radial arc for non-repositioned buttons */}
      <div
        style={{
          transform: `scale(${globalScale})`,
          transformOrigin: 'bottom right',
        }}
        className="pointer-events-none absolute right-4 bottom-5 h-[172px] w-[190px] sm:right-6 sm:bottom-8"
      >
        {rightIds.map((id) => renderRightButton(id, true))}
      </div>

      {/* Custom-positioned right-thumb buttons rendered directly in root viewport coordinates */}
      {rightIds.map((id) => renderRightButton(id, false))}
    </div>
  );
}
