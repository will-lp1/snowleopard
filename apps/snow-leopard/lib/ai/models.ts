export const DEFAULT_CHAT_MODEL: string = 'chat-model-small';

interface ChatModel {
  id: string;
  name: string;
  description: string;
  proOnly?: boolean;
}

export const getChatModels = (t: (content: string) => string): Array<ChatModel> => [
  {
    id: 'chat-model-small',
    name: t('Llama 4'),
    description: t('Small and fast model'),
  },
  {
    id: 'chat-model-large',
    name: t('Kimi K2'),
    description: t('Large and powerful model'),
  },
  {
    id: 'chat-model-reasoning',
    name: t('Deepseek R1'),
    description: t('Advanced reasoning model'),
  },
  {
    id: 'claude-opus',
    name: t('Claude Opus 4'),
    description: t('Most powerful model'),
    proOnly: true,
  },
];
