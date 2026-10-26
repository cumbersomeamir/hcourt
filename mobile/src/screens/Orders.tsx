import { Text } from '../typography';
import { useState } from 'react';
import { View } from 'react-native';
import { useAction, useRemote, useWorkspace } from '../workspace';
import {
  benches,
  Button,
  Captcha,
  Card,
  Feedback,
  Field,
  Page,
  Records,
  Select,
  s,
  type Challenge,
  type Option,
} from '../ui';
import { saveBase64File, openBase64File } from '../downloads';

export type Document = { filename: string; base64: string; mimeType?: string };
type OrdersResult = {
  caseInfo: {
    caseType: string;
    caseNo: string;
    caseYear: string;
    status?: string;
    petitionerVsRespondent?: string;
  };
  details: {
    header?: string;
    keyValues: Array<{ key: string; value: string }>;
    listingHistory: Array<Record<string, string>>;
    iaDetails: Array<Record<string, string>>;
  };
  pdf?: Document;
  excel?: Document;
  orderJudgments?: Array<{
    srNo: number;
    date: string;
    viewUrl: string;
    judgmentId: string;
  }>;
};
export function StatusScreen() {
  const { navigate } = useWorkspace();
  return (
    <Page title="HIGH COURT OF JUDICATURE AT ALLAHABAD" eyebrow="STATUS PORTAL">
      <Text style={s.muted}>Choose a status service below</Text>
      {benches
        .slice()
        .reverse()
        .map(bench => (
          <Card key={bench.value}>
            <Text style={s.heading}>Case Status {bench.label}</Text>
            <Button
              title="Open quick search →"
              onPress={() => navigate(`/orders?mode=quick&city=${bench.value}`)}
            />
          </Card>
        ))}
      <Text style={s.eyebrow}>MORE SERVICES COMING SOON</Text>
      {['Mediation', 'Copying Folio'].map(title => (
        <Card key={title}>
          <Text style={s.heading}>{title}</Text>
          <Text style={s.muted}>Coming soon</Text>
        </Card>
      ))}
    </Page>
  );
}
export function OrdersScreen({ params }: { params: URLSearchParams }) {
  const { api } = useWorkspace();
  const [city] = useState(
    params.get('city') === 'allahabad' ? 'allahabad' : 'lucknow',
  );
  const [showForm, setShowForm] = useState(
    params.has('mode') || params.has('caseType'),
  );
  const [caseType, setCaseType] = useState(params.get('caseType') || '');
  const [caseNo, setCaseNo] = useState(params.get('caseNo') || '');
  const [caseYear, setCaseYear] = useState(
    params.get('caseYear') || String(new Date().getFullYear()),
  );
  const [result, setResult] = useState<OrdersResult | null>(null);
  const [brief, setBrief] = useState<{
    result: OrdersResult;
    text: string;
  } | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const action = useAction();
  const types = useRemote<{ types: Option[] }>(
    `/api/orders/case-types?city=${city}`,
  );
  const reset = () => {
    setChallenge(null);
    setCode('');
    setResult(null);
  };
  const search = (body: unknown) =>
    action.run(async () => {
      setResult(null);
      const response = await api<{
        result?: OrdersResult;
        captchaChallenge?: Challenge;
      }>('/api/orders/fetch', body);
      setChallenge(response.captchaChallenge || null);
      setCode('');
      setResult(response.result || null);
    });
  const downloadJudgment = (viewUrl: string, date: string, preview: boolean) =>
    action.run(async () => {
      const response = await api<{ result: Document }>('/api/orders/judgment', {
        viewUrl,
        date,
      });
      const file = response.result;
      await (preview ? openBase64File : saveBase64File)(
        file.filename,
        file.mimeType || 'application/pdf',
        file.base64,
      );
    });
  const generateBrief = () =>
    action.run(async () => {
      if (!result) return;
      const caseRecord = {
        city,
        caseInfo: result.caseInfo,
        details: result.details,
        orderJudgments: result.orderJudgments?.map(({ date }) => ({ date })),
      };
      const response = await api<{ result: { answer: string } }>(
        '/api/ai/chat',
        {
          mode: 'case-brief',
          caseRecord,
        },
      );
      if (!response.result?.answer)
        throw new Error('Unable to generate case brief. Please try again.');
      setBrief({ result, text: response.result.answer });
    });
  const downloadAllJudgments = () =>
    action.run(async () => {
      for (const item of result?.orderJudgments || []) {
        const response = await api<{ result: Document }>(
          '/api/orders/judgment',
          { viewUrl: item.viewUrl, date: item.date },
        );
        const file = response.result;
        await saveBase64File(
          file.filename,
          file.mimeType || 'application/pdf',
          file.base64,
        );
      }
    });
  return (
    <Page
      title="Case Orders & Judgments"
      eyebrow="ORDERS"
      description="Fetch case details from the High Court site and download as PDF."
      header={
        <>
          <Text style={[s.muted, { color: '#22d3eecc', marginTop: 4 }]}>
            Source: Case Status{' '}
            {city === 'lucknow' ? 'Lucknow Bench' : 'Allahabad'}
          </Text>
          <Button
            title="Search"
            style={{
              alignSelf: 'flex-start',
              marginTop: 12,
              minHeight: 38,
              paddingVertical: 8,
            }}
            onPress={() => setShowForm(!showForm)}
          />
        </>
      }
    >
      <>
        <Card>
          {showForm && (
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.heading}>Search Orders</Text>
              <Button title="Close" quiet onPress={() => setShowForm(false)} />
            </View>
          )}
          <Feedback {...types} />
          <Select
            label="Case Type"
            value={caseType}
            options={types.data?.types || []}
            onChange={value => {
              setCaseType(value);
              reset();
            }}
            disabled={action.busy}
          />
          <Field
            label="Case No."
            placeholder="Enter case number"
            value={caseNo}
            onChangeText={value => {
              setCaseNo(value.replace(/\D/g, ''));
              reset();
            }}
            keyboardType="number-pad"
            editable={!action.busy}
          />
          <Field
            label="Case Year"
            placeholder="e.g. 2025"
            value={caseYear}
            onChangeText={value => {
              setCaseYear(value.replace(/\D/g, ''));
              reset();
            }}
            maxLength={4}
            keyboardType="number-pad"
            editable={!action.busy}
          />
          <Text style={[s.muted, { color: '#64748b', marginTop: 4 }]}>
            {showForm
              ? 'Quickly search case details. Captcha is handled automatically. Results are not saved.'
              : 'Captcha is handled automatically.'}
          </Text>
          <Button
            title={showForm ? 'Search' : 'Fetch Orders'}
            style={
              !showForm && {
                backgroundColor: '#f59e0b26',
                borderColor: '#fbbf2440',
              }
            }
            textStyle={!showForm && { color: '#fcd34d' }}
            disabled={
              action.busy || !caseType || !caseNo || !/^\d{4}$/.test(caseYear)
            }
            onPress={() => void search({ city, caseType, caseNo, caseYear })}
          />
        </Card>
        <Feedback {...action} />
        {challenge && (
          <Captcha
            challenge={challenge}
            value={code}
            onChange={setCode}
            busy={action.busy}
            submit={() =>
              void search({
                challengeId: challenge.challengeId,
                captchaCode: code,
              })
            }
            refresh={() =>
              void search({
                challengeId: challenge.challengeId,
                refreshCaptcha: true,
              })
            }
          />
        )}
        {result && (
          <>
            <Card>
              <Text style={s.heading}>
                {result.caseInfo.petitionerVsRespondent ||
                  `${caseType} ${caseNo}/${caseYear}`}
              </Text>
              <Text style={s.accent}>{result.caseInfo.status}</Text>
              <Text style={s.muted}>{result.details.header}</Text>
              {result.details.keyValues.map((item, index) => (
                <View key={index}>
                  <Text style={s.label}>{item.key}</Text>
                  <Text selectable style={s.text}>
                    {item.value}
                  </Text>
                </View>
              ))}
              <View style={s.row}>
                <Button
                  title="Case Brief"
                  disabled={action.busy}
                  onPress={() => void generateBrief()}
                />
                {result.excel && (
                  <Button
                    title="Export Excel"
                    disabled={action.busy}
                    onPress={() =>
                      void action.run(() =>
                        saveBase64File(
                          result.excel!.filename,
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          result.excel!.base64,
                        ),
                      )
                    }
                  />
                )}
              </View>
            </Card>
            {brief?.result === result && (
              <Card>
                <Text style={s.heading}>AI Case Brief</Text>
                <Text style={s.muted}>
                  Based on available case-status details. Full judgment text is
                  not included.
                </Text>
                <Text selectable style={s.text}>
                  {brief.text}
                </Text>
              </Card>
            )}
            <Text style={s.heading}>Orders & Judgments</Text>
            {(result.orderJudgments?.length || 0) > 1 && (
              <Button
                title="Download All PDFs"
                disabled={action.busy}
                onPress={() => void downloadAllJudgments()}
              />
            )}
            {result.orderJudgments?.map(item => (
              <Card key={item.judgmentId || item.viewUrl}>
                <Text style={s.text}>
                  #{item.srNo} · {item.date}
                </Text>
                <View style={s.row}>
                  <Button
                    title="View PDF"
                    disabled={action.busy}
                    onPress={() =>
                      void downloadJudgment(item.viewUrl, item.date, true)
                    }
                  />
                  <Button
                    title="Download"
                    quiet
                    disabled={action.busy}
                    onPress={() =>
                      void downloadJudgment(item.viewUrl, item.date, false)
                    }
                  />
                </View>
              </Card>
            ))}
            {!result.orderJudgments?.length && (
              <Text style={s.muted}>No judgments available.</Text>
            )}
            <Text style={s.heading}>Listing History</Text>
            <Records rows={result.details.listingHistory} />
            <Text style={s.heading}>IA Details</Text>
            <Records rows={result.details.iaDetails} />
          </>
        )}
      </>
    </Page>
  );
}
export function JudgmentScreen({ params }: { params: URLSearchParams }) {
  const { api } = useWorkspace();
  const action = useAction();
  const open = () =>
    action.run(async () => {
      const viewUrl = params.get('viewUrl');
      if (!viewUrl) throw new Error('Document URL is missing.');
      const response = await api<{ result: Document }>('/api/orders/judgment', {
        viewUrl,
        date: params.get('date') || '',
      });
      await openBase64File(
        response.result.filename,
        response.result.mimeType || 'application/pdf',
        response.result.base64,
      );
    });
  return (
    <Page title="Judgment">
      <Card>
        <Text style={s.text}>{params.get('date')}</Text>
        <Button title="Open PDF" onPress={open} disabled={action.busy} />
        <Feedback {...action} />
      </Card>
    </Page>
  );
}
