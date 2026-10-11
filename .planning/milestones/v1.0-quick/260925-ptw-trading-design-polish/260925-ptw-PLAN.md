---
phase: quick-260925-ptw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/card-header.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/card/card-tabs.tsx
  - webapp/src/lib/trading-layout.ts
  - webapp/src/styles/globals.css
  - webapp/src/styles/__tests__/table-head-align.test.ts
  - webapp/src/app/layout.tsx
  - webapp/src/components/trading/workbench/stock-add-bar.tsx
  - webapp/src/components/ui/command.tsx
  - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
autonomous: true
requirements: [PTW-1, PTW-2, PTW-3, PTW-4, PTW-5, PTW-6, PTW-7, PTW-8]

estimate:
  tokens: 105000
  raw_tokens: 105000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "(PTW-1) 작업대 종목카드 헤더에 종목코드 글자가 보이지 않는다 — 종목명 한 줄(15px/700 · 넘치면 말줄임 · 전체는 title)이 세로 가운데 정렬로 서고, ⓘ(종목정보) 버튼이 종목명 바로 오른쪽에 붙는다"
    - "(PTW-2) ✕(카드 닫기)는 종목명과 같은 줄의 맨 오른쪽(등락률 오른쪽)에 있다 — 카드 폭 760 미만이면 [▶ 종목명 ⓘ (KRX|NXT) … 현재가 등락률 ✕] / 아래 줄 LED(펼침) 또는 점+요약칩(접힘), 760 이상이면 한 줄 [▶ 종목명 ⓘ (KRX|NXT) … 현재가 등락률 LED ✕]"
    - "(PTW-3) 카드 안 「정보 | 미체결 | 잔고 | 로그」 탭 본문은 네 탭 모두 같은 고정 높이(= 표 머리 1줄 + 데이터 3줄 = 4 × --row-h)이고 넘치는 내용은 세로 스크롤된다 — 탭을 바꾸거나 목록이 비어도 카드 높이가 변하지 않는다"
    - "(PTW-4) 그 탭 영역 자체를 탭 줄 오른쪽 끝 접기 버튼(aria-expanded · aria-controls)으로 접고 펼 수 있다 — 접혀도 탭 알약(건수 포함)은 보이고, 접힌 상태에서 탭을 누르거나 알림이 탭을 요청하면 펼쳐진다. 마지막 선택은 이 기기에 기억돼 새로 마운트되는 카드의 기본값이 된다"
    - "(PTW-5) 하단 공용 패널의 미체결 행 또는 잔고 행을 누르면 그 종목 카드가 없으면 만들어지고(있으면 펼쳐지고) 카드 머리가 화면 위(고정 앱 헤더 아래)로 스크롤되며 키보드 포커스가 그 카드 헤더 토글로 간다 — relay 송신 0"
    - "(PTW-6) `.tbl-wrap` 표(미체결 · 잔고 · 주문기록 · VI 목록 · 돌파 표 등)에서 데이터가 우정렬인 열(`num` · `text-right` 표시)의 머리글도 우정렬된다"
    - "(PTW-7) 「트레이딩」 제목 · 계좌 선택 · 상태줄(DMA 실시간 · 정규 배지 · 알림음 · 반영 시각 · 단 수)이 폭이 되면 한 줄에 서고, 모자라면 상태줄이 다음 줄에 전체 폭으로 내려간다(지금과 같은 모양)"
    - "(PTW-8) 루트 viewport 가 `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no` 이고, 종목추가 입력 글꼴은 터치 기기 포함 디자인 시스템 14px(--t-sm) 하나다"
  artifacts:
    - path: "webapp/src/components/trading/card/card-header.tsx"
      provides: "코드 없는 한 줄 종목명 + 이름 옆 ⓘ + 맨 오른쪽 ✕ 헤더 배치"
    - path: "webapp/src/components/trading/card/card-tabs.tsx"
      provides: "고정 높이 탭 본문 + 접기 버튼 + 접힘 기억"
    - path: "webapp/src/lib/trading-layout.ts"
      provides: "TradingPanelsPref.cardTabsFolded (boolean 검증)"
    - path: "webapp/src/styles/globals.css"
      provides: "표 머리 좌정렬 기본값을 @layer components 로 내려 우정렬 유틸·.num 이 이기게"
    - path: "webapp/src/styles/__tests__/table-head-align.test.ts"
      provides: "표 머리 정렬 층위 회귀 가드"
    - path: "webapp/src/app/layout.tsx"
      provides: "viewport maximumScale 1 · userScalable false"
    - path: "webapp/src/components/orderbook/account-panel.tsx"
      provides: "임베드 잔고 행 선택(onPickHolding) — 넘기지 않으면 DOM 불변"
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "제목·계좌·상태줄 한 줄 flex-wrap 머리 + 공용 패널 행 → 카드 보장·스크롤·포커스(reveal)"
  key_links:
    - from: "shared-panels.tsx 잔고 탭 AccountPanel"
      to: "trading-workbench.tsx pickHolding"
      via: "onPickHolding prop"
      pattern: "onPickHolding"
    - from: "trading-workbench.tsx scrollTarget reveal"
      to: "strategy-card 헤더 토글 버튼 id(toggleIdOf)"
      via: "useLayoutEffect scrollIntoView({block:'start'}) + focus({preventScroll:true})"
      pattern: "reveal"
    - from: "card-tabs.tsx 접기 버튼"
      to: "lib/trading-layout.ts writePanelsPref/readPanelsPref"
      via: "cardTabsFolded"
      pattern: "cardTabsFolded"
    - from: "globals.css .num / Tailwind text-right"
      to: ".tbl-wrap thead th 좌정렬 기본값"
      via: "기본값을 @layer components 로 — 층 없는 규칙은 층 있는 유틸을 명시도와 무관하게 이긴다"
      pattern: "@layer components"
---

<objective>
Phase 20 트레이딩 작업대(`/trading`) 디자인 손보기 8건(사용자 요청 원문 1~8 = 이 플랜의 PTW-1~PTW-8)을 한 번에 반영한다.

1. 종목카드 헤더에서 종목코드 제거 · 종목명 한 줄 정렬 · ⓘ 를 종목명 오른쪽으로 (PTW-1)
2. ✕ 를 종목명 줄 맨 오른쪽(등락률 오른쪽)으로 (PTW-2)
3. 카드 안 정보/미체결/잔고/로그 탭 본문 고정 높이(≈3줄) + 스크롤 (PTW-3)
4. 그 탭 영역 자체 접기 (PTW-4)
5. 하단 공용 패널 미체결/잔고 행 클릭 → 카드 없으면 생성 후 포커싱 (PTW-5)
6. 우정렬 데이터 열의 머리글도 우정렬 (PTW-6)
7. 상태줄(DMA 실시간 · 정규 …)을 제목 · 계좌 선택과 같은 줄로, 모자라면 다음 줄 (PTW-7)
8. viewport 확대/축소 금지 + 종목추가 입력 글꼴을 디자인 시스템 크기로 복귀 (PTW-8)

Purpose: 카드 헤더 공간 절약 · 카드 높이 안정 · 하단 패널에서 카드로의 이동 동선 완성 · 표 정렬 결함(전역 CSS 층위 버그) 근본 수정.
Output: 위 파일들의 수정 + 갱신/추가된 단위 테스트.

Tracer-first opt-out: 8건 모두 이미 검증된 컴포넌트 위의 독립적인 표시·배선 손질이라 증명할 아키텍처가 없다 — 주제별 3태스크(헤더 줄 / 카드 탭·전역 스타일·viewport / 하단 패널 → 카드 포커스)로 나눈다.

오케스트레이터 해석(잠금):
- 사용자가 말한 「정보/미체결/잔고/로그 카드」는 **작업대 종목카드 안의 탭 영역 하나**(`card-tabs.tsx`)다 — 카드 네 장이 아니라 탭 네 개가 한 본문을 교체한다. 그래서 고정 높이는 네 탭 공통 한 값이고, 접기 버튼은 탭 영역 하나에 하나다.
- 「(!) 버튼」 = 헤더의 ⓘ 종목정보 버튼(글리프 그대로 둔다).
- 「포커싱」 = 카드가 없으면 만들고, 접혀 있으면 펼치고, 카드 머리를 화면 위로 스크롤하고, 키보드 포커스를 카드 헤더 토글로 옮기는 것.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@webapp/src/components/trading/card/card-header.tsx
@webapp/src/components/trading/card/card-tabs.tsx
@webapp/src/components/trading/workbench/shared-panels.tsx
@webapp/src/components/trading/workbench/workbench-status-bar.tsx

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 뽑아 둔 계약. -->

trading-workbench.tsx (1490줄 — 필요한 구간만 읽을 것):
- L278 `type ScrollTarget = { key: string } | { isin: string };`
- L273 `function toggleIdOf(id: string): string` — 카드 헤더 토글 버튼 DOM id.
- L304 `isinFocusCardOf(cards, isin)` — ISIN 단위 포커스 카드(펼친 카드 우선).
- L346 `cardForUnfilled(cards, row, accountNo): UnfilledTarget` — 미체결 행 받을 카드 판정(유일 지점).
- L723-735 스크롤 useLayoutEffect — `el?.scrollIntoView?.({ block: "nearest" }); setScrollTarget(null);` 대상 요소 = `document.getElementById(toggleIdOf(hit.id))?.closest('[data-slot="strategy-card"]')`.
- L738 `focusCard(isin)` · L747 `addCard(isin, name?, code?)` — 있으면 `withCardOpen(prev, first.id, true)`, 없으면 `{ id: newId, isin, accountNo, exchange: "KRX", open: true, name, code }` append, `setScrollTarget({ isin })`.
- L932 `selectUnfilled(row | null)` — `setSelected(row)`; row 가 있으면 `cardForUnfilled` 로 카드 보장 + `setScrollTarget({ key: strategyKey(row.isin, accountNo, row.exchange) })`. 공용 패널(L1255)과 카드 탭(L1240 `onSelectUnfilled`) 둘 다 이 함수를 받는다.
- L1156-1178 루트 `data-slot="trading-workbench"` `@container/wb flex min-w-0 flex-col gap-3` → 「1 · 제목줄」 `data-slot="workbench-title"`(h1 트레이딩 + `AccountPill`) → 「2 · 상태줄」 `<WorkbenchStatusBar … />`.
- L1249-1260 `<SharedPanels accountNo account status logEntries selectedOrderNo onSelectUnfilled={selectUnfilled} dirtyBarCount={0} priceOf phoneBand />`.

shared (packages/shared/src/relay.ts):
- `RelayHolding = { isin: string; qty: number; sellableQty: number; avgPrice: number; name?: string; code?: string }` — **거래소 필드 없음** → 잔고 행 카드는 `addCard` 와 같은 ISIN 단위 규칙(상태줄 계좌 · KRX)을 따른다.

account-panel.tsx (1472줄):
- L492-532 `rowSelectProps` / `rowSelectClass` / `selectHandle` — 미체결 행 선택 패턴(⑩): 첫 셀 콘텐츠를 `<button type="button">`(onClick 없음)으로 감싸고 클릭은 행 `onClick` 한 경로로 버블.
- L1046-1049 `EMB_TH` · `EMB_TD` 임베드 셀 클래스.
- L1055 `EmbeddedSection({ section, scope, … })` — L1092-1171 잔고 분기(`data-slot="account-embed-holding-row"`, account 스코프일 때만 첫 열 「종목」 `account-embed-name`).

globals.css:
- L487-511 `.tbl-wrap` · `.tbl-wrap thead th { … text-align: left; … }` · `.tbl-wrap tbody td { … }` — **층 없는(unlayered) 규칙**(첫 `@layer` 는 L697 `@layer base`).
- L646 `.num { text-align: right; font-variant-numeric: tabular-nums; }` — 역시 층 없음.
- L131-135 `--t-caption: 12px; --t-sm: 14px; --t-base: 16px` · `--row-h: 36px` (L406-416 밀도 스코프: compact 32 · 모바일 comfortable 44).

lib/trading-layout.ts L114-155 — `TradingPanelsPref { vi?; breakout?; sharedTab?; sharedFolded? }` · `readPanelsPref()`(키마다 타입 검증) · `writePanelsPref(patch)`(병합 저장 · 실패 무시).

app/layout.tsx L25-30 — `export const viewport: Viewport = { themeColor: [...] }` (Next 15.5 · 다른 viewport export 없음).

app-header.tsx — 앱 헤더는 `sticky top-0 h-14`(56px) 이고 스크롤은 창이 한다(앱 셸 `main` 은 높이 무제한).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 헤더 두 줄 정리 — 종목카드 헤더(코드 제거 · ⓘ 이름 옆 · ✕ 맨 오른쪽, PTW-1·PTW-2) + 작업대 제목·계좌·상태줄 한 줄 flex-wrap(PTW-7)</name>
  <files>webapp/src/components/trading/card/card-header.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/__tests__/card-header.test.tsx, webapp/src/components/trading/__tests__/strategy-card.test.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx</files>
  <behavior>
    - 코드(`code` prop 이 있어도)가 헤더 텍스트에 나오지 않고, 코드 조각 요소 자체가 없다. `code === null` 이면 ⓘ 가 비활성인 기존 계약(D-30)은 그대로.
    - `card-header-l1` 안 DOM 순서 = 펼침 토글 버튼(▶ + 종목명) → ⓘ 버튼 → 거래소 세그먼트 → 가격 묶음(`card-header-price`). ⓘ 는 더 이상 `card-header-l2` 안에 없다.
    - ✕ 버튼(aria-label 「{종목명} 카드 닫기」 · title 「카드 제거」)은 `card-header-l1`·`card-header-l2` 어느 쪽에도 속하지 않는 헤더 직계 자식이고, DOM 에서 l1 바로 다음·l2 앞에 있다. ✕ 클래스에 `@min-[760px]/lc:` 순서 규칙이 있고, l2 는 기본 `basis-full` + 마지막 순서, `@min-[760px]/lc:` 에서 자연 폭·자연 순서로 풀린다.
    - 종목명 요소는 여전히 `truncate` + `title`(= `nameTitle ?? name`) 이고 줄 높이는 한 줄(flex-col 두 줄 배치 없음).
    - 접힘(open=false): l2 = 점 3개 + 요약 칩(미체결 N · 잔고 N주), ⓘ·✕ 는 여전히 헤더에 있다. 펼침: l2 = LED 칩 3개.
    - ⓘ·✕·세그먼트·LED 클릭은 헤더 토글(onToggle)을 부르지 않는다(stopPropagation 유지).
    - 헤더 어디에도 뷰포트 브레이크포인트 클래스(sm·md·lg·xl·2xl 접두)가 없다(D-28 기존 테스트 유지).
    - 작업대: `workbench-title` 과 `workbench-status-bar` 가 같은 부모 `data-slot="workbench-head"`(flex-wrap) 의 자식이고, 상태줄 요소 클래스에 `flex-[1_1_auto]` 가 있다. 기존 레이아웃 순서 테스트(제목 → 상태줄 → VI → … → 공용 패널)는 그대로 통과.
  </behavior>
  <action>
**card-header.tsx (PTW-1 · PTW-2)** — 헤더를 다음 구조로 재배치한다(DOM 은 폰 우선 순서).
- `header`(기존 flex-wrap · gap · 패딩 · 클릭 토글 유지)의 직계 자식은 셋: `card-header-l1` → ✕ 버튼 → `card-header-l2`.
- `card-header-l1`: 클래스를 `flex min-w-0 flex-[1_1_0%] items-center gap-2` 로(두 밴드 공통 basis 0 — ✕·LED 몫을 먼저 보장하고 남는 폭을 l1 이 가진다. 긴 종목명은 말줄임). 자식 순서: 펼침 토글 버튼 → ⓘ 버튼 → 거래소 세그먼트 `<span onClick={stop}>` → 가격 묶음(`ml-auto` 유지).
- 펼침 토글 버튼 안: 캐럿 ▶ 그대로 + 종목명 `<b data-part="name">` 하나. 종목명/코드를 감싸던 flex-col↔row 전환 span(폰 두 줄 · 700 이상 baseline) 과 **종목코드 span 요소를 통째로 지운다**(그 data-part 표식 포함). 종목명 클래스는 `min-w-0 truncate text-[15px] font-bold leading-normal text-[var(--fg)]`(크기·굵기는 기존 목업값 그대로 — 과장 금지), 버튼은 `min-w-0` 이라 이름이 줄어든다. 캐럿과 종목명은 `items-center` 로 세로 가운데. `code` prop 은 계속 받는다(ⓘ 비활성 판정 D-30 전용).
- ⓘ 버튼: 기존 속성(title · aria-label 「종목정보」 · disabled 조건 · stopPropagation · 클래스)을 그대로 옮기되 `flex-none`, l2 에서 제거.
- ✕ 버튼: 기존 속성(title 「카드 제거」 · aria-label 「{name} 카드 닫기」 · stopPropagation)을 유지하고 헤더 직계 자식으로 옮긴다. `ml-1` 은 지우고 `flex-none @min-[760px]/lc:order-last` 를 붙인다(좁은 밴드에선 DOM 순서대로 l1 바로 뒤 = 첫 줄 맨 오른쪽, 760 이상에선 LED 뒤 = 한 줄 맨 오른쪽). 등락률과 ✕ 사이가 과하게 벌어지면 ✕ 가로 패딩만 줄인다(`px-2` 정도) — 높이 26 유지.
- `card-header-l2`: `ml-auto` 로 ⓘ·✕ 를 담던 끝 span 을 지운다. 클래스를 `flex min-w-0 order-last basis-full flex-wrap items-center gap-2.5 @min-[760px]/lc:order-none @min-[760px]/lc:flex-none @min-[760px]/lc:basis-auto` 로(좁은 밴드 = 둘째 줄 전체, 760 이상 = l1 뒤 제 폭). LED 칩 / 점+요약 칩 내용은 그대로.
- 파일 상단 주석 ①(l1/l2 구성) · 760 경계 주석(D-26 로컬 경계라는 사실은 유지)을 새 배치로 고쳐 쓴다: 「l1 = ▶ · 종목명(코드 표시 없음 · quick-260925-ptw) · ⓘ · KRX|NXT · 현재가+등락률 / ✕ = 종목명 줄 맨 오른쪽 / l2 = LED(펼침) 또는 점+요약 칩(접힘), 760 미만 둘째 줄 · 760 이상 ✕ 앞」. 종목명 두 줄 배치 설명(폰 밴드 코드 10px 등)은 지운다.

**trading-workbench.tsx (PTW-7)** — 「1 · 제목줄」 div 와 「2 · 상태줄」 `<WorkbenchStatusBar>` 를 새 래퍼 `<div data-slot="workbench-head" className="flex min-w-0 flex-wrap items-center gap-3">` 하나로 감싼다(gap 12 = 루트 `gap-3` 과 같아 줄바꿈된 모양이 지금과 동일). `workbench-title` div 는 그대로 두되 `max-w-full` 을 더해 좁은 폭에서 넘치지 않게 한다. `WorkbenchStatusBar` 에 `className="flex-[1_1_auto]"` 를 넘긴다 — basis auto(=내용 max-content)라 남는 폭이 상태줄 내용보다 작으면 flex-wrap 이 통째로 다음 줄로 내리고, 들어가면 남는 폭을 채운다(상태줄 안 `ml-auto` 우측 묶음은 그대로 오른쪽 끝). 새 폭 숫자·뷰포트 브레이크포인트·컨테이너 쿼리를 도입하지 않는다(내용 폭 기반 줄바꿈 — 앱 셸/§2.2b 규약과 무관). 주석 「1 · 제목줄」·「2 · 상태줄」 을 「1 · 머리줄 — 제목 · 계좌 · 상태줄(폭이 모자라면 상태줄이 다음 줄, quick-260925-ptw)」 로 합친다. `workbench-status-bar.tsx` 는 수정하지 않는다(className prop 이미 있음).

**테스트 갱신(RED 먼저)** —
- card-header.test.tsx: 코드 조각 mono 단언(E7 long-text 케이스)과 「code 없는 카드는 코드 조각을 그리지 않는다」 단언을 「code 가 있어도 헤더 textContent 에 코드 문자열이 없고 코드 조각 요소가 없다」로 바꾼다. 「E7 overflow — 760 한 줄 결합」 케이스는 l1 대신 l2 와 ✕ 버튼 클래스에 `@min-[760px]/lc:` 가 있는지 본다. 새 케이스: l1 자식 순서(토글 → ⓘ → 세그먼트 → 가격) · ✕ 가 l1/l2 밖 헤더 직계이고 l1 다음 형제 · 접힘 요약 케이스는 ⓘ·✕ 존재만 확인(l2 소속 가정 제거).
- strategy-card.test.tsx L420 근처: l1 의 760 유틸 단언을 l2(또는 ✕) 로 옮긴다.
- trading-workbench.test.tsx: 레이아웃 순서 테스트 옆에 `workbench-head` 가 제목·상태줄의 공통 부모이고 상태줄 className 에 `flex-[1_1_auto]` 가 있는 단언 추가.
- 주의: 테스트 헬퍼가 `button[aria-expanded]` 첫 요소를 헤더 토글로 쓴다(trading-workbench.test `toggleOf`) — 헤더 토글이 카드 DOM 의 첫 aria-expanded 버튼이라는 사실을 깨지 않는다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/card-header.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx</automated>
  </verify>
  <done>세 테스트 파일 전부 통과. `grep -c 'data-part="code"' webapp/src/components/trading/card/card-header.tsx` = 0(주석에도 그 표식 문자열을 남기지 않는다). 헤더에서 코드 글자가 사라지고 ⓘ 가 종목명 옆, ✕ 가 종목명 줄 맨 오른쪽에 있으며, 작업대 머리줄이 `workbench-head` flex-wrap 한 줄로 묶였다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 카드 탭 고정 높이·접기(PTW-3·PTW-4) + 표 머리글 우정렬 전역 수정(PTW-6) + viewport 확대 금지·종목추가 입력 14px(PTW-8)</name>
  <files>webapp/src/components/trading/card/card-tabs.tsx, webapp/src/lib/trading-layout.ts, webapp/src/components/trading/__tests__/card-tabs.test.tsx, webapp/src/styles/globals.css, webapp/src/styles/__tests__/table-head-align.test.ts, webapp/src/app/layout.tsx, webapp/src/components/trading/workbench/stock-add-bar.tsx, webapp/src/components/ui/command.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    - 탭 본문 래퍼 `[data-slot="card-tabs-body"]` 하나가 네 탭(정보 포함) 콘텐츠를 담고, 클래스에 `h-[calc(var(--row-h)*4)]` 와 `overflow-y-auto` 가 있다. 탭마다 따로 두던 높이 상한 래퍼는 없다.
    - 탭 줄 오른쪽 끝에 접기 버튼(`data-slot="card-tabs-fold"`, `aria-expanded="true"` 기본, `aria-controls` = 본문 id, aria-label/title 「탭 접기」↔「탭 펼치기」)이 있다.
    - 접기 클릭 → 본문 `hidden`, aria-expanded false, 탭 알약 4개는 그대로 보인다, localStorage 의 트레이딩 패널 선호에 `cardTabsFolded: true` 가 저장된다. 다시 누르면 펼쳐지고 false 저장.
    - `cardTabsFolded: true` 가 미리 저장돼 있으면 접힌 채 마운트. 단 `requestedTab` 을 들고 마운트되면 펼친 채.
    - 접힌 상태에서 아무 탭(현재 활성 탭 포함)을 누르면 펼쳐진다(선호 false 저장). 접힌 상태에서 새 `requestedTab.seq` 가 오면 그 탭으로 바뀌며 펼쳐진다(이 경우 선호는 저장하지 않는다).
    - `readPanelsPref` 는 boolean 이 아닌 `cardTabsFolded` 를 버린다.
    - globals.css 가드: 층 없는 최상위 `.tbl-wrap thead th {` 블록에 text-align 이 없고, `@layer components` 블록 안에 `.tbl-wrap thead th { text-align: left; }` 가 있으며, 최상위 `.num {` 블록에 `text-align: right` 가 남아 있다.
  </behavior>
  <action>
**card-tabs.tsx (PTW-3 · PTW-4)**
- 근본 구조: `Tabs` 안을 [탭 줄 행] + [본문 래퍼] 로 나눈다. 탭 줄 행 = `<div data-slot="card-tabs-bar" className="flex min-w-0 items-center gap-1 px-2 pt-1">`(접혔을 때만 `pb-1` 추가 — 알약이 아래 경계선에 붙지 않게) 안에 기존 `TabsList`(여기서 `px-2 pt-1` 은 행으로 옮기고 `min-w-0 flex-1 overflow-x-auto` 유지) + 접기 버튼.
- 접기 버튼: `<button type="button" data-slot="card-tabs-fold">` · `aria-expanded={!folded}` · `aria-controls={bodyId}`(`useId`) · aria-label·title 은 펼침일 때 「탭 접기」, 접힘일 때 「탭 펼치기」 · 크기 `h-6 w-6 flex-none` (탭 알약 24px 과 같은 높이) · `ml-auto inline-flex items-center justify-center rounded-[var(--r)] text-[var(--muted-fg)] hover:bg-[var(--muted)]` · 아이콘은 lucide `ChevronDown`(`size-3.5`, `aria-hidden`), 펼침일 때 `rotate-180` · `transition-transform duration-150 motion-reduce:transition-none`(헤더 캐럿 문법과 같다). 새 색·원시 색 금지 — 토큰만.
- 본문 래퍼: 네 `TabsContent` 를 `<div id={bodyId} data-slot="card-tabs-body" hidden={folded} className="h-[calc(var(--row-h)*4)] min-w-0 overflow-y-auto">` 하나로 감싼다. 미체결·잔고·로그 탭 안의 기존 높이 상한 래퍼(210px 상한 상수와 그 div)를 지우고, 정보 탭(`QuoteGrid10`)도 같은 래퍼 안에 둔다. 높이 = 표 머리 1줄 + 데이터 3줄 ≈ 4 × `--row-h`(기본 36 → 144px · 모바일 comfortable 44 → 176px · compact 32 → 128px — 밀도 토큰을 따라가므로 새 px 숫자를 박지 않는다). 가로 넘침은 안쪽 표 래퍼(`account-embed-scroll` · `.tbl-wrap`)가 이미 맡는다. 빈 상태(점선 상자 ≈71px)도 이 높이 안이라 탭 전환·빈 목록에서 카드 높이가 변하지 않는다.
- 상태: `const [folded, setFolded] = useState(() => requestedTab === undefined && readPanelsPref().cardTabsFolded === true)` — 이 컴포넌트는 카드를 처음 펼친 뒤에만 마운트되는 클라이언트 전용 조각이라 SSR 하이드레이션 대상이 아니고(작업대 카드 집합은 마운트 후 효과에서 복원된다), 서버에서는 `readPanelsPref` 가 `{}` 를 돌려 같은 값이 된다 — 첫 페인트 깜빡임(펼침→접힘 점프)을 피하려고 지연 초기화로 읽는다. 사용자 토글 = `setFolded(next); writePanelsPref({ cardTabsFolded: next })`. 탭 트리거 각각에 `onClick` 으로 「접혀 있으면 펼치고 false 저장」(활성 탭 재클릭은 Radix `onValueChange` 가 안 불리므로 onClick 이 필요하다). 기존 `requestedTab` 효과(⑦)에서 탭을 바꿀 때 `setFolded(false)` 도 함께 한다(저장 안 함 — 알림 클릭은 선호 변경이 아니다).
- 파일 상단 주석: ① 의 「(24px · …)」 설명은 두고, 「목업 `.tb`(높이 상한 210 · 넘치면 스크롤)」 설명을 「본문은 네 탭 공통 고정 높이 4 × --row-h(머리 1 + 3줄) · 넘치면 세로 스크롤 — quick-260925-ptw」로 바꾼다. ⑤ 에 「탭 선택은 여전히 컴포넌트 state 뿐 · **접힘**만 `readPanelsPref/writePanelsPref`(cardTabsFolded)로 기억해 새로 마운트되는 카드의 기본값이 된다(이미 떠 있는 다른 카드는 자기 값을 유지)」 를 적는다.

**lib/trading-layout.ts** — `TradingPanelsPref` 에 `cardTabsFolded?: boolean`(JSDoc: 작업대 카드 탭 영역 접힘 · 새로 마운트되는 카드의 기본값) 추가, `readPanelsPref` 에 `typeof p.cardTabsFolded === "boolean"` 검증 한 줄 추가. `writePanelsPref` 는 그대로(병합 저장).

**card-tabs.test.tsx** — 위 behavior 6개를 케이스로 추가(RED 먼저). localStorage 는 각 케이스 전후 `clear()`. 저장 키는 `trading-layout.ts` 의 상수를 import 하거나 `readPanelsPref()` 결과로 단언한다(키 문자열 하드코딩 금지). 기존 「뷰포트 브레이크포인트 · @container 재선언 없음」 케이스가 새 조각에서도 통과해야 한다.

**globals.css (PTW-6 · 근본 원인)** — `.tbl-wrap thead th` 규칙은 층 없는(unlayered) 규칙이라 Tailwind v4 의 `@layer utilities` 에 있는 `text-right` 를 명시도와 무관하게 이기고, 명시도(0,1,2)로 `.num`(0,1,0)도 이긴다 — 그래서 `num`/`text-right` 를 단 머리글이 전부 좌정렬로 그려졌다(데이터 셀 규칙에는 text-align 이 없어 셀만 우정렬). 수정: 층 없는 `.tbl-wrap thead th { … }` 블록에서 `text-align: left;` 한 줄만 빼고(배경 투명 · 색 · 크기 · 굵기 · 패딩 · 아래선 0 은 B 테마 평면화라 층 없는 채로 둔다 — 층으로 내리면 임베드 머리글의 `bg-[var(--muted)]` 등이 되살아난다), 바로 아래에 `@layer components { .tbl-wrap thead th { text-align: left; } }` 를 둔다. 결과: 기본은 좌정렬, `text-right` 유틸(utilities 층)과 층 없는 `.num` 이 이긴다. 블록 위 주석에 이 이유(층 없는 규칙 vs 층 있는 유틸 · quick-260925-ptw)를 2~3줄로 남긴다. `.num` 블록은 건드리지 않는다. 컴포넌트(account-panel · today-orders-card · vi-order-list · breakout-strip)의 머리글 클래스는 이미 `num`/`text-right` 가 맞게 붙어 있으므로 수정하지 않는다.

**styles/__tests__/table-head-align.test.ts (신규)** — `tds-tokens.test.ts` 와 같은 방식(`readFileSync(path.resolve(__dirname, '../globals.css'))`)으로 globals.css 문자열을 읽어 behavior 의 가드 3개를 단언한다. 최상위 블록은 줄 시작 선택자(`\n.tbl-wrap thead th {`)로 찾고 닫는 `\n}` 까지 자른 뒤 주석을 지우고 검사한다(들여쓴 `@layer` 안 규칙과 구분된다).

**app/layout.tsx (PTW-8)** — 기존 `viewport` 객체에 `width: 'device-width'`, `initialScale: 1`, `maximumScale: 1`, `userScalable: false` 를 더한다(`themeColor` 유지). JSDoc 에 이유를 적는다: 사용자 요청(quick-260925-ptw) — 확대/축소 금지 · `maximum-scale=1` 이 iOS Safari 의 16px 미만 입력 포커스 자동 확대를 막는다 · iOS 10+ Safari 는 접근성 정책으로 `user-scalable=no` 의 수동 핀치를 무시할 수 있다(자동 확대 방지는 유효) · Android Chrome 은 핀치까지 막는다.

**stock-add-bar.tsx (PTW-8)** — 종목추가 입력의 글꼴 클래스를 기본 16px + 마우스 기기 14px 한 쌍에서 `text-[length:var(--t-sm)]` 하나로 바꾼다(디자인 시스템 입력 크기 14px · 마우스 기기에서 보이던 크기와 동일). 입력 위 주석의 「★ 글꼴은 기본 16px …」 3줄을 「★ 글꼴은 디자인 시스템 14px(--t-sm) 하나다 — iOS 포커스 확대는 루트 viewport `maximum-scale=1`(app/layout.tsx · quick-260925-ptw)이 막는다」 한 줄로 바꾼다. `h-9`↔목록 `top-10` 한 쌍 주석은 그대로.

**command.tsx (주석만)** — CommandInput 위 주석의 「viewport 확대 금지 설정은 핀치줌을 죽이므로 쓰지 않는다 — 정책 정본은 limit-chaser-form.tsx 의 모바일 16px 주석」 문장은 이제 사실이 아니다(그 정본 주석도 Phase 20 에서 사라졌다). 그 문장을 「루트 viewport 에 maximum-scale=1 이 들어갔다(quick-260925-ptw) — 이 입력(글로벌 검색)의 터치 16px 은 중복 안전장치로 남겨 둔다(작업대 밖 표면이라 이번 범위 밖)」로 교체한다. **클래스는 바꾸지 않는다**(e2e `search.spec.ts` 가 터치 16px 을 단언한다).

**e2e/specs/trading-workbench.spec.ts (주석만)** — 테스트 9 의 `addBox` 14px 단언 위 주석 「마우스 기기(Desktop Chrome)에서는 … 터치만 16px」 를 「입력 글꼴은 기기와 무관하게 14px — iOS 확대는 루트 viewport maximum-scale=1 이 막는다(quick-260925-ptw)」로 고친다. 단언 자체는 그대로(여전히 14px).

금지: `webapp/e2e/specs/zz-theme-gallery.spec.ts` · `.planning/milestone.lock` 은 다른 세션 소유 — 건드리지 않는다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/card-tabs.test.tsx src/styles/__tests__/table-head-align.test.ts src/styles/__tests__/tds-tokens.test.ts src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/stock-add-bar.test.tsx && grep -q "maximumScale: 1" webapp/src/app/layout.tsx && grep -q "userScalable: false" webapp/src/app/layout.tsx</automated>
  </verify>
  <done>테스트 통과 + viewport grep 통과. `grep -c 'max-h-\[210px\]' webapp/src/components/trading/card/card-tabs.tsx` = 0 · `grep -c 'pointer-fine:text-' webapp/src/components/trading/workbench/stock-add-bar.tsx` = 0. 카드 탭 본문이 네 탭 공통 고정 높이로 스크롤되고 접기 버튼으로 접히며, 우정렬 열 머리글이 우정렬되고, viewport 가 확대를 막고 종목추가 입력이 14px 이다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 하단 공용 패널 미체결·잔고 행 → 카드 보장 · 스크롤 · 포커스(PTW-5)</name>
  <files>webapp/src/components/orderbook/account-panel.tsx, webapp/src/components/trading/workbench/shared-panels.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/shared-panels.test.tsx, webapp/src/components/trading/__tests__/trading-workbench.test.tsx</files>
  <behavior>
    - AccountPanel 임베드 잔고(`section="holdings"`, `embedScope="account"`)에 `onPickHolding` 을 넘기면: 각 잔고 행에 `cursor-pointer` 와 title 이 붙고, 첫 셀(종목명)이 `<button type="button" data-slot="account-holding-pick">`(aria-label 「{종목명 또는 ISIN} 카드 열기」)으로 감싸지며, 행의 아무 셀이나 누르면 `onPickHolding(그 행)` 이 정확히 1회 불린다. 넘기지 않으면 DOM 이 종전과 한 글자도 다르지 않다(stock 스코프 카드 탭 · /me · 호가 탭).
    - SharedPanels 가 `onPickHolding` 을 잔고 탭 AccountPanel 로 그대로 넘긴다.
    - 작업대: 카드가 없는 ISIN 의 잔고 행을 누르면 그 ISIN 의 펼친 카드(상태줄 계좌 · KRX)가 하나 생기고, 그 카드 `article` 에 `scrollIntoView({ block: 'start' })` 가 불리며, `document.activeElement` 가 그 카드 헤더 토글 버튼이다. 같은 ISIN 카드가 이미 있으면 새 카드 없이 그 카드(`isinFocusCardOf`)가 펼쳐지고 같은 스크롤·포커스.
    - 작업대: 하단 패널 미체결 행 클릭은 기존 WR-04 동작(카드 보장 · 선택 전달) 그대로에 더해 `block: 'start'` 스크롤 + 헤더 토글 포커스. 이미 선택된 행 재클릭(해제)은 스크롤·포커스 없음.
    - 카드 안 「미체결」 탭 행 클릭은 선택만 하고 기존 `block: 'nearest'` 스크롤을 유지하며 포커스를 옮기지 않는다.
    - 위 어느 경로도 relay 로 아무것도 보내지 않는다(송신 모킹 호출 0 — T-18-99 · D-07).
    - 카드 `article`(`data-slot="strategy-card"`) 클래스에 `scroll-mt-16` 이 있다.
  </behavior>
  <action>
**account-panel.tsx** — `AccountPanelProps` 에 `onPickHolding?: (row: RelayHolding) => void` 를 추가한다(JSDoc: 임베드 잔고 행 선택 창구 — 작업대 공용 패널 전용 · 넘기지 않으면 DOM 불변 · 선택 상태를 만들지 않는 「이 행을 눌렀다」 알림뿐). `EmbeddedSection` 으로 전달하고, 잔고 분기에서 `onPickHolding !== undefined && scope === 'account'` 일 때만: 행(`account-embed-holding-row`)에 `onClick={() => onPickHolding(view.row)}` · `cursor-pointer` · `title`(새 export 상수 `HOLDING_ROW_PICK_TITLE = '행을 누르면 그 종목 카드로 이동해요'`) 을 주고, 첫 셀의 종목명 span 을 미체결 선택 핸들(⑩ `selectHandle`)과 같은 문법의 `<button type="button" data-slot="account-holding-pick" aria-label={`${view.label ?? view.row.isin} 카드 열기`} className="min-w-0 cursor-pointer bg-transparent p-0 text-left text-inherit">` 로 감싼다 — 버튼에 onClick 을 두지 않는다(클릭은 행으로 버블해 한 경로로 1회. 키보드 Enter/Space 도 네이티브 click 이 행으로 버블). 파일 상단 주석 ⑪ 에 「임베드 잔고 행 선택(`onPickHolding`, quick-260925-ptw) — account 스코프에서만 · 선택 상태 없음 · 넘기지 않으면 DOM 불변」 한 문단을 더한다.

**shared-panels.tsx** — `SharedPanelsProps` 에 `onPickHolding?: (row: RelayHolding) => void`(JSDoc: 잔고 행 클릭 → 작업대가 그 종목 카드를 보장·포커스) 추가, 잔고 탭 `<AccountPanel {...embedProps} section="holdings" onPickHolding={onPickHolding} />`. 파일 상단 ③ 옆에 한 줄: 미체결 행 클릭 = 선택(정정/취소 진입) + 카드 포커스, 잔고 행 클릭 = 카드 포커스(quick-260925-ptw).

**trading-workbench.tsx** —
- `ScrollTarget` 을 `({ key: string } | { isin: string }) & { reveal?: boolean }` 로 넓힌다. 스크롤 useLayoutEffect 에서 `el?.scrollIntoView?.({ block: scrollTarget.reveal === true ? "start" : "nearest" })` 로 바꾸고, `reveal` 이면 이어서 `document.getElementById(toggleIdOf(hit.id))?.focus({ preventScroll: true })` 로 헤더 토글에 포커스를 준다(요소 참조가 아니라 id 로 찾는 이유는 헤더 ③ 과 같다 — 재마운트 뒤에도 같은 id). 다른 기존 호출부(`?focus=`·사이드바·돌파 칩·종목 추가·거래소 충돌·알림 클릭)는 `reveal` 없이 그대로 nearest.
- `selectUnfilled` 본문을 내부 `selectUnfilledWith(row, reveal: boolean)` 로 옮기고 `setScrollTarget({ key: …, reveal })`. `selectUnfilled = (row) => selectUnfilledWith(row, false)`(카드 탭용 — 동작 불변) · 새 `selectUnfilledFromPanel = (row) => selectUnfilledWith(row, true)`. 둘 다 안정 `useCallback`(deps `[accountNo, nextCardId]` 계열 유지). `SharedPanels` 의 `onSelectUnfilled` 에는 `selectUnfilledFromPanel` 을 넘긴다. 카드 격자의 `onSelectUnfilled`(L1240)는 `selectUnfilled` 그대로.
- `addCard` 본문을 내부 `ensureIsinCard(isin, name, code, reveal)` 로 옮기고 `setScrollTarget({ isin, reveal })`. `addCard = (isin, name?, code?) => ensureIsinCard(isin, name, code, false)`(돌파 스트립·종목 추가 동작 불변) · 새 `pickHolding = (row: RelayHolding) => ensureIsinCard(row.isin, row.name, row.code, true)`. `SharedPanels` 에 `onPickHolding={pickHolding}` 을 넘긴다. `RelayHolding` 타입을 `@gh-radar/shared` 에서 import.
- 카드 추가·펼침은 여전히 화면 상태뿐이다 — relay 송신 경로를 새로 만들지 않는다(D-07 · T-18-99). 파일 상단 ② 의 「공용 패널 미체결 행 선택은 …」 문단 뒤에 「공용 패널 행(미체결 · 잔고) 클릭은 카드 보장 뒤 `reveal` — 카드 머리를 화면 위로(`block:start`) 스크롤하고 헤더 토글에 포커스(quick-260925-ptw). 카드 탭 안 미체결 클릭은 reveal 하지 않는다(자기 카드 안에서 포커스를 뺏지 않게)」를 더한다.

**strategy-card.tsx** — 카드 `article` className 에 `scroll-mt-16` 을 더한다(앱 헤더가 `sticky top-0 h-14` 56px 라 `block:start` 스크롤이 카드 머리를 헤더 밑에 묻지 않게 64px 여유 — 기존 nearest 스크롤에도 같은 여유가 적용되는 부수 효과는 개선이다). 주석 한 줄로 이유를 남긴다. 다른 부분은 건드리지 않는다.

**테스트(RED 먼저)** —
- shared-panels.test.tsx: `onPickHolding` 을 넘기면 잔고 행에 `account-holding-pick` 버튼(aria-label 「{종목명} 카드 열기」)이 있고 행 셀 클릭 → 그 행으로 1회 호출 · 안 넘기면 그 버튼이 없고 행에 cursor-pointer 가 없다.
- trading-workbench.test.tsx: `Element.prototype.scrollIntoView` 를 기존 케이스(L2018 근처)처럼 임시 교체해 (요소 data-key, 옵션)을 기록한다. 케이스 ① 카드 없는 ISIN 잔고 행 클릭 → 카드 수 +1 · 그 키 `open` · 스크롤 옵션 `block:'start'` · `document.activeElement` = 그 카드 `button[aria-expanded]`(헤더 토글) ② 카드 있는 ISIN 잔고 행 → 카드 수 불변 · 펼침 · 같은 포커스 ③ 하단 미체결 행 → 기존 WR-04 단언 + `block:'start'` + 포커스 ④ 카드 「미체결」 탭 행 → `block:'nearest'` · 포커스가 헤더 토글이 아님 ⑤ 위 경로에서 relay 송신 모킹 호출 0. 잔고 데이터는 기존 `acctWith` 헬퍼를 `hold` 도 받게 넓히거나 옆에 `hold` 버전을 둔다.
- account-panel 기존 테스트(`components/orderbook/__tests__/account-panel.test.tsx`)는 수정 없이 통과해야 한다(DOM 불변 계약).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/shared-panels.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/orderbook/__tests__/account-panel.test.tsx</automated>
  </verify>
  <done>다섯 테스트 파일 통과. 하단 공용 패널의 미체결·잔고 행을 누르면 카드가 (없으면 생성·있으면 펼침) 화면 위로 스크롤되고 헤더 토글에 포커스가 가며, 카드 탭 안 미체결 클릭 동작과 기존 호출부 DOM 은 변하지 않았다. relay 송신 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage → 작업대 UI | `gh-radar` 트레이딩 패널 선호(`cardTabsFolded` 추가)는 사용자 브라우저가 쓸 수 있는 값 — 타입 검증 후에만 쓴다 |
| 작업대 UI → relay(주문 서버) | 이번 변경은 화면 상태(카드 추가 · 펼침 · 스크롤 · 포커스)만 바꾼다 — 새 송신 경로 0 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ptw-01 | Tampering | `readPanelsPref` · `cardTabsFolded` | low | mitigate | `typeof === "boolean"` 검증 한 줄(기존 키들과 같은 규율) — 다른 타입은 버리고 기본(펼침)으로. card-tabs 테스트가 비불리언 값 무시를 단언 |
| T-ptw-02 | Elevation of Privilege | 공용 패널 잔고/미체결 행 → 카드 생성 | high | mitigate | 카드 생성은 기존 `addCard`/`cardForUnfilled` 경로 재사용 — 새 카드는 스위치 전부 OFF · 서버 송신 0(D-07 · T-18-99). 작업대 테스트가 세 경로에서 relay 송신 모킹 호출 0 을 단언 |
| T-ptw-03 | Spoofing | 잔고 행 카드의 계좌·거래소 축 | medium | mitigate | 잔고는 거래소를 모르므로 `addCard` 와 같은 ISIN 단위 규칙(같은 ISIN 카드가 있으면 그 카드, 없으면 상태줄 계좌 · KRX) — 공용 패널의 계좌 축(상태줄 계좌, D-13)과 일치해 다른 계좌 카드를 지어내지 않는다 |
| T-ptw-04 | Tampering | 미체결 선택 전달(정정/취소 원주문) | high | mitigate | 선택 판정·전달 조건(`cardForUnfilled` · `nextUnfilledSelection` · liveSelected)은 손대지 않는다 — `reveal` 은 스크롤·포커스만 추가. 기존 WR-04 테스트 유지 |
| T-ptw-05 | Denial of Service (접근성) | viewport `userScalable: false` | low | accept | 사용자 명시 요청. iOS Safari 는 수동 핀치를 여전히 허용할 수 있고(자동 확대만 막힘), Android 는 핀치까지 막힌다 — WCAG 1.4.4 트레이드오프를 layout.tsx JSDoc 에 기록 |
</threat_model>

<verification>
전체(실행자 마지막 단계):
- `pnpm --filter @gh-radar/webapp run typecheck`
- `pnpm --filter @gh-radar/webapp run lint`
- `pnpm --filter @gh-radar/webapp run test`

수동 시각 확인(사용자 · 비차단 · `./dev.sh` 후 http://localhost:3100/trading — 로그인·relay 필요):
- 카드 헤더: 코드 없음 · ⓘ 가 종목명 옆 · ✕ 가 종목명 줄 맨 오른쪽(카드 1단 넓은 폭 / 2·3단 좁은 폭 둘 다) · 긴 종목명 말줄임 · 라이트/다크.
- 카드 탭: 정보/미체결/잔고/로그 전환 시 카드 높이 불변 · 3줄 넘으면 스크롤 · 접기 버튼 · 새로고침 뒤 접힘 기억.
- 하단 패널: 카드 없는 종목의 잔고/미체결 행 클릭 → 카드 생성 + 화면 위로 스크롤(앱 헤더에 가리지 않음).
- 표 머리글: 미체결(주문가 · 주문/미체결) · 잔고(수량~손익률) 머리글 우정렬.
- 머리줄: 넓은 화면에서 「트레이딩 · 계좌 · 상태줄」 한 줄, 좁은 화면(폰)에서 상태줄이 다음 줄.
- iPhone: 종목추가 입력 포커스 시 확대 없음 · 글꼴 14px.

커밋 규율(사용자 전역 규칙): 커밋 메시지는 한글 · Co-Authored-By 넣지 않음 · **push 하지 않는다**(이 저장소에서 push 는 곧 배포 — 오케스트레이터/사용자가 결정). 다른 세션 소유 미추적 파일 `webapp/e2e/specs/zz-theme-gallery.spec.ts` · `.planning/milestone.lock` 은 add/수정 금지 — `git add -A` 금지, 파일 지정 add 만.
</verification>

<success_criteria>
- PTW-1~PTW-8 의 must_haves.truths 8개가 모두 참이다.
- webapp typecheck · lint · 전체 vitest 가 통과한다.
- 새/수정 코드에 뷰포트 브레이크포인트(sm·md·lg·xl·2xl 접두)나 원시 색이 없다 — 카드 안은 `@min-[…]/lc:` 만, 색은 CSS 변수 토큰만.
- 하단 패널 행 클릭 경로에서 relay 송신이 0 이다.
</success_criteria>

<output>
Create `.planning/quick/260925-ptw-trading-design-polish/260925-ptw-SUMMARY.md` when done
</output>
</content>
</invoke>
