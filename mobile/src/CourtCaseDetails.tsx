import { ScrollView, View } from 'react-native';
import { Text } from './typography';

type Section = { title: string; columns: string[]; rows: string[][] };
export default function CourtCaseDetails({
  sections,
}: {
  sections: Section[];
}) {
  return (
    <View
      style={{
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 12,
        gap: 20,
      }}
    >
      {sections.map((section, index) => {
        const wide = section.columns.length > 2;
        const status = section.title === 'Case Status';
        const borderColor = status ? '#7f3944' : '#334155';
        const backgroundColor = status ? '#211a2a' : section.title === 'Acts' ? '#10252a' : section.title === 'Listing History' ? '#29251b' : '#0f172a';
        const table = (
          <View
            style={{
              borderLeftWidth: 1,
              borderTopWidth: 1,
              borderColor,
            }}
          >
            {(section.columns[0] === 'Particulars'
              ? section.rows
              : [section.columns, ...section.rows]
            ).map((row, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  backgroundColor,
                }}
              >
                {section.columns.map((_, j) => (
                  <View
                    key={j}
                    style={{
                      ...(wide
                        ? { width: 160 }
                        : {
                            flex:
                              section.columns[0] === 'Particulars' && j === 0
                                ? 0.8
                                : 1,
                          }),
                      borderRightWidth: 1,
                      borderBottomWidth: 1,
                      borderColor,
                      padding: 8,
                    }}
                  >
                    <Text
                      selectable
                      style={{
                        color: status ? '#fca5a5' : section.title === 'Listing History' ? '#fde68a' : section.title === 'Acts' ? '#bbf7d0' : '#e2e8f0',
                        fontSize: 12,
                        lineHeight: 18,
                        fontWeight: (
                          section.columns[0] === 'Particulars'
                            ? j === 0
                            : i === 0
                        )
                          ? '600'
                          : '400',
                      }}
                    >
                      {row[j] || '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
        return (
          <View key={`${section.title}-${index}`} style={{ gap: 8 }}>
            <Text
              style={{
                color: status ? '#fca5a5' : section.title === 'Listing History' ? '#fde68a' : section.title === 'Acts' ? '#bbf7d0' : '#e2e8f0',
                textAlign: 'center',
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              {section.title}
            </Text>
            {wide ? <ScrollView horizontal>{table}</ScrollView> : table}
          </View>
        );
      })}
    </View>
  );
}
