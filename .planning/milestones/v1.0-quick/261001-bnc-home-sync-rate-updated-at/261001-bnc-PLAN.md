---
phase: quick-261001-bnc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql
  - workers/intraday-sync/src/pipeline/upsertQuotes.ts
  - workers/intraday-sync/tests/upsertQuotes.test.ts
  - workers/home-sync/src/pipeline/loadSurges.ts
  - workers/home-sync/src/pipeline/loadSurges.test.ts
  - workers/home-sync/src/index.test.ts
  - server/src/lib/quoteSessionWindow.ts
  - server/tests/lib/quoteSessionWindow.test.ts
  - server/src/mappers/stock.ts
  - server/src/routes/stocks.ts
  - server/tests/routes/stock-detail.test.ts
autonomous: true
requirements: [BNC-D1, BNC-D2, BNC-D3, BNC-D4, BNC-D5, BNC-D6, BNC-D7]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "stock_quotes 에 nullable `rate_updated_at timestamptz` 컬럼을 추가하는 멱등 마이그레이션이 있다. 백필 · 새 인덱스 · 정책 변경은 없다 (BNC-D1)"
    - "intraday-sync STEP1(ka10027) 은 change_rate 를 쓸 때마다 rate_updated_at 을 updated_at 과 **같은 now** 로 함께 쓴다 (BNC-D2)"
    - "intraday-sync STEP2(ka10001 hot set UPDATE) 는 rate_updated_at 을 쓰지 않는다 — updated_at 만 갱신한다. 이유 주석이 코드에 있다 (BNC-D3)"
    - "server `GET /api/stocks/:code` on-demand 는 KRX 거래일(KST 평일 · isKrxHoliday 아님) 08:00 ≤ KST < 20:00 안에서만 stock_quotes 에 upsert 하고, 그 행에 rate_updated_at = updated_at = 같은 now 가 실린다. 창 밖에서는 upsert 를 아예 하지 않으며 응답은 여전히 fresh 시세다 (BNC-D4)"
    - "home-sync loadSurges 급등 쿼리는 `change_rate >= threshold AND rate_updated_at >= 오늘 KST 자정` 이다. stock_quotes 에 updated_at gte 호출은 더 이상 없다 (BNC-D5)"
    - "home-sync · intraday-sync · server 전체 vitest 와 typecheck 가 green 이고, 새 테스트가 위 다섯 줄을 고정한다 (BNC-D6)"
    - "SUMMARY 에 stock_quotes.updated_at 을 신선도로 읽는 다른 소비처 목록과 잔여 위험이 범위 밖 메모로 남는다. 이 작업에서 그 소비처는 수정하지 않는다 (BNC-D7)"
  artifacts:
    - path: "supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql"
      provides: "stock_quotes.rate_updated_at 컬럼 (nullable, 백필 없음) + COMMENT ON COLUMN"
      contains: "ADD COLUMN IF NOT EXISTS rate_updated_at timestamptz"
    - path: "workers/intraday-sync/src/pipeline/upsertQuotes.ts"
      provides: "STEP1 payload rate_updated_at 스탬프 · STEP2 비스탬프 사유 주석"
      contains: "rate_updated_at"
    - path: "workers/home-sync/src/pipeline/loadSurges.ts"
      provides: "급등 신선도 필터 = rate_updated_at"
      contains: "gte(\"rate_updated_at\""
    - path: "server/src/lib/quoteSessionWindow.ts"
      provides: "isQuoteSessionWindow(now) — KST 평일 · 비휴장 · 08:00≤t<20:00 순수 함수 (shared isKrxHoliday/kstDateIso 재사용)"
      contains: "export function isQuoteSessionWindow"
    - path: "server/src/routes/stocks.ts"
      provides: "on-demand stock_quotes upsert 를 세션 창 안으로 게이트"
      contains: "isQuoteSessionWindow"
  key_links:
    - from: "workers/intraday-sync/src/pipeline/upsertQuotes.ts (upsertQuotesStep1 rows)"
      to: "stock_quotes.rate_updated_at"
      via: "rate_updated_at: now (updated_at 과 같은 값)"
      pattern: "rate_updated_at"
    - from: "stock_quotes.rate_updated_at"
      to: "workers/home-sync/src/pipeline/loadSurges.ts"
      via: "gte(\"rate_updated_at\", kstMidnightIso(now))"
      pattern: "gte\\(\"rate_updated_at\""
    - from: "server/src/routes/stocks.ts"
      to: "server/src/lib/quoteSessionWindow.ts"
      via: "isQuoteSessionWindow(now) 가 true 일 때만 stock_quotes upsert"
      pattern: "isQuoteSessionWindow\\(now\\)"
---

<objective>
홈 「오늘의 급등 테마」 가 전일 상한가 종목을 오늘 급등으로 잘못 싣는 버그(2026-10-01 08:00~08:04 KST 스냅샷에 동일스틸럭스 023790 +29.99% — 9/30 상한가)를 근본 수정한다.

원인(진단 완료 · 프로덕션 DB + Cloud Logging 대조): home-sync `loadSurges` 는 `stock_quotes.updated_at >= 오늘 KST 자정` 이면 change_rate 도 오늘 값이라고 가정했다. 그런데 `updated_at` 은 "행을 마지막으로 쓴 시각" 일 뿐이다.
  - server `GET /api/stocks/:code` 가 상세 조회마다 키움 ka10001 을 on-demand 호출해 시각 무관하게 `updated_at = now` 로 upsert 한다. 10/1 00:28 KST 조회가 전일 스냅샷(+29.99%)을 오늘 타임스탬프로 기록했다.
  - 같은 부류 잠복 경로: intraday-sync STEP2 는 hot set(STEP1 상위 N ∪ **모든 관심종목**)의 OHLC/limits 만 UPDATE 하면서 `updated_at = now` 를 올리고 change_rate 는 안 건드린다 → 관심종목에 든 KRX 전용 전일 급등주는 08:00~09:00 동안 어제 change_rate 에 오늘 updated_at 이 붙는다.

해법(사용자 확정 — 옵션 2, 잠김): "행 쓰기 시각(updated_at)" 과 "change_rate 기준 시각(rate_updated_at)" 을 분리한다. change_rate 를 오늘 값으로 보증할 수 있는 writer 만 rate_updated_at 을 찍고, home-sync 는 rate_updated_at 으로 신선도를 판정한다.

Purpose: 트레이더가 홈에서 보는 급등 테마가 오늘 실제로 움직인 종목만 담게 한다 (Core Value — 급등 종목 빠른 포착).
Output: 마이그레이션 1개 · intraday-sync / home-sync / server 코드와 테스트. **커밋까지만** — DB 적용과 배포는 메인 세션 소관(아래 배포 순서 참조).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# 현재 코드 (executor 가 읽을 것)
@workers/home-sync/src/pipeline/loadSurges.ts
@workers/intraday-sync/src/pipeline/upsertQuotes.ts
@server/src/routes/stocks.ts
@server/src/mappers/stock.ts
@packages/shared/src/krxCalendar.ts

<interfaces>
<!-- 이미 존재하는 계약. 탐색 없이 그대로 쓴다. -->

packages/shared (dist 빌드 완료 상태 — 이번 작업은 shared 를 수정하지 않는다):
  - isKrxHoliday(dateIso: string): boolean          // 2026-12-31 까지 seed. 2026-10-05 · 2026-10-09 포함
  - kstDateIso(now?: Date): string                   // `+9h → getUTC*` 방식 KST YYYY-MM-DD
  - (쓰지 말 것) isKoreanMarketOpen — 08:00~15:30 기준 · getTimezoneOffset 기반이라 낡았고 사용처 0

server/src/mappers/stock.ts:
  - type StockQuoteRow = { code, price, change_amount, change_rate, volume, trade_amount, open, high, low, market_cap, upper_limit, lower_limit, updated_at }  // SELECT(QUOTE_COLS) 형태 — 이번에 바꾸지 않는다
  - type StockQuoteRowUpsert = Omit<StockQuoteRow, "volume" | "trade_amount">       // D-22 partial upsert — 사용처는 routes/stocks.ts 한 곳
  - function inquirePriceToQuoteRow(code: string, ka10001: KiwoomKa10001Row): StockQuoteRowUpsert   // 현재 updated_at = new Date().toISOString()

workers/intraday-sync/src/pipeline/upsertQuotes.ts:
  - upsertQuotesStep1(supabase, updates: IntradayCloseUpdate[]) — rows 에 `updated_at: now` (now = new Date().toISOString() 1회)
  - upsertQuotesStep2(supabase, updates: IntradayOhlcUpdate[]) — 종목별 `.update({...open/high/low/limits/market_cap, updated_at: now}).eq("code", …)`
  - 호출부 workers/intraday-sync/src/index.ts: isKrxHoliday 가드(166행) + detectStaleSnapshot 가드 뒤에서만 STEP1/STEP2 실행 (수정 불필요)

workers/home-sync/src/pipeline/loadSurges.ts:
  - kstMidnightIso(now: Date): string  — 그대로 둔다
  - 급등 쿼리: from("stock_quotes").select("code,change_rate").gte("change_rate", cfg.surgeThreshold) 다음에 신선도 gte 1개 (현재 컬럼 = updated_at)

테스트 mock 규약:
  - home-sync: tests/helpers/supabase-mock.ts 의 gte 는 단일 vi.fn. loadSurges.test.ts `setQuotes()` 와 index.test.ts 4곳(63 · 435 · 702 · 798행 부근)이 **컬럼명으로 종결 gte 를 판별**(`col === <신선도 컬럼>` 이면 resolve, 아니면 chain). 신선도 컬럼이 바뀌면 이 판별 문자열도 같이 바꿔야 한다 — 안 바꾸면 thenable chain 이 빈 결과로 풀려 급등 0건이 된다.
  - server: tests/fixtures/supabase-mock.ts 가 upsert 를 `state.upserts: { table, rows }[]` 로 기록. tests/routes/stock-detail.test.ts 의 `mockKiwoomRuntime` · `okKa10001`(flu_rt "+0.71", cur_prc "+70500") 재사용.
</interfaces>

# 기준선 (2026-10-01 플래너 실측, 전부 green)
#   home-sync 167 tests / intraday-sync 155 tests / server 275 tests · 세 패키지 typecheck 통과
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — DB 컬럼 → intraday-sync STEP1 스탬프 → home-sync 신선도 판정 (한 경로 끝까지)</name>
  <files>supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql, workers/intraday-sync/src/pipeline/upsertQuotes.ts, workers/intraday-sync/tests/upsertQuotes.test.ts, workers/home-sync/src/pipeline/loadSurges.ts, workers/home-sync/src/pipeline/loadSurges.test.ts, workers/home-sync/src/index.test.ts</files>
  <behavior>
    - upsertQuotesStep1: payload 모든 행에 rate_updated_at 이 있고 그 값이 같은 행의 updated_at 과 정확히 같다(ISO 문자열).
    - upsertQuotesStep2: update payload 에 rate_updated_at 키가 없다(not.toHaveProperty). updated_at 은 여전히 있다.
    - loadSurges: stock_quotes 신선도 gte 는 rate_updated_at 컬럼에 kstMidnightIso(now) 값으로 1회 걸린다(주입 now 2026-07-07T08:26+09:00 → "2026-07-06T15:00:00.000Z" 기존 기대값 유지).
    - loadSurges 회귀 가드(신규 테스트): stock_quotes gte 호출 중 첫 인자가 updated_at 인 호출이 0건이다 — 행 쓰기 시각으로 급등 신선도를 판정하는 경로가 되살아나면 실패.
    - 빈 결과 재시도 횟수 테스트 등 기존 loadSurges / index 테스트는 신선도 컬럼만 바뀐 채 그대로 통과한다.
  </behavior>
  <action>
BNC-D1 · D2 · D3 · D5 · D6 구현. 순서: 테스트 먼저 고치고(RED 확인) → 코드 → GREEN.

(1) 마이그레이션 신규 `supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql` (BNC-D1). 저장소의 기존 ADD COLUMN 마이그레이션(예: 20260905120000_stocks_isin.sql)처럼 한글 헤더 주석 블록 → BEGIN → 본문 → COMMIT. 본문은 두 문장뿐: stock_quotes 에 `ADD COLUMN IF NOT EXISTS rate_updated_at timestamptz` (nullable, DEFAULT 없음) 과 COMMENT ON COLUMN(“change_rate 기준 시각. 오늘 등락률로 보증되는 writer 만 기록 — intraday-sync STEP1 · server on-demand(세션 창 안). updated_at 은 행 쓰기 시각이라 신선도 판정에 쓰지 말 것”). 헤더 주석에 반드시 적을 결정 4가지:
  - 무엇/왜: 261001 동일스틸럭스(023790) 사고 — 00:28 KST 상세 on-demand 가 전일 +29.99% 스냅샷을 updated_at=now 로 기록 → home-sync 08:00~08:04 급등 테마 오염. 행 쓰기 시각과 등락률 기준 시각 분리.
  - **백필 없음(NULL 유지)**: NULL = "등락률 기준 시각 미상" → home-sync 가 제외하는 fail-safe. updated_at 으로 백필하면 적용 시점에 이미 오염된 행(야간 on-demand 기록)이 그대로 "오늘" 로 복사되어 다음 날 08:00~09:00 에 같은 버그가 한 번 더 난다. 최악의 비용은 intraday-sync 한 사이클(장중 1분) 동안의 미탐.
  - **새 인덱스 없음**: 급등 쿼리는 change_rate ≥ 20 으로 기존 idx_stock_quotes_change_rate_desc 가 수십 행으로 좁히고 테이블은 약 2~3천 행. 인덱스를 더하면 STEP1 이 매분 약 1,900행 UPSERT 할 때마다 쓰기 증폭만 생긴다.
  - **정책 · 뷰 · RPC 변경 없음**: RLS 는 행 단위라 기존 SELECT 정책이 새 컬럼을 그대로 덮는다. stock_quotes.updated_at 이나 `*` 를 참조하는 뷰/RPC 는 없다(플래너 grep 확인).
  - 적용 순서: **이 파일을 프로덕션에 먼저 적용한 뒤** intraday-sync · server · home-sync 를 배포한다(없는 컬럼을 쓰는 PostgREST upsert 는 실패한다). 멱등(IF NOT EXISTS).

(2) intraday-sync `upsertQuotes.ts` (BNC-D2 · D3):
  - upsertQuotesStep1 rows 매핑에 `rate_updated_at: now` 를 updated_at 바로 아래에 추가(같은 now 변수 — 새 Date 호출 금지). docblock 의 payload 컬럼 목록에 rate_updated_at 을 넣고 한 문단 추가: STEP1(ka10027)이 오늘 change_rate 의 권위 있는 writer 이고, 호출부(index.ts)의 휴장일 가드 + detectStaleSnapshot 가드가 전일 재방출 사이클을 이미 걸러내므로 STEP1 이 쓰는 change_rate 는 곧 오늘 값이다.
  - upsertQuotesStep2 는 **rate_updated_at 을 추가하지 않는다**. update 객체 위에 이유 주석: STEP2 는 change_rate 를 쓰지 않는다. hot set 에 모든 관심종목이 들어오므로 08:00~09:00(STEP1 이 NXT 거래 종목만 돌려주는 구간)에 관심종목인 KRX 전용 전일 급등주는 updated_at 만 오늘로 올라가고 change_rate 는 어제 값이다. 여기서 rate_updated_at 을 찍으면 home-sync 가 어제 상한가를 오늘 급등으로 싣는다(261001 사고와 같은 부류). docblock payload 설명에도 "rate_updated_at 의도적 omit" 한 줄.

(3) intraday-sync `tests/upsertQuotes.test.ts`: behavior 의 STEP1 · STEP2 기대를 기존 첫 테스트들에 assertion 으로 추가하거나 각 describe 에 it 하나씩 추가.

(4) home-sync `loadSurges.ts` (BNC-D5): 급등 쿼리의 두 번째 신선도 gte 를 `.gte("rate_updated_at", freshnessCutoff)` 로 바꾼다(기존 updated_at 필터는 제거 — 두 컬럼을 같이 거는 게 아니라 교체). kstMidnightIso · freshnessCutoff 계산 · 재시도 로직은 그대로. 파일 헤더 docblock 1단계 설명과 freshnessCutoff 위 주석, 쿼리 위 주석을 rate_updated_at 기준으로 고치고 사고 한 줄을 남긴다: "updated_at 은 행 쓰기 시각이라 server 상세 on-demand(00:28 KST 전일 스냅샷)·STEP2 hot set UPDATE 가 어제 change_rate 에 오늘 시각을 붙였다(261001 동일스틸럭스 023790 +29.99%). 등락률 기준 시각 rate_updated_at 으로 판정." 주석에서 옛 필터를 인용할 때 메서드 호출 형태(따옴표 포함)로 쓰지 말고 "updated_at 필터" 처럼 산문으로 쓴다(아래 negative grep 이 주석 줄도 볼 수 있다).

(5) home-sync `loadSurges.test.ts`: `setQuotes()` 의 종결 판별 컬럼을 rate_updated_at 으로, 헬퍼 `updatedAtCutoff` / `updatedAtGteCount` 를 `rateUpdatedAtCutoff` / `rateUpdatedAtGteCount` 로 이름과 필터 컬럼 모두 변경(호출부 전부 갱신), 파일 상단 docblock · mock 주의 주석의 컬럼명 갱신, "급등 쿼리에 … 신선도 gte 컷오프 적용" 테스트 제목을 rate_updated_at 으로. behavior 의 회귀 가드 테스트 1개 추가.

(6) home-sync `src/index.test.ts`: `col === <신선도 컬럼>` 판별 4곳(seedSurgeSupabase 와 63 · 435 · 702 · 798행 부근)을 rate_updated_at 으로, 59~60행 · 699행 부근 주석도 갱신. 다른 로직은 건드리지 않는다.

변경 파일이 6개인 이유: 그중 index.test.ts 는 판별 문자열 4곳 교체뿐이고, 이걸 다른 task 로 떼면 중간 커밋에서 home-sync 스위트가 깨진다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && grep -q "ADD COLUMN IF NOT EXISTS rate_updated_at timestamptz" supabase/migrations/20261001090000_stock_quotes_rate_updated_at.sql && grep -q 'gte("rate_updated_at"' workers/home-sync/src/pipeline/loadSurges.ts && ! grep -q 'gte("updated_at"' workers/home-sync/src/pipeline/loadSurges.ts && pnpm --filter @gh-radar/intraday-sync exec vitest run && pnpm --filter @gh-radar/intraday-sync typecheck && pnpm --filter @gh-radar/home-sync exec vitest run && pnpm --filter @gh-radar/home-sync typecheck</automated>
  </verify>
  <done>마이그레이션 파일이 있고(컬럼 추가 1 + COMMENT 1, 백필·인덱스·정책 없음, 헤더에 결정 근거와 적용 순서). STEP1 payload 가 rate_updated_at = updated_at 을 싣고 STEP2 payload 에는 rate_updated_at 이 없다(테스트로 고정). home-sync 급등 쿼리가 rate_updated_at 으로 신선도를 판정하고 updated_at 신선도 호출이 0건임을 회귀 테스트가 고정. intraday-sync · home-sync 전체 vitest(기준선 155 · 167 + 신규) 와 typecheck green. 커밋 1개(한글 메시지).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: server 상세 on-demand upsert 를 KRX 세션 창(평일 · 비휴장 · KST 08:00 이상 20:00 미만) 안으로 제한 + rate_updated_at 스탬프</name>
  <files>server/src/lib/quoteSessionWindow.ts, server/tests/lib/quoteSessionWindow.test.ts, server/src/mappers/stock.ts, server/src/routes/stocks.ts, server/tests/routes/stock-detail.test.ts</files>
  <behavior>
    - isQuoteSessionWindow 경계 9케이스 (입력은 `new Date("2026-10-01T08:00:00+09:00")` 처럼 오프셋 포함 — 실행 머신 TZ 무관):
      2026-10-01(목) 07:59 → false · 08:00 → true · 19:59 → true · 20:00 → false · 00:28 → false(사고 시각) /
      2026-10-03(토) 10:00 → false · 2026-10-04(일) 10:00 → false /
      2026-10-05(월, 개천절 대체공휴일) 10:00 → false · 2026-10-06(화) 10:00 → true.
    - route 창 안(시스템 시각 2026-10-01T10:00:00+09:00 고정): stock_quotes upsert 1건, rows[0].rate_updated_at === rows[0].updated_at === "2026-10-01T01:00:00.000Z", volume · trade_amount 키 없음(D-22 유지).
    - route 창 밖 야간(2026-10-01T00:28:00+09:00): 200, body.price 70500 · body.changeRate 0.71(fresh 시세 응답 유지), state.upserts 중 table === "stock_quotes" 항목 0건.
    - route 창 밖 휴장일(2026-10-05T10:00:00+09:00): stock_quotes upsert 0건.
    - mapper: inquirePriceToQuoteRow(code, row, now) 의 updated_at 과 rate_updated_at 이 둘 다 now.toISOString(). 세 번째 인자 생략 시 기존 동작(현재 시각).
  </behavior>
  <action>
BNC-D4 · D6 구현.

결정(Claude 재량 — SUMMARY 에 그대로 옮길 것): 창 밖에서는 **stock_quotes upsert 자체를 건너뛴다**(rate_updated_at 키만 빼고 upsert 하는 안을 택하지 않음). 근거:
  (a) 창 밖(야간 · 주말 · 휴장일 · 08:00 전 · 20:00 이후)의 ka10001 은 기준일자 필드 없이 직전 거래일 스냅샷을 돌려준다. intraday-sync 가 20:02 까지 이미 확정한 행에 더할 새 정보가 없다.
  (b) 건너뛰면 행 쓰기 시각(updated_at) 오염까지 writer 쪽에서 함께 사라져, updated_at 을 읽는 다른 소비처(scanner X-Last-Updated-At 등)도 덤으로 정리된다.
  (c) 응답은 여전히 방금 받은 fresh 시세라 사용자 체감 변화가 없다.
  대가: stock_quotes 에 행이 아예 없는 종목은 다음 세션까지 행이 생기지 않는다 — 응답이 fresh 를 쓰므로 무해.

(1) 신규 `server/src/lib/quoteSessionWindow.ts` — `export function isQuoteSessionWindow(now: Date = new Date()): boolean`. `@gh-radar/shared` 의 isKrxHoliday · kstDateIso 를 import 한다(두 번째 휴장일 캘린더 금지). KST 변환은 `+9h 후 getUTCDay / getUTCHours / getUTCMinutes` 관례(webapp/src/lib/auto-refresh-window.ts · workers/intraday-sync/src/marketWindow.ts 와 같은 방식, 로컬 getter 금지). 조건: 요일 1~5 AND SESSION_START_MIN(08:00 = 480) ≤ 분 < SESSION_END_MIN(20:00 = 1200, 미포함) AND 휴장일 아님. docblock 에 적을 것: 목적(ka10001 응답엔 기준일자가 없어 창 밖 on-demand 는 전일 스냅샷 — 261001 동일스틸럭스 023790 사고), 창 근거(장 시간 08:00~20:00, NXT 포함 · intraday-sync cron 08:00~20:02 와 정합), 비슷한 함수와의 차이(webapp isAutoRefreshWindow 는 UI 새로고침용 20:05 포함 창 · shared isKoreanMarketOpen 은 15:30 기준 · getTimezoneOffset 기반이라 낡음 — 재사용 금지), 휴장일 seed 는 2026-12-31 까지.

(2) `server/src/mappers/stock.ts` — StockQuoteRowUpsert 를 `Omit<StockQuoteRow, "volume" | "trade_amount"> & { rate_updated_at: string }` 로 확장한다. StockQuoteRow 와 각 라우트의 QUOTE_COLS 는 건드리지 않는다(응답 스키마 불변). inquirePriceToQuoteRow 에 세 번째 인자 `now: Date = new Date()` 를 추가하고, ISO 문자열을 한 번 만들어 updated_at 과 rate_updated_at 에 같이 넣는다. docblock 에 한 줄: "이 행을 DB 에 쓸지는 호출부가 isQuoteSessionWindow 로 결정한다 — 창 안에서 받은 ka10001 flu_rt 만 오늘 등락률로 보증된다."

(3) `server/src/routes/stocks.ts` `GET /:code` — kiwoom 블록 진입 전에 `const now = new Date()` 한 번. 매퍼 호출에 now 전달. 기존 upsert 호출과 upErr 경고 로그를 `if (isQuoteSessionWindow(now))` 블록 안으로 옮긴다. 창 밖이면 upsert 없이 지나가고 logger.debug 한 줄(`{ code }` + "off-session: skip stock_quotes upsert")만 남긴다 — info 이상 금지(야간 조회마다 쌓인다). 응답 합성(freshUpsert 우선 · cached volume/trade_amount)은 그대로. 기존 D-22 주석 블록 아래에 261001 게이트 이유 2~3줄 추가.

(4) 신규 `server/tests/lib/quoteSessionWindow.test.ts` — behavior 의 경계 9케이스. import 경로는 `../../src/lib/quoteSessionWindow`(tests/lib/computeTop3.test.ts 관례).

(5) `server/tests/routes/stock-detail.test.ts` — describe 에 beforeEach 로 `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date("2026-10-01T10:00:00+09:00"))`, afterEach 로 `vi.useRealTimers()`. **toFake 는 Date 로만 한정** — setTimeout 등까지 가짜로 만들면 supertest 요청이 멈춘다. 기존 첫 테스트(upsert 발생 확인)에 rate_updated_at assertion 추가. 새 it 2개(야간 00:28 · 휴장일 10/05) — 각 테스트 안에서 vi.setSystemTime 으로 덮어쓴 뒤 behavior 기대를 검증. 이 시각 고정 덕에 기존 테스트가 실행 시각(야간 로컬 · 주말 CI)에 따라 흔들리지 않는다.

server/tests/mappers/stock.test.ts 는 인자 기본값 덕에 그대로 통과해야 한다 — 수정하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && grep -q "isQuoteSessionWindow(now)" server/src/routes/stocks.ts && grep -q "isKrxHoliday" server/src/lib/quoteSessionWindow.ts && pnpm --filter @gh-radar/server exec vitest run tests/lib/quoteSessionWindow.test.ts tests/routes/stock-detail.test.ts tests/mappers/stock.test.ts && pnpm --filter @gh-radar/server exec vitest run && pnpm --filter @gh-radar/server typecheck</automated>
  </verify>
  <done>세션 창 순수 함수 + 경계 테스트 9케이스 green. 상세 라우트는 창 안에서만 stock_quotes upsert(rate_updated_at = updated_at = 같은 now), 창 밖(야간 · 휴장일)에는 upsert 0건이면서 응답은 fresh 시세. 기존 stock-detail 테스트는 시각 고정으로 결정적. server 전체 vitest(기준선 275 + 신규) 와 typecheck green. 커밋 1개(한글 메시지).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 키움 ka10001/ka10027 → server · intraday-sync | 외부 API 응답. 기준일자 필드가 없어 "언제의 값인지" 를 응답만으로 알 수 없다 |
| writer(server · intraday-sync) → stock_quotes | service_role 쓰기. 행에 붙는 시각이 곧 소비처의 신선도 판단 근거 |
| stock_quotes → home-sync → home_theme_snapshots → 웹앱 홈 | 잘못된 신선도가 사용자 화면(급등 테마)으로 그대로 나간다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-bnc-01 | Tampering (데이터 무결성) | server `GET /api/stocks/:code` on-demand upsert | high | mitigate | isQuoteSessionWindow(now) 창 밖에서는 upsert 자체를 하지 않음(Task 2) — 전일 스냅샷이 오늘 시각으로 기록되는 경로 차단. 창 안 행만 rate_updated_at 스탬프 |
| T-bnc-02 | Tampering (데이터 무결성) | intraday-sync upsertQuotesStep2 hot set UPDATE | medium | mitigate | STEP2 는 rate_updated_at 을 쓰지 않음 + 사유 주석 + not.toHaveProperty 테스트(Task 1) |
| T-bnc-03 | Tampering (데이터 무결성) | home-sync loadSurges 신선도 판정 | high | mitigate | 판정 컬럼을 rate_updated_at 으로 교체, updated_at 신선도 호출 0건 회귀 테스트(Task 1). 백필 없음 → NULL 은 제외되는 fail-safe |
| T-bnc-04 | Denial of Service | 배포 순서 — 없는 컬럼을 쓰는 PostgREST upsert | high | mitigate | 마이그레이션 헤더 + 이 플랜 배포 메모에 "DB 선적용 → writer → home-sync" 명시. executor 는 커밋만(배포 · db push 금지) |
| T-bnc-05 | Information Disclosure | stock_quotes.rate_updated_at 이 기존 anon SELECT 정책으로 노출 | low | accept | 시각 값 하나, 이미 공개된 updated_at 과 같은 성격 — 정책 변경 불필요 |
</threat_model>

<verification>
두 task 완료 후 한 번에:

- `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/intraday-sync exec vitest run && pnpm --filter @gh-radar/home-sync exec vitest run && pnpm --filter @gh-radar/server exec vitest run` — 기준선(155 · 167 · 275) 이상, 실패 0.
- `pnpm --filter @gh-radar/intraday-sync typecheck && pnpm --filter @gh-radar/home-sync typecheck && pnpm --filter @gh-radar/server typecheck` — green. (packages/shared 는 수정하지 않으므로 재빌드 불필요.)
- `grep -rn "rate_updated_at" --include='*.ts' --include='*.sql' supabase/migrations workers/intraday-sync/src workers/home-sync/src server/src` 결과가 마이그레이션 · upsertQuotes.ts(STEP1 + STEP2 주석) · loadSurges.ts · mappers/stock.ts · routes/stocks.ts(간접) 범위 안에 있는지 눈으로 확인.

**커밋 규칙(사용자 전역 규칙 우선):** 커밋 메시지는 한글, Co-Authored-By 줄을 넣지 않는다. 동시 세션 경합 방지 — 커밋 직전 `git status -sb` 확인 후 **files_modified 의 파일만** 명시 add(`git add -A` 금지 — 워킹트리에 무관한 미추적 shots/ · milestone.lock 이 있다). push 하지 않는다(이 저장소에서 push = webapp 프로덕션 배포, 배포 판단은 메인 세션).

**배포 순서 메모 (executor 는 수행하지 않음 — 메인 세션 소관):**
1. `supabase db push` 로 20261001090000 마이그레이션을 프로덕션에 먼저 적용.
2. intraday-sync · server 배포(순서 무관). 장중이면 intraday-sync 다음 사이클부터 rate_updated_at 이 찍힌다.
3. home-sync 는 **마지막**. 장중 배포라면 먼저 stock_quotes 에서 rate_updated_at 이 오늘 KST 자정 이후인 행이 0보다 많은지 SQL 로 확인한 뒤 배포(그 전에 배포하면 급등 0건 → 빈 스냅샷 위험). 장 마감 뒤 일괄 배포면 확인 불필요 — 다음 거래일 08:00 동작은 오늘과 같은 조건.
4. 사후 확인: 다음 거래일 08:00~08:10 home_theme_snapshots 에 전일 상한가 KRX 전용 종목이 없는지.
</verification>

<success_criteria>
- 서버 on-demand 가 창 밖에서 stock_quotes 를 쓰지 않고, 창 안에서 쓸 때만 rate_updated_at 을 찍는다.
- intraday-sync STEP1 만 매분 rate_updated_at 을 찍고 STEP2 는 찍지 않는다.
- home-sync 급등 판정이 rate_updated_at 기준이라, 261001 과 같은 입력(00:28 전일 스냅샷 기록 · 08:00 관심종목 STEP2 UPDATE)에서 전일 상한가가 오늘 급등 집합에 들어가지 않는다.
- 세 패키지 테스트 · typecheck green, 커밋 2개(한글), push 없음.
</success_criteria>

<output>
Create `.planning/quick/261001-bnc-home-sync-rate-updated-at/261001-bnc-SUMMARY.md` when done.

SUMMARY 에 반드시 포함할 범위 밖 메모 (BNC-D7 — 이번에 수정하지 않음, 목록만):
- `server/src/routes/scanner.ts` X-Last-Updated-At = MAX(stock_quotes.updated_at) — 표시용 시각. Task 2 의 창 밖 upsert 차단으로 야간 오염은 덤으로 줄어듦.
- `server/src/services/specialists/quote-specialist.ts` · `server/src/services/chat-service.ts` — 챗봇 시세 컨텍스트가 updated_at 을 "기준 시각" 으로 싣는다. 급등 판정이 아니라 표시라 같은 버그 부류 아님.
- `server/src/lib/quoteJoin.ts` → 테마 상세 · 관심종목 표시 · computeTop3(테마 상위 3 평균 등락률) — change_rate 를 신선도 필터 없이 "마지막으로 알려진 값" 으로 쓴다. 08:00~09:00 KRX 전용 종목의 전일 등락률이 테마 평균에 섞일 수 있음 — 별도 판단 필요.
- `packages/shared` isKoreanMarketOpen(08:00~15:30 · getTimezoneOffset 기반) — 사용처 0, 낡음. 정리 후보.
- 잔여 위험: (1) 창 시작 직후(08:00~08:0x) ka10001 이 KRX 전용 종목에 대해 아직 전일 스냅샷을 줄 가능성 — 10/1 08:04:36 조회는 0 을 돌려줘 정상이었으나 08:00 정각 동작은 미확인. (2) KRX_HOLIDAYS seed 는 2026-12-31 까지 — 2027 seed 전까지 휴장일이 거래일로 판정된다(기존 워커와 같은 제약).
- 결정 기록: 백필 없음(NULL fail-safe) · 새 인덱스 없음 · 창 밖 upsert 전면 생략(키만 빼는 안 기각) — 각 근거는 마이그레이션 헤더 · Task 2 action 참조.
</output>