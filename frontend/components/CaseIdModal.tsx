'use client';

import { useState, useEffect } from 'react';

interface CaseIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (caseIds: string[], userId?: string) => void;
  existingCaseIds?: string[];
}

export default function CaseIdModal({ isOpen, onClose, onSave, existingCaseIds = [] }: CaseIdModalProps) {
  const [caseIds, setCaseIds] = useState<string[]>(existingCaseIds);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountInfo, setAccountInfo] = useState({ email: '', name: '' });

  useEffect(() => {
    if (isOpen && existingCaseIds.length > 0) {
      setCaseIds(existingCaseIds);
    }
  }, [isOpen, existingCaseIds]);

  const validateCaseId = (caseId: string): boolean => {
    // Case IDs typically follow pattern like WRIC/11985/2025
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

    if (caseIds.includes(trimmed.toUpperCase())) {
      setError('This case ID is already added');
      return;
    }

    setCaseIds([...caseIds, trimmed.toUpperCase()]);
    setInputValue('');
    setError('');
  };

  const handleRemoveCaseId = (index: number) => {
    setCaseIds(caseIds.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (isCreatingAccount) {
      if (!accountInfo.email || !accountInfo.name) {
        setError('Please fill in all account details');
        return;
      }
      // Create account and save case IDs
      try {
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: accountInfo.email,
            name: accountInfo.name,
            caseIds,
          }),
        });
        const data = await response.json();
        if (data.success) {
          // Save user ID to localStorage
          localStorage.setItem('userId', data.userId);
          localStorage.setItem('userEmail', accountInfo.email);
          onSave(caseIds, data.userId);
          onClose();
        } else {
          setError(data.error || 'Failed to create account');
        }
      } catch {
        setError('Failed to create account. Please try again.');
      }
    } else {
      // Save case IDs to session/localStorage
      localStorage.setItem('trackedCaseIds', JSON.stringify(caseIds));
      onSave(caseIds);
      onClose();
    }
  };

  const handleSkip = () => {
    // Mark that user has skipped
    localStorage.setItem('hasSkippedCaseIdEntry', 'true');
    onSave([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={handleSkip}></div>
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Track Your Cases
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter case IDs to track specific cases. You can add multiple case IDs (e.g., WRIC/11985/2025).
        </p>

        {/* Account creation option */}
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

        {/* Case ID input */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError('');
              }}
              onKeyPress={(e) => {
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
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Case IDs list */}
        {caseIds.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tracking {caseIds.length} case{caseIds.length !== 1 ? 's' : ''}:
            </h3>
            <div className="space-y-2">
              {caseIds.map((caseId, index) => (
                <div
                  key={index}
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
          </div>
        )}

        {/* Action buttons */}
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

