import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': groq('llama-3.1-8b-instant'),
    'chat-model-large': groq('moonshotai/kimi-k2-instruct-0905'),
    'chat-model-reasoning': wrapLanguageModel({
      model: groq('openai/gpt-oss-120b'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    'title-model': groq('llama-3.1-8b-instant'),
    'artifact-model': groq('moonshotai/kimi-k2-instruct-0905'),
  },
});
