import { Buffer } from 'node:buffer';
import { downloadOrderJudgment, OrderJudgmentDownload, OrderJudgmentEntry } from '@/models/ordersModel';
import { runGpt5Nano } from '@/lib/gpt5Nano';

export type JudgmentLine = {
  page: number;
  line: number;
  text: string;
};

export type JudgmentCitation = {
  page: number;
  lineStart: number;
  lineEnd: number;
  quote: string;
};

export type JudgmentDocumentSummary = {
  summary: string;
  citations: JudgmentCitation[];
};

export type LatestJudgmentDocumentResult = {
  download: OrderJudgmentDownload;
  entry: OrderJudgmentEntry;
  lines: JudgmentLine[];
  summary: string;
  citations: JudgmentCitation[];
};

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeLineText(value: string) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeFragments(fragments: Array<{ text: string; x: number }>) {
  let output = '';
  let previousX: number | null = null;

  for (const fragment of fragments) {
    const text = normalizeLineText(fragment.text);
    if (!text) continue;

    if (!output) {
      output = text;
      previousX = fragment.x;
      continue;
    }

    const needsSpace =
      !output.endsWith('-') &&
      !/^[,.;:)\]]/.test(text) &&
      previousX !== null &&
      Math.abs(fragment.x - previousX) > 1;

    output += needsSpace ? ` ${text}` : text;
    previousX = fragment.x;
  }

  return normalizeLineText(output);
}

export async function extractJudgmentLinesFromBase64(base64: string): Promise<JudgmentLine[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = Uint8Array.from(Buffer.from(base64, 'base64'));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const lines: JudgmentLine[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const grouped = new Map<number, Array<{ text: string; x: number }>>();

    for (const item of textContent.items as Array<{ str?: string; transform?: number[] }>) {
      const text = normalizeLineText(item?.str || '');
      const transform = Array.isArray(item?.transform) ? item.transform : [];
      const x = typeof transform[4] === 'number' ? transform[4] : 0;
      const y = typeof transform[5] === 'number' ? transform[5] : 0;
      if (!text) continue;

      const matchedKey =
        Array.from(grouped.keys()).find((key) => Math.abs(key - y) <= 2.5) ?? Math.round(y * 10) / 10;
      const bucket = grouped.get(matchedKey) || [];
      bucket.push({ text, x });
      grouped.set(matchedKey, bucket);
    }

    const sortedLineGroups = Array.from(grouped.entries()).sort((left, right) => right[0] - left[0]);
    let lineNumber = 1;
    for (const [, fragments] of sortedLineGroups) {
      const text = mergeFragments(fragments.sort((left, right) => left.x - right.x));
      if (!text) continue;
      lines.push({
        page: pageNumber,
        line: lineNumber,
        text,
      });
      lineNumber += 1;
    }
  }

  return lines;
}

function sanitizeCitation(raw: unknown): JudgmentCitation | null {
  if (!raw || typeof raw !== 'object') return null;
  const page = Number((raw as { page?: unknown }).page);
  const lineStart = Number((raw as { lineStart?: unknown }).lineStart);
  const lineEnd = Number((raw as { lineEnd?: unknown }).lineEnd);
  const quote = normalizeLineText(String((raw as { quote?: unknown }).quote || ''));
  if (!Number.isFinite(page) || !Number.isFinite(lineStart) || !Number.isFinite(lineEnd) || !quote) {
    return null;
  }
  return {
    page,
    lineStart,
    lineEnd,
    quote,
  };
}

function buildFallbackSummary(lines: JudgmentLine[]) {
  if (lines.length === 0) {
    return 'The latest order PDF was loaded, but no readable text was extracted.';
  }
  return 'The latest order PDF was loaded, but a concise summary could not be generated automatically.';
}

function buildFallbackCitations(lines: JudgmentLine[]): JudgmentCitation[] {
  const firstLines = lines.slice(0, 2);
  if (firstLines.length === 0) return [];
  return firstLines.map((line) => ({
    page: line.page,
    lineStart: line.line,
    lineEnd: line.line,
    quote: line.text,
  }));
}

export async function summarizeJudgmentDocument(input: {
  caseLabel: string;
  orderDate: string | null;
  lines: JudgmentLine[];
}): Promise<JudgmentDocumentSummary> {
  const lineText = input.lines
    .map((line) => `P${line.page}:L${line.line} ${line.text}`)
    .join('\n');

  try {
    const response = await runGpt5Nano({
      messages: [
        {
          role: 'system',
          content:
            'You summarize court order PDFs for lawyers. Return only valid JSON: {"summary":"...","citations":[{"page":1,"lineStart":1,"lineEnd":2,"quote":"..."}]}. Summary must be 1-3 short sentences, directly answer what the latest order says, and avoid repeating case title metadata. Use 1-3 exact supporting citations from the provided numbered lines only.',
        },
        {
          role: 'user',
          content: [
            `Case: ${input.caseLabel}`,
            input.orderDate ? `Order date: ${input.orderDate}` : '',
            'PDF lines:',
            lineText,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      maxCompletionTokens: 900,
    });

    const parsed = extractJsonObject(response);
    const summary = normalizeLineText(String(parsed?.summary || ''));
    const citations = Array.isArray(parsed?.citations)
      ? parsed.citations.map(sanitizeCitation).filter((entry): entry is JudgmentCitation => Boolean(entry))
      : [];

    if (summary) {
      return {
        summary,
        citations: citations.length > 0 ? citations : buildFallbackCitations(input.lines),
      };
    }
  } catch {}

  return {
    summary: buildFallbackSummary(input.lines),
    citations: buildFallbackCitations(input.lines),
  };
}

export function buildJudgmentViewerHref(input: {
  viewUrl: string;
  date?: string | null;
  page?: number | null;
  title?: string | null;
}) {
  const params = new URLSearchParams();
  params.set('viewUrl', input.viewUrl);
  if (input.date) params.set('date', input.date);
  if (input.page && input.page > 0) params.set('page', String(input.page));
  if (input.title) params.set('title', input.title);
  return `/orders/judgment-view?${params.toString()}`;
}

export async function loadLatestJudgmentDocument(input: {
  caseLabel: string;
  latestOrder: OrderJudgmentEntry;
}): Promise<LatestJudgmentDocumentResult> {
  const download = await downloadOrderJudgment(input.latestOrder.viewUrl, input.latestOrder.date || undefined);
  const lines = await extractJudgmentLinesFromBase64(download.base64);
  const summary = await summarizeJudgmentDocument({
    caseLabel: input.caseLabel,
    orderDate: input.latestOrder.date || null,
    lines,
  });

  return {
    download,
    entry: input.latestOrder,
    lines,
    summary: summary.summary,
    citations: summary.citations,
  };
}
