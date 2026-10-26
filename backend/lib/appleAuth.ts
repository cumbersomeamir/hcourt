import crypto from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { getDb } from '@/lib/mongodb';

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function sessionKey() {
  const secret = required('AUTH_SESSION_SECRET');
  if (secret.length < 32) throw new Error('Invalid session secret.');
  return new TextEncoder().encode(secret);
}

export async function createAppleNonce() {
  return new SignJWT({ purpose: 'apple-sign-in' })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(required('APPLE_CLIENT_ID'))
    .setIssuer('courtlens')
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(sessionKey());
}

async function clientSecret() {
  const key = await importPKCS8(required('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: required('APPLE_KEY_ID') })
    .setIssuer(required('APPLE_TEAM_ID'))
    .setSubject(required('APPLE_CLIENT_ID'))
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

function encryptionKey() {
  return crypto.createHash('sha256').update(sessionKey()).update('courtlens-apple-refresh').digest();
}

function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
}

function decryptToken(token: string) {
  const [iv, tag, encrypted] = token.split('.').map(value => Buffer.from(value, 'base64url'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
}

export async function authenticateApple(authorizationCode: string, nonce: string, name: string) {
  const clientId = required('APPLE_CLIENT_ID');
  const challenge = await jwtVerify(nonce, sessionKey(), {
    algorithms: ['HS256'], issuer: 'courtlens', audience: clientId, maxTokenAge: '5m',
  });
  if (challenge.payload.purpose !== 'apple-sign-in') throw new Error('Invalid challenge.');

  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: await clientSecret(),
      code: authorizationCode, grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Apple authorization failed.');
  const tokens = await response.json() as { id_token?: string; refresh_token?: string };
  if (!tokens.id_token || !tokens.refresh_token) throw new Error('Incomplete Apple authorization.');
  const { payload } = await jwtVerify(tokens.id_token, appleKeys, {
    algorithms: ['RS256'], issuer: 'https://appleid.apple.com', audience: clientId,
    requiredClaims: ['sub', 'exp', 'iat', 'nonce'], maxTokenAge: '10m',
  });
  if (payload.nonce !== crypto.createHash('sha256').update(nonce).digest('hex')) {
    throw new Error('Invalid Apple nonce.');
  }
  if (!payload.sub || typeof payload.email !== 'string' ||
      ![true, 'true'].includes(payload.email_verified as boolean | string)) {
    throw new Error('A verified Apple email is required.');
  }
  const userId = `apple:${payload.sub}`;
  const accounts = (await getDb()).collection('apple_accounts');
  await accounts.updateOne({ userId }, {
    $set: {
      email: payload.email, refreshToken: encryptToken(tokens.refresh_token), updatedAt: new Date(),
      ...(name ? { name } : {}),
    },
    $setOnInsert: { userId, createdAt: new Date() },
  }, { upsert: true });
  const account = await accounts.findOne({ userId });
  return { userId, email: payload.email, name: account?.name || 'Courtlens user' };
}

export async function revokeAppleAccess(userId: string) {
  const accounts = (await getDb()).collection('apple_accounts');
  const account = await accounts.findOne({ userId });
  if (!account?.refreshToken) throw new Error('Sign in with Apple again before deleting your account.');
  const response = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('APPLE_CLIENT_ID'), client_secret: await clientSecret(),
      token: decryptToken(account.refreshToken), token_type_hint: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Apple access could not be revoked. Please try again.');
}
