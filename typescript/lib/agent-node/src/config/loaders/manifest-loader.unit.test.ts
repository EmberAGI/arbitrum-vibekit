/**
 * Unit tests for manifest-loader
 * Tests loading and validation of agent.manifest.json
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadManifest } from './manifest-loader.js';

describe('loadManifest', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `manifest-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should load valid minimal manifest', () => {
    // Given a minimal valid manifest file
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: [],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(manifestPath);

    // Then should return loaded manifest with path
    expect(result.manifest.version).toBe(1);
    expect(result.manifest.skills).toEqual([]);
    expect(result.path).toBe(manifestPath);
  });

  it('should load manifest with skills array', () => {
    // Given a manifest with skills
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: ['skills/swap.md', 'skills/bridge.md'],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(manifestPath);

    // Then should preserve skill order
    expect(result.manifest.skills).toEqual(['skills/swap.md', 'skills/bridge.md']);
  });

  it('should load manifest with custom registries config', () => {
    // Given a manifest with custom registry paths
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: [],
      registries: {
        mcp: './custom-mcp.json',
        workflows: './custom-workflows.json',
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(manifestPath);

    // Then should include custom registries
    expect(result.manifest.registries?.mcp).toBe('./custom-mcp.json');
    expect(result.manifest.registries?.workflows).toBe('./custom-workflows.json');
  });

  it('should load manifest with merge policies', () => {
    // Given a manifest with merge policies
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: [],
      merge: {
        card: {
          capabilities: 'union',
          toolPolicies: 'intersect',
          guardrails: 'tightest',
        },
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(manifestPath);

    // Then should include merge policies
    expect(result.manifest.merge?.card?.capabilities).toBe('union');
    expect(result.manifest.merge?.card?.toolPolicies).toBe('intersect');
    expect(result.manifest.merge?.card?.guardrails).toBe('tightest');
  });

  it('should apply default values for optional fields', () => {
    // Given a manifest with minimal fields
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      skills: ['skills/test.md'],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(manifestPath);

    // Then should apply defaults
    expect(result.manifest.version).toBe(1); // default version
  });

  it('should throw error for non-existent file', () => {
    // Given a non-existent file path
    const manifestPath = join(testDir, 'does-not-exist.json');

    // When loading
    // Then should throw error
    expect(() => loadManifest(manifestPath)).toThrow(/Manifest file not found/);
  });

  it('should throw error for invalid JSON', () => {
    // Given an invalid JSON file
    const manifestPath = join(testDir, 'agent.manifest.json');
    writeFileSync(manifestPath, '{ invalid json }');

    // When loading
    // Then should throw error with helpful message
    expect(() => loadManifest(manifestPath)).toThrow(/Failed to load manifest/);
  });

  it('should throw error for missing required fields', () => {
    // Given a manifest missing required field (skills)
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      // missing skills array
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    // Then should throw validation error
    expect(() => loadManifest(manifestPath)).toThrow(/Failed to load manifest/);
  });

  it('should throw error for invalid field types', () => {
    // Given a manifest with wrong type for skills
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: 'not-an-array', // should be array
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    // Then should throw validation error
    expect(() => loadManifest(manifestPath)).toThrow(/Failed to load manifest/);
  });

  it('should throw error for invalid merge policy values', () => {
    // Given a manifest with invalid merge policy
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: [],
      merge: {
        card: {
          capabilities: 'invalid-value', // should be 'union' or 'intersect'
        },
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    // Then should throw validation error
    expect(() => loadManifest(manifestPath)).toThrow(/Failed to load manifest/);
  });

  it('should resolve relative paths correctly', () => {
    // Given a file path
    const fullPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: [],
    };
    writeFileSync(fullPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(fullPath);

    // Then should resolve to absolute path
    expect(result.path).toBe(fullPath);
  });

  it('should accept empty skills array', () => {
    // Given a manifest with empty skills
    const manifestPath = join(testDir, 'agent.manifest.json');
    const manifest = {
      version: 1,
      skills: [],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // When loading
    const result = loadManifest(manifestPath);

    // Then should accept empty array
    expect(result.manifest.skills).toEqual([]);
  });

  it('should accept positive integer version numbers', () => {
    // Given manifests with different version numbers
    const manifestPath = join(testDir, 'agent.manifest.json');

    for (const version of [1, 2, 10, 100]) {
      const manifest = { version, skills: [] };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // When loading
      const result = loadManifest(manifestPath);

      // Then should accept valid versions
      expect(result.manifest.version).toBe(version);
    }
  });

  it('should reject non-positive version numbers', () => {
    // Given manifests with invalid version numbers
    const manifestPath = join(testDir, 'agent.manifest.json');

    for (const version of [0, -1, -10]) {
      const manifest = { version, skills: [] };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // When loading
      // Then should throw validation error
      expect(() => loadManifest(manifestPath)).toThrow(/Failed to load manifest/);
    }
  });
});
