let sentinel: WakeLockSentinel | null = null;

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Prevents the screen from auto-locking due to inactivity. This is a
 * meaningful fix here because narration has no touch/keyboard input to keep
 * the OS's idle timer from firing — without this, the screen (and the page
 * visibility state tied to it) goes to sleep mid-narration on its own. Note
 * this cannot override a user manually pressing the power button, and the
 * lock is automatically released whenever the page becomes hidden — callers
 * should re-request it on the next 'visibilitychange' to visible if still
 * needed.
 */
export async function requestWakeLock(): Promise<boolean> {
  if (!isWakeLockSupported()) return false;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    return true;
  } catch {
    return false;
  }
}

export function releaseWakeLock() {
  if (sentinel && !sentinel.released) {
    sentinel.release().catch(() => {});
  }
  sentinel = null;
}
