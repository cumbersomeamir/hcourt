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

  const chunks: BlobPart[] = [];
  for (let offset = 0; offset < base64.length; offset += 32768) {
    const decoded = atob(base64.slice(offset, offset + 32768));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    chunks.push(bytes);
  }
  downloadBlobFile(filename, new Blob(chunks, { type: mimeType }));
}

export function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
