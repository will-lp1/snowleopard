import { customProvider } from 'ai';
import { groq } from '@ai-sdk/groq';
import { anthropic } from '@ai-sdk/anthropic';

export const myProvider = customProvider({
  languageModels: {
    'chat-model-small':     groq('meta-llama/llama-4-maverick-17b-128e-instruct'),
    'chat-model-large':     groq('moonshotai/kimi-k2-instruct'),
    'chat-model-reasoning': groq('deepseek-r1-distill-llama-70b'),
    'claude-opus':          anthropic('claude-4-opus-20250514'),
    'title-model':          groq('llama3.1-instant'),
    'artifact-model':       groq('meta-llama/llama-4-maverick-17b-128e-instruct'),
  },
});