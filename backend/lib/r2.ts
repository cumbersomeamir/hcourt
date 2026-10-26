import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

let client: S3Client | null = null;

function config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const bucket = String(process.env.R2_BUCKET_NAME || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 storage is not configured');
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

function getClient() {
  const value = config();
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${value.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: value.accessKeyId,
        secretAccessKey: value.secretAccessKey,
      },
    });
  }
  return { client, bucket: value.bucket };
}

function safeName(value: string) {
  return String(value || 'file.bin').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
}

export async function uploadMediaToR2(input: {
  bytes: Buffer;
  filename: string;
  contentType: string;
  folder: string;
}) {
  const { client: r2, bucket } = getClient();
  const hash = createHash('sha256').update(input.bytes).digest('hex').slice(0, 24);
  const key = `${safeName(input.folder)}/${hash}-${safeName(input.filename)}`;
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.bytes,
    ContentType: input.contentType,
  }));
  const publicBase = String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
  return { key, url: publicBase ? `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}` : null };
}

export async function getMediaFromR2(key: string) {
  const { client: r2, bucket } = getClient();
  const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error('R2 object body is empty');
  return Buffer.from(await result.Body.transformToByteArray());
}
