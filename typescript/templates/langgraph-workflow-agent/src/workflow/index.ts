import { StateGraph, Annotation } from '@langchain/langgraph';
import type { LanguageModel } from 'ai';
import type { GreetingState, SatisfactionLevel } from './state.js';
import { createInitialState } from './state.js';
import { generatorNode } from './nodes/generator.js';
import { evaluatorNode } from './nodes/evaluator.js';
import { optimizerNode } from './nodes/optimizer.js';

// Define state annotation with reducers
const GreetingAnnotation = Annotation.Root({
  userInput: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  currentGreeting: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  overallSatisfaction: Annotation<SatisfactionLevel>({
    reducer: (x, y) => y ?? x,
    default: () => 'Not satisfied' as SatisfactionLevel,
  }),
  evaluationCriteria: Annotation<{
    friendliness: SatisfactionLevel;
    engagement: SatisfactionLevel;
    personalization: SatisfactionLevel;
  }>({
    reducer: (x, y) => y ?? x,
    default: () => ({
      friendliness: 'Not satisfied' as SatisfactionLevel,
      engagement: 'Not satisfied' as SatisfactionLevel,
      personalization: 'Not satisfied' as SatisfactionLevel,
    }),
  }),
  feedback: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 3,
  }),
  isAcceptable: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  evaluationHistory: Annotation<
    Array<{
      iteration: number;
      satisfaction: SatisfactionLevel;
      greeting: string;
    }>
  >({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  feedbackHistory: Annotation<string[][]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
});

// Create the greeting optimization workflow
export function createGreetingWorkflow(model: LanguageModel) {
  // Define the graph with our state annotation
  const workflow = new StateGraph(GreetingAnnotation)
    .addNode('generator', state => generatorNode(state, model))
    .addNode('evaluator', state => evaluatorNode(state, model))
    .addNode('optimizer', state => optimizerNode(state, model))
    .addEdge('__start__', 'generator')
    .addEdge('generator', 'evaluator')
    .addConditionalEdges('evaluator', state => {
      // Check if we should continue or end
      if (state.isAcceptable || state.iteration >= state.maxIterations) {
        return '__end__';
      }
      return 'optimizer';
    })
    .addEdge('optimizer', 'generator');

  // Compile the workflow
  return workflow.compile();
}

// Helper function to run the workflow
export async function runGreetingWorkflow(
  userInput: string,
  model: LanguageModel
): Promise<GreetingState> {
  const workflow = createGreetingWorkflow(model);
  const initialState = createInitialState(userInput);

  const result = await workflow.invoke(initialState);
  return result as GreetingState;
}
