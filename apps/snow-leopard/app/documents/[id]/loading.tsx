export default function Loading() {
  // Shows a skeleton for the document editor while the page loads
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header skeleton */}
      <div className="flex items-center border-b border-zinc-200 dark:border-zinc-700 px-3 h-[45px]">
        <div className="h-6 w-32 bg-muted rounded animate-pulse" />
      </div>
      {/* Editor skeleton */}
      <div className="px-8 py-6 mx-auto max-w-3xl flex-1">
        <div className="space-y-4 animate-pulse">
          <div className="h-6 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-5/6"></div>
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    </div>
  );
} 