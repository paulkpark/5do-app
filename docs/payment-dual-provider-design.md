# 결제 이원화 설계안 — 국내 Toss / 해외 Stripe

작성: 2026-07-16 · 대상: `5do-app`

---

## 0. TL;DR

- **국내(KR) 고객 → Toss (KRW)**, **해외 고객 → Stripe (USD)** 로 결제 프로바이더를 분기한다.
- 데이터 모델(`profiles.tier_source = 'stripe'|'toss'|'admin'`, `stripe_customer_id`)과 Stripe 백본(웹훅·체크아웃·포털)은 **이미 존재**한다. 신규 구축이 아니라 **되살리기 + 클라이언트 배선 + 지역 분기**가 핵심.
- 리스크가 가장 큰 지점은 (a) 두 프로바이더 상태를 하나의 `tier/status`로 수렴시키는 것, (b) 해지/포털 흐름을 프로바이더별로 라우팅하는 것.

---

## 1. 현재 상태 (코드 기준)

| 영역 | Toss | Stripe |
|---|---|---|
| 클라이언트 진입 | ✅ `subscription.js` `startCheckout()` (빌링키 자동결제 + 간편결제) | ❌ 미배선 (서버 라우트만 존재) |
| 체크아웃 서버 | ✅ `/api/toss/billing-success`, `/api/toss/payment-success` | ✅ `/api/subscription/checkout` (휴면) |
| 웹훅 | — (Toss는 리다이렉트 기반) | ✅ `/api/webhooks/stripe` (checkout/invoice/subscription 처리) |
| 해지/포털 | ✅ `/api/toss/cancel` | ✅ `/api/subscription/portal` (휴면) |
| 갱신 | ✅ 수동 크론 `/api/toss/renew` (빌링키 재청구) | Stripe 구독 자동갱신 (웹훅 `invoice.paid`) |
| 가격 소스 | ✅ `services/pricing.js` (KRW only) | Stripe Price ID (`STRIPE_PRICE_MONTHLY/YEARLY`, 미설정) |
| 프로필 컬럼 | `toss_customer_key/billing_key/interval` | `stripe_customer_id` |
| 공통 | `tier`, `tier_source`, `subscription_status`, `current_period_end` | 동일 컬럼 공유 |

**결론**: 데이터 모델은 이미 이원화를 전제로 설계됨. Stripe는 "구현은 됐으나 클라이언트에서 아무도 호출하지 않고 환경변수(키/Price)도 미설정"인 휴면 상태.

---

## 2. 설계 원칙

1. **단일 권한 소스**: 앱의 Pro 여부는 항상 `profiles.tier` + `subscription_status` + `current_period_end` (via `services/tier.js` `isProEffective`)로만 판단한다. 어느 프로바이더로 결제했든 이 3개 컬럼으로 수렴.
2. **프로바이더는 결제·해지 경로에만 관여**: `tier_source`가 "이 유저를 어디서 해지/갱신/환불하는가"를 결정.
3. **지역은 기본값, 사용자는 오버라이드 가능**: 자동 감지는 편의일 뿐, 모달에서 통화/프로바이더를 수동 전환할 수 있어야 함(여행·해외 카드 보유 국내인 등).
4. **가격은 서버가 소스 오브 트루스**: KRW는 `pricing.js`, USD는 Stripe Price(대시보드) + `pricing.js` 미러(표시용).

---

## 3. 지역 분기 로직

### 감지 (이미 있는 자원 재사용)
- `i18n.js`의 `detectLangByIp()`가 이미 IP-geo를 호출한다. 동일 신호에서 **country code**를 함께 뽑아 전역 `window.APP_REGION = 'KR' | 'INTL'`로 저장.
- 규칙: `country === 'KR'` → `toss`, 그 외 → `stripe`.
- 폴백 순서: IP-geo → `navigator.language` (`ko*` → KR) → 기본 `INTL`.

### 오버라이드
- 업그레이드 모달 상단에 작은 토글: **"대한민국(₩) / International ($)"**.
- 선택 시 `localStorage.payRegion` 저장, 이후 자동감지보다 우선.

### 프로바이더 결정 함수 (클라이언트)
```js
function resolveProvider() {
  const forced = localStorage.getItem('payRegion');      // 'KR' | 'INTL' | null
  const region = forced || window.APP_REGION || 'INTL';
  return region === 'KR' ? 'toss' : 'stripe';
}
```

---

## 4. 가격 체계

| 플랜 | 국내 (Toss, KRW) | 해외 (Stripe, USD) |
|---|---|---|
| 월간 | ₩9,900 | **$6.99** (확정) |
| 연간 | ₩99,000 | **$69.90** (확정) |

> 연간 = 월 $6.99 × 10 (2개월분 할인). Stripe 수수료 ~2.9%+$0.30 감안 시 월 순수령 ≈ $6.49.

- **KRW**: 기존 `services/pricing.js` 그대로.
- **USD**: Stripe 대시보드에서 Product/Price 생성 → `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` env 설정. `pricing.js`에 표시용 USD 상수 미러 추가:
```js
const PRICES_USD = { monthly: 699, yearly: 6990 }; // 센트 단위, 표시용
```
- 모달은 `resolveProvider()`에 따라 통화/금액 스위칭. `account-ui.js`의 `fmtKRW`를 `fmtPrice(amount, currency)`로 일반화.
- ⚠️ **환율 변동**: USD 고정가 권장(실시간 환율 X). 가격 변경은 Stripe Price 교체로 관리.

---

## 5. 결제 흐름

### 5.1 국내 (Toss) — 변경 없음
기존 `startCheckout('monthly'|'yearly', 'card'|'easy')` 유지.

### 5.2 해외 (Stripe) — 신규 배선
```
[모달: International 선택]
  → SUB.startStripeCheckout(interval)
  → POST /api/subscription/checkout { interval, email, user_id }
  → { url } 수신 → window.location = url   (Stripe Checkout 호스티드 페이지)
  → 결제 완료 → success_url = /5do.html?sub=success
  → 확정은 웹훅(checkout.session.completed)이 tier=pro 반영
```
- Stripe Checkout(호스티드)는 **해외카드·Apple Pay·Google Pay**를 자동 지원. 지역에 따라 **PayPal**도 결제수단으로 활성화 가능(대시보드 설정).
- `mode: 'subscription'`이라 **자동갱신은 Stripe가 처리** → Toss처럼 별도 갱신 크론 불필요.

### 5.3 통합 진입점
`subscription.js`에 얇은 라우터 추가:
```js
async startCheckout(interval, payMethod) {
  if (resolveProvider() === 'stripe') return this.startStripeCheckout(interval);
  return this.startTossCheckout(interval, payMethod); // 기존 로직 이름만 변경
}
```

---

## 6. 해지 / 포털 라우팅

`openPortal()`을 `tier_source` 기준으로 분기:
```js
async openPortal() {
  const src = window.APP_USER?.tier_source;
  if (src === 'stripe') {
    const { url } = await postJSON('/api/subscription/portal', { user_id });
    window.location = url;               // Stripe Customer Portal (해지·카드변경·영수증)
  } else {
    // 기존 Toss 해지 확인 모달 → /api/toss/cancel
  }
}
```
- Stripe Customer Portal이 해지/카드변경/인보이스를 모두 위임 처리 → 별도 UI 최소화.
- 해지 시 공통 규칙: `current_period_end`까지 Pro 유지 (기존 `isProEffective` 로직과 일치, 이미 웹훅 `subscription.deleted`가 처리).

---

## 7. 상태 수렴 (핵심)

두 프로바이더가 같은 컬럼을 쓰므로 충돌 방지 규칙을 명시:

| 이벤트 | 처리 |
|---|---|
| Stripe `checkout.session.completed` / `invoice.paid` | `tier='pro'`, `status='active'`, `tier_source='stripe'`, `current_period_end`=인보이스 기간말 |
| Stripe `subscription.deleted` | `status='canceled'` (period_end 유지) |
| Toss billing 성공 | `tier='pro'`, `tier_source='toss'`, `current_period_end`=+1개월/+1년 |
| **lifetime/admin 유저** | 웹훅·크론 모두 **다운그레이드 금지** (기존 코드에 이미 가드 있음 — 유지·검증) |
| 한 유저가 양쪽 결제 (엣지) | `tier_source` 마지막 성공 프로바이더로 갱신. 이중과금 방지를 위해 **결제 전 이미 active면 모달에서 차단** |

---

## 8. 엣지 케이스

- **국내인이 해외카드만 보유**: 모달 오버라이드로 International(Stripe) 선택 → 해결. (오늘 문의된 "해외카드 안 됨" 케이스의 실질 해법)
- **여행 중 IP가 해외로 잡힘**: 오버라이드 토글로 KR 선택 가능. `localStorage.payRegion` 우선.
- **환불**: Toss는 관리자/Toss 콘솔, Stripe는 대시보드·포털. `subscription_events`에 provider별로 이미 로깅됨.
- **통화 혼동**: 모달에 통화 명시(₩ vs $) + "결제는 선택한 통화로 청구됩니다" 안내.
- **세금/영수증**: Stripe는 Tax·인보이스 자동. 국내 현금영수증은 Toss 정책대로.

---

## 9. 롤아웃 단계

**Phase 0 — 준비 (설정, 코드 무관)**
- [ ] Stripe 계정 활성화(해외 결제 가능 국가 확인), 비즈니스 인증
- [ ] Product/Price 2종(월·연, USD) 생성 → `STRIPE_PRICE_MONTHLY/YEARLY`
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` Render env 설정
- [ ] Stripe 대시보드에서 PayPal/Apple Pay/Google Pay 결제수단 활성화(원하는 범위)
- [ ] 웹훅 엔드포인트 `https://5do.app/api/webhooks/stripe` 등록

**Phase 1 — 서버 검증**
- [ ] 기존 `/api/subscription/checkout`·`portal`·웹훅을 Stripe 테스트 모드로 E2E 검증
- [ ] `pricing.js` USD 미러 추가, 서버 응답에 통화 포함

**Phase 2 — 클라이언트 배선**
- [ ] `APP_REGION` 감지(i18n geo 재사용) + 모달 통화/프로바이더 토글
- [ ] `startCheckout` 라우터 + `startStripeCheckout` 구현
- [ ] `openPortal` 프로바이더 분기
- [ ] `account-ui.js` 가격 표시 통화 일반화(`fmtPrice`)

**Phase 3 — 상태/QA**
- [ ] lifetime 다운그레이드 가드 재검증
- [ ] 이중결제 차단 로직
- [ ] Toss(KR)·Stripe(INTL) 각각 신규구독→해지→기간말 만료 시나리오 QA
- [ ] SW `BUILD_ID` 범프 후 배포

**Phase 4 — 점진 오픈**
- [ ] 해외(en) 유저에게만 Stripe 노출 → 모니터링 → 전체 오픈

---

## 10. 확정된 의사결정 (2026-07-16)

1. **해외 가격(USD)**: 월 **$6.99** / 연 **$69.90** (연 = 월×10, 2개월분 할인).
2. **PayPal**: **Stripe 경유로 충분** — 별도 PayPal 직접 연동 안 함. Stripe 대시보드에서 PayPal 결제수단만 활성화.
3. **감지 기준**: **IP-geo 우선**, 언어(LANG)·`navigator.language`는 폴백.
4. **간편결제 범위**: 해외는 **Stripe의 Apple Pay / Google Pay로 대체**. 카카오·네이버·토스페이는 국내(Toss) 전용 유지.

---

## 부록: 최소 변경 파일 목록

- `services/pricing.js` — USD 미러 + 통화 반환
- `public/js/subscription.js` — `startCheckout` 라우터, `startStripeCheckout`, `openPortal` 분기
- `public/js/account-ui.js` — 통화/프로바이더 토글, `fmtPrice`
- `public/js/i18n.js` — geo에서 country code 추출 → `APP_REGION`
- `server.js` — 기존 Stripe 라우트 검증(대개 변경 최소), 통화 포함 응답
- `public/sw.js` — 배포 시 `BUILD_ID` 범프
- (설정) Render env, Stripe 대시보드
