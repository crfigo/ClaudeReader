"use client";

import { useEffect } from "react";
import { useReaderStore } from "@/store/useReaderStore";
import Header from "@/components/Header";
import InputPanel from "@/components/InputPanel";
import VoiceSettings from "@/components/VoiceSettings";
import ReaderPanel from "@/components/ReaderPanel";
import PlayerControls from "@/components/PlayerControls";
import StatusBanner from "@/components/StatusBanner";

export default function ReaderApp() {
  const darkMode = useReaderStore((s) => s.darkMode);
  const initVoices = useReaderStore((s) => s.initVoices);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    initVoices();
  }, [initVoices]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <StatusBanner />
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          <aside className="space-y-6 lg:order-1 order-2">
            <InputPanel />
            <VoiceSettings />
          </aside>
          <section className="space-y-4 lg:order-2 order-1">
            <ReaderPanel />
            <PlayerControls />
          </section>
        </div>
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-800 py-4">
        <p className="max-w-7xl mx-auto px-4 sm:px-6 text-xs text-slate-400 dark:text-slate-500">
          Text is processed only to extract content and is not stored on our servers. Narration
          runs locally in your browser using its built-in speech synthesis voices.
        </p>
      </footer>
    </div>
  );
}
