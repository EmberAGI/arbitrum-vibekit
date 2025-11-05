/**
 * Unit tests for updateRegistryCommand URL composition and chain targeting
 */

import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import matter from 'gray-matter';
import prompts from 'prompts';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { createTestConfigWorkspace } from '../../../tests/utils/test-config-workspace.js';
import * as registrationUtils from '../utils/registration.js';
import * as serveTransactionUtils from '../utils/serve-transaction.js';

import { updateRegistryCommand } from './update-registry.js';

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

type PromptsMock = ReturnType<typeof vi.fn>;

describe('updateRegistryCommand (from-config) - URL composition and chain targeting', () => {
  const tempDirs: string[] = [];

  function ensureAiBlock(agentMdPath: string) {
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    if (parsed.data['model']) {
      delete parsed.data['model'];
    }
    parsed.data['ai'] = {
      modelProvider: 'openrouter',
      model: 'openai/gpt-5',
      params: { temperature: 0.7, maxTokens: 4096 },
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('composes Agent Card URL from origin(card.url) + default path', async () => {
    const configDir = createTestConfigWorkspace({ agentName: 'UpdateReg Agent' });
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [],
      identityRegistries: {},
      registrations: { '42161': { agentId: 123 } },
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const builderSpy = vi.spyOn(registrationUtils, 'buildRegistrationFile');
    vi.spyOn(registrationUtils, 'createIpfsFile').mockImplementation(async () => {
      throw new Error('TEST_ABORT');
    });

    await expect(updateRegistryCommand({ configDir })).rejects.toThrow('TEST_ABORT');

    expect(builderSpy).toHaveBeenCalled();
    const args = builderSpy.mock.calls[0];
    const agentCardUrlArg = args?.[4];
    expect(agentCardUrlArg).toMatch(/\.well-known\/agent-card\.json$/);
  });

  it('uses routing.agentCardOrigin and agentCardPath if provided', async () => {
    const configDir = createTestConfigWorkspace();
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['routing'] = {
      agentCardOrigin: 'https://assets.example.com',
      agentCardPath: '/api/.well-known/agent-card.json',
    };
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [],
      identityRegistries: {},
      registrations: { '42161': { agentId: 42 } },
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const builderSpy = vi.spyOn(registrationUtils, 'buildRegistrationFile');
    vi.spyOn(registrationUtils, 'createIpfsFile').mockImplementation(async () => {
      throw new Error('TEST_ABORT');
    });

    await expect(updateRegistryCommand({ configDir })).rejects.toThrow('TEST_ABORT');

    const args = builderSpy.mock.calls[0];
    const agentCardUrlArg = args?.[4];
    expect(agentCardUrlArg).toBe('https://assets.example.com/api/.well-known/agent-card.json');
  });

  it('targets a specific chain with --chain flag', async () => {
    const configDir = createTestConfigWorkspace();
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [{ chainId: 1 }, { chainId: 8453 }],
      identityRegistries: {},
      registrations: { '1': { agentId: 999 } },
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const builderSpy = vi.spyOn(registrationUtils, 'buildRegistrationFile');
    vi.spyOn(registrationUtils, 'createIpfsFile').mockImplementation(async () => {
      throw new Error('TEST_ABORT');
    });

    await expect(updateRegistryCommand({ configDir, chain: '1' })).rejects.toThrow('TEST_ABORT');

    expect(builderSpy).toHaveBeenCalledTimes(1);
    const args = builderSpy.mock.calls[0];
    const chainArg = args?.[5];
    expect(chainArg).toBe(1);
  });

  it('builds registration files for canonical and mirror chains by default', async () => {
    const configDir = createTestConfigWorkspace();
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161, operatorAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
      mirrors: [{ chainId: 1 }, { chainId: 8453 }],
      identityRegistries: {},
      registrations: {
        '42161': { agentId: 101 },
        '1': { agentId: 202 },
        '8453': { agentId: 303 },
      },
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const originalBuilder = registrationUtils.buildRegistrationFile;
    let callCount = 0;
    const builderSpy = vi
      .spyOn(registrationUtils, 'buildRegistrationFile')
      .mockImplementation((...args) => {
        callCount += 1;
        if (callCount === 3) {
          throw new Error('TEST_ABORT');
        }
        return originalBuilder(...args);
      });

    vi.spyOn(registrationUtils, 'createIpfsFile').mockResolvedValue('ipfs://dummy');
    vi.spyOn(serveTransactionUtils, 'serveTransactionSigningPage').mockResolvedValue(
      'https://tx.local',
    );
    vi.spyOn(serveTransactionUtils, 'openBrowser').mockResolvedValue(undefined);

    await expect(updateRegistryCommand({ configDir })).rejects.toThrow('TEST_ABORT');

    expect(builderSpy).toHaveBeenCalledTimes(3);
    const chainCalls = builderSpy.mock.calls.map((call) => call[5]);
    expect(chainCalls).toEqual([42161, 1, 8453]);
  });

  it('prompts to persist overrides and updates agent.md when confirmed', async () => {
    const configDir = createTestConfigWorkspace({ agentName: 'Override Persist Agent' });
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [],
      identityRegistries: {},
      registrations: {
        '42161': { agentId: 404 },
      },
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const promptsMock = prompts as unknown as PromptsMock;
    promptsMock.mockResolvedValue({ persist: true });

    const originalStdinIsTTY = (process.stdin as unknown as { isTTY?: boolean }).isTTY;
    const originalStdoutIsTTY = (process.stdout as unknown as { isTTY?: boolean }).isTTY;
    (process.stdin as unknown as { isTTY?: boolean }).isTTY = true;
    (process.stdout as unknown as { isTTY?: boolean }).isTTY = true;

    const builderSpy = vi
      .spyOn(registrationUtils, 'buildRegistrationFile')
      .mockImplementation(() => {
        throw new Error('TEST_ABORT');
      });

    try {
      await expect(
        updateRegistryCommand({ configDir, image: 'https://example.com/updated-image.png' }),
      ).rejects.toThrow('TEST_ABORT');
    } finally {
      if (originalStdinIsTTY === undefined) {
        delete (process.stdin as unknown as { isTTY?: boolean }).isTTY;
      } else {
        (process.stdin as unknown as { isTTY?: boolean }).isTTY = originalStdinIsTTY;
      }

      if (originalStdoutIsTTY === undefined) {
        delete (process.stdout as unknown as { isTTY?: boolean }).isTTY;
      } else {
        (process.stdout as unknown as { isTTY?: boolean }).isTTY = originalStdoutIsTTY;
      }
    }

    expect(builderSpy).toHaveBeenCalledTimes(1);
    const updated = matter(readFileSync(agentMdPath, 'utf-8'));
    expect(updated.data['erc8004']['image']).toBe('https://example.com/updated-image.png');
    expect(promptsMock).toHaveBeenCalledTimes(1);
  });
});
