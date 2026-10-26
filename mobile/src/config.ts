import 'react-native-url-polyfill/auto';
import Config from 'react-native-config';

const configuredUrl = Config.APP_WEB_URL?.trim();

if (!configuredUrl) {
  throw new Error('APP_WEB_URL is required. Copy .env.example to .env and set the deployed web URL.');
}

export const appWebUrl = new URL(configuredUrl);

if (appWebUrl.protocol !== 'https:') {
  throw new Error('APP_WEB_URL must use HTTPS.');
}

export const biometricLockEnabled = Config.APP_ENABLE_BIOMETRIC_LOCK === 'true';

export const googleWebClientId = Config.GOOGLE_WEB_CLIENT_ID?.trim() || '';
export const googleIosClientId = Config.GOOGLE_IOS_CLIENT_ID?.trim() || '';
