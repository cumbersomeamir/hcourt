import * as Keychain from 'react-native-keychain';
import { appleAuth } from '@invertase/react-native-apple-authentication';

import { appWebUrl } from './config';

const keychainOptions: Keychain.GetOptions & Keychain.SetOptions = {
  service: 'com.hcourt.mobile.google-session',
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type NativeAuthSession = {
  token: string;
  profileSetupSkipped?: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    picture: string | null;
  };
};

export type NativeLawyerProfile = {
  profileKey: string;
  counselName: string;
  aliases: string[];
  chamberAliases: string[];
  enrollmentNo: string | null;
};

function apiUrl(pathname: string) {
  return new URL(pathname, appWebUrl.origin).toString();
}

async function apiRequest(pathname: string, token: string, init?: RequestInit) {
  const response = await fetch(apiUrl(pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
  return data;
}

export async function loadNativeSession() {
  const saved = await Keychain.getGenericPassword(keychainOptions);
  if (!saved) return null;

  try {
    return JSON.parse(saved.password) as NativeAuthSession;
  } catch {
    await Keychain.resetGenericPassword(keychainOptions);
    return null;
  }
}

export function saveNativeSession(session: NativeAuthSession) {
  return Keychain.setGenericPassword('hcourt', JSON.stringify(session), keychainOptions);
}

export function clearNativeSession() {
  return Keychain.resetGenericPassword(keychainOptions);
}

export async function exchangeGoogleIdToken(idToken: string) {
  const response = await fetch(apiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = await response.text();
  let data: { success?: boolean; error?: string; session?: NativeAuthSession };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('Google sign-in service is unavailable. Please try again shortly.');
  }
  if (!response.ok || !data.success || !data.session) {
    throw new Error(data.error || 'Google sign-in could not be verified.');
  }
  return data.session;
}

export async function loadNativeLawyerProfile(token: string) {
  const data = await apiRequest('/api/lawyer-profile', token);
  return (data.profile || null) as NativeLawyerProfile | null;
}

export async function signInWithApple() {
  const challengeResponse = await fetch(apiUrl('/api/auth/apple'));
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok || !challenge.success || !challenge.nonce) {
    throw new Error('Apple sign-in is temporarily unavailable.');
  }
  const credentials = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    nonce: challenge.nonce,
  });
  if (!credentials.authorizationCode) throw new Error('Apple authorization was not received.');
  const response = await fetch(apiUrl('/api/auth/apple'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authorizationCode: credentials.authorizationCode,
      nonce: challenge.nonce,
      name: [credentials.fullName?.givenName, credentials.fullName?.familyName].filter(Boolean).join(' '),
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.success || !data.session) {
    throw new Error(data.error || 'Apple sign-in could not be verified.');
  }
  return data.session as NativeAuthSession;
}

export async function saveNativeLawyerProfile(
  token: string,
  profile: Pick<NativeLawyerProfile, 'counselName' | 'aliases' | 'chamberAliases' | 'enrollmentNo'>
) {
  const data = await apiRequest('/api/lawyer-profile', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  return data.profile as NativeLawyerProfile;
}
