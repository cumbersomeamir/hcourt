export function saveWebAccount(user: { id: string; email: string }, account: { id: string; caseIds: string[]; trackedOrderCases: unknown[] }) {
  if (!localStorage.getItem('userId')) {
    localStorage.setItem('courtlensGuestCases', JSON.stringify({ caseIds: localStorage.getItem('trackedCaseIds'), orders: localStorage.getItem('trackedOrderCases') }));
  }
  localStorage.setItem('courtlensWebAccount', user.id);
  localStorage.setItem('userId', account.id);
  localStorage.setItem('userEmail', user.email);
  localStorage.setItem('trackedCaseIds', JSON.stringify(account.caseIds || []));
  localStorage.setItem('trackedOrderCases', JSON.stringify(account.trackedOrderCases || []));
}

export function clearWebAccount() {
  for (const key of ['userId', 'userEmail', 'courtlensWebAccount', 'trackedCaseIds', 'trackedOrderCases']) localStorage.removeItem(key);
  try {
    const guest = JSON.parse(localStorage.getItem('courtlensGuestCases') || 'null');
    if (guest?.caseIds) localStorage.setItem('trackedCaseIds', guest.caseIds);
    if (guest?.orders) localStorage.setItem('trackedOrderCases', guest.orders);
  } catch {}
  localStorage.removeItem('courtlensGuestCases');
}
