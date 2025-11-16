"use client";

import {
  useAccount as useParaAccount,
  useClient as useParaClient,
  useWallet,
} from "@getpara/react-sdk";
import ParaAuthComponent from "./ParaAuthComponent";
import { useState } from "react";
import {
  createPublicClient,
  serializeTransaction,
  http as viemHttp,
  formatEther,
} from "viem";
import { arbitrum, arbitrumSepolia, base, baseSepolia } from "wagmi/chains";

/**
 * Para-specific Transaction Preview Component
 *
 * This component displays transaction details and handles signing
 * using the Para SDK directly.
 */

const CHAINS = [arbitrum, arbitrumSepolia, base, baseSepolia];

export interface TransactionPreviewComponentProps {
  txPreview: Array<{
    to: string;
    data: string;
    value: string;
    chainId: string;
  }>;
}

export function TransactionPreviewComponent({
  txPreview,
}: TransactionPreviewComponentProps) {
  const paraAccount = useParaAccount();
  const paraClient = useParaClient();
  const { data: activeWallet } = useWallet();

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Editable transaction state
  const [editableTx, setEditableTx] = useState({
    to: txPreview[0]?.to || "",
    value: txPreview[0]?.value || "0",
    chainId: txPreview[0]?.chainId || "",
    data: txPreview[0]?.data || "0x",
  });

  const isConnected = Boolean(paraAccount?.isConnected);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(txPreview, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleLogout = async () => {
    try {
      if (paraClient) {
        await paraClient.logout();
      }
      // Reset state after logout
      setError(null);
      setTxHash(undefined);
      setIsSuccess(false);
    } catch (err) {
      console.error("Logout error:", err);
      setError(err as Error);
    }
  };

  const handleSignTransaction = async () => {
    if (!paraClient) return;

    // Use the editable transaction values
    const targetChainId = Number.parseInt(editableTx.chainId);

    try {
      setIsPending(true);
      setIsSuccess(false);
      setError(null);

      const chain = CHAINS.find((c) => c.id === targetChainId);
      if (!chain) throw new Error(`Unsupported chain ${targetChainId}`);

      // Para wallets support EVM by default - use the active wallet directly
      if (!activeWallet) {
        throw new Error(
          "No wallet connected. Please connect your Para wallet.",
        );
      }

      const walletAddress = (activeWallet as unknown as Record<string, unknown>)
        .address as `0x${string}`;
      if (!walletAddress) {
        throw new Error("Wallet address not found.");
      }

      // Get RPC URL
      const rpcUrl =
        chain.id === baseSepolia.id
          ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
            "https://sepolia.base.org"
          : chain.rpcUrls?.default?.http?.[0];

      if (!rpcUrl) throw new Error("No RPC URL configured");

      const publicClient = createPublicClient({
        chain,
        transport: viemHttp(rpcUrl),
      });

      const nonce = await publicClient.getTransactionCount({
        address: walletAddress,
      });
      const gasPrice = await publicClient.getGasPrice();

      const serialized = serializeTransaction({
        to: editableTx.to as `0x${string}`,
        value: BigInt(editableTx.value),
        data: editableTx.data as `0x${string}`,
        nonce,
        gasLimit: BigInt(100000),
        gasPrice,
        chainId: chain.id,
        type: "legacy",
      });

      const rlpEncodedTxBase64 = Buffer.from(
        serialized.slice(2),
        "hex",
      ).toString("base64");

      const result = await paraClient.signTransaction({
        walletId: (activeWallet as unknown as Record<string, unknown>)
          .id as string,
        rlpEncodedTxBase64,
        chainId: chain.id.toString(),
      });

      const signedTx = (result as unknown as Record<string, unknown>)
        .signedTransaction as `0x${string}`;
      const hash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx,
      });

      setTxHash(hash);
      setIsSuccess(true);
    } catch (err) {
      console.error("Transaction error:", err);
      setError(err as Error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-semibold text-gray-100">
        Transaction Preview
      </div>

      {/* JSON Output Section */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Tool Output (JSON)
          </h2>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded bg-zinc-700 px-3 py-1 text-sm text-white transition-colors hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          <code>{JSON.stringify(txPreview, null, 2)}</code>
        </pre>
      </div>

      {/* Transaction Details - Editable Form */}
      <div className="space-y-2">
        <div className="p-3 bg-gray-700 rounded-lg border border-gray-600 text-xs">
          <div className="space-y-3">
            <div>
              <label className="block text-gray-400 mb-1">To:</label>
              <input
                type="text"
                value={editableTx.to}
                onChange={(e) => setEditableTx({ ...editableTx, to: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 text-gray-100 font-mono rounded border border-gray-600 focus:border-cyan-500 focus:outline-none"
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Value (wei):</label>
              <input
                type="text"
                value={editableTx.value}
                onChange={(e) => setEditableTx({ ...editableTx, value: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 text-gray-100 rounded border border-gray-600 focus:border-cyan-500 focus:outline-none"
                placeholder="0"
              />
              <div className="text-gray-500 text-xs mt-1">
                ≈ {formatEther(BigInt(editableTx.value || "0"))} ETH
              </div>
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Chain ID:</label>
              <input
                type="text"
                value={editableTx.chainId}
                onChange={(e) => setEditableTx({ ...editableTx, chainId: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 text-gray-100 rounded border border-gray-600 focus:border-cyan-500 focus:outline-none"
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Data:</label>
              <textarea
                value={editableTx.data}
                onChange={(e) => setEditableTx({ ...editableTx, data: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 text-gray-100 font-mono rounded border border-gray-600 focus:border-cyan-500 focus:outline-none"
                placeholder="0x"
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {isSuccess && (
        <div className="p-2 rounded-lg border-2 border-green-800 bg-green-200 text-green-800">
          Transaction Successful! Hash: {String(txHash ?? "")}
        </div>
      )}
      {isPending && (
        <div className="p-2 rounded-lg border-2 border-gray-400 bg-gray-200 text-slate-800">
          Signing Transaction...
        </div>
      )}
      {error && (
        <div className="p-2 rounded-lg border-2 border-red-800 bg-red-400 text-white break-words">
          Error: {(error as Error)?.message || JSON.stringify(error, null, 2)}
        </div>
      )}

      {/* Action Buttons */}
      {isConnected ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSignTransaction}
            disabled={isPending || isSuccess}
            className="w-full mt-2 px-4 py-2 rounded-full bg-cyan-700 text-white hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Signing..." : isSuccess ? "Signed" : "Sign Transaction"}
          </button>
          
          {/* Logout and Manage Wallet Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 px-4 py-2 rounded-full border-2 border-red-600 text-red-600 hover:bg-red-50 transition-colors"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="flex-1 px-4 py-2 rounded-full border-2 border-cyan-700 text-cyan-700 hover:bg-cyan-50 transition-colors"
            >
              Manage Wallet
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2 flex rounded-lg border-2 border-gray-400 bg-gray-200 flex-col">
          <div className="mb-2 text-red-500">
            Please connect your wallet to sign
          </div>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-4 py-2 rounded-full bg-cyan-700 text-white hover:bg-cyan-800"
          >
            Connect Para Wallet
          </button>
        </div>
      )}

      {/* Para Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-opacity-50" onClick={() => setShowAuthModal(false)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute -top-2 -right-2 z-10 h-8 w-8 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center"
              aria-label="Close modal"
            >
              ×
            </button>
            <ParaAuthComponent
              onAuthSuccess={() => {
                setShowAuthModal(false);
              }}
              showWalletDetails={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
