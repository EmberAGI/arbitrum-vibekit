import { type Chain, createPublicClient, formatEther, formatUnits, http } from "viem";
import { arbitrum, arbitrumSepolia, base, baseSepolia } from "viem/chains";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
] as const;

// Token definitions for Base Sepolia
const BASE_SEPOLIA_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
    decimals: 6,
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    address: "0x808456652fdb597867f38412077A9182bf77359F" as `0x${string}`,
    decimals: 6,
  },
  {
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    address: "0xcbB7C0006F23900c38EB856149F799620fcb8A4a" as `0x${string}`,
    decimals: 8,
  },
];

// Supported networks mapping
const SUPPORTED_NETWORKS: Record<string, Chain> = {
  "base": base,
  "base-sepolia": baseSepolia,
  "arbitrum": arbitrum,
  "arbitrum-sepolia": arbitrumSepolia,
};

// Define the schema for tool parameters
export const schema = {
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format")
    .describe("The Ethereum address to check balance for (0x...)"),
  network: z
    .enum(["base", "base-sepolia", "arbitrum", "arbitrum-sepolia"])
    .describe(
      "The network to check balance on (base, base-sepolia, arbitrum, or arbitrum-sepolia)",
    ),
  rpcUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional custom RPC URL for the network"),
} satisfies Record<string, z.ZodTypeAny>;

// Define tool metadata
export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "balance" : "check-balance";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Check balance";
    }
    return "Check the native token balance (ETH) and token balances of an address. For Base Sepolia, also checks USDC, EURC, and cbBTC balances. Returns balance in both wei and ether/token units.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "Check Balance" : "Check Address Balance";
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

// Tool implementation
export default async function checkBalance({
  address,
  network,
  rpcUrl,
}: InferSchema<typeof schema>) {
  try {
    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error(
        "Invalid address format. Must be a 42-character hex string starting with 0x",
      );
    }

    // Get chain configuration
    const chain = SUPPORTED_NETWORKS[network];
    if (!chain) {
      throw new Error(
        `Unsupported network: ${network}. Supported networks: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}`,
      );
    }

    // Create public client
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Get native ETH balance
    const balanceWei = await publicClient.getBalance({
      address: address as `0x${string}`,
    });

    // Convert to ether for readability
    const balanceEther = formatEther(balanceWei);

    const result: {
      success: boolean;
      address: string;
      network: string;
      balance: {
        wei: string;
        ether: string;
      };
      chainId: number;
      chainName: string;
      tokens?: Array<{
        symbol: string;
        name: string;
        address: string;
        balance: string;
        formatted: string;
        decimals: number;
      }>;
    } = {
      success: true,
      address,
      network,
      balance: {
        wei: balanceWei.toString(),
        ether: balanceEther,
      },
      chainId: chain.id,
      chainName: chain.name,
    };

    // If Base Sepolia, also check token balances
    if (network === "base-sepolia") {
      result.tokens = [];

      for (const token of BASE_SEPOLIA_TOKENS) {
        try {
          const tokenBalance = await publicClient.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          });

          result.tokens.push({
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            balance: tokenBalance.toString(),
            formatted: formatUnits(tokenBalance, token.decimals),
            decimals: token.decimals,
          });
        } catch (error) {
          // If token balance fetch fails, add with error
          result.tokens.push({
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            balance: "0",
            formatted: "Error fetching balance",
            decimals: token.decimals,
          });
        }
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const result = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to check balance",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
