# Stripe 활성화 체크리스트 — 5DO (해외 결제)

작성: 2026-07-19

**전제**: 한국 법인은 Stripe 직접 가입 불가. → 기존에 **Resona(spooky2web)로 live 전환에 성공한 동일 Stripe 계정**을 5DO에도 재사용한다 (하나의 계정, 여러 제품 = Stripe 표준 사용법).

코드 배선은 완료됨. 아래 대시보드 설정 + Render 환경변수만 넣으면 작동한다.

---

## ⚠️ 공유 계정 주의 — 웹훅 교차 오염 (코드로 방어 완료)

같은 Stripe 계정을 Resona와 5DO가 공유하므로, Stripe 웹훅 이벤트가 **양쪽 서비스로 모두** 전달될 수 있다. 특히 `customer.subscription.*`는 계정 전역 이벤트다.

방어 (이미 구현, `server.js`):
- 5DO 체크아웃은 세션·구독에 `metadata.app='5do'` 를 심는다 (구독 메타는 이후 모든 `customer.subscription.*` 이벤트로 전파됨).
- 웹훅은 **`app='5do'` 이거나 이미 5DO에 연결된 customer**인 이벤트만 처리하고 나머지는 무시(`ignored: not-5do`).
- 위험한 **이메일 폴백 제거** (Resona 결제자가 5DO에 같은 이메일이면 오염될 수 있었음).

→ **Resona 웹훅 설정은 건드리지 말 것.** 5DO용 엔드포인트를 별도로 추가만 하면 된다.

---

## 1. 상품/가격 (Live mode)

Product catalog → Add product:
- Name: `5DO Pro`
- Price 1: **Recurring / $6.99 / USD / Monthly** → `price_...` = `STRIPE_PRICE_MONTHLY`
- Price 2 (Add another price): **Recurring / $69.90 / USD / Yearly** → `price_...` = `STRIPE_PRICE_YEARLY`

> ⚠️ Resona의 Product/Price와 헷갈리지 말 것. 5DO 전용으로 새로 만든다.

## 2. 결제수단

Settings → Payment methods: **Card + PayPal + Apple Pay + Google Pay** 활성화.
(코드가 `automatic_payment_methods: { enabled: true }` 라 켠 수단이 자동 노출된다.)

## 3. API 키

Developers → API keys → **Secret key** (`sk_live_...`) → `STRIPE_SECRET_KEY`.
(호스티드 Checkout이라 publishable key는 불필요. Resona와 동일 계정이면 secret key도 동일 — 재사용 가능.)

## 4. 웹훅 (5DO 전용 엔드포인트 신규 추가)

Developers → Webhooks → **Add endpoint**:
- URL: `https://5do.app/api/webhooks/stripe`
- 이벤트 4개: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
- 저장 후 Signing secret (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`

> Resona 엔드포인트와 **별개**다. secret은 엔드포인트마다 다르므로 5DO용을 따로 복사.

## 5. Render 환경변수 (5do.app 메인 서비스)

```
STRIPE_SECRET_KEY      = sk_live_...      # Resona와 동일 계정이면 같은 값
STRIPE_WEBHOOK_SECRET  = whsec_...        # 5DO 엔드포인트의 것 (신규)
STRIPE_PRICE_MONTHLY   = price_...(월 $6.99)
STRIPE_PRICE_YEARLY    = price_...(연 $69.90)
```
저장 → 자동 재배포. (akashic 서브앱엔 불필요.)

## 6. 테스트 순서

1. **테스트 모드**로 먼저: test 키 + test price + test 웹훅으로 위를 한 번 돌려보고, 카드 `4242 4242 4242 4242` 로 결제 → `profiles.tier=pro`, `tier_source=stripe` 확인 → Stripe 대시보드 포털에서 해지 → `status=canceled` 확인.
2. 문제없으면 **Live 키로 교체**.
3. 앱에서 통화 토글 **🌐 International ($)** → Subscribe → 실제 흐름 확인.

## 7. 남은 코드 TODO (선택)

- EN 랜딩 푸터 "Payments: Toss Payments" → Stripe 병기.
- Stripe 결제자에게도 Pro 환영 메일 발송(현재 Toss 경로만 호출) — 원하면 웹훅 checkout 완료부에 `_sendProWelcomeEmail` 추가.
