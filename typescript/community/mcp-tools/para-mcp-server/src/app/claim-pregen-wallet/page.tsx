"use client";

import { openPopup, useClient } from "@getpara/react-sdk";
import { useEffect, useState } from "react";

export default function ClaimPregenWallet() {
  const [userShare, setUserShare] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const para = useClient();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!para) {
          if (active) setIsLoggedIn(false);
          return;
        }
        const authed = await para.isFullyLoggedIn();
        if (active) setIsLoggedIn(authed);
      } catch {
        if (active) setIsLoggedIn(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [para]);

  const handleLogin = async () => {
    setStatus("loading");
    setMessage("");
    try {
      if (!para) throw new Error("Para client not ready");
      let authed = await para.isFullyLoggedIn();
      if (!authed) {
        const url = await para.refreshSession({ shouldOpenPopup: true });
        const popupRef = openPopup({
          url,
          target: "para-login",
          type: "LOGIN_PASSKEY",
        });
        await para.waitForLoginAndSetup({ popupWindow: popupRef?.window });
        authed = await para.isFullyLoggedIn();
      }
      if (!authed)
        throw new Error("Login failed. Please complete Para authentication.");

      setIsLoggedIn(true);
      setStatus("idle");
      setMessage("Logged in with Para. You can now claim the wallet.");
    } catch (err) {
      setIsLoggedIn(false);
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Failed to login with Para",
      );
    }
  };

  const handleClaim = async () => {
    if (!userShare.trim()) {
      setStatus("error");
      setMessage("Please enter a user share");
      return;
    }

    setStatus("loading");
    setMessage("");
    setRecoverySecret("");

    try {
      if (!para) throw new Error("Para client not ready");

      // Load the user share
      await para.setUserShare(userShare);

      // Claim pregenerated wallet to retrieve recovery secret
      const claimedRecoverySecret = await para.claimPregenWallets();

      // Notify server (for cache invalidation)
      const response = await fetch("/claim-pregen-wallet/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userShare,
          recoverySecret: claimedRecoverySecret,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to finalize wallet claim");
      }

      setStatus("success");
      setMessage("Wallet claimed successfully!");
      if (claimedRecoverySecret) {
        setRecoverySecret(claimedRecoverySecret);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-8 rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Claim Pregenerated Wallet
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Enter your user share to claim ownership of your pregenerated wallet
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="userShare"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              User Share
            </label>
            <textarea
              id="userShare"
              value={userShare}
              onChange={(e) => setUserShare(e.target.value)}
              placeholder="Paste your user share here..."
              className="min-h-32 rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500"
              disabled={status === "loading"}
            />
          </div>

          {isLoggedIn !== true && (
            <button
              type="button"
              onClick={handleLogin}
              disabled={status === "loading"}
              className="flex h-12 items-center justify-center rounded-md bg-blue-600 px-6 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {status === "loading" ? "Logging in..." : "Login with Para"}
            </button>
          )}

          {status !== "success" && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={status === "loading" || isLoggedIn !== true}
              className="flex h-12 items-center justify-center rounded-md bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {status === "loading" ? "Claiming..." : "Claim Wallet"}
            </button>
          )}

          {message && (
            <div
              className={`rounded-md p-4 ${
                status === "success"
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : status === "error"
                    ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                    : ""
              }`}
            >
              <p className="font-medium">{message}</p>
              {recoverySecret && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-sm">Recovery Secret:</p>
                  <code className="break-all rounded bg-white/50 p-2 text-xs dark:bg-black/30">
                    {recoverySecret}
                  </code>
                  <p className="text-xs">
                    Save this recovery secret in a secure location. You'll need
                    it to recover your wallet.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            How it works
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <li>You must be fully authenticated with Para</li>
            <li>The user share must match your authenticated identifier</li>
            <li>
              After claiming, Para manages the wallet through your
              authentication
            </li>
            <li>Store your recovery secret securely for wallet recovery</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
