---
phase: quick-261018-rfy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/strategy-event.ts
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/accum-signal.ts
  - packages/shared/src/index.ts
  - packages/shared/src/__tests__/accum-signal.test.ts
  - packages/shared/src/__tests__/strategy-event-text.test.ts
  - packages/shared/src/__tests__/strategy-event-labels.test.ts
  - supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql
  - supabase/tests/dma_strategy_accum_signal.test.sql
  - server/src/routes/accum-signals.ts
  - server/src/services/dma-orders.ts
  - server/src/app.ts
  - server/tests/routes/accum-signals.test.ts
  - webapp/src/lib/accum-signals-api.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/accum-list.ts
  - webapp/src/lib/use-accum-signals.ts
  - webapp/src/lib/trading-layout.ts
  - webapp/src/components/trading/workbench/accum-strip.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/styles/globals.css
  - webapp/src/styles/__tests__/tds-tokens.test.ts
  - webapp/src/lib/__tests__/accum-list.test.ts
  - webapp/src/lib/__tests__/use-accum-signals.test.tsx
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/components/trading/__tests__/accum-strip.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - docs/inbox/from-gh-trade/261018-accum-signal.md
  - .planning/STATE.md
autonomous: true
requirements: [RFY-SHARED, RFY-SQL, RFY-SERVER, RFY-REDUCER, RFY-PANEL, RFY-INBOX]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "계좌 없는 kind 16 행(account_no '')이 그 게이트웨이에 가시 계좌가 있는 사용자 전원에게 보인다 — shared isMarketStrategyEvent 와 조회 RPC dma_strategy_events_for_user 의 시세 집합이 똑같이 {1, 2, 10, 15, 16} 이다 (D-02 · D-03 가)"
    - "kind 16 은 주문로그에 섞이지 않는다 — jsonb 래퍼 dma_strategy_events_for_user_json 은 p_include_limit_feature 와 무관하게 16 을 빼고, 웹 relay 리듀서는 kind 16 을 accumSignalEvents 별도 목록에만 넣는다(strategyEvents · limitFeatureEvents 무영향) (D-02 · D-03 나)"
    - "GET /api/accum-signals?date=YYYY-MM-DD(생략 = KST 오늘)는 그날 kind 16 을 isin 별 1행 bare array StrategyEventRow[] 로 준다 — 다른 분이면 최신 분, 같은 분이면 dma_servers.is_quote_primary 게이트웨이 행, 그 서버 행이 없으면 다른 서버 행. 미인증 401 · 형식 위반 400 · 배열 아닌 RPC 응답 500 (D-03 라 · D-03 server)"
    - "purge RPC dma_strategy_events_purge_limit_feature(30) 가 30일 지난 kind 15 와 kind 16 을 함께 지운다 — 함수 이름 · 시그니처 · 워커 호출 불변 (D-03 다)"
    - "/trading 작업대의 돌파 패널 바로 아래 「매집」 패널이 보인다 — 칩 = 종목명 · 팀 순매수(억 · 부호 색) · 매집중/매도중 배지 · 이월 D+n(carry_days > 0), 청산(state 3) 행은 칩에서 빠지고 펼친 10열 표에만 회색(사유는 행 툴팁). 더보기 펼침은 새로고침 뒤에도 기억된다 (D-01)"
    - "칩 · 행 · 「추가」 클릭은 돌파와 같은 콜백으로 카드를 만들거나(카드 없음) 포커스한다(카드 있음 · 칩은 점선 「거래중」). ✕ 는 이 기기 · 오늘 그 사이클만 숨기고 같은 종목의 새 사이클이 오면 다시 보인다. 첫 채움(REST 복원) 행은 무강조, 그 뒤 새로 오른 등록 · 새 사이클만 30초 「신규」 강조 (D-01)"
    - "작업대 마운트 · relay ready 전이마다 REST 복원을 다시 받고, 복원 ∪ 라이브 kind 16 을 strategyEventKey 로 합쳐 isin 별 최신 행(gwTimeMs desc → gateway asc → seq desc)으로 패널을 그린다 — 폴링 없음 (D-02)"
    - "인박스 노트 docs/inbox/from-gh-trade/261018-accum-signal.md 가 status: done · done_commit(태스크 2 마지막 코드 커밋) · 질문 2건 회신과 함께 경로 지정으로 커밋된다 (D-04)"
  artifacts:
    - path: "packages/shared/src/accum-signal.ts"
      provides: "AccumSignal 타입 · accumSignalOf(row) 43칸 → 이름 풀기 · ACCUM_STATE_LABELS · ACCUM_END_REASON_LABELS"
      contains: "export function accumSignalOf"
    - path: "packages/shared/src/strategy-event.ts"
      provides: "STRATEGY_EVENT_KIND.AccumSignal = 16 · 43칸 재해석 주석 · isMarketStrategyEvent 집합 {1,2,10,15,16}"
      contains: "AccumSignal: 16"
    - path: "supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql"
      provides: "조회 RPC 시세 집합 16 · jsonb 래퍼 16 제외 · purge 15·16 · 부분 인덱스 · 신규 dma_accum_signals_for_user_json"
      contains: "dma_accum_signals_for_user_json"
    - path: "supabase/tests/dma_strategy_accum_signal.test.sql"
      provides: "pgTAP — 가시성 · 래퍼 제외 · purge · isin 별 1행 · 같은 분 quote-primary 우선 · 다른 분 최신 · 폴백 · 권한"
      contains: "dma_accum_signals_for_user_json"
    - path: "server/src/routes/accum-signals.ts"
      provides: "GET /api/accum-signals — requireAuth · ?date= · bare array"
      contains: "accumSignalsRouter"
    - path: "webapp/src/lib/use-accum-signals.ts"
      provides: "복원(마운트 · ready 전이) ∪ 라이브 → isin 별 최신 AccumSignal[] · filled"
      contains: "export function useAccumSignals"
    - path: "webapp/src/components/trading/workbench/accum-strip.tsx"
      provides: "「매집」 패널 — 스트립 줄(칩 · 더보기) + 펼친 10열 표"
      contains: "export function AccumStrip"
  key_links:
    - from: "webapp/src/lib/use-relay-socket.ts journal.events 분기"
      to: "accumSignalEvents (별도 목록 · MAX_ACCUM_SIGNAL_EVENTS 2000)"
      via: "row.kind === STRATEGY_EVENT_KIND.AccumSignal 분기 + upsertStrategyEvents"
      pattern: "STRATEGY_EVENT_KIND\\.AccumSignal"
    - from: "webapp/src/lib/use-accum-signals.ts"
      to: "server GET /api/accum-signals → dma_accum_signals_for_user_json"
      via: "fetchAccumSignals() (webapp/src/lib/accum-signals-api.ts → authFetch)"
      pattern: "/api/accum-signals"
    - from: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      to: "AccumStrip"
      via: "<BreakoutStrip …/> 바로 아래 · onAddCard={addBreakoutCard} · onFocusCard={focusBreakoutCard} · labels"
      pattern: "<AccumStrip"
    - from: "supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql 시세 집합"
      to: "packages/shared/src/strategy-event.ts isMarketStrategyEvent"
      via: "같은 집합 {1, 2, 10, 15, 16} — relay WsFanout 이 shared 판정을 import(relay 코드 무변경 · 재빌드만)"
      pattern: "1, 2, 10, 15, 16"
---

<objective>
gh-trade Phase 34 의 관찰자 저널 kind 16 `AccumSignal`(팀 매집 누적 상태)을 gh-radar 가 받아 `/trading` 작업대 「매집」 패널로 보여 준다.
인박스 노트 `docs/inbox/from-gh-trade/261018-accum-signal.md` 를 처리하고 done 으로 닫는다 (D-01 ~ D-04).

Purpose: 트레이더가 장중에 팀 매집으로 등록된 종목(매집중 · 매도중 · 청산)과 팀 순매수 · 평단 · 구간 · 이월을 작업대에서 바로 보고
카드를 열 수 있게 한다. 주문로그에는 섞지 않는다.
Output: shared kind 16 상수 · 헬퍼 · 마이그레이션 1장 + pgTAP · server 라우트 · 웹 리듀서 별도 목록 · 복원 훅 · 「매집」 패널 · 인박스 done.

범위 밖(넣지 않는다): `/analytics/teamflow` 의 「장중 신호」 배지 · 장중 섹션, 알림음 · 토스트, 웹의 quote-primary 인지(CONTEXT Deferred).
배포(supabase db push · relay · server · webapp push)도 이 plan 범위 밖이다. `relay/` 코드와
`webapp/src/components/analytics/teamflow-detail.tsx`(다른 세션 작업 중)는 건드리지 않는다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261018-rfy-accum-signal/261018-rfy-CONTEXT.md
@docs/inbox/from-gh-trade/261018-accum-signal.md

## 실행 규칙 (모든 태스크 공통)

- 같은 트리에서 순차 실행한다(worktree 격리 없음). 다른 세션(quick 261018-j17)이 같은 트리에서 일할 수 있다 —
  커밋 직전마다 `git status -sb` 로 확인하고, **경로를 지정해** add 한다(`git add -A` · `git add .` 금지).
  `tasks/lessons.md` · `.planning/quick/261018-j17-*` · `.planning/sketches/016-*` 같은 남의 변경은 절대 싣지 않는다.
  내가 고칠 파일(예: `packages/shared/src/index.ts` · `.planning/STATE.md`)에 남의 미커밋 hunk 가 이미 있으면 커밋하지 말고 멈춰 보고한다.
- 커밋 메시지는 한글 · 접두 `test(quick-261018-rfy):` / `feat(quick-261018-rfy):` / `docs(quick-261018-rfy):` ·
  **Co-Authored-By 줄을 절대 넣지 않는다**(사용자 CLAUDE.md 가 시스템 기본 서명보다 우선). push 하지 않는다.
- 테스트는 동시 세션 메모리 보호로 `--maxWorkers=2` 를 붙이고 지정 파일만 돌린다. playwright(e2e)는 돌리지 않는다.
- shared 는 server · webapp 이 `dist` 로 읽는다(vitest alias 없음) — shared 를 고친 뒤에는 `pnpm --filter @gh-radar/shared build` 를 먼저 한다.
- pgTAP 은 `bash scripts/verify-dma-orders-price-check.sh --test <파일>`(일회용 로컬 컨테이너 · 원격 접촉 0). Docker 가 없어 못 돌리면
  통과로 적지 말고 SUMMARY 에 「pgTAP 미실행」 을 명시한다.

## 코드 앵커 (이미 확인함 — 다시 탐색하지 말 것)

shared
- `packages/shared/src/strategy-event.ts` — `STRATEGY_EVENT_KIND` :20-56(15 LimitFeature 주석 문법이 선례) · `isMarketStrategyEvent` :78-94(★ 주석이
  `20261006090000_…limit_feature.sql` 를 가리킨다 → 새 마이그레이션으로 바꾼다) · `StrategyEventRow` :202-259(이미 숫자화된 camelCase 45키) ·
  `strategyEventKey` :313 · `compareStrategyEventAsc` :318.
- `packages/shared/src/strategy-event-labels.ts:36` (`15: "상한가특징"` 다음 줄에 16).
- `packages/shared/src/limit-feature.ts:347` `limitFeatureOfStrategyEvent` — kind 15 행을 이름으로 되돌리는 선례(구조 참고).
- `packages/shared/src/index.ts:141-143` 은 strategy-event 계열을 `export *` 한다 — 새 모듈도 같은 줄 근처에 `export * from "./accum-signal";`.
- 기존 단언: `packages/shared/src/__tests__/strategy-event-text.test.ts:67-71`(집합 `[1, 2, 10, 15]` 단언 → 16 포함으로 갱신) ·
  `packages/shared/src/__tests__/strategy-event-labels.test.ts:269-270`(15 라벨 단언 옆에 16).

SQL
- `supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql:36-125` — 세 함수 전문(머리 주석 · BEGIN/COMMIT · REVOKE/GRANT 문법 포함).
  이후 마이그레이션에서 이 세 함수의 재정의는 없다(확인함) → 이 본문이 최신 정본이다.
- `supabase/migrations/20261006200100_dma_registry_intent.sql:38-66` — `dma_servers(key PK, is_quote_primary, enabled …)` · `uq_dma_servers_quote` 전체 1대 ·
  시드 KB120(enabled · quote-primary) · KB121(꺼짐) · KYOBO119(enabled) · KYOBO127(꺼짐). 이벤트 `gateway` 값은 서버 키(`KB120` 등 — 20261007200000 rename).
- 가시성 정본: `supabase/migrations/20261007200100_dma_visibility_v2.sql` 의 `dma_visible_accounts`.
- 테스트 선례: `supabase/tests/dma_strategy_limit_feature.test.sql`(머리 주석 · 픽스처 · KST 상대 날짜 · ROLLBACK) · 실행 명령은 그 파일 머리 21행.

server
- `server/src/routes/strategy-events.ts`(전문 복제 대상) · `server/src/schemas/orders.ts:70-76` `OrderListQuery`(date 만 — 재사용) ·
  `server/src/services/dma-orders.ts:101-124` `listStrategyEvents`(복제 대상) · `resolveTradeDate` 는 바로 아래 · `server/src/app.ts:23`(import) · `:111`(teamflow 마운트 줄).
- 테스트 선례: `server/tests/routes/strategy-events.test.ts`(makeSupabase mock · eventRow 45키 · ①~⑧).

webapp
- `webapp/src/lib/use-relay-socket.ts` — 상한 상수 :142-160(`MAX_LIMIT_FEATURE_EVENTS`) · `RelayData` 필드 :505-517 · 훅 결과 타입 :776-778 ·
  `INITIAL_DATA` :827-830 · `reset` :968-971(INITIAL_DATA 로 통째 — 새 필드는 초기값만 두면 같이 비워진다) · `journal.events` 리듀서 :1040-1067 ·
  `upsertStrategyEvents` :1303 · 훅 반환 객체 :2316-2317. `limitFeatureEventsBatch` 를 grep 해 나오는 **모든** 자리에 accum 짝을 둔다.
- `webapp/src/lib/relay-provider.tsx:366-368` — Provider 밖 기본값(`EMPTY_RELAY_VALUE`)에도 같은 빈 고정 참조로 둔다.
- `webapp/src/lib/use-order-log-feed.ts:130-215` — 복원 훅 선례(요청 번호 가드 `reqRef` · 마운트 1회 · ready 전이 재조회 :203-215).
- `webapp/src/lib/order-log-feed.ts:80` `mergeStrategyEvents(restored, pushed, date)` — 키 합집합 · 라이브는 tradeDate === date 만 · 오름차순. 재사용한다.
- `webapp/src/lib/strategy-events-api.ts` — REST 클라 선례(`authFetch<StrategyEventRow[]>`).
- 패널 선례: `webapp/src/components/trading/workbench/breakout-strip.tsx` — 패널 껍데기 · 스트립 줄 · 더보기 :397-460 · 칩 `BreakoutChip` :538-586 ·
  표 `BreakoutTable` :596-700(`colNarrow = 'hidden @min-[700px]/wb:table-cell'` · th/td 클래스 · 보조 줄 `@min-[700px]/wb:hidden` · 「거래중」 · 「추가」 · ✕) ·
  `signedRate`/`rateClass` :522-529 · 강조 tick 타이머 ⑤(`BREAKOUT_TICK_MS`) · 렌더 중 순수 계산 + 레이아웃 effect 커밋 ⑧. 칩 줄 `role="group"` · `tabIndex={0}` 는
  `webapp/src/components/trading/workbench/vi-trigger-strip.tsx:124-126` 문법.
- `webapp/src/lib/breakout-list.ts` — `HIGHLIGHT_MS` :44 · `kstDateKey` :59 · `readDatedSet`/`writeDatedSet` :72-95.
- `webapp/src/lib/trading-layout.ts:290-340` — `TradingPanelsPref` · `readPanelsPref` 가드 · `writePanelsPref`.
- 이름: `webapp/src/lib/isin-labels.ts:35-51` (`IsinLabel {name?, code?}` · `useIsinLabels`) · 마스터 폴백 `webapp/src/lib/stock-names.ts:80` `useStockNames(isins)` ·
  3단 폴백 선례 `webapp/src/components/trading/order-log/order-log-panel.tsx:44-60`.
- 숫자: `webapp/src/lib/teamflow-report.ts:48` `fmtEok(won, {signed})` · `:60` `toneOf(won)` · 시각 `webapp/src/lib/limitup-report.ts:399` `kstClock(ms)` → 「HH:MM:SS」.
- 작업대: `webapp/src/components/trading/workbench/trading-workbench.tsx` — `labels = useIsinLabels()` :629 · `addBreakoutCard`/`focusBreakoutCard` :1111-1119 ·
  `cardIsins` :1409 · `<BreakoutStrip …/>` :1565-1573 · 「5 · 종목 추가」 :1575.
- 색 토큰: `webapp/src/styles/globals.css` `--team`/`--team-bg` 라이트 :81-84 · 다크 :233-236(축 주석 문법) · 토큰 테스트 `webapp/src/styles/__tests__/tds-tokens.test.ts:55-56 · 88-89 · 110-113`.
- 테스트 선례: `webapp/src/lib/__tests__/relay-socket.test.ts:3431-3480`(kind 15 별도 스토어 describe — `render` · `connected` · `ws.push` 헬퍼) ·
  `webapp/src/lib/__tests__/use-order-log-feed.test.tsx:18-34`(relay-provider · api mock) · `webapp/src/components/trading/__tests__/breakout-strip.test.tsx` ·
  `webapp/src/components/trading/__tests__/trading-workbench.test.tsx:41-48 · 263-274`(`relay()` = `EMPTY_RELAY_VALUE` 펼침).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: kind 16 데이터 경로 — shared 상수 · accumSignalOf · 마이그레이션 + pgTAP · GET /api/accum-signals · 웹 REST 클라</name>
  <files>packages/shared/src/strategy-event.ts, packages/shared/src/strategy-event-labels.ts, packages/shared/src/accum-signal.ts, packages/shared/src/index.ts, packages/shared/src/__tests__/accum-signal.test.ts, packages/shared/src/__tests__/strategy-event-text.test.ts, packages/shared/src/__tests__/strategy-event-labels.test.ts, supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql, supabase/tests/dma_strategy_accum_signal.test.sql, server/src/routes/accum-signals.ts, server/src/services/dma-orders.ts, server/src/app.ts, server/tests/routes/accum-signals.test.ts, webapp/src/lib/accum-signals-api.ts</files>
  <read_first>
    - docs/inbox/from-gh-trade/261018-accum-signal.md (43칸 매핑 표 47-93행 · message 형식 95-102행 · 행 종류 40-41행 — 칸 매핑 정본)
    - packages/shared/src/strategy-event.ts (:20-94 · :202-259)
    - supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql (전문)
    - supabase/tests/dma_strategy_limit_feature.test.sql (머리 주석 · 픽스처 블록)
    - supabase/migrations/20261007200100_dma_visibility_v2.sql (dma_visible_accounts — 두 게이트웨이를 한 사용자에게 보이게 하는 픽스처 설계용)
    - server/src/routes/strategy-events.ts · server/tests/routes/strategy-events.test.ts
  </read_first>
  <behavior>
    - shared: `isMarketStrategyEvent` 를 0..20 에 걸면 정확히 [1, 2, 10, 15, 16] 이 참. `STRATEGY_EVENT_KIND.AccumSignal === 16`. `strategyKindLabel(16) === "매집감지"`.
    - shared: 노트 예시 message `since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/30/500000000000` 를 단 kind 16 행 →
      accumSignalOf 가 표의 모든 칸을 이름으로 돌려준다(lastPx=price · state=qty · netKrw=condThreshold · rateBp=condActual · avgPx=evPrice · buyQty=evQtyBefore ·
      sellQty=evQtyAfter · netQty=evTradeQty · buyKrw=limitBidQty · regPx=bid1Price · sellKrw=bid1Qty · ourExcludedQty=immediateFillQty · row=queueCase ·
      mcapKrw=baseCum · maxSame=aheadQty · cycle=expectedCum · endReason=cancelReason · sellPhases=resultCode · carryDays=entryRound · loPx/hiPx=snapQty[0]/[1] ·
      thNetKrw/thMinSame=snapCum[0]/[1] · peakNetKrw=askQtyAtLimit · thMaxMcapKrw=500000000000 · sinceDate="2026-10-16" · regTime="10:15:23").
    - shared: kind ≠ 16 · isin 빈 문자열 · state ∉ {1,2,3} → null. message 가 비었거나 키가 깨지면 sinceDate/regTime/thMaxMcapKrw 만 null(나머지 칸은 그대로).
      snapQty/snapCum 길이 < 2 → 빠진 원소 0. message 의 st/end/cyc/carry/row/our 는 읽지 않는다(칸이 정본).
    - SQL: 계좌 '' 인 KB120 kind 16 은 KB 가시 사용자에게 SETOF 함수로 보이고 매핑 없는 사용자에게 0. json 래퍼는 기본 · p_include_limit_feature=true 둘 다 16 을 뺀다.
      purge(30) 가 오늘−31일 kind 15 · 16 을 지우고 경계일(오늘−30) · 최근 16 · 옛 주문/시세1 은 남긴다. 부분 인덱스 술어 kind = 16.
      accum RPC: isin 별 정확히 1행 — 같은 분 동률이면 quote-primary(KB120) 행(그 분 안에서 gw_time_ms 가 더 이르더라도), 다른 분이면 늦은 분 행,
      quote-primary 행이 없는 isin 은 다른 서버 행. 행 없는 날 `'[]'`. anon/authenticated EXECUTE 불가 · service_role 가능.
    - server: ① 미인증 401 · RPC 0회 ② date 형식 위반 · 실재하지 않는 날짜 400 · RPC 0회 ③ date 생략 → `dma_accum_signals_for_user_json` 1회
      {p_user_id: 인증 사용자, p_trade_date: KST 오늘} ④ date 그대로 전달 ⑤ 200 bare array = toStrategyEventRow 결과 · 순서 유지 ⑥ RPC 오류 500 DB_ERROR 원문 비노출 ⑦ 배열 아닌 data 500.
  </behavior>
  <action>
    (가) shared — per D-02.
    `strategy-event.ts`: `STRATEGY_EVENT_KIND` 에 `AccumSignal: 16` 을 15 아래에 두고, 15 주석 문법 그대로 43칸 재해석 주석을 붙인다(노트 표 그대로 —
    시세 이벤트 · 계좌 없음 · 82/81 없음 · 키당 분당 ≤1행 변화 시만 · 행 = 누적 상태 전체 · 행 종류 queueCase 1 분당/2 거래일 첫 스냅샷/3 복원/4 종료 · 세 서버가 각자 넣음 ·
    칸 매핑 목록 · message 형식). `isMarketStrategyEvent` 에 `STRATEGY_EVENT_KIND.AccumSignal` 을 더하고 doc 주석의 집합 표기를 {1, 2, 10, 15, 16} 으로,
    ★ 주석이 가리키는 파일을 `supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql` 로 바꾼다(「하나만 바뀌면 wss 푸시와 REST 백필이 갈린다」 규칙 유지).
    `strategy-event-labels.ts:36` 아래에 `16: "매집감지"` + 한 줄 주석(gh-trade Phase 34 · 시세 이벤트 · 주문로그에는 오지 않는다).
    새 파일 `packages/shared/src/accum-signal.ts`: 파일 머리 주석(정본 = 인계 노트 표 · message 는 since/reg/th 만 읽는다).
    `export type AccumSignal` = { isin, exchange, stockCode: string | null, state: 1|2|3, endReason, cycle, carryDays, buyQty, buyKrw, sellQty, sellKrw, netQty, netKrw, avgPx, loPx, hiPx,
    regPx, peakNetKrw, sellPhases, maxSame, mcapKrw, ourExcludedQty, lastPx, rateBp, row, sinceDate: string | null("YYYY-MM-DD"), regTime: string | null("HH:MM:SS"),
    thNetKrw, thMinSame, thMaxMcapKrw: number | null, gwTimeMs, gateway, tradeDate } (stockCode · tradeDate 는 패널 표시 · 날짜 거름용 — 재량).
    `export function accumSignalOf(row: StrategyEventRow): AccumSignal | null` — behavior 의 매핑 그대로. 입력은 이미 숫자화된 `StrategyEventRow` 라 추가 캐스팅 없이
    칸을 옮기되 snapQty/snapCum 원소는 `?? 0`. message 파싱은 `|` 로 자르고 `k=v` 를 Map 으로 — `since` 8자리 숫자 · `reg` 6자리 숫자 · `th` 의 세 번째 조각 정수만 받아들이고
    모양이 틀리면 그 값만 null.
    `export const ACCUM_STATE_LABELS = {1: "매집중", 2: "매도중", 3: "청산"}` · `export const ACCUM_END_REASON_LABELS = {1: "청산", 2: "이월 탈락", 3: "이월 만료"}`
    (D-01 — 배지는 「청산」 하나, 사유 문구는 툴팁). `index.ts:143` 아래에 `export * from "./accum-signal";`.
    테스트: 새 `packages/shared/src/__tests__/accum-signal.test.ts`(behavior shared 항목 전부 — 43칸 행은 테스트 안 빌더로 만든다) · `strategy-event-text.test.ts:67-71` 기대 집합을
    `[1, 2, 10, 15, 16]` 으로 고치고 16 단언 추가 · `strategy-event-labels.test.ts:270` 옆에 16 라벨 단언. RED 를 먼저 보고 구현한다.

    (나) SQL — per D-03. 새 `supabase/migrations/20261018120000_dma_strategy_events_accum_signal.sql`. 머리 주석은 선례 문법(무엇 · 왜 · 대상 (가)~(마) · 권한 · 집합 동기화 규칙 ·
    되돌리기). BEGIN … COMMIT 안에:
    (가) `dma_strategy_events_for_user(uuid, date)` CREATE OR REPLACE — 20261006090000 :37-67 본문을 글자 그대로 복제하고 kind 조건 두 곳만 `(1, 2, 10, 15, 16)` 로,
    시세 주석에 「매집감지」 추가. REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role 재명시.
    (나) `dma_strategy_events_for_user_json(uuid, date, boolean DEFAULT false)` CREATE OR REPLACE — 본문 그대로, WHERE 만
    `(p_include_limit_feature OR (t.ev->>'kind')::int <> 15) AND (t.ev->>'kind')::int <> 16` (주문로그는 16 을 받지 않는다 · 시그니처 불변). 권한 재명시.
    (다) `dma_strategy_events_purge_limit_feature(integer)` CREATE OR REPLACE — `WHERE kind IN (15, 16)` 만 바꾼다(이름 · 시그니처 · 반환 · 워커 호출 불변 ·
    주석에 「kind 16 매집감지도 30일 — gh-trade 합의」). 권한 재명시. 부분 인덱스 `CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_accum_signal_day ON public.dma_strategy_events (trade_date) WHERE kind = 16`.
    (라) 신규 `public.dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date) RETURNS jsonb` · LANGUAGE sql · STABLE · SECURITY INVOKER · `SET search_path = public, pg_temp`.
    본문: `dma_strategy_events_for_user(p_user_id, p_trade_date) AS t(ev)` 에서 `(t.ev->>'kind')::int = 16` 만 → `LEFT JOIN public.dma_servers s ON s.key = t.ev->>'gateway'` →
    `SELECT DISTINCT ON (t.ev->>'isin') t.ev` 정렬 `t.ev->>'isin', (t.ev->>'gw_time_ms')::bigint / 60000 DESC, s.is_quote_primary DESC NULLS LAST, (t.ev->>'gw_time_ms')::bigint DESC,
    t.ev->>'gateway', (t.ev->>'seq')::bigint DESC` 을 부분 질의로 두고 바깥에서 `coalesce(jsonb_agg(ev ORDER BY ev->>'isin'), '[]'::jsonb)`.
    가시성은 SETOF 함수 조인 하나가 정본이다(D-03 — 별도 조인 금지). 권한: REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role(메모리 규칙 — auto-grant 대비).
    새 pgTAP `supabase/tests/dma_strategy_accum_signal.test.sql` — `dma_strategy_limit_feature.test.sql` 머리 · 픽스처 문법 복제(새 UUID 대역 · KST 상대 날짜 · 끝 ROLLBACK ·
    단언 설명에 (사용자, 게이트웨이, kind, 기대) 튜플). quote-primary 단언에는 **한 사용자가 두 게이트웨이를 다 보는** 픽스처가 필요하다 — visibility_v2 의
    `dma_visible_accounts` 규칙을 읽고 정한다(예: 트랜잭션 안에서 `UPDATE dma_servers SET enabled = true WHERE key = 'KB121'` 로 KB120(시드 quote-primary) vs KB121, 또는
    KB · KYOBO 연결을 둘 다 가진 사용자로 KB120 vs KYOBO119). behavior SQL 항목 전부를 단언한다.

    (다) server — per D-03. 새 `server/src/routes/accum-signals.ts` = `strategy-events.ts` 복제(`accumSignalsRouter` · `requireAuth()` · `OrderListQuery.safeParse(req.query)` ·
    `ValidationFailed` · bare array · `next(e)`) — `lf` 없음. 머리 주석: 작업대 「매집」 패널 복원용 · isin 별 최신 1행 · 같은 분 quote-primary 우선(RPC) · 방어선 목록은 선례 그대로.
    `services/dma-orders.ts` 의 `listStrategyEvents` 아래에 `listAccumSignals(supabase, userId, date?)` — `resolveTradeDate(date)` → `supabase.rpc("dma_accum_signals_for_user_json",
    {p_user_id, p_trade_date})` → error 면 `DbError("매집 신호 조회에 실패했습니다.", …)` · 배열 아니면 DbError(모양 위반) → `toStrategyEventRow` 매핑.
    `app.ts`: import 줄(:23 근처) + teamflow 마운트(:111) 아래 `app.use("/api/accum-signals", accumSignalsRouter);` 와 한 줄 주석(quick-261018-rfy · kind 16 매집감지 조회 전용).
    새 `server/tests/routes/accum-signals.test.ts` = `strategy-events.test.ts` 복제(mock 의 RPC 이름만 바꾸고 eventRow 를 kind 16 · account_no '' 로) — behavior server ①~⑦.

    (라) webapp REST 클라 — per D-03. 새 `webapp/src/lib/accum-signals-api.ts`: 머리 주석(원천 · 오늘은 date 를 싣지 않음 · bare array) +
    `fetchAccumSignals(date?: string): Promise<StrategyEventRow[]>` → `authFetch<StrategyEventRow[]>('/api/accum-signals' + (date ? '?date=…' : ''))`(URLSearchParams — strategy-events-api.ts 동형).

    커밋: RED 테스트 커밋(`test(quick-261018-rfy): …`) 뒤 구현 커밋(`feat(quick-261018-rfy): kind 16 매집감지 shared · 마이그레이션 · /api/accum-signals`) — 경로 지정 add.
    relay 코드는 바꾸지 않는다 — relay `WsFanout` 이 shared 판정을 import 하므로 재빌드만으로 kind 16 이 시세 공개된다(배포는 메인 세션 몫 · SUMMARY 에 「relay 재빌드 배포 필요」 기록).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared exec vitest run src/__tests__/accum-signal.test.ts src/__tests__/strategy-event-text.test.ts src/__tests__/strategy-event-labels.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/accum-signals.test.ts tests/routes/strategy-events.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server typecheck && pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp typecheck && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_accum_signal.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_limit_feature.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql</automated>
  </verify>
  <done>
    shared 집합 {1,2,10,15,16} · 라벨 「매집감지」 · accumSignalOf 43칸 단언 녹색. 마이그레이션 1장이 세 함수 재정의 + 인덱스 + 신규 RPC 를 담고 pgTAP 세 파일(신규 · limit_feature · strategy_read) 이 not ok 0.
    GET /api/accum-signals supertest ①~⑦ 녹색 · 기존 strategy-events 테스트 녹색 · relay journal-push 회귀 녹색(relay 코드 무변경). 태스크 커밋 완료.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 웹 — 리듀서 별도 목록 · 복원 훅 · 작업대 「매집」 패널</name>
  <files>webapp/src/lib/use-relay-socket.ts, webapp/src/lib/relay-provider.tsx, webapp/src/lib/accum-list.ts, webapp/src/lib/use-accum-signals.ts, webapp/src/lib/trading-layout.ts, webapp/src/components/trading/workbench/accum-strip.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/styles/globals.css, webapp/src/styles/__tests__/tds-tokens.test.ts, webapp/src/lib/__tests__/accum-list.test.ts, webapp/src/lib/__tests__/use-accum-signals.test.tsx, webapp/src/lib/__tests__/relay-socket.test.ts, webapp/src/components/trading/__tests__/accum-strip.test.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx</files>
  <read_first>
    - .planning/quick/261018-rfy-accum-signal/mockup-workbench.html (채택안 A — 칩 · 배지 · 표 열 · 폰 보조 줄)
    - webapp/src/components/trading/workbench/breakout-strip.tsx (:94-145 · :380-465 · :531-732)
    - webapp/src/lib/use-relay-socket.ts (:142-160 · :505-517 · :776-778 · :827-830 · :1040-1067 · :2305-2320)
    - webapp/src/lib/use-order-log-feed.ts (:110-215)
    - webapp/src/lib/__tests__/relay-socket.test.ts (:3431-3480)
  </read_first>
  <behavior>
    - 리듀서: kind 16 두 행 + 주문 한 행 + kind 15 한 행 한 프레임 → strategyEvents 에 주문 행만 · limitFeatureEvents 에 15 만 · accumSignalEvents 에 16 두 행 ·
      각 batch seq 1. kind 16 만 온 프레임은 strategyEvents · limitFeatureEvents 와 그 batch 참조를 바꾸지 않는다. 같은 키 재전송은 state 불변.
    - accum-list: latestAccumByIsin — 같은 isin 의 여러 행에서 gwTimeMs 큰 것 → 같으면 gateway 사전순 앞 → 같으면 seq 큰 것. sortAccum — state 1·2 는 netKrw 큰 순,
      state 3 은 뒤에서 gwTimeMs 큰 순. accumDismissKey = `${isin}|${cycle}`. advanceAccumMeta — 직전 커밋이 filled 가 아니었으면 새 키는 무강조로 기록,
      filled 뒤 새 키(새 isin 또는 같은 isin 새 cycle)는 now + HIGHLIGHT_MS 까지 강조 · state 3 은 강조하지 않음.
    - 훅: 마운트 → fetchAccumSignals 1회. relay status 가 ready 아닌 값 → ready 로 바뀌면 1회 더 · ready 유지 리렌더는 0회. 복원 ∪ 라이브(tradeDate 오늘만) 를 합쳐 isin 별 최신만
      AccumSignal 로(라이브의 늦은 행이 복원 행을 이긴다). 첫 요청이 끝나면(성공 · 실패) filled = true. 실패해도 라이브 행은 보인다.
    - 패널: 칩 = 이름 · 「+12.3억」(up 색) · 「매집중」 배지(--team) · carryDays 2 → 「이월 D+2」, 0 이면 이월 배지 없음 · 매도중 배지(--accum-sell).
      청산 행은 칩에 없고 펼친 표에만 회색 · 그 행 title 이 사유(endReason 2 → 「이월 탈락」). 표 순서 = sortAccum.
      평단 · 구간 · 순수량 · 갱신 셀은 `hidden @min-[700px]/wb:table-cell` · 종목 셀 보조 줄 「HH:MM:SS · 평단 N · lo~hi」 는 `@min-[700px]/wb:hidden` · 코드는 <700 숨김.
      더보기 클릭 → 표 열림 · 저장소 panels pref accum: true → 다시 마운트해도 열림. ✕ → 칩 · 행 사라짐 · `gh-radar:accum-dismissed` 에 `isin|cycle` · 같은 isin cycle+1 행이 오면 다시 보임.
      카드 없는 칩 클릭 → onAddCard(isin, 이름, 코드, 'KRX') · 카드 있는 종목 → 점선 「거래중」 칩 · 클릭 시 onFocusCard(isin, 'KRX') · 이름 모르는 행은 ISIN 고정폭 표시 · onAddCard 이름 undefined.
      filled 전 · filled 직후 첫 행 무강조, 그 뒤 새 isin → data-new + 「신규」 · 30초 뒤 해제. 활성 칩 0 이면 빈 문구 「아직 팀 매집으로 등록된 종목이 없어요」.
  </behavior>
  <action>
    (가) 리듀서 — per D-02. `use-relay-socket.ts`: `MAX_LIMIT_FEATURE_EVENTS` 아래에 `export const MAX_ACCUM_SIGNAL_EVENTS = 2000` + 주석(kind 16 = 등록 종목 수십 × 누적이 바뀐 분 ·
    세 서버 각자 → 별도 목록 · 화면은 REST 복원이 오늘분을 다시 준다). `RelayData` 와 훅 결과 타입에 `accumSignalEvents: StrategyEventRow[]` ·
    `accumSignalEventsBatch: { seq: number; rows: StrategyEventRow[] }`(주석: 작업대 「매집」 패널 원천 · 주문로그 무영향 · reset 만 비움), `INITIAL_DATA` 에 빈 값,
    `journal.events` 분기를 세 갈래(15 → featureRows · 16 → accumRows · 나머지 → orderRows)로 바꾸고 `upsertStrategyEvents(state.accumSignalEvents, accumRows, MAX_ACCUM_SIGNAL_EVENTS)` —
    셋 다 삽입 0 이면 같은 state, 삽입 있는 쪽만 필드 · batch 갱신(기존 스프레드 문법 그대로). 훅 반환 객체(:2316 근처)와 `relay-provider.tsx:366-368` 기본값(`EMPTY_STRATEGY_EVENTS` ·
    `EMPTY_STRATEGY_EVENTS_BATCH`)에도 짝을 둔다. `relay-socket.test.ts` 의 kind 15 describe 바로 아래에 `journal.events kind 16 별도 스토어 (quick-261018-rfy D-02)` describe —
    kind 16 행은 fixture `exposed` 를 펼쳐 kind 16 · seq · isin · qty(state) 만 바꾼다.

    (나) 순수 함수 — per D-01 · D-02. 새 `webapp/src/lib/accum-list.ts`: `ACCUM_DISMISSED_KEY = "gh-radar:accum-dismissed"` · `accumDismissKey(sig)` · `readAccumDismissed(today = kstDateKey())` /
    `addAccumDismissed(keys, today)`(breakout-list 의 `readDatedSet`/`writeDatedSet` 재사용) · `latestAccumByIsin(rows: readonly StrategyEventRow[]): StrategyEventRow[]` ·
    `sortAccum(signals: readonly AccumSignal[]): AccumSignal[]` · `advanceAccumMeta(prev, signals, now, filledBefore)` → `Map<accumKey, highlightUntil | null>`(breakout 의 advanceTracked/trackBreakoutMeta
    처럼 「직전 커밋 기록 + 현재 입력」 순수 계산 · `HIGHLIGHT_MS` 재사용). 테스트 `webapp/src/lib/__tests__/accum-list.test.ts`.

    (다) 복원 훅 — per D-02. 새 `webapp/src/lib/use-accum-signals.ts`(`'use client'`): `useAccumSignals(): { signals: AccumSignal[]; filled: boolean }`.
    `useRelayContext()` 의 `accumSignalEvents` · `status`. `use-order-log-feed.ts` ⑥/② 축소판 — `reqRef` 요청 번호 가드 · 마운트 1회 `fetchAccumSignals()`(date 없음 = 서버 KST 오늘) ·
    `prevRelayRef` 로 ready 전이 감지 시 재조회(마운트 뒤 첫 ready 포함) · 폴링 · 타이머 없음. 성공 시 복원 행 보관, 성공 · 실패 모두 filled = true.
    `useMemo`: `mergeStrategyEvents(restored, accumSignalEvents, kstDateIso())` → `latestAccumByIsin` → `accumSignalOf` → null 제거. 테스트 `webapp/src/lib/__tests__/use-accum-signals.test.tsx`
    (`use-order-log-feed.test.tsx:18-34` 의 relay-provider mock 문법 + `vi.mock('@/lib/accum-signals-api')`).

    (라) 패널 — per D-01. `trading-layout.ts` `TradingPanelsPref` 에 `accum?: boolean`(주석: 매집 스트립 펼침) + `readPanelsPref` 에 `typeof p.accum === "boolean"` 가드.
    `globals.css`: `--team-bg` 바로 아래(라이트 :84 · 다크 :236)에 매집 상태 축 토큰 4개 — 라이트 `--accum-sell: #c2410c` · `--accum-sell-bg: #fff4e6` · `--accum-carry: #a16207` · `--accum-carry-bg: #fef9e7`,
    다크 `--accum-sell: #ff9f43` · `--accum-sell-bg: rgba(255, 159, 67, 0.16)` · `--accum-carry: #ffd43b` · `--accum-carry-bg: rgba(255, 212, 59, 0.16)`(다크는 목업 값). 주석: 매집 상태 축(매도중 주황 · 이월 노랑) —
    가격 방향 · LED · 팀 축과 서로 대체 금지. 라이트 글자/면 대비 4.5:1 미달이면 같은 계열에서 어둡게 고치고 SUMMARY 에 최종 값을 적는다. `tds-tokens.test.ts` 기대표 두 곳 · 정의 필수 목록(:110-113)에 4키 추가.
    새 `webapp/src/components/trading/workbench/accum-strip.tsx`(`'use client'`) — 머리 주석에 D-01 규칙(돌파 동형 · 시세 구독 없음 · 거래소 표시 없음 · 청산은 표에만 · 첫 채움 무강조 · ✕ = 오늘 · 사이클 단위).
    `export const ACCUM_EMPTY_TEXT = '아직 팀 매집으로 등록된 종목이 없어요'`. `export function AccumStrip({ signals, filled, cards, labels, onAddCard, onFocusCard, className })` —
    `labels: ReadonlyMap<string, IsinLabel>`, 콜백 시그니처는 `BreakoutStripProps` 의 onAddCard/onFocusCard 와 같다.
    이름 = `labels.get(isin)?.name` → `useStockNames(labels 에 이름 없는 isin)` → 없으면 ISIN(고정폭 · 「이름 없음」 표식 · onAddCard 이름 undefined — 돌파 ⑥) — 마스터 폴백은 order-log-panel 3단 폴백 동형(재량).
    코드 = `sig.stockCode ?? labels.get(isin)?.code`. 펼침 초기값 `readPanelsPref().accum ?? false`, 토글 시 `writePanelsPref({ accum: next })`. 숨김 세트는 `readAccumDismissed()` 초기값 + ✕ 시 `addAccumDismissed`.
    강조: `advanceAccumMeta` 를 렌더에서 계산하고 레이아웃 effect 에서 ref 커밋(직전 커밋의 filled 도 ref 에) · 강조 중인 행이 있을 때만 `BREAKOUT_TICK_MS` 간격 타이머 1개(돌파 ⑤).
    마크업은 돌파 껍데기 문법 그대로: 무테 카드 `data-slot="accum"` → 스트립 줄 `section aria-label="매집감지"`(라벨 「매집」 · 칩 줄 `role="group"` `aria-label="매집 종목"` `tabIndex={0}` 가로 스크롤 ·
    「더보기/접기」 `aria-expanded` · 표 있을 때만 `aria-controls`) → `showTable = open && 보이는 행 > 0` 일 때 `border-t` 표 섹션. 칩(`data-slot="accum-chip"`)은 state 1·2 만:
    이름 · `fmtEok(netKrw, {signed: true})`(색 `toneOf` → `--up`/`--down`/`--flat`) · 상태 배지(매집중 `--team`/`--team-bg` · 매도중 `--accum-sell`/`--accum-sell-bg` · 문구는 ACCUM_STATE_LABELS) ·
    `carryDays > 0` 이면 「이월 D+n」 배지(`--accum-carry`/`--accum-carry-bg`) · 강조/거래중 클래스와 「신규」/「거래중」 표식은 BreakoutChip 그대로 · title = 「이름 코드 · 팀 순매수 · 평단 · 구간 lo~hi · 갱신 HH:MM:SS」.
    표 10열(머리 = 종목 · 현재가 · 등락률 · 팀 순매수 · 평단 · 매집 구간 · 순수량 · 상태 · 갱신 · sr-only 액션): 현재가 = `lastPx`(쉼표) · 등락률 = `rateBp / 100` 을 돌파 `signedRate`/`rateClass` 와
    같은 규칙(이 파일 안 작은 함수로)으로 · 팀 순매수 = fmtEok signed + 부호 색 · 평단 `avgPx` · 구간 「lo~hi」 · 순수량 `netQty` 쉼표 · 상태 = 배지(state 3 은 회색 「청산」) + 이월 배지 · 갱신 = `kstClock(gwTimeMs)` ·
    액션 = 「거래중」 표식 또는 「추가」 버튼(stopPropagation) + ✕ 버튼(aria-label 「{이름} 숨기기」 · stopPropagation). 평단 · 구간 · 순수량 · 갱신 열은 `colNarrow`, 종목 셀 코드 `hidden @min-[700px]/wb:inline`,
    보조 줄 「HH:MM:SS · 평단 N · lo~hi」 `@min-[700px]/wb:hidden`. state 3 행은 `text-[var(--muted-fg)]` · title = ACCUM_END_REASON_LABELS[endReason] ?? 「청산」. 행 클릭 = 칩 클릭과 같은 `activate`
    (cards.has(isin) ? onFocusCard(isin, exchange) : onAddCard(isin, 이름|undefined, 코드|undefined, exchange) — exchange 는 행 값 · 늘 KRX). 칩 · 표 컴포넌트는 `memo`.
    `trading-workbench.tsx`: `useAccumSignals()` 호출을 다른 relay 훅 근처에 두고, `<BreakoutStrip …/>` 닫는 줄 바로 다음 · 「5 · 종목 추가」 위에 주석 `{/* 4b · 매집 스트립 / 표 (quick-261018-rfy) */}` 과
    `<AccumStrip signals={…} filled={…} cards={cardIsins} labels={labels} onAddCard={addBreakoutCard} onFocusCard={focusBreakoutCard} />`.
    `trading-workbench.test.tsx` 가 새 훅의 REST 호출로 깨지면 그 파일에 `vi.mock('@/lib/accum-signals-api', () => ({ fetchAccumSignals: vi.fn(async () => []) }))` 만 더한다(기존 단언 무변경).
    새 `webapp/src/components/trading/__tests__/accum-strip.test.tsx` — behavior 패널 항목 전부(`vi.mock('@/lib/stock-names')` 로 useStockNames 고정 · `window.localStorage.clear()` · 강조 해제는 fake timers).

    커밋: RED(`test(quick-261018-rfy): …`) → 구현(`feat(quick-261018-rfy): 작업대 「매집」 패널 — kind 16 별도 목록 · 복원 훅 · 돌파 동형 칩/표`) — 경로 지정 add.
    이 태스크의 마지막 커밋 해시를 기록해 둔다(태스크 3 의 done_commit).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-list.test.ts src/lib/__tests__/use-accum-signals.test.tsx src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/use-order-log-feed.test.tsx src/components/trading/__tests__/accum-strip.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/trading/workbench/accum-strip.tsx src/lib/accum-list.ts src/lib/use-accum-signals.ts src/lib/accum-signals-api.ts</automated>
  </verify>
  <done>
    kind 16 이 accumSignalEvents 에만 쌓이고 주문로그 두 목록은 무영향(테스트). 「매집」 패널이 돌파 패널 아래 렌더되고 behavior 패널 항목(칩 A · 청산 회색 · 이월 배지 · 열 접기 · 더보기 기억 · ✕ 사이클 숨김 · 클릭 콜백 · 첫 채움 무강조 · 빈 문구)이 테스트로 잠긴다.
    기존 relay-socket · use-order-log-feed · breakout-strip · trading-workbench · tds-tokens 녹색 · webapp typecheck · eslint 통과. 태스크 커밋 완료 · 마지막 해시 확보.
  </done>
</task>

<task type="auto">
  <name>Task 3: 인박스 노트 done · 회신 + STATE.md quick 표</name>
  <files>docs/inbox/from-gh-trade/261018-accum-signal.md, .planning/STATE.md</files>
  <read_first>
    - docs/inbox/from-gh-trade/README.md (done 형식 정본)
    - .planning/STATE.md (:30-36 Last activity · :73-95 Quick Tasks Completed 표)
  </read_first>
  <action>
    per D-04. 노트 frontmatter `status: open` → `status: done`, `done_commit:` 에 태스크 2 의 마지막 커밋 해시(8자). 본문 끝에 `## 회신 (2026-10-18 · gh-radar quick-261018-rfy)` 절 — 짧게:
    ① 처리 내역(shared 시세 집합 16 · 조회 RPC 집합 · 주문로그 래퍼는 16 제외 · purge 15·16 30일 · 신규 `dma_accum_signals_for_user_json` = isin 별 최신 · 같은 분 quote-primary 우선 + 폴백 ·
    `GET /api/accum-signals` · 웹 relay 리듀서 별도 목록 · 각 커밋 해시). ② 웹 자리 차이 — 노트가 적은 `/analytics/teamflow` 「장중 매집 현황」 대신 사용자 결정으로 `/trading` 작업대 「매집」 패널(돌파 패널 아래)로 갔다 ·
    teamflow 장중 섹션 · 「장중 신호」 배지는 이번에 하지 않았다. ③ 질문 1 답: 배지는 「청산」 하나(클라 동형), 사유(청산 · 이월 탈락 · 이월 만료)는 행 툴팁으로 구분. 질문 2 답: 「이월 D+n」 노랑 · 0 이면 없음(클라 동형).
    ④ 배포 순서 메모: DB → relay(코드 무변경 · shared 집합 변경 반영을 위해 재빌드 배포) → server → webapp(push) — 이번 quick 은 배포하지 않았다.
    `.planning/STATE.md`: Quick Tasks Completed 표 마지막 행 아래에 `| 261018-rfy | 매집감지(kind 16) 수용 — shared 시세 집합 16 · 조회 RPC · 주문로그 래퍼 16 제외 · purge 30일 · isin 별 최신 읽기 RPC(같은 분 quote-primary 우선) · GET /api/accum-signals · relay 리듀서 별도 목록 · /trading 작업대 「매집」 패널(돌파 동형) · 인박스 done | 2026-10-18 | {태스크 2 마지막 해시} | [261018-rfy-accum-signal](./quick/261018-rfy-accum-signal/) |`,
    `Last activity:` 줄을 `2026-10-18 - Completed quick task 261018-rfy: 매집감지(kind 16) 수용` 으로. 다른 줄은 건드리지 않는다.
    커밋 직전 `git status -sb` · `git diff .planning/STATE.md` 로 내 hunk 만 있는지 확인(남의 hunk 가 있으면 멈추고 보고) → 두 파일만 경로 지정 add →
    `docs(quick-261018-rfy): 인박스 261018 매집감지 회신 · done` (Co-Authored-By 없음 · push 없음).
  </action>
  <verify>
    <automated>grep -q '^status: done' docs/inbox/from-gh-trade/261018-accum-signal.md && H=$(sed -n 's/^done_commit: *\([0-9a-f]\{7,\}\).*/\1/p' docs/inbox/from-gh-trade/261018-accum-signal.md) && test -n "$H" && git cat-file -e "$H^{commit}" && S=$(git log -1 --format=%s "$H") && case "$S" in *quick-261018-rfy*) true ;; *) false ;; esac && grep -q '^| 261018-rfy |' .planning/STATE.md && N=$(git log -1 --format=%s -- docs/inbox/from-gh-trade/261018-accum-signal.md) && case "$N" in *quick-261018-rfy*) true ;; *) false ;; esac && B=$(git log --format=%B --grep='quick-261018-rfy') && ! printf '%s\n' "$B" | grep -qi 'co-authored-by' && F=$(git log --format= --name-only --grep='quick-261018-rfy') && ! printf '%s\n' "$F" | grep -qE '^(relay/|webapp/src/components/analytics/teamflow-detail\.tsx$)'</automated>
  </verify>
  <done>
    노트가 status: done · done_commit = 태스크 2 마지막 코드 커밋 · 회신 절(처리 · 자리 차이 · 질문 2건 답 · 배포 순서)과 함께 커밋됨. STATE.md quick 표에 261018-rfy 행.
    이 quick 의 어떤 커밋도 Co-Authored-By 가 없고 relay/ · teamflow-detail.tsx 를 건드리지 않았다.
  </done>
</task>

</tasks>

<verification>
- 태스크 1~3 의 `<automated>` 가 모두 0 으로 끝난다(pgTAP 을 못 돌렸으면 SUMMARY 에 「pgTAP 미실행」 명시 — 통과로 적지 않는다).
- 주문로그 무영향 회귀: `use-order-log-feed.test.tsx` · `relay-socket.test.ts`(kind 15 describe 포함) · `strategy-events.test.ts` 녹색.
- 소스 감사: GOAL(작업대 매집 패널 · 주문로그 무영향) · D-01(태스크 2 라) · D-02(태스크 1 가 · 태스크 2 가~다) · D-03(태스크 1 나~라) · D-04(태스크 3) 모두 태스크에 있다.
  Deferred(teamflow 장중 섹션 · 알림음 · 웹 quote-primary 인지)는 어느 태스크에도 없다.
</verification>

<success_criteria>
- kind 16 이 DB(시세 가시성 · 30일 보관) → server(GET /api/accum-signals · isin 별 1행 · quote-primary 우선) → 웹(별도 목록 · 복원 훅) → `/trading` 「매집」 패널까지 이어지고 테스트로 잠긴다.
- 주문로그(REST 래퍼 · 웹 두 목록)에 kind 16 이 한 줄도 섞이지 않는다.
- 인박스 노트 done · done_commit · 회신 커밋 · STATE.md 행. 커밋은 한글 · Co-Authored-By 없음 · push 없음 · 배포 없음.
</success_criteria>

<output>
Create `.planning/quick/261018-rfy-accum-signal/261018-rfy-SUMMARY.md` when done — 커밋 해시 목록 · 새 CSS 토큰 최종 값 · pgTAP 실행 여부 ·
배포 메모(DB push → relay 재빌드 배포(shared 집합 반영 — relay 코드는 무변경) → server → webapp push, 메인 세션 몫)를 적는다.
</output>
