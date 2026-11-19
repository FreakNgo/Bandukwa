import { useState } from 'react';
import { Move, RotateCcw, Sliders, X } from 'lucide-react';
import {
  DEFAULT_HUD_CONFIG,
  DEFAULT_SETTINGS,
  type ControlMode,
  type GraphicsQuality,
  type HudConfig,
  type SettingsState,
} from '../types/game';
import { CustomHudEditor } from './CustomHudEditor';

interface SettingsDrawerProps {
  open: boolean;
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
  onClose: () => void;
}

export function SettingsDrawer({ open, settings, onChange, onClose }: SettingsDrawerProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  if (!open) return null;

  const update = <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => {
    onChange({ ...settings, [key]: val });
  };

  const updateHud = <K extends keyof HudConfig>(key: K, val: HudConfig[K]) => {
    onChange({
      ...settings,
      hudConfig: {
        ...DEFAULT_HUD_CONFIG,
        ...settings.hudConfig,
        [key]: val,
      },
    });
  };

  const hudCfg: HudConfig = { ...DEFAULT_HUD_CONFIG, ...settings.hudConfig };

  const controlOptions: Array<{ value: ControlMode; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'desktop', label: 'Desktop' },
    { value: 'mobile', label: 'Mobile' },
  ];

  const qualityOptions: Array<{ value: GraphicsQuality; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'high', label: 'High' },
  ];

  const hudToggles: Array<{ key: 'showRadar' | 'showKillFeed' | 'showStandings' | 'showWeaponStrip'; label: string }> = [
    { key: 'showRadar', label: 'Radar' },
    { key: 'showKillFeed', label: 'Kill Feed' },
    { key: 'showStandings', label: 'Standings' },
    { key: 'showWeaponStrip', label: 'Weapon Bar' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06090d]/85 p-3 sm:p-4">
        <div
          className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/12 bg-[#111720] p-5 text-[#eef2f6] shadow-2xl sm:p-6"
          role="dialog"
          aria-label="Quick Settings"
        >
          <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3.5">
            <div>
              <h2 className="font-display text-xl font-bold tracking-wide text-white">
                Quick Settings
              </h2>
              <p className="text-xs text-[#94a3b8]">
                Aiming, camera, performance, and Custom HUD
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-white/12 bg-[#18212d] text-[#cbd5e1] transition-colors hover:border-amber-500/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#cbd5e1]">
                <span>Aim Sensitivity</span>
                <span className="font-mono tabular-nums text-amber-400">
                  {settings.sensitivity.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.05}
                value={settings.sensitivity}
                onChange={(e) => update('sensitivity', parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer accent-amber-500"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#cbd5e1]">
                <span>ADS Sensitivity Multiplier</span>
                <span className="font-mono tabular-nums text-amber-400">
                  {settings.adsMultiplier.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.3}
                max={1.0}
                step={0.05}
                value={settings.adsMultiplier}
                onChange={(e) => update('adsMultiplier', parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer accent-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#cbd5e1]">
                  <span>Field of View</span>
                  <span className="font-mono tabular-nums text-amber-400">{settings.fov}°</span>
                </div>
                <input
                  type="range"
                  min={65}
                  max={100}
                  step={1}
                  value={settings.fov}
                  onChange={(e) => update('fov', parseInt(e.target.value, 10))}
                  className="h-2 w-full cursor-pointer accent-amber-500"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#cbd5e1]">
                  <span>Master Volume</span>
                  <span className="font-mono tabular-nums text-amber-400">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.volume}
                  onChange={(e) => update('volume', parseFloat(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#cbd5e1]">
                  <span>Solo AI Bots</span>
                  <span className="font-mono tabular-nums text-amber-400">{settings.botCount}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={1}
                  value={settings.botCount}
                  onChange={(e) => update('botCount', parseInt(e.target.value, 10))}
                  className="h-2 w-full cursor-pointer accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#161e29] px-3.5 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-white">Dynamic Shadows</div>
                  <div className="text-[11px] text-[#94a3b8]">Sun shadow map</div>
                </div>
                <button
                  type="button"
                  onClick={() => update('shadows', !settings.shadows)}
                  className={`min-h-[36px] min-w-[64px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                    settings.shadows
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#222d3c] text-[#cbd5e1]'
                  }`}
                >
                  {settings.shadows ? 'On' : 'Off'}
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#cbd5e1]">
                <span>Graphics Quality</span>
                <span className="text-[11px] text-[#94a3b8]">Auto adapts for low-end devices</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-white/10 bg-[#0b0f14] p-1">
                {qualityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('graphicsQuality', opt.value)}
                    className={`min-h-[38px] rounded-md px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      settings.graphicsQuality === opt.value
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-[#cbd5e1]">Control HUD Layout</div>
              <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-white/10 bg-[#0b0f14] p-1">
                {controlOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('controlMode', opt.value)}
                    className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                      settings.controlMode === opt.value
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-[#94a3b8] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom HUD Section */}
            <div className="space-y-3 rounded-xl border border-amber-500/25 bg-[#0b0f14]/85 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-bold text-white">Custom HUD</div>
                    <div className="text-[11px] text-[#94a3b8]">
                      Reposition buttons, scale, opacity &amp; widgets
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap"
                >
                  <Move className="h-3.5 w-3.5" />
                  Edit Layout
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-[#cbd5e1]">
                    <span>HUD Scale</span>
                    <span className="font-mono tabular-nums text-amber-400">
                      {Math.round(hudCfg.scale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.75}
                    max={1.35}
                    step={0.05}
                    value={hudCfg.scale}
                    onChange={(e) => updateHud('scale', parseFloat(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-amber-500"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-[#cbd5e1]">
                    <span>HUD Opacity</span>
                    <span className="font-mono tabular-nums text-amber-400">
                      {Math.round(hudCfg.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={1.0}
                    step={0.05}
                    value={hudCfg.opacity}
                    onChange={(e) => updateHud('opacity', parseFloat(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {hudToggles.map((item) => {
                  const active = hudCfg[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => updateHud(item.key, !active)}
                      className={`min-h-[34px] rounded-md border px-2 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-[#161e29] text-[#94a3b8]'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-xs font-medium text-[#cbd5e1]">Crosshair Color</div>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-[#0b0f14] p-1">
                  {(['green', 'amber', 'cyan', 'white'] as const).map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => update('crosshairColor', col)}
                      className={`min-h-[36px] rounded-md px-2 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                        settings.crosshairColor === col
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-[#94a3b8] hover:text-white'
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#161e29] px-3.5 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-white">C Key Crouch</div>
                  <div className="text-[11px] text-[#94a3b8]">Ctrl always holds crouch</div>
                </div>
                <button
                  type="button"
                  onClick={() => update('crouchToggle', !settings.crouchToggle)}
                  className={`min-h-[36px] min-w-[72px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                    settings.crouchToggle
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#222d3c] text-[#cbd5e1]'
                  }`}
                >
                  {settings.crouchToggle ? 'Toggle' : 'Hold'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_SETTINGS, hudConfig: { ...DEFAULT_HUD_CONFIG } })}
              className="flex min-h-[42px] items-center gap-2 rounded-lg border border-white/12 bg-[#18212d] px-4 py-2 text-xs font-semibold text-[#cbd5e1] transition-colors hover:text-white whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-lg bg-amber-500 px-6 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap"
            >
              Apply &amp; Close
            </button>
          </div>
        </div>
      </div>

      <CustomHudEditor
        open={editorOpen}
        hudConfig={hudCfg}
        onSave={(nextHud) => update('hudConfig', nextHud)}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}
