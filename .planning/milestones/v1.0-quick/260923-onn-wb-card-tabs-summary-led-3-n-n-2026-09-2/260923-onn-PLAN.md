---
phase: quick-260923-onn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/latch-led.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/card-account-slice.ts
  - webapp/src/components/trading/card/card-tabs.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/latch-led.test.tsx
  - webapp/src/components/trading/__tests__/card-header.test.tsx
  - webapp/src/components/trading/__tests__/card-account-slice.test.ts
  - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/strategy-log.test.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [ONN-A, ONN-B, ONN-C, ONN-D]

estimate:
  tokens: 190000
  raw_tokens: 190000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "접힌 카드(`open=false`) 헤더 2줄째는 LED 점 3개(매수·매도·취소 순, `data-variant=\"dot\"`, 히트 24px, 색·클릭·툴팁은 `latchLedStateOf` 판정 그대로) + 「미체결 N」(N>0 일 때만, accent) + 「잔고 N주」(보유 있을 때만, muted) + ⓘ·✕ 다. 손익은 없다 (ONN-A · D-28)"
    - "펼친 카드(`open=true`) 헤더는 기존 LED 칩 3개(이름 + OFF/대기/감시) 그대로이고 요약 칩이 없다 (ONN-A)"
    - "펼친 카드 본문 상단, 종전 `QuoteGrid10` 자리에 「정보 | 미체결 N | 잔고 | 로그 N」 탭 줄(24px · 선택 accent)이 서고 기본 탭 「정보」가 기존 10칸 그대로다. 배지는 미체결·로그만, 0이면 생략 (ONN-B)"
    - "미체결 탭은 이 카드 종목(isin)·거래소·계좌의 행만 — 열은 구분 · 주문가 · 주문/미체결 · 주문No · 취소(종목·거래소 열 없음). 행을 누르면 작업대의 `selectUnfilled` 가 그 행으로, 같은 행을 다시 누르면 `null` 로 불린다 — 공용 패널과 같은 콜백·같은 선택 상태 하나 (ONN-B · ONN-C)"
    - "잔고 탭은 이 카드 종목 보유 1행(수량·매도가능·평단·현재가·평가손익·손익률, 현재가는 작업대 `priceOf`), 없으면 「보유 없음」. 로그 탭은 카드 훅 `log` 를 `StrategyLog variant=\"embed\"` 로, 없으면 「로그 없음」. 미체결 빈 문구는 「이 종목의 미체결이 없어요」 (ONN-B)"
    - "카드별 미체결/잔고는 순수 함수(`cardUnfilledOf` · `cardHoldingOf` · `cardAccountSliceOf`)가 `useRelayContext().accountStates.get(accountNo)` 에서 뽑고, 접힌 헤더 칩 숫자와 탭 배지·본문이 같은 파생값을 쓴다. 새 relay/REST 경로 0 (ONN-C · T-16-02)"
    - "탭 상태는 카드 컴포넌트 state 뿐이고 접었다 펴도 유지된다(본문이 `hidden` 으로 남는 WR-02 그대로). 카드 안 반응형은 `@container/lc` 유틸리티뿐이며 뷰포트 브레이크포인트 클래스가 없다 (D-28)"
    - "기존 호출부 DOM 불변: `AccountPanel` 은 `embedScope`/`embedEmptyTitle` 을 넘기지 않으면, `StrategyLog` 는 `emptyTitle` 을 넘기지 않으면 종전과 한 글자도 다르지 않다 — 기존 account-panel · shared-panels · strategy-log 테스트가 단언 수정 없이 초록 (ONN-D)"
    - "게이트: config `build_command`(shared build → relay typecheck → relay typecheck:tests → webapp typecheck) exit 0 · `pnpm --filter @gh-radar/webapp run test` 전량 초록 · Playwright `trading-workbench` spec 만 실행해 0 fail · `pnpm-lock.yaml` 변경 0 (ONN-D)"
  artifacts:
    - path: "webapp/src/components/trading/latch-led.tsx"
      provides: "`LatchLedProps.variant?: 'chip' | 'dot'` — 점 변형(24px 히트 · 10px 도트 · sr-only 「{이름} 래치 {라벨}」 · 툴팁 「{이름} · {라벨}」 + C# 원문). 판정은 `latchLedStateOf` 하나"
      contains: "variant"
    - path: "webapp/src/components/trading/card/card-header.tsx"
      provides: "`unfilledCount?` · `holdingQty?` props · 접힘 전용 l2(점 그룹 `latch-led-dots` + `card-summary-unfilled` + `card-summary-holding`)"
      contains: "card-summary-unfilled"
    - path: "webapp/src/components/trading/card/card-account-slice.ts"
      provides: "순수 함수 3종 `cardUnfilledOf` · `cardHoldingOf` · `cardAccountSliceOf` + `CardAccountSlice` 타입"
      contains: "export function cardAccountSliceOf"
    - path: "webapp/src/components/trading/card/card-tabs.tsx"
      provides: "`CardTabs` — Radix `Tabs` 4탭(정보·미체결·잔고·로그) · 카운트 배지 · AccountPanel stock 스코프 임베드 · StrategyLog embed"
      contains: "export function CardTabs"
    - path: "webapp/src/components/trading/card/strategy-card.tsx"
      provides: "`accountStates` 슬라이스 1회 계산 → 헤더 칩 숫자 + `CardTabs` (QuoteGrid10 자리) · 새 props `selectedOrderNo` · `onSelectUnfilled` · `priceOf` · `originOf` · `onCancelSubmitted`"
      contains: "cardAccountSliceOf"
    - path: "webapp/src/components/orderbook/account-panel.tsx"
      provides: "임베드 모드 `embedScope?: 'account' | 'stock'`(stock = 종목·거래소 열 생략, 선택 핸들이 구분 셀) · `embedEmptyTitle?: string`"
      contains: "embedScope"
    - path: "webapp/src/components/trading/strategy-log.tsx"
      provides: "embed 변형 `emptyTitle?: string`"
      contains: "emptyTitle"
    - path: "webapp/src/components/trading/workbench/shared-panels.tsx"
      provides: "`export function nextUnfilledSelection(selectedOrderNo, row)` — 재선택=해제 토글의 유일 지점(공용 패널·카드 탭 공용)"
      contains: "export function nextUnfilledSelection"
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "`WorkbenchCardItem` 에 `onSelectUnfilled`(카드 계좌 = 상태줄 계좌일 때만 `selectUnfilled`) · `priceOf` 배선, `selectedOrderNo = selectedUnfilled?.orderNo ?? null`"
      contains: "onSelectUnfilled"
  key_links:
    - from: "strategy-card.tsx `useRelayContext().accountStates.get(accountNo)`"
      to: "card-account-slice.ts `cardAccountSliceOf(account, isin, exchange)`"
      via: "`useMemo([accountState, isin, exchange])` 1회 → `CardHeader unfilledCount/holdingQty` 와 `CardTabs account` 가 같은 결과를 읽는다"
      pattern: "cardAccountSliceOf"
    - from: "card-tabs.tsx 미체결 행 클릭 (`AccountPanel onSelectUnfilled`)"
      to: "trading-workbench.tsx `selectUnfilled` (`setSelected` · `cardForUnfilled` · `setScrollTarget`)"
      via: "`nextUnfilledSelection(selectedOrderNo, row)` → `onSelectUnfilled(row | null)` — SharedPanels.handleSelect 와 같은 헬퍼"
      pattern: "nextUnfilledSelection"
    - from: "trading-workbench.tsx `liveSelected`"
      to: "카드 탭 선택 행 accent (`AccountPanel selectedOrderNo`) + 수동주문 폼 `selectedUnfilled`"
      via: "`WorkbenchCardItem selectedUnfilled` 하나에서 `selectedOrderNo` 를 파생 — 두 진실 없음"
      pattern: "selectedOrderNo"
    - from: "card-header.tsx 접힘 l2"
      to: "latch-led.tsx `LatchLed variant=\"dot\"`"
      via: "`latchLedStateOf(kind, server)` 판정 객체 그대로 — 색·clickable·label·tooltip 재판정 0"
      pattern: "variant=\"dot\""
---

<objective>
작업대 전략 카드 2곳을 2026-09-23 목업 채택안(①A · ②A)대로 바꾼다.
① 접힌 카드 헤더 2줄째: LED 칩 3개 → **점 3개** + 「미체결 N」·「잔고 N주」 요약 칩.
② 펼친 카드 본문 상단(`QuoteGrid10` 자리): **「정보 | 미체결 N | 잔고 | 로그 N」 교체 탭** — 정보 = 기존 10칸, 미체결/잔고 = 이 카드 종목으로 자른 계좌 상태, 로그 = 카드 훅 로그.

Purpose: 접힌 카드에서 미체결·잔고 유무를 즉시 보고, 펼친 카드 안에서 하단 공용 패널로 내려가지 않고 이 종목의 정정·취소 대상을 고른다. 데이터는 전부 작업대에 이미 있다 — 새 relay/REST 경로를 만들지 않는다(T-16-02). LED 판정은 `latchLedStateOf` 한 곳(T-18-28), 미체결 선택은 작업대 `selected` 상태 하나(D-21)다.

Output: `latch-led.tsx` 점 변형 · `card-header.tsx` 접힘 l2 · 순수 함수 `card-account-slice.ts` · `card-tabs.tsx` · `strategy-card.tsx` 배선 · `account-panel.tsx` stock 스코프 임베드 · `strategy-log.tsx` 빈 문구 override · `shared-panels.tsx` 토글 헬퍼 · `trading-workbench.tsx` prop 배선 · vitest 신규 2파일 + 기존 6파일 갱신.

설계는 오케스트레이터가 잠갔다(`<design_decisions_locked>`). 레이아웃 재검토·대안 제시 금지. 섹션 ③ 알림·토스트·거래소 토글 잠금 변경·헤더 스위치(D-12)·공용 패널 제거·새 의존성·뷰포트 브레이크포인트는 이 quick 밖이다.

**분해 방식 메모 (tracer-first 면제 근거):** 아키텍처는 잠긴 설계와 기존 계약(`AccountPanel section` 임베드 · `StrategyLog embed` · `latchLedStateOf` · 작업대 `selectUnfilled`)으로 이미 확정돼 얇은 수직 슬라이스가 새 정보를 주지 않는다. 오케스트레이터가 지정한 태스크 형태(T1 헤더 · T2 탭+배선 · T3 회귀+게이트)를 따르되, 각 태스크 커밋 시점에 저장소가 컴파일·테스트 초록이도록 경계를 잡았다(T1 이 `CardHeader` 새 props 를 `strategy-card` 에서 같은 커밋에 채운다).

**MUTABLE-SCOPE (#3786) — 계획 시점 실측:** HEAD `00100f0`, working tree 는 이 quick 의 `.planning/quick/260923-onn-…/` 미추적 디렉터리 외 변경 0. 아래 줄 번호는 전부 그 HEAD 기준 실측이다. 이 플랜은 `files_modified` 목록 밖의 파일을 편집하지 않는다(테스트가 깨져 갱신하는 e2e spec · trading-workbench.test 포함해 이미 목록에 있다).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

**앵커 지도 (플래너가 이미 읽었다 — 파일 전체를 다시 읽지 말고 이 구간만 연다). 2026-09-23 HEAD `00100f0` 기준.**

webapp/src/components/trading/latch-led.tsx (245줄)
- L37-58 `LatchLedKind` · `LatchLedTone` · `LatchLedLabel` · `LatchLedState{tone, clickable, label, tooltip}`. L62 `LatchLedServer`. L65-69 `LATCH_LED_NAMES`.
- L117-164 `latchLedStateOf(kind, server)` **순수 함수 — 손대지 않는다.**
- L167-171 `DOT_CLASS: Record<LatchLedTone,string>`(도트 색 클래스 — 점 변형이 그대로 재사용). L173-180 `LatchLedProps{kind, server, onArm?, className?}`.
- L193-245 `LatchLed` — 칩 본문 `body`(L204-218: 9px 도트 + 이름 + sr-only 「래치」 + 라벨), clickable 이면 `<button data-slot="latch-led" data-kind data-tone aria-pressed>`(L220-234), 아니면 `<span …>`(L235-243), `state.tooltip !== null` 일 때만 `TooltipProvider/Tooltip/TooltipTrigger asChild/TooltipContent className="max-w-xs whitespace-normal"` 로 감싼다(L245-).

webapp/src/components/trading/card/card-header.tsx (290줄)
- L40-49 import(`LatchLed` · `ToggleGroup` · `cn`). L52-57 `EXCHANGE_LOCKED_TITLE` · `EXCHANGES` · `LED_KINDS` · `KRW`.
- L59-96 `CardHeaderProps`(name · nameTitle · code · exchange · onExchangeChange · exchangeLocked · price · changeRate · ledServer · onArm · open · onToggle · toggleId · controlsId · onInfo · onClose). L99-101 `stop(event)`.
- L143-149 `<header data-slot="card-header" data-open …>`. L157-160 `l1`(`data-slot="card-header-l1"`, `@min-[760px]/lc:flex-[1_1_auto]`).
- **L242-245 `l2`** `<div data-slot="card-header-l2" className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2.5 @min-[760px]/lc:flex-[0_0_auto]">` → L251-255 LED 3칩 `<span onClick={stop} className="flex flex-wrap gap-1.5">{LED_KINDS.map(<LatchLed kind server={ledServer} onArm={onArm}/>)}</span>` → L256-286 ⓘ(`title="종목정보 (차트 · 종목정보 · 뉴스·토론)"` · `disabled={code === null}`) · ✕(`aria-label={`${name} 카드 닫기`}`) `<span className="ml-auto …">`.
- 헤더 주석 ④(L31-35): 반응형은 `@container/lc` 만 — 뷰포트 브레이크포인트 금지(D-28).

webapp/src/components/trading/card/strategy-card.tsx (769줄)
- L46-53 import 블록(`CardHeader` · `QuoteGrid10` · `latchLedStateOf` …), L63-66 `useRelayContext, useRelaySubscription` import.
- L93 `LC_CONTAINER_CLASS = "@container/lc"`. L145-176 `StrategyCardState`(key · server · quote · tape · isStale · **log** · … · ledServer · handleArm …).
- L186-215 `useStrategyCardState` 시작 — `useRelayContext()` 에서 `limitChasers, lastLimitChaserEcho, messages, send, strategiesDisabled` 만 꺼낸다(L192-198).
- L572-616 `StrategyCardProps`(cardId · isin · accountNo · exchange · name · code · open · onToggle · onClose · onExchangeChange · onInfo? · onDirtyCountChange? · onLogChange? · body?).
- L623-668 `StrategyCardImpl` 머리 — `const card = useStrategyCardState(...)`; `const { key, server, quote, ledServer, handleArm, dirtyCount, log } = card;`(L640); `everOpened`(L657-658); `idBase/toggleId/bodyId`(L660-662); `nameTitle`(L668-671).
- L679-729 반환 JSX — `<article data-slot="strategy-card" … className={cn(LC_CONTAINER_CLASS, …)}>` → `<CardHeader … ledServer={ledServer} onArm={handleArm} open={open} …/>`(L690-708) → **L717-726** `<div id={bodyId} data-slot="strategy-card-body" hidden={!open}>{everOpened && (<><QuoteGrid10 quote={quote} /><CardNotices card={card} />{body?.(card)}</>)}</div>`.
- L768 `export const StrategyCard = memo(StrategyCardImpl)`. 주석 ④(L25-30): 부모는 문자열·안정 콜백만 내린다.

webapp/src/components/trading/card/quote-grid-10.tsx — `QuoteGrid10({quote, basePrice?, upperLimit?, lowerLimit?, currentPrice?})`, 루트 `data-slot="lc-quote-grid"` 에 자체 `border-t border-[var(--border-subtle)]`. 손대지 않는다.

webapp/src/components/trading/strategy-log.tsx (366줄)
- L32-45 `StrategyLogEntry{id, at, text, level?, who?}`. L250-266 `StrategyLogProps{entries, variant?: 'card'|'embed', className?}`.
- L268-310 `variant === 'embed'` 분기 — 빈 상태 L271-277 `<div className="m-[var(--s-3)] rounded-[var(--r-md)] border border-dashed …"><b …>아직 기록이 없어요</b></div>`, 목록 `data-slot="strategy-log-list"` / 행 `data-slot="strategy-log-row"`.

webapp/src/components/orderbook/account-panel.tsx (1411줄)
- L102-113 주석 ⑪ 탭 임베드 모드 계약(열 구성 원문 · 「`section` 을 넘기지 않는 기존 호출부의 DOM 은 그대로다」). L174 `AccountRowOrigin`.
- L176-252 `AccountPanelProps` — L202 `isin?: string | null`(**「이 행이 지금 보는 종목인가」 판정에만** — 필터가 아니다), L233 `onSelectUnfilled?`, L235 `selectedOrderNo?`, L240 `section?: 'unfilled'|'holdings'`, L245 `originOf?`, L250 `priceOf?`. L214-221 `unfilledHeaderActions` 주석: 「필터는 어떤 행을 넘길지의 문제라 `account` 를 만들어 주는 호출부의 몫」 — **카드 필터는 호출부(카드)가 `account.unf/hold` 를 잘라 넘기는 방식이 이 파일의 기존 규율이다.**
- L325-341 `unfilled: UnfilledView[]` useMemo(`account?.unf`), L343-361 `holdings: HoldingView[]`(`priceOf?.(row.isin)`).
- L432-465 `cancelButton(view, className?)`, L468-470 `selectable/isSelected`, L476-485 `rowSelectProps(view)`, L488-493 `rowSelectClass(view)`, L500-514 `selectHandle(view, content, className?)`(첫 셀 콘텐츠를 `<button data-slot="account-unfilled-select" aria-pressed>` 로 감싼다), L516-533 `section !== undefined` → `<EmbeddedSection …/>`.
- L1027-1029 `EMB_TH` · `EMB_TD`. **L1035-1253 `EmbeddedSection`** — holdings 분기 L1066-1136(`data-testid="account-panel" data-mode="embed" data-section="holdings"`, 빈 상태 `EmptyState title="보유 종목이 없어요" body="…"`, 헤더 7열: 종목 · 수량 · 매도가능 · 평단 · 현재가 · 평가손익 · 손익률, 행 `data-slot="account-embed-holding-row"`), unfilled 분기 L1141-1252(빈 상태 `EmptyState title="미체결 주문이 없어요" …`, 헤더 7열: 종목 · 거래소 · 구분 · 주문가 · 주문/미체결 · 주문No · sr-only 취소, 행 `data-slot="account-embed-unfilled-row"` + `rowSelectProps/rowSelectClass`, 종목 셀 L1182-1207 = `selectHandle(view, <span data-slot="account-embed-name">…)` + 출처 배지 `data-slot="account-origin-badge"` + `<StatusNotes texts=[queuedStatus, pendingStatus]/>`, 거래소 셀 `<ExchangeTag/>`, 구분 셀 `<SideTag side text muted selected/>`, 취소 결과 행 `colSpan={7}` L1229-1235, 표 아래 폴백 배너 L1244-1248).
- L1404-1411 `EmptyState({title, body})` — `body` 가 필수 문자열.

webapp/src/components/trading/workbench/shared-panels.tsx (326줄)
- L82-118 `SharedPanelsProps`(accountNo · account · status · logEntries · selectedOrderNo · onSelectUnfilled · dirtyBarCount · originOf? · priceOf? · onCancelSubmitted? · phoneBand? · className?).
- L160-163 `TAB_TRIGGER`(h-7 · accent 선택 — 카드 탭은 같은 문법을 h-6 으로).
- **L192-197 `handleSelect`** = `onSelectUnfilled(selectedOrderNo !== null && row.orderNo === selectedOrderNo ? null : row)` — 토글의 유일 지점(주석 ③). 이번에 헬퍼로 뽑아 카드 탭과 공유한다.
- L213-219 `embedProps{selectedAccountNo, account, status, priceOf, onCancelSubmitted}`, L285-296 `<AccountPanel {...embedProps} section="unfilled" originOf selectedOrderNo onSelectUnfilled={handleSelect}/>` · `section="holdings"` · `<StrategyLog entries variant="embed"/>`.

webapp/src/components/trading/workbench/trading-workbench.tsx (1124줄)
- L184-195 `WorkbenchCard{id, isin, accountNo, exchange, open, name?, code?}`. L247-267 `cardForUnfilled(cards, row, accountNo)`(같은 ISIN ∧ 행의 거래소 ∧ 계좌 — **카드 슬라이스 필터와 같은 규칙**).
- L706-712 `account = accountStates.get(accountNo)` · `selected` state · `liveSelected`(살아 있는 행). **L723-737 `selectUnfilled(row | null)`**(setSelected → 없으면 카드 붙임 → `setScrollTarget`), L738 `clearSelection`, L741 `priceOf = useCallback((isin) => holdingQuotePrice(quotes, isin), [quotes])`. L747-780 `reportLog`.
- **L908-935 `renderCard`** — `<WorkbenchCardItem card name code status queuedWindow selectedUnfilled={liveSelected !== null && liveSelected.isin === c.isin && liveSelected.exchange === c.exchange && c.accountNo === accountNo ? liveSelected : null} onClearSelection onToggle onClose onExchangeChange onInfo onDirtyCountChange onLogChange/>`.
- **L940-948 `<SharedPanels accountNo account status logEntries={mergedLog} selectedOrderNo={liveSelected?.orderNo ?? null} onSelectUnfilled={selectUnfilled} dirtyBarCount priceOf phoneBand/>`** — `originOf` · `onCancelSubmitted` 는 **오늘 배선돼 있지 않다**(실측). 카드도 같은 세 값만 받는다.
- L1040-1053 `WorkbenchCardItemProps`, L1061-1124 `WorkbenchCardItem`(memo · `body` useCallback L1077-1101 · `<StrategyCard …/>` L1107-1122).

webapp/src/lib/relay-provider.tsx — `RelayContextValue.accountStates: ReadonlyMap<string, RelayAccountState>`(L287) · `status`(L323) · `quotes`(L328) · `EMPTY_RELAY_VALUE`(L320-) · `RelayContext` export(테스트가 `RelayContext.Provider value={{...EMPTY_RELAY_VALUE, …}}` 로 주입 — `strategy-card.test.tsx` L88-99 `relay(over)` 헬퍼).
packages/shared/src/relay.ts — L746-762 `RelayHolding{isin, qty, sellableQty, avgPrice, name?, code?}`, L764-813 `RelayUnfilled{orderNo, orgOrderNo, isin, side, price, orderQty, filledQty, unfilledQty, exchange, orderTime, queuedStatus, pendingStatus, board, pendingCancelSent, name?, code?}`, L816-835 `RelayAccountState{t:"acct", a, snap, hold, unf, rm, st}`.

테스트 하네스
- `webapp/src/components/trading/__tests__/card-header.test.tsx` L1-94: `echo(over)` · `renderHeader(over)`(**기본 `open: true`**) · `header()` 조회. LED 단언 L141-159(칩 `textContent` 'OFF'/'대기'), 전파 차단 L180-191, 뷰포트 브레이크포인트 0 L228-236.
- `webapp/src/components/trading/__tests__/strategy-card.test.tsx` L1-143: `relay(over)` · `baseProps`(**`open: true`**) · `probeBody` · `cardOf(isin)`. 접힘 L240-257(`lc-quote-grid` 없음 · region childElementCount 0), WR-02 L259-305(접어도 grid 가 DOM 에 남음), 순서 L307-321(grid → body probe), `@container/lc` + 뷰포트 클래스 0 스캔 L323-343.
- `webapp/src/components/trading/__tests__/latch-led.test.tsx` — `latchLedStateOf` 표(L98-257) · 접근성 L267-320 · 클릭 L321-.
- `webapp/src/components/trading/__tests__/shared-panels.test.tsx` L30-36 `vi.mock('@/lib/relay-provider')` → `useRelayContext: () => ({...EMPTY_RELAY_VALUE, sendOrder: sendOrderMock})` — **`CardTabs` 테스트는 이 하네스를 그대로 본뜬다**(AccountPanel 이 `useRelayContext().sendOrder` 를 읽는다). L149-231 미체결 행 클릭/토글/열 순서 단언 방식.
- `webapp/src/components/orderbook/__tests__/account-panel.test.tsx` L1009- describe '미체결 행 선택 (18-09 / D-21)'.
- `webapp/src/components/trading/__tests__/trading-workbench.test.tsx` L145-160 SharedPanels 스파이, L863-1003 미체결 선택 케이스(조회는 `screen.getByTestId('shared-panels')` 스코프).
- `webapp/e2e/specs/trading-workbench.spec.ts` — LED 단언은 **펼친 카드**에서만이다: 10(L835-850 `data-tone` armed) · 11(L1113-1132 칩 `toContainText('대기'|'감시')`, `?focus=` 로 펼친 카드). 접힌 카드 단언은 `data-open` 속성뿐(GC3 L869-875 · GC2 L1181). 9(L803) `lc-quote-grid` 는 펼친 카드 기본 탭. relay 는 spec 픽스처 `withLocalRelay()` 가 8090 에 스스로 띄운다(L290-306).
- 게이트 명령 근거(이전 quick 이 통과시킨 원문): `pnpm --filter @gh-radar/webapp test src/lib/__tests__/orders-api.test.ts`(260923-m23 SUMMARY L77, 16 passed) · `cd webapp && pnpm exec playwright test trading-workbench -g "GC5|GC6"`(3 passed) · `pnpm exec playwright test trading-workbench orderbook`(47 passed). dev 서버 포트는 `dev.sh` 기준 **3100**(Playwright `webServer` 가 재사용/기동).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LED 점 변형 + 접힌 헤더 요약 칩 + 카드 계좌 슬라이스 순수 함수 + 헤더 배선 (ONN-A · ONN-C)</name>
  <files>webapp/src/components/trading/latch-led.tsx, webapp/src/components/trading/card/card-header.tsx, webapp/src/components/trading/card/card-account-slice.ts, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/latch-led.test.tsx, webapp/src/components/trading/__tests__/card-header.test.tsx, webapp/src/components/trading/__tests__/card-account-slice.test.ts, webapp/src/components/trading/__tests__/strategy-card.test.tsx</files>
  <read_first>webapp/src/components/trading/latch-led.tsx:167-245, webapp/src/components/trading/card/card-header.tsx:59-101 및 242-289, webapp/src/components/trading/card/strategy-card.tsx:186-200 · 572-616 · 623-729, webapp/src/components/trading/__tests__/card-header.test.tsx:1-94 · 141-159, webapp/src/components/trading/__tests__/strategy-card.test.tsx:1-143 · 240-257, packages/shared/src/relay.ts:746-835</read_first>
  <behavior>
    - latch-led.test (신규 describe 「LatchLed — 점 변형 (quick-260923-onn)」): `variant="dot"` · clickable 상태(매도 대기)이면 `button[data-slot="latch-led"][data-variant="dot"][data-kind="sell"][data-tone="latent"]` 이고 `aria-pressed="false"`, 보이는 텍스트 노드 없이 sr-only 「매도 래치 대기」가 접근성 이름이며, 클릭하면 `onArm('sell')` 1회. 클릭 불가(server null · 매도잔량 기준 매수)는 `span[data-variant="dot"]` 이고 클릭해도 `onArm` 미호출. 툴팁 트리거에 hover 하면 「매수 · 감시」 줄과 C# 원문(`askSide` 문구)이 함께 뜬다(기존 ⑦ 케이스의 userEvent.hover 방식). `variant` 를 넘기지 않은 칩은 종전 DOM 그대로(`data-variant` 속성 없음 · textContent 에 'OFF').
    - card-header.test (신규 describe 「CardHeader — 접힌 카드 요약 (quick-260923-onn · 목업 ①A)」): `open:false` + `ledServer: echo({sellEnabled:true})` + `unfilledCount:2` + `holdingQty:1200` → l2 안에 `[data-slot="latch-led-dots"]` 1개, 그 안 `[data-slot="latch-led"][data-variant="dot"]` 3개가 `data-kind` 순서 buy·sell·cancel, `[data-slot="card-summary-unfilled"]` textContent 「미체결 2」, `[data-slot="card-summary-holding"]` textContent 「잔고 1,200주」, ⓘ·✕ 버튼 여전히 존재. `unfilledCount:0` + `holdingQty:null`(및 `0`) → 두 칩 모두 없음. 매도 점 클릭 → `onArm('sell')` 1회 · `onToggle` 미호출(전파 차단). `open:true` + 같은 카운트 → `data-variant="dot"` 0개 · 요약 칩 0개 · 칩 3개 textContent 에 'OFF'/'대기' 그대로. 접힘 헤더 전체 클래스에 `(sm|md|lg|xl|2xl):` 없음(기존 L228-236 방식).
    - card-account-slice.test (신규 파일): `cardUnfilledOf(unf, isin, exchange)` — 같은 isin·KRX 2행 + 같은 isin·NXT 1행 + 다른 isin 1행 입력 시 KRX 카드는 2행(입력 순서 유지) · NXT 카드는 1행 · 없는 isin 은 `[]`. `cardHoldingOf(hold, isin)` — 일치 행 1개 반환, `qty:0` 톰스톤 행은 `null`, 없으면 `null`. `cardAccountSliceOf(account, isin, exchange)` — `account` null 이면 `{account:null, unfilled:[], holding:null}`; 아니면 `account.unf` = 잘린 배열 · `account.hold` = holding 있으면 `[holding]` 없으면 `[]` · `t/a/snap/rm/st` 원본 그대로 · 입력 객체 불변(원본 `unf.length` 변화 없음).
    - strategy-card.test (신규 1케이스, 기존 `relay()` 헬퍼 재사용): `relay({ accountStates: new Map([[ACCOUNT, {t:'acct', a:ACCOUNT, snap:true, rm:[], st:'', unf:[ISIN_A·KRX 행 1, ISIN_A·NXT 행 1, ISIN_B·KRX 행 1], hold:[{isin:ISIN_A, qty:100, sellableQty:100, avgPrice:1000}]}]]) })` 로 `open={false}` 카드 A(KRX) 를 그리면 헤더에 「미체결 1」·「잔고 100주」, 카드 B(KRX) 는 「미체결 1」·잔고 칩 없음. 기존 케이스(L240-257 접힘 · L259-305 WR-02 · L307-321 순서)는 단언 수정 없이 초록.
  </behavior>
  <action>
**RED 먼저** — 위 `<behavior>` 를 각 테스트 파일에 쓰고 실패를 확인한 뒤 GREEN 으로 간다.

1. `latch-led.tsx` — `LatchLedProps` 에 `variant?: 'chip' | 'dot'`(기본 `'chip'`) 추가. `variant === 'dot'` 분기를 `LatchLed` 안에 두되 **판정은 그대로 `latchLedStateOf(kind, server)` 결과 객체 하나**를 읽는다(색·clickable·label·tooltip 재판정 0 — T-18-28). 점 마크업: 바깥은 clickable 이면 `<button type="button" data-slot="latch-led" data-variant="dot" data-kind data-tone aria-pressed={tone==='armed'} onClick={() => onArm?.(kind)} className="inline-flex size-6 flex-none items-center justify-center rounded-full hover:bg-[var(--muted)]">`, 아니면 같은 속성의 비상호작용 `<span>`(칩과 같은 이유 — L183-191 주석). 안쪽은 `<span aria-hidden className={cn("size-[10px] rounded-full", DOT_CLASS[state.tone])}/>` + `<span className="sr-only">{name} 래치 {state.label}</span>`(접근성 이름은 칩처럼 내용에서 파생 · WCAG 1.4.1 텍스트 경로). 점은 **항상** Tooltip 으로 감싼다(보이는 텍스트가 없어서다): `TooltipContent className="max-w-xs whitespace-normal"` 안에 첫 줄 `<b>{name} · {state.label}</b>`, `state.tooltip !== null` 이면 둘째 줄 `<p className="m-0 mt-1">{state.tooltip}</p>`(C# 원문 그대로 — `TOOLTIPS` 상수 수정 금지). 칩 분기(`'chip'`)는 **한 글자도 바꾸지 않는다** — 기존 latch-led/card-header/strategy-card-flow 테스트가 그 DOM 을 잠근다. 파일 상단 주석에 점 변형이 접힌 카드 헤더 전용이며 판정 지점이 하나라는 문장을 한 줄 더한다.

2. `card-header.tsx` — `CardHeaderProps` 에 `unfilledCount?: number`(기본 0 · 이 카드 종목·거래소·계좌의 미체결 건수) · `holdingQty?: number | null`(기본 null · 이 카드 종목의 보유 수량) 추가(선택 prop 이라 다른 호출부가 있어도 변경 0). `l2`(L242-245) 안을 `open` 으로 가른다 — **`open === true` 분기는 지금 L251-286 그대로**(LED 칩 3개 풀 라벨 + ⓘ·✕). `open === false` 분기: ⓘ·✕ `<span className="ml-auto …">` 는 그대로 두고 그 앞에 (a) 점 그룹 `<span onClick={stop} data-slot="latch-led-dots" className="inline-flex h-6 flex-none items-center gap-0.5 rounded-full border border-[var(--border)] px-0.5">{LED_KINDS.map(kind => <LatchLed key kind server={ledServer} onArm={onArm} variant="dot"/>)}</span>`(목업 `.dots` — 순서 매수·매도·취소 그대로), (b) `unfilledCount > 0` 일 때만 `<span data-slot="card-summary-unfilled" className="inline-flex h-[22px] flex-none items-center gap-1 rounded-full border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] bg-[var(--accent)] px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--accent-fg)]">` 안에 라벨 `미체결` 과 `<span className="mono">{KRW.format(unfilledCount)}</span>` 를 **공백 하나로 이어** textContent 가 정확히 「미체결 N」이 되게(목업 `.sum.unf`), (c) `holdingQty !== null && holdingQty > 0` 일 때만 `<span data-slot="card-summary-holding" className="inline-flex h-[22px] flex-none items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)]">` 에 라벨 `잔고` + `<span className="mono">{KRW.format(holdingQty)}주</span>` → textContent 「잔고 N주」(목업 `.sum.hold`). 손익은 그리지 않는다. 칩은 헤더 토글 클릭 영역 안에 그냥 둔다(누르면 카드가 펼쳐지는 것이 맞다 — 컨트롤이 아니다). 반응형은 기존 `flex-wrap` + `@min-[760px]/lc:` 그대로 — 새 브레이크포인트 클래스 0(D-28). 파일 상단 주석 ①에 「접힘 = 점 3개 + 요약 칩(미체결·잔고) · 펼침 = 칩 3개」 한 줄과 2026-09-23 목업 ①A 근거를 더한다.

3. `card-account-slice.ts`(신규, 순수 함수만 · React import 0) — `export interface CardAccountSlice { account: RelayAccountState | null; unfilled: RelayUnfilled[]; holding: RelayHolding | null }`. `export function cardUnfilledOf(unf: readonly RelayUnfilled[], isin: string, exchange: RelayExchange): RelayUnfilled[]` = `row.isin === isin && row.exchange === exchange` 필터(입력 순서 유지 — **`cardForUnfilled`(trading-workbench.tsx:247-267) 와 같은 규칙**이며 계좌 축은 호출부가 `accountStates.get(accountNo)` 로 이미 골랐다). `export function cardHoldingOf(hold: readonly RelayHolding[], isin: string): RelayHolding | null` = `row.isin === isin && row.qty > 0` 첫 행(잔고엔 거래소가 없다 — KRX/NXT 카드가 같은 잔고를 본다; `qty 0` 은 톰스톤 삭제 신호라 제외 · relay.ts L822-828 주석). `export function cardAccountSliceOf(account: RelayAccountState | null, isin: string, exchange: RelayExchange): CardAccountSlice` — null 이면 빈 슬라이스, 아니면 `{ ...account, unf: unfilled, hold: holding === null ? [] : [holding] }` 를 `account` 로(스프레드 — 원본 불변). 파일 머리 주석: 「접힌 헤더 칩 · 탭 배지 · 탭 본문이 **같은 이 파생값**을 읽는다(두 진실 금지) · 새 조회 경로 0(T-16-02)」.

4. `strategy-card.tsx` — `StrategyCardImpl` 에서 `useRelayContext()` 를 한 번 더 호출해 `accountStates` 를 꺼낸다(훅 L192-198 의 구조분해는 손대지 않는다 — `stock-orderbook-section.tsx`·`card-body.tsx` 도 그 훅을 쓴다). `const accountState = accountNo === "" ? null : (accountStates.get(accountNo) ?? null); const slice = useMemo(() => cardAccountSliceOf(accountState, isin, exchange), [accountState, isin, exchange]);` — **카드가 한 번 계산해 헤더에 내린다**: `<CardHeader … unfilledCount={slice.unfilled.length} holdingQty={slice.holding?.qty ?? null}/>`. 이 태스크에서는 본문(L717-726)을 바꾸지 않는다(Task 2). 주석 ②/④ 옆에 「계좌 상태 슬라이스는 이 컴포넌트가 1회 파생 — 카드는 이미 relay 컨텍스트 소비자라 재렌더 예산이 늘지 않는다(④ T-18-29)」 를 적는다.

5. 테스트: `card-header.test.tsx` 의 `renderHeader` 기본 props 는 그대로 두고(선택 prop) 신규 describe 를 추가. `strategy-card.test.tsx` 의 `relay()` 헬퍼로 `accountStates` 를 주입. 회귀: `latch-led · card-header · strategy-card · strategy-card-flow · card-body` 5 파일이 단언 수정 없이 초록이어야 한다 — 깨지면 코드가 칩 분기를 건드린 것이다(테스트를 고치지 말고 코드를 되돌린다).

6. 커밋(코드 파일만 경로 지정 `git add` · `.planning/` 제외 · 한글 · Co-Authored-By 없음 · push 없음): `feat(quick-260923-onn): 접힌 카드 헤더 LED 점 3개 + 미체결·잔고 요약 칩 · 카드 계좌 슬라이스 순수 함수`.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp test src/components/trading/__tests__/latch-led.test.tsx src/components/trading/__tests__/card-header.test.tsx src/components/trading/__tests__/card-account-slice.test.ts src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/__tests__/card-body.test.tsx && test "$(grep -c 'variant="dot"' webapp/src/components/trading/card/card-header.tsx)" -ge 1 && test "$(grep -c 'data-slot="card-summary-unfilled"' webapp/src/components/trading/card/card-header.tsx)" -ge 1 && test "$(grep -c 'data-slot="card-summary-holding"' webapp/src/components/trading/card/card-header.tsx)" -ge 1 && test "$(grep -c 'data-slot="latch-led-dots"' webapp/src/components/trading/card/card-header.tsx)" -ge 1 && test "$(grep -c 'export function cardUnfilledOf' webapp/src/components/trading/card/card-account-slice.ts)" -ge 1 && test "$(grep -c 'export function cardHoldingOf' webapp/src/components/trading/card/card-account-slice.ts)" -ge 1 && test "$(grep -c 'export function cardAccountSliceOf' webapp/src/components/trading/card/card-account-slice.ts)" -ge 1 && test "$(grep -c 'cardAccountSliceOf' webapp/src/components/trading/card/strategy-card.tsx)" -ge 2 && test "$(grep -c 'export function latchLedStateOf' webapp/src/components/trading/latch-led.tsx)" -ge 1 && git diff --quiet HEAD -- webapp/src/components/trading/card/quote-grid-10.tsx</automated>
  </verify>
  <done>접힌 헤더가 점 3개 + 조건부 요약 칩(0/없음이면 미출력), 펼친 헤더는 기존 칩 그대로, 점의 색·클릭·툴팁이 `latchLedStateOf` 결과에서만 나오며, 카드 슬라이스 순수 함수 3종이 테스트로 잠기고 strategy-card 가 그 슬라이스로 헤더 숫자를 내린다. 위 6 테스트 파일 + typecheck 초록, 코드 커밋 1건.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 카드 탭 컴포넌트(정보|미체결|잔고|로그) + AccountPanel stock 스코프 + 선택 토글 헬퍼 + 작업대 배선 (ONN-B · ONN-C)</name>
  <files>webapp/src/components/orderbook/account-panel.tsx, webapp/src/components/trading/strategy-log.tsx, webapp/src/components/trading/workbench/shared-panels.tsx, webapp/src/components/trading/card/card-tabs.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/orderbook/__tests__/account-panel.test.tsx, webapp/src/components/trading/__tests__/strategy-log.test.tsx, webapp/src/components/trading/__tests__/shared-panels.test.tsx, webapp/src/components/trading/__tests__/card-tabs.test.tsx</files>
  <read_first>webapp/src/components/orderbook/account-panel.tsx:102-113 · 176-252 · 468-533 · 1027-1253 · 1404-1411, webapp/src/components/trading/strategy-log.tsx:250-310, webapp/src/components/trading/workbench/shared-panels.tsx:160-163 · 192-197 · 213-219 · 285-296, webapp/src/components/trading/card/strategy-card.tsx:572-616 · 717-726, webapp/src/components/trading/workbench/trading-workbench.tsx:706-741 · 908-948 · 1040-1124, webapp/src/components/ui/tabs.tsx:1-80, webapp/src/components/trading/__tests__/shared-panels.test.tsx:1-60 · 149-231</read_first>
  <behavior>
    - account-panel.test (신규 describe 「AccountPanel — 임베드 stock 스코프 (quick-260923-onn · 목업 ②A)」): `section="unfilled" embedScope="stock"` → 루트 `[data-testid="account-panel"][data-mode="embed"][data-section="unfilled"][data-scope="stock"]`, 헤더 `th` 텍스트 순서가 정확히 [구분, 주문가, 주문/미체결, 주문No, 취소](마지막은 sr-only), 종목명/거래소 태그 셀 없음(`[data-slot="account-embed-name"]` 0개), 첫 셀 안에 `button[data-slot="account-unfilled-select"]` 가 방향 태그를 감싸고 `selectedOrderNo` 와 같은 행은 `aria-pressed="true"`, `pendingStatus` 문구가 있는 행은 그 첫 셀에 `[data-slot="account-unfilled-note"]` 로 남는다, `originOf` 를 넘기면 첫 셀에 `[data-slot="account-origin-badge"]`. 행 클릭 → `onSelectUnfilled` 그 행으로 1회. `section="holdings" embedScope="stock"` → `th` 6개 [수량, 매도가능, 평단, 현재가, 평가손익, 손익률]. `embedEmptyTitle="이 종목의 미체결이 없어요"` + 빈 `unf` → 그 문구가 뜨고 보조 문장 `<p>` 없음. **기본(`embedScope` 미지정)**: 헤더 첫 `th` 가 '종목' 이고 `data-scope="account"` — 기존 describe(L237-, L1009-) 전부 단언 수정 없이 초록.
    - strategy-log.test (신규 1케이스): `variant="embed" emptyTitle="로그 없음" entries=[]` → 「로그 없음」이 보이고 「아직 기록이 없어요」 는 없다; `emptyTitle` 없으면 종전 문구.
    - shared-panels.test (신규 1케이스): `nextUnfilledSelection(null, row)` → `row`, `nextUnfilledSelection(row.orderNo, row)` → `null`, `nextUnfilledSelection('다른번호', row)` → `row`. 기존 ③-a(재선택 해제) 그대로 초록.
    - card-tabs.test (신규 파일 · 하네스는 shared-panels.test L30-36 의 `vi.mock('@/lib/relay-provider')` 를 본뜬다): 슬라이스(미체결 2행 · 보유 1행 · 로그 3줄)로 렌더하면 `role="tab"` 4개 텍스트가 [정보, 미체결 2, 잔고, 로그 3] 이고 배지는 `[data-slot="card-tab-count"]` 2개뿐(정보·잔고엔 없음); 미체결 0 · 로그 0 슬라이스면 배지 0개. 기본 선택 탭이 정보이고 `[data-slot="lc-quote-grid"]` 가 보인다. 「미체결」 탭 클릭 → `[data-slot="account-embed-unfilled-row"]` 2개 · `th` 첫 칸 '구분'. 행 클릭 → `onSelectUnfilled(row)`; `selectedOrderNo` 가 그 행이면 클릭 → `onSelectUnfilled(null)` 이고 그 행 `aria-pressed="true"`. `onSelectUnfilled` 를 안 넘기면 `[data-slot="account-unfilled-select"]` 0개(선택 UI 없음 · 취소 버튼은 있음). 「잔고」 탭 → `[data-slot="account-embed-holding-row"]` 1개, `priceOf` 가 준 현재가로 손익 칸이 「—」 가 아니다; 보유 없으면 「보유 없음」. 「로그」 탭 → `[data-slot="strategy-log-row"]` 3개; 빈 로그면 「로그 없음」. 미체결 빈 슬라이스면 「이 종목의 미체결이 없어요」. 탭 4개를 차례로 활성화하며 렌더 트리 전체 클래스에 `(sm|md|lg|xl|2xl):` 이 없고 `@container/lc` 재선언이 없다(D-28). 탭 전환 뒤 `rerender` 로 부모 props 만 바꿔도 선택 탭이 유지된다(state 가 컴포넌트 안).
  </behavior>
  <action>
**RED 먼저** — 위 `<behavior>` 를 쓰고 실패 확인 후 GREEN.

1. `account-panel.tsx` — `AccountPanelProps` 에 `embedScope?: 'account' | 'stock'`(기본 `'account'` · ⑪ 임베드 모드 전용 · `'stock'` = 종목이 이미 정해진 표면(작업대 카드)이라 종목·거래소 열을 생략) 와 `embedEmptyTitle?: string`(임베드 빈 상태 제목 override — 넘기면 보조 문장 없이 제목만) 을 추가하고 `EmbeddedSection` 에 그대로 내린다. `EmbeddedSection` 루트 두 분기 모두 `data-scope={scope}` 속성 추가. unfilled 분기 `'stock'`: `<TableHead>` 를 구분 · 주문가 · 주문/미체결 · 주문No · sr-only 취소 **5열**로, 각 행의 첫 셀(구분)에 `selectHandle(view, <SideTag side text muted selected/>, 'flex min-w-0')` → 그 옆 `origin !== undefined` 배지(`data-slot="account-origin-badge"`, 기존 마크업 그대로) → 아래 `<StatusNotes texts={[view.row.queuedStatus, view.row.pendingStatus]}/>`(취소 불가 사유 문구는 ⑨ 규율대로 남는다); 종목 셀·거래소 셀은 그리지 않는다; 취소 결과 행 `colSpan` 은 열 수 상수(`'stock'` 5 / `'account'` 7)로. holdings 분기 `'stock'`: 종목 열을 빼 **6열**. 빈 상태는 `EmptyState title={embedEmptyTitle ?? '기존 제목'} body={embedEmptyTitle === undefined ? '기존 본문' : undefined}` — `EmptyState` 의 `body` 를 `body?: string` 으로 바꾸고 있을 때만 `<p>` 를 그린다. **`'account'` 경로 DOM 은 바이트 단위로 종전과 같아야 한다**(주석 ⑪ 「넘기지 않으면 DOM 그대로」 원칙 — 기존 account-panel · shared-panels · trading-workbench 테스트가 잠근다). 취소 규율(③④⑥⑨)·선택 규율(⑩)은 **같은 클로저**(`cancelButton` · `rowSelectProps` · `selectHandle`)를 쓴다 — 두 벌 금지. 주석 ⑪ 에 stock 스코프 한 단락을 더한다.

2. `strategy-log.tsx` — `StrategyLogProps` 에 `emptyTitle?: string` 추가, `variant === 'embed'` 빈 상태의 `<b>` 텍스트를 `emptyTitle ?? '아직 기록이 없어요'` 로. card 변형·목록 마크업 불변.

3. `shared-panels.tsx` — `export function nextUnfilledSelection(selectedOrderNo: string | null, row: RelayUnfilled): RelayUnfilled | null` 를 순수 함수로 뽑고(주석: 재선택=해제 토글의 **유일 지점** · 공용 패널과 카드 탭이 같이 쓴다 · D-21) `handleSelect` 가 그것을 부르게 한다(동작 불변).

4. `card-tabs.tsx`(신규) — `export type CardTab = 'info' | 'unfilled' | 'holdings' | 'log'`; `export interface CardTabsProps { quote: RelayQuote | null; accountNo: string; account: RelayAccountState | null /* cardAccountSliceOf().account — 이미 이 카드 종목·거래소로 잘린 상태 */; log: readonly StrategyLogEntry[]; status: RelayStatus; selectedOrderNo: string | null; onSelectUnfilled?: (row: RelayUnfilled | null) => void; priceOf?: (isin: string) => number | undefined; originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined; onCancelSubmitted?: (res: RelayOrderResultMsg) => void }`. 내부 `const [tab, setTab] = useState<CardTab>('info')` — **컴포넌트 state 뿐**, 공용 패널이 쓰는 `readPanelsPref/writePanelsPref`(`@/lib/trading-layout`) 를 import 하지 않는다(카드별 메모리 · 접었다 펴도 본문이 `hidden` 으로 남아 자연히 유지 — WR-02). `unfilledCount = account?.unf.length ?? 0`, `logCount = log.length`. 마크업: `@/components/ui/tabs` 의 `Tabs value={tab} onValueChange className="gap-0"` + `data-slot="card-tabs"` → `TabsList aria-label="카드 탭" className="h-auto min-w-0 gap-0.5 bg-transparent p-0 px-2 pt-1"`(스크롤 `overflow-x-auto`) → `TabsTrigger` 4개(값 info/unfilled/holdings/log · 라벨 정보/미체결/잔고/로그) 에 shared-panels `TAB_TRIGGER` 와 같은 문법의 로컬 상수 `CARD_TAB_TRIGGER` (**`h-6`** = 24px · `px-2` · `text-[11px]` · `data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--accent-fg)]` · dark 동일). 배지: 미체결·로그 트리거 안에서만 `count > 0` 일 때 `<span data-slot="card-tab-count" className="mono rounded-full bg-[color-mix(in_oklch,var(--fg)_8%,transparent)] px-1.5 text-[10px]">{count}</span>`(목업 `.ctabs .n`). 본문: `TabsContent value="info"` → `<QuoteGrid10 quote={quote}/>`; `unfilled` → `<div className="max-h-[210px] min-w-0 overflow-auto">` 안에 `<AccountPanel selectedAccountNo={accountNo} account={account} status={status} section="unfilled" embedScope="stock" embedEmptyTitle="이 종목의 미체결이 없어요" selectedOrderNo={selectedOrderNo} onSelectUnfilled={onSelectUnfilled === undefined ? undefined : (row) => onSelectUnfilled(nextUnfilledSelection(selectedOrderNo, row))} originOf priceOf onCancelSubmitted/>`; `holdings` → 같은 래퍼에 `<AccountPanel … section="holdings" embedScope="stock" embedEmptyTitle="보유 없음" priceOf/>`; `log` → 같은 래퍼에 `<StrategyLog entries={log} variant="embed" emptyTitle="로그 없음"/>`. 탭 줄 위 경계선은 `border-t border-[var(--border-subtle)]`(QuoteGrid10 자체 border-t 는 그대로). 뷰포트 브레이크포인트 클래스 금지 · 새 `@container` 선언 금지(D-28). 파일 머리 주석: 목업 ②A · 「미체결 행 선택 = 공용 패널과 같은 콜백 · 같은 상태 하나(두 진실 금지)」 · 「데이터는 슬라이스 하나 — 헤더 칩과 같은 값」 · 「`originOf`/`onCancelSubmitted` 는 작업대가 공용 패널에도 오늘 넘기지 않는다 — 카드는 같은 값을 받을 뿐 출처 판정을 지어내지 않는다」.

5. `strategy-card.tsx` — `StrategyCardProps` 에 `selectedOrderNo?: string | null; onSelectUnfilled?: (row: RelayUnfilled | null) => void; priceOf?: (isin: string) => number | undefined; originOf?; onCancelSubmitted?` 추가(문서: 「작업대 공용 패널과 **같은 선택 상태·같은 콜백** — 카드가 자체 선택 상태를 갖지 않는다(D-21)」). `useRelayContext()` 에서 Task 1 의 `accountStates` 와 함께 `status` 도 꺼낸다. 본문 L717-726 의 `<QuoteGrid10 quote={quote} />` 를 `<CardTabs quote={quote} accountNo={accountNo} account={slice.account} log={log} status={status} selectedOrderNo={selectedOrderNo ?? null} onSelectUnfilled priceOf originOf onCancelSubmitted/>` 로 교체(`CardNotices` · `body` 순서 그대로 뒤). `QuoteGrid10` import 는 `card-tabs.tsx` 로 옮긴다. 주석 ⑤에 「본문 상단은 정보 탭이 10칸을 그린다(2026-09-23 목업 ②A)」 를 반영.

6. `trading-workbench.tsx` — `WorkbenchCardItemProps` 에 `onSelectUnfilled?: (row: RelayUnfilled | null) => void; priceOf: (isin: string) => number | undefined` 추가. `renderCard`(L912-935)에서 `onSelectUnfilled={c.accountNo === accountNo ? selectUnfilled : undefined}`(**`selectedUnfilled` 를 내리는 조건과 같은 술어** — 카드 계좌가 상태줄 계좌와 다르면 폼도 선택을 못 받으므로 행 선택 UI 도 없다; 취소는 카드 계좌로 여전히 된다) · `priceOf={priceOf}` 를 넘기고, `WorkbenchCardItem` 은 `<StrategyCard … selectedOrderNo={selectedUnfilled?.orderNo ?? null} onSelectUnfilled={onSelectUnfilled} priceOf={priceOf}/>`. `selectUnfilled`(L723-737)·`liveSelected`·`SharedPanels` 호출은 손대지 않는다 — 카드 탭에서 고른 행도 `cardForUnfilled` 가 `existing` 으로 찾아 `open:true` no-op + `setScrollTarget` 을 지난다(같은 경로 1벌). 주석 ②에 「카드 안 미체결 탭도 같은 `selectUnfilled` 를 탄다 — 선택은 여전히 이 컴포넌트 하나가 소유」 한 줄.

7. 회귀: `account-panel · shared-panels · strategy-log · trading-workbench · strategy-card · card-tabs` 초록. `trading-workbench.test.tsx` 는 실물 `StrategyCard` 를 렌더하므로 새 prop 배선이 여기서 컴파일·실행된다.

8. 커밋(코드 파일만 · `.planning/` 제외 · 한글 · Co-Authored-By 없음 · push 없음): `feat(quick-260923-onn): 펼친 카드 정보|미체결|잔고|로그 탭 — AccountPanel stock 스코프 임베드 · 선택 토글 헬퍼 공유 · 작업대 배선`.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp test src/components/orderbook/__tests__/account-panel.test.tsx src/components/trading/__tests__/strategy-log.test.tsx src/components/trading/__tests__/shared-panels.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && test "$(grep -c 'export function CardTabs' webapp/src/components/trading/card/card-tabs.tsx)" -ge 1 && test "$(grep -c 'embedScope="stock"' webapp/src/components/trading/card/card-tabs.tsx)" -ge 2 && test "$(grep -c '이 종목의 미체결이 없어요' webapp/src/components/trading/card/card-tabs.tsx)" -ge 1 && test "$(grep -c '보유 없음' webapp/src/components/trading/card/card-tabs.tsx)" -ge 1 && test "$(grep -c '로그 없음' webapp/src/components/trading/card/card-tabs.tsx)" -ge 1 && test "$(grep -c 'nextUnfilledSelection' webapp/src/components/trading/card/card-tabs.tsx)" -ge 1 && test "$(grep -c 'export function nextUnfilledSelection' webapp/src/components/trading/workbench/shared-panels.tsx)" -ge 1 && test "$(grep -c 'nextUnfilledSelection' webapp/src/components/trading/workbench/shared-panels.tsx)" -ge 2 && test "$(grep -c 'embedScope' webapp/src/components/orderbook/account-panel.tsx)" -ge 3 && test "$(grep -c 'embedEmptyTitle' webapp/src/components/orderbook/account-panel.tsx)" -ge 3 && test "$(grep -c 'emptyTitle' webapp/src/components/trading/strategy-log.tsx)" -ge 2 && test "$(grep -c '<CardTabs' webapp/src/components/trading/card/strategy-card.tsx)" -ge 1 && test "$(grep -c 'onSelectUnfilled' webapp/src/components/trading/workbench/trading-workbench.tsx)" -ge 4 && test "$(grep -c 'selectedOrderNo={selectedUnfilled?.orderNo ?? null}' webapp/src/components/trading/workbench/trading-workbench.tsx)" -ge 1</automated>
  </verify>
  <done>펼친 카드 본문 상단이 정보(기존 10칸)/미체결(이 카드 행만 · 5열 · 행 선택이 작업대 `selectUnfilled` 를 탄다 · 재선택 해제는 `nextUnfilledSelection` 하나)/잔고(1행 6열 · `priceOf`)/로그(카드 로그 embed) 4탭이고, 배지·빈 문구·탭 유지가 테스트로 잠기며, 기존 AccountPanel/StrategyLog/SharedPanels 호출부 DOM 은 불변(기존 테스트 무수정 초록). typecheck + 위 6 테스트 파일 초록, 코드 커밋 1건.</done>
</task>

<task type="auto">
  <name>Task 3: 회귀 갱신 · 전량 게이트 · Playwright 작업대 spec · 최종 커밋 (ONN-D)</name>
  <files>webapp/src/components/trading/__tests__/card-header.test.tsx, webapp/src/components/trading/__tests__/strategy-card.test.tsx, webapp/src/components/trading/__tests__/latch-led.test.tsx, webapp/src/components/trading/__tests__/shared-panels.test.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <read_first>webapp/e2e/specs/trading-workbench.spec.ts:290-306 · 598-660 · 835-850 · 1113-1132 · 1161-1200, .planning/config.json(`workflow.build_command` · `workflow.test_command`), dev.sh:87</read_first>
  <precondition>Playwright 는 `webapp/.env.test.local` 의 E2E 자격(이전 quick 이 같은 spec 을 통과시켰다 — 저장소에 있다)과 빈 8090 포트(다른 relay/Playwright 프로세스 없음)를 전제한다. dev 서버는 3100 에서 재사용 또는 `webServer` 가 기동한다(`dev.sh` 기준 · 3000 가정 금지).</precondition>
  <action>
1. 전량 게이트를 **순서대로** 돌린다: config `build_command` 원문 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck`(shared `dist` 함정 — STATE.md 가 기록한 「낡은 dist 로 typecheck 통과」 회피) → `pnpm --filter @gh-radar/webapp run test`(기준선 18-36: 1472 passed / 1 skip — 이번엔 신규 케이스만큼 늘어야 하고 실패 0).

2. 깨진 기존 단언이 있으면 **새 계약으로만** 갱신한다(코드를 옛 계약으로 되돌리지 않는다). 예상 후보와 판정 기준: (a) 접힌 카드에서 LED 칩 라벨 텍스트를 기대하는 단언 → 점 변형(`data-variant="dot"` · sr-only 「{이름} 래치 {라벨}」)으로; (b) `QuoteGrid10` 이 본문 직계 자식이라고 기대하는 단언 → 「정보 탭 안에 있고 body 슬롯보다 앞」으로(현 strategy-card.test L307-321 은 `compareDocumentPosition` 라 그대로 통과할 것); (c) `SharedPanels` 스파이(trading-workbench.test L145-160)는 props 만 보므로 무관. 계획 시점 실측으로는 vitest 6파일·e2e 모두 **펼친 카드** 기준 LED 단언이라 깨질 것이 없어야 한다 — 깨졌다면 먼저 코드가 펼침 분기를 건드렸는지 의심한다.

3. Playwright 는 **작업대 spec 만**: `cd /Users/alex/repos/gh-radar/webapp && pnpm exec playwright test trading-workbench`(전량 실행 금지). 0 fail 이어야 한다. 특히 6(접힘 스택 한 칸 — 접힌 헤더가 점+칩으로 바뀌어도 l2 한 줄) · 9(`lc-quote-grid` 가 정보 탭 기본) · 10/11(펼친 카드 LED 칩 `data-tone`·라벨) · GC2(접기/펴기 후 값 유지) · GC4(미체결 선택 → 카드 펼침 + 원주문 칩). 깨진 e2e 단언은 2 와 같은 기준으로 갱신하되, 접힌 카드 LED 를 텍스트로 단언하는 케이스는 `[data-slot="latch-led"][data-variant="dot"]` 존재 + `data-tone` 으로 바꾼다.

4. `git status --short` 로 변경 파일이 `files_modified` 목록 안인지, `pnpm-lock.yaml`·`package.json` 변경이 0 인지(새 의존성 금지) 확인한다. 다른 세션의 로컬 커밋이 끼어 있으면(`git status -sb`) 그 위에 그대로 커밋한다 — rebase/reset 금지.

5. 커밋할 것이 남아 있을 때만(테스트 갱신 등) 마지막 커밋: `test(quick-260923-onn): 카드 탭·접힘 헤더 새 계약으로 회귀 단언 갱신`(코드·테스트 파일만 · `.planning/` 제외 · 한글 · Co-Authored-By 없음). **push 하지 않는다**(이 저장소에서 push = webapp 프로덕션 배포). SUMMARY 에 게이트 숫자 원문(webapp N passed / e2e N passed · 0 fail)과 갱신한 단언 목록(없으면 「0건」)을 남긴다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && git diff --quiet HEAD -- pnpm-lock.yaml package.json webapp/package.json && (cd webapp && pnpm exec playwright test trading-workbench)</automated>
  </verify>
  <done>build_command 4단 exit 0 · webapp vitest 전량 초록(실패 0) · `playwright test trading-workbench` 0 fail · 의존성 파일 변경 0 · 코드 커밋 완료(push 없음) · SUMMARY 에 게이트 원문과 갱신 단언 목록.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay wss → 브라우저 계좌 상태 | `accountStates` 는 이미 신뢰된 세션 데이터 — 카드는 그것을 자르기만 한다 |
| 사용자 클릭 → `order.cancel` 송신 | 카드 미체결 탭의 취소 버튼이 실계좌 취소를 보낸다 |
| 사용자 클릭 → `lc.arm` 송신 | 접힌 헤더 점 클릭이 래치를 켠다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-onn-01 | Tampering | card-tabs 미체결 탭 취소 버튼 | high | mitigate | 새 송신 경로 0 — `AccountPanel` 의 취소 규율(확인 다이얼로그 · `row.isin` 키 · `pendingCancelSent`/잔량 0 가드 · 결과 모름 잠금) **같은 클로저** 재사용. `selectedAccountNo` = 카드 계좌(행이 그 계좌 상태에서 왔다) |
| T-onn-02 | Spoofing | latch-led 점 변형 | high | mitigate | 색·clickable·툴팁은 `latchLedStateOf` 결과 객체 하나 — 점 분기에 조건식 재작성 0. 클릭 불가는 비상호작용 `<span>`(`onArm` 미호출), 전송 가드는 종전대로 `handleArm` 의 재판정 |
| T-onn-03 | Repudiation | 선택 상태(공용 패널 · 카드 탭) | medium | mitigate | 작업대 `selected` 하나 · 카드는 `selectedUnfilled?.orderNo` 파생만 · 토글은 `nextUnfilledSelection` 한 함수 — 두 표면이 다른 원주문을 정정 대상으로 말할 수 없다 |
| T-onn-04 | Information Disclosure | 카드 계좌 슬라이스 | medium | mitigate | 슬라이스 키는 `card.accountNo`(상태줄 계좌가 아님). 행 선택 콜백은 `card.accountNo === 상태줄 계좌` 일 때만 배선 — 다른 계좌 행이 폼 정정 대상으로 흘러들지 않는다 |
| T-onn-05 | Denial of Service | strategy-card 재렌더 | low | accept | 카드는 이미 relay 컨텍스트 소비자라 계좌 델타마다 재렌더된다. 슬라이스는 소배열 선형 필터 + `useMemo` — 예산 증가 없음(④ T-18-29) |
| T-onn-06 | Tampering | 탭 상태 저장 | low | mitigate | 컴포넌트 state 만 — 브라우저 저장 헬퍼 미사용(잠긴 결정). 새로고침하면 정보 탭 |
| T-onn-SC | Tampering | npm installs | low | accept | 새 의존성 0(Radix Tabs · Tooltip 은 이미 있다). Task 3 게이트가 `pnpm-lock.yaml`/`package.json` 변경 0 을 확인 |
</threat_model>

<verification>
- Task 1: latch-led · card-header · card-account-slice · strategy-card · strategy-card-flow · card-body vitest 초록 + typecheck + grep 게이트(점 변형 사용 · 요약 칩 슬롯 2 · 순수 함수 3 export · `latchLedStateOf` 단일 정의 · `quote-grid-10.tsx` 무변경).
- Task 2: account-panel · strategy-log · shared-panels · card-tabs · strategy-card · trading-workbench vitest 초록 + typecheck + grep 게이트(`CardTabs` export · stock 스코프 2회 · 빈 문구 3종 · 토글 헬퍼 정의 1 + 사용 · 작업대 배선).
- Task 3: config `build_command` 4단 · webapp vitest 전량 · Playwright `trading-workbench` spec 0 fail · 의존성 파일 diff 0.
- 사람 확인(선택 · SUMMARY 에 기록만): `dev.sh` 로 3100 을 띄우고 `/trading` 에서 카드 하나를 접어 점 3개 + 칩을, 펼쳐 4탭을 눈으로 본다. 목업 ①A/②A 와 대조.
</verification>

<success_criteria>
- 접힌 카드 헤더: 점 3개(24px 히트 · `latchLedStateOf` 색/클릭/툴팁) + 「미체결 N」(N>0) + 「잔고 N주」(보유 시) + ⓘ·✕. 손익 없음. 펼친 헤더 불변.
- 펼친 카드 본문 상단: 「정보 | 미체결 N | 잔고 | 로그 N」 24px 탭, 기본 정보 = 기존 10칸, 배지는 미체결·로그만(0 생략).
- 미체결 탭 = 이 카드 종목·거래소·계좌 행만 · 5열 · 행 선택이 작업대 `selectUnfilled` 를 타고 재선택은 해제 · 공용 패널과 같은 상태 하나. 잔고 탭 1행 6열(`priceOf`). 로그 탭 = 카드 `log` embed. 빈 문구 3종 원문.
- 데이터는 `accountStates` 슬라이스 하나(순수 함수 테스트) · 새 relay/REST 0 · 탭 state 는 카드 메모리 · 카드 안 뷰포트 브레이크포인트 0.
- 기존 호출부 DOM 불변(기존 테스트 무수정 초록) · build_command · webapp vitest 전량 · Playwright 작업대 spec 0 fail · 의존성 0 추가 · 코드만 커밋(한글 · Co-Authored-By 없음 · push 없음).
</success_criteria>

<output>
Create `.planning/quick/260923-onn-wb-card-tabs-summary-led-3-n-n-2026-09-2/260923-onn-SUMMARY.md` when done — 게이트 숫자 원문(webapp N passed · e2e N passed/0 fail) · 갱신한 기존 단언 목록(없으면 0건) · `originOf`/`onCancelSubmitted` 가 양쪽 표면 모두 미배선인 사실 · 커밋 해시.
</output>
