// Проверка: все селекторы $('#id') из js/app.js должны существовать в index.html
import { readFileSync } from 'node:fs';

const js = readFileSync('js/app.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

const used = new Set();
for (const m of js.matchAll(/\$\('#([a-z0-9-]+)'\)/g)) used.add(m[1]);
// также querySelector с '#'
for (const m of js.matchAll(/querySelector\('#([a-z0-9-]+)'\)/g)) used.add(m[1]);

let bad = 0;
// id, создаваемые динамически через innerHTML (не обязаны быть в разметке)
const DYNAMIC_IDS = new Set(['cam-manual']);
for (const id of [...used].sort()) {
  if (DYNAMIC_IDS.has(id)) continue;
  const re = new RegExp(`id=["']${id}["']`);
  if (!re.test(html)) { console.error('  ✗ нет id в HTML:', id); bad++; }
}
console.log(`Проверено селекторов: ${used.size}, отсутствующих: ${bad}`);

// data-атрибуты создаются динамически в шаблонах app.js — проверяем только согласованность в самом JS:
// каждый dataset.<name> должен где-то проставляться через data-<attr>
const datasetRe = /dataset\.([a-zA-Z]+)/g;
const dataRe = /data-([a-z-]+)=/g;
const ds = new Set(); for (const m of js.matchAll(datasetRe)) ds.add(m[1]);
const das = new Set();
for (const m of (js + html).matchAll(dataRe)) das.add(m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
// dataset-свойства, которые задаются только программно (не через data-* в разметке)
const PROGRAMMATIC = new Set(['rendered']);
for (const k of ds) {
  if (PROGRAMMATIC.has(k)) continue;
  if (!das.has(k)) { console.error('  ✗ dataset.' + k + ' нигде не проставляется'); bad++; }
}
console.log(bad === 0 ? 'ПРОВЕРКА DOM-СЕЛЕКТОРОВ OK ✅' : `ПРОБЛЕМ: ${bad}`);
process.exit(bad ? 1 : 0);
