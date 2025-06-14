"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Loader2, GlobeIcon, CopyIcon, Edit2, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Document } from '@snow-leopard/db';
import type { User } from '@/lib/auth';

export type StyleOption = 'light' | 'dark' | 'minimal';
type FontOption = 'sans' | 'serif' | 'mono';

interface PublishSettingsMenuProps {
  document: Document;
  user: User;
  onUpdate: (updatedDoc: Document) => void;
}

export function PublishSettingsMenu({ document, user, onUpdate }: PublishSettingsMenuProps) {
  // Control dropdown open state to trigger refresh
  const [menuOpen, setMenuOpen] = useState(false);

  // Username claim state
  const [username, setUsername] = useState<string>(user.username || '');
  const [hasUsername, setHasUsername] = useState<boolean>(!!user.username);
  // Sync local username state when user prop changes
  useEffect(() => {
    setUsername(user.username || '');
    setHasUsername(!!user.username);
  }, [user.username]);

  const [usernameCheck, setUsernameCheck] = useState<{ checking: boolean; available: boolean | null }>({ checking: false, available: null });
  const [claiming, setClaiming] = useState(false);
  // Helper to load the current username from API
  const loadUsername = useCallback(async () => {
    try {
      const res = await fetch('/api/user');
      if (!res.ok) return;
      const data = await res.json();
      if (data.username) {
        setUsername(data.username);
        setHasUsername(true);
        setUsernameCheck({ checking: false, available: true });
      }
    } catch (err) {
      console.error('[PublishSettingsMenu] Failed to load username:', err);
    }
  }, []);

  // Load username on mount
  useEffect(() => {
    loadUsername();
  }, [loadUsername]);

  // Refresh the latest document state (including visibility) when menu opens
  const refreshDocument = useCallback(async () => {
    try {
      const res = await fetch(`/api/document?id=${encodeURIComponent(document.id)}`);
      if (!res.ok) return;
      const docs = await res.json();
      if (Array.isArray(docs) && docs.length > 0) {
        onUpdate(docs[0]);
      }
    } catch (err) {
      console.error('[PublishSettingsMenu] Failed to refresh document:', err);
    }
  }, [document.id, onUpdate]);

  // Local UI state
  const [slug, setSlug] = useState(
    document.slug ||
      document.title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
  );
  // Sync local document-related state when document prop changes
  useEffect(() => {
    setSlug(
      document.slug ||
        document.title
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
    );
    const styleObj = (document.style as any) || {};
    setStyle(styleObj.theme || 'light');
    setFont(styleObj.font || 'serif');
  }, [document.slug, document.title, document.style]);
  const [style, setStyle] = useState<StyleOption>((document.style as any)?.theme || 'light');
  const [font, setFont] = useState<FontOption>((document.style as any)?.font || 'serif');
  const [processing, setProcessing] = useState(false);

  // Determine published state from document prop
  const isPublished = document.visibility === 'public';

  const url = typeof window !== 'undefined' ? `${window.location.origin}/${username}/${slug}` : `/${username}/${slug}`;

  // Helper to check username availability
  const checkUsername = useCallback(async () => {
    if (!username.trim()) return;
    setUsernameCheck({ checking: true, available: null });
    const res = await fetch(`/api/user?username=${encodeURIComponent(username)}`);
    if (res.ok) {
      const { available } = await res.json();
      setUsernameCheck({ checking: false, available });
    } else {
      setUsernameCheck({ checking: false, available: false });
    }
  }, [username]);

  // Debounced username check
  useEffect(() => {
    if (!username.trim() || username === user.username) {
        setUsernameCheck({ checking: false, available: null });
        return;
    }
    const handler = setTimeout(() => {
        checkUsername();
    }, 500);

    return () => {
        clearTimeout(handler);
    };
  }, [username, checkUsername, user.username]);

  // Helper to claim username globally
  const claimUsername = useCallback(async () => {
    if (!usernameCheck.available) return;
    setClaiming(true);
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (res.ok) {
      setHasUsername(true);
      setUsernameCheck({ checking: false, available: true });
      toast.success('Username claimed!');
    } else {
      toast.error('Failed to claim username');
    }
    setClaiming(false);
  }, [username, usernameCheck.available]);

  const handleToggle = useCallback(async () => {
    const newVisibility = isPublished ? 'private' : 'public';
    if (newVisibility === 'public' && !username.trim()) {
      toast.error('Please claim a username first.');
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch('/api/document/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: document.id,
          visibility: newVisibility,
          author: username,
          style: { theme: style, font },
          slug,
        }),
      });
      if (!res.ok) throw new Error('Failed to update publication.');
      const updated = await res.json();
      onUpdate(updated);
      toast.success(isPublished ? 'Unpublished' : 'Published');
    } catch (e: any) {
      toast.error(e.message || 'Error updating publication');
    } finally {
      setProcessing(false);
    }
  }, [document.id, isPublished, style, slug, username, onUpdate, font]);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={(open) => {
      setMenuOpen(open);
      if (open) {
        refreshDocument();
        loadUsername();
      }
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-8 w-8 p-0 flex items-center justify-center transition-colors',
            isPublished ? 'text-blue-500' : 'text-muted-foreground'
          )}
        >
          <GlobeIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 p-3 shadow-lg rounded-lg border bg-popover space-y-4"
        align="end"
      >
        <div>
          <Label className="text-sm font-medium">Publish Settings</Label>
        </div>
        {!isPublished ? (
          <>
            {/* Username Claim Section */}
            <div className="space-y-2">
              <Label htmlFor="pub-username" className="text-xs font-medium block">Username</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="pub-username"
                  value={hasUsername ? `@${username}` : username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (usernameCheck.available !== null) {
                      setUsernameCheck({ checking: false, available: null });
                    }
                    if (hasUsername) {
                      setHasUsername(false);
                    }
                  }}
                  disabled={claiming || hasUsername}
                  className={cn(
                    "flex-1 h-8",
                    hasUsername
                      ? "opacity-50 bg-transparent border border-input text-muted-foreground"
                      : usernameCheck.available === false
                        ? "border-destructive text-destructive focus-visible:ring-destructive"
                        : usernameCheck.available === true
                          ? "border-green-500 text-green-500 focus-visible:ring-green-500"
                          : ""
                  )}
                  placeholder="Choose a username"
                />
                {usernameCheck.checking && !hasUsername && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {!hasUsername && !usernameCheck.checking && usernameCheck.available && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={claimUsername}
                    disabled={claiming}
                  >
                    {claiming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  </Button>
                )}
                {hasUsername && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => {
                      setHasUsername(false);
                      setUsernameCheck({ checking: false, available: null });
                    }}
                  >
                    <Edit2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            {/* Title Input */}
            <div className="space-y-1">
              <Label htmlFor="pub-title" className="text-xs font-medium block">
                Title
              </Label>
              <Input
                id="pub-title"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="h-8"
                placeholder="Page slug"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium block">Style</Label>
              <div className="flex items-center gap-1.5">
                {(['light', 'dark', 'minimal'] as StyleOption[]).map((opt) => (
                  <Button
                    key={opt}
                    variant={style === opt ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'flex-1 h-8 text-xs capitalize',
                      style === opt ? 'font-semibold' : 'text-muted-foreground'
                    )}
                    onClick={() => setStyle(opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
            {/* Font Section */}
            <div className="space-y-2">
              <Label className="text-xs font-medium block">Font</Label>
              <div className="flex items-center gap-1.5">
                {(['sans', 'serif', 'mono'] as FontOption[]).map((opt) => (
                  <Button
                    key={opt}
                    variant={font === opt ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'flex-1 h-8 text-xs capitalize',
                      font === opt ? 'font-semibold' : 'text-muted-foreground'
                    )}
                    onClick={() => setFont(opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end p-2 border-t bg-background/50 -mx-3 -mb-3 mt-4">
              <Button
                size="sm"
                onClick={handleToggle}
                disabled={processing || !hasUsername}
              >
                {processing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Check className="size-4 mr-1" /> Publish
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  toast.success('Link copied');
                }}
              >
                <CopyIcon className="size-4" /> Copy Link
              </Button>
            </div>
            <Button
              onClick={handleToggle}
              disabled={processing}
              variant="outline"
              className="w-full"
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : 'Unpublish'}
            </Button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 