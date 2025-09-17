import { ethers } from 'ethers';
import {
  LegacyUiPoolDataProvider,
  UiPoolDataProvider,
  type ReservesDataHumanized,
  type ReservesHelperInput,
  type UserReservesHelperInput,
  type EModeData,
  type EmodeDataHumanized,
  type UserReserveDataHumanized,
} from '@aave/contract-helpers';

// @aave/contract-helpers provides two periphery contracts for fetching data from the blockchain:
// `LegacyUiPoolDataProvider` and `UiPoolDataProvider`. Which one should be used is determined by the version that is actually deployed on a given chain.
// Fortunately, for our use case we don't care about this complexity,
// because their interfaces share just enough similarities for us to proceed.
// `IUiPoolDataProvider` is an intersection of two interfaces.

// Common functions between `LegacyUiPoolDataProvider` and `UiPoolDataProvider`
export interface IUiPoolDataProvider {
  getReservesHumanized: (args: ReservesHelperInput) => Promise<ReservesDataHumanized>;
  getUserReservesHumanized: (args: UserReservesHelperInput) => Promise<{
    userReserves: UserReserveDataHumanized[];
    userEmodeCategoryId: number;
  }>;
  getEModes: (args: ReservesHelperInput) => Promise<EModeData[]>;
  getEModesHumanized: (args: ReservesHelperInput) => Promise<EmodeDataHumanized[]>;
}

export type IUiPoolDataProviderConstructor = new ({
  uiPoolDataProviderAddress,
  provider,
  chainId,
}: {
  uiPoolDataProviderAddress: string;
  provider: ethers.providers.JsonRpcProvider;
  chainId: number;
}) => IUiPoolDataProvider;

// which class to use: LegacyUiPoolDataProvider or UiPoolDataProvider
// When adding new chains, either compare the interfaces or bruteforce the correct option.
export const UI_POOL_DATA_PROVIDER_INTERFACE_PER_CHAIN: Record<
  number,
  IUiPoolDataProviderConstructor
> = {
  11155111: LegacyUiPoolDataProvider as IUiPoolDataProviderConstructor,
  42161: UiPoolDataProvider as IUiPoolDataProviderConstructor,
  1: UiPoolDataProvider as IUiPoolDataProviderConstructor,
};

// Use this function to get the correct pool data provider implementation.
export const getUiPoolDataProviderImpl = (chainId: number): IUiPoolDataProviderConstructor => {
  const res = UI_POOL_DATA_PROVIDER_INTERFACE_PER_CHAIN[chainId];
  if (!res) {
    throw new Error(
      'UI_POOL_DATA_PROVIDER_INTERFACE_PER_CHAIN does not contain this chain ID. Edit providers/aave/dataProvider.ts.'
    );
  }
  return res;
};
