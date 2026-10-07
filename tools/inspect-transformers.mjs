import { readFileSync } from 'node:fs';
const s = readFileSync('vendor/transformers.min.js', 'utf8');
console.log('size:', s.length);
console.log('--- первые 400 символов ---');
console.log(s.slice(0, 400));
console.log('--- globalName подсказки ---');
for (const pat of ['globalThis.TransformerJS', 'global.TransformerJS', 'TransformerJS', 'root.TransformerJS', 'self.TransformerJS']) {
  console.log(pat, '→', s.includes(pat));
}
console.log('--- API hints ---');
for (const pat of ['useBrowserCache', 'allowRemoteModels', 'device', 'pipeline', 'TextStreamer', 'env', 'hf_hub']) {
  console.log(pat, '→', s.includes(pat));
}
