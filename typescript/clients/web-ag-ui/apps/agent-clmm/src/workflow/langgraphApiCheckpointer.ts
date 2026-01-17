import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MemorySaver } from '@langchain/langgraph';

import { pruneCheckpointerState, type CheckpointConfig } from './checkpointerPruner.js';

const PATCH_FLAG = Symbol.for('clmm.langgraph.checkpointer.patched');

type CheckpointerModule = {
  checkpointer?: unknown;
};

type CheckpointerInstance = MemorySaver & {
  [PATCH_FLAG]?: boolean;
};

function resolveCheckpointerModulePath(): string {
  const require = createRequire(import.meta.url);
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve('@langchain/langgraph-api/package.json');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`LangGraph API package not available: ${message}`);
  }

  const modulePath = join(dirname(packageJsonPath), 'dist', 'storage', 'checkpoint.mjs');
  if (!existsSync(modulePath)) {
    throw new Error(`LangGraph API checkpointer module not found at ${modulePath}`);
  }
  return modulePath;
}

async function loadCheckpointerModule(): Promise<CheckpointerModule> {
  const modulePath = resolveCheckpointerModulePath();
  return (await import(pathToFileURL(modulePath).href)) as CheckpointerModule;
}

function isMemorySaver(value: unknown): value is MemorySaver {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<MemorySaver>;
  return (
    typeof candidate.put === 'function' &&
    typeof candidate.putWrites === 'function' &&
    typeof candidate.getTuple === 'function' &&
    typeof candidate.list === 'function' &&
    typeof candidate.storage === 'object' &&
    candidate.storage !== null &&
    typeof candidate.writes === 'object' &&
    candidate.writes !== null
  );
}

export async function loadLangGraphApiCheckpointer(): Promise<MemorySaver> {
  const module = await loadCheckpointerModule();
  const checkpointerCandidate = module.checkpointer;
  if (!isMemorySaver(checkpointerCandidate)) {
    throw new Error('LangGraph API checkpointer does not expose a MemorySaver instance');
  }
  return checkpointerCandidate;
}

export async function configureLangGraphApiCheckpointer(): Promise<void> {
  const checkpointer = (await loadLangGraphApiCheckpointer()) as CheckpointerInstance;
  if (checkpointer[PATCH_FLAG]) {
    return;
  }

  const originalPut = checkpointer.put.bind(checkpointer);
  const originalPutWrites = checkpointer.putWrites.bind(checkpointer);

  checkpointer.put = async (...args: Parameters<MemorySaver['put']>) => {
    const nextConfig = await originalPut(...args);
    pruneCheckpointerState({
      storage: checkpointer.storage,
      writes: checkpointer.writes,
      config: nextConfig as CheckpointConfig,
    });
    return nextConfig;
  };

  checkpointer.putWrites = async (...args: Parameters<MemorySaver['putWrites']>) => {
    await originalPutWrites(...args);
    const [config] = args;
    pruneCheckpointerState({
      storage: checkpointer.storage,
      writes: checkpointer.writes,
      config: config as CheckpointConfig,
    });
  };

  checkpointer[PATCH_FLAG] = true;
}
