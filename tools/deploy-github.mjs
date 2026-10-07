// Деплой на GitHub Pages. Этапы: create | enable | poll
import { readFileSync } from 'node:fs';

const REPO = 'calorie-tracker';
const token = readFileSync('tools/.gh-token', 'utf8').trim();
const stage = process.argv[2] || 'create';

const api = (path, opts = {}) => fetch('https://api.github.com' + path, {
  ...opts,
  headers: {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kalorii-deploy',
    ...(opts.headers || {}),
  },
});

async function ghJson(path, opts) {
  const r = await api(path, opts);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
}

if (stage === 'create') {
  // кто мы
  const me = await ghJson('/user');
  if (me.status !== 200) {
    console.error('Токен не работает:', me.status, JSON.stringify(me.json).slice(0, 300));
    process.exit(1);
  }
  const login = me.json.login;
  console.log('Авторизован как:', login);

  // создаём репозиторий
  let r = await ghJson('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: REPO,
      description: 'Локальный трекер калорий для iOS: PWA с ИИ-распознаванием еды, чатом на Qwen 2.5 и советником',
      homepage: `https://${login}.github.io/${REPO}/`,
      public: true,
      has_issues: true,
    }),
  });
  if (r.status === 422) {
    console.log('Репозиторий уже существует, использую его');
    r = await ghJson(`/repos/${login}/${REPO}`);
  } else if (r.status === 201) {
    console.log('Репозиторий создан');
    r = await ghJson(`/repos/${login}/${REPO}`);
  }
  if (r.status !== 200) {
    console.error('Не удалось создать репозиторий:', r.status, JSON.stringify(r.json).slice(0, 400));
    process.exit(1);
  }
  console.log('Репозиторий:', r.json.full_name, '|', r.json.html_url);
  console.log('LOGIN=' + login);
}

if (stage === 'enable') {
  const me = await ghJson('/user');
  const login = me.json.login;
  const r = await ghJson(`/repos/${login}/${REPO}/pages`, {
    method: 'POST',
    body: JSON.stringify({ build_type: 'workflow' }),
  });
  if (r.status === 409) console.log('Pages уже включены');
  else if (r.status >= 400) console.error('Pages API:', r.status, JSON.stringify(r.json).slice(0, 300));
  else console.log('Pages включены (workflow):', JSON.stringify(r.json).slice(0, 200));
  console.log('LOGIN=' + login);
}

if (stage === 'poll') {
  const me = await ghJson('/user');
  const login = me.json.login;
  const url = `https://${login}.github.io/${REPO}/`;
  console.log('Ожидаю публикацию:', url);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 360000) {
    try {
      const res = await fetch(url);
      if (res.status === 200) { ok = true; break; }
      console.log('  статус', res.status, '— жду…');
    } catch (e) {
      console.log('  ещё нет — жду…');
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  if (ok) {
    console.log('\nСАЙТ ОПУБЛИКОВАН ✅');
    console.log(url);
    console.log('\nДобавь на iPhone: открой ссылку в Safari → «Поделиться» → «На экран „Домой"»');
  } else {
    console.error('Таймаут публикации. Проверь вручную позже:', url);
    process.exit(1);
  }
}
