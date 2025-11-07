"use client";

import { ConnectButton, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { type BaseError, formatEther, isAddress, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useEstimateFeesPerGas,
  useEstimateGas,
  useWaitForTransactionReceipt,
  WagmiProvider,
} from "wagmi";
import { useClient } from "@getpara/react-sdk";
import { createParaAccount, createParaViemClient } from "@getpara/viem-v2-integration";
import { http } from "viem";
import { ParaClientProvider } from "../ParaClientProvider";
import { queryClient, wagmiConfig } from "./wagmi-config";
import "@rainbow-me/rainbowkit/styles.css";

function FaucetRequest() {
  const { address: connectedAddress, isConnected, chain } = useAccount();

  // Base Sepolia ERC-20 token addresses (verified via Blockscout)
  // Get testnet tokens from CDP faucet: https://portal.cdp.coinbase.com/products/faucet
  const BASE_SEPOLIA_TOKENS = {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const, // USDC - 6 decimals
    eurc: "0xF70461ffb413981852683657A310892227e3989e" as const, // Circle EUR - 6 decimals
    cbbtc: "0xcbB7C0006F23900c38EB856149F799620fcb8A4a" as const, // Coinbase Wrapped BTC - 8 decimals
  };

  // Fetch ETH balance
  const { data: ethBalance, refetch: refetchEth } = useBalance({
    address: connectedAddress,
  });

  // Fetch USDC balance (only on Base Sepolia)
  const { data: usdcBalance, refetch: refetchUsdc } = useBalance({
    address: connectedAddress,
    token: BASE_SEPOLIA_TOKENS.usdc,
    query: {
      enabled: chain?.id === 84532, // Only fetch on Base Sepolia
    },
  });

  // Fetch EURC balance (only on Base Sepolia)
  const { data: eurcBalance, refetch: refetchEurc } = useBalance({
    address: connectedAddress,
    token: BASE_SEPOLIA_TOKENS.eurc,
    query: {
      enabled: chain?.id === 84532, // Only fetch on Base Sepolia
    },
  });

  // Fetch cbBTC balance (only on Base Sepolia)
  const { data: cbbtcBalance, refetch: refetchCbbtc } = useBalance({
    address: connectedAddress,
    token: BASE_SEPOLIA_TOKENS.cbbtc,
    query: {
      enabled: chain?.id === 84532, // Only fetch on Base Sepolia
    },
  });

  const [customAddress, setCustomAddress] = useState("");
  const [selectedToken, setSelectedToken] = useState<
    "eth" | "usdc" | "eurc" | "cbbtc"
  >("eth");
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Token configuration with amounts and rate limits
  const tokenConfig = {
    eth: { amount: "0.0001", rateLimit: "0.1 ETH per 24 hours" },
    usdc: { amount: "1", rateLimit: "10 USDC per 24 hours" },
    eurc: { amount: "1", rateLimit: "10 EURC per 24 hours" },
    cbbtc: { amount: "0.0001", rateLimit: "0.001 cbBTC per 24 hours" },
  };

  // Check if current network is supported
  const networkMap: Record<number, string> = {
    84532: "base-sepolia", // Base Sepolia - supports all tokens
    11155111: "ethereum-sepolia", // Ethereum Sepolia - supports all tokens
    421614: "arbitrum-sepolia", // Arbitrum Sepolia - NOT supported by CDP faucet
  };

  const isArbitrumSepolia = chain?.id === 421614;

  const handleRefreshBalances = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchEth(),
        chain?.id === 84532 ? refetchUsdc() : Promise.resolve(),
        chain?.id === 84532 ? refetchEurc() : Promise.resolve(),
        chain?.id === 84532 ? refetchCbbtc() : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFaucetRequest = async () => {
    if (!chain) return;

    // Use custom address if provided, otherwise use connected address
    const targetAddress = customAddress.trim() || connectedAddress;

    if (!targetAddress) {
      setError("Please connect a wallet or enter an address");
      return;
    }

    // Validate address format
    if (!isAddress(targetAddress)) {
      setError("Invalid Ethereum address");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccess(false);
    setTxHash("");

    try {
      const network = networkMap[chain.id];
      if (!network) {
        setError(`Network ${chain.name} not supported by CDP faucet`);
        setIsLoading(false);
        return;
      }

      if (isArbitrumSepolia) {
        setError(
          "Arbitrum Sepolia is not supported by CDP faucet. Please switch to Base Sepolia or Ethereum Sepolia.",
        );
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: targetAddress,
          network,
          token: selectedToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Faucet request failed");
      }

      setTxHash(data.transactionHash);
      setSuccess(true);
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
            <code className="break-all text-xs">{connectedAddress}</code>
          </p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            <strong>Network:</strong> {chain?.name}
          </p>

          {/* Show all token balances on Base Sepolia */}
          {chain?.id === 84532 ? (
            <div className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center justify-between">
                <p>
                  <strong>Balances:</strong>
                </p>
                <button
                  type="button"
                  onClick={handleRefreshBalances}
                  disabled={isRefreshing}
                  className="rounded-md bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-300 disabled:bg-zinc-100 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:disabled:bg-zinc-800"
                >
                  {isRefreshing ? "Refreshing..." : "🔄 Refresh"}
                </button>
              </div>
              <div className="ml-2 space-y-0.5">
                <p>
                  <span className="text-zinc-600 dark:text-zinc-400">ETH:</span>{" "}
                  {ethBalance ? (
                    <span className="font-mono text-green-600 dark:text-green-400">
                      {parseFloat(ethBalance.formatted).toFixed(6)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Loading...
                    </span>
                  )}
                </p>
                <p>
                  <span className="text-zinc-600 dark:text-zinc-400">USDC:</span>{" "}
                  {usdcBalance ? (
                    <span className="font-mono text-green-600 dark:text-green-400">
                      {parseFloat(usdcBalance.formatted).toFixed(6)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Loading...
                    </span>
                  )}
                </p>
                <p>
                  <span className="text-zinc-600 dark:text-zinc-400">EURC:</span>{" "}
                  {eurcBalance ? (
                    <span className="font-mono text-green-600 dark:text-green-400">
                      {parseFloat(eurcBalance.formatted).toFixed(6)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Loading...
                    </span>
                  )}
                </p>
                <p>
                  <span className="text-zinc-600 dark:text-zinc-400">cbBTC:</span>{" "}
                  {cbbtcBalance ? (
                    <span className="font-mono text-green-600 dark:text-green-400">
                      {parseFloat(cbbtcBalance.formatted).toFixed(8)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Loading...
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              <strong>Current Balance:</strong>{" "}
              {ethBalance ? (
                <span className="font-mono text-green-600 dark:text-green-400">
                  {parseFloat(ethBalance.formatted).toFixed(6)}{" "}
                  {ethBalance.symbol}
                </span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">
                  Loading...
                </span>
              )}
            </p>
          )}
        </div>

        {isArbitrumSepolia && (
          <div className="rounded-md bg-yellow-100 p-3 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-400">
              ⚠️ Arbitrum Sepolia is not supported by CDP faucet. Please switch
              to Base Sepolia or Ethereum Sepolia.
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="faucet-address"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Recipient Address (optional, defaults to connected wallet)
          </label>
          <input
            id="faucet-address"
            type="text"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            placeholder={connectedAddress || "0x..."}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label
            htmlFor="token-select"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Select Token
          </label>
          <select
            id="token-select"
            value={selectedToken}
            onChange={(e) =>
              setSelectedToken(e.target.value as typeof selectedToken)
            }
            disabled={isArbitrumSepolia}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:disabled:bg-zinc-700"
          >
            <option value="eth">
              ETH - {tokenConfig.eth.amount} per claim
            </option>
            <option value="usdc">
              USDC - {tokenConfig.usdc.amount} per claim
            </option>
            <option value="eurc">
              EURC - {tokenConfig.eurc.amount} per claim
            </option>
            <option value="cbbtc">
              cbBTC - {tokenConfig.cbbtc.amount} per claim
            </option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleFaucetRequest}
          disabled={isLoading || isArbitrumSepolia}
          className="w-full rounded-md bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:bg-zinc-400 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {isLoading
            ? "Requesting..."
            : `Request ${tokenConfig[selectedToken].amount} ${selectedToken.toUpperCase()}`}
        </button>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Rate limit: {tokenConfig[selectedToken].rateLimit}
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [sendTxError, setSendTxError] = useState<Error | null>(null);

  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const paraClient = useClient(); // Get Para client instance

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Pre-compute parsed value & gas/fee estimates for UX validation
  const parsedValue = (() => {
    try {
      return amount ? parseEther(amount) : undefined;
    } catch {
      return undefined;
    }
  })();

  const canEstimate = isAddress(to) && parsedValue !== undefined;

  const { data: gasEstimate } = useEstimateGas({
    account: address,
    to: canEstimate ? (to as `0x${string}`) : undefined,
    value: canEstimate ? (parsedValue as bigint) : undefined,
    query: { enabled: canEstimate },
  });

  const { data: feeEstimates } = useEstimateFeesPerGas({
    query: { enabled: canEstimate },
  });

  const totalRequired =
    parsedValue !== undefined && gasEstimate && feeEstimates?.maxFeePerGas
      ? (parsedValue as bigint) + gasEstimate * feeEstimates.maxFeePerGas
      : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSendTxError(null);

    if (!to || !amount) {
      setValidationError("Please fill in all fields");
      return;
    }

    // Validate address format
    if (!isAddress(to)) {
      setValidationError(
        "Invalid Ethereum address. Please use a valid address (lowercase or EIP-55 checksum format)",
      );
      return;
    }

    // Validate balance can cover value + estimated gas
    if (
      totalRequired !== undefined &&
      balance?.value !== undefined &&
      totalRequired > balance.value
    ) {
      setValidationError(
        `Insufficient funds. Required (incl. max gas): ${formatEther(
          totalRequired,
        )} ETH, Available: ${formatEther(balance.value)} ETH`,
      );
      return;
    }

    if (!paraClient) {
      setValidationError("Para client not available");
      return;
    }

    if (!chain) {
      setValidationError("Chain not selected");
      return;
    }

    // Send transaction using Para's Viem client
    try {
      setIsPending(true);
      console.log("Submitting tx via Para Viem client", {
        chain: chain.name,
        chainId,
        to,
        amount,
      });

      // Create Para Viem account and wallet client
      const paraAccount = await createParaAccount(paraClient);
      const paraWalletClient = createParaViemClient(paraClient, {
        account: paraAccount,
        chain: chain,
        transport: http(),
      });

      // Send transaction using Para's wallet client
      const hash = await paraWalletClient.sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amount),
      });

      setTxHash(hash);
    } catch (error) {
      console.error("Transaction failed:", error);
      setSendTxError(error as Error);
    } finally {
      setIsPending(false);
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
      <h2 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Transfer ETH
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
      {txHash && (
        <div className="mt-4 rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">
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
          {isSuccess && (
            <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
              ✓ Transaction confirmed!
            </p>
          )}
        </div>
      )}
      {validationError && (
        <div className="mt-4 rounded-md bg-yellow-100 p-3 dark:bg-yellow-900/20">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
            ⚠️ Validation Error
          </p>
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
            {validationError}
          </p>
        </div>
      )}
      {sendTxError && (
        <div className="mt-4 rounded-md bg-red-100 p-3 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            ❌ Transaction Failed
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-500">
            {(sendTxError as BaseError)?.shortMessage || sendTxError?.message}
          </p>
          {Boolean((sendTxError as BaseError)?.details) && (
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-red-700/90 dark:text-red-400/90">
              {(sendTxError as BaseError).details}
            </pre>
          )}
          {Array.isArray((sendTxError as BaseError)?.metaMessages) && (
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-red-700/80 dark:text-red-400/80">
              {(sendTxError as BaseError).metaMessages?.join("\n")}
            </pre>
          )}
          {sendTxError?.cause !== undefined &&
            sendTxError?.cause !== null && (
              <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-red-700/70 dark:text-red-400/70">
                Cause:{" "}
                {String(
                  (sendTxError.cause as Error)?.message ||
                    (sendTxError.cause as string) ||
                    "Unknown cause",
                )}
              </pre>
            )}
          {(() => {
            if (console?.error) {
              console.error("sendTransaction error", sendTxError);
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
}

export default function DebugPage() {
  return (
    <ParaClientProvider>
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
    </ParaClientProvider>
  );
}
