---
phase: quick-261104-umt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — tracer: 고정 띠(B) 끝에서 끝까지
  - webapp/src/lib/ticks/team-model.ts
  - webapp/src/lib/ticks/tick-chart.ts
  - webapp/src/lib/ticks/tick-chart-tip.ts
  - webapp/src/components/ticks/tick-chart-band.tsx
  - webapp/src/components/ticks/tick-chart.tsx
  - webapp/src/lib/ticks/__tests__/team-model.test.ts
  - webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts
  - webapp/src/components/ticks/__tests__/tick-chart.test.tsx
  # Task 2 — 순매수 판 거울선 · 높이 70 · 묶음 표 상자 · 마우스 세로선
  - webapp/src/lib/ticks/__tests__/tick-chart.test.ts
  - webapp/e2e/specs/ticks-viewer.spec.ts
  # Task 3 — Shift+끌기 구간 합계
  - webapp/src/components/ticks/tick-chart-range.tsx
autonomous: true
requirements: ["261104-umt"]

estimate:
  tokens: 170000
  raw_tokens: 170000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "타임라인 카드 머리 바로 아래, 차트 위에 높이가 고정된 띠가 4칸(가격 | 당일 팀 | 10분 | 누적)으로 있다. 마우스가 차트 그림 영역 위면 그 시각 값, 벗어나면 현재 틱 값(첫 칸 제목이 「현재 틱」)을 보여 준다. 띠 높이는 마우스 · 값과 무관하게 같아서 차트가 흔들리거나 가려지지 않는다. 폰(측정 폭 < 600)은 띠가 2×2 다 (스케치 028 결정 ①)"
    - "순매수 판 · 10분 판 · 누적 판에는 떠다니는 상자가 더 없다. 가격 판 팀 주문 원 위에서만 원 옆에 작은 상자가 뜬다. 묶음 규칙은 지금 그대로(씨앗 가로 ± 5px)이고, 주문마다 한 줄인 표(시각.ms · 매수/매도 · 금액 · @가격 · 수량 · 조각)로 보인다. 묶음이면 매수/매도 건수 · 합계 · 순 · 가격 첫 → 끝이 함께 나오고, 8건이 넘으면 7줄 뒤에 「외 N건」이 붙는다. 우리 체결 · 조건 근거 줄은 표 아래에 지금 문구 그대로 남는다 (스케치 028 결정 ②)"
    - "Shift+끌기는 구간 선택이고, 그냥 끌기는 지금처럼 창 이동이다. 구간 결과는 차트 아래 줄에 나온다: 구간 시각 · 길이 · 팀 매수(건수) · 팀 매도(건수) · 팀 순매수 · 구간 거래대금 · 팀 비중 · 가격 첫 → 끝. 기준은 팀 체결 조각의 수신 시각이라 10분 막대와 같다(한 주문이 경계에 걸치면 조각만큼 나뉜다). Esc · ✕ · 빈 곳 클릭으로 지우고, 지우는 클릭은 시각 이동을 하지 않는다. 손을 뗄 때 차트가 밀리지 않고, 폰에서는 구간 선택이 안 된다 (스케치 028 결정 ③)"
    - "당일 팀 순매수 판에 당일 매수 누적 선(--up)과, 0선 아래로 거울처럼 내린 매도 누적 선(--down)이 보라 순매수 선 아래에 그려진다. 오른쪽 축 범위에 두 선이 다 들어간다. 판 높이는 데스크톱 70 · 폰 50 이고, 차트 높이는 데스크톱 307 · 폰 222 다 (스케치 028 결정 ④)"
    - "매집감지 상세 차트(`accum-chart.tsx`)와 공용 제스처 훅(`use-chart-view.ts`) · `lib/accum-chart.ts` 는 바이트 하나도 바뀌지 않는다"
  artifacts:
    - path: webapp/src/components/ticks/tick-chart-band.tsx
      provides: "고정 띠 B — 4칸(데스크톱) · 2×2(폰) · 그 시각 / 현재 틱"
      contains: "tick-chart-band"
    - path: webapp/src/components/ticks/tick-chart-range.tsx
      provides: "구간 결과 줄 — 구간 · 길이 · 팀 매수 · 매도 · 순매수 · 거래대금 · 팀 비중 · 가격 · ✕"
      contains: "tick-chart-range"
    - path: webapp/src/lib/ticks/tick-chart-tip.ts
      provides: "tickBandAt · cumNetAt · tickGroupTableOf · tickRangeSumOf · fmtRangeDur (순수 모델)"
      contains: "export function tickBandAt"
    - path: webapp/src/lib/ticks/tick-chart.ts
      provides: "판 높이 H2 70 / 50 · 합 307 / 222 · dayNetRangeOf 매수·매도 포함 · teamDayStairsOf 값 고르기 · priceIdxAt · turnoverIdxBefore · yOfShare"
      contains: "H2: 70"
    - path: webapp/src/lib/ticks/team-model.ts
      provides: "dayStairs 원소마다 buy · sell 누적 금액(net = buy − sell)"
  key_links:
    - from: webapp/src/components/ticks/tick-chart.tsx
      to: webapp/src/lib/ticks/tick-chart-tip.ts
      via: "tickBandAt(호버 · 터치 시각 ?? cursorMs) → TickChartBand"
      pattern: "tickBandAt\\("
    - from: webapp/src/components/ticks/tick-chart.tsx
      to: webapp/src/hooks/use-chart-view.ts
      via: "useChartGestures 넷째 인자 = panLockRef (터치 살펴보기 또는 Shift 구간 끌기 동안 true) — 훅 무변경"
      pattern: "useChartGestures\\(svgRef, \\{ L, W, R: TICK_CHART.R \\}, ctl, panLockRef\\)"
    - from: webapp/src/components/ticks/tick-chart.tsx
      to: webapp/src/lib/ticks/tick-chart-tip.ts
      via: "tickRangeSumOf(session, t0, t1) → TickChartRange · 범위 띠 알약"
      pattern: "tickRangeSumOf\\("
    - from: webapp/src/lib/ticks/team-model.ts
      to: webapp/src/lib/ticks/tick-chart.ts
      via: "dayStairs.buy / sell → teamDayStairsOf 값 고르기 → tick-day-buy-path · tick-day-sell-path"
      pattern: "tick-day-sell-path"
---

<objective>
틱뷰어 타임라인 차트(`/analytics/ticks`)에 스케치 028 채택안 네 가지를 구현한다. 결정 원문은 `.planning/sketches/028-tick-chart-range-unified-tip/README.md` 「결정(2026-11-04)」이고 LOCKED 다. 아래에서는 결정 ①~④ 로 부른다.
① 판마다 따로 뜨던 툴팁을 차트 위 고정 띠 B 로 바꾼다.
② 팀 주문 묶음을 원 옆 작은 표 상자로 바꾼다.
③ Shift+끌기로 구간을 고르면 차트 아래 줄에 팀 매수 · 매도 · 순매수 합계를 보여 준다.
④ 당일 순매수 판에 매수 누적 선과 0선 아래 거울 매도 누적 선을 넣고, 판 높이를 50 → 70(폰 36 → 50)으로 늘린다.

Purpose: 트레이더가 한 시각의 네 판 값을 차트를 가리지 않고 한 번에 읽는다. 끌어서 고른 구간의 팀 수급을 바로 본다. 하루 매수 · 매도가 얼마나 쌓였는지 순매수와 같이 본다.
Output: 고정 띠 컴포넌트 · 구간 결과 줄 컴포넌트 · 순수 모델(tickBandAt · tickGroupTableOf · tickRangeSumOf) · 판 치수 307/222 · 거울선 · 테스트.

목업 `.planning/sketches/028-tick-chart-range-unified-tip/index.html` 의 변형 B 가 시각 · 동작 기준이다. 목업 상단 토글은 채택값으로 본다: 범위 = Shift+끌기, 매도선 = 거울, 판 높이 = 70. CSS(`.strip` · `.grp` · `.gfloat` · `.rng` · `.hint`)와 JS(`stripHtml` · `groupHtml` · `overlay` · `rangeOf` · `renderRange`)가 모양 · 문구의 정본이다.

범위 밖(하지 않는다): 매집감지 상세 차트 시각 · 동작 변경, 공용 훅 `use-chart-view.ts` 변경, 폰 구간 선택(결정 ③ 「1차 제외」), 배포 · push.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/sketches/028-tick-chart-range-unified-tip/README.md
@.planning/sketches/028-tick-chart-range-unified-tip/index.html
@webapp/src/components/ticks/tick-chart.tsx
@webapp/src/lib/ticks/tick-chart-tip.ts
@webapp/src/lib/ticks/team-model.ts

<interfaces>
<!-- 실행자가 코드베이스를 뒤지지 않도록 뽑아 둔 계약. 아래 이름 그대로 쓴다. -->

webapp/src/lib/ticks/tick-chart.ts (지금):
- TICK_CHART.desktop = { TOP 7, H1 104, GAP 7, H2 50, H3 40, H4 50, LB 15, H 287 } · TICK_CHART.phone = { TOP 0, H1 72, GAP 7, H2 36, H3 28, H4 36, LB 15, H 208 } · R 52 · PHONE_MAX_W 600 · MIN_VIEW_MS 10초
- tickPanelsOf(d) → { y1a, y1b, y2a, y2b, y3a, y3b, y4a, y4b, H }
- 바꾼 뒤 데스크톱 판: y1a 7 · y1b 111 · y2a 118 · y2b 188 · y3a 195 · y3b 235 · y4a 242 · y4b 292 · H 307. 폰: y1b 72 · y2a 79 · y2b 129 · y3a 136 · y3b 164 · y4a 171 · y4b 207 · H 222
- PriceSeries { n, t: Float64Array(수신 ms), px, rec, maxPx } · priceSeriesOf(session) (WeakMap 캐시)
- TurnoverSeries { n, t, pos, qty(누적 주), val(누적 원), teamBuy, teamSell(누적 · 팀 체결 조각 A3 기준), share } · turnoverSeriesOf(session) (캐시) · turnoverIdxAt(s, t) = t 이하 마지막 색인(−1)
- 내부: lowerBoundF / upperBoundF(t, n, v) · f1 · turnoverPathsOf 안 yS 지역 함수(비중 → y)
- dayNetRangeOf(model: Pick<TeamModel,'dayStairs'>) · teamDayStairsOf(model, x, y, T0, endMs) · yOfNet(range, P) · marketCapOf(basePx, listingShares)

webapp/src/lib/ticks/team-model.ts:
- TeamModel.dayStairs: { tMs, net, qty }[] — teamOrders 와 같은 순서(색인 k 가 같은 주문) · net = 주문 단위 o.val 누적(매수 +, 매도 −)
- TeamModel.fills: TeamFill[]({ rec, tNs, bs '1'|'2', px, qty }) · fillMs · prefix · buckets { buy, sell }(72칸 · 조각 수신 시각)

webapp/src/lib/ticks/tick-chart-tip.ts:
- TickCircle { k, o: TeamOrderPoint, cx, cy, r } · TickHover { key, lines, circle, group? }
- tickCirclesOf · nearestTickCircleOf · tickCircleGroupOf(± TICK_GROUP_HALF_WIDTH 5px) · teamAvgAt(model, t) · pct1 · (내부) pct2 · signedAmount
- 지우는 것: tickNetTipAt · tickBucketTipAt · tickTurnoverTipAt(Task 1), tickOrderTipOf · tickGroupTipOf(Task 2). 남기는 것: tickOrderHoverOf(반환 모양만 바뀜) · tickOwnLinesOf · tickOwnTipOf · tickHoverWithOwn(로직 그대로)

webapp/src/hooks/use-chart-view.ts (변경 금지):
- useChartGestures(svgRef, { L, W, R }, ctl, inspectingRef?) → { dragging }. SVG 에 네이티브 pointerdown(setPointerCapture · dragging true) · pointermove(한 손가락 = 이동, 단 inspectingRef.current === true 면 이동 안 함 — 이동할 때마다 읽는다) · pointerup/cancel/lostpointercapture 를 단다. 네이티브 리스너가 React 위임 핸들러보다 먼저 돈다. 그래서 React onPointerDown 에서 잠금 ref 를 켜도 첫 pointermove 전에 반영된다.

webapp/src/lib/ticks/tick-format.ts: fmtAmountC · fmtSignedAmountC · fmtQty · MINUS
webapp/src/lib/limitup-report.ts: kstClock(ms) → 「HH:MM:SS」 · webapp/src/lib/teamflow-report.ts: kstHm(ms) → 「HH:MM」
CSS 토큰(globals.css): --up --down --team --mine --mine-fg --muted --muted-fg --faint --fg --fg-2 --border --border-subtle --card --popover --popover-fg --primary --primary-fg --vi. 목업의 --sel · --vol 은 앱에 없다 → --primary(투명도) · --faint 로 쓴다.

테스트 하루(components/ticks/__tests__/tick-chart.test.tsx `krx`): 팀 매수 1주문 = 3조각(seq 101·102·103, 각 100·200·300주 @16,400 → 984만) · 일반 매도 seq 105(50주 @16,350) · 팀 매도 1주문 seq 107(400주 @16,300 → 652만). 누적 거래대금 17,177,500(「1,718만」) · 거래량 1,050 · 팀 비중 95.2%. 커서 = seq 103(라벨 13:00:00). synthSession 오프셋 단위는 ms(synthNs(ms))다. 하루 전체 창 · 폭 640 → 그림 영역 52~588, 1px ≈ 80초.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): 고정 띠 B 끝에서 끝까지 — 팀 모델 매수/매도 누적 → tickBandAt → 띠 컴포넌트 → 차트 호버 · 현재 틱 (결정 ①)</name>
  <files>webapp/src/lib/ticks/team-model.ts, webapp/src/lib/ticks/tick-chart.ts, webapp/src/lib/ticks/tick-chart-tip.ts, webapp/src/components/ticks/tick-chart-band.tsx, webapp/src/components/ticks/tick-chart.tsx, webapp/src/lib/ticks/__tests__/team-model.test.ts, webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts, webapp/src/components/ticks/__tests__/tick-chart.test.tsx</files>
  <behavior>
    - team-model: 테스트 하루 dayStairs 의 buy 는 [9_840_000, 9_840_000], sell 은 [0, 6_520_000] 이다. 모든 계단에서 net === buy − sell 이다.
    - tickBandAt(첫 체결 전 시각): px null · 당일 순/매수/매도 0 · 거래대금 null · 10분 칸 매수/매도 0.
    - tickBandAt(tip 테스트 fixture, 13:00:00.600): 당일 매수 1,505만 · 매도 0 · 순 +1,505만 · 팀 평단 = teamAvgAt 값 · 10분 칸 라벨 「13:00~13:10」 · 그 칸 매수/매도 = buckets[30].
    - cumNetAt: 누적 점이 없으면 null 이다. 첫 점 전도 null 이다. 점 안에서는 그 점 net 이다. 끝난 조각(end ≠ 0) 뒤 · cycle 이 바뀌기 전 틈도 null 이다. 지금 순매수 판 툴팁의 「누적 —」 규칙을 시각 t 기준으로 그대로 옮긴다.
    - 시총을 알면 capRatio = 거래대금 ÷ 시총, 모르면 null 이다.
    - 컴포넌트: 마우스가 없으면 띠가 data-live="1" · 「현재 틱」 · 13:00:00 · 16,400 · 당일 팀 순 +984만 · 매수 984만 · 매도 0 이다.
    - 컴포넌트: 순매수 판 (cx+3, 140) 에 마우스 → data-live 없음 · 「가격」 · 당일 팀 순 +332만 · 매수 984만 · 매도 652만 · 10분 「13:00~13:10」 매수 984만 / 매도 652만 / 순 +332만 · 떠다니는 상자(tick-chart-tip) 없음.
    - 컴포넌트: (580, 250) 에 마우스 → 누적 칸 거래대금 1,718만 · 팀 95.2% · 거래량 1,050주. listingShares 1,000,000 이면 시총 % 도 나온다.
    - 컴포넌트: pointerLeave 하면 다시 현재 틱이다. 띠는 DOM 에서 tick-chart-wrap 앞에 있고, 마우스가 있든 없든 className 이 같다(고정 높이).
  </behavior>
  <action>
    결정 ① 「통합 툴팁 = B 고정 띠」를 한 경로로 끝까지 잇는다. 먼저 failing 테스트를 쓴다(RED).

    1) team-model.ts: TeamModel.dayStairs 원소에 buy · sell 을 더한다. 그 주문까지의 팀 매수 · 매도 금액 누적이고, net 계산과 같은 루프에서 주문 단위 o.val 로 쌓는다. 타입 주석과 머리 주석 ③ 에 「net = buy − sell · 순매수 판 거울선 · 띠 당일 팀 칸」을 적는다. team-model.test.ts 의 dayStairs net/qty 단언 옆에 buy · sell 단언을 더한다.

    2) tick-chart.ts: priceIdxAt(s: Pick<PriceSeries,'n'|'t'>, t) 를 export 한다. turnoverIdxAt 과 같은 꼴(upperBoundF − 1)로, 시각 t 이하 마지막 가격 점 색인을 돌려준다(없으면 −1). 다른 것은 건드리지 않는다. 판 높이는 Task 2 에서 바꾼다.

    3) tick-chart-tip.ts:
    (a) pct2 를 export 한다(띠 · 표 공용).
    (b) cumNetAt(cum, t) 를 export 한다. 지금 tickNetTipAt 안의 누적 끊김 규칙을 떼어 내되, 기준 시각은 t 로 둔다. 반환은 number | null 이다.
    (c) TickBand 인터페이스와 tickBandAt(src, t) 를 export 한다. src 필드는 team(Pick<TeamModel,'dayStairs'|'prefix'|'fillMs'|'buckets'|'fills'>) · cum(PosNetPoint[]) · price(Pick<PriceSeries,'n'|'t'|'px'>) · turnover(TurnoverSeries) · basePx · mcap · T0 이다.
    TickBand 필드:
    - t · clock(kstClock)
    - px(priceIdxAt) · chgPct(기준가 대비 % · 모르면 null)
    - avg(teamAvgAt) · avgDiffPct(그 시각 가격 대비 평단 % · null 가능)
    - hasTeam(fills > 0)
    - dayNet · dayBuy · daySell(t 이하 마지막 계단 · 그 전 0)
    - hasCum(cum.length > 0) · cum(cumNetAt)
    - slotLabel(「HH:MM~HH:MM」 kstHm) · slotBuy · slotSell(칸 범위 밖이면 0)
    - tv · vol · share(turnoverIdxAt < 0 이면 null) · capRatio(mcap 있을 때만)
    (d) tickNetTipAt · tickBucketTipAt · tickTurnoverTipAt 와 그 테스트 블록을 지운다. 이 셋을 부르는 곳은 tick-chart.tsx 뿐이다. 파일 머리 주석 ②③④ 를 「고정 띠 모델(tickBandAt)」 설명으로 바꾼다.
    tick-chart-tip.test.ts 의 「순매수 · 10분 판」 「누적 판 툴팁」 describe 는 tickBandAt · cumNetAt 테스트로 바꾼다. 기존 pos_net fixture 와 「누적 —」 경우를 옮긴다. teamAvgAt 테스트는 그대로 둔다. price · turnover 는 테스트 안에서 작은 리터럴 계열로 만든다.

    4) 새 파일 webapp/src/components/ticks/tick-chart-band.tsx('use client' 불필요 · 표시 전용).
    - export TickChartBand({ band: TickBand | null, live: boolean, phone: boolean }).
    - 루트: data-slot="tick-chart-band" · data-live={live ? '1' : undefined} · data-dims phone|desktop · border-b border-[var(--border-subtle)] · tabular-nums.
    - 칸 4개: 각각 data-slot="tick-band-cell" · data-cell="price|team|slot|turnover".
    - 목업 .strip CSS 를 Tailwind 로 옮긴다. 데스크톱은 한 줄 grid-cols-[1.05fr_1.6fr_1.15fr_1.3fr] · 높이 고정 h-[58px]. 폰은 grid-cols-2 · 두 줄 각 52px 고정(합 104). 칸 사이 왼쪽 선, 폰 둘째 줄 위 선은 목업 그대로.
    - 넘침: 칸 min-w-0 · overflow-hidden, 값은 whitespace-nowrap · 넘치면 truncate. 높이는 상태 · 값 · 폭과 무관하게 같아야 한다 — 차트가 흔들리지 않는 것이 결정 ① 의 요점이다.
    - 글자: 칸 제목 10.5px bold --muted-fg 앞에 7px 색점(가격 --fg-2 · 당일 팀 --team · 10분 --faint · 누적 --faint). 오른쪽 em 자리에 시각/칸 라벨 mono. 라벨 10.5px --muted-fg · 값 mono 11px.
    - 문구는 목업 stripHtml 그대로다:
      · 가격 칸: 제목 「가격」(live 면 「현재 틱」 --fg bold) + 시각 / 가격(12px --fg) · 등락률(부호색) / 「평단」 N · 평단 대비 %(부호색, 둘 다 없으면 「—」).
      · 당일 팀 칸: 「순」(--team) · 「매수」(--up) · 「매도」(--down) / hasCum 일 때만 「누적(이월 포함)」 ±X(null 이면 「—」). hasTeam false 면 「팀 체결 없음」.
      · 10분 칸: 제목 「10분」 + slotLabel / 「매수」 「매도」 / 「순」(부호색). 둘 다 0 이면 「팀 체결 없음」.
      · 누적 칸: 「거래대금」 X · capRatio 가 있을 때만 「시총」 n.n% / 「팀」 n.n%(--team) · 「거래량」 N주. tv null 이면 「—」.
    - 부호색: > 0 --up · < 0 --down · 0 --muted-fg. 금액은 fmtAmountC · fmtSignedAmountC, % 는 pct2(등락 · 평단 대비) · pct1(시총 · 비중).
    - band null(커서 없음)이면 같은 칸 · 같은 높이에 값만 「—」.
    - 새 용어를 만들지 않는다. 문구는 목업과 지금 툴팁에 있던 말만 쓴다.

    5) tick-chart.tsx:
    (a) hover 상태 모양을 { mx, my, vk, box: TickHover | null } 로 바꾼다. 마우스(pointerType ≠ touch)가 그림 영역 x ∈ [L, xr] · y ∈ [P.y1a, P.y4b] 안이면 둔다. 그 밖 · pointerLeave · 끌기 중이면 null 이다.
    (b) setState 는 Math.round(mx) 가 바뀌었거나 box.key 가 바뀔 때만 한다. 그래서 다시 그리기는 viewBox 1px 당 많아야 한 번이고, 휠 이동 프레임 비용과 같은 급이다. 값은 저장한 정확한 mx 로 계산한다.
    (c) pickAt 은 가격 판 전용 상자(팀 원 묶음 · 우리 점)만 돌려주고 다른 판에서는 null 이다. 판별 툴팁은 띠가 대신한다(결정 ①).
    (d) 터치 살펴보기: touchPt 의 x 가 띠 시각을 정한다. 손가락 자리에서 pickAt 으로 상자를 고른다. touchPt 갱신 조건에 「반올림 x 변경」을 더한다.
    (e) 띠 시각 bandT = 터치 시각 ?? 마우스 시각(tOfTick) ?? cursorMs, live = 터치 · 마우스 둘 다 없음. band = bandT === null ? null : tickBandAt({ team, cum: cumPts, price: series, turnover, basePx: session.basePx, mcap, T0: bounds.T0 }, bandT).
    (f) 렌더 순서: 머리 줄 div → <TickChartBand band live phone /> → tick-chart-wrap. 띠는 wrap 밖이다. wrap 의 useChartWidth 측정은 그대로 둔다.
    (g) 떠다니는 상자 tick-chart-tip 은 box 가 있을 때만 뜬다. 이 Task 에서는 내용(lines)과 자리 잡기 코드를 그대로 둔다. 표는 Task 2 에서 넣는다.
    (h) 머리 주석 ④ 를 「고정 띠 B(마우스 = 그 시각 · 떼면 현재 틱) + 가격 판 원 옆 상자」로 고친다.

    6) tick-chart.test.tsx: 「순매수 판 · 10분 판」 「누적 판」 「상장주식수 → 툴팁」 테스트를 behavior 의 띠 테스트로 바꾼다. 가격 판 원 위 상자 테스트와 우리 줄 테스트는 그대로 통과해야 한다(이 Task 에서는 상자 내용이 그대로다).

    하지 않는다: use-chart-view.ts · accum-chart.tsx · lib/accum-chart.ts 를 건드리지 않는다. 띠에 aria-live 를 달지 않는다(마우스 이동마다 낭독이 넘친다).
  </action>
  <verify>
    <automated>npm --prefix webapp run test -- --maxWorkers=2 src/lib/ticks/__tests__/team-model.test.ts src/lib/ticks/__tests__/tick-chart-tip.test.ts src/components/ticks/__tests__/tick-chart.test.tsx && npm --prefix webapp run typecheck && grep -c "export function tickBandAt" webapp/src/lib/ticks/tick-chart-tip.ts && grep -c 'data-slot="tick-chart-band"' webapp/src/components/ticks/tick-chart-band.tsx</automated>
  </verify>
  <done>마우스를 차트 위에서 움직이면 차트 위 고정 띠 4칸이 그 시각 값으로 바뀌고, 차트를 벗어나면 현재 틱 값(「현재 틱」)으로 돌아온다. 순매수 · 10분 · 누적 판에서 떠다니는 상자가 사라졌다. 띠 높이는 늘 같다. 세 테스트 파일과 typecheck 가 통과하고, 커밋 1개(경로 지정 · 한글 메시지)가 남는다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 순매수 판 매수/매도 누적 거울선 · 판 높이 70(폰 50) · 원 옆 묶음 표 상자 · 마우스 세로선 (결정 ② · ④)</name>
  <files>webapp/src/lib/ticks/tick-chart.ts, webapp/src/lib/ticks/tick-chart-tip.ts, webapp/src/components/ticks/tick-chart.tsx, webapp/src/lib/ticks/__tests__/tick-chart.test.ts, webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts, webapp/src/components/ticks/__tests__/tick-chart.test.tsx, webapp/e2e/specs/ticks-viewer.spec.ts</files>
  <behavior>
    - tickPanelsOf(desktop).H === 307 · (phone).H === 222 · desktop y2a 118 · y2b 188 · y3a 195 · y4b 292.
    - dayNetRangeOf: 계단 [{net 100, buy 100, sell 0}, {net −50, buy 100, sell 150}] → { min: −150, max: 100 }. 매수 누적 · 거울 매도 누적이 축 안에 든다.
    - teamDayStairsOf(…, pick = s => s.buy) 는 buy 값으로 V 를 찍는다. pick 을 생략하면 지금과 같은 net 경로 문자열이다.
    - tickGroupTableOf(tip fixture · 1분 창 · 씨앗 k0):
      · count 2 · clock 「13:00:00」(같은 초) · buy { n 2, val 15_050_000 } · sell { n 0 } · net +15_050_000 · px0 10,000 → px1 10,100 · chgPct +1.00.
      · rows = [k0 「13:00:00.000」 B 1,000만 @10,000 1,000주 3조각 seed, k1 「13:00:00.500」 B 505만 @10,100 500주 2조각]. more 0.
    - tickGroupTableOf(씨앗 k3 혼자): count 1 · rows 1 · avgDiffPct null(잔량 0 이하) · chgPct null.
    - tickGroupTableOf(하루 전체 창 · k0): 4건 · 「13:00:00 ~ 13:00:30」 · 매수 2건 1,505만 · 매도 2건 2,342만.
    - 9건 이상 묶음: rows 7 · more = count − 7.
    - 컴포넌트: 매수 원 위 → tick-chart-tip 안 tick-chart-group 이 있다. 머리 「팀 주문 묶음 2건」. 요약에 「매수 1건 984만」 「매도 1건 652만」 「순 +332만」 「16,400 → 16,300 (−0.61%)」. 줄 tick-chart-group-row 2개: 첫 줄 data-seed="1" · 매수 · 984만 · @16,400 · 600주 · 3조각, 둘째 줄 매도 · 652만 · @16,300 · 400주 · 1조각. 고리(tick-order-seed 1 · tick-order-hover 1)는 지금 그대로다.
    - 컴포넌트(own): 같은 자리에서 표 아래 tick-chart-own-line 이 ['조건 근거 호가 · 주문 #EV', '우리 체결 50주 · 계좌 ···3801 · 주문 #F1'] 이다.
    - 컴포넌트: tick-day-buy-path · tick-day-sell-path 가 각각 1개다(팀 없으면 0). svg height 속성은 '307' 이다. 마우스가 있으면 tick-chart-hover-line 1개, 없으면 0개다.
  </behavior>
  <action>
    1) tick-chart.ts — 결정 ④:
    (a) TICK_CHART.desktop.H2 50 → 70 · H 287 → 307, phone.H2 36 → 50 · H 208 → 222. 위 주석 합 계산식을 바꾼다(7 + 104 + 7 + 70 + 7 + 40 + 7 + 50 + 15 = 307 · 0 + 72 + 7 + 50 + 7 + 28 + 7 + 36 + 15 = 222). 파일 머리 ① 의 「287 · 폰 208」도 고친다.
    (b) dayNetRangeOf: 계단마다 net · buy · −sell 을 0 과 함께 범위에 넣는다(목업 hi/lo 와 같다). Pick 은 그대로 'dayStairs' 다.
    (c) teamDayStairsOf: 선택 여섯째 인자 pick(계단 → 값)을 둔다. 기본값은 net 이다. 첫 점 y 는 지금처럼 0 이다.
    (d) yOfShare(shareTop, p) 를 export 한다. turnoverPathsOf 안 지역 yS 를 이 함수로 바꿔 써서 공식을 한 벌로 둔다. 호버 점이 쓴다.
    tick-chart.test.ts: 287/208 단언을 307/222 로 바꾼다. 판 경계 단언을 위 값으로 바꾼다. teamDayStairsOf 테스트 리터럴 계단에 buy · sell 을 넣는다. dayNetRangeOf · pick 단언을 더한다.

    2) tick-chart-tip.ts — 결정 ②:
    (a) TickGroupTable 인터페이스와 tickGroupTableOf(model: Pick<TeamModel,'prefix'|'fillMs'>, seed, group) 를 export 한다.
    필드:
    - count
    - clock: 첫 · 끝이 같은 초면 한 시각, 아니면 「a ~ b」(지금 tickGroupTipOf 규칙)
    - buy · sell: 각각 { n, val }
    - net
    - px0 · px1 · chgPct: 묶음일 때만, 혼자면 null
    - avgDiffPct: 혼자일 때만. 씨앗 가격 대비 teamAvgAt(model, seed.o.tMs) %, 평단 없으면 null
    - rows: 시간순 · 8건 이하면 전부, 넘으면 앞 7건
    - more: count − rows.length
    row = { k, clock: kstClock + 「.mmm」(tMs % 1000 세 자리) · side · val · px · qty · pieces · seed }.
    (b) TickHover 에 선택 필드 table 을 더한다. tickOrderHoverOf 는 lines: [] · table · circle: seed · (2개 이상이면) group 을 돌려준다.
    (c) tickHoverWithOwn 은 손대지 않는다. ...team 이 table 을 그대로 넘기고, 우리 줄이 lines 가 된다. 문서 주석만 「우리 줄은 표 아래」로 고친다.
    (d) tickOrderTipOf · tickGroupTipOf 와 그 테스트를 지우고 behavior 의 표 테스트로 바꾼다. 머리 주석 ① 을 갱신한다.

    3) tick-chart.tsx:
    (a) height prop 타입을 typeof TICK_CHART.desktop.H | typeof TICK_CHART.phone.H 로 바꾼다(307 | 222). 문서 주석 ③ 도 고친다. 이 prop 을 넘기는 호출처는 없다(tick-viewer.tsx 는 생략).
    (b) 순매수 판(결정 ④): 그리기 순서는 0선 → 누적 회색 → tick-day-buy-path → tick-day-sell-path → 보라 tick-day-path(맨 위)다.
    - 매수: teamDayStairsOf(team, x, yN, T0, endMs, s => s.buy) · stroke var(--up) · 1.15 · strokeOpacity 0.85.
    - 매도 거울: pick s => −s.sell · stroke var(--down) · 같은 굵기.
    - 둘 다 pointerEvents none · noTeam 이면 그리지 않는다.
    - 데스크톱 판 제목: 「당일 팀 순매수」 뒤에 fontWeight 400 으로 「 · 매수 · 매도(0선 아래) 누적 · 오른쪽 축」(매수 --up · 매도 --down tspan). 그 뒤에 기존 누적 tspan.
    - 머리 범례: 「당일 팀 순매수 · 매수/매도 누적 · 누적」(매수 --up · 매도 --down span). 목업 lg 문구 그대로다.
    (c) 마우스 세로선 · 값 점(목업 overlay): 호버나 터치가 있고 끌기 중이 아닐 때 그린다. 위치는 클립 그룹 안 가격 레이어 뒤 · 커서 선 앞이다.
    - tick-chart-hover-line: x = 띠 시각의 x · y1a~y4b · stroke var(--fg-2) · dasharray 3 3 · opacity 0.7.
    - tick-chart-hover-dot: r 3 · stroke var(--card) 1.5. 점마다 조건이 있다:
      · 가격 — band.px 있을 때 · fill --fg-2
      · 순 · 매수 · 거울 매도 — hasTeam 일 때 · --team · --up · --down
      · 누적 — hasCum 이고 값이 있을 때 · yC · --muted-fg
      · 비중 — tv.share ≠ '' 이고 share 있을 때 · yOfShare(tv.shareTop, P) · --team
    (d) 떠다니는 상자(결정 ②): tick-chart-tip 은 box.table 이나 box.lines 가 있을 때만 뜬다.
    - 내용은 목업 groupHtml · .grp · .gfloat 그대로다: 폭 300(maxWidth W − 8) · popover 배경 · 테두리 · 그림자. 안쪽 data-slot="tick-chart-group" 블록 · --muted 배경 · 둥근 8px.
    - 머리: 「팀 주문 1건」 / 「팀 주문 묶음 N건」 + 시각(mono 10.5px --muted-fg).
    - 묶음 요약(n > 0 인 쪽만): 「매수 n건 X」(--up) · 「매도 m건 Y」(--down) · 「순 ±Z」(부호색) · 「가격 a → b (±x%)」.
    - 혼자: 「그 시각 평단 대비 ±x%」(값 있을 때만).
    - 표: data-slot="tick-chart-group-row" · data-seed 「1」(씨앗). 열 = 시각.ms · 매수/매도(색 · bold) · 금액 · @가격 · N주 · N조각(--muted-fg). 씨앗 줄은 bold + 앞 「▸」. more > 0 이면 「외 N건」.
    - 표 아래 lines(우리 줄)는 줄마다 data-slot="tick-chart-own-line" 이다(지금 pl-3 -indent-3 모양).
    - 자리 잡기(마우스 = 포인터 옆 · 터치 = touchTipTopOf)는 지금 코드 그대로다.

    4) tick-chart.test.tsx:
    - getBoundingClientRect 모의 높이 287 → 307(네 곳) · 주석의 판 좌표를 새 값으로.
    - 원 위 상자 · 우리 줄 테스트를 behavior 대로 바꾼다(줄 문자열 → 표 · own-line).
    - 거울선 · height '307' · 호버 세로선 단언을 더한다.

    5) e2e(webapp/e2e/specs/ticks-viewer.spec.ts): 테스트 제목 「데스크톱 287」 → 「데스크톱 307」, toHaveAttribute('height', '287') → '307'. 같은 테스트의 클릭 y 200 은 새 10분 판 [195, 235] 안이라 그대로 둔다.
  </action>
  <verify>
    <automated>npm --prefix webapp run test -- --maxWorkers=2 src/lib/ticks/__tests__/tick-chart.test.ts src/lib/ticks/__tests__/tick-chart-tip.test.ts src/lib/ticks/__tests__/team-model.test.ts src/components/ticks/__tests__/tick-chart.test.tsx && npm --prefix webapp run typecheck && grep -c "H2: 70" webapp/src/lib/ticks/tick-chart.ts && grep -c "toHaveAttribute('height', '307')" webapp/e2e/specs/ticks-viewer.spec.ts</automated>
  </verify>
  <done>순매수 판에 빨간 매수 누적 · 0선 아래 파란 매도 누적 · 보라 순매수가 함께 보이고, 판이 70(폰 50)으로 커져 차트가 307(폰 222)이다. 원 위 상자는 주문마다 한 줄인 표이고, 우리 줄은 그 아래에 그대로 있다. 마우스 자리에 점선 세로선과 값 점이 뜬다. 테스트 · typecheck 가 통과하고 커밋 1개가 남는다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Shift+끌기 구간 합계 — 차트 아래 결과 줄 · 범위 띠 · Esc/✕/빈 곳 클릭 지움 · 그냥 끌기 = 이동 그대로 (결정 ③)</name>
  <files>webapp/src/lib/ticks/tick-chart.ts, webapp/src/lib/ticks/tick-chart-tip.ts, webapp/src/components/ticks/tick-chart-range.tsx, webapp/src/components/ticks/tick-chart.tsx, webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts, webapp/src/components/ticks/__tests__/tick-chart.test.tsx</files>
  <behavior>
    - tickRangeSumOf(krx 하루, 첫 A3 앞 ~ 마지막 A3 뒤): buy 9,840,000 · nBuy 1 · sell 6,520,000 · nSell 1 · net +3,320,000 · tv 17,177,500 · share ≈ 0.952 · px0 → px1 = 그 구간 처음 · 끝 가격.
    - tickRangeSumOf(seq 101 · 102 만 덮는 구간): buy 4,920,000(조각만큼 나뉨) · nBuy 1 · sell 0 · nSell 0.
    - tickRangeSumOf(체결 없는 구간): 금액 0 · tv 0 · share null.
    - t0 > t1 로 넣어도 결과가 같다(정규화).
    - fmtRangeDur: 4,200,000ms → 「1시간 10분」 · 95,000 → 「1분 35초」 · 7,000 → 「7초」.
    - 컴포넌트: Shift 누른 채 (cx − 20, 50) → (cx + 20, 50) 로 끌고 떼면 tick-chart-range 가 뜬다. 안에 「팀 매수」 984만 1건 · 「팀 매도」 652만 1건 · 「팀 순매수」 +332만 · 「✕ 지우기 (Esc)」 가 있다. tick-range-band · tick-range-pill(「순 +332만」)이 있다. onSeekMs 는 불리지 않는다. tick-chart-range 는 DOM 에서 tick-chart-wrap 뒤에 있다.
    - 컴포넌트: 그냥 끌기(Shift 없음)는 구간을 만들지 않는다.
    - 컴포넌트: ✕ 클릭 · document Escape · 빈 곳 클릭 셋 다 구간을 지운다. 지우는 빈 곳 클릭은 onSeekMs 를 부르지 않고, 그다음 빈 곳 클릭은 부른다.
    - 컴포넌트: 「1분」 창에서 Shift+끌기를 해도 tick-chart-cursor 의 x1 이 바뀌지 않는다(창 이동 잠금).
    - 컴포넌트: height 222(폰)에서 Shift+끌기는 구간을 만들지 않는다.
    - 컴포넌트: 데스크톱이면 tick-chart-hint 가 있고 폰이면 없다.
  </behavior>
  <action>
    1) tick-chart.ts:
    (a) turnoverIdxBefore(s, t) 를 export 한다. lowerBoundF − 1 로, t 보다 앞선 마지막 점 색인을 돌려준다(없으면 −1).
    (b) TurnoverSeries 에 val0 필드를 더한다. turnoverSeriesOf 의 n === 0 분기에서 잡는 시작값 v(첫 A3 거래소 누적 − 그 체결 = 기록 시작 전 거래대금)를 그대로 담는다. 점이 없으면 0 이다. 실제 하루는 기록이 늦게 시작해 이 값이 0 보다 크다. 그래서 구간이 첫 A3 앞에서 시작해도 구간 거래대금에 기록 전 몫이 섞이지 않게, 빼는 값으로 쓴다. 테스트 하루(synth)는 0 이다. 이 타입을 리터럴로 만드는 테스트가 있으면 val0 을 채운다.

    2) tick-chart-tip.ts:
    (a) TickRangeSum 인터페이스와 tickRangeSumOf(session: TickSession, t0, t1) 를 export 한다(t0 · t1 정규화).
    - 금액은 turnoverSeriesOf(session) 로 구한다. i1 = turnoverIdxAt(s, hi), i0 = turnoverIdxBefore(s, lo).
      · buy = teamBuy[i1] − teamBuy[i0] · sell = teamSell 같은 식 · tv = val 같은 식. i0 < 0 이면 빼는 값은 teamBuy · teamSell 은 0, val 은 s.val0 이다. i1 < 0(구간 끝까지 체결 없음)이면 금액은 전부 0 이다.
      · 이 계열이 팀 체결 조각 수신 시각 기준이라, 10분 막대 · 넷째 판과 같은 수가 나온다(목업 주석 「범위 합계 기준」).
    - 건수: session.team.fills 중 수신 ms(msOfNs(session.index.recvNs[f.rec]))가 [lo, hi] 안인 조각의 session.orderOfRec[f.rec] 를 쪽별(bs '2' 매수 · '1' 매도) Set 으로 센다.
    - net = buy − sell · share = tv > 0 ? (buy + sell) ÷ tv : null.
    - px0 = priceIdxAt(priceSeriesOf(session), lo) 의 가격. 없으면 구간 안 첫 가격 점 · 그것도 없으면 null.
    - px1 = priceIdxAt(…, hi) 의 가격(없으면 null) · chgPct 는 둘 다 있을 때만.
    - TickSession 은 type import, msOfNs · priceSeriesOf · turnoverSeriesOf · turnoverIdxAt · turnoverIdxBefore · priceIdxAt 는 ./tick-chart 에서 가져온다.
    (b) fmtRangeDur(ms) 를 export 한다(목업 dur: 「h시간 m분」 · 「m분 s초」 · 「s초」).
    테스트는 tick-chart-tip.test.ts 에 쓴다. synthSession · a3Msg · b6Msg · synthNs 를 @/test-fixtures/tick-synth 에서 가져와, 컴포넌트 테스트 krx 와 같은 하루를 만든다. 구간 끝은 synthNs(ms) 로 만든 수신 ms 다(예: 0.95ms ~ 1.15ms = seq 101 · 102).

    3) 새 파일 webapp/src/components/ticks/tick-chart-range.tsx(표시 전용):
    - export TickChartRange({ sum, t0, t1, dragging, onClear }).
    - 루트 data-slot="tick-chart-range" · border-t · 목업 .rng 모양.
    - 머리: 「구간 HH:MM:SS ~ HH:MM:SS」 bold 12px + fmtRangeDur(mono 11px --muted-fg). 오른쪽에 dragging 이면 「끄는 중…」(--primary), 아니면 button 「✕ 지우기 (Esc)」(rounded-full · --muted 배경 · 11px · onClick = onClear).
    - 세 칸: --muted 배경 · 둥근 10px · 칸마다 dt 10.5px --muted-fg · dd mono 16px semibold.
      · 「팀 매수」: --up · 금액 + small 「n건」
      · 「팀 매도」: --down · 같은 꼴
      · 「팀 순매수」: 부호색 · fmtSignedAmountC
    - 발: 11px --muted-fg. 「구간 거래대금 X · 팀 비중 n.n%(--team) · 가격 a → b (±x% 부호색)」. 비중 · 가격이 null 이면 그 조각을 뺀다.

    4) tick-chart.tsx:
    (a) 창 이동 잠금: panLockRef = useRef(false) 를 만든다. useChartGestures 넷째 인자를 inspectRef 에서 panLockRef 로 바꾼다. 터치 살펴보기 onStart/onEnd 는 inspectRef 와 panLockRef 를 함께 켜고 끈다. Shift 구간 끌기 시작/끝도 panLockRef 를 켜고 끈다. 훅 · 매집감지 차트는 그대로다. inspectRef 는 지금처럼 touchmove 스크롤 억제 · contextmenu 에만 쓴다.
    (b) 상태:
    - sel: { session, t0, t1 } | null — 다른 세션이면 null 로 본다. 종목 · 날짜가 바뀌면 지워진 것과 같다(hover 의 vk 와 같은 파생 패턴 · effect 없이).
    - draft: { t0, t1 } | null — 끄는 중.
    - rangeDownRef: { t0, clientX, moved } | null.
    (c) onPointerDown: pointerType mouse · button 0 · e.shiftKey · !phone · 누른 viewBox x 가 [L, xr] 안이면 rangeDownRef 를 채우고 panLockRef 를 켠다. 나머지는 지금 코드 그대로다(downRef · tracker).
    (d) onPointerMove: rangeDownRef 가 있으면 가장 먼저 처리하고 return 한다(호버 · dragging 검사보다 앞). 이동 거리 > CLICK_SLOP_PX 이면 moved = true 로 두고 setDraft({ t0: 시작, t1: [L, xr] 로 자른 x 의 시각 }) 를 한다.
    (e) onPointerUp 에서 moved 면 sel = 정렬한 { session, t0, t1 } 로 확정한다. pointercancel · lostpointercapture 는 draft 만 버리고 이전 sel 은 둔다. 어느 경우든 rangeDownRef · draft 를 비우고 panLockRef 를 끈다. 기존 tracker.end 호출은 그대로 둔다.
    (f) onClick: 기존 끌기 문턱 검사가 구간 끌기 뒤 클릭을 이미 거른다. 우리 점 · 팀 원 클릭은 지금처럼 먼저 처리하고, 구간은 그대로 남는다. 그다음 sel 이 있으면 sel 만 지우고 return 한다 — 결정 ③ 「빈 곳 클릭」, 이 클릭은 시각 이동이 아니다(목업 「구간 지움(이 클릭은 시각 이동 안 함)」). sel 이 없으면 지금처럼 onSeekMs 다.
    (g) Esc: sel 이나 draft 가 있는 동안만 document keydown 리스너를 단다(useEffect · 정리). Escape 이고 e.defaultPrevented 가 아니며 대상이 input · textarea · select · contentEditable 이 아니면 sel · draft 를 지운다. 종목 고르기 입력 · 슬라이더의 Esc 를 가로채지 않는다.
    (h) SVG 덧그림: 클립 그룹 안 · 커서 선 앞 · pointerEvents none. 대상은 draft ?? sel(목업 overlay)이다.
    - tick-range-band: x(t0)~x(t1) 을 [L, xr] 로 자름 · y1a~y4b · fill var(--primary) · fillOpacity 0.1 · 양 끝 세로선 stroke var(--primary) · strokeOpacity 0.55.
    - tick-range-pill: 순매수 판 위 y2a − 15 · 높이 14 · rx 7 · fill var(--primary) · 글자 「순 ±X」 10.5px semibold var(--primary-fg). 폭 ≈ 글자 수 × 6.4 + 10, 그림 영역 안으로 자른다.
    구간 끄는 중 svg 커서는 cursor-col-resize 다.
    (i) wrap 아래: (draft ?? sel) 이 있으면 <TickChartRange sum={tickRangeSumOf(session, …)} dragging={draft !== null} onClear /> 를 그린다. 그 아래 데스크톱만 data-slot="tick-chart-hint" 한 줄을 둔다. 문구는 목업 hint 의 Shift 안이다: 「Shift+끌기 구간 합계 · 끌기 창 이동 · 휠 확대/축소 · 클릭 그 시각으로 · Esc 구간 지움」. 키 이름은 mono · --muted 배경 kbd 꼴 · 11px --muted-fg.
    결과 줄 · 안내 줄은 차트 아래에만 붙어서, 손을 떼도 차트가 밀리지 않는다(결정 ③).
    (j) 머리 주석 ② 조작에 「Shift+끌기 = 구간 합계(데스크톱 마우스만) · Esc/✕/빈 곳 클릭 = 지움」을 적는다. wrap aria-label 끝에 「, Shift+끌기 구간 합계」를 더한다.

    5) 테스트: behavior 대로 쓴다.
    - Shift 끌기: fireEvent.pointerDown(svg, { shiftKey: true, button: 0, pointerType: 'mouse', clientX, clientY }) → pointerMove → pointerUp.
    - getBoundingClientRect 모의는 640 × 307 이다.
    - 이동 잠금 테스트는 「1분」 버튼으로 창을 좁힌 뒤(waitFor) Shift+끌기 전후 tick-chart-cursor x1 을 비교한다.

    하지 않는다: 폰 구간 선택, 공용 훅 수정, 구간을 URL · 저장소에 남기기.
  </action>
  <verify>
    <automated>npm --prefix webapp run test -- --maxWorkers=2 src/lib/ticks/__tests__/tick-chart-tip.test.ts src/components/ticks/__tests__/tick-chart.test.tsx && npm --prefix webapp run typecheck && grep -c "export function tickRangeSumOf" webapp/src/lib/ticks/tick-chart-tip.ts && grep -c 'data-slot="tick-chart-range"' webapp/src/components/ticks/tick-chart-range.tsx && git diff --quiet HEAD -- webapp/src/hooks/use-chart-view.ts webapp/src/components/analytics/accum-chart.tsx webapp/src/lib/accum-chart.ts</automated>
  </verify>
  <done>데스크톱에서 Shift+끌기로 고른 구간의 팀 매수 · 매도(건수) · 순매수 · 거래대금 · 팀 비중 · 가격이 차트 아래 줄에 나온다. 그냥 끌기는 창 이동이고 Shift+끌기 동안 창은 움직이지 않는다. Esc · ✕ · 빈 곳 클릭으로 지워진다. 폰에서는 구간이 생기지 않는다. 테스트 · typecheck 가 통과하고, 매집감지 차트 · 공용 훅 diff 는 0 이다. 커밋 1개가 남는다.</done>
</task>

</tasks>

<verification>
마지막에 한 번 돌린다(동시 세션이 있는 Mac 이라 vitest 는 --maxWorkers=2):
1. npm --prefix webapp run test -- --maxWorkers=2 src/lib/ticks src/components/ticks src/hooks src/components/analytics — 틱 뷰어 전부와 매집감지 차트 · 공용 훅 테스트가 통과한다(accum 회귀 0).
2. npm --prefix webapp run typecheck — tsc 본체 + e2e tsconfig 가 통과한다.
3. (cd webapp && npx --no-install eslint src/components/ticks src/lib/ticks) — error 0 이다. HEAD 기준 기존 warning 1건(use-tick-live.test.tsx _omit)은 그대로 둔다.
4. git diff --quiet HEAD -- webapp/src/hooks/use-chart-view.ts webapp/src/components/analytics/accum-chart.tsx webapp/src/lib/accum-chart.ts — 종료 코드 0 이다.
5. e2e 는 환경이 될 때만 돌린다(다른 세션이 playwright 를 돌리지 않을 때). npm --prefix webapp run test:e2e -- --workers=1 e2e/specs/ticks-viewer.spec.ts -g "차트 —". webServer 타임아웃이 반복되면 rm -rf webapp/.next 후 다시 돌린다. 못 돌렸으면 SUMMARY 에 「e2e 미실행」이라고 적는다. 이 단계 때문에 완료를 막지는 않는다.
6. 배포 · push 하지 않는다. 커밋은 Task 마다 경로를 지정해서 한다(git add -A 금지 — 동시 세션 경합). 메시지는 한글이고 Co-Authored-By 를 넣지 않는다.
</verification>

<success_criteria>
- 결정 ① 고정 띠 B: 4칸 · 마우스 = 그 시각 · 떼면 현재 틱 · 높이 고정 · 차트를 안 가림 · 폰 2×2. 판별 툴팁은 없다.
- 결정 ② 원 옆 작은 상자: 주문마다 한 줄 표(지금 ±5px 묶음 규칙 그대로) · 우리 줄은 표 아래에 그대로.
- 결정 ③ Shift+끌기 구간 합계: 그냥 끌기 = 이동 · 결과 줄은 차트 아래 · Esc/✕/빈 곳 클릭으로 지움 · 폰 제외.
- 결정 ④ 순매수 판: 매수 누적 + 0선 아래 거울 매도 누적 · 판 70/50 · 차트 307/222 · 축 범위에 두 선 포함.
- 매집감지 상세 차트 · 공용 훅 무변경. 위 verification 1~4 가 통과한다.
</success_criteria>

<output>
Create `.planning/quick/261104-umt-tick-timeline-sketch028/261104-umt-SUMMARY.md` when done
</output>