import { Text } from '../typography';
import { useState } from 'react';
import { Pressable } from 'react-native';
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
import { type Document } from './Orders';

type CacheInfo = { cachedAt?: string; cacheStale?: boolean };
type SearchResult = CacheInfo & {
  links?: Array<{ label: string; url: string }>;
  courtLabel?: string;
  listDate: string;
  totalRows?: number;
  previewRows?: Array<Record<string, string | number | null>>;
  excel?: Document;
};
type MediationRow = {
  date: string;
  lists: Array<{ label: string; url: string }>;
};
export default function CauseListScreen() {
  const { api } = useWorkspace();
  const [tile, setTile] = useState('');
  const [city, setCity] = useState('allahabad');
  const [date, setDate] = useState('');
  const [searchType, setSearchType] = useState('court');
  const [courtNo, setCourtNo] = useState('');
  const [counsel, setCounsel] = useState('');
  const [courts, setCourts] = useState<Option[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const action = useAction();
  const mediation = tile === 'mediation';
  const dates = useRemote<{ result: CacheInfo & { dates: Option[] } }>(
    tile && !mediation ? `/api/cause-list/${tile}/dates?listType=Z` : null,
  );
  const mediationData = useRemote<{ result: CacheInfo & { allahabad: MediationRow[]; lucknow: MediationRow[] } }>(
    mediation ? '/api/cause-list/mediation/list' : null,
  );
  const cacheStatus = result || (mediation ? mediationData.data?.result : dates.data?.result);
  const selectedDate = date || dates.data?.result.dates[0]?.value || '';
  const reset = () => {
    setResult(null);
    setChallenge(null);
    setCode('');
  };
  const next = () =>
    action.run(async () => {
      reset();
      const response = await api<{ result: { options: Option[] } }>(
        `/api/cause-list/${tile}/court-options`,
        { listType: 'Z', listDate: selectedDate },
      );
      setCourts(response.result.options);
      setCourtNo(response.result.options[0]?.value || '');
    });
  const search = (body: unknown) =>
    action.run(async () => {
      setResult(null);
      const response = await api<{
        result?: SearchResult;
        captchaChallenge?: Challenge;
      }>(`/api/cause-list/${tile}/${searchType}-search`, body);
      setResult(response.result || null);
      setChallenge(response.captchaChallenge || null);
      setCode('');
    });
  const document = (url: string, preview: boolean) =>
    action.run(async () => {
      const response = await api<{ result: Document }>(
        mediation
          ? '/api/cause-list/mediation/download'
          : `/api/cause-list/${tile}/court-download`,
        mediation ? { fileUrl: url } : { pdfUrl: url },
      );
      const file = response.result;
      await (preview ? openBase64File : saveBase64File)(
        file.filename,
        file.mimeType || 'application/pdf',
        file.base64,
      );
    });
  return (
    <Page title="Cause List" bare contentStyle={{ paddingTop: 40 }}>
      {cacheStatus?.cachedAt && <Text style={s.muted}>{cacheStatus.cacheStale ? 'Showing saved data; court refresh pending. ' : ''}Last updated: {new Date(cacheStatus.cachedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</Text>}
      <Card
        style={{ borderRadius: 24, padding: 20, backgroundColor: '#0f172a80' }}
      >
        <Text
          style={{
            fontSize: 12,
            lineHeight: 16,
            letterSpacing: 3.36,
            color: '#fdba74cc',
            textAlign: 'center',
          }}
        >
          CAUSE LIST PORTAL
        </Text>
        <Text
          style={{
            fontFamily: 'Cinzel',
            fontSize: 24,
            lineHeight: 32,
            fontWeight: '600',
            letterSpacing: 0.6,
            color: '#fb923c',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          HIGH COURT OF JUDICATURE AT ALLAHABAD
        </Text>
        {!tile ? (
          <>
            {[
              ...benches.slice().reverse(),
              { value: 'mediation', label: 'Mediation' },
            ].map(item => (
              <Pressable
                key={item.value}
                onPress={() => setTile(item.value)}
                style={{
                  borderWidth: 1,
                  borderColor: '#ffffff26',
                  borderRadius: 16,
                  padding: 20,
                  backgroundColor: '#0f172a59',
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: '600',
                    letterSpacing: 1.12,
                    color: '#f1f5f9e6',
                    textAlign: 'center',
                  }}
                >
                  {(item.value === 'mediation'
                    ? 'Mediation Causelist'
                    : item.value === 'lucknow'
                    ? 'Cause List Lucknow Bench'
                    : 'Cause List Allahabad'
                  ).toUpperCase()}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: 16,
                    color: '#cbd5e1bf',
                    textAlign: 'center',
                    marginTop: 8,
                  }}
                >
                  {item.value === 'mediation'
                    ? 'In-app city tabs + downloads'
                    : 'Simplified court/counsel search'}
                </Text>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <Button
              title="← Choose another bench"
              quiet
              disabled={action.busy}
              onPress={() => {
                setTile('');
                setDate('');
                setCourts([]);
                setCourtNo('');
                reset();
              }}
            />
            <Feedback
              busy={action.busy || dates.busy || mediationData.busy}
              error={action.error || dates.error || mediationData.error}
            />
            {(dates.error || mediationData.error) && (
              <Button
                title="Retry"
                onPress={() =>
                  void (mediation ? mediationData.reload() : dates.reload())
                }
              />
            )}
            {mediation ? (
              <>
                <Select
                  label="Bench"
                  value={city}
                  options={benches}
                  onChange={setCity}
                />
                {mediationData.data?.result[city === 'lucknow' ? 'lucknow' : 'allahabad']?.map((row, index) => (
                  <Card key={index}>
                    <Text style={s.heading}>{row.date}</Text>
                    {row.lists.map(link => (
                      <Button
                        key={link.url}
                        title={link.label}
                        disabled={action.busy}
                        onPress={() => void document(link.url, true)}
                      />
                    ))}
                  </Card>
                ))}
                {mediationData.data?.result[city === 'lucknow' ? 'lucknow' : 'allahabad']?.length === 0 && (
                  <Text style={s.muted}>No mediation lists available.</Text>
                )}
              </>
            ) : (
              <>
                <Card>
                  <Text style={s.heading}>
                    {tile === 'lucknow' ? 'Lucknow' : 'Allahabad'} Cause List
                  </Text>
                  <Select
                    label="Listing Date"
                    value={selectedDate}
                    options={dates.data?.result.dates || []}
                    disabled={action.busy}
                    onChange={value => {
                      setDate(value);
                      setCourts([]);
                      setCourtNo('');
                      reset();
                    }}
                  />
                  <Select
                    label="Search By"
                    value={searchType}
                    options={[
                      { value: 'court', label: 'Court Number' },
                      { value: 'counsel', label: 'Counsel Name' },
                    ]}
                    onChange={value => {
                      setSearchType(value);
                      reset();
                    }}
                    disabled={action.busy}
                  />
                  {searchType === 'court' ? (
                    <>
                      <Button
                        title="Load Court Numbers"
                        disabled={!selectedDate || action.busy}
                        onPress={next}
                      />
                      {!!courts.length && (
                        <Select
                          label="Court Number"
                          value={courtNo}
                          options={courts}
                          onChange={value => {
                            setCourtNo(value);
                            reset();
                          }}
                          disabled={action.busy}
                        />
                      )}
                    </>
                  ) : (
                    <Field
                      label="Counsel Name"
                      value={counsel}
                      onChangeText={value => {
                        setCounsel(value);
                        reset();
                      }}
                      editable={!action.busy}
                    />
                  )}
                  <Button
                    title="Search"
                    disabled={
                      action.busy ||
                      !selectedDate ||
                      (searchType === 'court'
                        ? !courtNo
                        : counsel.trim().length < 4)
                    }
                    onPress={() =>
                      void search({
                        listType: 'Z',
                        listDate: selectedDate,
                        ...(searchType === 'court'
                          ? { courtNo }
                          : { counselName: counsel.trim() }),
                      })
                    }
                  />
                </Card>
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
                  />
                )}
                {result && (
                  <>
                    <Text style={s.heading}>
                      {result.courtLabel ||
                        `${result.totalRows || 0} matching cases`}
                    </Text>
                    <Text style={s.muted}>{result.listDate}</Text>
                    {result.links?.map(link => (
                      <Card key={link.url}>
                        <Text style={s.text}>{link.label}</Text>
                        <Button
                          title="View PDF"
                          onPress={() => void document(link.url, true)}
                          disabled={action.busy}
                        />
                        <Button
                          title="Download PDF"
                          quiet
                          onPress={() => void document(link.url, false)}
                          disabled={action.busy}
                        />
                      </Card>
                    ))}
                    {result.links?.length === 0 && (
                      <Text style={s.muted}>No PDF links found.</Text>
                    )}
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
                    {result.previewRows && (
                      <Records rows={result.previewRows} />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </Page>
  );
}
