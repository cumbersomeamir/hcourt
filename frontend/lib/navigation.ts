let firstEntryIndex: number | null = null;

function currentEntryIndex() {
  const navigation = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
  return navigation?.currentEntry?.index ?? null;
}

export function navigationStartIndex() {
  const current = currentEntryIndex();
  if (firstEntryIndex === null && current !== null) {
    const saved = window.history.state?.courtlensFirstIndex;
    firstEntryIndex = typeof saved === 'number' && saved >= 0 && saved <= current ? saved : current;
  }
  return firstEntryIndex;
}

export function navigateBack(router: { back: () => void; replace: (href: string) => void }, fallbackHref = '/') {
  const current = currentEntryIndex();
  const first = navigationStartIndex();
  const canGoBack = current !== null && first !== null ? current > first : window.history.state?.courtlensCanGoBack && window.history.length > 1;
  if (canGoBack) router.back();
  else router.replace(fallbackHref);
}
