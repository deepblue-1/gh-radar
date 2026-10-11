---
phase: quick-260923-bjb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [BJB-01, BJB-02, BJB-03]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "VI 줄 「더보기」를 누르기 전에는 KRX·NXT VI 설정이 보이지 않고, 누르면 같은 테두리 패널 안에서 스트립 줄 → VI 설정 → (주문이 있을 때만) VI 발동 표 순서로 선다. 접기/펼치기 토글은 스트립 줄 버튼 하나뿐이다 (D1 · D5 · BJB-01)"
    - "폰 폭(뷰포트 390)에서 KRX·NXT 각 줄이 [거래소 태그][스위치] 상승률 [%] 금액 [만원] 한 줄이고 가로 넘침(scrollWidth > clientWidth)이 없다. 줄 옆 「가동중」·「중지」·「서버 반영 HH:MM:SS」 글자가 없고 스위치의 aria-checked·aria-label 이 상태를 말한다 (D2 · BJB-01)"
    - "작업대 본문(@container/wb) 830px 이상(뷰포트 1000 = 본문 ≈968)에서는 KRX 와 NXT 줄이 한 줄에 나란히(2열 · 세로 구분선) 서고, 830 미만에서는 위아래로 쌓인다 (D3 · BJB-01)"
    - "VI 설정을 고친 채 접었다 다시 펴도 입력값이 그대로이고, 접혀 있는 동안에도 작업대 이탈 경고의 VI 더티 합이 유지된다 — 설정 블록은 접힘 시 언마운트가 아니라 hidden 으로 숨는다 (D1 선택)"
    - "VI 몫 서버 거부 경보(role=alert · data-slot=vi-server-error)는 VI 패널이 접혀 있어도 패널 안 스트립 줄 바로 아래에 보인다 (D1 재량 — 안전 신호 가시성)"
    - "상태줄에는 DMA 점 + 「DMA {라벨}」 · 77 구간 배지(알 때만) · 알림음 아이콘 버튼(차단 시에만 「클릭해 활성화」 글자) · 반영 시각(맨 HH:MM:SS, title=서버 반영 시각, 첫 push 전 「—」) · 「다시 연결」(자동 복구 포기 시) · 단 수(폰 밴드 아님)만 있다. 돌파 n·신규·VI 발동 n·미확인·거래 종목 n·임계/재무장 문구가 없다 (D4 · BJB-02)"
    - "펼친 VI·돌파 목록에 머리줄(제목 · 개수 요약 · 「접기 ▴」)이 없고, VI 표 아래 긴 설명문이 없다. 목록이 비어 있으면 펼친 영역에 표도 빈 문구도 그리지 않는다. 접힌 줄 라벨은 「VI」·「돌파」뿐이고 VI 줄의 「미확인 n」 필만 남는다 (D5 · D6 · BJB-03)"
    - "확인 체크 · 110초 타이머 · 시작/중지 확인 다이얼로그 · vi.set 송신 · 계좌 옮기기 · 돌파 알림음/하루 1회 기록 · localStorage 키는 동작이 바뀌지 않는다 (D7)"
  artifacts:
    - path: "webapp/src/components/trading/workbench/vi-trigger-strip.tsx"
      provides: "한 테두리 VI 패널 — 스트립 줄 + 항상 보이는 alert 슬롯 + 펼침 시 settings 슬롯(hidden 토글) + 주문 있을 때만 VI 표"
      contains: "settings"
    - path: "webapp/src/components/trading/workbench/vi-settings-rows.tsx"
      provides: "거래소당 한 줄 VI 설정 격자(1열 / 본문 830 이상 2열) + ViServerErrorLine export"
      exports: ["ViSettingsRows", "ViServerErrorLine", "ViConfirmDialog", "viRowAccountOf", "viMoveTargetOf"]
    - path: "webapp/src/components/trading/workbench/workbench-status-bar.tsx"
      provides: "핵심만 남은 상태줄 (DMA · 77 배지 · 알림음 아이콘 · 반영 시각 · 다시 연결 · 단 수)"
    - path: "webapp/src/components/trading/workbench/breakout-strip.tsx"
      provides: "한 테두리 돌파 패널 — 라벨 「돌파」 · 머리줄 없는 펼친 표 · 빈 목록이면 펼친 영역 없음"
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      provides: "VI 패널 펼침 헬퍼 + 390 한 줄 · 1000 나란히 레이아웃 검증"
  key_links:
    - from: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      to: "webapp/src/components/trading/workbench/vi-trigger-strip.tsx"
      via: "ViTriggerStrip settings={<ViSettingsRows …/>} alert={<ViServerErrorLine …/>}"
      pattern: "settings=\\{"
    - from: "webapp/src/components/trading/workbench/vi-trigger-strip.tsx"
      to: "webapp/src/components/trading/workbench/vi-settings-rows.tsx"
      via: "hidden={!open} 래퍼 안에 settings 슬롯 — 접혀도 마운트 유지(onDirtyCountChange 합 유지)"
      pattern: "hidden=\\{!open\\}"
    - from: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      to: "webapp/src/components/trading/workbench/workbench-status-bar.tsx"
      via: "WorkbenchStatusBar 에 개수 props 없이 status · queuedWindow · appliedAt · cols · phoneBand · onReconnect 만"
      pattern: "<WorkbenchStatusBar"
---

<objective>
트레이딩 작업대(`/trading`) 상단을 사용자가 승인한 목업(`260923-bjb-mockup.html`) 그대로 정리한다.

1. VI 설정(KRX·NXT)을 VI 스트립 「더보기」 펼침 안으로 옮기고, 거래소당 한 줄로 줄인다(넓은 폭은 KRX | NXT 한 줄) — D1 · D2 · D3.
2. 상태줄을 핵심만 남긴다 — D4.
3. 펼친 VI·돌파 목록의 머리줄·요약·설명문·접힌 줄 개수를 지운다 — D5 · D6.

Purpose: 사용자 요청 「굳이 필요없는 설명 같은거 다 지워 — 디자인을 망침」. 표현만 바꾸고 동작(확인 체크 · 110초 · 다이얼로그 · relay 메시지 · localStorage)은 그대로 둔다 — D7.
Output: 수정된 6개 컴포넌트, 갱신된 5개 단위 테스트, 갱신된 작업대 e2e 스펙(390 한 줄 · 1000 나란히 검증 포함).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260923-bjb-workbench-top-cleanup/260923-bjb-mockup.html
@webapp/src/styles/globals.css
@webapp/src/components/trading/workbench/trading-workbench.tsx
@webapp/src/components/trading/workbench/vi-trigger-strip.tsx
@webapp/src/components/trading/workbench/vi-settings-rows.tsx
@webapp/src/components/trading/workbench/workbench-status-bar.tsx
@webapp/src/components/trading/workbench/breakout-strip.tsx
@webapp/src/components/trading/vi-order-list.tsx

<interfaces>
<!-- 실행자가 코드베이스를 뒤질 필요 없도록 뽑아 둔 현재 계약. -->

trading-workbench.tsx 조립(현재 ~L764-817): 제목줄(workbench-title) → WorkbenchStatusBar → ViSettingsRows(단독) → ViTriggerStrip → BreakoutStrip(onCountsChange=setBreakoutCounts) → StockAddBar → CardGrid → SharedPanels.
  - L121 isUnconfirmedViOrder import · L719 breakoutCounts state · L720 viUnconfirmed useMemo — 상태줄 개수 공급 전용.
  - L546 viDirty state ← ViSettingsRows onDirtyCountChange (이탈 경고 게이트). 유지해야 한다.
  - L723 viServerError = useViServerError(messages) → 지금은 ViSettingsRows serverError prop.
  - WB_PHONE_BAND_BELOW / phoneBand: ResizeObserver 로 wb 폭 판정.

ViTriggerStripProps(현재): items, disabled?, nowMs?, className?. 내부 open state(로컬, localStorage 없음), tableId=useId(), 버튼 data-slot="vi-strip-more"(aria-expanded, aria-controls), 라벨 data-testid="vi-strip-label", 필 data-slot="vi-unconfirmed-pill", 칩 줄 data-slot="vi-chips"(role=group tabIndex=0), 펼침 section data-slot="vi-trigger-table" aria-label="VI 발동 주문" 안에 머리줄 + ViOrderList variant="workbench".

ViSettingsRowsProps(현재): viTriggers, accountNo, accountName?, disabled?, viOrders?, onSent?, onDirtyCountChange?, serverError?, className?. section data-slot="vi-settings-rows" (flex-col) → 거래소별 ViSettingsRow: 블록 data-slot="vi-settings-block" → 줄 data-slot="vi-settings-row" data-exchange data-run (자체 카드 테두리 · 머리 span 이 폰 밴드에서 100% basis) → 부가 줄(vi-amount-limit · vi-row-error · vi-row-account-box/vi-row-move · vi-row-echo) → ViConfirmDialog(포털). RowField 입력 상자 폭 = 80px(@700 이상 92px). RowSwitch 44×26, aria-label `VI {EX} 중지|시작`, aria-checked. 행 로컬 appliedAt state + clockNow() 는 「서버 반영」 표시 전용.

WorkbenchStatusBarProps(현재): status, statusLabel, breakoutCount, breakoutNewCount, viCount, viUnconfirmedCount, cardCount, queuedWindow, appliedAt, cols, onColsChange, phoneBand, onReconnect?, className?. testid: stat-breakout · stat-vi · stat-cards · stat-applied. NewPill 함수 · 상수 WORKBENCH_THRESHOLD_TEXT · ToneToggle(ALERT_BTN, 텍스트 「알림음」/「클릭해 활성화」).

BreakoutStripProps(현재): items, snapSeq, cards, onAddCard, onFocusCard, onDismiss?, onCountsChange?, className?. 라벨 data-testid="breakout-strip-label" 「돌파 {rows.length}」 + 신규 필 data-slot="breakout-new-pill". 펼침 section data-slot="breakout-table" aria-label="돌파감지 목록" 안에 머리줄(data-slot="breakout-table-summary") + 빈 문구 또는 BreakoutTable. 칩 data-slot="breakout-chip" data-new / data-trading.

vi-order-list.tsx WorkbenchViTable: 빈 목록이면 p data-slot="vi-order-empty", 아니면 Table data-slot="vi-order-table"; 끝에 p data-slot="vi-order-caption" (상수 VI_WORKBENCH_TABLE_CAPTION, 다른 소비처 없음 — 테스트만).

컨테이너 쿼리 문법(repo 기존 사용): `@min-[700px]/wb:` · `@min-[830px]/wb:` · `not-first:`. 경계 정본은 globals.css §2.2b. 뷰포트 1000 = 사이드바 없음 → 본문 ≈968(와이드 밴드), 뷰포트 390 → 본문 ≈358.

e2e 헬퍼(trading-workbench.spec.ts): PHONE_VIEWPORT {390,844} · statusBar(page) · viRow(page, ex) · viTable(page) · openViTable(page)(L172: vi-strip-more 클릭 후 vi-trigger-table visible 기대) · scrollOverflowing / leavesOverflowing(e2e/overflow.ts) · field(page,id).
</interfaces>
</context>

<!-- planner-discipline-allow: VI_WORKBENCH_TABLE_CAPTION -->
<!-- planner-discipline-allow: flex-[1_1_100%] -->
<!-- planner-discipline-allow: WORKBENCH_THRESHOLD_TEXT -->
<!-- planner-discipline-allow: onCountsChange -->
<!-- planner-discipline-allow: breakoutNewCount -->
<!-- planner-discipline-allow: viUnconfirmedCount -->
<!-- planner-discipline-allow: breakoutCounts -->
<!-- planner-discipline-allow: stat-breakout -->
<!-- planner-discipline-allow: stat-cards -->
<!-- planner-discipline-allow: vi-order-caption -->

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): VI 한 패널 — 스트립 줄 · 펼침 안 한 줄 VI 설정 · 머리줄/설명문 제거, 작업대 배선까지 (D1 · D2 · D3 · D5 · D6-VI)</name>
  <files>webapp/src/components/trading/workbench/vi-trigger-strip.tsx, webapp/src/components/trading/workbench/vi-settings-rows.tsx, webapp/src/components/trading/vi-order-list.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx, webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx</files>
  <behavior>
    - vi-trigger-strip: 라벨 data-testid="vi-strip-label" 의 textContent 가 정확히 「VI」(개수 없음). 미확인 1건이면 「미확인 1」 필은 그대로.
    - vi-trigger-strip: 접힌 상태에서 settings 슬롯 노드가 DOM 에 있지만 `closest('[hidden]')` 이 null 이 아니다. 「더보기」 클릭 후 null. 다시 「접기」 해도 같은 DOM 노드(언마운트 없음)이고, 슬롯 안 input 에 넣어 둔 값이 남는다.
    - vi-trigger-strip: alert 슬롯은 접힌 상태에서도 보인다(`closest('[hidden]')` null).
    - vi-trigger-strip: 주문 2건 펼침 → vi-order-table 이 있고, 「VI 발동 주문」 글자 · 「양 거래소 한 목록」 요약 · 「접기 ▴」 버튼 · ConfirmVIOrderReq 설명문이 모두 없다. 체크박스 aria-label(「… 주문 확인 — 119초 미확인 취소 면제」)은 남는다. 스트립 버튼 「접기」 클릭 → vi-trigger-table 사라짐.
    - vi-trigger-strip: 주문 0건 펼침 → vi-trigger-table · vi-order-table · vi-order-empty 모두 없음(스트립 줄의 「오늘 발동된 VI 주문이 없어요」만). 더보기 버튼 aria-controls 가 가리키는 id 의 요소가 존재한다.
    - vi-settings-rows: 가동 줄에 「가동중」·「서버 반영 …」 글자가 없고 스위치 aria-checked=true · aria-label 「VI KRX 중지」 · 줄 data-run="true". 중지 줄에 「중지」 텍스트 노드가 없고 스위치 aria-checked=false · 「VI NXT 시작」.
    - vi-settings-rows: 상승률 입력 상자 64px(w-16) · 금액 입력 상자 92px 클래스, 줄에 폰 밴드 100% basis 머리 클래스 없음, 섹션이 1열 격자 + 본문 830 이상 2열 클래스를 가진다.
    - vi-settings-rows: ViServerErrorLine — error=null 이면 아무것도 그리지 않고, 값이 있으면 role="alert" · data-slot="vi-server-error" · 출처 배지(VITrigger→「[VI]」, SetVITrigger→「[서버]」) + 원문.
    - trading-workbench: 조립 순서 = 제목줄 → 상태줄 → vi-trigger-strip → vi-settings-rows → vi-trigger-table → breakout-strip → breakout-table → stock-add-bar → card-grid-empty → shared-panels, 그리고 vi-settings-rows 가 slot('vi-trigger') 안에 있다. 펼치기 전 vi-settings-rows 는 hidden 조상 아래.
    - trading-workbench: VI 몫 ERROR 가 오면 vi-server-error 가 slot('vi-trigger') 안에 있고, VI 패널이 접혀 있어도 hidden 조상이 없다. 상따 몫·relay 자기 거부는 여전히 안 선다.
    - trading-workbench: VI 설정 입력을 더티로 만든 뒤 VI 패널을 접어도 이탈 경고 게이트가 쓰는 VI 더티 합이 유지된다(기존 이탈 경고 테스트가 있으면 그 경로로, 없으면 입력값이 접었다 편 뒤 남는지로 확인).
  </behavior>
  <action>
UI 결정 정본은 목업 `260923-bjb-mockup.html` 의 `.panel` · `.strip` · `.visets` · `.virow` 다. 동작 코드(송신·확인·타이머·다이얼로그·계좌 판정)는 건드리지 않는다(D7).

A. vi-trigger-strip.tsx (D1 · D5 · D6)
- 바깥 `data-slot="vi-trigger"` div 를 목업 `.panel` 로 바꾼다: 한 개의 테두리 패널(`min-w-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)]`), 자식 사이 gap 없음. 스트립 줄 section(`data-slot="vi-trigger-strip"`, aria-label="VI 발동" 유지)에서는 자체 테두리·둥근모서리·배경을 뺀다(패딩 px-2.5 py-2 · flex 배치는 유지).
- props 에 `settings?: ReactNode`(펼침 안 설정 블록)와 `alert?: ReactNode`(항상 보이는 경보) 슬롯을 추가한다. 헤더 주석(① ~ ⑤)을 새 구조로 고쳐 쓴다 — 머리줄이 없어졌고 토글은 스트립 버튼 하나라는 점, settings 는 hidden 으로 숨겨 마운트를 유지한다는 점(더티 입력·이탈 경고 합 보존), alert 는 접혀도 보인다는 점.
- 라벨: `vi-strip-label` 안의 개수 small 요소를 지워 「VI」만 남긴다. 「미확인 n」 필(`vi-unconfirmed-pill`)은 그대로(119초 자동취소 안전 신호).
- 스트립 줄 바로 다음에 `{alert}` 를 그대로 렌더한다(래퍼 없음 — 널이면 아무 흔적 없음).
- 그 다음 펼침 본문 div 하나: `id` = 기존 useId 값, `data-slot="vi-trigger-body"`, `hidden={!open}`. 이 div 에는 display 계열 유틸 클래스(flex/grid/block)를 붙이지 않는다 — hidden 속성이 이기게. 안에는 (1) settings 가 있으면 `data-slot="vi-trigger-settings"` 래퍼(`border-t border-[var(--border)] px-2.5 py-2`)로 감싼 settings, (2) `open && items.length > 0` 일 때만 section `data-slot="vi-trigger-table"` aria-label="VI 발동 주문"(`min-w-0 border-t border-[var(--border)]`) 안에 기존 ViOrderList variant="workbench" 를 그대로. 머리줄 div(제목 「VI 발동 주문」 span · 「VI n · 미확인 n · 양 거래소 한 목록 · 최신 위」 요약 · 「접기 ▴」 버튼)는 통째로 지운다.
- 「더보기/접기」 버튼의 aria-controls 는 항상 존재하는 펼침 본문 id 를 가리킨다. open state 는 컴포넌트 로컬 그대로(localStorage 키 신설 금지).

B. vi-settings-rows.tsx (D2 · D3)
- 섹션 `vi-settings-rows` 를 격자로: `grid min-w-0 grid-cols-1 gap-1.5 @min-[830px]/wb:grid-cols-2 @min-[830px]/wb:gap-x-4`. 각 `vi-settings-block` 에 두 번째 열 구분선: `@min-[830px]/wb:not-first:border-l @min-[830px]/wb:not-first:border-[var(--border)] @min-[830px]/wb:not-first:pl-4`.
- 줄 `vi-settings-row`: 자체 카드 스타일(rounded · border · bg-card · px-2.5 py-1.5)을 지우고 `flex min-w-0 flex-wrap items-center gap-2` 로. flex-wrap 은 더티일 때 줄 끝 「수정」이 들어갈 자리가 없을 때만 접히라고 남긴다. data-slot · data-exchange · data-run 속성은 유지.
- 머리 span(태그+스위치를 감싸고 폰 밴드에서 `flex-[1_1_100%]` 로 한 줄을 통째로 쓰게 하던 것)을 없애고 ExchangeTag(size="md") · RowSwitch 를 줄의 직접 자식으로 둔다. 스위치 옆 run 분기 표시(가동 글자 + 서버 반영 시각 / 중지 글자)를 통째로 지운다 — 스위치 색·위치와 aria-checked · aria-label 이 상태를 말한다.
- 그 결과 표시 전용이 된 행 로컬 `appliedAt` state · 에코 이펙트의 `setAppliedAt(clockNow())` 호출 · 이 파일의 `clockNow` 헬퍼를 지운다(다른 사용처 없음 — grep 로 확인). 에코 이펙트의 나머지(unlock · setRowError · 기준선 갱신 · 덮어쓰기 고지)는 한 줄도 바꾸지 않는다.
- RowField 에 입력 상자 폭 클래스를 받는 prop(예: `boxClassName`)을 추가하고 기존 `w-20 @min-[700px]/wb:w-[92px]` 를 지운다. 상승률 = `w-16`(64px), 금액 = `w-[92px]`. 높이 h-7(28px) 유지. 라벨·단위·더티 표시(● · primary 테두리)는 그대로.
- 부가 줄(vi-amount-limit · vi-row-error · vi-row-account-box + vi-row-move · vi-row-echo)의 내용·조건·role 은 그대로 두고, 줄이 더 이상 자체 좌우 패딩을 갖지 않으므로 각 부가 줄의 `px-2.5` 만 지워 줄 시작선에 맞춘다.
- 서버 거부 경보 `<p role="alert" data-slot="vi-server-error">`(출처 배지 span data-slot="vi-server-error-src" = serverMsgBadge(src) + 원문)를 `export function ViServerErrorLine({ error, className })` 로 뽑는다 — error 가 null 이면 null 반환, 기본 클래스 `m-0 min-w-0 text-[11px] break-keep text-[var(--destructive)]` + className. ViSettingsRows 의 `serverError` prop 과 그 렌더는 지운다(경보 자리는 작업대가 VI 패널 alert 슬롯으로 정한다 — 아래 D).
- 헤더 주석 ①(줄 구성)과 ⑧(색 규칙의 「가동중」 글자 언급)을 새 모양에 맞게 고친다: 거래소당 한 줄 = 태그 · 스위치 · 상승률 · 금액 · (더티) 수정, 본문 830 이상 2열, 가동 상태는 스위치(`--up` 채움)가 말함.

C. vi-order-list.tsx (D5)
- WorkbenchViTable 끝의 설명 캡션 p 와 상수 `VI_WORKBENCH_TABLE_CAPTION` 을 지운다. `panel` 변형 · 빈 목록 분기 · 체크박스 aria-label · 잠금 사유 sr-only 는 그대로. ViOrderListProps 의 variant 주석에서 캡션 언급이 있으면 지운다.

D. trading-workbench.tsx (D1 배선)
- 단독 `<ViSettingsRows …/>`(「3 · VI 설정 2줄」 블록)를 지우고, `<ViTriggerStrip>` 에 `settings={<ViSettingsRows viTriggers accountNo accountName disabled={status !== "ready"} viOrders onDirtyCountChange={setViDirty} />}` 와 `alert={<ViServerErrorLine error={viServerError} className="px-2.5 pb-2" />}` 를 넘긴다(import 추가). 조립 주석 번호를 새 순서(제목 → 상태줄 → VI 패널(스트립 · 펼침 안 설정 · 표) → 돌파 → …)로 고친다. 상태줄·돌파 관련 코드는 이 태스크에서 건드리지 않는다(Task 2 몫).

E. 테스트 갱신 — 로직 테스트는 지우지 말고 제거된 글자·자리만 바꾼다.
- vi-trigger-strip.test.tsx: `VI_WORKBENCH_TABLE_CAPTION` import 를 뺀다. 라벨 기대값(`/^VI\s*0$/` · `/^VI\s*2/` · `/^VI\s*1$/` · `/^VI\s*3$/`)을 정확히 「VI」로 바꾸고, 개수는 이미 옆에서 세는 vi-chip 수로 증명한다. 「더보기 → 헤더 + 요약 + 접기 ▴ · 캡션」 테스트를 behavior 목록대로(머리줄·요약·접기 ▴·ConfirmVIOrderReq 글자 없음, 스트립 「접기」로 닫힘) 다시 쓴다. 「더보기 표도 같은 빈 문구」 테스트를 「0건 펼침 → 표·빈 문구 없음」으로 바꾼다. settings/alert 슬롯 테스트(behavior 2·3번)를 새로 추가한다.
- vi-settings-rows.test.tsx: 「가동 중이면 가동중 + 서버 반영 {시각}, 아니면 중지」(~L109) 와 L216 · L229-231 의 글자 기대를 behavior 대로 data-run · 스위치 aria-checked/aria-label · 「가동중」/「서버 반영」/「중지」 텍스트 부재로 바꾼다(다이얼로그의 「중지」 버튼 기대는 건드리지 않는다). serverError 테스트(~L500-515)는 ViServerErrorLine 을 직접 렌더해 같은 단언(role=alert · [VI] · [서버] · 원문)을 유지하고, null 이면 아무것도 없다를 추가한다. 레이아웃 클래스 단언(behavior 7번)을 추가한다.
- trading-workbench.test.tsx: 조립 순서 테스트(~L256)를 behavior 대로 바꾼다 — 표 두 개가 실제로 서도록 이 테스트의 mockRelay 에 완전한 VI 주문 1건과 돌파 항목 1건(`rc()`)을 넣는다(VI 주문 필드는 vi-trigger-strip.test 의 item() 헬퍼 모양을 참고해 triggerPrice · basePrice · orderPrice · orderQty · deadline110Ms 까지 채운다). 「VI 두 줄 아래 role=alert」 테스트(~L1017)의 위치 단언을 `slot('vi-trigger')` 포함 + hidden 조상 없음으로 바꾼다. 상태줄 개수 관련 테스트(stat-cards · 상태줄 카운터)는 Task 2 에서 다룬다 — 여기서는 건드리지 않는다.
- 이 태스크에서 새로 쓰는 주석·테스트 설명에 지운 상수·클래스 이름을 이력 메모로 남기지 않는다(negative grep 게이트).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/vi-trigger-strip.test.tsx src/components/trading/__tests__/vi-settings-rows.test.tsx src/components/trading/__tests__/vi-order-list.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && ! grep -rn 'VI_WORKBENCH_TABLE_CAPTION' webapp/src && ! grep -nF 'flex-[1_1_100%]' webapp/src/components/trading/workbench/vi-settings-rows.tsx</automated>
  </verify>
  <done>VI 설정이 VI 패널 펼침 안(hidden 토글 · 마운트 유지)에 거래소당 한 줄로 서고, 본문 830 이상 2열 클래스가 있고, 펼친 VI 목록에 머리줄·설명문이 없고 빈 목록이면 표가 없으며, VI 서버 거부 경보는 접혀도 보인다. 4개 테스트 파일 green, typecheck green, negative grep 2개 통과. 커밋 1개(명시 경로만 스테이징).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 상태줄 핵심만 + 돌파 패널 머리줄/개수 제거 + 작업대 개수 배선 정리 (D4 · D5-돌파 · D6-돌파)</name>
  <files>webapp/src/components/trading/workbench/workbench-status-bar.tsx, webapp/src/components/trading/workbench/breakout-strip.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx, webapp/src/components/trading/__tests__/breakout-strip.test.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx</files>
  <behavior>
    - status bar: 텍스트에 「돌파」·「VI 발동」·「거래 종목」·「임계」·「재무장」·「신규」·「미확인」이 없다. DMA 라벨 · 77 배지(queuedWindow 있을 때만) · 단 수(phoneBand false/null 규칙 그대로) · 「다시 연결」(onReconnect 있을 때만)은 기존 단언 그대로 통과.
    - status bar: stat-applied 의 보이는 글자는 맨 시각(첫 push 전 「—」), title="서버 반영 시각", textContent 는 sr-only 접두 덕에 「반영 —」/「반영 HH:MM:SS」 그대로.
    - status bar: 알림음 토글 기본 상태의 textContent 가 빈 문자열(아이콘만)이고 aria-label/title 「돌파 알림음 켜기 (이 기기만)」 · aria-pressed 유지. 차단(needsGesture) 상태에서만 「클릭해 활성화」 글자가 보이고 클릭은 resume 만(기존 테스트 유지).
    - breakout: 라벨 textContent 가 정확히 「돌파」, breakout-new-pill 이 어떤 상태에서도 없다. 신규 행 수는 `breakout-chip[data-new="true"]` 수로, 행 수는 breakout-chip 수로 기존 시나리오(이탈 삭제 · 사용자 삭제 · 78 무음 · 재돌파 복귀) 단언을 그대로 유지한다.
    - breakout: 행 2개 펼침 → breakout-table 안에 breakout-rows 표가 있고 breakout-table-summary 슬롯 · 「임계 20% · 최신 위」 글자 · 「접기 ▴」 버튼이 없다. 스트립 「접기」로 닫힌다. 행 0개 펼침 → breakout-table 없음, 그리고 더보기 버튼에 aria-controls 가 없다(가리킬 요소가 없을 때). 행이 있고 펼쳤을 때 aria-controls = breakout-table id.
    - trading-workbench: 상태줄에 개수가 없고, 스트립 라벨은 「돌파」·「VI」, 돌파 칩 2개 · VI 칩 1개 · 「미확인 1」 필(기존 「상태줄 카운터」 테스트를 이 내용으로 대체). 카드 0장/1장 테스트는 빈 격자 문구 · cardsInDom() 수로만 증명한다.
  </behavior>
  <action>
A. workbench-status-bar.tsx (D4)
- props 에서 breakoutCount · breakoutNewCount · viCount · viUnconfirmedCount · cardCount 를 지우고, 그 렌더(돌파 n + 신규 필 span, VI 발동 n + 미확인 필 span, 거래 종목 span, 임계·재무장 문구 span)와 상수 `WORKBENCH_THRESHOLD_TEXT`, 이제 안 쓰는 `NewPill` 을 지운다.
- 남기는 것: DMA 점 + 「DMA {라벨}」(aria-live="polite" 그대로) · 77 구간 배지(queuedWindowBadgeOf, undefined 면 없음) · 오른쪽 묶음 = 알림음 토글(workbench-alerts) · 「다시 연결」(onReconnect 있을 때) · 반영 시각 · 단 수 세그먼트(폰 밴드 규칙 그대로). 목업 `.stat` 순서: 오른쪽은 아이콘 → 시각 → 단 수. 줄은 flex-wrap 을 유지하되 폰 폭에서 한 줄이면 충분하다.
- 반영 시각 span(data-testid="stat-applied", mono, whitespace-nowrap): 보이는 글자는 `appliedAt ?? "—"` 만, `title="서버 반영 시각"`, 앞에 `<span className="sr-only">반영 </span>` 을 둬 스크린리더·textContent 는 「반영 …」을 유지한다(generic span 에 aria-label 을 쓰지 않는다 — axe prohibited-attr).
- ToneToggle: 아이콘 전용 버튼으로. 기본은 Volume2/VolumeX 아이콘만(텍스트 「알림음」 삭제), 크기 목업 `.iconbtn`(대략 h-6 · min-w-[26px] · justify-center). needsGesture 일 때만 아이콘 옆 「클릭해 활성화」 글자(실행 가능한 안내라 허용 — D4). aria-label · title · aria-pressed · 클릭 로직(켜기/활성화/끄기)은 그대로.
- 파일 헤더 주석 ①(「페이지 전체(돌파 · VI 발동 · 거래 종목 · …)」)을 새 구성으로 고친다. 지운 상수 이름을 이력으로 남기지 않는다.

B. breakout-strip.tsx (D5 · D6)
- 바깥 `data-slot="breakout"` div 를 VI 와 같은 한 테두리 패널로(`min-w-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)]`), 스트립 section(`breakout-strip`, aria-label="돌파감지" 유지)은 자체 테두리·배경을 뺀다.
- 라벨 `breakout-strip-label` 은 「돌파」만(개수 small 삭제), 신규 필 span(`breakout-new-pill`) 삭제. 칩 안의 「신규」 배지(`breakout-new-badge`)와 표 행의 신규 배지·강조는 그대로 둔다(색만으로 말하지 않는 규칙 — D6 범위는 라벨 필뿐).
- 펼침: `open && views.length > 0` 일 때만 section `id={tableId}` `data-slot="breakout-table"` aria-label="돌파감지 목록" `className="min-w-0 border-t border-[var(--border)]"` 안에 BreakoutTable. 머리줄(「돌파감지」 · breakout-table-summary 요약 · 「접기 ▴」)과 빈 목록 p 를 지운다. 더보기 버튼 aria-controls 는 표가 렌더될 때만 tableId, 아니면 undefined(없는 id 를 가리키지 않게 — axe aria-valid-attr-value).
- 작업대 외 소비처가 없으므로 개수 보고 콜백 prop(`onCountsChange`), 그 useEffect, 이제 안 쓰는 `newCount` 파생을 지운다. 헤더 주석에서 「상태줄 돌파 N · 신규 M」 언급을 고친다. 알림음·강조 tick·이탈 삭제 로직(①~⑦)은 건드리지 않는다.

C. trading-workbench.tsx (D4 배선)
- WorkbenchStatusBar 호출에서 개수 props 5개를 지운다. 상태줄 공급 전용이던 `breakoutCounts` state · `viUnconfirmed` useMemo · `isUnconfirmedViOrder` import(파일 내 다른 사용처가 없으면)를 지우고, BreakoutStrip 의 개수 콜백 prop 전달을 지운다. useMemo 등 다른 import 는 여전히 쓰이는지 확인만 한다.

D. 테스트 갱신 — 로직 단언의 강도를 유지한 채 증명 경로만 바꾼다.
- workbench-status-bar.test.tsx: props 헬퍼에서 개수 필드 5개 삭제. 개수·필·임계 문구 단언(~L83-91, L125-148)을 behavior 대로 「부재」 단언으로 바꾸고, stat-applied 는 textContent 「반영 —」 유지 + title 단언 추가 + 보이는 글자 확인(sr-only 제외한 텍스트가 「—」). 알림음 아이콘 전용 단언 추가.
- breakout-strip.test.tsx: 라벨 개수 단언(~L148, 335, 437, 446, 458, 460)은 `document.querySelectorAll('[data-slot="breakout-chip"]').length` 로, 신규 필 단언(~L150, 163, 176, 447, 461)은 `[data-slot="breakout-chip"][data-new="true"]` 수로 바꾸고 라벨이 정확히 「돌파」임을 한 번 단언한다. 표 요약 단언(~L451)은 behavior 대로 머리줄 부재 + 표 행 수로 바꾼다. 0행 펼침 · aria-controls 테스트를 추가한다.
- trading-workbench.test.tsx: 「카드 0장 … 상태줄 거래 종목은 0」(~L288) · 「돌파 칩 클릭 → 카드 1장」(~L306) 의 stat-cards 단언을 지우고 이름에서 상태줄 언급을 뺀다(카드 수는 이미 cardsInDom() 으로 증명). 「상태줄 카운터」 describe(~L790-803)를 behavior 마지막 항목 내용으로 대체한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/workbench-status-bar.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/vi-trigger-strip.test.tsx src/components/trading/__tests__/vi-settings-rows.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/trading/workbench/workbench-status-bar.tsx src/components/trading/workbench/breakout-strip.tsx src/components/trading/workbench/trading-workbench.tsx src/components/trading/workbench/vi-trigger-strip.tsx src/components/trading/workbench/vi-settings-rows.tsx src/components/trading/vi-order-list.tsx && ! grep -rnE 'WORKBENCH_THRESHOLD_TEXT|onCountsChange|breakoutNewCount|viUnconfirmedCount|breakoutCounts' webapp/src</automated>
  </verify>
  <done>상태줄이 목업 ② 구성만 말하고(개수·임계 문구 없음, 알림음 아이콘 전용, 반영 시각 맨 HH:MM:SS + title), 돌파 패널이 한 테두리 · 라벨 「돌파」 · 머리줄 없는 펼친 표 · 빈 목록이면 펼친 영역 없음. 6개 소스 eslint clean, 5개 테스트 파일 green, typecheck green, negative grep 통과. 커밋 1개(명시 경로만 스테이징).</done>
</task>

<task type="auto">
  <name>Task 3: e2e 스펙 갱신 + 390 한 줄 · 1000 나란히 실브라우저 레이아웃 검증 (D1 · D2 · D3 · D4 · D5 확인)</name>
  <files>webapp/e2e/specs/trading-workbench.spec.ts</files>
  <action>
dev 서버는 :3100(dev.sh · playwright webServer 가 띄우거나 재사용 — 3000 가정 금지), relay 는 spec 픽스처가 8090 에 띄운다.

A. 헬퍼 (L125-176 부근)
- `openViPanel(page)` 추가: `[data-slot="vi-strip-more"]` 의 aria-expanded 가 "true" 가 아닐 때만 클릭하고, `[data-slot="vi-settings-rows"]` 가 visible 이 될 때까지 기다린다(멱등 — 이미 열려 있으면 다시 눌러 닫지 않는다).
- `openViTable(page)` 은 openViPanel 을 부른 뒤 `vi-trigger-table` visible 을 기대하도록 바꾼다.

B. VI 설정을 만지는 테스트 — 설정은 이제 VI 패널을 펼쳐야 보인다(getByRole 은 hidden 요소를 못 찾는다).
- 「20.」~「23.」 등 viRow · `field(page, 'vi-krx-*'|'vi-nxt-*')` · VI 스위치를 쓰는 모든 테스트에서 waitForReady 직후 `await openViPanel(page)` 를 넣는다(파일 전체에서 viRow( 와 'vi-krx- / 'vi-nxt- 사용처를 grep 해 빠짐없이). 테스트 19(게이트 — `#vi-krx-amount` count 0)는 그대로.
- 20: 줄의 「중지」 글자 단언을 지운다(data-run="false" · 스위치 aria-checked=false 단언이 이미 있다). 상태줄 VI 발동 개수 단언은 `page.locator('[data-slot="vi-chip"]')` count 0 으로 바꾼다.
- 21: 줄의 「서버 반영 HH:MM:SS」 단언을 지우고 에코 후 `viRow(page)` data-run="true" 유지 단언으로 바꾼다(run 유지가 이 테스트의 요지).
- 22: 줄의 「가동중」 글자 단언을 지운다(data-run · 스위치 「VI KRX 중지」 aria-checked 단언이 이미 있다).
- 23: 상태줄 VI 발동 개수 대기를 `vi-chip` count = VI_ORDERS.length (timeout 15s) 대기로 바꾼다.
- 24: 설명 캡션 단언 2개를 지우고, 대신 VI 패널이 「양 거래소 한 목록」 · 「ConfirmVIOrderReq」 글자를 포함하지 않음을 단언한다. 테스트 이름의 「· 캡션」을 뺀다.

C. 상태줄 개수 단언
- 돌파 칩 → 카드 테스트(~L376 · L404)의 상태줄 돌파/거래 종목 개수 단언을 지운다(칩 count · cards(page) count 가 이미 같은 사실을 증명). 대신 그 테스트 끝에 `statusBar(page)` 가 「돌파」 · 「거래 종목」 · 「임계」 글자를 포함하지 않음을 한 번 단언한다.
- 테스트 12(~L1077)의 stat-applied 정규식(`^반영 \d{2}:\d{2}:\d{2}$`)은 sr-only 접두 덕에 그대로 통과해야 한다 — 그대로 두고 `toHaveAttribute('title', '서버 반영 시각')` 한 줄을 더한다.

D. 레이아웃 검증 (사용자 요구: 390 · ~1000 에서 VI 줄 한 줄, scrollWidth > clientWidth 없음)
- 테스트 28(폰 390)의 기존 vi-settings-rows 넘침 검사(scrollOverflowing · leavesOverflowing) 뒤에: KRX · NXT 각 viRow 의 boundingBox 높이가 40 미만(한 줄 — 입력 28 · 스위치 26, 두 줄이면 56 이상), NXT 줄 top ≥ KRX 줄 bottom(쌓임) 단언을 더한다. 테스트 맨 끝에 `vi-krx-rate` 에 25 를 채워 더티로 만든 뒤 vi-row-fix 가 보이고 `scrollOverflowing(page, '[data-slot="vi-settings-rows"]')` 가 여전히 빈 배열임을 단언한다(수정 버튼은 접혀도 넘치지 않는다 — D2).
- 새 테스트 「28b. 와이드 본문(뷰포트 1000 · 본문 ≈968) — VI KRX | NXT 한 줄 나란히 · 상태줄 핵심만 · 펼친 목록 머리줄 없음」: setViewportSize({width:1000,height:800}) → seedViTrigger(VI_CFG) → goto → waitForReady → openViPanel. KRX·NXT viRow top 차이 ≤ 2px, 각 높이 < 40, NXT 줄 x > KRX 줄 x, `scrollOverflowing(page, '[data-slot="vi-settings-rows"]')` 빈 배열. 추가로 `vi-strip-label` 텍스트 「VI」, `breakout-strip-label` 텍스트 「돌파」, statusBar 가 「VI 발동」 · 「거래 종목」 · 「임계」를 포함하지 않음. 테스트 28 과 같은 describe/픽스처 안에 둔다.

E. 실행 · 시각 확인
- `pnpm --filter @gh-radar/webapp exec playwright test trading-workbench a11y` 를 실행해 failed 0 을 확인한다. a11y 스펙은 VI 패널을 펼친 뒤 axe 를 돌리므로 설정 줄·아이콘 버튼도 스캔된다 — 이번 변경 때문에 실패하면 원인을 고치고(스펙이 아니라 컴포넌트를 고치는 것이 우선), 무관한 선재 실패면 원문과 근거를 SUMMARY 에 적는다. 이 경우에만 a11y.spec.ts 를 수정 대상에 추가한다.
- 시각 확인: 뷰포트 390 과 1000 에서 VI 패널 · 돌파 패널을 펼친 작업대 상단(제목줄 ~ 종목 추가란)을 라이트·다크 각각 스크린샷으로 찍어 OS 임시 디렉터리에 저장하고(커밋하지 않는다) Read 로 열어 목업 `260923-bjb-mockup.html` 과 대조한다 — 줄바꿈 · 잘림 · 겹침이 보이면 컴포넌트에서 바로 고치고(범위 안 시각 결함 — D7) SUMMARY 에 한 줄로 적는다. 스크린샷 경로와 관찰 결과를 SUMMARY 에 남긴다.

F. 커밋 규율 (전 태스크 공통)
- 작업 트리에 이 작업과 무관한 미커밋 변경(.planning/config.json · .planning/state.json · phase 18 UAT/VERIFICATION 파일 · 다른 quick 디렉터리)이 있다. 스테이징은 매번 이 플랜의 files_modified 중 실제로 바꾼 파일을 경로로 명시해서만 한다(전체 추가 명령 금지). 커밋 직전 git status 로 스테이징 목록을 재확인한다(동시 세션 경합).
- 커밋 메시지는 한글, `feat(quick-260923-bjb): …` / `test(quick-260923-bjb): …` 형식, Co-Authored-By 줄을 넣지 않는다(사용자 전역 규칙). push 하지 않는다 — push 가 곧 webapp 프로덕션 배포이므로 오케스트레이터/사용자 몫이다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && ! grep -nE 'stat-(breakout|vi|cards)|vi-order-caption' webapp/e2e/specs/trading-workbench.spec.ts && pnpm --filter @gh-radar/webapp exec playwright test trading-workbench a11y</automated>
  </verify>
  <done>trading-workbench · a11y e2e failed 0. 390 에서 KRX·NXT 줄이 각각 한 줄(높이 < 40)로 쌓이고 넘침 0, 1000 에서 KRX | NXT 가 한 줄에 나란히(top 차이 ≤ 2) 넘침 0 — 자동 단언으로 증명. 라이트/다크 × 390/1000 스크린샷을 목업과 대조한 결과가 SUMMARY 에 있다. 커밋 1개(명시 경로만).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 없음(신규) | 표현 전용 변경이다. 새 입력 · 새 네트워크 호출 · 새 저장소 키 · 새 relay 메시지가 없다. 기존 경계(브라우저 ↔ relay WSS)의 송신 코드(vi.set · 확인 33)는 바뀌지 않는다. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-bjb-01 | Information disclosure(가시성 상실) | VI 서버 거부 경보 | medium | mitigate | 경보를 접히는 설정 블록 밖, VI 패널 스트립 줄 바로 아래 alert 슬롯에 둔다 — 접혀도 보인다(Task 1 · trading-workbench.test 단언 · e2e 15/27 는 펼치지 않고 경보를 기대). |
| T-bjb-02 | Tampering(의도치 않은 실돈 설정 변경) | VI 설정 줄 | medium | mitigate | 송신·확인 다이얼로그·계좌 정본·옮기기 판정 코드를 건드리지 않는다(D7). 접힘은 hidden 이라 더티 입력·이탈 경고 합이 사라지지 않는다 — 사용자가 모르는 새 값으로 저장되거나 버려진 채 떠나는 경로 없음. |
| T-bjb-03 | Repudiation | 가동 상태 표시 | low | accept | 「가동중」 글자를 지워도 스위치 색·위치 + aria-checked + aria-label 이 상태를 말하고, 사이드바 배지 · 시작/중지 확인 다이얼로그는 그대로다. |
</threat_model>

<verification>
- `pnpm --filter @gh-radar/webapp run typecheck` green.
- `pnpm --filter @gh-radar/webapp exec vitest --run` 로 vi-trigger-strip · vi-settings-rows · vi-order-list · trading-workbench · workbench-status-bar · breakout-strip 테스트 green.
- touched 소스 6개 eslint clean.
- `pnpm --filter @gh-radar/webapp exec playwright test trading-workbench a11y` failed 0 — 390 한 줄 · 1000 나란히 · 넘침 0 단언 포함.
- negative grep: src 에 지운 캡션 상수 · 임계 문구 상수 · 개수 콜백/props 이름 0건, 작업대 e2e 스펙에 상태줄 개수 testid · 캡션 slot 0건.
- 스크린샷(라이트/다크 × 390/1000) 목업 대조 결과가 SUMMARY 에 있다.
</verification>

<success_criteria>
- 사용자 요청 1: VI 설정은 VI 「더보기」를 눌렀을 때만 보이고, 거래소당 한 줄, 모바일이 아닌 넓은 본문(830 이상)에서는 KRX/NXT 가 한 줄에 둘 다.
- 사용자 요청 2: 상태줄에 임계 20% · 재무장 · 돌파 n · VI 발동 n · 거래 종목 n 이 없고 핵심(DMA · 장 구간 배지 · 알림음 · 반영 시각 · 단 수)만.
- 사용자 요청 3: 펼친 돌파·VI 목록 옆 「돌파 0 · 신규 0 …」 요약, 제목, 「접기 ▴」, 긴 설명문이 없고 접힌 줄 라벨에 개수가 없다.
- 동작 불변(D7): 확인 체크 · 110초 · 다이얼로그 · vi.set · 계좌 옮기기 · 알림음 · localStorage 테스트가 그대로 green.
</success_criteria>

<output>
Create `.planning/quick/260923-bjb-workbench-top-cleanup/260923-bjb-SUMMARY.md` when done — 태스크별 커밋 해시, D1 hidden 선택과 경보 위치 재량 결정, e2e pass/skip 수, 스크린샷 경로·관찰, 발견해 고친 시각 결함(있으면) 기록.
</output>
