---
phase: quick-260923-hfk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/styles/globals.css
  - webapp/src/components/trading/workbench/card-grid.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [HFK-1A, HFK-2A]

estimate:
  tokens: 140000
  raw_tokens: 140000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "갤럭시 폴드 안쪽 화면(CSS 뷰포트 ≈707×823 → wb ≈691)에서 /trading 상태줄에 1단·2단·3단 세그먼트가 DOM 에 있고, 2단을 고르면 격자의 실제 열 수가 2 · 두 카드가 나란히 서고 · 카드는 폰 밴드로 그려지며 · 잘림(overflow) 0 이다 (HFK-1A)"
    - "격자 열 수 경계 B(wb 폭, 이상)는 계산이 아니라 실측으로 정한다 — 폰 밴드 카드가 잘림 0 으로 서는 clientWidth 하한 W 를 e2e 사다리(340·337·330·320)로 재고 B = 2×(W + 카드 테두리 합) + 격자 gap 12. B ≤ 690 이어야 폴드가 들어온다. 340 이 잘리거나 337 이 잘리면 실행을 멈추고 보고한다(카드 쪽 수정은 범위 밖) (HFK-1A)"
    - "wb 폭 = B−1 이면 세그먼트가 DOM 에 없고 격자는 저장값과 무관하게 1열이며, wb = B 면 세그먼트가 있고 2단 → 열 수 2 · 각 카드 clientWidth ≥ W · 잘림 0 이다 (HFK-2A)"
    - "폰 뷰포트 390(wb 374)·360 에서의 기존 단언 — 세그먼트 없음 · 1열 · 카드 폰 밴드 — 은 그대로 초록이다(e2e test 2 · 5 · 8 무수정) (HFK-2A)"
    - "다른 wb 700/830 사용처는 한 글자도 바뀌지 않는다 — 공용 패널 sticky 전환(shared-panels) · 돌파/VI 표 열 접기(breakout-strip · vi-order-list) · VI 설정 2열(vi-settings-rows). 폴드(wb 691 < 700)에서 공용 패널은 여전히 `position: fixed` 접이식 바다 (HFK-1A)"
    - "경계 값 B 의 정본은 globals.css §2.2b 의 `WB_COLS_BOUNDARY_PX = B` 한 줄이고, card-grid COLS_CLASS 리터럴 2 · 상태줄 CSS 폴백 리터럴 1 · trading-workbench TS 상수 1 · e2e 상수 1 이 같은 값을 든다. 카드 밴드 경계 셋(700·830·992)은 그대로다(test 4 무수정 초록) · 뷰포트 분기 신설 0 · 앱 셸 여백 램프 무변경 (HFK-1A)"
  artifacts:
    - path: "webapp/src/styles/globals.css"
      provides: "§2.2b 「격자 열 수 경계」 문단 — `WB_COLS_BOUNDARY_PX = B` 정본 · 실측 근거(W · 테두리 · gap) · 카드 밴드 경계와 다른 질문임을 명시 · 같은 값을 들어야 하는 세 곳"
      contains: "WB_COLS_BOUNDARY_PX"
    - path: "webapp/src/components/trading/workbench/card-grid.tsx"
      provides: "COLS_CLASS 2·3열 컨테이너 쿼리 리터럴이 B 를 쓴다 · 주석 ② 가 「격자 열 수 경계 ≠ 카드 밴드 경계」를 말한다"
      contains: "WB_COLS_BOUNDARY_PX"
    - path: "webapp/src/components/trading/workbench/workbench-status-bar.tsx"
      provides: "prop `singleColumnOnly: boolean | null`(구 phoneBand) · 첫 페인트 CSS 폴백 리터럴이 B 를 쓴다 · 주석 ③ 갱신"
      contains: "singleColumnOnly"
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "`WB_SINGLE_COLUMN_BELOW = B` 상수 · 같은 ResizeObserver 가 `phoneBand`(<700 · 공용 패널)와 `singleColumnOnly`(<B · 상태줄) 두 값을 갱신 · 주석 ⑤ 갱신"
      contains: "WB_SINGLE_COLUMN_BELOW"
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      provides: "4b 폰 밴드 카드 하한 사다리(W 잠금) · 2b 폴드 뷰포트 + 경계 −1/경계 케이스 · 상수 WB_COLS_BOUNDARY · PHONE_CARD_MIN_WIDTH · FOLD_VIEWPORT · 헬퍼 workbenchWidth/sizeWorkbenchTo"
      contains: "FOLD_VIEWPORT"
    - path: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx"
      provides: "singleColumnOnly true → 세그먼트 DOM 부재 · null → CSS 폴백 클래스"
      contains: "singleColumnOnly"
  key_links:
    - from: "webapp/src/styles/globals.css §2.2b WB_COLS_BOUNDARY_PX"
      to: "card-grid.tsx COLS_CLASS · workbench-status-bar.tsx CSS 폴백 · trading-workbench.tsx WB_SINGLE_COLUMN_BELOW · e2e WB_COLS_BOUNDARY"
      via: "같은 숫자 리터럴(Tailwind 소스 스캔 — 문자열 조립 불가) · Task 1 verify 의 일치 게이트가 sed 로 정본을 읽어 네 곳을 대조"
      pattern: "WB_COLS_BOUNDARY_PX"
    - from: "trading-workbench.tsx ResizeObserver(wb contentRect.width)"
      to: "WorkbenchStatusBar.singleColumnOnly · SharedPanels.phoneBand"
      via: "width < WB_SINGLE_COLUMN_BELOW → singleColumnOnly · width < WB_PHONE_BAND_BELOW(700) → phoneBand — 관찰자 하나, 판정 둘"
      pattern: "singleColumnOnly"
    - from: "e2e 4b 사다리(카드 clientWidth W 잘림 0)"
      to: "e2e 2b 경계 케이스(wb = B → 카드 clientWidth ≥ W)"
      via: "B = 2×(W+테두리)+12 공식이 2b 의 실측 단언으로 자기검증된다"
      pattern: "PHONE_CARD_MIN_WIDTH"
---

<objective>
갤럭시 폴드 안쪽 화면(물리 1856×2160 · DPR ≈2.625 → CSS 뷰포트 ≈707px · 앱 셸 `p-2` 램프로 `wb` ≈691px)에서 `/trading` 상태줄의 1단·2단·3단 세그먼트가 사라지고 카드가 1열에 갇힌다. 원인은 결함이 아니라 경계다 — 폰 밴드 격자 `wb <700` 은 §2.2b 표의 첫 경계(카드 본문 `lc` 기준 「2단 호가 260 + 2열 폼이 처음 안 잘리는 폭」)를 그대로 빌린 값이고, 「2열 격자가 서는 최소 wb 폭」을 실측한 값이 아니다. 카드는 격자 칸 안에서 자기 폭(`/lc`)으로 밴드를 고르므로 격자 열 수와 카드 밴드는 **다른 질문**이다.

**접근 (A) — 단 수 가능 경계만 분리한다.** 격자 열 지정(card-grid `COLS_CLASS`) · 세그먼트 노출(status-bar 조건부 렌더 + 첫 페인트 CSS 폴백) · 작업대의 「단 수」 판정만 새 경계 B 로 내리고, 나머지 wb 700/830 사용처(공용 패널 sticky · 돌파/VI 표 열 접기 · VI 설정 2열)는 **건드리지 않는다**. (B) 「wb 폰 밴드 경계 자체를 내리기」는 폴드에서 패널·표까지 컴팩트로 바뀌어 각 표면 재실측이 필요하므로 택하지 않는다.

**B 는 계산이 아니라 실측으로 정한다.** e2e `sizeCardTo` 방식으로 폰 밴드 카드를 clientWidth 340 → 337 → 330 → 320 순으로 맞춰 잘림 0 을 확인하고, 통과한 가장 좁은 폭 W 로 B = 2×(W + 카드 테두리 합) + 격자 gap 12 를 정한다. 337 은 폴드에서 2열일 때의 카드 폭((691−12)/2 − 2 = 337.5)이라 사다리에 넣는다. 결정표(테두리 합 2 기준 · 실측이 다르면 재계산):
- 320 통과 → W=320 · B=656
- 330 통과 · 320 실패 → W=330 · B=676
- 337 통과 · 330 실패 → W=337 · B=690 (폴드 wb 691 이 1px 여유로 들어온다 — SUMMARY 에 여유 폭을 적는다)
- 340 통과 · 337 실패 → **중단 · 보고**: 폴드 2열은 카드 폭을 손봐야 가능(B 후보 696 > 690) — 카드 쪽 수정은 범위 밖
- 340 실패 → **중단 · 보고**: 폰 밴드 카드가 344 아래에서 이미 잘린다 — 카드 쪽 수정은 범위 밖

`phoneBand` 라는 이름은 지금 「wb <700」과 「단 수 불가」 두 뜻을 겹쳐 쓴다. 상태줄이 받는 값의 뜻은 「단 수 세그먼트 불가(격자 1열 고정)」이므로 prop 을 `singleColumnOnly` 로 바꾼다. 공용 패널이 받는 `phoneBand`(wb <700)는 그대로다 — 작업대는 관찰자 하나로 두 값을 낸다. data-slot · aria 는 바뀌지 않아 e2e 셀렉터에 영향 없다.

Purpose: 폴드처럼 폰보다 넓지만 700 미만인 본문에서 사용자가 단 수를 고를 수 있어야 한다. 카드 한 장이 가로로 공간을 남기며 1열에 갇히는 것은 화면 낭비다.
Output: 코드 커밋 2건(Task 별 · 한글 · 경로 지정 스테이징 · push 없음) + SUMMARY(실측표: 사다리 각 폭의 통과/실패와 잘린 요소 · 테두리 합 · 확정 W/B · 폴드 wb 실측값과 여유 px).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@webapp/src/styles/globals.css
@webapp/src/components/trading/workbench/trading-workbench.tsx
@webapp/src/components/trading/workbench/workbench-status-bar.tsx
@webapp/src/components/trading/workbench/card-grid.tsx
@webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
@webapp/e2e/specs/trading-workbench.spec.ts
@webapp/e2e/overflow.ts

<interfaces>
<!-- 실행자가 다시 탐색하지 않도록 계약·위치를 옮겨 둔다. 줄 번호는 HEAD c71d37d 기준(작업 트리 = HEAD, 미커밋 변경은 tasks/lessons.md 만). -->

webapp/src/styles/globals.css — §2.2b 주석 블록 L158-246 (정본)
- L176-183 밴드 표(카드 본문 기준) · L185-191 경계 셋 실측 근거 · L210-211 「★ 밴드 경계는 셋뿐이다(본문 700 · 830 · 992). … 뷰포트 폭 분기를 새로 만들지 마라」
- L213-239 앱 셸 여백 램프(뷰포트 <768 → −16 · 768~1023 → −32 · ≥1024 → −240−48) · 실측 「뷰포트 360 → 344 · 390 → 374」 — **무변경**
- L241-245 「이 표를 재는 컨테이너는 둘이다」: `wb` = 작업대 본문(격자 열 수 · 상태줄 세그먼트 · 스트립 표 열 접기 · 공용 패널 sticky 전환) — 이 괄호에서 「격자 열 수 · 상태줄 세그먼트」를 새 문단으로 옮긴다
- L246 블록 닫힘 `*/` — 새 문단은 L245 다음, `*/` 앞에 넣는다

webapp/src/components/trading/workbench/trading-workbench.tsx
- L44-49 헤더 ⑤ 「컨테이너 두 개」 — `phoneBand` 로 내린다 · 「경계 700 의 정본은 §2.2b」 → 두 값(phoneBand · singleColumnOnly)과 두 정본을 말하도록 고친다
- L146-147 `const WB_PHONE_BAND_BELOW = 700;` (doc 주석 「§2.2b 첫 경계와 같은 값」) — 유지(공용 패널용) · 바로 아래 `WB_SINGLE_COLUMN_BELOW` 신설
- L728-741 ⑤ ResizeObserver: `rootRef` · `const [phoneBand, setPhoneBand] = useState<boolean | null>(null)` · 콜백 `setPhoneBand(width < WB_PHONE_BAND_BELOW)` — 같은 콜백에서 `setSingleColumnOnly(width < WB_SINGLE_COLUMN_BELOW)` 를 함께 부른다(React 는 같은 값 set 을 bail 하므로 픽셀마다 재렌더되지 않는다)
- L780-789 `<WorkbenchStatusBar … phoneBand={phoneBand} …/>` → `singleColumnOnly={singleColumnOnly}`
- L852-862 `<SharedPanels … phoneBand={phoneBand} />` — **무변경**
- 루트 L766-770 `data-slot="trading-workbench"` · `@container/wb flex min-w-0 flex-col gap-3` — 패딩·테두리 없음 → `clientWidth` = contentRect.width

webapp/src/components/trading/workbench/workbench-status-bar.tsx
- L22-26 헤더 ③ 「단 수 세그먼트는 폰 밴드(page <700)에서 DOM 에서 뺀다 … CSS 폴백 … 격자 쪽 CSS 가 data-cols 를 700 이상에서만 적용」 → 「격자 1열 고정(wb < 격자 열 수 경계 · §2.2b `WB_COLS_BOUNDARY_PX`)」로 고쳐 쓴다
- L81-82 prop `phoneBand: boolean | null` + doc → `singleColumnOnly: boolean | null` 「격자가 1열로 고정되는 wb 폭인가(= 단 수 세그먼트 불가). null = 아직 모름」
- L95 구조분해 · L161 `{phoneBand !== true && (` · L171 `phoneBand === null && "hidden @min-[…px]/wb:inline-flex"` — 이름과 리터럴 숫자를 바꾼다
- `data-slot="workbench-cols-segment"` · `aria-label="카드 단 수"` · `ToggleGroupItem` 라벨 `{c}단` — **무변경**(e2e·유닛 셀렉터)

webapp/src/components/trading/workbench/card-grid.tsx
- L17-21 헤더 ② 「열 수는 page 컨테이너 쿼리로만 바뀐다 … 기본(폰 밴드, page <700)은 1열 · cols 2/3 지정은 700 이상 … 밴드 수치의 정본은 §2.2b」
- L85-93 `COLS_CLASS: Record<TradingCols, string>` — `1: ""` · `2`/`3` 은 `@min-[…px]/wb:grid-cols-[repeat(N,minmax(0,1fr))]` 리터럴(Tailwind 소스 스캔 — 조립 금지 주석 L86)
- L225-233 격자 `data-slot="card-grid"` `data-cols` · `grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3`(gap 12px) — **무변경**

webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
- L55-66 `props()` 기본값 `phoneBand: false` → `singleColumnOnly: false`
- L166-171 「폰 밴드(page <700) 에서는 세그먼트가 DOM 에서 빠진다」 케이스 → 이름·제목 갱신 · L34 `slot()` 헬퍼로 null 폴백 케이스 추가

webapp/e2e/specs/trading-workbench.spec.ts (testDir e2e/specs · 단일 워커 · serial)
- L61-62 `PHONE_VIEWPORT {390,844}` · `WIDE_VIEWPORT {1440,1000}` — 유지 · `FOLD_VIEWPORT {707,823}` 추가
- L89-96 `bandOfWidth`(카드 밴드 700/830/992) — **무변경**
- L102-118 조회구: `statusBar` · `grid` · `cards` · `cardSelector(isin)` · `cardOf` · `cardByKey(page, key)` · `toggleOf(page, isin)`(첫 카드 헤더 토글) · `colsSegment` · `sharedPanels`(testid `shared-panels`)
- L188-190 `waitForReady` · L193-198 `openFocusedCard`(FOCUS_URL → 카드 open → `#lc-buy-watch-qty` = 10,000)
- L208-226 `cardMetrics(page, isin)` → `{ width: card.clientWidth, band }` (밴드 = 본문 그리드 첫 칸 계산 폭 · 폰 = 42%)
- L235-248 `sizeCardTo(page, isin, target)` — 뷰포트 `target+34` 에서 시작해 6회 보정 · 마지막에 정확히 맞췄음을 단언(「계산을 믿지 않는다」 규율) — 4b 가 그대로 쓴다 · 2b 의 `sizeWorkbenchTo` 는 이 모양을 복제(측정 대상만 `[data-slot="trading-workbench"]` clientWidth · 시작 뷰포트 `target+16`)
- L251-258 `expectCardNotClipped(page, isin, label)` — `scrollOverflowing` + `leavesOverflowing` 두 판정(overflow.ts 하나만 쓴다 · 헤더 ③)
- L261-264 `pickCols(page, cols)` · L267-271 `gridColumnCount(page)`(계산된 grid-template-columns 토큰 수)
- L302-306 `beforeEach`: `relay.reset()` · WIDE 뷰포트 · `mockStockApi`
- L330-367 test 2(세그먼트 · 폰 390 부재) — **무변경** · 2b 는 L367 `});` 다음에 넣는다
- L538-560 test 4(카드 699/700/829/830/991/992) — **무변경** · 4b 는 L560 `});` 다음에 넣는다
- `relay.seedLimitChasers([{ isin, buyEnabled, exchange }])` — `FakeLimitChaserInput.exchange?: string`(relay/tests/helpers/frames.ts L567). 같은 ISIN KRX+NXT 두 건 = 카드 두 장(GC3 L858-888 가 증명). ★ 2b 는 긴 이름 종목(E2E_LONG_NAME_ISIN)을 쓰지 않는다 — `scrollOverflowing` 은 `truncate` 요소도 `scrollWidth > clientWidth` 로 잡아 의도된 말줄임이 「잘림」으로 읽힌다(overflow.ts L13-15). 삼성전자 카드 두 장(KRX · NXT)으로 격자 경계만 잰다.
- `LIVE_UPPER_LIMIT = '127,400'` L65 · 카드 안 `[data-slot="lc-quote-grid"]` 가 이 값을 포함하면 시세가 들어온 것(test 9 L809-812)

webapp/e2e/overflow.ts — `leavesOverflowing(locator, rightEdge)` · `scrollOverflowing(page, rootSelector)` (판정 둘 · 새 판정식 금지)

실행 명령(이전 SUMMARY 에서 실제로 초록이었던 것 그대로)
- 타입: `pnpm --filter @gh-radar/webapp run typecheck` (tsc --noEmit && tsc -p tsconfig.e2e.json — e2e 도 포함)
- 유닛: `pnpm --filter @gh-radar/webapp run test [파일명 필터]` (vitest --run)
- e2e: `cd webapp && pnpm exec playwright test trading-workbench [-g "패턴"]` — webServer 는 config 가 `PORT=3100 pnpm dev` 로 띄우고(기존 서버 재사용), relay 8090 은 spec 픽스처가 띄운다 → **3100 · 8090 이 비어 있어야 한다**(`lsof -ti :3100 -ti :8090`)
- ★ 함정: `pnpm --filter gh-radar-webapp`(패키지명 오타)은 「No projects matched」+ exit 0 이다. 패키지명은 `@gh-radar/webapp`.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1: 폰 밴드 카드 하한 실측(4b) → 격자 열 수 경계 B 확정 → card-grid · 상태줄 · 작업대 · §2.2b 를 B 로 배선 → 폴드 뷰포트 e2e 로 끝까지 증명</name>
  <files>webapp/e2e/specs/trading-workbench.spec.ts, webapp/src/styles/globals.css, webapp/src/components/trading/workbench/card-grid.tsx, webapp/src/components/trading/workbench/workbench-status-bar.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx</files>
  <precondition>3100 · 8090 포트가 비어 있고(`lsof -ti :3100 -ti :8090` 출력 없음), e2e `setup` 프로젝트가 쓰는 Supabase 테스트 유저 자격이 webapp `.env` 계열에 있다(직전 게이트 Playwright 143 passed 가 그 증거 — 사용자에게 다시 묻지 않는다). 작업 트리의 미커밋 변경은 `tasks/lessons.md` 만이다 — 스테이징은 이 plan 의 파일만 경로로 지정한다.</precondition>
  <action>
**① 실측 — e2e 4b 사다리를 먼저 쓰고 먼저 돌린다(코드 변경 전).** `trading-workbench.spec.ts` test 4 의 닫힘(L560) 다음에 test 「4b. 폰 밴드 카드 하한 실측 — 카드 clientWidth 340·337·330·320 잘림 0 · 밴드 phone (격자 열 수 경계 B 의 근거 · quick-260923-hfk)」를 추가한다. 몸체: `relay.seedLimitChasers([{ buyEnabled: true }])` → `openFocusedCard(page)` → 내림차순 `[340, 337, 330, 320]` 각 폭에 대해 `sizeCardTo(page, E2E_ISIN, w)` → `cardMetrics` 로 `width === w` · `band === 'phone'` 단언 → `expectCardNotClipped(page, E2E_ISIN, `카드 ${w}px(phone)`)`. 첫 폭(340)에서 카드의 테두리 합(`offsetWidth − clientWidth`, `page.evaluate` 로 카드 요소를 읽는다)을 재어 `console.log` 하고 2 임을 단언한다(다르면 결정표의 공식에 그 값을 쓴다). 왜 337 이 사다리에 있는지 주석으로 적는다: 폴드(wb ≈691) 2열의 카드 폭 (691−12)/2 − 2 = 337.5. 사다리는 첫 실패에서 멈추므로 실패 폭은 단언 라벨에서 읽힌다.

포트 두 개가 비어 있음을 확인한 뒤 `cd webapp && pnpm exec playwright test trading-workbench -g "4b"` 를 돌린다. 결과로 W(통과한 가장 좁은 폭)를 정하고 objective 의 결정표로 B 를 정한다. **340 이 실패하거나 337 이 실패하면 여기서 멈추고 보고한다**(결정표의 두 중단 행 — 카드 쪽 수정은 범위 밖). W 가 정해지면 사다리 배열을 **통과한 폭만** 남기고, 실패한 폭이 있었으면 그 폭과 잘린 요소(`scrollOverflowing`/`leavesOverflowing` 가 돌려준 tag·text)를 주석에 기록한다. 4b 는 이후 B 의 근거를 잠그는 회귀 테스트로 남는다(카드 내용이 넓어져 W 가 무너지면 여기서 빨개진다 → 경계 재실측 신호).

**② §2.2b 정본에 「격자 열 수 경계」 문단을 넣는다** (`globals.css` L245 다음 · L246 `*/` 앞). 소제목 「── 격자 열 수 경계 (wb · 카드 밴드 경계가 아니다 · quick-260923-hfk) ──」. 첫 줄은 기계가 읽는 정본 토큰 한 줄 `WB_COLS_BOUNDARY_PX = {B}` (줄 시작 공백 뒤 그 형태 그대로 — Task verify 의 sed 가 이 줄에서 값을 읽는다). 이어서: 이 값은 `/trading` 격자가 2·3열을 허용하고 상태줄 단 수 세그먼트를 노출하는 `wb` 하한(이상)이다 · 위 표의 경계 셋(700·830·992)은 **카드 본문(`lc`)이 어느 밴드로 그려지는가**를 정하고 이 값은 **몇 장을 나란히 놓을 수 있는가**를 정한다 — 다른 질문이다 · 카드는 격자 칸 안에서 자기 폭으로 밴드를 고르므로 2열 격자의 카드는 폰 밴드다(D-12 의도) · 실측 근거(Chromium/Playwright · e2e trading-workbench 4b): 폰 밴드 카드 잘림 0 clientWidth 하한 W = {W}px({실패 폭}px 에서는 {잘린 요소} — 실패 없었으면 「320 까지 전부 통과」) · 공식 B = 2×(W + 카드 테두리 {실측 합}) + 격자 gap 12 = {B} · 갤럭시 폴드 안쪽 화면(뷰포트 ≈707 → wb ≈691)이 이 경계 위에 들어온다 — 종전에는 700 을 그대로 빌려 폴드가 9px 차이로 1열에 갇혔다 · ★ 이 숫자는 네 곳이 같은 값을 들어야 한다: `card-grid.tsx` COLS_CLASS(리터럴 2) · `workbench-status-bar.tsx` 첫 페인트 CSS 폴백(리터럴 1) · `trading-workbench.tsx` `WB_SINGLE_COLUMN_BELOW`(TS 상수 1) · e2e `WB_COLS_BOUNDARY`. Tailwind 가 소스를 스캔하므로 클래스는 리터럴이어야 하고 상수로 조립할 수 없다. 바꿀 때는 여기를 먼저 고치고 나머지를 맞춘다 · 공용 패널 sticky 전환 · 스트립/VI 표 열 접기 · VI 설정 2열은 여전히 700/830(카드 밴드 경계와 함께 움직인다) — 이 경계와 섞지 마라 · ★ 「밴드 경계는 셋뿐이다」 규칙은 그대로다 — 이 값은 카드 밴드 경계가 아니라 격자 열 수 경계이고 뷰포트 분기도 아니다(wb 컨테이너 쿼리).
같은 블록 L241-245 「이 표를 재는 컨테이너는 둘이다」 문단의 `wb` 괄호에서 「격자 열 수 · 상태줄 세그먼트」를 빼고 「(격자 열 수 · 상태줄 세그먼트는 아래 격자 열 수 경계 문단)」로 가리킨다. L210 「★ 밴드 경계는 셋뿐이다」 문장 끝에 「(격자 열 수 경계는 카드 밴드가 아니다 — 아래 별도 문단)」 한 구를 덧붙인다. 표 · 램프 · 실측 숫자 · 「감수하기로 한 두 창」은 한 글자도 바꾸지 않는다.

**③ card-grid.tsx.** `COLS_CLASS` 의 2·3열 컨테이너 쿼리 클래스 두 개에서 최소 폭 숫자 700 을 B 로 바꾼다(클래스 형태는 그대로 — `@min-[Bpx]/wb:grid-cols-[repeat(N,minmax(0,1fr))]`). L85-88 doc 주석을 「page(`wb`) 격자 열 수 경계 이상에서만 걸리는 열 지정 — 정본 `globals.css` §2.2b `WB_COLS_BOUNDARY_PX`. 카드 밴드 첫 경계(700)와 다른 값이다. Tailwind 가 소스를 스캔하므로 리터럴 그대로 둔다」로 고친다. 헤더 ② 를 「기본은 1열이고 `cols` 2/3 의 열 지정은 wb 가 격자 열 수 경계(§2.2b `WB_COLS_BOUNDARY_PX`) 이상일 때만 걸린다. 이 경계는 카드 밴드 경계(700·830·992)가 아니다 — 카드는 `/lc` 로 자기 폭을 재므로 격자 열 수와 독립이다(2열 격자의 카드는 폰 밴드 · D-12). 이 파일은 폭을 JS 로 재지 않고 뷰포트 브레이크포인트를 쓰지 않는다」로 고친다. 그 외 무변경.

**④ workbench-status-bar.tsx.** prop `phoneBand` 를 `singleColumnOnly: boolean | null` 로 바꾼다(인터페이스 doc: 「격자가 1열로 고정되는 wb 폭인가(= 단 수 세그먼트 불가). 작업대가 `wb` 폭 < §2.2b `WB_COLS_BOUNDARY_PX` 로 판정해 내린다. `null` = 아직 모름(③)」). 구조분해 · L161 조건부 렌더 · L171 폴백 조건의 식별자를 바꾸고, 폴백 클래스의 최소 폭 숫자 700 을 B 로 바꾼다(형태 `hidden @min-[Bpx]/wb:inline-flex` 유지). 헤더 ③ 을 「단 수 세그먼트는 격자가 1열로 고정되는 wb 폭(< 격자 열 수 경계 · §2.2b `WB_COLS_BOUNDARY_PX`)에서 DOM 에서 뺀다 — display:none 만으로 숨기지 않는다. 작업대가 판정한 `singleColumnOnly` 가 true 면 조건부 렌더로 빠진다. 폭을 아직 모르는 첫 페인트(null)에만 CSS 폴백이 받친다(같은 경계 리터럴). 이 경계는 카드 밴드 첫 경계(700)와 다르다 — 폰 뷰포트 390 은 여전히 1열이지만 폴드(wb ≈691)는 단 수를 고를 수 있다」로 고쳐 쓴다. data-slot · aria-label · 라벨 원문 · `pickCols` · 그 외 무변경.

**⑤ trading-workbench.tsx.** L147 아래에 `const WB_SINGLE_COLUMN_BELOW = {B};` 를 두고 doc 주석: 「격자 1열 고정 상한(미만) — 단 수 세그먼트 노출 · 격자 열 지정의 경계. 정본은 `globals.css` §2.2b `WB_COLS_BOUNDARY_PX`(카드 밴드 경계가 아니다). `card-grid.tsx` COLS_CLASS 리터럴 2 · 상태줄 CSS 폴백 리터럴 1 과 같은 값이어야 한다(Tailwind 스캔 — 여기서 조립해 넘길 수 없다)」. `WB_PHONE_BAND_BELOW = 700` 은 유지하고 doc 을 「공용 패널 sticky 전환용 · §2.2b 첫 경계」로 좁힌다. ⑤ 블록(L728-741)에 `const [singleColumnOnly, setSingleColumnOnly] = useState<boolean | null>(null)` 를 추가하고 ResizeObserver 콜백에서 `setPhoneBand(width < WB_PHONE_BAND_BELOW)` 바로 뒤에 `setSingleColumnOnly(width < WB_SINGLE_COLUMN_BELOW)` 를 부른다(관찰자 하나 · 판정 둘 · 같은 값 set 은 React 가 bail — 픽셀마다 재렌더되지 않는다는 한 줄 주석). 상태줄 prop 을 `singleColumnOnly={singleColumnOnly}` 로, `SharedPanels` 의 `phoneBand={phoneBand}` 는 그대로. 헤더 ⑤ 를 「… 루트 폭을 ResizeObserver 로 한 번 읽어 두 판정을 내린다 — 공용 패널에 `phoneBand`(wb <700 · §2.2b 첫 경계), 상태줄에 `singleColumnOnly`(wb < 격자 열 수 경계 · §2.2b `WB_COLS_BOUNDARY_PX`). 격자 열 수 자체는 CSS 가 같은 경계 리터럴로 정한다」로 고친다.

**⑥ 유닛 테스트 동행(타입체크가 요구한다).** `workbench-status-bar.test.tsx` `props()` 의 `phoneBand: false` → `singleColumnOnly: false`, L166-171 케이스를 「격자 1열 고정(singleColumnOnly) 이면 세그먼트가 DOM 에서 빠진다 — 접근성 트리·탭 체인에도 없다」로 이름 · prop 을 바꾼다. 헤더 주석 L13 「폰 밴드면 DOM 에서 빠진다」 → 「격자 1열 고정(wb < 격자 열 수 경계)이면 DOM 에서 빠진다」.

**⑦ 폴드 끝-끝 증명 — e2e 2b 의 폴드 부분.** test 2 닫힘(L367) 다음에 test 「2b. 갤럭시 폴드 안쪽 화면(707×823 · wb ≈691) — 단 수 세그먼트가 있고 2단 → 열 수 2 · 카드 폰 밴드 · 잘림 0 · 공용 패널은 여전히 sticky (quick-260923-hfk)」를 추가한다. 파일 상단 상수: `FOLD_VIEWPORT = { width: 707, height: 823 }`(주석: Playwright 에 폴드 프리셋이 없다 — 물리 1856×2160 · DPR ≈2.625 환산) · `WB_COLS_BOUNDARY = {B}`(주석: 정본 §2.2b `WB_COLS_BOUNDARY_PX` · 여기서는 「wb 폭 → 세그먼트 유무」 판정에만 쓴다) · `PHONE_CARD_MIN_WIDTH = {W}`(주석: 4b 가 잠근 하한 · B = 2×(W+테두리 2)+12). 헬퍼 `workbenchWidth(page)` = `[data-slot="trading-workbench"]` 의 `clientWidth`. 몸체: `relay.seedLimitChasers` 로 **같은 ISIN(E2E_ISIN) KRX · NXT 두 건**(긴 이름 종목은 쓰지 않는다 — interfaces 의 truncate 함정) → `page.setViewportSize(FOLD_VIEWPORT)` → `goto(WORKBENCH_URL)` → `waitForReady` → 카드 2장. `workbenchWidth` 가 `>= WB_COLS_BOUNDARY` 이고 `< 700` 임을 라벨 「폴드 wb 폭 — 격자 2열 가능 ∧ 카드·패널은 폰 밴드」로 단언하고 값을 `console.log`(SUMMARY 용). `colsSegment` count 1 · radio 1단/2단/3단 각 1. 두 카드를 `toggleOf`/`cardByKey(page, STRATEGY_KEY)` · `cardByKey(page, NXT 키)` 의 헤더 토글로 펼치고 각 `[data-slot="card-body"]` visible, KRX 카드의 `[data-slot="lc-quote-grid"]` 가 `LIVE_UPPER_LIMIT` 를 포함할 때까지 기다린다(시세 도착 = 내용 채워짐). `pickCols(page, 2)` → `gridColumnCount === 2` → 두 카드 boundingBox 가 같은 행(|y 차| < 2)에 나란히(NXT.x > KRX.x + KRX.width − 2) → 각 카드 `cardMetrics` band 'phone' · width ≥ PHONE_CARD_MIN_WIDTH → 각 카드 `expectCardNotClipped`(카드 셀렉터는 `cardByKey` 기준 — `cardSelector(isin)` 은 두 장을 잡으므로 키 셀렉터 문자열을 직접 넘긴다). `pickCols(page, 3)` → `gridColumnCount === 3`(3단은 종전 컴팩트 밴드와 같은 취급 — 잘림 단언 없음). `await expect(sharedPanels(page)).toHaveCSS('position', 'fixed')` — wb 700 사용처가 그대로라는 증거(폴드는 700 미만). 경계 −1/경계 케이스는 Task 2 가 같은 테스트 끝에 이어 붙인다.

포트 확인 후 `cd webapp && pnpm exec playwright test trading-workbench -g "2b|4b|^.*2\\. 단 수|4\\. 카드"` 로 신규 둘과 기존 test 2 · 4 를 함께 돌려 초록을 본다. 그 뒤 아래 verify 의 일치 게이트 · 타입 · 유닛을 돌린다. 전부 초록이면 커밋 — 메시지 `fix(quick-260923-hfk): /trading 격자 열 수 경계를 카드 밴드 700 에서 분리 — 폰 밴드 카드 실측 하한으로 내려 폴드(wb≈691)에서 단 수 선택 가능` · 스테이징은 이 Task 의 6개 파일 경로만(`git add -A` 금지 — 다른 세션의 `tasks/lessons.md` 가 있다) · Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && B=$(sed -nE 's/^ *WB_COLS_BOUNDARY_PX *= *([0-9]+).*/\1/p' webapp/src/styles/globals.css | head -1) && test -n "$B" && test "$B" -ge 640 && test "$B" -le 690 && grep -qF "@min-[${B}px]/wb:grid-cols-[repeat(2,minmax(0,1fr))]" webapp/src/components/trading/workbench/card-grid.tsx && grep -qF "@min-[${B}px]/wb:grid-cols-[repeat(3,minmax(0,1fr))]" webapp/src/components/trading/workbench/card-grid.tsx && grep -qF "@min-[${B}px]/wb:inline-flex" webapp/src/components/trading/workbench/workbench-status-bar.tsx && grep -qE "^const WB_SINGLE_COLUMN_BELOW = ${B};" webapp/src/components/trading/workbench/trading-workbench.tsx && grep -qE "^const WB_PHONE_BAND_BELOW = 700;" webapp/src/components/trading/workbench/trading-workbench.tsx && grep -qE "^const WB_COLS_BOUNDARY = ${B};" webapp/e2e/specs/trading-workbench.spec.ts && test "$(grep -vE '^[[:space:]]*(\*|//)' webapp/src/components/trading/workbench/card-grid.tsx webapp/src/components/trading/workbench/workbench-status-bar.tsx | grep -cF '@min-[700px]/wb')" -eq 0 && grep -q "singleColumnOnly" webapp/src/components/trading/workbench/workbench-status-bar.tsx && git diff --quiet c71d37d -- webapp/src/components/trading/workbench/shared-panels.tsx webapp/src/components/trading/workbench/breakout-strip.tsx webapp/src/components/trading/vi-order-list.tsx webapp/src/components/trading/workbench/vi-settings-rows.tsx webapp/src/components/app-shell.tsx && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test workbench-status-bar && test -z "$(lsof -ti :3100 -ti :8090)" && cd webapp && pnpm exec playwright test trading-workbench -g "2b|4b"</automated>
  </verify>
  <done>4b 사다리가 초록이고 W 가 정해졌다(340·337 실패면 중단·보고했다). §2.2b 에 `WB_COLS_BOUNDARY_PX = B`(640 ≤ B ≤ 690) 정본 문단이 있고 card-grid 리터럴 2 · 상태줄 폴백 리터럴 1 · `WB_SINGLE_COLUMN_BELOW` · e2e `WB_COLS_BOUNDARY` 가 같은 B 다. 상태줄 prop 은 `singleColumnOnly`, 작업대는 관찰자 하나로 `phoneBand`(700 · 공용 패널)와 `singleColumnOnly`(B · 상태줄) 둘을 낸다. 2b 폴드 케이스: 707×823 에서 세그먼트 존재 · 2단 → 실제 열 수 2 · 두 삼성전자 카드 나란히 · 폰 밴드 · clientWidth ≥ W · 잘림 0 · 3단 열 수 3 · 공용 패널 `position: fixed`. shared-panels · breakout-strip · vi-order-list · vi-settings-rows · app-shell 은 diff 0. typecheck · 상태줄 유닛 초록. 한글 커밋 1건(6개 파일 경로 지정 · Co-Authored-By 없음 · push 없음).</done>
</task>

<task type="auto">
  <name>Task 2: 경계 −1/경계 회귀 잠금(e2e 2b 후반) · 상태줄 null 폴백 유닛 케이스 · 전량 게이트</name>
  <files>webapp/e2e/specs/trading-workbench.spec.ts, webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx</files>
  <action>
**① e2e — 경계 양옆을 wb 폭으로 정확히 재서 잠근다.** `sizeCardTo`(L235-248) 와 같은 모양의 헬퍼 `sizeWorkbenchTo(page, target)` 를 추가한다: 뷰포트 `target + 16`(앱 셸 <768 램프 −16 · §2.2b L220)에서 시작해 `workbenchWidth` 를 재고 모자란 만큼 뷰포트를 옮기며 최대 6회 보정, 끝에 정확히 맞췼음을 단언한다(「계산은 근사이고 실측이 정본」 — 계산만 믿으면 엉뚱한 폭을 재고도 초록이 된다는 주석을 그대로 잇는다). Task 1 의 2b 테스트 끝(공용 패널 fixed 단언 다음)에 이어 붙인다: `sizeWorkbenchTo(page, WB_COLS_BOUNDARY - 1)` → `colsSegment` count 0 · `page.getByRole('radio', { name: '3단' })` count 0 · `gridColumnCount === 1`(직전 선택 3단이 저장돼 있어도 1열 — 저장값과 무관함을 라벨에 적는다) → `sizeWorkbenchTo(page, WB_COLS_BOUNDARY)` → `colsSegment` count 1 → `pickCols(page, 2)` → `gridColumnCount === 2` → 두 카드 각각 `cardMetrics` width ≥ PHONE_CARD_MIN_WIDTH · band 'phone' · `expectCardNotClipped`(키 셀렉터). 이 마지막 단언이 B = 2×(W+테두리)+12 공식을 실측으로 자기검증한다 — 공식이 틀렸으면(테두리가 2 가 아니었으면) 경계 정확히에서 카드가 W 보다 좁아 여기서 빨개진다. 뷰포트 복원은 불필요하다(바깥 `beforeEach` 가 WIDE 로 덮는다). 파일 헤더 ①(L24-29) 끝에 한 줄을 더한다: 「격자 열 수 경계(wb · `WB_COLS_BOUNDARY`)는 카드 밴드 경계 셋과 별개다 — 근거 4b · 잠금 2b (quick-260923-hfk)」.

**② 유닛 — 첫 페인트 폴백.** `workbench-status-bar.test.tsx` 「단 수 세그먼트 (D-04)」 describe 에 케이스 「null(wb 폭 판정 전) 이면 세그먼트는 DOM 에 있고 CSS 폴백 클래스가 첫 페인트를 받친다 — hidden + 격자 열 수 경계 리터럴」을 추가한다: `render(<WorkbenchStatusBar {...props({ singleColumnOnly: null })} />)` → `slot('workbench-cols-segment')` 가 null 이 아니고 `className` 이 `hidden` 을 포함하며 정규식 `/@min-\[\d+px\]\/wb:inline-flex/` 에 맞고, 그 숫자가 700 이 아니다(카드 밴드 첫 경계를 빌리지 않았다는 잠금 — 정본 값 자체는 CSS 주석에 있어 유닛이 읽지 않는다는 한 줄 주석). `false` 면 그 폴백 클래스가 없음(`hidden` 미포함)도 같은 케이스에서 단언한다.

**③ 전량 게이트.** `pnpm --filter @gh-radar/webapp run typecheck` · `pnpm --filter @gh-radar/webapp run test`(vitest 전체 — 직전 기준선 1472 passed / 1 skip 에서 +1 이상) · 포트 두 개 확인 후 `cd webapp && pnpm exec playwright test trading-workbench`(직전 기준선 이 spec 전부 초록 + 신규 2b · 4b). 셋 다 초록이면 커밋 — 메시지 `test(quick-260923-hfk): 격자 열 수 경계 −1/경계 wb 실측 e2e · 상태줄 폭 판정 전 CSS 폴백 유닛 케이스` · 스테이징은 이 Task 의 2개 파일 경로만 · Co-Authored-By 없음 · push 없음.

**④ SUMMARY 에 반드시 적을 것:** 사다리 폭별 통과/실패와 잘린 요소 · 카드 테두리 합 실측 · 확정 W · B · 폴드 wb 실측값과 B 대비 여유 px · vitest/Playwright 전후 건수 · 「push · 배포는 하지 않았다(오케스트레이터가 사용자 확인 후)」.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && grep -q "sizeWorkbenchTo" webapp/e2e/specs/trading-workbench.spec.ts && grep -q "WB_COLS_BOUNDARY - 1" webapp/e2e/specs/trading-workbench.spec.ts && grep -q "singleColumnOnly: null" webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && test -z "$(lsof -ti :3100 -ti :8090)" && cd webapp && pnpm exec playwright test trading-workbench</automated>
  </verify>
  <done>2b 가 wb = B−1 에서 세그먼트 부재 · 1열(저장값 무관), wb = B 에서 세그먼트 존재 · 2단 열 수 2 · 카드 clientWidth ≥ W · 잘림 0 을 잠근다. 상태줄 유닛에 null 폴백 케이스가 있다. webapp typecheck · vitest 전체 · Playwright trading-workbench spec 전부 초록(기존 test 2 · 4 · 5 · 8 무수정). 한글 커밋 1건(2개 파일 경로 지정 · Co-Authored-By 없음 · push 없음). SUMMARY 에 실측표가 있다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (없음) | 레이아웃 전용 변경 — 새 입력 · 네트워크 · 저장 경로 없음. `localStorage` 단 수 저장(`writeColsPref`)은 기존 경로 그대로. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-hfk-01 | Tampering | card-grid COLS_CLASS · 상태줄 폴백 리터럴 · TS 상수 · CSS 정본이 갈라짐 | low | mitigate | Task 1 verify 일치 게이트(sed 로 정본 B 를 읽어 네 곳 대조) + e2e 2b 가 경계 정확히에서 실측 |
| T-hfk-02 | Denial of Service | ResizeObserver 콜백의 두 번째 setState 가 픽셀마다 재렌더 | low | accept | 같은 boolean 값 set 은 React 가 bail — 경계를 넘는 순간에만 재렌더(기존 `setPhoneBand` 와 동일) |
| T-hfk-SC | Tampering | npm/pip/cargo installs | low | accept | 패키지 설치 없음 — 해당 없음 |
</threat_model>

<verification>
- 폴드 뷰포트 707×823: 세그먼트 DOM 존재 · 2단 → 실제 열 수 2 · 카드 폰 밴드 · 잘림 0 · 공용 패널 fixed (e2e 2b)
- wb = B−1 → 세그먼트 없음 · 1열 / wb = B → 세그먼트 · 2단 열 수 2 · 카드 ≥ W (e2e 2b 후반)
- 폰 밴드 카드 하한 W 사다리 초록 (e2e 4b)
- 기존 test 2(폰 390 부재) · 4(카드 경계 셋) · 5 · 8 무수정 초록
- 정본 일치 게이트(B 네 곳) · shared-panels/breakout-strip/vi-order-list/vi-settings-rows/app-shell diff 0
- webapp typecheck · vitest 전체 · Playwright trading-workbench spec 전부 초록
</verification>

<success_criteria>
- 사용자 폴드에서 단 수 세그먼트가 보이고 2단이 실제로 2열로 선다(e2e 가 같은 CSS 뷰포트로 증명)
- 경계 B 는 실측 W 에서 유도됐고 §2.2b 한 곳이 정본이며 코드 네 곳이 같은 값
- 카드 밴드 경계 셋 · 뷰포트 분기 0 · 여백 램프 · 다른 wb 700 사용처 무변경
- 커밋 2건(한글 · 경로 지정 · Co-Authored-By 없음) · push 없음
</success_criteria>

<output>
Create `.planning/quick/260923-hfk-691px-trading-1-2-3-wb-700-2-2-gap/260923-hfk-SUMMARY.md` when done — 실측표(사다리 · 테두리 · W · B · 폴드 wb 여유) · 게이트 수치 · 미배포 명시.
</output>
