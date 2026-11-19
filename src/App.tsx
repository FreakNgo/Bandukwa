import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { LobbyModal } from './components/LobbyModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TouchControls } from './components/TouchControls';
import { BandukwaEngine } from './game/engine';
import {
  enterGameFullscreen,
  isFullscreenActive,
  lockGameKeyboard,
  toggleGameFullscreen,
  unlockGameKeyboard,
} from './game/fullscreen';
import {
  DEFAULT_HUD_CONFIG,
  DEFAULT_SETTINGS,
  type HudSnapshot,
  type LobbyChatItem,
  type LobbyMember,
  type SettingsState,
} from './types/game';

const SETTINGS_STORAGE_KEY = 'bandukwa_settings_v2';
const CALLSIGN_STORAGE_KEY = 'bandukwa_callsign_v1';
const CARD_STORAGE_KEY = 'bandukwa_card_v1';

function loadInitialSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        hudConfig: {
          ...DEFAULT_HUD_CONFIG,
          ...(parsed.hudConfig ?? {}),
          touchLayout: { ...(parsed.hudConfig?.touchLayout ?? {}) },
        },
      };
    }
  } catch {
    // ignore storage errors
  }
  return { ...DEFAULT_SETTINGS, hudConfig: { ...DEFAULT_HUD_CONFIG } };
}

function loadInitialCallsign(): string {
  try {
    return localStorage.getItem(CALLSIGN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function loadInitialCardId(): number {
  try {
    const n = Number(localStorage.getItem(CARD_STORAGE_KEY));
    return Number.isFinite(n) && n >= 0 && n <= 3 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  ammo: 30,
  mag: 30,
  weaponIdx: 0,
  weaponName: 'AK-47',
  reloading: false,
  reloadProgress: 0,
  reloadStageLabel: '',
  emptyReload: false,
  ads: false,
  crouching: false,
  sprinting: false,
  sliding: false,
  airborne: false,
  deadSeconds: 0,
  crosshairGap: 8,
  hitMarker: 'none',
  damageFlash: 0,
  damageAngle: null,
  callout: '',
  scoreboard: [],
  killFeed: [],
  pointerLocked: false,
  playing: false,
  started: false,
  mapReady: false,
  weaponsReady: false,
  peerCount: 0,
  pingMs: null,
  netMode: 'solo',
  grenades: 2,
  maxGrenades: 2,
  grenadeRefillProgress: 1,
  roomCode: null,
  isHostRoom: true,
  maxPlayers: 4,
  radarPlayer: { x: 0, z: 0, yaw: 0 },
  radarBlips: [],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BandukwaEngine | null>(null);
  const chatSeqRef = useRef(1);

  const [settings, setSettings] = useState<SettingsState>(loadInitialSettings);
  const [callsign, setCallsign] = useState<string>(loadInitialCallsign);
  const [cardId, setCardId] = useState<number>(loadInitialCardId);
  const [profileConfirmed, setProfileConfirmed] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(true);
  const [remoteLobbyMap, setRemoteLobbyMap] = useState<Record<number, LobbyMember>>({});
  const [chatMessages, setChatMessages] = useState<LobbyChatItem[]>([]);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [lobbyOpen, setLobbyOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabScoreboard, setTabScoreboard] = useState(false);
  const [p2pStatus, setP2pStatus] = useState('');
  const [hasCoarsePointer, setHasCoarsePointer] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isMobileHud = useMemo(() => {
    if (settings.controlMode === 'mobile') return true;
    if (settings.controlMode === 'desktop') return false;
    return hasCoarsePointer;
  }, [settings.controlMode, hasCoarsePointer]);

  const handleStartMatch = useCallback(async () => {
    setLobbyOpen(false);
    setSettingsOpen(false);
    await enterGameFullscreen();
    engineRef.current?.deploy(callsign, !isMobileHud);
  }, [callsign, isMobileHud]);

  const startMatchRef = useRef(handleStartMatch);
  startMatchRef.current = handleStartMatch;

  useEffect(() => {
    const checkTouch = () => {
      const coarse =
        window.matchMedia('(pointer: coarse)').matches ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0;
      setHasCoarsePointer(coarse);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new BandukwaEngine(
      mount,
      settings,
      (snapshot) => setHud(snapshot),
      () => setLobbyOpen(true),
    );
    engine.p2p.onStatus = (msg) => setP2pStatus(msg);
    engine.onLobbyPeerLeft = (pid) => {
      setRemoteLobbyMap((prev) => {
        if (!(pid in prev)) return prev;
        const next = { ...prev };
        delete next[pid];
        return next;
      });
    };
    engine.onLobbyPacket = (msg) => {
      if (msg.t === 'lob') {
        const senderId = msg.from ?? 0;
        setRemoteLobbyMap((prev) => ({
          ...prev,
          [senderId]: {
            id: senderId,
            name: String(msg.n || 'Operator').slice(0, 14),
            cardId: msg.card ?? senderId % 4,
            ready: Boolean(msg.rdy),
            inGame: Boolean(msg.inGame),
            isHost: senderId === 0,
            isMe: false,
          },
        }));
      } else if (msg.t === 'chat') {
        setChatMessages((prev) => [
          ...prev.slice(-14),
          {
            id: chatSeqRef.current++,
            sender: String(msg.n || 'Operator').slice(0, 14),
            text: String(msg.txt || '').slice(0, 96),
          },
        ]);
      } else if (msg.t === 'launch') {
        void startMatchRef.current();
      }
    };
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Initialize WebGL scene exactly once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast local lobby card & ready state while in a room (and clear when room closes)
  useEffect(() => {
    const engine = engineRef.current;
    if (!hud.roomCode) {
      setRemoteLobbyMap({});
      setChatMessages([]);
      return;
    }
    if (!engine) return;
    const sendLobbyState = () => {
      if (!engine.p2p.roomCode) return;
      engine.p2p.send({
        t: 'lob',
        n: (callsign.trim() || 'Operator').slice(0, 14),
        card: cardId,
        rdy: ready ? 1 : 0,
        inGame: hud.started ? 1 : 0,
      });
    };
    sendLobbyState();
    const timer = window.setInterval(sendLobbyState, 1100);
    return () => clearInterval(timer);
  }, [hud.roomCode, hud.peerCount, hud.started, callsign, cardId, ready]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab' && hud.playing) {
        e.preventDefault();
        setTabScoreboard(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setTabScoreboard(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [hud.playing]);

  useEffect(() => {
    const syncFullscreen = () => {
      const active = isFullscreenActive();
      setIsFullscreen(active);
      if (active) {
        void lockGameKeyboard();
      } else {
        unlockGameKeyboard();
      }
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!hud.playing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hud.playing]);

  const handleSettingsChange = (next: SettingsState) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const handleCallsignChange = (name: string) => {
    setCallsign(name);
    try {
      localStorage.setItem(CALLSIGN_STORAGE_KEY, name);
    } catch {
      // ignore storage errors
    }
  };

  const handleCardChange = (nextCard: number) => {
    const clamped = ((nextCard % 4) + 4) % 4;
    setCardId(clamped);
    try {
      localStorage.setItem(CARD_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  };

  const handleLaunchSquadMatch = () => {
    if (engineRef.current?.p2p.roomCode && engineRef.current.p2p.isHost) {
      engineRef.current.p2p.send({ t: 'launch' });
    }
    void handleStartMatch();
  };

  const handleSendChat = (text: string) => {
    const sender = (callsign.trim() || 'Operator').slice(0, 14);
    const clean = text.trim().slice(0, 96);
    if (!clean) return;
    setChatMessages((prev) => [
      ...prev.slice(-14),
      { id: chatSeqRef.current++, sender, text: clean },
    ]);
    engineRef.current?.p2p.send({ t: 'chat', n: sender, txt: clean, ts: Date.now() });
  };

  const handleToggleFullscreen = () => {
    void toggleGameFullscreen().then((active) => setIsFullscreen(active));
  };

  const handleOpenSettings = () => {
    if (hud.pointerLocked && document.pointerLockElement) {
      document.exitPointerLock();
    }
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  const handlePause = () => {
    engineRef.current?.pauseToMenu();
    setLobbyOpen(true);
  };

  const squadMembers = useMemo<LobbyMember[]>(() => {
    if (!hud.roomCode) return [];
    const myId = engineRef.current?.p2p.myId ?? (hud.isHostRoom ? 0 : 1);
    const meMember: LobbyMember = {
      id: myId,
      name: (callsign.trim() || 'Operator').slice(0, 14),
      cardId,
      ready,
      inGame: hud.started,
      isHost: hud.isHostRoom,
      isMe: true,
    };
    const merged = new Map<number, LobbyMember>();
    Object.values(remoteLobbyMap).forEach((m) => merged.set(m.id, m));
    merged.set(myId, meMember);
    return Array.from(merged.values()).sort((a, b) => a.id - b.id);
  }, [hud.roomCode, hud.isHostRoom, hud.started, callsign, cardId, ready, remoteLobbyMap]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0f14]">
      {/* Isolated WebGL viewport container */}
      <div
        ref={canvasMountRef}
        onClick={() => {
          if (hud.started && !hud.pointerLocked && !lobbyOpen && !settingsOpen && !isMobileHud) {
            engineRef.current?.requestLock();
          }
        }}
        className="absolute inset-0 h-full w-full"
      />

      {/* Tactical HUD */}
      <HudOverlay
        hud={hud}
        crosshairColor={settings.crosshairColor}
        hudConfig={settings.hudConfig}
        showFullScoreboard={tabScoreboard}
        isMobileHud={isMobileHud}
        isFullscreen={isFullscreen}
        onSelectWeapon={(idx) => engineRef.current?.selectWeapon(idx)}
        onOpenSettings={handleOpenSettings}
        onToggleFullscreen={handleToggleFullscreen}
        onPause={handlePause}
      />

      {/* Mobile / Touch Dual-Thumb Controls */}
      {hud.started && hud.playing && isMobileHud && !lobbyOpen && !settingsOpen && (
        <TouchControls
          ads={hud.ads}
          crouching={hud.crouching}
          sprinting={hud.sprinting}
          sliding={hud.sliding}
          reloading={hud.reloading}
          lowAmmo={!hud.reloading && hud.ammo <= Math.max(2, Math.ceil(hud.mag * 0.25))}
          grenades={hud.grenades}
          hudConfig={settings.hudConfig}
          onMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onLookDelta={(dx, dy) => engineRef.current?.addLookDelta(dx, dy)}
          onFireChange={(f) => engineRef.current?.setTouchFire(f)}
          onToggleAds={() => engineRef.current?.toggleTouchAds()}
          onJump={() => engineRef.current?.triggerJump()}
          onToggleCrouch={() => engineRef.current?.toggleTouchCrouch()}
          onReload={() => engineRef.current?.triggerReload()}
          onNextWeapon={() => engineRef.current?.cycleWeapon()}
          onGrenade={() => engineRef.current?.triggerGrenade()}
        />
      )}

      {/* Pre-Match Squad Lobby & Launch Interface */}
      <LobbyModal
        open={lobbyOpen}
        started={hud.started}
        profileConfirmed={profileConfirmed}
        callsign={callsign}
        cardId={cardId}
        ready={ready}
        botCount={settings.botCount}
        peerCount={hud.peerCount}
        maxPlayers={hud.maxPlayers}
        roomCode={hud.roomCode}
        isHostRoom={hud.isHostRoom}
        pingMs={hud.pingMs}
        netMode={hud.netMode}
        p2pStatus={p2pStatus}
        mapReady={hud.mapReady}
        weaponsReady={hud.weaponsReady}
        isFullscreen={isFullscreen}
        squadMembers={squadMembers}
        chatMessages={chatMessages}
        onCallsignChange={handleCallsignChange}
        onCardChange={handleCardChange}
        onConfirmProfile={() => setProfileConfirmed(true)}
        onEditProfile={() => setProfileConfirmed(false)}
        onToggleReady={() => setReady((r) => !r)}
        onBotCountChange={(count) => handleSettingsChange({ ...settings, botCount: count })}
        onStartMatch={() => void handleStartMatch()}
        onLaunchSquadMatch={handleLaunchSquadMatch}
        onSendChat={handleSendChat}
        onOpenSettings={handleOpenSettings}
        onToggleFullscreen={handleToggleFullscreen}
        onHostRoom={async () => {
          if (!engineRef.current) return '';
          setReady(true);
          return engineRef.current.hostMultiplayer(callsign);
        }}
        onJoinRoom={async (code) => {
          if (!engineRef.current) return;
          setReady(true);
          await engineRef.current.joinMultiplayer(code, callsign);
        }}
        onLeaveRoom={async () => {
          await engineRef.current?.leaveMultiplayer();
          setRemoteLobbyMap({});
          setChatMessages([]);
        }}
      />

      {/* Quick Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={handleCloseSettings}
      />
    </div>
  );
}
