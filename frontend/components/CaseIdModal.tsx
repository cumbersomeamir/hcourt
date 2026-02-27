'use client';

import { useEffect, useState } from 'react';
import { TrackedOrderCase } from '@/types/court';

type CaseTypeOption = { value: string; label: string };

interface CaseIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (caseIds: string[], trackedOrderCases: TrackedOrderCase[], userId?: string) => void;
  existingCaseIds?: string[];
  existingTrackedOrderCases?: TrackedOrderCase[];
}

type OrderCaseForm = {
  caseType: string;
  caseNo: string;
  caseYear: string;
};

function buildOrderTrackingKey(params: {
  city: string;
  caseType: string;
  caseNo: string;
  caseYear: string;
}) {
  return `${params.city}|${params.caseType}|${params.caseNo}|${params.caseYear}`;
}

export default function CaseIdModal({
  isOpen,
  onClose,
  onSave,
  existingCaseIds = [],
  existingTrackedOrderCases = [],
}: CaseIdModalProps) {
  const [caseIds, setCaseIds] = useState<string[]>(existingCaseIds);
  const [trackedOrderCases, setTrackedOrderCases] =
    useState<TrackedOrderCase[]>(existingTrackedOrderCases);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountInfo, setAccountInfo] = useState({ email: '', name: '' });
  const [caseTypeOptions, setCaseTypeOptions] = useState<CaseTypeOption[]>([]);
  const [caseTypeLoading, setCaseTypeLoading] = useState(false);
  const [orderCaseForm, setOrderCaseForm] = useState<OrderCaseForm>({
    caseType: '',
    caseNo: '',
    caseYear: new Date().getFullYear().toString(),
  });

  useEffect(() => {
    if (!isOpen) return;

    setCaseIds(existingCaseIds);
    setTrackedOrderCases(existingTrackedOrderCases);

    let mounted = true;
    (async () => {
      try {
        setCaseTypeLoading(true);
        const response = await fetch('/api/orders/case-types?city=lucknow');
        const data = await response.json();
        if (!mounted) return;
        if (data.success && Array.isArray(data.types)) {
          setCaseTypeOptions(data.types);
          setOrderCaseForm((prev) =>
            prev.caseType || data.types.length === 0
              ? prev
              : { ...prev, caseType: data.types[0].value }
          );
        }
      } catch {
        // Keep UI usable even if types fail to load.
      } finally {
        if (mounted) setCaseTypeLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen, existingCaseIds, existingTrackedOrderCases]);

  const validateCaseId = (caseId: string): boolean => {
    const pattern = /^[A-Z]+\/[0-9]+\/[0-9]+$/i;
    return pattern.test(caseId.trim());
  };

  const handleAddCaseId = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError('Please enter a case ID');
      return;
    }

    if (!validateCaseId(trimmed)) {
      setError('Invalid case ID format. Example: WRIC/11985/2025');
      return;
    }

    const normalized = trimmed.toUpperCase();
    if (caseIds.includes(normalized)) {
      setError('This case ID is already added');
      return;
    }

    setCaseIds([...caseIds, normalized]);
    setInputValue('');
    setError('');
  };

  const handleAddOrderCase = () => {
    const city = 'lucknow' as const;
    const caseType = orderCaseForm.caseType.trim();
    const caseNo = orderCaseForm.caseNo.trim();
    const caseYear = orderCaseForm.caseYear.trim();
    if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear)) {
      setError('Order tracking needs Case Type, numeric Case No, and 4-digit Case Year');
      return;
    }

    const caseTypeLabel =
      caseTypeOptions.find((option) => option.value === caseType)?.label || caseType;
    const trackingKey = buildOrderTrackingKey({ city, caseType, caseNo, caseYear });
    if (trackedOrderCases.some((trackedCase) => trackedCase.trackingKey === trackingKey)) {
      setError('This order-tracking case is already added');
      return;
    }

    setTrackedOrderCases((prev) => [
      ...prev,
      {
        city,
        caseType,
        caseTypeLabel,
        caseNo,
        caseYear,
        trackingKey,
      },
    ]);
    setOrderCaseForm((prev) => ({ ...prev, caseNo: '' }));
    setError('');
  };

  const handleRemoveCaseId = (index: number) => {
    setCaseIds(caseIds.filter((_, i) => i !== index));
  };

  const handleRemoveOrderCase = (trackingKey: string) => {
    setTrackedOrderCases((prev) =>
      prev.filter((trackedCase) => trackedCase.trackingKey !== trackingKey)
    );
  };

  const handleSave = async () => {
    if (isCreatingAccount) {
      if (!accountInfo.email || !accountInfo.name) {
        setError('Please fill in all account details');
        return;
      }
      try {
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: accountInfo.email,
            name: accountInfo.name,
            caseIds,
            trackedOrderCases,
          }),
        });
        const data = await response.json();
        if (data.success) {
          localStorage.setItem('userId', data.userId);
          localStorage.setItem('userEmail', accountInfo.email);
          localStorage.setItem('trackedCaseIds', JSON.stringify(caseIds));
          localStorage.setItem('trackedOrderCases', JSON.stringify(trackedOrderCases));
          onSave(caseIds, trackedOrderCases, data.userId);
          onClose();
        } else {
          setError(data.error || 'Failed to create account');
        }
      } catch {
        setError('Failed to create account. Please try again.');
      }
    } else {
      localStorage.setItem('trackedCaseIds', JSON.stringify(caseIds));
      localStorage.setItem('trackedOrderCases', JSON.stringify(trackedOrderCases));
      const existingUserId = localStorage.getItem('userId');
      if (existingUserId) {
        try {
          await fetch('/api/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: existingUserId,
              caseIds,
              trackedOrderCases,
            }),
          });
        } catch {
          // Keep local settings even if account sync fails.
        }
      }
      onSave(caseIds, trackedOrderCases);
      onClose();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('hasSkippedCaseIdEntry', 'true');
    onSave([], []);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={handleSkip}></div>
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Track Your Cases
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Track by case ID for schedule filtering, and by case type/no/year for order/judgment update notifications.
        </p>

        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isCreatingAccount}
              onChange={(e) => setIsCreatingAccount(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Create an account to track cases across devices
            </span>
          </label>
        </div>

        {isCreatingAccount && (
          <div className="mb-4 space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={accountInfo.name}
                onChange={(e) => setAccountInfo({ ...accountInfo, name: e.target.value })}
                placeholder="Your name"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={accountInfo.email}
                onChange={(e) => setAccountInfo({ ...accountInfo, email: e.target.value })}
                placeholder="your.email@example.com"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        <div className="mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Schedule Tracking (Case ID)
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddCaseId();
                }
              }}
              placeholder="e.g., WRIC/11985/2025"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleAddCaseId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Add
            </button>
          </div>
          {caseIds.length > 0 && (
            <div className="mt-3 space-y-2">
              {caseIds.map((caseId, index) => (
                <div
                  key={`${caseId}-${index}`}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg"
                >
                  <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {caseId}
                  </span>
                  <button
                    onClick={() => handleRemoveCaseId(index)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Order/Judgment Tracking (Case Type / No / Year)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={orderCaseForm.caseType}
              onChange={(e) => setOrderCaseForm((prev) => ({ ...prev, caseType: e.target.value }))}
              disabled={caseTypeLoading}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="">
                {caseTypeLoading ? 'Loading case types...' : 'Select case type'}
              </option>
              {caseTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={orderCaseForm.caseNo}
              onChange={(e) =>
                setOrderCaseForm((prev) => ({
                  ...prev,
                  caseNo: e.target.value.replace(/[^0-9]/g, ''),
                }))
              }
              placeholder="Case no"
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              value={orderCaseForm.caseYear}
              onChange={(e) =>
                setOrderCaseForm((prev) => ({
                  ...prev,
                  caseYear: e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                }))
              }
              placeholder="Case year"
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="mt-2">
            <button
              onClick={handleAddOrderCase}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              Add Order Tracking
            </button>
          </div>
          {trackedOrderCases.length > 0 && (
            <div className="mt-3 space-y-2">
              {trackedOrderCases.map((trackedCase) => (
                <div
                  key={trackedCase.trackingKey}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg"
                >
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {(trackedCase.caseTypeLabel || trackedCase.caseType) +
                      ` / ${trackedCase.caseNo}/${trackedCase.caseYear}`}
                  </span>
                  <button
                    onClick={() => handleRemoveOrderCase(trackedCase.trackingKey)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-2 mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            {isCreatingAccount ? 'Create Account & Save' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
