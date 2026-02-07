import { describe, expect, it, vi } from 'vitest';

const { existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

describe('serviceConfig', () => {
  it('returns defaults when no config is found', async () => {
    existsSyncMock.mockReturnValue(false);
    delete process.env.AGENT_CONFIG_DIR;
    vi.resetModules();

    const { resolveLangGraphDefaults, createCheckpointer } = await import('./serviceConfig.js');

    const defaults = resolveLangGraphDefaults();
    expect(defaults).toEqual({ durability: 'exit', checkpointer: 'shallow' });
    expect(createCheckpointer().constructor.name).toBe('ShallowMemorySaver');
  });

  it('loads overrides from a config file', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ langgraph: { durability: 'sync', checkpointer: 'full' } }),
    );
    process.env.AGENT_CONFIG_DIR = '/tmp/agent-config';
    vi.resetModules();

    const { resolveLangGraphDefaults, createCheckpointer } = await import('./serviceConfig.js');

    const defaults = resolveLangGraphDefaults();
    expect(defaults).toEqual({ durability: 'sync', checkpointer: 'full' });
    expect(createCheckpointer().constructor.name).toBe('MemorySaver');
  });

  it('throws on invalid config', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ langgraph: { durability: 'nope' } }));
    process.env.AGENT_CONFIG_DIR = '/tmp/agent-config';
    vi.resetModules();

    const { resolveLangGraphDefaults } = await import('./serviceConfig.js');

    expect(() => resolveLangGraphDefaults()).toThrow('Invalid service config');
  });
});
