'use client';

import type { UIMessage } from 'ai';
import { memo } from 'react';
import { MessageRenderer } from './message.renderer';
import type { Vote } from '@/lib/db/schema';
import type { UseChatHelpers } from '@ai-sdk/react';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers['status'];
  votes: Array<Vote> | undefined;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedAgentId?: string;
}

function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
  isArtifactVisible,
  selectedAgentId,
}: MessagesProps) {
  if (!messages.length) {
    return null;
  }

  return (
    <div
      className={`flex flex-col gap-6 w-full pt-8 ${isArtifactVisible ? 'max-w-sm' : 'max-w-3xl'
        } mx-auto`}
    >
      {messages.map((message, index) => (
        <div
          key={message.id}
          className={`flex flex-col gap-4 ${message.role === 'user' ? 'self-end' : 'self-start'}`}
        >
          {message.parts?.map((part, partIndex) => (
            <MessageRenderer
              key={`${message.id}-${partIndex}`}
              part={part}
              message={message}
              isLoading={status === 'streaming' && index === messages.length - 1}
              mode="view"
              setMode={() => { }}
              isReadonly={isReadonly}
              setMessages={setMessages}
              reload={reload}
              selectedAgentId={selectedAgentId}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export const Messages = memo(PureMessages);
