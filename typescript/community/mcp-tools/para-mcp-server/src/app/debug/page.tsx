"use client";

import { ConnectButton, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useSendTransaction,
  useWaitForTransactionReceipt,
  WagmiProvider,
} from "wagmi";
import {
  useCallsStatus,
  useCapabilities,
  useSendCalls,
} from "wagmi/experimental";
import { queryClient, wagmiConfig } from "./wagmi-config";
import "@rainbow-me/rainbowkit/styles.css";

function FaucetRequest() {
  const { address, isConnected, chain } = useAccount();
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: address,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleFaucetRequest = async () => {
    if (!address || !chain) return;

    setIsLoading(true);
    setError("");
    setSuccess(false);
    setTxHash("");

    try {
      const networkMap: Record<number, string> = {
        84532: "base-sepolia", // Base Sepolia
        11155111: "ethereum-sepolia", // Ethereum Sepolia
        421614: "arbitrum-sepolia", // Arbitrum Sepolia (not supported by CDP faucet)
      };

      const network = networkMap[chain.id];
      if (!network) {
        setError(`Network ${chain.name} not supported by CDP faucet`);
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          network,
          token: "eth",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Faucet request failed");
      }

      setTxHash(data.transactionHash);
      setSuccess(true);

      // Wait a bit for the transaction to be mined, then refresh balance
      setTimeout(() => {
        refetchBalance();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request faucet");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
      <h2 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Request Testnet Funds
      </h2>
      <div className="space-y-4">
        <div className="rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <strong>Connected Address:</strong>
            <br />
            <code className="break-all text-xs">{address}</code>
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            <strong>Network:</strong> {chain?.name}
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            <strong>Current Balance:</strong>{" "}
            {balanceData ? (
              <span className="font-mono text-green-600 dark:text-green-400">
                {parseFloat(balanceData.formatted).toFixed(6)}{" "}
                {balanceData.symbol}
              </span>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">
                Loading...
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleFaucetRequest}
          disabled={isLoading}
          className="w-full rounded-md bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:bg-zinc-400 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {isLoading ? "Requesting..." : "Request 0.0001 ETH"}
        </button>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Rate limit: 0.1 ETH per 24 hours
        </p>
      </div>
      {error && (
        <div className="mt-4 rounded-md bg-red-100 p-3 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">❌ {error}</p>
        </div>
      )}
      {success && txHash && (
        <div className="mt-4 rounded-md bg-green-100 p-3 dark:bg-green-900/20">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            ✓ Faucet request successful!
          </p>
          <p className="mt-2 text-xs text-green-600 dark:text-green-500">
            Tx: <code className="break-all">{txHash}</code>
          </p>
        </div>
      )}
    </div>
  );
}

function TransferForm() {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Check for paymaster capabilities
  const { data: availableCapabilities } = useCapabilities({
    account: address,
  });

  // Configure paymaster URL if supported
  const capabilities = useMemo(() => {
    if (!availableCapabilities || !chainId) return {};
    const capabilitiesForChain = availableCapabilities[chainId];
    if (
      capabilitiesForChain?.["paymasterService"] &&
      capabilitiesForChain["paymasterService"].supported
    ) {
      const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER_URL;
      if (paymasterUrl) {
        return {
          paymasterService: {
            url: paymasterUrl,
          },
        };
      }
    }
    return {};
  }, [availableCapabilities, chainId]);

  // Use sendCalls for smart wallet transactions with paymaster support
  const {
    data: callsId,
    sendCalls,
    isPending: isSendCallsPending,
  } = useSendCalls();

  // Check status of the calls
  const { data: callsStatus } = useCallsStatus({
    id: callsId?.id as string,
    query: {
      enabled: !!callsId?.id,
    },
  });

  // Fallback to regular sendTransaction for non-smart wallets
  const {
    data: txHash,
    sendTransaction,
    isPending: isSendPending,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  const isPending = isSendCallsPending || isSendPending;
  const isSuccess = isTxSuccess || callsStatus?.status === "success";
  const hasPaymasterSupport = Object.keys(capabilities).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !amount) return;

    // Use sendCalls if paymaster is supported (smart wallet)
    if (hasPaymasterSupport && sendCalls) {
      sendCalls({
        calls: [
          {
            to: to as `0x${string}`,
            value: parseEther(amount),
          },
        ],
        capabilities,
      });
    } else {
      // Fallback to regular transaction for EOA wallets
      sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amount),
      });
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
      <h2 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Transfer ETH
        {hasPaymasterSupport && (
          <span className="ml-2 text-sm font-normal text-green-600 dark:text-green-400">
            ⚡ Gas Sponsored
          </span>
        )}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="recipient-address"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Recipient Address
          </label>
          <input
            id="recipient-address"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            required
          />
        </div>
        <div>
          <label
            htmlFor="amount"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Amount (ETH)
          </label>
          <input
            id="amount"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.01"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isPending || isConfirming}
          className="w-full rounded-md bg-orange-500 px-4 py-2 font-medium text-white transition-colors hover:bg-orange-600 disabled:bg-zinc-400 dark:bg-orange-600 dark:hover:bg-orange-700"
        >
          {isPending || isConfirming ? "Sending..." : "Send Transfer"}
        </button>
      </form>
      {(callsId || txHash) && (
        <div className="mt-4 rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">
          {callsStatus?.receipts?.[0]?.transactionHash ? (
            <>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Transaction Hash:{" "}
                <a
                  href={`https://sepolia.basescan.org/tx/${callsStatus.receipts[0].transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {callsStatus.receipts[0].transactionHash}
                </a>
              </p>
              {hasPaymasterSupport && (
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                  ⚡ Gas fees sponsored by paymaster
                </p>
              )}
            </>
          ) : callsId ? (
            <>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Call ID: <code className="break-all">{String(callsId)}</code>
              </p>
              {hasPaymasterSupport && (
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                  ⚡ Gas fees sponsored by paymaster
                </p>
              )}
              {callsStatus && (
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  Status: {callsStatus.status}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Transaction Hash:{" "}
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {txHash}
              </a>
            </p>
          )}
          {isSuccess && (
            <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
              ✓ Transaction confirmed!
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DebugPage() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-orange-500 p-8 font-sans dark:bg-orange-600">
            <h1 className="text-6xl font-bold text-white dark:text-zinc-50">
              Debug Page
            </h1>
            <div className="rounded-lg bg-white px-8 py-6 shadow-lg dark:bg-zinc-900">
              <ConnectButton />
            </div>
            <FaucetRequest />
            <TransferForm />
          </div>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
