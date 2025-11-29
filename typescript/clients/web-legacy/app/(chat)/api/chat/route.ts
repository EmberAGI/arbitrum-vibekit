import type { UIMessage } from 'ai';
import {
  convertToModelMessages,
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
  generateUUID,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { isProductionEnvironment } from '@/lib/constants';
import { openRouterProvider } from '@/lib/ai/providers';
import { getTools as getDynamicTools } from '@/lib/ai/tools/tool-agents';
import type { Session } from 'next-auth';
import { z } from 'zod';

const ContextSchema = z.object({
  walletAddress: z.string().optional(),
});
type Context = z.infer<typeof ContextSchema>;

export const maxDuration = 300;

export async function POST(request: Request) {
  console.log('🔍 [ROUTE] POST request started');

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

    console.log('🔍 [ROUTE] Request parsed:', {
      messageCount: messages?.length,
      selectedChatModel,
      context,
      chatId: id,
    });

    // === AUTH ===
    const session: Session | null = await auth();
    console.log('🔍 [ROUTE] Auth result:', session ? '✅ Authenticated' : '❌ No session');

    const validationResult = ContextSchema.safeParse(context);
    if (!validationResult.success) {
      console.error('❌ [ROUTE] Context validation failed:', validationResult.error.issues);
      return new Response(JSON.stringify(validationResult.error.issues), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validatedContext = validationResult.data;
    console.log('🔍 [ROUTE] Context validated:', validatedContext);

    if (!session?.user?.id) {
      console.error('❌ [ROUTE] Unauthorized request — missing user session');
      return new Response('Unauthorized', { status: 401 });
    }

    // === USER MESSAGE ===
    const userMessage = getMostRecentUserMessage(messages);
    if (!userMessage) {
      console.error('❌ [ROUTE] No user message found in request');
      return new Response('No user message found', { status: 400 });
    }
    console.log('🔍 [ROUTE] User message retrieved:', {
      id: userMessage.id,
      partCount: userMessage.parts?.length,
    });

    // === CHAT LOOKUP ===
    console.log('🔍 [ROUTE] Checking if chat exists...');
    const chat = await getChatById({ id });
    console.log('🔍 [ROUTE] Chat lookup result:', chat ? '✅ Found' : '❌ Not found');

    if (!chat) {
      console.log('🔍 [ROUTE] Creating new chat entry...');
      try {
        const title = await generateTitleFromUserMessage({ message: userMessage });
        console.log('✅ [ROUTE] Title generated:', title);
        await saveChat({
          id,
          userId: session.user.id,
          title,
          address: validatedContext.walletAddress || '',
        });
        console.log('✅ [ROUTE] Chat saved successfully');
      } catch (error) {
        console.error('❌ [ROUTE] Failed to create chat:', error);
        throw error;
      }
    } else if (chat.userId !== session.user.id) {
      console.error('❌ [ROUTE] Unauthorized access to chat ID:', id);
      return new Response('Unauthorized', { status: 401 });
    } else {
      console.log('✅ [ROUTE] Existing chat validated for user');
    }

    // === SAVE USER MESSAGE ===
    console.log('🔍 [ROUTE] Saving user message...');
    try {
      const fileAttachments = userMessage.parts
        .filter(
          (part): part is { type: 'file'; mediaType: string; filename?: string; url: string } =>
            part.type === 'file'
        )
        .map((part) => ({
          url: part.url,
          name: part.filename ?? 'file',
          size: 0,
          type: part.mediaType,
        }));

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: userMessage.id,
            role: 'user',
            parts: userMessage.parts,
            attachments: fileAttachments,
            createdAt: new Date(),
          },
        ],
      });
      console.log('✅ [ROUTE] User message saved successfully');
    } catch (error) {
      console.error('❌ [ROUTE] Error saving user message:', error);
      throw error;
    }

    let dynamicTools: Awaited<ReturnType<typeof getDynamicTools>>;
    try {
      dynamicTools = await getDynamicTools();
    } catch (error) {
      console.error('❌ [ROUTE] Error loading dynamic tools:', error);
      dynamicTools = {};
    }

    console.log('[ROUTE] Executing stream...');

    try {
      const model = openRouterProvider.languageModel(selectedChatModel);
      console.log('🔍 [ROUTE] Model initialized:', selectedChatModel);

      const systemPromptText = systemPrompt({
        selectedChatModel,
        walletAddress: validatedContext.walletAddress,
      });

      console.log('🔍 [ROUTE] System prompt generated.');
      console.log('🔍 [ROUTE] System prompt:', systemPromptText);

      const result = streamText({
        model,
        system: systemPromptText,
        messages: convertToModelMessages(messages),
        experimental_transform: smoothStream({ chunking: 'word' }),
        tools: {
          ...(dynamicTools as any),
        },
        experimental_telemetry: {
          isEnabled: isProductionEnvironment,
          functionId: 'stream-text',
        },
      });

      console.log("[ROUTE] streamText() result", result);

      console.log('✅ [ROUTE] streamText() initialized successfully');

      return result.toUIMessageStreamResponse({
        sendReasoning: true,
        onFinish: async ({ messages }) => {
          console.log('🔍 [ROUTE] onFinish() triggered — assistant response ready');

          if (!session.user?.id) {
            console.warn('⚠️ [ROUTE] No valid user session during save');
            return;
          }

          try {
            const assistantMessages = messages.filter(
              (message) => message.role === 'assistant',
            );
            console.log('🔍 [ROUTE] Assistant messages found:', assistantMessages.length);
            console.log('🔍 [ROUTE] Assistant messages:', assistantMessages);

            if (assistantMessages.length === 0) {
              throw new Error('No assistant message found');
            }

            const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
            console.log('🔍 [ROUTE] Saving last assistant message:', lastAssistantMessage.id);

            const assistantFileAttachments = lastAssistantMessage.parts
              .filter(
                (part): part is { type: 'file'; mediaType: string; filename?: string; url: string } =>
                  part.type === 'file'
              )
              .map((part) => ({
                url: part.url,
                name: part.filename ?? 'file',
                size: 0,
                type: part.mediaType,
              }));

            await saveMessages({
              messages: [
                {
                  id: lastAssistantMessage.id || generateUUID(),
                  chatId: id,
                  role: lastAssistantMessage.role,
                  parts: lastAssistantMessage.parts,
                  attachments: assistantFileAttachments,
                  createdAt: new Date(),
                },
              ],
            });
            console.log('✅ [ROUTE] Assistant message saved successfully');
          } catch (saveError) {
            console.error('❌ [ROUTE] Failed to save assistant response:', saveError);
          }
        },
      });
    } catch (streamError) {
      console.error('[ROUTE] Stream error details:', {
        name: streamError instanceof Error ? streamError.name : 'Unknown',
        message:
          streamError instanceof Error
            ? streamError.message
            : String(streamError),
        stack: streamError instanceof Error ? streamError.stack : undefined,
      });
      throw streamError;
    }
  } catch (error) {
    console.error('❌ [ROUTE] Main POST error:', error);
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
  console.log('🔍 [ROUTE] DELETE request started');
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  console.log('🔍 [ROUTE] DELETE - chatId:', id);

  if (!id) {
    console.error('❌ [ROUTE] Missing chat ID in delete request');
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  console.log('🔍 [ROUTE] DELETE - session check:', session ? '✅ Yes' : '❌ No');

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });
    if (!chat) {
      console.warn('⚠️ [ROUTE] DELETE - Chat not found');
      return new Response('Chat not found', { status: 404 });
    }

    if (chat.userId !== session.user.id) {
      console.error('❌ [ROUTE] DELETE - Unauthorized access to chat');
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });
    console.log('✅ [ROUTE] Chat deleted successfully');
    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
