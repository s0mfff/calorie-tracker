import { readFileSync } from 'node:fs';
const s = readFileSync('vendor/tf.min.js', 'utf8');
const re = /[a-zA-Z0-9._/-]{0,20}[Tt][Ff][Hh]ub[a-zA-Z0-9._/-]{0,40}/g;
console.log([...new Set(s.match(re) || [])].slice(0, 25).join('\n'));
console.log('--- fromTFHub option ---');
console.log('has fromTFHub:', s.includes('fromTFHub'));
