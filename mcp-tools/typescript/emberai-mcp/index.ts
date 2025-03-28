import EmberGrpcClient, {
  EmberClient,
  TransactionPlan,
  GetCapabilitiesResponse,
  Capability,
  CapabilityType,
  GetWalletPositionsResponse,
  WalletPosition,
} from "@emberai/sdk-typescript";

export {
  GetCapabilitiesResponse,
  Capability,
  CapabilityType,
  GetWalletPositionsResponse,
  WalletPosition,
  TransactionPlan,
};

export const mcpTools = [
  {
    name: "borrow",
    description:
      "Borrow a token using Ember SDK. Requires precise token address, chain ID, amount, and user address.",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "The contract address of the token to borrow.",
        },
        tokenChainId: {
          type: "string",
          description: "The chain ID where the token contract resides.",
        },
        amount: {
          type: "string",
          description: "The amount to borrow (precise, non-human readable format expected by SDK).",
        },
        userAddress: {
          type: "string",
          description: "The wallet address initiating the borrow.",
        }
      },
      required: ["tokenAddress", "tokenChainId", "amount", "userAddress"],
    },
  },
  {
    name: "repay",
    description:
      "Repay a borrowed token using Ember SDK. Requires precise token address, chain ID, amount, and user address.",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: { type: "string" },
        tokenChainId: { type: "string" },
        amount: { type: "string" },
        userAddress: { type: "string" }
      },
      required: ["tokenAddress", "tokenChainId", "amount", "userAddress"],
    },
  },
  {
    name: "supply",
    description:
      "Supply (deposit) a token using Ember SDK. Requires precise token address, chain ID, amount, and user address.",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: { type: "string" },
        tokenChainId: { type: "string" },
        amount: { type: "string" },
        userAddress: { type: "string", description: "The supplier's wallet address." }
      },
      required: ["tokenAddress", "tokenChainId", "amount", "userAddress"],
    },
  },
  {
    name: "withdraw",
    description:
      "Withdraw a previously supplied token using Ember SDK. Requires precise token address, chain ID, amount, and user address.",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: { type: "string" },
        tokenChainId: { type: "string" },
        amount: { type: "string" },
        userAddress: { type: "string", description: "The lender's wallet address." }
      },
      required: ["tokenAddress", "tokenChainId", "amount", "userAddress"],
    },
  },
  {
    name: "getCapabilities",
    description:
      "Get a summary of current lending and borrowing capabilities using Ember SDK.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: Object.values(CapabilityType),
          description: "The type of capabilities to get.",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "getUserPositions",
    description:
      "Get a summary of current wallet positions (borrowing and lending) using Ember SDK.",
    parameters: {
      type: "object",
      properties: {
        userAddress: {
          type: "string",
          description: "The wallet address to fetch positions for.",
        }
      },
      required: ["userAddress"],
    },
  },
];

export class ToolFunctions {
  private client: EmberClient;

  constructor(endpoint: string = "grpc.api.emberai.xyz:50051") {
    this.client = new EmberGrpcClient(endpoint);
  }

  async borrow(params: {
    tokenAddress: string;
    tokenChainId: string;
    amount: string;
    userAddress: string;
  }): Promise<TransactionPlan[]> {
    const response = await this.client.borrowTokens({
      tokenUid: {
        chainId: params.tokenChainId,
        address: params.tokenAddress,
      },
      amount: params.amount,
      borrowerWalletAddress: params.userAddress,
    });
    if (response.error || !response.transactions)
      throw new Error(
        response.error?.message || "No transaction plan returned for borrow",
      );
    return response.transactions;
  }

  async repay(params: {
    tokenAddress: string;
    tokenChainId: string;
    amount: string;
    userAddress: string;
  }): Promise<TransactionPlan[]> {
    const response = await this.client.repayTokens({
      tokenUid: {
        chainId: params.tokenChainId,
        address: params.tokenAddress,
      },
      amount: params.amount,
      borrowerWalletAddress: params.userAddress,
    });
    if (response.error || !response.transactions)
      throw new Error(
        response.error?.message || "No transaction plan returned for repay",
      );
    return response.transactions;
  }

  async supply(params: {
    tokenAddress: string;
    tokenChainId: string;
    amount: string;
    userAddress: string;
  }): Promise<TransactionPlan[]> {
    const response = await this.client.supplyTokens({
      tokenUid: {
        chainId: params.tokenChainId,
        address: params.tokenAddress,
      },
      amount: params.amount,
      supplierWalletAddress: params.userAddress,
    });
    if (response.error || !response.transactions)
      throw new Error(
        response.error?.message || "No transaction plan returned for supply",
      );
    return response.transactions;
  }

  async withdraw(params: {
    tokenAddress: string;
    tokenChainId: string;
    amount: string;
    userAddress: string;
  }): Promise<TransactionPlan[]> {
    const response = await this.client.withdrawTokens({
      tokenUid: {
        chainId: params.tokenChainId,
        address: params.tokenAddress,
      },
      amount: params.amount,
      lenderWalletAddress: params.userAddress,
    });
    if (response.error || !response.transactions)
      throw new Error(
        response.error?.message || "No transaction plan returned for withdraw",
      );
    return response.transactions;
  }

  async getCapabilities(params: {
    type: CapabilityType;
  }): Promise<GetCapabilitiesResponse> {
    const response = await this.client.getCapabilities({ type: params.type });
    return response;
  }

  async getUserPositions(params: {
    userAddress: string;
  }): Promise<GetWalletPositionsResponse> {
    const response = await this.client.getWalletPositions({
      walletAddress: params.userAddress,
    });
    return response as GetWalletPositionsResponse;
  }
}
