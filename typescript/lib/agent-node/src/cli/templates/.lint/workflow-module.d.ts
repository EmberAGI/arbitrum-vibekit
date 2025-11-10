/**
 * Type-only proxy for '@emberai/agent-node/workflow' so template files can resolve
 * to local sources during linting without depending on published artifacts.
 */
export * as z from 'zod';
export { WorkflowRuntime } from '../../../workflow/runtime.js';
export {
  WorkflowStateSchema,
  type PauseInfo,
  type ResumeResult,
  type ToolExecutionResult,
  type ToolMetadata,
  type WorkflowContext,
  type WorkflowExecution,
  type WorkflowPlugin,
  type WorkflowReturn,
  type WorkflowState,
  type WorkflowTool,
} from '../../../workflow/types.js';
export type { Artifact, Message } from '@a2a-js/sdk';
