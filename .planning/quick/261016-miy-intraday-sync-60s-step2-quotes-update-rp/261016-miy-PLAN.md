---
phase: quick-261016-miy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql
  - workers/intraday-sync/src/pipeline/upsertQuotes.ts
  - workers/intraday-sync/tests/upsertQuotes.test.ts
  - ops/alert-intraday-sync-failure.yaml
autonomous: true
requirements: [MIY-1-step2-quotes-rpc, MIY-2-alert-threshold]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "upsertQuotesStep2 가 hot set N 건(~100~250)을 Supabase 왕복 1회(rpc 1건)로 쓴다 — 종목별 직렬 PATCH 가 없다"
    - "intraday_update_quotes_step2 는 stock_quotes 에 이미 있는 code 의 open · high · low · upper_limit · lower_limit · market_cap · updated_at 만 바꾸고, price · change_amount · change_rate · volume · trade_amount · rate_updated_at 은 그대로 둔다"
    - "stock_quotes 에 없는 code 는 no-op 이다(INSERT 없음) — RPC 반환값은 실제로 갱신된 행 수다"
    - "upper_limit · lower_limit 입력이 null 이면 기존 값을 유지한다 — NOT NULL 컬럼에 null 하나가 들어와도 배치 전체가 중단되지 않는다"
    - "anon · authenticated 는 intraday_update_quotes_step2 를 EXECUTE 할 수 없고 service_role 만 할 수 있다"
    - "RPC 가 error 를 돌려주면 upsertQuotesStep2 가 throw 한다(index.ts 의 withRetry 가 그대로 받는다)"
    - "intraday-sync 실패 알림은 10분 윈도우에서 실패 실행 3건 이상일 때만 울린다 — 매분 잡의 단발 60s 타임아웃으로는 울리지 않는다"
  artifacts:
    - path: "supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql"
      provides: "intraday_update_quotes_step2(p_rows jsonb) RETURNS integer — UPDATE ... FROM jsonb_to_recordset 단일문, SECURITY DEFINER, search_path = public, REVOKE PUBLIC/anon/authenticated + GRANT service_role"
      contains: "jsonb_to_recordset"
    - path: "workers/intraday-sync/src/pipeline/upsertQuotes.ts"
      provides: "upsertQuotesStep2 — supabase.rpc(\"intraday_update_quotes_step2\", { p_rows }) 1회, 시그니처 · { count } 반환 유지"
      contains: "intraday_update_quotes_step2"
    - path: "workers/intraday-sync/tests/upsertQuotes.test.ts"
      provides: "upsertQuotesStep2 describe — rpc 1회 · payload 키 = recordset 컬럼 · count = RPC 반환값 · 빈 입력 no-op · rpc 에러 throw"
      contains: "intraday_update_quotes_step2"
    - path: "ops/alert-intraday-sync-failure.yaml"
      provides: "alignmentPeriod 600s · ALIGN_SUM · COMPARISON_GT thresholdValue 2 · 최상위 displayName 불변"
      contains: "600s"
  key_links:
    - from: "workers/intraday-sync/src/pipeline/upsertQuotes.ts"
      to: "supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql"
      via: "supabase.rpc(\"intraday_update_quotes_step2\", { p_rows }) — payload 키(code/open/high/low/upper_limit/lower_limit/market_cap)가 jsonb_to_recordset 컬럼 정의와 정확히 같아야 한다. 다르면 해당 컬럼이 조용히 null 로 들어간다"
      pattern: "rpc\\(\"intraday_update_quotes_step2\""
    - from: "ops/alert-intraday-sync-failure.yaml"
      to: "scripts/deploy-intraday-sync.sh"
      via: "배포 스크립트가 최상위 displayName=gh-radar-intraday-sync-failure 로 기존 정책을 찾아 update — 최상위 displayName 을 바꾸면 정책이 중복 생성된다"
      pattern: "displayName: gh-radar-intraday-sync-failure"
---

<objective>
intraday-sync(Cloud Run Job, 매분, --task-timeout=60s)의 60s 타임아웃 실패를 없앤다. 성공 실행도 p95 58s 로 한도에 붙어 있고, 그중 upsertQuotesStep2 가 ~12s 를 쓴다 — 종목별 UPDATE 를 직렬로 ~100건 넘게 보내고, Cloud Run 이 VPC all-traffic egress 라 왕복마다 ~120ms 가 든다. 이를 단일 RPC 왕복 1회로 바꿔 실행 시간을 ~12s 줄인다. 아울러 매분 잡이라 단발 실패는 다음 분에 저절로 회복되므로, 실패 알림은 「10분에 3건 이상」일 때만 울리게 한다.

Purpose: 성공 실행에 ~12s 여유가 생기면 컨테이너 기동 지연(7~20s)이 튀어도 60s 를 넘지 않는다. 알림 조건을 바꾸면 자가 회복되는 단발 실패로는 알림이 오지 않는다.
Output: 새 마이그레이션 1개(RPC), upsertQuotesStep2 본문 교체 + 테스트 갱신, 알림 정책 YAML 조정. 배포는 하지 않는다 — 오케스트레이터가 마이그레이션 → 워커 → 알림 정책 순서로 배포한다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@workers/intraday-sync/src/pipeline/upsertQuotes.ts
@workers/intraday-sync/src/pipeline/upsertOhlc.ts
@workers/intraday-sync/tests/upsertQuotes.test.ts
@workers/intraday-sync/tests/upsertOhlc.test.ts
@supabase/migrations/20260514120300_intraday_upsert_ohlc_rpc.sql
@ops/alert-intraday-sync-failure.yaml

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 필요한 계약만 추렸다. -->

packages/shared/src/kiwoom.ts:
  export type IntradayOhlcUpdate = {
    code: string; date: string; open: number; high: number; low: number;
    upperLimit: number | null; lowerLimit: number | null; marketCap: number | null; // marketCap 은 parseMac 이 Math.round 한 정수
  };

stock_quotes 컬럼 (supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql + 20261001090000_stock_quotes_rate_updated_at.sql):
  code text PK · price numeric(20,2) NOT NULL · change_amount numeric(20,2) NOT NULL · change_rate numeric(8,4) NOT NULL
  volume bigint NOT NULL · trade_amount bigint NOT NULL · open/high/low numeric(20,2) NULL · market_cap bigint NULL
  upper_limit numeric(20,2) NOT NULL · lower_limit numeric(20,2) NOT NULL · updated_at timestamptz NOT NULL · rate_updated_at timestamptz NULL

intraday_upsert_ohlc 최신 형태 (본뜰 대상): LANGUAGE plpgsql · SECURITY DEFINER · search_path = public
  (20260702160000_security_perf_advisor_fixes.sql 의 ALTER FUNCTION ... SET search_path = public)
  REVOKE EXECUTE ... FROM PUBLIC; REVOKE EXECUTE ... FROM anon, authenticated; GRANT EXECUTE ... TO service_role; BEGIN/COMMIT 로 감쌈.

호출부 (변경 금지): workers/intraday-sync/src/index.ts — await withRetry(() => upsertQuotesStep2(supabase, step2UpdatesRaw), "upsertQuotesStep2") — 반환값은 쓰지 않는다.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: STEP2 quotes 갱신 일괄화 — 워커 → 단일 RPC → stock_quotes UPDATE 한 경로</name>
  <files>supabase/migrations/20261016150000_intraday_update_quotes_step2_rpc.sql, workers/intraday-sync/src/pipeline/upsertQuotes.ts, workers/intraday-sync/tests/upsertQuotes.test.ts</files>
  <behavior>
    - 1행 입력 → rpc 가 정확히 1회, 이름 "intraday_update_quotes_step2", 인자 { p_rows: [{ code, open, high, low, upper_limit, lower_limit, market_cap }] } (이 7키뿐 — date · price · volume · trade_amount · change_rate · rate_updated_at · updated_at 없음)
    - rate_updated_at 회귀 고정 (261001-bnc): p_rows 행에 rate_updated_at · change_rate 키가 없다
    - 250행 입력 → rpc 1회, 반환 count 는 rpc 의 data (예: mock data 248 → count 248)
    - 빈 입력 → rpc 호출 없음, count 0
    - rpc 가 { error } 를 돌려주면 그 에러로 reject
    - (SQL 스모크) 있는 code 2개 + 없는 code 1개 입력 → 반환 2, 행 수 불변(INSERT 없음), STEP1 컬럼 6개 불변, null 상·하한가 입력은 기존 값 유지, anon/authenticated EXECUTE 불가 · service_role 가능
  </behavior>
  <action>
동시 세션 주의: 다른 세션이 같은 트리의 master 에 phase 32 커밋을 올리고 있다. git add 는 이 태스크 파일 3개를 경로로 지정해서만 하고(-A · . 금지), .planning/STATE.md · .planning/milestone.lock 은 건드리지 않는다. push 하지 않는다. 커밋 직전에 git status -sb 로 남의 변경이 스테이징에 섞이지 않았는지 확인한다.

(1) 마이그레이션 파일명. 먼저 ls supabase/migrations | sort | tail -1 로 가장 늦은 파일을 본다(작성 시점에는 20261010200100_dma_account_order_server.sql). 20261016150000 이 그보다 늦으면 그대로 쓰고, 아니면 더 늦은 타임스탬프로 올린다. 실제 쓴 파일명은 SUMMARY 에 적는다(이하 이 파일을 「마이그레이션」이라 부른다).

(2) 마이그레이션 내용. 형식은 supabase/migrations/20260514120300_intraday_upsert_ohlc_rpc.sql 을 따른다. 상단 한글 주석 블록(quick 261016-miy, 근거: 종목별 직렬 UPDATE ~100건 × VPC egress 왕복 ~120ms ≈ 12s → 60s task timeout 실패, 단일 문장 1왕복으로 대체), BEGIN; ... COMMIT; 으로 감싼다.
  - CREATE OR REPLACE FUNCTION public.intraday_update_quotes_step2(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public — intraday_upsert_ohlc 의 최신 형태(SECURITY DEFINER + search_path = public)를 그대로 따른다.
  - 본문: DECLARE affected integer := 0; 그다음 UPDATE 문 하나. 대상은 public.stock_quotes AS q, 소스는 jsonb_to_recordset(p_rows) AS r(code text, open numeric, high numeric, low numeric, upper_limit numeric, lower_limit numeric, market_cap bigint), 조건은 WHERE q.code = r.code. 이 recordset 컬럼 이름 7개가 곧 워커 payload 키다.
  - SET 은 이 7개만: open = r.open, high = r.high, low = r.low, upper_limit = COALESCE(r.upper_limit, q.upper_limit), lower_limit = COALESCE(r.lower_limit, q.lower_limit), market_cap = r.market_cap, updated_at = now().
  - price · change_amount · change_rate · volume · trade_amount · rate_updated_at 은 SET 에 넣지 않는다. 이들은 STEP1 이 매분 쓰는 컬럼이고, rate_updated_at 을 넣지 않는 이유는 261001-bnc 와 같다. 이 사실을 SQL 주석에 한 줄 남긴다.
  - 쓰기는 UPDATE 하나뿐이다. 행을 새로 만드는 분기를 두지 않는다 — stock_quotes 에 없는 code 는 매칭이 안 돼 no-op 이다(지금 동작과 같다).
  - market_cap 은 null 이 와도 그대로 대입한다(지금 동작 유지).
  - upper_limit · lower_limit 의 COALESCE 는 Claude 재량으로 넣은 것이다. 두 컬럼이 NOT NULL 이라 단일 문장에서 null 이 하나만 있어도 배치 전체가 23502 로 중단된다. null 은 「ka10001 값 없음」이므로, STEP1 이 전일종가로 채워 둔 값을 유지한다. 이 이유를 SQL 주석으로 남긴다.
  - 이어서 GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected; 로 실제 갱신 행 수를 돌려준다.
  - 권한(MEMORY feedback_supabase_rpc_revoke): REVOKE EXECUTE ON FUNCTION public.intraday_update_quotes_step2(jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.intraday_update_quotes_step2(jsonb) FROM anon, authenticated; GRANT EXECUTE ON FUNCTION public.intraday_update_quotes_step2(jsonb) TO service_role; 세 줄을 모두 쓴다. Supabase 의 auto-grant 가 PUBLIC 회수만으로는 덮어쓰기 때문이다.
  - 청크는 나누지 않는다(~100~250행).

(3) workers/intraday-sync/src/pipeline/upsertQuotes.ts 의 upsertQuotesStep2 본문을 교체한다. 시그니처와 Promise<{ count: number }> 반환은 그대로다. 빈 입력이면 { count: 0 } 을 조기 반환한다(rpc 호출 없음).
  - payload 를 만든다: updates 의 각 원소를 { code, open, high, low, upper_limit: upperLimit, lower_limit: lowerLimit, market_cap: marketCap } 로 매핑한다. date 는 넣지 않는다 — stock_quotes 에 date 컬럼이 없다.
  - supabase.rpc("intraday_update_quotes_step2", { p_rows: payload }) 를 한 번 호출하고 { data, error } 를 받는다.
  - error 가 있으면 logger.error({ err: error, rows: payload.length }, "upsertQuotesStep2 rpc failed") 를 남기고 throw error 한다.
  - 정상이면 { count: Number(data ?? 0) } 를 반환한다. 이 값은 실제 갱신 행 수이며, 없는 code 는 세지 않는다.
  - 종목별 루프와 함수 안의 now 지역변수(new Date().toISOString())를 없앤다. updated_at 은 이제 SQL 의 now() 가 찍는다.
  - rate_updated_at 근거 주석 블록(261001-bnc, 동일스틸럭스 023790 문장 포함 5줄)은 지우지 않는다. rpc 호출 바로 위로 옮기고, 「여기서」를 「RPC 에서도」 취지로만 고친다.
  - 함수 위 JSDoc 을 고친다. 2026-05-15 first cycle 의 UPSERT → UPDATE 전환 배경 문단은 이력으로 남긴다. 그다음 줄, 즉 종목별 직렬 방식을 현재 해결책으로 적은 「해결:」 줄은 아래 두 가지로 바꿔 쓴다.
    - 현재 해결책: 단일 RPC intraday_update_quotes_step2 에서 UPDATE ... FROM jsonb_to_recordset 를 1왕복으로 처리한다. UPDATE 만 하므로 INSERT 분기가 없고, NOT NULL 컬럼이 평가되지 않으며, 없는 code 는 no-op 이다.
    - 바꾼 이유 (quick 261016-miy): 예전 종목별 직렬 방식은 VPC all-traffic egress 왕복 ~120ms × ~100건 ≈ 12s 가 걸려 60s task timeout 실패를 일으켰다.
  - payload 컬럼 설명 줄은 「code(매칭 키)/open/high/low/upper_limit/lower_limit/market_cap — updated_at 은 RPC 의 now()」로 고친다. 상·하한가 null 이면 기존 값을 유지한다는 점도 한 줄 적는다. 기존 omit 설명 두 줄(price/change/volume/trade_amount, rate_updated_at)은 유지한다.
  - upsertQuotesStep1 · prevCloseOf · limitDownPrice · CHUNK · import 는 건드리지 않는다. 단, 교체 후 쓰이지 않는 import 가 생기면 정리한다.

(4) workers/intraday-sync/tests/upsertQuotes.test.ts 의 upsertQuotesStep2 쪽을 고친다. 패턴은 workers/intraday-sync/tests/upsertOhlc.test.ts 를 따른다: rpc = vi.fn().mockResolvedValue({ data, error: null }) 로 만들고, supabase = { rpc } 를 Parameters<typeof upsertQuotesStep2>[0] 로 캐스팅한다.
  - 종목별 update/eq mock 헬퍼(mockUpdateEq)와 그 위 docstring 을 지우고, rpc mock 기반 테스트 5개로 바꾼다. 각 테스트는 behavior 블록의 앞 5개 항목에 하나씩 대응한다.
  - payload 테스트는 p_rows[0] 를 toEqual 로 정확히 비교한다. 기대값: { code: "005930", open: 70000, high: 71000, low: 69500, upper_limit: 91000, lower_limit: 49000, market_cap: 4209000 * 1e8 }. rpc.mock.calls[0][0] 이 "intraday_update_quotes_step2" 인지도 단언한다.
  - upsertQuotesStep1 describe 와 mockUpsert 헬퍼는 건드리지 않는다.
  - RED 로 시작한다. 테스트를 먼저 고친 뒤 실행해서, 현 구현 기준으로 실패하는지 확인하고 나서 (3) 을 적용한다.

(5) SQL 스모크 — 커밋하지 않는 검증. 실행자 scratchpad 디렉터리를 SMOKE_DIR 로 두고 setup.sql 과 assert.sql 두 파일을 만든다(리포에 추가 금지).
  - setup.sql: 위 interfaces 의 stock_quotes 컬럼으로 public.stock_quotes 를 만든다. 행 2개를 넣는다.
    - 'A00001': price 1000, change_amount 10, change_rate 1.0, volume 5, trade_amount 5000, upper_limit 1300, lower_limit 700, market_cap NULL, updated_at '2026-01-01', rate_updated_at '2026-10-16 09:00+09'
    - 'A00002': 같은 값
  - assert.sql 은 DO 블록과 ASSERT 로 다음을 확인한다.
    - ① 반환값이 2인지. 호출 인자는 '[{"code":"A00001","open":990,"high":1010,"low":980,"upper_limit":1310,"lower_limit":710,"market_cap":123456789012},{"code":"A00002","open":1,"high":2,"low":1,"upper_limit":null,"lower_limit":null,"market_cap":null},{"code":"ZZZZZZ","open":1,"high":1,"low":1,"upper_limit":1,"lower_limit":1,"market_cap":1}]'::jsonb
    - ② count(*) 가 여전히 2인지(ZZZZZZ 가 들어가지 않음)
    - ③ A00001 의 open/high/low/upper_limit/lower_limit/market_cap 이 새 값인지, updated_at 이 '2026-01-01' 보다 큰지, price/change_amount/change_rate/volume/trade_amount/rate_updated_at 이 원래 값 그대로인지
    - ④ A00002 의 upper_limit 1300 · lower_limit 700 이 유지되는지
    - ⑤ has_function_privilege 결과가 'anon' 과 'authenticated' 는 false, 'service_role' 은 true 인지
  - 실행 순서: docker run -d --rm --name miy-smoke -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.104 로 띄운다(이 이미지는 로컬에 있고, anon/authenticated/service_role 역할과 auto-grant 기본 권한을 갖고 있다 — 계획 시점에 확인함).
  - 준비 대기는 docker exec miy-smoke sh -c 'for i in $(seq 1 90); do pg_isready -h localhost -U postgres -q && exit 0; sleep 1; done; exit 1' 로 한다.
  - 그다음 setup.sql · 마이그레이션 · assert.sql 을 docker cp 로 컨테이너 /tmp 에 넣는다. 이어서 psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f 세 개를 이 순서로 한 번에 실행한다. 정확한 명령은 verify 의 두 번째 automated 줄이다.
  - 끝나면 성공·실패와 무관하게 docker rm -f miy-smoke 로 정리한다.
  - 샌드박스가 docker 소켓을 막으면 샌드박스를 해제하고 다시 실행한다.

(6) 커밋 2개(한글, Co-Authored-By 줄 없음).
  - RED 커밋은 테스트 파일만 넣는다: test(quick-261016-miy): upsertQuotesStep2 단일 RPC 계약 테스트
  - GREEN 커밋은 마이그레이션과 upsertQuotes.ts 를 넣는다: perf(quick-261016-miy): intraday-sync STEP2 quotes 갱신을 단일 RPC 로 일괄화 — 60s 타임아웃 실패 해소
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/intraday-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/intraday-sync typecheck && pnpm --filter @gh-radar/intraday-sync build && test "$(grep -c '\.update(' workers/intraday-sync/src/pipeline/upsertQuotes.ts)" = 0 && test "$(grep -c '\.eq(' workers/intraday-sync/src/pipeline/upsertQuotes.ts)" = 0 && test "$(grep -c '종목별 UPDATE 직렬 호출' workers/intraday-sync/src/pipeline/upsertQuotes.ts)" = 0 && grep -q 'rpc("intraday_update_quotes_step2"' workers/intraday-sync/src/pipeline/upsertQuotes.ts && grep -q '261001-bnc' workers/intraday-sync/src/pipeline/upsertQuotes.ts && M=$(ls supabase/migrations/*_intraday_update_quotes_step2_rpc.sql) && test "$(ls supabase/migrations | sort | tail -1)" = "$(basename "$M")" && test "$(grep -v '^[[:space:]]*--' "$M" | grep -c 'INSERT INTO')" = 0 && grep -q 'jsonb_to_recordset' "$M" && grep -q 'SECURITY DEFINER' "$M" && grep -q 'search_path = public' "$M" && grep -q 'FROM anon, authenticated' "$M" && grep -q 'TO service_role' "$M" && grep -q 'GET DIAGNOSTICS' "$M"</automated>
    <automated>docker run -d --rm --name miy-smoke -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.104 && docker exec miy-smoke sh -c 'for i in $(seq 1 90); do pg_isready -h localhost -U postgres -q && exit 0; sleep 1; done; exit 1' && docker cp "$SMOKE_DIR/setup.sql" miy-smoke:/tmp/setup.sql && docker cp supabase/migrations/*_intraday_update_quotes_step2_rpc.sql miy-smoke:/tmp/mig.sql && docker cp "$SMOKE_DIR/assert.sql" miy-smoke:/tmp/assert.sql && docker exec miy-smoke psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/setup.sql -f /tmp/mig.sql -f /tmp/assert.sql; RC=$?; docker rm -f miy-smoke >/dev/null; test "$RC" = 0</automated>
  </verify>
  <done>
    - intraday-sync 워커 전체 vitest(--maxWorkers=2) · typecheck · build 통과. upsertQuotesStep2 테스트 5개가 rpc 1회 · 7키 payload · count = RPC data · 빈 입력 no-op · 에러 throw 를 고정한다.
    - upsertQuotes.ts 에 종목별 update/eq 호출과 옛 「해결:」 문구가 없다. rpc("intraday_update_quotes_step2" 호출이 1곳 있고, 261001-bnc 근거 주석은 남아 있다.
    - 마이그레이션이 supabase/migrations 에서 가장 늦은 파일이다. 주석이 아닌 줄에 INSERT INTO 가 없다. SECURITY DEFINER · search_path = public · REVOKE PUBLIC/anon,authenticated · GRANT service_role · GET DIAGNOSTICS 가 모두 있다.
    - SQL 스모크 ①~⑤ ASSERT 가 모두 통과했고, 컨테이너는 정리됐다.
    - 커밋 2개(RED 테스트 · GREEN 구현)가 경로 지정 스테이징으로 master 에 올라갔다. push 는 하지 않았다.
  </done>
</task>

<task type="auto">
  <name>Task 2: intraday-sync 실패 알림 — 10분 윈도우 실패 3건 이상으로 완화</name>
  <files>ops/alert-intraday-sync-failure.yaml</files>
  <action>
ops/alert-intraday-sync-failure.yaml 만 고친다. 같은 커밋 규칙을 따른다(경로 지정 git add, push 금지, 커밋 전 git status -sb 확인).
  - 최상위 displayName: gh-radar-intraday-sync-failure 는 절대 바꾸지 않는다. scripts/deploy-intraday-sync.sh 가 이 이름으로 기존 정책을 찾아 update 하기 때문이다.
  - aggregations[0].alignmentPeriod 를 300s 에서 600s 로 바꾼다. perSeriesAligner: ALIGN_SUM 은 그대로 둔다.
  - conditionThreshold.thresholdValue 를 0 에서 2 로 바꾼다. comparison: COMPARISON_GT · duration: 0s · filter · combiner · enabled · notificationChannels · alertStrategy.autoClose 는 그대로 둔다. COMPARISON_GT 에 2 이므로 10분 합계가 3건 이상일 때 울린다.
  - 조건 displayName 을 「intraday-sync failed executions >= 3 in 10m」로 바꾼다.
  - documentation.content 를 고친다.
    - 둘째 줄(「DATA-02 (Phase 09.1) —」로 시작하는 줄)의 윈도우 · 건수 문구를 「10분 윈도우 실패 3건 이상 시 알림 (quick 261016-miy — 매분 잡이라 단발 실패는 자가 회복)」으로 바꾼다. 옛 윈도우 · 건수 문구는 남기지 않는다.
    - 원인 추정 줄의 맨 앞에 「60s task timeout (가장 흔함 — 매분 잡이라 단발 실패는 다음 분에 자가 회복)」을 첫 원인으로 넣는다. 기존 원인들(키움 401 / 429 / MIN_EXPECTED 가드 위반 / Supabase 장애)은 그 뒤에 그대로 둔다.
  - 들여쓰기 · 키 순서 · mimeType 은 기존 파일을 유지한다.
  - 커밋: chore(quick-261016-miy): intraday-sync 실패 알림 — 10분 윈도우 실패 3건 이상으로 완화 (한글, Co-Authored-By 줄 없음).
  </action>
  <verify>
    <automated>ruby -ryaml -e 'y=YAML.load_file("ops/alert-intraday-sync-failure.yaml"); c=y["conditions"][0]; t=c["conditionThreshold"]; a=t["aggregations"][0]; d=y["documentation"]["content"]; ok = y["displayName"]=="gh-radar-intraday-sync-failure" && a["alignmentPeriod"]=="600s" && a["perSeriesAligner"]=="ALIGN_SUM" && t["thresholdValue"]==2 && t["comparison"]=="COMPARISON_GT" && t["duration"]=="0s" && y["notificationChannels"]==["${NOTIFICATION_CHANNEL_ID}"] && d.include?("10분 윈도우 실패 3건 이상") && d.include?("60s task timeout") && !d.include?("5분 윈도우"); abort("alert yaml mismatch") unless ok; puts "ok"'</automated>
  </verify>
  <done>
    - YAML 이 파싱된다. 최상위 displayName 은 그대로이고, alignmentPeriod 600s · ALIGN_SUM · COMPARISON_GT · thresholdValue 2 · duration 0s · notificationChannels 플레이스홀더도 그대로다.
    - documentation 에 「10분 윈도우 실패 3건 이상」이 있고, 「60s task timeout (가장 흔함 …)」이 첫 원인으로 올라가 있다. 「5분 윈도우」 문구는 남아 있지 않다.
    - 커밋 1개가 경로 지정 스테이징으로 master 에 올라갔다. push 는 하지 않았다.
  </done>
</task>

</tasks>

<verification>
- pnpm --filter @gh-radar/intraday-sync exec vitest run --maxWorkers=2 — 워커 전체 테스트(19파일) 녹색. runCycle.test.ts 는 upsertQuotesStep2 를 mock 하므로 영향이 없어야 한다.
- pnpm --filter @gh-radar/intraday-sync typecheck && pnpm --filter @gh-radar/intraday-sync build — 통과.
- Task 1 SQL 스모크 ①~⑤ 통과(UPDATE 만 · STEP1 컬럼 보호 · null 상·하한가 유지 · 실제 갱신 행 수 반환 · 권한).
- Task 2 ruby YAML 단언 통과.
- 범위 확인: git diff --stat 으로 이번 작업의 커밋들이 건드린 파일이 files_modified 4개(마이그레이션은 실제 파일명)뿐인지 본다. index.ts · task-timeout · KA10001_RATE_LIMIT · HOT_SET_TOP_N · 스케줄러 · 배포 스크립트는 바뀌지 않았다.
</verification>

<success_criteria>
- upsertQuotesStep2 가 Supabase 를 1번만 왕복한다(종목 수와 무관). 예상 효과: 성공 실행에서 ~12s 단축(p95 58s → ~46s 대).
- STEP1 이 매분 쓰는 컬럼(price · change_amount · change_rate · volume · trade_amount · rate_updated_at)은 STEP2 가 덮지 않는다(SQL 스모크로 입증). 없는 종목은 INSERT 하지 않는다.
- RPC 권한은 service_role 만 갖는다.
- 실패 알림은 10분에 3건 이상일 때만 울린다.
</success_criteria>

<output>
작업이 끝나면 `.planning/quick/261016-miy-intraday-sync-60s-step2-quotes-update-rp/261016-miy-SUMMARY.md` 를 만든다. 여기에 실제 마이그레이션 파일명, 커밋 해시 3개, SQL 스모크 결과(①~⑤), 테스트·타입체크·빌드 결과를 적는다.

배포는 이 플랜 범위 밖이다(supabase db push · gcloud 를 실행하지 않는다). SUMMARY 에 오케스트레이터용 배포 순서를 아래와 같이 남긴다.
1. 마이그레이션 적용 — supabase db push --linked --yes. 반드시 워커보다 먼저 한다. 워커가 먼저 나가면 RPC 가 없어 매분 STEP2 가 PGRST202 로 실패한다. db push 직후 워커가 PGRST202 를 내면 NOTIFY pgrst, 'reload schema' 로 스키마 캐시를 갱신한다.
2. 워커 배포 — scripts/deploy-intraday-sync.sh (GCP_PROJECT_ID · SUPABASE_URL · NOTIFICATION_CHANNEL_ID 필요). 이 스크립트의 Section 7 이 알림 정책도 update 하므로 3단계가 같이 처리된다.
3. 알림 정책 — 2단계에서 처리되지 않았다면 ops/alert-intraday-sync-failure.yaml 을 gcloud alpha monitoring policies update 로 적용한다.
4. 사후 확인 — 배포 후 성공 실행의 소요시간 p95 가 ~12s 줄었는지, upsertQuotesStep2 단계 로그 시간이 1s 미만인지 Cloud Logging 에서 본다.
</output>
