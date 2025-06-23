import { describe, it, expect } from 'vitest';
import {
  isAcceptableSatisfaction,
  getLowestSatisfaction,
  createInitialState,
  SATISFACTION_LEVELS,
  type SatisfactionLevel,
} from '../../src/workflow/state.js';

describe('State Utilities', () => {
  describe('isAcceptableSatisfaction', () => {
    it('should return true for "Very satisfied"', () => {
      expect(isAcceptableSatisfaction('Very satisfied')).toBe(true);
    });

    it('should return true for "Extremely satisfied"', () => {
      expect(isAcceptableSatisfaction('Extremely satisfied')).toBe(true);
    });

    it('should return false for "Satisfied"', () => {
      expect(isAcceptableSatisfaction('Satisfied')).toBe(false);
    });

    it('should return false for "Somewhat satisfied"', () => {
      expect(isAcceptableSatisfaction('Somewhat satisfied')).toBe(false);
    });

    it('should return false for "Not satisfied"', () => {
      expect(isAcceptableSatisfaction('Not satisfied')).toBe(false);
    });
  });

  describe('getLowestSatisfaction', () => {
    it('should return the lowest satisfaction level from mixed levels', () => {
      const levels: SatisfactionLevel[] = ['Very satisfied', 'Not satisfied', 'Satisfied'];
      expect(getLowestSatisfaction(levels)).toBe('Not satisfied');
    });

    it('should handle all same levels', () => {
      const levels: SatisfactionLevel[] = ['Satisfied', 'Satisfied', 'Satisfied'];
      expect(getLowestSatisfaction(levels)).toBe('Satisfied');
    });

    it('should handle single level', () => {
      expect(getLowestSatisfaction(['Extremely satisfied'])).toBe('Extremely satisfied');
    });

    it('should return "Not satisfied" for empty array', () => {
      expect(getLowestSatisfaction([])).toBe('Not satisfied');
    });

    it('should correctly order all satisfaction levels', () => {
      const allLevels: SatisfactionLevel[] = [...SATISFACTION_LEVELS];
      expect(getLowestSatisfaction(allLevels)).toBe('Not satisfied');

      const withoutWorst: SatisfactionLevel[] = allLevels.slice(1);
      expect(getLowestSatisfaction(withoutWorst)).toBe('Somewhat satisfied');

      const topTwo: SatisfactionLevel[] = ['Very satisfied', 'Extremely satisfied'];
      expect(getLowestSatisfaction(topTwo)).toBe('Very satisfied');
    });
  });

  describe('createInitialState', () => {
    it('should create initial state with user input', () => {
      const state = createInitialState('hello world');

      expect(state.userInput).toBe('hello world');
      expect(state.currentGreeting).toBe('');
      expect(state.iteration).toBe(0);
      expect(state.maxIterations).toBe(3);
      expect(state.isAcceptable).toBe(false);
    });

    it('should initialize all satisfaction levels to "Not satisfied"', () => {
      const state = createInitialState('test');

      expect(state.overallSatisfaction).toBe('Not satisfied');
      expect(state.evaluationCriteria.friendliness).toBe('Not satisfied');
      expect(state.evaluationCriteria.engagement).toBe('Not satisfied');
      expect(state.evaluationCriteria.personalization).toBe('Not satisfied');
    });

    it('should initialize empty arrays', () => {
      const state = createInitialState('test');

      expect(state.feedback).toEqual([]);
      expect(state.evaluationHistory).toEqual([]);
      expect(state.feedbackHistory).toEqual([]);
    });
  });
});
