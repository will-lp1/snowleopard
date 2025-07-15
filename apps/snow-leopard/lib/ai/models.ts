export const DEFAULT_CHAT_MODEL: string = 'chat-model-small';

interface ChatModel {
  id: string;
  name: string;
  description: string;
  proOnly?: boolean;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model-small',
    name: 'Small model',
    description: 'Small model for fast, lightweight tasks - Llama 4',
  },
  {
    id: 'chat-model-large',
    name: 'Large model',
    description: 'Large model for complex, multi-step tasks - Kimi K2',  },
  {
    id: 'chat-model-reasoning',
    name: 'Reasoning model',
    description: 'Uses advanced reasoning - Deepseek R1',
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus 4',
    description: 'Most powerful model for advanced tasks',
    proOnly: true,
  },
];
