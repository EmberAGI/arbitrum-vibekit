import { z } from 'zod';

import { Logger } from '../utils/logger.js';

// Part types for messages
export const TextPartSchema = z.object({
  kind: z.literal('text'),
  text: z.string(),
});

export const DataPartSchema = z.object({
  kind: z.literal('data'),
  data: z.record(z.string(), z.unknown()),
  metadata: z
    .object({
      mimeType: z.string().optional(),
    })
    .optional(),
});

export const PartSchema = z.union([TextPartSchema, DataPartSchema]);

// Message schema
export const MessageSchema = z.object({
  kind: z.literal('message'),
  messageId: z.string(),
  contextId: z.string(),
  role: z.union([z.literal('user'), z.literal('agent'), z.literal('assistant')]),
  parts: z.array(PartSchema),
});

// Task status types - matches SDK TaskState
export const TaskStatusSchema = z.object({
  state: z.union([
    z.literal('submitted'),
    z.literal('working'),
    z.literal('input-required'),
    z.literal('auth-required'),
    z.literal('completed'),
    z.literal('failed'),
    z.literal('canceled'),
    z.literal('rejected'),
    z.literal('unknown'),
  ]),
  message: MessageSchema.optional(),
});

// Task schema
export const TaskSchema = z.object({
  kind: z.literal('task'),
  id: z.string(),
  contextId: z.string(),
  status: TaskStatusSchema,
});

// Status update event schema
export const TaskStatusUpdateEventSchema = z.object({
  kind: z.literal('status-update'),
  taskId: z.string(),
  contextId: z.string(),
  status: TaskStatusSchema,
  final: z.boolean(),
});

// Artifact schema matching A2A SDK
export const ArtifactSchema = z.object({
  artifactId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  parts: z.array(PartSchema),
});

// Artifact update event schema
export const TaskArtifactUpdateEventSchema = z.object({
  kind: z.literal('artifact-update'),
  taskId: z.string(),
  contextId: z.string(),
  artifact: ArtifactSchema,
  append: z.boolean().optional(),
  lastChunk: z.boolean().optional(),
});

// JSONRPC error schema
export const JSONRPCErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

// JSONRPC error response
export const JSONRPCErrorResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  error: JSONRPCErrorSchema,
});

// JSONRPC success response for message/send
export const SendMessageSuccessResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.union([MessageSchema, TaskSchema]),
});

// JSONRPC response for message/send
export const SendMessageResponseSchema = z.union([
  SendMessageSuccessResponseSchema,
  JSONRPCErrorResponseSchema,
]);

// SSE event data for streaming
export const StreamingMessageResultSchema = z.union([
  MessageSchema,
  TaskSchema,
  TaskStatusUpdateEventSchema,
  TaskArtifactUpdateEventSchema,
]);

// JSONRPC success response for streaming
export const SendStreamingMessageSuccessResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  result: StreamingMessageResultSchema,
});

// JSONRPC response for message/stream
export const SendStreamingMessageResponseSchema = z.union([
  SendStreamingMessageSuccessResponseSchema,
  JSONRPCErrorResponseSchema,
]);

// Request schemas
export const MessageSendRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.literal('message/send'),
  params: z.object({
    message: z.object({
      kind: z.literal('message'),
      messageId: z.string(),
      contextId: z.string().optional(), // Optional for first message
      role: z.literal('user'),
      parts: z.array(PartSchema),
    }),
    taskId: z.string().optional(),
  }),
});

export const MessageStreamRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.literal('message/stream'),
  params: z.object({
    message: z.object({
      kind: z.literal('message'),
      messageId: z.string(),
      contextId: z.string().optional(), // Optional for first message
      role: z.literal('user'),
      parts: z.array(PartSchema),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    configuration: z
      .object({
        acceptedOutputModes: z.array(z.string()).optional(),
      })
      .optional(),
    taskId: z.string().optional(),
  }),
});

// SSE event schema
export const SSEEventSchema = z.object({
  id: z.string().optional(),
  event: z.string(),
  data: z.string(),
  retry: z.number().optional(),
});

// Helper function to parse SSE event data
export function parseSSEEventData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

// Helper function to validate SSE event
export function validateSSEEvent(
  eventType: string,
  data: unknown,
): z.infer<typeof StreamingMessageResultSchema> | null {
  if (eventType === 'message' || eventType === 'status-update' || eventType === 'artifact-update') {
    try {
      // The data should be a JSONRPC response wrapper
      const parsed = SendStreamingMessageSuccessResponseSchema.parse(data);
      return parsed.result;
    } catch (error) {
      const logger = Logger.getInstance('Validation');
      logger.error('SSE event validation failed', error);
      return null;
    }
  }
  return null;
}

// Agent card schemas
export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).min(1),
});

export const CapabilitiesSchema = z.object({
  streaming: z.boolean(),
});

// Agent Card schema matching A2A spec v0.3.0
// Note: 'id' field is NOT part of the official A2A specification
export const AgentCardSchema = z.object({
  protocolVersion: z.string(),
  name: z.string(),
  capabilities: CapabilitiesSchema,
  skills: z.array(SkillSchema),
});

// Type exports
// Note: Import types from @a2a-js/sdk instead of using these inferred types
// These schemas are kept for runtime validation only
export type StreamingMessageResult = z.infer<typeof StreamingMessageResultSchema>;
