"use client";

import {
  useModal,
  useAccount as useParaAccount,
  useClient as useParaClient,
  useWallet,
} from "@getpara/react-sdk";
import { useState } from "react";
import {
  createPublicClient,
  serializeTransaction,
  http as viemHttp,
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
  const { openModal } = useModal();

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);

  const isConnected = Boolean(paraAccount?.isConnected);

  const handleSignTransaction = async () => {
    if (!txPreview || txPreview.length === 0 || !paraClient) return;

    const tx = txPreview[0];
    const targetChainId = Number.parseInt(tx.chainId);

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
        to: tx.to as `0x${string}`,
        value: BigInt(tx.value),
        data: tx.data as `0x${string}`,
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

      {/* Transaction Details */}
      <div className="space-y-2">
        {txPreview.map((tx, index) => (
          <div
            key={index}
            className="p-3 bg-gray-700 rounded-lg border border-gray-600 text-xs"
          >
            <div className="space-y-1">
              <div>
                <span className="text-gray-400">To:</span>{" "}
                <span className="text-gray-100 font-mono">{tx.to}</span>
              </div>
              <div>
                <span className="text-gray-400">Value:</span>{" "}
                <span className="text-gray-100">{tx.value} wei</span>
              </div>
              <div>
                <span className="text-gray-400">Chain ID:</span>{" "}
                <span className="text-gray-100">{tx.chainId}</span>
              </div>
              {tx.data && tx.data !== "0x" && (
                <div>
                  <span className="text-gray-400">Data:</span>{" "}
                  <span className="text-gray-100 font-mono break-all">
                    {tx.data}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
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
        <button
          type="button"
          onClick={handleSignTransaction}
          disabled={isPending || isSuccess}
          className="w-full mt-2 px-4 py-2 rounded-full bg-cyan-700 text-white hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Signing..." : isSuccess ? "Signed" : "Sign Transaction"}
        </button>
      ) : (
        <div className="p-2 flex rounded-lg border-2 border-gray-400 bg-gray-200 flex-col">
          <div className="mb-2 text-red-500">
            Please connect your wallet to sign
          </div>
          <button
            onClick={() => openModal()}
            className="px-4 py-2 rounded-full bg-cyan-700 text-white hover:bg-cyan-800"
          >
            Connect Para Wallet
          </button>
        </div>
      )}
    </div>
  );
}
