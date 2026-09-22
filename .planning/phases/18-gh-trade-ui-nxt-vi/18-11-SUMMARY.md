---
phase: 18-gh-trade-ui-nxt-vi
plan: 11
subsystem: ui
tags: [trading, workbench, react, container-query, tdd]
status: complete

requires:
  - phase: 18-05
    provides: "ViSettingsRows · ViTriggerStrip (wb 컨테이너 열 접기)"
  - phase: 18-06
    provides: "StrategyCard(제어형 exchange·open, isin 콜백) · LC_CONTAINER_CLASS"
  - phase: 18-08
    provides: "BreakoutStrip · StockAddBar"
  - phase: 18-09
    provides: "SharedPanels(selectedOrderNo·onSelectUnfilled·dirtyBarVisible) · StockInfoModal"
  - phase: 18-10
    provides: "CardBody variant=card · queuedWindowBadgeOf"
provides:
  - "/trading 라우트(app/trading/page.tsx) — AppShell + Suspense + TradingWorkbench"
  - "TradingWorkbench — @container/wb 셸, 카드 집합 단일 소유, 섹션 10개 조립"
  - "WorkbenchStatusBar · AccountPill — 카운터·77 구간 배지·알림 2종·반영·단 수 세그먼트"
  - "CardGrid — 펼침 우선 + 접힘 스택 한 칸, renderOrderOf"
  - "lib/use-leave-warning.ts (useLeaveWarning · LEAVE_WARNING) · lib/use-vi-end-alerts.ts (useViEndAlerts)"
  - "StrategyCard onLogChange? · BreakoutStrip onCountsChange? · DmaGateSurface 「트레이딩」"
affects: [18-12, 18-13]

actuals:
  tokens: 29150
  tasks: 3
  commits: 6
plan_head_before: 8c1da468ff6b42f69b75a30e92791e46691d75e8

tech-stack:
  added: []
  patterns:
    - "카드 집합은 작업대 1곳이 소유하고, 등록 전략은 '처음 보는 키'일 때만 접힌 카드로 들어온다(멤버십만 읽음 — 값은 카드가 자기 key 로 find)"
    - "카드 콜백은 전부 isin 을 받는 안정 콜백 + 라벨 Map 은 ref 로 읽어 카드 memo 유지"
    - "wb 폭은 루트 ResizeObserver 한 번 → phoneBand 로 상태줄 세그먼트 조건부 렌더(격자 열 수는 CSS)"
    - "카드 로그는 객체 동일성(WeakSet)으로 합쳐 remount 뒤에도 중복 없이 공용 패널로"

key-files:
  created:
    - webapp/src/app/trading/page.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/workbench/card-grid.tsx
    - webapp/src/lib/use-leave-warning.ts
    - webapp/src/lib/use-vi-end-alerts.ts
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
    - webapp/src/components/trading/__tests__/card-grid.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  modified:
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/components/trading/dma-gate.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/vi-client.tsx

key-decisions:
  - "카드 ✕ 는 서버 전략 삭제가 아니다 — 등록 전략 카드는 확인 다이얼로그(「서버의 상따 전략은 그대로 동작해요」)만 거치고, 작업대는 lc.set 을 보내는 두 번째 송신 경로를 만들지 않는다"
  - "등록 전략은 처음 보는 키일 때만 접힌 카드로 들어온다 — 닫은 등록 전략 카드는 같은 세션에서 다시 생기지 않는다"
  - "상태줄 「돌파 N · 신규 M」 은 BreakoutStrip 이 그린 행 수를 onCountsChange 로 받아 스트립과 같은 값을 쓴다"
  - "「반영 HH:MM:SS」 는 작업대가 서버 push(전략·돌파·VI 주문·VI 설정·77) 참조가 바뀐 시각을 찍어 내린다. 마운트 전부터 있던 값은 반영으로 치지 않는다"
  - "단 수 세그먼트는 wb 폭(ResizeObserver) 판정으로 폰 밴드에서 조건부 렌더 제외, 판정 전 첫 페인트만 CSS 폴백"
  - "미체결 선택 행은 같은 종목·거래소 ∧ 카드 계좌 = 상태줄 계좌인 카드에만 내려간다(다른 계좌로 정정·취소가 나가는 경로 차단)"

requirements-completed: []

duration: 15min
completed: 2026-09-22
---

# Phase 18 Plan 11: `/trading` 작업대 조립 Summary

**`/trading` 한 페이지에 상태줄(카운터·77 구간 배지·알림 2종·단 수)·VI 2줄·VI/돌파 스트립·종목 추가·펼침 우선 스택 격자·공용 패널을 조립했습니다. 카드 집합의 소유자는 `TradingWorkbench` 하나이고, 서버 에코는 카드에 나눠 주지 않습니다.**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-09-22T02:08:18Z
- **Completed:** 2026-09-22T02:23:40Z
- **Tasks:** 3
- **Files:** 신설 9 · 수정 5

## Accomplishments

- **상태줄 (`workbench-status-bar.tsx`)**
  - DMA 필, 돌파·VI 발동·거래 종목 카운터, 「신규/미확인」 필(0 이면 DOM 에 없음), 임계 문구, 반영 시각이 섭니다.
  - 77 구간 배지는 `queuedWindowBadgeOf` 가 판정합니다. 모르면 배지를 그리지 않습니다. 이 파일은 벽시계를 읽지 않습니다(grep 0건).
  - 알림 2종이 나란히 섭니다. 돌파 알림음은 기본 꺼짐이고, 차단 상태면 「클릭해 활성화」가 뜨며 `resume` 은 그 클릭 안에서만 부릅니다. VI 마감알림은 옛 VI 카드에서 옮겨 왔습니다(권한 거부 사유는 인라인 `role="status"`).
  - 단 수 세그먼트는 폰 밴드에서 DOM 에서 빠집니다.
  - 계좌 필 `title` 은 「새로 추가하는 카드의 기본 계좌 · 이미 있는 카드는 자기 계좌를 유지」를 말합니다.
- **카드 격자 (`card-grid.tsx`)**
  - 펼친 카드가 먼저 한 칸씩 서고, 접힌 카드는 스택 한 칸에 gap 8px 로 쌓입니다. 스택 라벨과 전환 애니메이션은 없습니다.
  - 열 수는 `data-cols` 와 `@min-[700px]/wb:` 클래스로만 바뀌고, 폰 밴드는 1단입니다. JS 폭 측정과 뷰포트 분기는 없습니다(grep 0건).
  - ✕ 뒤 포커스는 다음 카드 헤더로, 다음 카드가 없으면 검색란으로 갑니다.
- **작업대 셸 (`trading-workbench.tsx` + `app/trading/page.tsx`)**
  - 섹션 10개를 UI-SPEC 순서로 조립합니다. 루트는 `@container/wb` 이고 `DmaGate` 는 이 한 곳에서만 감쌉니다.
  - 돌파 칩과 종목 추가는 KRX · 펼침 카드를 만들고, 같은 ISIN 이면 새 카드 대신 기존 카드를 펼칩니다.
  - 등록 전략은 처음 보는 키일 때 접힌 카드로 들어옵니다.
  - `?focus=` 는 마운트 때 한 번만 소비합니다.
  - 이탈 경고는 카드 더티 합 + VI 더티 기준으로 한 곳에서 겁니다.
  - 미체결 행을 선택하면 같은 키 카드의 수동주문으로 선택이 내려가고, 그 카드가 펼쳐집니다.
  - 종목정보 팝업과 VI 마감 타이머도 작업대 한 곳이 소유합니다.

## Task Commits

1. **Task 1: 상태줄** — RED `4f91df7` → GREEN `e2f33f7`
2. **Task 2: 카드 격자** — RED `4fe8bb8` → GREEN `33bfcd3`
3. **Task 3: 작업대 셸 + 라우트** — RED `9e3a9d6` → GREEN `833a72f`

## TDD Gate Compliance

세 Task 모두 RED(import 실패 · `Tests no tests`) → GREEN 순서로 커밋했습니다. REFACTOR 커밋은 없습니다. Task 1 은 구현 파일을 먼저 썼다가 스크래치로 옮겨 테스트만으로 RED 를 확인한 뒤 커밋하고 되돌렸습니다.

## Verification

- `pnpm --filter @gh-radar/webapp test` — 93 files · **1375 passed** · 1 skipped (기준선 1008 이상)
  - 이번 plan 신규: workbench-status-bar 20 · card-grid 15 · trading-workbench 18
- config `build_command` 전문(shared build · relay typecheck · relay typecheck:tests · webapp typecheck) — exit 0
- grep 게이트
  - 상태줄 `new Date(`/`Date.now()`: 0건 · `queuedWindow`: 6건
  - 격자 `transition|animate-|getBoundingClientRect|offsetWidth`: 0건 · `(sm|md|lg|xl):`: 0건
  - 작업대 `@container/wb`: 2건 · `DmaGate`: 5건
  - `app/trading/page.tsx` 존재
- **실브라우저 실측(human-check 대용).** 로컬 relay + 스텁 게이트웨이 + 임시 Playwright 스크립트(커밋하지 않음)로 등록 전략 3건을 `?focus=` 로 열었습니다.
  - 390 · 820 · 1440 모두 문서 가로 넘침 0, 루트 안 잎 요소 잘림 0.
  - wb 374px: 세그먼트 DOM 부재, 격자 1열.
  - 788px: 1/2/3단 = 788 / 388×2 / 254×3.
  - 1152px: 1/2/3단 = 1152 / 570×2 / 376×3.
  - 스크린샷으로 [펼친 A | 스택(접힌 2장)] 정렬, 섹션 순서, 상태줄 폰 밴드 wrap(잘림 없음)을 확인했습니다.
  - 목업과의 최종 눈 대조는 사용자 몫으로 남깁니다(아래).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 상태줄 돌파 카운터를 스트립과 같은 값으로**
- **발견:** Task 3
- **문제:** 상태줄이 `rateCrossItems.length` 를 세면 스트립이 지운·이탈 행을 뺀 수와 갈립니다(TRADE-09 precision).
- **조치:** `BreakoutStrip` 에 선택 prop `onCountsChange({total, fresh})` 를 더해 스트립이 그린 값을 그대로 받습니다.
- **파일:** breakout-strip.tsx · **커밋:** 833a72f

**2. [Rule 2 - 기능 보존] VI 마감 타이머를 작업대에도**
- **문제:** 토글만 옮기면 `/trading` 에서는 「켜져 있는데 안 울리는」 스위치가 됩니다.
- **조치:** `vi-client.tsx` 의 `useViEndAlerts` 를 `lib/use-vi-end-alerts.ts` 로 옮겨 두 화면이 같은 훅을 씁니다.
- **[Rule 1] 함께 고친 것:** 끈 뒤에도 이미 걸린 타이머가 울리던 버그. 이제 꺼지면 타이머를 풉니다.
- **커밋:** 833a72f

**3. [Rule 2 - 기능 보존] 공용 패널 「전략 로그」 에 카드 로그 합치기**
- **문제:** 로그는 카드 훅 안에만 있어 공용 패널 탭이 비어 있었습니다.
- **조치:** `StrategyCard` 에 선택 prop `onLogChange(isin, log)` 를 더했습니다. 작업대는 객체 동일성(WeakSet)으로 새 줄만 받고 `who` 에 종목명을 답니다.
- **부작용 처리:** 펼침/접힘 remount 로 카드가 첫 에코 문장을 다시 쓰면, 같은 종목의 직전 줄과 같은 문장은 합친 목록에 두 번 쌓지 않습니다.
- **커밋:** 833a72f

**4. [Rule 2 - 보안] 미체결 선택 전달 범위**
- **문제:** 공용 패널은 상태줄 계좌 기준인데, 카드는 자기 키의 계좌를 씁니다. 그대로 두면 다른 계좌 카드의 수동주문 폼으로 정정·취소가 나갈 수 있었습니다.
- **조치:** 선택 행은 **같은 ISIN ∧ 같은 거래소 ∧ 카드 계좌 = 상태줄 계좌**인 카드에만 내립니다. 선택은 살아 있는 `unf` 행으로만 유지하고(체결·취소되면 해제), 계좌를 바꾸면 해제합니다.
- **커밋:** 833a72f

**5. [Rule 3] `useLeaveWarning` 을 lib 로**
- plan 의 「작업대로 옮긴다」와 artifacts 표의 「webapp lib」 가운데 lib 쪽을 따랐습니다(`lib/use-leave-warning.ts`).
- 작업대는 한 번만 부르고, 옛 상따 화면은 18-12 까지 같은 훅을 import 합니다.

### 계획 문면과 다르게 한 것

- **카드 상태에 `accountNo` 를 넣었습니다.** plan 은 `{isin, name?, code?, exchange, open}` 이지만, Q-3(등록된 카드는 자기 키의 계좌 유지)을 지키려면 카드마다 계좌가 필요합니다. 새 카드는 만들 때의 상태줄 계좌로 고정되고, 계좌 도착 전에 만든 카드는 계좌가 정해지는 순간 채웁니다.
- **등록 전략 카드의 ✕.** UI-SPEC E7 은 「기존 삭제 확인 다이얼로그(Phase 16)」를 가리키지만 그런 다이얼로그는 코드베이스에 없습니다(18-06 확인). 작업대가 `lc.set` 을 보내면 에코 상관의 두 번째 송신 경로가 생깁니다. 그래서 카드만 닫는 확인 다이얼로그로 두었습니다. 문구: 「등록된 전략이 있는 카드예요 / 카드를 닫아도 서버의 상따 전략은 그대로 동작해요. 전략을 멈추려면 카드에서 매수·매도 스위치를 끄세요.」 → **사용자 결정 대기(아래).**
- **제목은 `h1` 입니다.** UI-SPEC 표는 `h2` 지만 앱 셸에 `h1` 이 없어, 옛 상따·VI 화면처럼 페이지 제목을 `h1` 으로 두었습니다. 시각 크기는 `--t-h3` 로 목업과 같습니다.
- **계좌 필은 제목줄에 있습니다(목업 `:728` 정본).** 컴포넌트(`AccountPill`)는 상태줄 파일에 둡니다.
- **DMA 필의 「다시 연결」.** 자동 재연결 중에는 버튼이 없습니다. 18-10 호가 탭과 같게 `failed`·`manual_required`·`session_rejected`(자동 복구 포기)에서만 「다시 연결」을 세웁니다.
- **`DmaGateSurface` 에 「트레이딩」을 더했습니다.** 기존 템플릿 문구에 표면 이름만 넣은 것이고, 새 게이트 문구는 쓰지 않았습니다.

**Total deviations:** 자동 수정 5건(Rule 1 ×1 동반 · Rule 2 ×4 · Rule 3 ×1) + 문면 차이 6건. **Impact:** 추가 prop 은 전부 optional 이라 옛 화면 동작은 그대로입니다.

## 사용자 결정 필요

1. **등록 전략 카드 ✕ 의 의미.**
   - 지금: 카드만 닫습니다. 서버 전략은 계속 돌고, 같은 세션에서는 다시 나타나지 않습니다.
   - 대안: 확인 뒤 서버 전략까지 삭제합니다(스위치 전부 OFF 전송). 이렇게 하면 송신 경로가 카드 밖에 하나 더 생깁니다.
2. **목업 눈 대조(human-check).** dev(PORT 3100) `/trading` 을 `18-workbench-mockup.html` 과 섹션 순서·배치·문구 기준으로 전체 대조해야 합니다. 스크린샷 실측은 위와 같습니다.

## 다음 plan 이 알아야 할 것

- **18-12**
  - 사이드바 전략 링크 `/trading?focus=` 를 이미 `/trading` 위에서 누르면 URL 만 바뀌고 카드는 펼쳐지지 않습니다(마운트 1회 소비 규율). 필요하면 사이드바가 같은 경로일 때 다른 신호를 써야 합니다.
  - `useLeaveWarning` · `useViEndAlerts` 는 lib 에 있으니 옛 화면을 지워도 그대로 삽니다.
  - 옛 VI 카드의 마감알림 스위치와 옛 상따 StatusBar 는 옛 화면과 함께 지우면 됩니다.
- **18-13**
  - 폭 램프 실측값: wb 374(1열 · 세그먼트 부재) / 788(388×2, 254×3) / 1152(570×2, 376×3).
  - 주요 셀렉터: `[data-slot="trading-workbench"]` · `workbench-status-bar`(`data-status`) · `workbench-cols-segment`(radio 「1단/2단/3단」) · `card-grid`(`data-cols`) · `card-stack` · `card-grid-empty` · `workbench-close-confirm`(testid).
- **카드 remount.** 펼침/접힘은 스택 ↔ 격자 부모 이동이라 카드가 다시 마운트됩니다(D-09 재렌더). 접는 순간 폼의 미반영 값이 사라지는 것은 18-06 카드 설계(접힌 카드는 본문 미렌더) 그대로입니다.

## Known Stubs

없습니다.

## Threat Flags

없습니다. 새 네트워크 경로는 없습니다.
- T-18-52: 카드 prop 허용 목록 테스트로 막았습니다.
- T-18-53: `parseStrategyKey` 로만 해석하고, 등록된 키만 펼칩니다. 송신 0 을 테스트로 확인했습니다.
- T-18-54: 게이트 테스트로 막았습니다.
- T-18-56: 라벨 ref · 안정 콜백 테스트로 막았습니다.
- T-18-57: 조건부 렌더 테스트로 막았습니다.

## Self-Check: PASSED

- 신설 9파일이 모두 존재합니다.
- 커밋 6건(4f91df7 · e2f33f7 · 4fe8bb8 · 33bfcd3 · 9e3a9d6 · 833a72f)이 git log 에 있고, `git rev-list --count 8c1da46..HEAD` = 6 입니다.
