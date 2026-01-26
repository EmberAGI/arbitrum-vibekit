import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemorySaver } from '@langchain/langgraph';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'service-config-'));
}

function writeServiceConfigAt(dir: string, payload: Record<string, unknown>): string {
  const configPath = join(dir, 'service.json');
  writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf8');
  return configPath;
}

function writeNestedServiceConfigAt(dir: string, payload: Record<string, unknown>): string {
  const configDir = join(dir, 'config');
  mkdirSync(configDir, { recursive: true });
  return writeServiceConfigAt(configDir, payload);
}

async function loadModule() {
  vi.resetModules();
  return import('./serviceConfig.js');
}

describe('serviceConfig', () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    tempDir = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when no config is found', async () => {
    // Given a cwd with no config/service.json in its ancestry
    tempDir = createTempDir();
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    // When loading the service config
    const configModule = await loadModule();

    // Then it fails fast due to missing config
    expect(() => configModule.resolveLangGraphDefaults()).toThrow(
      /service config not found/i,
    );
  });

  it('loads config from AGENT_CONFIG_DIR when present', async () => {
    // Given a service.json in AGENT_CONFIG_DIR
    tempDir = createTempDir();
    writeServiceConfigAt(tempDir, {
      langgraph: { durability: 'sync', checkpointer: 'full' },
    });
    process.env['AGENT_CONFIG_DIR'] = tempDir;

    // When loading the service config
    const configModule = await loadModule();
    const defaults = configModule.resolveLangGraphDefaults();
    const checkpointer = configModule.createCheckpointer();

    // Then config values are honored
    expect(defaults).toEqual({
      durability: 'sync',
      checkpointer: 'full',
    });
    expect(checkpointer).toBeInstanceOf(MemorySaver);
  });

  it('throws when AGENT_CONFIG_DIR is set but service.json is missing', async () => {
    // Given AGENT_CONFIG_DIR pointing at a directory with no service.json
    tempDir = createTempDir();
    process.env['AGENT_CONFIG_DIR'] = tempDir;

    // When loading the service config
    const configModule = await loadModule();

    // Then it fails fast with an explicit error
    expect(() => configModule.resolveLangGraphDefaults()).toThrow(/AGENT_CONFIG_DIR/i);
  });

  it('loads config from config/service.json relative to cwd', async () => {
    // Given a config/service.json in the cwd
    tempDir = createTempDir();
    writeNestedServiceConfigAt(tempDir, {
      langgraph: { durability: 'async', checkpointer: 'shallow' },
    });
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    // When loading the service config
    const configModule = await loadModule();
    const defaults = configModule.resolveLangGraphDefaults();

    // Then config values are honored
    expect(defaults).toEqual({
      durability: 'async',
      checkpointer: 'shallow',
    });
  });

  it('throws for invalid service.json values', async () => {
    // Given an invalid service.json
    tempDir = createTempDir();
    writeServiceConfigAt(tempDir, {
      langgraph: { durability: 'invalid', checkpointer: 'shallow' },
    });
    process.env['AGENT_CONFIG_DIR'] = tempDir;

    // When loading the service config
    const configModule = await loadModule();

    // Then it fails fast with a validation error
    expect(() => configModule.resolveLangGraphDefaults()).toThrow(
      /Invalid service config/,
    );
  });

  it('prefers explicit durability overrides', async () => {
    // Given a default config
    tempDir = createTempDir();
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    // When an override is supplied
    const configModule = await loadModule();
    const durability = configModule.resolveLangGraphDurability('sync');

    // Then the override wins
    expect(durability).toBe('sync');
  });
});
