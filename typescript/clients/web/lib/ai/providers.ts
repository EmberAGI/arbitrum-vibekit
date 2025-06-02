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
} from './models.test';

const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const openRouterProvider = isTestEnvironment
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
        }),
        'chat-model-medium': openRouter('google/gemini-2.5-pro-preview', {
          reasoning: {
            effort: 'medium',
          },
        }),
        'title-model': openRouter('google/gemini-2.5-flash-preview'),
        'artifact-model': openRouter('google/gemini-2.5-flash-preview'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });

export const grokProvider = isTestEnvironment
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
        'chat-model': xai('grok-2-1212'),
        'chat-model-reasoning': wrapLanguageModel({
          model: groq('deepseek-r1-distill-llama-70b'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': xai('grok-2-1212'),
        'artifact-model': xai('grok-2-1212'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
