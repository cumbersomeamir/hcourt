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

export const googleWebClientId = '982394553106-peg6u74d76pr8383ipujsjv7bpkh1kqr.apps.googleusercontent.com';
export const googleIosClientId = '982394553106-v80q95rap1qhnc0ncgur3hqv0af4aja9.apps.googleusercontent.com';
