"use client";

import dynamic from "next/dynamic";

const ReaderApp = dynamic(() => import("@/components/ReaderApp"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-400 dark:text-slate-500">Loading ClaudeReader…</p>
    </div>
  ),
});

export default function Home() {
  return <ReaderApp />;
}
