// ============================================================
//  ИИ-распознавание еды по фото (TensorFlow.js + MobileNetV2).
//  Модель работает полностью локально: vendor/model/*
// ============================================================

// Классы ImageNet (className, которые возвращает MobileNet) -> id продукта в базе
const IMAGENET_TO_FOOD = {
  'pizza, pizza pie': 'pizza_marg',
  'cheeseburger': 'chizburger',
  'hotdog, hot dog, red hot': 'hotdog',
  'French loaf': 'baget',
  'bagel, beigel': 'bublik',
  'pretzel': 'sushki',
  'burrito': 'burrito',
  'carbonara': 'karbonara',
  'consomme': 'sup_kur',
  'hot pot, hotpot': 'solyanka',
  'guacamole': 'guakamole',
  'trifle': 'tort',
  'ice cream, icecream': 'morozh_pl',
  'ice lolly, lolly, lollipop, popsicle': 'morozh_esk',
  'dough': 'bliny',
  'meat loaf, meatloaf': 'kotleta_g',
  'mashed potato': 'pure',
  'red wine': 'vino_suh',
  'espresso': 'kofe',
  'banana': 'banan',
  'Granny Smith': 'yabloko',
  'orange': 'apelsin',
  'lemon': 'limon',
  'fig': 'inzhir',
  'pineapple, ananas': 'ananas',
  'strawberry': 'klubnika',
  'pomegranate': 'granat',
  'corn': 'kukuruza_v',
  'cucumber, cuke': 'ogurec',
  'bell pepper': 'perec',
  'mushroom': 'shamp',
  'cauliflower': 'kap_cv',
  'broccoli': 'brokkoli',
  'zucchini, courgette': 'kabachok',
  'spaghetti squash': 'tykva',
  'acorn squash': 'tykva',
  'butternut squash': 'tykva',
  'artichoke, globe artichoke': 'artishok',
  'cardoon': 'artishok',
  'head cabbage': 'kapusta',
  'custard apple': 'hurma',
  'jackfruit, jak, jack': 'dzhekfrut',
  'beer bottle': 'pivo_sv',
  'beer glass': 'pivo_sv',
  'wine bottle': 'vino_suh',
  'coffee mug': 'kofe',
  'eggnog': 'milkshake',
  'chocolate sauce, chocolate syrup': 'shok_pasta',
  'pop bottle, soda bottle': 'kola',
  'water bottle': 'voda',
  'water jug': 'voda',
  'soup bowl': 'sup_kur',
  'teapot': 'chai',
  'vine tomato': 'pomidor',
  'honeycomb': 'med',
  'potpie': 'pirozh_m',
  'grissini': 'suhari',
};

// Подсказки, если модель увидела посуду, а не еду
const HINT_CLASSES = new Set(['plate', 'tray', 'mixing bowl', 'frying pan, frypan, skillet', 'wok', 'crock pot', 'Dutch oven', 'saltshaker, salt shaker', 'measuring cup', 'table lamp', 'spatula']);

const CameraAI = (() => {
  let model = null;
  let loadingPromise = null;
  let status = 'idle'; // idle | loading | ready | error

  async function load(onProgress) {
    if (model) return model;
    if (loadingPromise) return loadingPromise;
    status = 'loading';
    if (onProgress) onProgress('Загружаю нейросеть…');
    loadingPromise = (async () => {
      try {
        try {
          await tf.setBackend('webgl');
        } catch (e) {
          console.warn('webgl недоступен, переключаюсь на cpu', e);
          await tf.setBackend('cpu');
        }
        await tf.ready();
        model = await mobilenet.load({
          version: 2,
          alpha: 1.0,
          modelUrl: 'vendor/model/model.json',
        });
        status = 'ready';
        return model;
      } catch (e) {
        status = 'error';
        loadingPromise = null;
        throw e;
      }
    })();
    return loadingPromise;
  }

  function getStatus() { return status; }

  // Преобразует файл фото в уменьшенный ImageBitmap (для скорости)
  async function decodeAndResize(file, maxSide = 320) {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    img.close && img.close();
    return canvas;
  }

  // Возвращает [{foodId, name, emoji, kcal100, prob}], отсортированные по вероятности
  async function classify(file, topK = 5) {
    const m = await load();
    const canvas = await decodeAndResize(file);
    // пакет mobilenet сам сделает fromPixels и нормализацию в [-1, 1]
    const preds = await m.classify(canvas, topK + 6);

    const results = [];
    let sawHint = false;
    for (const p of preds) {
      const foodId = IMAGENET_TO_FOOD[p.className];
      if (foodId) {
        const f = foodById(foodId);
        if (f) {
          results.push({
            foodId,
            name: f[1],
            emoji: f[9],
            kcal100: f[4],
            prob: Math.round(p.probability * 100),
          });
        }
      } else if (HINT_CLASSES.has(p.className)) {
        sawHint = true;
      }
    }
    return { results, sawHint };
  }

  return { load, classify, getStatus };
})();
