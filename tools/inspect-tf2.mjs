import { readFileSync } from 'node:fs';
const s = readFileSync('vendor/tf.min.js', 'utf8');
const i = s.indexOf('fromTFHub');
console.log('context around fromTFHub:');
console.log(s.slice(Math.max(0, i - 600), i + 400));
