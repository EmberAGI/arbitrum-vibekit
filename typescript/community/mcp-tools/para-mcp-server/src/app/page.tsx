"use client";

import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3100"}/mcp`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-orange-500 font-sans dark:bg-orange-600">
      <h1 className="text-6xl font-bold text-white dark:text-zinc-50">
        para-mcp-server
      </h1>
      <div className="flex items-center gap-3 rounded-lg bg-white px-6 py-4 shadow-lg dark:bg-zinc-900">
        <span className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          {url}
        </span>
        <button
          onClick={handleCopy}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
