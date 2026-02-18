'use client';

import { CourtCase } from '@/types/court';

interface CourtTableProps {
  courts: CourtCase[];
  lastUpdated?: Date;
}

export default function CourtTable({ courts, lastUpdated }: CourtTableProps) {
  return (
    <div className="w-full">
      {lastUpdated && (
        <div className="mb-3 sm:mb-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400 px-1">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}
      
      {/* Mobile Card View */}
      <div className="block sm:hidden space-y-3">
        {courts.map((court, index) => (
          <div
            key={`${court.courtNo}-${index}`}
            className={`rounded-lg border p-3 ${
              court.isInSession
                ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                : 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Court {court.courtNo}
                </span>
                {!court.isInSession && (
                  <span className="text-xs italic text-gray-400">Not in session</span>
                )}
              </div>
              {court.progress && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {court.progress}
                </span>
              )}
            </div>
            
            {court.isInSession && (
              <div className="space-y-2 text-xs sm:text-sm">
                {court.serialNo && (
                  <div>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Serial No:</span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">{court.serialNo}</span>
                  </div>
                )}
                {court.list && (
                  <div>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">List:</span>{' '}
                    <span className="text-gray-600 dark:text-gray-400">{court.list}</span>
                  </div>
                )}
                {court.caseDetails && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {court.caseDetails.caseNumber}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {court.caseDetails.title}
                    </div>
                    {court.caseDetails.petitionerCounsels.length > 0 && (
                      <div className="mb-1">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Petitioner:</span>{' '}
                        <span className="text-gray-600 dark:text-gray-400">
                          {court.caseDetails.petitionerCounsels.join(', ')}
                        </span>
                      </div>
                    )}
                    {court.caseDetails.respondentCounsels.length > 0 && (
                      <div>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Respondent:</span>{' '}
                        <span className="text-gray-600 dark:text-gray-400">
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
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Court No.
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Serial No.
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  List
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Case Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {courts.map((court, index) => (
                <tr
                  key={`${court.courtNo}-${index}`}
                  className={court.isInSession ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-gray-100 dark:bg-gray-800 opacity-75'}
                >
                  <td className="px-3 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {court.courtNo}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession ? (court.serialNo || '-') : (
                      <span className="italic text-gray-400">Court NOT in session!</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession ? (court.list || '-') : '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession ? (
                      court.progress ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {court.progress}
                        </span>
                      ) : '-'
                    ) : '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession && court.caseDetails ? (
                      <div className="space-y-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {court.caseDetails.caseNumber}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {court.caseDetails.title}
                        </div>
                        {court.caseDetails.petitionerCounsels.length > 0 && (
                          <div className="text-xs mt-1">
                            <span className="font-semibold">Petitioner:</span>{' '}
                            {court.caseDetails.petitionerCounsels.join(', ')}
                          </div>
                        )}
                        {court.caseDetails.respondentCounsels.length > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold">Respondent:</span>{' '}
                            {court.caseDetails.respondentCounsels.join(', ')}
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
