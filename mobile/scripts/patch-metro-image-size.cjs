const fs = require('node:fs');
const path = require('node:path');

const file = path.join(path.dirname(require.resolve('metro/package.json')), 'src', 'Assets.js');
const source = fs.readFileSync(file, 'utf8');
const before = '(0, _imageSize.default)(isImageInput)';
const after = '(0, _imageSize.default)(typeof isImageInput === "string" ? _fs.default.readFileSync(isImageInput) : isImageInput)';
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Metro image-size compatibility patch needs review.');
  fs.writeFileSync(file, source.replace(before, after));
}
