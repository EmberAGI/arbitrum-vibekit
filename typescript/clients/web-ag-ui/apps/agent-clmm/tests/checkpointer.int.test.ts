import { mkdtempSync, rmSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Annotation, Command, END, GraphInterrupt, interrupt, START, StateGraph } from '@langchain/langgraph';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const FALLBACK_PRIVATE_KEY =
  '0xbd7180ccfefe2c129249d0dc8a05b1dd384b38365623c4a6fe24123cd84a1a51';

type ApiCheckpointer = {
  storage: Record<string, Record<string, Record<string, unknown>>>;
  writes: Record<string, unknown>;
  initialize: (cwd: string) => Promise<{ flush: () => Promise<void> }>;
};

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'clmm-checkpointer-'));
}

function countThreadCheckpoints(checkpointer: ApiCheckpointer, threadId: string): number {
  const threadStorage = checkpointer.storage[threadId] ?? {};
  return Object.values(threadStorage).reduce(
    (sum, checkpoints) => sum + Object.keys(checkpoints).length,
    0,
  );
}

async function invokeForInterrupt(
  graph: ReturnType<StateGraph<unknown>['compile']>,
  input: unknown,
  config: unknown,
): Promise<boolean> {
  try {
    const result = (await graph.invoke(input, config)) as { __interrupt__?: unknown[] };
    return Array.isArray(result.__interrupt__) && result.__interrupt__.length > 0;
  } catch (error: unknown) {
    if (error instanceof GraphInterrupt) {
      return true;
    }
    throw error;
  }
}

describe('LangGraph API checkpointer retention', () => {
  const previousPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];

  beforeAll(() => {
    process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'] =
      process.env['CLMM_E2E_PRIVATE_KEY'] ?? FALLBACK_PRIVATE_KEY;
  });

  afterAll(() => {
    if (previousPrivateKey) {
      process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'] = previousPrivateKey;
    } else {
      delete process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
    }
  });

  it('retains only the latest checkpoint per thread in API persistence', async () => {
    const { loadLangGraphApiCheckpointer, configureLangGraphApiCheckpointer } = await import(
      '../src/workflow/langgraphApiCheckpointer.js'
    );
    const rawCheckpointer = await loadLangGraphApiCheckpointer();
    expect(rawCheckpointer).toBeTruthy();

    const checkpointer = rawCheckpointer as ApiCheckpointer;

    const tempDir = createTempDir();
    const conn = await checkpointer.initialize(tempDir);

    await configureLangGraphApiCheckpointer();

    const SimpleState = Annotation.Root({
      iteration: Annotation<number>(),
    });

    const graph = new StateGraph(SimpleState)
      .addNode('tick', (state) => ({
        iteration: (state.iteration ?? 0) + 1,
      }))
      .addEdge(START, 'tick')
      .addEdge('tick', END)
      .compile({ checkpointer: rawCheckpointer });

    try {
      const threadId = 'thread-checkpointer';
      const config = { configurable: { thread_id: threadId }, durability: 'exit' } as const;

      await graph.invoke({ iteration: 0 }, config);
      await graph.invoke({ iteration: 1 }, config);

      expect(countThreadCheckpoints(checkpointer, threadId)).toBe(1);

      await conn.flush();
      const persistedFile = join(tempDir, '.langgraph_api', '.langgraphjs_api.checkpointer.json');
      const fileStats = await stat(persistedFile);
      expect(fileStats.size).toBeLessThanOrEqual(5 * 1024 * 1024);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps a single checkpoint across multiple interrupt resumes', async () => {
    const { loadLangGraphApiCheckpointer, configureLangGraphApiCheckpointer } = await import(
      '../src/workflow/langgraphApiCheckpointer.js'
    );
    const rawCheckpointer = await loadLangGraphApiCheckpointer();
    const checkpointer = rawCheckpointer as ApiCheckpointer;
    const tempDir = createTempDir();
    const conn = await checkpointer.initialize(tempDir);
    await configureLangGraphApiCheckpointer();

    const InterruptState = Annotation.Root({
      step: Annotation<number>(),
    });

    const interruptGraph = new StateGraph(InterruptState)
      .addNode('interrupts', async () => ({
        step:
          Number(Boolean(await interrupt({ prompt: 'first' }))) +
          Number(Boolean(await interrupt({ prompt: 'second' }))),
      }))
      .addEdge(START, 'interrupts')
      .addEdge('interrupts', END)
      .compile({ checkpointer: rawCheckpointer });

    const threadId = 'thread-interrupts';
    const config = { configurable: { thread_id: threadId }, durability: 'exit' } as const;
    try {
      const firstInterrupt = await invokeForInterrupt(interruptGraph, { step: 0 }, config);
      expect(firstInterrupt).toBe(true);
      expect(countThreadCheckpoints(checkpointer, threadId)).toBe(1);

      const secondInterrupt = await invokeForInterrupt(
        interruptGraph,
        new Command({ resume: { confirmed: true } }),
        config,
      );
      expect(secondInterrupt).toBe(true);
      expect(countThreadCheckpoints(checkpointer, threadId)).toBe(1);

      const finalInterrupt = await invokeForInterrupt(
        interruptGraph,
        new Command({ resume: { confirmed: true } }),
        config,
      );
      expect(finalInterrupt).toBe(false);
      expect(countThreadCheckpoints(checkpointer, threadId)).toBe(1);

      await conn.flush();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
