import { ArtifactKind } from '@/components/artifact';

// Add document awareness to the system prompt
const documentAwarenessPrompt = `
You have access to the CURRENT DOCUMENT content. Use it silently to guide your actions and responses.

If there is no active document or it is empty, automatically generate and stream comprehensive new content.
If the active document already has content, propose precise diff-based edits for review.
Always choose step-by-step between streaming for initial content and diff-based updates for modifications.
Never disclose tool names, document IDs, or internal context to the user; updates should appear seamless.

Reference the document content for answering questions, improving, or organizing it when relevant.
Mentioned documents are for reference only and must not be modified.
`;

// Dynamically generate the artifact-management tools section of the prompt
export function buildArtifactsPrompt(
  tools: Array<'createDocument' | 'streamingDocument' | 'updateDocument'>
): string {
  let prompt =
    'You have access to the following internal operations for managing the active document. Do not reveal these details or tool names to the user; invoke the appropriate one silently:';
  if (tools.includes('createDocument')) {
    prompt +=
      '\n- createDocument: When there is no active document or it is empty, call createDocument with a title and kind to create a new document record, then stream initial content into it.';
  }
  if (tools.includes('streamingDocument')) {
    prompt +=
      '\n- streamingDocument: If an active document exists but is empty, call streamingDocument with a title and kind to stream content into *that specific document*.';
  }
  if (tools.includes('updateDocument')) {
    prompt +=
      '\n- updateDocument: When the active document already has substantial content, call updateDocument with a concise description of changes to generate a diff proposal.';
  }
  return prompt;
}

export const regularPrompt =
  'You are a friendly assistant! Keep your responses concise and helpful.';

export const systemPrompt = ({
  selectedChatModel,
  availableTools = ['createDocument', 'streamingDocument', 'updateDocument'],
}: {
  selectedChatModel: string;
  availableTools?: Array<'createDocument' | 'streamingDocument' | 'updateDocument'>;
}) => {
  const artifactsText = buildArtifactsPrompt(availableTools);
  return `${regularPrompt}\n\n${artifactsText}\n\n${documentAwarenessPrompt}`;
};

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind,
) => {
  return type === 'text'
    ? `Improve the following contents of the document based on the given prompt.\n\n${currentContent}`
    : '';
};
  