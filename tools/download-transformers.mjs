import { writeFile } from 'node:fs/promises';

// узнаём последнюю версию transformers.js
const meta = await fetch('https://registry.npmjs.org/@huggingface/transformers/latest').then(r => r.json());
const ver = meta.version;
console.log('latest @huggingface/transformers:', ver);

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const url = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${ver}/dist/transformers.min.js`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile('vendor/transformers.min.js', buf);
    console.log('OK', buf.length, 'bytes');
    process.exit(0);
  } catch (e) {
    console.log('attempt', attempt, 'failed:', e.message);
  }
}
process.exit(1);
