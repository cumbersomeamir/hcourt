const OCR_URL = String(
  process.env.IDEAVERSE_IMAGE_TO_TEXT_URL || 'https://52-188-195-116.sslip.io/api/pp-ocrv6/recognize'
).trim();

function collectText(value: unknown, output: string[]) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return;
    if ((text.startsWith('{') || text.startsWith('[')) && text.length > 1) {
      try {
        collectText(JSON.parse(text), output);
        return;
      } catch {
        // Use the original text when the service returns a non-JSON serialized value.
      }
    }
    output.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
    return;
  }

  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if ('results' in record) {
    collectText(record.results, output);
    return;
  }
  const textFields = ['rec_texts', 'texts', 'text', 'ocr_texts', 'ocr_text'];
  const fields = textFields.filter((field) => field in record);
  if (fields.length) {
    for (const field of fields) collectText(record[field], output);
    return;
  }

  for (const item of Object.values(record)) collectText(item, output);
}

export async function recognizeImageText(image: Buffer, mimeType = 'image/png'): Promise<string[]> {
  if (!OCR_URL) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const form = new FormData();
    const bytes = new Uint8Array(image.byteLength);
    bytes.set(image);
    form.append('image', new Blob([bytes], { type: mimeType }), 'captcha.png');

    const response = await fetch(OCR_URL, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    const output: string[] = [];
    collectText(payload, output);
    return [...new Set(output)];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
