const fs = require('node:fs');
const file = require.resolve('next/dist/compiled/@next/font/dist/google/loader.js');
const source = fs.readFileSync(file, 'utf8');
const before = 'const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];';
const after = `const ext = /\\.(woff|woff2|eot|ttf|otf)(?:\\?|$)/.exec(googleFontFileUrl)?.[1] || ({ wOF2: 'woff2', wOFF: 'woff', OTTO: 'otf' })[fontFileBuffer.toString('ascii', 0, 4)];
            if (!ext) throw new Error('Unsupported Google font file format');`;
if (source.includes(before)) fs.writeFileSync(file, source.replace(before, after));
