import { encodeFunctionData, erc20Abi, PublicClient } from "viem";
import { OnchainClients } from "./clients";
import { executeTransaction } from "./transaction";
import { PERMIT2_ADDRESS, USDC_ADDRESS } from "./constants";

const permit2Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

type Permit2Allowance = {
  amount: bigint;
  expiration: number;
  nonce: number;
};

type DelegatedApprovalOperation = {
  delegation: Delegation;
  target: `0x${string}`;
  callData: `0x${string}`;
  description: string;
};

async function createFunctionDelegation(
  description: string,
  target: `0x${string}`,
  selector: string,
  agentsWallet: MetaMaskSmartAccount,
  myWallet: MetaMaskSmartAccount,
): Promise<Delegation> {
  console.log(`📜 Creating ${description} delegation...`);
  const delegation = createDelegation({
    scope: {
      type: "functionCall",
      targets: [target],
      selectors: [selector],
    },
    to: agentsWallet.address,
    from: myWallet.address,
    environment: myWallet.environment,
  });
  console.log(delegation);

  console.log(`🖋️ Signing ${description} delegation...`);
  const signature = await myWallet.signDelegation({
    delegation,
  });
  console.log(`✅ ${description} delegation signed successfully`);

  return {
    ...delegation,
    signature,
  };
}

export async function checkTokenAllowance(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  tokenSymbol: string = "token",
) {
  console.log(`🔍 Checking ${tokenSymbol} allowance...`);
  console.log("👤 Owner:", ownerAddress);
  console.log("🎯 Spender:", spenderAddress);

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  console.log(
    `💰 Current allowance: ${allowance.toString()} ${tokenSymbol} units`,
  );
  return allowance;
}

// Backward compatibility wrapper
export async function checkUsdcAllowance(
  publicClient: PublicClient,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
) {
  return checkTokenAllowance(
    publicClient,
    USDC_ADDRESS,
    ownerAddress,
    spenderAddress,
    "USDC",
  );
}

export async function checkPermit2Allowance(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  tokenSymbol: string = "token",
): Promise<Permit2Allowance> {
  console.log(`🔍 Checking Permit2 allowance for ${tokenSymbol}...`);
  console.log("👤 Owner:", ownerAddress);
  console.log("🎯 Spender:", spenderAddress);

  const [amount, expiration, nonce] = await publicClient.readContract({
    address: PERMIT2_ADDRESS,
    abi: permit2Abi,
    functionName: "allowance",
    args: [ownerAddress, tokenAddress, spenderAddress],
  });

  console.log(`💰 Permit2 amount: ${amount.toString()} ${tokenSymbol} units`);
  console.log("⏱️ Permit2 expiration (unix):", expiration.toString());
  console.log("🔢 Permit2 nonce:", nonce.toString());

  return { amount, expiration, nonce };
}

export async function createTokenApproveDelegation(
  tokenAddress: `0x${string}`,
  tokenSymbol: string,
  agentsWallet: MetaMaskSmartAccount,
  myWallet: MetaMaskSmartAccount,
) {
  return createFunctionDelegation(
    `${tokenSymbol} approve`,
    tokenAddress,
    "approve(address, uint256)",
    agentsWallet,
    myWallet,
  );
}

// Backward compatibility wrapper
export async function createUsdcApproveDelegation(
  agentsWallet: MetaMaskSmartAccount,
  myWallet: MetaMaskSmartAccount,
) {
  return createTokenApproveDelegation(
    USDC_ADDRESS,
    "USDC",
    agentsWallet,
    myWallet,
  );
}

async function createPermit2ApproveDelegation(
  agentsWallet: MetaMaskSmartAccount,
  myWallet: MetaMaskSmartAccount,
) {
  return createFunctionDelegation(
    "Permit2 approve",
    PERMIT2_ADDRESS,
    "approve(address, address, uint160, uint48)",
    agentsWallet,
    myWallet,
  );
}

export async function executeUsdcApproval(
  operations: DelegatedApprovalOperation[],
  agentsWallet: MetaMaskSmartAccount,
  clients: OnchainClients,
) {
  if (!operations.length) {
    console.log("ℹ️ No approval operations required.");
    return null;
  }

  console.log(
    "� Executing delegated approval pipeline with",
    operations.length,
    "step(s)...",
  );

  const calls = operations.map((operation) => {
    console.log(`🎯 Preparing ${operation.description}...`);
    const execution = createExecution({
      target: operation.target,
      callData: operation.callData,
    });
    console.log(`📦 Encoding ${operation.description} delegation calldata...`);
    const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations(
      {
        delegations: [[operation.delegation]],
        modes: [ExecutionMode.SingleDefault],
        executions: [[execution]],
      },
    );
    console.log(`✅ ${operation.description} calldata encoded successfully`);
    return {
      to: agentsWallet.address,
      data: redeemDelegationCalldata,
    };
  });

  console.log("🚀 Sending user operation for approval pipeline...");
  const receipt = await executeTransaction(clients, {
    account: agentsWallet,
    calls,
  });
  console.log(
    "✅ Approval pipeline completed! Receipt:",
    receipt.transactionHash,
  );

  return receipt;
}

export async function approveUsdcStep(
  agentAccount: MetaMaskSmartAccount,
  mySmartAccount: MetaMaskSmartAccount,
  clients: OnchainClients,
  contractSpenderAddress: `0x${string}`,
) {
  const requiredAmount = 100000n; // 0.1 USDC (6 decimals)
  const now = Math.floor(Date.now() / 1000);
  const expirationBuffer = 3600; // 1 hour safety buffer
  const desiredExpiration = now + 30 * 24 * 60 * 60; // 30 days

  console.log("🔍 Checking prerequisite allowances for Permit2...");
  const usdcPermit2Allowance = await checkUsdcAllowance(
    clients.public,
    mySmartAccount.address,
    PERMIT2_ADDRESS,
  );
  const permit2Allowance = await checkPermit2Allowance(
    clients.public,
    USDC_ADDRESS,
    mySmartAccount.address,
    contractSpenderAddress,
    "USDC",
  );

  const hasUsdcApproval = usdcPermit2Allowance >= requiredAmount;
  const permit2HasNoExpiry = permit2Allowance.expiration === 0;
  const permit2HasSufficientAmount = permit2Allowance.amount >= requiredAmount;
  const permit2HasValidExpiry =
    permit2HasNoExpiry || permit2Allowance.expiration > now + expirationBuffer;
  const hasPermit2Approval =
    permit2HasSufficientAmount && permit2HasValidExpiry;

  if (hasUsdcApproval && hasPermit2Approval) {
    console.log(
      "✅ Permit2 pipeline already configured, skipping approval setup",
    );
    return;
  }

  const operations: DelegatedApprovalOperation[] = [];

  if (!hasUsdcApproval) {
    console.log("✍️ Creating USDC→Permit2 approve delegation...");
    const usdcApproveDelegation = await createUsdcApproveDelegation(
      agentAccount,
      mySmartAccount,
    );
    console.log("✅ USDC→Permit2 delegation ready");

    const usdcApproveCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, requiredAmount],
    });

    operations.push({
      delegation: usdcApproveDelegation,
      target: USDC_ADDRESS,
      callData: usdcApproveCallData,
      description: "USDC approve Permit2",
    });
  }

  if (!hasPermit2Approval) {
    console.log("✍️ Creating Permit2→Squid approve delegation...");
    const permit2ApproveDelegation = await createPermit2ApproveDelegation(
      agentAccount,
      mySmartAccount,
    );
    console.log("✅ Permit2→Squid delegation ready");

    const permit2ApproveCallData = encodeFunctionData({
      abi: permit2Abi,
      functionName: "approve",
      args: [
        USDC_ADDRESS,
        contractSpenderAddress,
        requiredAmount,
        desiredExpiration,
      ],
    });

    operations.push({
      delegation: permit2ApproveDelegation,
      target: PERMIT2_ADDRESS,
      callData: permit2ApproveCallData,
      description: "Permit2 approve Squid router",
    });
  }

  if (!operations.length) {
    console.log(
      "⚠️ Permit2 configuration missing expiration but operations not generated — aborting setup to avoid inconsistent state.",
    );
    return;
  }

  const approveReceipt = await executeUsdcApproval(
    operations,
    agentAccount,
    clients,
  );

  if (approveReceipt) {
    console.log(
      "✅ Permit2 approval pipeline completed in tx",
      approveReceipt.transactionHash,
    );
  }
}

export async function approveTokenStep(
  tokenAddress: `0x${string}`,
  tokenSymbol: string,
  requiredAmount: bigint,
  agentAccount: MetaMaskSmartAccount,
  mySmartAccount: MetaMaskSmartAccount,
  clients: OnchainClients,
  contractSpenderAddress: `0x${string}`,
) {
  const now = Math.floor(Date.now() / 1000);
  const expirationBuffer = 3600; // 1 hour safety buffer
  const desiredExpiration = now + 30 * 24 * 60 * 60; // 30 days

  console.log(
    `🔍 Checking prerequisite allowances for Permit2 (${tokenSymbol})...`,
  );
  const tokenPermit2Allowance = await checkTokenAllowance(
    clients.public,
    tokenAddress,
    mySmartAccount.address,
    PERMIT2_ADDRESS,
    tokenSymbol,
  );
  const permit2Allowance = await checkPermit2Allowance(
    clients.public,
    tokenAddress,
    mySmartAccount.address,
    contractSpenderAddress,
    tokenSymbol,
  );

  const hasTokenApproval = tokenPermit2Allowance >= requiredAmount;
  const permit2HasNoExpiry = permit2Allowance.expiration === 0;
  const permit2HasSufficientAmount = permit2Allowance.amount >= requiredAmount;
  const permit2HasValidExpiry =
    permit2HasNoExpiry || permit2Allowance.expiration > now + expirationBuffer;
  const hasPermit2Approval =
    permit2HasSufficientAmount && permit2HasValidExpiry;

  if (hasTokenApproval && hasPermit2Approval) {
    console.log(
      `✅ Permit2 pipeline already configured for ${tokenSymbol}, skipping approval setup`,
    );
    return;
  }

  const operations: DelegatedApprovalOperation[] = [];

  if (!hasTokenApproval) {
    console.log(`✍️ Creating ${tokenSymbol}→Permit2 approve delegation...`);
    const tokenApproveDelegation = await createTokenApproveDelegation(
      tokenAddress,
      tokenSymbol,
      agentAccount,
      mySmartAccount,
    );
    console.log(`✅ ${tokenSymbol}→Permit2 delegation ready`);

    const tokenApproveCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, requiredAmount],
    });

    operations.push({
      delegation: tokenApproveDelegation,
      target: tokenAddress,
      callData: tokenApproveCallData,
      description: `${tokenSymbol} approve Permit2`,
    });
  }

  if (!hasPermit2Approval) {
    console.log(
      `✍️ Creating Permit2→Contract approve delegation for ${tokenSymbol}...`,
    );
    const permit2ApproveDelegation = await createPermit2ApproveDelegation(
      agentAccount,
      mySmartAccount,
    );
    console.log(`✅ Permit2→Contract delegation ready for ${tokenSymbol}`);

    const permit2ApproveCallData = encodeFunctionData({
      abi: permit2Abi,
      functionName: "approve",
      args: [
        tokenAddress,
        contractSpenderAddress,
        requiredAmount,
        desiredExpiration,
      ],
    });

    operations.push({
      delegation: permit2ApproveDelegation,
      target: PERMIT2_ADDRESS,
      callData: permit2ApproveCallData,
      description: `Permit2 approve contract for ${tokenSymbol}`,
    });
  }

  if (!operations.length) {
    console.log(
      `⚠️ Permit2 configuration missing expiration but operations not generated for ${tokenSymbol} — aborting setup to avoid inconsistent state.`,
    );
    return;
  }

  const approveReceipt = await executeUsdcApproval(
    operations,
    agentAccount,
    clients,
  );

  if (approveReceipt) {
    console.log(
      `✅ Permit2 approval pipeline completed for ${tokenSymbol} in tx`,
      approveReceipt.transactionHash,
    );
  }
}

export async function approveTokenDirectStep(
  tokenAddress: `0x${string}`,
  tokenSymbol: string,
  requiredAmount: bigint,
  agentAccount: MetaMaskSmartAccount,
  mySmartAccount: MetaMaskSmartAccount,
  clients: OnchainClients,
  contractSpenderAddress: `0x${string}`,
) {
  console.log(`🔍 Checking direct ERC20 allowance for ${tokenSymbol}...`);
  const currentAllowance = await checkTokenAllowance(
    clients.public,
    tokenAddress,
    mySmartAccount.address,
    contractSpenderAddress,
    tokenSymbol,
  );

  const hasTokenApproval = currentAllowance >= requiredAmount;

  if (hasTokenApproval) {
    console.log(
      `✅ ${tokenSymbol} already approved for ${contractSpenderAddress}, skipping approval`,
    );
    return;
  }

  console.log(`✍️ Creating ${tokenSymbol} approve delegation...`);
  const tokenApproveCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [contractSpenderAddress, requiredAmount],
  });

  const tokenApproveDelegation = await createTokenApproveDelegation(
    tokenAddress,
    tokenSymbol,
    agentAccount,
    mySmartAccount,
  );
  console.log(`✅ ${tokenSymbol} delegation ready`);

  const operations: DelegatedApprovalOperation[] = [
    {
      delegation: tokenApproveDelegation,
      target: tokenAddress,
      callData: tokenApproveCallData,
      description: `${tokenSymbol} approve ${contractSpenderAddress}`,
    },
  ];

  console.log(`🚀 Executing ${tokenSymbol} approval...`);
  const approveReceipt = await executeUsdcApproval(
    operations,
    agentAccount,
    clients,
  );

  if (approveReceipt) {
    console.log(
      `✅ ${tokenSymbol} approval completed in tx`,
      approveReceipt.transactionHash,
    );
  }
}
