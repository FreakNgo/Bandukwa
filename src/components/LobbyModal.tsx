import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LogOut,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Send,
  Settings,
  Shield,
  Signal,
  User,
  Users,
  X,
} from 'lucide-react';
import breacherImg from '../assets/images/lowpoly_breacher_1795093944844.jpg';
import nomadImg from '../assets/images/lowpoly_nomad_1795093944243.jpg';
import specterImg from '../assets/images/lowpoly_specter_1795093945059.jpg';
import vanguardImg from '../assets/images/lowpoly_vanguard_1795093944743.jpg';
import type { LobbyChatItem, LobbyMember, LobbyTab } from '../types/game';

export interface OperatorPreset {
  id: number;
  title: string;
  specialty: string;
  image: string;
  accentHex: string;
  bgGradient: string;
}

export const OPERATOR_PRESETS: OperatorPreset[] = [
  {
    id: 0,
    title: 'VANGUARD',
    specialty: 'ASSAULT · AK-47',
    image: vanguardImg,
    accentHex: '#f59e0b',
    bgGradient: 'from-amber-950/90 via-[#121923] to-[#080d14]',
  },
  {
    id: 1,
    title: 'SPECTER',
    specialty: 'RECON · MP5',
    image: specterImg,
    accentHex: '#22d3ee',
    bgGradient: 'from-cyan-950/90 via-[#0d1c26] to-[#080d14]',
  },
  {
    id: 2,
    title: 'BREACHER',
    specialty: 'HEAVY · SCAR-H',
    image: breacherImg,
    accentHex: '#ef4444',
    bgGradient: 'from-red-950/90 via-[#1d1216] to-[#080d14]',
  },
  {
    id: 3,
    title: 'NOMAD',
    specialty: 'MARKSMAN · DEAGLE',
    image: nomadImg,
    accentHex: '#34d399',
    bgGradient: 'from-emerald-950/90 via-[#0f1d1c] to-[#080d14]',
  },
];

interface LobbyModalProps {
  open: boolean;
  started: boolean;
  profileConfirmed: boolean;
  callsign: string;
  cardId: number;
  ready: boolean;
  botCount: number;
  peerCount: number;
  maxPlayers: number;
  roomCode: string | null;
  isHostRoom: boolean;
  pingMs: number | null;
  netMode: 'solo' | 'p2p' | 'relay';
  p2pStatus: string;
  mapReady: boolean;
  weaponsReady: boolean;
  isFullscreen: boolean;
  squadMembers: LobbyMember[];
  chatMessages: LobbyChatItem[];
  onCallsignChange: (name: string) => void;
  onCardChange: (cardId: number) => void;
  onConfirmProfile: () => void;
  onEditProfile: () => void;
  onToggleReady: () => void;
  onBotCountChange: (count: number) => void;
  onStartMatch: () => void;
  onLaunchSquadMatch: () => void;
  onSendChat: (text: string) => void;
  onOpenSettings: () => void;
  onToggleFullscreen: () => void;
  onHostRoom: () => Promise<string>;
  onJoinRoom: (code: string) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

const BOT_CALLSIGNS = ['ALPHA BOT', 'BRAVO BOT', 'CHARLIE BOT'];

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LobbyModal({
  open,
  started,
  profileConfirmed,
  callsign,
  cardId,
  ready,
  botCount,
  peerCount,
  maxPlayers,
  roomCode,
  isHostRoom,
  pingMs,
  netMode,
  p2pStatus,
  mapReady,
  weaponsReady,
  isFullscreen,
  squadMembers,
  chatMessages,
  onCallsignChange,
  onCardChange,
  onConfirmProfile,
  onEditProfile,
  onToggleReady,
  onBotCountChange,
  onStartMatch,
  onLaunchSquadMatch,
  onSendChat,
  onOpenSettings,
  onToggleFullscreen,
  onHostRoom,
  onJoinRoom,
  onLeaveRoom,
}: LobbyModalProps) {
  const [tab, setTab] = useState<LobbyTab>('solo');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [localError, setLocalError] = useState('');
  const [nameError, setNameError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !roomCode) {
      setWaitSeconds(0);
      return;
    }
    const id = window.setInterval(() => setWaitSeconds((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [open, roomCode]);

  useEffect(() => {
    if (roomCode) {
      setTab(isHostRoom ? 'host' : 'join');
    }
  }, [roomCode, isHostRoom]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  if (!open) return null;

  const submitProfile = () => {
    const clean = callsign.trim();
    if (!clean) {
      setNameError('Enter a username before entering the lobby.');
      return;
    }
    setNameError('');
    onCallsignChange(clean.slice(0, 14));
    onConfirmProfile();
  };

  if (!profileConfirmed) {
    const selectedPreset =
      OPERATOR_PRESETS[Math.abs(cardId) % OPERATOR_PRESETS.length] ?? OPERATOR_PRESETS[0];

    return (
      <div
        className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-[#07111a]/92 via-[#091823]/88 to-[#050b11]/95 text-[#eef2f6] backdrop-blur-[4px]"
        role="dialog"
        aria-label="Operator Identity Setup"
      >
        {/* Top Bar */}
        <header className="mx-auto flex w-full max-w-[1280px] shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-8 sm:py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 rotate-45 items-center justify-center border border-amber-400/60 bg-[#0d1924] sm:h-8 sm:w-8">
              <Shield className="h-3.5 w-3.5 -rotate-45 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-sm font-bold tracking-[0.14em] text-white sm:text-xl">
                BANDUKWA ARENA
              </h1>
              <p className="truncate font-mono text-[9px] tracking-[0.12em] text-[#94a3b8] sm:text-[10px]">
                {mapReady && weaponsReady ? 'ARENA READY · 4-PLAYER SQUAD' : 'LOADING 3D ASSETS…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 sm:gap-2">
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="flex min-h-[38px] min-w-[38px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#0d1722] px-2.5 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap shrink-0 sm:px-3"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="hidden md:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              title="Settings"
              className="flex min-h-[38px] min-w-[38px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#0d1722] px-2.5 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap shrink-0 sm:px-3"
            >
              <Settings className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </header>

        {/* Scrollable Center Content: Username Input + 4 Low-Poly Banner Picker */}
        <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col items-center justify-start overflow-y-auto px-3 py-2.5 sm:justify-center sm:px-6 sm:py-5 [@media(max-height:520px)]:justify-center [@media(max-height:520px)]:py-1.5">
          <div className="mb-2.5 text-center sm:mb-4 [@media(max-height:520px)]:mb-1.5">
            <h2 className="font-display text-lg font-bold tracking-[0.12em] text-white sm:text-3xl [@media(max-height:520px)]:text-base">
              ENTER USERNAME &amp; CHOOSE BANNER
            </h2>
            <p className="mt-0.5 text-[11px] text-[#94a3b8] sm:text-sm [@media(max-height:520px)]:hidden">
              Pick your low-poly operator card to deploy into Solo or 4-player Squad lobbies.
            </p>
          </div>

          {/* Username Input Row */}
          <div className="mb-3 w-full max-w-[420px] sm:mb-5 [@media(max-height:520px)]:mb-2">
            <label
              htmlFor="operator-username-input"
              className="mb-1 hidden items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-[#cbd5e1] sm:flex [@media(max-height:520px)]:hidden"
            >
              <User className="h-3.5 w-3.5 text-amber-400" />
              USERNAME
            </label>
            <input
              id="operator-username-input"
              type="text"
              maxLength={14}
              value={callsign}
              onChange={(e) => {
                setNameError('');
                onCallsignChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitProfile();
              }}
              placeholder="Enter your username (e.g. Ghost)"
              className="min-h-[42px] w-full rounded-md border border-white/20 bg-[#070f17]/95 px-3.5 py-2 text-center text-base font-bold tracking-wide text-white outline-none placeholder:text-sm placeholder:font-normal placeholder:text-[#64748b] focus:border-amber-400 sm:min-h-[46px]"
            />
            {nameError && (
              <p className="mt-1 text-center font-mono text-[11px] text-red-400">{nameError}</p>
            )}
          </div>

          {/* 4 Low-Poly Character Banner Choices (2x2 on Portrait, 4-across on Landscape & Desktop) */}
          <div className="grid w-full max-w-[1000px] grid-cols-2 gap-2.5 [@media(max-height:520px)]:grid-cols-4 [@media(max-height:520px)]:gap-2 sm:gap-4 lg:grid-cols-4">
            {OPERATOR_PRESETS.map((preset) => {
              const selected = preset.id === selectedPreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onCardChange(preset.id)}
                  className="group relative flex h-[146px] min-[400px]:h-[168px] flex-col text-left transition-transform duration-150 focus:outline-none [@media(max-height:520px)]:h-[144px] md:h-[260px] lg:h-[320px]"
                  style={{
                    transform: selected ? 'translateY(-3px)' : undefined,
                  }}
                >
                  <div
                    className={`relative flex-1 overflow-hidden border transition-all ${
                      selected
                        ? 'border-amber-400 shadow-[0_0_26px_rgba(245,158,11,0.28)]'
                        : 'border-white/18 opacity-85 hover:border-cyan-400/60 hover:opacity-100'
                    } bg-gradient-to-b ${preset.bgGradient}`}
                    style={{
                      clipPath: 'polygon(0 0, 100% 0, 100% 88%, 50% 100%, 0 88%)',
                    }}
                  >
                    <img
                      src={preset.image}
                      alt={`${preset.title} low-poly operator`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050a0f] via-[#050a0f]/25 to-transparent" />

                    {selected && (
                      <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-sm bg-amber-400 text-slate-950 shadow sm:h-6 sm:w-6">
                        <Check className="h-3.5 w-3.5 stroke-[3] sm:h-4 sm:w-4" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-5 flex flex-col items-center px-1.5 text-center sm:bottom-9 [@media(max-height:520px)]:bottom-4">
                      <div
                        className={`w-full max-w-[92%] truncate px-2 py-0.5 text-[11px] font-extrabold tracking-widest shadow sm:py-1 sm:text-sm ${
                          selected
                            ? 'bg-[#eef2f6] text-[#090d14]'
                            : 'border border-white/20 bg-[#0b1622]/90 text-white'
                        }`}
                      >
                        {preset.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[8px] font-semibold tracking-[0.12em] text-[#cbd5e1] sm:mt-1 sm:text-[10px]">
                        {preset.specialty}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Diamond Crest */}
                  <div className="pointer-events-none -mt-2.5 flex justify-center sm:-mt-3">
                    <div
                      className="flex h-4 w-4 rotate-45 items-center justify-center border border-white/30 bg-[#0d1926] shadow-md sm:h-6 sm:w-6"
                      style={{ borderColor: selected ? preset.accentHex : undefined }}
                    >
                      <span
                        className="h-2 w-2 sm:h-2.5 sm:w-2.5"
                        style={{ backgroundColor: preset.accentHex }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        {/* Pinned Bottom CTA Footer */}
        <footer className="mx-auto flex w-full max-w-[1280px] shrink-0 flex-col items-center justify-center gap-1 border-t border-white/10 bg-[#060d15]/95 px-4 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:gap-2 sm:px-8 sm:py-3.5 [@media(max-height:520px)]:py-2">
          <button
            type="button"
            onClick={submitProfile}
            className="flex min-h-[44px] w-full max-w-[320px] items-center justify-center gap-2 rounded-sm border border-amber-300/60 bg-amber-500 px-6 py-2.5 font-display text-sm font-bold tracking-[0.16em] text-slate-950 shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98] whitespace-nowrap sm:min-h-[48px] sm:w-auto sm:min-w-[260px] sm:text-base"
          >
            <Play className="h-4 w-4 fill-current" />
            CONTINUE TO LOBBY
          </button>
          <span className="font-mono text-[10px] text-[#94a3b8] sm:text-[11px] [@media(max-height:520px)]:hidden">
            Playing as <span className="font-semibold text-white">{callsign.trim() || '—'}</span> ·{' '}
            <span className="text-amber-300">{selectedPreset.title}</span>
          </span>
        </footer>
      </div>
    );
  }

  const myPreset = OPERATOR_PRESETS[cardId % OPERATOR_PRESETS.length] ?? OPERATOR_PRESETS[0];

  const copyRoomCode = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      setLocalError('Clipboard blocked — share the 5-digit code shown above.');
    }
  };

  const handleHostLobby = async () => {
    setLocalError('');
    setBusy(true);
    try {
      await onHostRoom();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not create squad room.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinLobby = async () => {
    const clean = joinCodeInput.replace(/\D/g, '').slice(0, 5);
    if (clean.length !== 5) {
      setLocalError('Enter the 5-digit squad code from the host.');
      return;
    }
    setLocalError('');
    setBusy(true);
    try {
      await onJoinRoom(clean);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not join squad.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setLocalError('');
    setBusy(true);
    try {
      await onLeaveRoom();
      setTab('solo');
    } finally {
      setBusy(false);
    }
  };

  const submitChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatInput('');
  };

  // Build exact 4-slot party roster
  const slots: Array<LobbyMember | null> = [null, null, null, null];
  if (roomCode) {
    squadMembers.slice(0, maxPlayers).forEach((m, i) => {
      slots[i] = m;
    });
  } else {
    slots[0] = {
      id: 0,
      name: callsign.trim() || 'Operator',
      cardId,
      ready: true,
      inGame: started,
      isHost: true,
      isMe: true,
    };
    const safeBots = Math.max(0, Math.min(3, botCount));
    for (let i = 0; i < safeBots; i++) {
      slots[i + 1] = {
        id: -(i + 1),
        name: BOT_CALLSIGNS[i] ?? `BOT ${i + 1}`,
        cardId: (cardId + i + 1) % OPERATOR_PRESETS.length,
        ready: true,
        inGame: started,
        isHost: false,
        isMe: false,
        isBot: true,
      };
    }
  }

  const hostMember = squadMembers.find((m) => m.isHost);
  const hostAlreadyInGame = Boolean(hostMember?.inGame);
  const connectedTotal = roomCode ? Math.max(squadMembers.length, peerCount + 1) : 1 + botCount;
  const readyCount = roomCode ? squadMembers.filter((m) => m.ready).length : 1 + botCount;
  const allReady = roomCode ? squadMembers.length > 0 && readyCount === squadMembers.length : true;

  const modeHeadline = roomCode
    ? isHostRoom
      ? 'CUSTOM SQUAD · HOST'
      : 'CUSTOM SQUAD · PARTY'
    : tab === 'solo'
      ? 'SOLO SKIRMISH'
      : tab === 'host'
        ? 'HOST SQUAD'
        : 'JOIN SQUAD';

  return (
    <div
      className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-[#07111a]/88 via-[#091823]/84 to-[#050b11]/92 text-[#eef2f6] backdrop-blur-[3px]"
      role="dialog"
      aria-label="Squad Match Lobby"
    >
      {/* Top 3-Zone Header Bar (Mode & Tabs — Queue / Code Diamond — Profile & Settings) */}
      <header className="relative mx-auto flex w-full max-w-[1380px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:gap-3 sm:px-8 sm:py-3.5 [@media(max-height:520px)]:py-1.5">
        {/* Zone 1: Mode Title & Mode Selector */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            {roomCode && (
              <button
                type="button"
                disabled={busy}
                onClick={handleLeave}
                title="Leave Squad"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/5 text-[#cbd5e1] transition-colors hover:border-red-400/60 hover:bg-red-950/40 hover:text-white sm:h-9 sm:w-9"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <h1 className="font-display text-sm font-bold tracking-[0.12em] text-white whitespace-nowrap shrink-0 sm:text-xl">
              {modeHeadline}
            </h1>
          </div>

          {!roomCode && (
            <div className="flex items-center gap-1 rounded-md border border-white/12 bg-[#070d14]/90 p-0.5 sm:p-1">
              {(
                [
                  ['solo', 'Solo'],
                  ['host', 'Host Lobby'],
                  ['join', 'Join Code'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setLocalError('');
                    setTab(id);
                  }}
                  className={`min-h-[32px] rounded px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors whitespace-nowrap shrink-0 sm:min-h-[34px] sm:px-3 sm:text-xs ${
                    tab === id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zone 2: Center Match Status / Room Code & Timer */}
        <div className="order-3 flex w-full items-center justify-center sm:order-2 sm:w-auto [@media(max-height:520px)]:order-2 [@media(max-height:520px)]:w-auto">
          {roomCode ? (
            <div className="flex items-center gap-2.5 rounded-md border border-amber-500/30 bg-[#08121c]/80 px-3 py-1 sm:border-none sm:bg-transparent sm:p-0">
              <div className="hidden h-8 w-8 rotate-45 items-center justify-center border border-amber-400/60 bg-[#0d1924] sm:flex">
                <Users className="h-4 w-4 -rotate-45 text-amber-400" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold tracking-[0.2em] tabular-nums text-white leading-none sm:text-2xl">
                    {roomCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyRoomCode(roomCode)}
                    title="Copy 5-digit squad code"
                    className="flex h-7 w-7 items-center justify-center rounded border border-white/15 bg-white/5 text-[#cbd5e1] transition-colors hover:border-amber-400/60 hover:text-white"
                  >
                    {copiedCode ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span className="font-mono text-[10px] tabular-nums text-[#94a3b8] sm:hidden">
                    {connectedTotal}/{maxPlayers}
                    {pingMs !== null ? ` · ${pingMs}ms` : ''}
                  </span>
                </div>
                <div className="mt-0.5 hidden items-center gap-2 font-mono text-[11px] tabular-nums text-[#94a3b8] sm:flex">
                  <span>{formatElapsed(waitSeconds)}</span>
                  <span aria-hidden="true">·</span>
                  <span className={allReady ? 'text-emerald-400' : 'text-amber-300'}>
                    {connectedTotal}/{maxPlayers} CONNECTED
                  </span>
                  {pingMs !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className={pingMs <= 50 ? 'text-emerald-400' : 'text-amber-400'}>
                        {pingMs}ms {netMode === 'p2p' ? 'P2P' : 'RELAY'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden items-center gap-2.5 md:flex">
              <div className="flex h-7 w-7 rotate-45 items-center justify-center border border-white/25 bg-[#0c1620]">
                <Shield className="h-3.5 w-3.5 -rotate-45 text-amber-400" />
              </div>
              <div className="text-left">
                <div className="font-display text-xs font-bold tracking-[0.14em] text-white sm:text-sm">
                  DESERT COMPOUND
                </div>
                <div className="font-mono text-[10px] text-[#94a3b8]">
                  {mapReady && weaponsReady ? 'ARENA READY · 7 WEAPONS' : 'LOADING 3D ASSETS…'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zone 3: Player Profile Chip + Fullscreen + Settings */}
        <div className="order-2 flex items-center gap-1.5 shrink-0 sm:order-3 sm:gap-2">
          <button
            type="button"
            onClick={onEditProfile}
            title="Change username or low-poly banner"
            className="flex items-center gap-1.5 rounded-md border border-white/15 bg-[#0b1520]/90 p-1 pr-2 text-left transition-colors hover:border-amber-400/60 sm:gap-2 sm:pr-2.5"
          >
            <img
              src={myPreset.image}
              alt={myPreset.title}
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-sm object-cover object-top sm:h-8 sm:w-8"
            />
            <div>
              <div className="max-w-[72px] truncate text-[11px] font-bold text-white leading-tight sm:max-w-[105px] sm:text-xs">
                {callsign.trim() || 'Operator'}
              </div>
              <div className="font-mono text-[9px] text-amber-300 leading-tight sm:text-[10px]">
                {myPreset.title}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#0d1722] px-2 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap shrink-0 sm:min-h-[40px] sm:px-3"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span className="hidden md:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#0d1722] px-2 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap shrink-0 sm:min-h-[40px] sm:px-3"
          >
            <Settings className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Center Stage: 4 Vertical Operator Banner Cards (matching Valorant Squad Screen) */}
      <main className="mx-auto flex w-full max-w-[1160px] flex-1 flex-col items-center justify-start overflow-y-auto px-3 py-2.5 sm:justify-center sm:px-6 sm:py-5 [@media(max-height:520px)]:justify-center [@media(max-height:520px)]:py-1.5">
        {/* Callsign + Room Setup Strip when NOT yet in a P2P room and on Join tab */}
        {!roomCode && tab === 'join' && (
          <div className="mb-3 flex w-full max-w-[540px] flex-row items-center gap-2 rounded-lg border border-amber-500/35 bg-[#0a131d]/92 p-2.5 sm:mb-5 sm:p-3.5 [@media(max-height:520px)]:mb-2">
            <input
              ref={joinInputRef}
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && joinCodeInput.length === 5 && !busy) {
                  void handleJoinLobby();
                }
              }}
              placeholder="5-digit Host Code"
              className="min-h-[42px] min-w-0 flex-1 rounded-md border border-white/15 bg-[#060c12] px-3 py-2 text-center font-mono text-base font-bold tracking-[0.2em] tabular-nums text-white outline-none placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#64748b] focus:border-amber-400 sm:min-h-[44px] sm:text-xl sm:tracking-[0.26em]"
            />
            <button
              type="button"
              disabled={busy || joinCodeInput.length !== 5}
              onClick={handleJoinLobby}
              className="flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-xs font-bold tracking-wider text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-45 whitespace-nowrap sm:min-h-[44px] sm:px-6"
            >
              <Users className="h-4 w-4" />
              {busy ? 'CONNECTING…' : 'JOIN'}
            </button>
          </div>
        )}

        {/* 4 Squad Cards Grid (2x2 on Portrait, 4-across on Landscape Mobile & Desktop) */}
        <div className="grid w-full max-w-[1040px] grid-cols-2 gap-2.5 [@media(max-height:520px)]:grid-cols-4 [@media(max-height:520px)]:gap-2 sm:gap-5 lg:grid-cols-4">
          {slots.map((member, slotIdx) => {
            if (!member) {
              const emptyAction = () => {
                if (roomCode) {
                  void copyRoomCode(roomCode);
                } else if (tab === 'solo') {
                  onBotCountChange(Math.min(3, botCount + 1));
                } else if (tab === 'host') {
                  void handleHostLobby();
                } else {
                  joinInputRef.current?.focus();
                }
              };
              const emptyLabel = roomCode
                ? copiedCode
                  ? 'CODE COPIED'
                  : 'INVITE · COPY CODE'
                : tab === 'solo'
                  ? 'ADD BOT'
                  : tab === 'host'
                    ? 'HOST TO FILL'
                    : 'OPEN SLOT';

              return (
                <button
                  key={`empty-${slotIdx}`}
                  type="button"
                  onClick={emptyAction}
                  className="group relative flex h-[148px] min-[400px]:h-[172px] flex-col items-center justify-center overflow-hidden rounded-sm border border-white/12 bg-gradient-to-b from-[#0f1d2a]/55 via-[#0a141e]/45 to-transparent p-3 transition-all hover:border-cyan-400/50 hover:bg-[#112333]/60 [@media(max-height:520px)]:h-[150px] md:h-[265px] lg:h-[335px]"
                  style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% 89%, 50% 100%, 0 89%)',
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'radial-gradient(rgba(148,163,184,0.35) 1px, transparent 1px)',
                      backgroundSize: '14px 14px',
                    }}
                  />
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[#cbd5e1] transition-transform group-hover:scale-110 group-hover:border-cyan-400/70 group-hover:text-white sm:h-12 sm:w-12">
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <span className="relative mt-2 font-mono text-[9px] font-semibold tracking-[0.14em] text-[#94a3b8] group-hover:text-cyan-300 sm:mt-3 sm:text-[10px]">
                    {emptyLabel}
                  </span>
                </button>
              );
            }

            const preset =
              OPERATOR_PRESETS[Math.abs(member.cardId) % OPERATOR_PRESETS.length] ??
              OPERATOR_PRESETS[0];

            const statusText = member.inGame
              ? 'IN MATCH'
              : member.ready
                ? 'READY'
                : 'STAND BY';

            const statusColor = member.inGame
              ? 'text-amber-300'
              : member.ready
                ? 'text-emerald-300'
                : 'text-[#94a3b8]';

            return (
              <div
                key={`slot-${slotIdx}-${member.id}`}
                className="group relative flex h-[148px] min-[400px]:h-[172px] flex-col justify-between [@media(max-height:520px)]:h-[150px] md:h-[265px] lg:h-[335px]"
              >
                {/* Top Cap Bar with Signal & Host/Ping */}
                <div className="mb-1 flex items-center justify-between px-1 font-mono text-[10px] tabular-nums text-[#cbd5e1]">
                  <span className="font-semibold tracking-wider text-white/80">
                    {member.isBot
                      ? 'AI UNIT'
                      : member.isHost
                        ? 'SQUAD LEAD'
                        : `PEER #${member.id}`}
                  </span>
                  <div className="flex items-center gap-1">
                    {member.isMe && pingMs !== null && roomCode && (
                      <span className={pingMs <= 50 ? 'text-emerald-400' : 'text-amber-400'}>
                        {pingMs}ms
                      </span>
                    )}
                    <Signal
                      className={`h-3 w-3 ${
                        member.isBot
                          ? 'text-slate-400'
                          : pingMs !== null && pingMs > 100
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Angled Operator Banner Body */}
                <div
                  className={`relative flex-1 overflow-hidden border transition-all ${
                    member.isMe
                      ? 'border-amber-400/75 shadow-[0_0_28px_rgba(245,158,11,0.16)]'
                      : member.ready
                        ? 'border-cyan-400/45'
                        : 'border-white/20'
                  } bg-gradient-to-b ${preset.bgGradient}`}
                  style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% 88%, 50% 100%, 0 88%)',
                  }}
                >
                  {/* Full-bleed Character Portrait */}
                  <img
                    src={preset.image}
                    alt={`${member.name} — ${preset.title}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                  />

                  {/* Scrim for high-contrast nameplate legibility */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050a0f] via-[#050a0f]/25 to-transparent" />

                  {/* Cycle Operator Card arrows on player's own banner OR Remove button on Bot card */}
                  {member.isMe && (
                    <div className="absolute inset-x-2 top-2.5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          onCardChange(
                            (cardId + OPERATOR_PRESETS.length - 1) % OPERATOR_PRESETS.length,
                          )
                        }
                        title="Previous operator card"
                        className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/25 bg-[#070e16]/80 text-white hover:border-amber-400"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onCardChange((cardId + 1) % OPERATOR_PRESETS.length)
                        }
                        title="Next operator card"
                        className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/25 bg-[#070e16]/80 text-white hover:border-amber-400"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {member.isBot && !roomCode && (
                    <button
                      type="button"
                      onClick={() => onBotCountChange(Math.max(0, botCount - 1))}
                      title="Remove bot"
                      className="absolute right-2 top-2.5 flex h-7 w-7 items-center justify-center rounded-sm border border-white/25 bg-[#070e16]/80 text-[#cbd5e1] hover:border-red-400 hover:text-red-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Lower Ready Badge + Nameplate + Specialty */}
                  <div className="absolute inset-x-0 bottom-4 flex flex-col items-center px-1.5 text-center sm:bottom-9 [@media(max-height:520px)]:bottom-4">
                    <div className={`mb-0.5 font-mono text-[9px] font-bold tracking-[0.16em] sm:mb-1 sm:text-[10px] ${statusColor}`}>
                      {statusText}
                    </div>

                    <div
                      className={`w-full max-w-[92%] truncate px-2 py-0.5 text-[11px] font-extrabold tracking-wide shadow sm:py-1 sm:text-sm ${
                        member.isMe
                          ? 'bg-[#eef2f6] text-[#090d14]'
                          : 'border border-white/20 bg-[#0b1622]/92 text-white'
                      }`}
                    >
                      {member.name}
                    </div>

                    <div className="mt-0.5 font-mono text-[8px] font-semibold tracking-[0.12em] text-[#cbd5e1] sm:mt-1 sm:text-[10px]">
                      {preset.specialty}
                    </div>
                  </div>
                </div>

                {/* Bottom Crest Diamond */}
                <div className="pointer-events-none -mt-2.5 flex justify-center sm:-mt-3">
                  <div
                    className="flex h-4 w-4 rotate-45 items-center justify-center border border-white/30 bg-[#0d1926] shadow-md sm:h-6 sm:w-6"
                    style={{ borderColor: member.ready ? preset.accentHex : undefined }}
                  >
                    <span
                      className="h-2 w-2 sm:h-2.5 sm:w-2.5"
                      style={{ backgroundColor: preset.accentHex }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(localError || p2pStatus) && (
          <div
            className={`mt-2.5 text-center font-mono text-[11px] sm:mt-4 sm:text-xs ${
              localError ? 'text-red-400' : 'text-amber-300'
            }`}
          >
            {localError || p2pStatus}
          </div>
        )}
      </main>

      {/* Pinned Bottom Bar: Squad Chat (Left) — Primary PLAY / READY CTA (Center) — Leave/Controls (Right) */}
      <footer className="mx-auto grid w-full max-w-[1380px] shrink-0 grid-cols-1 items-end gap-2 border-t border-white/10 bg-[#060d15]/95 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:gap-3 sm:px-8 sm:py-3.5 lg:grid-cols-3 [@media(max-height:520px)]:py-1.5">
        {/* Bottom-Left: Real Interactive Squad Chat (compact on mobile) */}
        <div className="order-2 flex flex-col gap-1.5 lg:order-1">
          {roomCode && chatMessages.length > 0 && (
            <div
              ref={chatScrollRef}
              className="max-h-14 space-y-0.5 overflow-y-auto rounded border border-white/10 bg-[#060d14]/75 px-2 py-1 text-[11px] sm:max-h-20"
            >
              {chatMessages.map((c) => (
                <div key={c.id} className="leading-snug">
                  <span className={c.isSystem ? 'text-amber-400' : 'font-semibold text-cyan-300'}>
                    {c.sender}:{' '}
                  </span>
                  <span className="text-[#e2e8f0]">{c.text}</span>
                </div>
              ))}
            </div>
          )}

          {roomCode ? (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded border border-white/15 bg-[#070f17]/90 px-2.5 py-1">
                <input
                  type="text"
                  maxLength={90}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitChat();
                  }}
                  placeholder="Squad chat…"
                  className="w-full bg-transparent text-base text-white placeholder:text-xs placeholder:text-[#64748b] outline-none sm:text-xs"
                />
                <button
                  type="button"
                  onClick={submitChat}
                  title="Send message"
                  className="ml-1 p-1 text-[#94a3b8] hover:text-amber-400"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleLeave}
                className="flex min-h-[34px] items-center gap-1 rounded border border-red-500/35 bg-red-950/35 px-2.5 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-950/60 whitespace-nowrap shrink-0 lg:hidden"
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <span className="font-display text-sm font-bold tracking-[0.16em] text-amber-400 whitespace-nowrap">
                BANDUKWA ARENA
              </span>
              <span className="text-xs text-[#64748b]">· Tactical 3D Desert Compound</span>
            </div>
          )}
        </div>

        {/* Bottom-Center: Primary Valorant-style START / READY / CREATE SQUAD CTA */}
        <div className="order-1 flex flex-col items-center gap-1.5 lg:order-2">
          {!roomCode ? (
            tab === 'host' ? (
              <div className="flex w-full max-w-[340px] items-center justify-center gap-2 sm:w-auto">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleHostLobby}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-sm border border-amber-300/60 bg-amber-500 px-6 py-2.5 font-display text-sm font-bold tracking-[0.16em] text-slate-950 shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98] disabled:opacity-60 whitespace-nowrap sm:min-h-[48px] sm:min-w-[230px] sm:text-base"
                >
                  <Users className="h-4 w-4" />
                  {busy ? 'CREATING SQUAD…' : 'CREATE SQUAD ROOM'}
                </button>
                {busy && (
                  <button
                    type="button"
                    onClick={() => void handleLeave()}
                    className="min-h-[44px] rounded-sm border border-white/20 bg-white/10 px-3.5 text-xs font-bold text-white hover:bg-white/20 sm:min-h-[48px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : tab === 'join' ? (
              <div className="flex w-full max-w-[340px] items-center justify-center gap-2 sm:w-auto">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (joinCodeInput.length === 5) {
                      void handleJoinLobby();
                    } else {
                      joinInputRef.current?.focus();
                    }
                  }}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-sm border border-cyan-300/50 bg-cyan-500 px-6 py-2.5 font-display text-sm font-bold tracking-[0.16em] text-slate-950 shadow-lg transition-transform hover:bg-cyan-400 active:scale-[0.98] disabled:opacity-60 whitespace-nowrap sm:min-h-[48px] sm:min-w-[230px] sm:text-base"
                >
                  <Users className="h-4 w-4" />
                  {busy
                    ? 'JOINING SQUAD…'
                    : joinCodeInput.length === 5
                      ? `JOIN ROOM ${joinCodeInput}`
                      : 'ENTER 5-DIGIT CODE ABOVE'}
                </button>
                {busy && (
                  <button
                    type="button"
                    onClick={() => void handleLeave()}
                    className="min-h-[44px] rounded-sm border border-white/20 bg-white/10 px-3.5 text-xs font-bold text-white hover:bg-white/20 sm:min-h-[48px]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onStartMatch}
                className="flex min-h-[44px] w-full max-w-[340px] items-center justify-center gap-2 rounded-sm border border-amber-300/60 bg-amber-500 px-6 py-2.5 font-display text-sm font-bold tracking-[0.18em] text-slate-950 shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98] whitespace-nowrap sm:min-h-[48px] sm:w-auto sm:min-w-[230px] sm:text-base"
              >
                <Play className="h-4 w-4 fill-current" />
                {started ? 'RESUME MATCH' : 'START'}
              </button>
            )
          ) : isHostRoom ? (
            <div className="flex w-full flex-col items-center gap-1">
              <div className="font-mono text-[10px] tracking-wider text-[#94a3b8] sm:text-[11px] [@media(max-height:520px)]:hidden">
                {connectedTotal < 2
                  ? `SHARE CODE ${roomCode} · WAITING (${connectedTotal}/${maxPlayers})`
                  : `${readyCount}/${connectedTotal} READY IN LOBBY`}
              </div>
              <div className="flex w-full max-w-[380px] items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={onToggleReady}
                  className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-sm border px-3.5 py-2 font-display text-xs font-bold tracking-wider transition-colors whitespace-nowrap sm:min-h-[46px] sm:px-5 sm:text-sm ${
                    ready
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                      : 'border-white/20 bg-white/5 text-[#cbd5e1] hover:border-white/40'
                  }`}
                >
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {ready ? 'READY' : 'STAND BY'}
                </button>
                <button
                  type="button"
                  onClick={onLaunchSquadMatch}
                  className="flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-sm border border-amber-300/60 bg-amber-500 px-5 py-2 font-display text-sm font-bold tracking-[0.16em] text-slate-950 shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98] whitespace-nowrap sm:min-h-[46px] sm:min-w-[200px] sm:px-8 sm:text-base"
                >
                  <Play className="h-4 w-4 fill-current" />
                  {started ? 'RESUME MATCH' : 'PLAY MATCH'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-1">
              <div className="font-mono text-[10px] tracking-wider text-[#94a3b8] sm:text-[11px] [@media(max-height:520px)]:hidden">
                {hostAlreadyInGame
                  ? 'HOST IN ARENA · TAP DEPLOY TO JOIN'
                  : ready
                    ? 'WAITING FOR HOST TO CLICK PLAY MATCH…'
                    : 'TAP READY UP WHEN PREPARED'}
              </div>
              <div className="flex w-full max-w-[380px] items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={onToggleReady}
                  className={`flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-sm border px-4 py-2 font-display text-xs font-bold tracking-[0.14em] transition-colors whitespace-nowrap sm:min-h-[46px] sm:min-w-[160px] sm:px-6 sm:text-sm ${
                    ready
                      ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                      : 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  {ready ? 'READY ✓' : 'READY UP'}
                </button>

                {(hostAlreadyInGame || started) && (
                  <button
                    type="button"
                    onClick={onStartMatch}
                    className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-sm border border-amber-300/60 bg-amber-500 px-4 py-2 font-display text-xs font-bold tracking-[0.16em] text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap sm:min-h-[46px] sm:px-6 sm:text-sm"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {started ? 'RESUME' : 'DEPLOY NOW'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Right: Desktop Controls Summary & Leave Room */}
        <div className="order-3 hidden items-center justify-end gap-3 text-[11px] text-[#64748b] lg:flex">
          <span className="truncate">
            WASD move · Shift sprint · Ctrl/C slide · R reload · G frag · 1–7 guns
          </span>
          {roomCode && (
            <button
              type="button"
              disabled={busy}
              onClick={handleLeave}
              className="flex min-h-[34px] items-center gap-1.5 rounded border border-red-500/35 bg-red-950/35 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-950/60 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              Leave
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
