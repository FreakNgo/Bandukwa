import { useState } from 'react';
import { Bot, Check, Copy, LogOut, Maximize2, Minimize2, Play, Settings, Users } from 'lucide-react';
import type { LobbyTab } from '../types/game';

interface LobbyModalProps {
  open: boolean;
  started: boolean;
  callsign: string;
  botCount: number;
  peerCount: number;
  maxPlayers: number;
  roomCode: string | null;
  isHostRoom: boolean;
  p2pStatus: string;
  mapReady: boolean;
  weaponsReady: boolean;
  isFullscreen: boolean;
  onCallsignChange: (name: string) => void;
  onStartMatch: () => void;
  onOpenSettings: () => void;
  onToggleFullscreen: () => void;
  onHostRoom: () => Promise<string>;
  onJoinRoom: (code: string) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

export function LobbyModal({
  open,
  started,
  callsign,
  botCount,
  peerCount,
  maxPlayers,
  roomCode,
  isHostRoom,
  p2pStatus,
  mapReady,
  weaponsReady,
  isFullscreen,
  onCallsignChange,
  onStartMatch,
  onOpenSettings,
  onToggleFullscreen,
  onHostRoom,
  onJoinRoom,
  onLeaveRoom,
}: LobbyModalProps) {
  const [tab, setTab] = useState<LobbyTab>('solo');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [localError, setLocalError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const copyRoomCode = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      setLocalError('Clipboard blocked — copy the 5-digit code manually.');
    }
  };

  const handleHostMatch = async () => {
    setLocalError('');
    setBusy(true);
    try {
      await onHostRoom();
      onStartMatch();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not create room.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinMatch = async () => {
    const clean = joinCodeInput.replace(/\D/g, '').slice(0, 5);
    if (clean.length !== 5) {
      setLocalError('Enter the 5-digit room code from the host.');
      return;
    }
    setLocalError('');
    setBusy(true);
    try {
      await onJoinRoom(clean);
      onStartMatch();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not join room.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setLocalError('');
    setBusy(true);
    try {
      await onLeaveRoom();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#06090d]/78 p-4">
      <div className="w-full max-w-[540px] rounded-xl border border-white/12 bg-[#111720] p-6 text-[#eef2f6] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wider text-white">
              BANDUKWA <span className="text-amber-500">ARENA</span>
            </h1>
            <p className="mt-0.5 text-xs text-[#94a3b8]">
              Desert Compound · 7 Weapons &amp; Frag Grenades · Up to 4 Players
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#18212d] px-3 py-2 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#18212d] px-3 py-2 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
            >
              <Settings className="h-3.5 w-3.5 text-amber-400" />
              Settings
            </button>
          </div>
        </div>

        {/* Callsign & Primary Deploy CTA */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label htmlFor="callsign-input" className="mb-1 block text-xs font-medium text-[#94a3b8]">
              Callsign
            </label>
            <input
              id="callsign-input"
              maxLength={14}
              value={callsign}
              onChange={(e) => onCallsignChange(e.target.value)}
              placeholder="Operator"
              className="w-full rounded-lg border border-white/12 bg-[#0b0f14] px-3.5 py-2.5 text-sm font-medium text-white outline-none transition-colors focus:border-amber-500"
            />
          </div>
          <div className="sm:pt-5">
            <button
              type="button"
              onClick={onStartMatch}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap sm:w-auto"
            >
              <Play className="h-4 w-4 fill-current" />
              {started ? 'Resume Match' : 'Deploy Now'}
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-[#0b0f14] p-1">
          <button
            type="button"
            onClick={() => setTab('solo')}
            className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'solo'
                ? 'bg-[#1c2532] text-white'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            Solo vs Bots
          </button>
          <button
            type="button"
            onClick={() => setTab('host')}
            className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'host'
                ? 'bg-[#1c2532] text-white'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            Host P2P
          </button>
          <button
            type="button"
            onClick={() => setTab('join')}
            className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'join'
                ? 'bg-[#1c2532] text-white'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            Join P2P
          </button>
        </div>

        {/* Mode Content */}
        {tab === 'solo' && (
          <div className="mt-4 rounded-lg border border-white/10 bg-[#0d1219] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Bot className="h-4 w-4 text-amber-400" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {botCount > 0 ? `${botCount} Active Arena Bot${botCount === 1 ? '' : 's'}` : 'Free Roam Practice'}
                  </div>
                  <div className="text-xs text-[#94a3b8]">
                    Adjust bot count or sensitivity anytime in Quick Settings
                  </div>
                </div>
              </div>
              <span className="font-mono text-xs text-[#cbd5e1] whitespace-nowrap">
                {mapReady && weaponsReady ? 'Assets Ready' : 'Loading Arena…'}
              </span>
            </div>
          </div>
        )}

        {tab === 'host' && (
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-[#0d1219] p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-[#94a3b8]">
              <span>Create a 5-digit room code for up to {maxPlayers} players. Code stays visible on top of the game.</span>
              <span className="flex items-center gap-1 font-mono tabular-nums text-amber-400 whitespace-nowrap">
                <Users className="h-3.5 w-3.5" />
                {roomCode ? `${peerCount + 1}/${maxPlayers}` : `0/${maxPlayers}`}
              </span>
            </div>

            {roomCode && isHostRoom ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-amber-500/35 bg-[#090c10] px-4 py-3">
                  <div>
                    <div className="text-[11px] font-medium text-[#94a3b8]">Active Room Code</div>
                    <div className="font-mono text-3xl font-bold tracking-[0.24em] tabular-nums text-amber-400">
                      {roomCode}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyRoomCode(roomCode)}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#18212d] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-amber-500/60 whitespace-nowrap"
                    >
                      {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedCode ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleLeave}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-950/60 whitespace-nowrap"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleHostMatch}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-300 transition-colors hover:bg-amber-500 hover:text-slate-950 disabled:opacity-50"
              >
                <Users className="h-4 w-4" />
                {busy ? 'Creating Room…' : 'Host 4-Player Match & Get Code'}
              </button>
            )}
          </div>
        )}

        {tab === 'join' && (
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-[#0d1219] p-4">
            <div className="flex items-center justify-between text-xs text-[#94a3b8]">
              <span>Enter the 5-digit code shown on the host&apos;s screen to enter their match.</span>
              <span className="font-mono tabular-nums text-amber-400 whitespace-nowrap">Max {maxPlayers}P</span>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && joinCodeInput.length === 5 && !busy) {
                    void handleJoinMatch();
                  }
                }}
                placeholder="5-digit code"
                className="min-h-[48px] flex-1 rounded-lg border border-white/12 bg-[#090c10] px-4 py-2 text-center font-mono text-2xl font-bold tracking-[0.28em] tabular-nums text-white outline-none transition-colors placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#64748b] focus:border-amber-500"
              />
              <button
                type="button"
                disabled={busy || joinCodeInput.length !== 5}
                onClick={handleJoinMatch}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-45 whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current" />
                {busy ? 'Joining…' : 'Join Match'}
              </button>
            </div>
          </div>
        )}

        {(localError || p2pStatus) && (
          <div className={`mt-3 text-xs ${localError ? 'text-red-400' : 'text-amber-400'}`}>
            {localError || p2pStatus}
          </div>
        )}

        {/* Controls Footer */}
        <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-[#64748b]">
          Desktop: WASD move · Shift sprint · Ctrl/C crouch or slide while running · Space jump · Click shoot · Right-click ADS · R reload · G frag grenade · 1–7 weapons · Tab scores · Esc pause
        </div>
      </div>
    </div>
  );
}
