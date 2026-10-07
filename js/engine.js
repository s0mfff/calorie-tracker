// ============================================================
//  Движок «Калории»: расчёт норм, анализ дня, советы.
//  Чистая логика без DOM — тестируется в Node.
// ============================================================

const Engine = (() => {

  // --- Расчёт норм ---

  // Миффлин — Сан Жеор
  function bmr(p) {
    // p: {sex:'m'|'f', age, height(см), weight(кг)}
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return Math.round(p.sex === 'm' ? base + 5 : base - 161);
  }

  const ACTIVITY = {
    sed:    { name: 'Сидячий образ жизни', k: 1.2 },
    light:  { name: 'Лёгкая активность (1–3 тренировки/нед)', k: 1.375 },
    medium: { name: 'Средняя активность (3–5 тренировок/нед)', k: 1.55 },
    high:   { name: 'Высокая активность (6–7 тренировок/нед)', k: 1.725 },
    max:    { name: 'Очень высокая активность (физическая работа)', k: 1.9 },
  };

  const GOALS = {
    lose_fast:  { name: 'Быстрое похудение',      kcalDelta: -700, protein: 2.0, fatG: 0.9, emoji: '🔥' },
    lose:       { name: 'Плавное похудение',      kcalDelta: -450, protein: 1.8, fatG: 1.0, emoji: '📉' },
    maintain:   { name: 'Поддержание веса',       kcalDelta: 0,    protein: 1.6, fatG: 1.0, emoji: '⚖️' },
    gain:       { name: 'Набор массы',            kcalDelta: 300,  protein: 1.8, fatG: 1.1, emoji: '📈' },
    gain_fast:  { name: 'Быстрый набор массы',    kcalDelta: 500,  protein: 2.0, fatG: 1.2, emoji: '🚀' },
  };

  // Суточные цели
  function targets(p) {
    const b = bmr(p);
    const tdee = Math.round(b * ACTIVITY[p.activity].k);
    const g = GOALS[p.goal];
    let kcal = tdee + g.kcalDelta;
    const floor = p.sex === 'f' ? 1200 : 1500;
    if (kcal < floor) kcal = floor;
    const protein = Math.round(p.weight * g.protein);
    const fat = Math.round(p.weight * g.fatG);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { bmr: b, tdee, kcal, protein, fat, carbs, goal: p.goal, goalName: g.name };
  }

  // --- Анализ дня ---

  const MEALS = [
    { id: 'breakfast', name: 'Завтрак',   emoji: '🌅' },
    { id: 'lunch',     name: 'Обед',      emoji: '☀️' },
    { id: 'dinner',    name: 'Ужин',      emoji: '🌆' },
    { id: 'snack',     name: 'Перекус',   emoji: '🍿' },
  ];

  function sumEntries(entries) {
    let kcal = 0, p = 0, f = 0, c = 0;
    for (const e of entries) { kcal += e.kcal; p += e.p; f += e.f; c += e.c; }
    return { kcal, p: round1(p), f: round1(f), c: round1(c), count: entries.length };
  }

  function analyzeDay(opts) {
    // opts: {entries, t, profile, waterMl, hour, junkKcalCalc: fn|null}
    const { entries, t, profile, waterMl = 0, hour = new Date().getHours() } = opts;
    const s = sumEntries(entries);
    const left = {
      kcal: t.kcal - s.kcal,
      p: round1(t.protein - s.p),
      f: round1(t.fat - s.f),
      c: round1(t.carbs - s.c),
    };

    const byMeal = {};
    for (const m of MEALS) byMeal[m.id] = sumEntries(entries.filter(e => e.meal === m.id));

    // «мусорные» калории (фастфуд и сладкое)
    let junkKcal = 0;
    for (const e of entries) {
      if (e.junk) junkKcal += e.kcal;
    }

    const uniqueFoods = new Set(entries.map(e => e.foodId)).size;

    const items = [];
    const add = (type, title, text) => items.push({ type, title, text });

    // 1. Общий баланс калорий
    const kcalPct = s.kcal / t.kcal;
    if (s.kcal > t.kcal * 1.25) {
      add('bad', 'Большой перебор калорий', `Съедено ${s.kcal} ккал при цели ${t.kcal} — превышение на ${s.kcal - t.kcal} ккал. Сегодня уже ничего не добавляй, а завтра вернись к плану без чувства вины: один день не решает ничего.`);
    } else if (s.kcal > t.kcal * 1.1) {
      add('warn', 'Небольшой перебор', `Ты на ${s.kcal - t.kcal} ккал выше цели. Выбери лёгкий ужин (овощи + белок) и добавь 20–30 минут ходьбы.`);
    } else if (s.kcal > t.kcal) {
      add('warn', 'Впритык к цели', `Съедено ${s.kcal} из ${t.kcal} ккал — есть ещё немного запаса, но будь внимателен с вечерними перекусами.`);
    } else if (kcalPct >= 0.9) {
      add('ok', 'Отличный баланс', `Ты в рамках плана: ${s.kcal} из ${t.kcal} ккал. Осталось ${left.kcal} ккал — идеально для лёгкого приёма пищи.`);
    } else if (kcalPct >= 0.6) {
      add('ok', 'Идёшь по плану', `Съедено ${s.kcal} ккал, осталось ${left.kcal}. Ужин ${left.kcal > 500 ? 'полноценный' : 'лёгкий'} вполне укладывается.`);
    } else if (hour >= 20) {
      add('warn', 'Слишком мало еды', `Сегодня только ${s.kcal} ккал — сильно меньше нормы в ${t.kcal}. Постоянный недобор замедляет метаболизм. Даже поздно вечером стоит съесть что-то белковое: творог, кефир, яйца.`);
    } else {
      add('info', 'Пока мало записано', `Записано ${s.kcal} ккал из ${t.kcal}. Не забывай вносить все приёмы пищи — точность данных важнее скорости.`);
    }

    // 2. Белок
    const pPct = t.protein > 0 ? s.p / t.protein : 1;
    if (pPct >= 1) {
      add('ok', 'Белок в норме', `Набрано ${s.p} г из ${t.protein} г — мышцы довольны.`);
    } else if (pPct >= 0.8) {
      add('ok', 'Белок почти набран', `Осталось ${left.p} г белка до нормы ${t.protein} г — добей творогом, яйцами или курицей.`);
    } else {
      add('warn', 'Мало белка', `Съедено ${s.p} г из ${t.protein} г. Белок — главный союзник при ${GOALS[profile.goal].name.toLowerCase().includes('похудение') ? 'похудении' : 'твоей цели'}: он сохраняет мышцы и даёт сытость. Смотри подсказки ниже.`);
    }

    // 3. Распределение по приёмам пищи
    if (s.kcal > 400) {
      if (byMeal.breakfast.kcal === 0 && hour >= 12) {
        add('warn', 'Пропущен завтрак', 'Завтрак разгоняет обмен веществ и снижает риск вечернего переедания. Завтра начни хотя бы с йогурта, яиц или каши.');
      }
      const dShare = byMeal.dinner.kcal / s.kcal;
      if (dShare > 0.45 && byMeal.dinner.kcal > 0) {
        add('warn', 'Тяжёлый ужин', `Ужин — ${Math.round(dShare * 100)}% дневных калорий. Большая еда на ночь ухудшает сон и чаще откладывается в жир. Старайся, чтобы ужин был не тяжелее обеда.`);
      }
      if (byMeal.snack.kcal / s.kcal > 0.35 && byMeal.snack.kcal > 0) {
        add('info', 'Много перекусов', 'Больше трети калорий пришло из перекусов. Часто это «тихие» калории — попробуй заменить их на полноценные приёмы пищи.');
      }
    }

    // 4. Мусорная еда
    if (s.kcal > 0 && junkKcal / s.kcal > 0.3) {
      add('warn', 'Много фастфуда и сладкого', `На них пришлось ${Math.round(junkKcal / s.kcal * 100)}% калорий. Это не катастрофа, но такие продукты почти не дают сытости на свои калории. Попробуй правило: сладкое — только после белкового приёма пищи.`);
    }

    // 5. Вода
    const waterTarget = 1.6 + profile.weight * 0.03; // ~30 мл/кг
    if (waterMl < waterTarget * 1000 * 0.5) {
      add('info', 'Мало воды', `Выпито ${Math.round(waterMl / 250)} стакана(ов). Цель — около ${(waterTarget).toFixed(1)} л в день. Жажда часто маскируется под голод.`);
    }

    // 6. Разнообразие
    if (uniqueFoods > 0 && uniqueFoods < 5 && s.count >= 3) {
      add('info', 'Мало разнообразия', 'В рационе мало разных продуктов. Чем разнообразнее еда, тем больше витаминов и минералов ты получаешь.');
    }

    // 7. Итоговая оценка
    let verdict = 'good';
    const bads = items.filter(i => i.type === 'bad').length;
    const warns = items.filter(i => i.type === 'warn').length;
    if (bads > 0) verdict = 'bad';
    else if (warns >= 2) verdict = 'warn';

    return {
      sum: s, left, byMeal, junkKcal, uniqueFoods, waterMl, waterTarget: round1(waterTarget),
      kcalPct: Math.round(kcalPct * 100),
      items, verdict,
    };
  }

  // Подбор продуктов под оставшиеся макросы
  // need: {kcal, p, f, c}, excludeIds: Set
  function getFoods() {
    if (typeof FOODS !== 'undefined') return FOODS;                       // браузер
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./db.js').FOODS; } catch (e) { return []; }  // Node
    }
    return [];
  }

  function suggestFoods(need, excludeIds = new Set(), count = 5) {
    const junk = new Set(['fastfood', 'sweets']);
    const needProtein = need.p > 15;
    const scored = [];
    for (const f of getFoods()) {
      const [id, name, , cat, kcal100, p100, f100, c100, serving] = f;
      if (excludeIds.has(id)) continue;
      if (junk.has(cat)) continue;
      if (cat === 'drinks' || cat === 'sauce') continue;
      if (need.kcal <= 0 && kcal100 > 0) continue;
      // порция: сколько граммов укладывается в оставшиеся калории
      const maxG = need.kcal > 0 ? Math.max(40, Math.floor(need.kcal / kcal100 * 100)) : 0;
      const g = Math.min(serving, Math.max(40, Math.min(250, maxG || serving)));
      const k = g / 100;
      const sc = { kcal: kcal100 * k, p: p100 * k, f: f100 * k, c: c100 * k };
      // балл: близость к потребностям
      let score = 0;
      score -= Math.abs(sc.kcal - Math.min(need.kcal, sc.kcal || 0)) * 0.02;
      if (needProtein) {
        score += sc.p * 2.2;                        // белок в приоритете
        score -= Math.abs(sc.p - need.p * 0.5) * 0.9;
      } else {
        score += sc.p * 1.2;
      }
      score -= Math.abs(sc.c - need.c * 0.4) * 0.35;
      score -= Math.abs(sc.f - need.f * 0.35) * 0.5;
      score += Math.min(sc.kcal, 200) * 0.06;       // не предлагать крошечные порции
      scored.push({ id, name, emoji: f[9], cat, grams: g, score, ...roundMacros(sc) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count);
  }

  function roundMacros(m) {
    return { kcal: Math.round(m.kcal), p: round1(m.p), f: round1(m.f), c: round1(m.c) };
  }

  // --- Недельная статистика ---
  // days: [{date, entries}]
  function analyzeWeek(days, t) {
    const withData = days.filter(d => d.entries.length > 0);
    if (withData.length === 0) return { avgKcal: 0, streak: 0, activeDays: 0, items: [] };
    const avgKcal = Math.round(withData.reduce((a, d) => a + sumEntries(d.entries).kcal, 0) / withData.length);
    const overDays = withData.filter(d => sumEntries(d.entries).kcal > t.kcal * 1.15).length;
    const underDays = withData.filter(d => sumEntries(d.entries).kcal < t.kcal * 0.75).length;

    // серия ведения дневника: подряд от сегодня (или от вчера, если сегодня ещё не вносили)
    let streak = 0;
    const byDate = Object.fromEntries(days.map(d => [d.date, d]));
    const todayKey = todayISO();
    let startOffset = 0;
    if (!byDate[todayKey] || byDate[todayKey].entries.length === 0) startOffset = 1;
    for (let i = startOffset; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = byDate[key];
      if (day && day.entries.length > 0) streak++;
      else break;
    }

    const items = [];
    if (withData.length >= 3) {
      if (avgKcal <= t.kcal * 1.1 && avgKcal >= t.kcal * 0.8) {
        items.push({ type: 'ok', title: 'Средняя калорийность в норме', text: `В среднем ${avgKcal} ккал/день при цели ${t.kcal} — отличная стабильность.` });
      } else if (avgKcal > t.kcal * 1.15) {
        items.push({ type: 'warn', title: 'В среднем перебор', text: `Средняя калорийность ${avgKcal} при цели ${t.kcal}. Попробуй уменьшить порции на 10–15% и убрать один сладкий/жирный перекус.` });
      } else if (avgKcal < t.kcal * 0.75) {
        items.push({ type: 'warn', title: 'Системный недобор', text: `В среднем ${avgKcal} ккал при цели ${t.kcal}. Слишком жёсткий дефицит замедляет прогресс — добавь белка и полезных жиров.` });
      }
      if (overDays >= 2) items.push({ type: 'info', title: `${overDays} дн. с перебором за неделю`, text: 'Найди, что объединяет эти дни (гости? стресс? мало сна?) — паттерны важнее отдельных срывов.' });
    }
    if (streak >= 3) items.push({ type: 'ok', title: `Серия ${streak} дн. ведения дневника`, text: 'Регулярность — половина успеха. Так держать!' });
    return { avgKcal, streak, activeDays: withData.length, items };
  }

  // --- Статистика веса ---
  // log: { 'YYYY-MM-DD': kg }
  function isoLocal(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function weightStats(log) {
    const toNum = (kg) => typeof kg === 'string' ? parseFloat(String(kg).replace(',', '.')) : kg;
    const points = Object.entries(log || {})
      .map(([date, kg]) => ({ date, kg: Math.round(toNum(kg) * 10) / 10 }))
      .filter(p => p.kg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!points.length) return { points: [], last: null, delta7: null, delta30: null, n: 0 };

    const last = points[points.length - 1];
    const byDate = Object.fromEntries(points.map(p => [p.date, p]));
    const daysBefore = (fromISO, days) => {
      const [y, m, d] = fromISO.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - days);
      return byDate[isoLocal(dt)];
    };
    const w30 = daysBefore(last.date, 30) || points[0];
    const w7 = daysBefore(last.date, 7);
    const delta30 = round1(last.kg - w30.kg);
    const delta7 = w7 ? round1(last.kg - w7.kg) : null;
    const trend = delta30 < -0.3 ? 'down' : delta30 > 0.3 ? 'up' : 'stable';
    return { points, last, delta7, delta30, trend, n: points.length };
  }

  function todayISO() {
    // локальное время, а не UTC
    const d = new Date();
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  return {
    bmr, tdee: (p) => Math.round(bmr(p) * ACTIVITY[p.activity].k),
    ACTIVITY, GOALS, MEALS,
    targets, analyzeDay, analyzeWeek, suggestFoods, sumEntries, weightStats, todayISO, round1,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
