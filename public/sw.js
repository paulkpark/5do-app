// sw.js — 5DO 서비스워커 v4 (2026-04-20)
// Cold-start hardening: every awaited boot step now has a timeout,
// auth UI paints before session restore, staged retries for library + login.
const BUILD_ID = '2026-04-20-v7';

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

  // HTML 내비게이션: 네트워크 우선, 실패 시 캐시
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('/5do.html'))
        )
    );
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
