/**
 * Splits raw text into paragraphs and, within each paragraph, into sentences.
 * Every segment keeps its character offsets in the *original* text so the
 * highlighter and TTS engine can stay in sync without re-parsing.
 */

export interface Sentence {
  id: string;
  text: string;
  start: number; // char offset within parent paragraph
  end: number;
}

export interface Paragraph {
  id: string;
  index: number;
  text: string;
  sentences: Sentence[];
}

// Splits on '.', '!', '?', '...' and common Spanish punctuation while keeping
// abbreviations (Mr., Dr., etc.) reasonably intact via a simple heuristic.
const SENTENCE_REGEX = /[^.!?¿¡]+(?:[.!?]+(?:["'”’])?|$)/g;

const ABBREVIATIONS = new Set([
  "sr.", "sra.", "srta.", "dr.", "dra.", "ing.", "lic.", "etc.", "vs.",
  "mr.", "mrs.", "ms.", "dr.", "prof.", "no.", "vol.", "p.", "pp.",
]);

function splitSentences(paragraphText: string): Sentence[] {
  const raw = paragraphText.match(SENTENCE_REGEX) ?? [paragraphText];
  const sentences: Sentence[] = [];
  let cursor = 0;
  let buffer = "";
  let bufferStart = 0;

  for (let i = 0; i < raw.length; i++) {
    const chunk = raw[i];
    if (chunk.trim().length === 0) {
      cursor += chunk.length;
      continue;
    }

    if (buffer === "") bufferStart = cursor;
    buffer += chunk;
    cursor += chunk.length;

    const trimmed = buffer.trim().toLowerCase();
    const lastWord = trimmed.split(/\s+/).pop() ?? "";
    const isAbbreviation = ABBREVIATIONS.has(lastWord);
    const isLast = i === raw.length - 1;

    if (!isAbbreviation || isLast) {
      const text = buffer.trim();
      if (text.length > 0) {
        sentences.push({
          id: `s-${bufferStart}-${cursor}`,
          text,
          start: bufferStart,
          end: cursor,
        });
      }
      buffer = "";
    }
  }

  if (sentences.length === 0 && paragraphText.trim().length > 0) {
    sentences.push({
      id: `s-0-${paragraphText.length}`,
      text: paragraphText.trim(),
      start: 0,
      end: paragraphText.length,
    });
  }

  return sentences;
}

/**
 * Normalizes whitespace and splits text into paragraphs on blank lines
 * (or single newlines if no blank lines are present, e.g. PDF extraction).
 */
export function segmentText(rawText: string): Paragraph[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  let blocks = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  // Fallback: single-newline documents (common with PDF text extraction)
  if (blocks.length <= 1) {
    blocks = normalized
      .split(/\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);
  }

  return blocks.map((text, index) => ({
    id: `p-${index}`,
    index,
    text,
    sentences: splitSentences(text),
  }));
}

/** Flattened view used by the TTS queue: every sentence across the document. */
export interface FlatSentence extends Sentence {
  paragraphIndex: number;
  globalIndex: number;
}

export function flattenSentences(paragraphs: Paragraph[]): FlatSentence[] {
  const flat: FlatSentence[] = [];
  paragraphs.forEach((p) => {
    p.sentences.forEach((s) => {
      flat.push({ ...s, paragraphIndex: p.index, globalIndex: flat.length });
    });
  });
  return flat;
}

/** Rough language detection between Spanish and English using common-word heuristics. */
export function detectLanguage(text: string): "es" | "en" {
  const sample = text.slice(0, 2000).toLowerCase();
  const esMarkers = [
    " el ", " la ", " los ", " las ", " de ", " que ", " y ", " en ", " un ",
    " una ", " es ", " para ", " con ", " no ", " por ", "ñ", "¿", "¡",
    "á", "é", "í", "ó", "ú",
  ];
  const enMarkers = [
    " the ", " and ", " of ", " to ", " in ", " is ", " that ", " for ",
    " with ", " on ", " as ", " was ", " are ",
  ];

  let esScore = 0;
  let enScore = 0;
  for (const m of esMarkers) if (sample.includes(m)) esScore++;
  for (const m of enMarkers) if (sample.includes(m)) enScore++;

  return esScore >= enScore ? "es" : "en";
}
