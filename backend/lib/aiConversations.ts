import { randomUUID } from 'node:crypto';
import { Db } from 'mongodb';

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolResults?: unknown[];
  createdAt: Date;
};

type ConversationDoc = {
  conversationId: string;
  ownerKey: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

let indexesReady = false;

async function collection(db: Db) {
  const value = db.collection<ConversationDoc>('ai_conversations');
  if (!indexesReady) {
    await Promise.all([
      value.createIndex({ conversationId: 1 }, { unique: true }),
      value.createIndex({ ownerKey: 1, updatedAt: -1 }),
      value.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    indexesReady = true;
  }
  return value;
}

export function getConversationOwnerKey(input: {
  userId?: string | null;
  profileKey?: string | null;
  email?: string | null;
}) {
  return String(input.userId || input.profileKey || input.email || '').trim().toLowerCase();
}

function expiry() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export async function listConversations(db: Db, ownerKey: string) {
  const value = await collection(db);
  return value
    .find({ ownerKey }, { projection: { _id: 0, messages: 0 } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
}

export async function getConversation(db: Db, ownerKey: string, conversationId: string) {
  const value = await collection(db);
  return value.findOne({ ownerKey, conversationId }, { projection: { _id: 0 } });
}

export async function appendConversationTurn(
  db: Db,
  ownerKey: string,
  conversationId: string | null,
  userContent: string,
  assistantContent: string,
  toolResults?: unknown[]
) {
  const value = await collection(db);
  const now = new Date();
  const id = conversationId || randomUUID();
  const messages: ConversationMessage[] = [
    { id: randomUUID(), role: 'user', content: userContent, createdAt: now },
    {
      id: randomUUID(),
      role: 'assistant',
      content: assistantContent,
      toolResults,
      createdAt: now,
    },
  ];
  await value.updateOne(
    { ownerKey, conversationId: id },
    {
      $set: { updatedAt: now, expiresAt: expiry() },
      $setOnInsert: {
        ownerKey,
        conversationId: id,
        title: userContent.slice(0, 60),
        createdAt: now,
      },
      $push: { messages: { $each: messages, $slice: -100 } },
    },
    { upsert: true }
  );
  return id;
}

export async function deleteConversation(db: Db, ownerKey: string, conversationId: string) {
  const value = await collection(db);
  await value.deleteOne({ ownerKey, conversationId });
}
