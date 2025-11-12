import { generateText, type LanguageModel } from 'ai';
import type { GreetingState } from '../state.js';
import {
  INITIAL_GREETING_PROMPT,
  IMPROVE_GREETING_PROMPT,
  HANDLE_WEIRD_INPUT_PROMPT,
} from '../prompts/generator.js';

// Check if input is weird (numbers, very long, etc.)
function isWeirdInput(input: string): { isWeird: boolean; reason?: string } {
  // Check if it's just numbers
  if (/^\d+$/.test(input.trim())) {
    return { isWeird: true, reason: "it's just numbers" };
  }

  // Check if it's very long
  if (input.length > 100) {
    return { isWeird: true, reason: "it's unusually long for a greeting" };
  }

  // Check if it contains no letters
  if (!/[a-zA-Z]/.test(input)) {
    return { isWeird: true, reason: 'it contains no letters' };
  }

  // Check if it's just special characters
  if (/^[^a-zA-Z0-9\s]+$/.test(input.trim())) {
    return { isWeird: true, reason: "it's just special characters" };
  }

  return { isWeird: false };
}

export async function generatorNode(
  state: GreetingState,
  model: LanguageModel
): Promise<Partial<GreetingState>> {
  try {
    let prompt: string;
    const weirdCheck = isWeirdInput(state.userInput);

    if (state.iteration === 0) {
      // First iteration - generate initial greeting
      if (weirdCheck.isWeird) {
        prompt = HANDLE_WEIRD_INPUT_PROMPT.replace('{userInput}', state.userInput).replace(
          '{reason}',
          weirdCheck.reason || 'unusual format'
        );
      } else {
        prompt = INITIAL_GREETING_PROMPT.replace('{userInput}', state.userInput);
      }
    } else {
      // Build history of previous attempts for context
      let historyContext = '';
      if (state.evaluationHistory.length > 0) {
        historyContext = '\n\nPrevious attempts:\n';
        state.evaluationHistory.forEach(entry => {
          historyContext += `- "${entry.greeting}" (${entry.satisfaction})\n`;
        });
      }

      // Subsequent iterations - improve based on feedback
      prompt = IMPROVE_GREETING_PROMPT.replace('{userInput}', state.userInput)
        .replace('{currentGreeting}', state.currentGreeting)
        .replace('{feedback}', state.feedback.join('\n'))
        .replace('{history}', historyContext);
    }

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 200,
    });

    return {
      currentGreeting: text.trim(),
      iteration: state.iteration + 1,
    };
  } catch (error) {
    console.error('Generator node error:', error);
    // Return the current greeting if we have one, otherwise a fallback
    return {
      currentGreeting:
        state.currentGreeting || "Hello! I'm here to help. How can I assist you today?",
      iteration: state.iteration + 1,
    };
  }
}
