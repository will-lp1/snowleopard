'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/auth-helpers-nextjs';
import { memo, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import {
  CheckCircleFillIcon,
  GlobeIcon,
  LockIcon,
  MoreHorizontalIcon,
  ShareIcon,
  TrashIcon,
  FileIcon,
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
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
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
import type { Chat, Document } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactKind } from '@/components/artifact';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  setOpenMobile,
  onSelect,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  setOpenMobile: (open: boolean) => void;
  onSelect: (chatId: string) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (chatId: string, isSelected: boolean) => void;
}) => {
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibility: chat.visibility,
  });

  // Fetch documents linked to this chat
  const { data: linkedDocuments } = useSWR<Document[]>(
    `/api/document?chatId=${chat.id}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const handleChatClick = () => {
    if (isSelectionMode) {
      onToggleSelect(chat.id, !isSelected);
      return;
    }
    setOpenMobile(false);
    onSelect(chat.id);
  };

  // Get the latest document if any
  const latestDocument = linkedDocuments && linkedDocuments.length > 0
    ? linkedDocuments[0]
    : null;

  return (
    <SidebarMenuItem>
      <div className="flex items-center w-full">
        {isSelectionMode && (
          <div className="pl-2 pr-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect(chat.id, !!checked)}
              aria-label={`Select ${chat.title}`}
            />
          </div>
        )}
        <SidebarMenuButton 
          asChild 
          isActive={isActive}
          className={cn(isSelectionMode && "flex-1")}
        >
          <Link 
            href={isSelectionMode ? "#" : `/chat/${chat.id}${latestDocument ? `?document=${latestDocument.id}` : ''}`} 
            onClick={handleChatClick}
          >
            <div className="flex flex-col w-full">
              <span className="truncate">{chat.title}</span>
              {latestDocument && (
                <span className="truncate text-xs text-muted-foreground">
                  {latestDocument.title}
                </span>
              )}
            </div>
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <ShareIcon />
                <span>Share</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    className="cursor-pointer flex-row justify-between"
                    onClick={() => {
                      setVisibilityType('private');
                    }}
                  >
                    <div className="flex flex-row gap-2 items-center">
                      <LockIcon size={12} />
                      <span>Private</span>
                    </div>
                    {visibilityType === 'private' ? (
                      <CheckCircleFillIcon />
                    ) : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer flex-row justify-between"
                    onClick={() => {
                      setVisibilityType('public');
                    }}
                  >
                    <div className="flex flex-row gap-2 items-center">
                      <GlobeIcon />
                      <span>Public</span>
                    </div>
                    {visibilityType === 'public' ? <CheckCircleFillIcon /> : null}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
              onSelect={() => onDelete(chat.id)}
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

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.isSelectionMode !== nextProps.isSelectionMode) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  return true;
});

export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { id } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { setArtifact } = useArtifact();
  
  const {
    data: history,
    isLoading,
    mutate,
  } = useSWR<Array<Chat>>(user ? '/api/history' : null, fetcher, {
    fallbackData: [],
  });

  useEffect(() => {
    mutate();
  }, [pathname, mutate]);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [showMultiDeleteDialog, setShowMultiDeleteDialog] = useState(false);
  
  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedChats(new Set());
  };
  
  const handleToggleSelect = (chatId: string, isSelected: boolean) => {
    setSelectedChats(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(chatId);
      } else {
        newSet.delete(chatId);
      }
      return newSet;
    });
  };
  
  const handleSelectAll = () => {
    if (history) {
      if (selectedChats.size === history.length) {
        // Deselect all
        setSelectedChats(new Set());
      } else {
        // Select all
        setSelectedChats(new Set(history.map(chat => chat.id)));
      }
    }
  };
  
  const handleDelete = async () => {
    const deletePromise = fetch(`/api/chat?id=${deleteId}`, {
      method: 'DELETE',
    });

    toast.promise(deletePromise, {
      loading: 'Deleting chat...',
      success: () => {
        mutate((history) => {
          if (history) {
            return history.filter((h) => h.id !== deleteId);
          }
        });
        return 'Chat deleted successfully';
      },
      error: 'Failed to delete chat',
    });

    setShowDeleteDialog(false);

    if (deleteId === id) {
      router.push('/');
    }
  };
  
  const handleDeleteMultiple = async () => {
    const selectedChatIds = Array.from(selectedChats);
    
    // Create an array of delete promises
    const deletePromises = selectedChatIds.map(chatId => 
      fetch(`/api/chat?id=${chatId}`, {
        method: 'DELETE',
      })
    );
    
    toast.promise(Promise.all(deletePromises), {
      loading: `Deleting ${selectedChatIds.length} chats...`,
      success: () => {
        mutate((history) => {
          if (history) {
            return history.filter(h => !selectedChats.has(h.id));
          }
        });
        setSelectedChats(new Set());
        setIsSelectionMode(false);
        
        // If current chat is deleted, redirect to homepage
        if (id && typeof id === 'string' && selectedChats.has(id)) {
          router.push('/');
        }
        
        return `${selectedChatIds.length} chats deleted successfully`;
      },
      error: 'Failed to delete chats',
    });
    
    setShowMultiDeleteDialog(false);
  };
  
  // Handler for when a chat is selected
  const handleChatSelect = async (chatId: string) => {
    try {
      // Fetch documents for this chat
      const response = await fetch(`/api/document?chatId=${chatId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      
      const documents: Document[] = await response.json();
      
      // If there are documents associated with this chat
      if (documents && documents.length > 0) {
        // Sort by creation date descending to get latest document
        documents.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        // Get the most recent document
        const latestDocument = documents[0];
        
        // Update URL to include document
        router.push(`/chat/${chatId}?document=${latestDocument.id}`);
        
        // Reset artifact state with the document's info
        setArtifact(curr => ({
          ...curr,
          documentId: latestDocument.id,
          title: latestDocument.title,
          content: latestDocument.content || '',
          kind: (latestDocument.kind as ArtifactKind) || 'text',
          status: 'idle',
          isVisible: true,
          boundingBox: curr.boundingBox // maintain the current bounding box
        }));
      } else {
        // No documents, navigate to chat without document parameter
        router.push(`/chat/${chatId}`);
        
        // Reset artifact to initial state
        setArtifact(curr => ({
          ...curr,
          documentId: 'init', 
          title: 'New Document',
          content: '',
          status: 'idle',
          kind: 'text' as ArtifactKind,
          isVisible: true,
          boundingBox: curr.boundingBox // maintain the current bounding box
        }));
      }
    } catch (error) {
      console.error('Error loading documents for chat:', error);
      // Navigate to chat without document in case of error
      router.push(`/chat/${chatId}`);
      
      // Also reset artifact to initial state
      setArtifact(curr => ({
        ...curr,
        documentId: 'init',
        title: 'New Document',
        content: '',
        status: 'idle',
        kind: 'text' as ArtifactKind,
        isVisible: true,
        boundingBox: curr.boundingBox // maintain the current bounding box
      }));
      
      toast.error('Failed to load documents');
    }
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            Login to see your chat history
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

  if (history?.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            You don't have any chats yet
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const groupChatsByDate = (chats: Chat[]): GroupedChats => {
    const now = new Date();
    const oneWeekAgo = subWeeks(now, 1);
    const oneMonthAgo = subMonths(now, 1);

    return chats.reduce(
      (groups, chat) => {
        const chatDate = new Date(chat.createdAt);

        if (isToday(chatDate)) {
          groups.today.push(chat);
        } else if (isYesterday(chatDate)) {
          groups.yesterday.push(chat);
        } else if (chatDate > oneWeekAgo) {
          groups.lastWeek.push(chat);
        } else if (chatDate > oneMonthAgo) {
          groups.lastMonth.push(chat);
        } else {
          groups.older.push(chat);
        }

        return groups;
      },
      {
        today: [],
        yesterday: [],
        lastWeek: [],
        lastMonth: [],
        older: [],
      } as GroupedChats,
    );
  };

  return (
    <>
      {user && history && history.length > 0 && (
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
                  {selectedChats.size === history.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => {
                    if (selectedChats.size > 0) {
                      setShowMultiDeleteDialog(true);
                    }
                  }}
                  disabled={selectedChats.size === 0}
                  className="h-7 text-xs"
                >
                  Delete ({selectedChats.size})
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
    
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {history &&
              (() => {
                const groupedChats = groupChatsByDate(history);

                return (
                  <>
                    {groupedChats.today.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                          Today
                        </div>
                        {groupedChats.today.map((chat) => (
                          <ChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={chat.id === id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            setOpenMobile={setOpenMobile}
                            onSelect={handleChatSelect}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedChats.has(chat.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        ))}
                      </>
                    )}

                    {groupedChats.yesterday.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-6">
                          Yesterday
                        </div>
                        {groupedChats.yesterday.map((chat) => (
                          <ChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={chat.id === id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            setOpenMobile={setOpenMobile}
                            onSelect={handleChatSelect}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedChats.has(chat.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        ))}
                      </>
                    )}

                    {groupedChats.lastWeek.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-6">
                          Last 7 days
                        </div>
                        {groupedChats.lastWeek.map((chat) => (
                          <ChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={chat.id === id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            setOpenMobile={setOpenMobile}
                            onSelect={handleChatSelect}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedChats.has(chat.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        ))}
                      </>
                    )}

                    {groupedChats.lastMonth.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-6">
                          Last 30 days
                        </div>
                        {groupedChats.lastMonth.map((chat) => (
                          <ChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={chat.id === id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            setOpenMobile={setOpenMobile}
                            onSelect={handleChatSelect}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedChats.has(chat.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        ))}
                      </>
                    )}

                    {groupedChats.older.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-sidebar-foreground/50 mt-6">
                          Older
                        </div>
                        {groupedChats.older.map((chat) => (
                          <ChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={chat.id === id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            setOpenMobile={setOpenMobile}
                            onSelect={handleChatSelect}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedChats.has(chat.id)}
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
      </SidebarGroup>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={showMultiDeleteDialog} onOpenChange={setShowMultiDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedChats.size} chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected
              chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMultiple}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete {selectedChats.size} chats
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
