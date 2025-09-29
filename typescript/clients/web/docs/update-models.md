# Update Models and LLM Providers

Vibekit's web frontend allows users to select different Large Language Models (LLMs) for various tasks. This document explains how models are defined for the frontend UI and how to configure different LLM providers.

## Understanding the Model Configuration Layers

Vibekit's model configuration involves two main parts:

1.  **Frontend Model Definitions in [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts):**
    - This file defines the list of models that appear in the web frontend's user interface.
    - It also sets a `DEFAULT_CHAT_MODEL`.
    - Note that this file does not handle the actual connection to LLM providers or API keys.

2.  **Backend LLM Orchestration:**
    - The web client's backend orchestrates the process by using an LLM to manage tasks. It uses the `id` of the model selected in the UI to call the appropriate LLM provider.
    - The orchestrating LLM relies on configurations in [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts) and [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts) to route requests for chat, response generation, and tool use.

For more information on frontend's architecture and how it works, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/README.md).

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

Make sure to set the `DEFAULT_CHAT_MODEL` constant to your new model to be able to interact with it through the UI:

```ts
export const DEFAULT_CHAT_MODEL: string = 'anthropic-direct-sonnet';
```

Note that adding a model here only makes it appear in the UI. You must also configure your the web client to handle the new `id` (e.g., `'anthropic-direct-sonnet'`). To do so, update [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts) to add the new model ID in the `languageModels` map of your chosen provider (e.g., `openRouterProvider` or `grokProvider`):

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
        'title-model': openRouter('google/gemini-2.5-flash'),
        'artifact-model': openRouter('google/gemini-2.5-flash'),

        // New entry for the 'anthropic-direct-sonnet' ID from models.ts
        'anthropic-direct-sonnet': openRouter('anthropic/claude-3.5-sonnet'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });

// ...
```

You can now [run the frontend](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/README.md#quickstart) and start interacting with your newly added chat model. Note that if you have already started the frontend, you need to rebuild it to reflect the changes:

```bash
docker compose down && docker volume rm typescript_db_data && docker compose build web --no-cache && docker compose up
```

## Switching the Default Provider (OpenRouter)

The default configuration in [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts) primarily uses `OpenRouter`. You can also use `Hyperbolic` (from `HyperbolicLabs`) as your main LLM provider for the frontend UI. To do so, you'll need to modify `providers.ts`.

**1. Install the Hyperbolic AI SDK Provider:**

First, add the Hyperbolic AI SDK provider package to your web client's dependencies. Open your terminal, navigate to the[ web client directory](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web), and run:

```bash
cd typescript/clients/web &&
pnpm add @hyperbolic/ai-sdk-provider
```

After adding the package, navigate back to the `typescript` root directory and update the dependencies:

```bash
cd ../.. &&
pnpm install
```

**2. Update Environment Variables:**

Ensure your Hyperbolic API key is set in your `.env` file in the `typescript` root directory.

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
// ...
import { createHyperbolic } from '@hyperbolic/ai-sdk-provider'; // Import Hyperbolic

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
        'chat-model': hyperbolic('DeepSeek-R1'),
        'chat-model-medium': hyperbolic('Llama-3.1-70B'),
        'title-model': hyperbolic('Llama-3.1-8B'),
        'artifact-model': hyperbolic('Qwen2.5-Coder-32B'),
      },
    });

// ...
```

> [!TIP]
> After switching to Hyperbolic, you should remove any OpenRouter-related code and references from your project. Additionally, for clarity and to avoid confusion, rename all instances of `openRouterProvider` to `hyperbolicProvider` in your codebase.

**4. Update `models.ts`:**

After configuring Hyperbolic in [`providers.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/providers.ts), review [`models.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/lib/ai/models.ts). You might need to update the `name` and `description` for your model IDs to match the ones defined in `providers.ts`.

**5. Run Frontend:**

You can now [run the frontend](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/clients/web/README.md#quickstart) with the updated Hyperbolic provider. Note that if you have already started the frontend, you need to rebuild it to reflect the changes:

```bash
docker compose down && docker volume rm typescript_db_data && docker compose build web --no-cache && docker compose up
```
