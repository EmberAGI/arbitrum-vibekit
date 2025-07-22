import { describe, test, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AskCamelot File Loading', () => {
  beforeAll(() => {
    // Set required environment variables for testing
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  test('should have camelot-01.md file in encyclopedia directory', async () => {
    const docPath = path.resolve(__dirname, '../encyclopedia/camelot-01.md');

    // Check file exists
    const exists = await fs
      .access(docPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  test('should be able to load camelot documentation content', async () => {
    const docPath = path.resolve(__dirname, '../encyclopedia/camelot-01.md');

    // Load the file
    const content = await fs.readFile(docPath, 'utf-8');

    // Verify content
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(1000); // Should be substantial
    expect(content).toContain('# Camelot (Cryptocurrency Protocol)');
    expect(content).toContain('GRAIL');
    expect(content).toContain('xGRAIL');
    expect(content).toContain('decentralized exchange');
    expect(content).toContain('Arbitrum');
  });

  test('should have all expected documentation files after build', async () => {
    const distPath = path.resolve(__dirname, '../dist/encyclopedia');

    // Check if dist directory exists (after build)
    const distExists = await fs
      .access(distPath)
      .then(() => true)
      .catch(() => false);

    if (distExists) {
      const files = await fs.readdir(distPath);
      expect(files).toContain('camelot-01.md');
      expect(files).toContain('aave-01.md');
      expect(files).toContain('aave-02.md');
    }
  });
});
