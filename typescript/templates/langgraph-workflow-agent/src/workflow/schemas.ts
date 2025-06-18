import { z } from 'zod';

// Satisfaction levels
export const satisfactionLevelSchema = z.enum([
  'Not satisfied',
  'Somewhat satisfied',
  'Satisfied',
  'Very satisfied',
  'Extremely satisfied',
]);

// Evaluation output schema
export const evaluationOutputSchema = z.object({
  criteria: z.object({
    friendliness: satisfactionLevelSchema,
    engagement: satisfactionLevelSchema,
    personalization: satisfactionLevelSchema,
  }),
  improvements: z.object({
    friendliness: z.array(z.string()).optional(),
    engagement: z.array(z.string()).optional(),
    personalization: z.array(z.string()).optional(),
  }),
  overallAssessment: z.string(),
});

// Optimizer strategy schema
export const optimizerStrategySchema = z.object({
  strategy: z.enum(['incremental', 'major_revision', 'maintain']),
  priority: z.enum(['friendliness', 'engagement', 'personalization', 'balanced']),
  specificInstructions: z.array(z.string()).max(3),
  continueIterating: z.boolean(),
  reasoning: z.string(),
});

export type SatisfactionLevel = z.infer<typeof satisfactionLevelSchema>;
export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
export type OptimizerStrategy = z.infer<typeof optimizerStrategySchema>;
