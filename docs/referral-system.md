# Referral System — 5DO

작성: 2026-07-18

양방향 **무료 Pro 일수** 리퍼럴. 추천인 +30일 / 피추천인 +14일, 둘 다
**피추천인의 첫 유료 전환 시점**에 지급(가입만으로는 미지급 → 어뷰징 방지).

## 결정 사항
- 보상 방식: **무료 Pro 일수** (`current_period_end` 연장) — 결제사 독립(Toss/Paddle 공통)
- 크기: 추천인 **+30일**, 피추천인 **+14일**
- 방향: **양방향**
- 트리거: 피추천인의 **첫 유료 결제 완료**

## 데이터 (`supabase-migrations/2026-07-18_referrals.sql`)
- `profiles.referral_code` (unique), `profiles.referred_by` (uuid)
- `referrals(referrer_id, referred_id, status, reward_*_days, qualified_at)`,
  `unique(referred_id)` → 1인 1회 피추천
- RLS: 서버는 service-role로 변경, 사용자는 본인 관련 행만 조회

## 서버 (`server.js`)
- `GET /api/referral/me?user_id=` → `{ code, link, invited, qualified, daysEarned }` (코드 없으면 생성)
- `POST /api/referral/attribute {user_id, ref_code}` → 신규계정(<30분)·비자기추천·유효코드·미귀속 조건에서 `referred_by` 바인딩 + pending 행 생성
- `_grantReferralOnConversion(referredUserId)` → pending→qualified(1회 보장) 후 양쪽 `_addProDays()` + 이벤트 로깅
- `_addProDays()`: 기존 구독자는 `current_period_end` 연장(무료일수=다음 청구 지연), 무료 사용자는 만료되는 `promo` 상태 부여
- 훅: Toss `billing-success` / `payment-success` 성공부에 연결. **Paddle 웹훅에도 동일 호출 추가 예정(TODO)**

## Pro 판정 (`services/tier.js` + `subscription.js`)
- `status='promo'`을 `canceled`와 동일하게 처리(period_end까지 Pro, 자동갱신 없음)
- Toss 갱신 크론은 `status='active'`만 청구 → `promo`는 안전(청구 안 됨)

## 클라이언트
- `auth.js`: `?ref=` → localStorage `5do_ref` 저장, 로그인 후 `_maybeAttributeReferral()` (서버가 신규계정만 바인딩, 확정 결과에 localStorage 정리)
- `account-ui.js`: `showReferralModal()` — 링크 복사 + 통계, 계정 드롭다운 "🎁 친구 초대"

## 배포 전 필수
1. **마이그레이션 실행**: `supabase-migrations/2026-07-18_referrals.sql` (Supabase SQL editor)
2. 테스트: 두 계정으로 링크 가입 → 첫 결제 → 양쪽 일수 지급 확인
3. Paddle 도입 시 웹훅 성공부에 `_grantReferralOnConversion(userId)` 추가

## 어뷰징 방지
- 유료 전환 시에만 지급 · 자기추천 차단 · 계정연령(<30분) 제한 · `unique(referred_id)` · pending→qualified 1회
- 추가 검토(P1): 추천인당 월 상한, 동일 결제수단/기기 탐지
