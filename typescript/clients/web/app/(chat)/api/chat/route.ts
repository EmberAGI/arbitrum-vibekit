import type { UIMessage } from 'ai';
import {
  createDataStreamResponse,
  appendResponseMessages,
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

    console.log('🔍 [ROUTE] Request parsed - messages:', messages?.length);
    console.log('🔍 [ROUTE] selectedChatModel:', selectedChatModel);
    console.log('🔍 [ROUTE] context:', context);
    console.log('🔍 [ROUTE] Environment variables check:');
    console.log('🔍 [ROUTE] OPENROUTER_API_KEY exists:', !!process.env.OPENROUTER_API_KEY);
    console.log(
      '🔍 [ROUTE] OPENROUTER_API_KEY length:',
      process.env.OPENROUTER_API_KEY?.length || 0
    );
    console.log(
      '🔍 [ROUTE] OPENROUTER_API_KEY prefix:',
      process.env.OPENROUTER_API_KEY?.substring(0, 10) || 'N/A'
    );

    console.log('🔍 [ROUTE] id:', id);

    const session: Session | null = await auth();

    console.log('session', session);

    const validationResult = ContextSchema.safeParse(context);

    console.log('validationResult', validationResult);

    if (!validationResult.success) {
      return new Response(JSON.stringify(validationResult.error.errors), {
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
      console.log('🔍 [ROUTE] No existing chat found, generating title...');

      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });
      console.log('✅ [ROUTE] Title generated successfully:', title);

      console.log('🔍 [ROUTE] Saving chat...');
      await saveChat({ id, userId: session.user.id, title, address: validatedContext.walletAddress || "" });
      console.log('✅ [ROUTE] Chat saved successfully');
    } else {
      console.log('🔍 [ROUTE] Chat already exists');
      if (chat.userId !== session.user.id) {
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
    const JSONerror = JSON.stringify(error, null, 2);
    return new Response(
      `An error occurred while processing your request! ${JSONerror}`,
      {
        status: 404,
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