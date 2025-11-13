"use client";

import {
  openPopup,
  useAccount,
  useClient,
  useWallet,
} from "@getpara/react-sdk";
import { useEffect, useState } from "react";
import { useConnect, useDisconnect } from "wagmi";

type AuthStep = "select" | "authenticated";

export default function CustomAuthPage() {
  const para = useClient();
  const account = useAccount();
  const { data: wallet } = useWallet();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [authStep, setAuthStep] = useState<AuthStep>("select");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [allWallets, setAllWallets] = useState<any[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [requiresOtp, setRequiresOtp] = useState<boolean>(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);

  // Helper function to request parent to open auth URL via postMessage
  const requestParentOpenPopup = (url: string, target: string): boolean => {
    try {
      // Send message to parent window
      window.parent.postMessage(
        {
          type: "OPEN_AUTH_URL",
          url,
          target,
        },
        "*"
      );
      return true;
    } catch (error) {
      console.error("[CustomAuth] Failed to send postMessage:", error);
      return false;
    }
  };

  // Listen for auth completion messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "AUTH_COMPLETED") {
        console.log("[CustomAuth] Auth completed via postMessage");
        // Trigger polling to check auth status
        setPendingAuthUrl(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Check login status and get wallet
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!para) {
          if (active) setIsLoggedIn(false);
          return;
        }
        const authed = await para.isFullyLoggedIn();
        if (active) {
          setIsLoggedIn(authed);
          if (authed) {
            setAuthStep("authenticated");
            const wallets = Object.values(await para.getWallets());
            if (wallets.length > 0 && wallets[0].address) {
              setWalletAddress(wallets[0].address as string);
            }
          }
        }
      } catch {
        if (active) setIsLoggedIn(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [para]);

  useEffect(() => {
    if (!para) return;
    const shouldPoll = !!pendingAuthUrl || (message && message.includes("Authentication opened in a new tab"));
    if (!shouldPoll) return;
    let active = true;
    let intervalId: any;
    const poll = async () => {
      try {
        await para.touchSession?.();
        const authed = await para.isFullyLoggedIn();
        if (authed && active) {
          let wallets = Object.values(await para.getWallets());
          if (wallets.length === 0) {
            try {
              await para.createWallet({ type: "EVM" as any, skipDistribute: false });
              wallets = Object.values(await para.getWallets());
            } catch {}
          }
          if (wallets.length > 0) {
            const evmWallet = (wallets as any[]).find((w) => (w as any).type === "EVM" || !(w as any).type);
            if ((evmWallet as any)?.address) setWalletAddress((evmWallet as any).address as string);
          }
          setIsLoggedIn(true);
          setAuthStep("authenticated");
          setStatus("idle");
          setMessage("Successfully logged in with Para!");
          setPendingAuthUrl(null);
          clearInterval(intervalId);
          active = false;
        }
      } catch {}
    };
    poll();
    intervalId = setInterval(poll, 2000);
    const onFocus = () => {
      void poll();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [para, pendingAuthUrl, message]);

  // Para Authentication Flow (Email/Passkey via Para's hosted UI)
  const handleParaLogin = async () => {
    if (!email.trim()) {
      setStatus("error");
      setMessage("Please enter your email address");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      if (!para) throw new Error("Para client not ready");

      // v2 API: Use signUpOrLogIn with the user's email
      const authState = await (para as any).signUpOrLogIn?.({
        auth: { email: email.trim() },
      });

      // Handle different authentication stages
      if (authState?.stage === "verify" && !authState?.loginUrl) {
        // New user - requires OTP verification
        setRequiresOtp(true);
        setStatus("idle");
        setMessage("We sent a 6-digit code to your email. Enter it below to continue.");
        return;
      } else if (authState?.stage === "login") {
        // Existing user - open login URL and wait for completion
        const loginUrl = authState.loginUrl || authState.passkeyUrl || authState.passwordUrl || authState.pinUrl;
        if (loginUrl) {
          console.log("[CustomAuth] Opening login for existing user:", loginUrl);
          const parentOpened = requestParentOpenPopup(loginUrl, "para-login");
          if (!parentOpened) {
            setPendingAuthUrl(loginUrl);
            setStatus("idle");
            setMessage("Opening authentication in this tab...");
            window.location.assign(loginUrl);
            return;
          }
          setMessage("Authentication opened in a new tab. Don't close this page; finish auth there and return here.");
          setPendingAuthUrl(loginUrl);
          
          // Wait for login to complete and get result
          const loginResult = await (para as any).waitForLogin?.({});
          console.log("[CustomAuth] Login result:", loginResult);
          
          // Check if wallet creation is needed
          if (loginResult?.needsWallet) {
            console.log("[CustomAuth] Creating wallet after login...");
            await para.createWallet({ type: "EVM" as any, skipDistribute: false });
          }
        }
      } else if (authState?.stage === "verify" && authState?.loginUrl) {
        // New user - passkey/password/PIN signup flow
        console.log("[CustomAuth] Opening signup for new user:", authState.loginUrl);
        const parentOpened = requestParentOpenPopup(authState.loginUrl, "para-signup");
        if (!parentOpened) {
          setPendingAuthUrl(authState.loginUrl);
          setStatus("idle");
          setMessage("Opening authentication in this tab...");
          window.location.assign(authState.loginUrl);
          return;
        }
        setMessage("Authentication opened in a new tab. Don't close this page; finish auth there and return here.");
        setPendingAuthUrl(authState.loginUrl);
        
        // Wait for wallet creation to complete
        await (para as any).waitForWalletCreation?.({});
      } else if (authState?.stage === "signup") {
        // User verified email, now needs to set up passkey/password
        const setupUrl = authState.passkeyUrl || authState.passwordUrl || authState.pinUrl;
        if (setupUrl) {
          console.log("[CustomAuth] Opening passkey setup:", setupUrl);
          const parentOpened = requestParentOpenPopup(setupUrl, "para-setup");
          if (!parentOpened) {
            setPendingAuthUrl(setupUrl);
            setStatus("idle");
            setMessage("Opening authentication in this tab...");
            window.location.assign(setupUrl);
            return;
          }
          setMessage("Authentication opened in a new tab. Don't close this page; finish auth there and return here.");
          setPendingAuthUrl(setupUrl);
          
          // Wait for wallet creation to complete
          await (para as any).waitForWalletCreation?.({});
        }
      }
      
      // Refresh session to get latest authentication state
      await para.touchSession?.();

      // NOW safely fetch wallets (user is authenticated)
      let wallets = Object.values(await para.getWallets());
      
      // If no wallets exist, create EVM wallet
      if (wallets.length === 0) {
        console.log("[CustomAuth] No wallets found, creating EVM wallet...");
        try {
          await para.createWallet({ type: "EVM" as any, skipDistribute: false });
          wallets = Object.values(await para.getWallets());
        } catch (e) {
          console.warn("[CustomAuth] createWallet failed:", e);
          // Don't fail the auth process if wallet creation fails
        }
      }

      // Get the first EVM wallet address
      if (wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => w.type === "EVM" || !w.type);
        if (evmWallet?.address) {
          setWalletAddress(evmWallet.address as string);
          console.log("[CustomAuth] EVM wallet address:", evmWallet.address);
        }
      }
      
      setIsLoggedIn(true);
      setAuthStep("authenticated");
      setStatus("idle");
      setMessage("Successfully logged in with Para!");
      await fetchAndSetWallets();
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Failed to login with Para",
      );
    }
  };

  // Verify OTP for new users and complete passkey + wallet provisioning
  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      setStatus("error");
      setMessage("Please enter the 6-digit verification code");
      return;
    }

    setStatus("loading");
    setMessage("Verifying code...");

    try {
      if (!para) throw new Error("Para client not ready");

      const verifiedState = await (para as any).verifyNewAccount?.({
        verificationCode: verificationCode.trim(),
      });

      // Open passkey/password setup and wait for wallet creation
      const nextUrl =
        verifiedState?.passkeyUrl ||
        verifiedState?.passwordUrl ||
        verifiedState?.pinUrl ||
        verifiedState?.loginUrl;

      if (nextUrl) {
        const parentOpened = requestParentOpenPopup(nextUrl, "para-verify");
        if (!parentOpened) {
          setPendingAuthUrl(nextUrl);
          setStatus("idle");
          setMessage("Opening authentication in this tab...");
          window.location.assign(nextUrl);
          return;
        }
        setMessage(
          "Authentication opened in a new tab. Don't close this page; finish auth there and return here.",
        );
        setPendingAuthUrl(nextUrl);
        await (para as any).waitForWalletCreation?.({});
      }

      await para.touchSession?.();

      // Fetch wallets and create EVM if none
      let wallets = Object.values(await para.getWallets());
      if (wallets.length === 0) {
        console.log("[CustomAuth] No wallets found, creating EVM wallet...");
        await para.createWallet({ type: "EVM" as any, skipDistribute: false });
        wallets = Object.values(await para.getWallets());
      }

      if (wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => w.type === "EVM" || !w.type);
        if (evmWallet?.address) setWalletAddress(evmWallet.address as string);
      }

      setIsLoggedIn(true);
      setAuthStep("authenticated");
      setStatus("idle");
      setMessage("Signup complete!");
      setRequiresOtp(false);
      setVerificationCode("");
      await fetchAndSetWallets();
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Failed to verify and finish signup",
      );
    }
  };


  const handleCancelAuth = () => {
    setStatus("idle");
    setMessage("");
    setPendingAuthUrl(null);
    setRequiresOtp(false);
    setVerificationCode("");
  };

  const handleLogout = async () => {
    try {
      if (para) {
        await para.logout();
      }
      if (account?.isConnected) {
        disconnect();
      }
      setIsLoggedIn(false);
      setAuthStep("select");
      setWalletAddress("");
      setAllWallets([]);
      setSelectedWalletId("");
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to logout");
    }
  };

  const fetchAndSetWallets = async () => {
    try {
      if (!para) {
        console.log("[fetchAndSetWallets] Para client not ready");
        return;
      }
      const wallets = Object.values(await para.getWallets());
      console.log("[fetchAndSetWallets] Fetched wallets:", wallets);
      console.log("[fetchAndSetWallets] Wallets JSON:", JSON.stringify(wallets, null, 2));
      setAllWallets(wallets as any[]);
      if (wallets.length > 0) {
        const firstWallet = wallets[0] as any;
        const walletId = firstWallet.id || firstWallet.address || "";
        const walletAddr = firstWallet.address as string;
        console.log("[fetchAndSetWallets] Setting wallet:", { walletId, walletAddr });
        console.log("[fetchAndSetWallets] First wallet JSON:", JSON.stringify(firstWallet, null, 2));
        setSelectedWalletId(walletId);
        setWalletAddress(walletAddr);
      } else {
        console.log("[fetchAndSetWallets] No wallets found");
      }
    } catch (err) {
      console.error("[fetchAndSetWallets] Failed to fetch wallets:", err);
    }
  };

  const handleWalletChange = (walletId: string) => {
    const selected = allWallets.find((w: any) => w.id === walletId || w.address === walletId);
    if (selected) {
      setSelectedWalletId(walletId);
      setWalletAddress(selected.address as string);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-cyan-500 via-teal-500 to-blue-600 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
         Para Connect
        </h1>
      

        {/* Authentication Step: Select Method */}
        {authStep === "select" && (
          <div className="space-y-4">
          {/* Email Input for Para Login */}
            <div className="space-y-3">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={status === "loading"}
              />
            </div>

            {requiresOtp && (
              <div className="space-y-3">
                <label
                  htmlFor="verificationCode"
                  className="block text-sm font-medium text-gray-700"
                >
                  Verification Code
                </label>
                <input
                  type="text"
                  id="verificationCode"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={status === "loading"}
                />
                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={status === "loading"}
                  className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  Verify Code
                </button>
                {status !== "loading" && (
                  <button
                    type="button"
                    onClick={handleCancelAuth}
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-2 font-medium text-gray-700 transition-colors hover:border-red-500 hover:text-red-600"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {/* Para Login Button (Email/Passkey) */}
            <button
              type="button"
              onClick={handleParaLogin}
              disabled={status === "loading" || requiresOtp}
              className="w-full rounded-lg bg-teal-600 px-6 py-4 text-left font-medium text-white transition-all hover:bg-teal-700 hover:shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <title>Envelope icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <div>
                  <div className="font-semibold">Continue with Para</div>
                  <div className="text-sm text-teal-100">
                    Login with email or passkey via Para
                  </div>
                </div>
              </div>
            </button>

            {pendingAuthUrl && (
              <div className="mt-2 flex items-center gap-3">
                <a
                  href={pendingAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Open authentication in a new tab
                </a>
              </div>
            )}

            {/* Status Messages */}
            {message && (
              <div
                className={`mt-4 rounded-lg p-4 ${
                  status === "error"
                    ? "bg-red-50 text-red-800"
                    : "bg-blue-50 text-blue-800"
                }`}
              >
                <div>{message}</div>
              </div>
            )}

            {/* Loading Indicator */}
            {status === "loading" && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-center gap-2 text-teal-600">
                  <svg
                    className="h-5 w-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <title>Loading</title>
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="font-medium">Processing...</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelAuth}
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-2 font-medium text-gray-700 transition-colors hover:border-red-500 hover:text-red-600"
                >
                  Cancel
                </button>
              </div>
            )}

          </div>
        )}

        {/* Authentication Step: Authenticated */}
        {authStep === "authenticated" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <title>Success icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-semibold">
                  Successfully Authenticated!
                </span>
              </div>
            </div>

            {allWallets.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Your Wallets
                </h3>
                <select
                  value={selectedWalletId}
                  onChange={(e) => handleWalletChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {allWallets.map(({ id, address, type }: any) => {
                    if (!address) return null;
                    return (
                      <option key={id || address} value={id || address}>
                        {type || "EVM"} - {`${address.slice(0, 6)}...${address.slice(-4)}`}
                      </option>
                    );
                  })}
                </select>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <div className="text-sm text-gray-600">Address</div>
                    <div className="mt-1 font-mono text-sm text-gray-900">
                      {walletAddress && `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
                    </div>
                  </div>
                  {allWallets.length > 0 && (() => {
                    const selected = allWallets.find((w: any) => w.id === selectedWalletId || w.address === selectedWalletId);
                    return selected ? (
                      <>
                        <div>
                          <div className="text-sm text-gray-600">ID</div>
                          <div className="mt-1 font-mono text-xs text-gray-900 break-all">
                            {selected.id}
                          </div>
                        </div>
                        {selected.userId && (
                          <div>
                            <div className="text-sm text-gray-600">User ID</div>
                            <div className="mt-1 font-mono text-xs text-gray-900 break-all">
                              {selected.userId}
                            </div>
                          </div>
                        )}
                        {selected.isPregen !== undefined && (
                          <div>
                            <div className="text-sm text-gray-600">Pre-generated</div>
                            <div className="mt-1 text-sm text-gray-900">
                              {selected.isPregen ? "Yes" : "No"}
                            </div>
                          </div>
                        )}
                        {selected.type && (
                          <div>
                            <div className="text-sm text-gray-600">Type</div>
                            <div className="mt-1 text-sm text-gray-900">
                              {selected.type}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null;
                  })()}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-yellow-50 p-4">
                <div className="text-sm text-yellow-800">Loading wallet information...</div>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-lg border-2 border-red-600 px-6 py-3 font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
