import readline from "readline";
import { ethers } from "ethers";
import { OpenAI } from "openai";
import { ChatCompletionCreateParams } from "openai/resources/index.mjs";
import EmberClient from "@emberai/sdk-typescript";

// Import types from Ember SDK
import type {
  WalletPositionsResponse,
  TransactionPlan,
  GetCapabilitiesResponse,
  Capability,
  CapabilityType,
} from "@emberai/sdk-typescript";

function logError(...args: unknown[]) {
  console.error(...args);
}

type ChatCompletionRequestMessage = {
  content: string;
  role: "user" | "system" | "assistant";
  function_call?: {
    name: string;
    arguments: string;
  };
};

export class Agent {
  private client: EmberClient;
  private signer: ethers.Signer;
  private userAddress: string;
  // Store both lending and borrowing capabilities for each token
  private tokenMap: Record<
    string,
    {
      chainId: string;
      address: string;
      lendingCapabilityId?: string;
      borrowingCapabilityId?: string;
      currentLendingApy?: string;
      currentBorrowingApy?: string;
    }
  > = {};
  private availableTokens: string[] = [];
  private functions: ChatCompletionCreateParams.Function[] = [];
  private conversationHistory: ChatCompletionRequestMessage[] = [];
  private openai: OpenAI;
  private rl: readline.Interface;

  /**
   * @param client - an instance of EmberClient.
   * @param signer - an ethers.Signer that will sign transactions.
   * @param userAddress - the user's wallet address.
   */
  constructor(client: EmberClient, signer: ethers.Signer, userAddress: string) {
    this.client = client;
    this.signer = signer;
    this.userAddress = userAddress;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not set!");
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async init() {
    // Set system instruction with our updated Ember SDK context.
    this.conversationHistory = [
      {
        role: "system",
        content: `You are an assistant that provides access to blockchain lending and borrowing functionalities via Ember SDK. Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
      },
    ];

    console.log(
      "Fetching lending and borrowing capabilities from Ember SDK...",
    );
    // Get both lending and borrowing capabilities
    const lendingCapabilities = (await this.client.getCapabilities({
      type: CapabilityType.LENDING,
    })) as GetCapabilitiesResponse;

    const borrowingCapabilities = (await this.client.getCapabilities({
      type: CapabilityType.BORROWING,
    })) as GetCapabilitiesResponse;

    // Process capabilities and build tokenMap
    const processCapability = (capability: Capability) => {
      if (capability.lending_capability) {
        const token = capability.lending_capability.underlying_token;
        if (!this.tokenMap[token.name]) {
          this.tokenMap[token.name] = {
            chainId: token.token_uid.chain_id,
            address: token.token_uid.address,
          };
        }
        this.tokenMap[token.name].lendingCapabilityId =
          capability.lending_capability.capability_id;
        this.tokenMap[token.name].currentLendingApy =
          capability.lending_capability.current_apy;
      } else if (capability.borrowing_capability) {
        const token = capability.borrowing_capability.underlying_token;
        if (!this.tokenMap[token.name]) {
          this.tokenMap[token.name] = {
            chainId: token.token_uid.chain_id,
            address: token.token_uid.address,
          };
        }
        this.tokenMap[token.name].borrowingCapabilityId =
          capability.borrowing_capability.capability_id;
        this.tokenMap[token.name].currentBorrowingApy =
          capability.borrowing_capability.current_apy;
      }
    };

    // Process both lending and borrowing capabilities
    lendingCapabilities.capabilities.forEach(processCapability);
    borrowingCapabilities.capabilities.forEach(processCapability);

    this.availableTokens = Object.keys(this.tokenMap);
    console.log(
      "Available tokens for lending and borrowing:",
      this.availableTokens,
    );

    // Define functions for the ChatCompletion call.
    this.functions = [
      {
        name: "borrow",
        description:
          "Borrow a token using Ember SDK. Provide the token name (one of the available tokens) and a human-readable amount.",
        parameters: {
          type: "object",
          properties: {
            tokenName: {
              type: "string",
              enum: this.availableTokens,
              description: "The token name to borrow.",
            },
            amount: {
              type: "string",
              description: "The amount to borrow (human readable).",
            },
          },
          required: ["tokenName", "amount"],
        },
      },
      {
        name: "repay",
        description:
          "Repay a borrowed token using Ember SDK. Provide the token name and a human-readable amount to repay.",
        parameters: {
          type: "object",
          properties: {
            tokenName: {
              type: "string",
              enum: this.availableTokens,
              description: "The token name to repay.",
            },
            amount: {
              type: "string",
              description: "The amount to repay (human readable).",
            },
          },
          required: ["tokenName", "amount"],
        },
      },
      {
        name: "supply",
        description:
          "Supply (deposit) a token using Ember SDK. Provide the token name (one of the available tokens) and a human-readable amount to supply.",
        parameters: {
          type: "object",
          properties: {
            tokenName: {
              type: "string",
              enum: this.availableTokens,
              description: "The token name to supply.",
            },
            amount: {
              type: "string",
              description: "The amount to supply (human readable).",
            },
          },
          required: ["tokenName", "amount"],
        },
      },
      {
        name: "withdraw",
        description:
          "Withdraw a previously supplied token using Ember SDK. Provide the token name and a human-readable amount to withdraw.",
        parameters: {
          type: "object",
          properties: {
            tokenName: {
              type: "string",
              enum: this.availableTokens,
              description: "The token name to withdraw.",
            },
            amount: {
              type: "string",
              description: "The amount to withdraw (human readable).",
            },
          },
          required: ["tokenName", "amount"],
        },
      },
      {
        name: "getUserPositions",
        description:
          "Get a summary of current wallet positions (borrowing and lending) using Ember SDK.",
        parameters: { type: "object", properties: {} },
      },
    ];
  }

  async start() {
    await this.init();
    console.log("Agent started. Type your message below.");
    this.promptUser();
  }

  promptUser() {
    this.rl.question("[user]: ", async (input: string) => {
      await this.processUserInput(input);
      this.promptUser();
    });
  }

  async processUserInput(userInput: string) {
    this.conversationHistory.push({ role: "user", content: userInput });
    const response = await this.callChatCompletion();
    response.content = response.content || "";
    await this.handleResponse(response as ChatCompletionRequestMessage);
  }

  async callChatCompletion() {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: this.conversationHistory,
      functions: this.functions,
      function_call: "auto",
    });
    return response.choices[0].message;
  }

  async handleResponse(message: ChatCompletionRequestMessage | undefined) {
    if (!message) return;
    if (message.function_call) {
      const functionName = message.function_call.name;
      const argsString = message.function_call.arguments;
      let args;
      try {
        args = JSON.parse(argsString || "{}");
      } catch (error) {
        logError("Error parsing function arguments:", error);
        args = {};
      }
      const { content: result, followUp: shouldFollowUp } =
        await this.handleToolCall(functionName, args);
      this.conversationHistory.push({
        role: "assistant",
        content: "",
        function_call: message.function_call,
      });
      this.conversationHistory.push({ role: "assistant", content: result });
      if (shouldFollowUp) {
        const followUp = await this.callChatCompletion();
        if (followUp && followUp.content) {
          console.log("[assistant]:", followUp.content);
          this.conversationHistory.push({
            role: "assistant",
            content: followUp.content,
          });
        }
      } else {
        console.log("[assistant]:", result);
      }
    } else {
      console.log("[assistant]:", message.content);
      this.conversationHistory.push({
        role: "assistant",
        content: message.content || "",
      });
    }
  }

  async handleToolCall(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; followUp: boolean }> {
    const withFollowUp = (content: string) => ({ content, followUp: true });
    const verbatim = (content: string) => ({ content, followUp: false });
    switch (functionName) {
      case "borrow":
        return withFollowUp(
          await this.toolBorrow(args as { tokenName: string; amount: string }),
        );
      case "repay":
        return withFollowUp(
          await this.toolRepay(args as { tokenName: string; amount: string }),
        );
      case "supply":
        return withFollowUp(
          await this.toolSupply(args as { tokenName: string; amount: string }),
        );
      case "withdraw":
        return withFollowUp(
          await this.toolWithdraw(
            args as { tokenName: string; amount: string },
          ),
        );
      case "getUserPositions":
        return verbatim(await this.toolGetUserPositions());
      default:
        return withFollowUp(`Unknown function: ${functionName}`);
    }
  }

  async executeAction(
    actionName: string,
    actionFunction: () => Promise<{
      tx: TransactionPlan;
      approvalTx: TransactionPlan | null;
    }>,
  ): Promise<string> {
    try {
      const action = await actionFunction();
      if (action.approvalTx) {
        const approvalTxHash = await this.signAndSendTransaction(
          action.approvalTx,
        );
        console.log("Approval transaction sent:", approvalTxHash);
      }
      const txHash = await this.signAndSendTransaction(action.tx);
      return `${actionName} transaction sent with hash: ${txHash}`;
    } catch (error: unknown) {
      const err = error as Error;
      const reason = err.message;
      logError(`Error in ${actionName}:`, reason);
      return `Error executing ${actionName}: ${reason}`;
    }
  }

  async toolBorrow(params: {
    tokenName: string;
    amount: string;
  }): Promise<string> {
    const { tokenName, amount } = params;
    const tokenDetail = this.tokenMap[tokenName];
    if (!tokenDetail) return `Token ${tokenName} not found.`;
    if (!tokenDetail.borrowingCapabilityId)
      return `Token ${tokenName} is not available for borrowing.`;

    console.log(
      `Executing borrow: ${tokenName} (address: ${tokenDetail.address}), amount: ${amount}`,
    );
    return this.executeAction("borrow", async () => {
      const response = await this.client.borrowTokens({
        capability_id: tokenDetail.borrowingCapabilityId,
        token_uid: {
          chain_id: tokenDetail.chainId,
          address: tokenDetail.address,
        },
        amount: amount,
        borrower_wallet_address: this.userAddress,
      });
      if (response.error || !response.transaction_plan)
        throw new Error(
          response.error?.message || "No transaction plan returned",
        );
      return {
        tx: response.transaction_plan,
        approvalTx: null,
      };
    });
  }

  async toolRepay(params: {
    tokenName: string;
    amount: string;
  }): Promise<string> {
    const { tokenName, amount } = params;
    const tokenDetail = this.tokenMap[tokenName];
    if (!tokenDetail) return `Token ${tokenName} not found.`;
    if (!tokenDetail.borrowingCapabilityId)
      return `Token ${tokenName} is not available for repaying.`;

    console.log(
      `Executing repay: ${tokenName} (address: ${tokenDetail.address}), amount: ${amount}`,
    );
    return this.executeAction("repay", async () => {
      const response = await this.client.repayTokens({
        capability_id: tokenDetail.borrowingCapabilityId,
        token_uid: {
          chain_id: tokenDetail.chainId,
          address: tokenDetail.address,
        },
        amount: amount,
        payer_wallet_address: this.userAddress,
      });
      if (response.error || !response.transaction_plan)
        throw new Error(
          response.error?.message || "No transaction plan returned",
        );
      return {
        tx: response.transaction_plan,
        approvalTx: null,
      };
    });
  }

  async toolSupply(params: {
    tokenName: string;
    amount: string;
  }): Promise<string> {
    const { tokenName, amount } = params;
    const tokenDetail = this.tokenMap[tokenName];
    if (!tokenDetail) return `Token ${tokenName} not found.`;
    if (!tokenDetail.lendingCapabilityId)
      return `Token ${tokenName} is not available for lending.`;

    console.log(
      `Executing supply: ${tokenName} (address: ${tokenDetail.address}), amount: ${amount}`,
    );
    return this.executeAction("supply", async () => {
      const response = await this.client.lendTokens({
        capability_id: tokenDetail.lendingCapabilityId,
        token_uid: {
          chain_id: tokenDetail.chainId,
          address: tokenDetail.address,
        },
        amount: amount,
        lender_wallet_address: this.userAddress,
      });
      if (response.error || !response.transaction_plan)
        throw new Error(
          response.error?.message || "No transaction plan returned",
        );
      return {
        tx: response.transaction_plan,
        approvalTx: null,
      };
    });
  }

  async toolWithdraw(params: {
    tokenName: string;
    amount: string;
  }): Promise<string> {
    const { tokenName, amount } = params;
    const tokenDetail = this.tokenMap[tokenName];
    if (!tokenDetail) return `Token ${tokenName} not found.`;
    if (!tokenDetail.lendingCapabilityId)
      return `Token ${tokenName} is not available for withdrawal.`;

    console.log(
      `Executing withdraw: ${tokenName} (address: ${tokenDetail.address}), amount: ${amount}`,
    );
    return this.executeAction("withdraw", async () => {
      const response = await this.client.withdrawTokens({
        capability_id: tokenDetail.lendingCapabilityId,
        token_uid: {
          chain_id: tokenDetail.chainId,
          address: tokenDetail.address,
        },
        amount: amount,
        lender_wallet_address: this.userAddress,
      });
      if (response.error || !response.transaction_plan)
        throw new Error(
          response.error?.message || "No transaction plan returned",
        );
      return {
        tx: response.transaction_plan,
        approvalTx: null,
      };
    });
  }

  async toolGetUserPositions(): Promise<string> {
    try {
      const positionsResponse = (await this.client.getWalletPositions({
        wallet_address: this.userAddress,
      })) as WalletPositionsResponse;
      return JSON.stringify(positionsResponse.positions, null, 2);
    } catch (error: unknown) {
      const err = error as Error;
      logError("Error in getUserPositions:", err);
      return `Error in getUserPositions: ${err.message}`;
    }
  }

  async signAndSendTransaction(tx: TransactionPlan): Promise<string> {
    const provider = this.signer.provider;
    await provider!.estimateGas(tx as ethers.PopulatedTransaction);
    const txResponse = await this.signer.sendTransaction(
      tx as ethers.PopulatedTransaction,
    );
    await txResponse.wait();
    return txResponse.hash;
  }
}
