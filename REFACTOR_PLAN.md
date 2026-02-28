# 5DO App 리팩터링 계획서

## 1. 앱 요약

**5DO**는 Supabase Storage에 저장된 음악 파일을 재생하는 PWA입니다.

주요 기능:
- 🎵 음악 라이브러리 브라우징 및 재생
- 📋 플레이리스트 관리 (로컬 + Supabase 클라우드 동기화)
- 🌊 오실로스코프 시각화
- 🔢 주파수 생성기
- ⭐ 즐겨찾기
- 🌐 다국어 (한국어/영어)
- 📱 PWA

---

## 2. 현재 아키텍처 문제점

### 🔴 심각

**1. God File - `5do.html` 5,026줄**
한 파일 안에:
- CSS: 736줄
- HTML: ~380줄  
- JavaScript: 3,894줄 (8개 `<script>` 블록!)

**2. `<script>` 블록 8개**
기능 추가할 때마다 새 블록을 끝에 붙인 전형적인 스파게티 패턴.

**3. 전역 변수 남용**
892개 변수/함수 대부분이 전역 스코프. Supabase 키도 JS 최상단에 하드코딩.

**4. 함수 중복 선언 버그**
`setCurrentTrack()`이 1762줄, 1832줄에 두 번 선언됨. 실제 버그 가능성.

**5. `styles.css`가 13줄짜리 껍데기**
진짜 스타일은 전부 HTML `<style>` 태그 안에 있음.

---

## 3. 제안 파일 구조

```
public/
├── index.html          (마크업만, ~150줄)
├── css/
│   ├── base.css        (변수, 리셋)
│   ├── layout.css      (헤더, 레이아웃)
│   ├── components.css  (버튼, 카드, 탭, 모달)
│   └── player.css      (플레이어 UI)
└── js/
    ├── config.js       (상수, Supabase URL)
    ├── i18n.js         (다국어 데이터 + applyLang)
    ├── supabase.js     (API 호출)
    ├── player.js       (오디오 엔진)
    ├── library.js      (라이브러리 UI) ← 이미 있음
    ├── playlist.js     (플레이리스트 CRUD)
    ├── oscilloscope.js ← 이미 있음 ✅
    ├── generator.js    (주파수 생성기)
    ├── ui.js           (모달, 토스트, 페이지 전환)
    └── app.js          (초기화, 이벤트 바인딩)
```

---

## 4. 리팩터링 우선순위

**Phase 1 — 버그 수정 (즉시)**
1. `setCurrentTrack` 중복 선언 제거
2. Supabase 키 분리 (config.js 또는 서버사이드 주입)

**Phase 2 — CSS 분리 (2~3시간)**
3. `<style>` 블록 → css/ 폴더로 추출

**Phase 3 — JS 모듈 분리 (4~8시간)**
4. config.js → i18n.js → supabase.js → player.js → playlist.js → ui.js → app.js 순서로 분리

**Phase 4 — 품질 개선 (선택)**
5. 에러 처리 일관성 통일
6. localStorage 접근 래퍼화
