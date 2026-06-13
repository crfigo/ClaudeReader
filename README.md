# ClaudeReader

A modern web app for narrating text in English or Spanish. Paste text, upload a
PDF/DOCX/TXT file, or import an article from a URL — then listen with
synchronized sentence-by-sentence highlighting, click-to-jump playback, and
full playback controls (play/pause/resume/stop, rewind/forward, speed, and a
seek bar).

## Features

- **Multiple input sources**: paste text, drag-and-drop or upload PDF/DOCX/TXT,
  or import a cleaned article from any URL (via Mozilla Readability).
- **Editable extracted text** before narration begins.
- **English & Spanish voices** via the browser's built-in speech synthesis,
  with automatic language detection and a voice preview button.
- **Optional Google Cloud TTS engine**: switch to higher-quality Neural2
  voices (English & Spanish) when a `GOOGLE_TTS_API_KEY` is configured.
- **Playback controls**: play, pause, resume, stop, previous/next sentence,
  previous/next paragraph, a seek bar, and speed control (0.75x–2x).
- **Synchronized reading**: the active sentence (and word, where supported)
  is highlighted and auto-scrolled into view. Click any sentence to jump
  narration there — even mid-playback.
- **Accessible**: keyboard navigable, ARIA labels, high contrast, large touch
  targets, dark mode.

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- Zustand for state management
- `pdf-parse` (PDF), `mammoth` (DOCX) for file parsing
- `@mozilla/readability` + `jsdom` for URL article extraction
- Browser `SpeechSynthesis` API for narration (no API keys required)
- Optional: Google Cloud Text-to-Speech REST API for higher-quality voices

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables or API keys are required — by default narration runs
entirely in the browser using the operating system / browser's built-in
voices. Available voices (and their quality) vary by browser and OS; Chrome
and Edge on Windows/macOS typically ship several English and Spanish voices.

### Optional: enable Google Cloud TTS

To offer the higher-quality Google Neural2 voices as an alternate "Narration
engine" option in Voice & playback settings:

1. In Google Cloud Console, enable the **Cloud Text-to-Speech API** and create
   an API key.
2. Copy `.env.local.example` to `.env.local` and set:
   ```
   GOOGLE_TTS_API_KEY=your-api-key-here
   ```
3. Restart the dev server. The "Google Cloud TTS" engine option becomes
   selectable once `/api/tts/google` reports the key is configured; otherwise
   a warning explains how to enable it.

The API key is only ever read server-side (in `src/app/api/tts/google/route.ts`)
and is never sent to the browser.

## Project structure

```
src/
  app/
    api/
      extract-url/route.ts   # Fetches a URL and extracts readable article text
      parse-file/route.ts    # Parses uploaded PDF/DOCX/TXT into plain text
      tts/google/route.ts    # Server-side Google Cloud TTS synthesis proxy
    layout.tsx
    page.tsx
  components/
    ReaderApp.tsx             # Top-level layout/composition
    Header.tsx
    InputPanel.tsx            # Paste / Upload / URL tabs
    VoiceSettings.tsx         # Engine, language, voice, speed, font size
    ReaderPanel.tsx           # Synchronized reader with highlighting + edit mode
    PlayerControls.tsx        # Transport controls + seek bar
    StatusBanner.tsx          # Loading & error states
  lib/
    textSegmentation.ts        # Paragraph/sentence segmentation + language detection
    ttsEngine.ts                # SpeechSynthesis wrapper (TTSEngine interface)
    googleTtsEngine.ts           # Google Cloud TTS engine (implements TTSEngine)
  store/
    useReaderStore.ts           # Zustand store: text, voices, playback state, provider
```

## How narration sync works

Text is segmented into paragraphs and sentences with character offsets. The
`SpeechTTSEngine` speaks one sentence-utterance at a time (rather than the
whole document at once), which:

- avoids the ~15s `speechSynthesis.pause()` bug in Chrome on long utterances
- lets playback jump to any sentence instantly (click-to-jump, prev/next,
  seek bar)
- uses the `boundary` event for word-level highlighting where the browser
  supports it, falling back gracefully to sentence-level highlighting

## Adding another cloud TTS provider

`src/lib/ttsEngine.ts` exports a `TTSEngine` interface, implemented by
`SpeechTTSEngine` (browser) and `src/lib/googleTtsEngine.ts`'s `GoogleTTSEngine`
(Google Cloud). To add another provider (Azure Speech, ElevenLabs, etc.):

1. Implement `TTSEngine` with calls to your provider's audio API, generating
   audio server-side via a new API route and keeping API keys server-only.
2. Add a new `TTSProvider` value and engine singleton in
   `useReaderStore.ts`, following the `google` case as a template.
3. Add the provider as an option in `VoiceSettings.tsx`.

## Deploying to Netlify

This repo includes a [`netlify.toml`](netlify.toml) configured with the
official `@netlify/plugin-nextjs` plugin, which supports Next.js 16's App
Router, API routes (as serverless functions), and Turbopack builds.

1. Push this repo to GitHub/GitLab/Bitbucket and create a new Netlify site
   from it (or use `netlify deploy` from the Netlify CLI for a manual deploy).
2. In **Site settings > Environment variables**, add `GOOGLE_TTS_API_KEY`
   with your API key (only needed if you want the Google Cloud TTS engine
   enabled in production). Never commit `.env.local`.
3. Trigger a deploy. Netlify auto-detects the build command (`next build`)
   from `netlify.toml`.

No other configuration is required — file parsing (PDF/DOCX) and URL
extraction run in Netlify's serverless functions (`runtime = "nodejs"`),
and the browser-based narration engine needs no server resources at all.

## Known limitations / next steps

- Voice quality and availability depend on the user's browser/OS.
- PDF text extraction may not perfectly preserve paragraph breaks for complex
  layouts (e.g. multi-column PDFs); use "Edit text" to clean up before playback.
- Scanned/image-only PDFs have no extractable text — the app surfaces a clear
  error in that case.
- V2 ideas: downloadable audio export, saved session history, word-level sync
  on engines that support it, summarization for long documents.
