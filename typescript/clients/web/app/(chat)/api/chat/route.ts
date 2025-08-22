import type { UIMessage } from 'ai';
import { createDataStreamResponse, appendResponseMessages, smoothStream, streamText } from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import { deleteChatById, getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { queryTransactionHistory } from '@/lib/ai/tools/query-transaction-history';
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
      console.error('❌ [ROUTE] Context validation failed:', validationResult.error.errors);
      return new Response(JSON.stringify(validationResult.error.errors), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const validatedContext = validationResult.data;

    if (!session || !session.user || !session.user.id) {
      console.error('❌ [ROUTE] Unauthorized - no valid session');
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      console.error('❌ [ROUTE] No user message found');
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });

    if (!chat) {
      console.log('🔍 [ROUTE] No existing chat found, generating title...');
      console.log(
        '🔍 [ROUTE] userMessage for title generation:',
        JSON.stringify(userMessage, null, 2)
      );

      try {
        const title = await generateTitleFromUserMessage({
          message: userMessage,
        });
        // console.log('✅ [ROUTE] Title generated successfully:', title);

        // console.log('🔍 [ROUTE] Saving new chat with:', {
        //   id,
        //   userId: session.user.id,
        //   title,
        //   address: validatedContext.walletAddress || '',
        // });

        await saveChat({
          id,
          userId: session.user.id,
          title,
          address: validatedContext.walletAddress || '',
        });
      } catch (error) {
        console.error('❌ [ROUTE] Error in title generation or chat saving:', error);
        console.error('❌ [ROUTE] Error stack:', (error as Error)?.stack);
        throw error; // Re-throw to be caught by outer try-catch
      }
    } else {
      console.log('🔍 [ROUTE] Existing chat found:', chat);
      if (chat.userId !== session.user.id) {
        console.log('❌ [ROUTE] Unauthorized chat access attempt');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    try {
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
    } catch (error) {
      console.error('❌ [ROUTE] Error saving user message:', error);
      throw error;
    }



    let dynamicTools: any;
    try {
      dynamicTools = await getDynamicTools();

      if (Object.keys(dynamicTools).length === 0) {
        console.warn(
          '⚠️ [ROUTE] No dynamic tools were loaded. This may indicate connection issues with the agent servers.'
        );
      }
    } catch (error) {
      console.error('❌ [ROUTE] Error loading dynamic tools:', error);
      console.error('❌ [ROUTE] Will proceed without dynamic tools');
      dynamicTools = {};
    }

    // console.log('🔍 [ROUTE] Creating data stream response...');
    // console.log('🔍 [ROUTE] Selected chat model:', selectedChatModel);
    // console.log('🔍 [ROUTE] System prompt context:', {
    //   selectedChatModel,
    //   walletAddress: validatedContext.walletAddress,
    // });

    return createDataStreamResponse({
      execute: dataStream => {

        try {
          // console.log('🔍 [ROUTE] Getting language model for:', selectedChatModel);
          // console.log('🔍 [ROUTE] OpenRouter provider type:', typeof openRouterProvider);
          // console.log('🔍 [ROUTE] OpenRouter provider methods:', Object.keys(openRouterProvider));

          const model = openRouterProvider.languageModel(selectedChatModel);
        

          const systemPromptText = systemPrompt({
            selectedChatModel,
            walletAddress: validatedContext.walletAddress,
          });


          const result = streamText({
            model,
            system: systemPromptText,
            messages,
            maxSteps: 20,
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: {
              //getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              queryTransactionHistory: queryTransactionHistory({ session, dataStream }),
              //requestSuggestions: requestSuggestions({
              //  session,
              //  dataStream,
              //}),
              ...dynamicTools
              
            },
            onFinish: async ({ response }) => {
              if (session.user?.id) {
                try {
                  const assistantId = getTrailingMessageId({
                    messages: response.messages.filter(message => message.role === 'assistant'),
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
                        attachments: assistantMessage.experimental_attachments ?? [],
                        createdAt: new Date(),
                      },
                    ],
                  });
                } catch (saveError) {
                  console.error('❌ [ROUTE] Failed to save assistant response:', saveError);
                }
              }
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          });


          result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          });

        } catch (streamError) {
          console.error('❌ [ROUTE] Error in stream execution:', streamError);
          console.error('❌ [ROUTE] Stream error details:', {
            name: streamError instanceof Error ? streamError.name : 'Unknown',
            message: streamError instanceof Error ? streamError.message : String(streamError),
            stack: streamError instanceof Error ? streamError.stack : undefined,
          });
          throw streamError;
        }
      },
      onError: (error: unknown) => {
        console.error('❌ [ROUTE] DataStream error:', error);
        return `${error}`;
      },
    });
  } catch (error) {
    console.error('❌ [ROUTE] Main POST error:', error);
    console.error('❌ [ROUTE] Main error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const JSONerror = JSON.stringify(error, null, 2);
    return new Response(`An error occurred while processing your request! ${JSONerror}`, {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    console.error('❌ [ROUTE] DELETE - No ID provided');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    console.error('❌ [ROUTE] DELETE - Unauthorized');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      console.error('❌ [ROUTE] DELETE - Unauthorized chat access');
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('❌ [ROUTE] DELETE error:', error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}