import { encodeFunctionData, parseEther, parseUnits, zeroAddress } from 'viem';
import {
  type GMXOrderParams,
  type OrderType,
  type PositionDirection,
  type DecreaseSwapType,
  ORDER_TYPE_NAME,
  POSITION_DIRECTION_NAME,
  DECREASE_SWAP_TYPE_NAME,
} from '../../domain/types.ts';

import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_USDC_ADDRESS,
  ARBITRUM_WETH_ADDRESS,
  GM_ETH_USDC_MARKET,
  GM_TOKEN_SWAP_ONLY_USDC_DAI,
  ZERO_BYTES32,
  GMX_MARKET_FACTORY,
} from '../../constants.ts';

import exchangeRouter from '../helpers/utils/abis/ExchangeRouter.json';
import orderVault from '../helpers/utils/abis/OrderVault.json';

export async function createGmxCalldata(orderParams: GMXOrderParams): Promise<{
  sendWntCalldata: string;
  sendTokensCalldata: string;
  createOrderCalldata: string;
  multicallCalldata: string;
  orderTypeName: string;
}> {
  // Get network name and contracts
  const networkName = ARBITRUM_CHAIN_ID === 421614 ? 'arbitrumSepolia' : 'arbitrum';

  //   const exchangeRouter = await import(
  //     `../../lib/gmx-synthetics/deployments/${networkName}/ExchangeRouter.json`,
  //     { assert: { type: 'json' } }
  //   );

  //   const orderVault = await import(
  //     `../../lib/gmx-synthetics/deployments/${networkName}/OrderVault.json`,
  //     { assert: { type: 'json' } }
  //   );

  // Default values
  const isLong = orderParams.isLong ?? orderParams.direction == 0; //PositionDirection.Long
  const swapPath = orderParams.swapPath || [];
  const callbackContract = orderParams.callbackContract || zeroAddress;
  const uiFeeReceiver = orderParams.uiFeeReceiver || zeroAddress;
  const minOutputAmount = orderParams.minOutputAmount || 0n;
  const triggerPrice = orderParams.triggerPrice || 0n;
  const decreasePositionSwapType = orderParams.decreasePositionSwapType || 0;
  const shouldUnwrapNativeToken = orderParams.shouldUnwrapNativeToken || false;
  const initialCollateralDeltaAmount =
    orderParams.orderType == 2 || orderParams.orderType == 3 ? orderParams.collateralAmount : 0n;
  // For swaps, market address should be zero
  const marketAddress =
    orderParams.orderType == 0 || orderParams.orderType == 1
      ? zeroAddress
      : orderParams.marketAddress;

  // Get order type name for logging
  const orderTypeName =
    ORDER_TYPE_NAME[orderParams.orderType] ?? `Unknown(${orderParams.orderType})`;
  const directionName =
    POSITION_DIRECTION_NAME[orderParams.direction] ?? `Unknown(${orderParams.direction})`;

  const decreaseSwapTypeName =
    orderParams.decreasePositionSwapType !== undefined
      ? DECREASE_SWAP_TYPE_NAME[orderParams.decreasePositionSwapType]
      : 'N/A';
  console.log('==============================================');
  console.log(`Order Type: ${orderTypeName}`);
  console.log(`Direction: ${directionName}`);
  console.log(`Decrease Swap Type : ${decreaseSwapTypeName}`);
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
    functionName: 'sendWnt',
    args: [orderVault.address, orderParams.executionFee],
  });

  console.log('==============================================');

  console.log(`\nsendWnt Calldata:`);
  console.log(`  Function: sendWnt`);
  console.log(`  Receiver: ${orderVault.address}`);
  console.log(`  Amount: ${orderParams.executionFee} ETH`);
  //   console.log(`  Calldata: ${sendWntCalldata}`);

  // 2. Send collateral tokens
  const sendTokensCalldata = encodeFunctionData({
    abi: exchangeRouter.abi,
    functionName: 'sendTokens',
    args: [orderParams.collateralToken, orderVault.address, orderParams.collateralAmount],
  });

  console.log('==============================================');

  console.log(`\nsendTokens Calldata:`);
  console.log(`  Function: sendTokens`);
  console.log(`  Token: ${orderParams.collateralToken}`);
  console.log(`  Receiver: ${orderVault.address}`);
  console.log(`  Amount: ${orderParams.collateralAmount}`);
  //   console.log(`  Calldata: ${sendTokensCalldata}`);

  // 3. Create the order
  const createOrderCalldata = encodeFunctionData({
    abi: exchangeRouter.abi,
    functionName: 'createOrder',
    args: [
      [
        // addresses tuple
        [
          orderParams.receiver, // receiver
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
          initialCollateralDeltaAmount, // initialCollateralDeltaAmount (can be non-zero for decrease orders)
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

  console.log('==============================================');

  console.log(`\ncreateOrder Calldata:`);
  console.log(`  Function: createOrder`);
  console.log(`  Order Type: ${orderTypeName}`);
  console.log(`  Decrease Swap Type: ${decreaseSwapTypeName}`);
  console.log(`  Is Long: ${isLong}`);
  console.log(`  Should Unwrap: ${shouldUnwrapNativeToken}`);
  console.log(`  Trigger Price: ${triggerPrice}`);
  console.log(`  Min Output: ${minOutputAmount}`);
  //   console.log(`  Calldata: ${createOrderCalldata}`);

  // 4. Batch execute with multicall

  const multicallCalldata = encodeFunctionData({
    abi: exchangeRouter.abi,
    functionName: 'multicall',
    args: [[sendWntCalldata, sendTokensCalldata, createOrderCalldata]],
  });

  //   console.log(`\n🎯 executeBatch Calldata:`);
  //   console.log(`  Calldata length: ${multicallCalldata.length} chars`);
  //   console.log(`  Full Calldata: ${multicallCalldata}`);
  //   console.log(`===========================================\n`);

  return {
    sendWntCalldata,
    sendTokensCalldata,
    createOrderCalldata,
    multicallCalldata,
    orderTypeName,
  };
}

// Helper functions for common order types
export async function createMarketLong(
  receiver: `0x${string}`,
  sizeUsd: string,
  collateralAmount: string,
  acceptableEthPrice: string = '2500',
) {
  return createGmxCalldata({
    receiver,
    orderType: 2, // OrderType.MarketIncrease
    direction: 0, // PositionDirection.Long
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptableEthPrice, 30),
    collateralToken: ARBITRUM_USDC_ADDRESS,
    collateralAmount: parseUnits(collateralAmount, 6), // assuming this is USDC
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther('0.1'),
  });
}

export async function createMarketShort(
  receiver: `0x${string}`,
  sizeUsd: string,
  collateralAmount: string,
  acceptableEthPrice: string = '2600',
) {
  return createGmxCalldata({
    receiver,
    orderType: 2, // OrderType.MarketIncrease
    direction: 1, // PositionDirection.Short
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptableEthPrice, 30),
    collateralToken: ARBITRUM_USDC_ADDRESS,
    collateralAmount: parseUnits(collateralAmount, 6), // assuming this is USDC
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther('0.1'),
  });
}

export async function createMarketSwap(
  receiver: `0x${string}`,
  fromToken: string,
  fromAmount: string,
  fromDecimals: number,
  swapPath: string[],
  minOutputAmount: string = '1',
) {
  return createGmxCalldata({
    receiver,
    orderType: 0, // OrderType.MarketSwap,
    direction: 0, // Not used for swaps
    sizeDeltaUsd: 0n,
    acceptablePrice: 0n,
    collateralToken: fromToken,
    collateralAmount: parseUnits(fromAmount, fromDecimals),
    marketAddress: zeroAddress,
    executionFee: parseEther('0.1'),
    swapPath: swapPath,
    minOutputAmount: parseUnits(minOutputAmount, fromDecimals), // Adjust decimals if needed
    isLong: false,
  });
}

export async function createLimitIncrease(
  receiver: `0x${string}`,
  sizeUsd: string,
  collateralAmount: string,
  triggerPrice: string,
  acceptablePrice: string,
  direction: PositionDirection,
) {
  return createGmxCalldata({
    receiver,
    orderType: OrderType.LimitIncrease,
    direction: direction,
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptablePrice, 30),
    collateralToken: ARBITRUM_USDC_ADDRESS,
    collateralAmount: parseUnits(collateralAmount, 6), // assuming this is USDC
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther('0.1'),
    triggerPrice: parseUnits(triggerPrice, 30),
  });
}

export async function createMarketDecrease(
  receiver: `0x${string}`,
  sizeUsd: string,
  acceptablePrice: string,
  direction: PositionDirection,
  decreasePositionSwapType: DecreaseSwapType = 0, //DecreaseSwapType.NoSwap
) {
  return createGmxCalldata({
    receiver,
    orderType: OrderType.MarketDecrease,
    direction: direction,
    sizeDeltaUsd: parseUnits(sizeUsd, 30),
    acceptablePrice: parseUnits(acceptablePrice, 30),
    collateralToken: ARBITRUM_USDC_ADDRESS,
    collateralAmount: 0n, // No new collateral for decrease
    marketAddress: GM_ETH_USDC_MARKET,
    executionFee: parseEther('0.1'),
    decreasePositionSwapType: decreasePositionSwapType,
  });
}

// POC Usage Examples
export async function createPOCOrders() {
  console.log('Testing POC Order Calldata');
  console.log('================================\n');

  // Example 1: Market Long ETH/USDC
  console.log('Market Long Order:');
  const marketLong = await createMarketLong('500', '0.1', '2500');

  // Example 2: Market Short ETH/USDC
  console.log('Market Short Order:');
  const marketShort = await createMarketShort('500', '0.1', '2600');

  // Example 3: Market Swap WETH to DAI
  console.log('Market Swap Order (WETH → DAI):');
  const swapPath = [
    GM_ETH_USDC_MARKET, // GM_TOKEN_ETH_WETH_USDC
    GM_TOKEN_SWAP_ONLY_USDC_DAI, // GM_TOKEN_SWAP_ONLY_USDC_DAI
  ];
  const marketSwap = await createMarketSwap(ARBITRUM_WETH_ADDRESS, '0.1', 18, swapPath, '200');

  // Example 4: Limit Increase Order
  console.log('\n4️⃣ Limit Increase Order:');
  const limitIncrease = await createLimitIncrease(
    '500',
    '0.1',
    '2400', // Trigger price
    '2390', // Acceptable price
    0,
  );

  // Example 5: Market Decrease Order
  console.log('\n5️⃣ Market Decrease Order:');
  const marketDecrease = await createMarketDecrease(
    '250', // Decrease half position
    '2550',
    0,
    0,
  );

  return {
    marketLong,
    marketShort,
    marketSwap,
    limitIncrease,
    marketDecrease,
  };
}
