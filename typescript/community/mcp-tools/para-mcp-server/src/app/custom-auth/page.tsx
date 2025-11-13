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
  const [email, setEmail] = useState<string>("");
  const [requiresOtp, setRequiresOtp] = useState<boolean>(false);
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<
    Array<{ name: string; provider: any; icon?: string; type: "ethereum" }>
  >([]);

  // Detect Ethereum (EIP-6963) providers
  // Also checks parent and top windows for iframe support
  useEffect(() => {
    const providers: Array<{ name: string; provider: any; icon?: string; type: "ethereum" }> = [];
    const seenProviders = new Set<string>();

    // Handle Ethereum EIP-6963 provider announcements
    const handleAnnounceProvider = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { info, provider } = customEvent.detail || {};
      if (info && provider) {
        const providerKey = `ethereum:${info.name}`;
        if (!seenProviders.has(providerKey)) {
          seenProviders.add(providerKey);
          providers.push({
            name: info.name,
            provider,
            icon: info.icon,
            type: "ethereum",
          });
          setAvailableProviders([...providers]);
        }
      }
    };

    // Detect Ethereum providers via window.ethereum (fallback for iframes)
    // EIP-6963 events don't cross iframe boundaries, so check window.ethereum directly
    const detectEthereumProviders = (targetWindow: Window) => {
      try {
        const w = targetWindow as unknown as { ethereum?: any };
        if (w?.ethereum) {
          // Try to get wallet name from common properties
          // Check specific properties first, then fallback to generic detection
          let walletName = "Ethereum Wallet";
          
          // Check for specific wallet identifiers
          if (w.ethereum.isRainbow) {
            walletName = "Rainbow";
          } else if (w.ethereum.isBraveWallet) {
            walletName = "Brave Wallet";
          } else if (w.ethereum.isMetaMask && !w.ethereum.isBraveWallet) {
            // MetaMask, but not Brave (Brave sets isMetaMask=true for compatibility)
            walletName = "MetaMask";
          } else if (w.ethereum.isRabby) {
            walletName = "Rabby";
          } else if (w.ethereum.isCoinbaseWallet) {
            walletName = "Coinbase Wallet";
          } else if (w.ethereum.isTokenPocket) {
            walletName = "TokenPocket";
          } else if (w.ethereum.isTrust) {
            walletName = "Trust Wallet";
          } else if (w.ethereum.isMetaMask) {
            // Fallback: if only isMetaMask is true, it's MetaMask
            walletName = "MetaMask";
          }
          
          const providerKey = `ethereum:${walletName}`;
          if (!seenProviders.has(providerKey)) {
            seenProviders.add(providerKey);
            providers.push({
              name: walletName,
              provider: w.ethereum,
              type: "ethereum",
            });
            setAvailableProviders([...providers]);
          }
        }
      } catch {
        // Cross-origin access blocked or provider unavailable
      }
    };

    // Request Ethereum providers from current window using EIP-6963
    // For parent/top windows, only use direct detection (EIP-6963 doesn't work cross-window)
    const currentEthListener = (() => {
      try {
        const listener = (event: Event) => handleAnnounceProvider(event);
        window.addEventListener("eip6963:announceProvider", listener);
        // Dispatch EIP-6963 RequestProviderEvent (plain Event, not CustomEvent)
        window.dispatchEvent(new Event("eip6963:requestProvider"));
        return listener;
      } catch {
        return null;
      }
    })();
    
    // Also use direct detection for current window (fallback)
    detectEthereumProviders(window);

    // For parent/top windows, only use direct detection
    // (EIP-6963 events don't work reliably across window contexts)
    try {
      if (window.parent && window.parent !== window) {
        detectEthereumProviders(window.parent);
      }
    } catch {
      // Cross-origin access blocked, continue
    }

    try {
      if (window.top && window.top !== window) {
        detectEthereumProviders(window.top);
      }
    } catch {
      // Cross-origin access blocked, continue
    }

    return () => {
      if (currentEthListener) {
        window.removeEventListener("eip6963:announceProvider", currentEthListener);
      }
    };
  }, []);

  // Filter connectors to only show Para connector (external wallets handled via EIP-6963)
  const externalWalletConnectors = availableProviders;

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
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Failed to verify and finish signup",
      );
    }
  };

  // External Wallet Authentication Flow
  const handleExternalWalletConnect = async (providerName: string) => {
    setStatus("loading");
    setMessage("Connecting wallet...");

    try {
      const providerDetail = availableProviders.find(
        (p) => p.name === providerName
      );
      if (!providerDetail) throw new Error("Provider not found");
      const provider = providerDetail.provider;

      // Connect to external wallet using EIP-1193 provider
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setAuthStep("authenticated");
        setStatus("idle");
        setMessage(`Connected to ${providerName}`);
      } else {
        throw new Error("No accounts returned from provider");
      }
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Failed to connect external wallet",
      );
    }
  };

  // Monitor external wallet connection and Para authentication
  useEffect(() => {
    if (account?.isConnected && !isLoggedIn && para) {
      (async () => {
        try {
          setStatus("loading");
          setMessage("Authenticating with Para...");

          // Wait a bit for Para to process the external wallet connection
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const authed = await para.isFullyLoggedIn();

          if (authed) {
            const wallets = Object.values(await para.getWallets());
            if (wallets.length > 0 && wallets[0].address) {
              setWalletAddress(wallets[0].address as string);
            }
            setIsLoggedIn(true);
            setAuthStep("authenticated");
            setStatus("idle");
            setMessage("Successfully authenticated with external wallet!");
          } else {
            setStatus("idle");
            setMessage(
              "External wallet connected. Please complete any additional authentication steps.",
            );
          }
        } catch (err) {
          setStatus("error");
          setMessage(
            err instanceof Error
              ? err.message
              : "Failed to authenticate with Para",
          );
        }
      })();
    }
  }, [account?.isConnected, isLoggedIn, para]);

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
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to logout");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-cyan-500 via-teal-500 to-blue-600 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Custom Authentication
        </h1>
        <p className="mb-8 text-sm text-gray-600">
          Login without using ParaModal
        </p>

        {/* Authentication Step: Select Method */}
        {authStep === "select" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Choose authentication method
            </h2>

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

            {/* External Wallets Section */}
            {externalWalletConnectors.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-300"></div>
                  <span className="text-sm text-gray-500">or connect wallet</span>
                  <div className="h-px flex-1 bg-gray-300"></div>
                </div>

                {externalWalletConnectors.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    onClick={() => handleExternalWalletConnect(provider.name)}
                    disabled={status === "loading" || requiresOtp}
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-4 text-left font-medium text-gray-900 transition-all hover:border-teal-500 hover:shadow-md disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      {provider.icon ? (
                        <img
                          src={provider.icon}
                          alt={provider.name}
                          className="h-6 w-6"
                        />
                      ) : (
                        <svg
                          className="h-6 w-6 text-teal-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <title>Wallet connection icon</title>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                          />
                        </svg>
                      )}
                      <div>
                        <div className="font-semibold">{provider.name}</div>
                        <div className="text-sm text-gray-500">
                          Connect with {provider.name}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {externalWalletConnectors.length === 0 && (
              <div className="rounded-lg bg-yellow-50 p-4 text-center">
                <p className="text-sm text-yellow-800">
                  No wallet provider detected. Please install MetaMask or another Web3 wallet.
                </p>
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

            {wallet && walletAddress && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-gray-900">
                  Your Wallet
                </h3>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm text-gray-600">EVM Wallet</div>
                  <div className="mt-1 font-mono text-sm text-gray-900">
                    {`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
                  </div>
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
    </div>
  );
}
