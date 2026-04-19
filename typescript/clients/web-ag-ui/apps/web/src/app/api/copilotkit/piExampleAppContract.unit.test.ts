import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const piExampleAppRoot = path.resolve(process.cwd(), '../agent-pi-example');
const packageJsonPath = path.join(piExampleAppRoot, 'package.json');
const serverEntryPath = path.join(piExampleAppRoot, 'src/server.ts');
const startupEntryPath = path.join(piExampleAppRoot, 'src/startup.ts');
const agUiServerEntryPath = path.join(piExampleAppRoot, 'src/agUiServer.ts');

describe('Pi example app package contract', () => {
  it('exists as a thin web-ag-ui app that depends on the public agent-runtime facade', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      name: string;
      files?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const serverEntry = fs.readFileSync(serverEntryPath, 'utf8');
    const startupEntry = fs.readFileSync(startupEntryPath, 'utf8');
    const agUiServerEntry = fs.readFileSync(agUiServerEntryPath, 'utf8');

    expect(packageJson.name).toBe('agent-pi-example');
    expect(packageJson.dependencies).toMatchObject({
      'agent-runtime': 'workspace:^',
    });
    expect(packageJson.files).toEqual(expect.arrayContaining(['src', 'dist']));
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-pi');
    expect(packageJson.dependencies).not.toHaveProperty('pi-runtime-legacy-contracts');
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-postgres');
    expect(packageJson.scripts?.dev).toContain('src/server.ts');
    expect(packageJson.scripts?.dev).toContain('node --env-file=');
    expect(packageJson.scripts?.dev).toContain('.env.example');
    expect(packageJson.scripts?.start).toBe(packageJson.scripts?.dev);
    expect(agUiServerEntry).toContain("from 'agent-runtime'");
    expect(agUiServerEntry).toContain('service.createAgUiHandler');
    expect(serverEntry).not.toContain("from 'agent-runtime-pi'");
    expect(startupEntry).not.toContain("from 'agent-runtime-pi'");
    expect(agUiServerEntry).not.toContain("from 'agent-runtime-pi'");
    expect(serverEntry).not.toContain("from 'pi-runtime-legacy-contracts'");
    expect(startupEntry).not.toContain("from 'pi-runtime-legacy-contracts'");
    expect(agUiServerEntry).not.toContain("from 'pi-runtime-legacy-contracts'");
    expect(agUiServerEntry).not.toContain("from 'agent-runtime/pi-transport'");
    expect(startupEntry).not.toContain("from 'agent-runtime'");
  });
});
