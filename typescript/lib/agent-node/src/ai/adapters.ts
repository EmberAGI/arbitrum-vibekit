import type { Message, TextPart, DataPart } from '@a2a-js/sdk';
import type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';
import type { ModelMessage, Tool, JSONSchema7 } from 'ai';
import { tool, jsonSchema } from 'ai';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';

/**
 * Type adapters for converting between A2A SDK and Vercel AI SDK types
 */

/**
 * Convert A2A Message to Vercel AI SDK ModelMessage
 */
export function a2aMessageToModelMessage(message: Message): ModelMessage {
  const role = message.role === 'user' ? 'user' : 'assistant';

  // Extract text content from parts
  let content = '';
  if ('parts' in message && Array.isArray(message.parts)) {
    const textParts = message.parts.filter((p): p is TextPart => p.kind === 'text');
    content = textParts.map((p) => p.text).join('\n');
  }

  return {
    role,
    content,
  };
}

/**
 * Convert Vercel AI SDK ModelMessage to A2A Message parts
 */
export function modelMessageToA2AParts(
  modelMessage: ModelMessage,
  contextId: string,
  messageId?: string,
): Message {
  const parts: Array<TextPart | DataPart> = [];

  // Handle text content
  if (typeof modelMessage.content === 'string') {
    parts.push({
      kind: 'text',
      text: modelMessage.content,
    } as TextPart);
  } else if (Array.isArray(modelMessage.content)) {
    // Handle array of content parts
    for (const part of modelMessage.content) {
      if (part.type === 'text') {
        parts.push({
          kind: 'text',
          text: part.text,
        } as TextPart);
      } else if (part.type === 'tool-call') {
        // Convert tool call to data part
        const toolCallPart = part as { toolName?: string; args?: unknown };
        parts.push({
          kind: 'data',
          data: {
            toolName: toolCallPart.toolName || '',
            args: toolCallPart.args || {},
          },
          metadata: {
            mimeType: 'application/json',
          },
        } as DataPart);
      }
    }
  }

  return {
    kind: 'message',
    messageId: messageId || generateMessageId(),
    contextId,
    role: modelMessage.role === 'user' ? 'user' : 'agent',
    parts,
  };
}

/**
 * Convert A2A Message history to ModelMessage array
 * Note: If passing ModelMessage[] directly, this is a passthrough
 */
export function a2aHistoryToModelMessages(history: Message[] | ModelMessage[]): ModelMessage[] {
  // If already ModelMessage array, return as-is
  if (history.length === 0) {
    return [];
  }
  const firstItem = history[0];
  if (firstItem && 'role' in firstItem) {
    return history as ModelMessage[];
  }
  // Otherwise convert from A2A Message format
  return (history as Message[]).map(a2aMessageToModelMessage);
}

/**
 * Create a tool from MCP tool metadata
 */
export function createCoreToolFromMCP(
  _name: string,
  description: string,
  inputSchema: MCPTool['inputSchema'],
  execute: (args: { [x: string]: unknown }) => Promise<unknown>,
): Tool {
  const normalized = normalizeMcpInputSchemaToJsonSchema7(inputSchema);
  return tool({
    description,
    inputSchema: jsonSchema(normalized),
    execute,
  });
}

/**
 * Convert workflow metadata to tool (schema-only, no execute)
 */
export function workflowToCoreTools(
  workflowId: string,
  description: string,
  inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>,
): Tool {
  return tool({
    description: description || `Dispatch ${workflowId} workflow`,
    inputSchema,
    // Schema-only tool - no execute function
    // Workflow dispatch is handled by StreamProcessor
  });
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return uuidv7();
}

/**
 * Extract tool calls from a ModelMessage
 */
export function extractToolCalls(
  message: ModelMessage,
): Array<{ name: string; arguments: unknown }> {
  const toolCalls: Array<{ name: string; arguments: unknown }> = [];

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        const toolCallPart = part as { toolName?: string; args?: unknown };
        toolCalls.push({
          name: toolCallPart.toolName || '',
          arguments: toolCallPart.args || {},
        });
      }
    }
  }

  return toolCalls;
}

/**
 * Normalize MCP input schema into a minimal Draft-07 compatible schema.
 * - Ensures type: 'object'
 * - Copies property keys but not inner constraints (to stay schema-agnostic)
 * - Copies required array when present and valid
 * - Adds $schema for draft-07 to make intent explicit
 */
function normalizeMcpInputSchemaToJsonSchema7(schema: MCPTool['inputSchema']): JSONSchema7 {
  const propertiesInput = (schema as { [key: string]: unknown })?.['properties'] as
    | Record<string, unknown>
    | undefined;
  const props: Record<string, JSONSchema7> = {};
  if (propertiesInput && typeof propertiesInput === 'object') {
    for (const key of Object.keys(propertiesInput)) {
      const v = (propertiesInput as { [k: string]: unknown })[key];
      // Preserve boolean schemas (valid in Draft-07) and object schemas; otherwise fallback to empty schema
      props[key] = {};
      if (typeof v === 'boolean' || (v && typeof v === 'object')) {
        props[key] = v as unknown as JSONSchema7;
      }
    }
  }

  const required = Array.isArray((schema as { [key: string]: unknown })?.['required'])
    ? ([...((schema as { [key: string]: unknown })['required'] as string[])] as string[])
    : undefined;

  const result: JSONSchema7 = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: props,
    ...(required && { required }),
  };

  return result;
}
