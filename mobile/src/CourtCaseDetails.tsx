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
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 12,
        gap: 20,
      }}
    >
      {sections.map((section, index) => {
        const wide = section.columns.length > 2;
        const status = section.title === 'Case Status';
        const borderColor = status ? '#ef4444' : '#64748b';
        const backgroundColor = status ? '#fff9df' : section.title === 'Acts' ? '#edf9f6' : section.title === 'Listing History' ? '#f4fae9' : '#ffffff';
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
                        color: status ? '#d71920' : '#1e293b',
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
                color: status ? '#d71920' : '#1e293b',
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
