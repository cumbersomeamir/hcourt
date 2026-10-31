import { s3Storage } from '@hot-updater/aws';
import { bare } from '@hot-updater/bare';
import { standaloneRepository } from '@hot-updater/standalone';
import { defineConfig } from 'hot-updater';
import process from 'node:process';

process.loadEnvFile('.env.hotupdater');
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for OTA publishing`);
  return value;
}

export default defineConfig({
  build: bare({ enableHermes: true }),
  updateStrategy: 'fingerprint',
  fingerprint: { nativeVersion: 1 },
  platform: {
    android: { androidManifestPaths: ['android/app/src/main/AndroidManifest.xml'] },
    ios: { infoPlistPaths: ['ios/HcourtMobile/Info.plist'] },
  },
  signing: { enabled: true, privateKeyPath: required('HOT_UPDATER_SIGNING_PRIVATE_KEY_PATH') },
  storage: s3Storage({
    region: 'auto', endpoint: required('R2_ENDPOINT'),
    credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') },
    bucketName: required('R2_BUCKET_NAME'),
  }),
  database: standaloneRepository({
    baseUrl: 'https://courtlens.website/updates/admin',
    commonHeaders: { Authorization: `Bearer ${required('HOT_UPDATER_ADMIN_TOKEN')}` },
  }),
});
