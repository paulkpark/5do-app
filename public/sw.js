// sw.js — 5DO 서비스워커 v4 (2026-04-20)
// Cold-start hardening: every awaited boot step now has a timeout,
// auth UI paints before session restore, staged retries for library + login.
const BUILD_ID = '2026-04-22-v29';

const STATIC_CACHE  = `5do-static-${BUILD_ID}`;
const RUNTIME_CACHE = `5do-runtime-${BUILD_ID}`;

// 앱 셸 (핵심 자산) — 최초 SW install 시 프리캐시
const CORE_ASSETS = [
  '/5do.html',
  '/manifest.webmanifest',
  // CSS
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/player.css',
  '/css/generator-metallic.css',
  // JS — 모든 모듈을 콜드스타트 지연 없이 보장
  '/js/config.js',
  '/js/supabase-api.js',
  '/js/subscription.js',
  '/js/i18n.js',
  '/js/splash.js',
  '/js/player.js',
  '/js/favorites.js',
  '/js/menu.js',
  '/js/theme.js',
  '/js/mixer.js',
  '/js/playlist.js',
  '/js/account-ui.js',
  '/js/auth.js',
  // Standalone pages
  '/cosmic',
  '/biofield',
  '/product/qtx',
  '/freq-meter',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      // addAll은 하나라도 실패하면 전체 실패 → 개별 시도로 관대하게 처리
      Promise.all(CORE_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] core asset cache failed:', url, err))
      ))
    )
  );
  self.skipWaiting();
});

// 페이지에서 'skipWaiting' 메시지를 보내면 대기 중인 SW가 즉시 활성화되어
// 다음 reload 시 새 버전이 적용됨. 5do.html의 SW 업데이트 감지 로직과 짝.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            (key.startsWith('5do-static-') || key.startsWith('5do-runtime-')) &&
            key !== STATIC_CACHE && key !== RUNTIME_CACHE
          )
          .map(key => {
            console.log('[SW] 오래된 캐시 삭제:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return (
    path.endsWith('.html') ||
    path.endsWith('.css')  ||
    path.endsWith('.js')   ||
    path.endsWith('.png')  ||
    path.endsWith('.jpg')  ||
    path.endsWith('.jpeg') ||
    path.endsWith('.svg')  ||
    path.endsWith('.webp') ||
    path.endsWith('.ico')  ||
    path.endsWith('.woff')  ||
    path.endsWith('.woff2') ||
    path === '/5do' || path === '/5do.html'
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Supabase 등 외부 도메인은 통과 (기본 fetch)
  if (url.origin !== self.location.origin) return;

  // HTML 내비게이션: 네트워크-레이스 (2.5s) → 실패/지연 시 캐시 폴백, 백그라운드에서 캐시 갱신.
  // 이전 "네트워크 우선 + 실패 시 캐시" 전략은 네트워크가 느릴 때(콜드스타트/PWA 구동 초기)
  // 사용자가 최대 수십 초까지 빈 화면을 봐야 했음. 2.5초 안에 네트워크가 응답하지 않으면
  // 캐시된 5do.html을 즉시 반환하고, 네트워크 응답은 백그라운드에서 캐시만 갱신.
  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      const networkPromise = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone)).catch(() => {});
          }
          return res;
        });
      try {
        const res = await Promise.race([
          networkPromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow network')), 2500)),
        ]);
        return res;
      } catch (_) {
        // Network slow or failed — serve cache now, keep fetch running to update cache.
        networkPromise.catch(() => {});
        const cached = await caches.match(req);
        if (cached) return cached;
        const shell = await caches.match('/5do.html');
        if (shell) return shell;
        // No cache at all — wait for the network (may still resolve)
        return networkPromise;
      }
    })());
    return;
  }

  // 정적 자산: 캐시 우선, 백그라운드 갱신 (stale-while-revalidate)
  if (isStaticAsset(req)) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req)
          .then(res => {
            if (res && res.status === 200) {
              const resClone = res.clone();
              caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
            }
            return res;
          })
          .catch(() => cached || Promise.reject('offline'));
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 그 외 (API 등): 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
