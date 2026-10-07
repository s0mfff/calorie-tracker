// Smoke-тест UI: полный цикл приложения в jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://example.com/app/',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));

// заглушки для tf/mobilenet — модель в jsdom не грузим
window.tf = { setBackend: async () => {}, ready: async () => {} };
window.mobilenet = { load: async () => { throw new Error('no model in jsdom'); } };
window.scrollTo = () => {}; // в jsdom не реализован

// загружаем скрипты приложения одним eval — так const-биндинги делят общий скоуп
// (в реальном браузере отдельные <script> дают тот же эффект через глобальную лексическую область)
const bundle = ['js/db.js', 'js/engine.js', 'js/camera.js', 'js/chat.js', 'js/app.js'].map(read).join('\n;\n');
window.eval(bundle);

const $ = (s) => window.document.querySelector(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const txt = (el) => (el ? el.textContent : '').replace(/\u00A0/g, ' ');
let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗ FAIL:', msg); failed++; }
};

// --- старт ---
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await sleep(30);

ok(!$('#onboarding').classList.contains('hidden'), 'онбординг показан при первом запуске');
ok($('#app').classList.contains('hidden'), 'приложение скрыто до онбординга');

// --- шаг 0: имя и пол ---
$('#ob-name').value = 'Тест';
$('#ob-sex [data-v="f"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#ob-next-0').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(!$('#ob-step-1').classList.contains('hidden'), 'шаг 2 онбординга открыт');

// --- шаг 1: параметры ---
$('#ob-age').value = '30';
$('#ob-height').value = '165';
$('#ob-weight').value = '65';
$('#ob-next-1').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(10);
ok(!$('#ob-step-2').classList.contains('hidden'), 'шаг 3 онбординга открыт');
ok(txt($('#ob-targets-preview')).includes('1 434'), 'предпросмотр цели: 1434 ккал');

// --- финиш ---
$('#ob-finish').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(30);
ok(!$('#app').classList.contains('hidden'), 'приложение открыто после онбординга');
ok($('#onboarding').classList.contains('hidden'), 'онбординг скрыт');
ok(txt($('#ring-of')).includes('1 434'), 'кольцо показывает цель 1434 ккал');
ok($('#ring-kcal').textContent === '0', 'съедено 0 ккал');
ok($('#quick-chips').querySelectorAll('.chip').length >= 6, 'быстрые кнопки сформированы');

// --- добавление еды через быструю кнопку ---
const chip = $('#quick-chips [data-food]');
ok(!!chip, 'есть быстрая кнопка');
chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(!$('#modal-portion').classList.contains('hidden'), 'модалка порции открыта');
ok($('#portion-name').textContent.length > 3, 'название продукта заполнено');
$('#portion-grams').value = '100';
$('#portion-grams').dispatchEvent(new window.Event('input', { bubbles: true }));
ok($('#portion-macros').textContent.includes('101'), 'макросы 100 г гречки = 101 ккал');
$('#portion-add').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok($('#modal-portion').classList.contains('hidden'), 'модалка закрылась');
ok($('#ring-kcal').textContent === '101', 'кольцо обновилось до 101 ккал');
ok($('#meals-today').textContent.includes('Гречка'), 'запись появилась в списке');

// --- вода ---
$('#water-card [data-water="250"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(10);
ok(txt($('#water-val')) === '250 мл', 'вода +250 мл');

// --- советы ---
window.switchTab('advice');
await sleep(20);
ok(!$('#tab-advice').classList.contains('hidden'), 'вкладка советы открыта');
ok(txt($('#advice-head')).includes('1 434'), 'шапка советов с нормой');
ok($('#advice-items').children.length >= 1, 'советы дня сформированы');
ok($('#advice-suggestions').children.length >= 1, 'подсказки «что съесть» сформированы');

// --- журнал ---
window.switchTab('journal');
await sleep(20);
ok($('#week-chart svg').querySelectorAll('rect').length === 7, 'недельный график: 7 столбцов');
ok($('#journal-meals').textContent.includes('Гречка'), 'журнал показывает сегодняшнюю запись');

// --- настройки ---
window.switchTab('settings');
await sleep(20);
ok($('#set-name').value === 'Тест', 'профиль в настройках');
$('#set-weight').value = '64';
$('#btn-save-profile').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(window.localStorage.getItem('kalorii_state_v1').includes('"weight":64'), 'профиль сохранился');

// --- удаление записи ---
window.switchTab('home');
await sleep(20);
const del = $('#meals-today [data-del]');
ok(!!del, 'есть кнопка удаления');
del.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(!$('#modal-confirm').classList.contains('hidden'), 'подтверждение удаления открыто');
$('#confirm-ok').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(40);
ok($('#ring-kcal').textContent === '0', 'после удаления снова 0 ккал');

// --- поиск ---
$('#btn-search-top').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(!$('#modal-search').classList.contains('hidden'), 'поиск открыт');
$('#search-input').value = 'борщ';
$('#search-input').dispatchEvent(new window.Event('input', { bubbles: true }));
ok($('#search-results').textContent.includes('Борщ'), 'поиск «борщ» находит борщ');
const sr = $('#search-results .sr-item');
sr.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok($('#modal-search').classList.contains('hidden'), 'поиск закрылся после выбора');
ok(!$('#modal-portion').classList.contains('hidden'), 'открылась модалка порции для борща');
$('#portion-add').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok($('#ring-kcal').textContent !== '0', 'борщ добавлен (кольцо обновилось)');

// --- вес ---
window.switchTab('settings');
await sleep(20);
$('#btn-add-weight').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(!$('#modal-weight').classList.contains('hidden'), 'модалка веса открыта');
$('#weight-kg').value = '70.5';
$('#weight-save').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(30);
ok(txt($('#set-weight-info')).includes('70,5'), 'вес записан и показан в настройках');
window.switchTab('journal');
await sleep(20);
$('#ct-weight').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(!!$('#week-chart svg'), 'график веса отрисован');
$('#ct-kcal').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok($('#week-chart svg').querySelectorAll('rect').length === 7, 'обратно на график калорий');

// --- заметка ---
window.switchTab('home');
await sleep(20);
$('#quick-chips [data-food]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
$('#portion-note').value = 'домашний рецепт';
$('#portion-grams').value = '100';
$('#portion-add').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(txt($('#meals-today')).includes('📝 домашний рецепт'), 'заметка отображается у записи');

// --- ИИ-чат ---
window.switchTab('chat');
await sleep(30);
ok(!$('#tab-chat').classList.contains('hidden'), 'вкладка ИИ открыта');
ok(!$('#chat-welcome').classList.contains('hidden'), 'чат показывает приветствие');
ok($('#chat-panel').classList.contains('hidden'), 'панель чата скрыта до загрузки модели');
ok(txt($('#chat-welcome')).includes('260'), 'по умолчанию быстрая модель (~260 МБ)');
ok(txt($('#btn-chat-download')).includes('260'), 'кнопка показывает размер 260 МБ');
ok($('#chat-error').classList.contains('hidden'), 'блок ошибки скрыт');
// переключение на умную модель
$('#chat-model [data-m="qwen"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(txt($('#btn-chat-download')).includes('460'), 'после выбора умной модели — 460 МБ');
$('#chat-model [data-m="smol"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(20);
ok(txt($('#btn-chat-download')).includes('260'), 'обратно на быструю модель');
// флаг «модель скачана» меняет кнопку
window.localStorage.setItem('kalorii_chat_ready', 'smol');
await sleep(10);
window.switchTab('home'); await sleep(10);
window.switchTab('chat'); await sleep(20);
ok(txt($('#btn-chat-download')).includes('модель уже на телефоне'), 'кнопка восстановления после скачивания');
window.localStorage.removeItem('kalorii_chat_ready');

// --- итог ---
ok(errors.length === 0, 'нет непойманных ошибок JS: ' + (errors.join(' | ') || 'чисто'));

console.log(failed === 0 ? '\nSMOKE-ТЕСТ UI ПРОЙДЕН ✅' : `\nПРОВАЛОВ: ${failed} ❌`);
process.exit(failed ? 1 : 0);
