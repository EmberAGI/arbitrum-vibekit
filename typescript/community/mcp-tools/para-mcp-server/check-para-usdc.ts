import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PARA_WALLET_ADDRESS = "0x13dec636e2f4f791befc0156b0d3f0d627327499"; // Your Para wallet

async function checkBalance() {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [PARA_WALLET_ADDRESS],
  });

  console.log("Para Wallet:", PARA_WALLET_ADDRESS);
  console.log("USDC Balance:", (Number(balance) / 1e6).toFixed(6), "USDC");
  console.log("USDC Balance (raw):", balance.toString());
}

checkBalance();
