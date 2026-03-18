import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MemorySaver } from '@langchain/langgraph';

export type CheckpointConfig = {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

type ThreadStorage = MemorySaver['storage'][string];
type CheckpointerModule = {
  checkpointer?: unknown;
};
type CheckpointerInstance = MemorySaver & {
  [PATCH_FLAG]?: boolean;
};
type ParsedOuterKey = [string, string | null, string];

const PATCH_FLAG = Symbol.for('agent-workflow-core.langgraph.checkpointer.patched');

function parseOuterKey(key: string): ParsedOuterKey | null {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const values: unknown[] = parsed;
    if (values.length < 3) {
      return null;
    }

    const threadId = values[0];
    const checkpointNamespace = values[1];
    const checkpointId = values[2];
    if (typeof threadId !== 'string' || typeof checkpointId !== 'string') {
      return null;
    }

    if (typeof checkpointNamespace === 'string' || checkpointNamespace === null) {
      return [threadId, checkpointNamespace, checkpointId];
    }

    return [threadId, null, checkpointId];
  } catch {
    return null;
  }
}

function pruneThreadStorage(params: {
  threadStorage: ThreadStorage;
  checkpointId: string;
  checkpointNamespace: string | undefined;
}): void {
  const { threadStorage, checkpointId, checkpointNamespace } = params;
  for (const [namespace, checkpoints] of Object.entries(threadStorage)) {
    for (const id of Object.keys(checkpoints)) {
      const matchesNamespace = checkpointNamespace ? namespace === checkpointNamespace : true;
      if (!(matchesNamespace && id === checkpointId)) {
        delete checkpoints[id];
      }
    }
    if (Object.keys(checkpoints).length === 0) {
      delete threadStorage[namespace];
    }
  }
}

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

export function pruneCheckpointerState(params: {
  storage: MemorySaver['storage'];
  writes: MemorySaver['writes'];
  config: CheckpointConfig;
}): void {
  const { storage, writes, config } = params;
  const configurable = config.configurable;
  const threadId = configurable?.thread_id;
  const checkpointId = configurable?.checkpoint_id;
  const checkpointNamespace = configurable?.checkpoint_ns;
  if (!threadId || !checkpointId) {
    return;
  }

  const threadStorage = storage[threadId];
  if (threadStorage) {
    pruneThreadStorage({
      threadStorage,
      checkpointId,
      checkpointNamespace,
    });
    if (Object.keys(threadStorage).length === 0) {
      delete storage[threadId];
    }
  }

  const normalizedNamespace = checkpointNamespace ?? null;
  const currentOuterKey = JSON.stringify([threadId, checkpointNamespace, checkpointId]);
  for (const key of Object.keys(writes)) {
    if (key === currentOuterKey) {
      continue;
    }

    const parsedKey = parseOuterKey(key);
    if (!parsedKey) {
      continue;
    }

    const [keyThreadId, keyNamespace, keyCheckpointId] = parsedKey;
    const matchesNamespace = keyNamespace === normalizedNamespace;
    if (keyThreadId === threadId && matchesNamespace && keyCheckpointId !== checkpointId) {
      delete writes[key];
    }
  }
}

export async function loadLangGraphApiCheckpointer(): Promise<MemorySaver> {
  const candidates = resolveCandidateModulePaths();
  if (candidates.length === 0) {
    throw new Error('LangGraph API checkpointer module not found in known dependency trees');
  }

  const [modulePath] = candidates;
  const checkpointerModule = await loadCheckpointerModule(modulePath);
  const checkpointerCandidate = checkpointerModule.checkpointer;
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
    const checkpointerModule = await loadCheckpointerModule(modulePath);
    const checkpointerCandidate = checkpointerModule.checkpointer;
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
