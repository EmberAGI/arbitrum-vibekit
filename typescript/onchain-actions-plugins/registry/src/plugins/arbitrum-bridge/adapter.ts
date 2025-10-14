import { utils } from 'ethers';
import type { Provider } from 'ethers';
import {
  EthBridger,
  Erc20Bridger,
  getArbitrumNetwork,
  ParentTransactionReceipt,
  ParentToChildMessageStatus,
} from '@arbitrum/sdk';
import type {
  BridgeDepositRequest,
  BridgeDepositResponse,
  BridgeWithdrawRequest,
  BridgeWithdrawResponse,
  Token,
  TransactionPlan,
  BridgeGetMessageStatusRequest,
  BridgeGetMessageStatusResponse,
  TokenSet,
} from '../../core/index.js';

type AdapterParams = {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string;
};

export class ArbitrumBridgeAdapter {
  public readonly chainId: number;
  public readonly rpcUrl: string;
  public readonly wrappedNativeToken?: string;

  constructor(params: AdapterParams) {
    this.chainId = params.chainId;
    this.rpcUrl = params.rpcUrl;
    this.wrappedNativeToken = params.wrappedNativeToken;
  }

  async getDepositInputTokens(): Promise<TokenSet[]> {
    // Placeholder: token discovery should be integrated. For now allow any token on parent.
    return Promise.resolve([]);
  }

  async getDepositOutputTokens(): Promise<TokenSet[]> {
    return Promise.resolve([]);
  }

  async getWithdrawInputTokens(): Promise<TokenSet[]> {
    return Promise.resolve([]);
  }

  async getWithdrawOutputTokens(): Promise<TokenSet[]> {
    return Promise.resolve([]);
  }

  async createDepositTransactions(request: BridgeDepositRequest): Promise<BridgeDepositResponse> {
    const isNative = request.token.isNative;
    const childNetwork = await getArbitrumNetwork(this.chainId);
    if (isNative) {
      const bridger = new EthBridger(childNetwork);
      // We cannot submit tx here; return TransactionPlan for parent L1 deposit
      const txData = await bridger.getDepositRequest({
        amount: request.amount,
      });
      const tx = this.parentToTxPlan(txData.txRequest);
      return { transactions: [tx] };
    }
    const bridger = new Erc20Bridger(childNetwork);
    const txData = await bridger.getDepositRequest({
      amount: request.amount,
      erc20ParentAddress: request.token.tokenUid.address,
      from: request.fromWalletAddress,
      to: request.toWalletAddress ?? request.fromWalletAddress,
      // gas params omitted; wallet/provider to estimate when sending
    } as any);
    const tx = this.parentToTxPlan(txData.txRequest);
    return { transactions: [tx] };
  }

  async createWithdrawTransactions(
    request: BridgeWithdrawRequest
  ): Promise<BridgeWithdrawResponse> {
    const isNative = request.token.isNative;
    const childNetwork = await getArbitrumNetwork(this.chainId);
    if (isNative) {
      const bridger = new EthBridger(childNetwork);
      const txData = await bridger.getWithdrawalRequest({
        amount: request.amount,
        to: request.toWalletAddress ?? request.fromWalletAddress,
      } as any);
      const tx = this.childToTxPlan(txData);
      return { transactions: [tx] };
    }
    const bridger = new Erc20Bridger(childNetwork);
    const txData = await bridger.getWithdrawalRequest({
      amount: request.amount,
      erc20ParentAddress: request.token.tokenUid.address,
      to: request.toWalletAddress ?? request.fromWalletAddress,
    } as any);
    const tx = this.childToTxPlan(txData);
    return { transactions: [tx] };
  }

  async getMessageStatus(
    req: BridgeGetMessageStatusRequest
  ): Promise<BridgeGetMessageStatusResponse> {
    if (req.direction === 'parent-to-child') {
      const parentReceipt = new ParentTransactionReceipt({} as any);
      // In a real implementation we'd fetch the tx receipt from a provider and pass it in
      const messages = await parentReceipt.getParentToChildMessages({} as any);
      const message = messages[0];
      const res = await message.waitForStatus();
      if (res.status === ParentToChildMessageStatus.REDEEMED) {
        return { status: 'redeemed', destinationTxHash: (res as any).childTxHash };
      }
      if ((res.status as any) === 'Child') {
        return { status: 'redeemable' };
      }
      return { status: 'pending' };
    }
    // child-to-parent message status would require ChildToParent flow
    return { status: 'pending' };
  }

  private parentToTxPlan(tx: { to: string; data: string; value?: any; from?: string }): TransactionPlan {
    return {
      type: 'EVM_TX',
      to: tx.to,
      data: tx.data ?? '0x',
      value: tx.value ? tx.value.toString() : '0',
      chainId: String(this.getParentChainIdForChild(this.chainId)),
    };
  }

  private childToTxPlan(txOrRequest: any): TransactionPlan {
    const tx = txOrRequest && txOrRequest.txRequest ? txOrRequest.txRequest : txOrRequest;
    return {
      type: 'EVM_TX',
      to: tx.to,
      data: tx.data ?? '0x',
      value: tx.value ? String(tx.value) : '0',
      chainId: String(this.chainId),
    };
  }

  private getParentChainIdForChild(childChainId: number): number {
    // 42161 -> 1, 421614 -> 11155111 (Arbitrum Sepolia)
    if (childChainId === 42161) return 1;
    if (childChainId === 421614) return 11155111;
    return 1;
  }
}


