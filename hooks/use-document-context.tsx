'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ArtifactKind } from '@/components/artifact';
import { useRouter } from 'next/navigation';

interface DocumentContextType {
  documentId: string;
  documentTitle: string;
  documentContent: string;
  documentKind: ArtifactKind;
  isLoading: boolean;
  updateDocument: (id: string, title: string, content: string, kind: ArtifactKind) => void;
}

const DocumentContext = createContext<DocumentContextType>({
  documentId: 'init',
  documentTitle: 'New Document',
  documentContent: '',
  documentKind: 'text',
  isLoading: false,
  updateDocument: () => {},
});

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documentId, setDocumentId] = useState<string>('init');
  const [documentTitle, setDocumentTitle] = useState<string>('New Document');
  const [documentContent, setDocumentContent] = useState<string>('');
  const [documentKind, setDocumentKind] = useState<ArtifactKind>('text');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();

  // Parse document ID from URL if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const docId = url.searchParams.get('document');
      
      if (docId && docId !== 'undefined' && docId !== 'null' && docId !== 'init') {
        setDocumentId(docId);
        setIsLoading(true);
        
        // Fetch the document content
        fetch(`/api/document?id=${docId}`)
          .then(response => response.json())
          .then(documents => {
            if (documents && documents.length > 0) {
              const doc = documents[documents.length - 1];
              setDocumentTitle(doc.title || 'Untitled Document');
              setDocumentContent(doc.content || '');
              setDocumentKind((doc.kind as ArtifactKind) || 'text');
              
              // Update document cache
              if (typeof window !== 'undefined') {
                if (!(window as any).__DOCUMENT_CACHE) {
                  (window as any).__DOCUMENT_CACHE = new Map();
                }
                (window as any).__DOCUMENT_CACHE.set(docId, doc);
              }
            }
            setIsLoading(false);
          })
          .catch(error => {
            console.error('Error fetching document:', error);
            setIsLoading(false);
          });
      }
    }
  }, []);

  // Listen for URL changes
  useEffect(() => {
    const handleRouteChange = () => {
      const url = new URL(window.location.href);
      const docId = url.searchParams.get('document');
      
      if (docId && docId !== 'undefined' && docId !== 'null' && docId !== 'init' && docId !== documentId) {
        setDocumentId(docId);
        setIsLoading(true);
        
        // Check document cache first
        const documentCache = (window as any).__DOCUMENT_CACHE;
        if (documentCache && documentCache.has(docId)) {
          const cachedDoc = documentCache.get(docId);
          setDocumentTitle(cachedDoc.title || 'Untitled Document');
          setDocumentContent(cachedDoc.content || '');
          setDocumentKind((cachedDoc.kind as ArtifactKind) || 'text');
          setIsLoading(false);
          return;
        }
        
        // Fetch the document content
        fetch(`/api/document?id=${docId}`)
          .then(response => response.json())
          .then(documents => {
            if (documents && documents.length > 0) {
              const doc = documents[documents.length - 1];
              setDocumentTitle(doc.title || 'Untitled Document');
              setDocumentContent(doc.content || '');
              setDocumentKind((doc.kind as ArtifactKind) || 'text');
              
              // Update document cache
              if (typeof window !== 'undefined') {
                if (!(window as any).__DOCUMENT_CACHE) {
                  (window as any).__DOCUMENT_CACHE = new Map();
                }
                (window as any).__DOCUMENT_CACHE.set(docId, doc);
              }
            }
            setIsLoading(false);
          })
          .catch(error => {
            console.error('Error fetching document:', error);
            setIsLoading(false);
          });
      } else if (!docId || docId === 'init') {
        // Reset to initial state if no document ID
        setDocumentId('init');
        setDocumentTitle('New Document');
        setDocumentContent('');
        setDocumentKind('text');
      }
    };

    // Add event listener for route changes
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [documentId]);

  const updateDocument = (id: string, title: string, content: string, kind: ArtifactKind) => {
    setDocumentId(id);
    setDocumentTitle(title);
    setDocumentContent(content);
    setDocumentKind(kind);
    
    // Update document cache
    if (typeof window !== 'undefined' && id !== 'init') {
      if (!(window as any).__DOCUMENT_CACHE) {
        (window as any).__DOCUMENT_CACHE = new Map();
      }
      (window as any).__DOCUMENT_CACHE.set(id, {
        id,
        title,
        content,
        kind,
        createdAt: new Date().toISOString(),
      });
    }
  };

  // Listen for document-renamed events to update this context
  useEffect(() => {
    const handleDocumentRenamed = (event: CustomEvent) => {
      if (!event.detail) return;
      
      const { documentId: renamedId, newTitle } = event.detail;
      
      // Only update if this is the current document
      if (renamedId === documentId) {
        setDocumentTitle(newTitle);
      }
    };
    
    // Listen for document context update events
    const handleDocumentContextUpdated = (event: CustomEvent) => {
      if (!event.detail) return;
      
      const { documentId, documentTitle, documentContent, documentKind } = event.detail;
      
      // Don't trigger our own events
      setDocumentId(documentId);
      setDocumentTitle(documentTitle);
      setDocumentContent(documentContent);
      setDocumentKind(documentKind);
    };
    
    // Add event listeners
    window.addEventListener('document-renamed', handleDocumentRenamed as EventListener);
    window.addEventListener('document-context-updated', handleDocumentContextUpdated as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('document-renamed', handleDocumentRenamed as EventListener);
      window.removeEventListener('document-context-updated', handleDocumentContextUpdated as EventListener);
    };
  }, [documentId]);

  return (
    <DocumentContext.Provider 
      value={{
        documentId,
        documentTitle,
        documentContent,
        documentKind,
        isLoading,
        updateDocument,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocumentContext() {
  return useContext(DocumentContext);
} 