import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { http, PublicClient, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { PIMLICO_URL } from "./constants";
import { OnchainClients } from "./clients";

/**
 * Upgrades an EOA to a 7702 stateless smart account on Arbitrum
 * @param privateKey - The private key of the EOA to upgrade
 * @param publicClient - Viem public client for Arbitrum
 * @param rpcUrl - Arbitrum RPC URL
 * @returns MetaMask smart account instance
 */
export async function upgrade7702Wallet(
  privateKey: `0x${string}`,
  publicClient: PublicClient,
  clients: OnchainClients,
) {
  const account = privateKeyToAccount(privateKey);
  const version = KERNEL_V3_3;
  const kernelAccount = await createKernelAccount(publicClient, {
    eip7702Account: account,
    entryPoint: getEntryPoint("0.8"),
    kernelVersion: version,
  });

  return createKernelAccountClient({
    account: kernelAccount,
    chain: arbitrum,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: clients.paymaster,
    client: publicClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        const { standard: fee } =
          await clients.pimlico.getUserOperationGasPrice();
        return fee;
      },
    },
  });
}
