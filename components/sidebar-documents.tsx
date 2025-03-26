'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/auth-helpers-nextjs';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
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
import { fetcher } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactKind } from '@/components/artifact';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare as MessageSquareIcon } from 'lucide-react';

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
    router.push(`/chat/new?document=${documentId}`);
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
            href={isSelectionMode ? "#" : `/chat?document=${document.id}`}
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
  const { createDocument, isCreatingDocument, loadDocument, deleteDocument } = useDocumentUtils();
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  
  const {
    data: documents,
    isLoading,
    mutate,
  } = useSWR<Array<Document>>(user ? '/api/documents' : null, fetcher, {
    fallbackData: [],
  });

  useEffect(() => {
    mutate();
  }, [mutate]);

  // Listen for document-renamed events to update the sidebar
  useEffect(() => {
    const handleDocumentRenamed = () => {
      console.log('[SidebarDocuments] Refreshing documents after rename');
      mutate();
    };
    
    window.addEventListener('document-renamed', handleDocumentRenamed);
    
    return () => {
      window.removeEventListener('document-renamed', handleDocumentRenamed);
    };
  }, [mutate]);

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
    
    // Get current document ID from URL
    const url = new URL(window.location.href);
    const currentDocumentId = url.searchParams.get('document');
    const isCurrentDocument = currentDocumentId === deleteId;
    
    // Use deleteDocument from document utils hook
    const success = await deleteDocument(deleteId, {
      // Only provide redirectUrl if we're deleting the current document
      redirectUrl: isCurrentDocument ? (chatId ? `/chat/${chatId}` : '/') : ''
    });
    
    if (success) {
      mutate((documents) => {
        if (documents) {
          return documents.filter((d) => d.id !== deleteId);
        }
      });
      setShowDeleteDialog(false);
    }
  };
  
  const handleDeleteMultiple = async () => {
    const selectedDocumentIds = Array.from(selectedDocuments);
    
    try {
      // Delete each document - we'll handle redirection in the UI
      const deletePromises = selectedDocumentIds.map(documentId => 
        deleteDocument(documentId, { 
          // Don't redirect for each delete - we'll do it once at the end if needed
          redirectUrl: '' 
        })
      );
      
      await Promise.all(deletePromises);
      
      // Update local state
      mutate((documents) => {
        if (documents) {
          return documents.filter(d => !selectedDocuments.has(d.id));
        }
      });
      
      setSelectedDocuments(new Set());
      setIsSelectionMode(false);
      
      // Check if current document was deleted
      const url = new URL(window.location.href);
      const currentDocumentId = url.searchParams.get('document');
      if (currentDocumentId && selectedDocuments.has(currentDocumentId)) {
        if (chatId) {
          router.push(`/chat/${chatId}`);
        } else {
          router.push('/');
        }
      }
      
      toast.success(`${selectedDocumentIds.length} documents deleted successfully`);
    } catch (error) {
      console.error('[SidebarDocuments] Error deleting multiple documents:', error);
      toast.error('Failed to delete some documents');
    }
    
    setShowMultiDeleteDialog(false);
  };
  
  // Create a new document using document utils hook
  const createNewDocument = useCallback(async () => {
    await createDocument({
      title: 'New Document',
      content: '',
      kind: 'text' as ArtifactKind,
      chatId: chatId ? String(chatId) : null,
      navigateAfterCreate: true
    });
    
    // Refresh documents list
    mutate();
  }, [chatId, createDocument, mutate]);
  
  // Handler for when a document is selected using document utils hook
  const handleDocumentSelect = async (documentId: string) => {
    console.log('[SidebarDocuments] Loading document:', documentId);
    try {
      // Prevent default navigation behavior which might be causing issues
      if (documentId === 'init' || !documentId) {
        console.error('[SidebarDocuments] Invalid document ID:', documentId);
        toast.error('Cannot load document: invalid ID');
        return;
      }
      
      // Show loading indicator for better UX
      const toastId = `loading-doc-${documentId}`;
      toast.loading('Loading document...', { id: toastId });
      
      // Track current loading request to prevent race conditions
      const loadingTimestamp = Date.now();
      (window as any).__CURRENT_DOCUMENT_LOADING = loadingTimestamp;
      
      const document = await loadDocument(documentId, { 
        navigateAfterLoad: true,
        // Don't specify chatId here - let loadDocument determine the appropriate chat
      });
      
      // Only show success if this is still the most recent request
      if ((window as any).__CURRENT_DOCUMENT_LOADING === loadingTimestamp) {
        if (document) {
          toast.success('Document loaded', { id: toastId });
        } else {
          toast.error('Failed to load document', { id: toastId });
        }
      } else {
        // If a newer request came in, dismiss this toast
        toast.dismiss(toastId);
      }
    } catch (error) {
      console.error('[SidebarDocuments] Error loading document:', error);
      toast.error('Failed to load document');
    }
  };

  // Filter documents based on search term
  const filterDocuments = (docs: Document[]) => {
    if (!searchTerm.trim()) return docs;
    
    // Use a Map to ensure only unique document IDs
    const uniqueDocs = new Map<string, Document>();
    
    docs.filter(doc => 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.content && doc.content.toLowerCase().includes(searchTerm.toLowerCase()))
    ).forEach(doc => {
      // Only keep the first (most recent) instance of each document ID
      if (!uniqueDocs.has(doc.id)) {
        uniqueDocs.set(doc.id, doc);
      }
    });
    
    return Array.from(uniqueDocs.values());
  };

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

  const filteredDocuments = filterDocuments(documents || []);

  if (filteredDocuments.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            You don't have any documents yet
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const groupDocumentsByDate = (docs: Document[]): GroupedDocuments => {
    const now = new Date();
    const oneWeekAgo = subWeeks(now, 1);
    const oneMonthAgo = subMonths(now, 1);
    
    // Track document IDs we've already processed to avoid duplicates
    const processedDocIds = new Set<string>();

    return docs.reduce(
      (groups, doc) => {
        // Skip if we've already processed this document
        if (processedDocIds.has(doc.id)) {
          return groups;
        }
        
        // Mark as processed
        processedDocIds.add(doc.id);
        
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

  // Get current document ID from URL
  const url = new URL(window.location.href);
  const currentDocumentId = url.searchParams.get('document');

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
              className="h-5 w-5" 
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
                {(() => {
                  // If search is active, don't group by date
                  if (searchTerm.trim()) {
                    return (
                      <>
                        {filteredDocuments.length === 0 ? (
                          <div className="px-2 text-zinc-500 text-sm text-center py-4">
                            No documents found matching "{searchTerm}"
                          </div>
                        ) : (
                          filteredDocuments.map((doc) => (
                            <DocumentItem
                              key={doc.id}
                              document={doc}
                              isActive={doc.id === currentDocumentId}
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
                        )}
                      </>
                    );
                  }
                  
                  // Group by date when not searching
                  const groupedDocuments = groupDocumentsByDate(filteredDocuments);

                  return (
                    <>
                      {groupedDocuments.today.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                            Today
                          </div>
                          {groupedDocuments.today.map((doc) => (
                            <DocumentItem
                              key={doc.id}
                              document={doc}
                              isActive={doc.id === currentDocumentId}
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

                      {groupedDocuments.yesterday.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                            Yesterday
                          </div>
                          {groupedDocuments.yesterday.map((doc) => (
                            <DocumentItem
                              key={doc.id}
                              document={doc}
                              isActive={doc.id === currentDocumentId}
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

                      {groupedDocuments.lastWeek.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                            Last 7 days
                          </div>
                          {groupedDocuments.lastWeek.map((doc) => (
                            <DocumentItem
                              key={doc.id}
                              document={doc}
                              isActive={doc.id === currentDocumentId}
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

                      {groupedDocuments.lastMonth.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                            Last 30 days
                          </div>
                          {groupedDocuments.lastMonth.map((doc) => (
                            <DocumentItem
                              key={doc.id}
                              document={doc}
                              isActive={doc.id === currentDocumentId}
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

                      {groupedDocuments.older.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-4">
                            Older
                          </div>
                          {groupedDocuments.older.map((doc) => (
                            <DocumentItem
                              key={doc.id}
                              document={doc}
                              isActive={doc.id === currentDocumentId}
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
                })()}
              </SidebarMenu>
            </SidebarGroupContent>
          </>
        )}
      </SidebarGroup>

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