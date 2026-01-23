import {
  createDelegation,
  createExecution,
  Delegation,
  ExecutionMode,
  MetaMaskSmartAccount,
} from "@metamask/delegation-toolkit";
import { OnchainClients } from "../utils/clients";
import { OnchainActionsClient } from "../onchain";
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import { executeTransaction } from "../utils/transaction";
import {
  SQUID_ROUTER_ADDRESS,
  USDC_ADDRESS,
  WBTC_ADDRESS,
} from "../utils/constants";
import { arbitrum } from "viem/chains";

export async function createFundAndRunDelegation(
  agentsWallet: MetaMaskSmartAccount,
  myWallet: MetaMaskSmartAccount,
) {
  console.log("�📜 Creating fundAndRunMulticall delegation...");
  const fundAndRunDelegation = createDelegation({
    scope: {
      type: "functionCall",
      targets: [
        SQUID_ROUTER_ADDRESS, // fundAndRun contract
      ],
      selectors: ["0x58181a80"],
    },
    to: agentsWallet.address,
    from: myWallet.address,
    environment: myWallet.environment,
  });
  console.log(fundAndRunDelegation);

  console.log("📝 Signing fundAndRun delegation...");
  const fundAndRunSignature = await myWallet.signDelegation({
    delegation: fundAndRunDelegation,
  });
  console.log("✅ FundAndRun delegation signed successfully");

  return {
    ...fundAndRunDelegation,
    signature: fundAndRunSignature,
  };
}

export async function executeSwapUsdcForWBTC(
  fundAndRunDelegation: Delegation,
  agentsWallet: MetaMaskSmartAccount,
  userWalletAddress: `0x${string}`,
  clients: OnchainClients,
) {
  console.log("🌐 Connecting to OnchainActionsClient...");
  const client = new OnchainActionsClient("https://api.emberai.xyz");

  console.log("💱 Creating swap transaction...");

  const result = await client.createSwap({
    fromTokenUid: {
      chainId: arbitrum.id.toString(),
      address: USDC_ADDRESS, // USDC
    },
    toTokenUid: {
      chainId: arbitrum.id.toString(),
      address: WBTC_ADDRESS, // WBTC
    },
    amount: "100000", // 0.1 USDC
    amountType: "exactIn",
    walletAddress: userWalletAddress,
  });
  console.log("✅ Swap transaction created successfully");
  console.log("📄 Transaction details:", {
    to: SQUID_ROUTER_ADDRESS,
    dataLength: result.transactions[0].data.length,
  });

  // Execute it
  console.log("🔧 Creating execution object...");
  const executions = createExecution({
    target: SQUID_ROUTER_ADDRESS,
    callData: result.transactions[0].data,
  });

  console.log(
    "📦 Encoding redeem delegation calldata with both delegations...",
  );
  const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[fundAndRunDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[executions]],
  });
  console.log(
    "✅ Calldata encoded successfully with contract call and transfer permissions",
  );

  console.log("⏳ Waiting for swap execution receipt...");
  const receipt = await executeTransaction(clients, {
    account: agentsWallet,
    calls: [
      {
        to: agentsWallet.address,
        data: redeemDelegationCalldata,
      },
    ],
  });
  console.log("✅ Swap execution completed! Receipt:", receipt.transactionHash);

  return receipt;
}

export async function executeTradingStrategy(
  agentAccount: MetaMaskSmartAccount,
  mySmartAccount: MetaMaskSmartAccount,
  clients: OnchainClients,
  eoaAddress: `0x${string}`,
) {
  console.log("✍️ Creating fund and run delegation...");
  const fundAndRunDelegation = await createFundAndRunDelegation(
    agentAccount,
    mySmartAccount,
  );
  console.log(fundAndRunDelegation);
  console.log("✅ Fund and run delegation created successfully");

  // Step 3: Create USDC transfer delegation
  console.log("💱 Executing USDC to WBTC swap...");
  const swapReceipt = await executeSwapUsdcForWBTC(
    fundAndRunDelegation,
    agentAccount,
    eoaAddress,
    clients,
  );
  console.log("✅ Swap executed in tx", swapReceipt.transactionHash);
}
