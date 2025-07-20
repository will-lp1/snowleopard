'use client';

import { useState } from 'react';
import { LoaderIcon, SparklesIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { T, Var, useGT } from 'gt-next';

interface WebSearchCallProps {
  args: { query: string };
}

export function WebSearchCall({ args }: WebSearchCallProps) {
  return (
    <div className="bg-background border rounded-xl w-full max-w-md flex items-center p-3 gap-3 text-sm">
      <div className="text-muted-foreground flex-shrink-0">
        <SparklesIcon size={16} />
      </div>
      <div className="flex-grow text-foreground">
        <T>
          Searching web for &quot;<Var>{args.query}</Var>&quot;...
        </T>
      </div>
      <div className="animate-spin text-muted-foreground flex-shrink-0">
        <LoaderIcon size={16} />
      </div>
    </div>
  );
}

interface WebSearchResultProps {
  args: { query: string };
  result: { results?: Array<{ title?: string; url: string; content?: string }> };
}

export function WebSearchResult({ args, result }: WebSearchResultProps) {
  const [open, setOpen] = useState(false);
  const list = result.results || [];
  const t = useGT();

  return (
    <div className="bg-background border rounded-xl w-full max-w-md p-4 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground flex-shrink-0">
            <SparklesIcon size={16} />
          </div>
          <T>
            <span>Search completed for &quot;<Var>{args.query}</Var>&quot;</span>
          </T>
        </div>
        <Button 
          variant="link" 
          size="sm" 
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? t('Hide sources') : t('View {count} sources', { count: list.length })}
        </Button>
      </div>
      {open && (
        list.length === 0 ? (
          <T>
            <p className="text-muted-foreground mt-2">No sources found.</p>
          </T>
        ) : (
        <ul className="list-disc pl-5 mt-2 space-y-1 max-h-60 overflow-auto">
          {list.map((item, idx) => (
            <li key={idx}>
              {item.title ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {item.title}
                </a>
              ) : (
                <span>{item.url}</span>
              )}
              {item.content && <span>: {item.content}</span>}
            </li>
          ))}
        </ul>
        )
      )}
    </div>
  );
} 