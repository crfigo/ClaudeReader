import { create } from "zustand";
import {
  type Paragraph,
  type FlatSentence,
  segmentText,
  flattenSentences,
  detectLanguage,
} from "@/lib/textSegmentation";
import {
  SpeechTTSEngine,
  loadVoices,
  getVoiceOptions,
  type EngineState,
  type VoiceOption,
} from "@/lib/ttsEngine";
import { GoogleTTSEngine, GOOGLE_VOICE_OPTIONS, type GoogleVoiceOption } from "@/lib/googleTtsEngine";
import { removeNoiseText } from "@/lib/textCleanup";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export type SourceKind = "paste" | "url" | "pdf" | "txt" | "docx" | null;
export type TTSProvider = "browser" | "google";

interface ReaderState {
  // Text + segmentation
  rawText: string;
  paragraphs: Paragraph[];
  flatSentences: FlatSentence[];
  sourceKind: SourceKind;
  sourceLabel: string | null;

  // Text cleanup
  autoCleanText: boolean;

  // Language & voices
  language: "es" | "en";
  autoDetectLanguage: boolean;
  voices: SpeechSynthesisVoice[];
  voiceOptions: VoiceOption[];
  voiceURI: string | null;
  voicesLoaded: boolean;

  // TTS provider (engine)
  ttsProvider: TTSProvider;
  googleAvailable: boolean | null; // null = not checked yet
  googleVoiceName: string | null;

  // Playback
  rate: Speed;
  playbackState: EngineState;
  currentSentenceIndex: number;
  currentParagraphIndex: number;
  highlightedWord: { sentenceIndex: number; charIndex: number; charLength: number } | null;

  // UI / status
  isProcessing: boolean;
  processingMessage: string | null;
  error: string | null;
  fontSize: number;
  darkMode: boolean;

  // Actions
  initVoices: () => Promise<void>;
  setText: (text: string, sourceKind: SourceKind, sourceLabel?: string | null) => void;
  setAutoCleanText: (enabled: boolean) => void;
  setLanguage: (lang: "es" | "en") => void;
  setAutoDetect: (auto: boolean) => void;
  setVoiceURI: (uri: string) => void;
  setProvider: (provider: TTSProvider) => void;
  setGoogleVoiceName: (name: string) => void;
  setRate: (rate: Speed) => void;
  setFontSize: (size: number) => void;
  toggleDarkMode: () => void;
  setProcessing: (isProcessing: boolean, message?: string | null) => void;
  setError: (error: string | null) => void;

  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  nextSentence: () => void;
  previousSentence: () => void;
  nextParagraph: () => void;
  previousParagraph: () => void;
  jumpToParagraph: (paragraphIndex: number) => void;
  jumpToSentence: (globalSentenceIndex: number) => void;
}

let speechEngine: SpeechTTSEngine | null = null;
let googleEngine: GoogleTTSEngine | null = null;

function getSpeechEngine(set: (partial: Partial<ReaderState>) => void, get: () => ReaderState): SpeechTTSEngine {
  if (speechEngine) return speechEngine;

  speechEngine = new SpeechTTSEngine({
    onStateChange: (state) => {
      if (get().ttsProvider === "browser") set({ playbackState: state });
    },
    onSentenceStart: (index) => {
      if (get().ttsProvider !== "browser") return;
      const flat = get().flatSentences;
      const sentence = flat[index];
      set({
        currentSentenceIndex: index,
        currentParagraphIndex: sentence ? sentence.paragraphIndex : get().currentParagraphIndex,
        highlightedWord: null,
      });
    },
    onWordBoundary: (sentenceIndex, charIndex, charLength) => {
      if (get().ttsProvider !== "browser") return;
      set({ highlightedWord: { sentenceIndex, charIndex, charLength } });
    },
    onError: (message) => set({ error: message, isProcessing: false }),
  });

  return speechEngine;
}

function getGoogleEngine(set: (partial: Partial<ReaderState>) => void, get: () => ReaderState): GoogleTTSEngine {
  if (googleEngine) return googleEngine;

  googleEngine = new GoogleTTSEngine({
    onStateChange: (state) => {
      if (get().ttsProvider === "google") set({ playbackState: state });
    },
    onSentenceStart: (index) => {
      if (get().ttsProvider !== "google") return;
      const flat = get().flatSentences;
      const sentence = flat[index];
      set({
        currentSentenceIndex: index,
        currentParagraphIndex: sentence ? sentence.paragraphIndex : get().currentParagraphIndex,
        highlightedWord: null,
      });
    },
    onError: (message) => set({ error: message, isProcessing: false }),
  });

  return googleEngine;
}

function getActiveEngine(set: (partial: Partial<ReaderState>) => void, get: () => ReaderState) {
  return get().ttsProvider === "google" ? getGoogleEngine(set, get) : getSpeechEngine(set, get);
}

function pickVoiceForLanguage(options: VoiceOption[], lang: "es" | "en"): VoiceOption | null {
  const candidates = options.filter((o) => o.lang === lang);
  if (candidates.length === 0) return null;
  // Prefer "natural"/"online"/non-"compact" sounding voices first, then default
  const preferred = candidates.find((c) => /natural|online|enhanced/i.test(c.label));
  return preferred ?? candidates[0];
}

function pickGoogleVoiceForLanguage(lang: "es" | "en"): GoogleVoiceOption {
  return GOOGLE_VOICE_OPTIONS.find((o) => o.lang === lang) ?? GOOGLE_VOICE_OPTIONS[0];
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  rawText: "",
  paragraphs: [],
  flatSentences: [],
  sourceKind: null,
  sourceLabel: null,

  autoCleanText: true,

  language: "en",
  autoDetectLanguage: true,
  voices: [],
  voiceOptions: [],
  voiceURI: null,
  voicesLoaded: false,

  ttsProvider: "browser",
  googleAvailable: null,
  googleVoiceName: pickGoogleVoiceForLanguage("en").name,

  rate: 1,
  playbackState: "idle",
  currentSentenceIndex: -1,
  currentParagraphIndex: -1,
  highlightedWord: null,

  isProcessing: false,
  processingMessage: null,
  error: null,
  fontSize: 18,
  darkMode: false,

  initVoices: async () => {
    const voices = await loadVoices();
    const voiceOptions = getVoiceOptions(voices);
    set({ voices, voiceOptions, voicesLoaded: true });

    const { language, voiceURI } = get();
    if (!voiceURI) {
      const picked = pickVoiceForLanguage(voiceOptions, language);
      if (picked) set({ voiceURI: picked.voice.voiceURI });
    }

    try {
      const res = await fetch("/api/tts/google");
      const data = await res.json();
      set({ googleAvailable: Boolean(data.configured) });
    } catch {
      set({ googleAvailable: false });
    }
  },

  setAutoCleanText: (enabled) => set({ autoCleanText: enabled }),

  setText: (rawInput, sourceKind, sourceLabel = null) => {
    getSpeechEngine(set, get).stop();
    getGoogleEngine(set, get).stop();

    const text = get().autoCleanText ? removeNoiseText(rawInput) : rawInput;
    const paragraphs = segmentText(text);
    const flatSentences = flattenSentences(paragraphs);
    const detected = text.trim() ? detectLanguage(text) : get().language;

    const { autoDetectLanguage, voiceOptions } = get();
    const language = autoDetectLanguage ? detected : get().language;

    let voiceURI = get().voiceURI;
    const currentVoiceMatchesLang = voiceOptions.find((o) => o.voice.voiceURI === voiceURI)?.lang === language;
    if (!currentVoiceMatchesLang) {
      const picked = pickVoiceForLanguage(voiceOptions, language);
      if (picked) voiceURI = picked.voice.voiceURI;
    }

    let googleVoiceName = get().googleVoiceName;
    const currentGoogleMatchesLang = GOOGLE_VOICE_OPTIONS.find((o) => o.name === googleVoiceName)?.lang === language;
    if (!currentGoogleMatchesLang) {
      googleVoiceName = pickGoogleVoiceForLanguage(language).name;
    }

    const sentenceTexts = flatSentences.map((s) => s.text);
    getSpeechEngine(set, get).loadQueue(sentenceTexts);
    getGoogleEngine(set, get).loadQueue(sentenceTexts);

    set({
      rawText: text,
      paragraphs,
      flatSentences,
      sourceKind,
      sourceLabel,
      language,
      voiceURI,
      googleVoiceName,
      currentSentenceIndex: -1,
      currentParagraphIndex: -1,
      highlightedWord: null,
      playbackState: "idle",
      error: null,
    });
  },

  setLanguage: (lang) => {
    const { voiceOptions } = get();
    const picked = pickVoiceForLanguage(voiceOptions, lang);
    set({
      language: lang,
      voiceURI: picked ? picked.voice.voiceURI : get().voiceURI,
      googleVoiceName: pickGoogleVoiceForLanguage(lang).name,
    });
  },

  setAutoDetect: (auto) => set({ autoDetectLanguage: auto }),

  setVoiceURI: (uri) => {
    set({ voiceURI: uri });
    const { voiceOptions } = get();
    const option = voiceOptions.find((o) => o.voice.voiceURI === uri);
    if (option) {
      getSpeechEngine(set, get).setVoice(option.voice);
      set({ language: option.lang });
    }
  },

  setProvider: (provider) => {
    if (provider === get().ttsProvider) return;

    getSpeechEngine(set, get).stop();
    getGoogleEngine(set, get).stop();

    const { currentSentenceIndex } = get();
    set({ ttsProvider: provider, playbackState: "idle" });

    // Preserve playback position by re-seeking the newly active engine.
    if (currentSentenceIndex >= 0) {
      getActiveEngine(set, get).seekTo(currentSentenceIndex);
    }
  },

  setGoogleVoiceName: (name) => {
    set({ googleVoiceName: name });
    const option = GOOGLE_VOICE_OPTIONS.find((o) => o.name === name);
    if (option) {
      getGoogleEngine(set, get).setVoice(option);
      set({ language: option.lang });
    }
  },

  setRate: (rate) => {
    set({ rate });
    getSpeechEngine(set, get).setRate(rate);
    getGoogleEngine(set, get).setRate(rate);
  },

  setFontSize: (size) => set({ fontSize: Math.min(28, Math.max(14, size)) }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  setProcessing: (isProcessing, message = null) => set({ isProcessing, processingMessage: message }),
  setError: (error) => set({ error }),

  play: () => {
    const { flatSentences, voiceOptions, voiceURI, googleVoiceName, rate, currentSentenceIndex, ttsProvider, googleAvailable } = get();
    if (flatSentences.length === 0) {
      set({ error: "There's no text to narrate yet. Add some text first." });
      return;
    }
    if (ttsProvider === "google" && !googleAvailable) {
      set({ error: "Google Cloud TTS isn't configured on this server. Switch to the browser voice, or set GOOGLE_TTS_API_KEY." });
      return;
    }

    const startIndex = currentSentenceIndex >= 0 ? currentSentenceIndex : 0;

    if (ttsProvider === "google") {
      const eng = getGoogleEngine(set, get);
      const option = GOOGLE_VOICE_OPTIONS.find((o) => o.name === googleVoiceName) ?? null;
      eng.setVoice(option);
      eng.setRate(rate);
      eng.play(startIndex);
    } else {
      const eng = getSpeechEngine(set, get);
      const option = voiceOptions.find((o) => o.voice.voiceURI === voiceURI) ?? null;
      eng.setVoice(option ? option.voice : null);
      eng.setRate(rate);
      eng.play(startIndex);
    }
  },

  pause: () => getActiveEngine(set, get).pause(),
  resume: () => getActiveEngine(set, get).resume(),
  stop: () => {
    getActiveEngine(set, get).stop();
    set({ currentSentenceIndex: -1, currentParagraphIndex: -1, highlightedWord: null });
  },

  nextSentence: () => getActiveEngine(set, get).next(),
  previousSentence: () => getActiveEngine(set, get).previous(),

  nextParagraph: () => {
    const { currentParagraphIndex, flatSentences, paragraphs } = get();
    const targetParagraph = Math.min(currentParagraphIndex + 1, paragraphs.length - 1);
    const firstSentence = flatSentences.find((s) => s.paragraphIndex === targetParagraph);
    if (firstSentence) getActiveEngine(set, get).seekTo(firstSentence.globalIndex);
  },

  previousParagraph: () => {
    const { currentParagraphIndex, flatSentences } = get();
    const targetParagraph = Math.max(currentParagraphIndex - 1, 0);
    const firstSentence = flatSentences.find((s) => s.paragraphIndex === targetParagraph);
    if (firstSentence) getActiveEngine(set, get).seekTo(firstSentence.globalIndex);
  },

  jumpToParagraph: (paragraphIndex) => {
    const { flatSentences, playbackState } = get();
    const firstSentence = flatSentences.find((s) => s.paragraphIndex === paragraphIndex);
    if (!firstSentence) return;
    const eng = getActiveEngine(set, get);
    if (playbackState === "playing" || playbackState === "paused") {
      eng.seekTo(firstSentence.globalIndex);
      if (playbackState === "paused") eng.pause();
    } else {
      set({
        currentSentenceIndex: firstSentence.globalIndex,
        currentParagraphIndex: paragraphIndex,
        highlightedWord: null,
      });
    }
  },

  jumpToSentence: (globalSentenceIndex) => {
    const { playbackState } = get();
    const eng = getActiveEngine(set, get);
    if (playbackState === "playing" || playbackState === "paused") {
      eng.seekTo(globalSentenceIndex);
      if (playbackState === "paused") eng.pause();
    } else {
      const sentence = get().flatSentences[globalSentenceIndex];
      if (!sentence) return;
      set({
        currentSentenceIndex: globalSentenceIndex,
        currentParagraphIndex: sentence.paragraphIndex,
        highlightedWord: null,
      });
    }
  },
}));
