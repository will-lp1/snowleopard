import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { groq } from '@ai-sdk/groq';
import { anthropic } from '@ai-sdk/anthropic';

export const myProvider = customProvider({
  languageModels: {
        'chat-model-small': groq('meta-llama/llama-4-maverick-17b-128e-instruct'),
        'chat-model-large': groq('moonshotai/kimi-k2-instruct'),
        'chat-model-reasoning': wrapLanguageModel({
          model: groq('deepseek-r1-distill-llama-70b'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'claude-opus': anthropic('claude-4-opus-20250514'),
    'title-model': groq('llama-3.1-8b-instant'),
    'artifact-model': groq('meta-llama/llama-4-maverick-17b-128e-instruct'),
  },
});
