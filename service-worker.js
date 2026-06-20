/* ============================================================
 * service-worker.js — オフライン対応（PWA）
 *  アプリ本体（App Shell）をキャッシュし、オフラインでも起動できるようにする。
 *  ユーザーデータは localStorage 側にあるため SW では扱わない。
 * ============================================================ */
const CACHE = 'vocab-book-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './presets.js',
  './wordbank.js',
  './storage.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // ナビゲーション要求はネット優先、失敗したらキャッシュの index.html を返す
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // それ以外はキャッシュ優先（無ければ取得してキャッシュ）
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
