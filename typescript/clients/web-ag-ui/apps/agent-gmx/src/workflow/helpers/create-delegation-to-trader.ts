import { http, parseEther, custom, createPublicClient } from "viem";
import { TRADER_SMART_ACCOUNT } from "./utils/constants";
import {
  createDelegation,
  getSmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { arbitrumSepolia } from "viem/chains";
import {
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
  Implementation,
} from "@metamask/smart-accounts-kit";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { appendFileSync } from "fs";

/// @TODO: Get a way to get a trader's smart account address (maybe from the value for userEOA of managed vault)

const userPrivateKey = (process.env.USER_PK as Hex)
  ? (process.env.USER_PK as Hex)
  : (() => {
      const pk = generatePrivateKey();
      appendFileSync(".env", `\nUSER_PK=${pk}`);
      return pk;
    })();

const userEOA = privateKeyToAccount(userPrivateKey);

export async function createDelegationToTrader() {
  const publicClient = createPublicClient({
    transport: http(),
    chain: arbitrumSepolia,
  });
  if (!publicClient) throw new Error("Public client not initialized");

  const environment = getSmartAccountsEnvironment(arbitrumSepolia.id);

  const delegatorSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,

    // REQUIRED for Hybrid
    deployParams: [
      userEOA.address, // owner
      [], // p256KeyIds
      [], // p256XValues
      [], // p256YValues
    ],
    deploySalt: "0x",

    // REQUIRED signer
    signer: { account: userEOA },

    environment,
  });
  // console.log(`delegatorSmartAccount\n`, delegatorSmartAccount)

  const delegation = await createDelegation({
    from: delegatorSmartAccount.address,
    to: TRADER_SMART_ACCOUNT,
    environment,
    scope: {
      type: "nativeTokenTransferAmount",
      maxAmount: parseEther("0.00001"),
    },
  });

  const signature = await delegatorSmartAccount.signDelegation({
    delegation,
  });

  // console.log(signature)

  const signedDelegation = {
    ...delegation,
    signature,
  };

  console.log(signedDelegation);
}

await createDelegationToTrader();
