"use client";

import { useClient, useLogout } from "@getpara/react-sdk";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ParaAuthComponent from "@/components/ParaAuthComponent";
import { baseURL } from "@/config/baseUrl";

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
  id,
}: {
  id: string;
}) {
  const [wallet, setWallet] = useState<PregenWallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [userShare, setUserShare] = useState("");
  const [claimStatus, setClaimStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [claimMessage, setClaimMessage] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isClaimed, setIsClaimed] = useState(false);
  const [showAuthComponent, setShowAuthComponent] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const claimApiUrl = baseURL + "/claim-pregen-wallet/api";
  const para = useClient();
  const { logoutAsync, isPending: isLoggingOut } = useLogout();

  const loadWalletDetailsWithToken = useCallback(
    async (token: string) => {
      try {
        const response = await fetch(`${baseURL}/api/pregen-wallets/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = (await response.json()) as {
          id: string;
          email: string;
          address: string;
          walletId: string;
          type: string;
          createdAt?: string;
          claimed?: boolean;
          userShare?: string | null;
          error?: string;
        };

        if (!response.ok) {
          setWallet(null);
          setWalletError(
            typeof data.error === "string"
              ? data.error
              : "Failed to load wallet details",
          );
          return;
        }

        const loadedWallet: PregenWallet = {
          id: data.id,
          email: data.email,
          address: data.address,
          walletId: data.walletId,
          type: data.type,
          createdAt: data.createdAt,
          claimed: !!data.claimed,
        };

        setWallet(loadedWallet);
        setIsClaimed(!!data.claimed);
        if (typeof data.userShare === "string") {
          setUserShare(data.userShare);
        }
      } catch (err) {
        setWalletError(
          err instanceof Error
            ? err.message
            : "Failed to load wallet details",
        );
      }
    },
    [id],
  );

  const ensureAuthToken = useCallback(async () => {
    if (authToken) return authToken;
    if (!para) {
      setWalletError("Para client not ready");
      return null;
    }

    try {
      const session = await (para as any).exportSession?.({
        excludeSigners: true,
      });
      if (!session) {
        setWalletError("Failed to export Para session");
        return null;
      }

      const response = await fetch(baseURL + "/api/para/issue-jwt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      });
      const data = await response.json();
      if (!response.ok || !data?.token) {
        setWalletError(
          typeof data.error === "string"
            ? data.error
            : "Failed to establish authentication token",
        );
        return null;
      }

      const token = data.token as string;
      setAuthToken(token);
      return token;
    } catch (err) {
      setWalletError(
        err instanceof Error
          ? err.message
          : "Failed to establish authentication token",
      );
      return null;
    }
  }, [authToken, para]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!para) {
          if (active) setIsLoggedIn(false);
          return;
        }
        const authed = await para.isFullyLoggedIn();
        if (!active) return;
        setIsLoggedIn(authed);

        if (authed) {
          const token = await ensureAuthToken();
          if (active && token) {
            await loadWalletDetailsWithToken(token);
          }
        }
      } catch {
        if (active) setIsLoggedIn(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [para, ensureAuthToken, loadWalletDetailsWithToken]);

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
    if (!para) {
      return;
    }

    try {
      const token = await ensureAuthToken();
      if (!token) {
        return;
      }

      await loadWalletDetailsWithToken(token);
    } catch (err) {
      setWalletError(
        err instanceof Error ? err.message : "Failed to load wallet details",
      );
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
        setClaimMessage("Please complete Para login to continue claiming.");
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

      const token = await ensureAuthToken();
      if (!token) {
        throw new Error("Failed to establish authentication token");
      }
      const response = await fetch(claimApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pregenId: wallet?.id,
          walletId: wallet?.walletId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to finalize wallet claim");
      }

      // Verify wallet is claimed by checking the protected API with session
      if (wallet?.id) {
        const checkResponse = await fetch(`${baseURL}/api/pregen-wallets/${wallet.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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

      // Refresh wallet data to reflect claimed status
      if (wallet?.id) {
        try {
          const refreshResponse = await fetch(`${baseURL}/api/pregen-wallets/${wallet.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (refreshResponse.ok) {
            const refreshedData = await refreshResponse.json();
            setIsClaimed(refreshedData.claimed ?? true);
          }
        } catch (refreshErr) {
          console.error("Failed to refresh wallet data:", refreshErr);
        }
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
      setWallet(null);
      setWalletError(null);
      setUserShare("");
      setIsClaimed(false);
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
          {walletError ? (
            <p className="text-sm text-red-500">{walletError}</p>
          ) : !wallet ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {isLoggedIn
                ? "Loading wallet details..."
                : "Log in with Para to view wallet details."}
            </p>
          ) : (
            <div className="space-y-1 text-sm text-black dark:text-white">
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
                {isClaimed ? "Yes" : "No"}
              </div>
            </div>
          )}
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
              disabled={claimStatus === "loading" || isLoggedIn !== true || !!walletError || !userShare.trim()}
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
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            If you already have a different claim link, you can return to the
            generic page: {" "}
            <Link
              className="underline"
              href={`${baseURL || ""}/claim-pregen-wallet/${id}`}
            >
              {`${baseURL || ""}/claim-pregen-wallet/${id}`}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
