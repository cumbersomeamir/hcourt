import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth, AppleButton } from '@invertase/react-native-apple-authentication';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import NativeWorkspace, { type WorkspaceHandle } from './src/NativeWorkspace';

import { biometricLockEnabled, appWebUrl, googleIosClientId, googleWebClientId } from './src/config';
import { appUrlFromDeepLink } from './src/navigation';
import { unlockWithBiometrics } from './src/biometricLock';
import {
  clearNativeSession,
  exchangeGoogleIdToken,
  signInWithApple,
  loadNativeLawyerProfile,
  loadNativeSession,
  type NativeAuthSession,
  type NativeLawyerProfile,
  saveNativeLawyerProfile,
  saveNativeSession,
} from './src/nativeAuth';

const googleSignInRequired = true;

function toAliases(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function AppLoadingScreen({ overlay = false }: { overlay?: boolean }) {
  return (
    <View style={overlay ? styles.pageLoadingOverlay : styles.loadingScreen} pointerEvents={overlay ? 'none' : 'auto'}>
      <View style={styles.loadingGlowTop} />
      <View style={styles.loadingGlowBottom} />
      <View style={styles.loadingBrandMark}><Text style={styles.loadingBrandMarkText}>H</Text></View>
      <Text style={styles.loadingBrand}>Courtlens</Text>
      <Text style={styles.loadingEyebrow}>ADVOCATE DESK</Text>
      <View style={styles.loadingIndicator}><ActivityIndicator size="small" color="#7dd3fc" /></View>
      <Text style={styles.loadingTitle}>Preparing your workspace</Text>
      <Text style={styles.loadingDescription}>Bringing your legal work into view.</Text>
    </View>
  );
}

function App() {
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const [initialUrl, setInitialUrl] = useState('/');
  const [online, setOnline] = useState(true);
  const [unlocked, setUnlocked] = useState(!biometricLockEnabled);
  const [session, setSession] = useState<NativeAuthSession | null | undefined>(undefined);
  const [profile, setProfile] = useState<NativeLawyerProfile | null | undefined>(undefined);
  const [profileSetupSkipped, setProfileSetupSkipped] = useState(false);
  const [profileEditorMode, setProfileEditorMode] = useState<'settings' | null>(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginProvider, setLoginProvider] = useState<'google' | 'apple' | null>(null);
  const [profileForm, setProfileForm] = useState({
    counselName: '',
    enrollmentNo: '',
    aliases: '',
    chamberAliases: '',
  });

  const openDeepLink = useCallback((value: string | null | undefined) => {
    if (!value) return;
    const target = appUrlFromDeepLink(value);
    if (target) {
      setInitialUrl(target);
      workspaceRef.current?.navigate(target);
    }
  }, []);

  useEffect(() => {
    const networkSubscription = NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected)));
    const linkSubscription = Linking.addEventListener('url', ({ url }) => openDeepLink(url));
    Linking.getInitialURL().then(openDeepLink).catch(() => undefined);
    return () => {
      networkSubscription();
      linkSubscription.remove();
    };
  }, [openDeepLink]);

  useEffect(() => {
    if (googleWebClientId) {
      GoogleSignin.configure({ webClientId: googleWebClientId, iosClientId: googleIosClientId, offlineAccess: false });
    }
    loadNativeSession()
      .then(async (savedSession) => {
        if (!savedSession) {
          setSession(null);
          return;
        }
        if (Platform.OS === 'ios' && savedSession.user.id.startsWith('apple:')) {
          const state = await appleAuth.getCredentialStateForUser(savedSession.user.id.slice(6));
          if (state !== appleAuth.State.AUTHORIZED) throw new Error('Apple authorization expired.');
        }
        const savedProfile = await loadNativeLawyerProfile(savedSession.token);
        setSession(savedSession);
        setProfile(savedProfile);
        setProfileSetupSkipped(Boolean(savedSession.profileSetupSkipped));
        if (savedProfile) {
          setProfileForm({
            counselName: savedProfile.counselName,
            enrollmentNo: savedProfile.enrollmentNo || '',
            aliases: savedProfile.aliases.join('\n'),
            chamberAliases: savedProfile.chamberAliases.join('\n'),
          });
        }
      })
      .catch(async () => {
        await clearNativeSession();
        setSession(null);
      });
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (profileEditorMode === 'settings') {
        setProfileEditorMode(null);
        setShowAccountSettings(true);
        return true;
      }
      if (showAccountSettings) {
        setShowAccountSettings(false);
        return true;
      }
      return workspaceRef.current?.goBack() || false;
    });
    return () => subscription.remove();
  }, [profileEditorMode, showAccountSettings]);

  const unlock = useCallback(async () => {
    try {
      if (await unlockWithBiometrics()) setUnlocked(true);
    } catch {
      Alert.alert('Biometric lock unavailable', 'Use a device with enrolled biometrics or disable APP_ENABLE_BIOMETRIC_LOCK.');
    }
  }, []);

  const signIn = useCallback(async (provider: 'google' | 'apple') => {
    if (busy || (provider === 'google' && !googleWebClientId)) return;
    try {
      setBusy(true);
      setLoginProvider(provider);
      setAuthError('');
      let nextSession: NativeAuthSession;
      if (provider === 'apple') {
        nextSession = await signInWithApple();
      } else {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        await GoogleSignin.signOut();
        const response = await GoogleSignin.signIn();
        if (response.type !== 'success' || !response.data.idToken) return;
        nextSession = await exchangeGoogleIdToken(response.data.idToken);
      }
      const nextProfile = await loadNativeLawyerProfile(nextSession.token);
      await saveNativeSession(nextSession);
      setSession(nextSession);
      setProfile(nextProfile);
      setProfileSetupSkipped(false);
      if (nextProfile) {
        setProfileForm({
          counselName: nextProfile.counselName,
          enrollmentNo: nextProfile.enrollmentNo || '',
          aliases: nextProfile.aliases.join('\n'),
          chamberAliases: nextProfile.chamberAliases.join('\n'),
        });
      }
    } catch (error) {
      if (provider === 'apple' && (error as { code?: string }).code === appleAuth.Error.CANCELED) return;
      setAuthError(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
      setLoginProvider(null);
    }
  }, [busy]);

  const saveProfile = useCallback(async () => {
    if (!session) return;
    if (!profileForm.counselName.trim() || !profileForm.enrollmentNo.trim()) {
      setAuthError('Full counsel name and enrollment number are required.');
      return;
    }

    try {
      setBusy(true);
      setAuthError('');
      const nextProfile = await saveNativeLawyerProfile(session.token, {
        counselName: profileForm.counselName.trim(),
        enrollmentNo: profileForm.enrollmentNo.trim(),
        aliases: toAliases(profileForm.aliases),
        chamberAliases: toAliases(profileForm.chamberAliases),
      });
      setProfile(nextProfile);
      setProfileSetupSkipped(false);
      if (profileEditorMode === 'settings') {
        setProfileEditorMode(null);
        setShowAccountSettings(true);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not save lawyer profile.');
    } finally {
      setBusy(false);
    }
  }, [profileEditorMode, profileForm, session]);

  const returnToSignIn = useCallback(async () => {
    try {
      setBusy(true);
      await clearNativeSession();
      await GoogleSignin.signOut().catch(() => undefined);
      setSession(null);
      setProfile(null);
      setProfileSetupSkipped(false);
      setAuthError('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not return to sign-in.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !session?.user.id.startsWith('apple:')) return;
    return appleAuth.onCredentialRevoked(async () => {
      await clearNativeSession();
      setSession(null);
      setProfile(null);
      setProfileSetupSkipped(false);
      setShowAccountSettings(false);
    });
  }, [session?.user.id]);

  const skipProfileSetup = useCallback(async () => {
    if (profileEditorMode === 'settings') {
      setProfileEditorMode(null);
      setShowAccountSettings(true);
      return;
    }
    if (!session) return;
    const skippedSession = { ...session, profileSetupSkipped: true };
    try {
      setBusy(true);
      await saveNativeSession(skippedSession);
      setSession(skippedSession);
      setProfileSetupSkipped(true);
      setAuthError('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not save your preference.');
    } finally {
      setBusy(false);
    }
  }, [profileEditorMode, session]);

  const closeProfileEditor = useCallback(() => {
    if (profileEditorMode === 'settings') {
      setProfileEditorMode(null);
      setShowAccountSettings(true);
      return;
    }
    returnToSignIn();
  }, [profileEditorMode, returnToSignIn]);

  const openProfileEditor = useCallback(() => {
    setShowAccountSettings(false);
    setProfileEditorMode('settings');
  }, []);

  const closeSettings = useCallback(() => {
    if (profileEditorMode === 'settings') {
      setProfileEditorMode(null);
      setShowAccountSettings(true);
    } else {
      setShowAccountSettings(false);
    }
  }, [profileEditorMode]);

  const openDashboard = useCallback(() => {
    setShowAccountSettings(false);
    workspaceRef.current?.navigate('/');
  }, []);

  const deleteAccountFromApp = useCallback(async () => {
    try {
      setBusy(true);
      if (!session) throw new Error('Sign in is required.');
      const response = await fetch(new URL('/api/account', appWebUrl.origin).toString(), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!response.ok) throw new Error('Account data could not be deleted.');
      await clearNativeSession();
      await GoogleSignin.signOut().catch(() => undefined);
      setShowAccountSettings(false);
      setProfileEditorMode(null);
      setSession(null);
      setProfile(null);
      setProfileSetupSkipped(false);
      setAuthError('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not delete this account from the app.');
    } finally {
      setBusy(false);
    }
  }, [session]);

  const requestAccountDeletion = useCallback(() => {
    Alert.alert(
      'Delete account?',
      'Are you sure you want to delete your account from this app? You will need to sign in again to return.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => { deleteAccountFromApp(); } },
      ]
    );
  }, [deleteAccountFromApp]);

  if (!unlocked) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Courtlens is locked</Text>
        <TouchableOpacity style={styles.button} onPress={unlock}>
          <Text style={styles.buttonText}>Unlock with biometrics</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!online) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>You’re offline</Text>
        <Text style={styles.message}>Reconnect to continue using Courtlens.</Text>
      </View>
    );
  }

  if (googleSignInRequired && session === undefined) {
    return <AppLoadingScreen />;
  }

  if (googleSignInRequired && !session) {
    return (
      <View style={styles.authScreen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.authGlowTop} />
        <View style={styles.authGlowBottom} />
        <View style={styles.authContent}>
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brandName}>Courtlens</Text>
              <Text style={styles.brandTagline}>ADVOCATE DESK</Text>
            </View>
          </View>

          <View style={styles.authHero}>
            <Text style={styles.authEyebrow}>YOUR PRIVATE LEGAL WORKSPACE</Text>
            <Text style={styles.authTitle}>Practice with clarity.</Text>
            <Text style={styles.authTitleAccent}>Move with confidence.</Text>
            <Text style={styles.authDescription}>
              One secure place for your matters, court updates, and the work that matters next.
            </Text>
          </View>

          <View style={styles.authBenefits}>
            <View style={styles.authBenefitRow}>
              <View style={styles.authBenefitDot} />
              <Text style={styles.authBenefitText}>A workspace tailored to your practice</Text>
            </View>
            <View style={styles.authBenefitRow}>
              <View style={styles.authBenefitDot} />
              <Text style={styles.authBenefitText}>Secure access to your tracked matters</Text>
            </View>
          </View>
        </View>

        <View style={styles.authFooter}>
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={busy || !googleWebClientId}
            style={[styles.googleButton, busy && styles.buttonDisabled]}
            onPress={() => signIn('google')}
          >
            <View style={styles.googleMark}>
              <Text style={styles.googleMarkText}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>{loginProvider === 'google' ? 'Connecting securely...' : 'Continue with Google'}</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && appleAuth.isSupported ? (
            <View pointerEvents={busy ? 'none' : 'auto'} style={busy ? styles.buttonDisabled : undefined}>
              {loginProvider === 'apple' ? (
                <View style={[styles.googleButton, styles.appleButton]} accessibilityRole="progressbar" accessibilityLabel="Signing in with Apple">
                  <ActivityIndicator color="#172033" />
                  <Text style={styles.googleButtonText}> Connecting securely...</Text>
                </View>
              ) : <AppleButton
                buttonStyle={AppleButton.Style.WHITE}
                buttonType={AppleButton.Type.CONTINUE}
                cornerRadius={15}
                style={styles.appleButton}
                onPress={() => signIn('apple')}
              />}
            </View>
          ) : null}
          {!googleWebClientId ? <Text style={styles.error}>Google sign-in is not configured.</Text> : null}
          <Text style={styles.authDisclaimer}>By continuing, you agree to use Courtlens for your professional legal work.</Text>
          <View style={styles.authLegalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(new URL('/privacy', appWebUrl).toString())}>
              <Text style={styles.authLegalLink}>Privacy policy</Text>
            </TouchableOpacity>
            <Text style={styles.authLegalSeparator}>•</Text>
            <TouchableOpacity onPress={() => Linking.openURL(new URL('/delete-account', appWebUrl).toString())}>
              <Text style={styles.authLegalLink}>Delete account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (googleSignInRequired && profile === undefined) {
    return <AppLoadingScreen />;
  }

  let profileScreen: ReactNode = null;
  if (googleSignInRequired && ((!profile && !profileSetupSkipped) || profileEditorMode === 'settings')) {
    profileScreen = (
      <View style={styles.profileSetupScreen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.profileGlow} />
        <View style={styles.profileHeader}>
          <TouchableOpacity activeOpacity={0.8} disabled={busy} style={styles.backButton} onPress={closeProfileEditor}>
            <Text style={styles.backButtonArrow}>‹</Text>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} disabled={busy} onPress={skipProfileSetup}>
            <Text style={styles.skipButtonText}>{profileEditorMode === 'settings' ? 'Cancel' : 'Skip for now'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.authEyebrow}>MAKE Courtlens YOUR OWN</Text>
          <Text style={styles.profileTitle}>Set up your{`\n`}practice.</Text>
          <Text style={styles.profileDescription}>
            These details help Courtlens recognize your matters and personalize your workspace.
          </Text>

          <View style={styles.linkedAccount}>
            <View style={styles.linkedAccountMark}>
              <Text style={styles.linkedAccountMarkText}>G</Text>
            </View>
            <View>
              <Text style={styles.linkedAccountLabel}>SIGNED IN AS</Text>
              <Text numberOfLines={1} style={styles.linkedAccountEmail}>{session?.user.email}</Text>
            </View>
          </View>

          {authError ? <Text style={styles.error}>{authError}</Text> : null}

          <View style={styles.profileField}>
            <Text style={styles.fieldLabel}>Full counsel name</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={(counselName) => setProfileForm((current) => ({ ...current, counselName }))}
              placeholder="e.g. Adv. Priya Sharma"
              placeholderTextColor="#71829a"
              style={styles.profileInput}
              value={profileForm.counselName}
            />
          </View>
          <View style={styles.profileField}>
            <Text style={styles.fieldLabel}>Bar enrollment number</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={(enrollmentNo) => setProfileForm((current) => ({ ...current, enrollmentNo }))}
              placeholder="e.g. UP/1234/2022"
              placeholderTextColor="#71829a"
              style={styles.profileInput}
              value={profileForm.enrollmentNo}
            />
          </View>
          <View style={styles.profileField}>
            <Text style={styles.fieldLabel}>Name aliases <Text style={styles.optionalLabel}>OPTIONAL</Text></Text>
            <TextInput
              autoCapitalize="words"
              multiline
              onChangeText={(aliases) => setProfileForm((current) => ({ ...current, aliases }))}
              placeholder="Add alternate name spellings, one per line"
              placeholderTextColor="#71829a"
              style={[styles.profileInput, styles.multilineInput]}
              value={profileForm.aliases}
            />
          </View>
          <View style={styles.profileField}>
            <Text style={styles.fieldLabel}>Chamber or firm <Text style={styles.optionalLabel}>OPTIONAL</Text></Text>
            <TextInput
              autoCapitalize="words"
              multiline
              onChangeText={(chamberAliases) => setProfileForm((current) => ({ ...current, chamberAliases }))}
              placeholder="Add your chamber or firm name"
              placeholderTextColor="#71829a"
              style={[styles.profileInput, styles.multilineInput]}
              value={profileForm.chamberAliases}
            />
          </View>

          <TouchableOpacity activeOpacity={0.86} disabled={busy} style={[styles.profileSaveButton, busy && styles.buttonDisabled]} onPress={saveProfile}>
            <Text style={styles.profileSaveButtonText}>{busy ? 'Saving your profile...' : 'Save and continue'}</Text>
          </TouchableOpacity>
          <Text style={styles.profileFootnote}>You can update these details anytime from your account settings.</Text>
        </ScrollView>
      </View>
    );
  }

  if (profileScreen && profileEditorMode !== 'settings') return profileScreen;

  let accountScreen: ReactNode = null;
  if (googleSignInRequired && session && showAccountSettings) {
    const accountName = profile?.counselName || session.user.name || 'Courtlens member';
    const accountInitial = accountName.trim().charAt(0).toUpperCase() || 'H';

    accountScreen = (
      <View style={styles.accountScreen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.profileGlow} />
        <View style={styles.profileHeader}>
          <TouchableOpacity activeOpacity={0.8} style={styles.backButton} onPress={openDashboard}>
            <Text style={styles.backButtonArrow}>‹</Text>
            <Text style={styles.backButtonText}>Dashboard</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.accountScrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.authEyebrow}>ACCOUNT & SETTINGS</Text>
          <Text style={styles.accountTitle}>Your workspace,{`\n`}your way.</Text>

          <View style={styles.accountIdentityCard}>
            <View style={styles.accountAvatar}><Text style={styles.accountAvatarText}>{accountInitial}</Text></View>
            <View style={styles.accountIdentityCopy}>
              <Text numberOfLines={1} style={styles.accountName}>{accountName}</Text>
              <Text numberOfLines={1} style={styles.accountEmail}>{session.user.email}</Text>
              <View style={styles.accountBadge}><Text style={styles.accountBadgeText}>GOOGLE ACCOUNT</Text></View>
            </View>
          </View>

          <Text style={styles.settingsSectionLabel}>YOUR PRACTICE</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity activeOpacity={0.78} style={styles.settingsRow} onPress={openProfileEditor}>
              <View style={[styles.settingsIcon, styles.settingsIconCyan]}><Text style={styles.settingsIconText}>P</Text></View>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Profile details</Text>
                <Text numberOfLines={1} style={styles.settingsRowDescription}>{profile?.enrollmentNo || 'Add your professional details'}</Text>
              </View>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.settingsSectionLabel}>PRIVACY & SECURITY</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIcon, styles.settingsIconIndigo]}><Text style={styles.settingsIconText}>G</Text></View>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Connected account</Text>
                <Text numberOfLines={1} style={styles.settingsRowDescription}>{session.user.email}</Text>
              </View>
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIcon, styles.settingsIconEmerald]}><Text style={styles.settingsIconText}>✓</Text></View>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Private workspace</Text>
                <Text style={styles.settingsRowDescription}>Your profile is used only for your Courtlens workspace</Text>
              </View>
            </View>
          </View>

          <Text style={styles.settingsSectionLabel}>SUPPORT & LEGAL</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity activeOpacity={0.78} style={styles.settingsRow} onPress={() => Linking.openURL(new URL('/support', appWebUrl).toString())}>
              <View style={[styles.settingsIcon, styles.settingsIconSlate]}><Text style={styles.settingsIconText}>?</Text></View>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Help & support</Text>
                <Text style={styles.settingsRowDescription}>Contact us, privacy policy and legal information</Text>
              </View>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.settingsSectionLabel}>ACCOUNT ACTIONS</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity activeOpacity={0.78} style={styles.settingsRow} onPress={returnToSignIn}>
              <View style={[styles.settingsIcon, styles.settingsIconSlate]}><Text style={styles.settingsIconText}>↪</Text></View>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Log out</Text>
                <Text style={styles.settingsRowDescription}>Sign out from this device</Text>
              </View>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <TouchableOpacity activeOpacity={0.78} style={styles.settingsRow} onPress={requestAccountDeletion}>
              <View style={[styles.settingsIcon, styles.settingsIconRed]}><Text style={styles.settingsIconText}>×</Text></View>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.deleteAccountTitle}>Delete account</Text>
                <Text style={styles.settingsRowDescription}>Remove this account from Courtlens on this device</Text>
              </View>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.workspaceContainer}>
        {session && <NativeWorkspace ref={workspaceRef} key={session.user.id} session={session} profile={profile || null} initialUrl={initialUrl} onAccount={() => setShowAccountSettings(true)} onExpired={returnToSignIn} />}
      </SafeAreaView>
      <Modal visible={showAccountSettings || profileEditorMode === 'settings'} onRequestClose={closeSettings} animationType="slide">
        {profileScreen || accountScreen}
      </Modal>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  workspaceContainer: { backgroundColor: '#081127', flex: 1 },
  loadingScreen: { alignItems: 'center', backgroundColor: '#081127', flex: 1, justifyContent: 'center', overflow: 'hidden', padding: 28 },
  pageLoadingOverlay: { alignItems: 'center', backgroundColor: '#081127', bottom: 0, justifyContent: 'center', left: 0, overflow: 'hidden', padding: 28, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  loadingGlowTop: { backgroundColor: '#0c4a6e', borderRadius: 999, height: 250, opacity: 0.28, position: 'absolute', right: -125, top: -120, width: 250 },
  loadingGlowBottom: { backgroundColor: '#172554', borderRadius: 999, bottom: -150, height: 290, left: -170, opacity: 0.78, position: 'absolute', width: 290 },
  loadingBrandMark: { alignItems: 'center', backgroundColor: '#0ea5e9', borderRadius: 18, height: 58, justifyContent: 'center', shadowColor: '#38bdf8', shadowOpacity: 0.4, shadowRadius: 18, width: 58 },
  loadingBrandMarkText: { color: '#f8fafc', fontFamily: 'serif', fontSize: 33, fontWeight: '800' },
  loadingBrand: { color: '#f8fafc', fontSize: 18, fontWeight: '800', letterSpacing: 2.4, marginTop: 18 },
  loadingEyebrow: { color: '#7dd3fc', fontSize: 9, fontWeight: '800', letterSpacing: 2.1, marginTop: 5 },
  loadingIndicator: { alignItems: 'center', backgroundColor: '#102a47', borderColor: '#1e5276', borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', marginTop: 34, width: 44 },
  loadingTitle: { color: '#e5edf6', fontSize: 17, fontWeight: '700', marginTop: 17 },
  loadingDescription: { color: '#7f96ae', fontSize: 13, marginTop: 7, textAlign: 'center' },
  centered: { alignItems: 'center', backgroundColor: '#081127', flex: 1, justifyContent: 'center', padding: 24 },
  authScreen: { backgroundColor: '#081127', flex: 1, overflow: 'hidden', paddingHorizontal: 28, paddingTop: 64 },
  authGlowTop: { backgroundColor: '#0c4a6e', borderRadius: 999, height: 310, opacity: 0.34, position: 'absolute', right: -145, top: -130, width: 310 },
  authGlowBottom: { backgroundColor: '#172554', borderRadius: 999, bottom: -170, height: 350, left: -210, opacity: 0.8, position: 'absolute', width: 350 },
  authContent: { flex: 1 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  brandMark: { alignItems: 'center', backgroundColor: '#0ea5e9', borderRadius: 12, height: 42, justifyContent: 'center', shadowColor: '#38bdf8', shadowOpacity: 0.32, shadowRadius: 14, width: 42 },
  brandMarkText: { color: '#f8fafc', fontFamily: 'serif', fontSize: 25, fontWeight: '800' },
  brandName: { color: '#f8fafc', fontSize: 17, fontWeight: '800', letterSpacing: 1.8 },
  brandTagline: { color: '#7dd3fc', fontSize: 9, fontWeight: '700', letterSpacing: 1.8, marginTop: 2 },
  authHero: { marginTop: 88 },
  authEyebrow: { color: '#38bdf8', fontSize: 10, fontWeight: '800', letterSpacing: 1.25, marginBottom: 17 },
  authTitle: { color: '#f8fafc', fontSize: 35, fontWeight: '700', letterSpacing: -1.05, lineHeight: 42 },
  authTitleAccent: { color: '#7dd3fc', fontSize: 35, fontWeight: '700', letterSpacing: -1.05, lineHeight: 42 },
  authDescription: { color: '#b7c6d9', fontSize: 16, lineHeight: 24, marginTop: 20, maxWidth: 330 },
  authBenefits: { borderLeftColor: '#1e3a5f', borderLeftWidth: 1, marginTop: 38, paddingLeft: 16, rowGap: 16 },
  authBenefitRow: { alignItems: 'center', flexDirection: 'row' },
  authBenefitDot: { backgroundColor: '#22d3ee', borderRadius: 4, height: 7, marginRight: 11, width: 7 },
  authBenefitText: { color: '#d5e0ee', fontSize: 13, fontWeight: '500' },
  authFooter: { paddingBottom: 30 },
  googleButton: { alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 15, flexDirection: 'row', justifyContent: 'center', minHeight: 58, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.28, shadowRadius: 16 },
  appleButton: { width: '100%', height: 58, marginTop: 12 },
  buttonDisabled: { opacity: 0.68 },
  googleMark: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 15, height: 30, justifyContent: 'center', marginRight: 12, width: 30 },
  googleMarkText: { color: '#4285f4', fontSize: 19, fontWeight: '800' },
  googleButtonText: { color: '#172033', fontSize: 16, fontWeight: '700' },
  authLegalLinks: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  authLegalLink: { color: '#7dd3fc', fontSize: 12, fontWeight: '600' },
  authLegalSeparator: { color: '#64748b', fontSize: 12, marginHorizontal: 8 },
  authDisclaimer: { color: '#70839a', fontSize: 11, lineHeight: 16, marginHorizontal: 18, marginTop: 16, textAlign: 'center' },
  profileSetupScreen: { backgroundColor: '#081127', flex: 1, overflow: 'hidden', paddingHorizontal: 28, paddingTop: 55 },
  profileGlow: { backgroundColor: '#0c4a6e', borderRadius: 999, height: 270, opacity: 0.27, position: 'absolute', right: -145, top: -165, width: 270 },
  profileHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 37 },
  backButton: { alignItems: 'center', flexDirection: 'row', minHeight: 38 },
  backButtonArrow: { color: '#7dd3fc', fontSize: 31, fontWeight: '300', lineHeight: 32, marginRight: 6 },
  backButtonText: { color: '#d5e0ee', fontSize: 14, fontWeight: '700' },
  skipButtonText: { color: '#7dd3fc', fontSize: 13, fontWeight: '700' },
  profileScrollContent: { paddingBottom: 32 },
  profileTitle: { color: '#f8fafc', fontSize: 31, fontWeight: '700', letterSpacing: -0.8, lineHeight: 37 },
  profileDescription: { color: '#b7c6d9', fontSize: 15, lineHeight: 22, marginTop: 13, maxWidth: 340 },
  linkedAccount: { alignItems: 'center', backgroundColor: 'rgba(15, 35, 61, 0.84)', borderColor: '#1e3a5f', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 26, padding: 13 },
  linkedAccountMark: { alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 15, height: 30, justifyContent: 'center', marginRight: 11, width: 30 },
  linkedAccountMarkText: { color: '#4285f4', fontSize: 17, fontWeight: '800' },
  linkedAccountLabel: { color: '#7dd3fc', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  linkedAccountEmail: { color: '#e2e8f0', fontSize: 13, marginTop: 3, maxWidth: 245 },
  profileField: { marginTop: 18 },
  fieldLabel: { color: '#d5e0ee', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  optionalLabel: { color: '#6f849e', fontSize: 9, letterSpacing: 0.8 },
  profileInput: { backgroundColor: '#0d1b32', borderColor: '#274567', borderRadius: 12, borderWidth: 1, color: '#f8fafc', fontSize: 15, minHeight: 51, paddingHorizontal: 14, paddingVertical: 12 },
  profileSaveButton: { alignItems: 'center', backgroundColor: '#0ea5e9', borderRadius: 13, justifyContent: 'center', marginTop: 28, minHeight: 55, shadowColor: '#0ea5e9', shadowOpacity: 0.25, shadowRadius: 14 },
  profileSaveButtonText: { color: '#f8fafc', fontSize: 15, fontWeight: '800' },
  profileFootnote: { color: '#71829a', fontSize: 11, lineHeight: 16, marginTop: 14, textAlign: 'center' },
  accountScreen: { backgroundColor: '#081127', flex: 1, overflow: 'hidden', paddingHorizontal: 28, paddingTop: 55 },
  accountScrollContent: { paddingBottom: 36 },
  accountTitle: { color: '#f8fafc', fontSize: 31, fontWeight: '700', letterSpacing: -0.8, lineHeight: 37 },
  accountIdentityCard: { alignItems: 'center', backgroundColor: '#0d1f38', borderColor: '#244b71', borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginTop: 24, padding: 17 },
  accountAvatar: { alignItems: 'center', backgroundColor: '#0ea5e9', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  accountAvatarText: { color: '#f8fafc', fontSize: 20, fontWeight: '800' },
  accountIdentityCopy: { flex: 1, marginLeft: 13, minWidth: 0 },
  accountName: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  accountEmail: { color: '#a9bdd2', fontSize: 12, marginTop: 3 },
  accountBadge: { alignSelf: 'flex-start', backgroundColor: '#123b5c', borderRadius: 5, marginTop: 9, paddingHorizontal: 7, paddingVertical: 3 },
  accountBadgeText: { color: '#7dd3fc', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  settingsSectionLabel: { color: '#6f9ec1', fontSize: 10, fontWeight: '800', letterSpacing: 1.25, marginBottom: 9, marginTop: 26 },
  settingsCard: { backgroundColor: '#0d1b32', borderColor: '#203d60', borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  settingsRow: { alignItems: 'center', flexDirection: 'row', minHeight: 72, paddingHorizontal: 14, paddingVertical: 12 },
  settingsIcon: { alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', width: 38 },
  settingsIconCyan: { backgroundColor: '#123e58' },
  settingsIconIndigo: { backgroundColor: '#29305d' },
  settingsIconEmerald: { backgroundColor: '#16473e' },
  settingsIconSlate: { backgroundColor: '#26364b' },
  settingsIconRed: { backgroundColor: '#4b2634' },
  settingsIconText: { color: '#d9ecfb', fontSize: 16, fontWeight: '800' },
  settingsRowCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  settingsRowTitle: { color: '#e5edf6', fontSize: 14, fontWeight: '700' },
  settingsRowDescription: { color: '#8298b0', fontSize: 11, marginTop: 3 },
  settingsChevron: { color: '#6e9dc0', fontSize: 26, fontWeight: '300', marginLeft: 8 },
  settingsDivider: { backgroundColor: '#203d60', height: 1, marginLeft: 64 },
  deleteAccountTitle: { color: '#fca5a5', fontSize: 14, fontWeight: '700' },
  profileScreen: { backgroundColor: '#081127', flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 56 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  message: { color: '#cbd5e1', fontSize: 15, textAlign: 'center' },
  error: { color: '#fca5a5', fontSize: 14, marginTop: 14, textAlign: 'center' },
  input: { backgroundColor: '#0f1b35', borderColor: '#334155', borderRadius: 10, borderWidth: 1, color: '#f8fafc', fontSize: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 13 },
  multilineInput: { minHeight: 88, textAlignVertical: 'top' },
  button: { backgroundColor: '#0284c7', borderRadius: 10, marginTop: 12, paddingHorizontal: 18, paddingVertical: 12 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default App;
