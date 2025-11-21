import { encodeFunctionData, parseAbi } from 'viem';
import { RADIANT_CONFIG } from '../radiant.config.js';

export type TxBuildResult = {
  to: string;
  data: string;
  value: string | null;
};

const poolAbi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)'
]);

export function supply(params: { token: string; amount: string; onBehalfOf?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'supply',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      (params.onBehalfOf || params.token) as `0x${string}`,
      0
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

export function withdraw(params: { token: string; amount: string; to?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'withdraw',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      (params.to || params.token) as `0x${string}`
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

export function borrow(params: { token: string; amount: string; rateMode?: number; onBehalfOf?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'borrow',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      BigInt(params.rateMode || 2),
      0,
      (params.onBehalfOf || params.token) as `0x${string}`
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

export function repay(params: { token: string; amount: string; rateMode?: number; onBehalfOf?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'repay',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      BigInt(params.rateMode || 2),
      (params.onBehalfOf || params.token) as `0x${string}`
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}
