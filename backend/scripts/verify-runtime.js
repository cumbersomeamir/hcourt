const fs = require('fs');
const path = require('path');

function loadInstalledNextSwcBinary() {
  const nextScopeDir = path.join(__dirname, '..', 'node_modules', '@next');
  if (!fs.existsSync(nextScopeDir)) {
    throw new Error(`Missing @next directory at ${nextScopeDir}`);
  }

  const candidates = fs
    .readdirSync(nextScopeDir)
    .filter((entry) => entry.startsWith('swc-'))
    .sort();

  if (candidates.length === 0) {
    throw new Error('No installed @next/swc package found');
  }

  const failures = [];

  for (const candidate of candidates) {
    try {
      require(path.join(nextScopeDir, candidate));
      return candidate;
    } catch (error) {
      failures.push(
        `${candidate}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(`Unable to load any @next/swc package.\n${failures.join('\n')}`);
}

const checks = [
  {
    name: '@next/swc',
    load: () => loadInstalledNextSwcBinary(),
  },
  {
    name: 'playwright',
    load: () => require('playwright'),
  },
  {
    name: 'cheerio',
    load: () => require('cheerio'),
  },
  {
    name: 'exceljs',
    load: () => require('exceljs'),
  },
  {
    name: 'mongodb',
    load: () => require('mongodb'),
  },
  {
    name: 'pdf-parse',
    load: async () => import('pdf-parse'),
  },
];

async function main() {
  for (const check of checks) {
    const detail = await check.load();
    const suffix = typeof detail === 'string' && detail ? ` (${detail})` : '';
    process.stdout.write(`verified ${check.name}${suffix}\n`);
  }
}

main().catch((error) => {
  console.error('Runtime verification failed.');
  console.error(error);
  process.exit(1);
});
