"use client";

import { useEffect, useState } from "react";

type AuthStep = "select" | "connected";

export default function WalletConnectPage() {
  const [authStep, setAuthStep] = useState<AuthStep>("select");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [availableProviders, setAvailableProviders] = useState<
    Array<{ name: string; provider: any; icon?: string; type: "ethereum" }>
  >([]);

  // Detect Ethereum (EIP-6963) providers
  // Also checks parent and top windows for iframe support
  useEffect(() => {
    const providers: Array<{
      name: string;
      provider: any;
      icon?: string;
      type: "ethereum";
    }> = [];
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
        window.removeEventListener(
          "eip6963:announceProvider",
          currentEthListener,
        );
      }
    };
  }, []);

  // External Wallet Connection Handler
  const handleWalletConnect = async (providerName: string) => {
    setStatus("loading");
    setMessage("Connecting wallet...");

    try {
      const providerDetail = availableProviders.find(
        (p) => p.name === providerName,
      );
      if (!providerDetail) throw new Error("Provider not found");
      const provider = providerDetail.provider;

      // Connect to external wallet using EIP-1193 provider
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setAuthStep("connected");
        setStatus("idle");
        setMessage(`Successfully connected to ${providerName}`);
      } else {
        throw new Error("No accounts returned from provider");
      }
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Failed to connect wallet",
      );
    }
  };

  const handleDisconnect = () => {
    setAuthStep("select");
    setWalletAddress("");
    setMessage("");
    setStatus("idle");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Wallet Connect
        </h1>
        <p className="mb-8 text-sm text-gray-600">
          Connect your Ethereum wallet
        </p>

        {/* Select Wallet Step */}
        {authStep === "select" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Choose your wallet
            </h2>

            {/* Status Messages */}
            {message && (
              <div
                className={`rounded-lg p-4 ${
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
              <div className="flex items-center justify-center gap-2 text-purple-600">
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
            )}

            {/* Wallet List */}
            {availableProviders.length > 0 ? (
              <div className="space-y-3">
                {availableProviders.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    onClick={() => handleWalletConnect(provider.name)}
                    disabled={status === "loading"}
                    className="w-full rounded-lg border-2 border-gray-300 bg-white px-6 py-4 text-left font-medium text-gray-900 transition-all hover:border-purple-500 hover:shadow-md disabled:opacity-50"
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
                          className="h-6 w-6 text-purple-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <title>Wallet icon</title>
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
            ) : (
              <div className="rounded-lg bg-yellow-50 p-4 text-center">
                <p className="text-sm text-yellow-800">
                  No wallet provider detected. Please install MetaMask, Rainbow,
                  or another Web3 wallet.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Connected Step */}
        {authStep === "connected" && (
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
                <span className="font-semibold">Wallet Connected!</span>
              </div>
            </div>

            {message && (
              <div className="rounded-lg bg-blue-50 p-4 text-blue-800">
                {message}
              </div>
            )}

            {walletAddress && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-gray-900">
                  Your Wallet Address
                </h3>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm text-gray-600">Ethereum Address</div>
                  <div className="mt-1 break-all font-mono text-sm text-gray-900">
                    {walletAddress}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full rounded-lg border-2 border-red-600 px-6 py-3 font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
