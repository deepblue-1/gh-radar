---
phase: quick-261001-bnc
plan: 01
status: complete
subsystem: stock-quotes-freshness
tags: [home-sync, intraday-sync, server, supabase, data-integrity, bugfix]
requires: []
provides:
  - stock_quotes.rate_updated_at (등락률 기준 시각, nullable)
  - server isQuoteSessionWindow(now)
affects:
  - home-sync 급등 테마 입력 집합
  - server GET /api/stocks/:code on-demand upsert
  - intraday-sync STEP1/STEP2 payload
tech-stack:
  added: []
  patterns:
    - "행 쓰기 시각(updated_at) vs 값 기준 시각(rate_updated_at) 분리 — 값을 보증하는 writer 만 기준 시각을 찍는다"
    - "외부 API 응답에 기준일자가 없으면 세션 창으로 writer 를 게이트"
key-files:
  created:
    - supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql
    - server/src/lib/quoteSessionWindow.ts
    - server/tests/lib/quoteSessionWindow.test.ts
  modified:
    - workers/intraday-sync/src/pipeline/upsertQuotes.ts
    - workers/intraday-sync/tests/upsertQuotes.test.ts
    - workers/home-sync/src/pipeline/loadSurges.ts
    - workers/home-sync/src/pipeline/loadSurges.test.ts
    - workers/home-sync/src/index.test.ts
    - server/src/mappers/stock.ts
    - server/src/routes/stocks.ts
    - server/tests/routes/stock-detail.test.ts
decisions:
  - "rate_updated_at 백필 없음 — NULL 은 home-sync 가 제외하는 fail-safe (updated_at 백필은 오염 행을 오늘로 복사)"
  - "rate_updated_at 새 인덱스 없음 — change_rate 인덱스가 이미 수십 행으로 좁히고, STEP1 매분 ~1,900행 UPSERT 쓰기 증폭 회피"
  - "server on-demand 는 세션 창 밖에서 stock_quotes upsert 자체를 생략 (rate_updated_at 키만 빼고 upsert 하는 안 기각)"
  - "intraday-sync STEP2 는 rate_updated_at 을 쓰지 않는다 — change_rate 를 쓰지 않으므로 보증 불가"
metrics:
  duration: "~6m"
  completed: 2026-10-01
  tasks: 2
  files: 11
actuals:
  tokens: 9400
  tasks: 2
  commits: 2
plan_head_before: 0380796ed98dc835910eb6cd6d9e4cf0ec9cc912
commits: 2
---

# Quick 261001-bnc Plan 01: 급등 신선도를 rate_updated_at 으로 분리 Summary

stock_quotes 에 등락률 기준 시각 `rate_updated_at` 컬럼을 추가했다. intraday-sync STEP1 과 세션 창(KRX 거래일 KST 08:00~20:00) 안의 server 상세 on-demand 만 이 값을 찍는다. home-sync 급등 판정은 행 쓰기 시각 `updated_at` 대신 이 컬럼으로 신선도를 본다. 이로써 전일 상한가 종목(261001 동일스틸럭스 023790 +29.99%)이 오늘 급등 테마에 섞이던 경로가 막혔다.

## 작업 내역

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 (tracer) | DB 컬럼 → intraday-sync STEP1 스탬프 → home-sync 신선도 판정 | f0cff839 | 마이그레이션, upsertQuotes.ts(+test), loadSurges.ts(+test), index.test.ts |
| 2 | server 상세 on-demand upsert 를 KRX 세션 창 안으로 제한 + rate_updated_at 스탬프 | 51d0b94f | quoteSessionWindow.ts(+test), mappers/stock.ts, routes/stocks.ts, stock-detail.test.ts |

### Task 1 (BNC-D1 · D2 · D3 · D5)
- `20261001090000_stock_quotes_rate_updated_at.sql`: `ADD COLUMN IF NOT EXISTS rate_updated_at timestamptz` 와 `COMMENT ON COLUMN` 두 문장만 넣었다(BEGIN/COMMIT, 멱등). 헤더에 사고 경위와 결정 3가지(백필 없음 · 인덱스 없음 · 정책/뷰/RPC 변경 없음), 그리고 "DB 먼저 적용" 순서를 적었다.
- intraday-sync `upsertQuotesStep1`: `rate_updated_at: now` 를 넣었다. `updated_at` 과 같은 변수를 쓴다. docblock 에 STEP1 이 권위 있는 writer 인 이유(휴장일 가드 + detectStaleSnapshot 가드)를 적었다.
- intraday-sync `upsertQuotesStep2`: `rate_updated_at` 을 쓰지 않는다. update 객체 위에 이유 주석이 있다. 관심종목 hot set 이 08:00~09:00 에 KRX 전용 전일 급등주의 updated_at 만 올리기 때문이다.
- home-sync `loadSurges`: 신선도 필터를 `updated_at` 에서 `rate_updated_at` 으로 **교체**했다(두 필터를 같이 거는 방식이 아니다). 컷오프 계산과 재시도는 바꾸지 않았다.
- 테스트: STEP1 은 `rate_updated_at === updated_at`, STEP2 는 `not.toHaveProperty("rate_updated_at")` 로 고정했다. home-sync 헬퍼 이름을 바꿨고(`rateUpdatedAtCutoff` / `rateUpdatedAtGteCount`), index.test.ts 의 판별 문자열 4곳을 고쳤다. **회귀 가드**도 추가했다: stock_quotes 에 `updated_at` gte 가 0건이고 `rate_updated_at` gte 가 1건이어야 한다.
- 트레이서 게이트: `<verify>` 를 끝까지 다시 돌려 통과한 뒤 Task 2 로 넘어갔다.

### Task 2 (BNC-D4)
- `server/src/lib/quoteSessionWindow.ts`: `isQuoteSessionWindow(now = new Date())` 는 KST 월~금이고, 480 ≤ 분 < 1200 이며, `!isKrxHoliday(kstDateIso(now))` 일 때만 true 다. KST 변환은 `+9h → getUTC*` 방식이다. shared 캘린더를 재사용한다.
- `mappers/stock.ts`: `StockQuoteRowUpsert` 에 `rate_updated_at: string` 을 더했다. `inquirePriceToQuoteRow(code, row, now = new Date())` 는 ISO 문자열을 한 번 만들어 두 필드에 같이 넣는다. `StockQuoteRow` 와 QUOTE_COLS 는 그대로라 응답 스키마가 바뀌지 않는다.
- `routes/stocks.ts` `GET /:code`: `const now = new Date()` 를 한 번만 만든다. `isQuoteSessionWindow(now)` 가 true 일 때만 upsert 한다. 창 밖이면 `logger.debug({ code }, "off-session: skip stock_quotes upsert")` 만 남긴다. 응답 합성(fresh 우선 · cached volume/trade_amount)은 그대로다.

**결정(Claude 재량): 창 밖에서는 stock_quotes upsert 자체를 건너뛴다** (rate_updated_at 키만 빼고 upsert 하는 안은 택하지 않음). 근거:
- (a) 창 밖(야간 · 주말 · 휴장일 · 08:00 전 · 20:00 이후)의 ka10001 은 기준일자 없이 직전 거래일 스냅샷을 준다. intraday-sync 가 20:02 까지 이미 확정한 행에 더할 정보가 없다.
- (b) 건너뛰면 writer 쪽에서 updated_at 오염도 함께 사라진다. 그래서 updated_at 을 읽는 다른 소비처(scanner X-Last-Updated-At 등)도 덤으로 정리된다.
- (c) 응답은 여전히 방금 받은 fresh 시세라 사용자 체감 변화가 없다.
- 대가: stock_quotes 에 행이 없는 종목은 다음 세션까지 행이 생기지 않는다. 응답이 fresh 값을 쓰므로 해가 없다.

## 테스트 / 타입체크 결과

| 패키지 | 기준선 | 이후 | 신규 | typecheck |
|--------|--------|------|------|-----------|
| intraday-sync | 155 | **157 passed** (19 files) | +2 (STEP1 스탬프, STEP2 omit) | green |
| home-sync | 167 | **168 passed** (10 files) | +1 (updated_at 신선도 회귀 가드) | green |
| server | 275 | **288 passed** (33 files) | +13 (세션 창 경계 9, 라우트 창 밖 야간/휴장일 2, 매퍼 now 인자 2) | green |

- RED 를 먼저 확인했다: Task 1 에서 intraday-sync 1건, home-sync 27건이 실패했다. Task 2 에서는 세션 창 테스트 파일과 라우트·매퍼 5건이 실패했다.
- `server/tests/mappers/stock.test.ts` 는 고치지 않았고, 인자 기본값 덕분에 그대로 통과한다.
- grep 결과: `rate_updated_at` 은 마이그레이션 · upsertQuotes.ts(STEP1 값 + STEP2 주석) · loadSurges.ts · mappers/stock.ts · routes/stocks.ts(주석) · 각 테스트에만 나온다. loadSurges.ts 에 `gte("updated_at"` 는 0건이다.

## 계획과 달라진 점

### 자동 수정한 문제

**1. [Rule 3 - Blocking] stock-detail 테스트 Date 고정 시 키움 token bucket 이 멈춤**
- **발견 시점:** Task 2 RED 실행
- **문제:** 플랜대로 `vi.useFakeTimers({ toFake: ["Date"] })` 로 시각을 고정하자, 키움을 호출하는 테스트 여러 개가 5초 타임아웃으로 실패했다. `server/src/kiwoom/rateLimiter.ts` 는 모듈 싱글턴 bucket 을 `Date.now()` 차이로 리필한다. 시각이 멈추면 리필이 0 이 되고, 역행하면(10:00 → 00:28) 음수가 되어 `acquireKiwoomRateToken` 의 50ms 폴링이 끝나지 않는다.
- **수정:** 테스트에 `setNow(iso)` 헬퍼를 두었다. `vi.setSystemTime` 직후 `resetKiwoomRateLimiter()` 를 부른다. beforeEach 와 창 밖 테스트 2개 모두 이 헬퍼를 쓴다. 프로덕션 코드는 바꾸지 않았다.
- **수정 파일:** server/tests/routes/stock-detail.test.ts
- **커밋:** 51d0b94f

**2. [범위 내 보강] 매퍼 now 인자 테스트 위치**
- 플랜 behavior 에 매퍼 검증(`now` 주입 / 생략)이 있지만 files 목록에는 mappers 테스트가 없고, "stock.test.ts 는 수정하지 않는다" 는 지시가 있다. 그래서 `stock-detail.test.ts` 에 별도 describe 로 2건을 넣었다.

그 밖에는 플랜대로 실행했다.

## 배포 순서 메모 (executor 는 수행하지 않음 — 메인 세션 소관)

1. `supabase db push` 로 20261001090000 마이그레이션을 프로덕션에 **먼저** 적용한다. 없는 컬럼을 쓰는 PostgREST upsert 는 실패한다.
2. intraday-sync · server 를 배포한다(순서 무관). 장중이면 intraday-sync 다음 사이클부터 rate_updated_at 이 찍힌다.
3. home-sync 는 **마지막**에 배포한다. 장중 배포라면 먼저 stock_quotes 에서 `rate_updated_at >= 오늘 KST 자정` 인 행이 1개 이상인지 SQL 로 확인한다. 그 전에 배포하면 급등 0건 → 빈 스냅샷이 될 위험이 있다. 장 마감 뒤 한꺼번에 배포한다면 확인할 필요가 없다. 다음 거래일 08:00 동작은 오늘과 같은 조건이다.
4. 사후 확인: 다음 거래일 08:00~08:10 home_theme_snapshots 에 전일 상한가 KRX 전용 종목이 없는지 본다.

이번 작업에서 push · 배포 · db push 는 하지 않았다(커밋 2개만 로컬 master 에 있음).

## 범위 밖 메모 (BNC-D7 — 이번에 수정하지 않음)

- `server/src/routes/scanner.ts` X-Last-Updated-At = MAX(stock_quotes.updated_at): 표시용 시각이다. Task 2 의 창 밖 upsert 차단으로 야간 오염은 덤으로 줄어든다.
- `server/src/services/specialists/quote-specialist.ts` · `server/src/services/chat-service.ts`: 챗봇 시세 컨텍스트가 updated_at 을 "기준 시각" 으로 싣는다. 급등 판정이 아니라 표시라서 같은 부류의 버그는 아니다.
- `server/src/lib/quoteJoin.ts` → 테마 상세 · 관심종목 표시 · computeTop3(테마 상위 3 평균 등락률): change_rate 를 신선도 필터 없이 "마지막으로 알려진 값" 으로 쓴다. 08:00~09:00 에 KRX 전용 종목의 전일 등락률이 테마 평균에 섞일 수 있다. 별도 판단이 필요하다.
- `packages/shared` isKoreanMarketOpen(08:00~15:30 · getTimezoneOffset 기반): 사용처가 0 이고 낡았다. 정리 후보다.
- **잔여 위험:**
  - (1) 창 시작 직후(08:00~08:0x) ka10001 이 KRX 전용 종목에 대해 아직 전일 스냅샷을 줄 가능성이 있다. 10/1 08:04:36 조회는 0 을 돌려줘 정상이었지만, 08:00 정각 동작은 확인하지 못했다.
  - (2) KRX_HOLIDAYS seed 는 2026-12-31 까지다. 2027 seed 전까지는 휴장일이 거래일로 판정된다(기존 워커와 같은 제약).
- **결정 기록:** 백필 없음(NULL fail-safe) · 새 인덱스 없음 · 창 밖 upsert 전면 생략(키만 빼는 안 기각). 각 근거는 마이그레이션 헤더와 위 Task 2 절에 있다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 표면이나 인증 경로는 없다. T-bnc-01~04 는 계획대로 mitigate 했고, T-bnc-05 는 accept(정책 변경 없음)했다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql
- FOUND: server/src/lib/quoteSessionWindow.ts
- FOUND: server/tests/lib/quoteSessionWindow.test.ts
- FOUND: f0cff839, 51d0b94f (`git rev-list --count 0380796e..HEAD` = 2)
