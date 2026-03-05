'use client';

import { useState } from 'react';
import { CourtCase } from '@/types/court';
import CourtHistoryModal from '@/components/CourtHistoryModal';

interface CourtTableProps {
  courts: CourtCase[];
  lastUpdated?: Date;
  historyDate?: string;
}

export default function CourtTable({ courts, lastUpdated, historyDate }: CourtTableProps) {
  const [historyCourtNo, setHistoryCourtNo] = useState<string | null>(null);

  const openHistory = (courtNo: string) => {
    setHistoryCourtNo(courtNo);
  };

  const closeHistory = () => {
    setHistoryCourtNo(null);
  };

  return (
    <div className="w-full">
      {lastUpdated && (
        <div className="mb-3 sm:mb-4 text-xs sm:text-sm text-slate-400 px-1 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-pulse-dot"></span>
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}

      {/* Mobile Card View */}
      <div className="block sm:hidden space-y-3">
        {courts.map((court, index) => (
          <div
            key={`${court.courtNo}-${index}`}
            className={`glass-card p-4 ${
              !court.isInSession ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                  court.isInSession
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/20'
                    : 'bg-slate-700/40 text-slate-500 border border-slate-600/20'
                }`}>
                  {court.courtNo}
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-200">
                    Court {court.courtNo}
                  </span>
                  {!court.isInSession && (
                    <p className="text-[11px] text-slate-500 italic">Not in session</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openHistory(court.courtNo)}
                  className="inline-flex items-center rounded-lg bg-slate-700/40 border border-slate-600/20 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700/60 hover:border-slate-500/30"
                >
                  History
                </button>
                {court.progress && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-400/20">
                    {court.progress}
                  </span>
                )}
              </div>
            </div>

            {court.isInSession && (
              <div className="space-y-2 text-xs sm:text-sm">
                {(court.serialNo || court.list) && (
                  <div className="flex gap-4 text-xs">
                    {court.serialNo && (
                      <div>
                        <span className="font-medium text-slate-400">Serial:</span>{' '}
                        <span className="text-slate-300">{court.serialNo}</span>
                      </div>
                    )}
                    {court.list && (
                      <div>
                        <span className="font-medium text-slate-400">List:</span>{' '}
                        <span className="text-slate-300">{court.list}</span>
                      </div>
                    )}
                  </div>
                )}
                {court.caseDetails && (
                  <div className="pt-2.5 border-t border-slate-700/50">
                    <div className="font-semibold text-slate-100 mb-1 text-sm">
                      {court.caseDetails.caseNumber}
                    </div>
                    <div className="text-slate-400 mb-2 line-clamp-2 text-xs leading-relaxed">
                      {court.caseDetails.title}
                    </div>
                    {court.caseDetails.petitionerCounsels.length > 0 && (
                      <div className="mb-1 text-xs">
                        <span className="font-medium text-slate-400">Petitioner:</span>{' '}
                        <span className="text-slate-300">
                          {court.caseDetails.petitionerCounsels.join(', ')}
                        </span>
                      </div>
                    )}
                    {court.caseDetails.respondentCounsels.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-slate-400">Respondent:</span>{' '}
                        <span className="text-slate-300">
                          {court.caseDetails.respondentCounsels.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <div className="glass-card overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Court No.
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Serial No.
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  List
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Case Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {courts.map((court, index) => (
                <tr
                  key={`${court.courtNo}-${index}`}
                  className={`${
                    court.isInSession
                      ? 'hover:bg-slate-800/30'
                      : 'opacity-50'
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                      court.isInSession
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/20'
                        : 'bg-slate-700/30 text-slate-500 border border-slate-600/15'
                    }`}>
                      {court.courtNo}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                    {court.isInSession ? (court.serialNo || '-') : (
                      <span className="italic text-slate-500 text-xs">Not in session</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {court.isInSession ? (court.list || '-') : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {court.isInSession ? (
                      court.progress ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-400/20">
                          {court.progress}
                        </span>
                      ) : <span className="text-sm text-slate-500">-</span>
                    ) : <span className="text-sm text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="space-y-2">
                      <button
                        onClick={() => openHistory(court.courtNo)}
                        className="inline-flex items-center rounded-lg bg-slate-700/40 border border-slate-600/20 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/60 hover:border-slate-500/30"
                      >
                        History
                      </button>
                      {court.isInSession && court.caseDetails ? (
                        <div className="space-y-1">
                          <div className="font-medium text-slate-100">
                            {court.caseDetails.caseNumber}
                          </div>
                          <div className="text-xs text-slate-400 leading-relaxed">
                            {court.caseDetails.title}
                          </div>
                          {court.caseDetails.petitionerCounsels.length > 0 && (
                            <div className="text-xs mt-1">
                              <span className="font-medium text-slate-400">Petitioner:</span>{' '}
                              <span className="text-slate-300">{court.caseDetails.petitionerCounsels.join(', ')}</span>
                            </div>
                          )}
                          {court.caseDetails.respondentCounsels.length > 0 && (
                            <div className="text-xs">
                              <span className="font-medium text-slate-400">Respondent:</span>{' '}
                              <span className="text-slate-300">{court.caseDetails.respondentCounsels.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ) : <span className="text-slate-500">-</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CourtHistoryModal
        isOpen={Boolean(historyCourtNo)}
        courtNo={historyCourtNo}
        date={historyDate || ''}
        onClose={closeHistory}
      />
    </div>
  );
}
