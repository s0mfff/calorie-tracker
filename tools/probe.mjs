import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => console.log('JSDOM ERROR:', e.message, e.detail && e.detail.stack));
const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'https://example.com/app/', pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
window.addEventListener('error', (e) => console.log('WINDOW ERROR:', e.message, e.error && e.error.stack));

window.tf = { setBackend: async () => {}, ready: async () => {} };
window.mobilenet = { load: async () => { throw new Error('stub'); } };

for (const f of ['js/db.js', 'js/engine.js', 'js/camera.js', 'js/app.js']) {
  try {
    window.eval(read(f));
    console.log('eval ok:', f);
  } catch (e) {
    console.log('EVAL FAIL:', f, e.message);
  }
}
console.log('typeof boot =', typeof window.boot);
console.log('typeof Engine =', typeof window.Engine);
console.log('typeof FOODS =', typeof window.FOODS);
console.log('typeof CATS =', typeof window.CATS);
console.log('typeof $ =', typeof window.$);
try {
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  console.log('dispatch ok');
} catch (e) {
  console.log('dispatch threw:', e.message, e.stack);
}
setTimeout(() => {
  console.log('onboarding hidden?', window.document.querySelector('#onboarding').className);
  console.log('app hidden?', window.document.querySelector('#app').className);
  process.exit(0);
}, 50);
