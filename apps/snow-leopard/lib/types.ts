import { z } from 'zod';
import type { UIMessage } from 'ai';
import type { ArtifactKind } from '@/components/artifact';

export type DataPart = { type: 'append-message'; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = {
  createDocument: any;
  updateDocument: any;
  streamingDocument: any;
  webSearch: any;
};

export type CustomUIDataTypes = {
  textDelta: string;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}