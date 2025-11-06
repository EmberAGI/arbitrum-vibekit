import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { WorkflowEntry } from '../schemas/workflow.schema.js';

import {
  discoverWorkflows,
  findWorkflowEntryPoint,
  hasPackageJson,
  getInstallableWorkflows,
  discoveredToWorkflowEntries,
  mergeWorkflows,
} from './workflow-discovery.js';


describe('workflow-discovery', () => {
  let testDir: string;
  let workflowsDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = join(tmpdir(), `workflow-discovery-test-${Date.now()}`);
    workflowsDir = join(testDir, 'workflows');
    mkdirSync(testDir, { recursive: true });
    mkdirSync(workflowsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('discoverWorkflows', () => {
    it('should return empty array for non-existent directory', () => {
      // Given a non-existent directory path
      const nonExistentDir = join(testDir, 'does-not-exist');

      // When discovering workflows
      const result = discoverWorkflows(nonExistentDir);

      // Then it returns an empty array
      expect(result).toEqual([]);
    });

    it('should return empty array for empty directory', () => {
      // Given an empty workflows directory
      // (already created in beforeEach)

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it returns an empty array
      expect(result).toEqual([]);
    });

    it('should discover workflows with package.json main field', () => {
      // Given a workflow with package.json defining main field
      const workflowDir = join(workflowsDir, 'package-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, 'package.json'),
        JSON.stringify({ main: 'lib/entry.js' }),
      );
      mkdirSync(join(workflowDir, 'lib'), { recursive: true });
      writeFileSync(join(workflowDir, 'lib', 'entry.js'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers the workflow
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'package-workflow',
        from: join('workflows', 'package-workflow', 'lib/entry.js'),
        enabled: true,
        hasPackageJson: true,
      });
    });

    it('should discover workflows with index.ts', () => {
      // Given a workflow with index.ts
      const workflowDir = join(workflowsDir, 'ts-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'index.ts'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers the workflow
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'ts-workflow',
        from: join('workflows', 'ts-workflow', 'index.ts'),
        enabled: true,
        hasPackageJson: false,
      });
    });

    it('should discover workflows with index.js', () => {
      // Given a workflow with index.js
      const workflowDir = join(workflowsDir, 'js-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'index.js'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers the workflow
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'js-workflow',
        from: join('workflows', 'js-workflow', 'index.js'),
        enabled: true,
        hasPackageJson: false,
      });
    });

    it('should discover workflows with workflow.ts', () => {
      // Given a workflow with workflow.ts
      const workflowDir = join(workflowsDir, 'workflow-ts');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'workflow.ts'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers the workflow
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'workflow-ts',
        from: join('workflows', 'workflow-ts', 'workflow.ts'),
        enabled: true,
      });
    });

    it('should discover workflows with workflow.js', () => {
      // Given a workflow with workflow.js
      const workflowDir = join(workflowsDir, 'workflow-js');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'workflow.js'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers the workflow
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'workflow-js',
        from: join('workflows', 'workflow-js', 'workflow.js'),
        enabled: true,
      });
    });

    it('should discover workflows with src/index.ts', () => {
      // Given a workflow with src/index.ts
      const workflowDir = join(workflowsDir, 'src-workflow');
      const srcDir = join(workflowDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'index.ts'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers the workflow
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'src-workflow',
        from: join('workflows', 'src-workflow', 'src', 'index.ts'),
        enabled: true,
        hasPackageJson: false,
      });
    });

    it('should ignore directories without valid entry points', () => {
      // Given a directory without valid entry points
      const invalidDir = join(workflowsDir, 'invalid-workflow');
      mkdirSync(invalidDir, { recursive: true });
      writeFileSync(join(invalidDir, 'random.js'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it ignores the directory
      expect(result).toEqual([]);
    });

    it('should ignore files (not directories)', () => {
      // Given a file in the workflows directory
      writeFileSync(join(workflowsDir, 'not-a-directory.js'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it ignores the file
      expect(result).toEqual([]);
    });

    it('should handle multiple workflows correctly', () => {
      // Given multiple workflows with different entry points
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(
        join(workflow2, 'package.json'),
        JSON.stringify({ main: 'dist/main.js' }),
      );
      mkdirSync(join(workflow2, 'dist'));
      writeFileSync(join(workflow2, 'dist', 'main.js'), 'export default {}');

      const workflow3 = join(workflowsDir, 'workflow-3');
      mkdirSync(join(workflow3, 'src'), { recursive: true });
      writeFileSync(join(workflow3, 'src', 'index.ts'), 'export default {}');

      // When discovering workflows
      const result = discoverWorkflows(workflowsDir);

      // Then it discovers all workflows
      expect(result).toHaveLength(3);
      const ids = result.map(w => w.id).sort();
      expect(ids).toEqual(['workflow-1', 'workflow-2', 'workflow-3']);
    });
  });

  describe('findWorkflowEntryPoint', () => {
    it('should return package.json main field entry (highest priority)', () => {
      // Given a workflow with package.json main and other entry points
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, 'package.json'),
        JSON.stringify({ main: 'custom/entry.js' }),
      );
      mkdirSync(join(workflowDir, 'custom'), { recursive: true });
      writeFileSync(join(workflowDir, 'custom', 'entry.js'), 'export default {}');
      writeFileSync(join(workflowDir, 'index.ts'), 'export default {}'); // Should be ignored

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it returns the package.json main field
      expect(result).toBe('custom/entry.js');
    });

    it('should return index.ts when no package.json', () => {
      // Given a workflow with index.ts and index.js
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'index.ts'), 'export default {}');
      writeFileSync(join(workflowDir, 'index.js'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it returns index.ts (TypeScript preferred)
      expect(result).toBe('index.ts');
    });

    it('should return index.js when no .ts available', () => {
      // Given a workflow with only index.js
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'index.js'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it returns index.js
      expect(result).toBe('index.js');
    });

    it('should return workflow.ts as fallback', () => {
      // Given a workflow with only workflow.ts
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'workflow.ts'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it returns workflow.ts
      expect(result).toBe('workflow.ts');
    });

    it('should return src/index.ts as final fallback', () => {
      // Given a workflow with only src/index.ts
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(join(workflowDir, 'src'), { recursive: true });
      writeFileSync(join(workflowDir, 'src', 'index.ts'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it returns src/index.ts
      expect(result).toBe(join('src', 'index.ts'));
    });

    it('should return null when no entry point exists', () => {
      // Given a workflow directory with no valid entry points
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'random.js'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it returns null
      expect(result).toBeNull();
    });

    it('should handle invalid package.json gracefully', () => {
      // Given a workflow with malformed package.json and fallback entry
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'package.json'), 'invalid json content');
      writeFileSync(join(workflowDir, 'index.ts'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it falls back to index.ts
      expect(result).toBe('index.ts');
    });

    it('should ignore package.json main if file does not exist', () => {
      // Given a workflow with package.json main pointing to non-existent file
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        join(workflowDir, 'package.json'),
        JSON.stringify({ main: 'does-not-exist.js' }),
      );
      writeFileSync(join(workflowDir, 'index.ts'), 'export default {}');

      // When finding entry point
      const result = findWorkflowEntryPoint(workflowDir);

      // Then it falls back to index.ts
      expect(result).toBe('index.ts');
    });
  });

  describe('hasPackageJson', () => {
    it('should return true when package.json exists', () => {
      // Given a workflow directory with package.json
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'package.json'), '{}');

      // When checking for package.json
      const result = hasPackageJson(workflowDir);

      // Then it returns true
      expect(result).toBe(true);
    });

    it('should return false when package.json does not exist', () => {
      // Given a workflow directory without package.json
      const workflowDir = join(workflowsDir, 'test-workflow');
      mkdirSync(workflowDir, { recursive: true });

      // When checking for package.json
      const result = hasPackageJson(workflowDir);

      // Then it returns false
      expect(result).toBe(false);
    });

    it('should return false for non-existent directory', () => {
      // Given a non-existent directory
      const nonExistentDir = join(workflowsDir, 'does-not-exist');

      // When checking for package.json
      const result = hasPackageJson(nonExistentDir);

      // Then it returns false
      expect(result).toBe(false);
    });
  });

  describe('getInstallableWorkflows', () => {
    it('should filter discovered workflows to only those with package.json', () => {
      // Given workflows with and without package.json
      const workflow1 = join(workflowsDir, 'with-package');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'package.json'), '{}');
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'without-package');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'index.ts'), 'export default {}');

      // When getting installable workflows
      const result = getInstallableWorkflows(workflowsDir);

      // Then it only returns workflows with package.json
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('with-package');
      expect(result[0].hasPackageJson).toBe(true);
    });

    it('should return empty array when no workflows have package.json', () => {
      // Given workflows without package.json
      const workflow1 = join(workflowsDir, 'workflow-1');
      mkdirSync(workflow1);
      writeFileSync(join(workflow1, 'index.ts'), 'export default {}');

      const workflow2 = join(workflowsDir, 'workflow-2');
      mkdirSync(workflow2);
      writeFileSync(join(workflow2, 'workflow.js'), 'export default {}');

      // When getting installable workflows
      const result = getInstallableWorkflows(workflowsDir);

      // Then it returns empty array
      expect(result).toEqual([]);
    });
  });

  describe('discoveredToWorkflowEntries', () => {
    it('should map discovered workflows to workflow entries', () => {
      // Given discovered workflows
      const discovered = [
        {
          id: 'workflow-1',
          from: 'workflows/workflow-1/index.ts',
          enabled: true,
          hasPackageJson: true,
          absolutePath: '/path/to/workflow-1',
        },
        {
          id: 'workflow-2',
          from: 'workflows/workflow-2/main.js',
          enabled: false,
          hasPackageJson: false,
          absolutePath: '/path/to/workflow-2',
        },
      ];

      // When converting to workflow entries
      const result = discoveredToWorkflowEntries(discovered);

      // Then it maps correctly, excluding extra properties
      expect(result).toEqual([
        {
          id: 'workflow-1',
          from: 'workflows/workflow-1/index.ts',
          enabled: true,
        },
        {
          id: 'workflow-2',
          from: 'workflows/workflow-2/main.js',
          enabled: false,
        },
      ]);
    });

    it('should handle empty array', () => {
      // Given no discovered workflows
      const discovered: never[] = [];

      // When converting to workflow entries
      const result = discoveredToWorkflowEntries(discovered);

      // Then it returns empty array
      expect(result).toEqual([]);
    });
  });

  describe('mergeWorkflows', () => {
    it('should give registry entries precedence over discovered', () => {
      // Given registry and discovered workflows with overlap
      const registryWorkflows: WorkflowEntry[] = [
        { id: 'shared-workflow', from: 'registry/path.ts', enabled: false },
        { id: 'registry-only', from: 'registry/only.ts', enabled: true },
      ];

      const discovered = [
        {
          id: 'shared-workflow',
          from: 'discovered/path.ts',
          enabled: true,
          hasPackageJson: true,
          absolutePath: '/path',
        },
        {
          id: 'discovered-only',
          from: 'discovered/only.ts',
          enabled: true,
          hasPackageJson: false,
          absolutePath: '/path2',
        },
      ];

      // When merging workflows
      const result = mergeWorkflows(registryWorkflows, discovered);

      // Then registry takes precedence for shared workflows
      const sharedWorkflow = result.find(w => w.id === 'shared-workflow');
      expect(sharedWorkflow).toEqual({
        id: 'shared-workflow',
        from: 'registry/path.ts',
        enabled: false, // Registry's enabled state preserved
      });

      // And both unique workflows are included
      expect(result).toHaveLength(3);
      const ids = result.map(w => w.id).sort();
      expect(ids).toEqual(['discovered-only', 'registry-only', 'shared-workflow']);
    });

    it('should add discovered workflows when not in registry', () => {
      // Given only discovered workflows
      const registryWorkflows: WorkflowEntry[] = [];
      const discovered = [
        {
          id: 'workflow-1',
          from: 'workflows/1/index.ts',
          enabled: true,
          hasPackageJson: true,
          absolutePath: '/path1',
        },
        {
          id: 'workflow-2',
          from: 'workflows/2/index.ts',
          enabled: true,
          hasPackageJson: false,
          absolutePath: '/path2',
        },
      ];

      // When merging workflows
      const result = mergeWorkflows(registryWorkflows, discovered);

      // Then all discovered workflows are added
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { id: 'workflow-1', from: 'workflows/1/index.ts', enabled: true },
        { id: 'workflow-2', from: 'workflows/2/index.ts', enabled: true },
      ]);
    });

    it('should deduplicate by workflow ID', () => {
      // Given registry workflows with duplicate IDs
      const registryWorkflows: WorkflowEntry[] = [
        { id: 'duplicate', from: 'first.ts', enabled: true },
        { id: 'duplicate', from: 'second.ts', enabled: false }, // Should override first
      ];
      const discovered: never[] = [];

      // When merging workflows
      const result = mergeWorkflows(registryWorkflows, discovered);

      // Then only one workflow with the ID exists (last registry entry wins)
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'duplicate',
        from: 'second.ts',
        enabled: false,
      });
    });

    it('should preserve registry enabled status', () => {
      // Given registry workflow with enabled=false
      const registryWorkflows: WorkflowEntry[] = [
        { id: 'workflow', from: 'registry.ts', enabled: false },
      ];
      const discovered = [
        {
          id: 'workflow',
          from: 'discovered.ts',
          enabled: true, // Different enabled state
          hasPackageJson: true,
          absolutePath: '/path',
        },
      ];

      // When merging workflows
      const result = mergeWorkflows(registryWorkflows, discovered);

      // Then registry's enabled status is preserved
      expect(result[0].enabled).toBe(false);
    });

    it('should preserve registry from path', () => {
      // Given registry workflow with specific from path
      const registryWorkflows: WorkflowEntry[] = [
        { id: 'workflow', from: 'custom/registry/path.ts', enabled: true },
      ];
      const discovered = [
        {
          id: 'workflow',
          from: 'workflows/workflow/index.ts',
          enabled: true,
          hasPackageJson: true,
          absolutePath: '/path',
        },
      ];

      // When merging workflows
      const result = mergeWorkflows(registryWorkflows, discovered);

      // Then registry's from path is preserved
      expect(result[0].from).toBe('custom/registry/path.ts');
    });

    it('should handle empty inputs', () => {
      // Given empty arrays
      const registryWorkflows: WorkflowEntry[] = [];
      const discovered: never[] = [];

      // When merging workflows
      const result = mergeWorkflows(registryWorkflows, discovered);

      // Then it returns empty array
      expect(result).toEqual([]);
    });
  });
});