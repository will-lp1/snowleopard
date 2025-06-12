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
import { Loader2, GlobeIcon, CopyIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Document } from '@snow-leopard/db';
import type { User } from '@/lib/auth';

export type StyleOption = 'light' | 'dark' | 'minimal';

interface PublishSettingsMenuProps {
  document: Document;
  user: User;
  onUpdate: (updatedDoc: Document) => void;
}

export function PublishSettingsMenu({ document, user, onUpdate }: PublishSettingsMenuProps) {
  // Local UI state
  const [author, setAuthor] = useState(document.author || user.name || '');
  const [slug, setSlug] = useState(
    document.slug ||
      document.title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
  );
  const [style, setStyle] = useState<StyleOption>((document.style as any)?.theme || 'light');
  const [processing, setProcessing] = useState(false);

  const isPublished = document.visibility === 'public';
  const url = typeof window !== 'undefined' ? `${window.location.origin}/${author}/${slug}` : `/${author}/${slug}`;

  const handleToggle = useCallback(async () => {
    const newVisibility = isPublished ? 'private' : 'public';
    if (newVisibility === 'public' && !author.trim()) {
      toast.error('Please enter an author name.');
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
          author,
          style: { theme: style },
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
  }, [document.id, isPublished, author, style, slug, onUpdate]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isPublished ? 'secondary' : 'outline'}
          className="h-8 px-3 gap-2"
        >
          <GlobeIcon className="size-4" />
          {isPublished ? 'Published' : 'Publish'}
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
            <div className="space-y-1">
              <Label htmlFor="pub-author" className="text-xs font-medium block">
                Author
              </Label>
              <Input
                id="pub-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="h-8"
                placeholder="Your name"
              />
            </div>
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
            <div className="mb-4 space-y-2">
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
            <Button
              onClick={handleToggle}
              disabled={processing}
              className="w-full"
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : 'Confirm & Publish'}
            </Button>
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
              variant="destructive"
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