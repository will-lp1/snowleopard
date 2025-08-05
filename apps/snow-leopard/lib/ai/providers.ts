// apps/snow-leopard/lib/ai/providers.ts
import { customProvider /*, extractReasoningMiddleware */ } from 'ai';
import { groq } from '@ai-sdk/groq';
import { anthropic } from '@ai-sdk/anthropic';
// If you actually need the type in this file:
// import type { LanguageModelV2 } from '@ai-sdk/provider';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small':     groq('meta-llama/llama-4-maverick-17b-128e-instruct'),
    'chat-model-large':     groq('moonshotai/kimi-k2-instruct'),
    'chat-model-reasoning': groq('deepseek-r1-distill-llama-70b'),
    'claude-opus':          anthropic('claude-4-opus-20250514'),
  },
});