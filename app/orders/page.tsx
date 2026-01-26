'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CaseTypeOption = { value: string; label: string };

type OrdersStored = {
  _id: string;
  caseId: string;
  caseTypeValue: string;
  caseTypeLabel: string;
  caseNo: string;
  caseYear: string;
  orderJudgements?: Array<{ index: number; date: string; url: string }>;
  caseInfo: {
    caseType: string;
    caseNo: string;
    caseYear: string;
    status?: string;
    petitionerVsRespondent?: string;
  };
  details: {
    header?: string;
    keyValues: Array<{ key: string; value: string }>;
    listingHistory: Array<Record<string, string>>;
    iaDetails: Array<Record<string, string>>;
  };
  fetchedAt: string | Date;
};

type OrdersResult = {
  caseInfo: {
    caseType: string;
    caseNo: string;
    caseYear: string;
    status?: string;
    petitionerVsRespondent?: string;
  };
  details: {
    header?: string;
    keyValues: Array<{ key: string; value: string }>;
    listingHistory: Array<Record<string, string>>;
    iaDetails: Array<Record<string, string>>;
  };
  pdf: { filename: string; base64: string };
  excel: { filename: string; base64: string };
};

function downloadBase64(filename: string, base64: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function OrdersPage() {
  const [types, setTypes] = useState<CaseTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);

  const [caseType, setCaseType] = useState('');
  const [caseNo, setCaseNo] = useState('');
  const [caseYear, setCaseYear] = useState(new Date().getFullYear().toString());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrdersResult | null>(null);

  const [myOrders, setMyOrders] = useState<OrdersStored[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(true);
  const [showTrackForm, setShowTrackForm] = useState(false);
  const [showSearchForm, setShowSearchForm] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [trackedCaseIds, setTrackedCaseIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Auth state
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Check auth on load
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          setUserId(data.user.id);
        }
      } catch {
        // Not authenticated
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setTypesLoading(true);
        setTypesError(null);
        const res = await fetch('/api/orders/case-types');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load case types');
        setTypes(data.types || []);
      } catch (e) {
        setTypesError(e instanceof Error ? e.message : 'Failed to load case types');
      } finally {
        setTypesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const storedCaseIds = localStorage.getItem('trackedCaseIds');
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) setUserId(storedUserId);
    if (storedCaseIds) {
      try {
        const ids = JSON.parse(storedCaseIds) as string[];
        if (Array.isArray(ids)) setTrackedCaseIds(ids.map((x) => String(x).toUpperCase()));
      } catch {
        // ignore
      }
    }
  }, []);

  const loadMyOrders = async () => {
    if (!user) {
      setMyOrders([]);
      setMyOrdersLoading(false);
      return;
    }
    try {
      setMyOrdersLoading(true);
      const params = new URLSearchParams();
      if (trackedCaseIds.length > 0) params.set('caseIds', trackedCaseIds.join(','));
      const res = await fetch(`/api/orders?${params.toString()}`, {
        credentials: 'include', // Include cookies
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'Authentication required') {
          setUser(null);
          setUserId(null);
        }
        throw new Error(data.error || 'Failed to load orders');
      }
      setMyOrders((data.orders || []) as OrdersStored[]);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Authentication')) {
        setUser(null);
        setUserId(null);
      }
    } finally {
      setMyOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadMyOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedCaseIds.join(','), user?.id]);

  const handleLogin = async () => {
    try {
      setAuthError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Login failed');
      setUser(data.user);
      setUserId(data.user.id);
      setShowLogin(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  const handleSignup = async () => {
    try {
      setAuthError(null);
      if (signupPassword.length < 6) {
        setAuthError('Password must be at least 6 characters');
        return;
      }
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, password: signupPassword, name: signupName }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Signup failed');
      setUser(data.user);
      setUserId(data.user.id);
      setShowSignup(false);
      setSignupEmail('');
      setSignupPassword('');
      setSignupName('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Signup failed');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
      setUserId(null);
      setMyOrders([]);
    } catch {}
  };

  const typeLabel = useMemo(
    () => types.find((t) => t.value === caseType)?.label || caseType,
    [types, caseType]
  );

  const runFetch = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const res = await fetch('/api/orders/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseType, caseNo, caseYear }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch orders');
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const trackNewOrder = async () => {
    if (!user) {
      setError('Please login to track orders');
      setShowLogin(true);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseType, caseNo, caseYear }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'Authentication required') {
          setUser(null);
          setUserId(null);
          setShowLogin(true);
        }
        throw new Error(data.error || 'Failed to track order');
      }

      const newOrder = data.order as OrdersStored;
      // Update local trackedCaseIds
      const nextIds = Array.from(new Set([...(trackedCaseIds || []), newOrder.caseId.toUpperCase()]));
      setTrackedCaseIds(nextIds);

      setShowTrackForm(false);
      await loadMyOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to track order');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center justify-between gap-4 mb-3 sm:mb-4">
            <Link
              href="/"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Court View
            </Link>
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">{user.name || user.email}</span>
                <button
                  onClick={handleLogout}
                  className="rounded-md bg-gray-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-gray-700"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowLogin(true); setShowSignup(false); }}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-blue-700"
                >
                  Login
                </button>
                <button
                  onClick={() => { setShowSignup(true); setShowLogin(false); }}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-green-700"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
                Orders
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Track and download case orders/details as PDF + Excel.
              </p>
            </div>
            <button
              onClick={() => setShowSearchForm((v) => !v)}
              className="self-start inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 sm:px-5 py-2 sm:py-2.5 text-sm sm:text-base font-semibold text-white shadow-md hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              <span className="hidden sm:inline">Quick Search</span>
              <span className="sm:hidden">Search</span>
              <svg
                className="h-4 w-4 sm:h-5 sm:w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Login Modal */}
        {showLogin && !user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Login</h2>
                <button
                  onClick={() => { setShowLogin(false); setAuthError(null); }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
              {authError && <div className="mb-4 text-sm text-red-600 dark:text-red-400">{authError}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                    placeholder="••••••"
                  />
                </div>
                <button
                  onClick={handleLogin}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Login
                </button>
                <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Don't have an account?{' '}
                  <button onClick={() => { setShowSignup(true); setShowLogin(false); }} className="text-blue-600 dark:text-blue-400 hover:underline">
                    Sign up
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Signup Modal */}
        {showSignup && !user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sign Up</h2>
                <button
                  onClick={() => { setShowSignup(false); setAuthError(null); }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
              {authError && <div className="mb-4 text-sm text-red-600 dark:text-red-400">{authError}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                    placeholder="Your Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                    placeholder="your@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm"
                    placeholder="•••••• (min 6 characters)"
                  />
                </div>
                <button
                  onClick={handleSignup}
                  className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Sign Up
                </button>
                <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{' '}
                  <button onClick={() => { setShowLogin(true); setShowSignup(false); }} className="text-blue-600 dark:text-blue-400 hover:underline">
                    Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* My Orders - Only show if authenticated */}
        {user && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">My Orders</h2>
                <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Showing orders for your tracked cases.
                </p>
              </div>
              <button
                onClick={() => setShowTrackForm((v) => !v)}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Track New Order
              </button>
            </div>

          <div className="mt-4">
            {myOrdersLoading ? (
              <div className="text-sm text-gray-600 dark:text-gray-400">Loading your orders…</div>
            ) : myOrders.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                No tracked orders yet. Click <span className="font-medium">Track New Order</span> to add one.
              </div>
            ) : (
              <div className="space-y-3">
                {myOrders.map((o) => (
                  <div
                    key={o._id}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 sm:p-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">
                          {o.details?.header || o.caseId}
                        </div>
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Status:</span> {o.caseInfo?.status || '—'} •{' '}
                          <span className="font-medium">Case:</span> {o.caseId}
                        </div>
                        {o.caseInfo?.petitionerVsRespondent && (
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 break-words">
                            {o.caseInfo.petitionerVsRespondent}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <a
                          href={`/api/orders/file?orderId=${encodeURIComponent(o._id)}&kind=pdf`}
                          className="rounded-md bg-blue-600 px-3 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700"
                        >
                          PDF
                        </a>
                        <a
                          href={`/api/orders/file?orderId=${encodeURIComponent(o._id)}&kind=excel`}
                          className="rounded-md bg-green-600 px-3 py-2 text-xs sm:text-sm font-medium text-white hover:bg-green-700"
                        >
                          Excel
                        </a>
                        <button
                          onClick={() => setExpanded((m) => ({ ...m, [o._id]: !m[o._id] }))}
                          className="rounded-md bg-gray-200 dark:bg-gray-700 px-3 py-2 text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          {expanded[o._id] ? 'Hide' : 'View'}
                        </button>
                      </div>
                    </div>

                    {expanded[o._id] && (
                      <div className="mt-3 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {(o.details?.keyValues || []).slice(0, 24).map((kv, idx) => (
                            <div
                              key={`${kv.key}-${idx}`}
                              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                            >
                              <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{kv.key}</div>
                              <div className="text-sm text-gray-900 dark:text-gray-100 break-words">{kv.value}</div>
                            </div>
                          ))}
                          {(o.details?.keyValues || []).length > 24 && (
                            <div className="md:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                              Showing first 24 fields. Download Excel for full structured output.
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Order/Judgement</div>
                          {o.orderJudgements && o.orderJudgements.length > 0 ? (
                            <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                              <table className="min-w-full text-sm">
                                <thead className="bg-gray-100 dark:bg-gray-900">
                                  <tr>
                                    <th className="text-left px-3 py-2">#</th>
                                    <th className="text-left px-3 py-2">Date</th>
                                    <th className="text-left px-3 py-2">Links</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {o.orderJudgements.map((j) => (
                                    <tr key={`${o._id}-${j.index}`} className="border-t border-gray-200 dark:border-gray-700">
                                      <td className="px-3 py-2">{j.index}</td>
                                      <td className="px-3 py-2">{j.date}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-3">
                                          <a
                                            href={`/api/orders/judgement?orderId=${encodeURIComponent(o._id)}&index=${j.index}&view=true`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 dark:text-blue-400 hover:underline"
                                            title="View (captcha solved automatically)"
                                          >
                                            Open
                                          </a>
                                          <a
                                            href={`/api/orders/judgement?orderId=${encodeURIComponent(o._id)}&index=${j.index}`}
                                            className="text-green-700 dark:text-green-400 hover:underline"
                                            title="Download (captcha solved automatically)"
                                          >
                                            Download
                                          </a>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-600 dark:text-gray-400">No order/judgement entries found.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {!user && !authLoading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">Please login to view and track your orders.</p>
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Login
            </button>
          </div>
        )}

        {/* Quick Search (does not track/save) */}
        {showSearchForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Search Orders</h2>
              <button
                onClick={() => setShowSearchForm(false)}
                className="rounded-md bg-gray-200 dark:bg-gray-700 px-3 py-2 text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Case Type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  disabled={typesLoading}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                >
                  <option value="">{typesLoading ? 'Loading…' : 'Select case type'}</option>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {typesError && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{typesError}</div>}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Case No.
                </label>
                <input
                  value={caseNo}
                  onChange={(e) => setCaseNo(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 10721"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Case Year
                </label>
                <input
                  value={caseYear}
                  onChange={(e) => setCaseYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="e.g. 2025"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Quickly search case details. Captcha is handled automatically. Results are not saved.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={runFetch}
                  disabled={loading || !caseType || !caseNo || caseYear.length !== 4}
                  className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {loading ? 'Searching…' : 'Search'}
                </button>
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
          </div>
        )}

        {/* Track New Order (existing form flow, now optional) */}
        {showTrackForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Track New Order</h2>
              <button
                onClick={() => setShowTrackForm(false)}
                className="rounded-md bg-gray-200 dark:bg-gray-700 px-3 py-2 text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Case Type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  disabled={typesLoading}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                >
                  <option value="">{typesLoading ? 'Loading…' : 'Select case type'}</option>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {typesError && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{typesError}</div>}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Case No.
                </label>
                <input
                  value={caseNo}
                  onChange={(e) => setCaseNo(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 10721"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                  Case Year
                </label>
                <input
                  value={caseYear}
                  onChange={(e) => setCaseYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="e.g. 2025"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 sm:px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
              <div className="text-xs text-gray-600 dark:text-gray-400">Captcha is handled automatically.</div>
              <div className="flex gap-2">
                <button
                  onClick={runFetch}
                  disabled={loading || !caseType || !caseNo || caseYear.length !== 4}
                  className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {loading ? 'Fetching…' : 'Preview'}
                </button>
                <button
                  onClick={trackNewOrder}
                  disabled={loading || !caseType || !caseNo || caseYear.length !== 4}
                  className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Track & Save'}
                </button>
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
          </div>
        )}

        {result && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                  {result.details.header || `${typeLabel} / ${result.caseInfo.caseNo}/${result.caseInfo.caseYear}`}
                </h2>
                <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Status:</span> {result.caseInfo.status || '—'}
                </div>
                {result.caseInfo.petitionerVsRespondent && (
                  <div className="mt-1 text-sm text-gray-700 dark:text-gray-300 break-words">
                    {result.caseInfo.petitionerVsRespondent}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => downloadBase64(result.pdf.filename, result.pdf.base64, 'application/pdf')}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700"
                >
                  Download PDF
                </button>
                <button
                  onClick={() =>
                    downloadBase64(
                      result.excel.filename,
                      result.excel.base64,
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    )
                  }
                  className="rounded-md bg-green-600 px-3 py-2 text-xs sm:text-sm font-medium text-white hover:bg-green-700"
                >
                  Download Excel
                </button>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.details.keyValues.slice(0, 40).map((kv, idx) => (
                  <div
                    key={`${kv.key}-${idx}`}
                    className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2"
                  >
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{kv.key}</div>
                    <div className="text-sm text-gray-900 dark:text-gray-100 break-words">{kv.value}</div>
                  </div>
                ))}
              </div>
              {result.details.keyValues.length > 40 && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Showing first 40 fields. Download Excel for the full structured output.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

