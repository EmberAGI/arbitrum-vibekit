import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const piExampleAppRoot = path.resolve(process.cwd(), '../agent-pi-example');
const packageJsonPath = path.join(piExampleAppRoot, 'package.json');
const serverEntryPath = path.join(piExampleAppRoot, 'src/server.ts');

describe('Pi example app package contract', () => {
  it('exists as a thin web-ag-ui app that depends on the public agent-runtime facade', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const serverEntry = fs.readFileSync(serverEntryPath, 'utf8');

    expect(packageJson.name).toBe('agent-pi-example');
    expect(packageJson.dependencies).toMatchObject({
      'agent-runtime': 'workspace:^',
    });
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-pi');
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-contracts');
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-postgres');
    expect(packageJson.scripts).toMatchObject({
      dev: 'tsx src/server.ts',
      start: 'tsx src/server.ts',
    });
    expect(serverEntry).toContain("from 'agent-runtime'");
    expect(serverEntry).not.toContain("from 'agent-runtime-pi'");
    expect(serverEntry).not.toContain("from 'agent-runtime-contracts'");
  });
});
