import readline from "readline";
import { ethers } from "ethers";
import { OpenAI } from "openai";
import { ChatCompletionCreateParams, ChatCompletionMessageParam } from "openai/resources/index.mjs";
import {
  ToolFunctions,
  GetCapabilitiesResponse,
  Capability,
  CapabilityType,
  WalletPosition,
  TransactionPlan,
  GetWalletPositionsResponse,
} from "../../../mcp-tools/typescript/emberai-mcp/index.js";
import {
  agentTools,
  HandlerContext,
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
} from "./agentToolHandlers.js";
import type { LendingPosition } from "@emberai/sdk-typescript";

// Define the type for user reserve entries using LendingPosition
type UserReserveEntry = LendingPosition['userReserves'][number];

function logError(...args: unknown[]) {
  console.error(...args);
}

export class Agent {
  private signer: ethers.Signer;
  private userAddress: string;
  private tokenMap: Record<
    string,
    {
      chainId: string;
      address: string;
    }
  > = {};
  private availableTokens: string[] = [];
  public conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  private openai: OpenAI;
  private rl: readline.Interface | null = null;
  private llmTools: ChatCompletionCreateParams.Function[] = [];
  private toolExecutor: ToolFunctions;

  /**
   * @param client - an instance of EmberClient.
   * @param signer - an ethers.Signer that will sign transactions.
   * @param userAddress - the user's wallet address.
   */
  constructor(signer: ethers.Signer, userAddress: string) {
    this.toolExecutor = new ToolFunctions();
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

  async log(...args: unknown[]) {
    console.log(...args);
  }

  async init() {
    this.conversationHistory = [
      {
        role: "system",
        content: `You are an assistant that provides access to blockchain lending and borrowing functionalities via Ember SDK. Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
      },
    ];

    this.log("Fetching lending and borrowing capabilities from Ember SDK...");

    const lendingCapabilities = await this.toolExecutor.getCapabilities({
      type: CapabilityType.LENDING,
    });

    const processCapability = (capability: Capability) => {
      if (capability.lendingCapability) {
        const token = capability.lendingCapability.underlyingToken!;
        if (token?.name && token?.tokenUid) {
          if (!this.tokenMap[token.name]) {
            this.tokenMap[token.name] = {
              chainId: token.tokenUid.chainId,
              address: token.tokenUid.address,
            };
          }
        } else {
          this.log("Warning: Capability found with missing token name or tokenUid", capability)
        }
      }
    };

    lendingCapabilities.capabilities.forEach(processCapability);

    this.availableTokens = Object.keys(this.tokenMap);
    this.log(
      "Available tokens for lending and borrowing:",
      this.availableTokens,
    );

    this.llmTools = agentTools;
  }

  async start() {
    await this.init();
    this.log("Agent started. Type your message below.");
    this.promptUser();
  }

  async stop() {
    this.rl?.close();
    this.rl = null;
  }

  promptUser() {
    if (!this.rl) return;
    this.rl.question("[user]: ", async (input: string) => {
      if (!this.rl) return;
      await this.processUserInput(input);
      if (this.rl) {
        this.promptUser();
      }
    });
  }

  async processUserInput(
    userInput: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
    this.conversationHistory.push({ role: "user", content: userInput });
    const response = await this.callChatCompletion();
    if (response) {
      await this.handleResponse(response);
    }
    return response;
  }

  async callChatCompletion(): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: this.conversationHistory,
        functions: this.llmTools,
        function_call: "auto",
      });
      return response.choices[0].message;
    } catch (error) {
      logError("Error calling OpenAI API:", error);
      this.log("[assistant]: Error communicating with the language model.");
      return null;
    }
  }

  async handleResponse(message: OpenAI.Chat.Completions.ChatCompletionMessage) {
    const messageToPush: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: message.role,
      content: message.content ?? null,
      ...(message.function_call ? { function_call: message.function_call } : {}),
    };
    this.conversationHistory.push(messageToPush);

    if (message.function_call) {
      const functionName = message.function_call.name;
      const argsString = message.function_call.arguments;
      let args;
      try {
        args = JSON.parse(argsString || "{}");
      } catch (error) {
        logError("Error parsing function arguments:", error);
        args = {};
        const errorContent = `Error: Could not parse arguments for function ${functionName}. Invalid JSON received.`;
        this.conversationHistory.push({ role: "function", name: functionName, content: errorContent });
        this.log("[assistant]:", errorContent);
        return;
      }

      try {
        const { content: result, followUp: shouldFollowUp } =
          await this.dispatchToolCall(functionName, args);

        this.conversationHistory.push({ role: "function", name: functionName, content: result });

        if (shouldFollowUp) {
          this.log("Tool execution requires follow-up from LLM.");
          const followUpCompletion = await this.callChatCompletion();
          if (followUpCompletion) {
            await this.handleResponse(followUpCompletion);
          }
        } else {
          this.log("[assistant]: Action completed.", result);
        }
      } catch (e) {
        const err = e as Error;
        logError("Error during tool dispatch or execution:", err);
        const errorContent = `Error executing function ${functionName}: ${err.message}`;
        this.conversationHistory.push({ role: "function", name: functionName, content: errorContent });
        this.log("[assistant]:", errorContent);
      }
    } else if (message.content) {
      this.log("[assistant]:", message.content);
    }
  }

  async dispatchToolCall(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; followUp: boolean }> {
    this.log("Dispatching tool call:", functionName, args);

    const context: HandlerContext = {
      toolExecutor: this.toolExecutor,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      executeAction: this.executeAction.bind(this),
      log: this.log.bind(this),
      describeWalletPositionsResponse: this.describeWalletPositionsResponse.bind(this),
    };

    const withFollowUp = (content: string) => ({ content, followUp: true });
    const verbatim = (content: string) => ({ content, followUp: false });

    try {
      switch (functionName) {
        case "borrow":
          return withFollowUp(
            await handleBorrow(args as { tokenName: string; amount: string }, context),
          );
        case "repay":
          return withFollowUp(
            await handleRepay(args as { tokenName: string; amount: string }, context),
          );
        case "supply":
          return withFollowUp(
            await handleSupply(args as { tokenName: string; amount: string }, context),
          );
        case "withdraw":
          return withFollowUp(
            await handleWithdraw(args as { tokenName: string; amount: string }, context),
          );
        case "getUserPositions":
          const description = await handleGetUserPositions({}, context);
          return verbatim(description);
        default:
          this.log(`Warning: Unknown function call requested: ${functionName}`);
          throw new Error(`Unknown function requested: ${functionName}`);
      }
    } catch (error) {
      this.log(`Error executing handler for ${functionName}:`, error);
      throw error;
    }
  }

  async executeAction(
    actionName: string,
    transactions: TransactionPlan[],
  ): Promise<string> {
    if (!transactions || transactions.length === 0) {
      this.log(`${actionName}: No transactions required.`);
      return `${actionName}: No transactions required.`;
    }
    try {
      this.log(`Executing ${transactions.length} transaction(s) for ${actionName}...`);
      const txHashes: string[] = [];
      for (const transaction of transactions) {
        const txHash = await this.signAndSendTransaction(transaction);
        this.log(`${actionName} transaction sent: ${txHash}`);
        txHashes.push(txHash);
      }
      return `${actionName}: success! Transaction hash(es): ${txHashes.join(', ')}`;
    } catch (error: unknown) {
      const err = error as Error;
      logError(`Error executing ${actionName} action:`, err.message);
      throw new Error(`Error executing ${actionName}: ${err.message}`);
    }
  }

  async signAndSendTransaction(tx: TransactionPlan): Promise<string> {
    const provider = this.signer.provider;
    if (!provider) throw new Error("Signer is not connected to a provider.");

    const ethersTx: ethers.providers.TransactionRequest = {
      to: tx.to,
      value: ethers.BigNumber.from(tx.value || "0"),
      data: tx.data,
      from: this.userAddress,
    };

    try {
      const dataPrefix = tx.data ? ethers.utils.hexlify(tx.data).substring(0, 10) : '0x';
      this.log(`Sending transaction for ${ethersTx.to} with data ${dataPrefix}...`);
      const txResponse = await this.signer.sendTransaction(ethersTx);
      this.log(`Transaction submitted: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait();
      this.log(`Transaction confirmed in block ${receipt.blockNumber}: ${txResponse.hash}`);
      return txResponse.hash;
    } catch(error) {
      logError("Send transaction failed:", error);
      throw new Error(`Transaction failed: ${(error as Error).message}`);
    }
  }

  private describeWalletPositionsResponse(response: GetWalletPositionsResponse): string {
    if (!response || !response.positions || response.positions.length === 0) {
      return "No wallet positions found.";
    }

    let output = "User Positions Summary:\n";
    for (const position of response.positions) {
      if (position.lendingPosition) {
        output += "--------------------\n";
        output += `Total Liquidity (USD): ${formatNumeric(position.lendingPosition.totalLiquidityUsd)}\n`;
        output += `Total Collateral (USD): ${formatNumeric(position.lendingPosition.totalCollateralUsd)}\n`;
        output += `Total Borrows (USD): ${formatNumeric(position.lendingPosition.totalBorrowsUsd)}\n`;
        output += `Net Worth (USD): ${formatNumeric(position.lendingPosition.netWorthUsd)}\n`;
        output += `Health Factor: ${formatNumeric(position.lendingPosition.healthFactor)}\n\n`;

        const deposits = position.lendingPosition.userReserves?.filter((entry: UserReserveEntry) => parseFloat(entry.underlyingBalance) > 0) || [];
        if (deposits.length > 0) {
          output += "Deposits:\n";
          for (const entry of deposits) {
            const underlyingUSD = entry.underlyingBalanceUsd ? formatNumeric(entry.underlyingBalanceUsd) : "N/A";
            output += `- ${entry.token?.name || 'Unknown Token'}: ${formatNumeric(entry.underlyingBalance)} (USD: ${underlyingUSD})\n`;
          }
        } else {
          output += "No deposits found.\n";
        }

        const loans = position.lendingPosition.userReserves?.filter((entry: UserReserveEntry) => parseFloat(entry.totalBorrows || "0") > 0) || [];
        if (loans.length > 0) {
          output += "\nLoans:\n";
          for (const entry of loans) {
            const totalBorrowsUSD = entry.totalBorrowsUsd ? formatNumeric(entry.totalBorrowsUsd) : "N/A";
            output += `- ${entry.token?.name || 'Unknown Token'}: ${formatNumeric(entry.totalBorrows || "0")} (USD: ${totalBorrowsUSD})\n`;
          }
        } else {
          output += "\nNo loans found.\n";
        }
      } else {
        output += "Non-lending position found (details not displayed).\n";
      }
    }
    return output;
  }
}

function formatNumeric(value: string | number | undefined): string {
  if (value === undefined || value === null) return "N/A";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "N/A";
  if (Number.isInteger(num)) return num.toString();
  const fixed = num.toFixed(2);
  return parseFloat(fixed).toString();
}
