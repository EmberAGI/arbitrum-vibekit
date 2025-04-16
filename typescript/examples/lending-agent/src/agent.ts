import readline from "readline";
import { ethers } from "ethers";
import { z } from "zod";
import {
  HandlerContext,
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
} from "./agentToolHandlers.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateText,
  tool,
  type CoreTool,
  type CoreMessage,
  type AssistantMessage,
  type ToolCallPart,
  type TextPart,
  type ToolResultPart,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(
  __dirname,
  ".cache",
  "lending_capabilities.json"
);

// --- Zod Schemas for MCP Tool Responses ---

const McpCapabilityTokenSchema = z
  .object({
    symbol: z.string().optional(),
    chainId: z.string().optional(),
    address: z.string().optional(),
    // These fields are seen in the actual response
    name: z.string().optional(),
    decimals: z.number().optional(),
    isNative: z.boolean().optional(),
    iconUri: z.string().optional(),
    isVetted: z.boolean().optional(),
    tokenUid: z
      .object({
        chainId: z.string().optional(),
        address: z.string().optional(),
      })
      .optional(),
  })
  .passthrough(); // Allow unknown fields

// Infer the type for static use
type McpCapabilityToken = z.infer<typeof McpCapabilityTokenSchema>;

// Represents the structure inside the "lendingCapability" key
const McpLendingCapabilityDetailSchema = z
  .object({
    capabilityId: z.string().optional(),
    underlyingToken: McpCapabilityTokenSchema.optional(), // Token is directly here
    // Add other fields like currentSupplyApy, maxLtv etc. if needed for validation
  })
  .passthrough();

// Represents one entry in the top-level capabilities array, e.g., { lendingCapability: ... }
const McpSingleCapabilityEntrySchema = z
  .object({
    lendingCapability: McpLendingCapabilityDetailSchema.optional(),
    swapCapability: z.any().optional(), // Keep swap optional if mixed capabilities are possible
  })
  .passthrough(); // Allow other keys like swapCapability

type McpCapability = z.infer<typeof McpSingleCapabilityEntrySchema>; // Rename for consistency maybe?

// Updated: capabilities is an array of McpSingleCapabilityEntrySchema
const McpGetCapabilitiesResponseSchema = z
  .object({
    capabilities: z.array(McpSingleCapabilityEntrySchema),
  })
  .passthrough();
// Infer the type for static use
type McpGetCapabilitiesResponse = z.infer<
  typeof McpGetCapabilitiesResponseSchema
>;

const McpUserReserveSchema = z
  .object({
    token: z.object({ symbol: z.string().optional() }).optional(),
    underlyingBalance: z.string().optional(),
    underlyingBalanceUsd: z.string().optional(),
    totalBorrows: z.string().optional(),
    totalBorrowsUsd: z.string().optional(),
    isCollateral: z.boolean().optional(),
    variableBorrowRate: z.string().optional(),
    // Add other reserve properties if needed
  })
  .passthrough();

const McpLendingPositionSchema = z
  .object({
    netWorthUsd: z.string().optional(),
    healthFactor: z.string().optional(),
    totalLiquidityUsd: z.string().optional(),
    totalCollateralUsd: z.string().optional(),
    totalBorrowsUsd: z.string().optional(),
    userReserves: z.array(McpUserReserveSchema).optional(),
    // Add other lending position properties if needed
  })
  .passthrough();

const McpPositionSchema = z
  .object({
    positionType: z.string().optional(), // e.g., 'LENDING'
    lendingPosition: McpLendingPositionSchema.optional(),
    // Add other position types (swap, etc.) if applicable
  })
  .passthrough();

const McpGetWalletPositionsResponseSchema = z
  .object({
    positions: z.array(McpPositionSchema).optional(),
    // Add other response properties if needed
  })
  .passthrough();
// Infer the type for static use
type McpGetWalletPositionsResponse = z.infer<
  typeof McpGetWalletPositionsResponseSchema
>;

// --- End Zod Schemas ---

type UserReserveEntry = z.infer<typeof McpUserReserveSchema>; // Use inferred type

function logError(...args: unknown[]) {
  console.error(...args);
}

const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z
    .string()
    .describe(
      "The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."
    ),
  amount: z
    .string()
    .describe(
      "The amount of the token to use, as a string representation of a number."
    ),
});

const GetUserPositionsSchema = z.object({});

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
  private mcpClient: any = null;
  private rl: readline.Interface | null = null;
  private llmTools: Record<string, CoreTool> = {};

  constructor(signer: ethers.Signer, userAddress: string) {
    this.signer = signer;
    this.userAddress = userAddress;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not set!");
    }
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.llmTools = {
      borrow: tool({
        description:
          "Borrow a specified amount of a token. Requires the token symbol and amount.",
        parameters: BorrowRepaySupplyWithdrawSchema,
      }),
      repay: tool({
        description:
          "Repay a borrowed position for a specified token amount. Requires the token symbol and amount.",
        parameters: BorrowRepaySupplyWithdrawSchema,
      }),
      supply: tool({
        description:
          "Supply (deposit) a specified amount of a token. Requires the token symbol and amount.",
        parameters: BorrowRepaySupplyWithdrawSchema,
      }),
      withdraw: tool({
        description:
          "Withdraw a supplied (deposited) token amount. Requires the token symbol and amount.",
        parameters: BorrowRepaySupplyWithdrawSchema,
      }),
      getUserPositions: tool({
        description:
          "Get the user's current lending/borrowing positions, balances, and health factor.",
        parameters: GetUserPositionsSchema,
      }),
    };
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

    let lendingCapabilities: McpGetCapabilitiesResponse | undefined;
    const useCache = process.env.AGENT_DEBUG === "true";

    // Initialize MCP client first
    this.log("Initializing MCP client via stdio...");
    try {
      // Create MCP Client
      this.mcpClient = new Client(
        { name: "LendingAgent", version: "1.0.0" },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      // Create StdioClientTransport
      const transport = new StdioClientTransport({
        command: "node",
        args: ["mcp-tools/emberai-mcp/dist/index.js"],
        env: {
          ...process.env,
          RPC_URL: process.env.RPC_URL,
        },
      });

      // Connect to the server
      await this.mcpClient.connect(transport);
      this.log("MCP client initialized successfully.");
    } catch (error) {
      logError("Failed to initialize MCP client:", error);
      throw new Error("MCP client initialization failed. Cannot proceed.");
    }

    if (useCache) {
      try {
        await fs.access(CACHE_FILE_PATH);
        this.log("Loading lending capabilities from cache...");
        const cachedData = await fs.readFile(CACHE_FILE_PATH, "utf-8");
        const parsedJson = JSON.parse(cachedData);
        const validationResult =
          McpGetCapabilitiesResponseSchema.safeParse(parsedJson);
        if (validationResult.success) {
          lendingCapabilities = validationResult.data;
          this.log("Cached capabilities loaded and validated successfully.");
        } else {
          logError(
            "Cached capabilities validation failed:",
            validationResult.error
          );
          this.log("Proceeding to fetch fresh capabilities...");
          // Fall through to fetch fresh capabilities
        }
      } catch (error) {
        this.log(
          "Cache not found or invalid, fetching capabilities via MCP..."
        );
        // Fall through to fetch fresh capabilities
      }
    }

    // Fetch if cache was not used, invalid, or validation failed
    if (!lendingCapabilities) {
      this.log("Fetching capabilities via MCP...");
      lendingCapabilities = await this.fetchAndCacheCapabilities();
    }

    // Filter out SWAP capabilities before logging
    const capabilitiesToLog = { ...lendingCapabilities }; // Shallow copy
    if (capabilitiesToLog.capabilities) {
      // Create a copy of the inner capabilities object
      const filteredInnerCapabilities = { ...capabilitiesToLog.capabilities };
      // Delete the SWAP key if it exists (adjust key name if different)
      delete (filteredInnerCapabilities as any).SWAP; // Use 'as any' or a more specific type if SWAP key is known
      capabilitiesToLog.capabilities = filteredInnerCapabilities;
    }
    console.log("[init] Filtered Capabilities:", capabilitiesToLog); // Log the filtered object

    // Add inspection of actual structure
    console.log("[Debug] Capabilities root structure:", {
      type: typeof lendingCapabilities,
      hasCapabilitiesField: !!lendingCapabilities?.capabilities,
      isCapabilitiesArray:
        lendingCapabilities && Array.isArray(lendingCapabilities.capabilities),
      isCapabilitiesObject:
        lendingCapabilities &&
        typeof lendingCapabilities.capabilities === "object" &&
        !Array.isArray(lendingCapabilities.capabilities),
      rootKeys: lendingCapabilities ? Object.keys(lendingCapabilities) : [],
      capabilitiesKeys: lendingCapabilities?.capabilities
        ? Object.keys(lendingCapabilities.capabilities)
        : [],
    });

    // Process capabilities based on validated structure
    if (lendingCapabilities?.capabilities) {
      const capabilitiesData = lendingCapabilities.capabilities;

      // Type Guard: Check if it's the array structure (validated by schema)
      if (Array.isArray(capabilitiesData)) {
        console.log("[Debug] Processing capabilities as ARRAY structure...");
        capabilitiesData.forEach(
          // Use the inferred McpCapability type from schema
          (capabilityEntry: McpCapability, index: number) => {
            // Focus on the lendingCapability object within the entry
            if (capabilityEntry.lendingCapability) {
              const lendingDetail = capabilityEntry.lendingCapability;

              // Log the first lending capability structure for confirmation
              if (
                index === 0 ||
                (!capabilityEntry.swapCapability && index === 1)
              ) {
                // Log first lending one
                console.log(
                  `[Debug] First lendingCapability detail structure:`,
                  JSON.stringify(lendingDetail, null, 2).substring(0, 500) +
                    "... (truncated)"
                );
              }

              // Process the single token from this capability
              this.processTokenFromLendingCapability(lendingDetail);
            } else if (capabilityEntry.swapCapability) {
              // This entry is for swapping, skip processing tokens here
              console.log(`[Debug] Skipping swapCapability entry #${index}`);
            } else {
              // Log if an entry has neither expected key
              console.log(
                `[Debug] Capability entry #${index} has neither lendingCapability nor swapCapability:`,
                Object.keys(capabilityEntry)
              );
            }
          }
        );
      }
      // The object structure { LENDING: ... } is removed based on logs and new schema
      // else if (typeof capabilitiesData === 'object' && capabilitiesData.LENDING) { ... }
      else {
        // Should not happen if validation passed with the array schema
        console.log(
          "[Debug] Capabilities structure is not an array after validation."
        );
        logError(
          "Error: Lending capabilities structure is invalid after validation (expected array)."
        );
      }
    } else {
      // Handle case where capabilities are missing entirely
      console.log("[Debug] No capabilities found in the response.");
      logError("Error: Lending capabilities structure is invalid or missing.");
    }

    this.log("Available tokens processed:", this.availableTokens);
    if (this.availableTokens.length === 0) {
      this.log(
        "Warning: No tokens were extracted from capabilities. Token map might be empty."
      );
    }
  }

  // Updated helper function to process the single token from a lending capability detail
  private processTokenFromLendingCapability(lendingDetail: any): void {
    // Use McpLendingCapabilityDetail inferred type ideally
    const token = lendingDetail?.underlyingToken as
      | McpCapabilityToken
      | undefined;
    const capabilityId = lendingDetail?.capabilityId || "Unknown";

    if (!token) {
      console.log(
        `[Debug processToken] No underlyingToken found for capabilityId: ${capabilityId}`
      );
      return;
    }

    let symbol: string | undefined;
    let chainId: string | undefined;
    let address: string | undefined;

    // Format 1: Direct properties (should not happen based on logs, but keep for robustness)
    if (token.symbol && token.chainId && token.address) {
      symbol = token.symbol;
      chainId = token.chainId;
      address = token.address;
      console.log(
        `[Debug processToken] Processing token using direct properties for symbol: ${symbol}`
      );
    }
    // Format 2: Nested tokenUid (matches logs)
    else if (
      token.symbol &&
      token.tokenUid?.chainId &&
      token.tokenUid?.address
    ) {
      symbol = token.symbol;
      chainId = token.tokenUid.chainId;
      address = token.tokenUid.address;
      // console.log(`[Debug processToken] Processing token using tokenUid for symbol: ${symbol}`); // Less verbose
    }

    // Check for empty symbols from log data
    if (!symbol) {
      console.log(
        `[Debug processToken] Skipping token with empty/missing symbol for capabilityId: ${capabilityId}`,
        token
      );
      return;
    }

    if (chainId && address) {
      const upperSymbol = symbol.toUpperCase();
      // Store the first encountered address/chain for a symbol
      if (!this.tokenMap[upperSymbol]) {
        this.tokenMap[upperSymbol] = { chainId, address };
      }
      if (!this.availableTokens.includes(upperSymbol)) {
        this.availableTokens.push(upperSymbol);
      }
    } else {
      console.log(
        `[Debug processToken] Skipping token with missing chainId/address for symbol ${symbol}:`,
        { capabilityId, chainId, address }
      );
    }
  }

  async start() {
    await this.init();
    this.log("Agent started. Type your message below.");
    this.promptUser();
  }

  async stop() {
    this.rl?.close();
    this.rl = null;
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

  async processUserInput(userInput: string): Promise<CoreMessage | null> {
    this.conversationHistory.push({ role: "user", content: userInput });
    const { nextMessages, finalAssistantMessage } =
      await this.callLLMAndHandleTools();
    this.conversationHistory = nextMessages;

    if (finalAssistantMessage?.content) {
      this.log("[assistant]:", finalAssistantMessage.content);
    }
    return finalAssistantMessage ?? null;
  }

  private async callLLMAndHandleTools(maxToolRoundtrips = 5): Promise<{
    nextMessages: CoreMessage[];
    finalAssistantMessage: CoreMessage | null;
  }> {
    let currentMessages = [...this.conversationHistory];
    let finalAssistantMessage: CoreMessage | null = null;

    for (let i = 0; i < maxToolRoundtrips; i++) {
      try {
        const { text, toolCalls, finishReason, usage, warnings } =
          await generateText({
            model: openai("gpt-4o"),
            messages: currentMessages,
            tools: this.llmTools,
          });

        // Construct AssistantMessage structure
        const assistantMessageContent: Array<TextPart | ToolCallPart> = [];
        if (text) {
          assistantMessageContent.push({ type: "text", text }); // Standard TextPart
        }
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((tc) => {
            assistantMessageContent.push({
              type: "tool-call",
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
            });
          });
        }

        // Use CoreMessage type, ensure structure matches Assistant role
        const assistantMessage: CoreMessage = {
          role: "assistant",
          content: assistantMessageContent,
        };
        currentMessages.push(assistantMessage);

        if (toolCalls && toolCalls.length > 0) {
          // Collect results as ToolResultPart objects
          const toolResultsParts: ToolResultPart[] = [];
          for (const toolCall of toolCalls) {
            this.log(
              `Attempting tool call: ${toolCall.toolName} with id ${toolCall.toolCallId}`
            );
            let result: any;
            let isError = false;
            // let followUpNeeded = false; // Seems unused

            try {
              const { content: toolContent /*, followUp: handlerFollowUp*/ } =
                await this.dispatchToolCall(
                  toolCall.toolName,
                  toolCall.args as Record<string, unknown>
                );
              result = toolContent;
              // followUpNeeded = handlerFollowUp;
              this.log(
                `Tool ${toolCall.toolName} (id: ${toolCall.toolCallId}) executed successfully.`
              );
            } catch (error) {
              logError(
                `Error executing tool ${toolCall.toolName} (id: ${toolCall.toolCallId}):`,
                error
              );
              result = `Error executing tool ${toolCall.toolName}: ${
                (error as Error).message
              }`;
              isError = true;
            }

            // Add toolName to satisfy ToolResultPart
            toolResultsParts.push({
              type: "tool-result",
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName, // Added toolName
              result,
              isError, // Assuming isError is part of ToolResultPart or handled appropriately
            });
          }

          // Construct Tool message using CoreMessage type
          const toolResponseMessage: CoreMessage = {
            role: "tool",
            content: toolResultsParts,
          };
          currentMessages.push(toolResponseMessage);
        } else {
          // If no tool calls, the assistant message is final
          finalAssistantMessage = assistantMessage;
          return { nextMessages: currentMessages, finalAssistantMessage };
        }
      } catch (error) {
        logError("Error calling Vercel AI SDK generateText:", error);
        const errorMessage: CoreMessage = {
          role: "assistant",
          content: "Sorry, an error occurred while processing your request.",
        };
        currentMessages.push(errorMessage);
        finalAssistantMessage = errorMessage;
        return { nextMessages: currentMessages, finalAssistantMessage };
      }
    }

    logError(`Max tool roundtrips (${maxToolRoundtrips}) reached.`);
    const maxRoundtripMessage: CoreMessage = {
      role: "assistant",
      content:
        "Processing your request involved multiple steps and reached the maximum limit. Please try rephrasing if the action wasn't completed.",
    };
    currentMessages.push(maxRoundtripMessage);
    finalAssistantMessage = maxRoundtripMessage;
    return { nextMessages: currentMessages, finalAssistantMessage };
  }

  async dispatchToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: string; followUp: boolean }> {
    this.log("Dispatching tool call (Vercel AI SDK):", toolName, args);

    if (!this.mcpClient) {
      throw new Error(
        "MCP Client not initialized, cannot dispatch tool calls requiring it."
      );
    }

    const context: HandlerContext = {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      executeAction: this.executeAction.bind(this),
      log: this.log.bind(this),
      // Pass the method directly, using the Zod inferred type
      describeWalletPositionsResponse: (response) =>
        this.describeWalletPositionsResponse(
          response as McpGetWalletPositionsResponse
        ),
    };

    const withFollowUp = async (handlerPromise: Promise<string>) => ({
      content: await handlerPromise,
      followUp: true,
    });
    const verbatim = async (handlerPromise: Promise<string>) => ({
      content: await handlerPromise,
      followUp: false,
    });

    try {
      switch (toolName) {
        case "borrow":
          return withFollowUp(
            handleBorrow(args as { tokenName: string; amount: string }, context)
          );
        case "repay":
          return withFollowUp(
            handleRepay(args as { tokenName: string; amount: string }, context)
          );
        case "supply":
          return withFollowUp(
            handleSupply(args as { tokenName: string; amount: string }, context)
          );
        case "withdraw":
          return withFollowUp(
            handleWithdraw(
              args as { tokenName: string; amount: string },
              context
            )
          );
        case "getUserPositions":
          const description = await handleGetUserPositions(args, context);
          return verbatim(Promise.resolve(description));
        default:
          this.log(`Warning: Unknown tool call requested by LLM: ${toolName}`);
          throw new Error(`Unknown tool requested: ${toolName}`);
      }
    } catch (error) {
      this.log(`Error executing handler for ${toolName}:`, error);
      throw error;
    }
  }

  async executeAction(
    actionName: string,
    transactions: any[] // TODO: Validate this with TransactionPlanSchema from handlers?
  ): Promise<string> {
    // Add validation using TransactionPlanSchema if imported/defined here
    // const validation = z.array(TransactionPlanSchema).safeParse(transactions);
    // if (!validation.success) { ... handle error ... }

    if (!transactions || transactions.length === 0) {
      this.log(`${actionName}: No transactions required.`);
      return `${actionName}: No transactions required.`;
    }
    try {
      this.log(
        `Executing ${transactions.length} transaction(s) for ${actionName}...`
      );
      const txHashes: string[] = [];
      for (const transaction of transactions) {
        const txHash = await this.signAndSendTransaction(transaction);
        this.log(`${actionName} transaction sent: ${txHash}`);
        txHashes.push(txHash);
      }
      return `${actionName}: success! Transaction hash(es): ${txHashes.join(
        ", "
      )}`;
    } catch (error: unknown) {
      const err = error as Error;
      logError(`Error executing ${actionName} action:`, err.message);
      throw new Error(`Error executing ${actionName}: ${err.message}`);
    }
  }

  async signAndSendTransaction(tx: any): Promise<string> {
    const provider = this.signer.provider;
    if (!provider) throw new Error("Signer is not connected to a provider.");

    if (!tx.to || !tx.data) {
      logError("Transaction object missing 'to' or 'data' field:", tx);
      throw new Error(
        "Transaction object is missing required fields ('to', 'data')."
      );
    }

    const ethersTx: ethers.providers.TransactionRequest = {
      to: tx.to,
      value: ethers.BigNumber.from(tx.value || "0"),
      data: tx.data,
      from: this.userAddress,
    };

    try {
      const dataPrefix = tx.data
        ? ethers.utils.hexlify(tx.data).substring(0, 10)
        : "0x";
      this.log(
        `Sending transaction to ${ethersTx.to} from ${ethersTx.from} with data ${dataPrefix}...`
      );

      const txResponse = await this.signer.sendTransaction(ethersTx);
      this.log(
        `Transaction submitted: ${txResponse.hash}. Waiting for confirmation...`
      );
      const receipt = await txResponse.wait(1);
      this.log(
        `Transaction confirmed in block ${receipt.blockNumber} (Status: ${
          receipt.status === 1 ? "Success" : "Failed"
        }): ${txResponse.hash}`
      );
      if (receipt.status === 0) {
        throw new Error(`Transaction ${txResponse.hash} failed (reverted).`);
      }
      return txResponse.hash;
    } catch (error) {
      const errMsg = (error as any)?.reason || (error as Error).message;
      const errCode = (error as any)?.code;
      logError(
        `Send transaction failed: ${
          errCode ? `Code: ${errCode}, ` : ""
        }Reason: ${errMsg}`,
        error
      );
      throw new Error(`Transaction failed: ${errMsg}`);
    }
  }

  // Use the Zod inferred type for the response parameter
  private describeWalletPositionsResponse(
    response: McpGetWalletPositionsResponse
  ): string {
    if (!response || !response.positions || response.positions.length === 0) {
      return "You currently have no active lending or borrowing positions.";
    }

    let output = "Your current positions:\n";
    for (const position of response.positions) {
      // Use inferred type
      if (
        position.positionType === "LENDING" &&
        position.lendingPosition &&
        position.lendingPosition.userReserves
      ) {
        output += "--------------------\n";
        const format = (val: string | undefined) => formatNumeric(val ?? "0");
        const formatFactor = (val: string | undefined) => formatNumeric(val, 4);

        output += `Net Worth: $${format(
          position.lendingPosition.netWorthUsd
        )}\n`;
        output += `Health Factor: ${formatFactor(
          position.lendingPosition.healthFactor
        )}\n`;
        output += `Total Supplied: $${format(
          position.lendingPosition.totalLiquidityUsd
        )}\n`;
        output += `Total Collateral: $${format(
          position.lendingPosition.totalCollateralUsd
        )}\n`;
        output += `Total Borrows: $${format(
          position.lendingPosition.totalBorrowsUsd
        )}\n\n`;

        const deposits =
          position.lendingPosition.userReserves?.filter(
            (entry: UserReserveEntry) =>
              parseFloat(entry.underlyingBalance ?? "0") > 1e-6
          ) || [];
        if (deposits.length > 0) {
          output += "Supplied Assets:\n";
          for (const entry of deposits) {
            const underlyingUSD = entry.underlyingBalanceUsd
              ? `$${formatNumeric(entry.underlyingBalanceUsd)}`
              : "N/A";
            output += `- ${entry.token?.symbol || "Unknown"}: ${formatNumeric(
              entry.underlyingBalance
            )} (${underlyingUSD})${
              entry.isCollateral ? " (Collateral)" : ""
            }\n`;
          }
        }

        const loans =
          position.lendingPosition.userReserves?.filter(
            (entry: UserReserveEntry) =>
              parseFloat(entry.totalBorrows ?? "0") > 1e-6
          ) || [];
        if (loans.length > 0) {
          output += "\nBorrowed Assets:\n";
          for (const entry of loans) {
            const totalBorrowsUSD = entry.totalBorrowsUsd
              ? `$${formatNumeric(entry.totalBorrowsUsd)}`
              : "N/A";
            const borrowRate = entry.variableBorrowRate
              ? `${formatNumeric(
                  parseFloat(entry.variableBorrowRate) * 100
                )}% APR`
              : "";
            output += `- ${entry.token?.symbol || "Unknown"}: ${formatNumeric(
              entry.totalBorrows || "0"
            )} (${totalBorrowsUSD}) ${borrowRate}\n`;
          }
        }
      } else {
        // Handle or log other position types if necessary
      }
    }
    return output.trim();
  }

  // Return the Zod inferred type
  private async fetchAndCacheCapabilities(): Promise<McpGetCapabilitiesResponse> {
    this.log("Fetching lending and borrowing capabilities via MCP...");
    if (!this.mcpClient) {
      throw new Error("MCP Client not initialized. Cannot fetch capabilities.");
    }

    try {
      const capabilitiesResult = await this.mcpClient.callTool({
        name: "getCapabilities",
        arguments: { type: "LENDING", name: "getCapabilities" },
      });

      // Check if response might be a string that needs parsing
      let dataToValidate = capabilitiesResult;
      if (typeof capabilitiesResult === "string") {
        try {
          this.log(
            "Capabilities result is a string, attempting to parse as JSON..."
          );
          dataToValidate = JSON.parse(capabilitiesResult);
        } catch (parseError) {
          logError("Failed to parse capabilities string as JSON:", parseError);
          // Continue with the string value, validation will fail appropriately
        }
      } else if (
        capabilitiesResult?.content &&
        Array.isArray(capabilitiesResult.content)
      ) {
        // Check for content array property (seen in logs)
        this.log("Found content array in capabilities result");
        for (const item of capabilitiesResult.content) {
          if (item.type === "text" && item.text) {
            try {
              this.log("Found text content, attempting to parse as JSON...");
              dataToValidate = JSON.parse(item.text);
              break;
            } catch (parseError) {
              logError("Failed to parse text content as JSON:", parseError);
            }
          }
        }
      }

      // Log the structure before validation
      console.log("Capabilities structure before validation:", {
        type: typeof dataToValidate,
        isObject: typeof dataToValidate === "object",
        hasCapabilities: !!dataToValidate?.capabilities,
        keys: dataToValidate ? Object.keys(dataToValidate) : [],
      });

      // Validate the raw result from MCP client
      const validationResult =
        McpGetCapabilitiesResponseSchema.safeParse(dataToValidate);

      if (!validationResult.success) {
        logError(
          "Fetched capabilities validation failed:",
          validationResult.error
        );
        // Decide how to handle this - throw, or return default/empty?
        throw new Error(
          `Fetched capabilities failed validation: ${validationResult.error.message}`
        );
      }

      const capabilities = validationResult.data; // Use validated data

      // Cache the validated data
      try {
        await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
        // Store the validated data, not the raw result
        await fs.writeFile(
          CACHE_FILE_PATH,
          JSON.stringify(capabilities, null, 2),
          "utf-8"
        );
        this.log("Capabilities cached successfully.");
      } catch (cacheError) {
        logError("Failed to cache capabilities:", cacheError);
      }

      return capabilities;
    } catch (error) {
      logError("Error fetching or validating capabilities via MCP:", error);
      throw new Error(
        `Failed to fetch/validate capabilities from MCP server: ${
          (error as Error).message
        }`
      );
    }
  }
} // End of Agent class

function formatNumeric(
  value: string | number | undefined,
  minDecimals = 2,
  maxDecimals = 2
): string {
  if (value === undefined || value === null) return "N/A";
  let num: number;
  if (typeof value === "string") {
    try {
      num = parseFloat(value);
    } catch (e) {
      return "N/A";
    }
  } else {
    num = value;
  }

  if (isNaN(num)) return "N/A";

  try {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });
  } catch (e) {
    return num.toFixed(maxDecimals);
  }
}

// Remember to update agentToolHandlers.ts:
// 1. Define TransactionPlanSchema.
// 2. Update HandlerContext for executeAction and describeWalletPositionsResponse.
// 3. Validate MCP results (getUserPositions, borrow, repay, etc.) with schemas.
