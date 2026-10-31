import { Text, useFont } from '../typography';
import { confirmAiSharing } from '../aiConsent';
import { useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useAction, useRemote, useWorkspace } from '../workspace';
import { Button, Card, Feedback, s } from '../ui';
import { type TrackedOrderCase } from '../court';

type Tool = {
  tool: string;
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
};
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: Tool[];
  toolResults?: Tool[];
};
type Conversation = { conversationId: string; title: string };
type ChatResponse = {
  requestId: string;
  answer: string;
  conversationId?: string;
  toolResults?: Tool[];
  clientMutation?: {
    trackedCaseIds?: string[];
    trackedOrderCases?: TrackedOrderCase[];
  };
};
const welcome: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    'I am your personal AI assistant. Ask me to write, plan, explain, summarize, or help with court work.',
};
const prompts = [
  "Show today's Court View.",
  "Show today's Lucknow Web Diary.",
  'Draft a professional client update.',
];
export default function ChatScreen() {
  const fontFamily = useFont();
  const { api, session, profile, tracking, reloadTracking, navigate } =
    useWorkspace();
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reported, setReported] = useState<string[]>([]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const action = useAction();
  const owner = new URLSearchParams({ email: session.user.email });
  if (tracking?.id) owner.set('userId', tracking.id);
  if (profile?.profileKey) owner.set('profileKey', profile.profileKey);
  const history = useRemote<{ result: Conversation[] }>(
    historyOpen ? `/api/ai/conversations?${owner.toString()}` : null,
  );
  const send = (prompt: string) =>
    action.run(async () => {
      if (!prompt.trim()) return;
      if (!(await confirmAiSharing())) return;
      const message: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: prompt.trim(),
      };
      const next = [...messages, message];
      setMessages(next);
      setInput('');
      try {
        const response = await api<{ result: ChatResponse }>('/api/ai/chat', {
          message: message.content,
          history: next
            .filter(item => item.id !== 'welcome')
            .slice(-8)
            .map(item => ({
              role: item.role,
              content: item.content,
              toolResults: item.tools || item.toolResults,
            })),
          clientState: {
            profileKey: profile?.profileKey,
            userId: tracking?.id,
            email: session.user.email,
            trackedCaseIds: tracking?.caseIds || [],
            trackedOrderCases: tracking?.trackedOrderCases || [],
          },
          conversationId,
        });
        setConversationId(response.result.conversationId || conversationId);
        setMessages([
          ...next,
          {
            id: response.result.requestId,
            role: 'assistant',
            content: response.result.answer,
            tools: response.result.toolResults,
          },
        ]);
        if (response.result.clientMutation) await reloadTracking();
      } catch (error) {
        setMessages(messages);
        setInput(prompt);
        throw error;
      }
    });
  const openConversation = (id: string) =>
    action.run(async () => {
      const response = await api<{ result: { messages: Message[] } }>(
        `/api/ai/conversations?${owner.toString()}&conversationId=${encodeURIComponent(
          id,
        )}`,
      );
      if (!response.result)
        throw new Error('This conversation is unavailable.');
      setMessages(response.result.messages);
      setConversationId(id);
      setHistoryOpen(false);
    });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={chat.header}>
        <Pressable onPress={() => navigate('/')} style={s.dashboardLink}>
          <Text style={s.dashboardText}>← DASHBOARD</Text>
        </Pressable>
      </View>
      <Modal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#020617b3' }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setHistoryOpen(false)}
          />
          <View
            style={{
              width: '82%',
              maxWidth: 288,
              flex: 1,
              backgroundColor: '#0a132b',
              padding: 16,
              paddingTop: 48,
              borderRightWidth: 1,
              borderColor: '#1e293bcc',
            }}
          >
            <Button
              title="+ New chat"
              onPress={() => {
                setConversationId(null);
                setMessages([welcome]);
                setInput('');
                setHistoryOpen(false);
              }}
            />
            <Text
              style={{
                fontSize: 10,
                letterSpacing: 2,
                color: '#64748b',
                paddingHorizontal: 8,
                marginTop: 20,
                marginBottom: 8,
              }}
            >
              LAST 30 DAYS
            </Text>
            <ScrollView>
              <Feedback {...history} />
              {history.data?.result.map(item => (
                <Pressable
                  key={item.conversationId}
                  onPress={() => void openConversation(item.conversationId)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor:
                      item.conversationId === conversationId
                        ? '#06b6d426'
                        : 'transparent',
                  }}
                >
                  <Text numberOfLines={1} style={s.text}>
                    {item.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingTop: 28,
          paddingBottom: 40,
        }}
      >
        <Button
          title="☰ Chats"
          quiet
          style={{ alignSelf: 'flex-start', marginBottom: 16 }}
          onPress={() => setHistoryOpen(true)}
        />
        <Text style={s.eyebrow}>AI CHAT</Text>
        <Text
          style={[
            s.title,
            { fontFamily: 'Cinzel', marginTop: 12, marginBottom: 24 },
          ]}
        >
          {profile?.counselName
            ? `${profile.counselName}'s AI Assistant`
            : 'Personal AI Assistant'}
        </Text>
        <Feedback error={action.error} />
        <View style={chat.section}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {prompts.map(prompt => (
              <Button
                key={prompt}
                title={prompt}
                quiet
                disabled={action.busy}
                onPress={() => void send(prompt)}
                style={{
                  borderRadius: 99,
                  paddingVertical: 8,
                  minHeight: 34,
                  backgroundColor: '#02061766',
                  borderColor: '#33415599',
                }}
                textStyle={{
                  fontSize: 12,
                  fontWeight: '400',
                  color: '#cbd5e1',
                  lineHeight: 16,
                }}
              />
            ))}
          </View>
          <ScrollView
            ref={scroll}
            nestedScrollEnabled
            style={{ maxHeight: 576 }}
            contentContainerStyle={{ gap: 16, paddingRight: 4 }}
            onContentSizeChange={() => {
              if (messages.length > 1)
                scroll.current?.scrollToEnd({ animated: true });
            }}
          >
            {messages.map(message => (
              <View
                key={message.id}
                style={message.role === 'user' ? chat.user : chat.assistant}
              >
                <Card
                  style={{
                    borderRadius: 24,
                    borderWidth: message.role === 'user' ? 1 : 0,
                    borderColor: '#22d3ee33',
                    backgroundColor:
                      message.role === 'user' ? '#06b6d41a' : '#02061759',
                    boxShadow: [],
                    padding: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      lineHeight: 16.5,
                      letterSpacing: 2.64,
                      color: '#64748b',
                    }}
                  >
                    {message.role === 'user' ? 'YOU' : 'Courtlens AI'}
                  </Text>
                  <Text
                    selectable
                    style={{ fontSize: 15, lineHeight: 28, color: '#f1f5f9' }}
                  >
                    {message.content}
                  </Text>
                  {(message.tools || message.toolResults)?.flatMap(tool => {
                    const data = tool.data || {};
                    const links = Array.isArray(data.orderDocumentLinks)
                      ? data.orderDocumentLinks
                      : data.latestOrderDocument
                      ? [data.latestOrderDocument]
                      : [];
                    return links
                      .filter(
                        (link): link is { viewerHref: string; date?: string } =>
                          !!link &&
                          typeof link === 'object' &&
                          typeof (link as { viewerHref?: unknown })
                            .viewerHref === 'string',
                      )
                      .map((link, index) => (
                        <Button
                          key={`${tool.tool}-${index}`}
                          title={`Open order ${link.date || ''}`}
                          onPress={() => navigate(link.viewerHref)}
                        />
                      ));
                  })}
                  {message.role === 'assistant' && message.id !== 'welcome' && (
                    <Button
                      title={
                        reported.includes(message.id)
                          ? 'Reported'
                          : 'Report response'
                      }
                      quiet
                      disabled={action.busy || reported.includes(message.id)}
                      onPress={() =>
                        void action.run(async () => {
                          await api('/api/ai/report', {
                            responseId: message.id,
                            conversationId,
                            content: message.content,
                          });
                          setReported(current => [...current, message.id]);
                        })
                      }
                    />
                  )}
                </Card>
              </View>
            ))}
            {action.busy && <Text style={s.muted}>Preparing your answer…</Text>}
          </ScrollView>
          <View style={chat.composer}>
            <TextInput
              accessibilityLabel="Message"
              placeholderTextColor="#64748b"
              placeholder="Ask anything about court work, drafting, planning, or research..."
              multiline
              value={input}
              onChangeText={setInput}
              style={[chat.input, { fontFamily }]}
            />
            <Button
              title={action.busy ? 'Thinking...' : 'Send'}
              style={{
                alignSelf: 'flex-end',
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingVertical: 12,
                marginTop: 12,
              }}
              disabled={action.busy || !input.trim()}
              onPress={() => void send(input)}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const chat = StyleSheet.create({
  header: {
    padding: 16,
    paddingRight: 76,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293bcc',
    backgroundColor: '#081127f2',
  },
  section: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#1e293bcc',
    backgroundColor: '#0a132beb',
    padding: 16,
    boxShadow: '0 30px 80px rgba(2,6,23,0.35)',
  },
  user: { maxWidth: '92%', alignSelf: 'flex-end' },
  assistant: { maxWidth: '92%', alignSelf: 'flex-start' },
  composer: {
    marginTop: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#33415599',
    borderRadius: 25.6,
    backgroundColor: '#02061773',
  },
  input: {
    minHeight: 96,
    maxHeight: 192,
    padding: 8,
    fontSize: 14,
    lineHeight: 28,
    color: '#f1f5f9',
    textAlignVertical: 'top',
  },
});
