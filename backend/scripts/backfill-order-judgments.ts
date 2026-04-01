#!/usr/bin/env node

import {
  downloadOrderJudgment,
  fetchOrderJudgmentsForCase,
  type OrdersCity,
} from '../lib/orders';

type CliArgs = {
  city: OrdersCity;
  caseType: string;
  caseNo: string;
  caseYear: string;
};

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, value);
    i += 1;
  }

  const city = values.get('city') === 'allahabad' ? 'allahabad' : 'lucknow';
  const caseType = String(values.get('caseType') || '').trim();
  const caseNo = String(values.get('caseNo') || '').trim();
  const caseYear = String(values.get('caseYear') || '').trim();

  if (!caseType || !caseNo || !caseYear) {
    throw new Error(
      'Usage: node --env-file=.env.local --import tsx scripts/backfill-order-judgments.ts --city lucknow --caseType 22 --caseNo 10713 --caseYear 2023'
    );
  }

  return { city, caseType, caseNo, caseYear };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await fetchOrderJudgmentsForCase(args);

  console.log(
    `[backfill-order-judgments] Found ${result.orderJudgments.length} judgments for ${result.caseInfo.caseType} ${result.caseInfo.caseNo}/${result.caseInfo.caseYear}`
  );

  for (const entry of result.orderJudgments) {
    console.log(
      `[backfill-order-judgments] Caching ${entry.judgmentId} (${entry.date || 'no-date'})`
    );
    const download = await downloadOrderJudgment(entry.viewUrl, entry.date);
    console.log(
      `[backfill-order-judgments] Cached ${download.judgmentId} (${download.sizeBytes} bytes)`
    );
  }

  console.log('[backfill-order-judgments] Done');
}

main().catch((error) => {
  console.error('[backfill-order-judgments] Failed:', error);
  process.exit(1);
});
