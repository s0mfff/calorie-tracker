// ============================================================
//  «Калории» — основная логика приложения
// ============================================================

'use strict';

// ---------- Хранилище ----------
const LS_KEY = 'kalorii_state_v1';
const DEFAULT_QUICK = ['grechka_v', 'kur_grud_v', 'tvorog5', 'yabloko', 'banan', 'yaichnica', 'ovs_v', 'pasta_v'];

const S = {
  profile: null,
  entries: [],       // {id, date, meal, foodId, name, emoji, grams, kcal, p, f, c, ts, junk, note}
  water: {},         // { 'YYYY-MM-DD': ml }
  weightLog: {},     // { 'YYYY-MM-DD': kg }
};

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { console.warn('save failed', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d && Array.isArray(d.entries)) {
      S.entries = d.entries;
      S.water = (d.water && typeof d.water === 'object') ? d.water : {};
      S.weightLog = (d.weightLog && typeof d.weightLog === 'object') ? d.weightLog : {};
      S.profile = d.profile || null;
    }
  } catch (e) { console.warn('load failed', e); }
}

// ---------- Утилиты ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function iso(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function todayISO() { return iso(new Date()); }
function fmtNum(x) { return Math.round(x).toLocaleString('ru-RU'); }
function fmtGrams(g) { return (Math.round(g * 10) / 10).toLocaleString('ru-RU'); }

function fmtDateLong(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const s = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtDateShort(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

let uid = 0;
function genId() { return Date.now().toString(36) + '-' + (uid++).toString(36) + '-' + Math.random().toString(36).slice(2, 6); }

// ---------- Глобальные UI-переменные ----------
let activeTab = 'home';
let journalDate = todayISO();       // выбранный день в журнале
let journalChart = 'kcal';          // kcal | weight
let portionCtx = null;              // {food, meal, date}

// ---------- Инициализация ----------
let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  loadState();
  fillSelects();
  bindEvents();
  if (!S.profile) {
    showOnboarding();
  } else {
    showApp();
    // фоновая загрузка нейросети, чтобы первое фото было быстрым
    if (typeof CameraAI !== 'undefined' && CameraAI.getStatus() === 'idle') {
      CameraAI.load().catch(() => {});
    }
  }
  registerSW();
}

function fillSelects() {
  const act = $('#ob-activity'), act2 = $('#set-activity');
  act.innerHTML = act2.innerHTML = Object.entries(Engine.ACTIVITY)
    .map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
  const goal = $('#ob-goal'), goal2 = $('#set-goal');
  goal.innerHTML = goal2.innerHTML = Object.entries(Engine.GOALS)
    .map(([k, v]) => `<option value="${k}">${esc(v.emoji + ' ' + v.name)}</option>`).join('');
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------- Онбординг ----------
function showOnboarding() {
  $('#app').classList.add('hidden');
  $('#onboarding').classList.remove('hidden');
  $('#ob-step-0').classList.remove('hidden');
  $('#ob-step-1').classList.add('hidden');
  $('#ob-step-2').classList.add('hidden');
  $('#ob-activity').value = 'light';
  $('#ob-goal').value = 'lose';
}

let obSex = 'm';
function obPreview() {
  const p = {
    sex: obSex,
    age: +$('#ob-age').value || 30,
    height: +$('#ob-height').value || 175,
    weight: +$('#ob-weight').value || 70,
    activity: $('#ob-activity').value,
    goal: $('#ob-goal').value,
  };
  const t = Engine.targets(p);
  $('#ob-targets-preview').innerHTML =
    `Твоя норма — <b>${fmtNum(t.kcal)} ккал</b> в день<br>` +
    `Белки ${t.protein} г · Жиры ${t.fat} г · Углеводы ${t.carbs} г<br>` +
    `<span style="font-size:12px">Обмен веществ: ${t.bmr} ккал · Поддержание: ${t.tdee} ккал</span>`;
}

function finishOnboarding() {
  const name = ($('#ob-name').value || '').trim() || 'Друг';
  const age = +$('#ob-age').value;
  const height = +$('#ob-height').value;
  const weight = +$('#ob-weight').value;
  if (!age || age < 10 || age > 100) return toast('Укажи корректный возраст');
  if (!height || height < 100 || height > 230) return toast('Укажи корректный рост');
  if (!weight || weight < 30 || weight > 300) return toast('Укажи корректный вес');
  S.profile = { name, sex: obSex, age, height, weight, activity: $('#ob-activity').value, goal: $('#ob-goal').value };
  saveState();
  showApp();
  if (typeof CameraAI !== 'undefined' && CameraAI.getStatus() === 'idle') {
    CameraAI.load().catch(() => {});
  }
}

function showApp() {
  $('#onboarding').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderAll();
}

// ---------- Табы ----------
const TAB_TITLES = { home: 'Сегодня', journal: 'Журнал', camera: 'Фото', chat: 'ИИ-чат', advice: 'Советы', settings: 'Ещё' };

function switchTab(tab) {
  activeTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + tab));
  $('#page-title').textContent = TAB_TITLES[tab];
  renderTab(tab);
  window.scrollTo(0, 0);
}

function renderTab(tab) {
  if (tab === 'home') renderHome();
  else if (tab === 'journal') renderJournal();
  else if (tab === 'advice') renderAdvice();
  else if (tab === 'settings') renderSettings();
  else if (tab === 'chat') renderChat();
}

function renderAll() {
  const today = new Date();
  $('#date-label').textContent = today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  renderTab(activeTab);
}

// ---------- Данные дня ----------
function entriesOf(date) { return S.entries.filter(e => e.date === date); }

function dayTotals(date) {
  return Engine.sumEntries(entriesOf(date));
}

function targetsNow() { return Engine.targets(S.profile); }

// ---------- Главная ----------
const RING_C = 2 * Math.PI * 84;

function renderHome() {
  const t = targetsNow();
  const d = dayTotals(todayISO());
  const left = t.kcal - d.kcal;

  // кольцо
  const pct = Math.min(1, d.kcal / t.kcal);
  const ring = $('#ring-val');
  ring.style.strokeDasharray = RING_C;
  ring.style.strokeDashoffset = RING_C * (1 - pct);
  const ratio = d.kcal / t.kcal;
  ring.style.stroke = ratio > 1.15 ? 'var(--red)' : ratio > 1 ? 'var(--orange)' : 'var(--accent)';
  $('#ring-kcal').textContent = fmtNum(d.kcal);
  $('#ring-of').textContent = `из ${fmtNum(t.kcal)} ккал`;
  $('#ring-left').textContent = left >= 0 ? `осталось ${fmtNum(left)}` : `перебор ${fmtNum(-left)}`;

  // макросы
  setMacro('p', d.p, t.protein);
  setMacro('f', d.f, t.fat);
  setMacro('c', d.c, t.carbs);

  // вода
  const wt = Engine.analyzeDay({ entries: entriesOf(todayISO()), t, profile: S.profile }).waterTarget;
  const wMl = S.water[todayISO()] || 0;
  $('#water-val').textContent = `${fmtNum(wMl)} мл`;
  $('#water-fill').style.width = Math.min(100, wMl / (wt * 1000) * 100) + '%';

  // быстрые добавки
  renderQuick();

  // приёмы пищи
  renderMeals($('#meals-today'), todayISO());
}

function setMacro(key, val, target) {
  $('#mfill-' + key).style.width = Math.min(100, val / target * 100) + '%';
  $('#mval-' + key).textContent = `${Math.round(val)}/${target} г`;
}

function renderQuick() {
  const counts = {};
  for (const e of S.entries) counts[e.foodId] = (counts[e.foodId] || 0) + 1;
  const used = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).filter(id => foodById(id));
  const ids = [...used.slice(0, 6)];
  for (const id of DEFAULT_QUICK) if (!ids.includes(id) && ids.length < 8) ids.push(id);
  const chips = ids.map(id => {
    const f = foodById(id);
    if (!f) return '';
    return `<button class="chip" data-food="${id}" data-grams="${f[8]}" data-meal="snack" data-date="${todayISO()}">${f[9]} ${esc(f[1])}</button>`;
  }).join('');
  $('#quick-chips').innerHTML = chips || '<span style="color:var(--text3);font-size:13px">Добавь продукты через поиск — они появятся здесь</span>';
}

function renderMeals(container, date) {
  const html = Engine.MEALS.map(m => {
    const es = S.entries.filter(e => e.date === date && e.meal === m.id);
    const s = Engine.sumEntries(es);
    const rows = es.map(e => `
      <li class="entry">
        <span class="entry-emoji">${esc(e.emoji || '🍽')}</span>
        <div class="entry-info">
          <div class="entry-name">${esc(e.name)}</div>
          ${e.note ? `<div class="entry-note">📝 ${esc(e.note)}</div>` : ''}
          <div class="entry-meta">${fmtGrams(e.grams)} г · Б ${Math.round(e.p)} · Ж ${Math.round(e.f)} · У ${Math.round(e.c)}</div>
        </div>
        <span class="entry-kcal">${fmtNum(e.kcal)}</span>
        <button class="entry-del" data-del="${e.id}" aria-label="Удалить">✕</button>
      </li>`).join('');
    return `
      <div class="meal-block">
        <div class="meal-head">
          <div class="mh-left"><span>${m.emoji}</span>${m.name}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mh-kcal">${fmtNum(s.kcal)} ккал</span>
            <button class="mh-add" data-add-meal="${m.id}" data-add-date="${date}" aria-label="Добавить">＋</button>
          </div>
        </div>
        ${rows ? `<ul class="entry-list">${rows}</ul>` : ''}
      </div>`;
  }).join('');
  container.innerHTML = html;
}

// ---------- Журнал ----------
function renderJournal() {
  $('#jn-date').textContent = journalDate === todayISO() ? 'Сегодня' : fmtDateLong(journalDate);
  $('#ct-kcal').classList.toggle('active', journalChart === 'kcal');
  $('#ct-weight').classList.toggle('active', journalChart === 'weight');
  if (journalChart === 'weight') renderWeightChart();
  else renderWeekChart();
  renderWeekStats();
  renderMeals($('#journal-meals'), journalDate);
}

function renderWeightChart() {
  const ws = Engine.weightStats(S.weightLog);
  const W = 340, H = 150, padL = 12, padR = 12, padT = 16, padB = 26;
  if (!ws.points.length) {
    $('#week-chart').innerHTML =
      '<div class="card-title">⚖️ Вес за месяц</div>' +
      '<div class="sr-empty">Пока нет записей веса.<br>Добавь их во вкладке «Ещё» → «Записать вес».</div>';
    return;
  }
  const pts = ws.points.slice(-14);
  const kgs = pts.map(p => p.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs);
  const span = Math.max(1.5, (max - min) * 1.3);
  const lo = min - (span - (max - min)) / 2, hi = lo + span;
  const X = (i) => padL + (pts.length === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (pts.length - 1));
  const Y = (kg) => padT + (hi - kg) / span * (H - padT - padB);
  const poly = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => {
    const label = i % Math.max(1, Math.floor(pts.length / 5)) === 0 || i === pts.length - 1 ? fmtDateShort(p.date) : '';
    return `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3.2" fill="var(--accent)"/>
      <text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--text3)">${label}</text>
      <text x="${X(i).toFixed(1)}" y="${(Y(p.kg) - 7).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--text2)">${p.kg.toLocaleString('ru-RU')}</text>`;
  }).join('');
  const d30 = ws.delta30 === null ? '' : ` · за 30 дней <span class="${ws.trend === 'down' ? 'w-delta-down' : ws.trend === 'up' ? 'w-delta-up' : ''}">${ws.delta30 > 0 ? '+' : ''}${ws.delta30.toLocaleString('ru-RU')} кг</span>`;
  $('#week-chart').innerHTML = `
    <div class="card-title">⚖️ Вес за месяц${d30}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      ${pts.length > 1 ? `<polyline points="${poly}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>` : ''}
      ${dots}
    </svg>`;
}

function renderWeekChart() {
  const t = targetsNow();
  const sel = new Date(journalDate + 'T12:00:00');
  const monday = new Date(sel); monday.setDate(sel.getDate() - ((sel.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const key = iso(d);
    days.push({ key, label: fmtDateShort(key), kcal: dayTotals(key).kcal, isToday: key === todayISO() });
  }
  const maxV = Math.max(t.kcal * 1.2, ...days.map(d => d.kcal));
  const W = 340, H = 130, padB = 22, padT = 10;
  const bw = (W - 30) / 7;
  let bars = '';
  days.forEach((d, i) => {
    const h = Math.max(2, d.kcal / maxV * (H - padB - padT));
    const x = 8 + i * bw;
    const y = H - padB - h;
    const color = d.kcal > t.kcal * 1.15 ? 'var(--red)' : d.kcal > t.kcal ? 'var(--orange)' : d.isToday ? 'var(--accent)' : 'var(--blue)';
    bars += `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 10).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${color}" opacity="0.9"/>
      <text x="${(x + (bw - 10) / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--text3)">${d.label}</text>
      <text x="${(x + (bw - 10) / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text2)">${d.kcal ? fmtNum(d.kcal) : ''}</text>`;
  });
  const ty = H - padB - t.kcal / maxV * (H - padB - padT);
  $('#week-chart').innerHTML = `
    <div class="card-title">Неделя · норма ${fmtNum(t.kcal)} ккал</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      <line x1="8" y1="${ty.toFixed(1)}" x2="${W - 8}" y2="${ty.toFixed(1)}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>
      ${bars}
    </svg>`;
}

function renderWeekStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = iso(d);
    days.push({ date: key, entries: entriesOf(key) });
  }
  const w = Engine.analyzeWeek(days, targetsNow());
  $('#week-stats').innerHTML = `
    <div class="ws-item"><div class="ws-val">${fmtNum(w.avgKcal)}</div><div class="ws-label">сред. ккал</div></div>
    <div class="ws-item"><div class="ws-val">${w.activeDays}/7</div><div class="ws-label">дней с записями</div></div>
    <div class="ws-item"><div class="ws-val">🔥 ${w.streak}</div><div class="ws-label">серия, дн.</div></div>`;
}

// ---------- Камера ----------
function handlePhoto(file) {
  const resultCard = $('#cam-result');
  resultCard.classList.remove('hidden');
  $('#cam-preview').src = URL.createObjectURL(file);
  $('#cam-status').textContent = '🧠 Распознаю…';
  $('#cam-results').innerHTML = '<div class="sr-empty">Анализирую фото нейросетью…</div>';
  CameraAI.classify(file).then(({ results, sawHint }) => {
    $('#cam-status').textContent = '';
    if (!results.length) {
      $('#cam-results').innerHTML =
        (sawHint ? '<div class="cam-hint">Похоже, в кадре посуда, а не еда. Сфотографируй блюдо крупнее и ближе.</div>' : '') +
        '<div class="sr-empty">Не удалось распознать блюдо 😔<br><br><button class="btn btn-ghost" id="cam-manual">Найти вручную</button></div>';
      $('#cam-manual').addEventListener('click', () => openSearch({ meal: 'snack', date: todayISO() }));
      return;
    }
    $('#cam-results').innerHTML = results.map(r => `
      <button class="cam-result-item" data-cam-food="${r.foodId}" data-prob="${r.prob}">
        <span class="cri-emoji">${esc(r.emoji)}</span>
        <span class="cri-info">
          <span class="cri-name">${esc(r.name)}</span>
          <span class="cri-bar"><span class="cri-fill" style="width:${r.prob}%"></span></span>
          <span class="cri-prob">${r.prob}% совпадение</span>
        </span>
        <span style="color:var(--text3);font-size:12px">${r.kcal100} ккал/100г</span>
      </button>`).join('') +
      '<button class="btn btn-ghost btn-block" id="cam-manual">Не то? Найти вручную</button>';
    $$('#cam-results .cam-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const f = foodById(el.dataset.camFood);
        if (f) openPortion(f, { meal: 'snack', date: todayISO() });
      });
    });
    $('#cam-manual').addEventListener('click', () => openSearch({ meal: 'snack', date: todayISO() }));
  }).catch(err => {
    console.error(err);
    $('#cam-status').textContent = '';
    $('#cam-results').innerHTML = `
      <div class="cam-hint">Нейросеть не смогла запуститься (${esc(err.message || 'ошибка')}). Возможно, не хватает памяти или модель не загрузилась.</div>
      <button class="btn btn-ghost btn-block" id="cam-manual">Добавить вручную</button>`;
    $('#cam-manual').addEventListener('click', () => openSearch({ meal: 'snack', date: todayISO() }));
  });
}

// ---------- Советы ----------
function renderAdvice() {
  const t = targetsNow();
  const entries = entriesOf(todayISO());
  const d = dayTotals(todayISO());
  const a = Engine.analyzeDay({ entries, t, profile: S.profile, waterMl: S.water[todayISO()] || 0 });

  $('#advice-head').innerHTML = `
    <div class="card-title">⚡ Твоя норма</div>
    <div class="advice-totals">
      <div class="at-item"><div class="at-val">${fmtNum(t.kcal)}</div><div class="at-lab">ккал/день</div></div>
      <div class="at-item"><div class="at-val">${t.protein} г</div><div class="at-lab">белки</div></div>
      <div class="at-item"><div class="at-val">${t.fat} г</div><div class="at-lab">жиры</div></div>
      <div class="at-item"><div class="at-val">${t.carbs} г</div><div class="at-lab">углеводы</div></div>
    </div>
    <div style="text-align:center;color:var(--text3);font-size:12px;margin-top:8px">
      Обмен веществ ${t.bmr} ккал · поддержание ${t.tdee} ккал · цель: ${esc(t.goalName)}
    </div>`;

  const verdicts = { good: '✅', warn: '⚠️', bad: '🚨' };
  const empty = { good: 'Всё отлично! Добавляй записи — совет дня появится, когда будет что анализировать.', warn: 'Пока нечего анализировать. Записывай еду — и получишь персональные советы.', bad: 'Пока нечего анализировать. Записывай еду — и получишь персональные советы.' };
  const items = a.items.map(i => `
    <div class="advice-item ${i.type}">
      <span style="font-size:20px">${i.type === 'ok' ? '✅' : i.type === 'warn' ? '⚠️' : i.type === 'bad' ? '🚨' : '💡'}</span>
      <div><div class="ai-title">${esc(i.title)}</div><div class="ai-text">${esc(i.text)}</div></div>
    </div>`).join('');
  $('#advice-items').innerHTML = items || `<div class="sr-empty">${verdicts[a.verdict]} ${empty[a.verdict]}</div>`;

  // подбор еды
  const eatenIds = new Set(entries.map(e => e.foodId));
  const sugg = Engine.suggestFoods(a.left, eatenIds, 5);
  $('#advice-suggestions').innerHTML = sugg.length ? sugg.map(s => `
    <div class="sug-item">
      <span style="font-size:24px">${esc(s.emoji)}</span>
      <div class="sug-info">
        <div class="sug-name">${esc(s.name)}</div>
        <div class="sug-meta">${s.grams} г · ${fmtNum(s.kcal)} ккал · Б ${Math.round(s.p)} · Ж ${Math.round(s.f)} · У ${Math.round(s.c)}</div>
      </div>
      <button class="sug-add" data-sug="${s.id}" data-sug-grams="${s.grams}">＋</button>
    </div>`).join('') : '<div class="sr-empty">Цель на день набрана — отличная работа! 🎉</div>';

  // неделя
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = iso(d);
    days.push({ date: key, entries: entriesOf(key) });
  }
  const w = Engine.analyzeWeek(days, t);
  const wItems = w.items.map(i => `
    <div class="advice-item ${i.type}">
      <span style="font-size:20px">${i.type === 'ok' ? '✅' : i.type === 'warn' ? '⚠️' : '💡'}</span>
      <div><div class="ai-title">${esc(i.title)}</div><div class="ai-text">${esc(i.text)}</div></div>
    </div>`).join('');
  $('#advice-week-items').innerHTML = wItems || '<div class="sr-empty">Нужно минимум 3 дня записей для недельной статистики.</div>';
}

// ---------- Настройки ----------
function renderSettings() {
  const p = S.profile;
  $('#set-name').value = p.name;
  $('#set-sex').value = p.sex;
  $('#set-age').value = p.age;
  $('#set-height').value = p.height;
  $('#set-weight').value = p.weight;
  $('#set-activity').value = p.activity;
  $('#set-goal').value = p.goal;
  const t = targetsNow();
  $('#set-targets').innerHTML = `
    <div class="card-title">🎯 Расчётные цели</div>
    <div class="advice-totals">
      <div class="at-item"><div class="at-val">${fmtNum(t.bmr)}</div><div class="at-lab">обмен, ккал</div></div>
      <div class="at-item"><div class="at-val">${fmtNum(t.tdee)}</div><div class="at-lab">поддержание</div></div>
      <div class="at-item"><div class="at-val">${fmtNum(t.kcal)}</div><div class="at-lab">цель, ккал</div></div>
    </div>
    <div style="text-align:center;color:var(--text3);font-size:12px;margin-top:8px">
      Б ${t.protein} г · Ж ${t.fat} г · У ${t.carbs} г — пересчитывается автоматически при изменении профиля
    </div>`;
  renderWeightInfo();
}

// ---------- Контекст для ИИ-чата ----------
function getAppContext() {
  if (!S.profile) return null;
  const t = targetsNow();
  const today = todayISO();
  const d = dayTotals(today);
  const ws = Engine.weightStats(S.weightLog);
  return {
    имя: S.profile.name,
    профиль: {
      пол: S.profile.sex === 'm' ? 'мужской' : 'женский',
      возраст: S.profile.age,
      ростСм: S.profile.height,
      весКг: S.profile.weight,
      активность: Engine.ACTIVITY[S.profile.activity].name,
      цель: Engine.GOALS[S.profile.goal].name,
    },
    нормы: { ккалВДень: t.kcal, белкиГ: t.protein, жирыГ: t.fat, углеводыГ: t.carbs },
    сегодня: {
      съеденоКкал: d.kcal,
      белки: d.p, жиры: d.f, углеводы: d.c,
      водаМл: S.water[today] || 0,
      продукты: entriesOf(today).map(e => `${e.name} ${Math.round(e.grams)}г (${e.kcal} ккал)`).join('; ') || 'ещё ничего не записано',
    },
    вес: ws.last ? { текущийКг: ws.last.kg, за30ДнейКг: ws.delta30 } : null,
    время: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}

function saveProfile() {
  const p = S.profile;
  p.name = ($('#set-name').value || '').trim() || 'Друг';
  p.sex = $('#set-sex').value;
  p.age = +$('#set-age').value;
  p.height = +$('#set-height').value;
  p.weight = +$('#set-weight').value;
  p.activity = $('#set-activity').value;
  p.goal = $('#set-goal').value;
  if (!p.age || p.age < 10 || p.age > 100) return toast('Некорректный возраст');
  if (!p.height || p.height < 100 || p.height > 230) return toast('Некорректный рост');
  if (!p.weight || p.weight < 30 || p.weight > 300) return toast('Некорректный вес');
  saveState();
  renderSettings();
  renderHome();
  toast('Профиль сохранён ✅');
}

// ---------- ИИ-чат ----------
const CHAT_PRESETS = [
  'Что мне съесть на ужин?',
  'Проанализируй мой сегодняшний день',
  'Как улучшить мой рацион?',
  'Составь план питания на завтра',
];

function renderChat() {
  const ready = typeof Chat !== 'undefined' && Chat.isReady();
  const haveChat = typeof Chat !== 'undefined';
  $('#chat-welcome').classList.toggle('hidden', ready);
  $('#chat-panel').classList.toggle('hidden', !ready);
  $('#chat-downloading').classList.toggle('hidden', true);

  if (haveChat && !ready) {
    // актуальное состояние селектора модели и кнопки
    const mid = Chat.getModelId();
    const meta = Chat.getModelMeta();
    const downloaded = Chat.wasDownloaded();
    $$('#chat-model .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.m === mid));
    $('#chat-req').innerHTML = `
      <div class="req">📦 Размер модели: <b>~${meta.mb} МБ</b> (скачивается один раз, дальше работает офлайн)</div>
      <div class="req">📱 На iPhone модель работает в стабильном режиме CPU — ответы занимают ~30–90 сек</div>
      <div class="req">💬 История чата хранится до закрытия приложения</div>`;
    $('#btn-chat-download').textContent = downloaded
      ? '🚀 Запустить чат (модель уже на телефоне)'
      : `⬇️ Скачать модель (~${meta.mb} МБ)`;
  }

  if (ready && !$('#chat-log').dataset.rendered) {
    $('#chat-log').dataset.rendered = '1';
    $('#chat-log').innerHTML = '<div class="msg ai">Привет! Я ИИ-диетолог, работаю прямо на твоём телефоне. Я вижу твой дневник, цели и вес. Спроси меня о чём угодно — или нажми на подсказку ниже. 👇</div>';
    $('#chat-presets').innerHTML = CHAT_PRESETS.map(p => `<button class="chip" data-preset="${esc(p)}">${esc(p)}</button>`).join('');
  }
  if (Chat && Chat.getStatus() === 'error') {
    $('#chat-welcome').classList.remove('hidden');
  }
}

function appendChatMsg(role, text) {
  const log = $('#chat-log');
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

async function startChatDownload() {
  $('#chat-error').classList.add('hidden');
  $('#chat-welcome').classList.add('hidden');
  $('#chat-downloading').classList.remove('hidden');
  $('#btn-chat-cancel').classList.add('hidden');
  $('#chat-dl-fill').style.width = '0%';
  try {
    await Chat.download((text, pct) => {
      $('#chat-dl-status').textContent = text;
      if (pct !== null && pct !== undefined) $('#chat-dl-fill').style.width = Math.max(2, pct) + '%';
    });
    renderChat();
    toast('Модель загружена — можно общаться 🤖');
  } catch (e) {
    console.error(e);
    $('#chat-downloading').classList.add('hidden');
    $('#chat-welcome').classList.remove('hidden');
    const msg = e && e.message ? e.message : 'неизвестная ошибка';
    toast('Не удалось загрузить модель: ' + msg);
    const err = $('#chat-error');
    err.textContent = '⚠️ Не удалось загрузить модель: ' + msg + '. Проверь интернет и свободное место на телефоне, затем попробуй ещё раз.';
    err.classList.remove('hidden');
  }
}

async function sendChatMessage(text) {
  const q = (text || '').trim();
  if (!q) return;
  if (!Chat.isReady()) return;
  const input = $('#chat-input');
  input.value = '';
  appendChatMsg('user', q);
  const typing = appendChatMsg('ai', '…думаю…');
  typing.classList.add('typing');
  $('#chat-send').disabled = true;
  try {
    const answer = await Chat.ask(q);
    typing.classList.remove('typing');
    typing.textContent = answer;
  } catch (e) {
    typing.classList.remove('typing');
    typing.textContent = '⚠️ Ошибка генерации: ' + (e && e.message ? e.message : 'неизвестно') + '. Попробуй ещё раз.';
  } finally {
    $('#chat-send').disabled = false;
    typing.scrollIntoView && typing.scrollIntoView({ block: 'nearest' });
  }
}

// ---------- Поиск ----------
let searchCtx = { meal: 'snack', date: todayISO() };
let searchCat = null;

function openSearch(ctx = {}) {
  searchCtx = { meal: ctx.meal || 'snack', date: ctx.date || todayISO() };
  searchCat = null;
  const modal = $('#modal-search');
  modal.classList.remove('hidden');
  renderCats();
  runSearch('');
  $('#search-input').value = '';
  setTimeout(() => $('#search-input').focus(), 60);
}

function renderCats() {
  const all = `<button class="chip ${searchCat === null ? 'active' : ''}" data-cat="">Все</button>`;
  const rest = Object.entries(CATS).map(([k, v]) =>
    `<button class="chip ${searchCat === k ? 'active' : ''}" data-cat="${k}">${v.emoji} ${esc(v.name)}</button>`).join('');
  $('#search-cats').innerHTML = all + rest;
  $$('#search-cats .chip').forEach(b => b.addEventListener('click', () => {
    searchCat = b.dataset.cat || null;
    renderCats();
    runSearch($('#search-input').value);
  }));
}

function runSearch(q) {
  let list;
  if (searchCat) list = foodsByCat(searchCat).slice(0, 40);
  else list = searchFoods(q, 40);
  if (!q && searchCat === null) {
    // популярное: сначала частые у пользователя
    const counts = {};
    for (const e of S.entries) counts[e.foodId] = (counts[e.foodId] || 0) + 1;
    list.sort((a, b) => (counts[b[0]] || 0) - (counts[a[0]] || 0));
  }
  const html = list.slice(0, 30).map(f => `
    <button class="sr-item" data-food="${f[0]}">
      <span class="sr-emoji">${f[9]}</span>
      <span class="sr-info">
        <span class="sr-name">${esc(f[1])}</span>
        <span class="sr-meta">${CATS[f[3]].name} · порция ~${f[8]} г</span>
      </span>
      <span class="sr-kcal">${f[4]} ккал</span>
    </button>`).join('');
  $('#search-results').innerHTML = html ||
    '<div class="sr-empty">Ничего не нашлось. Попробуй другое слово: «гречка», «суп», «яблоко»…</div>';
  $$('#search-results .sr-item').forEach(el => {
    el.addEventListener('click', () => {
      const f = foodById(el.dataset.food);
      if (!f) return;
      closeSearch();
      openPortion(f, searchCtx);
    });
  });
}

function closeSearch() { $('#modal-search').classList.add('hidden'); }

// ---------- Порция ----------
function openPortion(food, ctx = {}) {
  portionCtx = { food, meal: ctx.meal || 'snack', date: ctx.date || todayISO() };
  $('#portion-emoji').textContent = food[9];
  $('#portion-name').textContent = food[1];
  $('#portion-grams').value = food[8];
  $('#portion-note').value = '';
  // пресеты
  const presets = [...new Set([50, 100, food[8], 150, 200, 250])].sort((a, b) => a - b).slice(0, 5);
  $('#portion-presets').innerHTML = presets.map(g => `<button class="chip" data-g="${g}">${g} г</button>`).join('');
  // приём пищи
  $('#portion-meal').innerHTML = Engine.MEALS.map(m =>
    `<button class="seg-btn ${m.id === portionCtx.meal ? 'active' : ''}" data-meal="${m.id}">${m.emoji} ${m.name}</button>`).join('');
  $('#portion-date').value = portionCtx.date;
  updatePortionMacros();
  $('#modal-portion').classList.remove('hidden');
  setTimeout(() => $('#portion-grams').select(), 80);
}

function updatePortionMacros() {
  if (!portionCtx) return;
  const g = Math.max(1, +$('#portion-grams').value || 0);
  const m = calcMacros(portionCtx.food, g);
  $('#portion-macros').innerHTML = `
    <div class="pm-kcal">${fmtNum(m.kcal)} <span style="font-size:15px;color:var(--text2)">ккал</span></div>
    <div class="pm-line">Белки <b>${m.p} г</b> · Жиры <b>${m.f} г</b> · Углеводы <b>${m.c} г</b></div>`;
}

function addPortion() {
  if (!portionCtx) return;
  const g = Math.max(1, +$('#portion-grams').value || 0);
  if (!g) return toast('Укажи вес');
  const m = calcMacros(portionCtx.food, g);
  const f = portionCtx.food;
  const note = ($('#portion-note').value || '').trim().slice(0, 120) || null;
  S.entries.push({
    id: genId(),
    date: portionCtx.date,
    meal: portionCtx.meal,
    foodId: f[0],
    name: f[1],
    emoji: f[9],
    grams: g,
    kcal: m.kcal, p: m.p, f: m.f, c: m.c,
    junk: JUNK_CATS.has(f[3]),
    note,
    ts: Date.now(),
  });
  saveState();
  $('#modal-portion').classList.add('hidden');
  renderAll();
  toast(`${f[9]} ${fmtNum(m.kcal)} ккал добавлено`);
}

// ---------- Вода ----------
function addWater(delta) {
  const key = todayISO();
  S.water[key] = Math.max(0, (S.water[key] || 0) + delta);
  saveState();
  renderHome();
}

// ---------- Вес ----------
function openWeightModal() {
  $('#weight-kg').value = S.profile ? S.profile.weight : '';
  $('#weight-date').value = todayISO();
  $('#modal-weight').classList.remove('hidden');
  setTimeout(() => $('#weight-kg').select(), 80);
}

function saveWeight() {
  const kg = parseFloat(String($('#weight-kg').value || '').replace(',', '.'));
  if (!kg || kg < 30 || kg > 300) return toast('Укажи корректный вес');
  const date = $('#weight-date').value || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('Укажи корректную дату');
  S.weightLog[date] = Math.round(kg * 10) / 10;
  if (S.profile) S.profile.weight = Math.round(kg * 10) / 10; // текущий вес = последняя запись
  saveState();
  $('#modal-weight').classList.add('hidden');
  renderAll();
  toast(`Вес ${Math.round(kg * 10) / 10} кг записан ⚖️`);
}

function renderWeightInfo() {
  const ws = Engine.weightStats(S.weightLog);
  if (!ws.points.length) {
    $('#set-weight-info').innerHTML = 'Записей пока нет. Взвешивайся раз в неделю утром — так ты увидишь реальную динамику.';
    return;
  }
  const d30 = ws.delta30 === null ? '' :
    `<div>за 30 дней: <span class="${ws.trend === 'down' ? 'w-delta-down' : ws.trend === 'up' ? 'w-delta-up' : ''}">${ws.delta30 > 0 ? '+' : ''}${ws.delta30.toLocaleString('ru-RU')} кг</span></div>`;
  $('#set-weight-info').innerHTML =
    `<div>Текущий: <b>${ws.last.kg.toLocaleString('ru-RU')} кг</b> <span style="color:var(--text3);font-size:12px">(${fmtDateShort(ws.last.date)})</span></div>` +
    d30 +
    `<div style="color:var(--text3);font-size:12px">Всего записей: ${ws.n}</div>`;
}

// ---------- Удаление ----------
function deleteEntry(id) {
  confirmDialog('Удалить запись?').then(ok => {
    if (!ok) return;
    S.entries = S.entries.filter(e => e.id !== id);
    saveState();
    renderAll();
    toast('Запись удалена');
  });
}

// ---------- Экспорт / импорт ----------
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kalorii-backup-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Файл выгружен');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.entries)) throw new Error('bad format');
      S.entries = d.entries.map(e => ({
        ...e,
        id: e.id || genId(),
        date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
        meal: Engine.MEALS.some(m => m.id === e.meal) ? e.meal : 'snack',
        name: String(e.name || 'Продукт').slice(0, 80),
        emoji: String(e.emoji || '🍽').slice(0, 8),
        grams: Math.min(5000, Math.max(1, +e.grams || 100)),
        kcal: +e.kcal || 0, p: +e.p || 0, f: +e.f || 0, c: +e.c || 0,
        junk: !!e.junk, ts: +e.ts || Date.now(),
        note: e.note ? String(e.note).slice(0, 120) : null,
      }));
      S.water = (d.water && typeof d.water === 'object') ? d.water : {};
      S.weightLog = (d.weightLog && typeof d.weightLog === 'object') ? d.weightLog : {};
      if (d.profile) {
        S.profile = { ...S.profile, ...d.profile };
        if (!['m', 'f'].includes(S.profile.sex)) S.profile.sex = 'm';
        S.profile.activity = Engine.ACTIVITY[S.profile.activity] ? S.profile.activity : 'light';
        S.profile.goal = Engine.GOALS[S.profile.goal] ? S.profile.goal : 'maintain';
      }
      saveState();
      renderAll();
      toast(`Импортировано записей: ${S.entries.length}`);
    } catch (err) {
      toast('Файл повреждён или не подходит');
    }
  };
  reader.readAsText(file);
}

// ---------- Диалог подтверждения ----------
let confirmResolve = null;
function confirmDialog(text) {
  $('#confirm-text').textContent = text;
  $('#modal-confirm').classList.remove('hidden');
  return new Promise(res => { confirmResolve = res; });
}

// ---------- Тост ----------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ---------- События ----------
function bindEvents() {
  // табы
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // поиск
  $('#btn-search-top').addEventListener('click', () => openSearch());
  $('#search-close').addEventListener('click', closeSearch);
  $('#search-input').addEventListener('input', e => runSearch(e.target.value));
  $('#modal-search').addEventListener('click', e => { if (e.target === e.currentTarget) closeSearch(); });

  // порция
  $('#portion-close').addEventListener('click', () => $('#modal-portion').classList.add('hidden'));
  $('#modal-portion').addEventListener('click', e => { if (e.target === e.currentTarget) $('#modal-portion').classList.add('hidden'); });
  $('#portion-grams').addEventListener('input', updatePortionMacros);
  $('#portion-add').addEventListener('click', addPortion);
  $('#portion-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    $('#portion-grams').value = b.dataset.g;
    updatePortionMacros();
  });
  $$('.g-btn').forEach(b => b.addEventListener('click', () => {
    const g = Math.max(1, (+$('#portion-grams').value || 0) + (+b.dataset.dg));
    $('#portion-grams').value = g;
    updatePortionMacros();
  }));
  $('#portion-meal').addEventListener('click', e => {
    const b = e.target.closest('[data-meal]');
    if (!b) return;
    portionCtx.meal = b.dataset.meal;
    $$('#portion-meal .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  });
  $('#portion-date').addEventListener('change', e => { portionCtx.date = e.target.value; });

  // вода
  $('#water-card').addEventListener('click', e => {
    const b = e.target.closest('[data-water]');
    if (b) addWater(+b.dataset.water);
  });

  // быстрые добавки + "+" у приёмов пищи
  document.addEventListener('click', e => {
    const q = e.target.closest('[data-food]');
    if (q) {
      const f = foodById(q.dataset.food);
      if (f) openPortion(f, { meal: q.dataset.meal || 'snack', date: q.dataset.date || todayISO() });
      return;
    }
    const add = e.target.closest('[data-add-meal]');
    if (add) {
      openSearch({ meal: add.dataset.addMeal, date: add.dataset.addDate || todayISO() });
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) { deleteEntry(del.dataset.del); return; }
    const sug = e.target.closest('[data-sug]');
    if (sug) {
      const f = foodById(sug.dataset.sug);
      if (f) openPortion(f, { meal: 'snack', date: todayISO() });
    }
  });

  // камера
  $('#btn-cam-shot').addEventListener('click', () => $('#cam-input').click());
  $('#btn-cam-gallery').addEventListener('click', () => $('#cam-input-gallery').click());
  $('#cam-input').addEventListener('change', e => { if (e.target.files[0]) handlePhoto(e.target.files[0]); e.target.value = ''; });
  $('#cam-input-gallery').addEventListener('change', e => { if (e.target.files[0]) handlePhoto(e.target.files[0]); e.target.value = ''; });

  // журнал
  $('#jn-prev').addEventListener('click', () => { journalDate = shiftDate(journalDate, -1); renderJournal(); });
  $('#jn-next').addEventListener('click', () => { journalDate = shiftDate(journalDate, 1); renderJournal(); });
  $('#jn-today').addEventListener('click', () => { journalDate = todayISO(); renderJournal(); });
  $('#ct-kcal').addEventListener('click', () => { journalChart = 'kcal'; renderJournal(); });
  $('#ct-weight').addEventListener('click', () => { journalChart = 'weight'; renderJournal(); });

  // вес
  $('#btn-add-weight').addEventListener('click', openWeightModal);
  $('#weight-close').addEventListener('click', () => $('#modal-weight').classList.add('hidden'));
  $('#modal-weight').addEventListener('click', e => { if (e.target === e.currentTarget) $('#modal-weight').classList.add('hidden'); });
  $('#weight-save').addEventListener('click', saveWeight);
  $('#weight-kg').addEventListener('keydown', e => { if (e.key === 'Enter') saveWeight(); });

  // ИИ-чат
  $('#btn-chat-download').addEventListener('click', startChatDownload);
  $('#chat-model').addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b || typeof Chat === 'undefined') return;
    Chat.setModelId(b.dataset.m);
    renderChat();
  });
  $('#chat-send').addEventListener('click', () => sendChatMessage($('#chat-input').value));
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage($('#chat-input').value); });
  $('#chat-clear').addEventListener('click', () => {
    if (typeof Chat !== 'undefined') Chat.resetChat();
    $('#chat-log').dataset.rendered = '';
    renderChat();
  });
  $('#chat-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (b) sendChatMessage(b.dataset.preset);
  });

  // настройки
  $('#btn-save-profile').addEventListener('click', saveProfile);
  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-input').click());
  $('#import-input').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#btn-reset').addEventListener('click', () => {
    confirmDialog('Удалить ВСЕ данные: профиль, записи, воду?\nЭто действие нельзя отменить.').then(ok => {
      if (!ok) return;
      localStorage.removeItem(LS_KEY);
      location.reload();
    });
  });

  // подтверждение
  $('#confirm-cancel').addEventListener('click', () => { $('#modal-confirm').classList.add('hidden'); confirmResolve && confirmResolve(false); });
  $('#confirm-ok').addEventListener('click', () => { $('#modal-confirm').classList.add('hidden'); confirmResolve && confirmResolve(true); });

  // онбординг
  $('#ob-sex').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    obSex = b.dataset.v;
    $$('#ob-sex .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    obPreview();
  });
  $('#ob-next-0').addEventListener('click', () => {
    $('#ob-step-0').classList.add('hidden');
    $('#ob-step-1').classList.remove('hidden');
  });
  $('#ob-back-1').addEventListener('click', () => {
    $('#ob-step-1').classList.add('hidden');
    $('#ob-step-0').classList.remove('hidden');
  });
  $('#ob-next-1').addEventListener('click', () => {
    $('#ob-step-1').classList.add('hidden');
    $('#ob-step-2').classList.remove('hidden');
    obPreview();
  });
  $('#ob-activity').addEventListener('change', obPreview);
  $('#ob-goal').addEventListener('change', obPreview);
  $('#ob-finish').addEventListener('click', finishOnboarding);
}

function shiftDate(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return iso(dt);
}

// ---------- Старт ----------
document.addEventListener('DOMContentLoaded', boot);
