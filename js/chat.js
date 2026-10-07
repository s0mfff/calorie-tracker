// ============================================================
//  ИИ-чат: локальная LLM Qwen 2.5 0.5B через transformers.js.
//  Модель скачивается один раз (~460 МБ) и работает офлайн.
// ============================================================

const Chat = (() => {
  const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
  const CDN_BUNDLE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

  let generator = null;
  let status = 'idle';      // idle | downloading | ready | generating | error
  let history = [];         // [{role:'user'|'assistant', content}]
  let busy = false;

  function getStatus() { return status; }
  function isReady() { return !!generator; }

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
      'Отвечай на русском, кратко (до 120 слов), конкретно и по делу. ' +
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
    try {
      onProgress && onProgress('Загружаю библиотеку…', null);
      const { pipeline, env } = await loadTransformers();
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
      onProgress && onProgress(`Скачиваю модель (~460 МБ)${device === 'webgpu' ? ', GPU ускорение' : ', режим CPU (медленнее)'}…`, 0);
      generator = await pipeline('text-generation', MODEL, {
        dtype: 'q4f16',
        device,
        progress_callback: (info) => {
          if (!info || !info.status) return;
          if (info.status === 'progress' && typeof info.progress === 'number') {
            const pct = Math.round(info.progress);
            onProgress && onProgress(`Загрузка: ${info.file || ''} ${pct}%`, pct);
          } else if (info.status === 'done') {
            onProgress && onProgress('Финальная подготовка…', 100);
          }
        },
      });
      status = 'ready';
      onProgress && onProgress('Готово!', 100);
      return generator;
    } catch (e) {
      status = 'error';
      generator = null;
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

  // Вопрос модели. onToken(text, isDone)
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
        max_new_tokens: 150,
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

  return { download, ask, getStatus, isReady, resetChat };
})();
