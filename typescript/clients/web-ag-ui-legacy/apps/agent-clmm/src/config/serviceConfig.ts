import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';

import { ShallowMemorySaver } from '../workflow/shallowMemorySaver.js';

export type LangGraphCheckpointerMode = 'shallow' | 'full';
export type LangGraphDurability = 'async' | 'exit' | 'sync';

type ServiceConfig = {
  langgraph: {
    durability: LangGraphDurability;
    checkpointer: LangGraphCheckpointerMode;
  };
};

type LangGraphDefaults = ServiceConfig['langgraph'];

const ServiceConfigSchema = z.object({
  langgraph: z.object({
    durability: z.enum(['async', 'exit', 'sync']),
    checkpointer: z.enum(['shallow', 'full']),
  }),
});

let cachedDefaults: ServiceConfig['langgraph'] | undefined;

function findServiceConfigPath(): string | undefined {
  const explicitDir = process.env['AGENT_CONFIG_DIR'];
  if (explicitDir) {
    const candidate = join(explicitDir, 'service.json');
    if (!existsSync(candidate)) {
      throw new Error(`AGENT_CONFIG_DIR is set but service.json was not found at ${candidate}`);
    }
    return candidate;
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

function loadServiceConfig(): ServiceConfig {
  const configPath = findServiceConfigPath();
  if (!configPath) {
    throw new Error('LangGraph service config not found (expected config/service.json).');
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
      durability: config.langgraph.durability,
      checkpointer: config.langgraph.checkpointer,
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
