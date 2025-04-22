export interface ArtifactMetadata {
  // Basic metadata fields that would be common across artifacts
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  type?: string;
  version?: number;
  [key: string]: any; // Allow for additional metadata fields
} 