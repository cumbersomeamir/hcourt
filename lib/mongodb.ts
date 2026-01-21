import { MongoClient, Db } from 'mongodb';
import dns from 'node:dns';

// Work around environments where Node's c-ares resolver can't use a scoped (link-local) DNS server
// like `fe80::...%en0`, which can cause `querySrv ECONNREFUSED` for Atlas SRV lookups.
const dnsServersEnv = process.env.MONGODB_DNS_SERVERS;
if (dnsServersEnv) {
  dns.setServers(
    dnsServersEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
} else {
  const currentServers = dns.getServers();
  const likelyBrokenForSrv =
    currentServers.length > 0 &&
    currentServers.every(
      (s) =>
        s === '127.0.0.1' ||
        s === '::1' ||
        s.startsWith('fe80:') ||
        s.startsWith('169.254.')
    );
  if (likelyBrokenForSrv) {
    // Safe defaults; user can override via MONGODB_DNS_SERVERS
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    console.warn(
      '[mongodb] Detected local/loopback/link-local DNS servers; forcing public DNS servers for SRV lookups. ' +
        'Override with MONGODB_DNS_SERVERS.'
    );
  }
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error(
    'Missing MONGODB_URI. Create a .env.local file in the project root and set MONGODB_URI.'
  );
}
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise;

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db('hcourt');
}

