import { OrderType } from "./../../lib/gmx-synthetics/utils/order";
import { encodeFunctionData, parseEther, parseUnits, zeroAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import ManagedVaultArtifact from "../../artifacts/contracts/ManagedVault.sol/ManagedVault.json";
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
  ZERO_BYTES32,
} from "./utils/constants";
export async function createGmxCalldata(orderParams: GMXOrderParams): Promise<{
  sendWntCalldata: string;
  sendTokensCalldata: string;
  createOrderCalldata: string;
  executeBatchCalldata: string;
  orderTypeName: string;
}> {
  // Get network name and contracts
  const networkName = CHAIN_ID === 421614 ? "arbitrumSepolia" : "arbitrum";

  const exchangeRouter = await import(
    `../../lib/gmx-synthetics/deployments/${networkName}/ExchangeRouter.json`,
    { assert: { type: "json" } }
  );

  const orderVault = await import(
    `../../lib/gmx-synthetics/deployments/${networkName}/OrderVault.json`,
    { assert: { type: "json" } }
  );

  // Default values
  const isLong =
    orderParams.isLong ?? orderParams.direction === PositionDirection.Long;
  const swapPath = orderParams.swapPath || [];
  const callbackContract = orderParams.callbackContract || zeroAddress;
  const uiFeeReceiver = orderParams.uiFeeReceiver || zeroAddress;
  const minOutputAmount = orderParams.minOutputAmount || 0n;
  const triggerPrice = orderParams.triggerPrice || 0n;
  const decreasePositionSwapType =
    orderParams.decreasePositionSwapType || DecreaseSwapType.NoSwap;
  const shouldUnwrapNativeToken = orderParams.shouldUnwrapNativeToken || false;

  // For swaps, market address should be zero
  const marketAddress =
    orderParams.orderType === OrderType.MarketSwap ||
    orderParams.orderType === OrderType.LimitSwap
      ? zeroAddress
      : orderParams.marketAddress;

  // Get order type name for logging
  const orderTypeName = OrderType[orderParams.orderType];

  console.log("==============================================");
  console.log(`Order Type: ${orderTypeName}`);
  console.log(
    `Direction: ${
      orderParams.direction === PositionDirection.Long ? "Long" : "Short"
    }`
  );
  console.log(`Market: ${marketAddress}`);
  console.log(`Collateral Token: ${orderParams.collateralToken}`);
  console.log(`Collateral Amount: ${orderParams.collateralAmount}`);
  console.log(`Size Delta USD: ${orderParams.sizeDeltaUsd}`);
  console.log(`Acceptable Price: ${orderParams.acceptablePrice}`);
  console.log(`Execution Fee: ${orderParams.executionFee} ETH`);
  console.log(`Swap Path Length: ${swapPath.length}`);

  // 1. Send native token for execution fee
  const sendWntCalldata = encodeFunctionData({
    abi: exchangeRouter.abi,
    functionName: "sendWnt",
    args: [orderVault.address, orderParams.executionFee],
  });

  console.log("==============================================");

  console.log(`\nsendWnt Calldata:`);
  console.log(`  Function: sendWnt`);
  console.log(`  Receiver: ${orderVault.address}`);
  console.log(`  Amount: ${orderParams.executionFee} ETH`);
  console.log(`  Calldata: ${sendWntCalldata}`);

  // 2. Send collateral tokens
  const sendTokensCalldata = encodeFunctionData({
    abi: exchangeRouter.abi,
    functionName: "sendTokens",
    args: [
      orderParams.collateralToken,
      orderVault.address,
      orderParams.collateralAmount,
    ],
  });

  console.log("==============================================");

  console.log(`\nsendTokens Calldata:`);
  console.log(`  Function: sendTokens`);
  console.log(`  Token: ${orderParams.collateralToken}`);
  console.log(`  Receiver: ${orderVault.address}`);
  console.log(`  Amount: ${orderParams.collateralAmount}`);
  console.log(`  Calldata: ${sendTokensCalldata}`);

  // 3. Create the order
  const createOrderCalldata = encodeFunctionData({
    abi: exchangeRouter.abi,
    functionName: "createOrder",
    args: [
      [
        // addresses tuple
        [
          MANAGED_VAULT_ADDRESS, // receiver
          zeroAddress, // cancellationReceiver
          callbackContract,
          uiFeeReceiver,
          marketAddress, // market
          orderParams.collateralToken, // initialCollateralToken
          swapPath, // swapPath
        ],
        // numbers tuple
        [
          orderParams.sizeDeltaUsd, // sizeDeltaUsd
          0n, // initialCollateralDeltaAmount (can be non-zero for decrease orders)
          triggerPrice, // triggerPrice (for limit/stop orders)
          orderParams.acceptablePrice, // acceptablePrice
          orderParams.executionFee, // executionFee
          0n, // callbackGasLimit
          minOutputAmount, // minOutputAmount
          0n, // updatedAtBlock (using 0 for now)
        ],
        orderParams.orderType, // orderType
        decreasePositionSwapType, // decreasePositionSwapType
        isLong,
        shouldUnwrapNativeToken, // shouldUnwrapNativeToken
        false, // autoCancel
        ZERO_BYTES32, // referralCode
        [], // datalist
      ],
    ],
  });

  console.log("==============================================");

  console.log(`\ncreateOrder Calldata:`);
  console.log(`  Function: createOrder`);
  console.log(`  Order Type: ${orderTypeName}`);
  console.log(
    `  Decrease Swap Type: ${DecreaseSwapType[decreasePositionSwapType]}`
  );
  console.log(`  Is Long: ${isLong}`);
  console.log(`  Should Unwrap: ${shouldUnwrapNativeToken}`);
  console.log(`  Trigger Price: ${triggerPrice}`);
  console.log(`  Min Output: ${minOutputAmount}`);
  console.log(`  Calldata: ${createOrderCalldata}`);

  // 4. Batch execute through ManagedVault
  const executeBatchCalldata = encodeFunctionData({
    abi: ManagedVaultArtifact.abi,
    functionName: "executeBatch",
    args: [
      [exchangeRouter.address, exchangeRouter.address, exchangeRouter.address],
      [orderParams.executionFee, 0n, 0n],
      [sendWntCalldata, sendTokensCalldata, createOrderCalldata],
    ],
  });

  console.log(`\n🎯 executeBatch Calldata:`);
  console.log(`  Calldata length: ${executeBatchCalldata.length} chars`);
  console.log(`  Full Calldata: ${executeBatchCalldata}`);
  console.log(`===========================================\n`);

  return {
    sendWntCalldata,
    sendTokensCalldata,
    createOrderCalldata,
    executeBatchCalldata,
    orderTypeName,
  };
}

// Helper functions for common order types
export async function createMarketLong(
  sizeUsd: string,
  collateralAmount: string,
  acceptableEthPrice: string = "2500"
) {
  return createGmxCalldata({
    orderType: OrderType.MarketIncrease,
    direction: PositionDirection.Long,
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptableEthPrice, 30),
    collateralToken: USDC_ADDRESS,
    collateralAmount: parseUnits(collateralAmount, 6),
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther("0.1"),
  });
}

export async function createMarketShort(
  sizeUsd: string,
  collateralAmount: string,
  acceptableEthPrice: string = "2600"
) {
  return createGmxCalldata({
    orderType: OrderType.MarketIncrease,
    direction: PositionDirection.Short,
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptableEthPrice, 30),
    collateralToken: USDC_ADDRESS,
    collateralAmount: parseUnits(collateralAmount, 6),
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther("0.1"),
  });
}

export async function createMarketSwap(
  fromToken: string,
  fromAmount: string,
  fromDecimals: number,
  swapPath: string[],
  minOutputAmount: string = "1"
) {
  return createGmxCalldata({
    orderType: OrderType.MarketSwap,
    direction: PositionDirection.Long, // Not used for swaps
    sizeDeltaUsd: 0n,
    acceptablePrice: 0n,
    collateralToken: fromToken,
    collateralAmount: parseUnits(fromAmount, fromDecimals),
    marketAddress: zeroAddress,
    executionFee: parseEther("0.1"),
    swapPath: swapPath,
    minOutputAmount: parseUnits(minOutputAmount, fromDecimals), // Adjust decimals if needed
    isLong: false,
  });
}

export async function createLimitIncrease(
  sizeUsd: string,
  collateralAmount: string,
  triggerPrice: string,
  acceptablePrice: string,
  direction: PositionDirection
) {
  return createGmxCalldata({
    orderType: OrderType.LimitIncrease,
    direction: direction,
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptablePrice, 30),
    collateralToken: USDC_ADDRESS,
    collateralAmount: parseUnits(collateralAmount, 6),
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther("0.1"),
    triggerPrice: parseUnits(triggerPrice, 30),
  });
}

export async function createMarketDecrease(
  sizeUsd: string,
  acceptablePrice: string,
  direction: PositionDirection,
  decreasePositionSwapType: DecreaseSwapType = DecreaseSwapType.NoSwap
) {
  return createGmxCalldata({
    orderType: OrderType.MarketDecrease,
    direction: direction,
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptablePrice, 30),
    collateralToken: USDC_ADDRESS,
    collateralAmount: 0n, // No new collateral for decrease
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther("0.1"),
    decreasePositionSwapType: decreasePositionSwapType,
  });
}

// POC Usage Examples
export async function createPOCOrders() {
  console.log("Testing POC Order Calldata");
  console.log("================================\n");

  // Example 1: Market Long ETH/USDC
  console.log("Market Long Order:");
  const marketLong = await createMarketLong("500", "0.1", "2500");

  // Example 2: Market Short ETH/USDC
  console.log("Market Short Order:");
  const marketShort = await createMarketShort("500", "0.1", "2600");

  // Example 3: Market Swap WETH to DAI
  console.log("Market Swap Order (WETH → DAI):");
  const swapPath = [
    GM_ETH_USDC_MARKET, // GM_TOKEN_ETH_WETH_USDC
    GM_TOKEN_SWAP_ONLY_USDC_DAI, // GM_TOKEN_SWAP_ONLY_USDC_DAI
  ];
  const marketSwap = await createMarketSwap(
    WETH_ADDRESS,
    "0.1",
    18,
    swapPath,
    "200"
  );

  // Example 4: Limit Increase Order
  console.log("\n4️⃣ Limit Increase Order:");
  const limitIncrease = await createLimitIncrease(
    "500",
    "0.1",
    "2400", // Trigger price
    "2390", // Acceptable price
    PositionDirection.Long
  );

  // Example 5: Market Decrease Order
  console.log("\n5️⃣ Market Decrease Order:");
  const marketDecrease = await createMarketDecrease(
    "250", // Decrease half position
    "2550",
    PositionDirection.Long,
    DecreaseSwapType.NoSwap
  );

  return {
    marketLong,
    marketShort,
    marketSwap,
    limitIncrease,
    marketDecrease,
  };
}

await createPOCOrders();
