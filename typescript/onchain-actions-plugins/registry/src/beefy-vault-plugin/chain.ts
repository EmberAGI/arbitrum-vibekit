import { ethers } from 'ethers';

export class Chain {
  public id: number;
  public rpcUrl: string;
  public wrappedNativeTokenAddress?: string;

  constructor(chainId: number, rpcUrl: string, wrappedNativeToken?: string) {
    this.id = chainId;
    this.rpcUrl = rpcUrl;
    this.wrappedNativeTokenAddress = wrappedNativeToken;
  }

  public getProvider(): ethers.providers.JsonRpcProvider {
    return new ethers.providers.JsonRpcProvider(this.rpcUrl);
  }

  public getChainName(): string {
    switch (this.id) {
      case 42161:
        return 'arbitrum';
      case 1:
        return 'ethereum';
      case 137:
        return 'polygon';
      case 56:
        return 'bsc';
      default:
        return 'unknown';
    }
  }
}
