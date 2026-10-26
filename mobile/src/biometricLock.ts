import * as Keychain from 'react-native-keychain';

const options: Keychain.GetOptions & Keychain.SetOptions = {
  service: 'com.hcourt.mobile.unlock',
  accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: { title: 'Unlock Courtlens' },
};

export async function unlockWithBiometrics() {
  const existing = await Keychain.getGenericPassword(options);
  if (existing) return true;

  return Keychain.setGenericPassword('hcourt', 'unlocked', options);
}
