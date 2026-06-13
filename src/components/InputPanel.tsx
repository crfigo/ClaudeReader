"use client";

import { useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { useReaderStore } from "@/store/useReaderStore";

type Tab = "paste" | "upload" | "url";

const TABS: { id: Tab; label: string }[] = [
  { id: "paste", label: "Paste text" },
  { id: "upload", label: "Upload file" },
  { id: "url", label: "From URL" },
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"];

export default function InputPanel() {
  const [tab, setTab] = useState<Tab>("paste");
  const [pasteValue, setPasteValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setText = useReaderStore((s) => s.setText);
  const setProcessing = useReaderStore((s) => s.setProcessing);
  const setError = useReaderStore((s) => s.setError);
  const isProcessing = useReaderStore((s) => s.isProcessing);
  const stop = useReaderStore((s) => s.stop);

  const handlePasteSubmit = useCallback(() => {
    if (!pasteValue.trim()) {
      setError("The text box is empty. Paste or type some text first.");
      return;
    }
    stop();
    setText(pasteValue, "paste");
    setError(null);
  }, [pasteValue, setText, setError, stop]);

  const handleClipboardPaste = useCallback(async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        setError("Your clipboard appears to be empty.");
        return;
      }
      setPasteValue(clipText);
      setError(null);
    } catch {
      setError(
        "We couldn't read your clipboard. Your browser may require a permission grant — try pasting with Ctrl/Cmd+V instead."
      );
    }
  }, [setError]);

  const handleFile = useCallback(
    async (file: File) => {
      const lowerName = file.name.toLowerCase();
      const isAccepted = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      if (!isAccepted) {
        setError("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
        return;
      }

      setProcessing(true, `Extracting text from ${file.name}...`);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-file", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "We couldn't process this file.");
          return;
        }

        stop();
        const kind = lowerName.endsWith(".pdf") ? "pdf" : lowerName.endsWith(".docx") ? "docx" : "txt";
        setText(data.text, kind, file.name);
      } catch {
        setError("Something went wrong while uploading the file. Please check your connection and try again.");
      } finally {
        setProcessing(false);
      }
    },
    [setText, setProcessing, setError, stop]
  );

  const handleUrlSubmit = useCallback(async () => {
    if (!urlValue.trim()) {
      setError("Please enter a URL to import.");
      return;
    }

    setProcessing(true, "Fetching and extracting article content...");
    setError(null);

    try {
      const res = await fetch("/api/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlValue.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "We couldn't import this URL.");
        return;
      }

      stop();
      setText(data.text, "url", data.title ?? urlValue.trim());
    } catch {
      setError("Something went wrong while fetching this URL. Please check your connection and try again.");
    } finally {
      setProcessing(false);
    }
  }, [urlValue, setText, setProcessing, setError, stop]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div role="tablist" aria-label="Text input method" className="flex border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-[-2px]",
              tab === t.id
                ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-b-2 border-transparent"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {tab === "paste" && (
          <div className="space-y-3">
            <label htmlFor="paste-textarea" className="sr-only">
              Paste or type your text
            </label>
            <textarea
              id="paste-textarea"
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder="Paste or type any text here — an article, an essay, your notes..."
              rows={8}
              className="w-full resize-y rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleClipboardPaste}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                Paste from clipboard
              </button>
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                Load text
              </button>
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={clsx(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                isDragging
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-slate-300 dark:border-slate-700"
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-10 h-10 text-slate-400"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Drag and drop a PDF, DOCX, or TXT file
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">or</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                Choose a file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-slate-400 dark:text-slate-500">Max file size: 25MB</p>
            </div>
          </div>
        )}

        {tab === "url" && (
          <div className="space-y-3">
            <label htmlFor="url-input" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Article URL
            </label>
            <div className="flex gap-2">
              <input
                id="url-input"
                type="url"
                inputMode="url"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUrlSubmit();
                }}
                placeholder="https://example.com/article"
                className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                Import
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              We&apos;ll fetch the page and extract the main article text, removing menus, ads, and other clutter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
