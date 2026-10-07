// Проверка правил на уровне аккаунта и организации
import { readFileSync } from 'node:fs';
const token = readFileSync('tools/.gh-token', 'utf8').trim();
const login = 's0mfff';

const api = async (path) => {
  const r = await fetch('https://api.github.com' + path, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kalorii-deploy',
    },
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
};

const user = await api(`/users/${login}`);
console.log('type:', user.json.type, '| name:', user.json.name);

console.log('--- org rulesets ---');
const orgRs = await api(`/orgs/${login}/rulesets`);
console.log(JSON.stringify(orgRs.json).slice(0, 1200));

console.log('--- user rulesets ---');
const userRs = await api(`/users/${login}/rulesets`);
console.log(JSON.stringify(userRs.json).slice(0, 1200));
