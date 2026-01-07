import {
  GMXOrderParams,
  OrderType,
  PositionDirection,
  DecreaseSwapType,
} from "./utils/types";

import {
  CHAIN_ID,
  MANAGED_VAULT_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  DAI_ADDRESS,
  GM_ETH_USDC_MARKET,
  GM_TOKEN_SWAP_ONLY_USDC_DAI,
  NETWORK,
  TRADER_SMART_ACCOUNT,
  ZERO_BYTES32,
} from "./utils/constants";

import { http, parseEther, custom, createPublicClient } from "viem";
import { parseUnits } from "viem";
import { createCaveatBuilder } from "@metamask/smart-accounts-kit/utils";
import {
  getSmartAccountsEnvironment,
  createDelegation,
  toMetaMaskSmartAccount,
  Implementation,
  Delegation,
  ROOT_AUTHORITY,
} from "@metamask/smart-accounts-kit";

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { appendFileSync } from "fs";
import { createPOCOrders } from "./create-gmx-calldata.js";

const userPrivateKey = (process.env.USER_PK as Hex)
  ? (process.env.USER_PK as Hex)
  : (() => {
      const pk = generatePrivateKey();
      appendFileSync(".env", `\nUSER_PK=${pk}`);
      return pk;
    })();

const userEOA = privateKeyToAccount(userPrivateKey);

export async function createDelegationWithCaveats() {
  const publicClient = createPublicClient({
    transport: http(),
    chain: NETWORK,
  });
  if (!publicClient) throw new Error("Public client not initialized");

  const environment = getSmartAccountsEnvironment(CHAIN_ID);
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
  const caveatBuilder = await createCaveatBuilder(environment);
  const pocCalldatas = await createPOCOrders();
  let caveats = await caveatBuilder
    .addCaveat("nativeTokenTransferAmount", {
      maxAmount: parseEther("0.01"), // execution fee for GMX
    })
    .addCaveat("allowedTargets", {
      targets: [MANAGED_VAULT_ADDRESS],
    })
    .addCaveat("erc20TransferAmount", {
      maxAmount: parseUnits("10", 6), // 10 USDC
      tokenAddress: USDC_ADDRESS,
    })
    .addCaveat("redeemer", {
      redeemers: [TRADER_SMART_ACCOUNT],
    })
    .addCaveat("exactCalldata", {
      calldata: pocCalldatas.marketLong.executeBatchCalldata.toString(),
    })
    .build();

  //   const delegation = await createDelegation({
  //     from: delegatorSmartAccount.address,
  //     to: TRADER_SMART_ACCOUNT,
  //     environment,
  //     caveats: caveats,
  //     scope: {
  //       type: "erc20TransferAmount",
  //       maxAmount: parseUnits("10", 6), // 10 USDC
  //       tokenAddress: USDC_ADDRESS,
  //     },
  //   });

  const delegation: Delegation = {
    delegator: delegatorSmartAccount.address,
    delegate: TRADER_SMART_ACCOUNT,
    caveats: caveats,
    authority: ROOT_AUTHORITY,
    salt: "0x",
  };
  const signature = await delegatorSmartAccount.signDelegation({
    delegation,
  });

  const signedDelegation = {
    ...delegation,
    signature,
  };

  console.log(signedDelegation);
}

await createDelegationWithCaveats();
