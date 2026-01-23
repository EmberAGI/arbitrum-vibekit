import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';
import type { Chain } from 'viem';

export const supportedEvmChains = [arbitrum, mainnet, polygon, optimism, base] as const;

export type SupportedEvmChain = (typeof supportedEvmChains)[number];

export const defaultEvmChain = arbitrum;

const supportedChainById: ReadonlyMap<number, SupportedEvmChain> = new Map(
  supportedEvmChains.map((chain) => [chain.id, chain] as const),
);

export function getSupportedEvmChain(chainId: number): SupportedEvmChain | null {
  return supportedChainById.get(chainId) ?? null;
}

export function getEvmChainOrDefault(chainId: number | null | undefined): Chain {
  if (typeof chainId !== 'number') return defaultEvmChain;
  return getSupportedEvmChain(chainId) ?? defaultEvmChain;
}

