import { OnchainClients } from "../utils/clients";
import { OnchainActionsClient } from "../onchain";
import { executeTransaction } from "../utils/transaction";
import {
  PENDLE_SWAP_ADDRESS,
  USDAI_POOL_ADDRESS,
  USDAI_ADDRESS,
} from "../utils/constants";
import { arbitrum } from "viem/chains";
import { AgentWallet, MyWallet } from "../utils/wallet";
import { ModularSigner } from "@zerodev/permissions";
import {
  addPermissionsToSessionKey,
  getSessionKey,
  getSessionKeyAccount,
} from "../utils/sessionKey";
import { CallPolicyVersion, toCallPolicy } from "@zerodev/permissions/policies";
import { Signer } from "@zerodev/sdk/types";
import { Chain, Hex, PrivateKeyAccount, Transport } from "viem";
import { KernelAccountClient } from "@zerodev/sdk";
import { SmartAccount } from "viem/account-abstraction";

export async function createPendleSwapDelegation(
  sessionKey: ModularSigner,
  clients: OnchainClients,
  signer: Signer,
) {
  console.log("📜 Creating Pendle swap delegation...");
  const swapPendleLiquidity = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: PENDLE_SWAP_ADDRESS,
        selector: "0x12599ac6", // swapExactTokensForTokens
      },
    ],
  });
  const pendleSwapDelegation = await addPermissionsToSessionKey(
    sessionKey.account.address,
    clients,
    [swapPendleLiquidity],
    signer,
  );
  console.log(pendleSwapDelegation);

  return pendleSwapDelegation;
}

export async function executeSupplyUsdaiLiquidity(
  agentsWallet: KernelAccountClient<Transport, Chain, SmartAccount>,
  userWalletAddress: `0x${string}`,
) {
  console.log("🌐 Connecting to OnchainActionsClient...");
  const client = new OnchainActionsClient("https://api.emberai.xyz");

  console.log("💧 Creating supply liquidity transaction...");

  const result = await client.createSupplyLiquidity({
    walletAddress: userWalletAddress,
    supplyChain: arbitrum.id.toString(),
    payableTokens: [
      {
        tokenUid: {
          chainId: arbitrum.id.toString(),
          address: USDAI_ADDRESS,
        },
        amount: "3000000000000000000", // 3 USDai (18 decimals)
      },
    ],
    poolIdentifier: {
      chainId: arbitrum.id.toString(),
      address: USDAI_POOL_ADDRESS,
    },
  });
  console.log("✅ Supply liquidity transaction created successfully");
  console.log("📄 Transaction details:", {
    to: PENDLE_SWAP_ADDRESS,
    dataLength: result.transactions[0].data.length,
  });

  // Execute it
  console.log("🔧 Creating execution object...");
  const userOpHash = await agentsWallet.sendUserOperation({
    callData: await agentsWallet.account.encodeCalls([
      {
        to: result.transactions[0].to,
        value: BigInt(result.transactions[0].value || "0"),
        data: result.transactions[0].data,
      },
    ]),
  });
  const { receipt } = await agentsWallet.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log(
    "✅ Supply liquidity execution completed! Receipt:",
    receipt.transactionHash,
  );

  return receipt;
}

export async function executeUsdaiLiquidityPoolStrategy(
  clients: OnchainClients,
  myLocalAccount: PrivateKeyAccount,
) {
  const sessionKey = await getSessionKey();
  console.log("✍️ Creating Pendle swap delegation...");
  const pendleSwapDelegation = await createPendleSwapDelegation(
    sessionKey,
    clients,
    myLocalAccount,
  );
  console.log("✅ Pendle swap delegation created successfully");

  // Execute supply liquidity
  const sessionKeyAccount = await getSessionKeyAccount(
    sessionKey,
    clients,
    pendleSwapDelegation,
  );
  console.log("💧 Executing USDai liquidity pool supply...");

  const supplyReceipt = await executeSupplyUsdaiLiquidity(
    sessionKeyAccount,
    sessionKeyAccount.account.address,
  );
  console.log("✅ Liquidity supplied in tx", supplyReceipt.transactionHash);
}
