import { http, PrivateKeyAccount, PublicClient, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { OnchainClients } from "./clients";
import { PIMLICO_URL } from "./constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";

export function getKernelConfig() {
  return {
    entryPoint: getEntryPoint("0.7"),
    kernelVersion: KERNEL_V3_3,
  };
}

export type AgentWallet = Awaited<ReturnType<typeof createAgentWallet>>;
export type MyWallet = Awaited<ReturnType<typeof create7702Wallet>>;

export async function getLocalAccount(privateKey: `0x${string}`) {
  return privateKeyToAccount(privateKey);
}

export async function createAgentWallet(
  privateKey: `0x${string}`,
  publicClient: PublicClient,
) {
  console.log("Creating agent wallet from private key...");
  const account = privateKeyToAccount(privateKey);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: account,
    ...getKernelConfig(),
  });

  return await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    ...getKernelConfig(),
  });
}

export async function create7702Wallet(
  account: PrivateKeyAccount,
  clients: OnchainClients,
) {
  console.log("Creating 7702 stateless wallet from private key...");

  const kernelAccount = await createKernelAccount(clients.public, {
    eip7702Account: account,
    ...getKernelConfig(),
  });

  const client = createKernelAccountClient({
    account: kernelAccount,
    chain: arbitrum,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: clients.paymaster,
    client: clients.public,
    userOperation: {
      estimateFeesPerGas: async () => {
        const { standard: fee } =
          await clients.pimlico.getUserOperationGasPrice();
        return fee;
      },
    },
  });
  const userOpHash = await client.sendUserOperation({
    callData: await client.account.encodeCalls([
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
      {
        to: zeroAddress,
        value: BigInt(0),
        data: "0x",
      },
    ]),
  });
  const receipt = await client.waitForUserOperationReceipt({
    hash: userOpHash,
  });
  console.log("7702 wallet deployed, userOp hash:", receipt.userOpHash);

  return client;
}

function readEnvPrivateKey(envVarName: string): `0x${string}` | undefined {
  const raw = process.env[envVarName];
  if (!raw) {
    return undefined;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `${envVarName} must be a 32-byte hex private key (0x + 64 hex chars)`,
    );
  }
  return raw as `0x${string}`;
}

export function getDemoPrivateKey(envVarName: string): `0x${string}` {
  return readEnvPrivateKey(envVarName) ?? generatePrivateKey();
}

export async function createAndDeployWallets(clients: OnchainClients) {
  console.log("Creating smart accounts...");

  const localAccount = await getLocalAccount(getDemoPrivateKey("DEMO_MY_PRIVATE_KEY"));

  // Create my account as a 7702 stateless wallet
  console.log("Creating my account with 7702 stateless delegation...");
  const mySmartAccount = await create7702Wallet(localAccount, clients);

  // Create agent account as a hybrid wallet
  console.log("Creating agent account with hybrid implementation...");
  const agentAccount = await createAgentWallet(
    getDemoPrivateKey("DEMO_AGENT_PRIVATE_KEY"),
    clients.public,
  );

  console.log("Smart accounts created successfully");
  console.log("My account address:", mySmartAccount.account.address);
  console.log("Agent account address:", agentAccount.address);

  return {
    mySmartAccount,
    agentAccount,
    myLocalAccount: localAccount,
  };
}
