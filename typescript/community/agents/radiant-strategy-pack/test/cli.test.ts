import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

describe('CLI Tests', () => {
  const CLI_PATH = 'node dist/cli.js';

  beforeEach(() => {
    delete process.env.PRIVATE_KEY;
  });

  describe('Help Command', () => {
    it('should display help message', () => {
      const output = execSync(`${CLI_PATH} help`, { encoding: 'utf-8' });
      expect(output).toContain('Radiant Strategy Pack CLI');
      expect(output).toContain('loop');
      expect(output).toContain('shield');
      expect(output).toContain('compound');
    });
  });

  describe('Loop Command', () => {
    it('should fail without PRIVATE_KEY', () => {
      expect(() => {
        execSync(`${CLI_PATH} loop --token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });

    it('should fail without token parameter', () => {
      process.env.PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
      expect(() => {
        execSync(`${CLI_PATH} loop`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });
  });

  describe('Shield Command', () => {
    it('should fail without PRIVATE_KEY', () => {
      expect(() => {
        execSync(`${CLI_PATH} shield --token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });

    it('should fail without token parameter', () => {
      process.env.PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
      expect(() => {
        execSync(`${CLI_PATH} shield`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });
  });

  describe('Compound Command', () => {
    it('should fail without PRIVATE_KEY', () => {
      expect(() => {
        execSync(`${CLI_PATH} compound --target 0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });

    it('should fail without target parameter', () => {
      process.env.PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
      expect(() => {
        execSync(`${CLI_PATH} compound`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });
  });

  describe('Invalid Command', () => {
    it('should show error for unknown command', () => {
      expect(() => {
        execSync(`${CLI_PATH} invalid`, { 
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }).toThrow();
    });
  });
});
