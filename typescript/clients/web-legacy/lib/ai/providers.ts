import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';
import { xai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.mock';

const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const openRouterProvider: any = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': openRouter('google/gemini-2.5-pro-preview', {
          reasoning: {
            exclude: true,
            effort: 'low',
          },
        }) as any,
        'chat-model-medium': openRouter('google/gemini-2.5-pro-preview', {
          reasoning: {
            effort: 'medium',
          },
        }) as any,
        'title-model': openRouter('google/gemini-2.5-flash') as any,
        'artifact-model': openRouter('google/gemini-2.5-flash') as any,
      },
      imageModels: {
        'small-model': xai.image('grok-2-image') as any,
      },
    });

export const grokProvider: any = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('grok-2-1212') as any,
        'chat-model-reasoning': wrapLanguageModel({
          model: groq('deepseek-r1-distill-llama-70b') as any,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }) as any,
        'title-model': xai('grok-2-1212') as any,
        'artifact-model': xai('grok-2-1212') as any,
      },
      imageModels: {
        'small-model': xai.image('grok-2-image') as any,
      },
    });
