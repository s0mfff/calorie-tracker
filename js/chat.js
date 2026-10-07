// ============================================================
//  ИИ-чат: локальная LLM через transformers.js.
//  Три модели на выбор. Скачиваются один раз, работают офлайн.
//  Мини (SmolLM2-135M, ~112 МБ) — по умолчанию: самый стабильный
//  вариант для iPhone (малый расход памяти).
// ============================================================

const Chat = (() => {
  const MODELS = {
    mini: {
      id: 'onnx-community/SmolLM2-135M-Instruct-ONNX',
      name: 'Мини (SmolLM2-135M)',
      mb: 112,
    },
    smol: {
      id: 'onnx-community/SmolLM2-360M-Instruct-ONNX',
      name: 'Быстрая (SmolLM2-360M)',
      mb: 260,
    },
    qwen: {
      id: 'onnx-community/Qwen2.5-0.5B-Instruct',
      name: 'Умная (Qwen 2.5 0.5B)',
      mb: 460,
    },
  };
  const CDN_BUNDLE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
  const LS_MODEL = 'kalorii_chat_model';
  const LS_READY = 'kalorii_chat_ready';
  const LS_LASTLOG = 'kalorii_chat_lastlog';

  let generator = null;
  let loadedModelId = null;
  let status = 'idle';      // idle | downloading | ready | generating | error
  let history = [];         // [{role:'user'|'assistant', content}]
  let busy = false;

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  function getModelId() {
    const v = lsGet(LS_MODEL);
    return MODELS[v] ? v : 'mini';
  }
  function setModelId(id) {
    if (!MODELS[id]) id = 'mini';
    lsSet(LS_MODEL, id);
    if (lsGet(LS_READY) !== id) lsDel(LS_READY); // другая модель — флаг не валиден
  }
  function getModelMeta() { return MODELS[getModelId()]; }

  // Флаг «модель уже скачана» — переживает перезапуск приложения (в т.ч. краш iOS)
  function wasDownloaded() { return lsGet(LS_READY) === getModelId(); }
  function markDownloaded() { lsSet(LS_READY, getModelId()); }

  // Журнал этапов загрузки — для диагностики после внезапных перезапусков
  function logStep(text) { lsSet(LS_LASTLOG, text); }
  function getLastLog() { return lsGet(LS_LASTLOG); }
  function clearLastLog() { lsDel(LS_LASTLOG); }

  function getStatus() { return status; }
  function isReady() { return !!generator; }
  function getLoadedModelId() { return loadedModelId; }

  function isIOS() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPad в режиме десктопа
    return /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  }

  function pickDevice() {
    // На iOS — только WASM: WebGPU на больших моделях роняет процесс Safari.
    if (isIOS()) return 'wasm';
    return (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
  }

  // Локальный бандл, при отсутствии — CDN (service worker закэширует)
  async function loadTransformers() {
    try {
      return await import('vendor/transformers.min.js');
    } catch (e) {
      console.warn('Локальный бандл transformers не найден, беру с CDN', e && e.message);
      return await import(CDN_BUNDLE);
    }
  }

  function buildSystem() {
    let s = 'Ты — дружелюбный ИИ-диетолог внутри локального приложения «Калории» для iPhone. ' +
      'Отвечай на русском, кратко (до 80 слов), конкретно и по делу. ' +
      'Не нравоучай. Если в контексте есть данные пользователя — используй их в ответе. ' +
      'Если данных не хватает для ответа — задай уточняющий вопрос. ' +
      'Не выдумывай точные цифры, которых нет в контексте. ' +
      'Если спрашивают про здоровье/болезни — советуй обратиться к врачу.';
    if (typeof window.getAppContext === 'function') {
      try {
        const ctx = window.getAppContext();
        if (ctx) s += '\n\nДАННЫЕ ПОЛЬЗОВАТЕЛЯ (актуальны на сейчас):\n' + JSON.stringify(ctx, null, 1);
      } catch (e) { /* игнорируем */ }
    }
    return s;
  }

  // Загрузка модели с прогрессом. onProgress(statusText, percent0to100|null)
  async function download(onProgress) {
    if (generator) return generator;
    if (status === 'downloading') return null;
    status = 'downloading';
    const modelId = getModelId();
    const meta = MODELS[modelId];
    const say = (text, pct) => { logStep(text); onProgress && onProgress(text, pct); };
    try {
      say('Загружаю библиотеку…', null);
      const { pipeline, env } = await loadTransformers();
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      // Меньше потоков = меньше пик памяти (важно на iOS)
      try { if (env.backends && env.backends.onnx && env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1; } catch (e) { /* ignore */ }
      const device = pickDevice();
      say(`Скачиваю модель (${meta.name}, ~${meta.mb} МБ)…`, 0);
      generator = await pipeline('text-generation', meta.id, {
        dtype: 'q4f16',
        device,
        progress_callback: (info) => {
          if (!info || !info.status) return;
          if (info.status === 'progress' && typeof info.progress === 'number') {
            const pct = Math.round(info.progress);
            say(`Загрузка: ${info.file || ''} ${pct}%`, pct);
            // Файлы уже в кэше браузера — даже если iOS перезапустит приложение
            // на этапе инициализации, повторная загрузка не понадобится.
            if (pct >= 100) markDownloaded();
          } else if (info.status === 'done') {
            say('Финальная подготовка…', 100);
            markDownloaded();
          }
        },
      });
      loadedModelId = modelId;
      status = 'ready';
      markDownloaded();
      clearLastLog();
      say('Готово!', 100);
      return generator;
    } catch (e) {
      status = 'error';
      generator = null;
      logStep('Ошибка: ' + (e && e.message ? e.message : 'неизвестно'));
      throw e;
    }
  }

  // Нормализация ответа v3/v4 transformers.js
  function extractAnswer(out) {
    if (Array.isArray(out) && out.length) {
      const first = out[0];
      if (first && Array.isArray(first.generated_text)) {
        // чат-формат: [{role, content}...]
        const lastMsg = [...first.generated_text].reverse().find(m => m.role === 'assistant');
        return lastMsg ? lastMsg.content : '';
      }
      if (first && typeof first.generated_text === 'string') return first.generated_text;
      if (first && first.role === 'assistant' && typeof first.content === 'string') return first.content;
      if (typeof first === 'string') return first;
      if (first && first.content && typeof first.content === 'string') return first.content;
    }
    return '';
  }

  // Вопрос модели
  async function ask(question) {
    if (!generator) throw new Error('Модель не загружена');
    if (busy) throw new Error('Уже отвечаю');
    busy = true;
    status = 'generating';
    try {
      const messages = [
        { role: 'system', content: buildSystem() },
        ...history.slice(-6),
        { role: 'user', content: question },
      ];
      const opts = {
        max_new_tokens: 110,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
      };
      const out = await generator(messages, opts);
      const answer = extractAnswer(out);
      if (!answer) throw new Error('Пустой ответ модели');
      history.push({ role: 'user', content: question });
      history.push({ role: 'assistant', content: answer });
      return answer;
    } finally {
      busy = false;
      status = generator ? 'ready' : 'error';
    }
  }

  function resetChat() {
    history = [];
  }

  return {
    download, ask, getStatus, isReady, resetChat,
    getModelId, setModelId, getModelMeta, wasDownloaded, markDownloaded,
    getLastLog, clearLastLog, getLoadedModelId,
    MODELS,
  };
})();
