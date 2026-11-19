import { useState } from 'react';
import { Bomb, Check, Copy, Maximize2, Minimize2, Pause, Settings, Trophy, Users, Wifi } from 'lucide-react';
import { WEAPON_SPECS } from '../game/weapons';
import type { CrosshairColor, HudConfig, HudSnapshot } from '../types/game';
import { TacticalRadar } from './TacticalRadar';

interface HudOverlayProps {
  hud: HudSnapshot;
  crosshairColor: CrosshairColor;
  hudConfig: HudConfig;
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

function PingBadge({
  pingMs,
  netMode,
  compact = false,
}: {
  pingMs: number | null;
  netMode: 'solo' | 'p2p' | 'relay';
  compact?: boolean;
}) {
  if (netMode === 'solo') return null;
  const color =
    pingMs === null
      ? 'text-[#94a3b8]'
      : pingMs <= 50
        ? 'text-emerald-400'
        : pingMs <= 100
          ? 'text-amber-400'
          : 'text-red-400';
  const modeLabel = netMode === 'p2p' ? 'P2P' : 'Relay';

  return (
    <span
      className={`flex items-center gap-1 font-mono tabular-nums whitespace-nowrap ${color} ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      <Wifi className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {pingMs !== null ? `${pingMs}ms` : '--ms'}
      <span className="text-[#94a3b8] opacity-80">· {modeLabel}</span>
    </span>
  );
}

export function HudOverlay({
  hud,
  crosshairColor,
  hudConfig,
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
  const isEmpty = !hud.reloading && hud.ammo === 0;
  const isLowAmmo = !hud.reloading && hud.ammo > 0 && hud.ammo <= Math.max(2, Math.ceil(hud.mag * 0.25));
  const stanceLabel = hud.sliding
    ? 'Sliding'
    : hud.crouching
      ? 'Crouch'
      : hud.airborne
        ? 'Air'
        : hud.sprinting
          ? 'Sprint'
          : hud.ads
            ? 'ADS'
            : 'Ready';

  const hudOpacityStyle = { opacity: hudConfig.opacity };

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
    <div className="hud-lock pointer-events-none fixed inset-0 z-30">
      {/* Damage edge vignette */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-150"
        style={{
          opacity: hud.damageFlash * 0.82,
          boxShadow: 'inset 0 0 135px 34px rgba(220, 38, 38, 0.85)',
        }}
      />

      {/* Directional Damage Indicator around reticle */}
      {hud.damageFlash > 0.05 && hud.damageAngle !== null && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-75"
          style={{
            opacity: Math.min(1, hud.damageFlash * 1.1),
            transform: `translate(-50%, -50%) rotate(${((hud.damageAngle * 180) / Math.PI).toFixed(1)}deg)`,
          }}
        >
          <div className="mx-auto h-3.5 w-14 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.95)]" />
        </div>
      )}

      {/* Combat Callout Banner (Headshot / Multi-Kill) */}
      {hud.callout && hud.deadSeconds <= 0 && (
        <div className="pointer-events-none fixed left-1/2 top-[34%] z-20 -translate-x-1/2 rounded-full border border-amber-400/50 bg-[#0b0f14]/82 px-3.5 py-1 font-display text-xs font-extrabold tracking-[0.16em] text-amber-400 shadow-lg sm:text-sm">
          {hud.callout}
        </div>
      )}

      {/* CS 1.6 Dynamic Tactical Crosshair + Circular Reload Progress Ring */}
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

          {hud.reloading && (
            <svg
              className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 -rotate-90 drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]"
              viewBox="0 0 48 48"
            >
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="2.5"
              />
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke={hud.emptyReload ? '#f59e0b' : '#34d399'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 19}
                strokeDashoffset={(1 - Math.max(0, Math.min(1, hud.reloadProgress))) * 2 * Math.PI * 19}
              />
            </svg>
          )}
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

      {/* Reload stage OR Low Ammo / Empty Warning under reticle */}
      {hud.reloading && hud.deadSeconds <= 0 ? (
        <div className="pointer-events-none fixed left-1/2 top-[56.5%] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-[#0b0f14]/82 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-300 shadow">
          <span className={hud.emptyReload ? 'text-amber-400' : 'text-emerald-400'}>
            {hud.emptyReload ? 'DRY' : 'TAC'}
          </span>
          <span className="text-white/25">·</span>
          <span>{hud.reloadStageLabel || 'RELOADING'}</span>
        </div>
      ) : (
        (isEmpty || isLowAmmo) &&
        hud.deadSeconds <= 0 && (
          <div
            className={`pointer-events-none fixed left-1/2 top-[57%] -translate-x-1/2 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider ${
              isEmpty
                ? 'border-red-500/60 bg-red-950/75 text-red-300'
                : 'border-amber-500/45 bg-[#0b0f14]/75 text-amber-300'
            }`}
          >
            {isEmpty ? (isMobileHud ? 'EMPTY · TAP RLD' : 'EMPTY · [R] RELOAD') : 'LOW AMMO'}
          </div>
        )
      )}

      {/* Responsive Non-Overlapping Top HUD Row */}
      <div
        style={hudOpacityStyle}
        className="fixed inset-x-[max(0.65rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] z-40 flex items-start justify-between gap-2 sm:inset-x-5 sm:top-4"
      >
        {/* Top-Left: Tactical Radar + Mobile HP/Room or Desktop Killfeed */}
        <div className="flex items-start gap-2.5">
          {hudConfig.showRadar && (
            <TacticalRadar player={hud.radarPlayer} blips={hud.radarBlips} compact={isMobileHud} />
          )}

          {isMobileHud ? (
            <div className="flex flex-col gap-1.5">
              {/* Compact Mobile HP & Stance */}
              <div className="rounded-xl border border-white/12 bg-[#0b0f14]/88 px-2.5 py-1.5">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="font-mono text-base font-bold tabular-nums leading-none text-white">
                    {hud.hp}
                  </span>
                  <span className="text-[10px] font-semibold text-[#94a3b8]">{stanceLabel}</span>
                </div>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full transition-[width] duration-100 ${
                      hpPercent > 40 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              </div>

              {/* Compact Mobile Room & Ping Pill */}
              {hud.roomCode && (
                <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-[#0b0f14]/82 px-2.5 py-1 text-[10px] text-[#eef2f6]">
                  <span className="font-mono font-bold tracking-wider text-amber-400">{hud.roomCode}</span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={copyRoomCode}
                    title="Copy room code"
                    className="touch-manipulation text-[#cbd5e1] active:text-white"
                  >
                    {copiedCode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <span className="h-2.5 w-px bg-white/15" />
                  <PingBadge pingMs={hud.pingMs} netMode={hud.netMode} compact />
                </div>
              )}
            </div>
          ) : (
            hudConfig.showKillFeed && (
              <div className="flex flex-col gap-1.5">
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
            )
          )}
        </div>

        {/* Top-Center (Desktop): Room Code + Player Count + Live Ping */}
        {!isMobileHud && hud.roomCode && (
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-amber-500/40 bg-[#0b0f14]/88 px-3.5 py-1.5 text-xs text-[#eef2f6]">
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
            <span className="h-3.5 w-px bg-white/15" />
            <PingBadge pingMs={hud.pingMs} netMode={hud.netMode} />
          </div>
        )}

        {/* Top-Right: Quick Actions + Mobile Ammo or Desktop Leaderboard */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className={
                isMobileHud
                  ? 'touch-manipulation flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-[#0b0f14]/90 text-[#e2e8f0] active:scale-95'
                  : 'flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/88 px-2.5 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap'
              }
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4 text-amber-400" />
              ) : (
                <Maximize2 className="h-4 w-4 text-amber-400" />
              )}
              {!isMobileHud && (
                <span className="hidden md:inline">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
              )}
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenSettings}
              title="Settings"
              className={
                isMobileHud
                  ? 'touch-manipulation flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-[#0b0f14]/90 text-[#e2e8f0] active:scale-95'
                  : 'flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/88 px-3 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap'
              }
            >
              <Settings className="h-4 w-4 text-amber-400" />
              {!isMobileHud && <span className="hidden sm:inline">Settings</span>}
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onPause}
              title="Menu"
              className={
                isMobileHud
                  ? 'touch-manipulation flex h-10 w-10 items-center justify-center rounded-full border border-white/18 bg-[#0b0f14]/90 text-[#e2e8f0] active:scale-95'
                  : 'flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/88 px-3 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap'
              }
            >
              <Pause className="h-4 w-4" />
              {!isMobileHud && <span className="hidden sm:inline">Menu</span>}
            </button>
          </div>

          {isMobileHud ? (
            /* Mobile Compact Top-Right Ammo, Reload Stage & Weapon Card */
            <div className="rounded-xl border border-white/12 bg-[#0b0f14]/88 px-2.5 py-1.5 text-right">
              {hud.reloading ? (
                <div>
                  <div className="flex items-center justify-end gap-1 font-display text-[11px] font-bold text-amber-400">
                    <span>{hud.reloadStageLabel || 'Reloading'}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-22 overflow-hidden rounded-full bg-white/15">
                    <div
                      className={`h-full ${hud.emptyReload ? 'bg-amber-500' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline justify-end gap-1">
                    <span
                      className={`font-mono text-lg font-bold tabular-nums leading-none ${
                        isEmpty ? 'text-red-400' : isLowAmmo ? 'text-amber-400' : 'text-white'
                      }`}
                    >
                      {hud.ammo}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-[#94a3b8]">
                      /{hud.mag}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] font-medium text-[#cbd5e1]">
                    {hud.weaponName}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Desktop Leaderboard */
            hudConfig.showStandings && (
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
            )
          )}
        </div>
      </div>

      {/* Mobile Compact Killfeed (latest 2 kills, top-center below top bars) */}
      {isMobileHud && hudConfig.showKillFeed && hud.killFeed.length > 0 && (
        <div
          style={hudOpacityStyle}
          className="pointer-events-none fixed left-1/2 top-[92px] z-10 flex -translate-x-1/2 flex-col items-center gap-1"
        >
          {hud.killFeed.slice(0, 2).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0b0f14]/70 px-2.5 py-0.5 text-[10px] text-[#eef2f6]"
            >
              <span className="font-semibold text-amber-400">{item.killer}</span>
              <span className="font-mono text-[#cbd5e1]">
                {item.weapon}
                {item.headshot ? ' (HS)' : ''}
              </span>
              <span className="font-semibold text-white">{item.victim}</span>
            </div>
          ))}
        </div>
      )}

      {/* Desktop Bottom-Left: Health & Stance */}
      {!isMobileHud && (
        <div
          style={{
            ...hudOpacityStyle,
            transform: `scale(${hudConfig.scale})`,
            transformOrigin: 'bottom left',
          }}
          className="fixed bottom-5 left-5 rounded-lg border border-white/10 bg-[#0b0f14]/82 px-3.5 py-2"
        >
          <div className="mb-1 flex items-baseline justify-between gap-6">
            <span className="font-mono text-2xl font-bold tabular-nums leading-none text-white">
              {hud.hp}
            </span>
            <span className="text-xs font-medium text-[#94a3b8]">{stanceLabel}</span>
          </div>
          <div className="h-2 w-52 overflow-hidden rounded-full bg-white/15">
            <div
              className={`h-full transition-[width] duration-100 ${
                hpPercent > 40 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Desktop Bottom-Center: 7-Weapon Strip */}
      {!isMobileHud && hudConfig.showWeaponStrip && (
        <div
          style={hudOpacityStyle}
          className="pointer-events-auto fixed bottom-5 left-1/2 flex max-w-[96vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#0b0f14]/82 p-1"
        >
          {WEAPON_SPECS.map((w, idx) => {
            const active = idx === hud.weaponIdx;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onSelectWeapon(idx)}
                className={`min-h-[34px] shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
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
      )}

      {/* Desktop Bottom-Right: Frag Grenade + Ammo + Reload Stage */}
      {!isMobileHud && (
        <div
          style={{
            ...hudOpacityStyle,
            transform: `scale(${hudConfig.scale})`,
            transformOrigin: 'bottom right',
          }}
          className="fixed bottom-5 right-5 flex items-end gap-2"
        >
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

          <div className="min-w-[126px] rounded-lg border border-white/10 bg-[#0b0f14]/82 px-4 py-2.5 text-right">
            {hud.reloading ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold text-[#94a3b8]">
                    {hud.emptyReload ? 'DRY' : 'TAC'}
                  </span>
                  <span className="font-display text-xs font-bold text-amber-400">
                    {hud.reloadStageLabel || 'Reloading'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full ${hud.emptyReload ? 'bg-amber-500' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span
                    className={`font-mono text-3xl font-bold tabular-nums leading-none ${
                      isEmpty ? 'text-red-400' : isLowAmmo ? 'text-amber-400' : 'text-white'
                    }`}
                  >
                    {hud.ammo}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-[#94a3b8]">/ {hud.mag}</span>
                </div>
                <div className="mt-0.5 text-xs font-medium text-[#cbd5e1]">{hud.weaponName}</div>
              </div>
            )}
          </div>
        </div>
      )}

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
