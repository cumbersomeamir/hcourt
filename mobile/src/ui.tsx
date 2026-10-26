import { Text, FontContext, useFont } from './typography';
import {
  useContext,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from 'react';
import {
  ActivityIndicator,
  useWindowDimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useWorkspace } from './workspace';

export const colors = {
  background: '#081127',
  panel: '#0f172ab3',
  border: '#94a3b81f',
  text: '#f1f5f9',
  muted: '#94a3b8',
  cyan: '#67e8f9',
};
export type Option = { value: string; label: string };
export const benches: Option[] = [
  { value: 'lucknow', label: 'Lucknow Bench' },
  { value: 'allahabad', label: 'Allahabad Bench' },
];
export function Icon({
  path,
  size = 22,
  color = '#e2e8f0',
}: {
  path: string;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function Gradient({ from, to }: { from: string; to: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="tile" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tile)" />
      </Svg>
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled,
  quiet,
  style,
  textStyle,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quiet,
        style,
        pressed && { opacity: 0.8 },
        disabled && s.disabled,
      ]}
    >
      <Text style={[s.buttonText, textStyle]}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const fontFamily = useFont();
  return (
    <View style={s.field}>
      {!!label && <Text style={s.label}>{label}</Text>}
      <TextInput
        placeholderTextColor="#64748b"
        {...props}
        style={[s.input, { fontFamily }, props.style]}
      />
    </View>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  plain = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  plain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const window = useWindowDimensions();
  const [anchor, setAnchor] = useState({
    x: 16,
    y: 80,
    width: 300,
    height: 42,
  });
  const listHeight = Math.min(
    320,
    window.height * 0.5,
    options.length * 40 + (options.length > 20 ? 52 : 0) + 2,
  );
  const top =
    anchor.y + anchor.height + listHeight + 8 <= window.height
      ? anchor.y + anchor.height + 4
      : Math.max(16, anchor.y - listHeight - 4);
  return (
    <View style={s.field}>
      <Text
        style={
          plain
            ? {
                fontSize: 11,
                lineHeight: 16.5,
                letterSpacing: 2.64,
                color: '#64748b',
              }
            : s.label
        }
      >
        {label}
      </Text>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          setSearch('');
          trigger.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y, width, height });
            setOpen(true);
          });
        }}
        style={[
          s.input,
          { flexDirection: 'row', alignItems: 'center', gap: 8 },
          plain && {
            borderWidth: 0,
            backgroundColor: 'transparent',
            padding: 0,
            paddingHorizontal: 0,
            paddingVertical: 0,
            minHeight: 20,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[s.text, { flex: 1 }, plain && { fontWeight: '600' }]}
        >
          {options.find(item => item.value === value)?.label || 'Select…'}
        </Text>
        <Icon path="M6 9l6 6 6-6" size={14} color="#cbd5e1" />
      </Pressable>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close options"
          onPress={() => setOpen(false)}
        />
        <View
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            top,
            left: Math.max(
              8,
              Math.min(anchor.x, window.width - anchor.width - 8),
            ),
            width: Math.min(anchor.width, window.width - 16),
            maxHeight: listHeight,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#475569',
            backgroundColor: '#0f172a',
            overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          }}
        >
          {options.length > 20 && (
            <View style={{ padding: 6 }}>
              <Field
                label=""
                placeholder="Search"
                value={search}
                onChangeText={setSearch}
                style={{ minHeight: 38, paddingVertical: 6 }}
              />
            </View>
          )}
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={options.filter(item =>
              item.label.toLowerCase().includes(search.toLowerCase()),
            )}
            keyExtractor={item => item.value}
            style={{ flexGrow: 0 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: item.value === value }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor:
                    pressed || item.value === value ? '#164e63' : 'transparent',
                })}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
              >
                <Text numberOfLines={2} style={s.text}>
                  {item.label}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[s.muted, { padding: 12 }]}>No matches</Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Page({
  title,
  eyebrow,
  description,
  header,
  bare = false,
  contentStyle,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  header?: ReactNode;
  bare?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const family = useContext(FontContext);
  const { navigate } = useWorkspace();
  const classic = family === 'system';
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        s.page,
        classic && { paddingHorizontal: 12, paddingTop: 24 },
        contentStyle,
      ]}
    >
      {!bare && (
        <>
          <Pressable
            onPress={() => navigate(classic ? '/court-view' : '/')}
            style={classic ? s.backLink : s.dashboardLink}
          >
            <Text style={classic ? s.backText : s.dashboardText}>
              {classic ? '‹  Back to Court View' : '←  DASHBOARD'}
            </Text>
          </Pressable>
          <View style={classic ? s.classicHeader : s.workspaceHeader}>
            <Text style={[s.eyebrow, classic && s.classicEyebrow]}>
              {eyebrow || 'Courtlens WORKSPACE'}
            </Text>
            <Text
              style={[
                s.title,
                { fontFamily: classic ? 'system' : 'Cinzel' },
                classic && s.classicTitle,
              ]}
            >
              {title}
            </Text>
            {!!description && (
              <Text style={classic ? s.muted : s.description}>
                {description}
              </Text>
            )}
            {header}
          </View>
        </>
      )}
      {children}
    </ScrollView>
  );
}
export function Feedback({ error, busy }: { error?: string; busy?: boolean }) {
  return (
    <>
      {busy && <ActivityIndicator style={s.space} color={colors.cyan} />}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </>
  );
}
export type Challenge = {
  challengeId: string;
  mimeType: string;
  imageBase64: string;
  prompt: string;
};
export function Captcha({
  challenge,
  value,
  onChange,
  submit,
  refresh,
  busy,
}: {
  challenge: Challenge;
  value: string;
  onChange: (value: string) => void;
  submit: () => void;
  refresh?: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <Text style={s.text}>{challenge.prompt}</Text>
      <Image
        accessibilityLabel="Court captcha"
        source={{
          uri: `data:${challenge.mimeType};base64,${challenge.imageBase64}`,
        }}
        style={s.captcha}
        resizeMode="contain"
      />
      <Field
        label="Captcha"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
      />
      <Button
        title="Submit Captcha"
        onPress={submit}
        disabled={busy || !value.trim()}
      />
      {refresh && (
        <Button title="New Captcha" onPress={refresh} disabled={busy} quiet />
      )}
    </Card>
  );
}
export function Records({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <>
      {rows.map((row, index) => (
        <Card key={index}>
          {Object.entries(row)
            .filter(([, value]) => value !== null && value !== '')
            .map(([key, value]) => (
              <View key={key} style={s.space}>
                <Text style={s.label}>{key.replace(/_/g, ' ')}</Text>
                <Text selectable style={s.text}>
                  {typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
                </Text>
              </View>
            ))}
        </Card>
      ))}
    </>
  );
}
export const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  page: { padding: 16, paddingTop: 64, paddingBottom: 64, gap: 20 },
  backLink: { alignSelf: 'flex-start', marginBottom: -8, paddingRight: 48 },
  backText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#22d3ee',
  },
  dashboardLink: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#33415566',
    backgroundColor: '#02061759',
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: -4,
  },
  dashboardText: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.16,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  workspaceHeader: { gap: 12, marginBottom: 12 },
  classicHeader: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#0f172a80',
    borderWidth: 1,
    borderColor: '#94a3b814',
    gap: 0,
    boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
  },
  classicEyebrow: {
    fontSize: 11,
    lineHeight: 16.5,
    letterSpacing: 2.75,
    color: '#fbbf24cc',
    fontWeight: '500',
    marginBottom: 8,
  },
  classicTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 4,
  },
  description: { fontSize: 14, lineHeight: 20, color: '#cbd5e1' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 0.75,
    fontWeight: '600',
  },
  eyebrow: {
    color: '#67e8f9bf',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 3.36,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '700',
    flexShrink: 1,
  },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  accent: { color: colors.cyan },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 16,
    gap: 12,
    boxShadow:
      '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  field: { gap: 6, flexGrow: 1 },
  label: { color: '#94a3b8', fontSize: 12, lineHeight: 16, fontWeight: '500' },
  input: {
    backgroundColor: '#0f172a99',
    borderColor: '#47556940',
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#0ea5e926',
    borderColor: '#38bdf840',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quiet: { backgroundColor: '#33415566', borderColor: '#47556933' },
  buttonText: {
    color: '#7dd3fc',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  disabled: { opacity: 0.45 },
  error: { color: '#fca5a5', fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  space: { marginVertical: 6 },
  empty: { paddingVertical: 28, alignItems: 'center', gap: 22 },
  option: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  captcha: {
    height: 80,
    width: 240,
    backgroundColor: 'white',
    maxWidth: '100%',
  },
});
