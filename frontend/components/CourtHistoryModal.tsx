'use client';

import { useEffect, useState } from 'react';
import { CourtHistoryRecord } from '@/types/court';

interface CourtHistoryModalProps {
  isOpen: boolean;
  courtNo: string | null;
  date: string;
  onClose: () => void;
}

export default function CourtHistoryModal({ isOpen, courtNo, date, onClose }: CourtHistoryModalProps) {
  const [history, setHistory] = useState<CourtHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !courtNo || !date) return;

    let active = true;

    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          courtNo,
          date,
          limit: '200',
        });

        const response = await fetch(`/api/court-history?${params.toString()}`);
        const data = await response.json();

        if (!active) return;

        if (data.success) {
          setHistory((data.history || []) as CourtHistoryRecord[]);
        } else {
          setError(data.error || 'Failed to load court history');
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load court history');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchHistory();
    return () => {
      active = false;
    };
  }, [isOpen, courtNo, date]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !courtNo) return null;

  return (
    <div className="modal-overlay">
      <div className="w-full max-w-3xl glass-card-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-700/40 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-400/20 flex items-center justify-center text-sm font-bold text-cyan-300">
              {courtNo}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                Court {courtNo} History
              </h2>
              <p className="text-xs text-slate-400">Date: {date}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center rounded-lg bg-slate-700/40 border border-slate-600/20 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-700/60"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <div className="py-10 flex flex-col items-center">
              <div className="w-7 h-7 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-3"></div>
              <div className="text-sm text-slate-400">Loading history...</div>
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                </svg>
              </div>
              <div className="text-sm text-red-400">{error}</div>
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No history available for this court on selected date.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry._id || `${entry.courtNo}-${entry.timestamp}`}
                  className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs sm:text-sm font-semibold text-cyan-300">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700/40 text-slate-400 border border-slate-600/20">
                      {entry.source}
                    </span>
                  </div>

                  <div className="mt-2 text-sm">
                    {entry.isInSession ? (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-slate-100">
                          {entry.caseDetails?.caseNumber || 'Case in session'}
                        </div>
                        {entry.caseDetails?.title && (
                          <div className="text-slate-400 text-xs leading-relaxed">{entry.caseDetails.title}</div>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                          <span>Serial: {entry.serialNo || '-'}</span>
                          <span>List: {entry.list || '-'}</span>
                          <span>Progress: {entry.progress || '-'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="italic text-slate-500 text-xs">Court NOT in session</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
