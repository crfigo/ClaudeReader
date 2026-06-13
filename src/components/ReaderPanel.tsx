"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useReaderStore } from "@/store/useReaderStore";

const SOURCE_LABELS: Record<string, string> = {
  paste: "Pasted text",
  url: "Imported from URL",
  pdf: "PDF document",
  txt: "Text file",
  docx: "Word document",
};

export default function ReaderPanel() {
  const rawText = useReaderStore((s) => s.rawText);
  const paragraphs = useReaderStore((s) => s.paragraphs);
  const flatSentences = useReaderStore((s) => s.flatSentences);
  const currentSentenceIndex = useReaderStore((s) => s.currentSentenceIndex);
  const highlightedWord = useReaderStore((s) => s.highlightedWord);
  const fontSize = useReaderStore((s) => s.fontSize);
  const sourceKind = useReaderStore((s) => s.sourceKind);
  const sourceLabel = useReaderStore((s) => s.sourceLabel);
  const jumpToSentence = useReaderStore((s) => s.jumpToSentence);
  const setText = useReaderStore((s) => s.setText);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(rawText);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSentenceIndex]);

  if (!rawText) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center flex flex-col items-center justify-center min-h-[320px]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
          No text loaded yet
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Paste some text, upload a PDF/DOCX/TXT file, or import an article from a URL using the
          panel to get started. Your text will appear here, ready to read or narrate.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col min-h-[420px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            {sourceKind ? SOURCE_LABELS[sourceKind] : "Document"}
            {sourceLabel ? ` · ${sourceLabel}` : ""}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {paragraphs.length} paragraph{paragraphs.length === 1 ? "" : "s"} ·{" "}
            {flatSentences.length} sentence{flatSentences.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isEditing) {
              setText(draft, sourceKind, sourceLabel);
            } else {
              setDraft(rawText);
            }
            setIsEditing((v) => !v);
          }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          {isEditing ? "Save changes" : "Edit text"}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 max-h-[60vh]">
        {isEditing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="w-full h-full min-h-[320px] resize-y rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
            aria-label="Edit extracted text"
          />
        ) : (
          <div style={{ fontSize: `${fontSize}px`, lineHeight: 1.85 }} className="space-y-4">
            {paragraphs.map((paragraph) => {
              const paragraphHasCurrent = paragraph.sentences.some(
                (s, i) => paragraph.sentences[i] && flatSentences[currentSentenceIndex]?.paragraphIndex === paragraph.index
              );
              return (
                <p
                  key={paragraph.id}
                  className={clsx(
                    "rounded-md px-2 -mx-2 py-1 transition-colors duration-300",
                    paragraphHasCurrent && "bg-indigo-50 dark:bg-indigo-950/30"
                  )}
                >
                  {paragraph.sentences.map((sentence) => {
                    const flat = flatSentences.find(
                      (f) => f.paragraphIndex === paragraph.index && f.start === sentence.start && f.end === sentence.end
                    );
                    const globalIndex = flat?.globalIndex ?? -1;
                    const isCurrent = globalIndex === currentSentenceIndex;
                    const isPast =
                      currentSentenceIndex >= 0 && globalIndex >= 0 && globalIndex < currentSentenceIndex;

                    return (
                      <span
                        key={sentence.id}
                        ref={isCurrent ? activeRef : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => globalIndex >= 0 && jumpToSentence(globalIndex)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && globalIndex >= 0) {
                            e.preventDefault();
                            jumpToSentence(globalIndex);
                          }
                        }}
                        aria-current={isCurrent ? "true" : undefined}
                        aria-label={isCurrent ? "Currently narrating this sentence" : "Jump narration to this sentence"}
                        className={clsx(
                          "cursor-pointer rounded transition-colors duration-150 outline-none",
                          "focus-visible:ring-2 focus-visible:ring-indigo-500",
                          isCurrent && "bg-indigo-200/80 dark:bg-indigo-500/40 text-slate-900 dark:text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.5)]",
                          !isCurrent && isPast && "text-slate-400 dark:text-slate-500",
                          !isCurrent && !isPast && "text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        {isCurrent && highlightedWord ? (
                          <HighlightedSentence sentence={sentence.text} word={highlightedWord} />
                        ) : (
                          sentence.text
                        )}
                        {" "}
                      </span>
                    );
                  })}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightedSentence({
  sentence,
  word,
}: {
  sentence: string;
  word: { charIndex: number; charLength: number };
}) {
  const { charIndex, charLength } = word;
  if (charLength <= 0 || charIndex >= sentence.length) return <>{sentence}</>;

  const end = Math.min(charIndex + charLength, sentence.length);
  const before = sentence.slice(0, charIndex);
  const active = sentence.slice(charIndex, end);
  const after = sentence.slice(end);

  return (
    <>
      {before}
      <span className="bg-indigo-400/60 dark:bg-indigo-300/50 rounded px-0.5">{active}</span>
      {after}
    </>
  );
}
