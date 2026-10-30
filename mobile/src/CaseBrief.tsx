import { StyleSheet, View } from 'react-native';
import { FontContext, Text } from './typography';

export default function CaseBrief({ text }: { text: string }) {
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`)/g).map((part, index) => {
    if (/^(\*\*|__)/.test(part)) return <Text key={index} style={styles.bold}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('*')) return <Text key={index} style={styles.emphasis}>{part.slice(1, -1)}</Text>;
    if (part.startsWith('`')) return <Text key={index} style={styles.bold}>{part.slice(1, -1)}</Text>;
    return part;
  });
  return <FontContext.Provider value="Manrope"><View style={styles.content}>
    {text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) return <View key={index} style={styles.divider} />;
      const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/) || line.match(/^\*\*([^*]+)\*\*:?$/);
      if (heading) return <View key={index} style={[styles.section, index === 0 && styles.firstSection]}>
        <Text accessibilityRole="header" selectable style={styles.heading}>{inline(heading[1])}</Text>
      </View>;
      const bullet = line.match(/^(?:([-*•])|(\d+[.)]))\s+(.+)$/);
      if (bullet) return <View key={index} style={styles.listRow}>
        <Text style={styles.marker}>{bullet[2] || '•'}</Text>
        <Text selectable style={[styles.body, styles.listText]}>{inline(bullet[3])}</Text>
      </View>;
      const quote = line.startsWith('> ');
      return <Text key={index} selectable style={[styles.body, quote && styles.quote]}>{inline(quote ? line.slice(2) : line)}</Text>;
    })}
  </View></FontContext.Provider>;
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  section: { marginTop: 12, paddingLeft: 12, paddingVertical: 10, borderLeftWidth: 3, borderLeftColor: '#38bdf8', backgroundColor: '#10243a', borderRadius: 6 },
  firstSection: { marginTop: 0 },
  heading: { color: '#bae6fd', fontSize: 16, lineHeight: 25, fontWeight: '700' },
  body: { color: '#cbd5e1', fontSize: 14, lineHeight: 24 },
  bold: { fontWeight: '700', color: '#f8fafc' },
  emphasis: { fontStyle: 'italic', color: '#e2e8f0' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  marker: { minWidth: 24, color: '#7dd3fc', fontSize: 14, lineHeight: 24, fontWeight: '600' },
  listText: { flex: 1, flexShrink: 1 },
  divider: { height: 1, backgroundColor: '#23445d', marginVertical: 4 },
  quote: { borderLeftWidth: 2, borderLeftColor: '#475569', paddingLeft: 12, color: '#94a3b8' },
});
