# Jumping Pod

PS1 클래식 **Jumping Flash!** (1995) 에서 영감을 받은 웹 기반 1인칭 3D 점프 플랫포머.
프레임워크·빌드 스텝 없이 Three.js ES 모듈만으로 동작하는 완전한 정적 웹 게임입니다.

> 이 폴더는 **독립 프로젝트**입니다 — 5do-app 코드와 아무런 의존 관계가 없으며,
> 폴더째 별도 저장소로 옮기면 그대로 동작합니다.

## 실행

```bash
npm install   # express 하나만 설치
npm start     # http://localhost:3000
```

게임 자체는 100% 정적(`public/`)이므로 아무 정적 호스팅(GitHub Pages, Render Static,
Netlify, S3...)에 `public/` 폴더만 올려도 됩니다. `server.js`는 로컬 실행/Render
web-service용 편의 서버일 뿐입니다.

## Netlify 배포

가장 빠른 방법 — **드래그 앤 드롭**: https://app.netlify.com/drop 에 `public/` 폴더를
끌어다 놓으면 즉시 URL이 발급됩니다.

Git 연동 배포: Netlify에서 저장소를 연결하고 **Base directory를 `jumping-pod`**로
지정하면 `netlify.toml`(publish=`public`, 캐시 헤더, sw.js no-cache)이 자동 적용됩니다.

## PWA (홈 화면 설치 + 오프라인)

`manifest.webmanifest` + `sw.js`(전체 에셋 프리캐시)가 포함되어 있어:
- **iPhone/iPad**: Safari에서 공유 → **홈 화면에 추가** → 주소창 없는 전체 화면 앱으로 실행
- **Android/Chrome**: 설치 배너 또는 메뉴의 "앱 설치"
- 한 번 로드하면 **완전 오프라인**으로도 플레이 가능 (비행기 모드 OK)

게임 파일을 수정해 배포할 때는 `sw.js`의 `CACHE_VERSION`을 올려야
설치된 클라이언트에 업데이트가 전파됩니다.

## 게임 방법

하늘에 떠 있는 섬들을 뛰어다니며 **젯 포드**를 모두 모으면 **EXIT 포털**이 열립니다.
포털에 도달하면 스테이지 클리어 — 총 3개 스테이지 (Sky Garden → Neon Drift → Babel Tower).

| 입력 | 동작 |
|---|---|
| `W A S D` / 방향키 | 이동 |
| 마우스 (클릭으로 잠금) | 시점 |
| `SPACE` | 점프 — 공중에서 다시 누르면 2단·3단 점프 |
| `ESC` | 일시정지 |

모바일: 왼쪽 가상 스틱(이동) + 오른쪽 드래그(시점) + JUMP 버튼.

원작의 시그니처 메커닉을 재현했습니다:
- **3단 점프** — 점프를 겹칠수록 더 높이 (12.5 → 18 → 25 m/s)
- **고공 정점 자동 하향 시점** — 2단 점프 이상의 정점에서 카메라가 자동으로 발밑을 향해,
  블롭 섀도(착지 가이드)를 보며 착지 지점을 조준
- 적 밟기(스톰프), 바운스 패드, 무빙 플랫폼, 낙하 리스폰

## 기술 구성 (모던 렌더링 & 텍스처 매핑)

- **Three.js r160** (ES 모듈, `public/vendor/`에 벤더링 — CDN/네트워크 의존 없음)
- **PBR 렌더링**: `MeshStandardMaterial` (albedo/emissive/roughness 맵, metalness)
- **프로시저럴 텍스처 매핑**: 모든 텍스처를 Canvas 2D로 런타임 생성
  (네온 그리드 플랫폼, 스트라이프 패널, 잔디, 바운스 패드 링, 젯 포드, 적 얼굴)
  — 밉맵 + 8x 이방성 필터링, sRGB 컬러스페이스
- **포스트 프로세싱**: UnrealBloomPass (네온·포털·포드 글로우) + OutputPass
- **ACES Filmic 톤매핑**, PCF 소프트 섀도(2048px, 플레이어 추적 섀도 카메라)
- **커스텀 스카이 셰이더** (그라디언트 돔 + 수평선 글로우, 스테이지별 팔레트),
  별 파티클, 드리프트 구름, FogExp2
- 물리: 자체 AABB 플랫폼 충돌 (탑승 플랫폼 델타 상속, 헤드 범프, 사이드 푸시아웃,
  코요테 타임), WebAudio 신시사이저 SFX

## 구조

```
jumping-pod/
├── server.js           # 정적 서버 (선택)
├── package.json
└── public/
    ├── index.html      # UI 셸 (HUD, 오버레이, 터치 컨트롤)
    ├── game.js         # 게임 엔진 전체 (렌더링·물리·스테이지·사운드)
    └── vendor/         # three.js r160 + postprocessing 애드온 (벤더링)
```

스테이지는 `game.js`의 `STAGES` 배열에 데이터로 정의되어 있어
플랫폼/포드/적/출구 좌표만 추가하면 새 스테이지를 만들 수 있습니다.

## 프리미엄 스테이지 (4+) — 로그인 + 구독 게이트

스테이지 1–3은 무료(오프라인 포함), **스테이지 4+는 5DO Pro 구독자 전용**입니다.

- 프리미엄 스테이지 데이터는 이 정적 사이트에 **포함되지 않고** 5do-app 서버의
  `arcade-stages.js`(리포 루트, public 밖)에만 존재합니다 — 클라이언트 소스를
  분석해도 콘텐츠를 얻을 수 없습니다.
- 게임 → Supabase OAuth 로그인(5DO 앱과 동일 계정: Google/Kakao/Apple) →
  `GET https://5do.app/api/arcade/stages` (Bearer JWT) → 서버가 토큰 검증 +
  `profiles.tier === 'pro'` 확인 후에만 스테이지 JSON 반환.
- 미구독자는 게임 내 게이트 화면에서 바로 Stripe 결제
  (`POST /api/arcade/checkout`, 기존 5DO Pro 구독 상품 재사용 — 웹훅이
  `profiles.tier`를 갱신하면 즉시 잠금 해제).
- CORS는 게임 오리진(`jumpingpod.netlify.app`, `localhost`)만 허용.
  커스텀 도메인 추가 시 서버 env `ARCADE_EXTRA_ORIGIN` 설정.
- 진행도(`jfw-progress`)는 localStorage에 저장 — 타이틀의 **이어하기** 버튼과
  OAuth/결제 리다이렉트 왕복 후 게이트 복귀에 사용됩니다.

**운영 체크리스트**: ① Supabase 대시보드 → Auth → URL Configuration →
Redirect URLs에 게임 오리진 추가 ② 5do-app 서버 배포(Render) ③ 게임 재배포.
