import { View } from 'react-native';
import { Text } from './typography';

export default function CaseBrief({ text }: { text: string }) {
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**')
    ? <Text key={index} style={{ fontWeight: '700', color: '#f8fafc' }}>{part.slice(2, -2)}</Text> : part);
  return <View style={{ gap: 12 }}>
    {text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      const heading = line.match(/^#{1,6}\s+(.+)$/) || line.match(/^\*\*(.+)\*\*:?$/);
      if (heading) return <Text key={index} selectable style={{ marginTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#23445d', color: '#bae6fd', fontSize: 16, lineHeight: 24, fontWeight: '700' }}>{inline(heading[1])}</Text>;
      const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
      return <View key={index} style={{ flexDirection: 'row', gap: 10 }}>{bullet && <Text style={{ color: '#7dd3fc', lineHeight: 25 }}>•</Text>}<Text selectable style={{ flex: 1, color: '#cbd5e1', fontSize: 15, lineHeight: 25 }}>{inline(bullet ? bullet[1] : line)}</Text></View>;
    })}
  </View>;
}
