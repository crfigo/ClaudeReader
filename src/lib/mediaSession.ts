function supported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/**
 * Tells the OS this page is doing active media playback, which is what lets
 * mobile browsers keep audio running with the screen off / app backgrounded
 * and shows lock-screen transport controls instead of treating the tab as
 * idle and suspending it.
 */
export function setMediaSessionMetadata(title: string, artist = "ClaudeReader") {
  if (!supported() || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist });
}

export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState) {
  if (!supported()) return;
  navigator.mediaSession.playbackState = state;
}

export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
}

export function setMediaSessionHandlers({ onPlay, onPause, onPreviousTrack, onNextTrack }: MediaSessionHandlers) {
  if (!supported()) return;
  navigator.mediaSession.setActionHandler("play", onPlay);
  navigator.mediaSession.setActionHandler("pause", onPause);
  navigator.mediaSession.setActionHandler("previoustrack", onPreviousTrack);
  navigator.mediaSession.setActionHandler("nexttrack", onNextTrack);
}

export function clearMediaSessionHandlers() {
  if (!supported()) return;
  navigator.mediaSession.setActionHandler("play", null);
  navigator.mediaSession.setActionHandler("pause", null);
  navigator.mediaSession.setActionHandler("previoustrack", null);
  navigator.mediaSession.setActionHandler("nexttrack", null);
}
