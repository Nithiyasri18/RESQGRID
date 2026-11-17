export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-11 w-full rounded-md border border-slate-800/70 bg-[#0E1729] animate-pulse"
        />
      ))}
    </div>
  );
}
