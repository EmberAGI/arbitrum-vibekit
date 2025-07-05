import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { env } from './config.js';
import { z } from 'zod';
import { BigNumber, utils, Contract } from 'ethers';
import { wallet } from './compound.js';
import Compound from '@compound-finance/compound-js';

// Add ERC20 ABI for balance and approval checks
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Add Comet ABI for direct contract interaction
const COMET_ABI = [
  // Supply & Borrow
  "function supply(address asset, uint amount)",
  "function supplyTo(address dst, address asset, uint amount)",
  "function withdraw(address asset, uint amount)",
  "function withdrawTo(address to, address asset, uint amount)",
  "function withdrawFrom(address src, address to, address asset, uint amount)",
  
  // Balances & Info
  "function balanceOf(address account) view returns (uint256)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
  "function isBorrowCollateralized(address account) view returns (bool)",
  "function isLiquidatable(address account) view returns (bool)",
  
  // Market Data
  "function getUtilization() view returns (uint)",
  "function getSupplyRate(uint utilization) view returns (uint64)",
  "function getBorrowRate(uint utilization) view returns (uint64)",
  "function getPrice(address priceFeed) view returns (uint128)",
  "function baseScale() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrow() view returns (uint256)",
  "function baseBorrowMin() view returns (uint256)",
  
  // Asset Info
  "function getAssetInfo(uint8 i) view returns (tuple(uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getAssetInfoByAddress(address asset) view returns (tuple(uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))"
];

// Known token addresses map is now empty by default; users can override via env
// or simply provide addresses in every call. USDC/WBTC on Arbitrum mainnet are
// provided as a convenience only when CHAIN_ID === 42161.
const KNOWN_TOKENS: Record<string, string> = {};

if (env.CHAIN_ID === undefined || Number(env.CHAIN_ID) === 42161) {
  Object.assign(KNOWN_TOKENS, {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    WBTC: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
    WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  });
}

const COMET_ADDRESS = env.COMET_ADDRESS;

const server = new McpServer({
  name: 'compound-v3-mcp',
  version: '0.1.0',
});

// Define Zod schemas for operations (no user field)
const supplySchema = z.object({
  asset: z.string().describe('Asset address to supply'),
  amount: z.string().describe('Amount to supply (string for precision)'),
});
type SupplyParams = z.infer<typeof supplySchema>;

const borrowSchema = z.object({
  asset: z.string().describe('Asset address to borrow'),
  amount: z.string().describe('Amount to borrow (string for precision)'),
});
type BorrowParams = z.infer<typeof borrowSchema>;

const repaySchema = z.object({
  asset: z.string().describe('Asset address to repay'),
  amount: z.string().describe('Amount to repay (string for precision)'),
});
type RepayParams = z.infer<typeof repaySchema>;

const getMarketDataSchema = z.object({
  asset: z.string().describe('Asset address to fetch market data for'),
});
type GetMarketDataParams = z.infer<typeof getMarketDataSchema>;

// Register stub tools
type ToolRegistration = unknown;

// Helper to resolve user-provided asset (symbol or address) into the symbol string
function resolveAssetSymbol(input: string): string {
  const deployment = 'arbitrum_usdc';
  const normalized = input.trim();
  // If user provided address
  if (normalized.startsWith('0x')) {
    // Loop through known addresses in Compound constants for the chosen deployment
    const addrMap = (Compound as any).address?.[deployment] as Record<string, any>;
    if (addrMap) {
      const lower = normalized.toLowerCase();
      for (const [symbol, val] of Object.entries(addrMap)) {
        const candidate = typeof val === 'string' ? val : val?.contract;
        if (typeof candidate === 'string' && candidate.toLowerCase() === lower) {
          return symbol as string;
        }
      }
    }
    // Fallback – return address which will likely fail in SDK validation
    return normalized;
  }
  // Assume caller supplied symbol already
  return normalized.toUpperCase();
}

// Implemented tool: supply via Compound.js
server.tool(
  'supply',
  'Supply assets to Compound v3',
  supplySchema.shape,
  async (params: SupplyParams) => {
    console.error('[supply] Received params:', {
      asset: params.asset,
      amount: params.amount,
      amountType: typeof params.amount,
      amountLength: params.amount.length
    });
    
    try {
      const assetSymbol = resolveAssetSymbol(params.asset);
      console.error('[supply] Resolved asset symbol:', assetSymbol);

      // Get the token address from our known tokens
      const tokenAddress = KNOWN_TOKENS[assetSymbol as keyof typeof KNOWN_TOKENS];
      if (!tokenAddress) {
        throw new Error(`Unsupported token ${assetSymbol}. Supported symbols: ${Object.keys(KNOWN_TOKENS).join(', ')}`);
      }
      console.error('[supply] Token address:', tokenAddress);

      // Create ERC20 contract instance
      const tokenContract = new Contract(tokenAddress, ERC20_ABI, wallet);

      // Get token decimals
      const decimals = await tokenContract.decimals();
      console.error('[supply] Token decimals:', decimals);

      // Parse amount as decimal string into atomic units
      const amountStr = params.amount.trim();
      console.error('[supply] Raw amount string:', amountStr);
      if (!/^[0-9]+(\.[0-9]+)?$/.test(amountStr)) {
        const msg = `Invalid amount string: '${params.amount}'. Please provide the amount as a number, optionally with decimal places (e.g. '1.5').`;
        console.error('[supply] Validation failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }
      const amount = utils.parseUnits(amountStr, decimals);
      console.error('[supply] Parsed amount (atomic units):', amount.toString());

      // Check balance
      const balance = await tokenContract.balanceOf(wallet.address);
      console.error('[supply] Current balance:', balance.toString());
      
      if (balance.lt(amount)) {
        const msg = `Insufficient balance. Have ${balance.toString()} but trying to supply ${amount.toString()}`;
        console.error('[supply] Balance check failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }

      // Use COMET_ADDRESS resolved at startup
      const cometAddress = COMET_ADDRESS;
      console.error('[supply] Comet address:', cometAddress);

      // Check and handle approval if needed
      const allowance = await tokenContract.allowance(wallet.address, cometAddress);
      console.error('[supply] Current allowance:', allowance.toString());
      
      if (allowance.lt(amount)) {
        console.error('[supply] Approving token spend...');
        const approveTx = await tokenContract.approve(cometAddress, amount);
        await approveTx.wait(1);
        console.error('[supply] Approval tx:', approveTx.hash);
      }

      // Create Comet contract instance and supply directly
      const cometContract = new Contract(cometAddress, COMET_ABI, wallet);
      const tx = await cometContract.supply(tokenAddress, amount);
      console.error('[supply] Tx hash:', tx.hash);
      await tx.wait(1);
      return { content: [{ type: 'text', text: `Supply successful. Tx hash: ${tx.hash}` }] };
    } catch (error: unknown) {
      console.error('[supply] Supply failed:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[supply] Detailed error:', {
        error,
        message: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      return { isError: true, content: [{ type: 'text', text: `Supply failed: ${errorMsg}` }] };
    }
  }
);

// Implemented tool: borrow (withdraw base asset)
server.tool(
  'borrow',
  'Borrow base asset from Compound v3',
  borrowSchema.shape,
  async (params: BorrowParams) => {
    try {
      const assetSymbol = resolveAssetSymbol(params.asset);
      console.error('[borrow] Resolved asset symbol:', assetSymbol);

      // Resolve token address either from KNOWN_TOKENS or direct address input
      const tokenAddress = KNOWN_TOKENS[assetSymbol as keyof typeof KNOWN_TOKENS];
      if (!tokenAddress) {
        throw new Error(`Unsupported token ${assetSymbol}. Supported symbols: ${Object.keys(KNOWN_TOKENS).join(', ')}`);
      }
      console.error('[borrow] Token address:', tokenAddress);

      // Validate amount string
      const amountStr = params.amount.trim();
      if (!/^[0-9]+$/.test(amountStr)) {
        const msg = `Invalid amount string: '${params.amount}'. Please provide the amount as a plain integer string (atomic units) without decimal points or scientific notation.`;
        console.error('[borrow] Validation failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }

      // Create Comet contract instance
      const cometContract = new Contract(COMET_ADDRESS, COMET_ABI, wallet);

      // Check if account is collateralized enough for borrowing
      const isCollateralized = await cometContract.isBorrowCollateralized(wallet.address);
      if (!isCollateralized) {
        const msg = "Account is not sufficiently collateralized for borrowing";
        console.error('[borrow] Collateral check failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }

      // Check minimum borrow amount
      const minBorrow = await cometContract.baseBorrowMin();
      const amount = BigNumber.from(amountStr);
      if (amount.lt(minBorrow)) {
        const msg = `Borrow amount ${amount.toString()} is below minimum borrow amount ${minBorrow.toString()}`;
        console.error('[borrow] Minimum borrow check failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }

      // Use withdraw to borrow the asset
      console.error('[borrow] Attempting to withdraw (borrow):', {
        asset: tokenAddress,
        amount: amount.toString()
      });
      
      const tx = await cometContract.withdraw(tokenAddress, amount);
      console.error('[borrow] Tx hash:', tx.hash);
      await tx.wait(1);
      return { content: [{ type: 'text', text: `Borrow successful. Tx hash: ${tx.hash}` }] };
    } catch (error: unknown) {
      console.error('[borrow] Borrow failed:', error);
      // Detect custom error 0x14c5f7b6 (insufficient collateral / not allowed to borrow base)
      let friendlyMsg = (error as Error).message;
      if (friendlyMsg.includes('0x14c5f7b6')) {
        friendlyMsg = 'Borrow failed: the account is not sufficiently collateralised with non-base assets to borrow the base asset. Supply collateral such as WBTC, ARB, wstETH, etc., then try borrowing again.';
      }
      return { isError: true, content: [{ type: 'text', text: friendlyMsg }] };
    }
  }
);

// Implemented tool: repay (supply base asset to repay)
server.tool(
  'repay',
  'Repay borrowed assets on Compound v3',
  repaySchema.shape,
  async (params: RepayParams) => {
    try {
      const assetSymbol = resolveAssetSymbol(params.asset);
      console.error('[repay] Resolved asset symbol:', assetSymbol);

      // Resolve token address (symbol or address)
      const tokenAddress = KNOWN_TOKENS[assetSymbol as keyof typeof KNOWN_TOKENS];
      if (!tokenAddress) {
        throw new Error(`Unsupported token ${assetSymbol}. Supported symbols: ${Object.keys(KNOWN_TOKENS).join(', ')}`);
      }
      console.error('[repay] Token address:', tokenAddress);

      // Create ERC20 instance and fetch decimals
      const tokenContract = new Contract(tokenAddress, ERC20_ABI, wallet);
      const decimals = await tokenContract.decimals();
      console.error('[repay] Token decimals:', decimals);

      // Parse amount (allow decimal notation like '0.5')
      const amountRaw = params.amount.trim();
      if (!/^[0-9]+(\.[0-9]+)?$/.test(amountRaw)) {
        const msg = `Invalid amount string: '${params.amount}'. Please provide the amount as a number, optionally with decimal places (e.g. '1.25').`;
        console.error('[repay] Validation failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }
      const amount = utils.parseUnits(amountRaw, decimals);
      console.error('[repay] Parsed amount (atomic):', amount.toString());

      // Balance check
      const balance = await tokenContract.balanceOf(wallet.address);
      console.error('[repay] Current balance:', balance.toString());
      if (balance.lt(amount)) {
        const msg = `Insufficient balance to repay. Have ${balance.toString()} but need ${amount.toString()}`;
        console.error('[repay] Balance check failed:', msg);
        return { isError: true, content: [{ type: 'text', text: msg }] };
      }

      // Ensure allowance
      const allowance = await tokenContract.allowance(wallet.address, COMET_ADDRESS);
      console.error('[repay] Current allowance:', allowance.toString());
      if (allowance.lt(amount)) {
        console.error('[repay] Approving token spend...');
        const approveTx = await tokenContract.approve(COMET_ADDRESS, amount);
        await approveTx.wait(1);
        console.error('[repay] Approval tx:', approveTx.hash);
      }

      // Supply to repay
      const cometContract = new Contract(COMET_ADDRESS, COMET_ABI, wallet);
      const tx = await cometContract.supply(tokenAddress, amount);
      console.error('[repay] Tx hash:', tx.hash);
      await tx.wait(1);
      return { content: [{ type: 'text', text: `Repay successful. Tx hash: ${tx.hash}` }] };
    } catch (error: unknown) {
      console.error('[repay] Repay failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: 'text', text: `Repay failed: ${msg}` }] };
    }
  }
);

// Implemented tool: getMarketData
server.tool(
  'getMarketData',
  'Retrieve market data for a given asset on Compound v3',
  getMarketDataSchema.shape,
  async (_params: GetMarketDataParams) => {
    try {
      // Create Comet contract instance
      const cometContract = new Contract(COMET_ADDRESS, COMET_ABI, wallet);
      
      // Get utilization first as it's needed for rates
      const utilization = await cometContract.getUtilization();
      
      // Fetch collateral balances for known tokens (excluding base asset)
      const collateralBalances: Record<string, string> = {};
      for (const [sym, addr] of Object.entries(KNOWN_TOKENS)) {
        if (sym === 'USDC') continue; // skip base asset
        try {
          const bal = await cometContract.collateralBalanceOf(wallet.address, addr);
          collateralBalances[sym] = bal.toString();
        } catch (_) {
          // ignore tokens not supported by this market
        }
      }

      // Get all data directly from the contract
      const [
        supplyRate,
        borrowRate,
        totalSupply,
        totalBorrow,
        baseScale,
        suppliedBalance,
        borrowBalance,
        isCollateralized
      ] = await Promise.all([
        cometContract.getSupplyRate(utilization),
        cometContract.getBorrowRate(utilization),
        cometContract.totalSupply(),
        cometContract.totalBorrow(),
        cometContract.baseScale(),
        cometContract.balanceOf(wallet.address),
        cometContract.borrowBalanceOf(wallet.address),
        cometContract.isBorrowCollateralized(wallet.address)
      ]);
      
      // Calculate APR (multiply by seconds in year and divide by 1e18)
      const SECONDS_PER_YEAR = 31536000;
      const supplyAPR = supplyRate.mul(SECONDS_PER_YEAR).mul(100).div(BigNumber.from(10).pow(18));
      const borrowAPR = borrowRate.mul(SECONDS_PER_YEAR).mul(100).div(BigNumber.from(10).pow(18));
      
      console.error('[getMarketData]', {
        utilization: utilization.toString(),
        supplyAPR: supplyAPR.toString() + '%',
        borrowAPR: borrowAPR.toString() + '%',
        totalSupply: totalSupply.toString(),
        totalBorrow: totalBorrow.toString(),
        baseScale: baseScale.toString(),
        suppliedBalance: suppliedBalance.toString(),
        borrowBalance: borrowBalance.toString(),
        isCollateralized,
        collateralBalances
      });
      
      // Existing result object plus collateralBalances
      const result = {
        utilization: utilization.toString(),
        supplyAPR: supplyAPR.toString() + '%',
        borrowAPR: borrowAPR.toString() + '%',
        totalSupply: totalSupply.toString(),
        totalBorrow: totalBorrow.toString(),
        baseScale: baseScale.toString(),
        suppliedBalance: suppliedBalance.toString(),
        borrowBalance: borrowBalance.toString(),
        isCollateralized,
        collateralBalances
      };
      
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error: unknown) {
      console.error('[getMarketData] getMarketData failed:', error);
      return { isError: true, content: [{ type: 'text', text: `getMarketData failed: ${(error as Error).message}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error('Compound v3 MCP tool server started');
  } catch (error: unknown) {
    console.error('Failed to start MCP tool server:', (error as Error).message);
    process.exit(1);
  }
}

main(); 