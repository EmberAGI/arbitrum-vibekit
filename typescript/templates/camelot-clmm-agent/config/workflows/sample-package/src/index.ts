/**
 * Sample TypeScript workflow package
 * This demonstrates a workflow implemented as a compiled TypeScript package
 */
import {
  z,
  type Artifact,
  type WorkflowContext,
  type WorkflowReturn,
  type WorkflowPlugin,
  type WorkflowState,
} from '@emberai/agent-node/workflow';

const confirmationInputSchema = z.object({
  confirmed: z.boolean(),
  notes: z.string().optional(),
  timestamp: z
    .string()
    .regex(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/, 'Must be ISO 8601 timestamp format')
    .optional(),
});

type ConfirmationInput = z.infer<typeof confirmationInputSchema>;

const signatureInputSchema = z.object({
  signature: z.string(),
});

type SignatureInput = z.infer<typeof signatureInputSchema>;

type WorkflowInput = ConfirmationInput | SignatureInput;

const plugin: WorkflowPlugin = {
  id: 'sample-package-workflow',
  name: 'Example Workflow',
  description:
    'A comprehensive workflow example demonstrating A2A patterns, pause/resume, multiple artifacts, and lifecycle management',
  version: '1.0.0',

  inputSchema: z.object({
    message: z.string().optional(),
    count: z.number().int().positive().optional().default(1),
  }),

  async *execute(
    context: WorkflowContext,
  ): AsyncGenerator<WorkflowState, WorkflowReturn, WorkflowInput> {
    const { message = 'Hello from example workflow!', count = 1 } = context.parameters ?? {};

    // First yield (optional): provide a repsonse for the tool call that dispatched this workflow
    yield {
      type: 'dispatch-response',
      parts: [
        {
          kind: 'text',
          text: 'Starting example workflow processing...',
        },
      ],
    };

    // Status: Starting workflow
    yield {
      type: 'status-update',
      message: 'Starting example workflow processing...',
    };

    // Artifact 1: Initial configuration summary
    const configArtifact: Artifact = {
      artifactId: 'config-summary',
      name: 'config-summary.json',
      description: 'Workflow configuration and parameters',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            workflowId: context.taskId,
            message,
            count,
            startedAt: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: configArtifact };

    // Simulate some work
    for (let i = 0; i < (count as number); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Artifact 2: Processing result
    const processingArtifact: Artifact = {
      artifactId: 'processing-result',
      name: 'processing-result.json',
      description: 'Intermediate processing results',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            status: 'processed',
            iterations: count,
            processedAt: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: processingArtifact };

    // Pause for user confirmation
    const userInput = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please confirm to proceed with final step',
      inputSchema: confirmationInputSchema,
    }) as { confirmed?: boolean; notes?: string; timestamp?: string } | undefined;
    const signatureResult = userInput ? signatureInputSchema.safeParse(userInput) : undefined;
    const signature = signatureResult?.success ? signatureResult.data.signature : undefined;

    // Continue after confirmation
    yield {
      type: 'status-update',
      message: 'Finalizing workflow...',
    };

    // Artifact 3: Final result with user confirmation
    const finalArtifact: Artifact = {
      artifactId: 'final-result',
      name: 'final-result.json',
      description: 'Final workflow result including user confirmation',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            message,
            count,
            confirmed: userInput?.confirmed ?? false,
            userNotes: userInput?.notes,
            userTimestamp: userInput?.timestamp,
            signature,
            completedAt: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: finalArtifact };

    // Final status
    yield {
      type: 'status-update',
      message: 'Workflow completed successfully',
    };

    // When the workflow returns, it is considered completed.
    // You can optionally return a message or data:
    // return 'Processing completed successfully';
    // return { message: 'Done', data: { itemCount: 10 } };
    // or just return nothing:
    return;
  },
};

export default plugin;
