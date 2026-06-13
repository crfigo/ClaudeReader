/**
 * Thin wrapper around the browser SpeechSynthesis API.
 *
 * The document is spoken one sentence-utterance at a time (rather than one
 * giant utterance) because:
 *  - it lets us jump to/from any sentence instantly
 *  - it avoids Chrome's ~15s `speechSynthesis.pause()` bug on long utterances
 *  - it gives us a natural "sentence boundary" callback for highlighting
 *
 * This class is the only place that talks to `window.speechSynthesis`, so a
 * future cloud TTS provider (Azure/ElevenLabs/etc.) can implement the same
 * `TTSEngine` interface without touching UI code.
 */

export type EngineState = "idle" | "playing" | "paused" | "loading" | "ended" | "error";

export interface TTSEngineCallbacks {
  onSentenceStart?: (index: number) => void;
  onSentenceEnd?: (index: number) => void;
  onWordBoundary?: (sentenceIndex: number, charIndex: number, charLength: number) => void;
  onStateChange?: (state: EngineState) => void;
  onError?: (message: string) => void;
}

/**
 * Shared contract for narration engines. Voice selection is intentionally
 * NOT part of this interface — each engine has a different voice model
 * (browser `SpeechSynthesisVoice` vs. Google's `{name, languageCode}`), so
 * the store talks to each engine's own `setVoice` method directly.
 */
export interface TTSEngine {
  loadQueue(sentences: string[]): void;
  play(startIndex?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seekTo(index: number): void;
  setRate(rate: number): void;
  getCurrentIndex(): number;
  getState(): EngineState;
  destroy(): void;
}

const SENTENCE_PAUSE_MS = 120;

export class SpeechTTSEngine implements TTSEngine {
  private sentences: string[] = [];
  private currentIndex = 0;
  private rate = 1;
  private voice: SpeechSynthesisVoice | null = null;
  private state: EngineState = "idle";
  private callbacks: TTSEngineCallbacks;
  private utterance: SpeechSynthesisUtterance | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalCancel = false;

  constructor(callbacks: TTSEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  loadQueue(sentences: string[]) {
    this.stop();
    this.sentences = sentences;
    this.currentIndex = 0;
    this.setState("idle");
  }

  setRate(rate: number) {
    this.rate = rate;
    // SpeechSynthesisUtterance.rate can't be changed mid-utterance, so if
    // we're actively speaking, restart the current sentence at the new rate.
    if (this.state === "playing") {
      this.speakIndex(this.currentIndex);
    }
  }

  setVoice(voice: SpeechSynthesisVoice | null) {
    this.voice = voice;
    if (this.state === "playing") {
      this.speakIndex(this.currentIndex);
    }
  }

  play(startIndex = 0) {
    if (this.sentences.length === 0) return;
    this.currentIndex = Math.max(0, Math.min(startIndex, this.sentences.length - 1));
    this.speakIndex(this.currentIndex);
  }

  pause() {
    if (this.state !== "playing") return;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    window.speechSynthesis.pause();
    this.setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    window.speechSynthesis.resume();
    this.setState("playing");
  }

  stop() {
    this.intentionalCancel = true;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.utterance = null;
    this.setState("idle");
  }

  next() {
    this.seekTo(this.currentIndex + 1);
  }

  previous() {
    this.seekTo(this.currentIndex - 1);
  }

  seekTo(index: number) {
    if (index < 0 || index >= this.sentences.length) {
      if (index >= this.sentences.length) {
        this.stop();
        this.setState("ended");
      }
      return;
    }
    const wasPlaying = this.state === "playing" || this.state === "paused";
    this.currentIndex = index;
    if (wasPlaying) {
      this.speakIndex(index);
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

  private speakIndex(index: number) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      this.callbacks.onError?.("Speech synthesis is not supported in this browser.");
      this.setState("error");
      return;
    }

    this.intentionalCancel = true;
    window.speechSynthesis.cancel();
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }

    const text = this.sentences[index];
    if (text === undefined) {
      this.setState("ended");
      return;
    }

    this.currentIndex = index;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate;
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    }

    utterance.onboundary = (e) => {
      const length = "charLength" in e && typeof e.charLength === "number" ? e.charLength : 0;
      this.callbacks.onWordBoundary?.(index, e.charIndex, length);
    };

    utterance.onstart = () => {
      this.intentionalCancel = false;
      this.callbacks.onSentenceStart?.(index);
    };

    utterance.onend = () => {
      if (this.intentionalCancel) return;
      this.callbacks.onSentenceEnd?.(index);
      const nextIndex = index + 1;
      if (nextIndex < this.sentences.length) {
        this.pauseTimer = setTimeout(() => this.speakIndex(nextIndex), SENTENCE_PAUSE_MS);
      } else {
        this.setState("ended");
      }
    };

    utterance.onerror = (e) => {
      if (this.intentionalCancel) return;
      this.callbacks.onError?.(`Speech error: ${e.error}`);
      this.setState("error");
    };

    this.utterance = utterance;
    this.setState("playing");
    // Cancel flag must be cleared before speak() resolves the new utterance.
    this.intentionalCancel = false;
    window.speechSynthesis.speak(utterance);
  }
}

/** Loads available voices, waiting for the async `voiceschanged` event if needed. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const handler = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve(voices);
      }
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    // Fallback in case the event never fires
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1500);
  });
}

export interface VoiceOption {
  voice: SpeechSynthesisVoice;
  label: string;
  lang: "es" | "en";
}

/** Friendly labels + filtering for ES/EN voices, grouped by language. */
export function getVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith("es") || v.lang.toLowerCase().startsWith("en"))
    .map((v) => {
      const lang: "es" | "en" = v.lang.toLowerCase().startsWith("es") ? "es" : "en";
      // Many platform voices already encode language/region in their name
      // (e.g. "Microsoft Mark - English (United States)"), so avoid repeating it.
      const label = /english|spanish|español|\([a-z]{2}(-|_)?[a-z]{2}\)/i.test(v.name)
        ? v.name
        : `${v.name} (${v.lang})`;
      return { voice: v, label, lang };
    });
}
