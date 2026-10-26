import { Text } from '../typography';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useAction, useRemote } from '../workspace';
import { benches, Button, Card, Feedback, Page, Select, s } from '../ui';

type DiaryEntry = {
  title: string;
  pdfLink?: string;
  date: string;
  allLinks?: Array<{ type: string; link: string }>;
};
export default function DiaryScreen() {
  const today = new Date();
  const [bench, setBench] = useState('allahabad');
  const [day, setDay] = useState(String(today.getDate()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const days = new Date(Number(year), Number(month), 0).getDate();
  const selectedDay = String(Math.min(Number(day), days));
  const remote = useRemote<{
    data: { notifications: DiaryEntry[] };
    meta?: { warning?: string };
  }>(
    `/api/web-diary?date=${selectedDay}&month=${month}&year=${year}&bench=${bench}`,
  );
  const action = useAction();
  const numbers = (count: number, start = 1) =>
    Array.from({ length: count }, (_, index) => ({
      value: String(index + start),
      label: String(index + start),
    }));
  return (
    <Page
      title="Daily Notifications & Cause Lists"
      eyebrow="WEB DIARY"
      description="High Court of Judicature at Allahabad"
    >
      <Card>
        <Select
          label="Court"
          value={bench}
          options={benches}
          onChange={setBench}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Select
              label="Day"
              value={selectedDay}
              options={numbers(days)}
              onChange={setDay}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              label="Month"
              value={month}
              options={numbers(12).map(option => ({
                ...option,
                label: new Date(
                  2026,
                  Number(option.value) - 1,
                  1,
                ).toLocaleString('en', { month: 'long' }),
              }))}
              onChange={setMonth}
            />
          </View>
        </View>
        <View style={{ width: '49%' }}>
          <Select
            label="Year"
            value={year}
            options={numbers(62, today.getFullYear() - 30)}
            onChange={setYear}
          />
        </View>
      </Card>
      <Feedback
        busy={remote.busy || action.busy}
        error={remote.error || action.error}
      />
      {!!remote.data?.meta?.warning && (
        <Text style={s.muted}>{remote.data.meta.warning}</Text>
      )}
      <Card>
        <Text style={s.heading}>
          {bench === 'lucknow' ? 'Lucknow' : 'Allahabad'} Bench notifications
          for {selectedDay}{' '}
          {new Date(Number(year), Number(month) - 1, 1).toLocaleString('en', {
            month: 'long',
          })}{' '}
          {year}
        </Text>
        {remote.data?.data.notifications.map((item, index) => (
          <Card
            key={index}
            style={{
              borderRadius: 12,
              borderColor: '#33415566',
              backgroundColor: '#1e293b4d',
              boxShadow: [],
            }}
          >
            <Text
              style={{
                fontSize: 14,
                lineHeight: 22.75,
                fontWeight: '600',
                color: '#f1f5f9',
              }}
            >
              {item.title}
            </Text>

            {(item.allLinks?.length
              ? item.allLinks
              : item.pdfLink
              ? [{ type: 'Open Document', link: item.pdfLink }]
              : []
            ).map(link => (
              <Button
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#f43f5e26',
                  borderColor: '#fb718540',
                  borderRadius: 8,
                  minHeight: 28,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                }}
                textStyle={{ color: '#fda4af', fontSize: 12, lineHeight: 16 }}
                key={link.link}
                title={link.type || 'Open Document'}
                onPress={() =>
                  void action.run(async () => {
                    if (!/^https?:\/\//i.test(link.link))
                      throw new Error('Document link is unavailable.');
                    await Linking.openURL(link.link);
                  })
                }
              />
            ))}
          </Card>
        ))}
        {!remote.busy &&
          !remote.error &&
          remote.data?.data.notifications.length === 0 && (
            <Card>
              <Text style={s.muted}>No notifications for this date.</Text>
            </Card>
          )}
      </Card>
    </Page>
  );
}
