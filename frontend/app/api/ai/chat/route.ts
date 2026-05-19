import { Buffer } from 'node:buffer';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const NODE_BINARY_CANDIDATES = [
  process.env.AI_CHAT_NODE_BINARY,
  '/home/azureuser/.nvm/versions/node/v22.14.0/bin/node',
  process.execPath,
].filter(Boolean) as string[];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function findBackendEnvFile(backendDir: string) {
  const candidates = ['.env.local', '.env.prod', '.env.production'];

  for (const filename of candidates) {
    const fullPath = path.join(backendDir, filename);
    try {
      await access(fullPath);
      return fullPath;
    } catch {}
  }

  return null;
}

async function loadEnvFile(envFile: string | null) {
  if (!envFile) return {};

  const env: Record<string, string> = {};
  const content = await readFile(envFile, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const equalsIndex = line.indexOf('=');
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }

  return env;
}

async function findNodeBinary() {
  for (const candidate of NODE_BINARY_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  return process.execPath;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const backendDir = path.resolve(process.cwd(), '../backend');
    const scriptPath = path.join(backendDir, 'scripts/run-ai-chat-cli.ts');
    const envFile = await findBackendEnvFile(backendDir);
    const backendEnv = await loadEnvFile(envFile);
    const nodeBinary = await findNodeBinary();
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    const args = [
      '--import',
      'tsx',
      scriptPath,
      encodedPayload,
    ];

    const { stdout, stderr } = await execFileAsync(nodeBinary, args, {
      cwd: backendDir,
      env: { ...process.env, ...backendEnv },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
    });

    if (stderr?.trim()) {
      console.error('AI chat stderr:', stderr);
    }

    return NextResponse.json(JSON.parse(stdout));
  } catch (error) {
    console.error('Frontend AI chat route failed:', error);
    return NextResponse.json(
      {
        error: 'AI chat request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
