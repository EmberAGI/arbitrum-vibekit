import type { TaskStatusUpdateEvent, TaskState } from '@a2a-js/sdk';
import { z } from 'zod';

export interface WorkflowContext {
  contextId: string;
  taskId: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// A2A-aligned status type for yields
export type WorkflowStatus = TaskStatusUpdateEvent['status'];

// Zod schemas for WorkflowState variants
// Note: Part[] from @a2a-js/sdk is validated at runtime as unknown[]
// The actual Part structure validation is handled by the A2A SDK itself

const WorkflowStateStatusUpdateSchema = z.object({
  type: z.literal('status-update'),
  message: z.union([z.array(z.unknown()), z.string()]).optional(),
});

const WorkflowStateArtifactSchema = z.object({
  type: z.literal('artifact'),
  artifact: z.unknown(), // Artifact type from @a2a-js/sdk
  append: z.boolean().optional(), // If true, append to existing artifact with same ID
  lastChunk: z.boolean().optional(), // If true, this is the final chunk
  metadata: z.record(z.string(), z.unknown()).optional(), // Optional metadata for extensions
});

const WorkflowStateInterruptedSchema = z.object({
  type: z.literal('interrupted'),
  reason: z.enum(['input-required', 'auth-required']),
  message: z.union([z.array(z.unknown()), z.string()]),
  inputSchema: z.custom<z.ZodObject<Record<string, z.ZodTypeAny>>>((val) => {
    return val instanceof z.ZodObject;
  }),
  artifact: z.unknown().optional(), // Optional Artifact for context/preview
});

const WorkflowStateRejectSchema = z.object({
  type: z.literal('reject'),
  reason: z.string(),
});

const WorkflowStateDispatchResponseSchema = z.object({
  type: z.literal('dispatch-response'),
  parts: z.array(z.unknown()), // Part[] from @a2a-js/sdk, validated by SDK
});

// Union schema for all WorkflowState types
export const WorkflowStateSchema = z.discriminatedUnion('type', [
  WorkflowStateStatusUpdateSchema,
  WorkflowStateArtifactSchema,
  WorkflowStateInterruptedSchema,
  WorkflowStateRejectSchema,
  WorkflowStateDispatchResponseSchema,
]);

// Derive TypeScript type from Zod schema
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export interface WorkflowPlugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  // Zod object schema for input validation
  inputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  // Optional timeout in milliseconds for getting dispatch response from first yield
  // Default: 500ms. Set higher if workflow needs to make API calls before first yield.
  dispatchResponseTimeout?: number;
  execute: (context: WorkflowContext) => AsyncGenerator<WorkflowState, unknown, unknown>;
}

export interface WorkflowExecution {
  id: string;
  pluginId: string;
  state: TaskState;
  context: WorkflowContext;
  result?: unknown;
  error?: Error;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  waitForCompletion: () => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => WorkflowExecution;
  getError: () => Error | undefined;
  getPauseInfo: () => PauseInfo | undefined;
  resume: (input: unknown) => Promise<ResumeResult>;
}

export interface PauseInfo {
  state: string;
  message?: string;
  inputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  correlationId?: string;
  validationErrors?: unknown[];
}

export interface ResumeResult {
  valid: boolean;
  errors?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactEvent {
  name: string;
  mimeType?: string;
  data: unknown;
}

export interface UpdateEvent {
  type: 'status' | 'progress';
  status?: unknown;
  current?: number;
  total?: number;
}

export interface WorkflowTool {
  execute: (params: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: Error;
}

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
}
