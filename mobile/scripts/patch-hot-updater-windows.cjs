const fs = require('node:fs');
const path = require('node:path');

const file = path.join(path.dirname(require.resolve('@hot-updater/react-native/package.json')), 'android', 'hot-updater-fingerprint.gradle');
const source = fs.readFileSync(file, 'utf8');
const before = /const path = require\("node:path"\);[\s\S]*?console\.log\(path\.join\(path\.dirname\(manifest\), typeof bin === "string" \? bin : bin\["hot-updater"\]\)\);/;
if (before.test(source)) {
  fs.writeFileSync(file, source.replace(before, block => block.replaceAll('"', "'")));
} else if (!source.includes("const path = require('node:path');")) {
  throw new Error('Hot Updater Windows compatibility patch needs review.');
}
