export function downloadBase64File(filename: string, mimeType: string, base64: string) {
  const nativeBridge = (
    window as typeof window & { ReactNativeWebView?: { postMessage(message: string): void } }
  ).ReactNativeWebView;

  if (nativeBridge) {
    nativeBridge.postMessage(
      JSON.stringify({ type: 'download-base64', filename, mimeType, base64 })
    );
    return;
  }

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
