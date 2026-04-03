'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cinzel, Manrope } from 'next/font/google';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

function downloadBlob(filename: string, blobUrl: string) {
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function JudgmentViewerPage(props: {
  viewUrl: string;
  date?: string | null;
  page?: number | null;
  title?: string | null;
}) {
  const [blobUrl, setBlobUrl] = useState('');
  const [filename, setFilename] = useState('latest-order.pdf');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let currentBlobUrl = '';

    const loadPdf = async () => {
      if (!props.viewUrl) {
        setError('Missing judgment view URL.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/orders/judgment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            viewUrl: props.viewUrl,
            date: props.date || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success || !data.result?.base64) {
          throw new Error(data.error || 'Failed to load latest order PDF');
        }

        const bytes = Uint8Array.from(atob(String(data.result.base64)), (char) => char.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: data.result.mimeType || 'application/pdf',
        });
        currentBlobUrl = URL.createObjectURL(blob);

        if (!active) return;

        setFilename(String(data.result.filename || 'latest-order.pdf'));
        setBlobUrl(currentBlobUrl);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load latest order PDF');
      } finally {
        if (active) {
          setLoading(false);
        } else if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
        }
      }
    };

    void loadPdf();

    return () => {
      active = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [props.date, props.viewUrl]);

  const iframeSrc = useMemo(() => {
    if (!blobUrl) return '';
    const page = props.page && props.page > 0 ? props.page : 1;
    return `${blobUrl}#page=${page}&view=FitH`;
  }, [blobUrl, props.page]);

  return (
    <div className={`min-h-screen bg-[#081127] ${manrope.className}`}>
      <header className="border-b border-slate-800/80 bg-[#081127]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/70">Latest Order</p>
            <h1 className={`mt-2 text-2xl font-semibold text-slate-100 sm:text-3xl ${cinzel.className}`}>
              {props.title || 'Judgment Viewer'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ai-chat"
              className="inline-flex items-center rounded-full border border-slate-700/50 bg-slate-950/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-slate-900/70"
            >
              Back to AI Chat
            </Link>
            {blobUrl && (
              <button
                onClick={() => downloadBlob(filename, blobUrl)}
                className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:bg-cyan-500/18"
              >
                Download PDF
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
        <div className="mb-5 rounded-[1.8rem] border border-slate-800/80 bg-[#0a132b]/92 px-5 py-4">
          <p className="text-sm text-slate-300">
            {props.date ? `Order date: ${props.date}` : 'Order date not available'}
            {props.page && props.page > 0 ? ` | Opens at page ${props.page}` : ''}
          </p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#0a132b]/92 shadow-[0_30px_80px_rgba(2,6,23,0.35)]">
          {loading ? (
            <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-400">
              Loading latest order PDF...
            </div>
          ) : error ? (
            <div className="flex min-h-[70vh] items-center justify-center px-6 text-sm text-red-300">
              {error}
            </div>
          ) : (
            <iframe
              title={props.title || 'Latest order PDF'}
              src={iframeSrc}
              className="h-[78vh] w-full bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
