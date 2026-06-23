import type { EngineState, TTSEngine, TTSEngineCallbacks } from "./ttsEngine";

export interface GoogleVoiceOption {
  name: string; // e.g. "en-US-Neural2-F"
  languageCode: string; // e.g. "en-US"
  label: string;
  lang: "es" | "en";
  gender: "Female" | "Male";
}

/**
 * Curated set of high-quality Google Cloud Text-to-Speech voices covering
 * English and Spanish. Voice names follow Google's stable naming scheme
 * (https://cloud.google.com/text-to-speech/docs/voices) so these remain
 * valid as long as the corresponding API key has access to Neural2 voices.
 */
export const GOOGLE_VOICE_OPTIONS: GoogleVoiceOption[] = [
  { name: "en-US-Neural2-F", languageCode: "en-US", label: "English (US) — Neural2 F", lang: "en", gender: "Female" },
  { name: "en-US-Neural2-D", languageCode: "en-US", label: "English (US) — Neural2 D", lang: "en", gender: "Male" },
  { name: "en-US-Neural2-C", languageCode: "en-US", label: "English (US) — Neural2 C", lang: "en", gender: "Female" },
  { name: "en-GB-Neural2-A", languageCode: "en-GB", label: "English (UK) — Neural2 A", lang: "en", gender: "Female" },
  { name: "en-GB-Neural2-B", languageCode: "en-GB", label: "English (UK) — Neural2 B", lang: "en", gender: "Male" },
  { name: "es-ES-Neural2-A", languageCode: "es-ES", label: "Spanish (Spain) — Neural2 A", lang: "es", gender: "Female" },
  { name: "es-ES-Neural2-B", languageCode: "es-ES", label: "Spanish (Spain) — Neural2 B", lang: "es", gender: "Male" },
  { name: "es-ES-Neural2-C", languageCode: "es-ES", label: "Spanish (Spain) — Neural2 C", lang: "es", gender: "Female" },
  { name: "es-US-Neural2-A", languageCode: "es-US", label: "Spanish (US) — Neural2 A", lang: "es", gender: "Female" },
  { name: "es-US-Neural2-B", languageCode: "es-US", label: "Spanish (US) — Neural2 B", lang: "es", gender: "Male" },
  { name: "es-US-Neural2-C", languageCode: "es-US", label: "Spanish (US) — Neural2 C", lang: "es", gender: "Female" },
];

/**
 * Narrates text using Google Cloud Text-to-Speech via the `/api/tts/google`
 * route (keeps the API key server-side). Each sentence is synthesized to an
 * MP3 data URL on demand, cached, and played through an `<audio>` element.
 * Playback speed is applied via `audio.playbackRate` so changing speed never
 * requires re-synthesizing audio.
 */
export class GoogleTTSEngine implements TTSEngine {
  private sentences: string[] = [];
  private currentIndex = 0;
  private rate = 1;
  private voice: GoogleVoiceOption | null = null;
  private state: EngineState = "idle";
  private callbacks: TTSEngineCallbacks;
  private audio: HTMLAudioElement | null = null;
  private audioCache = new Map<string, string>();
  private prefetchedKeys = new Set<string>();
  private activeRequest: AbortController | null = null;
  private generation = 0;

  constructor(callbacks: TTSEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  loadQueue(sentences: string[]) {
    this.stop();
    this.sentences = sentences;
    this.currentIndex = 0;
    this.audioCache.clear();
    this.prefetchedKeys.clear();
    this.setState("idle");
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  setVoice(voice: GoogleVoiceOption | null) {
    const changed = voice?.name !== this.voice?.name;
    this.voice = voice;
    if (changed) {
      this.audioCache.clear();
      this.prefetchedKeys.clear();
    }
    if (changed && (this.state === "playing" || this.state === "loading")) {
      this.playIndex(this.currentIndex);
    }
  }

  play(startIndex = 0) {
    if (this.sentences.length === 0) return;
    this.currentIndex = Math.max(0, Math.min(startIndex, this.sentences.length - 1));
    this.playIndex(this.currentIndex);
  }

  pause() {
    if (this.state === "loading") {
      // Cancel the in-flight request; resume() will re-fetch from the cache or network.
      this.generation++;
      this.activeRequest?.abort();
      this.setState("paused");
      return;
    }
    if (this.state !== "playing") return;
    this.audio?.pause();
    this.setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    if (!this.audio) {
      this.playIndex(this.currentIndex);
      return;
    }
    this.audio.play().catch((e) => this.callbacks.onError?.(String(e)));
    this.setState("playing");
  }

  stop() {
    this.generation++;
    this.activeRequest?.abort();
    this.activeRequest = null;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    this.setState("idle");
  }

  next() {
    this.seekTo(this.currentIndex + 1);
  }

  previous() {
    this.seekTo(this.currentIndex - 1);
  }

  seekTo(index: number) {
    if (index >= this.sentences.length) {
      this.stop();
      this.setState("ended");
      return;
    }
    if (index < 0) return;

    const wasActive = this.state === "playing" || this.state === "paused" || this.state === "loading";
    this.currentIndex = index;
    if (wasActive) {
      this.playIndex(index);
    } else {
      this.callbacks.onSentenceStart?.(index);
    }
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getState() {
    return this.state;
  }

  destroy() {
    this.stop();
  }

  private setState(state: EngineState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private async playIndex(index: number) {
    const text = this.sentences[index];
    if (text === undefined) {
      this.setState("ended");
      return;
    }
    if (!this.voice) {
      this.callbacks.onError?.("No Google voice selected.");
      this.setState("error");
      return;
    }

    this.generation++;
    const myGeneration = this.generation;
    this.activeRequest?.abort();
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }

    this.currentIndex = index;
    this.setState("loading");

    // Kick these off in parallel with fetching the current sentence, so they
    // have the longest possible head start (current fetch + current
    // playback time) before they're actually needed.
    this.prefetchSentence(this.sentences[index + 1]);
    this.prefetchSentence(this.sentences[index + 2]);

    try {
      const dataUrl = await this.getAudioForSentence(text);
      if (myGeneration !== this.generation) return; // superseded by a newer request

      const audio = new Audio(dataUrl);
      audio.playbackRate = this.rate;
      audio.onended = () => {
        if (myGeneration !== this.generation) return;
        this.callbacks.onSentenceEnd?.(index);
        const nextIndex = index + 1;
        if (nextIndex < this.sentences.length) {
          // Advance immediately rather than via setTimeout: background tabs
          // throttle timers (sometimes to once a second or slower), which
          // turned the intended ~100ms pause into multi-second gaps once the
          // screen was off or another app was in front. The `<audio>`
          // `ended` event itself isn't throttled, so chaining straight off
          // it keeps the transition snappy regardless of tab visibility.
          this.playIndex(nextIndex);
        } else {
          this.setState("ended");
        }
      };
      audio.onerror = () => {
        if (myGeneration !== this.generation) return;
        this.callbacks.onError?.("Audio playback failed.");
        this.setState("error");
      };

      this.audio = audio;
      this.callbacks.onSentenceStart?.(index);
      this.setState("playing");
      await audio.play();
    } catch (err) {
      if (myGeneration !== this.generation) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      this.callbacks.onError?.(err instanceof Error ? err.message : "Google TTS request failed.");
      this.setState("error");
    }
  }

  private async getAudioForSentence(text: string): Promise<string> {
    const voice = this.voice!;
    const cacheKey = `${voice.name}::${text}`;
    const cached = this.audioCache.get(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    this.activeRequest = controller;

    const res = await fetch("/api/tts/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceName: voice.name, languageCode: voice.languageCode }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Google TTS request failed.");
    }

    const dataUrl = `data:audio/mp3;base64,${data.audioContent}`;
    this.audioCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  /**
   * Fetches and caches an upcoming sentence's audio in the background while
   * an earlier one is still playing, so by the time it's needed there's
   * little to no network latency before it can start.
   */
  private prefetchSentence(text: string | undefined) {
    const voice = this.voice;
    if (!text || !voice) return;

    const cacheKey = `${voice.name}::${text}`;
    if (this.audioCache.has(cacheKey) || this.prefetchedKeys.has(cacheKey)) return;
    this.prefetchedKeys.add(cacheKey);

    fetch("/api/tts/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceName: voice.name, languageCode: voice.languageCode }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.audioContent) {
          this.audioCache.set(cacheKey, `data:audio/mp3;base64,${data.audioContent}`);
        }
      })
      .catch(() => {
        // Best-effort — if this fails, playIndex() will just fetch it normally when it's needed.
      });
  }
}
