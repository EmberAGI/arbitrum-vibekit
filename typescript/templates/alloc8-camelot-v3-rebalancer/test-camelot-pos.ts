// algebraPositions.ts
import {
    Address,
    Abi,
    Hex,
    Hash,
    createPublicClient,
    createWalletClient,
    http,
    parseUnits,
    decodeEventLog,
    zeroAddress,
  } from "viem";
  import { arbitrum } from "viem/chains";
  import { privateKeyToAccount } from "viem/accounts";
  import dotenv from "dotenv";
  
  dotenv.config();
  
  export const ALGEBRA_POSITION_MANAGER: Address =
    "0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15";
  
  // ---------- ABIs ----------
  
  const erc20Abi = [
    {
      type: "function",
      name: "decimals",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "uint8" }],
    },
    {
      type: "function",
      name: "allowance",
      stateMutability: "view",
      inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
      ],
      outputs: [{ type: "uint256" }],
    },
    {
      type: "function",
      name: "approve",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
    },
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ type: "uint256" }],
    },
  ] as const satisfies Abi;
  
  const algebraPositionManagerAbi = [
    // view: positions
    {
      inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
      name: "positions",
      outputs: [
        { internalType: "uint96", name: "nonce", type: "uint96" },
        { internalType: "address", name: "operator", type: "address" },
        { internalType: "address", name: "token0", type: "address" },
        { internalType: "address", name: "token1", type: "address" },
        { internalType: "int24", name: "tickLower", type: "int24" },
        { internalType: "int24", name: "tickUpper", type: "int24" },
        { internalType: "uint128", name: "liquidity", type: "uint128" },
        { internalType: "uint256", name: "feeGrowthInside0LastX128", type: "uint256" },
        { internalType: "uint256", name: "feeGrowthInside1LastX128", type: "uint256" },
        { internalType: "uint128", name: "tokensOwed0", type: "uint128" },
        { internalType: "uint128", name: "tokensOwed1", type: "uint128" },
      ],
      stateMutability: "view",
      type: "function",
    },
  
    // decreaseLiquidity
    {
      name: "decreaseLiquidity",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        {
          name: "params",
          type: "tuple",
          components: [
            { name: "tokenId", type: "uint256" },
            { name: "liquidity", type: "uint128" },
            { name: "amount0Min", type: "uint256" },
            { name: "amount1Min", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
      ],
      outputs: [],
    },
  
    // collect
    {
      name: "collect",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        {
          name: "params",
          type: "tuple",
          components: [
            { name: "tokenId", type: "uint256" },
            { name: "recipient", type: "address" },
            { name: "amount0Max", type: "uint128" },
            { name: "amount1Max", type: "uint128" },
          ],
        },
      ],
      outputs: [
        { name: "amount0", type: "uint256" },
        { name: "amount1", type: "uint256" },
      ],
    },
  
    // burn
    {
      name: "burn",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [{ name: "tokenId", type: "uint256" }],
      outputs: [],
    },
  
    // create & initialize pool if necessary
    {
      name: "createAndInitializePoolIfNecessary",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "token0", type: "address" },
        { name: "token1", type: "address" },
        { name: "sqrtPriceX96", type: "uint160" },
      ],
      outputs: [{ name: "pool", type: "address" }],
    },
  
    // mint
    {
      name: "mint",
      type: "function",
      stateMutability: "payable",
      inputs: [
        {
          name: "params",
          type: "tuple",
          components: [
            { name: "token0", type: "address" },
            { name: "token1", type: "address" },
            { name: "tickLower", type: "int24" },
            { name: "tickUpper", type: "int24" },
            { name: "amount0Desired", type: "uint256" },
            { name: "amount1Desired", type: "uint256" },
            { name: "amount0Min", type: "uint256" },
            { name: "amount1Min", type: "uint256" },
            { name: "recipient", type: "address" },
            { name: "deadline", type: "uint256" },
          ],
        },
      ],
      outputs: [
        { name: "tokenId", type: "uint256" },
        { name: "liquidity", type: "uint128" },
        { name: "amount0", type: "uint256" },
        { name: "amount1", type: "uint256" },
      ],
    },
  ] as const satisfies Abi;
  
  // Transfer event (ERC-721) to decode minted tokenId
  const erc721TransferEvent = {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  } as const;
  
  // ---------- Types ----------
  
  export type PositionTuple = readonly [
    nonce: bigint,
    operator: Address,
    token0: Address,
    token1: Address,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    tokensOwed0: bigint,
    tokensOwed1: bigint
  ];
  
  export interface CreatePositionParams {
    privateKey: Hex;
    rpcUrl?: string;
    token0: Address;
    token1: Address;
    amount0Desired: bigint; // in wei
    amount1Desired: bigint; // in wei
    tickLower: number;
    tickUpper: number;
    slippageBps?: number; // default 50 = 0.50%
    sqrtPriceX96?: bigint; // optional for new pools
    recipient?: Address;
  }
  
  export interface MintResult {
    txHash: Hash;
    blockNumber?: bigint;
    tokenId?: bigint; // decoded from Transfer event if present
    liquidity?: bigint;
    amount0?: bigint;
    amount1?: bigint;
  }
  
  // ---------- Core: read position ----------
  
  export async function getAlgebraPosition(
    tokenId: number | bigint,
    rpcUrl: string = "https://arb1.arbitrum.io/rpc"
  ): Promise<PositionTuple> {
    const client = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl),
    });
  
    const pos = await client.readContract({
      address: ALGEBRA_POSITION_MANAGER,
      abi: algebraPositionManagerAbi,
      functionName: "positions",
      args: [BigInt(tokenId)],
    });
  
    // pos is strongly typed from ABI; cast to our tuple type
    const t = pos as unknown as PositionTuple;
  
    console.log("Algebra Position:", {
      token0: t[2],
      token1: t[3],
      tickLower: t[4],
      tickUpper: t[5],
      liquidity: t[6].toString(),
      tokensOwed0: t[9].toString(),
      tokensOwed1: t[10].toString(),
    });
  
    return t;
  }
  
  // ---------- Helpers ----------
  
  async function ensureAllowance(params: {
    publicClient: ReturnType<typeof createPublicClient>;
    walletClient: ReturnType<typeof createWalletClient>;
    owner: Address;
    token: Address;
    amount: bigint;
  }): Promise<void> {
    const { publicClient, walletClient, owner, token, amount } = params;
  
    const allowance = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, ALGEBRA_POSITION_MANAGER],
    })) as bigint;
  
    if (allowance >= amount) return;
  
    const MAX_UINT256 = (1n << 256n) - 1n;
  
    const tx = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [ALGEBRA_POSITION_MANAGER, MAX_UINT256],
      account: walletClient.account!,
    });
    console.log(`📝 Approve ${token} tx:`, tx);
  
    await publicClient.waitForTransactionReceipt({ hash: tx });
  }
  
  function toMin(amount: bigint, bps: number): bigint {
    return (amount * BigInt(10_000 - bps)) / 10_000n;
  }
  
  // ---------- Create Position (Mint) ----------
  
  export async function createPosition({
    privateKey,
    rpcUrl = "https://arb1.arbitrum.io/rpc",
    token0,
    token1,
    amount0Desired,
    amount1Desired,
    tickLower,
    tickUpper,
    slippageBps = 50,
    sqrtPriceX96,
    recipient,
  }: CreatePositionParams): Promise<MintResult> {
    const account = privateKeyToAccount(
      privateKey.startsWith("0x") ? (privateKey as Hex) : (`0x${privateKey}` as Hex)
    );
  
    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl),
    });
  
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(rpcUrl),
    });
  
    // token ordering
    if (token0.toLowerCase() > token1.toLowerCase()) {
      throw new Error(
        "token0 must be lexicographically smaller than token1 (token0 < token1). Swap the params if needed."
      );
    }
  
    const amount0Min = toMin(amount0Desired, slippageBps);
    const amount1Min = toMin(amount1Desired, slippageBps);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
    const recv: Address = (recipient ?? account.address) as Address;
  
    // approvals
    await ensureAllowance({
      publicClient,
      walletClient,
      owner: account.address as Address,
      token: token0,
      amount: amount0Desired,
    });
    await ensureAllowance({
      publicClient,
      walletClient,
      owner: account.address as Address,
      token: token1,
      amount: amount1Desired,
    });
  
    // create & init pool if needed
    if (sqrtPriceX96 && sqrtPriceX96 > 0n) {
      const initTx = await walletClient.writeContract({
        address: ALGEBRA_POSITION_MANAGER,
        abi: algebraPositionManagerAbi,
        functionName: "createAndInitializePoolIfNecessary",
        args: [token0, token1, sqrtPriceX96],
        account,
      });
      console.log("🌊 Pool create+init tx:", initTx);
      await publicClient.waitForTransactionReceipt({ hash: initTx });
    }
  
    // mint
    const mintTxHash = await walletClient.writeContract({
      address: ALGEBRA_POSITION_MANAGER,
      abi: algebraPositionManagerAbi,
      functionName: "mint",
      args: [
        {
          token0,
          token1,
          tickLower,
          tickUpper,
          amount0Desired,
          amount1Desired,
          amount0Min,
          amount1Min,
          recipient: recv,
          deadline,
        },
      ],
      account,
      value: 0n,
    });
  
    console.log("🆕 Mint position tx:", mintTxHash);
  
    const rcpt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });
  
    // Try to decode the ERC721 Transfer event to extract tokenId
    let mintedTokenId: bigint | undefined;
    try {
      for (const log of rcpt.logs) {
        // Only logs from the NFPM
        if (log.address.toLowerCase() !== ALGEBRA_POSITION_MANAGER.toLowerCase()) continue;
  
        const decoded = decodeEventLog({
          abi: [erc721TransferEvent],
          data: log.data,
          topics: log.topics,
          strict: false,
        });
  
        if (decoded.eventName === "Transfer") {
          const from = decoded.args[0] as Address;
          const to = decoded.args[1] as Address;
          const tokenId = decoded.args[2] as bigint;
          // Mint is from 0x0 to recipient
          if (from.toLowerCase() === zeroAddress && to.toLowerCase() === recv.toLowerCase()) {
            mintedTokenId = tokenId;
            break;
          }
        }
      }
    } catch {
      // decoding is best-effort; ignore if it fails
    }
  
    return {
      txHash: mintTxHash,
      blockNumber: rcpt.blockNumber,
      tokenId: mintedTokenId,
    };
  }
  
  // ---------- Remove Liquidity (unchanged logic, with types) ----------
  
  export async function removeLiquidity(
    tokenId: number | bigint,
    privateKey: Hex,
    rpcUrl: string
  ): Promise<void> {
    const account = privateKeyToAccount(
      privateKey.startsWith("0x") ? (privateKey as Hex) : (`0x${privateKey}` as Hex)
    );
  
    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl),
    });
  
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(rpcUrl),
    });
  
    const pos = await getAlgebraPosition(tokenId, rpcUrl);
    let liquidity = pos[6];
    let tokensOwed0 = pos[9];
    let tokensOwed1 = pos[10];
  
    if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
      console.log("⚠️ Position already empty");
      return;
    }
  
    const MAX_UINT128 = (1n << 128n) - 1n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
  
    // latest nonce (optional: viem can auto-manage, but keeping your flow)
    let nonce = await publicClient.getTransactionCount({
      address: account.address as Address,
      blockTag: "pending",
    });
  
    // 1) decrease liquidity if > 0
    if (liquidity > 0n) {
      const decTxHash = await walletClient.writeContract({
        address: ALGEBRA_POSITION_MANAGER,
        abi: algebraPositionManagerAbi,
        functionName: "decreaseLiquidity",
        args: [
          {
            tokenId: BigInt(tokenId),
            liquidity,
            amount0Min: 0n,
            amount1Min: 0n,
            deadline,
          },
        ],
        account,
        nonce,
      });
      console.log("✅ Decrease liquidity tx:", decTxHash);
      await publicClient.waitForTransactionReceipt({ hash: decTxHash });
      nonce++;
    }
  
    // 2) collect tokens + fees
    const collectTxHash = await walletClient.writeContract({
      address: ALGEBRA_POSITION_MANAGER,
      abi: algebraPositionManagerAbi,
      functionName: "collect",
      args: [
        {
          tokenId: BigInt(tokenId),
          recipient: account.address as Address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ],
      account,
      nonce,
    });
    console.log("✅ Collect tx:", collectTxHash);
    await publicClient.waitForTransactionReceipt({ hash: collectTxHash });
    nonce++;
  
    // 3) refresh position and burn if empty
    const posAfter = await getAlgebraPosition(tokenId, rpcUrl);
    liquidity = posAfter[6];
    tokensOwed0 = posAfter[9];
    tokensOwed1 = posAfter[10];
  
    if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
      const burnTxHash = await walletClient.writeContract({
        address: ALGEBRA_POSITION_MANAGER,
        abi: algebraPositionManagerAbi,
        functionName: "burn",
        args: [BigInt(tokenId)],
        account,
        nonce,
      });
      console.log("🔥 Burn tx:", burnTxHash);
      await publicClient.waitForTransactionReceipt({ hash: burnTxHash });
    } else {
      console.log("ℹ️ Position still has value, skipping burn");
    }
  }
  
  // ---------- Example usage (uncomment to run) ----------
  async function mintWithQuote(
    clients: {
      publicClient: ReturnType<typeof createPublicClient>;
      walletClient: ReturnType<typeof createWalletClient>;
      account: ReturnType<typeof privateKeyToAccount>;
    },
    params: {
      token0: Address;
      token1: Address;
      tickLower: number;
      tickUpper: number;
      amount0Desired: bigint;
      amount1Desired: bigint;
      recipient: Address;
      deadline: bigint;
      slippageBps?: bigint; // e.g. 50n = 0.50%
    }
  ) {
    const { publicClient, walletClient, account } = clients;
    const {
      token0, token1, tickLower, tickUpper,
      amount0Desired, amount1Desired, recipient, deadline,
      slippageBps = 50n,
    } = params;
  
    // 1) simulate with zero mins (account is important in viem v2)
    const sim = await publicClient.simulateContract({
      address: ALGEBRA_POSITION_MANAGER,
      abi: algebraPositionManagerAbi,
      functionName: "mint",
      args: [{
        token0,
        token1,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient,
        deadline,
      }],
      account,
      value: 0n, // Algebra NFPM.mint is payable; usually 0
    });
  
    // [tokenId, liquidity, amount0, amount1]
    const [, , quoted0, quoted1] = sim.result as readonly [bigint, bigint, bigint, bigint];
  
    // 2) compute mins from the quote
    const amount0Min = (quoted0 * (10000n - slippageBps)) / 10000n;
    const amount1Min = (quoted1 * (10000n - slippageBps)) / 10000n;
  
    // 3) send tx (reuse calldata from simulation, overriding args to set mins)
    const txHash = await walletClient.writeContract({
      ...sim.request,
      args: [{
        token0,
        token1,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient,
        deadline,
      }],
    });
  
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash, receipt, quoted0, quoted1, amount0Min, amount1Min };
  }
  
  
  
  (async () => {
    const privateKey = process.env.WALLET_PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error("WALLET_PRIVATE_KEY is undefined. Please check your .env file");
    }
  
    const rpcUrl = "https://arb1.arbitrum.io/rpc";
    const tokenId = 266367;
  
    // await getAlgebraPosition(tokenId, rpcUrl);
    // await removeLiquidity(tokenId, privateKey, rpcUrl);
  

      const account = privateKeyToAccount(
        privateKey.startsWith("0x") ? (privateKey as Hex) : (`0x${privateKey}` as Hex)
      );
    
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(rpcUrl),
      });
    
      const walletClient = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(rpcUrl),
      });
    const res = await mintWithQuote(
        { publicClient, walletClient, account },             // clients
        {
          token0: "0x912CE59144191C1204E64559FE8253a0e49E6548", // ARB
          token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
          tickLower: -284140,
          tickUpper: -282740,
          amount0Desired: parseUnits("0.5", 18),               // ARB 18dp
          amount1Desired: parseUnits("1", 6),                  // USDC 6dp
          recipient: walletClient.account!.address as Address,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
          slippageBps: 50n,
        }
      );
      console.log("Mint result:", res);
 
      
      
  })();

  
  // ---------- Optional: tsconfig hints ----------
  // {
  //   "compilerOptions": {
  //     "target": "ES2020",
  //     "module": "ESNext",
  //     "moduleResolution": "Bundler",
  //     "strict": true,
  //     "esModuleInterop": true,
  //     "skipLibCheck": true,
  //     "resolveJsonModule": true,
  //     "types": ["node"]
  //   }
  // }
  