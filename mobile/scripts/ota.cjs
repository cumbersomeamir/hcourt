const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bundledNode = path.join(root, '.bundle', 'node-v22.23.4-win-x64', 'node.exe');
const node = process.env.COURTLENS_OTA_NODE || (fs.existsSync(bundledNode) ? bundledNode : process.execPath);
const manifestPath = path.join(root, 'node_modules', 'hot-updater', 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const binary = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin['hot-updater'];
const result = spawnSync(node, [path.resolve(path.dirname(manifestPath), binary), ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH || ''}` },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
