---
phase: quick-261112-tlw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — DB 응답 fills · pgTAP (마이그레이션 타임스탬프는 실행 시점 `ls supabase/migrations | tail -3` 로 충돌만 확인 —
  #          20261112400000 이상이 이미 있으면 그 뒤 빈 번호로 바꾸고 아래 경로 · SUMMARY 를 같은 이름으로 맞춘다)
  - supabase/migrations/20261112400000_launch_orders_openarb_fills.sql
  - supabase/tests/launch_orders_openarb_fills.test.sql
  - supabase/tests/launch_gate.test.sql
  # Task 2 — shared 계산 정본
  - packages/shared/src/launch.ts
  - packages/shared/src/__tests__/launch.test.ts
  # Task 3 — 화면
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/__tests__/launch-format.test.ts
  - webapp/src/components/admin/launch-orders-tab.tsx
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
autonomous: false
requirements: ["261112-tlw"]

estimate:
  tokens: 140000
  raw_tokens: 140000
  tasks: 4
  confidence: low

must_haves:
  truths:
    - "러쉬주문 → 주문 내역 → 09:00:30 화면에서 (서버, 시장) 묶음에 개장차익 손익 줄이 있으면 조각 표 위에 소제목 「종목별 손익」 + 손익 표 + 소제목 「주문」 이 보이고, 손익 표 열은 종목 | 손익 | 잔여 | 방향 | 매수 체결 | 매도 체결 | 계좌 | 사용자 + 마지막 「합계」 줄(손익 칸만 값)이다 (D-01)"
    - "손익 값은 gh-trade 개장차익 화면과 같은 체결 순서 재생 식(매도마다 그 순간 매수 누계 기준 floor · 왕복 비용 22bp floor)이다 — 픽스처 두산에너빌리티 +379,382 · 유진테크 −427,228 · 아스테라시스 +164,352(잔여 175) · 교보119 매수만 0(잔여 42) · 섞인 순서 41(합산식이면 39) (D-02)"
    - "09:00:30 머리 카드에 「손익」 줄이 그 시장 손익 합 · 종목 수 · 잔여 종목 수로 보이고(예 「−262,876원 · 2종목 · 잔여 1」), 손익 줄 0개 시장 카드는 「—」 다 (D-01)"
    - "16:00 화면은 응답에 fills 가 있어도 한 글자도 안 바뀌고, fills 키가 없는 옛 응답(db push 전)이면 09:00:30 화면도 지금 그대로다(손익 표 · 카드 줄 없음) (D-01 · D-03)"
    - "그 서버 탭 조각에서 시장을 못 찾은 손익 줄은 버리지 않고 그 서버 첫 묶음 앞의 「서버 이름만」 묶음에 손익 표만으로 보이며, 카드 합계에는 들지 않는다 (D-03)"
    - "launch_orders_for_admin(p_date) 응답에 fills 키가 있고 그 날 origin 'OpenArb' · notice_type 'E' · exec_qty > 0 체결만 (gateway, gw_time, journal_epoch, seq) 순으로 10키 모양으로 담기며, 빈 표 조기 반환도 fills [] 이고 권한(anon·authenticated 불가 · service_role 가능)은 그대로다 (D-03)"
    - "폰 390 에서 손익 표는 자기 래퍼(min-w-0 overflow-x-auto) 안에서만 가로로 밀리고 페이지는 넓어지지 않는다 (D-01)"
  artifacts:
    - path: "supabase/migrations/20261112400000_launch_orders_openarb_fills.sql"
      provides: "launch_orders_for_admin 재정의 — 20261104710000 ② 본문 + fills 키(조기 반환 포함) · COMMENT · REVOKE/GRANT 재명시 · 되돌리기 주석"
      contains: "'fills'"
    - path: "supabase/tests/launch_orders_openarb_fills.test.sql"
      provides: "빈 표 fills [] · OpenArb 체결만 · 체결 순서 · 다른 출처/비체결/수량 0/다른 날 제외 · 키 모양 · 권한 pgTAP"
      contains: "launch_orders_for_admin"
    - path: "packages/shared/src/launch.ts"
      provides: "LaunchOpenArbFill · LaunchOpenArbPnlRow · LAUNCH_OPENARB_COST_BP · launchOpenArbPnlOf · LaunchOrdersResponse.fills?"
      contains: "launchOpenArbPnlOf"
    - path: "webapp/src/lib/launch-format.ts"
      provides: "fmtPnl · pnlToneOf · openArbDirLabelOf · openArbFillCellOf · launchPnlSplitOf · launchPnlSummaryOf"
      contains: "launchPnlSplitOf"
    - path: "webapp/src/components/admin/launch-orders-tab.tsx"
      provides: "묶음 안 손익 표(data-slot launch-pnl) · 소제목(launch-sub) · 시장 모름 묶음(data-pnl-only) · 머리 카드 「손익」 줄(launch-card-pnl)"
      contains: "launch-pnl"
  key_links:
    - from: "supabase/migrations/20261112400000_launch_orders_openarb_fills.sql"
      to: "packages/shared/src/launch.ts LaunchOpenArbFill"
      via: "jsonb 10키 gateway · account · dma_user_id · isin · stock_code · stock_name · side · exchange · price · qty (server admin-launch.ts 는 그대로 통과)"
      pattern: "'dma_user_id', e.dma_user_id"
    - from: "webapp/src/lib/launch-format.ts"
      to: "packages/shared/src/launch.ts"
      via: "launchPnlSplitOf 가 shared launchOpenArbPnlOf 한 벌만 호출(두 번째 계산 구현 금지)"
      pattern: "launchOpenArbPnlOf\\("
    - from: "webapp/src/components/admin/launch-orders-tab.tsx"
      to: "webapp/src/lib/launch-format.ts"
      via: "LaunchOrdersView 가 fire === 'n0930' && resp.fills !== undefined 일 때만 launchPnlSplitOf(gw, resp.fills, 탭 조각) 호출"
      pattern: "launchPnlSplitOf\\("
---

<objective>
러쉬주문 → 주문 내역 → 09:00:30(`fire === 'n0930'`) 화면에 개장차익 종목별 손익(gh-trade 개장차익 화면과 같은 값)을 보여 준다.
설계는 CONTEXT D-01 ~ D-04 가 전부다(잠금 — 다시 묻거나 바꾸지 않는다). 탐색 · 리서치 · 대안 비교 금지.

Purpose: 트레이더가 09:00:30 주문 내역에서 개장차익 매수 → 매도 결과(손익 · 못 판 잔여)를 gh-trade 를 열지 않고 바로 확인한다.
Output: RPC `launch_orders_for_admin` 의 `fills` 키(D-03) → shared 계산 정본 `launchOpenArbPnlOf`(D-02) → 묶음마다 「종목별 손익」 표 ·
머리 카드 「손익」 줄(D-01). relay · server · workers · gh-trade 변경 없음(D-03 · D-04).

분해 방식: 오케스트레이터 지시(권장 3태스크 = DB → shared → webapp)를 따른다. 세 층은 D-03 의 jsonb `fills` 모양 하나로만 이어지고,
DB push(Task 4 · 오케스트레이터) 전에는 층을 가로지르는 실행 경로가 없어 tracer 슬라이스가 정보를 더하지 않는다 — 계약(모양) 먼저 순서로 간다.

범위 상한(D-04): 아래 9개 파일만. 하지 않는 것 — relay · server · workers · gh-trade, 16:00 화면, 경계 지도 탭, 새 CSS 토큰(globals.css 무변경),
실시간 갱신, 계좌 실비용 손익(`realized_pnl_krw` 쓰지 않음), 목업 맨 아래 설명 문단, 배포(`supabase db push` · `git push` 는 실행자가 하지 않는다).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261112-tlw-09-00-30-launch-openarb-pnl/261112-tlw-CONTEXT.md
@.planning/quick/261112-tlw-09-00-30-launch-openarb-pnl/reference/mockup-launch-pnl.html

<!-- 대형 파일은 통째로 다시 읽지 말 것 — 아래 줄 번호 · 앵커로 필요한 구간만 Read(offset/limit) 한다. -->

## 이미 확인된 위치 (플래너가 HEAD 에서 실측 · 2026-11-12)

- `supabase/migrations/20261104710000_launch_queue_live.sql` 103 ~ 172행 = `launch_orders_for_admin` 최신 정의(② 블록) — 103 `CREATE OR REPLACE` ·
  121 ~ 123 빈 표 조기 반환 · 128 ~ 163 `RETURN jsonb_build_object('dates', 'date', 'heads', 'pieces')` · 164 ~ 165 `END; $$;` ·
  167 ~ 168 COMMENT · 170 ~ 172 REVOKE PUBLIC / REVOKE anon, authenticated / GRANT service_role. 파일 머리(1 ~ 24행)가 헤더 주석 꼴
  (무엇 · 왜 · 권한 · 원격 적용 · 되돌리기), 26행 `BEGIN;` · 174행 `COMMIT;`.
- `public.dma_journal_events` 열은 전부 NOT NULL(20260924200000 62 ~ 89행): account_no · isin · side(''·'B'·'S') · exchange('' 기본) ·
  dma_user_id('' 기본) · exec_price · exec_qty(integer) · gw_time(timestamptz). 부분 인덱스 `idx_dma_journal_events_fill_day (trade_date, account_no) WHERE notice_type = 'E'`(20261028210000 44행).
- pgTAP 실행 = `bash scripts/verify-dma-orders-price-check.sh --test <파일>` — 일회용 로컬 docker 컨테이너에 마이그레이션 전부 재생 후 실행
  (원격 접촉 0). `not ok` 또는 psql 오류면 exit 1 · 끝줄 `# RESULT: PASS`. 단 `plan(N)` 불일치(`# Looks like you planned …`)는 exit 0 이라 별도로 grep 한다.
- `supabase/tests/launch_gate.test.sql`: 41 ~ 43행 빈 표 전체 jsonb 비교 · 348 ~ 352행 `launch_orders_for_admin('20261013') - 'dates'` 비교 —
  둘 다 `fills` 키를 더해야 통과. 316 ~ 318행 `INSERT INTO public.stocks (code, name, market, isin) VALUES (…) ON CONFLICT DO NOTHING` 이 stocks 픽스처 꼴.
  다른 launch_*.test.sql(launch_piece_queue 86 · launch_project_mapping 443 · launch_fire_base_key 171/177)은 `->'pieces'` · `->'heads'` 만 꺼내 영향 없음.
  `supabase/tests/launch_piece_queue.test.sql` 50 ~ 62행이 `INSERT INTO public.dma_journal_events (gateway, journal_epoch, seq, trade_date, gw_time, account_no, isin, side, order_no, notice_type, exchange, exec_price, exec_qty)` 픽스처 꼴,
  38 ~ 48행이 `INSERT INTO public.launch_pieces (…)` 직접 삽입 꼴.
- `packages/shared/src/launch.ts`(547줄): 260 ~ 266행 `LaunchOrdersResponse { dates, date, heads, pieces }` · 끝(540 ~ 547행) `launchFireOf`.
  `packages/shared/src/index.ts` 281행 `export * from "./launch";` 이미 있음 → 새 export 자동 노출(index 수정 불필요).
  테스트 = `packages/shared/src/__tests__/launch.test.ts`(13 ~ 32행 import 목록이 `from "../launch"` · describe 는 `describe("…", () => {` 꼴).
- **webapp 은 `@gh-radar/shared` 를 dist 로 해석한다**(package exports → `dist/` · dist 는 gitignore). shared 를 고친 뒤 webapp 타입체크 · vitest 전에
  반드시 `npm --prefix packages/shared run build`.
- `webapp/src/lib/launch-format.ts`(433줄): 1 ~ 12행 머리 주석(①~④) · 14 ~ 29행 shared import · 33 `MINUS` · 35 `DASH` · 37 `NUM` ·
  40 ~ 45 `fmtUs`(null「—」·0「0」·양수「+」·음수 U+2212) · 107 `serverMarketLabelOf` · 132 `orderTabPiecesOf` · 263 ~ 317 `launchHeadCardOf`.
- `webapp/src/components/admin/launch-orders-tab.tsx`(537줄): 5 ~ 12 shared import · 18 ~ 32 launch-format import · 146 ~ 160 `pieces` · `groups` · `cards` useMemo ·
  206 ~ 210 머리 카드 grid · 211 ~ 230 `groups.map` → `<section data-slot="launch-group">` 안 `<h2>` + `<div data-slot="launch-pieces" className={cn(CARD, 'min-w-0 overflow-x-auto ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0')}>` ·
  279 ~ 328 `LaunchHeadCard`(315 ~ 325 `model.fire === 'q16'` 분기 · n0930 은 「재전송」 「다음 오프셋」) · 330 `CardRow` · 374 ~ 381 `NUM` · `int` · `text` · `TH` · `TD` · `NUMERIC` · `DIM` ·
  402 ~ 473 `PiecesTable`(439 ~ 448 종목 칸 꼴 — 이름 · 코드 둘 다 null 이면 흐린 ISIN) · 479 `QUEUE_EST = 'text-[var(--vi)]'`.
- `webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx`(396줄): 18 ~ 48 `piece({...})` · 50 `head({...})` · 87 `N` 상수 · 89 ~ 110 `RESP`(fills 없음) ·
  112 `view(over)` · 127 `cardsOf` · 128 `groupOf(c, gw, mk)` · 184 ~ 215 「LaunchOrdersView — 09:00:30 개장차익」 describe.
  기존 테스트는 `fills` 없는 RESP 라 그대로 통과해야 한다(묶음 section 전체에서 `getAllByRole('row')` 를 세는 191행 단언 포함).
- `webapp/src/lib/__tests__/launch-format.test.ts`(624줄): 36 `piece({...})` · 68 `head({...})` 헬퍼 · 마지막 describe 601행.
- 프로젝트 vitest 는 `maxWorkers` 기본 2(webapp/vitest.config.ts) — 동시 세션 메모리 고갈 방지. 전체 회귀 · e2e 금지.

<interfaces>
<!-- Task 2 가 만들고 Task 3 이 쓰는 계약. 이름 · 모양을 그대로 쓴다. -->

packages/shared/src/launch.ts — 새 공개 API

```ts
/** 개장차익 왕복 비용 bp — gh-trade OpenArbMath.h kCostBp. */
export const LAUNCH_OPENARB_COST_BP = 22;

/** 응답 `fills` 원소 — dma_journal_events origin 'OpenArb' · notice 'E' · exec_qty > 0 · 체결 순서(D-03). */
export interface LaunchOpenArbFill {
  gateway: string;
  account: string;          // e.account_no
  dma_user_id: string;      // '' = 모름
  isin: string;
  stock_code: string | null; // stocks 조인 — 없으면 null
  stock_name: string | null;
  side: string;             // 'B' | 'S' 원문 (그 밖은 계산에서 건너뜀)
  exchange: string;         // 'KRX' | 'NXT' 원문
  price: number;            // e.exec_price
  qty: number;              // e.exec_qty
}

/** (gateway, account, isin) 한 줄 계산 결과. */
export interface LaunchOpenArbPnlRow {
  gateway: string;
  account: string;
  isin: string;
  stock_code: string | null;
  stock_name: string | null;
  dma_user_id: string | null;  // 첫 매수 체결부터 처음 나온 비어 있지 않은 값 · 없으면 null
  buy_exchange: string | null; // 첫 매수 체결 거래소 · 매수 없으면 null
  buy_qty: number;
  buy_amt: number;
  sell_qty: number;
  sell_amt: number;
  pnl: number;                 // 원 단위 정수
  resid: number;               // max(buy_qty − sell_qty, 0)
}

export function launchOpenArbPnlOf(fills: readonly LaunchOpenArbFill[]): LaunchOpenArbPnlRow[];

// LaunchOrdersResponse 에 선택 키 추가(옛 RPC 응답엔 없음):
//   fills?: LaunchOpenArbFill[];
```

webapp/src/lib/launch-format.ts — 새 공개 API

```ts
export function fmtPnl(v: number): string;                       // fmtUs 와 같은 부호 규칙: 0「0」·「+379,382」·「−427,228」(U+2212)
export function pnlToneOf(v: number): 'up' | 'down' | null;       // >0 up · <0 down · 0 null
export function openArbDirLabelOf(buyExchange: string | null): string; // KRX「KRX 매수 → NXT 매도」· NXT「NXT 매수 → KRX 매도」· 그 밖「—」
export function openArbFillCellOf(qty: number, amt: number): { qty: string; avg: string } | null; // 0 → null · {qty:'1,071주', avg:'평균 46,643'}
export interface LaunchPnlSplit {
  byMarket: ReadonlyMap<string, LaunchOpenArbPnlRow[]>; // 시장 → 그 시장 줄(입력 순서)
  unknown: LaunchOpenArbPnlRow[];                       // 탭 조각에서 시장을 못 찾은 줄(입력 순서)
}
export function launchPnlSplitOf(input: {
  gateway: string;
  fills: readonly LaunchOpenArbFill[];
  pieces: readonly Pick<LaunchPieceRow, 'gateway' | 'isin' | 'market'>[];
}): LaunchPnlSplit;
export interface LaunchPnlSummary { total: number; stocks: number; resid: number } // resid = 잔여 > 0 인 종목 수
export function launchPnlSummaryOf(rows: readonly LaunchOpenArbPnlRow[]): LaunchPnlSummary | null; // 줄 0 → null(「—」)
```

새 마이그레이션의 `fills` 항목(D-03 — `RETURN jsonb_build_object(…)` 의 `'pieces', (…)` 다음에 덧붙임)

```sql
    'fills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'gateway', e.gateway, 'account', e.account_no, 'dma_user_id', e.dma_user_id,
                         'isin', e.isin, 'stock_code', s.code, 'stock_name', s.name,
                         'side', e.side, 'exchange', e.exchange, 'price', e.exec_price, 'qty', e.exec_qty)
                       ORDER BY e.gateway, e.gw_time, e.journal_epoch, e.seq), '[]'::jsonb)
                FROM public.dma_journal_events e
                LEFT JOIN public.stocks s ON s.isin = e.isin
               WHERE e.trade_date = v_day AND e.origin = 'OpenArb' AND e.notice_type = 'E' AND e.exec_qty > 0)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RPC launch_orders_for_admin 에 fills 키 + pgTAP (D-03 · D-04 ①)</name>
  <files>supabase/migrations/20261112400000_launch_orders_openarb_fills.sql, supabase/tests/launch_orders_openarb_fills.test.sql, supabase/tests/launch_gate.test.sql</files>
  <read_first>
    - supabase/migrations/20261104710000_launch_queue_live.sql 1 ~ 26행(헤더 꼴) · 102 ~ 174행(② 본문 — 그대로 복사할 원본)
    - supabase/tests/launch_gate.test.sql 1 ~ 45행(머리 · plan · 빈 표 단언) · 310 ~ 320행(stocks 픽스처) · 342 ~ 357행 · 488 ~ 500행(권한 단언 꼴)
    - supabase/tests/launch_piece_queue.test.sql 25 ~ 62행(launch_pieces · dma_journal_events 직접 삽입 꼴)
  </read_first>
  <behavior>
    - 빈 표: `launch_orders_for_admin()` = `{"dates":[],"date":null,"heads":[],"pieces":[],"fills":[]}`
    - 2026-11-12 픽스처에서 `fills` = OpenArb · E · exec_qty > 0 · 그 날 행 5개만(OpenArb 접수 통보 A · OpenArb exec_qty 0 · origin Manual 체결 · 다른 날 OpenArb 체결은 빠짐)
    - 순서 = (gateway, gw_time, journal_epoch, seq): gw_time 이 이른 행이 seq 가 커도 먼저 · 같은 gw_time 은 seq 순 · 'KB120' 행이 'KYOBO119' 행보다 먼저(gw_time 이 더 늦어도)
    - 원소 키 = 정렬해서 account · dma_user_id · exchange · gateway · isin · price · qty · side · stock_code · stock_name(10개) · price/qty 는 jsonb number
    - stocks 에 있는 isin 은 stock_code · stock_name 이 채워지고, 없는 isin 은 JSON null
    - 다른 날짜(2026-11-11)를 p_date 로 주면 그 날 체결만(1개) · `dates` 는 조각 기준 그대로
    - 권한 그대로: EXECUTE (anon, authenticated, service_role) = (f, f, t) · p_date 형식 오류는 여전히 22023
  </behavior>
  <action>
    (1) 실행 시점에 `ls supabase/migrations | tail -3` 로 충돌만 확인한다. 마지막이 20261112340000_stock_title_aliases.sql 이하면 이름은
    `supabase/migrations/20261112400000_launch_orders_openarb_fills.sql`. 그보다 큰 번호가 생겼으면 그 뒤 빈 번호로 정하고 이 계획의 모든 경로 · SUMMARY 에 같은 이름을 쓴다.

    (2) 새 마이그레이션(D-03): 헤더 주석은 20261104710000 1 ~ 24행 꼴로 무엇(launch_orders_for_admin 교체 — 20261104710000 ② 본문 + `fills` 키) · 왜
    (09:00:30 주문 내역 개장차익 손익 — 계산은 shared `launchOpenArbPnlOf` 한 벌, SQL 에 두 번째 구현 없음) · 권한(SECURITY INVOKER + PUBLIC · anon ·
    authenticated 명시 REVOKE + service_role GRANT 재명시) · 원격 적용(커밋만 — 원격은 메인 세션 `supabase db push --linked --yes` · server 는 그대로 통과라
    배포 순서 무관 · 옛 응답엔 fills 가 없어 화면은 지금 그대로) · 되돌리기(20261104710000 ② 의 launch_orders_for_admin 본문 + COMMENT + REVOKE/GRANT 를
    CREATE OR REPLACE 로 다시 적용)를 적는다. 본문은 `BEGIN;` → 20261104710000 103 ~ 165행을 **통째로 복사**(시그니처 · LANGUAGE plpgsql · STABLE ·
    SECURITY INVOKER · `SET search_path = public, pg_temp` · p_date 형식 검사 · dates · heads · pieces 식 전부 한 글자도 바꾸지 않는다) 하되 두 곳만 바꾼다:
    122행 조기 반환 `jsonb_build_object(…)` 끝에 `'fills', '[]'::jsonb` 를 더하고, 마지막 `RETURN jsonb_build_object(` 의 `'pieces', (…)` 다음에
    위 interfaces 의 `'fills', (SELECT …)` 항목을 덧붙인다(키 이름 · 별칭 · WHERE · ORDER BY 를 그대로 — account = e.account_no · side = e.side 원문 ·
    price = e.exec_price · qty = e.exec_qty). 그 뒤 COMMENT ON FUNCTION 은 167 ~ 168행 문구 끝에 「· quick 261112-tlw fills = 그 날 개장차익(origin OpenArb)
    체결 저널 행 10키(체결 순서 · 손익 계산은 shared launchOpenArbPnlOf)」 를 덧붙이고, 170 ~ 172행 REVOKE PUBLIC · REVOKE anon, authenticated ·
    GRANT service_role 세 줄을 그대로 다시 적은 뒤 `COMMIT;`(memory: Supabase RPC 는 REVOKE anon/authenticated 명시).

    (3) 기존 pgTAP 수정: `supabase/tests/launch_gate.test.sql` 41 ~ 43행 기대값을 `'{"dates":[],"date":null,"heads":[],"pieces":[],"fills":[]}'::jsonb` 로,
    설명 문자열도 `{…, pieces:[], fills:[]}` 로 바꾼다. 348 ~ 352행 기대값을 `'{"date":"20261013","heads":[],"pieces":[],"fills":[]}'::jsonb` 로 바꾸고 설명에
    「· fills」 를 더한다. 머리 주석 12행 「빈 상태」 문구도 fills 를 포함하게 고친다. `plan(62)` 는 단언 수가 그대로라 바꾸지 않는다.

    (4) 새 pgTAP `supabase/tests/launch_orders_openarb_fills.test.sql`: launch_gate.test.sql 머리 꼴(대상 마이그레이션 · 잠그는 것 · 실행 명령 ·
    한 트랜잭션 ROLLBACK)로 쓴다. `BEGIN;` · `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;` · `SET LOCAL search_path = public, extensions;` ·
    `SELECT plan(N);`(N = 실제 단언 수와 정확히 일치). 맨 먼저 빈 표 전체 비교 1건. 픽스처: stocks 1행(launch_gate 316행 꼴 · 예 code 'TLW001' · name 'TLW테스트' ·
    isin 'KR7TLW000001' · ON CONFLICT DO NOTHING) · launch_pieces 2행(2026-11-12 KB120 A KRX 09:00:27 Q wire 0 buy isin 'KR7TLW000001' · 2026-11-11 같은 꼴 1행 —
    launch_piece_queue 38 ~ 48행 직접 INSERT 꼴, source 'backfill') · dma_journal_events(launch_piece_queue 54행 열 목록에 `origin`, `dma_user_id` 를 더한 꼴)로
    포함 5행 = KB120 seq1(09:00:27.100 · B · KRX · isin KR7TLW000001 · 1000×10 · dma_user_id 'u1' · account 'TLW-ACC1') · KB120 seq4(09:00:30.100 · B · NXT ·
    stocks 에 없는 isin 'KR7TLW000002' · 500×3) · KB120 seq2(09:00:30.200 · S · NXT · 1009×6) · KB120 seq3(09:00:30.200 · S · NXT · 1010×4) · KYOBO119 seq1
    (09:00:27.050 · B · KRX · 2000×7), 제외 4행 = KB120 seq5 OpenArb notice 'A' · seq6 OpenArb 'E' exec_qty 0 · seq7 origin 'Manual' 'E' · seq8 OpenArb 'E'
    trade_date 2026-11-11(09:00:30 · S · 1111×1). 모든 gw_time 은 `+09` 오프셋 리터럴. 단언(behavior 순서대로): 빈 표 · fills 길이 5 · 순서 문자열
    (`string_agg(e->>'gateway' || ':' || (e->>'side') || (e->>'price') || 'x' || (e->>'qty'), ',' ORDER BY o)` FROM `jsonb_array_elements(…->'fills') WITH ORDINALITY`) =
    `KB120:B1000x10,KB120:B500x3,KB120:S1009x6,KB120:S1010x4,KYOBO119:B2000x7` · 첫 원소 키 배열(정렬) 10개 · 첫 원소 stock_code/stock_name/account/dma_user_id/exchange 값과
    price 의 `jsonb_typeof` = 'number' · 둘째 원소 `stock_code` = `'null'::jsonb` · `launch_orders_for_admin('20261111')->'fills'` 길이 1 ·
    `launch_orders_for_admin('20261112')->'dates'` = `["20261112","20261111"]` · `throws_ok($$SELECT public.launch_orders_for_admin('2026-11-12')$$, '22023')` ·
    권한 (f,f,t)(launch_gate 493 ~ 497행 꼴). 단언 설명은 (날짜, 서버, 기대) 튜플로. `SELECT * FROM finish();` · `ROLLBACK;`.
    plan 수를 실제 단언 수에 맞춘다(불일치는 러너가 못 잡는다).

    docker 가 샌드박스에 막히면 같은 명령을 샌드박스 해제로 다시 돌린다(memory: 샌드박스는 raw TCP 차단). 그래도 못 돌리면 SUMMARY 에
    「pgTAP 미실행 — 사유」 를 명시한다(조용히 건너뛰지 않는다).
  </action>
  <verify>
    <automated>for t in supabase/tests/launch_orders_openarb_fills.test.sql supabase/tests/launch_gate.test.sql; do out="$(bash scripts/verify-dma-orders-price-check.sh --test "$t" 2>&1)" || { printf '%s\n' "$out" | tail -30; exit 1; }; printf '%s\n' "$out" | tail -3; if printf '%s\n' "$out" | grep -q 'Looks like'; then printf '%s\n' "$out" | grep 'Looks like'; exit 1; fi; done; grep -q "'fills', (SELECT" supabase/migrations/*_launch_orders_openarb_fills.sql && grep -q "'fills', '\[\]'::jsonb" supabase/migrations/*_launch_orders_openarb_fills.sql && grep -q "REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM anon, authenticated" supabase/migrations/*_launch_orders_openarb_fills.sql</automated>
  </verify>
  <done>두 pgTAP 파일이 `# RESULT: PASS` 이고 `Looks like` 진단이 없다. 새 마이그레이션은 20261104710000 ② 본문 + fills 두 곳 + COMMENT · REVOKE/GRANT 재명시이며 헤더에 되돌리기 주석이 있다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: shared 계산 정본 launchOpenArbPnlOf + 타입 + 단위 테스트 (D-02 · D-03 · D-04 ②)</name>
  <files>packages/shared/src/launch.ts, packages/shared/src/__tests__/launch.test.ts</files>
  <read_first>
    - packages/shared/src/launch.ts 255 ~ 275행(LaunchOrdersResponse 주변) · 535 ~ 547행(파일 끝)
    - packages/shared/src/__tests__/launch.test.ts 1 ~ 40행(import 목록 꼴) · 342 ~ 392행(describe 꼴 한 개)
  </read_first>
  <behavior>
    픽스처 F(아래 순서 그대로 · 계좌 KB120 'ACC-KB' / KYOBO119 'ACC-KY' · KB120 사용자 'ezmesya'):
    1 KB120 두산에너빌리티(isin 'KR7034020008' · '034020') B KRX 46,600×500 · 2 KB120 유진테크('KR7084370002' · '084370') B KRX 81,213×328 ·
    3 KB120 두산 B KRX 46,680×571 · 4 KB120 아스테라시스('KR7450950008' · '450950') B NXT 4,985×1,618 · 5 KB120 두산 S NXT 47,100×1,071 ·
    6 KB120 유진 S NXT 80,100×200 · 7 KB120 유진 S NXT 80,069×128 · 8 KB120 아스테라 S KRX 5,110×1,443 ·
    9 KYOBO119 isin 'KR7TLW000042'(stock_code · stock_name null) B KRX 10,000×42.
    - Test 1(완결 · 손실 · 잔여 · 매수만): 결과 4줄, 순서 = 처음 나온 순서 [두산, 유진, 아스테라, KYOBO119] ·
      두산 buy 1,071 / 49,954,280 · sell 1,071 / 50,444,100 · pnl 379,382 · resid 0 · buy_exchange 'KRX' ·
      유진 328 / 26,637,864 · 328 / 26,268,832 · pnl −427,228 · resid 0 · 'KRX' ·
      아스테라 1,618 / 8,065,730 · 1,443 / 7,373,730 · pnl 164,352 · resid 175 · 'NXT' ·
      KYOBO119 42 / 420,000 · 0 / 0 · pnl 0 · resid 42 · 'KRX' · stock_code/stock_name null.
    - Test 2(매수/매도 섞인 순서): [B KRX 1,001×3, S NXT 1,010×2, B KRX 1,002×4, S NXT 1,009×5] → pnl 41(합산식이면 39 — 순서 재생 증명) · resid 0.
    - Test 3(절사): [B 1,001×3, B 1,002×4, S 1,010×5] → pnl 32(매수 누계 몫을 반올림하면 31) · 여기에 S 1,009×2 를 더하면 pnl 43.
    - Test 4(매도만): [S NXT 1,000×10] → pnl 9,989(b = 0) · resid 0 · buy_exchange null · dma_user_id null.
    - Test 5(dma_user_id): 첫 매수 '' 뒤 매도 'u2' → 'u2' · 첫 매수 'u1' 뒤 매수 'u3' → 'u1' · 매수 전 매도 'u0' 뒤 매수 'u1' → 'u1'.
    - Test 6(건너뜀 · 키): side '' 인 새 isin 체결만 → 줄 없음 · 기존 줄에 side 'X' 체결을 더해도 값 불변 · 같은 isin 다른 account → 2줄 · 같은 isin+account 다른 gateway → 2줄 · [] → [].
    - Test 7(입력 불변): Object.freeze 한 입력 배열 · 원소로도 예외 없이 계산된다.
    - Test 8: `LAUNCH_OPENARB_COST_BP` = 22.
  </behavior>
  <action>
    `packages/shared/src/launch.ts` 끝(launchFireOf 뒤)에 「개장차익 손익(quick-261112-tlw · D-02)」 구획을 만들고 interfaces 의 `LAUNCH_OPENARB_COST_BP` ·
    `LaunchOpenArbFill` · `LaunchOpenArbPnlRow` · `launchOpenArbPnlOf` 를 그 이름 · 모양 그대로 둔다. 260 ~ 266행 `LaunchOrdersResponse` 에 선택 키
    `fills?: LaunchOpenArbFill[]` 를 더하고 주석에 「quick-261112-tlw — 그 날 개장차익 체결(체결 순서) · db push 전 옛 RPC 응답엔 없다 → 손익 표 · 카드 줄 없이 지금 화면」 을 단다.

    `launchOpenArbPnlOf`(D-02 — gh-trade `server/src/trade/strategy/OpenArb.cpp` ApplySellFill + `OpenArbMath.h` RoundTripCostKrw 체결 순서 재생 · JSDoc 에 출처와 식을 적는다):
    키 = `${gateway}|${account}|${isin}` 의 Map + 처음 나온 순서 배열. 입력을 순서대로 돌며 side 가 'B' · 'S' 가 아니면 줄을 만들기 전에 건너뛴다(D-03).
    줄이 없으면 만든다(stock_code · stock_name 은 그 첫 체결 값 · 나머지 0/null). 매수: buy_qty += qty · buy_amt += price × qty · buy_exchange 가 null 이면 이 체결의 exchange.
    매도: sell_qty += qty · sell_amt += price × qty · b = buy_qty > 0 ? Math.floor(buy_amt × qty / buy_qty) : 0(그 순간까지의 매수 누계 · 이 매도는 매수 누계를 줄이지 않는다) ·
    s = price × qty · pnl += s − b − Math.floor((b + s) × LAUNCH_OPENARB_COST_BP / 20000). 각 체결 처리 뒤 dma_user_id 가 null 이고 buy_qty > 0 이고 이 체결의
    dma_user_id 가 '' 가 아니면 그 값으로 정한다(= 첫 매수 체결의 값 · 빈 문자열이면 그 뒤 처음 나온 비어 있지 않은 값 · 끝까지 없으면 null — D-03 해석).
    끝에서 resid = Math.max(buy_qty − sell_qty, 0). 정수 계산은 Math.floor 로 충분(금액 × 수량 < 2^53 — BigInt 쓰지 않음, D-02). 계좌 실비용 손익(realized_pnl_krw)은
    쓰지 않는다(D-02). 사람이 따로 판 주문은 입력에 오지 않는다(SQL 이 origin OpenArb 만 — D-02).

    테스트는 RED 먼저: `launch.test.ts` import 목록에 `launchOpenArbPnlOf` · `LAUNCH_OPENARB_COST_BP` · `type LaunchOpenArbFill` 을 더하고, 파일 끝에
    `describe("launchOpenArbPnlOf — 개장차익 손익(quick-261112-tlw · gh-trade OpenArb ApplySellFill 재생)", …)` 로 behavior Test 1 ~ 8 을 쓴다
    (픽스처 헬퍼 `fill(over)` = gateway 'KB120' · account 'ACC-KB' · dma_user_id 'ezmesya' · isin · stock_code · stock_name · exchange 기본값 + over).
    기대값은 behavior 의 숫자를 그대로 박는다(플래너가 식으로 계산 — 근사값 +378,812 등 운영 실측과 몇 원 다른 것이 정상). 실패 확인 → 구현 → 통과.
  </action>
  <verify>
    <automated>npm --prefix packages/shared run typecheck && npm --prefix packages/shared test -- --run --maxWorkers=2 src/__tests__/launch.test.ts && grep -q "export function launchOpenArbPnlOf" packages/shared/src/launch.ts && grep -q "fills?: LaunchOpenArbFill\[\]" packages/shared/src/launch.ts</automated>
  </verify>
  <done>shared 타입체크 통과 · launch.test.ts 전부 통과(새 describe 의 379,382 · −427,228 · 164,352 · 41 · 32 · 43 · 9,989 포함) · `LaunchOrdersResponse.fills` 는 선택 키다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 09:00:30 묶음 「종목별 손익」 표 + 머리 카드 「손익」 줄 (D-01 · D-03 · D-04 ③)</name>
  <files>webapp/src/lib/launch-format.ts, webapp/src/lib/__tests__/launch-format.test.ts, webapp/src/components/admin/launch-orders-tab.tsx, webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx</files>
  <read_first>
    - .planning/quick/261112-tlw-09-00-30-launch-openarb-pnl/reference/mockup-launch-pnl.html 177 ~ 204행(`headCard` · `pnlTable` = 정본 모양) · 240 ~ 246행(묶음 안 순서)
    - webapp/src/lib/launch-format.ts 1 ~ 45행 · 100 ~ 110행
    - webapp/src/components/admin/launch-orders-tab.tsx 1 ~ 35행 · 140 ~ 235행 · 279 ~ 337행 · 374 ~ 381행 · 439 ~ 448행 · 475 ~ 480행
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx 1 ~ 20행 · 85 ~ 130행 · 184 ~ 215행
    - webapp/src/lib/__tests__/launch-format.test.ts 1 ~ 35행(import 꼴)
  </read_first>
  <behavior>
    launch-format(단위):
    - fmtPnl: 379382 → '+379,382' · −427228 → '−427,228'(U+2212) · 0 → '0' · pnlToneOf: 양 'up' · 음 'down' · 0 null
    - openArbDirLabelOf: 'KRX' → 'KRX 매수 → NXT 매도' · 'NXT' → 'NXT 매수 → KRX 매도' · null · '' → '—'
    - openArbFillCellOf(1071, 49954280) → { qty: '1,071주', avg: '평균 46,643' } · (328, 26268832) → avg '평균 80,088' · (0, 0) → null
    - launchPnlSplitOf({ gateway: 'KB120', fills: Task 2 픽스처 F 의 KB120 8건 + KB120 isin 'KR7UNKNOWN01' B NXT 1,000×10 + KYOBO119 1건,
      pieces: KB120 Q 유진 · KB120 Q 아스테라 · KB120 K 두산 }) → byMarket Q = [유진, 아스테라] · K = [두산] · unknown = [KR7UNKNOWN01] · KYOBO119 줄 없음
    - launchPnlSummaryOf(Q 줄) → { total: −262876, stocks: 2, resid: 1 } · [] → null
    화면(LaunchOrdersView · fire 'n0930' · gw 'KB120' · 위 fills · 조각 = KB120 Q A KRX 09:00:27 buy 유진(isin · stock_name · stock_code) wire 0 · KB120 Q N NXT 09:00:30 buy 아스테라 wire 0 · KB120 K A KRX 09:00:27 buy 두산 wire 0):
    - 묶음 순서 = [시장 모름(data-pnl-only · h2 'KB120' 만 · 손익 표만 · launch-pieces 없음), Q, K]
    - Q 묶음 안 data-slot 순서 = launch-sub(「종목별 손익」) → launch-pnl → launch-sub(「주문」) → launch-pieces · 손익 표 헤더 = 종목 · 손익 · 잔여 · 방향 · 매수 체결 · 매도 체결 · 계좌 · 사용자 ·
      줄 = [유진테크 '−427,228'(className --down) · 잔여 흐린 '0' · 'KRX 매수 → NXT 매도' · '328주 · 평균 81,213' · '328주 · 평균 80,088' · 'ACC-KB' · 'ezmesya',
      아스테라시스 '+164,352'(--up) · 잔여 알약 '175주'(className --vi) · 'NXT 매수 → KRX 매도'] · 합계 줄 '−262,876' · 손익 헤더 title 에 '0.22%' · 잔여 헤더 title 에 '자동으로 팔지 못하고'
    - 손익 표 래퍼 className 에 'min-w-0' 과 'overflow-x-auto'
    - 조각 표(launch-pieces 안) 행 수는 손익 표와 무관하게 그 묶음 조각 수
    - 카드: Q 카드 '손익−262,876원 · 2종목 · 잔여 1' · K 카드 '손익+379,382원 · 1종목' 이고 '잔여' 없음
    - fills: [] → 손익 표 · 소제목 0개 · 발사 있는 카드에 '손익—' · fills 키 없음(RESP) → 손익 표 0개 · 카드에 '손익' 글자 없음
    - 같은 응답으로 fire 'q16' → 손익 표 · 소제목 · 카드 '손익' 전부 없음(16:00 무변경)
  </behavior>
  <action>
    (A) `webapp/src/lib/launch-format.ts`(D-01 · D-03): 머리 주석에 「⑤ 개장차익 손익(quick-261112-tlw) — 계산은 shared `launchOpenArbPnlOf` 한 벌 · 여기는 표기 · 시장 배정 · 카드 합계만」 을 더한다.
    shared import 에 `launchOpenArbPnlOf` · `type LaunchOpenArbFill` · `type LaunchOpenArbPnlRow` 를 더한다. interfaces 의 6개를 그 이름 · 시그니처로 추가한다:
    `fmtPnl` 은 `fmtUs` 와 같은 부호 규칙이라 `fmtUs(v)` 를 그대로 돌려준다(새 규칙 금지) · `openArbDirLabelOf` 문구는 interfaces 그대로(gh-trade D-29 — 번호식 경우 표기 금지) ·
    `openArbFillCellOf` 의 평균 = Math.round(amt / qty) 를 `NUM` 으로 · `launchPnlSplitOf` 는 fills 를 gateway 로 거른 뒤 `launchOpenArbPnlOf` 를 한 번 부르고, 같은 gateway
    조각의 isin → market 첫 일치 Map 으로 byMarket(입력 순서 유지) / unknown 을 나눈다(isin null 조각은 무시) · `launchPnlSummaryOf` 는 줄 0 이면 null, 아니면 pnl 합 · 줄 수 ·
    resid > 0 줄 수. 손익 재계산 · 두 번째 식 구현 금지.

    (B) `webapp/src/components/admin/launch-orders-tab.tsx`(D-01 · D-03): shared import 에 `launchServerLabelOf` · `type LaunchOpenArbPnlRow`, launch-format import 에
    `fmtPnl` · `pnlToneOf` · `openArbDirLabelOf` · `openArbFillCellOf` · `launchPnlSplitOf` · `launchPnlSummaryOf` 를 더한다. `LaunchOrdersView` 의 `groups` useMemo 뒤에
    `pnl` useMemo 를 둔다 — `resp === null || fire !== 'n0930' || resp.fills === undefined` 면 null, 아니면 `launchPnlSplitOf({ gateway: gw, fills: resp.fills, pieces })`
    (pieces = 이미 n0930 · gw 로 거른 탭 조각 → 배정된 시장은 반드시 그 묶음이 있다). 카드 map 에서 `LaunchHeadCard` 에
    `pnl={pnl === null ? undefined : (pnl.byMarket.get(c.market) ?? [])}` 를 넘긴다. `groups.map` 앞에, pnl 이 있고 `pnl.unknown.length > 0` 이면
    `<section data-slot="launch-group" data-gateway={gw} data-pnl-only="true">`(같은 className) 안에 `<h2>` = `launchServerLabelOf(gw)` 만(조각 수 small 없음) +
    소제목 「종목별 손익」 + 손익 표를 둔다(조각 표 없음). 각 묶음 section 에서 `rows = pnl?.byMarket.get(g.market) ?? []` 가 1줄 이상이면 `<h2>` 와 launch-pieces 사이에
    소제목 「종목별 손익」 → 손익 표 → 소제목 「주문」 을 넣는다(0줄이면 지금 모양 그대로). 소제목 = `<h3 data-slot="launch-sub" className="px-1 pt-0.5 text-[12px] font-semibold text-[var(--muted-fg)]">`(목업 `.sub`).

    손익 표 = 새 함수 컴포넌트 `PnlTable({ rows })`: 래퍼 `<div data-slot="launch-pnl" className={cn(CARD, 'min-w-0 overflow-x-auto ring-1 ring-[var(--border-subtle)] ring-inset dark:ring-0')}>`
    (launch-pieces 와 같은 꼴 · 폰 390 은 래퍼 안에서만 가로 스크롤 — lessons 2026-09-07) 안 `<table className="w-full min-w-max border-collapse text-[12.5px] whitespace-nowrap">`.
    헤더는 `TH` 로 종목 | 손익(오른쪽 · `title` = 「매도금액 − 매수 평균가 × 매도 수량 − 왕복 비용 0.22% (gh-trade 개장차익 화면과 같은 식)」) | 잔여(오른쪽 · `title` =
    「자동으로 팔지 못하고 남은 수량 — 직접 판 수량은 세지 않습니다」) | 방향 | 매수 체결(오른쪽) | 매도 체결(오른쪽) | 계좌 | 사용자. 줄(`data-slot="launch-pnl-row"` ·
    key = gateway|account|isin): 종목 칸은 PiecesTable 439 ~ 448행과 같은 꼴(이름 굵게 + 코드 흐리게 · 둘 다 null 이면 흐린 ISIN) · 손익 칸 `TD`+`NUMERIC` 안
    `<span data-slot="launch-pnl-value" className={cn('font-bold', 톤)}>{fmtPnl(r.pnl)}</span>`(톤: up `text-[var(--up)]` · down `text-[var(--down)]` · null `DIM`) ·
    잔여 칸은 resid > 0 이면 `<span data-slot="launch-pnl-resid" className={cn('inline-flex h-5 items-center rounded-full bg-[var(--muted)] px-[7px] text-[11.5px] font-bold', QUEUE_EST)}>{NUM.format(resid)}주</span>`
    (색 = 기존 `--vi` 토큰 · 새 토큰 · globals.css 수정 금지) 아니면 흐린 `0` · 방향 칸 `DIM` + `openArbDirLabelOf(r.buy_exchange)` · 매수/매도 체결 칸은 `openArbFillCellOf` 가
    null 이면 흐린 DASH, 아니면 `{c.qty} <span className={DIM}>· {c.avg}</span>` · 계좌 `text(r.account)` · 사용자 `text(r.dma_user_id)`(마스킹 없음 — D-02 어드민 예외).
    마지막 `<tr data-slot="launch-pnl-total" className="bg-[var(--band)] font-semibold text-[var(--fg)]">` = 「합계」 · 손익 합(같은 톤 span) · `colSpan={6}` 빈 칸.

    `LaunchHeadCardProps` 에 `pnl?: readonly LaunchOpenArbPnlRow[]`(undefined = 줄 없음) 를 더하고, n0930 분기(322 ~ 323행 「다음 오프셋」 뒤)에서만
    `pnl !== undefined` 일 때 `<CardRow label="손익">` 을 그린다: `launchPnlSummaryOf(pnl)` 가 null 이면 DASH, 아니면
    `<span data-slot="launch-card-pnl" className={cn('font-bold', 톤)}>{fmtPnl(total)}원</span>{' '}<span className={cn(DIM, 'font-medium')}>· {stocks}종목{resid > 0 ? ` · 잔여 ${resid}` : ''}</span>`
    (목업 headCard 정본 — 카드 값은 그 시장 줄만 · D-01 예시 168,164 는 두 시장 합 예시일 뿐). q16 분기 · 빈 카드(model null)는 손대지 않는다.
    머리 JSDoc(38 ~ 51행)에 quick-261112-tlw 한 줄을 더한다. 목업 맨 아래 설명 문단은 구현하지 않는다(D-01).

    (C) 테스트 RED 먼저 — `launch-format.test.ts` 끝에 `describe('개장차익 손익 표기 · 묶음 · 카드 합계(quick-261112-tlw)', …)`,
    `launch-orders-tab.test.tsx` 끝에 `describe('LaunchOrdersView — 09:00:30 개장차익 손익(quick-261112-tlw)', …)` 로 behavior 를 쓴다
    (fills 픽스처는 `LaunchOpenArbFill` 타입 헬퍼 `fill(over)` · 조각은 기존 `piece({...})` · 응답은 `{ ...RESP, heads: [], pieces: […], fills: […] }`).
    묶음 안 조회는 `[data-slot="launch-pnl"]` · `[data-slot="launch-pieces"]` 로 범위를 좁힌다(section 전체 row 를 세지 않는다). 기존 테스트는 고치지 않는다.
    shared dist 를 먼저 다시 빌드한 뒤 실패 확인 → 구현 → 통과.
  </action>
  <verify>
    <automated>npm --prefix packages/shared run build && npm --prefix webapp run typecheck && npm --prefix webapp test -- src/lib/__tests__/launch-format.test.ts src/components/admin/__tests__/launch-orders-tab.test.tsx && grep -q 'data-slot="launch-pnl"' webapp/src/components/admin/launch-orders-tab.tsx && grep -q "launchOpenArbPnlOf(" webapp/src/lib/launch-format.ts && git diff --quiet -- webapp/src/styles/globals.css</automated>
  </verify>
  <done>webapp 타입체크 통과 · 두 테스트 파일 전부 통과(기존 단언 포함) · 09:00:30 에서만 손익 표 · 카드 줄이 보이고 16:00 · fills 없는 응답은 지금 그대로 · globals.css 무변경.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: [BLOCKING] 운영 DB 스키마 push — 오케스트레이터(메인 세션) 수행</name>
  <action>실행자는 이 태스크를 실행하지 않는다(서브에이전트의 운영 DB push 는 권한 분류기에 막힌다 — 프로젝트 메모리). Task 1 ~ 3 커밋 뒤 SUMMARY 에 「DB push 대기 — 오케스트레이터」 를 적고 여기서 멈춘다. 오케스트레이터(메인 세션)가 repo root 에서 `supabase db push --linked --yes` 를 그 접두사 그대로(파이프 · `yes |` 없이) 실행한다. `git push`(= webapp 운영 배포)도 실행자 몫이 아니다 — fills 는 선택 키라 DB push · git push 순서는 무관(D-03), server 는 배포 없음.</action>
  <instructions>
    실행자가 이미 한 것: 마이그레이션 · pgTAP(로컬 일회용 컨테이너) · shared/webapp 코드와 테스트 · 경로 지정 커밋(`git add -A` · `git add .` · `git stash` 금지 — 옆 세션 Phase 43 파일 보호 · 커밋 메시지 한글 · Co-Authored-By 없음).
    오케스트레이터가 할 것: ① `git status -sb` 로 실행자 커밋이 HEAD 에 있는지 확인 ② `supabase db push --linked --yes`(비대화형이면 `SUPABASE_ACCESS_TOKEN` 환경변수) ③ 아래 확인.
  </instructions>
  <verification>`supabase migration list --linked` 출력에서 새 마이그레이션 번호(기본 20261112400000)가 Local · Remote 두 열 모두에 있다. 이어서 운영 화면(trade.jx1.io → 러쉬주문 → 주문 내역 → 09:00:30 · 11.12 · KB120)에서 코스닥 · 코스피 묶음에 「종목별 손익」 표와 카드 「손익」 줄이 보이는지는 git push(웹 배포) 뒤 사용자 확인으로 넘긴다.</verification>
  <resume-signal>오케스트레이터가 「db push 완료」 와 migration list 결과를 남기면 끝. 실패 시 오류 원문과 함께 멈춘다(재시도로 두드리지 않는다).</resume-signal>
</task>

</tasks>

<verification>
- Task 1 ~ 3 의 automated 명령 전부 통과(좁은 검증만 — 전체 e2e · 전체 회귀 금지 · vitest 워커 2).
- 범위 가드: 실행자 커밋 범위(`git diff --name-only <첫 실행자 커밋>^..HEAD` — 커밋 수는 SUMMARY 에 적힌 해시로 정한다)에 frontmatter `files_modified` 9개 밖 파일이 없다 — 특히 relay/ · server/ · workers/ · webapp/src/styles/globals.css ·
  .planning/STATE.md · .planning/ROADMAP.md · .planning/phases/** 무변경.
- 계산 한 벌: 손익 식(`LAUNCH_OPENARB_COST_BP` · `/ 20000`)은 packages/shared/src/launch.ts 에만 있고 webapp · SQL 에는 없다.
- Task 4(오케스트레이터) 뒤에만 운영에서 fills 가 실린다 — 그 전 화면은 지금과 같아야 정상.
</verification>

<success_criteria>
- D-01: 09:00:30 묶음마다 「종목별 손익」 표(열 8 + 합계) · 소제목 2개 · 카드 「손익」 줄 · 폰 390 래퍼 스크롤 · 16:00 무변경.
- D-02: 픽스처 손익 379,382 · −427,228 · 164,352 · 0 · 41 · 32 · 43 · 9,989 가 shared 테스트로 잠김.
- D-03: RPC fills 10키 · OpenArb 체결만 · 체결 순서 · 빈 표 [] · 권한 그대로(pgTAP) · 선택 키라 옛 응답에서 화면 그대로 · 시장 모름 줄은 서버 이름 묶음.
- D-04: 파일 9개 범위 · 좁은 검증 · 배포는 오케스트레이터.
</success_criteria>

<source_audit>
| 출처 | 항목 | 담당 |
|------|------|------|
| GOAL | 09:00:30 주문 내역에 개장차익 손익 표시 | Task 1 · 2 · 3 |
| REQ | 261112-tlw | Task 1 ~ 4 |
| RESEARCH | 없음(quick · 조사는 오케스트레이터 완료) | — |
| CONTEXT | D-01 화면 모양(목업 A · 카드 줄 · title · 폰 390 · 16:00 무변경) | Task 3 |
| CONTEXT | D-02 손익 식(체결 순서 재생 · 22bp · floor · 방향 · 잔여 · 실비용 미사용) | Task 2(계산) · Task 3(방향 · 평균 표기) |
| CONTEXT | D-03 재료(RPC fills · 선택 키 · 계산 한 벌 · 줄 순서 · side 건너뜀 · dma_user_id · 시장 배정 · 시장 모름 묶음) | Task 1 · 2 · 3 |
| CONTEXT | D-04 범위 상한 · 좁은 검증 · 배포 제외 | 전 태스크 · Task 4 |
Deferred / 하지 않는 것(D-04 목록)은 어떤 태스크에도 없다.
</source_audit>

<output>
Create `.planning/quick/261112-tlw-09-00-30-launch-openarb-pnl/261112-tlw-SUMMARY.md` when done — 마이그레이션 실제 파일명 · pgTAP 결과(또는 「미실행 — 사유」) · 커밋 해시 · 「DB push 대기 — 오케스트레이터」 를 적는다.
</output>
