---
phase: 18-gh-trade-ui-nxt-vi
plan: 09
subsystem: ui
tags: [trading, workbench, shared-panels, account-panel, stock-info-modal, dialog, portal, container-query, react, tdd]
status: complete

requires:
  - phase: 18-06
    provides: "CardHeader ⓘ(code 없으면 비활성) · StrategyCard 컨테이너(@container/lc)"
  - phase: 18-07
    provides: "ManualOrderForm selectedUnfilled/onClearSelection · unfilledSelectBlockReason(선택 불가 판정 1벌)"
provides:
  - "SharedPanels — 미체결 (N) / 잔고 (N) / 전략 로그 3탭 공용 패널 (workbench/shared-panels.tsx) + DIRTY_BAR_FALLBACK_PX"
  - "AccountPanel onSelectUnfilled?/selectedOrderNo? — 미체결 행 선택(정정/취소 진입) · UNFILLED_ROW_SELECT_TITLE"
  - "AccountPanel section?/originOf?/priceOf? — 탭 임베드 모드(UI-SPEC 공용 패널 열 구성) · AccountRowOrigin 타입"
  - "StrategyLog variant='embed' + StrategyLogEntry.who? — 공용 패널 로그 탭(빈 문구 「아직 기록이 없어요」·clamp 없음)"
  - "StockInfoModal — 차트 | 종목정보 | 뉴스·토론 3탭 팝업 (card/stock-info-modal.tsx)"
affects: [18-11, 18-12, 18-13]

actuals:
  tokens: 21050
  tasks: 3
  commits: 6
plan_head_before: bf11432ae06f61e58b25af1186e434ead49bd1e3

tech-stack:
  added: []
  patterns:
    - "기존 공용 컴포넌트에 새 표면을 붙일 때는 선택 prop 을 스위치로 두고, 없을 때의 DOM 이 바이트 단위로 같음을 변경 전후 덤프로 대조한다"
    - "선택 시맨틱은 첫 셀 <button aria-pressed> — 행 role=button 은 안의 취소 버튼과 nested-interactive 가 된다. 키보드 click 이 행 onClick 으로 버블해 경로가 하나다"
    - "탭 임베드는 별도 return 분기 — 취소·선택 규율은 부모 상태/헬퍼를 그대로 받아 두 벌이 생기지 않는다"
    - "포털 fixed 요소와의 겹침은 z-index 가 아니라 실측 높이의 bottom + margin-bottom 여백으로 푼다"
    - "제어형 Radix Dialog 에 DialogTrigger 가 없으면 닫힐 때 포커스가 body 로 떨어진다 — 열리는 순간의 activeElement 를 기억했다가 onCloseAutoFocus 에서 돌려준다"

key-files:
  created:
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/card/stock-info-modal.tsx
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
  modified:
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/trading/strategy-log.tsx

key-decisions:
  - "공용 패널의 미체결·잔고는 AccountPanel 계좌 전용 모드를 탭 임베드(section prop)로 쓴다. 열 구성은 UI-SPEC 공용 패널 원문이고 언제나 표(좁으면 가로 스크롤)다. 취소·선택 규율은 같은 코드이며 다계좌 합산은 만들지 않았다(/me 담당)"
  - "미체결 행 선택 시맨틱은 첫 셀 <button aria-pressed>(UI-SPEC 허용안 중 하나)이다. 행 role=button 안에 취소 버튼이 들어가면 nested-interactive 가 되기 때문이다"
  - "선택 토글(재선택 = 해제)은 SharedPanels 한 곳에서 onSelectUnfilled(null) 로 올린다. AccountPanel 은 「이 행을 눌렀다」만 알린다(시그니처 (row) 유지)"
  - "주문번호가 빈 행은 취소 버튼도 disabled + title 「접수 전(주문번호 없음)은 취소할 수 없어요」 — 원주문번호 없는 취소는 반드시 거부되는 버튼이다. 기본 모드에도 적용했다(기존 픽스처에는 빈 주문번호가 없어 DOM 무변)"
  - "임베드 모드의 취소 결과는 그 행 바로 아래 줄이고, 거부도 role=status 다(E13 error). 기본 모드의 거부 role=alert 는 기존 계약 그대로"
  - "더티 바 겹침은 z-index 가 아니라 실측 높이(여러 장이면 최대값, 못 재면 128px)의 bottom·margin-bottom 인라인 여백으로 푼다"
  - "폰 sticky 공용 패널은 기본 접힘이다(목업 기본값). 펼친 패널이 카드를 가리지 않게 사용자가 연다"
  - "종목정보 팝업은 기존 종목상세 섹션을 같은 순서로 조립한다. 통계 그리드만 종목상세와 같은 fetchStockDetail 을 부르고, 실패해도 형제 섹션은 뜬다"
  - "팝업 크기 경계는 뷰포트 min-[700px](목업 @media 정본)이다. sm(640)이 아니다. 모달은 컨테이너 밖이라 뷰포트 기준이 맞다"
  - "Radix Portal 가정(A5)은 코드로 확인했다 — ui/dialog 의 DialogContent 가 내부에서 DialogPortal 로 감싼다. 명시 포털을 추가로 두지 않았다"

requirements-completed: [TRADE-09]

coverage:
  - deliverable: "AccountPanel 미체결 행 선택 prop — 콜백 없으면 DOM 동일 · 클릭 1회 · aria-pressed · 접수 전/취소보관 선택 불가 · Enter/Space 토글 · 행 title"
    human_judgment: false
    verification:
      - kind: test
        ref: "account-panel.test.tsx ㉝~㊴ (8 cases, 파일 52 passed)"
        status: pass
      - kind: command
        ref: "변경 전/후 AccountPanel 렌더 innerHTML 덤프(종목 축 · 계좌 전용 두 모드) cmp → IDENTICAL"
        status: pass
      - kind: command
        ref: "! grep -nE \"pendingStatus *[=!]==? *['\\\"]\" account-panel.tsx"
        status: pass
  - deliverable: "공용 패널 3탭 — 라벨·빈 문구 3종·스피너 없음·단일 계좌 임베드·열 구성·행 선택/해제·행 아래 인라인 취소 결과·현재가 미수신 —·로그 줄바꿈·긴 이름 ellipsis·폰 접기·더티 바 여백"
    human_judgment: false
    verification:
      - kind: test
        ref: "shared-panels.test.tsx (15 cases)"
        status: pass
      - kind: command
        ref: "! grep -nE 'z-\\[?(4[1-9]|[5-9][0-9])' shared-panels.tsx · ! grep -nE '\\b(sm|md|lg|xl):' shared-panels.tsx"
        status: pass
  - deliverable: "종목정보 팝업 — code 부재 미개방 · 제목/설명 a11y · 3탭(호가주문 없음) · ✕/배경/ESC · 닫으면 언마운트 · 포커스 복귀 · body 포털 · 차트 색 oklch 금지"
    human_judgment: false
    verification:
      - kind: test
        ref: "stock-info-modal.test.tsx (12 cases)"
        status: pass
      - kind: command
        ref: "! grep -nE 'oklch\\(' stock-info-modal.tsx · grep -c DialogDescription → 3"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp test → 88 files, 1284 passed, 1 skipped (하한 1008) · typecheck exit 0 · eslint 0"
        status: pass
  - deliverable: "폰 sticky 공용 패널 펼침 시 격자·더티 바와 겹침 0 · 잘림 0 · 팝업 실제 크기(폰 시트 / 960 중앙) · 목업 대비 시각 대조"
    human_judgment: true
    rationale: "두 표면 모두 아직 어느 라우트에도 마운트되지 않았다. 18-11 작업대 조립 뒤 dev 화면에서 대조하고, 겹침 0 의 실측은 18-13 Playwright boundingBox() 가 맡는다. jsdom 은 레이아웃·컨테이너 쿼리를 평가하지 않는다"
    verification:
      - kind: manual
        ref: "18-11 조립 후 dev 대조 · 18-13 e2e boundingBox"
        status: pending

metrics:
  duration: "~16분"
  completed: 2026-09-22
---

# Phase 18 Plan 09: 공용 패널 + 종목정보 팝업 Summary

작업대 아래쪽 두 표면을 만들었습니다. 하나는 전 종목을 합산해 보여주는 **공용 패널**이고, 다른 하나는 카드 헤더 ⓘ 가 여는 **종목정보 팝업**입니다.

- **공용 패널:** 미체결 (N) · 잔고 (N) · 전략 로그 3탭입니다. 미체결 행을 누르는 것이 수동주문 폼에서 정정·취소를 시작하는 유일한 방법입니다.
- **종목정보 팝업:** 차트 · 종목정보 · 뉴스·토론 3탭입니다.

두 표면 모두 기존 컴포넌트(`AccountPanel` · `StrategyLog` · 종목상세 섹션)를 그대로 가져다 썼고, 새 데이터 경로는 만들지 않았습니다.

## 무엇을 만들었나

### `orderbook/account-panel.tsx` (기존 파일에 prop 추가)

**미체결 행 선택 (Task 1)** — `onSelectUnfilled?` · `selectedOrderNo?`
- 콜백이 곧 스위치입니다. 콜백을 넘기지 않으면 **DOM 이 한 글자도 달라지지 않습니다.** 변경 전과 후에 두 모드의 innerHTML 을 덤프해 `cmp` 로 대조했습니다.
- 선택은 첫 셀의 `<button aria-pressed>` 로 합니다. 행에 `role=button` 을 주면 그 안의 취소 버튼이 「버튼 안의 버튼」이 되기 때문입니다.
  - 키보드 Enter/Space 는 이 버튼의 click 이 행 `onClick` 까지 버블해 전달됩니다. 마우스와 같은 경로라 콜백이 한 번만 불립니다.
  - 취소 버튼 클릭은 행까지 전파되지 않게 막았습니다.
- 행 `title` 은 「행을 누르면 수동주문 폼에서 정정·취소할 수 있어요」입니다. 선택된 행은 accent 색으로 강조합니다(UI-SPEC Accent 6번).
- 선택할 수 없는 행은 폼과 **같은 함수**인 `unfilledSelectBlockReason` 으로 판정합니다. 판정 근거는 빈 주문번호와 `pendingCancelSent` 이고, 문구는 비교하지 않습니다.
- 주문번호가 빈 행은 취소 버튼도 disabled 이고, `title` 에 사유를 적습니다.

**탭 임베드 모드 (Task 2)** — `section` · `originOf?` · `priceOf?`
- 별도 return 분기로 그 섹션 하나만 그립니다. 계좌 머리와 섹션 제목은 그리지 않습니다.
- 열 구성은 UI-SPEC 원문 그대로입니다.
  - 미체결: 종목 · 거래소 · 구분 · 주문가 · 주문/미체결 · 주문No · 취소
  - 잔고: 종목 · 수량 · 매도가능 · 평단 · 현재가 · 평가손익 · 손익률
- 언제나 표로 그리고, 좁으면 가로로 스크롤합니다.
- 취소 결과는 **그 행 바로 아래 줄**에 `role="status"` 로 띄웁니다. 행이 이미 사라졌으면 표 아래에 띄웁니다.
- 현재가를 모르면 현재가 · 평가손익 · 손익률이 「—」입니다.

### `trading/workbench/shared-panels.tsx` — `SharedPanels`

- 탭 라벨은 「미체결 (N)」·「잔고 (N)」·「전략 로그」입니다. 미체결·잔고 탭은 `AccountPanel` 임베드를 쓰고, 계좌는 상태줄에서 고른 **단일 계좌**입니다.
- 선택 토글은 여기 한 곳에서 처리합니다. 선택된 행을 다시 누르면 `null` 을 올려 선택을 해제합니다.
- 반응형은 컨테이너 `wb` 기준입니다.
  - 기본(폰 밴드): `sticky bottom-0 z-20` 접이식 바입니다. 「펼치기 ▴」/「접기 ▾」로 접고 펼치며, 기본은 접힘입니다. 본문 높이는 최대 40vh 입니다.
  - `@min-[700px]/wb:` 이상: 일반 섹션이고 본문은 높이 제한 없이 늘어납니다.
- **레이어 예산:** 더티 바를 z-index 로 덮지 않습니다.
  - `dirtyBarVisible` 이면 `[data-slot=dirty-action-bar]` 의 실측 높이만큼 `bottom` 과 `margin-bottom` 을 인라인으로 줍니다. 바가 여러 장이면 가장 큰 값을 쓰고, 잴 수 없으면 128px 입니다.
  - `bottom` 은 폰에서 sticky 패널이 바 위에 멈추게 하고, `margin-bottom` 은 페이지 끝까지 스크롤해도 패널이 바 위에 오게 합니다.
- **겹침 0 의 실측은 18-13 Playwright `boundingBox()` 가 맡습니다.** 이 plan 의 테스트는 여백 스타일이 적용되는지까지만 단언합니다(jsdom 에는 레이아웃이 없습니다).

### `trading/strategy-log.tsx`

- `variant="embed"` 를 추가했습니다. 카드 테두리와 제목이 없고, 빈 문구는 「아직 기록이 없어요」입니다.
- 메시지는 줄 수 제한(clamp) 없이 줄바꿈하고(`min-w-0` + `[word-break:keep-all]`), 목록 높이 상한도 없습니다.
- `StrategyLogEntry.who?` 를 추가해 종목명을 표시합니다. 기본 `card` 변형은 그대로입니다.

### `trading/card/stock-info-modal.tsx` — `StockInfoModal`

- 탭 본문은 `stock-detail-client` 와 **같은 섹션을 같은 순서로** 조립합니다.
  - 차트: `StockDailyChartSection`
  - 종목정보: 통계 그리드 · 테마 · 상한가 다음날 이력 · 동반상승
  - 뉴스·토론: 뉴스 · 종목토론
- 호가주문 탭은 넣지 않았습니다.
- 통계 그리드만 종목상세와 같은 `fetchStockDetail` 을 부릅니다. 이 조회가 실패해도 형제 섹션은 그대로 뜹니다.
- **포털:** `ui/dialog` 의 `DialogContent` 가 내부에서 `DialogPortal` 로 감싸는 것을 코드로 확인했습니다. 테스트가 「모달 DOM 이 카드 `<article>` 의 자손이 아니다」를 단언합니다.
- **크기:** 폰에서는 전체화면 시트이고, 뷰포트 `min-[700px]` 이상에서는 최대 960px 로 가운데에 뜹니다. 본문은 세로로 스크롤합니다.
- **닫기:** ✕(`aria-label` 「닫기」) · 배경 클릭 · ESC 로 닫힙니다. 닫으면 내용이 언마운트되고, 다시 열면 차트 탭부터 시작합니다.
- **포커스:** 열리면 초기 포커스가 닫기 버튼에 가고, 닫으면 트리거(ⓘ)로 돌아갑니다.
- `code` 가 없으면 `open` 을 받아도 아무것도 그리지 않습니다. 카드 헤더 ⓘ 가 비활성인 것과 같은 사실을 말합니다.

## 검증

- `pnpm --filter @gh-radar/webapp test`: 88 files, **1284 passed**, 1 skipped (직전 1257, 하한 1008)
- `pnpm --filter @gh-radar/webapp run typecheck`: exit 0. 변경 파일 eslint 0 문제입니다.
- grep 게이트는 모두 통과했습니다.
  - account-panel: 문구 비교 판정 0건
  - shared-panels: z-40 이상 레이어 0건, 뷰포트 브레이크포인트 0건
  - stock-info-modal: `oklch(` 0건, `DialogDescription` 3건
- 참고로 plan 의 `pnpm --filter … test -- <이름>` 형태는 `--` 때문에 필터가 무시되고 전체 스위트가 돕니다. 대상 파일이 포함된 상위 집합이라 판정은 유효합니다(88 files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 제어형 Dialog 의 포커스가 트리거로 돌아오지 않음**
- **발견:** Task 3 테스트 ⑥
- **문제:** RESEARCH 는 포커스 복귀를 「Radix 기본」으로 가정했습니다. 그런데 `DialogTrigger` 가 없는 제어형 Dialog 에서는 Radix 가 비어 있는 `triggerRef` 에 포커스를 주려다 `body` 로 떨어뜨립니다. ⓘ 는 카드 헤더 소유라 `DialogTrigger` 로 감쌀 수 없습니다.
- **수정:** 열리는 순간(`onOpenAutoFocus`)의 `activeElement` 를 기억해 두었다가, `onCloseAutoFocus` 에서 기본 동작을 막고 그 요소로 포커스를 돌려줍니다.
- **커밋:** d2012b1

**2. [Rule 2 - 누락된 가드] 주문번호가 빈 행의 취소 버튼이 눌렸음**
- **발견:** Task 1
- **문제:** 기존 `cancellable` 은 빈 `orderNo` 를 보지 않았습니다. 원주문번호 없는 취소는 반드시 거부됩니다.
- **수정:** 빈 주문번호 행의 취소 버튼을 `disabled` + `title` 사유로 막았습니다. 기본 모드에도 적용했고, 기존 픽스처에는 해당 행이 없어 DOM 은 달라지지 않았습니다.
- **커밋:** 2f43066

**3. [Rule 3 - 차단 회피] AccountPanel 에 탭 임베드 모드 추가 (계획 파일 목록은 Task 1 한정)**
- **문제:** plan 은 「AccountPanel 계좌 전용 모드를 그대로 쓴다」와 「UI-SPEC 열 구성 원문」을 동시에 요구합니다. 그런데 기존 계좌 전용 모드는 탭이 없는 미체결·잔고 세로 나열이고, 열 구성도 다르며, 표와 카드 전환이 뷰포트 1280 기준입니다.
- **수정:** `section` prop 으로 한 섹션만 그리는 분기를 두고, 취소·선택 규율은 부모의 상태와 헬퍼를 그대로 받게 했습니다(두 벌이 생기지 않습니다). 전 종목 현재가·출처 배지용 `priceOf?`·`originOf?` 도 추가했습니다.
- **커밋:** ca5e37f

**4. [Rule 3] `StrategyLog` 에 embed 변형 추가 (계획 파일 목록 밖)**
- **문제:** 기존 로그 카드는 제목과 테두리가 있고, 빈 문구(「아직 반영된 이벤트가 없어요」)와 높이 상한 160px 가 공용 패널 계약과 다릅니다.
- **수정:** `variant="embed"` 와 `StrategyLogEntry.who?` 를 추가했습니다. 기본 변형은 무변입니다.
- **커밋:** ca5e37f

**5. [Rule 2] 오류 문구 색**
- 팝업 통계 그리드의 조회 실패 문구에 `--destructive` 대신 `--muted-fg` 를 썼습니다. UI-SPEC §Color 의 Destructive 허용 목록에 이 자리가 없습니다. 문구는 종목상세의 기존 문구(「데이터를 불러오지 못했습니다」)입니다.

### 계획 문면과 다르게 한 것

- **차트 기간 버튼:** UI-SPEC 은 「1개월/3개월/6개월/1년」이라고 적었지만, 기존 `StockDailyChartSection` 의 기간 토글(`DAILY_OHLCV_RANGES`)을 그대로 썼습니다. 「기존 탭 본문 그대로 재사용·새 데이터 경로 없음」(D-25)이 우선이라, 새 변형을 만들지 않았습니다.
- **팝업 크기 경계:** plan 은 `sm:` 관례를 언급했지만, 목업 정본(`@media (max-width: 699px)`)을 따라 뷰포트 `min-[700px]:` 를 썼습니다. `sm`(640)을 쓰면 640~699 폭에서 폰 시트 대신 중앙 모달이 됩니다.
- **Task 1 ㉞-a(취소 클릭 ≠ 선택) · ㉝(콜백 없음 = DOM 동일):** RED 단계에서 이미 통과했습니다. 새 동작이 아니라 **회귀 잠금**이라서입니다. ㉝ 은 별도로 변경 전 코드와 바이트 대조를 했습니다.

**Total deviations:** 5 auto-fixed (Rule 1 ×1 · Rule 2 ×2 · Rule 3 ×2) + 문면 차이 3건. **Impact:** 기존 호출부(호가 탭 · VI · My page)의 DOM 과 동작은 그대로입니다. 새 표면만 넓어졌습니다.

## TDD Gate Compliance

세 Task 모두 RED → GREEN 순서로 커밋했습니다. REFACTOR 커밋은 없습니다.
- Task 1: RED f42f4b1 (6 fail) → GREEN 2f43066
- Task 2: RED be885fa (import 실패) → GREEN ca5e37f
- Task 3: RED 8ea6e7a (import 실패) → GREEN d2012b1

## 다음 plan 이 알아야 할 것 (18-11 작업대 조립)

- **`SharedPanels` 가 받는 값:** `accountNo`(상태줄 계좌), `account`(`useRelayContext` 의 그 계좌 상태), `status`, `logEntries`, `selectedOrderNo`, `onSelectUnfilled(row | null)`, `dirtyBarVisible`
  - `selectedOrderNo`·`onSelectUnfilled` 는 작업대 상태로 끌어올리고, 선택된 행을 **그 종목 카드**의 `ManualOrderForm.selectedUnfilled` 로 내려 주면 D-21 이 닫힙니다. 폼의 칩 ✕(`onClearSelection`)도 같은 상태를 `null` 로 바꾸면 됩니다.
  - `dirtyBarVisible` 은 카드들이 올리는 `onDirtyCountChange` 합이 0보다 클 때 `true` 입니다.
  - `logEntries` 는 카드별 로그를 합쳐 넘기되, `who` 에 종목명을 실어야 목업처럼 종목이 붙습니다.
- **출처 배지(`originOf`):** relay `RelayUnfilled` 에는 출처(origin) 필드가 **없습니다.** 모르는 행은 `undefined` 를 돌려 배지를 그리지 않게 하세요. 「전략 있는 종목 = 상따」 같은 추정은 수동 주문을 상따로 오표기합니다. 진실 원천이 필요하면 relay 에 `origin` 을 싣는 별도 작업입니다.
- **현재가(`priceOf`):** 열린 카드가 구독 중인 시세로 채우면 됩니다. 구독하지 않은 종목은 「—」로 남는 것이 계약입니다(⑤).
- **팝업:** `StockInfoModal` 은 작업대나 카드 어디서 렌더해도 포털로 나갑니다. 카드 헤더 `onInfo` 를 받아 `{code, name, open}` 상태를 **작업대 1곳**에 두면 모달은 한 번에 하나만 열립니다.

## Known Stubs

없습니다. `originOf`·`priceOf` 는 선택 prop 이고, 넘기지 않았을 때 「배지 없음」·「—」 로 정직하게 표시됩니다. 18-11 이 연결합니다.

## Threat Flags

없습니다. 새 네트워크 경로는 없습니다. 팝업은 종목상세와 같은 조회(`fetchDailyOhlcv` · `fetchStockDetail` · 섹션별 기존 API)를 쓰고, 취소는 기존 `sendOrder({kind:'cancel'})` 경로 그대로입니다.
- T-18-42 는 불리언과 빈 문자열 판정으로 막았습니다(grep 게이트).
- T-18-43 은 선택 페이로드가 `RelayUnfilled` 행 전체라서 막힙니다.
- T-18-44 는 여백으로 비켜서 막았습니다(z-index 금지 grep).
- T-18-46 은 닫으면 언마운트되게 해서 막았습니다.

## Self-Check: PASSED

- 신설 4파일이 존재하고 수정 3파일이 반영된 것을 확인했습니다.
- 커밋 6건(f42f4b1 · 2f43066 · be885fa · ca5e37f · 8ea6e7a · d2012b1)이 git log 에 있습니다. `git rev-list --count bf11432..HEAD` = 6 입니다.
