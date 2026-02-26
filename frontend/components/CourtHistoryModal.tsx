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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-100">
              Court {courtNo} History
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">Date: {date}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-gray-700 px-3 py-1.5 text-xs sm:text-sm text-gray-200 hover:bg-gray-600"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading history...</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-400">{error}</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              No history available for this court on selected date.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry._id || `${entry.courtNo}-${entry.timestamp}`}
                  className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs sm:text-sm font-medium text-blue-300">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="text-[11px] sm:text-xs text-gray-400">{entry.source}</div>
                  </div>

                  <div className="mt-2 text-sm text-gray-100">
                    {entry.isInSession ? (
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {entry.caseDetails?.caseNumber || 'Case in session'}
                        </div>
                        {entry.caseDetails?.title && (
                          <div className="text-gray-300">{entry.caseDetails.title}</div>
                        )}
                        <div className="text-xs text-gray-400">
                          Serial: {entry.serialNo || '-'} | List: {entry.list || '-'} | Progress:{' '}
                          {entry.progress || '-'}
                        </div>
                      </div>
                    ) : (
                      <div className="italic text-gray-400">Court NOT in session</div>
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
