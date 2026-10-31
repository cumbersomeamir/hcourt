import { Text } from '../typography';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  type CourtCase,
  type CourtHistoryRecord,
  type Notification,
  type TrackedOrderCase,
} from '../court';
import {
  buildSavedCaseProfiles,
  decodeCaseProfileSlug,
  encodeCaseProfileSlug,
  getTrackedOrderDisplay,
} from '../caseProfiles';
import { useAction, useRemote, useWorkspace } from '../workspace';
import {
  benches,
  Button,
  Card,
  Feedback,
  Field,
  Page,
  Select,
  s,
  type Option,
} from '../ui';
import { saveBase64File } from '../downloads';

export function CourtCard({
  court,
  date,
  bench = 'lucknow',
}: {
  court: CourtCase;
  date?: string;
  bench?: string;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
      <Card style={{ opacity: court.isInSession ? 1 : 0.6, gap: 12 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={[s.row, { gap: 10 }]}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: court.isInSession ? '#22d3ee33' : '#47556933',
                backgroundColor: court.isInSession ? '#06b6d426' : '#33415566',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: court.isInSession ? '#67e8f9' : '#64748b',
                }}
              >
                {court.courtNo}
              </Text>
            </View>
            <View>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  fontWeight: '600',
                  color: '#e2e8f0',
                }}
              >
                Court {court.courtNo}
              </Text>
              {!court.isInSession && (
                <Text
                  style={{ color: '#64748b', fontSize: 11, lineHeight: 16.5 }}
                >
                  Not in session
                </Text>
              )}
            </View>
          </View>
          <View style={s.row}>
            {date && (
              <Button
                title="History"
                quiet
                style={{
                  minHeight: 26,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                }}
                textStyle={{
                  color: '#cbd5e1',
                  fontSize: 11,
                  lineHeight: 16.5,
                  fontWeight: '500',
                }}
                onPress={() => setHistoryOpen(true)}
              />
            )}
            {!!court.progress && (
              <Text
                style={{
                  fontSize: 11,
                  lineHeight: 16.5,
                  fontWeight: '600',
                  color: '#67e8f9',
                  backgroundColor: '#06b6d426',
                  borderColor: '#22d3ee33',
                  borderWidth: 1,
                  borderRadius: 99,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                {court.progress}
              </Text>
            )}
          </View>
        </View>
        {court.isInSession && (
          <>
            {(!!court.serialNo || !!court.list) && (
              <Text style={s.muted}>
                Serial: {court.serialNo || '—'} List: {court.list || '—'}
              </Text>
            )}
            {court.caseDetails && (
              <View
                style={{
                  borderTopWidth: 1,
                  borderColor: '#33415580',
                  paddingTop: 10,
                  gap: 4,
                }}
              >
                <Text
                  selectable
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: '600',
                    color: '#f1f5f9',
                  }}
                >
                  {court.caseDetails.caseNumber}
                </Text>
                <Text numberOfLines={2} style={s.muted}>
                  {court.caseDetails.title}
                </Text>
                {!!court.caseDetails.petitionerCounsels.length && (
                  <Text style={s.muted}>
                    Petitioner:{' '}
                    {court.caseDetails.petitionerCounsels.join(', ')}
                  </Text>
                )}
                {!!court.caseDetails.respondentCounsels.length && (
                  <Text style={s.muted}>
                    Respondent:{' '}
                    {court.caseDetails.respondentCounsels.join(', ')}
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </Card>
      {historyOpen && date && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setHistoryOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: 16,
              backgroundColor: '#020617e6',
            }}
          >
            <Pressable
              accessibilityLabel="Dismiss history"
              style={StyleSheet.absoluteFill}
              onPress={() => setHistoryOpen(false)}
            />
            <View
              accessibilityViewIsModal
              style={{
                maxHeight: '85%',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#334155',
                backgroundColor: '#081127',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 20,
                  borderBottomWidth: 1,
                  borderColor: '#33415566',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.heading}>Court {court.courtNo} History</Text>
                  <Text style={s.muted}>Date: {date}</Text>
                </View>
                <Button
                  title="Close"
                  quiet
                  onPress={() => setHistoryOpen(false)}
                />
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <HistoryContent
                  params={
                    new URLSearchParams({ courtNo: court.courtNo, date, bench })
                  }
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

export function CourtScreen() {
  const { tracking } = useWorkspace();
  const [bench, setBench] = useState('lucknow');
  const [query, setQuery] = useState('');
  const [tracked, setTracked] = useState(false);
  const profiles = buildSavedCaseProfiles(
    tracking?.caseIds,
    tracking?.trackedOrderCases,
  );
  const ids = profiles.flatMap(item => item.effectiveCaseIds);
  const remote = useRemote<{
    schedule: { courts: CourtCase[]; date: string; lastUpdated: string };
  }>(
    `/api/schedule/latest?bench=${bench}${
      tracked && ids.length
        ? `&caseIds=${encodeURIComponent(ids.join(','))}`
        : ''
    }`,
    30000,
  );
  const alertParams = new URLSearchParams({ unreadOnly: 'true', limit: '1' });
  if (tracking?.id) alertParams.set('userId', tracking.id);
  if (ids.length) alertParams.set('caseIds', ids.join(','));
  const orderKeys = profiles.flatMap(item => item.orderTrackingKeys);
  if (orderKeys.length)
    alertParams.set('orderTrackingKeys', orderKeys.join(','));
  const alerts = useRemote<{ count: number }>(
    `/api/notifications?${alertParams.toString()}`,
    10000,
  );
  const courts = (remote.data?.schedule.courts || []).filter(
    court =>
      (!tracked || ids.length > 0) &&
      JSON.stringify(court).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Page title="Court View" bare contentStyle={{ paddingTop: 24 }}>
      <Card
        style={{
          borderRadius: 24,
          padding: 20,
          backgroundColor: '#0f172a80',
          gap: 12,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            lineHeight: 16.5,
            letterSpacing: 3.52,
            color: '#fcd34dd9',
          }}
        >
          COURT VIEW
        </Text>
        <Text
          style={{
            fontSize: 30,
            lineHeight: 31.5,
            letterSpacing: -0.9,
            color: '#f8fafc',
            fontWeight: '700',
          }}
        >
          {bench === 'lucknow' ? 'Lucknow Bench' : 'Allahabad Bench'} Court View
        </Text>
        <Text
          style={[s.muted, { fontSize: 14, lineHeight: 20, marginBottom: 12 }]}
        >
          Live data source:{' '}
          {bench === 'lucknow' ? 'Lucknow Bench' : 'Allahabad Bench'} court
          activity board
        </Text>
        <Card
          style={{ backgroundColor: '#02061766', borderColor: '#33415573' }}
        >
          <Select
            label="COURT BENCH"
            plain
            value={bench}
            options={benches}
            onChange={setBench}
          />
        </Card>
        <Card
          style={{ backgroundColor: '#02061766', borderColor: '#33415573' }}
        >
          <Text style={s.label}>LIVE UPDATE</Text>
          <Text style={{ fontSize: 14, color: '#6ee7b7', fontWeight: '600' }}>
            {remote.busy
              ? 'Checking court server...'
              : remote.data
              ? 'Court data updated'
              : 'Waiting for court data'}
          </Text>
          {remote.data && (
            <Text style={s.muted}>
              {new Date(remote.data.schedule.lastUpdated).toLocaleTimeString()}
            </Text>
          )}
        </Card>
        <Card
          style={{ backgroundColor: '#02061766', borderColor: '#33415573' }}
        >
          <Text style={s.label}>TRACKED MATTERS</Text>
          <Text style={s.text}>
            {(tracking?.caseIds.length || 0) +
              (tracking?.trackedOrderCases.length || 0)}
          </Text>
        </Card>
        <Card
          style={{ backgroundColor: '#02061766', borderColor: '#33415573' }}
        >
          <Text style={s.label}>UNREAD ALERTS</Text>
          <Text style={s.text}>{alerts.data?.count || 0}</Text>
        </Card>
      </Card>
      <Field
        label=""
        placeholder="Search by court number, case number, title, counsel..."
        value={query}
        onChangeText={setQuery}
      />
      <View style={s.row}>
        <Button
          title={tracked ? 'Tracked cases ✓' : 'All courts'}
          onPress={() => setTracked(!tracked)}
        />
        <Button
          title="Refresh"
          onPress={() => void remote.reload()}
          disabled={remote.busy}
          quiet
        />
      </View>
      <Feedback {...remote} />
      {remote.data && (
        <Text style={s.muted}>
          Display board date: {remote.data.schedule.date.split('-').reverse().join('-')} · Last checked{' '}
          {new Date(remote.data.schedule.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
        </Text>
      )}
      {courts.map(court => (
        <CourtCard
          key={court.courtNo}
          court={court}
          date={remote.data?.schedule.date}
          bench={bench}
        />
      ))}
      {!remote.busy && !remote.error && !courts.length && (
        <Card>
          <Text style={s.muted}>No matching courts.</Text>
        </Card>
      )}
    </Page>
  );
}
export function HistoryScreen({ params }: { params: URLSearchParams }) {
  return (
    <Page title={`Court ${params.get('courtNo') || ''} History`}>
      <Text style={s.muted}>{params.get('date')}</Text>
      <HistoryContent params={params} />
    </Page>
  );
}
function HistoryContent({ params }: { params: URLSearchParams }) {
  const [date, setDate] = useState(params.get('date') || '');
  const [selectedDate, setSelectedDate] = useState(date);
  const query = new URLSearchParams(params.toString());
  query.set('date', selectedDate);
  query.set('limit', '500');
  const remote = useRemote<{ history: CourtHistoryRecord[] }>(
    `/api/court-history?${query.toString()}`, 60000,
  );
  return (
    <>
      <Field label="History date (YYYY-MM-DD, IST)" value={date} onChangeText={setDate} autoCapitalize="none" />
      <Button title="Show history" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date) || remote.busy} onPress={() => { if (date === selectedDate) void remote.reload(); else setSelectedDate(date); }} />
      <Feedback {...remote} />
      {remote.data?.history.map((item, index) => (
        <View key={item._id || index} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: '#a5f3fc',
                backgroundColor: '#22d3ee1a',
                borderColor: '#22d3ee4d',
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                fontVariant: ['tabular-nums'],
              }}
            >
              {new Date(item.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
            </Text>
            {(item.state || item).isInSession && (
              <>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: '#fde68a',
                    backgroundColor: '#fbbf241a',
                    borderColor: '#fbbf244d',
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  Serial: {(item.state || item).serialNo || '—'}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: '#ddd6fe',
                    backgroundColor: '#a78bfa1a',
                    borderColor: '#a78bfa4d',
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  Case type:{' '}
                  {(item.state || item).caseDetails?.caseNumber?.split(
                    '/',
                  )[0] || '—'}
                </Text>
              </>
            )}
          </View>
          <CourtCard court={item.state || item} />
        </View>
      ))}
      {remote.data?.history.length === 0 && (
        <Text style={s.muted}>No history for this date.</Text>
      )}
    </>
  );
}
export function TrackScreen() {
  const { tracking, trackingError, reloadTracking, saveTracking } =
    useWorkspace();
  const action = useAction();
  const [caseId, setCaseId] = useState('');
  const [city, setCity] = useState('lucknow');
  const [caseType, setCaseType] = useState('');
  const [caseNo, setCaseNo] = useState('');
  const [caseYear, setCaseYear] = useState(String(new Date().getFullYear()));
  const types = useRemote<{ types: Option[] }>(
    `/api/orders/case-types?city=${city}`,
  );
  const change = (ids: string[], orders: TrackedOrderCase[]) =>
    action.run(() => saveTracking(ids, orders));
  const addCase = () =>
    action.run(async () => {
      const id = caseId.trim().toUpperCase();
      if (!/^[A-Z]+\/[0-9]+\/[0-9]+$/.test(id))
        throw new Error('Enter a case ID such as WRIC/123/2026.');
      if (!tracking) throw new Error('Wait for account tracking to load.');
      await saveTracking(
        [...new Set([...tracking.caseIds, id])],
        tracking.trackedOrderCases,
      );
      setCaseId('');
    });
  const addOrder = () =>
    action.run(async () => {
      if (!tracking) throw new Error('Wait for account tracking to load.');
      if (!caseType || !/^\d+$/.test(caseNo) || !/^\d{4}$/.test(caseYear))
        throw new Error(
          'Select case type, case number, and a four-digit year.',
        );
      const order: TrackedOrderCase = {
        city: city as TrackedOrderCase['city'],
        caseType,
        caseTypeLabel: types.data?.types.find(item => item.value === caseType)
          ?.label,
        caseNo,
        caseYear,
        trackingKey: `${city}|${caseType}|${caseNo}|${caseYear}`,
      };
      await saveTracking(tracking.caseIds, [
        ...tracking.trackedOrderCases.filter(
          item => item.trackingKey !== order.trackingKey,
        ),
        order,
      ]);
      setCaseNo('');
    });
  return (
    <Page
      title="Track Your Cases"
      eyebrow="TRACKING WORKSPACE"
      description="Manage schedule watchlists and order monitoring in one place."
    >
      <Metric
        title="TRACKED ITEMS"
        value={
          (tracking?.caseIds.length || 0) +
          (tracking?.trackedOrderCases.length || 0)
        }
        detail={`${tracking?.caseIds.length || 0} schedule case IDs and ${
          tracking?.trackedOrderCases.length || 0
        } order watchers`}
        hue="emerald"
      />
      <Card
        style={{ borderRadius: 24, padding: 20, backgroundColor: '#0f172a80' }}
      >
        <Text style={s.label}>WATCHLIST SETUP</Text>
        <Text style={[s.heading, { fontSize: 20 }]}>
          Add or update the cases you want monitored
        </Text>
        <Text style={s.description}>
          Schedule tracking filters the live court board. Order tracking watches
          for new order or judgment entries for the case you save.
        </Text>
        <Text
          style={{
            color: '#cffafed9',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: '#22d3ee33',
            backgroundColor: '#06b6d41a',
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          Changes save automatically as you add or remove tracked cases.
        </Text>
        <Feedback
          busy={action.busy || (!tracking && !trackingError)}
          error={action.error || trackingError}
        />
        {!!trackingError && (
          <Button
            title="Retry account sync"
            onPress={() => void reloadTracking()}
          />
        )}
        <Card>
          <Text style={s.eyebrow}>SCHEDULE TRACKING</Text>
          <Text style={s.heading}>Track by Case ID</Text>
          <Text style={s.description}>
            Use the exact court case identifier, such as WRIC/11985/2025.
          </Text>
          <Field
            label="Case ID"
            value={caseId}
            onChangeText={setCaseId}
            placeholder="WRIC/123/2026"
            autoCapitalize="characters"
          />
          <Button
            title="Add Case"
            disabled={action.busy || !tracking}
            onPress={addCase}
          />
          {tracking?.caseIds.map(id => (
            <View key={id} style={s.row}>
              <Text style={s.text}>{id}</Text>
              <Button
                title="Remove"
                quiet
                disabled={action.busy}
                onPress={() =>
                  void change(
                    tracking.caseIds.filter(item => item !== id),
                    tracking.trackedOrderCases,
                  )
                }
              />
            </View>
          ))}
        </Card>
        <Card>
          <Text style={s.eyebrow}>ORDER TRACKING</Text>
          <Text style={s.heading}>Track Orders & Judgments</Text>
          <Select
            label="Bench"
            value={city}
            options={benches}
            onChange={value => {
              setCity(value);
              setCaseType('');
            }}
          />
          <Feedback {...types} />
          <Select
            label="Case Type"
            value={caseType}
            options={types.data?.types || []}
            onChange={setCaseType}
          />
          <Field
            label="Case Number"
            value={caseNo}
            onChangeText={setCaseNo}
            keyboardType="number-pad"
          />
          <Field
            label="Year"
            value={caseYear}
            onChangeText={setCaseYear}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Button
            title="Track Orders"
            onPress={addOrder}
            disabled={action.busy || !tracking || types.busy}
          />
          {tracking?.trackedOrderCases.map(order => (
            <Card key={order.trackingKey}>
              <Text style={s.text}>{getTrackedOrderDisplay(order)}</Text>
              <Text style={s.muted}>{order.city} Bench</Text>
              <Button
                title="Remove"
                quiet
                disabled={action.busy}
                onPress={() =>
                  void change(
                    tracking.caseIds,
                    tracking.trackedOrderCases.filter(
                      item => item.trackingKey !== order.trackingKey,
                    ),
                  )
                }
              />
            </Card>
          ))}
        </Card>
      </Card>
    </Page>
  );
}
export function MyCasesScreen({ slug }: { slug?: string }) {
  const { tracking, trackingError, reloadTracking, navigate } = useWorkspace();
  const profiles = useMemo(
    () =>
      buildSavedCaseProfiles(tracking?.caseIds, tracking?.trackedOrderCases),
    [tracking],
  );
  const selected = slug
    ? profiles.find(item => item.profileId === decodeCaseProfileSlug(slug))
    : null;
  const ids = (selected ? [selected] : profiles).flatMap(
    item => item.effectiveCaseIds,
  );
  const schedule = useRemote<{
    schedule: { courts: CourtCase[]; date: string };
  }>(
    ids.length
      ? `/api/schedule/latest?caseIds=${encodeURIComponent(ids.join(','))}`
      : null,
  );
  const alertIds = profiles.flatMap(item => item.effectiveCaseIds);
  const alertKeys = profiles.flatMap(item => item.orderTrackingKeys);
  const alertParams = new URLSearchParams({ limit: '100' });
  if (alertIds.length) alertParams.set('caseIds', alertIds.join(','));
  if (alertKeys.length)
    alertParams.set('orderTrackingKeys', alertKeys.join(','));
  const alerts = useRemote<{ notifications: Notification[] }>(
    alertIds.length || alertKeys.length
      ? `/api/notifications?${alertParams.toString()}`
      : null,
  );
  const liveCount = profiles.filter(item =>
    schedule.data?.schedule.courts.some(court =>
      item.effectiveCaseIds.includes(
        court.caseDetails?.caseNumber.toUpperCase() || '',
      ),
    ),
  ).length;
  return (
    <Page
      title={slug ? 'Case Profile' : 'My Cases'}
      eyebrow="CASE WORKSPACE"
      description={
        slug
          ? undefined
          : 'A case-centric view of the matters already saved in tracking, with live board context and direct access to each case profile.'
      }
    >
      <Feedback
        busy={!tracking && !trackingError}
        error={trackingError || schedule.error}
      />
      {!!trackingError && (
        <Button title="Retry" onPress={() => void reloadTracking()} />
      )}
      {!slug && (
        <Button
          title="Manage Tracking"
          style={{
            alignSelf: 'flex-start',
            borderRadius: 16,
            backgroundColor: '#10b98126',
            borderColor: '#34d39940',
            paddingHorizontal: 20,
            paddingVertical: 12,
            marginBottom: 12,
          }}
          textStyle={{ color: '#d1fae5' }}
          onPress={() => navigate('/track-cases')}
        />
      )}
      {!slug && (
        <>
          <Metric
            title="SAVED CASES"
            value={profiles.length}
            detail="Built from your current tracking list."
            hue="cyan"
          />
          <Metric
            title="ON LIVE BOARD"
            value={liveCount}
            detail="Cases currently matched on the latest Lucknow court board."
            hue="emerald"
          />
          <Metric
            title="RECENT ALERTS"
            value={alerts.data?.notifications.length || 0}
            detail={`${
              alerts.data?.notifications.filter(item => !item.read).length || 0
            } unread in the latest fetched activity set.`}
            hue="amber"
          />
        </>
      )}
      {tracking && !(slug ? (selected ? [selected] : []) : profiles).length && (
        <Card>
          {slug ? (
            <Text style={s.muted}>Case profile not found.</Text>
          ) : (
            <View style={[s.empty, { padding: 24 }]}>
              <Text style={s.eyebrow}>NO CASES YET</Text>
              <Text
                style={[
                  s.heading,
                  { fontSize: 24, lineHeight: 32, textAlign: 'center' },
                ]}
              >
                Your case workspace is empty
              </Text>
              <Text style={s.muted}>
                Start by adding cases in tracking. Once they are saved, they
                will appear here as case profiles.
              </Text>
              <Button
                title="Open Track Cases"
                onPress={() => navigate('/track-cases')}
              />
            </View>
          )}
        </Card>
      )}
      {(slug ? (selected ? [selected] : []) : profiles).map(item => {
        const court = schedule.data?.schedule.courts.find(entry =>
          item.effectiveCaseIds.includes(
            entry.caseDetails?.caseNumber.toUpperCase() || '',
          ),
        );
        return (
          <Card key={item.profileId}>
            <Text style={s.heading}>
              {court?.caseDetails?.title ||
                item.canonicalCaseId ||
                getTrackedOrderDisplay(item.orderTrackers[0])}
            </Text>
            <Text style={s.muted}>{item.canonicalCaseId}</Text>
            <Text style={s.accent}>
              {court
                ? `On live board · Court ${court.courtNo}`
                : 'Not currently on live board'}
            </Text>
            <View style={s.row}>
              {item.hasScheduleTracking && (
                <Text style={s.muted}>Schedule tracking</Text>
              )}
              {item.hasOrderTracking && (
                <Text style={s.muted}>Order tracking</Text>
              )}
            </View>
            {!slug && (
              <Button
                title="Open Case Profile →"
                onPress={() =>
                  navigate(`/my-cases/${encodeCaseProfileSlug(item.profileId)}`)
                }
              />
            )}
            {slug && (
              <>
                {court && (
                  <CourtCard
                    court={court}
                    date={schedule.data?.schedule.date}
                  />
                )}
                {item.orderTrackers.map(order => (
                  <Button
                    key={order.trackingKey}
                    title={`Orders · ${getTrackedOrderDisplay(order)}`}
                    onPress={() =>
                      navigate(
                        `/orders?${new URLSearchParams({
                          city: order.city,
                          caseType: order.caseType,
                          caseNo: order.caseNo,
                          caseYear: order.caseYear,
                        }).toString()}`,
                      )
                    }
                  />
                ))}
                <Button
                  title="Manage Tracking"
                  onPress={() => navigate('/track-cases')}
                />
                <NotificationsContent
                  caseIds={item.effectiveCaseIds}
                  orderKeys={item.orderTrackingKeys}
                />
              </>
            )}
          </Card>
        );
      })}
    </Page>
  );
}
export function NotificationsContent({
  caseIds,
  orderKeys,
}: {
  caseIds?: string[];
  orderKeys?: string[];
}) {
  const { api, tracking } = useWorkspace();
  const action = useAction();
  const params = new URLSearchParams({ limit: '100' });
  if (caseIds?.length) params.set('caseIds', caseIds.join(','));
  if (orderKeys?.length) params.set('orderTrackingKeys', orderKeys.join(','));
  if (!caseIds && tracking?.id) params.set('userId', tracking.id);
  const remote = useRemote<{ notifications: Notification[] }>(
    tracking ? `/api/notifications?${params.toString()}` : null,
  );
  const markRead = () =>
    action.run(async () => {
      const notificationIds =
        remote.data?.notifications
          .filter(item => !item.read && item._id)
          .map(item => item._id) || [];
      if (notificationIds.length)
        await api(
          '/api/notifications',
          { notificationIds, read: true },
          'PATCH',
        );
      await remote.reload();
    });
  return (
    <>
      <View style={s.row}>
        <Text style={s.heading}>Recent Alerts</Text>
        <Button
          title="Mark all read"
          onPress={markRead}
          disabled={action.busy}
          quiet
        />
        <Button title="Refresh" onPress={() => void remote.reload()} quiet />
      </View>
      <Feedback
        busy={remote.busy || action.busy}
        error={remote.error || action.error}
      />
      {remote.data?.notifications.map((item, index) => (
        <Card key={item._id || index}>
          <Text style={s.heading}>
            {item.read ? '' : '● '}
            {item.title}
          </Text>
          <Text style={s.text}>{item.message}</Text>
          <Text style={s.muted}>
            {new Date(item.timestamp).toLocaleString()}
          </Text>
          {item.orderJudgment && (
            <Button
              title="Download Judgment"
              disabled={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const result = await api<{
                    result: {
                      filename: string;
                      base64: string;
                      mimeType?: string;
                    };
                  }>('/api/orders/judgment', {
                    viewUrl: item.orderJudgment!.viewUrl,
                    date: item.orderJudgment!.date,
                  });
                  await saveBase64File(
                    result.result.filename,
                    result.result.mimeType || 'application/pdf',
                    result.result.base64,
                  );
                })
              }
            />
          )}
        </Card>
      ))}
      {remote.data?.notifications.length === 0 && (
        <Text style={s.muted}>No recent alerts.</Text>
      )}
    </>
  );
}

function Metric({
  title,
  value,
  detail,
  hue,
}: {
  title: string;
  value: number;
  detail: string;
  hue: 'cyan' | 'emerald' | 'amber';
}) {
  const palette = {
    cyan: ['#22d3ee', '#06b6d4', '#a5f3fc', '#cffafe'],
    emerald: ['#34d399', '#10b981', '#a7f3d0', '#d1fae5'],
    amber: ['#fbbf24', '#f59e0b', '#fde68a', '#fef3c7'],
  }[hue];
  return (
    <Card
      style={{
        borderRadius: 24,
        padding: 20,
        borderColor: palette[0] + '33',
        backgroundColor: palette[1] + '1a',
        gap: 8,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          lineHeight: 16.5,
          letterSpacing: 2.64,
          color: palette[2] + 'b3',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 30,
          lineHeight: 36,
          fontWeight: '600',
          color: palette[3],
          marginTop: 4,
        }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: palette[3] + 'b3' }}>
        {detail}
      </Text>
    </Card>
  );
}
