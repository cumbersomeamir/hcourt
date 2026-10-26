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
  void error;
  void fallback;
  return "Can't fetch data from the court. Please try again later.";
}

export function CourtSourceError({ message }: { message?: string }) {
  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-4 text-left shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-100">Court server is temporarily unavailable</p>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {message || "Can't fetch data from the court. Please try again later."}
          </p>
        </div>
      </div>
    </div>
  );
}
