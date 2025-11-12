import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGreetingWorkflow } from '../../src/workflow/index.js';
import { createInitialState } from '../../src/workflow/state.js';
import { createProviderSelector } from '@emberai/arbitrum-vibekit-core';
import { optimizeGreetingTool } from '../../src/tools/optimize-greeting.js';
import type { AgentContext } from '@emberai/arbitrum-vibekit-core';

// Skip these tests if no API key is provided
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const describeIfApiKey = OPENROUTER_API_KEY ? describe : describe.skip;

describeIfApiKey('Greeting Optimizer Integration Tests', () => {
  let context: AgentContext;

  beforeAll(() => {
    if (!OPENROUTER_API_KEY) {
      console.log('⚠️  Skipping integration tests: OPENROUTER_API_KEY not set');
      return;
    }

    // Create provider selector and model instance
    const providers = createProviderSelector({
      openRouterApiKey: OPENROUTER_API_KEY,
    });

    const model = providers.openrouter!('openai/gpt-4.1-nano');

    // Create a context with the model in custom
    context = {
      custom: { model }, // Put the model instance in custom
      modelProvider: 'openrouter',
      model: 'openai/gpt-4.1-nano',
      providerOptions: {
        openRouterApiKey: OPENROUTER_API_KEY,
      },
    } as AgentContext;
  });

  afterAll(() => {
    // Cleanup if needed
  });

  it('should optimize a simple greeting with real LLM', async () => {
    const result = await optimizeGreetingTool.execute({ message: 'hi' }, context);

    // Verify structure, not exact content (since LLM responses vary)
    expect(result).toBeDefined();
    expect(result.kind).toBe('task');
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    // Parse the artifact to check the data
    const artifact = result.artifacts![0];
    const data = JSON.parse(artifact.parts[0].text);

    expect(data.originalGreeting).toBe('hi');
    expect(data.optimizedGreeting).toBeTruthy();
    expect(data.optimizedGreeting.length).toBeGreaterThan(3); // Should be longer than "hi"
    expect(data.iterations).toBeGreaterThanOrEqual(1);
    expect(data.iterations).toBeLessThanOrEqual(3);
    expect(data.finalSatisfaction).toBeTruthy();
    expect(data.evaluationHistory).toBeInstanceOf(Array);
    expect(data.feedbackHistory).toBeInstanceOf(Array);

    console.log('✅ Optimized greeting:', data.optimizedGreeting);
    console.log('📊 Final satisfaction:', data.finalSatisfaction);
    console.log('🔄 Iterations:', data.iterations);
  }, 30000); // 30 second timeout for API calls

  it('should handle weird input (numbers) with real LLM', async () => {
    const result = await optimizeGreetingTool.execute({ message: '12345' }, context);

    expect(result).toBeDefined();
    expect(result.kind).toBe('task');
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    // Parse the artifact to check the data
    const artifact = result.artifacts![0];
    const data = JSON.parse(artifact.parts[0].text);

    expect(data.originalGreeting).toBe('12345');
    expect(data.optimizedGreeting).toBeTruthy();
    // Should acknowledge the numbers in some way
    expect(data.optimizedGreeting.toLowerCase()).toMatch(/number|digit|12345/);

    console.log('✅ Handled numbers:', data.optimizedGreeting);
  }, 30000);

  it('should optimize to acceptable satisfaction level', async () => {
    const result = await optimizeGreetingTool.execute({ message: 'hello' }, context);

    expect(result).toBeDefined();
    expect(result.kind).toBe('task');
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    // Parse the artifact to check the data
    const artifact = result.artifacts![0];
    const data = JSON.parse(artifact.parts[0].text);

    // Verify the workflow completed with a valid satisfaction level
    const validSatisfactionLevels = [
      'Not satisfied',
      'Somewhat satisfied',
      'Satisfied',
      'Very satisfied',
      'Extremely satisfied',
    ];
    expect(validSatisfactionLevels).toContain(data.finalSatisfaction);

    // Verify the workflow ran properly
    expect(data.iterations).toBeGreaterThanOrEqual(1);
    expect(data.iterations).toBeLessThanOrEqual(3);

    // The workflow should either:
    // 1. Achieve an acceptable level (Very/Extremely satisfied), OR
    // 2. Hit the max iterations (3)
    const acceptableLevels = ['Very satisfied', 'Extremely satisfied'];
    if (!acceptableLevels.includes(data.finalSatisfaction)) {
      // If not acceptable, it should have hit max iterations
      expect(data.iterations).toBe(3);
    }

    // Verify we have the optimization data
    expect(data.originalGreeting).toBe('hello');
    expect(data.optimizedGreeting).toBeTruthy();
    expect(data.evaluationHistory).toHaveLength(data.iterations);

    console.log('✅ Workflow completed with satisfaction:', data.finalSatisfaction);
    console.log('   Iterations:', data.iterations);
    console.log('   Acceptable level achieved:', acceptableLevels.includes(data.finalSatisfaction));
  }, 30000);

  it('should provide detailed evaluation history', async () => {
    const result = await optimizeGreetingTool.execute({ message: 'hey' }, context);

    expect(result).toBeDefined();
    expect(result.kind).toBe('task');
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    // Parse the artifact to check the data
    const artifact = result.artifacts![0];
    const data = JSON.parse(artifact.parts[0].text);

    // Check evaluation history structure
    const history = data.evaluationHistory;
    expect(history.length).toBeGreaterThanOrEqual(1);

    history.forEach((entry: any, index: number) => {
      expect(entry).toHaveProperty('iteration');
      expect(entry).toHaveProperty('satisfaction');
      expect(entry).toHaveProperty('greeting');
      expect(entry.iteration).toBe(index + 1);
    });

    // Check feedback history
    const feedback = data.feedbackHistory;
    expect(feedback.length).toBe(history.length);
    feedback.forEach((feedbackArray: any) => {
      expect(feedbackArray).toBeInstanceOf(Array);
      expect(feedbackArray.length).toBeGreaterThan(0);
    });

    console.log('✅ Evaluation history:', JSON.stringify(history, null, 2));
  }, 30000);

  it('should handle empty/whitespace input gracefully', async () => {
    const result = await optimizeGreetingTool.execute({ message: '   ' }, context);

    expect(result).toBeDefined();
    expect(result.kind).toBe('task');
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    // Parse the artifact to check the data
    const artifact = result.artifacts![0];
    const data = JSON.parse(artifact.parts[0].text);

    expect(data.optimizedGreeting).toBeTruthy();
    expect(data.optimizedGreeting.trim().length).toBeGreaterThan(0);

    console.log('✅ Handled whitespace:', data.optimizedGreeting);
  }, 30000);

  // Test the raw workflow directly (without tool wrapper)
  it('should run workflow directly with real model', async () => {
    const providers = createProviderSelector({
      openRouterApiKey: OPENROUTER_API_KEY,
    });

    const model = providers.openrouter!('openai/gpt-4o-mini');
    const workflow = createGreetingWorkflow(model);
    const initialState = createInitialState('greetings');

    const result = await workflow.invoke(initialState);

    expect(result.currentGreeting).toBeTruthy();
    expect(result.iteration).toBeGreaterThanOrEqual(1);
    expect(result.isAcceptable).toBeDefined();
    expect(result.evaluationHistory.length).toBe(result.iteration);

    console.log('✅ Direct workflow result:', {
      greeting: result.currentGreeting,
      satisfaction: result.overallSatisfaction,
      iterations: result.iteration,
    });
  }, 30000);

  // Test error handling with invalid model
  it('should handle API errors gracefully', async () => {
    // Create provider selector with API key
    const providers = createProviderSelector({
      openRouterApiKey: OPENROUTER_API_KEY,
    });

    // Try to create a model with an invalid name
    const invalidModel = providers.openrouter!('invalid/model-name');

    const invalidContext = {
      custom: { model: invalidModel }, // Put the invalid model in custom
      modelProvider: 'openrouter',
      model: 'invalid/model-name',
      providerOptions: {
        openRouterApiKey: OPENROUTER_API_KEY,
      },
    } as AgentContext;

    const result = await optimizeGreetingTool.execute({ message: 'hello' }, invalidContext);

    // The workflow has error handling that provides fallback behavior
    // instead of failing completely, which is good for production
    expect(result).toBeDefined();
    expect(result.kind).toBe('task');
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    // Parse the artifact to verify fallback behavior
    const artifact = result.artifacts![0];
    const data = JSON.parse(artifact.parts[0].text);

    // When errors occur, the workflow should still provide a greeting
    expect(data.originalGreeting).toBe('hello');
    expect(data.optimizedGreeting).toBeTruthy();

    // The fallback greeting should be the default one
    expect(data.optimizedGreeting).toContain("Hello! I'm here to help");

    // Should complete in 1 iteration due to errors
    expect(data.iterations).toBe(1); // Stops after first iteration when both nodes fail

    console.log('✅ Handled error gracefully with fallback greeting');
  }, 30000);
});
