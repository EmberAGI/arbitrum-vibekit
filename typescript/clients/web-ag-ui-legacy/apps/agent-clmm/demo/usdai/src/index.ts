import { approveUsdcStep } from "./utils/allowance";
import { createClients } from "./utils/clients";
import { executeTradingStrategy } from "./strategies/swap";
import { createAndDeployWallets } from "./utils/wallet";
import { SQUID_ROUTER_ADDRESS } from "./utils/constants";

export async function main() {
  console.log("🚀 Starting main function...");

  // Step 1: Create clients
  const clients = createClients();
  console.log(clients.public);

  // Step 2: Create and deploy wallets
  const { mySmartAccount, agentAccount, eoaAddress } =
    await createAndDeployWallets(clients);

  // Step 3: Prepare for strategy by approving usdc
  await approveUsdcStep(
    agentAccount,
    mySmartAccount,
    clients,
    SQUID_ROUTER_ADDRESS,
  );

  // Step 4: Execute trading strategy
  await executeTradingStrategy(
    agentAccount,
    mySmartAccount,
    clients,
    eoaAddress,
  );

  console.log("🎉 Main function completed successfully!");
}

console.log("🏁 Starting application...");
main().catch((error) => {
  console.error("❌ Error in main function:", error);
});
