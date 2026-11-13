import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet } from 'react-native';
import { Text } from '../typography';
import { Button, Card, Feedback, Page, s } from '../ui';
import { useWorkspace } from '../workspace';

type Article = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
  sections: { heading: string; paragraphs: string[] }[];
  source: { name: string; url: string; publishedAt: string };
  image?: { url: string; alt: string; credit: string };
};

export default function BlogsScreen({
  slug,
  onBack,
}: {
  slug?: string;
  onBack: () => void;
}) {
  const { api, navigate } = useWorkspace();
  const [articles, setArticles] = useState<Article[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    api<{ articles?: Article[]; article?: Article }>(
      slug ? `/api/blogs/${encodeURIComponent(slug)}` : '/api/blogs',
      undefined,
      'GET',
      controller.signal,
    )
      .then(data => {
        if (!controller.signal.aborted)
          setArticles(data.article ? [data.article] : data.articles || []);
      })
      .catch(reason => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : 'Unable to load blogs.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, slug, refresh]);

  return (
    <Page bare contentStyle={styles.page} title="Legal News & Blogs">
      <Button quiet title="← Back" onPress={onBack} />
      <Text style={s.eyebrow}>LEGAL UPDATES</Text>
      <Text style={s.title}>
        {slug && articles[0] ? articles[0].title : 'Legal News & Blogs'}
      </Text>
      <Feedback busy={busy} error={error} />
      {!busy && (
        <Button
          quiet
          title={error ? 'Retry' : 'Refresh'}
          onPress={() => setRefresh(value => value + 1)}
        />
      )}
      {!busy && !error && !articles.length && (
        <Text style={s.muted}>No published articles yet.</Text>
      )}
      {!busy &&
        !error &&
        articles.map(article => (
          <Card key={article.slug}>
            <Text style={[s.muted, s.accent]}>
              {article.category} ·{' '}
              {new Date(article.publishedAt).toLocaleDateString('en-IN')}
            </Text>
            {article.image && (
              <>
                <Image
                  source={{ uri: article.image.url }}
                  accessibilityLabel={article.image.alt}
                  style={styles.image}
                  resizeMode="cover"
                />
                {slug && <Text style={s.muted}>{article.image.credit}</Text>}
              </>
            )}
            {!slug && (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate(`/blogs/${article.slug}`)}
              >
                <Text style={s.heading}>{article.title}</Text>
              </Pressable>
            )}
            <Text style={styles.paragraph}>{article.summary}</Text>
            {slug ? (
              <>
                {article.sections.map((section, index) => (
                  <Card key={index}>
                    <Text style={s.heading}>{section.heading}</Text>
                    {section.paragraphs.map((paragraph, paragraphIndex) => (
                      <Text key={paragraphIndex} style={styles.paragraph}>
                        {paragraph}
                      </Text>
                    ))}
                  </Card>
                ))}
                <Text style={s.muted}>
                  Source: {article.source.name} ·{' '}
                  {new Date(article.source.publishedAt).toLocaleDateString(
                    'en-IN',
                  )}
                </Text>
                <Button
                  quiet
                  title="Read original source"
                  onPress={() => {
                    if (/^https:\/\//i.test(article.source.url))
                      void Linking.openURL(article.source.url).catch(() =>
                        setError('Unable to open the source link.'),
                      );
                  }}
                />
                <Text style={s.muted}>
                  AI-assisted summary of the linked source. For information
                  only; not legal advice.
                </Text>
              </>
            ) : (
              <Button
                title="Read article →"
                onPress={() => navigate(`/blogs/${article.slug}`)}
              />
            )}
          </Card>
        ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 56 },
  image: { width: '100%', height: 190, borderRadius: 12 },
  paragraph: { color: '#e2e8f0', fontSize: 15, lineHeight: 25 },
});
