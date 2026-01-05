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
        <div className="mb-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}
      
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Court No.
                </th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Serial No.
                </th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  List
                </th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
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
                  <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {court.courtNo}
                  </td>
                  <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession ? (court.serialNo || '-') : (
                      <span className="italic text-gray-400">Court NOT in session!</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession ? (court.list || '-') : '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {court.isInSession ? (
                      court.progress ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {court.progress}
                        </span>
                      ) : '-'
                    ) : '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
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

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {courts.map((court, index) => (
          <div
            key={`${court.courtNo}-${index}`}
            className={`rounded-lg border p-4 ${
              court.isInSession
                ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 opacity-75'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Court {court.courtNo}
                </h3>
                {!court.isInSession && (
                  <p className="text-sm italic text-gray-500 dark:text-gray-400 mt-1">
                    Court NOT in session!
                  </p>
                )}
              </div>
              {court.isInSession && court.progress && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 ml-2">
                  {court.progress}
                </span>
              )}
            </div>

            {court.isInSession && (
              <div className="space-y-2 mt-3">
                {court.serialNo && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Serial No:</span>
                    <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">{court.serialNo}</span>
                  </div>
                )}
                {court.list && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">List:</span>
                    <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">{court.list}</span>
                  </div>
                )}
                {court.caseDetails && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                      {court.caseDetails.caseNumber}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {court.caseDetails.title}
                    </div>
                    {court.caseDetails.petitionerCounsels.length > 0 && (
                      <div className="text-xs mb-1">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Petitioner:</span>
                        <span className="ml-1 text-gray-600 dark:text-gray-400">
                          {court.caseDetails.petitionerCounsels.join(', ')}
                        </span>
                      </div>
                    )}
                    {court.caseDetails.respondentCounsels.length > 0 && (
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Respondent:</span>
                        <span className="ml-1 text-gray-600 dark:text-gray-400">
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
    </div>
  );
}
