"use client";

import { useEffect, useRef } from "react";
import { useReaderStore } from "@/store/useReaderStore";
import {
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionHandlers,
} from "@/lib/mediaSession";
import { requestWakeLock, releaseWakeLock } from "@/lib/wakeLock";

function IconButton({
  label,
  onClick,
  disabled,
  children,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
        size === "lg" ? "w-14 h-14" : "w-11 h-11"
      }`}
    >
      {children}
    </button>
  );
}

export default function PlayerControls() {
  const playbackState = useReaderStore((s) => s.playbackState);
  const flatSentences = useReaderStore((s) => s.flatSentences);
  const paragraphs = useReaderStore((s) => s.paragraphs);
  const currentSentenceIndex = useReaderStore((s) => s.currentSentenceIndex);
  const currentParagraphIndex = useReaderStore((s) => s.currentParagraphIndex);

  const play = useReaderStore((s) => s.play);
  const pause = useReaderStore((s) => s.pause);
  const resume = useReaderStore((s) => s.resume);
  const stop = useReaderStore((s) => s.stop);
  const nextSentence = useReaderStore((s) => s.nextSentence);
  const previousSentence = useReaderStore((s) => s.previousSentence);
  const nextParagraph = useReaderStore((s) => s.nextParagraph);
  const previousParagraph = useReaderStore((s) => s.previousParagraph);
  const jumpToSentence = useReaderStore((s) => s.jumpToSentence);
  const ttsProvider = useReaderStore((s) => s.ttsProvider);
  const sourceLabel = useReaderStore((s) => s.sourceLabel);
  const keepScreenAwake = useReaderStore((s) => s.keepScreenAwake);

  const hasText = flatSentences.length > 0;
  const isLoading = playbackState === "loading";
  const isPlaying = playbackState === "playing" || isLoading;
  const isPaused = playbackState === "paused";

  const totalSentences = flatSentences.length;
  const progress = totalSentences > 0 ? Math.max(0, currentSentenceIndex + 1) / totalSentences : 0;

  const handlePlayPause = () => {
    if (isPlaying) pause();
    else if (isPaused) resume();
    else play();
  };

  // Media Session: lets mobile OSes show lock-screen transport controls and
  // keep audio playback alive with the screen off / app backgrounded,
  // instead of treating the tab as idle and suspending it.
  useEffect(() => {
    setMediaSessionHandlers({
      onPlay: () => (isPaused ? resume() : play()),
      onPause: pause,
      onPreviousTrack: previousSentence,
      onNextTrack: nextSentence,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  useEffect(() => {
    setMediaSessionMetadata(sourceLabel ?? "ClaudeReader");
  }, [sourceLabel]);

  useEffect(() => {
    setMediaSessionPlaybackState(isPlaying ? "playing" : isPaused ? "paused" : "none");
  }, [isPlaying, isPaused]);

  // Browser SpeechSynthesis has no real <audio> element for the OS to track,
  // so on many mobile browsers it gets paused/throttled once the tab is
  // backgrounded or the screen locks. Playing a near-silent looping <audio>
  // alongside it anchors the page as "active media playback," which helps
  // some browsers (notably Android Chrome) keep narration going. This isn't
  // needed for the Google Cloud TTS engine, which already plays real audio.
  const keepAliveRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = keepAliveRef.current;
    if (!audio) return;
    audio.volume = 0.01;
    if (ttsProvider === "browser" && isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [ttsProvider, isPlaying]);

  // Wake Lock: keeps the screen from auto-locking due to inactivity while
  // narrating (there's no touch/keyboard input to reset the OS idle timer
  // otherwise). The lock is auto-released by the browser whenever the page
  // becomes hidden, so it's re-requested on the next 'visibilitychange' back
  // to visible if playback is still active and the user opted in.
  useEffect(() => {
    if (!keepScreenAwake || !isPlaying) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [keepScreenAwake, isPlaying]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasText) return;
    const ratio = Number(e.target.value) / 1000;
    const targetIndex = Math.min(totalSentences - 1, Math.max(0, Math.floor(ratio * totalSentences)));
    jumpToSentence(targetIndex);
  };

  const paragraphLabel =
    currentParagraphIndex >= 0
      ? `Paragraph ${currentParagraphIndex + 1} of ${paragraphs.length}`
      : `${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}`;

  const sentenceLabel =
    currentSentenceIndex >= 0 ? `Sentence ${currentSentenceIndex + 1} of ${totalSentences}` : "Ready to play";

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5 space-y-4">
      <audio ref={keepAliveRef} src="/silence.wav" loop preload="auto" className="hidden" aria-hidden="true" />

      {/* Progress bar */}
      <div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={handleSeek}
          disabled={!hasText}
          aria-label="Narration progress"
          className="w-full accent-indigo-600 disabled:opacity-40"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{sentenceLabel}</span>
          <span>{paragraphLabel}</span>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        <IconButton label="Previous paragraph" onClick={previousParagraph} disabled={!hasText}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M5.25 5.25v13.5M19.5 6 9.75 12l9.75 6V6Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          </svg>
        </IconButton>

        <IconButton label="Previous sentence" onClick={previousSentence} disabled={!hasText}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
        </IconButton>

        <IconButton label={isPlaying ? "Pause" : isPaused ? "Resume" : "Play"} onClick={handlePlayPause} disabled={!hasText} size="lg">
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
            </svg>
          )}
        </IconButton>

        <IconButton label="Next sentence" onClick={nextSentence} disabled={!hasText}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
          </svg>
        </IconButton>

        <IconButton label="Next paragraph" onClick={nextParagraph} disabled={!hasText}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M18.75 5.25v13.5M4.5 6l9.75 6-9.75 6V6Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          </svg>
        </IconButton>

        <IconButton label="Stop" onClick={stop} disabled={!hasText || playbackState === "idle"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
        </IconButton>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        {!hasText
          ? "Load some text above to start narration."
          : isLoading
            ? "Generating audio…"
            : isPlaying
              ? "Narrating… click any sentence to jump there."
              : isPaused
                ? "Paused — press play to resume."
                : "Click play, or click any sentence in the reader to start from there."}
      </p>
    </div>
  );
}
