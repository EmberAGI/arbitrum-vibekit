import { ethers } from "ethers";
import { z } from 'zod';
import {
  HandlerContext,
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
  TransactionPlan,
  TransactionPlanSchema
} from "./agentToolHandlers.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type AssistantMessage,
  type ToolCallPart,
  type TextPart,
  type ToolResultPart,
  type ToolCallUnion,
  type ToolResultUnion,
  type CoreUserMessage,
  type CoreAssistantMessage,
  type ToolSet,
  type StepResult
} from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, ".cache", "lending_capabilities.json");

// --- Zod Schemas for Vercel AI SDK Tools ---
const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z.string().describe("The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."),
  amount: z.string().describe("The amount of the token to use, as a string representation of a number."),
});
type BorrowRepaySupplyWithdrawArgs = z.infer<typeof BorrowRepaySupplyWithdrawSchema>;

const GetUserPositionsSchema = z.object({});
type GetUserPositionsArgs = z.infer<typeof GetUserPositionsSchema>;


// --- Zod Schemas for MCP Tool Responses ---

const McpCapabilityTokenSchema = z.object({
  symbol: z.string().optional(),
  chainId: z.string().optional(),
  address: z.string().optional(),
  // Add other token properties if needed based on server definition
}).passthrough(); // Allow unknown fields

const McpCapabilitySchema = z.object({
  protocol: z.string().optional(), // Example property, adjust as needed
  tokens: z.array(McpCapabilityTokenSchema).optional(),
  // Add other capability properties if needed
}).passthrough();

const McpGetCapabilitiesResponseSchema = z.object({
  // Assuming capabilities are nested under a key, adjust if necessary
  capabilities: z.object({
    LENDING: z.array(McpCapabilitySchema).optional(),
    // Other capability types like 'SWAP', 'BRIDGE' might exist
  }).optional(),
  // Add other response properties if needed
}).passthrough();
// Infer the type for static use
type McpGetCapabilitiesResponse = z.infer<typeof McpGetCapabilitiesResponseSchema>;

const McpUserReserveSchema = z.object({
  token: z.object({ symbol: z.string().optional() }).optional(),
  underlyingBalance: z.string().optional(),
  underlyingBalanceUsd: z.string().optional(),
  totalBorrows: z.string().optional(),
  totalBorrowsUsd: z.string().optional(),
  isCollateral: z.boolean().optional(),
  variableBorrowRate: z.string().optional(),
  // Add other reserve properties if needed
}).passthrough();

const McpLendingPositionSchema = z.object({
  netWorthUsd: z.string().optional(),
  healthFactor: z.string().optional(),
  totalLiquidityUsd: z.string().optional(),
  totalCollateralUsd: z.string().optional(),
  totalBorrowsUsd: z.string().optional(),
  userReserves: z.array(McpUserReserveSchema).optional(),
  // Add other lending position properties if needed
}).passthrough();

const McpPositionSchema = z.object({
  positionType: z.string().optional(), // e.g., 'LENDING'
  lendingPosition: McpLendingPositionSchema.optional(),
  // Add other position types (swap, etc.) if applicable
}).passthrough();

const McpGetWalletPositionsResponseSchema = z.object({
  positions: z.array(McpPositionSchema).optional(),
  // Add other response properties if needed
}).passthrough();
// Infer the type for static use
type McpGetWalletPositionsResponse = z.infer<typeof McpGetWalletPositionsResponseSchema>;

// --- End Zod Schemas ---


type UserReserveEntry = z.infer<typeof McpUserReserveSchema>; // Use inferred type

function logError(...args: unknown[]) {
  console.error(...args);
}

// --- Define the ToolSet Type using ReturnType/Awaited ---
// This extracts the *resolved* type from the Promise returned by the handler
type LendingToolSet = {
  borrow: Tool<typeof BorrowRepaySupplyWithdrawSchema, Awaited<ReturnType<typeof handleBorrow>>>;
  repay: Tool<typeof BorrowRepaySupplyWithdrawSchema, Awaited<ReturnType<typeof handleRepay>>>;
  supply: Tool<typeof BorrowRepaySupplyWithdrawSchema, Awaited<ReturnType<typeof handleSupply>>>;
  withdraw: Tool<typeof BorrowRepaySupplyWithdrawSchema, Awaited<ReturnType<typeof handleWithdraw>>>;
  getUserPositions: Tool<typeof GetUserPositionsSchema, Awaited<ReturnType<typeof handleGetUserPositions>>>;
};

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
  public conversationHistory: CoreMessage[] = [];
  private mcpClient: Client | null = null;
  // Use the specific LendingToolSet type again
  private toolSet: LendingToolSet | null = null;

  constructor(signer: ethers.Signer, userAddress: string) {
    this.signer = signer;
    this.userAddress = userAddress;
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY not set!");
    }
  }

  async log(...args: unknown[]) {
    console.log(...args);
  }

  // Helper to create context for handlers/execute methods
  private getHandlerContext(): HandlerContext {
     if (!this.mcpClient) {
        throw new Error("MCP Client not initialized!");
     }
     type McpGetWalletPositionsResponseType = z.infer<typeof McpGetWalletPositionsResponseSchema>;
     return {
        mcpClient: this.mcpClient,
        tokenMap: this.tokenMap,
        userAddress: this.userAddress,
        executeAction: this.executeAction.bind(this),
        log: this.log.bind(this),
        describeWalletPositionsResponse: (response: McpGetWalletPositionsResponseType): string =>
            this.describeWalletPositionsResponse(response),
     };
  }

  async init() {
    this.conversationHistory = [
      {
        role: "system",
        content: `You are an assistant that provides access to blockchain lending and borrowing functionalities via Ember SDK. Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
      },
    ];

    this.log("Initializing MCP client via stdio...");
    try {
      // Initialize MCP Client
      this.mcpClient = new Client(
        { name: 'LendingAgent', version: '1.0.0' },
        // Provide empty capabilities initially, they might be discovered later
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const transport = new StdioClientTransport({
        command: 'node',
        // Adjust path as necessary
        args: ['../../../typescript/mcp-tools/emberai-mcp/dist/index.js'],
      });

      await this.mcpClient.connect(transport);
      this.log("MCP client initialized successfully.");

      // --- Populate Available Tokens (Example using getCapabilities) ---
      // You should adapt this based on your actual MCP server capabilities
      this.log("Fetching lending capabilities from MCP...");
      const capabilitiesResponse = await this.mcpClient.callTool({ name: "getCapabilities", arguments: { type: 'LENDING' } });
      // TODO: Add validation using McpGetCapabilitiesResponseSchema
      const validationResult = McpGetCapabilitiesResponseSchema.safeParse(capabilitiesResponse);
       if (validationResult.success && validationResult.data?.capabilities?.LENDING) {
           this.tokenMap = {};
           this.availableTokens = [];
           validationResult.data.capabilities.LENDING.forEach(protocolCap => {
               protocolCap.tokens?.forEach(token => {
                   if (token.symbol && token.chainId && token.address) {
                       if (!this.tokenMap[token.symbol]) { // Avoid duplicates if multiple protocols offer the same token
                           this.tokenMap[token.symbol] = { chainId: token.chainId, address: token.address };
                           this.availableTokens.push(token.symbol);
                       }
                   }
               });
           });
            this.log("Available Tokens Loaded Internally:", this.availableTokens);
       } else {
           logError("Failed to parse capabilities or no LENDING capabilities found:", validationResult.error ?? "No LENDING data");
           // Decide how to handle this - throw error or proceed with empty/default tokens?
           // throw new Error("Failed to load lending capabilities from MCP server.");
           this.log("Warning: Could not load available tokens from MCP server.");
       }


      // --- Define the ToolSet Instance using External Handlers ---
      // The type is checked against LendingToolSet which now uses inferred types
      this.toolSet = {
        borrow: tool({
          description: "Borrow a specified amount of a token. Requires the token symbol and amount.",
          parameters: BorrowRepaySupplyWithdrawSchema,
          execute: async (args) => {
            this.log("Vercel AI SDK calling handler: handleBorrow", args);
            try { return await handleBorrow(args, this.getHandlerContext()); }
            catch (error: any) {
               logError(`Error during handleBorrow via toolSet: ${error.message}`);
               // Ensure the error return matches the expected return type (string for now)
               return `Error during borrow: ${error.message}`;
            }
          }
        }),
         repay: tool({
           description: "Repay a borrowed position for a specified token amount. Requires the token symbol and amount.",
           parameters: BorrowRepaySupplyWithdrawSchema,
           execute: async (args) => {
              this.log("Vercel AI SDK calling handler: handleRepay", args);
               try { return await handleRepay(args, this.getHandlerContext()); }
               catch (error: any) {
                  logError(`Error during handleRepay via toolSet: ${error.message}`);
                  return `Error during repay: ${error.message}`;
               }
           }
         }),
         supply: tool({
           description: "Supply (deposit) a specified amount of a token. Requires the token symbol and amount.",
           parameters: BorrowRepaySupplyWithdrawSchema,
           execute: async (args) => {
              this.log("Vercel AI SDK calling handler: handleSupply", args);
               try { return await handleSupply(args, this.getHandlerContext()); }
               catch (error: any) {
                  logError(`Error during handleSupply via toolSet: ${error.message}`);
                  return `Error during supply: ${error.message}`;
               }
           }
         }),
         withdraw: tool({
           description: "Withdraw a supplied (deposited) token amount. Requires the token symbol and amount.",
           parameters: BorrowRepaySupplyWithdrawSchema,
           execute: async (args) => {
              this.log("Vercel AI SDK calling handler: handleWithdraw", args);
              try { return await handleWithdraw(args, this.getHandlerContext()); }
              catch (error: any) {
                 logError(`Error during handleWithdraw via toolSet: ${error.message}`);
                 return `Error during withdraw: ${error.message}`;
              }
           }
         }),
         getUserPositions: tool({
           description: "Get the user's current lending/borrowing positions, balances, and health factor.",
           parameters: GetUserPositionsSchema,
           execute: async (args) => {
              this.log("Vercel AI SDK calling handler: handleGetUserPositions", args);
              try { return await handleGetUserPositions(args, this.getHandlerContext()); }
              catch (error: any) {
                 logError(`Error during handleGetUserPositions via toolSet: ${error.message}`);
                 return `Error getting positions: ${error.message}`;
              }
           }
         }),
      };

    } catch (error) {
      logError("Failed during agent initialization:", error);
      throw new Error("Agent initialization failed. Cannot proceed.");
    }

    this.log(
      "Agent initialized. Available tokens loaded internally.",
    );
  }

  async start() {
    await this.init();
    this.log("Agent started.");
  }

  async stop() {
    if (this.mcpClient) {
      this.log("Closing MCP client...");
      try {
        await this.mcpClient.close();
        this.log("MCP client closed.");
      } catch (error) {
        logError("Error closing MCP client:", error);
      }
    }
  }

  // --- Helper for validation and execution, used by execute... methods
  private async validateAndExecuteAction(
    actionName: string,
    rawTransactions: unknown,
    context: HandlerContext
  ): Promise<string> {
    const validationResult = z.array(TransactionPlanSchema).safeParse(rawTransactions);
    if (!validationResult.success) {
      const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
      context.log("Validation Error:", errorMsg, validationResult.error);
      throw new Error(errorMsg);
    }
     if (validationResult.data.length === 0) {
         context.log(`${actionName}: No transactions returned by MCP tool.`);
         return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} request processed. No on-chain transaction was necessary.`;
     }
    return await context.executeAction(actionName, validationResult.data);
  }


  // --- Main Processing Logic ---

  async processUserInput(
    userInput: string,
  ): Promise<CoreMessage> {
    if (!this.toolSet) {
        throw new Error("Agent not initialized. Call start() first.");
    }
    const userMessage: CoreUserMessage = { role: "user", content: userInput };
    this.conversationHistory.push(userMessage);

    let assistantResponseContent = "Sorry, an error occurred.";

    try {
      this.log("Calling generateText with Vercel AI SDK...");
      const { response, text, toolCalls, toolResults, finishReason } = await generateText({
        model: openrouter("google/gemini-2.0-flash-001"),
        messages: this.conversationHistory,
        tools: this.toolSet, // This is now typed against the derived LendingToolSet
        maxSteps: 10,
         // FIX: Correctly type the callback parameter using the inferred toolset type
         onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
            this.log(`Step finished. Reason: ${stepResult.finishReason}`);
            // Now you can safely access stepResult properties
            // e.g., stepResult.toolCalls, stepResult.toolResults
         }
      });
      this.log(`generateText finished. Reason: ${finishReason}`);

      assistantResponseContent = text ?? "Processing complete.";

       // FIX: Correct logging for tool calls and results
       response.messages.forEach((msg, index) => {
           if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                msg.content.forEach(part => {
                    // Check using 'tool-call' (hyphenated)
                    if (part.type === 'tool-call') {
                        this.log(`[LLM Request ${index}]: Tool Call - ${part.toolName}`);
                    }
                });
           } else if (msg.role === 'tool') {
               // Content of a tool message is an array of ToolResultPart
               if (Array.isArray(msg.content)) {
                   msg.content.forEach((toolResult: ToolResultPart) => {
                       // Log the actual result content
                       this.log(`[Tool Result ${index} for ${toolResult.toolName}]: ${JSON.stringify(toolResult.result)}`);
                   });
               }
           }
       });

      this.conversationHistory.push(...response.messages);

    } catch (error) {
       logError("Error calling Vercel AI SDK generateText:", error);
       const errorAssistantMessage: CoreAssistantMessage = { role: "assistant", content: assistantResponseContent };
       this.conversationHistory.push(errorAssistantMessage);
    }

    // FIX: Correctly find and type the final assistant message
     const finalAssistantMessage = this.conversationHistory
        .slice()
        .reverse()
        .find((msg): msg is CoreAssistantMessage & { content: string } => // Type predicate
             msg.role === 'assistant' && typeof msg.content === 'string'
        );

     const responseMessage: CoreAssistantMessage = {
         role: 'assistant',
         // No assertion needed due to the type predicate in find()
         content: finalAssistantMessage?.content ?? assistantResponseContent
     };

    this.log("[assistant]:", responseMessage.content);
    return responseMessage;
  }


  // --- Action Execution and Signing --- (Keep these as they are)

  async executeAction(
    actionName: string,
    transactions: TransactionPlan[],
  ): Promise<string> {
     if (!transactions || transactions.length === 0) {
       this.log(`${actionName}: No transactions required.`);
       return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)}: No on-chain transactions required.`;
     }
     try {
       this.log(`Executing ${transactions.length} transaction(s) for ${actionName}...`);
       const txHashes: string[] = [];
       for (const transaction of transactions) {
         if (!transaction.to || !transaction.data) {
             throw new Error(`Invalid transaction object for ${actionName}: missing 'to' or 'data'.`);
         }
         const txHash = await this.signAndSendTransaction(transaction);
         this.log(`${actionName} transaction sent: ${txHash}`);
         txHashes.push(txHash);
       }
       return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} successful! Transaction hash(es): ${txHashes.join(', ')}`;
     } catch (error: unknown) {
       const err = error as Error;
       logError(`Error executing ${actionName} action:`, err.message);
       return `Error executing ${actionName}: ${err.message}`;
     }
   }


  async signAndSendTransaction(tx: TransactionPlan): Promise<string> {
    const provider = this.signer.provider;
    if (!provider) throw new Error("Signer is not connected to a provider.");

    if (!tx.to || !tx.data) {
        logError("Transaction object missing 'to' or 'data' field:", tx);
        throw new Error("Transaction object is missing required fields ('to', 'data').");
    }

    const ethersTx: ethers.providers.TransactionRequest = {
      to: tx.to,
      value: ethers.BigNumber.from(tx.value || "0"),
      data: tx.data,
      from: this.userAddress,
    };

    try {
      const dataPrefix = tx.data ? ethers.utils.hexlify(tx.data).substring(0, 10) : '0x';
      this.log(`Sending transaction to ${ethersTx.to} from ${ethersTx.from} with data ${dataPrefix}...`);

      const txResponse = await this.signer.sendTransaction(ethersTx);
      this.log(`Transaction submitted: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);
      this.log(`Transaction confirmed in block ${receipt.blockNumber} (Status: ${receipt.status === 1 ? 'Success' : 'Failed'}): ${txResponse.hash}`);
       if (receipt.status === 0) {
            throw new Error(`Transaction ${txResponse.hash} failed (reverted). Check blockchain explorer for details.`);
        }
      return txResponse.hash;
    } catch(error) {
      const errMsg = (error as any)?.reason || (error as Error).message;
      const errCode = (error as any)?.code;
      // Attempt to extract revert reason if available (ethers v5 specific)
      let revertReason = errMsg;
      if ( (error as any).error?.message?.includes('reverted with reason string')) {
          try {
             const reasonHex = (error as any).error.message.split('reverted with reason string \'')[1].split('\'')[0];
              if (ethers.utils.isHexString(reasonHex)) {
                  revertReason = ethers.utils.toUtf8String(reasonHex);
              }
          } catch (decodeError) {
             // Ignore decode error, stick with original message
          }
      }

      logError(`Send transaction failed: ${errCode ? `Code: ${errCode}, ` : ''}Reason: ${revertReason}`, error);
      // Provide a clearer error message
      throw new Error(`Transaction failed: ${revertReason}`);
    }
  }

   // --- Position Description --- (Keep as is, ensure type matches Zod schema)
   private describeWalletPositionsResponse(response: McpGetWalletPositionsResponse): string {
     if (!response || !response.positions || response.positions.length === 0) {
       return "You currently have no active lending or borrowing positions.";
     }

     let output = "Your current positions:\n";
     for (const position of response.positions) {
       if (position.positionType === 'LENDING' && position.lendingPosition) { // Check lendingPosition exists
         output += "--------------------\n";
         const lp = position.lendingPosition; // Alias for brevity
         const format = (val: string | undefined) => formatNumeric(val ?? '0');
         const formatFactor = (val: string | undefined) => formatNumeric(val, 4); // More precision for HF

         output += `Net Worth: $${format(lp.netWorthUsd)}\n`;
         output += `Health Factor: ${formatFactor(lp.healthFactor)}\n`;
         output += `Total Supplied (Incl. Collateral): $${format(lp.totalLiquidityUsd)}\n`; // Clarify total liquidity
         output += `Total Collateral Value: $${format(lp.totalCollateralUsd)}\n`;
         output += `Total Borrows: $${format(lp.totalBorrowsUsd)}\n\n`;

         const deposits = lp.userReserves?.filter((entry: UserReserveEntry) => parseFloat(entry.underlyingBalance ?? '0') > 1e-6) || [];
         if (deposits.length > 0) {
           output += "Supplied Assets (includes collateral):\n";
           for (const entry of deposits) {
             const underlyingUSD = entry.underlyingBalanceUsd ? `$${formatNumeric(entry.underlyingBalanceUsd)}` : "N/A";
             output += `- ${entry.token?.symbol || 'Unknown'}: ${formatNumeric(entry.underlyingBalance)} (${underlyingUSD})${entry.isCollateral ? ' (Collateral)' : ''}\n`;
           }
         }

         const loans = lp.userReserves?.filter((entry: UserReserveEntry) => parseFloat(entry.totalBorrows ?? "0") > 1e-6) || [];
         if (loans.length > 0) {
           output += "\nBorrowed Assets:\n";
           for (const entry of loans) {
             const totalBorrowsUSD = entry.totalBorrowsUsd ? `$${formatNumeric(entry.totalBorrowsUsd)}` : "N/A";
             // Ensure borrowRate is parsed as float before multiplying
             const apr = entry.variableBorrowRate ? parseFloat(entry.variableBorrowRate) * 100 : NaN;
             const borrowRate = !isNaN(apr) ? `${formatNumeric(apr)}% APR` : '';
             output += `- ${entry.token?.symbol || 'Unknown'}: ${formatNumeric(entry.totalBorrows || "0")} (${totalBorrowsUSD}) ${borrowRate}\n`;
           }
         }
         output += "--------------------\n"; // Separator after each lending position
       } else {
          // Handle or log other position types if necessary
          if (position.positionType !== 'LENDING') {
             this.log(`Skipping non-LENDING position type: ${position.positionType}`);
          }
       }
     }
     return output.trim();
   }

}

// --- Formatting Helper --- (Keep as is)
function formatNumeric(value: string | number | undefined, minDecimals = 2, maxDecimals = 2): string {
   if (value === undefined || value === null) return "N/A";
   let num: number;
   if (typeof value === 'string') {
     try {
       num = parseFloat(value);
     } catch (e) {
       return "N/A"; // Or return original string?
     }
   } else {
     num = value;
   }

   if (isNaN(num)) return "N/A"; // Or return original string?

    try {
     // Use 'en-US' locale for consistent formatting if needed, or undefined for system default
     return num.toLocaleString('en-US', {
       minimumFractionDigits: minDecimals,
       maximumFractionDigits: maxDecimals,
     });
   } catch (e) {
      // Fallback for environments without full Intl support
      return num.toFixed(maxDecimals);
   }
}
// --- TODOs / Notes ---
// - Ensure agentToolHandlers.ts is updated or its logic is fully moved here.
// - Define/Import TransactionPlanSchema and TransactionPlan type.
// - Implement robust error handling within execute...Tool methods to return meaningful errors to the LLM.
// - Verify the actual structure of your MCP server's getCapabilities response and adjust parsing.
// - Consider adding more specific error handling for transaction reverts (e.g., parsing revert reasons).
// - Make sure the path to the MCP server executable is correct.


