"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Loader2, GlobeIcon, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Document } from '@snow-leopard/db';
import type { User } from '@/lib/auth';

export type StyleOption = 'light' | 'dark' | 'minimal';

interface PublishSettingsMenuProps {
  document: Document | null;
  user: User;
  onUpdate: (updatedFields: Partial<Document>) => void;
}

export function PublishSettingsMenu({
  document,
  user,
  onUpdate,
}: PublishSettingsMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // State for editing publish settings
  const [author, setAuthor] = useState('');
  const [slug, setSlug] = useState('');
  const [style, setStyle] = useState<StyleOption>('light');
  const [isProcessing, setIsProcessing] = useState(false);

  const isPublished = document?.visibility === 'public';

  useEffect(() => {
    if (document) {
      setAuthor(document.author || user.name || '');
      setStyle((document.style as any)?.theme || 'light');
      setSlug(
        document.slug ||
          document.title
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
      );
    }
  }, [document, user.name]);

  const handlePublishToggle = useCallback(async () => {
    if (!document) return;

    const newVisibility = isPublished ? 'private' : 'public';

    if (newVisibility === 'public' && !author.trim()) {
      toast.error('Author name cannot be empty.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/document/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: document.id,
          visibility: newVisibility,
          author: author,
          style: { theme: style },
          slug: slug,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update publication status');
      }

      const updatedDocument = await res.json();

      onUpdate(updatedDocument);

      toast.success(
        newVisibility === 'public'
          ? 'Document published!'
          : 'Document unpublished.',
      );
      setIsOpen(false);

      if (newVisibility === 'public') {
        toast.info(`Published at: /${author}/${slug}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
    } finally {
      setIsProcessing(false);
    }
  }, [document, author, style, slug, isPublished, onUpdate]);

  if (!document) return null;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isPublished ? 'secondary' : 'outline'}
          size="sm"
          className={cn('gap-1.5', isPublished && 'text-blue-500')}
        >
          <GlobeIcon className="size-4" />
          {isPublished ? 'Published' : 'Publish'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72 p-3 shadow-lg bg-popover border rounded-md space-y-3"
        align="end"
      >
        {!isPublished ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="author-name" className="text-xs">
                Author
              </Label>
              <Input
                id="author-name"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Enter author name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug" className="text-xs">
                URL Slug
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="your-document-slug"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Style</Label>
              <div className="flex items-center gap-1.5">
                {(['light', 'dark', 'minimal'] as StyleOption[]).map((opt) => (
                  <Button
                    key={opt}
                    variant={style === opt ? 'secondary' : 'ghost'}
                    size="sm"
                    className="flex-1 capitalize text-xs"
                    onClick={() => setStyle(opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              onClick={handlePublishToggle}
              disabled={isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Confirm and Publish'
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm font-medium">Your document is live.</div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              asChild
            >
              <a
                href={`/${author}/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon className="size-4" />
                {`/${author}/${slug}`}
              </a>
            </Button>
            <Button
              onClick={handlePublishToggle}
              disabled={isProcessing}
              variant="destructive"
              className="w-full"
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Unpublish'
              )}
            </Button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 