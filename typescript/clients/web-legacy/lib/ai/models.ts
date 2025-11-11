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
];
