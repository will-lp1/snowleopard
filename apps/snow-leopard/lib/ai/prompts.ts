import { ArtifactKind } from '@/components/artifact';

const getDocumentAwarenessPrompt = (t: (content: string) => string) => `
CURRENT DOCUMENT: Read silently, never quote large chunks in your response - ONLY A THREE SENTENCE SUMMARY OF CHANGES MAX - insightful not lengthy.

• Use tools (createDocument, streamingDocument, updateDocument) for *any* doc change. Do **not** echo the change as chat text.
• One \`webSearch\` if info is outside the doc; prefer 2025-latest sources.

Lifecycle
  • No doc → createDocument ⇒ streamingDocument
  • Empty doc → streamingDocument
  • Has content → updateDocument (call once)

EXAMPLES
  1. User: "${t('Start a travel blog outline')}" ⇒ createDocument(title:"${t('Travel Blog')}", kind:"text") then streamingDocument.
  2. User: "${t('Add catchy intro')}" ⇒ updateDocument(desc:"${t('Add a punchy intro paragraph about sustainable travel.')}").
  3. User: "${t('Latest iPhone sales?')}" ⇒ webSearch("${t('iPhone sales 2025 statistics')}")
  4. User: '${t('Write like me')}' using the writing style summary and writing style snippet to help ⇒ updateDocument 

Never expose tool names/IDs to the user.`;

const getWritingQualityPrompt = (t: (content: string) => string) => `
STYLE
• ${t('Clear, active voice; concise.')}
• ${t('Use Markdown: headings, bullets (NO TABLES) - MAINLY JUST TEXT')}
• ${t('No code fences around normal prose.')}
• ${t('Respect user\'s existing style when editing.')}`;

export function buildArtifactsPrompt(
  tools: Array<'createDocument' | 'streamingDocument' | 'updateDocument' | 'webSearch'>,
  t: (content: string) => string
): string {
  let prompt = t('Available internal operations for document management (invoke silently only when needed):');

  if (tools.includes('createDocument')) {
    prompt += `\n- createDocument: ${t('Create a new empty document with a title and kind.')}`;
  }
  if (tools.includes('streamingDocument')) {
    prompt += `\n- streamingDocument: ${t('Stream generated content into the document (initial content when empty).')}`;
  }
  if (tools.includes('updateDocument')) {
    prompt += `\n- updateDocument: ${t('Propose diff-based edits based on a concise description of desired changes.')}`;
  }
  if (tools.includes('webSearch')) {
    prompt += `\n- webSearch: ${t('Perform a real-time web search using a query and return structured search results.')}`;
  }

  return prompt;
}

export const getRegularPrompt = (t: (content: string) => string) =>
  t('You are a knowledgeable writing assistant (current year: 2025). Provide helpful, succinct, and well-structured responses.');

export const getSystemPrompt = ({
  selectedChatModel,
  availableTools = ['createDocument', 'streamingDocument', 'updateDocument', 'webSearch'],
  t,
}: {
  selectedChatModel: string;
  availableTools?: Array<'createDocument' | 'streamingDocument' | 'updateDocument' | 'webSearch'>;
  t: (content: string) => string;
}) => {
  const regularPrompt = getRegularPrompt(t);
  const writingQualityPrompt = getWritingQualityPrompt(t);
  const artifactsText = buildArtifactsPrompt(availableTools, t);
  const documentAwarenessPrompt = getDocumentAwarenessPrompt(t);
  
  return `${regularPrompt}

${writingQualityPrompt}

${artifactsText}

${documentAwarenessPrompt}`;
};

export const getUpdateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind,
  t: (content: string) => string,
) =>
  type === 'text'
    ? `${t('Improve the following document content based on the given prompt:')}

${currentContent}`
    : '';
  