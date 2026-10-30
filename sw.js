/* 미리 — 서비스 워커: 오프라인 캐시 + 종료 알림 예약 */
const CACHE = 'miri-v2';
const ASSETS = [
  './index.html',
  './css/app.css',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504 });
      });
    })
  );
});

/* ---------- 종료 알림 예약 ----------
   페이지가 닫혀도 알림이 가도록 워커에서 타이머를 잡는다.
   워커가 종료되면 예약도 사라지므로, 페이지는 복귀 시 만료를 다시 확인한다. */

const timers = new Map();

function schedule({ at, body, tag }) {
  const key = tag || String(at) + body;
  const delay = Math.max(0, at - Date.now());
  if (delay > 6 * 3600 * 1000) return;

  if (timers.has(key)) clearTimeout(timers.get(key));

  const id = setTimeout(() => {
    timers.delete(key);
    self.registration.showNotification('미리', {
      body,
      tag: key,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      renotify: false
    }).catch(() => {});
  }, delay);

  timers.set(key, id);
}

self.addEventListener('message', e => {
  const data = e.data || {};
  if (data.type === 'schedule') {
    schedule(data);
    // 예약 접수 여부를 페이지에 알려준다 (계측·디버깅용)
    self.clients.matchAll({ includeUncontrolled: true }).then(cs => {
      cs.forEach(c => c.postMessage({ type: 'scheduled', at: data.at, tag: data.tag }));
    }).catch(() => {});
    return;
  }
  if (data.type === 'cancel') {
    timers.forEach((id, key) => {
      if (!data.tag || key.indexOf(data.tag) === 0) {
        clearTimeout(id);
        timers.delete(key);
      }
    });
    return;
  }
  if (data.type === 'cancelAll') {
    timers.forEach(id => clearTimeout(id));
    timers.clear();
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
