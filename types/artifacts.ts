import { ArtifactMetadata } from './metadata';

export interface ArtifactContent<T extends ArtifactMetadata = ArtifactMetadata> {
  title: string;
  content: string;
  mode: 'edit' | 'diff';
  status: 'streaming' | 'idle';
  currentVersionIndex: number;
  suggestions: Array<string>;
  onSaveContent: (content: string, isDebounced?: boolean) => void;
  isInline: boolean;
  isCurrentVersion: boolean;
  getDocumentContentById: (index: number) => string;
  isLoading: boolean;
  metadata: T;
  setMetadata: (metadata: T) => void;
  documentId: string;
  saveState: 'idle' | 'saving' | 'error';
  lastSaveError: string | null;
} 