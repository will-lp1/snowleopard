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

  // Parse document ID from URL if present - RUNS ONLY ON CLIENT
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const docIdFromUrl = url.searchParams.get('document');

      if (docIdFromUrl && docIdFromUrl !== 'undefined' && docIdFromUrl !== 'null' && docIdFromUrl !== 'init') {
        // Avoid unnecessary state updates if ID hasn't changed
        if (docIdFromUrl !== documentId) { 
          setDocumentId(docIdFromUrl);
          setIsLoading(true);
          
          // Initialize cache if it doesn't exist
          if (!(window as any).__DOCUMENT_CACHE) {
            (window as any).__DOCUMENT_CACHE = new Map();
          }
          const documentCache = (window as any).__DOCUMENT_CACHE;
          
          // Check cache first
          if (documentCache.has(docIdFromUrl)) {
            const cachedDoc = documentCache.get(docIdFromUrl);
            setDocumentTitle(cachedDoc.title || 'Untitled Document');
            setDocumentContent(cachedDoc.content || '');
            setDocumentKind((cachedDoc.kind as ArtifactKind) || 'text');
            setIsLoading(false);
          } else {
            // Fetch the document content if not in cache
            fetch(`/api/document?id=${docIdFromUrl}`)
              .then(response => response.json())
              .then(documents => {
                if (documents && documents.length > 0) {
                  const doc = documents[documents.length - 1];
                  setDocumentTitle(doc.title || 'Untitled Document');
                  setDocumentContent(doc.content || '');
                  setDocumentKind((doc.kind as ArtifactKind) || 'text');
                  // Update document cache
                  documentCache.set(docIdFromUrl, doc);
                }
                setIsLoading(false);
              })
              .catch(error => {
                console.error('Error fetching document:', error);
                setIsLoading(false);
              });
          }
        }
      } else {
         // Reset if no valid docId in URL
         if (documentId !== 'init') { // Avoid loop if already init
            setDocumentId('init');
            setDocumentTitle('New Document');
            setDocumentContent('');
            setDocumentKind('text');
            setIsLoading(false);
         }
      }
    }
    // Run only once on mount/hydration
  }, []); // <-- Empty dependency array crucial for client-side mount logic

  // Listen for URL changes (popstate) - RUNS ONLY ON CLIENT
  useEffect(() => {
    if (typeof window === 'undefined') return; // Guard against SSR

    const handleRouteChange = () => {
      const url = new URL(window.location.href);
      const docIdFromUrl = url.searchParams.get('document');
      
      if (docIdFromUrl && docIdFromUrl !== 'undefined' && docIdFromUrl !== 'null' && docIdFromUrl !== 'init' && docIdFromUrl !== documentId) {
        setDocumentId(docIdFromUrl);
        setIsLoading(true);
        
        // Initialize cache if it doesn't exist
        if (!(window as any).__DOCUMENT_CACHE) {
          (window as any).__DOCUMENT_CACHE = new Map();
        }
        const documentCache = (window as any).__DOCUMENT_CACHE;
        
        // Check document cache first
        if (documentCache.has(docIdFromUrl)) {
          const cachedDoc = documentCache.get(docIdFromUrl);
          setDocumentTitle(cachedDoc.title || 'Untitled Document');
          setDocumentContent(cachedDoc.content || '');
          setDocumentKind((cachedDoc.kind as ArtifactKind) || 'text');
          setIsLoading(false);
          return;
        }
        
        // Fetch the document content if not in cache
        fetch(`/api/document?id=${docIdFromUrl}`)
          .then(response => response.json())
          .then(documents => {
            if (documents && documents.length > 0) {
              const doc = documents[documents.length - 1];
              setDocumentTitle(doc.title || 'Untitled Document');
              setDocumentContent(doc.content || '');
              setDocumentKind((doc.kind as ArtifactKind) || 'text');
              // Update document cache
              documentCache.set(docIdFromUrl, doc);
            }
            setIsLoading(false);
          })
          .catch(error => {
            console.error('Error fetching document:', error);
            setIsLoading(false);
          });
      } else if (!docIdFromUrl || docIdFromUrl === 'init') {
        // Reset to initial state if no document ID
        if (documentId !== 'init') { // Avoid loop if already init
            setDocumentId('init');
            setDocumentTitle('New Document');
            setDocumentContent('');
            setDocumentKind('text');
            setIsLoading(false);
        }
      }
    };

    // Add event listener for route changes
    window.addEventListener('popstate', handleRouteChange);
    
    // Clean up
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
    // Rerun if documentId changes (to update listeners if needed, though unlikely here)
  }, [documentId]); 

  const updateDocument = (id: string, title: string, content: string, kind: ArtifactKind) => {
    setDocumentId(id);
    setDocumentTitle(title);
    setDocumentContent(content);
    setDocumentKind(kind);
    
    // Update document cache - Guard this too
    if (typeof window !== 'undefined' && id !== 'init') {
      if (!(window as any).__DOCUMENT_CACHE) {
        (window as any).__DOCUMENT_CACHE = new Map();
      }
      const documentCache = (window as any).__DOCUMENT_CACHE;
      documentCache.set(id, {
        id,
        title,
        content,
        kind,
        createdAt: new Date().toISOString(),
      });
    }
  };

  // Listen for custom browser events - RUNS ONLY ON CLIENT
  useEffect(() => {
    if (typeof window === 'undefined') return; // Guard against SSR

    const handleDocumentRenamed = (event: Event) => {
      // Type assertion for CustomEvent
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;
      
      const { documentId: renamedId, newTitle } = customEvent.detail;
      
      // Only update if this is the current document
      if (renamedId === documentId) {
        setDocumentTitle(newTitle);
      }
    };
    
    const handleDocumentContextUpdated = (event: Event) => {
      // Type assertion for CustomEvent
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;
      
      const { documentId, documentTitle, documentContent, documentKind } = customEvent.detail;
      
      // Don't trigger our own events
      setDocumentId(documentId);
      setDocumentTitle(documentTitle);
      setDocumentContent(documentContent);
      setDocumentKind(documentKind);
    };
    
    window.addEventListener('document-renamed', handleDocumentRenamed);
    window.addEventListener('document-context-updated', handleDocumentContextUpdated);
    
    // Clean up
    return () => {
      window.removeEventListener('document-renamed', handleDocumentRenamed);
      window.removeEventListener('document-context-updated', handleDocumentContextUpdated);
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