import { writeFile } from 'node:fs/promises';

const targets = [
  ['https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', 'vendor/tf.min.js'],
  ['https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js', 'vendor/mobilenet.min.js'],
];

for (const [url, file] of targets) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      console.log('OK', file, buf.length, 'bytes');
      break;
    } catch (e) {
      console.log('attempt', attempt, 'failed for', url, e.message);
      if (attempt === 3) process.exitCode = 1;
    }
  }
}
