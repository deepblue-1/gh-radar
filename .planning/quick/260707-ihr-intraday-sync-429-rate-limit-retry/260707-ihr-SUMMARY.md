# Quick Task 260707-ihr: intraday-sync 키움 429 rate limit 대응 — Summary

**Date:** 2026-07-07
**Commits:** f00ed33 (test), 2d35c12 (retry 강화), 49632e9 (4 req/s 하향)
**Tests:** vitest 98/98 green (retry 신규 3종 포함), tsc --noEmit 통과

## 배경 (운영 진단)

- 2026-07-07 gh-radar-intraday-sync Job 3회 실패 (KST 09:12/09:53/11:23) — 전부 fetchKa10027 429, withRetry 3회(1s/2s) 소진 후 exit(1).
- 429 경합은 7/3부터 급증 (rate-limited retry: 일 1~6건 → 127/150/99건, STEP2 ka10001 실패 1~4건 → 222~250건). 내부 요인(사이클 겹침·row 증가·서버 on-demand·코드 변경) 전부 배제, 외부 appkey 공유 없음(사용자 확인) → **키움 측 실효 유량 한도 7/3경 축소로 추정**.
- 7/6 sort_tp 1+3 병합(260706-ktd)으로 ka10027 노출 2배 — 병합은 유지(하락 종목 일봉 동결 수정), 방어만 강화.

## 변경 내용

1. **withRetry 429 백오프 승격** (`workers/intraday-sync/src/retry.ts`)
   - `RATE_LIMIT_ATTEMPTS = 5` 상수 도입. catch에서 rate-limit 에러 감지 시 `maxAttempts = Math.max(maxAttempts, 5)` 를 break 판정 **이전에** 수행 — 늦은 시도에서 처음 429를 만나도 5회까지 확장.
   - 대기: 1s/2s/4s/8s (총 최대 15s). 비-429는 기존 3회/200ms base 무변경. 시그니처 무변경 (호출부 10곳 무수정).
2. **키움 호출 속도 5→4 req/s 통일**
   - `workers/intraday-sync/src/config.ts` KA10001_RATE_LIMIT default 4
   - `workers/intraday-sync/src/kiwoom/rateLimiter.ts` BUCKET_CAPACITY/REFILL_RATE 4 (주석에 2026-07-03 실효 한도 축소 관측 추가, server 쪽 5 비대칭 명시)
   - `scripts/deploy-intraday-sync.sh` COMMON_ENV KA10001_RATE_LIMIT=4
   - `fetchHotSet.ts` stale "24 req/s" 주석 정정 (drive-by)
   - 사이클 시간: ~160 호출 / 4 req/s ≈ 40~45초 — 60초 주기 내 안전.

## 후속 (사용자)

- `bash scripts/deploy-intraday-sync.sh` 배포 후 다음 장중 429 warning 감소 + Job 실패 0 확인.
- 4 req/s로도 429 지속 시 3 req/s 검토 (사이클 ~55초, 겹침 임계 — HOT_SET_TOP_N 하향 병행 필요).
