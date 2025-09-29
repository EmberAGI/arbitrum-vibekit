// Satisfaction levels from worst to best
export const SATISFACTION_LEVELS = [
  'Not satisfied',
  'Somewhat satisfied',
  'Satisfied',
  'Very satisfied',
  'Extremely satisfied',
] as const;

export type SatisfactionLevel = (typeof SATISFACTION_LEVELS)[number];

// Acceptable satisfaction levels that terminate the workflow
export const ACCEPTABLE_LEVELS: SatisfactionLevel[] = ['Very satisfied', 'Extremely satisfied'];

// Check if a satisfaction level is acceptable
export function isAcceptableSatisfaction(level: SatisfactionLevel): boolean {
  return ACCEPTABLE_LEVELS.includes(level);
}

// Get the lowest satisfaction level from a set of criteria
export function getLowestSatisfaction(levels: SatisfactionLevel[]): SatisfactionLevel {
  if (levels.length === 0) {
    return 'Not satisfied'; // Default to worst if no levels provided
  }
  const indices = levels.map(level => SATISFACTION_LEVELS.indexOf(level));
  const lowestIndex = Math.min(...indices);
  return SATISFACTION_LEVELS[lowestIndex] as SatisfactionLevel;
}

// State interface for the greeting workflow
export interface GreetingState {
  // Core content
  userInput: string;
  currentGreeting: string;

  // Evaluation with satisfaction scale
  overallSatisfaction: SatisfactionLevel;
  evaluationCriteria: {
    friendliness: SatisfactionLevel;
    engagement: SatisfactionLevel;
    personalization: SatisfactionLevel;
  };
  feedback: string[]; // Qualitative feedback points

  // Workflow control
  iteration: number;
  maxIterations: number;
  isAcceptable: boolean; // True when "Very" or "Extremely" satisfied

  // History for full details response
  evaluationHistory: Array<{
    iteration: number;
    satisfaction: SatisfactionLevel;
    greeting: string;
  }>;
  feedbackHistory: string[][];
}

// Initial state factory
export function createInitialState(userInput: string): GreetingState {
  return {
    userInput,
    currentGreeting: '',
    overallSatisfaction: 'Not satisfied',
    evaluationCriteria: {
      friendliness: 'Not satisfied',
      engagement: 'Not satisfied',
      personalization: 'Not satisfied',
    },
    feedback: [],
    iteration: 0,
    maxIterations: 3,
    isAcceptable: false,
    evaluationHistory: [],
    feedbackHistory: [],
  };
}
