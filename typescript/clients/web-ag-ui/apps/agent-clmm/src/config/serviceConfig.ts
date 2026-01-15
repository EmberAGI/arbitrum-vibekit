import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';

import { ShallowMemorySaver } from '../workflow/shallowMemorySaver.js';

export type LangGraphCheckpointerMode = 'shallow' | 'full';
export type LangGraphDurability = 'async' | 'exit' | 'sync';

type LangGraphDefaults = {
  durability: LangGraphDurability;
  checkpointer: LangGraphCheckpointerMode;
};

type ServiceConfig = {
  langgraph?: {
    durability?: LangGraphDurability;
    checkpointer?: LangGraphCheckpointerMode;
  };
};

const ServiceConfigSchema = z.object({
  langgraph: z
    .object({
      durability: z.enum(['async', 'exit', 'sync']).optional(),
      checkpointer: z.enum(['shallow', 'full']).optional(),
    })
    .optional(),
});

const DEFAULT_LANGGRAPH: LangGraphDefaults = {
  durability: 'exit',
  checkpointer: 'shallow',
};

let cachedDefaults: LangGraphDefaults | undefined;

function findServiceConfigPath(): string | undefined {
  const explicitDir = process.env['AGENT_CONFIG_DIR'];
  if (explicitDir) {
    const candidate = join(explicitDir, 'service.json');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  let current = process.cwd();
  for (;;) {
    const candidate = join(current, 'config', 'service.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function loadServiceConfig(): ServiceConfig | undefined {
  const configPath = findServiceConfigPath();
  if (!configPath) {
    return undefined;
  }

  const raw = readFileSync(configPath, 'utf8');
  const parsed = ServiceConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid service config at ${configPath}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function resolveLangGraphDefaults(): LangGraphDefaults {
  if (!cachedDefaults) {
    const config = loadServiceConfig();
    cachedDefaults = {
      durability: config?.langgraph?.durability ?? DEFAULT_LANGGRAPH.durability,
      checkpointer: config?.langgraph?.checkpointer ?? DEFAULT_LANGGRAPH.checkpointer,
    };
  }
  return cachedDefaults;
}

export function resolveLangGraphDurability(
  override?: LangGraphDurability,
): LangGraphDurability {
  if (override) {
    return override;
  }
  return resolveLangGraphDefaults().durability;
}

export function resolveLangGraphCheckpointerMode(): LangGraphCheckpointerMode {
  return resolveLangGraphDefaults().checkpointer;
}

export function createCheckpointer(): MemorySaver {
  const mode = resolveLangGraphCheckpointerMode();
  return mode === 'full' ? new MemorySaver() : new ShallowMemorySaver();
}
