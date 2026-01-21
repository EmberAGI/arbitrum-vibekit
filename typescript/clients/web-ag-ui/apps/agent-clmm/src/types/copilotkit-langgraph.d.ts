declare module '@copilotkit/sdk-js/langgraph' {
  import type { RunnableConfig } from '@langchain/core/runnables';
  import type { DynamicStructuredTool } from '@langchain/core/tools';
  import type { AnnotationRoot } from '@langchain/langgraph';

  export type CopilotKitState = {
    messages: unknown[];
    copilotkit: {
      actions: unknown[];
      context: {
        description: string;
        value: string;
      }[];
      interceptedToolCalls: unknown[];
      originalAIMessageId: string;
    };
  };

  export const CopilotKitStateAnnotation: AnnotationRoot<{
    messages: unknown;
    copilotkit: unknown;
  }>;

  export function convertActionsToDynamicStructuredTools(actions: unknown[]): DynamicStructuredTool[];

  export function copilotkitEmitState(config: RunnableConfig, state: unknown): Promise<void>;
}
