import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bomb,
  Check,
  Crosshair,
  Flame,
  Move,
  RefreshCw,
  Repeat,
  RotateCcw,
  X,
} from 'lucide-react';
import type { CustomHudId, CustomHudItemLayout, HudConfig } from '../types/game';

interface CustomHudEditorProps {
  open: boolean;
  hudConfig: HudConfig;
  onSave: (next: HudConfig) => void;
  onClose: () => void;
}

interface EditorControlMeta {
  id: CustomHudId;
  label: string;
  sizePx: number;
  accent?: boolean;
}

const CONTROLS_META: EditorControlMeta[] = [
  { id: 'joystick', label: 'MOVE', sizePx: 104 },
  { id: 'fireLeft', label: 'FIRE', sizePx: 52 },
  { id: 'shoot', label: 'SHOOT', sizePx: 76, accent: true },
  { id: 'ads', label: 'ADS', sizePx: 48 },
  { id: 'jump', label: 'JUMP', sizePx: 48 },
  { id: 'crouch', label: 'CRCH', sizePx: 48 },
  { id: 'reload', label: 'RLD', sizePx: 48 },
  { id: 'frag', label: 'FRAG', sizePx: 44 },
  { id: 'swap', label: 'SWAP', sizePx: 44 },
];

export const DEFAULT_TOUCH_POSITIONS: Record<CustomHudId, CustomHudItemLayout> = {
  joystick: { x: 14, y: 78, scale: 1.0 },
  fireLeft: { x: 11, y: 52, scale: 1.0 },
  shoot: { x: 89, y: 81, scale: 1.0 },
  ads: { x: 75, y: 84, scale: 1.0 },
  crouch: { x: 64, y: 76, scale: 1.0 },
  jump: { x: 75, y: 67, scale: 1.0 },
  reload: { x: 89, y: 59, scale: 1.0 },
  frag: { x: 79, y: 50, scale: 1.0 },
  swap: { x: 68, y: 52, scale: 1.0 },
};

const CLAW_4_PRESET: Record<CustomHudId, CustomHudItemLayout> = {
  joystick: { x: 14, y: 78, scale: 1.0 },
  fireLeft: { x: 16, y: 26, scale: 1.15 },
  shoot: { x: 88, y: 80, scale: 1.05 },
  ads: { x: 84, y: 26, scale: 1.1 },
  jump: { x: 89, y: 44, scale: 1.0 },
  crouch: { x: 76, y: 42, scale: 1.0 },
  reload: { x: 75, y: 66, scale: 0.95 },
  frag: { x: 74, y: 84, scale: 0.95 },
  swap: { x: 63, y: 84, scale: 0.95 },
};

function ControlIcon({ id }: { id: CustomHudId }) {
  switch (id) {
    case 'joystick':
      return <Move className="h-5 w-5 text-amber-400" />;
    case 'fireLeft':
    case 'shoot':
      return <Flame className="h-5 w-5" />;
    case 'ads':
      return <Crosshair className="h-4 w-4" />;
    case 'jump':
      return <ArrowUp className="h-4 w-4" />;
    case 'crouch':
      return <ArrowDown className="h-4 w-4" />;
    case 'reload':
      return <RefreshCw className="h-4 w-4" />;
    case 'frag':
      return <Bomb className="h-4 w-4 text-amber-400" />;
    case 'swap':
      return <Repeat className="h-4 w-4" />;
  }
}

export function CustomHudEditor({ open, hudConfig, onSave, onClose }: CustomHudEditorProps) {
  const [draft, setDraft] = useState<HudConfig>(() => ({
    ...hudConfig,
    touchLayout: { ...hudConfig.touchLayout },
  }));
  const [selectedId, setSelectedId] = useState<CustomHudId>('shoot');
  const dragRef = useRef<{ id: CustomHudId; pointerId: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  if (!open) return null;

  const getLayout = (id: CustomHudId): CustomHudItemLayout => {
    return draft.touchLayout[id] ?? DEFAULT_TOUCH_POSITIONS[id];
  };

  const updateItem = (id: CustomHudId, patch: Partial<CustomHudItemLayout>) => {
    const cur = getLayout(id);
    setDraft((prev) => ({
      ...prev,
      touchLayout: {
        ...prev.touchLayout,
        [id]: { ...cur, ...patch },
      },
    }));
  };

  const handlePointerDown = (id: CustomHudId, e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSelectedId(id);
    dragRef.current = { id, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (id: CustomHudId, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || dragRef.current.id !== id || dragRef.current.pointerId !== e.pointerId) {
      return;
    }
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(6, Math.min(94, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));
    updateItem(id, { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const selectedLayout = getLayout(selectedId);
  const selectedMeta = CONTROLS_META.find((c) => c.id === selectedId)!;

  return (
    <div
      ref={surfaceRef}
      className="fixed inset-0 z-[60] select-none overflow-hidden bg-[#06090d]/92 text-[#eef2f6] backdrop-blur-sm"
      role="dialog"
      aria-label="Custom HUD Layout Editor"
    >
      {/* Subtle tactical alignment grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Center Reticle Reference */}
      <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40">
        <div className="h-6 w-6 rounded-full border border-dashed border-amber-400" />
      </div>

      {/* Top Toolbar */}
      <div className="relative z-20 mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#111720]/95 px-3.5 py-2.5 shadow-xl sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-bold text-white">HUD Layout</span>
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, touchLayout: {} }))}
            className="flex items-center gap-1 rounded-md border border-white/12 bg-[#18212d] px-2.5 py-1 text-[11px] font-semibold text-[#cbd5e1] hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Default
          </button>
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, touchLayout: { ...CLAW_4_PRESET } }))}
            className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
          >
            4-Finger Claw
          </button>
        </div>

        {/* Selected button size slider */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-[11px] text-amber-400">{selectedMeta.label} Size</span>
          <input
            type="range"
            min={0.75}
            max={1.45}
            step={0.05}
            value={selectedLayout.scale}
            onChange={(e) => updateItem(selectedId, { scale: parseFloat(e.target.value) })}
            className="h-1.5 w-24 cursor-pointer accent-amber-500"
          />
          <span className="w-9 font-mono text-[11px] tabular-nums text-[#cbd5e1]">
            {Math.round(selectedLayout.scale * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg border border-white/12 bg-[#18212d] px-3 py-1.5 text-xs font-semibold text-[#cbd5e1] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="flex items-center gap-1 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>

      <div className="pointer-events-none mt-2 text-center font-mono text-[11px] text-[#94a3b8]">
        Drag any circular button to reposition · Tap to resize
      </div>

      {/* Draggable Circular Controls */}
      {CONTROLS_META.map((ctrl) => {
        const pos = getLayout(ctrl.id);
        const isSelected = selectedId === ctrl.id;
        return (
          <button
            key={ctrl.id}
            type="button"
            onPointerDown={(e) => handlePointerDown(ctrl.id, e)}
            onPointerMove={(e) => handlePointerMove(ctrl.id, e)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              width: `${ctrl.sizePx}px`,
              height: `${ctrl.sizePx}px`,
              opacity: draft.opacity,
              transform: `translate(-50%, -50%) scale(${pos.scale * draft.scale})`,
            }}
            className={`absolute flex touch-none cursor-grab flex-col items-center justify-center rounded-full border-2 shadow-lg active:cursor-grabbing ${
              ctrl.accent
                ? 'border-amber-200 bg-amber-500/90 text-slate-950'
                : 'border-white/30 bg-[#0b0f14]/85 text-white'
            } ${isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#06090d]' : ''}`}
          >
            <ControlIcon id={ctrl.id} />
            <span className="font-mono text-[8px] font-bold">{ctrl.label}</span>
          </button>
        );
      })}
    </div>
  );
}
