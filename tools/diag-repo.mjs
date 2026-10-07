// Диагностика ограничений репозитория
import { readFileSync } from 'node:fs';
const token = readFileSync('tools/.gh-token', 'utf8').trim();
const REPO = 'calorie-tracker';
const login = 's0mfff';

const api = async (path, opts = {}) => {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kalorii-deploy',
      ...(opts.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
};

const rs = await api(`/repos/${login}/${REPO}/rulesets`);
console.log('--- rulesets ---');
console.log(JSON.stringify(rs.json, null, 1).slice(0, 1500));

const bp = await api(`/repos/${login}/${REPO}/branches/main/protection`);
console.log('--- branch protection ---');
console.log(JSON.stringify(bp.json, null, 1).slice(0, 800));

const repo = await api(`/repos/${login}/${REPO}`);
console.log('--- repo info ---');
console.log('default_branch:', repo.json.default_branch);
console.log('delete_branch_on_merge:', repo.json.delete_branch_on_merge);
