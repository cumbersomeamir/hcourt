import { Db, MongoClient } from 'mongodb';

let clientPromise: Promise<MongoClient> | null = null;

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('Database service is not configured.');
  clientPromise ||= new MongoClient(uri).connect();
  return (await clientPromise).db('hcourt');
}
