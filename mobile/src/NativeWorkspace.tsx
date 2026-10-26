import { Text, FontContext } from './typography';
import { homeTiles } from './homeTiles';
import { Background, TileSurface } from './Surface';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from '@react-native-community/blur';
import { ApiError, createApi } from './api';
import { appWebUrl } from './config';
import { type NativeAuthSession, type NativeLawyerProfile } from './nativeAuth';
import { normalizeCaseIds, normalizeTrackedOrderCases } from './caseProfiles';
import { WorkspaceContext, type Tracking } from './workspace';
import { Button, Icon, Page, s } from './ui';
import {
  CourtScreen,
  HistoryScreen,
  MyCasesScreen,
  NotificationsContent,
  TrackScreen,
} from './screens/Cases';
import { JudgmentScreen, OrdersScreen, StatusScreen } from './screens/Orders';
import DiaryScreen from './screens/Diary';
import CauseListScreen from './screens/CauseList';
import ChatScreen from './screens/Chat';

export type WorkspaceHandle = {
  navigate: (path: string) => void;
  goBack: () => boolean;
};
type Props = {
  session: NativeAuthSession;
  profile: NativeLawyerProfile | null;
  initialUrl?: string;
  onAccount: () => void;
  onExpired: () => void;
};
const tiles = homeTiles;
const navigationColors: Record<string, string[]> = {
  '/court-view': ['#34d399', '#10b981', '#a7f3d0'],
  '/web-diary': ['#a78bfa', '#8b5cf6', '#ddd6fe'],
  '/cause-list': ['#fbbf24', '#f59e0b', '#fde68a'],
  '/orders': ['#fb7185', '#f43f5e', '#fecdd3'],
  '/ai-chat': ['#60a5fa', '#3b82f6', '#bfdbfe'],
  '/my-cases': ['#22d3ee', '#06b6d4', '#a5f3fc'],
  '/track-cases': ['#34d399', '#10b981', '#a7f3d0'],
};

const NativeWorkspace = forwardRef<WorkspaceHandle, Props>(
  function NativeWorkspace(
    { session, profile, initialUrl, onAccount, onExpired },
    ref,
  ) {
    const [paths, setPaths] = useState([initialUrl || '/']);
    const [menu, setMenu] = useState(false);
    const [tracking, setTracking] = useState<Tracking | null>(null);
    const [trackingError, setTrackingError] = useState('');
    const requestVersion = useRef(0);
    const invalidateTracking = useCallback(() => {
      requestVersion.current++;
    }, []);
    const api = useMemo(
      () => createApi(session.token, onExpired),
      [session.token, onExpired],
    );
    const navigate = useCallback(
      (path: string) => {
        setMenu(false);
        const url = new URL(path, appWebUrl.origin);
        if (url.origin !== appWebUrl.origin) {
          if (/^https?:$/.test(url.protocol))
            void Linking.openURL(url.toString());
          return;
        }
        if (url.pathname === '/account') {
          onAccount();
          return;
        }
        setPaths(current => [...current, `${url.pathname}${url.search}`]);
      },
      [onAccount],
    );
    useImperativeHandle(
      ref,
      () => ({
        navigate,
        goBack: () => {
          if (menu) {
            setMenu(false);
            return true;
          }
          if (paths.length <= 1) return false;
          setPaths(current => current.slice(0, -1));
          return true;
        },
      }),
      [navigate, paths.length, menu],
    );
    const reloadTracking = useCallback(async () => {
      const version = ++requestVersion.current;
      try {
        setTrackingError('');
        let account: Tracking;
        try {
          const response = await api<{ user: Tracking }>(
            `/api/users?email=${encodeURIComponent(session.user.email)}`,
          );
          account = response.user;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          const response = await api<{ userId: string }>('/api/users', {
            email: session.user.email,
            name: session.user.name,
            caseIds: [],
            trackedOrderCases: [],
          });
          account = { id: response.userId, caseIds: [], trackedOrderCases: [] };
        }
        if (version === requestVersion.current)
          setTracking({
            id: account.id,
            caseIds: normalizeCaseIds(account.caseIds),
            trackedOrderCases: normalizeTrackedOrderCases(
              account.trackedOrderCases,
            ),
          });
      } catch (error) {
        if (version === requestVersion.current)
          setTrackingError(
            error instanceof Error
              ? error.message
              : 'Unable to sync saved cases.',
          );
      }
    }, [api, session.user.email, session.user.name]);
    useEffect(() => {
      void reloadTracking();
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') void reloadTracking();
      });
      return () => {
        invalidateTracking();
        subscription.remove();
      };
    }, [reloadTracking, invalidateTracking]);
    const saveTracking = async (
      caseIds: string[],
      trackedOrderCases: Tracking['trackedOrderCases'],
    ) => {
      if (!tracking) throw new Error('Account tracking has not loaded.');
      requestVersion.current++;
      await api(
        '/api/users',
        { userId: tracking.id, caseIds, trackedOrderCases },
        'PATCH',
      );
      setTracking({ ...tracking, caseIds, trackedOrderCases });
    };
    const current = new URL(paths[paths.length - 1], appWebUrl.origin);
    const path = current.pathname;
    const home = path === '/' || path === '/home';
    let screen;
    if (home) screen = <Home navigate={navigate} />;
    else if (path === '/court-view') screen = <CourtScreen />;
    else if (path === '/history')
      screen = <HistoryScreen params={current.searchParams} />;
    else if (path === '/orders')
      screen = <OrdersScreen params={current.searchParams} />;
    else if (path.startsWith('/orders/'))
      screen = <JudgmentScreen params={current.searchParams} />;
    else if (path === '/status') screen = <StatusScreen />;
    else if (path === '/web-diary') screen = <DiaryScreen />;
    else if (path === '/cause-list') screen = <CauseListScreen />;
    else if (path === '/track-cases') screen = <TrackScreen />;
    else if (
      path === '/my-cases' ||
      path.startsWith('/my-cases/') ||
      path.startsWith('/case-profile/')
    )
      screen = <MyCasesScreen slug={path.split('/')[2]} />;
    else if (path === '/ai-chat') screen = <ChatScreen />;
    else if (path === '/notifications')
      screen = (
        <Page title="Notifications">
          <NotificationsContent />
        </Page>
      );
    else
      screen = (
        <Page title="Page unavailable">
          <Button title="Dashboard" onPress={() => navigate('/')} />
        </Page>
      );
    return (
      <WorkspaceContext.Provider
        value={{
          api,
          session,
          profile,
          tracking,
          trackingError,
          reloadTracking,
          saveTracking,
          navigate,
        }}
      >
        <View style={s.fill}>
          <Background home={home} />
          {!home && (
            <Pressable
              accessibilityLabel="Toggle navigation menu"
              onPress={() => setMenu(true)}
              style={styles.menuToggle}
            >
              <Icon path="M4 7h16M4 12h16M4 17h16" size={20} />
            </Pressable>
          )}
          <FontContext.Provider
            value={
              [
                '/ai-chat',
                '/my-cases',
                '/case-profile',
                '/track-cases',
                '/cause-list',
                '/status',
              ].some(route => path.startsWith(route)) ||
              path.startsWith('/orders/')
                ? 'Manrope'
                : 'system'
            }
          >
            <View key={paths[paths.length - 1]} style={{ flex: 1 }}>
              {screen}
            </View>
          </FontContext.Provider>
          {menu && (
            <BlurView
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              blurType="dark"
              blurAmount={4}
              blurRadius={4}
              overlayColor="transparent"
              reducedTransparencyFallbackColor="#020617"
            />
          )}
          <Modal
            visible={menu}
            transparent
            animationType="fade"
            onRequestClose={() => setMenu(false)}
          >
            <View style={styles.menuOverlay}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setMenu(false)}
                accessibilityLabel="Dismiss navigation"
              />
              <SafeAreaView style={styles.drawer}>
                <View style={styles.drawerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.navEyebrow}>NAVIGATION</Text>
                    <Text style={styles.navSubtitle}>
                      Court tools and case workspace
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Close navigation menu"
                    style={styles.closeMenu}
                    onPress={() => setMenu(false)}
                  >
                    <Icon path="M6 18L18 6M6 6l12 12" size={20} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.menuItems}>
                  <Text style={styles.liveBadge}>● Live</Text>
                  {[
                    {
                      path: '/',
                      title: 'Home',
                      icon: 'M3 11l9-8 9 8M5 10v10h14V10M9 20v-6h6v6',
                      border: '#94a3b833',
                      foreground: '#f1f5f9',
                      iconBackground: '#64748b1a',
                    },
                    ...[
                      '/court-view',
                      '/web-diary',
                      '/cause-list',
                      '/orders',
                      '/ai-chat',
                      '/my-cases',
                      '/track-cases',
                    ].map(route => {
                      const tile = tiles.find(item => item.path === route)!;
                      const [border, background, foreground] =
                        navigationColors[route];
                      return {
                        ...tile,
                        border: border + '33',
                        iconBackground: background + '1a',
                        foreground,
                      };
                    }),
                    {
                      path: '/notifications',
                      title: 'Alerts',
                      icon: 'M15 17h5l-2-3v-3a6 6 0 00-12 0v3l-2 3h5m0 0a3 3 0 006 0',
                      border: '#38bdf833',
                      foreground: '#bae6fd',
                      iconBackground: '#0ea5e91a',
                    },
                  ].map(item => (
                    <Pressable
                      key={item.path}
                      onPress={() => navigate(item.path)}
                      style={[
                        styles.menuItem,
                        { borderColor: item.border },
                        path === item.path && { backgroundColor: '#0f172acc' },
                      ]}
                    >
                      <View
                        style={[
                          styles.menuIcon,
                          {
                            borderColor: item.border,
                            backgroundColor: item.iconBackground,
                          },
                        ]}
                      >
                        <Icon
                          path={item.icon}
                          size={16}
                          color={item.foreground}
                        />
                      </View>
                      <Text style={styles.menuTitle}>{item.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </SafeAreaView>
            </View>
          </Modal>
        </View>
      </WorkspaceContext.Provider>
    );
  },
);

function Home({ navigate }: { navigate: (path: string) => void }) {
  const [height, setHeight] = useState(0);
  const { width } = useWindowDimensions();
  return (
    <View
      style={{ flex: 1 }}
      onLayout={event => setHeight(event.nativeEvent.layout.height)}
    >
      <ScrollView contentContainerStyle={[styles.home, { minHeight: height }]}>
        <View style={styles.grid}>
          {tiles.map(tile => (
            <HomeTile
              key={tile.path}
              tile={tile}
              width={(width - 32) / 2}
              height={Math.max(154, (height - 108) / 4)}
              onPress={() => navigate(tile.path)}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL(
              new URL('/support', appWebUrl.origin).toString(),
            )
          }
        >
          <Text style={styles.support}>Help & Support</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
function HomeTile({
  tile,
  width,
  height,
  onPress,
}: {
  tile: (typeof tiles)[number];
  width: number;
  height: number;
  onPress: () => void;
}) {
  const hover = useRef(new Animated.Value(0)).current;
  const transition = (value: number) =>
    Animated.timing(hover, {
      toValue: value,
      duration: 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  return (
    <Animated.View
      style={{
        width,
        minHeight: height,
        transform: [
          {
            translateY: hover.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -4],
            }),
          },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tile.title}
        onPress={onPress}
        onPressIn={() => transition(1)}
        onPressOut={() => transition(0)}
        onHoverIn={() => transition(1)}
        onHoverOut={() => transition(0)}
        style={[styles.tile, { borderColor: tile.border }]}
      >
        <TileSurface tile={tile} />
        <View
          style={[
            styles.icon,
            {
              borderColor: tile.iconBorder,
              backgroundColor: tile.iconBackground,
            },
          ]}
        >
          <Icon path={tile.icon} size={20} color={tile.foreground} />
        </View>
        <Text style={[styles.tileLabel, { color: tile.labelColor }]}>
          {tile.label}
        </Text>
        <Text style={styles.tileTitle}>{tile.title}</Text>
        <View style={{ flex: 1, minHeight: 8 }} />
        <Animated.View
          style={[
            styles.arrow,
            {
              borderColor: tile.arrowBorder,
              backgroundColor: tile.arrowBackground,
              transform: [
                {
                  translateX: hover.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 4],
                  }),
                },
              ],
            },
          ]}
        >
          <Icon path="M9 5l7 7-7 7" size={14} color={tile.foreground} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  menuToggle: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#33415599',
    backgroundColor: '#020617cc',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 18px 40px rgba(2,6,23,0.45)',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: '#0206178c',
    alignItems: 'flex-end',
  },
  drawer: {
    width: '96%',
    maxWidth: 384,
    flex: 1,
    backgroundColor: '#081127f2',
    borderLeftWidth: 1,
    borderColor: '#33415599',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#1e293bcc',
    gap: 8,
  },
  navEyebrow: {
    fontSize: 10,
    letterSpacing: 2.4,
    lineHeight: 15,
    color: '#64748b',
  },
  navSubtitle: { fontSize: 14, lineHeight: 20, marginTop: 4, color: '#94a3b8' },
  closeMenu: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#33415599',
    backgroundColor: '#02061780',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItems: { padding: 16, gap: 10 },
  liveBadge: {
    alignSelf: 'flex-start',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#34d3991a',
    backgroundColor: '#34d3990d',
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 11,
    color: '#a7f3d0cc',
    marginBottom: 6,
  },
  menuItem: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#02061766',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: '#f1f5f9',
    flexShrink: 1,
  },
  home: { flexGrow: 1, padding: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
    flex: 1,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    overflow: 'hidden',
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff26',
    backgroundColor: '#ffffff0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    marginTop: 12,
    fontSize: 9,
    letterSpacing: 1.62,
    lineHeight: 13.5,
    color: '#b8c6ce',
  },
  tileTitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 17.5,
    fontWeight: '600',
    color: '#f8fafc',
  },
  arrow: {
    marginTop: 'auto',
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffffff26',
    backgroundColor: '#ffffff0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  support: {
    textAlign: 'center',
    color: '#67e8f9cc',
    fontSize: 11,
    lineHeight: 20,
    paddingVertical: 16,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderBottomColor: '#1e293b',
    borderBottomWidth: 1,
  },
  spacer: { flex: 1 },
});
export default NativeWorkspace;
