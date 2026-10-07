import { writeFile, mkdir, readFile } from 'node:fs/promises';

const BASE = 'https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2';
const OUT = 'vendor/model';
await mkdir(OUT, { recursive: true });

async function get(url, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      console.log(`  attempt ${i} failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

console.log('model.json...');
const mj = await get(`${BASE}/model.json?tfjs-format=file`);
await writeFile(`${OUT}/model.json`, mj);
const manifest = JSON.parse(mj.toString('utf8'));
const shards = manifest.weightsManifest.flatMap(m => m.paths);
console.log('shards:', shards.join(', '));

let total = mj.length;
for (const shard of shards) {
  console.log(shard, '...');
  const buf = await get(`${BASE}/${shard}?tfjs-format=file`);
  await writeFile(`${OUT}/${shard}`, buf);
  total += buf.length;
  console.log(`  OK ${(buf.length / 1048576).toFixed(2)} MB`);
}
console.log('TOTAL', (total / 1048576).toFixed(2), 'MB');
