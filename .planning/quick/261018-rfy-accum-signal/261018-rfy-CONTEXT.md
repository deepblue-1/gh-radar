# Quick Task 261018-rfy: 매집감지(kind 16 AccumSignal) gh-radar 수용 — Context

**Gathered:** 2026-10-18
**Status:** 목업 채택 완료 → planning
**정본 인계 노트:** `docs/inbox/from-gh-trade/261018-accum-signal.md` (status: open · 미커밋 — 이 quick 이 done 으로 바꿔 커밋한다)

<domain>
## Task Boundary

gh-trade Phase 34 가 관찰자 저널 **kind 16 `AccumSignal`**(팀 매집 누적 상태 · 등록 종목만 · 키당 분당 ≤1행 · 변화 시만 · 행 = 누적 상태 전체)을
세 서버(KB120 · KB121 · KYOBO119) 각각에서 보낸다. relay 생성물은 이미 `04dc1b7a` 로 커밋됨 — **relay 코드 · 적용 RPC(`dma_strategy_apply`) 무변경**.
gh-radar 가 할 일:

1. shared — kind 16 상수 · 43칸 재해석 주석 · 라벨 · 시세 집합(`isMarketStrategyEvent`)에 16.
2. Supabase 마이그레이션 — 조회 RPC 시세 집합 (1,2,10,15,16) · jsonb 래퍼는 kind 16 을 **항상 제외**(주문로그에 안 섞음) · purge 가 16 도 30일 · 부분 인덱스 ·
   **신규 읽기 RPC** `dma_accum_signals_for_user_json(p_user_id, p_trade_date)` = 그날 kind 16 중 **isin 별 최신 행 1건**.
3. server — `GET /api/accum-signals?date=YYYY-MM-DD`(생략 = KST 오늘) → bare array `StrategyEventRow[]`.
4. webapp — relay 리듀서가 kind 16 을 **별도 목록**으로 가른다(주문로그 목록에 안 섞임) · `/trading` 작업대 **돌파 패널 바로 아래 「매집」 패널**(돌파 패널 동형).
5. 인박스 노트 `status: done` · `done_commit` 채워 경로 지정 커밋.

**범위 밖(이번 quick 아님):** `/analytics/teamflow` 밤 보고서 카드의 「장중 신호」 배지 · 장중 섹션 — 사용자 결정으로 실시간은 작업대로 갔다.
`teamflow-detail.tsx` 는 다른 세션(quick 261018-j17)이 고치는 중이라 건드리지 않는다. 알림음 없음.

</domain>

<decisions>
## Implementation Decisions

### D-01 모양 — 작업대 「매집」 패널 = 돌파 패널 동형 (사용자 선택 · 목업 `mockup-workbench.html` 안 **A**)
- 자리: `trading-workbench.tsx` 「4 · 돌파 스트립」 `<BreakoutStrip …/>` 바로 아래, 「5 · 종목 추가」 위.
- 패널 문법 = `breakout-strip.tsx` / `vi-trigger-strip.tsx` 와 같다: 한 무테 카드(`rounded-[var(--r-md)] border border-transparent bg-[var(--card)]`) →
  스트립 줄(라벨 「매집」 · 칩 가로 스크롤 줄(`role=group` · `tabIndex=0`) · 「더보기/접기」) → 펼친 표(행 있을 때만 · 머리줄 없음 · `border-t`).
- 펼침 기억: `TradingPanelsPref.accum?: boolean` (`trading-layout.ts` `readPanelsPref`/`writePanelsPref` 에 키 추가).
- 칩(A) = **종목명 · 팀 순매수(억 · 부호 색) · 상태 배지(매집중 `--team` / 매도중 주황) · 이월 D+n(노랑 배지 · carry_days > 0 만)**.
  청산(state 3) 행은 **칩에서 빠지고 표에만 회색**(`text-[var(--muted-fg)]`). 카드 있는 종목 칩 = 돌파와 같은 점선 「거래중」.
  신규 강조(`--new-bg`/`--new-bd` · 「신규」 배지 · 30초) 는 돌파 규칙을 그대로 쓴다 — 첫 채움(REST 복원) 행은 무강조.
- 표 열(10): 종목(이름 + 코드) · 현재가 · 등락률 · 팀 순매수 · 평단 · 매집 구간(lo~hi) · 순수량 · 상태(배지 + 이월) · 갱신(HH:MM:SS) · 액션(추가/거래중 · ✕).
  컨테이너 쿼리 접기(돌파 표 규칙 · `@container/wb` · globals.css §2.2b 경계): 본문 <700 에서 평단 · 구간 · 순수량 · 갱신 열을 숨기고 종목 아래 보조 줄
  「HH:MM:SS · 평단 N · lo~hi」 · 코드 숨김. 거래소 열 없음(돌파 D-07 동형).
- 현재가 · 등락률은 행 자체 값(`price` = last_px · `condActual` = rate_bp/100)을 그대로 쓴다 — **시세 구독 없음**(돌파의 `useBreakoutQuotes` 를 안 쓴다 · 분당 갱신으로 충분).
- 칩 · 행 클릭 · 「추가」 = 돌파와 같은 콜백(`onAddCard(isin, name, code, 'KRX')` / `onFocusCard(isin, 'KRX')`) — 거래소는 행 `exchange`(늘 KRX).
  이름 · 코드는 `useIsinLabels()`(workbench :629 `labels`)와 행 `stockCode` 로 — 이름 없으면 ISIN(돌파 ⑥).
- ✕ = 이 기기 · 오늘 숨김(`breakout-list.ts` `readDatedSet`/`writeDatedSet` 재사용 · 새 키 `gh-radar:accum-dismissed`). 같은 종목의 **새 사이클**(`expectedCum` = cycle 증가)이 오면 되살린다.
- 정렬: 매집중 · 매도중 먼저(팀 순매수 큰 순), 청산은 뒤(갱신 늦은 순). 빈 문구: 「아직 팀 매집으로 등록된 종목이 없어요」.
- 배지 문구 = gh-trade 클라 동형(가 질문 1·2 답): 청산 사유 1/2/3 은 배지 하나 「청산」, 사유는 행 `title`(툴팁) 에 「청산 · 이월 탈락 · 이월 만료」. 이월 = 「이월 D+n」.

### D-02 데이터 — kind 16 은 **별도 목록** · isin 별 최신 행이 현재 상태 (인계 노트 「kind 16 — 넣는 규칙」)
- shared `strategy-event.ts`: `STRATEGY_EVENT_KIND.AccumSignal = 16` + 43칸 재해석 주석(노트 표 그대로) · `isMarketStrategyEvent` 집합 {1,2,10,15,16}
  (주석 ★ 조회 RPC SQL 집합과 같아야 한다는 규칙 유지) · `strategy-event-labels.ts` 16: "매집감지".
  헬퍼(shared, 순수 함수 · 테스트): `accumSignalOf(row): AccumSignal | null` — kind 16 행을 {isin, exchange, state(1|2|3), endReason, cycle, carryDays, buyQty, buyKrw,
  sellQty, sellKrw, netQty, netKrw, avgPx, loPx, hiPx, regPx, peakNetKrw, sellPhases, maxSame, mcapKrw, ourExcludedQty, lastPx, rateBp, row(1..4), sinceDate, regTime, thNetKrw, thMinSame, thMaxMcapKrw, gwTimeMs, gateway}
  로 풀어 준다(칸 매핑 정본 = 노트 표 · `message` 는 `since=`/`reg=` 만 읽고 나머지 키는 칸과 대조하지 않는다). 매핑: price→lastPx · qty→state · condThreshold→netKrw · condActual→rateBp ·
  evPrice→avgPx · evQtyBefore→buyQty · evQtyAfter→sellQty · evTradeQty→netQty · limitBidQty→buyKrw · bid1Price→regPx · bid1Qty→sellKrw · immediateFillQty→ourExcludedQty ·
  queueCase→row · baseCum→mcapKrw · aheadQty→maxSame · expectedCum→cycle · cancelReason→endReason · resultCode→sellPhases · entryRound→carryDays · snapQty=[loPx,hiPx] ·
  snapCum=[thNetKrw,thMinSame] · askQtyAtLimit→peakNetKrw · message `th=<net>/<same>/<mcap>` 의 mcap → thMaxMcapKrw.
- 웹 리듀서(`use-relay-socket.ts` `journal.events` :1040-1067): kind 16 은 `accumSignalEvents: StrategyEventRow[]`(+ `accumSignalEventsBatch`) 로 가른다 —
  `strategyEvents` · `limitFeatureEvents` 어디에도 안 넣는다(주문로그 무영향). 상한 `MAX_ACCUM_SIGNAL_EVENTS = 2000`(`upsertStrategyEvents` 재사용). `reset` 만 비운다.
- 복원: 새 훅 `use-accum-signals.ts` = `use-order-log-feed.ts` ⑥ 축소판 — 마운트 1회 + relay `ready` 전이마다 `fetchAccumSignals()`(오늘) → 복원 ∪ 라이브(`accumSignalEvents`) 를
  `strategyEventKey` 로 합치고 **isin 별 최신 행**(gwTimeMs desc → gateway asc → seq desc)을 고른다. 폴링 없음.
- 서버 간 중복(세 서버 각자 넣음): 웹 = 위 「최신 행」 규칙 하나(값 차이는 our_excluded_qty 뿐 · 인계 노트). REST RPC 도 같은 규칙이되 **같은 분(gw_time_ms/60000) 안 동률은
  `dma_servers.is_quote_primary` 게이트웨이 우선**(gh-trade 와 합의한 「quote-primary 정본 + 폴백」의 구현). 웹은 quote-primary 를 모르므로 그 우선은 RPC 에만 있다.

### D-03 DB · server
- 마이그레이션 1장 `supabase/migrations/20261018…_dma_strategy_events_accum_signal.sql` — `20261006090000_dma_strategy_events_limit_feature.sql` 문법 복제:
  (가) `dma_strategy_events_for_user` 재정의: kind 조건 두 곳 `(1, 2, 10, 15)` → `(1, 2, 10, 15, 16)` (본문 그대로).
  (나) `dma_strategy_events_for_user_json` 재정의: `WHERE (p_include_limit_feature OR kind <> 15) AND kind <> 16` — 주문로그는 16 을 받지 않는다(시그니처 불변).
  (다) `dma_strategy_events_purge_limit_feature(integer)` 재정의: `kind IN (15, 16)` (함수 이름 · 시그니처 · 워커 호출 불변 · 주석에 16 추가). 부분 인덱스 `idx_dma_strategy_events_accum_signal_day (trade_date) WHERE kind = 16`.
  (라) 신규 `dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date) RETURNS jsonb` — `dma_strategy_events_for_user(p_user_id, p_trade_date)` 위에서 kind 16 만,
  `DISTINCT ON (isin)` 정렬 `gw_time_ms/60000 DESC, is_quote_primary DESC NULLS LAST, gw_time_ms DESC, gateway, seq DESC` (`LEFT JOIN dma_servers ON key = gateway`) → `jsonb_agg` (빈 날 `'[]'`).
  권한: REVOKE PUBLIC · anon · authenticated 명시 + GRANT service_role (프로젝트 규칙 · 메모리). 가시성은 기존 SETOF 함수 조인 그대로(시세 kind = 그 게이트웨이 가시 계좌 있는 사용자 전원).
- pgTAP 테스트 `supabase/tests/dma_strategy_accum_signal.test.sql` — `dma_strategy_limit_feature.test.sql` 복제: 16 이 시세 가시성으로 보임 · 주문로그 래퍼에서 빠짐 · purge 가 16 도 지움 ·
  accum RPC 가 isin 별 1행 · 같은 분 동률에서 quote-primary 우선 · 다른 분이면 최신 우선.
- server: `server/src/routes/accum-signals.ts` (`strategy-events.ts` 복제 · `?date=` 만 · zod 는 `StrategyEventsQuery` 의 date 부분 재사용 또는 새 스키마) → `services/dma-orders.ts` 에
  `listAccumSignals(supabase, userId, date?)`(`listStrategyEvents` 복제 · 배열 아니면 DbError) → `toStrategyEventRow`. `app.ts` 에 `app.use("/api/accum-signals", …)`. supertest 테스트 1벌(`server/tests/routes/strategy-events.test.ts` 복제).
- webapp `lib/accum-signals-api.ts`: `fetchAccumSignals(date?)` → `authFetch<StrategyEventRow[]>('/api/accum-signals…')`.

### D-04 인박스 · 커밋
- 노트 `status: done` · `done_commit: <이 quick 의 마지막 코드 커밋 해시>` — 경로 지정 add. 노트 커밋은 마지막.
- 커밋 메시지 한글 · `Co-Authored-By` 금지(사용자 CLAUDE.md 우선). 테스트 실행은 `vitest --maxWorkers=2`(동시 세션 메모리 보호 — 메모리).
- 배포(DB push · relay · server · webapp push)는 **이 quick 범위 밖** — 메인 세션이 따로 한다.

### Claude's Discretion
- 컴포넌트 파일 이름(`accum-strip.tsx` 권장) · 표 컴포넌트 분리 · 억 포맷은 `lib/teamflow-report.ts` `fmtEok` 재사용 여부.
- `accumSignalOf` 의 숫자 캐스팅(bigint 가 문자열로 올 수 있음 — `StrategyEventRow` 규약 따름).

</decisions>

<specifics>
## Specific Ideas

- 돌파 패널 코드 앵커: `webapp/src/components/trading/workbench/breakout-strip.tsx` 스트립 줄/더보기 :440-460 · 칩 `BreakoutChip` · 표 `BreakoutTable`(열 접기 `colNarrow`/`colBase`) · 작업대 배치 `trading-workbench.tsx:1565-1573`.
- kind 15 선례 앵커: 리듀서 `use-relay-socket.ts:1040-1067` · 상한 상수 :142-160 · 상태 필드 :505-517 · 초기값 :829-830 · 복원 훅 `use-order-log-feed.ts:155-230` · REST `strategy-events-api.ts` · server `routes/strategy-events.ts` · `services/dma-orders.ts:109-124`.
- SQL 선례: `supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql:36-125` · `dma_servers` 정의 `20261006200100_dma_registry_intent.sql:38-66`(`is_quote_primary` 전체 1대 UNIQUE).
- 테스트 선례: `webapp/src/components/trading/__tests__/breakout-strip.test.tsx` · `vi-trigger-strip.test.tsx` · `supabase/tests/dma_strategy_limit_feature.test.sql` · `server/tests/routes/strategy-events.test.ts`.

</specifics>

<deferred>
## Deferred Ideas

- `/analytics/teamflow` 밤 보고서 카드 「장중 신호」 배지 · 장중 섹션(목업 `mockup.html` A) — 별도 quick.
- 매집 등록 알림음 · 토스트(돌파 `notifyBreakouts` 동형) — 사용자 요청 시.
- 웹 쪽 quote-primary 게이트웨이 인지(relay 가 알려 주면 라이브 병합에도 우선 적용).

</deferred>
