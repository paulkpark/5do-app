// sw.js — 5DO 고급 서비스워커 v1
// 큰 기능 업데이트할 때는 BUILD_ID 값만 날짜처럼 살짝 바꿔주면 됨.
const BUILD_ID = '2026-03-01-v2'; 

const STATIC_CACHE = `5do-static-${BUILD_ID}`;
const RUNTIME_CACHE = `5do-runtime-${BUILD_ID}`;

// ① 앱 껍데기(코어 자산) 목록
// 경로는 실제 배포 주소 구조에 맞춰 수정 가능
const CORE_ASSETS = [
  '/5do.html',
  '/manifest.webmanifest',
  // 필요하다면 여기에 CSS/JS 파일도 추가
  // 예: '/css/5do.css', '/js/some-lib.js'
];

// ② 설치 단계: 코어 파일 캐시 + 즉시 활성화 준비
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(CORE_ASSETS);
    }).catch(err => {
      console.warn('[SW] CORE_ASSETS 캐시 실패:', err);
    })
  );
  self.skipWaiting(); // 새 워커 바로 활성화 대기
});

// ③ 활성화 단계: 이전 버전 캐시 자동 정리
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
  self.clients.claim(); // 바로 페이지 제어
});

// ④ helper: 이 요청이 HTML 내비게이션인지 확인
function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

// ⑤ helper: 정적 리소스(우리 도메인의 css/js/png/webp 등) 판별
function isStaticAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false; // Supabase 등은 제외

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
    path === '/5do' || path === '/5do.html'
  );
}

// ⑥ fetch 가로채기: 요청별 전략 분리
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) 다른 도메인(Supabase 등)은 건드리지 않고 통과시킴
  if (url.origin !== self.location.origin) {
    return; // 기본 fetch 동작
  }

  // 2) HTML 내비게이션 요청은 "네트워크 우선 + 실패 시 캐시" 전략
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // 성공하면 최신 HTML을 static 캐시에 갱신
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => {
          // 오프라인일 때는 캐시에 있던 버전 제공
          return caches.match(req).then(cached => {
            if (cached) return cached;
            // 혹시 못 찾으면 코어 5do.html이라도
            return caches.match('/5do.html');
          });
        })
    );
    return;
  }

  // 3) 정적 자산(css/js/img 등)은 "캐시 우선 + 백그라운드 최신화" 전략
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
        // 캐시가 있으면 즉시 응답 + 백그라운드에서 최신 버전으로 갱신
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4) 나머지(예: API 같은 것)는 "네트워크 우선 + 캐시 fallback" 정도만 적용 (선택사항)
  event.respondWith(
    fetch(req)
      .then(res => {
        // 원하면 여기에 RUNTIME_CACHE 전략 추가 가능
        return res;
      })
      .catch(() => caches.match(req))
  );
});
