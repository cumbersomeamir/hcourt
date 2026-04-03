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

export async function extractJudgmentLinesFromBase64(base64: string): Promise<JudgmentLine[]> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({
    data: Buffer.from(base64, 'base64'),
  });
  const textResult = await parser.getText({
    pageJoiner: '',
    itemJoiner: '',
    lineEnforce: true,
    cellSeparator: ' ',
  } as Record<string, unknown>);
  await parser.destroy();

  const lines: JudgmentLine[] = [];

  for (const page of textResult.pages || []) {
    let lineNumber = 1;
    for (const rawLine of String(page.text || '').split(/\r?\n/)) {
      const text = normalizeLineText(rawLine);
      if (!text) continue;
      lines.push({
        page: page.num,
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

function scoreJudgmentLine(text: string) {
  const normalized = normalizeLineText(text).toLowerCase();
  if (!normalized) return 0;

  const scoredPatterns: Array<[RegExp, number]> = [
    [/\badjourn(?:ed|ment)?\b/, 12],
    [/\bnext\b.*\b(date|listing|hearing)\b/, 10],
    [/\bshall be taken up\b/, 10],
    [/\bconnected writ\b/, 9],
    [/\bshown in the cause list\b/, 9],
    [/\bcounter affidavit\b/, 8],
    [/\brejoinder\b/, 8],
    [/\binterim\b/, 8],
    [/\bnotice\b/, 7],
    [/\blist(?:ed|ing)?\b/, 6],
    [/\bdisposed of\b/, 10],
    [/\ballowed\b/, 8],
    [/\bdismissed\b/, 8],
    [/\brejected\b/, 8],
    [/\bgranted\b/, 7],
    [/\bwithin\b.*\bweeks?\b/, 6],
  ];

  return scoredPatterns.reduce((score, [pattern, value]) => {
    return pattern.test(normalized) ? score + value : score;
  }, 0);
}

function buildFallbackCitations(lines: JudgmentLine[]): JudgmentCitation[] {
  const scoredLines = lines
    .map((line, index) => ({
      line,
      index,
      score: scoreJudgmentLine(line.text),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (scoredLines.length === 0) {
    const firstLines = lines.slice(0, 2);
    return firstLines.map((line) => ({
      page: line.page,
      lineStart: line.line,
      lineEnd: line.line,
      quote: line.text,
    }));
  }

  const citations: JudgmentCitation[] = [];
  const usedPages = new Set<string>();

  for (const entry of scoredLines) {
    const startIndex = entry.index;
    const startLine = lines[startIndex];
    const block: JudgmentLine[] = [startLine];

    for (let cursor = startIndex + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];
      const previous = block[block.length - 1];
      if (current.page !== previous.page || current.line !== previous.line + 1) break;
      block.push(current);
      const textLength = block.reduce((total, line) => total + line.text.length, 0);
      if (textLength >= 280 || block.length >= 5) break;
    }

    const quote = normalizeLineText(block.map((line) => line.text).join(' '));
    if (!quote) continue;

    const blockKey = `${startLine.page}:${startLine.line}`;
    if (usedPages.has(blockKey)) continue;
    usedPages.add(blockKey);

    citations.push({
      page: startLine.page,
      lineStart: startLine.line,
      lineEnd: block[block.length - 1].line,
      quote,
    });

    if (citations.length >= 2) break;
  }

  return citations.sort((left, right) => left.page - right.page || left.lineStart - right.lineStart);
}

function buildFallbackSummary(lines: JudgmentLine[]) {
  if (lines.length === 0) {
    return 'The latest order PDF was loaded, but no readable text was extracted.';
  }

  const citations = buildFallbackCitations(lines);
  if (citations.length === 0) {
    return 'The latest order PDF was loaded, but a concise summary could not be generated automatically.';
  }

  return citations
    .map((citation) => citation.quote)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  const fallbackCitations = buildFallbackCitations(input.lines);
  return {
    summary: buildFallbackSummary(input.lines),
    citations: fallbackCitations,
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
