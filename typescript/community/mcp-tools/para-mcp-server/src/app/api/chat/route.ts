import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, convertToModelMessages } from "ai";
import { experimental_createMCPClient } from "@ai-sdk/mcp";

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
console.log("mcpUrl", mcpUrl);
    // Connect to MCP server and get tools
    let mcpTools = {};
    if (mcpUrl) {
      try {
        const client = await experimental_createMCPClient({
          transport: {
            type: "http",
            url: mcpUrl,
          },
        });

        // Get MCP tools and they will be automatically converted to AI SDK tool format
        mcpTools = await client.tools();
      } catch (mcpError) {
        console.error("MCP connection error:", mcpError);
        // Continue without MCP tools if connection fails
      }
    }

    const result = streamText({
      model,
      messages: convertToModelMessages(messages),
      tools: mcpTools,
      system: `You are a helpful assistant that can interact with MCP (Model Context Protocol) tools.
When users ask about tools or want to call tools, you can use the available MCP tools to help them.
Available MCP tools: ${Object.keys(mcpTools).join(", ") || "none"}
Be concise and helpful in your responses.`,
    });

    return result.toUIMessageStreamResponse();
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
