/**
 * Unit tests for registerCommand URL composition and routing overrides
 */

import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import prompts from 'prompts';
import { describe, it, expect, vi, afterEach } from 'vitest';

import * as registrationUtils from '../utils/registration.js';
import { registerCommand } from './register.js';
import { createTestConfigWorkspace } from '../../../tests/utils/test-config-workspace.js';

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

type PromptsMock = ReturnType<typeof vi.fn>;

describe('registerCommand (from-config) - Agent Card URL composition', () => {
  const tempDirs: string[] = [];

  function ensureAiBlock(agentMdPath: string) {
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    // Remove legacy 'model' and add new 'ai' block expected by loader
    // Keep existing other fields
    if (parsed.data['model']) {
      delete parsed.data['model'];
    }
    parsed.data['ai'] = {
      modelProvider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      params: { temperature: 0.7, maxTokens: 4096 },
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('uses origin(card.url) + default path when no routing overrides', async () => {
    const configDir = createTestConfigWorkspace({ agentName: 'RegTest Agent' });
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [{ chainId: 1 }, { chainId: 8453 }],
      identityRegistries: {},
      registrations: {},
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const builderSpy = vi.spyOn(registrationUtils, 'buildRegistrationFileForRegister');
    vi.spyOn(registrationUtils, 'createIpfsFile').mockImplementation(async () => {
      throw new Error('TEST_ABORT');
    });

    await expect(registerCommand({ configDir })).rejects.toThrow('TEST_ABORT');

    expect(builderSpy).toHaveBeenCalled();
    const args = builderSpy.mock.calls[0];
    const agentCardUrlArg = args?.[4];
    expect(agentCardUrlArg).toMatch(/http:\/\/localhost:\d+\/.well-known\/agent-card\.json/);
  });

  it('honors routing.agentCardOrigin override', async () => {
    const configDir = createTestConfigWorkspace();
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['routing'] = { agentCardOrigin: 'https://cdn.example.com' };
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [],
      identityRegistries: {},
      registrations: {},
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const builderSpy = vi.spyOn(registrationUtils, 'buildRegistrationFileForRegister');
    vi.spyOn(registrationUtils, 'createIpfsFile').mockImplementation(async () => {
      throw new Error('TEST_ABORT');
    });

    await expect(registerCommand({ configDir })).rejects.toThrow('TEST_ABORT');

    const args = builderSpy.mock.calls[0];
    const agentCardUrlArg = args?.[4];
    expect(agentCardUrlArg).toBe('https://cdn.example.com/.well-known/agent-card.json');
  });

  it('honors routing.agentCardPath override', async () => {
    const configDir = createTestConfigWorkspace();
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['routing'] = { agentCardPath: '/prefix/.well-known/agent-card.json' };
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [],
      identityRegistries: {},
      registrations: {},
      supportedTrust: [],
    };
    writeFileSync(agentMdPath, matter.stringify(parsed.content, parsed.data));

    const builderSpy = vi.spyOn(registrationUtils, 'buildRegistrationFileForRegister');
    vi.spyOn(registrationUtils, 'createIpfsFile').mockImplementation(async () => {
      throw new Error('TEST_ABORT');
    });

    await expect(registerCommand({ configDir })).rejects.toThrow('TEST_ABORT');

    const args = builderSpy.mock.calls[0];
    const agentCardUrlArg = args?.[4];
    expect(agentCardUrlArg).toMatch(/\/prefix\/.well-known\/agent-card\.json$/);
  });

  it('prompts to persist overrides and updates agent.md when confirmed', async () => {
    const configDir = createTestConfigWorkspace({ agentName: 'Prompt Test Agent' });
    tempDirs.push(configDir);

    const agentMdPath = join(configDir, 'agent.md');
    ensureAiBlock(agentMdPath);
    const parsed = matter(readFileSync(agentMdPath, 'utf-8'));
    parsed.data['erc8004'] = {
      enabled: true,
      canonical: { chainId: 42161 },
      mirrors: [],
      identityRegistries: {},
      registrations: {},
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
      .spyOn(registrationUtils, 'buildRegistrationFileForRegister')
      .mockImplementation(() => {
        throw new Error('TEST_ABORT');
      });

    try {
      await expect(registerCommand({ configDir, name: 'Overridden Agent Name' })).rejects.toThrow(
        'TEST_ABORT',
      );
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
    const parsedAfter = matter(readFileSync(agentMdPath, 'utf-8'));
    expect(parsedAfter.data['card']['name']).toBe('Overridden Agent Name');
    expect(promptsMock).toHaveBeenCalledTimes(1);
  });
});
