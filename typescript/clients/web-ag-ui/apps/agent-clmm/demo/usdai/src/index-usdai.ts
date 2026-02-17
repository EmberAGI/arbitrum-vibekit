import { createClients } from "./utils/clients";
import { executeUsdaiLiquidityPoolStrategy } from "./strategies/usdaiLiquidityPool";
import { createAndDeployWallets } from "./utils/wallet";
import { parseUnits } from "viem";

export async function mainUsdaiLiquidityPool() {
  console.log("🚀 Starting USDai liquidity pool strategy...");

  // Step 1: Create clients
  const clients = createClients();
  console.log(clients.public.chain);

  // Step 2: Create and deploy wallets
  const { mySmartAccount, agentAccount, myLocalAccount } =
    await createAndDeployWallets(clients);

  // Step 3: Prepare for strategy by approving USDai (direct ERC20 approval, no Permit2)
  // 3 USDai with 1createMetamaskWallet(8 decimals
  const usdaiAmount = parseUnits("3", 18);

  // Step 4: Execute USDai liquidity pool strategy
  await executeUsdaiLiquidityPoolStrategy(clients, myLocalAccount);

  console.log("🎉 USDai liquidity pool strategy completed successfully!");
}

console.log("🏁 Starting USDai liquidity pool application...");
mainUsdaiLiquidityPool().catch((error) => {
  console.error("❌ Error in USDai liquidity pool strategy:", error);
});
