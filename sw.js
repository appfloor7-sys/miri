/* 미리 — 서비스 워커: 오프라인 캐시 + 종료 알림 예약 */
const CACHE = 'miri-v3'; // 배포할 때마다 올린다
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
      // cache:'reload' 로 받아야 이전 캐시가 남지 않는다
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
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

/* 문서(navigation)는 네트워크 우선.
   cache-first로 두면 새 버전을 배포해도 기존 사용자가 영원히 구버전에 갇힌다. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetchWithTimeout(req, 3500)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || offlinePage()))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())).catch(() => {});
        return res;
      });
      return hit || net;
    }).catch(() => caches.match('./index.html'))
  );
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(res => { clearTimeout(t); resolve(res); },
                   err => { clearTimeout(t); reject(err); });
  });
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FFF8EE;color:#2E2A26;' +
    'font-family:-apple-system,\"Apple SD Gothic Neo\",sans-serif;text-align:center;padding:24px">' +
    '<div><div style="font-size:52px">🐰</div>' +
    '<h1 style="font-size:19px;margin:14px 0 8px">처음 열 때는 인터넷이 필요해요</h1>' +
    '<p style="color:#6B6259;font-size:14px;line-height:1.6;margin:0">한 번만 열어두면 그 다음부터는<br>인터넷이 없어도 시계가 돌아갑니다.</p>' +
    '<button onclick="location.reload()" style="margin-top:22px;padding:14px 26px;border:0;border-radius:16px;' +
    'background:#F2A93B;color:#3D2F10;font-weight:800;font-size:15px">다시 시도</button></div>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

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
