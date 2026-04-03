import { Buffer } from 'node:buffer';
import { runAiAssistantChat } from '../lib/aiAssistant';

async function main() {
  const encodedPayload = String(process.argv[2] || '').trim();
  if (!encodedPayload) {
    throw new Error('Missing AI chat payload');
  }

  const decodedPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  const payload = JSON.parse(decodedPayload) as Parameters<typeof runAiAssistantChat>[0];
  const result = await runAiAssistantChat(payload);
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'AI chat execution failed';
  process.stderr.write(message);
  process.exit(1);
});
