export interface PromptParameter {
  name: string;
  type: 'text' | 'number' | 'email' | 'select' | 'boolean';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  description?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  triggerWords: string[];
  template: string;
  parameters: PromptParameter[];
  category?: string;
  example?: string;
}

export const promptTemplates: PromptTemplate[] = [
  {
    id: 'swapTokens',
    name: 'Swap Tokens',
    description: 'Swap tokens between different blockchains',
    triggerWords: ['swap', 'exchange', 'trade'],
    template: 'Swap {fromToken} to {toToken} on {chain}',
    parameters: [
      {
        name: 'fromToken',
        type: 'text',
        placeholder: 'From token (e.g., USDC)',
        required: true,
      },
      {
        name: 'toToken',
        type: 'text',
        placeholder: 'To token (e.g., ETH)',
        required: true,
      },
      {
        name: 'chain',
        type: 'text',
        placeholder: 'Chain (e.g., ethereum)',
        required: true,
      },
    ],
  },
];

export function findPromptByTrigger(text: string): PromptTemplate | null {
  const lowerText = text.toLowerCase().trim();
  for (const template of promptTemplates) {
    for (const trigger of template.triggerWords) {
      if (lowerText.startsWith(trigger.toLowerCase())) {
        return template;
      }
    }
  }
  return null;
}

export function getPromptSuggestions(text: string): PromptTemplate[] {
  const lowerText = text.toLowerCase().trim();
  return promptTemplates.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerText) ||
      template.description.toLowerCase().includes(lowerText) ||
      template.triggerWords.some((word) => word.toLowerCase().includes(lowerText)),
  );
}
