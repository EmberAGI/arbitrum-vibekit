"use client";

/**
 * Para Wallet Debug Page
 *
 * This page uses Para SDK exclusively with shared wallet-agnostic UI components.
 * Para-specific logic is passed to components via props/adapters.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { arbitrum, arbitrumSepolia, base, baseSepolia } from "wagmi/chains";
import { useMcp } from "use-mcp/react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import ReactMarkdown from "react-markdown";

// Para SDK v2 alpha hooks
import { useAccount, useModal, useWallet, useLogout } from "@getpara/react-sdk";

// Viem imports for balance queries
import { createPublicClient, http as viemHttp, formatEther } from "viem";

// Para components
import {
  TransactionPreviewComponent,
  UsdcTransfer,
  DynamicToolWithApprovalView,
} from "../components";
// Constants
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
] as const;

// Main Para Debug Page
export default function ParaDebugPage() {
  // Para SDK v2 alpha: useAccount still returns UseQueryResult
  const { data: account } = useAccount();
  const { data: activeWallet } = useWallet();
  const { openModal } = useModal();
  const { logoutAsync } = useLogout();

  // Para SDK v2 alpha: Check if activeWallet exists for connection status
  // The activeWallet is the source of truth for connection in v2 alpha
  const isConnected = Boolean(activeWallet?.address);
  const address = activeWallet?.address as `0x${string}` | undefined;

  // Debug: Log account state changes
  useEffect(() => {
    console.log("Para Debug - Account state (v2):", {
      account,
      activeWallet,
      isConnected,
      address,
      wallets: account?.wallets,
    });
  }, [account, activeWallet, isConnected, address]);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | undefined>(undefined);
  const [usdcBalance, setUsdcBalance] = useState<bigint | undefined>(undefined);
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Fetch balances for Base Sepolia
  const fetchBalances = async () => {
    if (!address) return;

    setLoadingBalances(true);
    try {
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: viemHttp(
          process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
            "https://sepolia.base.org",
        ),
      });

      // Fetch ETH balance
      const ethBal = await publicClient.getBalance({
        address: address as `0x${string}`,
      });
      setEthBalance(ethBal);

      // Fetch USDC balance
      const usdcBal = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
      setUsdcBalance(usdcBal as bigint);
    } catch (err) {
      console.error("Balance fetch error:", err);
    } finally {
      setLoadingBalances(false);
    }
  };

  // Fetch balances when address changes
  useEffect(() => {
    if (address && isConnected) {
      fetchBalances();
    }
  }, [address, isConnected]);

  const formatEth = (bal: bigint | undefined) => {
    if (!bal) return "0.0000";
    return Number(formatEther(bal)).toFixed(4);
  };

  const formatUsdc = (bal: bigint | undefined) => {
    if (!bal) return "0.00";
    return (Number(bal) / 1e6).toFixed(2);
  };

  const mcpUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/mcp`;
    }
    return process.env.NEXT_PUBLIC_MCP_URL || "http://localhost:3012/mcp";
  }, []);

  const {
    messages: chatMessages,
    status: chatStatus,
    error: chatError,
    sendMessage: sendChatMessage,
    addToolApprovalResponse,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => ({
        "X-MCP-URL": mcpUrl,
      }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const {
    state: mcpState,
    tools,
    error: mcpError,
  } = useMcp({
    url: mcpUrl,
  });

  const [localChatInput, setLocalChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Para Wallet Debug Interface</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Using Para SDK
            </p>
          </div>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            {isDarkMode ? "☀️" : "🌙"}
          </button>
        </div>

        {/* Connection Section */}
        {!isConnected ? (
          <div className="flex flex-col items-center gap-4 py-12 border rounded-lg border-gray-300 dark:border-gray-600">
            <p className="text-gray-600 dark:text-gray-400">
              Connect your Para wallet to get started
            </p>
            <button
              onClick={() => openModal()}
              className="px-6 py-3 rounded-full bg-cyan-700 text-white hover:bg-cyan-800 font-medium"
            >
              Connect Para Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-4">
              {/* Address and Disconnect */}
              <div className="flex justify-between items-center p-4 border rounded-lg border-gray-300 dark:border-gray-600">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Connected Address:
                  </div>
                  <div className="font-mono text-sm">{address}</div>
                </div>
                <button
                  onClick={() => logoutAsync()}
                  className="px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700"
                >
                  Disconnect
                </button>
              </div>

              {/* Balances (Base Sepolia) */}
              <div className="p-4 border rounded-lg border-gray-300 dark:border-gray-600">
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Base Sepolia Balances
                  </div>
                  <button
                    type="button"
                    onClick={fetchBalances}
                    disabled={loadingBalances}
                    className="text-xs px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {loadingBalances ? "Loading..." : "Refresh"}
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      ETH:
                    </span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">
                      {loadingBalances ? "..." : `${formatEth(ethBalance)} ETH`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      USDC:
                    </span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">
                      {loadingBalances
                        ? "..."
                        : `${formatUsdc(usdcBalance)} USDC`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* USDC Transfer Component */}
            <UsdcTransfer />

            {/* MCP Chat Section */}
            <div className="mt-8 pt-8 border-t border-gray-300 dark:border-gray-600">
              <h2 className="text-xl font-semibold mb-4">MCP Tools & Chat</h2>

              {mcpError && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-700 rounded text-red-700 dark:text-red-400">
                  MCP Error: {mcpError.message}
                </div>
              )}

              {mcpState === "connected" && (
                <div className="space-y-4">
                  {/* Chat Messages */}
                  <div className="min-h-[400px] max-h-[600px] overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className="mb-4">
                        <div className="font-semibold text-sm mb-1">
                          {msg.role === "user" ? "You" : "Assistant"}
                        </div>
                        {msg.role === "assistant" && msg.content && (
                          <div className="prose dark:prose-invert max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                        {msg.role === "user" && (
                          <div className="text-gray-700 dark:text-gray-300">
                            {msg.content}
                          </div>
                        )}
                        {msg.parts?.map((part, idx) => {
                          if (part.type === "dynamic-tool") {
                            return (
                              <DynamicToolWithApprovalView
                                key={idx}
                                invocation={part}
                                addToolApprovalResponse={
                                  addToolApprovalResponse
                                }
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localChatInput}
                      onChange={(e) => setLocalChatInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && localChatInput.trim()) {
                          sendChatMessage(localChatInput);
                          setLocalChatInput("");
                        }
                      }}
                      placeholder="Ask about MCP tools or request transactions..."
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      disabled={chatStatus !== "idle"}
                    />
                    <button
                      onClick={() => {
                        if (localChatInput.trim()) {
                          sendChatMessage(localChatInput);
                          setLocalChatInput("");
                        }
                      }}
                      disabled={chatStatus !== "idle" || !localChatInput.trim()}
                      className="px-6 py-2 bg-cyan-700 text-white rounded-lg hover:bg-cyan-800 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>

                  {chatStatus === "loading" && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Assistant is thinking...
                    </div>
                  )}
                </div>
              )}

              {mcpState === "connecting" && (
                <div className="text-gray-600 dark:text-gray-400">
                  Connecting to MCP server...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
