/**
 * Polymarket Contract Approval Checker
 *
 * Handles checking and building approval transactions for trading on Polymarket.
 * Reference: POLYMARKET_INTEGRATION.md
 *
 * Required approvals:
 * 1. CTF Contract (ERC-1155) → CTF Exchange (for selling position tokens)
 * 2. USDC.e (ERC-20) → CTF Exchange (for buying with USDC)
 */

import { ethers } from 'ethers';
import { POLYGON_CONTRACTS, CONTRACT_ABIS } from '../constants/contracts.js';
import { logInfo } from '../workflow/context.js';

/**
 * EIP-712 Typed Data for USDC Permit
 */
export type EIP712TypedData = {
  domain: {
    name: string;
    version: string;
    chainId?: number;
    salt?: string;
    verifyingContract: string;
  };
  types: {
    Permit: Array<{ name: string; type: string }>;
  };
  value: {
    owner: string;
    spender: string;
    value: string;
    nonce: string;
    deadline: number;
  };
};

/**
 * Permit signature components
 */
export type PermitSignature = {
  v: number;
  r: string;
  s: string;
  deadline: number;
};

/**
 * Approval status for a wallet
 */
export type ApprovalStatus = {
  /** Whether CTF Contract is approved for CTF Exchange (ERC-1155) */
  ctfApproved: boolean;

  /** Whether USDC.e is approved for CTF Exchange (ERC-20) */
  usdcApproved: boolean;

  /** POL balance for gas fees (in ETH units) */
  polBalance: number;

  /** USDC.e balance (in USDC units, 6 decimals) */
  usdcBalance: number;

  /** USDC.e allowance for CTF Exchange (in USDC units, 6 decimals) */
  usdcAllowance?: number;

  /** Whether any approvals are needed */
  needsApproval: boolean;
};

/**
 * Transaction to be signed by user for approval
 */
export type ApprovalTransaction = {
  /** Contract address to call */
  to: string;

  /** Encoded function call data */
  data: string;

  /** Human-readable description */
  description: string;

  /** Estimated gas limit */
  gasLimit?: number;
};

/**
 * Check all required approvals and balances for a wallet.
 *
 * @param walletAddress - The wallet address to check
 * @param rpcUrl - Polygon RPC URL
 * @returns Current approval status and balances
 */
export async function checkApprovalStatus(
  walletAddress: string,
  rpcUrl: string,
): Promise<ApprovalStatus> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Check CTF approval (ERC-1155)
    const ctfContract = new ethers.Contract(
      POLYGON_CONTRACTS.CTF_CONTRACT,
      CONTRACT_ABIS.CTF_CONTRACT,
      provider,
    );

    const ctfApproved = await ctfContract.isApprovedForAll(
      walletAddress,
      POLYGON_CONTRACTS.CTF_EXCHANGE,
    );

    // Check USDC approval (ERC-20)
    const usdcContract = new ethers.Contract(
      POLYGON_CONTRACTS.USDC_E,
      CONTRACT_ABIS.USDC,
      provider,
    );

    const usdcAllowance = await usdcContract.allowance(walletAddress, POLYGON_CONTRACTS.CTF_EXCHANGE);
    const usdcApproved = usdcAllowance > 0n;

    // Check POL balance (for gas)
    const polBalanceWei = await provider.getBalance(walletAddress);
    const polBalance = parseFloat(ethers.formatEther(polBalanceWei));

    // Check USDC balance
    const usdcBalanceRaw = await usdcContract.balanceOf(walletAddress);
    const usdcBalance = parseFloat(ethers.formatUnits(usdcBalanceRaw, 6));

    // Convert allowance to USDC units (6 decimals)
    const usdcAllowanceValue = parseFloat(ethers.formatUnits(usdcAllowance, 6));

    const status: ApprovalStatus = {
      ctfApproved,
      usdcApproved,
      polBalance,
      usdcBalance,
      usdcAllowance: usdcAllowanceValue,
      needsApproval: !ctfApproved || !usdcApproved,
    };

    logInfo('Approval status checked', {
      wallet: walletAddress.substring(0, 10) + '...',
      ctfApproved,
      usdcApproved,
      usdcAllowance: usdcAllowanceValue.toFixed(2),
      polBalance: polBalance.toFixed(4),
      usdcBalance: usdcBalance.toFixed(2),
    });

    return status;
  } catch (error) {
    logInfo('Error checking approval status', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return safe defaults on error
    return {
      ctfApproved: false,
      usdcApproved: false,
      polBalance: 0,
      usdcBalance: 0,
      needsApproval: true,
    };
  }
}

/**
 * Build approval transactions for missing approvals.
 *
 * @param status - Current approval status
 * @param usdcAmount - USDC amount to approve (in USDC units, e.g., "1000" for $1000). If not provided, uses unlimited approval.
 * @returns Array of transactions that need to be signed and submitted
 */
export function buildApprovalTransactions(
  status: ApprovalStatus,
  usdcAmount?: string,
): ApprovalTransaction[] {
  const txs: ApprovalTransaction[] = [];

  // CTF approval if needed (ERC-1155 setApprovalForAll)
  if (!status.ctfApproved) {
    const iface = new ethers.Interface(CONTRACT_ABIS.CTF_CONTRACT);
    const data = iface.encodeFunctionData('setApprovalForAll', [
      POLYGON_CONTRACTS.CTF_EXCHANGE,
      true,
    ]);

    txs.push({
      to: POLYGON_CONTRACTS.CTF_CONTRACT,
      data,
      description: 'Approve CTF Exchange to trade your position tokens (ERC-1155)',
      gasLimit: 100000,
    });
  }

  // USDC approval if needed (ERC-20 approve)
  if (!status.usdcApproved) {
    // Convert USDC amount to wei (6 decimals)
    const approvalAmount = usdcAmount
      ? ethers.parseUnits(usdcAmount, 6) // User-specified amount
      : ethers.MaxUint256; // Unlimited if not specified

    const iface = new ethers.Interface(CONTRACT_ABIS.USDC);
    const data = iface.encodeFunctionData('approve', [
      POLYGON_CONTRACTS.CTF_EXCHANGE,
      approvalAmount,
    ]);

    const amountText = usdcAmount ? `$${usdcAmount}` : 'unlimited';

    txs.push({
      to: POLYGON_CONTRACTS.USDC_E,
      data,
      description: `Approve CTF Exchange to spend ${amountText} USDC for trading (ERC-20)`,
      gasLimit: 100000,
    });
  }

  logInfo('Built approval transactions', {
    count: txs.length,
    ctfApproval: !status.ctfApproved,
    usdcApproval: !status.usdcApproved,
  });

  return txs;
}

/**
 * Build EIP-712 typed data for USDC permit signature.
 * User signs this off-chain (gasless), then backend submits to blockchain.
 *
 * @param walletAddress - User's wallet address
 * @param usdcAmount - USDC amount to approve (in USDC units, e.g., "1000")
 * @param rpcUrl - Polygon RPC URL
 * @returns EIP-712 typed data for user to sign
 */
export async function buildUsdcPermitTypedData(
  walletAddress: string,
  usdcAmount: string,
  rpcUrl: string,
): Promise<EIP712TypedData> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const usdcContract = new ethers.Contract(
    POLYGON_CONTRACTS.USDC_E,
    [...CONTRACT_ABIS.USDC, 'function nonces(address owner) view returns (uint256)'],
    provider,
  );

  // Get current nonce for the user
  const nonce = await usdcContract.nonces(walletAddress);

  // Permit valid for 1 hour
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // Convert USDC amount to 6 decimals
  const value = ethers.parseUnits(usdcAmount, 6);

  // USDC on Polygon uses salt instead of chainId for EIP-712 domain derivation
  // Salt is the padded hex of the chain ID (137)
  const salt = ethers.zeroPadValue(ethers.toBeHex(137), 32);

  const typedData: EIP712TypedData = {
    domain: {
      name: 'USD Coin (PoS)',
      version: '1',
      salt,
      verifyingContract: POLYGON_CONTRACTS.USDC_E,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    value: {
      owner: walletAddress,
      spender: POLYGON_CONTRACTS.CTF_EXCHANGE,
      value: value.toString(),
      nonce: nonce.toString(),
      deadline,
    },
  };

  logInfo('Built USDC permit typed data', {
    owner: walletAddress.substring(0, 10) + '...',
    amount: usdcAmount,
    nonce: nonce.toString(),
    deadline,
  });

  return typedData;
}

/**
 * Submit USDC permit signature to blockchain.
 * Backend pays gas for this transaction.
 *
 * @param walletAddress - User's wallet address (permit owner)
 * @param usdcAmount - USDC amount approved
 * @param signature - Signature components (v, r, s) from user
 * @param rpcUrl - Polygon RPC URL
 * @param backendPrivateKey - Backend wallet private key (pays gas)
 * @returns Transaction receipt
 */
export async function submitUsdcPermit(
  walletAddress: string,
  usdcAmount: string,
  signature: PermitSignature,
  rpcUrl: string,
  backendPrivateKey: string,
): Promise<ethers.TransactionReceipt | null> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const backendWallet = new ethers.Wallet(backendPrivateKey, provider);

  const usdcContract = new ethers.Contract(
    POLYGON_CONTRACTS.USDC_E,
    [
      ...CONTRACT_ABIS.USDC,
      'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
    ],
    backendWallet,
  );

  const value = ethers.parseUnits(usdcAmount, 6);

  logInfo('Submitting USDC permit to blockchain', {
    owner: walletAddress.substring(0, 10) + '...',
    amount: usdcAmount,
    deadline: signature.deadline,
  });

  const tx = await usdcContract.permit(
    walletAddress,
    POLYGON_CONTRACTS.CTF_EXCHANGE,
    value,
    signature.deadline,
    signature.v,
    signature.r,
    signature.s,
  );

  logInfo('USDC permit transaction sent', { hash: tx.hash });

  const receipt = await tx.wait();

  if (receipt?.status === 1) {
    logInfo('✅ USDC permit confirmed', {
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } else {
    logInfo('❌ USDC permit failed');
  }

  return receipt;
}
