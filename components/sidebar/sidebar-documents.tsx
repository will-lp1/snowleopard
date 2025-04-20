'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@/lib/auth';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { cn, fetcher } from '@/lib/utils';
import {
  CheckCircleFillIcon,
  FileIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Document } from '@/lib/db/schema';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactKind } from '@/components/artifact';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare as MessageSquareIcon } from 'lucide-react';
import { ArrowRightCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';

type GroupedDocuments = {
  today: Document[];
  yesterday: Document[];
  lastWeek: Document[];
  lastMonth: Document[];
  older: Document[];
};

const PureDocumentItem = ({
  document,
  isActive,
  onDelete,
  setOpenMobile,
  onSelect,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: {
  document: Document;
  isActive: boolean;
  onDelete: (documentId: string) => void;
  setOpenMobile: (open: boolean) => void;
  onSelect: (documentId: string) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (documentId: string, isSelected: boolean) => void;
}) => {
  const handleDocumentClick = useCallback((e: React.MouseEvent) => {
    // When clicking on a document that's already active, don't trigger navigation
    // This prevents unnecessary re-renders and flickering during rapid clicking
    if (isActive && !isSelectionMode) {
      e.preventDefault();
      return;
    }
    
    if (isSelectionMode) {
      onToggleSelect(document.id, !isSelected);
      return;
    }
    
    // Mark this document as being selected to handle race conditions
    if (typeof window !== 'undefined') {
      (window as any).__LAST_SELECTED_DOCUMENT = document.id;
      // Update cache if available
      if ((window as any).__DOCUMENT_CACHE) {
        (window as any).__DOCUMENT_CACHE.set(document.id, document);
      }
    }
    
    setOpenMobile(false);
    onSelect(document.id);
  }, [document, isActive, isSelectionMode, isSelected, onToggleSelect, setOpenMobile, onSelect]);

  const router = useRouter();

  // Handler for starting a chat with a document
  const handleStartChatWithDocument = (documentId: string) => {
    router.push(`/documents/${documentId}`);
  };

  return (
    <SidebarMenuItem>
      <div className="flex items-center w-full">
        {isSelectionMode && (
          <div className="pl-2 pr-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect(document.id, !!checked)}
              aria-label={`Select ${document.title}`}
            />
          </div>
        )}
        <SidebarMenuButton 
          asChild 
          isActive={isActive}
          className={cn(isSelectionMode && "flex-1")}
        >
          <Link 
            href={isSelectionMode ? "#" : `/documents/${document.id}`}
            onClick={handleDocumentClick}
          >
            <span className="truncate">{document.title}</span>
          </Link>
        </SidebarMenuButton>
      </div>

      {!isSelectionMode && (
        <DropdownMenu modal={true}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground mr-0.5"
              showOnHover={!isActive}
            >
              <MoreHorizontalIcon />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => handleStartChatWithDocument(document.id)}
            >
              <MessageSquareIcon size={14} className="mr-2" />
              <span>Chat with this document</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
              onSelect={() => onDelete(document.id)}
            >
              <TrashIcon />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );
};

export const DocumentItem = memo(PureDocumentItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.isSelectionMode !== nextProps.isSelectionMode) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  return true;
});

export function SidebarDocuments({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { id: chatId } = useParams();
  const router = useRouter();
  const { setArtifact } = useArtifact();
  const { 
    createNewDocument, 
    loadDocument, 
    deleteDocument,
    isCreatingDocument
  } = useDocumentUtils();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [forceUpdate, setForceUpdate] = useState(0);
  
  const {
    data: documents,
    isLoading,
    mutate,
  } = useSWR<Array<Document>>(user ? '/api/document' : null, fetcher, {
    fallbackData: [],
    revalidateOnFocus: false,
    dedupingInterval: 10000, // Don't revalidate too often
  });

  // Refresh documents when component mounts
  useEffect(() => {
    mutate();
  }, [mutate]);

  // Get document path from the current URL
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  
  // Keep track of the active document
  useEffect(() => {
    // Extract document ID from pathname
    const match = pathname.match(/\/documents\/([^/?]+)/);
    const newActiveId = match ? match[1] : null;
    
    if (newActiveId !== activeDocumentId) {
      setActiveDocumentId(newActiveId);
    }
    
    // Set up a listener to track URL changes for highlighting
    const updateActiveDocument = () => {
      const newPathname = window.location.pathname;
      const newMatch = newPathname.match(/\/documents\/([^/?]+)/);
      const newId = newMatch ? newMatch[1] : null;
      
      setActiveDocumentId(newId);
    };
    
    window.addEventListener('popstate', updateActiveDocument);
    
    return () => {
      window.removeEventListener('popstate', updateActiveDocument);
    };
  }, [pathname, activeDocumentId]);

  // Listen for document creation and rename events
  useEffect(() => {
    // Handler for document creation
    const handleDocumentCreated = (event: CustomEvent) => {
      console.log('[SidebarDocuments] Document created event received', event.detail);
      
      if (event.detail?.document) {
        // Optimistically update the list with the new document
        mutate((currentDocs) => {
          if (!currentDocs) return currentDocs;
          
          // Check if document already exists to avoid duplicates
          const existingDocIndex = currentDocs.findIndex(doc => doc.id === event.detail.document.id);
          
          // Create a copy of the document from the event
          const newDoc = {
            ...event.detail.document,
            createdAt: event.detail.document.createdAt || new Date().toISOString()
          };
          
          if (existingDocIndex >= 0) {
            // Update existing document
            const updatedDocs = [...currentDocs];
            updatedDocs[existingDocIndex] = newDoc;
            return updatedDocs;
          } else {
            // Add to the front of the list (most recent)
            return [newDoc, ...currentDocs];
          }
        }, false); // false means don't revalidate immediately
        
        // Revalidate after a short delay to get server state
        setTimeout(() => mutate(), 500);
      }
    };
    
    // Handler for document renaming
    const handleDocumentRenamed = (event: CustomEvent) => {
      console.log('[SidebarDocuments] Document renamed event received', event.detail);
      
      if (event.detail?.documentId && event.detail?.newTitle) {
        // Optimistically update the document title
        mutate((currentDocs) => {
          if (!currentDocs) return currentDocs;
          
          // Update the document title in the list
          return currentDocs.map(doc => {
            // Update the matching document with the new title
            if (doc.id === event.detail.documentId) {
              return { ...doc, title: event.detail.newTitle };
            }
            return doc;
          });
        }, true); // true to immediately revalidate with the server
        
        // Force rerender - this seems to help in some cases
        setForceUpdate(prev => prev + 1);
        
        // Broadcast a document update event for other components
        try {
          const updateEvent = new CustomEvent('document-updated', {
            detail: {
              documentId: event.detail.documentId,
              title: event.detail.newTitle
            }
          });
          window.dispatchEvent(updateEvent);
        } catch (error) {
          console.error('[SidebarDocuments] Error dispatching document-updated event', error);
        }
      }
    };
    
    // Add event listeners
    window.addEventListener('document-created', handleDocumentCreated as EventListener);
    window.addEventListener('document-renamed', handleDocumentRenamed as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('document-created', handleDocumentCreated as EventListener);
      window.removeEventListener('document-renamed', handleDocumentRenamed as EventListener);
    };
  }, [mutate]);

  // Listen for document updates
  useEffect(() => {
    // Force document list to refresh every time documentId changes
    if (activeDocumentId) {
      console.log('[SidebarDocuments] Active document changed, refreshing list');
      mutate();
    }
    
    // Add a global listener for any document updates from anywhere in the app
    const handleDocumentUpdate = () => {
      console.log('[SidebarDocuments] Document updated, refreshing list');
      mutate();
    };
    
    window.addEventListener('document-updated', handleDocumentUpdate);
    return () => {
      window.removeEventListener('document-updated', handleDocumentUpdate);
    };
  }, [activeDocumentId, mutate]);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [showMultiDeleteDialog, setShowMultiDeleteDialog] = useState(false);
  
  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedDocuments(new Set());
  };
  
  const handleToggleSelect = (documentId: string, isSelected: boolean) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(documentId);
      } else {
        newSet.delete(documentId);
      }
      return newSet;
    });
  };
  
  const handleSelectAll = () => {
    if (documents) {
      const filteredDocuments = filterDocuments(documents);
      if (selectedDocuments.size === filteredDocuments.length) {
        // Deselect all
        setSelectedDocuments(new Set());
      } else {
        // Select all
        setSelectedDocuments(new Set(filteredDocuments.map(doc => doc.id)));
      }
    }
  };
  
  const handleDelete = async () => {
    if (!deleteId) return;
    
    setShowDeleteDialog(false);
    
    // Check if we're deleting the current document
    const url = new URL(window.location.href);
    const documentFromUrl = url.searchParams.get('document');
    const isCurrentDocument = documentFromUrl === deleteId;
    
    // Prepare redirection URL only if needed
    const redirectUrl = isCurrentDocument ? `/documents/${deleteId}` : '';
    
    // Delete the document
    const success = await deleteDocument(deleteId, {
      redirectUrl: redirectUrl
    });
    
    if (success) {
      // Update local state immediately, before any redirects
      mutate((docs) => {
        if (docs) {
          return docs.filter((d) => d.id !== deleteId);
        }
        return docs;
      }, false); // false means don't revalidate immediately
    }
  };
  
  const handleDeleteMultiple = async () => {
    const selectedDocumentIds = Array.from(selectedDocuments);
    
    // Close dialog first to prevent UI flickering
    setShowMultiDeleteDialog(false);
    
    // Check if current document is selected for deletion
    const url = new URL(window.location.href);
    const documentFromUrl = url.searchParams.get('document');
    const isCurrentDocumentSelected = documentFromUrl && selectedDocuments.has(documentFromUrl);
    
    try {
      // Update local state immediately for better UX
      mutate((docs) => {
        if (docs) {
          return docs.filter(d => !selectedDocuments.has(d.id));
        }
        return docs;
      }, false); // false means don't revalidate immediately
      
      // If current document is being deleted, navigate first
      if (isCurrentDocumentSelected) {
        router.replace(`/documents/${documentFromUrl}`);
      }
      
      // Delete each document
      const deletePromises = selectedDocumentIds.map(documentId => 
        deleteDocument(documentId, { redirectUrl: '' })
      );
      
      await Promise.all(deletePromises);
      
      setSelectedDocuments(new Set());
      setIsSelectionMode(false);
      
      toast.success(`${selectedDocumentIds.length} documents deleted`);
    } catch (error) {
      console.error('[SidebarDocuments] Error deleting multiple documents:', error);
      toast.error('Failed to delete some documents');
      
      // Revalidate to ensure UI is in sync with actual state
      mutate();
    }
  };
  
  // Handle document selection
  const handleDocumentSelect = async (documentId: string) => {
    try {
      if (documentId === 'init' || !documentId) {
        console.error('[SidebarDocuments] Invalid document ID:', documentId);
        return;
      }
      
      // Show loading feedback
      const toastId = `loading-doc-${documentId}`;
      toast.loading('Loading document...', { id: toastId, duration: 2000 });
      
      // Navigate directly to the document
      router.push(`/documents/${documentId}`);
      
      // Close mobile sidebar if needed
      setOpenMobile(false);
      
      toast.success('Document loaded', { id: toastId, duration: 1000 });
    } catch (error) {
      console.error('[SidebarDocuments] Error loading document:', error);
      toast.error('Failed to load document');
    }
  };

  // Filter documents based on search term
  const filterDocuments = (docs: Document[]) => {
    if (!searchTerm.trim()) return docs;
    
    return docs.filter(doc => 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.content && doc.content.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  // Group documents by date
  const groupDocumentsByDate = (docs: Document[]): GroupedDocuments => {
    const now = new Date();
    const oneWeekAgo = subWeeks(now, 1);
    const oneMonthAgo = subMonths(now, 1);

    return docs.reduce(
      (groups, doc) => {
        const docDate = new Date(doc.createdAt);

        if (isToday(docDate)) {
          groups.today.push(doc);
        } else if (isYesterday(docDate)) {
          groups.yesterday.push(doc);
        } else if (docDate > oneWeekAgo) {
          groups.lastWeek.push(doc);
        } else if (docDate > oneMonthAgo) {
          groups.lastMonth.push(doc);
        } else {
          groups.older.push(doc);
        }

        return groups;
      },
      {
        today: [],
        yesterday: [],
        lastWeek: [],
        lastMonth: [],
        older: [],
      } as GroupedDocuments,
    );
  };

  // Handle document not found scenario
  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            Login to see your documents
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
          Loading...
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                key={item}
                className="rounded-md h-8 flex gap-2 px-2 items-center"
              >
                <div
                  className="h-4 rounded-md flex-1 max-w-[--skeleton-width] bg-sidebar-accent-foreground/10"
                  style={
                    {
                      '--skeleton-width': `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  // Empty state
  const filteredDocuments = filterDocuments(documents || []);
  if (filteredDocuments.length === 0 && !searchTerm) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/50 flex items-center justify-between cursor-pointer">
          <span>Documents</span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="size-5" 
            onClick={createNewDocument}
            disabled={isCreatingDocument}
          >
            {isCreatingDocument ? (
              <svg className="animate-spin size-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <PlusIcon size={12} />
            )}
          </Button>
        </div>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2 py-4">
            No documents yet
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  // Regular view with documents
  return (
    <>
      <SidebarGroup>
        <div 
          className="px-2 py-1 text-xs text-sidebar-foreground/50 flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span>Documents {documents && documents.length > 0 && `(${documents.length})`}</span>
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-5" 
              onClick={(e) => {
                e.stopPropagation();
                createNewDocument();
              }}
              disabled={isCreatingDocument}
            >
              {isCreatingDocument ? (
                <svg className="animate-spin size-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <PlusIcon size={12} />
              )}
            </Button>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>

        {isExpanded && (
          <>
            <div className="px-2 mt-1 mb-2">
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            
            {filteredDocuments.length > 0 && (
              <div className="flex items-center justify-between px-2 py-1 mb-2">
                <div className="flex items-center gap-2">
                  {isSelectionMode ? (
                    <>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleSelectAll}
                        className="h-7 text-xs"
                      >
                        {selectedDocuments.size === filteredDocuments.length ? 'Deselect All' : 'Select All'}
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => {
                          if (selectedDocuments.size > 0) {
                            setShowMultiDeleteDialog(true);
                          }
                        }}
                        disabled={selectedDocuments.size === 0}
                        className="h-7 text-xs"
                      >
                        Delete ({selectedDocuments.size})
                      </Button>
                    </>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleToggleSelectionMode}
                      className="h-7 text-xs"
                    >
                      Select
                    </Button>
                  )}
                </div>
                
                {isSelectionMode && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleToggleSelectionMode}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            )}

            <SidebarGroupContent>
              <SidebarMenu>
                {searchTerm.trim() ? (
                  // Search results view
                  filteredDocuments.length === 0 ? (
                    <div className="px-2 text-zinc-500 text-sm text-center py-4">
                      No documents found matching &quot;{searchTerm}&quot;
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <DocumentItem
                        key={`${doc.id}-${doc.createdAt}`}
                        document={doc}
                        isActive={doc.id === activeDocumentId}
                        onDelete={(documentId) => {
                          setDeleteId(documentId);
                          setShowDeleteDialog(true);
                        }}
                        setOpenMobile={setOpenMobile}
                        onSelect={handleDocumentSelect}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedDocuments.has(doc.id)}
                        onToggleSelect={handleToggleSelect}
                      />
                    ))
                  )
                ) : (
                  // Grouped by date view
                  (() => {
                    const groupedDocuments = groupDocumentsByDate(filteredDocuments);
                    return (
                      <>
                        {/* Today's documents */}
                        {groupedDocuments.today.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                              Today
                            </div>
                            {groupedDocuments.today.map((doc) => (
                              <DocumentItem
                                key={`${doc.id}-${doc.createdAt}`}
                                document={doc}
                                isActive={doc.id === activeDocumentId}
                                onDelete={(documentId) => {
                                  setDeleteId(documentId);
                                  setShowDeleteDialog(true);
                                }}
                                setOpenMobile={setOpenMobile}
                                onSelect={handleDocumentSelect}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedDocuments.has(doc.id)}
                                onToggleSelect={handleToggleSelect}
                              />
                            ))}
                          </>
                        )}

                        {/* Yesterday's documents */}
                        {groupedDocuments.yesterday.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                              Yesterday
                            </div>
                            {groupedDocuments.yesterday.map((doc) => (
                              <DocumentItem
                                key={`${doc.id}-${doc.createdAt}`}
                                document={doc}
                                isActive={doc.id === activeDocumentId}
                                onDelete={(documentId) => {
                                  setDeleteId(documentId);
                                  setShowDeleteDialog(true);
                                }}
                                setOpenMobile={setOpenMobile}
                                onSelect={handleDocumentSelect}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedDocuments.has(doc.id)}
                                onToggleSelect={handleToggleSelect}
                              />
                            ))}
                          </>
                        )}

                        {/* Last week's documents */}
                        {groupedDocuments.lastWeek.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                              Last 7 days
                            </div>
                            {groupedDocuments.lastWeek.map((doc) => (
                              <DocumentItem
                                key={`${doc.id}-${doc.createdAt}`}
                                document={doc}
                                isActive={doc.id === activeDocumentId}
                                onDelete={(documentId) => {
                                  setDeleteId(documentId);
                                  setShowDeleteDialog(true);
                                }}
                                setOpenMobile={setOpenMobile}
                                onSelect={handleDocumentSelect}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedDocuments.has(doc.id)}
                                onToggleSelect={handleToggleSelect}
                              />
                            ))}
                          </>
                        )}

                        {/* Last month's documents */}
                        {groupedDocuments.lastMonth.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                              Last 30 days
                            </div>
                            {groupedDocuments.lastMonth.map((doc) => (
                              <DocumentItem
                                key={`${doc.id}-${doc.createdAt}`}
                                document={doc}
                                isActive={doc.id === activeDocumentId}
                                onDelete={(documentId) => {
                                  setDeleteId(documentId);
                                  setShowDeleteDialog(true);
                                }}
                                setOpenMobile={setOpenMobile}
                                onSelect={handleDocumentSelect}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedDocuments.has(doc.id)}
                                onToggleSelect={handleToggleSelect}
                              />
                            ))}
                          </>
                        )}

                        {/* Older documents */}
                        {groupedDocuments.older.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                              Older
                            </div>
                            {groupedDocuments.older.map((doc) => (
                              <DocumentItem
                                key={`${doc.id}-${doc.createdAt}`}
                                document={doc}
                                isActive={doc.id === activeDocumentId}
                                onDelete={(documentId) => {
                                  setDeleteId(documentId);
                                  setShowDeleteDialog(true);
                                }}
                                setOpenMobile={setOpenMobile}
                                onSelect={handleDocumentSelect}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedDocuments.has(doc.id)}
                                onToggleSelect={handleToggleSelect}
                              />
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </>
        )}
      </SidebarGroup>

      {/* Delete single document dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              document and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Delete multiple documents dialog */}
      <AlertDialog open={showMultiDeleteDialog} onOpenChange={setShowMultiDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedDocuments.size} documents?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected
              documents and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMultiple}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete {selectedDocuments.size} documents
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 