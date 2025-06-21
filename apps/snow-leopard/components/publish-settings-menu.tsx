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
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import { Paywall } from '@/components/paywall';

type FontOption = 'sans' | 'serif' | 'mono';

interface PublishSettingsMenuProps {
  document: Document;
  user: User;
  onUpdate: (updatedDoc: Document) => void;
}

export function PublishSettingsMenu({ document, user, onUpdate }: PublishSettingsMenuProps) {
  // Subscription gating for publish settings
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSWR<{ hasActiveSubscription: boolean }>('/api/user/subscription-status', fetcher, { revalidateOnFocus: false });
  const hasSubscription = subscriptionData?.hasActiveSubscription ?? false;
  const [isPaywallOpen, setPaywallOpen] = useState(false);

  const [username, setUsername] = useState<string>(user.username || '');
  const [hasUsername, setHasUsername] = useState<boolean>(!!user.username);
  const [claiming, setClaiming] = useState(false);
  const [usernameCheck, setUsernameCheck] = useState<{ checking: boolean; available: boolean | null }>({ checking: false, available: null });
  const [slug, setSlug] = useState('');
  const [font, setFont] = useState<FontOption>('serif');
  const [processing, setProcessing] = useState(false);
  
  const isPublished = document.visibility === 'public';
  const url = typeof window !== 'undefined' ? `${window.location.origin}/${username}/${slug}` : `/${username}/${slug}`;

  useEffect(() => {
    setUsername(user.username || '');
    setHasUsername(!!user.username);
  }, [user.username]);
  
  useEffect(() => {
    setSlug(
      document.slug ||
        document.title
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
    );
    const styleObj = (document.style as any) || {};
    setFont(styleObj.font || 'serif');
  }, [document.slug, document.title, document.style]);

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

  const handleToggle = useCallback(async () => {
    const newVisibility = (document.visibility === 'public' ? 'private' : 'public') as 'public' | 'private';
    if (newVisibility === 'public' && !username.trim()) {
      toast.error('Please claim a username first.');
      return;
    }
    const snapshot = {
      id: document.id,
      visibility: newVisibility,
      author: username,
      style: { ...(document.style as any), font },
      slug,
    };
    const optimisticDoc = { ...document, ...snapshot };
    onUpdate(optimisticDoc);
    setProcessing(true);
    try {
      const res = await fetch('/api/document/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error('Failed to update publication.');
      const updated = await res.json();
      onUpdate(updated);
      toast.success(newVisibility === 'public' ? 'Published' : 'Unpublished');
    } catch (e: any) {
      toast.error(e.message || 'Error updating publication');
      onUpdate(document);
    } finally {
      setProcessing(false);
    }
  }, [document.id, isPublished, slug, username, onUpdate, font]);
  
  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedSlug = e.target.value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    setSlug(formattedSlug);
  };

  const disabled = !hasSubscription;

  // While loading subscription status, don't render anything
  if (isSubscriptionLoading) return null;
  // Render publish settings menu for subscribed users
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) { loadUsername(); } }}>
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
        className="group w-64 p-3 shadow-lg rounded-lg border bg-popover space-y-4 relative"
        align="end"
      >
        {/* Hover overlay for unsubscribed users */}
        {disabled && (
          <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-lg flex items-center justify-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
            <Button
              size="sm"
              variant="outline"
              className="pointer-events-auto"
              onClick={() => setPaywallOpen(true)}
            >
              Upgrade
            </Button>
          </div>
        )}
        <div>
          <Label className="text-sm font-medium">Publish Settings</Label>
        </div>
        {!isPublished ? (
          <>
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
                  disabled={claiming || hasUsername || processing || disabled}
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
                    disabled={disabled}
                  >
                    <Edit2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="pub-title" className="text-xs font-medium block">
                Slug
              </Label>
              <Input
                id="pub-title"
                value={slug}
                onChange={handleSlugChange}
                className="h-8"
                disabled={processing || disabled}
                placeholder="Page slug"
              />
            </div>
            
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
                    disabled={processing || disabled}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end p-2 border-t bg-background/50 -mx-3 -mb-3 mt-4">
              <Button
                size="sm"
                onClick={() => {
                  if (disabled) {
                    setPaywallOpen(true);
                    return;
                  }
                  handleToggle();
                }}
                disabled={processing || !hasUsername || disabled}
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
                disabled={disabled}
              >
                <CopyIcon className="size-4" /> Copy Link
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => window.open(url, '_blank')}
              disabled={disabled}
            >
              <GlobeIcon className="size-4" /> View
            </Button>
            <Button
              onClick={handleToggle}
              disabled={processing || disabled}
              variant="outline"
              className="w-full"
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : 'Unpublish'}
            </Button>
          </>
        )}
      </DropdownMenuContent>
      <Paywall isOpen={isPaywallOpen} onOpenChange={setPaywallOpen} required={false} />
    </DropdownMenu>
  );
} 