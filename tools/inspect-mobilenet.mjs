import { readFileSync } from 'node:fs';
const s = readFileSync('vendor/mobilenet.min.js', 'utf8');
console.log('--- savedmodel refs ---');
console.log([...new Set(s.match(/savedmodel[^"']*/g) || [])].join('\n'));
console.log('--- mobilenet_v refs ---');
console.log([...new Set(s.match(/mobilenet_v[12][^"']*/g) || [])].join('\n'));
console.log('--- tfhub refs ---');
console.log([...new Set(s.match(/tfhub[^"']*/g) || [])].join('\n'));
