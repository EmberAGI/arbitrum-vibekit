import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http } from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
} from "viem/account-abstraction";
import { arbitrum } from "viem/chains";
import { ARBITRUM_RPC_URL, PIMLICO_URL } from "./constants";

export function createClients() {
  console.log("📡 Creating clients...");
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(ARBITRUM_RPC_URL),
  });
  const bundlerClient = createBundlerClient({
    chain: arbitrum,
    transport: http(PIMLICO_URL),
  });
  const paymasterClient = createPaymasterClient({
    transport: http(PIMLICO_URL),
  });
  const pimplicoClient = createPimlicoClient({
    chain: arbitrum,
    transport: http(PIMLICO_URL),
  });
  console.log("✅ All clients created successfully");

  return {
    public: publicClient,
    bundler: bundlerClient,
    paymaster: paymasterClient,
    pimlico: pimplicoClient,
  };
}

export type OnchainClients = ReturnType<typeof createClients>;
