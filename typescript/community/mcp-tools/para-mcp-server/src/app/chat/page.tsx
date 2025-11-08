"use client";

import { ParaModal, useAccount, useWallet, useWalletBalance, useLogout, useModal } from "@getpara/react-sdk";
import { ParaClientProvider } from "../ParaClientProvider";
import { useState } from "react";

const CHAINS = [
  { id: 42161, name: "Arbitrum", rpcUrl: "https://arb1.arbitrum.io/rpc" },
  { id: 8453, name: "Base", rpcUrl: "https://mainnet.base.org" },
  { id: 421614, name: "Arbitrum Sepolia", rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc" },
  { id: 84532, name: "Base Sepolia", rpcUrl: "https://sepolia.base.org" },
] as const;

function ChatInner() {
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const { openModal } = useModal();
  const { logoutAsync, isPending: isLoggingOut } = useLogout();

  const [selectedChainId, setSelectedChainId] = useState<number>(42161);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const address = wallet?.address;
  const selectedChain = CHAINS.find(c => c.id === selectedChainId) || CHAINS[0];

  const { data: balance, isLoading: isLoadingBalance, refetch } = useWalletBalance({
    walletId: wallet?.id,
    rpcUrl: selectedChain.rpcUrl,
  });

  const handleRefreshBalance = async () => {
    setRefetchTrigger(prev => prev + 1);
    await refetch();
  };

  // Format balance from wei to ETH
  const formatBalance = (balanceWei: string | undefined) => {
    if (!balanceWei) return "0";
    const ethBalance = Number(balanceWei) / 1e18;
    return ethBalance.toFixed(6);
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Chat</h1>

      {!isConnected ? (
        <button
          type="button"
          className="px-4 py-2 rounded bg-blue-600 text-white"
          onClick={() => openModal()}
        >
          Connect wallet
        </button>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">Connected address:</div>
            <div className="font-mono break-all text-gray-900 dark:text-gray-100 text-sm">
              {address || "Loading..."}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">Chain:</div>
            <select
              value={selectedChainId}
              onChange={(e) => setSelectedChainId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CHAINS.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">Balance on {selectedChain.name}:</div>
              <button
                type="button"
                onClick={handleRefreshBalance}
                disabled={isLoadingBalance}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingBalance ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <div className="font-mono text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isLoadingBalance ? "Loading..." : `${formatBalance(balance)} ETH`}
            </div>
          </div>

          <button
            type="button"
            className="w-full px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            onClick={() => logoutAsync()}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      )}

      {/* Mount Para Modal */}
      <ParaModal />
    </div>
  );
}

export default function ChatPage() {
  return (
    <ParaClientProvider>
      <ChatInner />
    </ParaClientProvider>
  );
}


