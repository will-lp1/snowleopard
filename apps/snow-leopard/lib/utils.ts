import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { DbChatMessage, ChatMessage, ChatParts } from './types';
import { convertToModelMessages } from 'ai';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert database messages (with parts array) to UI messages
 */
export function convertToUIMessages(
  messages: Array<DbChatMessage>,
): Array<ChatMessage> {
  return messages
    .filter(message => message.role !== 'tool') // Filter out tool messages at DB level
    .map((message) => ({
      id: message.id,
      role: message.role as ChatMessage['role'],
      parts: message.content,
      createdAt: message.createdAt,
    }));
}

/**
 * Convert UI messages to model messages for AI SDK
 */
export function convertUIToModelMessages(messages: Array<ChatMessage>) {
  return convertToModelMessages(messages);
}

/**
 * Get the most recent user message from a conversation
 */
export function getMostRecentUserMessage(messages: Array<ChatMessage>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

/**
 * Extract text content from message parts
 */
export function getTextFromParts(parts: ChatParts): string {
  return parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/**
 * Extract text content from a message (compatibility helper)
 */
export function getTextFromMessage(message: ChatMessage): string {
  return getTextFromParts(message.parts || []);
}

/**
 * Extract reasoning text from message parts
 */
export function getReasoningFromParts(parts: ChatParts): string | undefined {
  const reasoningPart = parts.find((part) => part.type === 'reasoning');
  return reasoningPart?.text;
}

/**
 * Get tool invocations from message parts
 */
export function getToolInvocationsFromParts(parts: ChatParts) {
  return parts
    .filter((part) => part.type.startsWith('tool-') && 'toolCallId' in part)
    .map((part: any) => ({
      toolCallId: part.toolCallId,
      toolName: part.toolName || part.type.replace('tool-', ''),
      args: part.input || part.args,
      state: part.state || 'call' as const,
    }));
}

/**
 * Get tool results from message parts  
 */
export function getToolResultsFromParts(parts: ChatParts) {
  return parts
    .filter((part) => part.type.startsWith('tool-') && 'output' in part)
    .map((part: any) => ({
      toolCallId: part.toolCallId,
      toolName: part.toolName || part.type.replace('tool-', ''),
      result: part.output || part.result,
      state: 'result' as const,
    }));
}

/**
 * Create a text part
 */
export function createTextPart(text: string) {
  return { type: 'text' as const, text };
}

/**
 * Create a reasoning part
 */
export function createReasoningPart(text: string) {
  return { type: 'reasoning' as const, text };
}

/**
 * Create a tool call part
 */
export function createToolCallPart(toolCallId: string, toolName: string, args: any) {
  return {
    type: 'tool-call' as const,
    toolCallId,
    toolName,
    args,
  };
}

/**
 * Create a tool result part
 */
export function createToolResultPart(toolCallId: string, toolName: string, result: any) {
  return {
    type: 'tool-result' as const,
    toolCallId,
    toolName,
    result,
  };
}

/**
 * Legacy helper for backward compatibility - converts old content format to parts
 */
export function parseMessageContent(content: any): ChatParts {
  if (Array.isArray(content)) {
    return content;
  }
  
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, treat as plain text
    }
    return [createTextPart(content)];
  }
  
  // If it's an object, wrap it in an array
  return [content];
}

/**
 * Sanitize response messages for storage - clean up tool calls without results
 */
export function sanitizeResponseMessages(messages: Array<any>) {
  return messages.filter((message) => {
    if (message.role === 'assistant' && Array.isArray(message.parts)) {
      // Keep assistant messages that have text or completed tool calls
      const hasText = message.parts.some((part: any) => part.type === 'text' && part.text?.length > 0);
      const hasToolCalls = message.parts.some((part: any) => part.type === 'tool-call');
      const hasToolResults = message.parts.some((part: any) => part.type === 'tool-result');
      
      // Only keep if it has text or if tool calls have corresponding results
      return hasText || (hasToolCalls && hasToolResults);
    }
    return true;
  });
}

/**
 * Sanitize UI messages - remove incomplete tool calls and empty messages
 */
export function sanitizeUIMessages(messages: Array<ChatMessage>) {
  return messages.filter((message) => {
    if (message.role === 'assistant' && Array.isArray(message.parts)) {
      // Keep assistant messages that have text or completed tool calls
      const hasText = message.parts.some((part: any) => part.type === 'text' && part.text?.length > 0);
      const hasToolCalls = message.parts.some((part: any) => part.type?.startsWith('tool-') && part.state !== 'result');
      const hasToolResults = message.parts.some((part: any) => part.type?.startsWith('tool-') && part.state === 'result');
      
      // Only keep if it has text or if tool calls have corresponding results
      return hasText || (hasToolCalls && hasToolResults);
    }
    return true;
  });
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

export function getDocumentTimestampByIndex(
  documents: Array<any>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();

  return documents[index].createdAt;
}