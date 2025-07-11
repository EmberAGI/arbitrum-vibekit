import type { UIMessage } from 'ai';
import {
  createDataStreamResponse,
  appendResponseMessages,
  smoothStream,
  streamText,
  DataStreamWriter,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  getTrailingMessageId,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
// import { createDocument } from '@/lib/ai/tools/create-document';
// import { updateDocument } from '@/lib/ai/tools/update-document';
// import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
// import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { openRouterProvider } from '@/lib/ai/providers';
import { getTools as getDynamicTools } from '@/lib/ai/tools/tool-agents';

import type { Session } from 'next-auth';

import { z } from 'zod';

const ContextSchema = z.object({
  walletAddress: z.string().optional(),
});
type Context = z.infer<typeof ContextSchema>;

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = generateUUID();
  console.log(`[Chat API] Starting POST request - ID: ${requestId}`);
  
  // Initialize error collection
  let errorMessage: string | null = null;
  let errorContext: string = '';

  // Helper function to safely execute operations
  const safeExecute = async <T>(
    operation: () => Promise<T>,
    context: string,
    defaultValue?: T
  ): Promise<T | undefined> => {
    try {
      return await operation();
    } catch (error) {
      errorContext = context;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Chat API] Error in ${context}:`, {
        requestId,
        context,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      return defaultValue;
    }
  };

  // Parse request body
  const requestData = await safeExecute(
    async () => {
      const data = await request.json();
      return data as {
        id: string;
        messages: Array<UIMessage>;
        selectedChatModel: string;
        context: Context;
      };
    },
    'parsing request body'
  );

  if (errorMessage || !requestData) {
    console.error(`[Chat API] Failed to parse request body - ID: ${requestId}`);
    return new Response(
      JSON.stringify({ error: errorMessage || 'Failed to parse request body' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const { id, messages, selectedChatModel, context } = requestData;
  console.log(`[Chat API] Request parsed - ID: ${requestId}`, {
    chatId: id,
    messageCount: messages.length,
    model: selectedChatModel,
    hasWalletAddress: !!context.walletAddress
  });

  // Get session
  const session = await safeExecute(
    () => auth(),
    'authenticating user'
  ) as Session | null | undefined;

  console.log(`[Chat API] Authentication check - ID: ${requestId}`, {
    authenticated: !!session,
    userId: session?.user?.id || 'none'
  });

  // Validate context
  const validationResult = ContextSchema.safeParse(context);

  if (!validationResult.success) {
    console.error(`[Chat API] Context validation failed - ID: ${requestId}`, {
      errors: validationResult.error.errors
    });
    return new Response(JSON.stringify(validationResult.error.errors), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const validatedContext = validationResult.data;

  if (!session || !session.user || !session.user.id) {
    console.warn(`[Chat API] Unauthorized request - ID: ${requestId}`);
    return new Response('Unauthorized', { status: 401 });
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    console.error(`[Chat API] No user message found - ID: ${requestId}`);
    return new Response('No user message found', { status: 400 });
  }

  console.log(`[Chat API] Processing user message - ID: ${requestId}`, {
    messageId: userMessage.id,
    messageLength: JSON.stringify(userMessage).length
  });

  // Get chat
  const chat = await safeExecute(
    () => getChatById({ id }),
    'fetching chat'
  );

  if (errorMessage) {
    return createDataStreamResponse({
      execute: async (dataStream: DataStreamWriter) => {
        await streamError(dataStream, errorMessage!, errorContext);
      },
    });
  }

  // Handle chat creation or authorization
  if (!chat) {
    console.log(`[Chat API] Creating new chat - ID: ${requestId}`, { chatId: id });
    
    const title = await safeExecute(
      () => generateTitleFromUserMessage({ message: userMessage }),
      'generating title',
      'New Chat'
    );

    await safeExecute(
      () => saveChat({
        id,
        userId: session.user.id,
        title: title || 'New Chat',
        address: validatedContext.walletAddress || ""
      }),
      'saving new chat'
    );
  } else {
    console.log(`[Chat API] Using existing chat - ID: ${requestId}`, { 
      chatId: id,
      chatUserId: chat.userId
    });
    
    if (chat.userId !== session.user.id) {
      console.warn(`[Chat API] Unauthorized chat access - ID: ${requestId}`, {
        chatId: id,
        chatUserId: chat.userId,
        requestUserId: session.user.id
      });
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // Save user message
  await safeExecute(
    () => saveMessages({
      messages: [
        {
          chatId: id,
          id: userMessage.id,
          role: 'user',
          parts: userMessage.parts,
          attachments: userMessage.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    }),
    'saving user message'
  );

  console.log(`[Chat API] Starting stream response - ID: ${requestId}`, { chatId: id });

  return createDataStreamResponse({
    execute: async (dataStream: DataStreamWriter) => {
      try {
        // Get dynamic tools
        const dynamicTools = await safeExecute(
          () => getDynamicTools(),
          'loading dynamic tools',
          {}
        );

        if (errorMessage) {
          await streamError(dataStream, errorMessage, errorContext);
          return;
        }

        console.log(`[Chat API] Loaded dynamic tools - ID: ${requestId}`, {
          toolCount: Object.keys(dynamicTools || {}).length,
          toolNames: Object.keys(dynamicTools || {})
        });

        // Create language model
        const model = await safeExecute(
          () => openRouterProvider.languageModel(selectedChatModel),
          'creating language model'
        );

        if (errorMessage || !model) {
          await streamError(
            dataStream,
            errorMessage || 'Failed to create language model',
            errorContext || 'creating language model'
          );
          return;
        }

        // Generate system prompt
        const prompt = await safeExecute(
          async () => await systemPrompt({
            selectedChatModel,
            walletAddress: validatedContext.walletAddress,
          }),
          'generating system prompt',
          ''
        );

        if (errorMessage) {
          await streamError(dataStream, errorMessage, errorContext);
          return;
        }

        console.log(`[Chat API] Starting text stream - ID: ${requestId}`, {
          model: selectedChatModel,
          maxSteps: 20,
          hasTools: !!dynamicTools && Object.keys(dynamicTools).length > 0
        });

        // Stream text
        const result = await safeExecute(
          () => streamText({
            model,
            system: prompt || '',
            messages,
            maxSteps: 20,
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: dynamicTools || {},
            onFinish: async ({ response }: { response: any }) => {
              if (session.user?.id) {
                await safeExecute(
                  async () => {
                    const assistantId = getTrailingMessageId({
                      messages: response.messages.filter(
                        (message: any) => message.role === 'assistant',
                      ),
                    });

                    if (!assistantId) {
                      throw new Error('No assistant message found!');
                    }

                    const [, assistantMessage] = appendResponseMessages({
                      messages: [userMessage],
                      responseMessages: response.messages,
                    });

                    await saveMessages({
                      messages: [
                        {
                          id: assistantId,
                          chatId: id,
                          role: assistantMessage.role,
                          parts: assistantMessage.parts,
                          attachments:
                            assistantMessage.experimental_attachments ?? [],
                          createdAt: new Date(),
                        },
                      ],
                    });
                    
                    console.log(`[Chat API] Saved assistant response - ID: ${requestId}`, {
                      assistantId,
                      chatId: id
                    });
                  },
                  'saving assistant message'
                );
              }
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          }),
          'streaming text'
        );

        if (errorMessage || !result) {
          await streamError(
            dataStream,
            errorMessage || 'Failed to stream text',
            errorContext || 'streaming text'
          );
          return;
        }

        console.log(`[Chat API] Stream created successfully - ID: ${requestId}`);

        // Merge stream
        await safeExecute(
          () => result?.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          }),
          'merging data stream'
        );

        if (errorMessage) {
          await streamError(dataStream, errorMessage, errorContext);
        } else {
          console.log(`[Chat API] Request completed successfully - ID: ${requestId}`);
        }
      } catch (error) {
        // This is the global catch for any unexpected errors
        console.error(`[Chat API] Unexpected error in stream - ID: ${requestId}`, {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });
        const message = error instanceof Error ? error.message : 'Unknown error';
        await streamError(dataStream, message, 'unexpected error');
      }
    },
    onError: (error: unknown) => {
      console.error(`[Chat API] Error in createDataStreamResponse - ID: ${requestId}`, {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      return 'An error occurred while setting up the response stream.';
    },
  });
}

// Helper function to stream error messages
async function streamError(
  dataStream: DataStreamWriter,
  errorMessage: string,
  context: string
) {
  try {
    console.error(`[Chat API] Streaming error response`, {
      context,
      errorMessage
    });
    
    // Generate a message ID for the error response
    const messageId = generateUUID();
    
    // Write the message annotation first
    dataStream.writeMessageAnnotation({
      messageId,
    });
    
    // Sanitize the error message
    const sanitizedError = errorMessage
      .replace(/"/g, "'")
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .trim();
    
    // Create the full error message
    const fullMessage = `I encountered an error while ${context}: ${sanitizedError}. Please try again or contact support if the issue persists.`;
    
    // Split into words for streaming
    const errorWords = fullMessage.split(' ');
    
    // Stream each word
    for (const word of errorWords) {
      dataStream.write(`0:"${word} "\n`);
    }
    
    // Write the finish event
    dataStream.write(`e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":${errorWords.length}},"isContinued":false}\n`);
    
    // Write the done event
    dataStream.write(`d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":${errorWords.length}}}\n`);
  } catch (streamError) {
    console.error('[Chat API] Critical error while streaming error message:', {
      originalError: errorMessage,
      streamError: streamError instanceof Error ? streamError.message : streamError
    });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
