import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';

export const myProvider = customProvider({
  languageModels: {
        'chat-model-small': groq('llama-3.1-8b-instant'),
        'chat-model-large': groq('llama-3.3-70b-versatile'),
        'chat-model-reasoning': wrapLanguageModel({
          model: groq('deepseek-r1-distill-llama-70b'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': groq('llama-3.1-8b-instant'),
        'artifact-model': groq('llama-3.1-8b-instant'),
      },
    });
