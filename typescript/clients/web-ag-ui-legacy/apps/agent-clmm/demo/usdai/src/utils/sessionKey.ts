import {
  deserializePermissionAccount,
  ModularSigner,
  Policy,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  addressToEmptyAccount,
  createKernelAccount,
  createKernelAccountClient,
  KernelSmartAccountImplementation,
} from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { OnchainClients } from "./clients";
import { getDemoPrivateKey, getKernelConfig } from "./wallet";
import { Signer } from "@zerodev/sdk/types";
import { SmartAccount } from "viem/account-abstraction";
import { arbitrum } from "viem/chains";
import { http } from "viem";
import { PIMLICO_URL } from "./constants";

export async function getSessionKey() {
  console.log("Creating session key...");
  return await toECDSASigner({
    signer: privateKeyToAccount(getDemoPrivateKey("DEMO_SESSION_PRIVATE_KEY")),
  });
}

export async function addPermissionsToSessionKey(
  sessionPublicKey: `0x${string}`,
  clients: OnchainClients,
  policies: Policy[],
  account: Signer,
) {
  const emptyAccount = addressToEmptyAccount(sessionPublicKey);
  const emptySessionKeySigner = await toECDSASigner({ signer: emptyAccount });
  const permissionPlugin = await toPermissionValidator(clients.public, {
    ...getKernelConfig(),
    signer: emptySessionKeySigner,
    policies,
  });
  const sessionKeyAccount = await createKernelAccount(clients.public, {
    ...getKernelConfig(),
    eip7702Account: account,
    plugins: {
      regular: permissionPlugin,
    },
  });
  const approval = await serializePermissionAccount(
    sessionKeyAccount as unknown as SmartAccount<KernelSmartAccountImplementation>,
  );
  return approval;
}

export async function getSessionKeyAccount(
  sessionKey: ModularSigner,
  clients: OnchainClients,
  approval: string,
) {
  const config = getKernelConfig();
  const sessionKeyAccount = await deserializePermissionAccount(
    clients.public,
    config.entryPoint,
    config.kernelVersion,
    approval,
    sessionKey,
  );
  return createKernelAccountClient({
    account: sessionKeyAccount,
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
}
