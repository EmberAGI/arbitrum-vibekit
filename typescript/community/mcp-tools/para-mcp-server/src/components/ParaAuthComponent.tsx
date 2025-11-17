"use client";

import { useAccount, useClient, useWallet } from "@getpara/react-sdk";
import { useEffect, useState } from "react";
import { useConnect, useDisconnect } from "wagmi";

type AuthStep = "select" | "authenticated";

export interface ParaAuthComponentProps {
  onAuthSuccess?: (walletData: {
    isLoggedIn: boolean;
    walletAddress: string;
    allWallets: any[];
    selectedWalletId: string;
  }) => void;
  onLogout?: () => void;
  showWalletDetails?: boolean;
}

export default function ParaAuthComponent({
  onAuthSuccess,
  onLogout,
  showWalletDetails = true,
}: ParaAuthComponentProps) {
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
  const [connectedEmail, setConnectedEmail] = useState<string>("");
  const [requiresOtp, setRequiresOtp] = useState<boolean>(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(true);
  const [authState, setAuthState] = useState<any>(null);
  const [signupMethods, setSignupMethods] = useState<string[]>([]);
  const [selectedSignupMethod, setSelectedSignupMethod] = useState<string>("");
  const [isAddressCopied, setIsAddressCopied] = useState<boolean>(false);

  // Helper function to request parent to open auth URL via postMessage
  const requestParentOpenPopup = (url: string, target: string): boolean => {
    try {
      window.parent.postMessage(
        {
          type: "OPEN_AUTH_URL",
          url,
          target,
        },
        "*",
      );
      return true;
    } catch (error) {
      console.error("[ParaAuth] Failed to send postMessage:", error);
      return false;
    }
  };

  // Listen for auth completion messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "AUTH_COMPLETED") {
        console.log("[ParaAuth] Auth completed via postMessage");
        setPendingAuthUrl(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Auto-hide success message after 3 seconds
  useEffect(() => {
    if (authStep === "authenticated" && showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [authStep, showSuccessMessage]);

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
            // Fetch and set all wallets when authenticated
            if (active) {
              await fetchAndSetWallets(false);
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
    const shouldPoll =
      !!pendingAuthUrl ||
      (message && message.includes("Authentication opened in a new tab"));
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
              await para.createWallet({
                type: "EVM" as any,
                skipDistribute: false,
              });
              wallets = Object.values(await para.getWallets());
            } catch {}
          }
          if (wallets.length > 0) {
            const evmWallet = (wallets as any[]).find(
              (w) => (w as any).type === "EVM" || !(w as any).type,
            );
            if ((evmWallet as any)?.address)
              setWalletAddress((evmWallet as any).address as string);
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

      const authState = await (para as any).signUpOrLogIn?.({
        auth: { email: email.trim() },
      });
      console.log("[ParaAuth] Auth state:", authState);
      setAuthState(authState);

      const stage = (authState?.nextStage ?? authState?.stage) as string;

      if (stage === "login") {
        const loginUrl =
          authState?.loginUrl ||
          authState?.passkeyUrl ||
          authState?.passwordUrl ||
          authState?.pinUrl;
        if (loginUrl) {
          console.log("[ParaAuth] Opening login for existing user:", loginUrl);
          const parentOpened = requestParentOpenPopup(loginUrl, "para-login");
          if (!parentOpened) {
            setPendingAuthUrl(loginUrl);
            setStatus("idle");
            setMessage("Opening authentication in this tab...");
            window.location.assign(loginUrl);
            return;
          }
          setMessage(
            "Authentication opened in a new tab. Don't close this page; finish auth there and return here.",
          );
          setPendingAuthUrl(loginUrl);

          const loginResult = await (para as any).waitForLogin?.({});
          console.log("[ParaAuth] Login result:", loginResult);

          if (loginResult?.needsWallet) {
            console.log("[ParaAuth] Creating wallet after login...");
            await para.createWallet({
              type: "EVM" as any,
              skipDistribute: false,
            });
          }
        }
      } else if (stage === "verify") {
        // New user flow: require OTP entry in this UI when no remote URL provided
        if (!authState?.loginUrl) {
          setRequiresOtp(true);
          setStatus("idle");
          setMessage(
            "We sent a 6-digit code to your email. Enter it below to continue.",
          );
          return;
        }
        // If a URL is provided alongside verify, treat it like a hosted verification/login link
        const verifyUrl = authState.loginUrl;
        if (verifyUrl) {
          console.log("[ParaAuth] Opening verification link:", verifyUrl);
          const parentOpened = requestParentOpenPopup(verifyUrl, "para-verify");
          if (!parentOpened) {
            setPendingAuthUrl(verifyUrl);
            setStatus("idle");
            setMessage("Opening authentication in this tab...");
            window.location.assign(verifyUrl);
            return;
          }
          setMessage(
            "Authentication opened in a new tab. Don't close this page; finish auth there and return here.",
          );
          setPendingAuthUrl(verifyUrl);

          await (para as any).waitForLogin?.({});
        }
      } else if (stage === "signup") {
        // New user signup: show method selector based on signupAuthMethods
        if (
          authState?.signupAuthMethods &&
          authState.signupAuthMethods.length > 0
        ) {
          setAuthState(authState);
          setSignupMethods(authState.signupAuthMethods);
          setStatus("idle");
          setMessage("Please select your preferred authentication method");
          return;
        }
        // Fallback if no signupAuthMethods
        setStatus("error");
        setMessage("No signup methods available");
        return;
      }

      await para.touchSession?.();

      let wallets = Object.values(await para.getWallets());

      if (wallets.length === 0) {
        console.log("[ParaAuth] No wallets found, creating EVM wallet...");
        try {
          await para.createWallet({
            type: "EVM" as any,
            skipDistribute: false,
          });
          wallets = Object.values(await para.getWallets());
        } catch (e) {
          console.warn("[ParaAuth] createWallet failed:", e);
        }
      }

      if (wallets.length > 0) {
        const evmWallet = wallets.find((w: any) => w.type === "EVM" || !w.type);
        if (evmWallet?.address) {
          setWalletAddress(evmWallet.address as string);
          console.log("[ParaAuth] EVM wallet address:", evmWallet.address);
        }
      }

      setIsLoggedIn(true);
      setAuthStep("authenticated");
      setStatus("idle");
      setMessage("Successfully logged in with Para!");
      await fetchAndSetWallets(true);
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

      const availableMethods: string[] = [];
      if (verifiedState?.passkeyUrl) availableMethods.push("PASSKEY");
      if (verifiedState?.passwordUrl) availableMethods.push("PASSWORD");
      if (verifiedState?.pinUrl) availableMethods.push("PIN");

      setAuthState(verifiedState);

      let nextUrl: string | undefined;

      if (selectedSignupMethod) {
        nextUrl =
          selectedSignupMethod === "PASSKEY"
            ? verifiedState?.passkeyUrl
            : selectedSignupMethod === "PASSWORD"
              ? verifiedState?.passwordUrl
              : selectedSignupMethod === "PIN"
                ? verifiedState?.pinUrl
                : undefined;
      }

      if (!nextUrl) {
        if (availableMethods.length > 1) {
          setSignupMethods(availableMethods);
          setStatus("idle");
          setMessage("Please select your preferred authentication method");
          return;
        }
        nextUrl =
          verifiedState?.passkeyUrl ||
          verifiedState?.passwordUrl ||
          verifiedState?.pinUrl ||
          verifiedState?.loginUrl;
      }

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
        if (nextUrl === verifiedState?.loginUrl) {
          await (para as any).waitForLogin?.({});
        } else {
          await (para as any).waitForWalletCreation?.({});
        }
      }

      await para.touchSession?.();

      let wallets = Object.values(await para.getWallets());
      if (wallets.length === 0) {
        console.log("[ParaAuth] No wallets found, creating EVM wallet...");
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
      await fetchAndSetWallets(true);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Failed to verify and finish signup",
      );
    }
  };

  const handleCancelAuth = () => {
    setStatus("idle");
    setMessage("");
    setPendingAuthUrl(null);
    setRequiresOtp(false);
    setVerificationCode("");
    setSignupMethods([]);
    setSelectedSignupMethod("");
  };

  const handleSignupMethodSelect = (method: string) => {
    console.log("[ParaAuth] Selected signup method:", method);
    setSelectedSignupMethod(method);
    setSignupMethods([]);
    setRequiresOtp(true);
    setStatus("idle");
    setMessage(
      "We sent a 6-digit code to your email. Enter it below to continue.",
    );
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
      setConnectedEmail("");
      setMessage("");
      onLogout?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to logout");
    }
  };

  const fetchAndSetWallets = async (notifyParent: boolean = false) => {
    try {
      if (!para) {
        console.log("[ParaAuth] Para client not ready");
        return;
      }

      // Fetch connected email
      try {
        const userEmail = await (para as any).getEmail?.();
        if (userEmail) {
          setConnectedEmail(userEmail);
          console.log("[ParaAuth] Connected email:", userEmail);
        }
      } catch (err) {
        console.warn("[ParaAuth] Failed to fetch email:", err);
      }

      const allWalletsData = Object.values(await para.getWallets());
      // Filter out wallets with undefined or non-string addresses
      const validWallets = allWalletsData.filter(
        (w: any) => w && typeof w.address === "string",
      );
      console.log("[ParaAuth] Fetched wallets:", validWallets);
      setAllWallets(validWallets as any[]);
      if (validWallets.length > 0) {
        const firstWallet = validWallets[0] as any;
        const walletId = firstWallet.id || firstWallet.address || "";
        const walletAddr = firstWallet.address as string;
        setSelectedWalletId(walletId);
        setWalletAddress(walletAddr);

        // Notify parent component of successful auth
        if (notifyParent) {
          onAuthSuccess?.({
            isLoggedIn: true,
            walletAddress: walletAddr,
            allWallets: validWallets as any[],
            selectedWalletId: walletId,
          });
        }
      } else {
        console.log("[ParaAuth] No valid wallets found");
      }
    } catch (err) {
      console.error("[ParaAuth] Failed to fetch wallets:", err);
    }
  };

  const handleWalletChange = (walletId: string) => {
    const selected = allWallets.find(
      (w: any) => w.id === walletId || w.address === walletId,
    );
    if (selected) {
      setSelectedWalletId(walletId);
      setWalletAddress(selected.address as string);
    }
  };

  const handleCopyWalletAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsAddressCopied(true);
      setTimeout(() => setIsAddressCopied(false), 2000);
    } catch (err) {
      console.error("[ParaAuth] Failed to copy wallet address:", err);
    }
  };

  return (
    <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Para Connect</h1>

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

          {signupMethods.length > 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Choose Authentication Method
              </label>
              <div className="space-y-2">
                {signupMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleSignupMethodSelect(method)}
                    disabled={status === "loading"}
                    className="w-full rounded-lg border-2 border-teal-600 bg-white px-4 py-3 text-left font-medium text-teal-600 transition-colors hover:bg-teal-50 disabled:opacity-50"
                  >
                    {method === "PASSKEY" && "🔐 Passkey (Recommended)"}
                    {method === "PASSWORD" && "🔑 Password"}
                    {method === "PIN" && "📌 PIN"}
                  </button>
                ))}
              </div>
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
          {showSuccessMessage && (
            <div className="rounded-lg bg-green-50 p-4">
              <div className="flex items-center justify-between gap-2 text-green-800">
                <div className="flex items-center gap-2">
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
                <button
                  type="button"
                  onClick={() => setShowSuccessMessage(false)}
                  className="text-green-800 hover:text-green-900 transition-colors"
                  aria-label="Close success message"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Close icon</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {connectedEmail && (
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
              <div className="text-sm text-blue-600 font-medium">
                Connected Email
              </div>
              <div className="mt-1 font-mono text-sm text-blue-900 break-all">
                {connectedEmail}
              </div>
            </div>
          )}

          {allWallets.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Your Wallets
                </h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchAndSetWallets();
                  }}
                  className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Refresh
                </button>
              </div>
              <select
                value={selectedWalletId}
                onChange={(e) => handleWalletChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {allWallets.map(({ id, address, type, isPregen }: any) => {
                  if (!address || typeof address !== "string") return null;
                  const pregenLabel = isPregen ? "Pre-gen" : "Non-pre-gen";
                  return (
                    <option key={id || address} value={id || address}>
                      {type || "EVM"} - {pregenLabel} -{" "}
                      {`${address.slice(0, 6)}...${address.slice(-4)}`}
                    </option>
                  );
                })}
              </select>
              {showWalletDetails && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <div className="text-sm text-gray-600">Address</div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-sm text-gray-900">
                      <span>
                        {walletAddress &&
                          `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
                      </span>
                      {walletAddress && (
                        <button
                          type="button"
                          onClick={handleCopyWalletAddress}
                          className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-300"
                        >
                          {isAddressCopied ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </div>
                  {allWallets.length > 0 &&
                    (() => {
                      const selected = allWallets.find(
                        (w: any) =>
                          w.id === selectedWalletId ||
                          w.address === selectedWalletId,
                      );
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
                              <div className="text-sm text-gray-600">
                                User ID
                              </div>
                              <div className="mt-1 font-mono text-xs text-gray-900 break-all">
                                {selected.userId}
                              </div>
                            </div>
                          )}
                          {selected.isPregen !== undefined && (
                            <div>
                              <div className="text-sm text-gray-600">
                                Pre-generated
                              </div>
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
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-yellow-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-yellow-800">
                  Loading wallet information...
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchAndSetWallets();
                  }}
                  className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Refresh
                </button>
              </div>
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
  );
}
