type CourtSourceLoaderProps = {
  label?: string;
  className?: string;
};

export function CourtSourceLoader({
  label = 'court records',
  className = '',
}: CourtSourceLoaderProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="mb-4 h-8 w-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
      <div className="text-sm font-medium text-slate-300">Connecting to the official court website for {label}...</div>
      <div className="mt-1 text-xs text-slate-500">This data is fetched from the court server, not stored on this website.</div>
    </div>
  );
}

export function courtSourceError(error: unknown, fallback: string) {
  const detail = error instanceof Error ? error.message : fallback;
  return `Connection issue from the official court website. The court server may be unavailable. ${detail}`;
}
