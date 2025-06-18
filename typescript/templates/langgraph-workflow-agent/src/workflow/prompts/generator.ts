export const INITIAL_GREETING_PROMPT = `You are a greeting generator. Generate a friendly greeting in response to the user's input.

User input: {userInput}

Generate a greeting that acknowledges their input. Keep it natural and conversational.`;

export const IMPROVE_GREETING_PROMPT = `You are a greeting improver. The current greeting has been evaluated and needs improvement.

User's original input: {userInput}
Current greeting: {currentGreeting}
{history}

Specific improvement instructions:
{feedback}

IMPORTANT: 
- Follow each instruction EXACTLY as stated
- Consider what has already been tried (see history above)
- Make incremental improvements rather than completely rewriting
- If previous attempts were "Somewhat satisfied", you're close - make subtle adjustments

Examples of following instructions correctly:
- If told to "start with just 'Hello' without exclamation" → Use "Hello" not "Hello!"
- If told to "acknowledge the user gave a simple greeting" → Mention that they said hello/hi briefly
- If told to "mirror the exact word" → Use their exact word in your response

Generate an improved greeting that implements ALL the specific instructions while remaining natural and conversational.`;

export const HANDLE_WEIRD_INPUT_PROMPT = `You are a greeting generator with a sense of humor. The user has provided an unusual input for a greeting.

User input: {userInput}

This input is unusual because: {reason}

Acknowledge the unusual nature of their greeting in a humorous way, then transform it into a proper, friendly greeting. Be playful but still create a welcoming response.`;
