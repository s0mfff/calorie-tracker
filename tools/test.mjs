// Юнит-тесты движка и базы (запуск: node tools/test.mjs)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const DB = require('../js/db.js');
const Engine = require('../js/engine.js');

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗ FAIL:', msg); failed++; }
}

console.log('--- База продуктов ---');
ok(DB.FOODS.length >= 250, `в базе >= 250 продуктов (фактически ${DB.FOODS.length})`);
const ids = new Set();
let dup = false;
for (const f of DB.FOODS) {
  if (ids.has(f[0])) { dup = true; console.error('    дубль id:', f[0]); }
  ids.add(f[0]);
}
ok(!dup, 'нет дубликатов id');
let bad = 0;
for (const f of DB.FOODS) {
  const [id, name, aliases, cat, kcal, p, f_, c, serving, emoji] = f;
  if (!id || !name || !cat || !DB.CATS[cat]) bad++;
  if (!(kcal >= 0 && kcal < 1000)) bad++;
  if (!(p >= 0 && f_ >= 0 && c >= 0)) bad++;
  if (!(serving > 0 && serving <= 2000)) bad++;
  if (!emoji) bad++;
}
ok(bad === 0, `все записи валидны (ошибок: ${bad})`);
// алкоголь: калории из этанола, формула БЖУ неприменима
const ALCOHOL = new Set(['vino_suh', 'vino_sl', 'vodka']);
for (const f of DB.FOODS) {
  if (ALCOHOL.has(f[0])) continue;
  if (Math.abs(f[5] * 4 + f[6] * 9 + f[7] * 4 - f[4]) > 60) {
    console.error(`    подозрительные макросы: ${f[1]} (ккал ${f[4]}, расчёт ${(f[5]*4+f[6]*9+f[7]*4).toFixed(0)})`);
    bad++;
  }
}
ok(bad === 0, 'калорийность согласуется с БЖУ');
ok(DB.foodById('grechka_v')[1] === 'Гречка варёная', 'foodById работает');
ok(DB.searchFoods('гречка').some(f => f[0] === 'grechka_v'), 'поиск «гречка» находит гречку');
ok(DB.searchFoods('селедка').some(f => f[0] === 'seld_sol'), 'поиск с ё→е нормализацией работает');
ok(DB.searchFoods('кола зеро').some(f => f[0] === 'kola_z'), 'поиск по фразе работает');
const m = DB.calcMacros(DB.foodById('grechka_v'), 150);
ok(m.kcal === 152, `calcMacros 150г гречки = 152 ккал (получено ${m.kcal})`);

console.log('--- Движок ---');
const prof = { sex: 'f', age: 30, height: 165, weight: 65, activity: 'light', goal: 'lose' };
const t = Engine.targets(prof);
ok(t.bmr > 1300 && t.bmr < 1500, `BMR в диапазоне (${t.bmr})`);
ok(t.tdee > t.bmr, `TDEE > BMR (${t.tdee})`);
ok(t.kcal >= 1200 && t.kcal < t.tdee, `цель похудения < TDEE и >= 1200 (${t.kcal})`);
ok(t.protein > 90 && t.protein < 150, `белок ~1.8 г/кг (${t.protein} г)`);
ok(t.fat > 50 && t.fat < 90, `жиры разумны (${t.fat} г)`);
ok(t.carbs > 50, `углеводы положительные (${t.carbs} г)`);
ok(Math.abs((t.protein * 4 + t.fat * 9 + t.carbs * 4) - t.kcal) < 15, 'БЖУ сходится с калориями цели');

const profM = { sex: 'm', age: 28, height: 180, weight: 80, activity: 'medium', goal: 'gain' };
const tM = Engine.targets(profM);
ok(tM.kcal >= 1500 && tM.kcal > tM.tdee, `набор массы даёт профицит (${tM.kcal} > ${tM.tdee})`);

// анализ дня
const mk = (meal, kcal, p, f, c, junk = false, foodId = 'x') => ({ id: foodId + meal, date: Engine.todayISO(), meal, foodId, name: 'Т', grams: 100, kcal, p, f, c, junk, ts: 1 });
const day = [
  mk('breakfast', 400, 30, 12, 45, false, 'ovs_m'),
  mk('lunch', 600, 40, 20, 60, false, 'plov_k'),
  mk('dinner', 300, 25, 10, 30, false, 'kur_grud_v'),
];
const a = Engine.analyzeDay({ entries: day, t, profile: prof, waterMl: 1000 });
ok(a.sum.kcal === 1300, `сумма калорий дня (${a.sum.kcal})`);
ok(a.verdict === 'good' || a.verdict === 'warn', `вердикт допустимый (${a.verdict})`);
ok(a.items.length >= 1, 'есть советы');
ok(a.left.p < t.protein, 'остаток белка корректен');

// пустой день
const a0 = Engine.analyzeDay({ entries: [], t, profile: prof, waterMl: 0, hour: 14 });
ok(a0.items.length >= 1 && a0.sum.kcal === 0, 'пустой день анализируется');

// перебор
const day2 = [mk('dinner', t.kcal * 1.3, 50, 60, 100, true, 'pizza_pep')];
const a2 = Engine.analyzeDay({ entries: day2, t, profile: prof, waterMl: 500, hour: 21 });
ok(a2.verdict === 'bad', 'сильный перебор = bad');
ok(a2.items.some(i => i.type === 'bad'), 'есть bad-совет');

// подсказки еды
const sugg = Engine.suggestFoods({ kcal: 400, p: 30, f: 10, c: 30 }, new Set());
ok(sugg.length === 5, `5 подсказок (${sugg.length})`);
ok(sugg.every(s => s.grams > 0 && s.kcal > 0), 'подсказки с граммами и ккал');
ok(sugg.every(s => ['fastfood', 'sweets', 'drinks', 'sauce'].every(c => s.cat !== c)), 'подсказки без джанка');

// неделя
const days = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(); d.setDate(d.getDate() - i);
  const z = n => String(n).padStart(2, '0');
  days.push({ date: `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`, entries: i <= 2 ? [mk('lunch', 500, 30, 15, 50)] : [] });
}
const w = Engine.analyzeWeek(days, t);
ok(w.activeDays === 3, `активных дней 3 (${w.activeDays})`);
ok(w.streak === 3, `серия 3 (${w.streak})`);

// даты
ok(Engine.todayISO().match(/^\d{4}-\d{2}-\d{2}$/), 'todayISO формат');

console.log('--- Вес ---');
const dKey = (offset) => {
  const dt = new Date(); dt.setDate(dt.getDate() - offset);
  const z = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}`;
};
const wlog = {};
wlog[dKey(30)] = 80;
wlog[dKey(7)] = 78.5;
wlog[dKey(0)] = 77.2;
const ws = Engine.weightStats(wlog);
ok(ws.n === 3 && ws.last.kg === 77.2, 'weightStats: последний вес');
ok(Math.abs(ws.delta30 - (-2.8)) < 0.01, `weightStats: дельта за 30 дней (${ws.delta30})`);
ok(Math.abs(ws.delta7 - (-1.3)) < 0.01, `weightStats: дельта за 7 дней (${ws.delta7})`);
ok(ws.trend === 'down', 'weightStats: тренд вниз');
ok(Engine.weightStats({}).n === 0, 'weightStats: пустой лог');
ok(Engine.weightStats({ [dKey(0)]: '71,3' }).last.kg === 71.3, 'weightStats: запятая в значении');
ok(Engine.weightStats({ [dKey(0)]: 70, [dKey(3)]: 70.1 }).trend === 'stable', 'weightStats: стабильный тренд');

console.log(failed === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ ✅' : `\nПРОВАЛОВ: ${failed} ❌`);
process.exit(failed ? 1 : 0);
