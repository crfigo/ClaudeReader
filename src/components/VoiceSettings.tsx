"use client";

import { useMemo, useState } from "react";
import { SPEEDS, useReaderStore } from "@/store/useReaderStore";
import { GOOGLE_VOICE_OPTIONS } from "@/lib/googleTtsEngine";
import { isWakeLockSupported } from "@/lib/wakeLock";

const SAMPLE_TEXT = {
  es: "Hola, así es como sueno. Puedo narrar tu texto con esta voz.",
  en: "Hi, this is how I sound. I can narrate your text using this voice.",
};

export default function VoiceSettings() {
  const language = useReaderStore((s) => s.language);
  const autoDetectLanguage = useReaderStore((s) => s.autoDetectLanguage);
  const voiceOptions = useReaderStore((s) => s.voiceOptions);
  const voiceURI = useReaderStore((s) => s.voiceURI);
  const rate = useReaderStore((s) => s.rate);
  const voicesLoaded = useReaderStore((s) => s.voicesLoaded);
  const fontSize = useReaderStore((s) => s.fontSize);
  const ttsProvider = useReaderStore((s) => s.ttsProvider);
  const googleAvailable = useReaderStore((s) => s.googleAvailable);
  const googleVoiceName = useReaderStore((s) => s.googleVoiceName);
  const keepScreenAwake = useReaderStore((s) => s.keepScreenAwake);

  const setLanguage = useReaderStore((s) => s.setLanguage);
  const setAutoDetect = useReaderStore((s) => s.setAutoDetect);
  const setVoiceURI = useReaderStore((s) => s.setVoiceURI);
  const setProvider = useReaderStore((s) => s.setProvider);
  const setGoogleVoiceName = useReaderStore((s) => s.setGoogleVoiceName);
  const setRate = useReaderStore((s) => s.setRate);
  const setFontSize = useReaderStore((s) => s.setFontSize);
  const setError = useReaderStore((s) => s.setError);
  const setKeepScreenAwake = useReaderStore((s) => s.setKeepScreenAwake);

  const wakeLockSupported = isWakeLockSupported();

  const [previewing, setPreviewing] = useState(false);

  const filteredVoices = useMemo(
    () => voiceOptions.filter((o) => o.lang === language),
    [voiceOptions, language]
  );

  const filteredGoogleVoices = useMemo(
    () => GOOGLE_VOICE_OPTIONS.filter((o) => o.lang === language),
    [language]
  );

  const previewBrowserVoice = () => {
    const option = voiceOptions.find((o) => o.voice.voiceURI === voiceURI);
    if (!option || typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(SAMPLE_TEXT[language]);
    utterance.voice = option.voice;
    utterance.lang = option.voice.lang;
    utterance.rate = rate;
    setPreviewing(true);
    utterance.onend = () => setPreviewing(false);
    utterance.onerror = () => setPreviewing(false);
    window.speechSynthesis.speak(utterance);
  };

  const previewGoogleVoice = async () => {
    const option = GOOGLE_VOICE_OPTIONS.find((o) => o.name === googleVoiceName);
    if (!option) return;

    setPreviewing(true);
    try {
      const res = await fetch("/api/tts/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: SAMPLE_TEXT[language],
          voiceName: option.name,
          languageCode: option.languageCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't preview this voice.");
        return;
      }
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.playbackRate = rate;
      audio.onended = () => setPreviewing(false);
      audio.onerror = () => setPreviewing(false);
      await audio.play();
    } catch {
      setError("Couldn't preview this voice. Check your connection and try again.");
    } finally {
      setPreviewing(false);
    }
  };

  const handlePreview = () => {
    if (ttsProvider === "google") previewGoogleVoice();
    else previewBrowserVoice();
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5 space-y-5">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Voice &amp; playback</h2>

      {/* Narration engine */}
      <div>
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Narration engine
        </span>
        <div className="flex gap-2" role="radiogroup" aria-label="Narration engine">
          <button
            type="button"
            role="radio"
            aria-checked={ttsProvider === "browser"}
            onClick={() => setProvider("browser")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              ttsProvider === "browser"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300"
                : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Browser voices
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={ttsProvider === "google"}
            onClick={() => setProvider("google")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
              ttsProvider === "google"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300"
                : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Google Cloud TTS
          </button>
        </div>
        {ttsProvider === "google" && googleAvailable === false && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Google Cloud TTS isn&apos;t configured on this server. Set the{" "}
            <code className="font-mono">GOOGLE_TTS_API_KEY</code> environment variable to enable it.
          </p>
        )}
      </div>

      {/* Language */}
      <div>
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Language</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Narration language">
          {(["en", "es"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={language === lang}
              onClick={() => {
                setAutoDetect(false);
                setLanguage(lang);
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                language === lang
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {lang === "en" ? "English" : "Español"}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={autoDetectLanguage}
            onChange={(e) => setAutoDetect(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          />
          Auto-detect language from text
        </label>
      </div>

      {/* Voice */}
      <div>
        <label htmlFor="voice-select" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Voice
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          {ttsProvider === "google" ? (
            <select
              id="voice-select"
              value={googleVoiceName ?? ""}
              onChange={(e) => setGoogleVoiceName(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              {filteredGoogleVoices.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.label} ({o.gender})
                </option>
              ))}
            </select>
          ) : (
            <select
              id="voice-select"
              value={voiceURI ?? ""}
              onChange={(e) => setVoiceURI(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              {filteredVoices.length === 0 && <option value="">No voices available</option>}
              {filteredVoices.map((o) => (
                <option key={o.voice.voiceURI} value={o.voice.voiceURI}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handlePreview}
            disabled={
              previewing ||
              (ttsProvider === "browser" ? !voiceURI : !googleVoiceName || googleAvailable === false)
            }
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            {previewing ? "Playing…" : "Preview"}
          </button>
        </div>
        {ttsProvider === "browser" && !voicesLoaded && (
          <p className="mt-1 text-xs text-slate-400">Loading available voices…</p>
        )}
        {ttsProvider === "browser" && voicesLoaded && filteredVoices.length === 0 && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            No {language === "es" ? "Spanish" : "English"} voices were found on this device/browser.
          </p>
        )}
      </div>

      {/* Speed */}
      <div>
        <label htmlFor="speed-select" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Playback speed
        </label>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={rate === s}
              onClick={() => setRate(s)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                rate === s
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div>
        <label htmlFor="font-size" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Text size ({fontSize}px)
        </label>
        <input
          id="font-size"
          type="range"
          min={14}
          max={28}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full accent-indigo-600"
        />
      </div>

      {/* Keep screen awake */}
      <div>
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={keepScreenAwake}
            disabled={!wakeLockSupported}
            onChange={(e) => setKeepScreenAwake(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50"
          />
          Keep screen on while playing (optional)
        </label>
        {wakeLockSupported ? (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Prevents the screen from auto-locking from inactivity during narration. Won&apos;t override manually
            pressing the power button.
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Your browser doesn&apos;t support keeping the screen awake (common on Firefox for Android). Try Chrome
            or Safari for this feature, or keep the screen on manually.
          </p>
        )}
      </div>
    </div>
  );
}
