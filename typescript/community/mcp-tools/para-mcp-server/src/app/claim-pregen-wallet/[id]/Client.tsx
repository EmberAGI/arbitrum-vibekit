"use client";

import {
  useClient,
  useLogout,
} from "@getpara/react-sdk";
import Link from "next/link";
import { useEffect, useState } from "react";
import ParaAuthComponent from "@/components/ParaAuthComponent";

export type PregenWallet = {
  id: string;
  email: string;
  address: string;
  walletId: string;
  type: string;
  createdAt?: string;
  claimed: boolean;
};

export default function ClaimPregenWalletClient({
  wallet,
  error,
  initialUserShare,
}: {
  wallet: PregenWallet | null;
  error: string | null;
  initialUserShare?: string;
}) {
  const [userShare, setUserShare] = useState(initialUserShare ?? "");
  const [claimStatus, setClaimStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [claimMessage, setClaimMessage] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isClaimed, setIsClaimed] = useState(wallet?.claimed ?? false);
  const [showAuthComponent, setShowAuthComponent] = useState(false);
  const claimApiUrl = "/claim-pregen-wallet/api";
  const para = useClient();
  const { logoutAsync, isPending: isLoggingOut } = useLogout();

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

  const handleAuthSuccess = async (authData: {
    isLoggedIn: boolean;
    walletAddress: string;
    allWallets: any[];
    selectedWalletId: string;
  }) => {
    setIsLoggedIn(authData.isLoggedIn);
    setShowAuthComponent(false);
    setClaimStatus("idle");
    setClaimMessage("Logged in with Para. You can now claim the wallet.");

    // Verify email matches if wallet has an email
    if (wallet?.email && para) {
      try {
        const authedEmail = await para.getEmail();
        if (!authedEmail) {
          setClaimStatus("error");
          setClaimMessage("Unable to read authenticated email from Para.");
          return;
        }
        if (authedEmail.toLowerCase() !== wallet.email.toLowerCase()) {
          setClaimStatus("error");
          setClaimMessage(
            "No Para account found for this wallet's email. Please log in with the same email as the pregenerated wallet.",
          );
          return;
        }
      } catch (err) {
        setClaimStatus("error");
        setClaimMessage(
          err instanceof Error ? err.message : "Failed to verify email",
        );
      }
    }
  };

  const handleLogin = () => {
    setShowAuthComponent(true);
  };

  const handleClaim = async () => {
    if (!userShare.trim()) {
      setClaimStatus("error");
      setClaimMessage("Please enter a user share");
      return;
    }
    setClaimStatus("loading");
    setClaimMessage("");
    setRecoverySecret("");

    try {
      if (!para) throw new Error("Para client not ready");

      // Ensure user is logged in with Para first (double-check)
      const isAuthenticated = await para.isFullyLoggedIn();
      if (!isAuthenticated) {
        // Show auth component and stop the claim until the user finishes login
        setShowAuthComponent(true);
        setClaimStatus("idle");
        setClaimMessage(
          "Please complete Para login to continue claiming.",
        );
        return;
      }

      // Verify authenticated email matches the pregenerated wallet email
      if (wallet?.email) {
        const authedEmail = await para.getEmail();
        if (!authedEmail) {
          throw new Error("Unable to read authenticated email from Para.");
        }
        if (authedEmail.toLowerCase() !== wallet.email.toLowerCase()) {
          throw new Error(
            `Authenticated email (${authedEmail}) does not match the wallet email (${wallet.email}).`,
          );
        }
      }

      // Load the user share into Para client
      await para.setUserShare(userShare);

      // Claim the pregenerated wallet (may or may not return a recovery secret)
      const claimedRecoverySecret = await para.claimPregenWallets();

      // Notify server of successful claim for cache invalidation
      const response = await fetch(claimApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregenId: wallet?.id,
          walletId: wallet?.walletId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to finalize wallet claim");
      }

      // Verify wallet is claimed by checking the API
      if (wallet?.id) {
        const checkResponse = await fetch(`/api/pregen-wallets/${wallet.id}`);
        if (checkResponse.ok) {
          const walletData = await checkResponse.json();
          setIsClaimed(walletData.claimed ?? false);
        }
      }

      setClaimStatus("success");
      setClaimMessage("Wallet claimed successfully!");
      if (claimedRecoverySecret) {
        setRecoverySecret(claimedRecoverySecret);
      }
    } catch (err) {
      setClaimStatus("error");
      setClaimMessage(
        err instanceof Error ? err.message : "An error occurred while claiming",
      );
    }
  };

  const handleLogout = async () => {
    try {
      setClaimMessage("");
      await logoutAsync();
      setIsLoggedIn(false);
      setRecoverySecret("");
      setClaimStatus("idle");
    } catch (err) {
      setClaimStatus("error");
      setClaimMessage(err instanceof Error ? err.message : "Failed to logout");
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
            Follow the steps below to authenticate with Para and claim your
            pregenerated wallet.
          </p>
        </div>

        {/* Wallet details */}
        <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          {error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : wallet ? (
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">ID:</span> {wallet.id}
              </div>
              <div>
                <span className="font-medium">Email:</span> {wallet.email}
              </div>
              <div>
                <span className="font-medium">Address:</span> {wallet.address}
              </div>
              <div>
                <span className="font-medium">Type:</span> {wallet.type}
              </div>
              <div>
                <span className="font-medium">Created:</span>{" "}
                {wallet.createdAt || "—"}
              </div>
              <div>
                <span className="font-medium">Claimed:</span>{" "}
                {wallet.claimed ? "Yes" : "No"}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Wallet not found</p>
          )}
        </div>

        {/* Login helper */}
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            You must be fully authenticated with Para before claiming. If your
            app has a dedicated login flow, please log in first, then return to
            this page.
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            The claim API will return 401 if not authenticated. After logging
            in, reload this page and proceed.
          </p>
        </div>

        {/* User share input and claim */}
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
              disabled={claimStatus === "loading"}
            />
          </div>

          {showAuthComponent && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => setShowAuthComponent(false)}
            >
              <div
                className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
                onClick={(e) => e.stopPropagation()}
              >
                <ParaAuthComponent
                  onAuthSuccess={handleAuthSuccess}
                  onLogout={() => setIsLoggedIn(false)}
                  showWalletDetails={false}
                />
              </div>
            </div>
          )}

          {isLoggedIn !== true && !showAuthComponent && (
            <button
              type="button"
              onClick={handleLogin}
              disabled={claimStatus === "loading"}
              className="flex h-12 items-center justify-center rounded-md bg-blue-600 px-6 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {claimStatus === "loading" ? "Logging in..." : "Login with Para"}
            </button>
          )}

          {!isClaimed && claimStatus !== "success" && (
            <button
              type="button"
              onClick={handleClaim}
              disabled={claimStatus === "loading" || isLoggedIn !== true}
              className="flex h-12 items-center justify-center rounded-md bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {claimStatus === "loading" ? "Claiming..." : "Claim Wallet"}
            </button>
          )}

          {isLoggedIn === true && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => setShowAuthComponent(true), 0);
                }}
                className="flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Switch Wallet
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut || claimStatus === "loading"}
                className="flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </>
          )}

          {claimMessage && (
            <div
              className={`rounded-md p-4 ${
                claimStatus === "success"
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                  : claimStatus === "error"
                    ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                    : ""
              }`}
            >
              <p className="font-medium">{claimMessage}</p>
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
          <p className="mt-3 text-xs text-zinc-500">
            If you already have a different claim link, you can return to the
            generic page:{" "}
            <Link className="underline" href="/claim-pregen-wallet">
              /claim-pregen-wallet
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
