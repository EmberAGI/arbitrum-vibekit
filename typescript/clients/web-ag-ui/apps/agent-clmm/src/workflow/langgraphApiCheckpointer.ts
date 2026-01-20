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

function resolveCheckpointerModulePath(packageJsonPath: string): string | null {
  const modulePath = join(dirname(packageJsonPath), 'dist', 'storage', 'checkpoint.mjs');
  if (!existsSync(modulePath)) {
    return null;
  }
  return modulePath;
}

function resolveCandidateModulePaths(): string[] {
  const require = createRequire(import.meta.url);
  const modulePaths = new Set<string>();

  try {
    const packageJsonPath = require.resolve('@langchain/langgraph-api/package.json');
    const modulePath = resolveCheckpointerModulePath(packageJsonPath);
    if (modulePath) {
      modulePaths.add(modulePath);
    }
  } catch {
    // Ignore - module may be resolved from another dependency tree.
  }

  try {
    const cliPackageJsonPath = require.resolve('@langchain/langgraph-cli/package.json');
    const cliRequire = createRequire(cliPackageJsonPath);
    try {
      const cliApiPackageJsonPath = cliRequire.resolve('@langchain/langgraph-api/package.json');
      const modulePath = resolveCheckpointerModulePath(cliApiPackageJsonPath);
      if (modulePath) {
        modulePaths.add(modulePath);
      }
    } catch {
      // Ignore - CLI dependency graph may not expose langgraph-api.
    }
  } catch {
    // Ignore - CLI not installed locally.
  }

  return Array.from(modulePaths);
}

async function loadCheckpointerModule(modulePath: string): Promise<CheckpointerModule> {
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
  const candidates = resolveCandidateModulePaths();
  if (candidates.length === 0) {
    throw new Error('LangGraph API checkpointer module not found in known dependency trees');
  }

  const [modulePath] = candidates;
  const module = await loadCheckpointerModule(modulePath);
  const checkpointerCandidate = module.checkpointer;
  if (!isMemorySaver(checkpointerCandidate)) {
    throw new Error('LangGraph API checkpointer does not expose a MemorySaver instance');
  }
  return checkpointerCandidate;
}

export async function configureLangGraphApiCheckpointer(): Promise<void> {
  const modulePaths = resolveCandidateModulePaths();
  if (modulePaths.length === 0) {
    throw new Error('LangGraph API checkpointer module not found in known dependency trees');
  }

  for (const modulePath of modulePaths) {
    const module = await loadCheckpointerModule(modulePath);
    const checkpointerCandidate = module.checkpointer;
    if (!isMemorySaver(checkpointerCandidate)) {
      continue;
    }

    const checkpointer = checkpointerCandidate as CheckpointerInstance;
    if (checkpointer[PATCH_FLAG]) {
      continue;
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
}
