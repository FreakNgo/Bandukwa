import { useState } from 'react';
import { Bomb, Check, Copy, Maximize2, Minimize2, Pause, Settings, Trophy, Users } from 'lucide-react';
import { WEAPON_SPECS } from '../game/weapons';
import type { CrosshairColor, HudSnapshot } from '../types/game';

interface HudOverlayProps {
  hud: HudSnapshot;
  crosshairColor: CrosshairColor;
  showFullScoreboard: boolean;
  isMobileHud: boolean;
  isFullscreen: boolean;
  onSelectWeapon: (idx: number) => void;
  onOpenSettings: () => void;
  onToggleFullscreen: () => void;
  onPause: () => void;
}

const CROSSHAIR_HEX: Record<CrosshairColor, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  cyan: '#38bdf8',
  white: '#ffffff',
};

export function HudOverlay({
  hud,
  crosshairColor,
  showFullScoreboard,
  isMobileHud,
  isFullscreen,
  onSelectWeapon,
  onOpenSettings,
  onToggleFullscreen,
  onPause,
}: HudOverlayProps) {
  const [copiedCode, setCopiedCode] = useState(false);

  if (!hud.started) return null;

  const gap = hud.crosshairGap;
  const hpPercent = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const chHex = CROSSHAIR_HEX[crosshairColor] ?? '#22c55e';
  const stanceLabel = hud.sliding
    ? 'Sliding'
    : hud.crouching
      ? 'Crouching'
      : hud.airborne
        ? 'Airborne'
        : hud.sprinting
          ? 'Sprinting'
          : hud.ads
            ? 'Aiming'
            : 'Ready';

  const copyRoomCode = async () => {
    if (!hud.roomCode) return;
    try {
      await navigator.clipboard.writeText(hud.roomCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="hud-lock pointer-events-none fixed inset-0 z-10">
      {/* Damage edge vignette */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-150"
        style={{
          opacity: hud.damageFlash * 0.85,
          boxShadow: 'inset 0 0 140px 36px rgba(220, 38, 38, 0.85)',
        }}
      />

      {/* Top-Center: Active 5-Digit Room Code Bar (visible at top of game while hosting or in P2P match) */}
      {hud.roomCode && (
        <div className="pointer-events-auto fixed left-1/2 top-3.5 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-amber-500/40 bg-[#0b0f14]/88 px-3.5 py-1.5 text-xs text-[#eef2f6] sm:top-5">
          <span className="text-[11px] font-medium text-[#94a3b8] whitespace-nowrap">
            {hud.isHostRoom ? 'Host Code' : 'Room'}
          </span>
          <span className="font-mono text-base font-bold tracking-[0.2em] tabular-nums text-amber-400">
            {hud.roomCode}
          </span>
          <button
            type="button"
            onClick={copyRoomCode}
            title="Copy room code"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[#cbd5e1] transition-colors hover:border-amber-400/60 hover:text-white"
          >
            {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <span className="h-3.5 w-px bg-white/15" />
          <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-[#cbd5e1] whitespace-nowrap">
            <Users className="h-3.5 w-3.5 text-amber-400" />
            {hud.peerCount + 1}/{hud.maxPlayers}
          </span>
        </div>
      )}

      {/* CS 1.6 Dynamic Tactical Crosshair */}
      {hud.deadSeconds <= 0 && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100"
          style={{ opacity: hud.ads ? 0.35 : 0.94 }}
        >
          <span
            className="absolute left-1/2 h-2.5 w-[2px] -translate-x-1/2 shadow-[0_0_2px_#000]"
            style={{ bottom: `${gap}px`, backgroundColor: chHex }}
          />
          <span
            className="absolute left-1/2 h-2.5 w-[2px] -translate-x-1/2 shadow-[0_0_2px_#000]"
            style={{ top: `${gap}px`, backgroundColor: chHex }}
          />
          <span
            className="absolute top-1/2 h-[2px] w-2.5 -translate-y-1/2 shadow-[0_0_2px_#000]"
            style={{ right: `${gap}px`, backgroundColor: chHex }}
          />
          <span
            className="absolute top-1/2 h-[2px] w-2.5 -translate-y-1/2 shadow-[0_0_2px_#000]"
            style={{ left: `${gap}px`, backgroundColor: chHex }}
          />
          <span className="block h-1 w-1 rounded-full shadow-[0_0_2px_#000]" style={{ backgroundColor: chHex }} />
        </div>
      )}

      {/* Hitmarker */}
      <div
        className="pointer-events-none fixed left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 transition-opacity duration-100"
        style={{
          opacity: hud.hitMarker === 'none' ? 0 : 1,
          borderColor: hud.hitMarker === 'head' ? '#fbbf24' : '#ef4444',
        }}
      />

      {/* Top-Left: Kill feed */}
      <div className="fixed left-3.5 top-3.5 flex flex-col gap-1.5 sm:left-5 sm:top-5">
        {hud.killFeed.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0b0f14]/80 px-3 py-1.5 text-xs text-[#eef2f6]"
          >
            <span className="font-semibold text-amber-400">{item.killer}</span>
            <span className="text-[#64748b]">·</span>
            <span className="font-mono text-[11px] text-[#cbd5e1]">
              {item.weapon}
              {item.headshot ? ' (HS)' : ''}
            </span>
            <span className="text-[#64748b]">·</span>
            <span className="font-semibold text-white">{item.victim}</span>
          </div>
        ))}
      </div>

      {/* Top-Right: Compact Leaderboard + Quick Action Buttons */}
      <div className="fixed right-3.5 top-3.5 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/82 px-2.5 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span className="hidden md:inline">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/82 px-3 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
          >
            <Settings className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            type="button"
            onClick={onPause}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/82 px-3 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>

        <div className="hidden min-w-[196px] rounded-lg border border-white/10 bg-[#0b0f14]/78 px-3.5 py-2.5 sm:block">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#94a3b8]">
            <span className="flex items-center gap-1.5">
              <Trophy className="h-3 w-3 text-amber-400" />
              Standings
            </span>
            <span className="font-mono">K / D</span>
          </div>
          <div className="space-y-1">
            {hud.scoreboard.slice(0, 5).map((row) => (
              <div
                key={row.id}
                className={`flex items-center justify-between gap-4 text-xs ${
                  row.isMe ? 'font-semibold text-amber-400' : 'text-[#e2e8f0]'
                }`}
              >
                <span className="max-w-[115px] truncate">{row.name}</span>
                <span className="font-mono tabular-nums">
                  {row.kills}/{row.deaths}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-Left (Desktop) / Top-Left (Mobile): Health & Stance */}
      <div
        className={`fixed ${
          isMobileHud ? 'top-16 left-3.5' : 'bottom-5 left-5'
        } rounded-lg border border-white/10 bg-[#0b0f14]/82 px-3.5 py-2`}
      >
        <div className="mb-1 flex items-baseline justify-between gap-4 sm:gap-6">
          <span className="font-mono text-xl font-bold tabular-nums leading-none text-white sm:text-2xl">
            {hud.hp}
          </span>
          <span className="text-xs font-medium text-[#94a3b8]">{stanceLabel}</span>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/15 sm:h-2 sm:w-52">
          <div
            className={`h-full transition-[width] duration-100 ${
              hpPercent > 40 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* Bottom-Center: 7-Weapon Strip (hidden on narrow portrait phones where SWAP button handles switching cleanly) */}
      <div
        className={`pointer-events-auto fixed left-1/2 -translate-x-1/2 ${
          isMobileHud ? 'bottom-2 hidden sm:flex' : 'bottom-5 flex'
        } max-w-[96vw] items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#0b0f14]/82 p-1`}
      >
        {WEAPON_SPECS.map((w, idx) => {
          const active = idx === hud.weaponIdx;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelectWeapon(idx)}
              className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-[#94a3b8] hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="mr-1 font-mono opacity-75">{idx + 1}</span>
              <span className="hidden md:inline">{w.name}</span>
              <span className="md:hidden">{w.id}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom-Right (Desktop) / Top-Right below menu (Mobile): Frag Grenade + Ammo */}
      <div
        className={`fixed ${
          isMobileHud ? 'right-3.5 top-16' : 'right-5 bottom-5'
        } flex items-end gap-2`}
      >
        {!isMobileHud && (
          <div className="rounded-lg border border-white/10 bg-[#0b0f14]/82 px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Bomb className={`h-4 w-4 ${hud.grenades > 0 ? 'text-amber-400' : 'text-[#64748b]'}`} />
              <span className="font-mono text-lg font-bold tabular-nums leading-none text-white">
                {hud.grenades}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-[#94a3b8]">[G] Frag</div>
            {hud.grenades < hud.maxGrenades && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${Math.round(hud.grenadeRefillProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-[#0b0f14]/82 px-3.5 py-2 text-right sm:px-4 sm:py-2.5">
          {hud.reloading ? (
            <div>
              <div className="font-display text-xs font-bold text-amber-400 sm:text-sm">Reloading</div>
              <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-white/15 sm:w-28">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="font-mono text-2xl font-bold tabular-nums leading-none text-white sm:text-3xl">
                  {hud.ammo}
                </span>
                <span className="font-mono text-xs tabular-nums text-[#94a3b8] sm:text-sm">
                  / {hud.mag}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-[#cbd5e1] sm:text-xs">
                {hud.weaponName}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Tab Scoreboard Overlay */}
      {showFullScoreboard && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#06090d]/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#111720] p-5 text-[#eef2f6]">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-lg font-bold text-white">Match Scoreboard</h3>
              <span className="font-mono text-xs text-[#94a3b8]">
                {hud.roomCode
                  ? `Room ${hud.roomCode} (${hud.peerCount + 1}/${hud.maxPlayers})`
                  : 'Solo vs Bots'}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-12 px-2 text-[11px] font-medium text-[#64748b]">
                <span className="col-span-6">Operator</span>
                <span className="col-span-3 text-right">Kills</span>
                <span className="col-span-3 text-right">Deaths</span>
              </div>
              {hud.scoreboard.map((row) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-12 items-center rounded-md px-2.5 py-2 text-sm ${
                    row.isMe ? 'bg-amber-500/15 font-semibold text-amber-300' : 'bg-white/[0.03]'
                  }`}
                >
                  <span className="col-span-6 truncate">
                    {row.name}
                    {row.isBot ? ' · Bot' : ''}
                  </span>
                  <span className="col-span-3 text-right font-mono tabular-nums">{row.kills}</span>
                  <span className="col-span-3 text-right font-mono tabular-nums">{row.deaths}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Respawn overlay */}
      {hud.deadSeconds > 0 && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-red-950/35">
          <div className="rounded-xl border border-red-400/30 bg-[#0b0f14]/90 px-7 py-5 text-center">
            <div className="font-display text-2xl font-bold text-white">Eliminated</div>
            <div className="mt-1 font-mono text-sm tabular-nums text-amber-400">
              Respawning in {hud.deadSeconds}s
            </div>
          </div>
        </div>
      )}

      {/* Discreet desktop prompt whenever pointer lock is not active */}
      {!hud.pointerLocked && !isMobileHud && hud.deadSeconds <= 0 && (
        <div
          className={`fixed left-1/2 z-20 -translate-x-1/2 rounded-lg border border-white/12 bg-[#0b0f14]/88 px-4 py-2 text-xs font-medium text-[#e2e8f0] ${
            hud.roomCode ? 'top-16' : 'top-5'
          }`}
        >
          Click arena to lock cursor at center
        </div>
      )}
    </div>
  );
}
