const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs/promises');
const { MongoClient } = createRequire(path.join(__dirname, '../backend/package.json'))('mongodb');

const apply = process.argv.includes('--apply');
const cutoff = new Date(Date.now() - 7 * 86400000);
const generatedTypes = ['status_change', 'new_case', 'change'];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db('hcourt');
    const changes = db.collection('changes');
    const notifications = db.collection('notifications');
    const oldChanges = { timestamp: { $lt: cutoff } };
    console.log(JSON.stringify({ apply, cutoff, expiredChanges: await changes.countDocuments(oldChanges) }));
    if (!apply) return;
    await notifications.createIndex({ changeRecordId: 1 });
    let removedChanges = 0;
    let removedNotifications = 0;
    const cursor = changes.find(oldChanges, { projection: { _id: 1 } }).batchSize(1000);
    let batch = [];
    async function removeBatch() {
      const references = batch.flatMap(id => [id, id.toString()]);
      removedNotifications += (await notifications.deleteMany({
        changeRecordId: { $in: references },
        timestamp: { $lt: cutoff },
        type: { $in: generatedTypes },
      })).deletedCount;
      const retained = new Set((await notifications.find(
        { changeRecordId: { $in: references } },
        { projection: { changeRecordId: 1 } }
      ).toArray()).map(n => String(n.changeRecordId)));
      removedChanges += (await changes.deleteMany({
        ...oldChanges, _id: { $in: batch.filter(id => !retained.has(id.toString())) },
      })).deletedCount;
      batch = [];
    }
    for await (const doc of cursor) {
      batch.push(doc._id);
      if (batch.length === 1000) await removeBatch();
    }
    if (batch.length) await removeBatch();
    removedNotifications += (await notifications.deleteMany({
      timestamp: { $lt: cutoff }, type: { $in: generatedTypes }, changeRecordId: null,
    })).deletedCount;
    console.log(JSON.stringify({ removedChanges, removedNotifications }));
  } finally {
    await client.close();
  }

  const backupDir = path.resolve(__dirname, '../../hcourt-backups');
  if ((await fs.lstat(backupDir).catch(() => null))?.isSymbolicLink()) return;
  const groups = new Map();
  for (const name of await fs.readdir(backupDir).catch(() => [])) {
    const match = /^(pre-update|pre-cache-fix|storage-rollback)-\d{8}\.tar\.gz$/.exec(name);
    if (!match) continue;
    const file = path.join(backupDir, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const group = groups.get(match[1]) || [];
    group.push({ file, time: stat.mtimeMs });
    groups.set(match[1], group);
  }
  for (const group of groups.values()) {
    for (const entry of group.sort((a, b) => b.time - a.time).slice(2)) {
      if (entry.time < Date.now() - 14 * 86400000) {
        await fs.unlink(entry.file);
        console.log('Removed expired deployment archive:', path.basename(entry.file));
      }
    }
  }
}

main().catch(error => {
  console.error('Storage maintenance failed:', error.code || error.name);
  process.exitCode = 1;
});
