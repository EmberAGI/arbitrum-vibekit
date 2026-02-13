import { experimental_createMCPClient } from "@ai-sdk/mcp";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAgentUIStreamResponse, ToolLoopAgent } from "ai";

const provider = createOpenAICompatible({
  name: "openai-compatible",
  apiKey: process.env.AI_API_KEY || "",
  baseURL: process.env.AI_BASE_URL || "https://api.openrouter.ai/api/v1",
});

const model = provider.chatModel(process.env.AI_MODEL || "gpt-4o-mini");

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const mcpUrl = req.headers.get("X-MCP-URL");

    // Connect to MCP server and get tools
    let mcpTools: Record<string, unknown> = {};
    if (mcpUrl) {
      try {
        const client = await experimental_createMCPClient({
          transport: {
            type: "http",
            url: mcpUrl,
          },
        });

        // Get MCP tools and they will be automatically converted to AI SDK tool format
        const rawTools = await client.tools();
        // Wrap tools to require approval before execution
        mcpTools = Object.fromEntries(
          Object.entries(rawTools as Record<string, any>).map(
            ([name, tool]) => [name, { ...tool, needsApproval: true }],
          ),
        );
      } catch (mcpError) {
        console.error("MCP connection error:", mcpError);
        // Continue without MCP tools if connection fails
      }
    }

    // Create agent with tool approval gating.
    const agent = new ToolLoopAgent({
      model,
      tools: mcpTools as any,
      // Ensure the model does not retry denied tool executions
      instructions:
        "When a tool execution is not approved by the user, do not retry it. Just say that the tool execution was not approved.",
    });

    return createAgentUIStreamResponse({
      agent,
      messages,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
