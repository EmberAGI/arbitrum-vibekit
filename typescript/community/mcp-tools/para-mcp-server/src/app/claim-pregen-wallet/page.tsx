"use client";

import { useEffect, useState } from "react";
import { useIsChatGptApp, useWidgetProps } from "@/app/hooks";
import { baseURL } from "@/config/baseUrl";
import ClaimPregenWalletClient from "@/components/ClaimPregenWalletClient";

type ClaimWidgetProps = {
  success?: boolean;
  url?: string;
  wallet?: {
    id?: string;
    email?: string;
  };
};

export default function ClaimPregenWallet() {
  const isChatGptApp = useIsChatGptApp();
  const toolOutput = useWidgetProps<ClaimWidgetProps>();
  const [resolvedWalletId, setResolvedWalletId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const widgetWalletId = toolOutput?.wallet?.id as string | undefined;
  const widgetEmail = toolOutput?.wallet?.email as string | undefined;

  useEffect(() => {
    if (widgetWalletId) {
      setResolvedWalletId(widgetWalletId);
      setResolveError(null);
      setIsResolving(false);
      return;
    }

    if (widgetEmail) {
      let cancelled = false;
      setIsResolving(true);
      setResolveError(null);

      (async () => {
        try {
          const response = await fetch(
            `${baseURL}/api/pregen-wallets/by-email?email=${encodeURIComponent(widgetEmail)}`,
          );
          const data = await response.json();
          if (!response.ok) {
            if (!cancelled) {
              setResolveError(
                typeof data.error === "string"
                  ? data.error
                  : "Failed to resolve wallet from email",
              );
              setIsResolving(false);
            }
            return;
          }

          if (!cancelled) {
            setResolvedWalletId(data.walletId as string);
            setIsResolving(false);
          }
        } catch (error) {
          if (!cancelled) {
            setResolveError(
              error instanceof Error
                ? error.message
                : "Failed to resolve wallet from email",
            );
            setIsResolving(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    // No id or email provided
    setResolvedWalletId(null);
    setResolveError(null);
    setIsResolving(false);
  }, [widgetWalletId, widgetEmail]);

  // When running inside ChatGPT Apps, wait for the widget props to arrive
  // before deciding whether to render the wallet-specific flow or fallback.
  if (isChatGptApp && toolOutput == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            <svg
              className="h-5 w-5 animate-spin text-zinc-400"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
              />
            </svg>
            <span className="text-sm">Loading claim data from ChatGPT app...</span>
          </div>
        </main>
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Unable to load wallet
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{resolveError}</p>
        </main>
      </div>
    );
  }

  // If this page is being rendered as a ChatGPT widget with a specific
  // pregenerated wallet id (either directly or resolved from email),
  // delegate to the ClaimPregenWalletClient for the wallet-specific flow.
  if (resolvedWalletId) {
    return <ClaimPregenWalletClient walletId={resolvedWalletId} />;
  }

  if (isResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
            <svg
              className="h-5 w-5 animate-spin text-zinc-400"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
              />
            </svg>
            <span className="text-sm">Resolving wallet from email...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Claim Pregenerated Wallet
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This page is intended to be used with a specific pregenerated wallet
          claim link. If you followed a claim link, it should include the wallet
          ID automatically.
        </p>
      </main>
    </div>
  );
}
