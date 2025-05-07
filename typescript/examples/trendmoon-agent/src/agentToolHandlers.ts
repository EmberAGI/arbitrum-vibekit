import { Client } from "@modelcontextprotocol/sdk/client/index.js";

interface ContentPart {
  type: string;
  text?: string;
}

interface ToolCallResult {
  isError: boolean;
  content?: ContentPart[];
}

export interface HandlerContext {
  mcpClient: Client;
  log: (...args: unknown[]) => Promise<void>;
}

export function parseMcpToolResponse(
  response: ToolCallResult,
  _context: HandlerContext,
  toolName: string
): unknown {
  if (response.isError) {
    throw new Error(
      `MCP tool ${toolName} failed: ${
        response.content?.[0]?.type === "text"
          ? response.content[0].text
          : "Unknown error"
      }`
    );
  }

  const textContent = response.content?.find(
    (part: ContentPart) => part.type === "text"
  );
  if (!textContent || textContent.type !== "text" || !textContent.text) {
    throw new Error(`MCP tool ${toolName} response missing text content`);
  }

  try {
    return JSON.parse(textContent.text);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from MCP tool ${toolName} response: ${
        (error as Error).message
      }`
    );
  }
}
