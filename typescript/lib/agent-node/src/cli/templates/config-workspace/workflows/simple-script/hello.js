/**
 * Simple JavaScript workflow example
 * This demonstrates a minimal workflow implementation in JavaScript
 */

// Note: In JavaScript, we don't have TypeScript types, but the structure must match WorkflowPlugin
export default {
  id: 'simple-hello',
  name: 'Simple Hello',
  description: 'A minimal workflow example in JavaScript',
  version: '1.0.0',

  // The execute function must be an async generator
  async *execute(context) {
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

    // Yield a status update
    yield {
      type: 'status-update',
      message: 'Saying hello...',
    };

    // Yield an artifact with the greeting
    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'greeting',
        name: 'greeting.txt',
        description: 'A simple greeting',
        parts: [{ kind: 'text', text: 'hello' }],
      },
    };

    // Return a final result (can be any value)
    return { message: 'hello', completed: true };
  },
};
