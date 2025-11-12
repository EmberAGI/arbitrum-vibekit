import type { UIMessage } from 'ai';
import {
  smoothStream,
  streamText,
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
  getMostRecentUserMessage,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { generateUUID } from '@/lib/utils';
import { createDataStreamResponse } from 'ai';
// import { createDocument } from '@/lib/ai/tools/create-document';
// import { updateDocument } from '@/lib/ai/tools/update-document';
// import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
// import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { openRouterProvider } from '@/lib/ai/providers';
import { getTools as getDynamicTools } from '@/lib/ai/tools/tool-agents';
// import { generateChart } from '@/lib/ai/tools/generate-chart'; // Now using MCP server

import type { Session } from 'next-auth';

import { z } from 'zod';

const ContextSchema = z.object({
  walletAddress: z.string().optional(),
});
type Context = z.infer<typeof ContextSchema>;

export const maxDuration = 300;

export async function POST(request: Request) {
  console.log('🔍 newwww [ROUTE] POST request started');
  try {
    const {
      id,
      messages,
      selectedChatModel,
      context,
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
      context: Context;
    } = await request.json();

    const session: Session | null = await auth();

    const validationResult = ContextSchema.safeParse(context);

    if (!validationResult.success) {
      return new Response(JSON.stringify(validationResult.error.issues), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const validatedContext = validationResult.data;
    console.log('🔍 [ROUTE] validatedContext:', validatedContext);

    if (!session || !session.user || !session.user.id) {
      console.error('❌ [ROUTE] Unauthorized - no valid session');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('🔍 [ROUTE] Getting most recent user message...');
    const userMessage = getMostRecentUserMessage(messages);
    console.log('🔍 [ROUTE] User message:', userMessage);

    if (!userMessage) {
      console.error('❌ [ROUTE] No user message found');
      return new Response('No user message found', { status: 400 });
    }

    console.log('🔍 [ROUTE] Getting chat by ID...');
    const chat = await getChatById({ id });
    console.log('🔍 [ROUTE] Chat result:', chat ? 'Found' : 'Not found');


    if (!chat) {
      try {
        const title = await generateTitleFromUserMessage({
          message: userMessage,
        });

        await saveChat({
          id,
          userId: session.user.id,
          title,
          address: validatedContext.walletAddress || '',
        });
      } catch (error) {
        console.error(
          '[ROUTE] Error in title generation or chat saving:',
          error,
        );
        throw error; // Re-throw to be caught by outer try-catch
      }
    } else {
      console.log('🔍 [ROUTE] Chat already exists');
      if (chat.userId !== session.user.id) {
        console.log('[ROUTE] Unauthorized chat access attempt');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    console.log('🔍 [ROUTE] Saving messages...');
    await saveMessages({
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
    });
    console.log('✅ [ROUTE] Messages saved successfully');

    console.log('Chat ID:', id);
    // Get dynamic tools with wallet context
    console.log('🔍 [ROUTE] Getting dynamic tools...');
    const dynamicTools = await getDynamicTools({ walletAddress: validatedContext.walletAddress });
    console.log('✅ [ROUTE] Dynamic tools loaded:', Object.keys(dynamicTools));
      console.log('🔍 [ROUTE] Dynamic tools details:', dynamicTools);

    console.log('🔍 [ROUTE] Creating data stream response...');

    return createDataStreamResponse({
      execute: (dataStream) => {
        console.log('🔍 [ROUTE] Executing streamText...');

        const result = streamText({
          model: openRouterProvider.languageModel(selectedChatModel),
          system: systemPrompt({
            selectedChatModel,
            walletAddress: validatedContext.walletAddress,
          }),
          messages,
          maxSteps: 20,
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            //getWeather,
            //createDocument: createDocument({ session, dataStream }),
            //updateDocument: updateDocument({ session, dataStream }),
            //requestSuggestions: requestSuggestions({
            //  session,
            //  dataStream,
            //}),
            ...dynamicTools,
          },
          onFinish: async ({ response }) => {
            console.log('🔍 [ROUTE] onFinish callback triggered');
            console.log('🔍 [ROUTE] StreamText finished');

            if (session.user?.id) {
              try {
                console.log('🔍 [ROUTE] Saving assistant message...');
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
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
                console.log('✅ [ROUTE] Assistant message saved successfully');
              } catch (error) {
                console.error('❌ [ROUTE] Failed to save chat:', error);
              }

              // Get the last assistant message
              const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

              if (!lastAssistantMessage) {
                throw new Error('No assistant message found!');
              }

              // Extract file attachments from message parts (v5 represents files as parts)
              const assistantFileAttachments = lastAssistantMessage.parts
                .filter((part): part is { type: 'file'; mediaType: string; filename?: string; url: string } =>
                  part.type === 'file'
                )
                .map((part) => ({
                  url: part.url,
                  name: part.filename ?? 'file',
                  size: 0, // Size not available in UIMessage parts
                  type: part.mediaType,
                }));

              await saveMessages({
                messages: [
                  {
                    id: lastAssistantMessage.id,
                    chatId: id,
                    role: lastAssistantMessage.role,
                    parts: lastAssistantMessage.parts,
                    attachments: assistantFileAttachments,
                    createdAt: new Date(),
                  },
                ],
              });
            } catch (saveError) {
              console.error(
                '[ROUTE] Failed to save assistant response:',
                saveError,
              );
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        console.log('✅ [ROUTE] StreamText created successfully');
        console.log('🔍 [ROUTE] StreamText result:', result);

        // result.consumeStream(); // Calling consumeStream() here buffers the entire response server-side, preventing streaming to the client.

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error: unknown) => {
        console.error('Error:', error);
        return `${error}`;
      },
    });
  } catch (error) {
    console.error('[ROUTE] Main POST error:', error);
    const JSONerror = JSON.stringify(error, null, 2);
    return new Response(
      `An error occurred while processing your request! ${JSONerror}`,
      {
        status: 500,
      },
    );
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
