---
phase: quick-261106-ldl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — tracer: 한 종목 키움 응답 → 주 단위 행 → stock_float → GET /api/stocks/:code/float
  - packages/shared/src/kiwoom.ts
  - supabase/migrations/20261106200000_stock_float.sql
  - workers/intraday-sync/src/pipeline/floatShares.ts
  - workers/intraday-sync/tests/floatShares.test.ts
  - server/src/routes/stocks.ts
  - server/tests/routes/stock-float.test.ts
  # Task 2 — 야간 배치 모드(JOB_MODE=float) + 배포 스크립트 섹션
  - workers/intraday-sync/src/floatSync.ts
  - workers/intraday-sync/src/index.ts
  - workers/intraday-sync/src/kiwoom/fetchHotSet.ts
  - workers/intraday-sync/tests/floatSync.test.ts
  - scripts/deploy-intraday-sync.sh
  # Task 3 — 전 종목 엔드포인트 GET /api/stocks/float (stocks.ts · stock-float.test.ts 재편집)
autonomous: true
requirements: ["261106-ldl"]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "JOB_MODE=float 로 실행하면 stocks 마스터(상폐 · ELW · ETN 제외, 1000행 단위 range 페이지로 전량)의 종목마다 ka10001 을 한 번씩 불러 stock_float 에 float_shares · float_rate · listed_shares(모두 주 단위, 비율은 % 숫자)와 as_of(KST 실행일)를 500행 묶음으로 upsert 한다. 종목 하나의 실패는 run 을 멈추지 않고, 마지막 로그 한 줄에 universe · ok · null · failed · aborted 가 남는다"
    - "단위 정규화: 행마다 flo_stk 를 stocks.listing_shares 와 비교해 ×1 과 ×1000 중 더 가까운(로그 비율 거리) 배수를 고르고 dstr_stk 에 같은 배수를 쓴다. listing_shares 가 없는 행은 그 run 의 다수결 배수를 쓴다. run 마다 배수 표(votes · 결정값 · 다수결과 다른 행 수)와 raw 표본 1행(code · flo_stk · dstr_stk · dstr_rt · listing_shares)이 로그 한 줄로 남는다"
    - "dstr_stk 가 비었거나 0 이거나 없으면(ETF 등) float_shares 와 float_rate 는 null 이다"
    - "GET /api/stocks/:code/float 는 { code, floatShares, floatRate, listedShares, asOf } 를 Cache-Control public, max-age=3600 으로 준다. stocks 에 있지만 배치 행이 없으면 200 + 네 값 모두 null, stocks 에 없으면 404 STOCK_NOT_FOUND. Supabase 왕복은 1회"
    - "GET /api/stocks/float 는 { asOf, fields: [floatShares, floatRate, listedShares], rows: { code: [n|null, n|null, n|null] } } 를 RPC stock_float_all 왕복 1회로 준다(PostgREST 1000행 절단 없음). /:code 라우트가 'float' 를 코드로 삼키지 않는다"
    - "두 엔드포인트는 DB 만 읽는다 — 요청이 키움 호출을 일으키지 않는다(호출량이 사용자 수와 독립)"
    - "연속 실패가 한도(기본 20)에 닿으면 남은 호출을 멈추고 이미 받은 행만 저장한 뒤 exit 1 — 차단 신호를 재시도로 두드리지 않는다"
    - "JOB_MODE 미설정이면 기존 intraday 사이클이 그대로 돈다(기존 intraday-sync 테스트 green). 알 수 없는 JOB_MODE 값은 exit 1"
  artifacts:
    - path: supabase/migrations/20261106200000_stock_float.sql
      provides: "stock_float 표(code PK → stocks ON DELETE CASCADE) · RLS 읽기 TO anon, authenticated · RPC stock_float_all(jsonb) + REVOKE PUBLIC/anon/authenticated + GRANT service_role"
    - path: workers/intraday-sync/src/pipeline/floatShares.ts
      provides: "parseKiwoomCount · parseKiwoomRate · pickUnitMultiplier · decideRunMultiplier · toStockFloatRow (순수 함수)"
    - path: workers/intraday-sync/src/floatSync.ts
      provides: "syncStockFloat(코어, 의존성 주입) · runFloatSyncJob(설정 · 클라이언트 생성)"
    - path: server/src/routes/stocks.ts
      provides: "GET /float · GET /:code/float (둘 다 /:code 보다 먼저 등록)"
    - path: scripts/deploy-intraday-sync.sh
      provides: "gh-radar-float-sync Job(같은 이미지, JOB_MODE=float) + gh-radar-float-sync-cron '30 21 * * 1-5' Asia/Seoul"
  key_links:
    - from: workers/intraday-sync/src/index.ts
      to: workers/intraday-sync/src/floatSync.ts
      via: "main() 이 resolveJobMode(process.env.JOB_MODE) === 'float' 이면 runFloatSyncJob 호출"
    - from: workers/intraday-sync/src/floatSync.ts
      to: stock_float
      via: "supabase.from('stock_float').upsert(rows, { onConflict: 'code' }) — 열 이름이 마이그레이션과 같아야 함"
    - from: server/src/routes/stocks.ts
      to: stock_float_all
      via: "supabase.rpc('stock_float_all') — rows 배열 순서 = fields 순서 [floatShares, floatRate, listedShares]"
    - from: server/src/routes/stocks.ts
      to: stock_float
      via: "stocks select 에 stock_float(...) embed — FK stock_float.code → stocks.code"
---

<objective>
gh-trade 클라 호가창 「발행1%」 클릭 때 보여 줄 유통주식수를 공급한다: 키움 ka10001 의 flo_stk · dstr_stk · dstr_rt 를 평일 야간 배치로 전 종목 받아 주 단위로 정규화해 stock_float 에 저장하고, 공개 엔드포인트 2종(전 종목 압축 JSON · 단일 종목)으로 내보낸다.

Purpose: 키움 응답 단위(주 vs 천주)가 미확인이라 단위에 강건해야 하고, 키움 호출은 고정 야간 배치에만 묶어 사용자 수와 분리한다(CLAUDE.md 공식 API 운영 기준).
Output: 마이그레이션 1개 · intraday-sync 이미지의 새 실행 모드 · 배포 스크립트 섹션(실행 안 함) · server 라우트 2개 · vitest 단위 테스트.

배포(supabase db push · Cloud Run Job 배포 · Job 실행 · server 배포)는 이 plan 에 없다 — 메인 세션이 나중에 한다. executor 는 커밋까지만.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# 키움 · 워커 패턴 (읽고 재사용 — 키움 클라이언트 복제 금지)
@packages/shared/src/kiwoom.ts
@workers/intraday-sync/src/index.ts
@workers/intraday-sync/src/config.ts
@workers/intraday-sync/src/kiwoom/fetchHotSet.ts
@workers/intraday-sync/src/kiwoom/rateLimiter.ts
@workers/intraday-sync/src/kiwoom/tokenStore.ts
@workers/intraday-sync/src/retry.ts
@workers/intraday-sync/src/pipeline/map.ts
@workers/intraday-sync/tests/fetchHotSet.test.ts
@scripts/deploy-intraday-sync.sh

# DB 관례 (FK · RLS · REVOKE 3줄 · SECURITY INVOKER + search_path)
@supabase/migrations/20260628120000_limit_up_tables.sql
@supabase/migrations/20261106100000_dma_diagnosis_for_user.sql

# server 라우트 · 테스트 패턴
@server/src/routes/stocks.ts
@server/src/errors.ts
@server/tests/routes/limitup-report.test.ts
@server/tests/routes/stock-detail.test.ts

## 확정 사실 (메인 세션 조사 — 다시 조사하지 말 것)
- ka10001 응답에 flo_stk(상장주식) · dstr_stk(유통주식) · dstr_rt(유통비율)가 있다(제3자 문서 기준). 단위(주 vs 천주) 미확인이고 로컬에서 실측 불가(키움은 Cloud Run 고정 egress IP 경유) → 단위 강건 설계 + 스모크용 로그.
- stocks.listing_shares = KRX LIST_SHRS(주 단위, bigint, null 가능). stocks.market 은 KOSPI/KOSDAQ 뿐. 마스터에 ELW 2,735 · ETN 이 섞여 있어 그대로 돌리면 run 이 두 배 이상 길어진다 → ELW · ETN · 상폐 제외(ETF 는 포함, dstr 비면 null).
- 키움 실효 한도 ≈ 4 req/s/IP(intraday-sync 08:00~20:02 · server on-demand 와 공유). 21:30 에는 intraday 가 쉬므로 배치 몫은 3 req/s(server on-demand 여유) — 약 4천 종목 ≈ 22~25분.
- PostgREST 기본 최대 행 1000 → 전 종목 읽기는 일반 select 금지(RPC 1회). Cloud Run → Supabase 왕복 수가 지연을 지배 → 단일 종목도 왕복 1회.
- 동시 세션 메모리 → vitest 는 항상 --maxWorkers=2.
- intraday-sync 이미지 CMD 는 node dist/index.js — 새 Job 은 같은 이미지에 env JOB_MODE=float 만 다르게 준다.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): 한 종목 — 키움 ka10001 응답 → 주 단위 행 → stock_float 표 → GET /api/stocks/:code/float</name>
  <files>packages/shared/src/kiwoom.ts, supabase/migrations/20261106200000_stock_float.sql, workers/intraday-sync/src/pipeline/floatShares.ts, workers/intraday-sync/tests/floatShares.test.ts, server/src/routes/stocks.ts, server/tests/routes/stock-float.test.ts</files>
  <behavior>
    - floatShares 단위: parseKiwoomCount("+5,969,783") = 5969783 · "" / undefined / "0" / "abc" → null. parseKiwoomRate("75.38") = 75.38 · "+75.38" = 75.38 · "0" / "" / "123.4"(0 초과 100 이하 밖) → null
    - pickUnitMultiplier(5969783, 5969782660) = 1000 · pickUnitMultiplier(5969782660, 5969782660) = 1 · pickUnitMultiplier(5900000000, 5969782660) = 1
    - decideRunMultiplier: 1000 표 3행 + 1 표 1행 → multiplier 1000, votes {1:1, 1000:3}, disagree 1. listing_shares 있는 행이 0개 → multiplier null. 동률 → null
    - toStockFloatRow: 삼성(flo "5969783", dstr "4500000", rt "75.38", listing 5969782660) → float_shares 4500000000 · listed_shares 5969783000 · float_rate 75.38. ETF(dstr "") → float_shares null · float_rate null · listed_shares 는 채워짐. listing_shares null 행 → run 배수 적용. run 배수도 null 이고 listing_shares 도 null → 세 값 모두 null. dstr_rt 가 비거나 범위 밖이고 두 주식수가 있으면 float/listed×100 을 소수 둘째 자리로 반올림. 행 키는 정확히 code · float_shares · float_rate · listed_shares · as_of · updated_at
    - route: 배치 행 있음 → 200 { code, floatShares, floatRate, listedShares, asOf } + Cache-Control 에 public 과 max-age=3600 + supabase.from 호출 정확히 1회(select 문자열에 stock_float( 포함)
    - route: embed 가 배열 모양([{...}])으로 와도 같은 응답 · stocks 에는 있고 embed 가 null/빈 배열 → 200 + 네 값 null
    - route: stocks 에 없음 → 404 code STOCK_NOT_FOUND · 형식 위반 코드(예: "ab$c") → 400
  </behavior>
  <action>
1) packages/shared/src/kiwoom.ts — KiwoomKa10001Row 에 선택 문자열 필드 flo_stk(상장주식) · dstr_stk(유통주식) · dstr_rt(유통비율 %) 3개를 추가한다. 주석: 단위(주 vs 천주) 미확인 — workers/intraday-sync/src/pipeline/floatShares.ts 가 stocks.listing_shares 와 비교해 주 단위로 정규화. 다른 필드는 건드리지 않는다.

2) supabase/migrations/20261106200000_stock_float.sql — BEGIN/COMMIT 로 감싸고, 머리 주석 몇 줄(목적: gh-trade 호가창 유통주식수 · 원천 키움 ka10001 · 모든 값 주 단위 · 쓰기는 service_role 배치만 · RLS TO anon, authenticated 둘 다 · RPC REVOKE 3줄 근거). 표 stock_float: code text PRIMARY KEY REFERENCES stocks(code) ON DELETE CASCADE(limit_up 표 관례), float_shares bigint null, float_rate numeric null, listed_shares bigint null, as_of date NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(). ENABLE ROW LEVEL SECURITY + 정책 read_stock_float FOR SELECT TO anon, authenticated USING (true). 쓰기 정책은 만들지 않는다. 함수 public.stock_float_all() RETURNS jsonb, LANGUAGE sql, STABLE, SECURITY INVOKER, SET search_path = public, pg_temp(20261106100000 관례) — stock_float 전체를 한 번에 읽어 jsonb_build_object 로 asOf = max(as_of), rows = COALESCE(jsonb_object_agg(code, jsonb_build_array(float_shares, float_rate, listed_shares)), 빈 jsonb 객체) 를 돌려준다(빈 표면 asOf null · rows {}). 배열 순서가 server 의 fields 순서와 같다는 주석을 단다. 그 뒤 REVOKE EXECUTE ... FROM PUBLIC; REVOKE EXECUTE ... FROM anon, authenticated; GRANT EXECUTE ... TO service_role (Supabase auto-grant 가 PUBLIC REVOKE 를 덮으므로 anon/authenticated 명시 — memory 규칙).

3) workers/intraday-sync/src/pipeline/floatShares.ts — 순수 함수만(I/O 없음). 머리 주석에 단위 미확인 · 정규화 규칙 · 스모크 때 로그로 확인한다는 점을 짧게.
   - parseKiwoomCount(s): trim → 앞 부호(+/-) 제거 → 콤마 제거 → Number. 유한하고 0 보다 크면 그 값, 아니면 null.
   - parseKiwoomRate(s): 같은 정리 후 0 < r ≤ 100 이면 r, 아니면 null.
   - pickUnitMultiplier(flo, listingShares): 1 과 1000 중 |ln(flo×m / listingShares)| 가 작은 쪽(동률이면 1).
   - type FloatRaw = { code, flo: number|null, dstr: number|null, rate: number|null, listingShares: number|null } 과 toFloatRaw(code, row, listingShares) — 키는 요청한 universe code 를 쓴다(응답 stk_cd 아님 — 접미사가 붙을 수 있음). 응답 전체를 들고 다니지 않고 이 네 값만 남긴다(최소 필드 보관).
   - decideRunMultiplier(raws): flo 와 listingShares 가 둘 다 있는 행마다 pickUnitMultiplier 로 투표 → { multiplier: 1|1000|null, votes: {1, 1000}, disagree }. 표 0개 또는 동률이면 multiplier null, disagree = 다수결과 다른 행 수.
   - toStockFloatRow(raw, runMultiplier, asOf, updatedAtIso): m = 행에 flo 와 listingShares 가 있으면 행별 pickUnitMultiplier, 없으면 runMultiplier. m 이 null 이면 세 값 null. listed_shares = flo 있으면 Math.round(flo×m) 아니면 null. float_shares = dstr 있으면 Math.round(dstr×m) 아니면 null(빈/0/누락 dstr_stk → null). float_rate = float_shares 가 null 이면 null, 아니면 rate, rate 가 null 이고 listed_shares 가 있으면 Math.round(float_shares / listed_shares × 10000) / 100. 반환 행 타입 StockFloatRow 의 키는 code · float_shares · float_rate · listed_shares · as_of · updated_at 뿐(마이그레이션 열 이름과 동일).
   - workers/intraday-sync/tests/floatShares.test.ts 에 behavior 의 floatShares 항목을 먼저 쓴다(RED → GREEN). 기존 fixtures/ka10001-*.json 은 수정하지 않고 테스트 안에 인라인 객체로 둔다.

4) server/src/routes/stocks.ts — /search 핸들러 뒤, /:code 핸들러 앞에 stocksRouter.get("/:code/float", …) 를 등록한다. 코드 형식은 /:code 와 같은 정규식으로 검사해 위반이면 ApiError(400, "INVALID_QUERY_PARAM", …). 조회는 왕복 1회: supabase.from("stocks").select("code, stock_float(float_shares, float_rate, listed_shares, as_of)").eq("code", code).maybeSingle(). error 면 throw, 행이 없으면 StockNotFound(code). embed 값은 객체 · 배열 · null 어느 모양이든 첫 행 또는 null 로 정규화(PostgREST 일대일 판정 버전 차이 흡수). 응답 { code, floatShares, floatRate, listedShares, asOf } — 숫자는 null 을 지키며 Number 로 강제, asOf 는 문자열 그대로. res.set("Cache-Control", "public, max-age=3600"). 키움 런타임(kiwoomRuntime)은 이 라우트에서 쓰지 않는다 — DB 만 읽는다. 라우트 위에 짧은 주석(quick 261106-ldl · gh-trade 발행1% · 값은 주 단위 · 야간 배치가 채움).
   - server/tests/routes/stock-float.test.ts 는 limitup-report.test.ts 처럼 테스트 파일 안의 최소 supabase mock 을 쓴다: from(table) 이 select(cols) → eq(col, val) → maybeSingle() 체인을 돌려주고 호출(table · cols · val)을 기록, rpc(fn) 도 기록(Task 3 에서 씀). createApp({ supabase }) 로 앱을 만들고 supertest 로 behavior 의 route 항목을 검증한다.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/intraday-sync exec vitest run tests/floatShares.test.ts --maxWorkers=2 && pnpm -F @gh-radar/server exec vitest run tests/routes/stock-float.test.ts --maxWorkers=2 && grep -v '^\s*--' supabase/migrations/20261106200000_stock_float.sql | grep -c "TO anon, authenticated" && test "$(grep -v '^\s*--' supabase/migrations/20261106200000_stock_float.sql | grep -c 'REVOKE EXECUTE')" -ge 2 && pnpm -F @gh-radar/shared build</automated>
  </verify>
  <done>floatShares 단위 테스트와 /:code/float 라우트 테스트가 통과하고, 마이그레이션에 RLS 읽기 정책(anon, authenticated)과 RPC REVOKE 2줄 + GRANT service_role 이 있으며, shared 빌드가 성공한다(Task 2 타입체크가 새 필드를 본다).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 야간 배치 모드 JOB_MODE=float — 전 종목 수집 · 정규화 · upsert + 배포 스크립트 섹션</name>
  <files>workers/intraday-sync/src/floatSync.ts, workers/intraday-sync/src/index.ts, workers/intraday-sync/src/kiwoom/fetchHotSet.ts, workers/intraday-sync/tests/floatSync.test.ts, scripts/deploy-intraday-sync.sh</files>
  <behavior>
    - universe 를 pageSize 2 로 주입하면 stocks range 조회가 두 페이지 이상 불리고(짧은 페이지에서 멈춤), 필터는 is_delisted=false · security_group 이 ELW/ETN 아님 · code 정렬
    - kiwoom mock: 005930(flo "5969783" · dstr "4500000" · rt "75.38" · listing 5969782660) → stock_float 행 float_shares 4500000000. 069500(ETF, dstr "") → float_shares null 행으로 저장(nullCount). 한 종목 non-429 오류 → failed 1, 그 종목 행은 upsert 에 없음, 나머지는 저장. listing_shares null 종목 → run 배수(1000) 적용
    - upsert 는 표 stock_float · onConflict "code" · upsertBatchSize 2 주입 시 묶음 수만큼 호출 · 결과 ok/nullCount/failed/universe 가 맞음 · 각 행 as_of = KST 실행일
    - 모든 호출이 실패하고 maxConsecutiveFailures 3 주입 → aborted true, kiwoom post 호출 수 ≤ 3 + concurrency
    - KRX 휴장일(2026-12-25 KST)로 now 주입 → kiwoom 호출 0 · upsert 0 · skipped "holiday"
    - resolveJobMode(undefined) = "intraday" · resolveJobMode("float") = "float" · resolveJobMode("flaot") 는 throw
  </behavior>
  <action>
1) workers/intraday-sync/src/kiwoom/fetchHotSet.ts — 종목 1건 호출부를 fetchKa10001One(client, token, code): Promise&lt;KiwoomKa10001Row&gt; 로 추출해 export 한다(acquireKiwoomRateToken → POST /api/dostk/stkinfo { stk_cd } · 헤더 authorization/api-id ka10001/content-type · return_code ≠ 0 이면 지금과 같은 메시지로 throw). fetchKa10001ForHotSet 은 codes 를 이 함수로 map 하도록만 바꾼다 — 동작 동일, tests/fetchHotSet.test.ts 는 수정 없이 통과해야 한다. 키움 클라이언트를 새로 만들거나 복제하지 않는다.

2) workers/intraday-sync/src/floatSync.ts (신규) — 머리 주석 몇 줄: quick 261106-ldl · 평일 21:30 KST 고정 배치(사용자 수와 독립, CLAUDE.md 공식 API 운영 기준) · 단위 미확인이라 배수 결정 로그로 스모크 확인 · 연속 실패 차단기.
   - syncStockFloat(deps): deps = { supabase, kiwoom, getToken: () =&gt; Promise&lt;string&gt;, now?, concurrency?(4), pageSize?(1000), upsertBatchSize?(500), tokenRefreshEvery?(500), maxConsecutiveFailures?(20), retryAttempts?(3) }. logger.child({ job: "float-sync", dateIso }) 로 로그.
   - dateIso = now 의 KST 날짜 YYYY-MM-DD(index.ts 의 todayIsoKst 와 같은 계산 — index.ts 를 import 하면 순환이므로 floatSync.ts 안에 작은 함수로 둔다). isKrxHoliday(dateIso) 면 로그 후 kiwoom · DB 호출 없이 skipped "holiday" 로 반환.
   - universe: stocks 에서 code, listing_shares 를 is_delisted=false · security_group not in ("ELW","ETN") · code 오름차순으로 range(from, from+pageSize−1) 페이지 반복(짧은 페이지에서 종료). error 는 throw(아무것도 쓰지 않고 run 실패). universe 수를 로그.
   - 수집: universe 를 tokenRefreshEvery 크기 덩어리로 나눠, 덩어리마다 token = await getToken()(getKiwoomToken 의 만료 5분 전 갱신이 긴 run 에서도 걸리도록), 덩어리 안은 concurrency 개 워커가 공유 인덱스로 종목을 꺼내 withRetry(() =&gt; fetchKa10001One(kiwoom, token, code), "ka10001 " + code, retryAttempts) 를 부른다(429 는 retry.ts 가 5회 · 1/2/4/8초로 승격 — 기존 패턴 그대로). 성공 → toFloatRaw 로 네 값만 보관하고 연속 실패 카운터 0. 실패 → failures 에 { code, error } 추가, 카운터 +1. 카운터가 maxConsecutiveFailures 에 닿으면 aborted = true 로 두고 모든 워커가 새 종목을 꺼내지 않으며 남은 덩어리도 건너뛴다(차단 신호를 재시도로 두드리지 않음 — 이미 받은 행은 아래에서 저장).
   - 정규화: decideRunMultiplier(raws) 결과를 로그 한 줄로 남긴다 — votes · multiplier · disagree · 표본 1행(005930 이 있으면 그것, 없으면 listing_shares 가 있는 첫 행: code · flo_stk · dstr_stk · dstr_rt 원문 · listing_shares · 고른 배수). multiplier 가 null 이면 warn. 각 raw 를 toStockFloatRow(raw, multiplier, dateIso, new Date().toISOString()) 로 행으로 만든다. ok = float_shares 가 있는 행 수, nullCount = 없는 행 수.
   - 저장: rows 를 upsertBatchSize 묶음으로 withRetry(() =&gt; supabase.from("stock_float").upsert(batch, { onConflict: "code" }) …, "upsertStockFloat") — error 는 throw. 실패 종목의 기존 행은 건드리지 않는다(as_of 가 오래된 채 남아 신선도를 보여 줌).
   - 마지막 로그 한 줄 "float sync complete": { dateIso, universe, ok, null: nullCount, failed, aborted, multiplier, upserted, elapsedMs, failureSample(앞 5건, 오류 120자), failureGroups(오류 앞 80자 기준 상위 5) } — intraday 의 STEP2 실패 로그 모양을 따른다.
   - 반환 { dateIso, universe, ok, nullCount, failed, aborted, skipped: "holiday" | null, multiplier, votes, upserted }.
   - runFloatSyncJob(): loadConfig() → createSupabaseClient(config) → configureKiwoomRateLimiter({ capacity: config.ka10001RateLimitPerSec, refillRatePerSec: 같은 값 }) → createKiwoomClient(config.kiwoomBaseUrl) → getToken = withRetry(() =&gt; getKiwoomToken(supabase, config), "getKiwoomToken") 의 accessToken → syncStockFloat 호출. config.ts 는 바꾸지 않는다(배치 몫 3 req/s 는 배포 env KA10001_RATE_LIMIT 로 준다).

3) workers/intraday-sync/src/index.ts — resolveJobMode(raw: string | undefined): "intraday" | "float" 를 export(미설정/빈 값 → "intraday", "float" → "float", 그 밖 → Error throw). main() 은 resolveJobMode(process.env.JOB_MODE) 가 "float" 면 runFloatSyncJob() 결과를 "float-sync complete" 로 로그하고 aborted 면 exit 1 아니면 exit 0, 아니면 지금의 runIntradayCycle 경로를 그대로 탄다. resolveJobMode 가 throw 하면 기존 catch 로 "intraday-sync failed" exit 1. runIntradayCycle 본문과 CLI 진입 가드(argv[1] 이 index.js 로 끝날 때만 main)는 바꾸지 않는다.

4) workers/intraday-sync/tests/floatSync.test.ts — behavior 항목을 먼저 쓴다. supabase mock 은 from("stocks") 체인(select → eq → not → order → range)과 from("stock_float").upsert 를 기록하는 최소 객체, kiwoom mock 은 post 가 body.stk_cd 로 응답을 고르는 vi.fn(stock-detail.test.ts 의 mockKiwoomRuntime 모양). 테스트 시작 때 configureKiwoomRateLimiter({ capacity: 1000, refillRatePerSec: 1000 }) + resetKiwoomRateLimiter 로 버킷 대기를 없애고, retryAttempts 1 을 주입해 non-429 실패가 재시도 대기로 느려지지 않게 한다. resolveJobMode 는 index.ts 에서 import(기존 runCycle.test.ts 처럼).

5) scripts/deploy-intraday-sync.sh — 실행하지 않는다(배포는 메인 세션). 머리 주석에 float-sync Job · Scheduler 한 줄씩 추가. upsert_scheduler_job 에 선택 세 번째 인자 uri(기본값 기존 $URI)를 받게 하고 create/update 의 --uri 에 그것을 쓴다(기존 두 호출은 그대로). Section 6 Scheduler 뒤 · Section 7 Alert 앞에 "Section 6b: float-sync Job (quick 261106-ldl)" 을 넣는다: FLOAT_JOB=gh-radar-float-sync, FLOAT_SCHED=gh-radar-float-sync-cron, FLOAT_ENV 는 COMMON_ENV 에 덧붙이지 말고(같은 키 중복 방지 · --set-env-vars 는 전량 치환) 같은 ^@^ 구분자 형식으로 SUPABASE_URL · KIWOOM_BASE_URL=https://api.kiwoom.com · KIWOOM_TOKEN_TYPE=live · LOG_LEVEL=info · APP_VERSION=${SHA} · KA10001_RATE_LIMIT=${FLOAT_RATE_LIMIT:-3} · JOB_MODE=float 로 따로 만든다. gcloud run jobs deploy "$FLOAT_JOB" 는 같은 $IMAGE · $RUNTIME_SA · --cpu=1 --memory=512Mi --task-timeout=3600s --max-retries=0 --parallelism=1 --tasks=1 · 같은 --network/--subnet/--vpc-egress=all-traffic(고정 IP 경유 필수) · --set-secrets="$COMMON_SECRETS". 이어서 Scheduler SA 에 run.invoker 바인딩, FLOAT_URI(…/jobs/${FLOAT_JOB}:run)로 upsert_scheduler_job "$FLOAT_SCHED" "30 21 * * 1-5" "$FLOAT_URI". 주석: 21:30 = intraday 창(~20:02) 뒤라 키움 IP 한도를 server on-demand 와만 나눔 · 3 req/s × 약 4천 종목 ≈ 22~25분 · timeout 3600s 여유. 마지막 요약 echo 에 float Job/Scheduler 줄과 "첫 실행 로그의 multiplier · 표본 행 확인" 안내를 추가.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/shared build && pnpm -F @gh-radar/intraday-sync exec vitest run tests/floatSync.test.ts tests/floatShares.test.ts tests/fetchHotSet.test.ts tests/runCycle.test.ts --maxWorkers=2 && pnpm -F @gh-radar/intraday-sync typecheck && bash -n scripts/deploy-intraday-sync.sh && grep -v '^\s*#' scripts/deploy-intraday-sync.sh | grep -c "JOB_MODE=float" && grep -v '^\s*#' scripts/deploy-intraday-sync.sh | grep -c "30 21 \* \* 1-5"</automated>
  </verify>
  <done>floatSync 테스트(페이지 · 정규화 · 실패 격리 · 묶음 upsert · 차단기 · 휴장일 · JOB_MODE)가 통과하고, 기존 fetchHotSet · runCycle 테스트와 intraday-sync 타입체크가 green 이며, 배포 스크립트가 문법 검사를 통과하고 float Job(JOB_MODE=float · timeout 3600s · VPC all-traffic)과 평일 21:30 Scheduler 섹션을 담는다(실행은 안 함).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 전 종목 엔드포인트 GET /api/stocks/float — RPC 1회 압축 JSON</name>
  <files>server/src/routes/stocks.ts, server/tests/routes/stock-float.test.ts</files>
  <behavior>
    - rpc stock_float_all 이 { asOf: "2026-11-06", rows: { "005930": [4500000000, 75.38, 5969783000], "069500": [null, null, 12345000] } } → 200 { asOf: "2026-11-06", fields: ["floatShares","floatRate","listedShares"], rows: 같은 객체 } + Cache-Control 에 public 과 max-age=3600
    - rpc 는 정확히 1회 · 이름 stock_float_all · supabase.from 호출 0회(= /:code 핸들러가 'float' 를 코드로 삼키지 않음)
    - 빈 표(rpc 가 { asOf: null, rows: {} } 또는 data null) → 200 { asOf: null, fields, rows: {} }
    - rpc error → 500 (기존 에러 미들웨어 경로)
  </behavior>
  <action>
server/src/routes/stocks.ts — stocksRouter.get("/float", …) 를 /:code 핸들러보다 반드시 먼저 등록한다(Task 1 의 /:code/float 옆, /search 뒤). supabase.rpc("stock_float_all") 를 한 번 부르고 error 면 throw. data 가 null 이면 asOf null · rows {} 로 둔다. 응답은 { asOf, fields: ["floatShares", "floatRate", "listedShares"], rows } — fields 는 라우트 파일의 상수(STOCK_FLOAT_FIELDS)로 두고 RPC 배열 순서와 같다는 주석을 단다. rows 는 행마다 다시 만들지 않고 RPC 결과를 그대로 넘긴다(약 4천 항목). res.set("Cache-Control", "public, max-age=3600"). 키움 호출 없음, 인증 없음(기존 공개 라우트 · 전역 /api 레이트 리미터 그대로). 일반 .from("stock_float").select() 로 바꾸지 않는다 — PostgREST 1000행에서 잘린다.
server/tests/routes/stock-float.test.ts — Task 1 에서 만든 파일의 mock(rpc 기록)을 재사용해 behavior 항목을 describe 하나로 추가한다. 기존 Task 1 테스트는 그대로 둔다.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/server exec vitest run tests/routes/stock-float.test.ts tests/routes/stock-detail.test.ts tests/routes/search.test.ts --maxWorkers=2 && pnpm -F @gh-radar/server typecheck</automated>
  </verify>
  <done>/float 와 /:code/float 테스트가 함께 통과하고, 기존 stock-detail · search 라우트 테스트가 회귀 없이 green 이며, server 타입체크가 통과한다.</done>
</task>

</tasks>

<verification>
- 워커 전체: pnpm -F @gh-radar/shared build && pnpm -F @gh-radar/intraday-sync exec vitest run --maxWorkers=2 (기존 intraday 테스트 포함 green)
- server 라우트 전체: pnpm -F @gh-radar/server exec vitest run tests/routes --maxWorkers=2
- 타입체크: pnpm -F @gh-radar/intraday-sync typecheck && pnpm -F @gh-radar/server typecheck
- 배포 명령(supabase db push · gcloud run jobs deploy/execute · server 배포)은 실행하지 않았다 — SUMMARY 에 메인 세션이 할 순서를 적는다: ① supabase db push --linked --yes (20261106200000) ② GCP_PROJECT_ID · SUPABASE_URL 넣고 scripts/deploy-intraday-sync.sh ③ gcloud run jobs execute gh-radar-float-sync 로 첫 실행 → 로그의 multiplier · votes · 표본 행(005930)과 "float sync complete" 의 ok/null/failed 확인 ④ server 배포 후 GET /api/stocks/005930/float · GET /api/stocks/float 스모크
</verification>

<success_criteria>
- 단위가 주든 천주든 stock_float 에는 주 단위 값이 들어가고, 판단 근거(배수 표 · 표본 행)가 run 로그에 남는다
- dstr_stk 가 빈 종목은 float_shares null, 종목별 실패는 run 을 멈추지 않으며 연속 실패는 차단기로 멈춘다
- 두 공개 엔드포인트가 DB 왕복 1회로 계약된 JSON 과 Cache-Control public, max-age=3600 을 준다
- intraday 사이클 동작 불변, 새 Job 은 같은 이미지 + JOB_MODE=float + 평일 21:30 Scheduler 로 배포 스크립트에 정의됨
- webapp 변경 · e2e · 문서 추가 없음(짧은 머리 주석만)
</success_criteria>

<output>
Create `.planning/quick/261106-ldl-stock-float/261106-ldl-SUMMARY.md` when done
</output>
