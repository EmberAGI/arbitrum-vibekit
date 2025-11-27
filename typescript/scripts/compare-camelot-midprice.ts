import {
  Address,
  createPublicClient,
  erc20Abi,
  encodeFunctionData,
  getAddress,
  http,
  zeroAddress,
} from "viem";
import { arbitrum } from "viem/chains";

const GLOBAL_STATE_ABI = [
  {
    name: "globalState",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [],
  },
] as const;

type EmberPool = {
  identifier: { address: string };
  price: string;
  providerId: string;
  tokens: Array<{ symbol: string; address: string }>;
};

const DEFAULT_CHAIN_ID = 42161; // Arbitrum One
const DEFAULT_POOL_ADDRESS = "0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526"; // WETH/USDC
const DEFAULT_EMBER_API_BASE_URL = "https://api.emberai.xyz";
const ITERATIONS = 10;
const POLL_INTERVAL_MS = 5000;

const ALGEBRA_POOL_MIN_ABI = [
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function fetchOnchainMidprice(chainId: number, poolAddress: Address) {
  if (chainId !== arbitrum.id) {
    throw new Error(`Unsupported chainId ${chainId}; only Arbitrum (42161) is wired`);
  }

  const rpcUrl = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";

  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl),
  });

  const [token0, token1, globalState] = await Promise.all([
    client.readContract({
      address: poolAddress,
      abi: ALGEBRA_POOL_MIN_ABI,
      functionName: "token0",
    }),
    client.readContract({
      address: poolAddress,
      abi: ALGEBRA_POOL_MIN_ABI,
      functionName: "token1",
    }),
    readGlobalState(client, poolAddress),
  ]);

  if (!token0 || !token1 || token0 === zeroAddress || token1 === zeroAddress) {
    throw new Error("Pool returned empty token addresses");
  }

  const [decimals0, decimals1] = await Promise.all([
    client.readContract({
      address: token0,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: token1,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);

  const sqrtPriceX96 = globalState.price;
  const decimalsDiff = decimals0 - decimals1;
  const priceX192 = sqrtPriceX96 * sqrtPriceX96; // still integer, Q192
  let numerator = priceX192;
  let denominator = 1n << 192n; // 2^192

  if (decimalsDiff >= 0) {
    numerator *= 10n ** BigInt(decimalsDiff);
  } else {
    denominator *= 10n ** BigInt(-decimalsDiff);
  }

  const token1PerToken0 = divideToDecimal(numerator, denominator);
  const token0PerToken1 = token1PerToken0 === 0 ? 0 : 1 / token1PerToken0;

  return {
    token0,
    token1,
    decimals0,
    decimals1,
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: globalState.tick,
    rawGlobalState: globalState.rawWords,
    token1PerToken0,
    token0PerToken1,
  };
}

function parseSigned(word: bigint, bits: number) {
  const max = 1n << BigInt(bits);
  const half = max >> 1n;
  return word >= half ? Number(word - max) : Number(word);
}

async function readGlobalState(client: ReturnType<typeof createPublicClient>, poolAddress: Address) {
  const data = await client.request({
    method: "eth_call",
    params: [
      {
        to: poolAddress,
        data: encodeFunctionData({
          abi: GLOBAL_STATE_ABI,
          functionName: "globalState",
        }),
      },
      "latest",
    ],
  });

  const words = sliceWords(data);
  if (words.length < 2) {
    throw new Error(`Unexpected globalState payload: ${data}`);
  }

  const price = BigInt(words[0]);
  const tickWord = BigInt(words[1]);
  const tick = parseSigned(tickWord, 256);

  return {
    price,
    tick,
    rawWords: words,
  };
}

function sliceWords(data: string) {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length % 64 !== 0) {
    // pad right if some nodes trim leading zeros
    const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
    return sliceWords(`0x${padded}`);
  }
  const words: string[] = [];
  for (let i = 0; i < hex.length; i += 64) {
    words.push(`0x${hex.slice(i, i + 64)}`);
  }
  return words;
}

async function fetchEmberPrice(
  chainId: number,
  poolAddress: string,
  emberApiBaseUrl: string,
) {
  const baseUrl = emberApiBaseUrl.replace(/\/$/, "");
  const url = new URL("/liquidity/pools", baseUrl);
  url.searchParams.set("chainId", String(chainId));

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ember API failed ${response.status}: ${body}`);
  }
  const json = (await response.json()) as { liquidityPools: EmberPool[] };
  const match = json.liquidityPools.find(
    (pool) =>
      pool.identifier.address.toLowerCase() === poolAddress.toLowerCase(),
  );
  if (!match) {
    return undefined;
  }

  const rawPrice = Number(match.price);
  const token0PerToken1 =
    Number.isFinite(rawPrice) && rawPrice !== 0 ? 1 / rawPrice : undefined;

  return {
    rawPrice,
    token0PerToken1,
    providerId: match.providerId,
    token0Symbol: match.tokens[0]?.symbol,
    token1Symbol: match.tokens[1]?.symbol,
  };
}

function divideToDecimal(numerator: bigint, denominator: bigint, precision = 18) {
  if (denominator === 0n) {
    throw new Error("Denominator is zero");
  }
  const scaled = (numerator * 10n ** BigInt(precision)) / denominator;
  const scaledStr = scaled.toString();
  const intPart = scaledStr.slice(0, -precision) || "0";
  const fracPart = scaledStr.slice(-precision).padStart(precision, "0");
  return Number(`${intPart}.${fracPart}`);
}

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  const chainId = Number(arg2 ?? process.env.CHAIN_ID ?? DEFAULT_CHAIN_ID);
  const poolAddress = getAddress(
    (arg1 ?? process.env.POOL_ADDRESS ?? DEFAULT_POOL_ADDRESS) as Address,
  );
  const emberApiBaseUrl = (
    process.env.EMBER_API_BASE_URL?.trim() || DEFAULT_EMBER_API_BASE_URL
  ).replace(/\/$/, "");

  console.log("Pool midprice comparison config", {
    chainId,
    poolAddress,
    rpcUrl: process.env.RPC_URL || "https://arb1.arbitrum.io/rpc",
    iterations: ITERATIONS,
    emberApiBaseUrl,
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  for (let i = 0; i < ITERATIONS; i++) {
    const [onchain, ember] = await Promise.all([
      fetchOnchainMidprice(chainId, poolAddress),
      fetchEmberPrice(chainId, poolAddress, emberApiBaseUrl),
    ]);

    if (i === 0) {
      console.log("Pool tokens", {
        token0: onchain.token0,
        token1: onchain.token1,
        decimals0: onchain.decimals0,
        decimals1: onchain.decimals1,
      });
    }

    console.log({
      iteration: i + 1,
      timestamp: new Date().toISOString(),
      tick: onchain.tick,
      sqrtPriceX96: onchain.sqrtPriceX96,
      onchain: {
        token1PerToken0: onchain.token1PerToken0,
        token0PerToken1: onchain.token0PerToken1,
      },
      ember: ember
        ? {
            token0PerToken1: ember.token0PerToken1,
            rawPrice: ember.rawPrice,
            providerId: ember.providerId,
          }
        : "Pool not found in Ember API response",
    });

    // avoid hammering the endpoint; ~1s pause between iterations
    if (i < ITERATIONS - 1) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Comparison failed", error);
  process.exitCode = 1;
});
