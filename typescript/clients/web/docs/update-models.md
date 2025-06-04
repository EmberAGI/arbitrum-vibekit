# Update Models and LLM Providers

The Vibekit Web Frontend allows users to select different Large Language Models (LLMs) for various tasks. This document explains how models are defined for the frontend UI and how to configure different LLM providers.

## Understanding the Model Configuration Layers

Model configuration in Vibekit involves two main parts:

1.  **Frontend Model Definitions in [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts):**

    - This file defines the list of models that appear in the web frontend's user interface.
    - It also sets a `DEFAULT_CHAT_MODEL`.
    - Note that this file does not handle the actual connection to LLM providers or API keys.

2.  **Web Client's LLM Orchestration and Provider Configuration:**
    - The web client's server-side logic (acting as the primary orchestrator) is responsible for taking the `id` of the model selected in the frontend UI and then making the actual call to the chosen LLM provider using the configurations described in this document.
    - The model and provider settings (in [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts) and [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts)) are for the LLM directly utilized by the web client to process user chat, generate responses, and orchestrate tools.

## Configuring Frontend Model Options

To change the models available for selection in the web UI, or to change their display names and descriptions, you'll edit [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts). To add a new model option such as the `anthropic-direct-sonnet` model, append a new object to the `chatModels` array:

```ts
export const DEFAULT_CHAT_MODEL: string = 'chat-model';

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Chat model',
    description: 'Primary model for all-purpose requests',
  },
  {
    id: 'chat-model-medium',
    name: 'Medium reasoning',
    description: 'Uses medium level reasoning for more complex requests',
  },
  // You can add more model definitions here
  {
    id: 'anthropic-direct-sonnet', // This ID will be sent to your agent's backend
    name: 'Anthropic Claude Sonnet (Direct)',
    description: 'Uses Claude 3.5 Sonnet directly via Anthropic API.',
  },
];
```

If you want this new model to be the default selection in the UI, update the `DEFAULT_CHAT_MODEL` constant:

```ts
export const DEFAULT_CHAT_MODEL: string = 'anthropic-direct-sonnet';
```

**Note:** Adding a model here only makes it appear in the UI. You must also configure your the web client to handle the new `id` (e.g., `'anthropic-direct-sonnet'`). To do so, update [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts) to add the new model ID in the `languageModels` map of your chosen provider (e.g., `openRouterProvider` or `grokProvider`) so the web client knows how to instantiate and call your new model:

```ts
// ...

export const openRouterProvider = isTestEnvironment
  ? customProvider({
      // ...
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

        // New entry for the 'anthropic-direct-sonnet' ID from models.ts
        'anthropic-direct-sonnet': openRouter('anthropic/claude-3.5-sonnet'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });

// ...
```

## Switching the Default Provider from OpenRouter to Hyperbolic

The default configuration in [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts) primarily uses `OpenRouter`. If you wish to use `Hyperbolic` (from `HyperbolicLabs`) as your main LLM provider for the frontend UI, you'll need to modify this configuration file.

**1. Install the Hyperbolic AI SDK Provider:**

First, add the Hyperbolic AI SDK provider package to your web client's dependencies.Open your terminal, navigate to the web client directory, and run:

```bash
cd typescript/clients/web &&
pnpm add @hyperbolic/ai-sdk-provider
```

After adding the package, navigate back to the `typescript` root directory and run `pnpm install` to update dependencies, followed by `pnpm build` if necessary.

**2. Update Environment Variables:**

Ensure your `Hyperbolic` API key is set in your `.env` file.

```env
# Add your Hyperbolic API Key
HYPERBOLIC_API_KEY="your-hyperbolic-api-key"
```

**3. Modify [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts):**

The main steps are:

a. Import the initialization function for the Hyperbolic provider (e.g., `createHyperbolic`) from its SDK package.

b. Instantiate the Hyperbolic provider using your API key.

c. Update the `languageModels` map within the `customProvider` configuration to use your Hyperbolic provider instance and the correct Hyperbolic model identifiers.

Below is an example of how `providers.ts` might be modified:

```typescript
import { customProvider, extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
s;
import { createHyperbolic } from '@hyperbolic/ai-sdk-provider'; // Import Hyperbolic
// ...

// Initialize Hyperbolic provider
const hyperbolic = createHyperbolic({
  apiKey: process.env.HYPERBOLIC_API_KEY, // Ensure HYPERBOLIC_API_KEY is set
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
        // Update model definitions to use Hyperbolic and its model IDs.
        // Replace with actual Hyperbolic model ID
        'chat-model': hyperbolic('hyperbolic-main-chat-model-id'),
        'chat-model-medium': hyperbolic('hyperbolic-medium-model-id'),
        'title-model': hyperbolic('hyperbolic-title-generation-model-id'),
        'artifact-model': hyperbolic('hyperbolic-artifact-model-id'),
      },
    });

// ...
```

**4. Update `models.ts`:**

After configuring Hyperbolic in [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts), review [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts). You might need to update the `name` and `description` for your model IDs to accurately reflect that they are now served via Hyperbolic.
