interface FullscreenDoc extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface KeyboardLockNavigator extends Navigator {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
    unlock?: () => void;
  };
}

const GAME_LOCK_KEYS = [
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyC',
  'KeyR',
  'KeyG',
  'Space',
  'Tab',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
];

export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDoc;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function lockGameKeyboard(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as KeyboardLockNavigator;
    if (nav.keyboard?.lock) {
      await nav.keyboard.lock(GAME_LOCK_KEYS);
    }
  } catch {
    // Ignore when unsupported or blocked by iframe permissions policy
  }
}

export function unlockGameKeyboard(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as KeyboardLockNavigator;
    nav.keyboard?.unlock?.();
  } catch {
    // Ignore
  }
}

export async function enterGameFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isFullscreenActive()) {
    await lockGameKeyboard();
    return true;
  }
  const targets = [document.documentElement, document.body] as FullscreenEl[];
  for (const el of targets) {
    if (!el) continue;
    try {
      if (el.requestFullscreen) {
        try {
          await el.requestFullscreen({ navigationUI: 'hide' });
        } catch {
          await el.requestFullscreen();
        }
        await lockGameKeyboard();
        return true;
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        await lockGameKeyboard();
        return true;
      }
    } catch {
      // try next target or fall back silently
    }
  }
  return false;
}

export async function exitGameFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  unlockGameKeyboard();
  const doc = document as FullscreenDoc;
  try {
    if (doc.fullscreenElement && doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore
  }
}

export async function toggleGameFullscreen(): Promise<boolean> {
  if (isFullscreenActive()) {
    await exitGameFullscreen();
    return false;
  }
  return enterGameFullscreen();
}
