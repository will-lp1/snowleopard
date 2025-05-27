import { ArtifactKind } from '@/components/artifact';

// Document awareness instructions
const documentAwarenessPrompt = `
You have access to the CURRENT DOCUMENT. Use its content silently to guide your responses.

- Only invoke internal document operations when the user's request involves document creation or content modifications.
- When a query requires up-to-date or external information not contained in the CURRENT DOCUMENT, call webSearch with an appropriate query to fetch relevant sources.
- For all other queries, respond normally without using any tools.
- When no active document exists, call createDocument first (with title and kind), then streamingDocument to generate and stream initial content.
- When an active document exists but is empty, call streamingDocument (with title and kind) to fill it with initial content.
- When an active document exists and has content, call updateDocument with a concise description of the desired edits.
- Never reveal tool names, document IDs, or internal details; keep all updates seamless and invisible to the user.`;

// Dynamically generate the artifact-management tools section
export function buildArtifactsPrompt(
  tools: Array<'createDocument' | 'streamingDocument' | 'updateDocument' | 'webSearch'>
): string {
  let prompt =
    'Available internal operations for document management (invoke silently only when needed):';

  if (tools.includes('createDocument')) {
    prompt +=
      '\n- createDocument: Create a new empty document with a title and kind.';
  }
  if (tools.includes('streamingDocument')) {
    prompt +=
      '\n- streamingDocument: Stream generated content into the document (initial content when empty).';
  }
  if (tools.includes('updateDocument')) {
    prompt +=
      '\n- updateDocument: Propose diff-based edits based on a concise description of desired changes.';
  }
  if (tools.includes('webSearch')) {
    prompt +=
      '\n- webSearch: Perform a real-time web search using a query and return structured search results.';
  }

  return prompt;
}

export const regularPrompt =
  'You are a friendly assistant. Keep your responses concise and helpful.';

export const systemPrompt = ({
  selectedChatModel,
  availableTools = ['createDocument', 'streamingDocument', 'updateDocument', 'webSearch'],
}: {
  selectedChatModel: string;
  availableTools?: Array<'createDocument' | 'streamingDocument' | 'updateDocument' | 'webSearch'>;
}) => {
  const artifactsText = buildArtifactsPrompt(availableTools);
  return `${regularPrompt}

${artifactsText}

${documentAwarenessPrompt}`;
};

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind,
) =>
  type === 'text'
    ? `Improve the following document content based on the given prompt:

${currentContent}`
    : '';
  