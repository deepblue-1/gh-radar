---
phase: quick-261028-ggj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/accum-chart.ts
  - webapp/src/lib/__tests__/accum-chart.test.ts
  - webapp/src/components/analytics/accum-chart.tsx
  - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
  - webapp/e2e/specs/accum-report.spec.ts
  - webapp/src/lib/touch-inspect.ts
  - webapp/src/lib/__tests__/touch-inspect.test.ts
  - webapp/src/hooks/use-chart-view.ts
  - webapp/src/hooks/__tests__/use-chart-view.test.tsx
  - docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md
autonomous: true
requirements: [NOTE-R1, NOTE-R2, NOTE-R3, NOTE-R4, NOTE-R5, NOTE-R6, TOUCH-HOLD, TOUCH-COEXIST, TOUCH-TIP, INBOX-DONE]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "마우스를 가격 판 원에 대면 씨앗(세로선 |mx − cx| ≤ r + 2 인 원 중 세로로 가장 가까운 원 · nearestOrderOf 그대로)과 직접 닿는 원만 묶인다. 닿음 = 화면 px 중심 거리² ≤ (r씨앗 + r)². 묶음 대상은 보이는 원(주문 시각이 보기 창 [t0, t1] 안이고 가격 > 0)뿐이다. 매수/매도는 가리지 않고, 사슬로 따라가지 않는다 — A–B–C 로 이어 겹친 곳에서 A 를 고르면 묶음 = {A, B} 이고 C 는 고리 · 건수에 들지 않는다 (노트 규칙 1 · 2)"
    - "묶음은 시간순(같으면 원래 번호순)이다. 묶음 크기가 1 이면 툴팁 2줄 · accum-order-hover 고리 1개 · 굵은 고리 없음으로 지금과 같다 (규칙 3)"
    - "묶음(2개 이상)이면 툴팁은 정확히 3줄이다. 1줄 = 고른 원의 한 원 툴팁(orderTipOf 2줄)을 ' · ' 로 이은 것. 2줄 = `묶음 N건 HH:MM:SS ~ HH:MM:SS · 방향 · 가격 첫 → 끝 (±0.00%)`(같은 초면 시각 하나 · 한쪽만이면 `팀 매수 N건 합계 X.XX억` · 섞이면 `팀 매수 N건 X.XX억 · 팀 매도 M건 Y.YY억` · NXT 가 있으면 방향 끝에 ` (NXT 포함)`). 3줄 = `큰 주문 ` + 금액 내림차순(같으면 시간순 → 번호순) 상위 3개 `X.XX억@가격` 을 ' · ' 로 잇고, 섞였을 때만 앞에 `매수 `/`매도 ` 를 붙인다. 묶음 맥락 줄은 없다. 합성 7건으로 만든 2 · 3줄이 노트 예시 2 · 3줄과 글자 단위로 같다 (규칙 5)"
    - "묶음이면 고른 원이 아닌 묶음 원마다 1.5px 고리(data-slot accum-order-hover)가 붙고, 고른 원에만 2.5px 고리(data-slot accum-order-seed) 하나가 붙는다. 같은 묶음 안에서 다른 원으로 옮겨 씨앗이 바뀌면 굵은 고리 자리와 툴팁 1줄이 바뀐다(dedupe key = `o{씨앗 번호}`) (규칙 4 · 6)"
    - "폰: 손가락을 차트에 대고 300ms 동안 8px 안에 머물면 살펴보기가 켜진다. 그 손가락 자리에서 마우스와 같은 판정으로 툴팁 · 고리가 뜬다(가격 판 = 씨앗/묶음 · 누적 판 · 10분 판). 켜진 동안 손가락을 움직이면 대상이 따라 바뀐다. 이때 차트 창은 움직이지 않고(한 손가락 끌기 무시) touchmove 가 preventDefault 되어 페이지도 스크롤되지 않는다. 손을 떼거나 pointercancel 이 오면 툴팁 · 고리가 사라지고 살펴보기가 꺼진다"
    - "300ms 전에 8px 넘게 움직이면 지금 그대로 가로 끌기 = 창 이동, 세로 = 페이지 스크롤이다. 두 번째 손가락이 닿으면(핀치) 살펴보기는 켜지지 않거나 즉시 꺼지고 핀치 확대가 그대로 된다. 마우스 · 펜 동작은 바뀌지 않는다"
    - "터치 툴팁은 차트 안에 있다(left 4 · 최대 폭 W − 8 · 줄바꿈 · 세로 0 ~ H). 위에 자리가 있으면 손가락 위 32px 에 놓이고, 없으면 손가락 아래 32px, 둘 다 안 되면 차트 안쪽으로 붙인다(touchTipTopOf). iOS 길게 누르기 콜아웃이 뜨지 않는다(WebkitTouchCallout none)"
    - "인박스 노트 261028-accum-chart-hover-group.md 가 status: done · done_commit = 마지막 코드 커밋으로 경로 지정 커밋된다"
  artifacts:
    - path: "webapp/src/lib/accum-chart.ts"
      provides: "ChartHover.group? · orderGroupOf(묶음 판정) · orderGroupTipOf(묶음 3줄) · orderHoverOf(가격 판 hover 한 번에)"
      contains: "export function orderGroupOf"
    - path: "webapp/src/lib/touch-inspect.ts"
      provides: "createTouchInspect(길게 누르기 상태기 · 300ms · 8px · 핀치 취소) · touchTipTopOf(터치 툴팁 세로 자리) · 상수 TOUCH_HOLD_MS · TOUCH_SLOP_PX · TOUCH_TIP_GAP"
      contains: "export function createTouchInspect"
    - path: "webapp/src/components/analytics/accum-chart.tsx"
      provides: "pickAt(판 판정 공용) · 묶음 고리/굵은 고리 · 터치 살펴보기 배선(포인터 핸들러 · 비수동 touchmove · 터치 툴팁 자리)"
      contains: "accum-order-seed"
    - path: "webapp/src/hooks/use-chart-view.ts"
      provides: "useChartGestures 넷째 인자 inspectingRef — 켜져 있으면 한 손가락 이동이 창을 옮기지 않는다"
      contains: "inspectingRef"
    - path: "docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md"
      provides: "처리 완료 표시 + gh-radar 반영 요약"
      contains: "status: done"
  key_links:
    - from: "webapp/src/components/analytics/accum-chart.tsx"
      to: "webapp/src/lib/accum-chart.ts orderHoverOf"
      via: "pickAt 가격 판 갈래 — nearestOrderOf 씨앗 → orderHoverOf(payload, row, circles, seed, view, { dayAxis })"
      pattern: "orderHoverOf\\("
    - from: "webapp/src/components/analytics/accum-chart.tsx"
      to: "webapp/src/hooks/use-chart-view.ts useChartGestures"
      via: "넷째 인자 inspectRef(useRef<boolean>) — 살펴보기 중 한 손가락 pan 무시"
      pattern: "useChartGestures\\(svgRef, \\{ L, W, R \\}, hasPrice \\? ctl : null, inspectRef\\)"
    - from: "webapp/src/components/analytics/accum-chart.tsx"
      to: "webapp/src/lib/touch-inspect.ts createTouchInspect"
      via: "onPointerDown → down · onPointerMove(touch) → move · onPointerUp/onPointerCancel/onLostPointerCapture → end"
      pattern: "createTouchInspect\\("
    - from: "webapp/src/components/analytics/accum-chart.tsx"
      to: "브라우저 스크롤"
      via: "svg 에 네이티브 touchmove { passive: false } — inspectRef.current 면 preventDefault (React onTouchMove 는 passive 라 안 먹는다)"
      pattern: "passive: false"
---

<objective>
gh-trade 인계 노트 `docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md`(개정판 · 규칙 1~6 정본)대로 매집감지 상세 차트의 마우스 툴팁을 「고른 원 + 직접 닿는 원 묶음」 으로 바꾼다. 모바일에서는 길게 누르기(300ms · 8px)로 같은 툴팁 · 고리를 띄운다. 웹만 고친다 — relay · DB · 와이어 · shared 는 바꾸지 않는다.

Purpose: 원이 몰린 구간에서 한 원만 보이던 툴팁을 묶음 건수 · 합계 · 큰 주문으로 넓혀 gh-trade 클라와 같은 정보를 준다. 마우스가 없는 폰에서도 원 정보를 볼 수 있게 한다.
Output: 순수 함수(묶음 판정 · 3줄 문자열 · 길게 누르기 상태기 · 터치 툴팁 자리) + 단위 테스트, 차트 컴포넌트 배선 + 컴포넌트 테스트, 훅 pan 억제 플래그 하나, e2e 기대값 갱신(실행은 하지 않음), 인박스 노트 done.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md
@webapp/src/components/analytics/accum-chart.tsx
@webapp/src/hooks/use-chart-view.ts

<interfaces>
**lib `webapp/src/lib/accum-chart.ts`** (1074줄 — 필요한 범위만 연다)
- 1~23 import: shared `AccumReportOrders` · `AccumReportPayload` · `AccumReportRow`, `kstClock`(limitup-report · ms → `HH:MM:SS` KST), `MINUS` · `fmtEok(won, { signed?, digits?: 1|2 })`(2자리 = `0.85억` · 0 = `0.00억` · null = `—`) · `isNum` · `kstHm`(teamflow-report).
- 29 `ACCUM_CHART = { R: 56, TOP: 16, H1: 200, GAP: 24, H2: 112, H3: 72, BOT: 24, H: 472, TICK_Y: 465 }` · 42 `View { t0; t1 }`.
- 476 `OrderCircle { i; cx; cy; r; side: 'B'|'S'; first; title }` — `title` = `HH:MM:SS 팀 매수 N주 · X.XX억 @가격 · N조각[ · 팀매수 시작]`. 488 `INT_FMT`(ko-KR 정수). 494 `orderCirclesOf(orders, view, x, y)` — 창 ±30분 원 포함 · 그리기 순서(큰 원 → 작은 원 → first).
- 661 `HOVER_PAD = 2` · 665 `ChartHover { key; lines: string[]; circle: OrderCircle | null }` · 679 `pct2(v)`(모듈 비공개 · `+1.64%` / `−0.81%`(MINUS) / `0.00%`).
- 724 `nearestOrderOf(circles, mx, my)` · 750 `orderTipOf(payload: Pick<'orders'|'day_cum_net'|'avg_px'|'pos_day'>, row: Pick<'base'>, c, { dayAxis })` → `[c.title, 맥락 줄]` 또는 `[c.title]`.
- 789 `cumTipAt` · 841 `bucketTipAt` — 둘 다 `{ key, lines, circle: null }`. 기존 테스트가 `toEqual` 로 잠그므로 새 필드는 **선택(?)** 이어야 한다.

**컴포넌트 `webapp/src/components/analytics/accum-chart.tsx`**
- 79~84 머리 주석 「마우스 툴팁」 단락(「터치는 상자를 띄우지 않는다」 문장 포함). 109~119 훅 · 상태 · 이른 반환 `if (!hasPrice) return null;`(119). **모든 새 훅은 119 위에 둔다.**
- 114 `useChartGestures(svgRef, { L, W, R }, hasPrice ? ctl : null)` → `{ dragging }`. 훅은 터치 pointerdown 에도 dragging = true 로 바꾼다. 115~118 `hoverState` · `vk` · `hover = … && !dragging`.
- 166 `circles` · 185~204 `onPointerMove`: 터치 · dragging 이면 return → mx/my = (client − box) × W/box.width → 세 판 판정 → key 같으면 return → setHover. 219~231 svg 속성(`touchAction: 'pan-y'` · userSelect none). 418~430 hover 고리 하나(`data-slot="accum-order-hover"` · r + 1 · --fg · 1.5). 547~563 툴팁 div(`whitespace-nowrap` · 절반 기준 left/right · top/bottom).

**훅 `webapp/src/hooks/use-chart-view.ts`** — 202~214 `useChartGestures(svgRef, geom, ctl)` · `geomRef`/`ctlRef` 는 인자 없는 useLayoutEffect 로 갱신. 269~291 `onMove`: 포인터 2개면 핀치, 아니면 `pointers.set(id, x)` → `dx` → `schedule(panBy)`. 293 `onEnd`. 리스너는 네이티브(298~303).

**테스트 하네스**
- `webapp/src/lib/__tests__/accum-chart.test.ts` 691~775 툴팁 describe(`at('HH:MM:SS')` = 그날 KST ms 도우미 · `orders`/`payload`/`circles` 문법 · `T0`).
- `webapp/src/components/analytics/__tests__/accum-detail.test.tsx` — `expand(isin)` · `chartOf` · `detailOver` · (c9) 168~207: 천일고속 first 원(09:01:00) 마우스 = 2줄 + 고리 1개. 탐침 결과 W=640 전체 창에서 이 원은 **홀로**(묶음 1)라 c9 는 그대로 통과해야 한다. 천일고속 원 45개 중 31개는 묶음(최대 7)이다. jsdom 29 에는 `PointerEvent`(pointerId · pointerType)가 있고 `requestAnimationFrame` 은 없다(useChartView 는 setTimeout 16 폴백). getBoundingClientRect 는 0 이라 mx = clientX 다.
- `webapp/src/hooks/__tests__/use-chart-view.test.tsx` — `Harness` · `setup()`(rect 목 · setPointerCapture 목) · `ptr(svg, type, id, x)`(MouseEvent + pointerId · pointerType touch) · rAF 수동 큐 `flushFrame` · `rafCalls`.
- `webapp/e2e/specs/accum-report.spec.ts` 319~356 P34-AC1b(한선 가장 큰 원 마우스 → 2줄 · 고리 1개 · 상자 차트 안). 한선은 원 501개 중 494개가 묶음이라 **새 규칙에서 깨진다** → Task 1 에서 기대값을 고친다. 실행은 하지 않는다(사용자 제약 · e2e 금지).

**데이터 사실** — 웹 payload.orders 는 `{t_ms, side, qty, val, px, pieces, first}` 이고 거래소 칸이 없다. accum_flow export 원천은 KRX 전용이다(인박스 261022-accum-nxt-team-burst 24행 「밤 배치(accum_flow · team_flow export)… 그대로 KRX 전용」). 그래서 ` (NXT 포함)` 규칙은 `isNxt` 술어 옵션으로 구현하고 테스트로 잠근다. 컴포넌트는 술어를 넘기지 않는다(넘길 데이터가 없다).
</interfaces>

<coverage_audit>
원천 = 인계 노트 규칙 1~6 · 오케스트레이터 task_scope A · B · constraints. CONTEXT · RESEARCH · REQUIREMENTS 없음(quick).
- 규칙 1 씨앗(nearestOrderOf 그대로) → Task 1 (NOTE-R1)
- 규칙 2 직접 닿음 · 사슬 금지 · 보이는 원 · 가격 0 제외 · 화면 px → Task 1 orderGroupOf (NOTE-R2)
- 규칙 3 시간순(→ 번호순) · 크기 1 = 지금 툴팁 → Task 1 (NOTE-R3)
- 규칙 4 묶음 고리 1.5 · 고른 원만 2.5 → Task 1 컴포넌트 (NOTE-R4)
- 규칙 5 3줄 문자열(같은 초 · 방향 3꼴 · NXT · 가격 변화 · 큰 주문 3개 · 섞임 접두) · 묶음 맥락 줄 없음 → Task 1 orderGroupTipOf (NOTE-R5)
- 규칙 6 씨앗이 바뀌면 다시 그림 → Task 1 key `o{씨앗}` + 컴포넌트 테스트 (NOTE-R6)
- B 길게 누르기 300ms · 8px · 두 번째 손가락 취소 · 떼면 숨김 → Task 2 상태기 + Task 3 배선 (TOUCH-HOLD)
- B 기존 제스처 공존(세로 스크롤 · 가로 pan · 핀치) · 살펴보기 중 pan 금지 · 스크롤 금지 → Task 2 훅 플래그 + Task 3 비수동 touchmove (TOUCH-COEXIST)
- B iOS 콜아웃 억제 · 툴팁 차트 안 · 손가락 위 → Task 2 touchTipTopOf + Task 3 (TOUCH-TIP)
- 인박스 노트 done → Task 3 (INBOX-DONE)
- 빠진 항목 없음. NXT 접미는 규칙을 구현하고 테스트하지만, 웹 payload 에 거래소 칸이 없어 실제 화면에는 나오지 않는다(위 데이터 사실 · SUMMARY 와 노트 답에 적는다).
</coverage_audit>

<discretion>
노트 · 범위가 정하지 않아 Claude 가 고른 것(SUMMARY 에 그대로 옮긴다):
- 1줄 = 웹 한 원 툴팁 2줄을 ' · ' 로 이어 한 줄로 만든다. 노트는 「묶음이면 3줄 · 1줄 = 지금 한 원 툴팁 줄과 똑같다」 고 하는데, gh-trade 한 원 툴팁은 1줄이고 웹은 2줄(title + 맥락)이다. 3줄 구조와 「똑같은 내용」 을 둘 다 지키려고 잇는다.
- 굵은 고리 색 = `var(--fg)`(라이트 #191f28 ≈ 검정 · 다크에서도 보임). gh-trade 「2.5px 검정」 을 테마에 맞게 옮겼다. 고른 원은 얇은 고리 대신 굵은 고리만 받는다(gh-trade seedRim 이 hoverRim 을 대신한다).
- 씨앗이 보이는 창 밖(창 ±30분 원)이거나 가격 0 이면 묶음 = [씨앗] 이라 지금 한 원 툴팁 그대로다. 웹 nearestOrderOf 가 창 밖 원도 고를 수 있어서, 지금 동작을 유지하려고 이렇게 정했다.
- 마우스 툴팁의 `whitespace-nowrap` 을 빼고 `break-keep` 과 줄마다 내어쓰기(`pl-3 -indent-3`)를 단다. 1줄이 길어져(약 100자) 가운데쯤 원에서 상자가 차트 오른쪽 밖으로 나가던 것을, 절대 위치 상자의 shrink-to-fit 으로 래퍼 안에서 접히게 한다.
- 터치 살펴보기는 마우스와 같은 pickAt 을 쓴다 — 누적 판 · 10분 판 툴팁도 터치로 볼 수 있다.
</discretion>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — 묶음 판정 → 묶음 3줄 → 마우스 툴팁 · 묶음 고리 · 고른 원 굵은 고리 (노트 규칙 1~6)</name>
  <files>webapp/src/lib/accum-chart.ts, webapp/src/lib/__tests__/accum-chart.test.ts, webapp/src/components/analytics/accum-chart.tsx, webapp/src/components/analytics/__tests__/accum-detail.test.tsx, webapp/e2e/specs/accum-report.spec.ts</files>
  <read_first>
    - docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md 전체(규칙 1~6 · 예시 3줄)
    - webapp/src/lib/accum-chart.ts 1~30 · 476~522 · 660~768
    - webapp/src/lib/__tests__/accum-chart.test.ts 1~78(import 목록 · at 도우미) · 691~775
    - webapp/src/components/analytics/accum-chart.tsx 전체
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx 1~110 · 168~207
    - webapp/e2e/specs/accum-report.spec.ts 319~356
  </read_first>
  <behavior>
    lib 단위(accum-chart.test.ts · 새 describe 「quick-261028-ggj 묶음 툴팁(gh-trade 261028 규칙 1~6)」):
    - orderGroupOf 사슬: 손으로 만든 원 A{i0 · cx 100 · cy 100 · r 5} · B{i1 · cx 108} · C{i2 · cx 116}(모두 cy 100 · r 5 · 시각 창 안 · 가격 > 0). 씨앗 A → 번호 [0, 1](C 빠짐) · 씨앗 B → [0, 1, 2] · 씨앗 C → [1, 2].
    - 경계: 중심 거리 = r씨앗 + r(거리² 같음)이면 든다.
    - 서로 다른 반지름: 씨앗 r 7 · 후보 r 2.2 · 거리 9.1 → 든다 · 9.3 → 안 든다.
    - 보이는 원만: 닿아도 시각이 창 밖이거나 가격 0 인 원은 빠진다. 씨앗이 창 밖이면 [씨앗].
    - 정렬: 시각 오름차순 · 같은 시각이면 번호 오름차순(씨앗이 늦은 시각이면 맨 앞이 아니다).
    - orderGroupTipOf 정확한 문자열 — 합성 7건(KST 그날 · i0~i6): 10:05:12 B 0.40억 @12,200 · 10:07:30 B 1.20억 @12,300 · 10:09:05 S 0.30억 @12,320 · 10:12:34 B 0.85억 @12,350(씨앗) · 10:14:00 S 0.60억 @12,380 · 10:16:20 B 0.35억 @12,390 · 10:18:40 B 0.30억 @12,400. 결과는 정확히 3줄이다. lines[1] === `묶음 7건 10:05:12 ~ 10:18:40 · 팀 매수 5건 3.10억 · 팀 매도 2건 0.90억 · 가격 12,200 → 12,400 (+1.64%)`, lines[2] === `큰 주문 매수 1.20억@12,300 · 매수 0.85억@12,350 · 매도 0.60억@12,380`(노트 예시 2 · 3줄 그대로). lines[0] === `orderTipOf(payload, row, seed).join(' · ')` 이고 `10:12:34 팀 매수 ` 로 시작하며 맥락 조각(`순매수 누적` 또는 dayAxis 면 `당일 순매수`)을 담는다.
    - 크기 1: `orderGroupTipOf(…, seed, [seed])` toEqual `orderTipOf(…, seed)`(2줄 그대로).
    - 한쪽만: 매수만 3건 → lines[1] 에 `· 팀 매수 3건 합계 X.XX억 ·` 가 있고 lines[2] 항목에 `매수 `/`매도 ` 접두가 없다. 매도만 → `팀 매도 N건 합계`.
    - 같은 초: 10:00:00.200 · 10:00:00.900 두 건 → `묶음 2건 10:00:00 · …`(` ~ ` 없음).
    - NXT: `{ isNxt: (i) => i === 4 }` → 방향 조각 끝에 ` (NXT 포함)` 이 붙고 바로 ` · 가격 ` 이 이어진다(`팀 매도 2건 0.90억 (NXT 포함) · 가격 12,200 → …`). 옵션이 없으면 접미가 없다.
    - 가격 변화: 끝 < 첫 → `(−0.81%)`(U+2212) · 같으면 `(0.00%)`.
    - 큰 주문 동률: 금액이 같으면 시각순, 시각도 같으면 번호순. 4건 이상이면 3개만, 2건이면 2개.
    - orderHoverOf: key === `o{씨앗.i}` · circle === 씨앗 · 묶음 ≥ 2 면 `group`(시간순 · 씨앗 포함) · 크기 1 이면 `group` 키가 없다(`'group' in h` false) · lines = orderGroupTipOf 결과.
    컴포넌트(accum-detail.test.tsx · 천일고속 실측):
    - (c9) 그대로 통과하고 단언 한 줄을 더한다: first 원 마우스 때 `[data-slot="accum-order-seed"]` 없음.
    - (c9g · 새 it) 데이터 원(`[data-slot="accum-price-layer"] > circle:not([data-slot])`)을 차례로 마우스로 대 보다가 툴팁이 3줄인 첫 원을 고른다(없으면 실패). lines[1] 은 `^묶음 (\d+)건 \d\d:\d\d:\d\d( ~ \d\d:\d\d:\d\d)? · 팀 (매수|매도) .+ · 가격 [\d,]+ → [\d,]+ \([+−]?\d+\.\d\d%\)$` 에 맞고, lines[2] 는 `^큰 주문 ` 으로 시작하며 ` · ` 로 나눈 항목 수 = min(3, N) 이다. lines[0] 은 `^\d\d:\d\d:\d\d 팀 (매수|매도) [\d,]+주 · [\d.,]+억 @[\d,]+ · \d+조각` 으로 시작하고 `순매수 누적` 을 담는다. 고리는 accum-order-hover N − 1 개 + accum-order-seed 1개다.
    - (c9s · 규칙 6) 같은 묶음의 얇은 고리 자리(cx · cy)로 차례로 옮겨, 굵은 고리 자리가 바뀌는 첫 경우에 lines[0] 도 바뀌었는지 단언한다(그런 경우가 없으면 실패).
  </behavior>
  <action>
RED 먼저 — behavior 의 lib · 컴포넌트 테스트를 쓰고, 새 export 가 없어 실패하는 것을 확인한 뒤 커밋한다. 메시지: 「test(quick-261028-ggj): 매집 차트 묶음 툴팁 · 묶음 고리 실패 테스트」.

GREEN — lib `webapp/src/lib/accum-chart.ts`(orderTipOf 바로 뒤에 둔다 · 문체는 주변 JSDoc 처럼 한국어 · gh-trade 출처 명시):
1. `ChartHover` 에 선택 필드 `group?: readonly OrderCircle[]` 를 더한다. JSDoc: 가격 판 묶음(2개 이상 · 시간순 · 씨앗 포함)일 때만 있고 고리 강조용이다 — quick-261028-ggj. cumTipAt · bucketTipAt 반환은 바꾸지 않는다(기존 toEqual 보존).
2. `export function orderGroupOf(orders: Pick<AccumReportOrders, 't_ms' | 'px'>, circles: readonly OrderCircle[], seed: OrderCircle, view: View): OrderCircle[]` — 노트 규칙 2 · 3, gh-trade OverlapGroup · TryCircleOf 동형.
   - 보임 = `orders.t_ms[c.i]` 가 수이고 [view.t0, view.t1] 안 · `orders.px[c.i]` 가 수이고 > 0.
   - 씨앗이 안 보이면 `[seed]` 를 반환한다(discretion 3 · 지금 툴팁 유지).
   - 아니면 씨앗 + (c.i ≠ seed.i · 보임 · (c.cx − seed.cx)² + (c.cy − seed.cy)² ≤ (seed.r + c.r)²)인 원이다. 제곱 비교만 하고 제곱근은 쓰지 않는다. **씨앗과의 거리만 본다 — 사슬 금지.**
   - (시각, 번호) 오름차순으로 정렬한다.
3. `export function orderGroupTipOf(payload: Pick<AccumReportPayload, 'orders' | 'day_cum_net' | 'avg_px' | 'pos_day'>, row: Pick<AccumReportRow, 'base'>, seed: OrderCircle, group: readonly OrderCircle[], opts: { dayAxis?: boolean; isNxt?: (i: number) => boolean } = {}): string[]` — 노트 규칙 5, gh-trade GroupTooltipText 동형.
   - `single = orderTipOf(payload, row, seed, { dayAxis: opts.dayAxis })`. group.length < 2 면 single 을 그대로 반환한다.
   - 1줄 = `single.join(' · ')`(discretion 1).
   - 첫 · 끝 = group 의 처음 · 마지막 원. 시각 = `orders.t_ms[c.i]` · 가격 = `orders.px[c.i]` · 금액 = `orders.val[c.i]`(수가 아니면 0) · 방향 = `c.side`.
   - 시각 조각 = `Math.floor(t첫 / 1000) === Math.floor(t끝 / 1000)` 이면 `kstClock(t첫)`, 아니면 `${kstClock(t첫)} ~ ${kstClock(t끝)}`.
   - 매수/매도 건수 · 합계를 센다. 섞임 = 둘 다 > 0.
   - 방향 조각: 섞이면 `팀 매수 ${b}건 ${fmtEok(bk, { digits: 2 })} · 팀 매도 ${s}건 ${fmtEok(sk, { digits: 2 })}`, 매수만이면 `팀 매수 ${b}건 합계 …`, 매도만이면 `팀 매도 ${s}건 합계 …`. `opts.isNxt` 가 한 원이라도 true 면 방향 조각 끝에 ` (NXT 포함)`.
   - 가격 조각 = `가격 ${INT_FMT.format(px첫)} → ${INT_FMT.format(px끝)} (${pct2(((px끝 − px첫) / px첫) * 100)})`. px첫 ≤ 0 이면 변화는 0 으로 둔다(보이는 원만 묶이므로 실제로는 없다).
   - 2줄 = `묶음 ${n}건 ${시각} · ${방향} · ${가격}`.
   - 3줄 = `큰 주문 ` + 상위 3개를 ' · ' 로 이은 것. 상위 3개 = 시간순 group 을 복사해 금액 내림차순으로 **안정 정렬**(Array.prototype.sort 는 안정 — 동률이면 시각 → 번호 순이 남는다)한 앞 3개다. 항목 = `${섞임 ? (매수 ? '매수 ' : '매도 ') : ''}${fmtEok(val, { digits: 2 })}@${INT_FMT.format(px)}`.
   - 묶음 맥락 줄은 넣지 않는다(규칙 5 마지막 항목).
   - JSDoc 에 NXT 데이터 사실을 적는다: 웹 payload.orders 에 거래소 칸이 없다(accum_flow export 원천 KRX 전용 · 인박스 261022). 그래서 컴포넌트는 isNxt 를 넘기지 않고, 규칙 문자열은 술어로 테스트가 잠근다.
4. `export function orderHoverOf(payload: Pick<AccumReportPayload, 'orders' | 'day_cum_net' | 'avg_px' | 'pos_day'>, row: Pick<AccumReportRow, 'base'>, circles: readonly OrderCircle[], seed: OrderCircle, view: View, opts: { dayAxis?: boolean } = {}): ChartHover`
   - `group = orderGroupOf(payload.orders, circles, seed, view)` 을 구한다.
   - 반환 객체: key = 문자 `o` 뒤에 seed.i(템플릿 리터럴 · 예 `o12`) · lines = `orderGroupTipOf(payload, row, seed, group, opts)` · circle = seed. group.length ≥ 2 일 때만 `group` 을 얹는다.
   - key 는 씨앗을 담는다(규칙 6 — 같은 묶음 안 다른 원으로 옮기면 key 가 바뀌어 다시 그린다).

GREEN — 컴포넌트 `webapp/src/components/analytics/accum-chart.tsx`:
5. onPointerMove 의 세 판 판정 본문을 이른 반환(119) 뒤 렌더 스코프 함수 `const pickAt = (mx: number, my: number): ChartHover | null` 로 뺀다(Task 3 터치가 같은 함수를 쓴다).
   - 가격 판 갈래는 `const c = nearestOrderOf(circles, mx, my); if (c !== null) return orderHoverOf(payload, row, circles, c, view, { dayAxis });` 로 바꾼다. 누적 · 10분 판 갈래는 그대로 둔다.
   - onPointerMove 는 지금 순서(터치 · dragging return → mx/my → `next = mx in [L, right] ? pickAt(mx, my) : null` → key 비교 → setHover)를 그대로 지킨다.
   - import 에서 쓰지 않게 된 `orderTipOf` 는 빼고 `orderHoverOf` 를 더한다.
6. 고리(418~430 자리) — 규칙 4.
   - `hover?.group` 이 있으면, 묶음 원 중 고른 원(`hover.circle`)이 아닌 원마다 지금 고리와 같은 속성(`data-slot="accum-order-hover"` · cx · cy · r + 1 · fill none · stroke var(--fg) · strokeWidth 1.5 · pointerEvents none · key `h{c.i}`)을 그린다. 그 뒤에 고른 원 굵은 고리 하나(`data-slot="accum-order-seed"` · r + 1 · stroke var(--fg) · strokeWidth 2.5 · fill none · pointerEvents none)를 맨 위에 그린다(discretion 2).
   - group 이 없고 `hover?.circle` 만 있으면 지금 고리 하나 그대로다.
   - 고리는 계속 `accum-price-layer` 그룹 안 · 데이터 원 뒤에 둔다.
7. 툴팁 div: className 에서 `whitespace-nowrap` 을 빼고 `break-keep` 을 더한다. 줄 div 마다 `className="pl-3 -indent-3"`(내어쓰기 · discretion 4)를 단다. left/right/top/bottom 규칙은 그대로다.
8. 머리 주석 79~84 「마우스 툴팁」 단락에 묶음 규칙을 한 문장으로 더한다: 씨앗 + 직접 닿는 보이는 원 · 사슬 없음 · 3줄(고른 원 줄 · 묶음 요약 · 큰 주문) · 묶음 고리 1.5 · 고른 원 2.5 · quick-261028-ggj · gh-trade 261028. 터치 문장은 이 task 에서 바꾸지 않는다(Task 3).

e2e — `webapp/e2e/specs/accum-report.spec.ts` P34-AC1b(가장 큰 원 마우스 블록)를 두 모양 다 받게 고친다.
   - `const n = await tip.locator('> div').count(); expect([2, 3]).toContain(n);`. 첫 줄 정규식(앞부분 일치)은 그대로 둔다.
   - n === 2 이면 지금 단언(둘째 줄 「순매수 누적」 · accum-order-hover 1개)에 accum-order-seed 0개를 더한다.
   - n === 3 이면: 둘째 줄 `/^묶음 (\d+)건 /`(건수 N 추출) · 셋째 줄 `/^큰 주문 /` · accum-order-seed 1개 · accum-order-hover N − 1 개.
   - 상자가 래퍼 안이라는 단언은 그대로 둔다. 테스트 제목의 「주문 2줄 + 고리」 를 「주문 2줄 + 고리 · 묶음이면 3줄 + 굵은 고리」 로 고친다.
   - e2e 는 실행하지 않는다 — tsc -p tsconfig.e2e.json 타입 검사만 한다(verify 의 typecheck 스크립트에 들어 있다).

GREEN 확인(verify)이 끝나면 커밋한다. 메시지: 「feat(quick-261028-ggj): 매집 차트 닿는 원 묶음 툴팁 · 묶음 고리 · 고른 원 굵은 고리(gh-trade 261028 규칙 1~6)」. 커밋 직전에 `git status -sb` 를 다시 보고, 이 task 의 5개 경로만 하나씩 `git add` 한다(-A · . 금지 · tasks/lessons.md 등 남의 변경은 건드리지 않는다). 메시지는 한글로 쓰고 Co-Authored-By 는 넣지 않는다. push 하지 않는다.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/lib/accum-chart.ts src/components/analytics/accum-chart.tsx</automated>
  </verify>
  <done>마우스로 원 묶음에 대면 고른 원 + 직접 닿는 보이는 원만 고리가 생기고(고른 원만 2.5) 툴팁이 3줄이다. 홀로 있는 원은 지금과 같다. 사슬 A–B–C · 크기 1 · 섞임 · 같은 초 · NXT · 동률 · 노트 예시 2 · 3줄 정확 문자열이 lib 테스트로, 실측 천일고속 묶음 · 규칙 6 이 컴포넌트 테스트로 잠긴다. 기존 accum-chart · accum-detail 테스트가 전부 통과하고 webapp typecheck(e2e tsconfig 포함) · eslint 가 0 오류다. 커밋 2개(test · feat).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 길게 누르기 상태기 · 터치 툴팁 자리(순수) + useChartGestures 살펴보기 중 pan 억제 플래그</name>
  <files>webapp/src/lib/touch-inspect.ts, webapp/src/lib/__tests__/touch-inspect.test.ts, webapp/src/hooks/use-chart-view.ts, webapp/src/hooks/__tests__/use-chart-view.test.tsx</files>
  <read_first>
    - webapp/src/hooks/use-chart-view.ts 1~30 · 190~315
    - webapp/src/hooks/__tests__/use-chart-view.test.tsx 1~105 · 그리고 「끌기 · 해제」 describe 한 곳(grep `pointercancel` 으로 찾아 그 it 하나만 읽는다)
  </read_first>
  <behavior>
    touch-inspect.test.ts(`vi.useFakeTimers()` · afterEach `vi.useRealTimers()` · onStart/onEnd = vi.fn):
    - (h1) touch down(id 1 · 100,100) → 299ms 에는 onStart 가 없고 300ms 에 `onStart({ clientX: 100, clientY: 100 })` 이 1회 불린다. 그 뒤 active() true.
    - (h2) 활성 전 떨림: 3px · 5px 이동(합 거리 ≤ 8) → 300ms 에 켜진다. onStart 좌표는 마지막 떨림 자리다.
    - (h3) 활성 전 9px 이동 → 타이머가 취소되어 1000ms 가 지나도 onStart 가 없다. 그 이동의 move 반환은 false 다.
    - (h4) 활성 뒤 move → true 를 반환하고, onStart 를 다시 부르지 않는다.
    - (h5) 활성 뒤 end(id 1) → onEnd 1회 · active() false. 같은 id 로 end 를 다시 불러도 onEnd 는 늘지 않는다(pointerup 뒤 lostpointercapture 대비).
    - (h6) 활성 전 두 번째 터치(id 2) down → 타이머 취소 · 300ms 뒤에도 onStart 없음 · onEnd 없음.
    - (h7) 활성 뒤 두 번째 터치 down → onEnd 1회 · active() false. 그 뒤 id 1 move 는 false.
    - (h8) pointerType 'mouse' · 'pen' down 은 무시한다(타이머 없음).
    - (h9) 다른 id 의 move 는 false · 상태 불변. 모르는 id 의 end 는 아무것도 안 한다.
    - (h10) dispose() → 대기 타이머 취소(onStart 없음) · 콜백 없음.
    - (h11) 손가락을 모두 뗀 뒤 새 down 은 다시 300ms 를 센다.
    - touchTipTopOf(ay, tipH, H, gap = 32): (200, 56, 472) → 112(손가락 위) · (60, 56, 472) → 92(위에 자리 없음 → 아래) · (300, 500, 472) → 0(둘 다 안 됨 → 안쪽에 붙임) · (88, 56, 472) → 0(위 경계 포함) · (420, 40, 472) → 348.
    use-chart-view.test.tsx(새 it 1개 · 기존 Harness 에 모듈 수준 `const inspectFlag = { current: false }` 를 넘기고 beforeEach 에서 false 로 되돌린다):
    - (i1) 「살펴보기 중 한 손가락 이동은 창을 옮기지 않는다」: 먼저 `ctl.setPreset('last2h')` 등으로 이동 가능한 창을 만든다. inspectFlag.current = true 이면 ptr down(1, MID) → move(1, MID + 60) → flushFrame 뒤 rafCalls 0 · ctl.view 불변이다. 그 뒤 inspectFlag.current = false 이면 move(1, MID + 120) → 창이 옮겨진다. 두 번째 이동은 첫 번째 위치(MID + 60)를 기준으로 계산되어야 한다 — 억제 중에도 포인터 x 를 갱신했는지 확인한다. 기대값 = −60px 만큼의 panBy(기존 끌기 테스트의 계산 문법).
    - 기존 훅 테스트는 플래그 false 로 전부 그대로 통과한다.
  </behavior>
  <action>
RED 먼저 — behavior 의 두 테스트 파일을 쓰고, 새 모듈이 없거나 억제가 없어 실패하는 것을 확인한 뒤 커밋한다. 메시지: 「test(quick-261028-ggj): 터치 길게 누르기 상태기 · 살펴보기 중 pan 억제 실패 테스트」.

GREEN — 새 파일 `webapp/src/lib/touch-inspect.ts`. 프레임워크 무관 순수 모듈이다(React import 없음). 머리 주석에 담을 내용: quick-261028-ggj · 폰에는 마우스가 없어 원 정보를 못 보던 문제 · 길게 누르기 = 기존 제스처(세로 스크롤 · 가로 끌기 · 핀치)와 공존하는 진입 방식 · 판정 수치.
1. 상수: `export const TOUCH_HOLD_MS = 300` · `export const TOUCH_SLOP_PX = 8` · `export const TOUCH_TIP_GAP = 32`(손가락 끝 반지름 여유).
2. `export interface TouchPointer { pointerId: number; pointerType: string; clientX: number; clientY: number }` — React PointerEvent 가 구조적으로 맞는다.
3. `export interface TouchInspect { down(p: TouchPointer): void; move(p: TouchPointer): boolean; end(p: Pick<TouchPointer, 'pointerId'>): void; active(): boolean; dispose(): void }` — 메서드마다 한 줄 JSDoc.
4. `export function createTouchInspect(cb: { onStart: (p: { clientX: number; clientY: number }) => void; onEnd: () => void }, opts: { holdMs?: number; slopPx?: number } = {}): TouchInspect` — 클로저 상태: 닿은 터치 id 집합 · 추적 id(없으면 null) · 시작점/마지막 점 · 타이머 · 활성 여부.
   - down: pointerType 이 'touch' 가 아니면 무시한다. id 를 집합에 넣는다. 집합 크기 ≥ 2 면 취소한다(타이머를 지우고, 활성이었으면 끄고 onEnd · 추적 id = null). 크기 1 이면 추적 id · 시작점 · 마지막 점을 잡고 `setTimeout(holdMs)` 을 건다. 타이머가 울리면 타이머 = null · 활성 = true · `onStart(마지막 점)`.
   - move: 추적 id 가 아니면 false. 활성이면 마지막 점을 갱신하고 true. 타이머 대기 중이면 시작점에서 거리² > slop² 일 때 타이머를 지우고 추적 id = null(이 손가락은 끌기 · 스크롤), 아니면 마지막 점을 갱신한다. 둘 다 false 를 반환한다.
   - end: id 를 집합에서 뺀다. 추적 id 였으면 타이머를 지우고 추적 id = null 로 두며, 활성이었으면 끄고 onEnd 를 1회 부른다.
   - active: 활성 여부를 돌려준다. dispose: 타이머만 지운다(콜백 없음).
   - 타이머는 전역 setTimeout/clearTimeout 을 쓴다(테스트 fake timers 가 잡는다).
5. `export function touchTipTopOf(ay: number, tipH: number, H: number, gap: number = TOUCH_TIP_GAP): number` — 위 = ay − gap − tipH 가 ≥ 0 이면 그것, 아니면 아래 = ay + gap 이 `아래 + tipH ≤ H` 이면 그것, 아니면 `Math.max(0, H − tipH)`. JSDoc: 터치 툴팁 세로 자리(차트 안 · 손가락을 가리지 않게 위 우선).

GREEN — 훅 `webapp/src/hooks/use-chart-view.ts`(이것만 바꾼다 · 리팩터 금지):
6. `useChartGestures(svgRef, geom, ctl, inspectingRef?: RefObject<boolean>)` — 넷째 인자는 선택이고 JSDoc 을 붙인다(true 인 동안 한 손가락 이동은 창을 옮기지 않는다 · 차트 길게 누르기 살펴보기 · quick-261028-ggj).
   - 기존 `geomRef`/`ctlRef` 처럼 `inspectRef = useRef(inspectingRef)` 를 두고 같은 useLayoutEffect 에서 갱신한다. effect 의존성은 [svgRef, enabled] 그대로 둔다.
   - onMove 한 손가락 갈래: `pointers.set(e.pointerId, e.clientX)` **바로 뒤**, dx 계산 앞에 `if (inspectRef.current?.current === true) return;` 을 넣는다. x 를 먼저 갱신해야 살펴보기가 꺼진 뒤 다음 이동이나 핀치가 튀지 않는다.
   - 핀치 갈래 · 휠 · down · end 는 바꾸지 않는다. 머리 주석 끝에 한 줄을 더한다(살펴보기 플래그 · pan 만 억제 · 핀치는 차트 상태기가 두 번째 손가락에서 살펴보기를 끈다).

GREEN 확인(verify)이 끝나면 커밋한다. 메시지: 「feat(quick-261028-ggj): 터치 길게 누르기 살펴보기 상태기 · 터치 툴팁 자리 · 살펴보기 중 끌기 억제 플래그」. 커밋 직전에 `git status -sb` 를 다시 보고, 이 task 의 4개 경로만 하나씩 add 한다. 한글 메시지 · Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/touch-inspect.test.ts src/hooks/__tests__/use-chart-view.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/lib/touch-inspect.ts src/hooks/use-chart-view.ts</automated>
  </verify>
  <done>길게 누르기 상태기가 300ms · 8px · 두 번째 손가락 취소 · end 1회 · 마우스 무시 · dispose 를 fake timers 테스트로 잠근다. touchTipTopOf 는 위 → 아래 → 붙임 순서다. 훅은 플래그가 켜진 동안 한 손가락 pan 을 하지 않지만 포인터 x 는 갱신한다. 기존 훅 테스트가 전부 통과하고 typecheck · eslint 0 오류다. 커밋 2개(test · feat).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 차트 터치 살펴보기 배선(길게 누르기 → 같은 툴팁 · 고리 · 훑기 · 떼면 숨김) + 인박스 노트 done</name>
  <files>webapp/src/components/analytics/accum-chart.tsx, webapp/src/components/analytics/__tests__/accum-detail.test.tsx, docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md</files>
  <read_first>
    - webapp/src/components/analytics/accum-chart.tsx 전체(Task 1 뒤 상태 — pickAt · 고리 · 툴팁 div)
    - webapp/src/lib/touch-inspect.ts 전체(Task 2)
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx 168~210 · Task 1 에서 더한 c9g · c9s
    - docs/inbox/from-gh-trade/README.md(frontmatter · 처리 규칙) · docs/inbox/from-gh-trade/261022-accum-nxt-team-burst.md 60~66(답 단락 문체 예)
  </read_first>
  <behavior>
    accum-detail.test.tsx — 새 describe 「quick-261028-ggj 터치 길게 누르기」. 천일고속을 펼친 **뒤** `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` 를 켜고 afterEach/finally 에서 `vi.useRealTimers()`. 포인터는 `fireEvent.pointerDown/Move/Up/Cancel(svg, { pointerId, pointerType: 'touch', clientX, clientY })` 를 act 로 감싸 쏜다(jsdom 29 PointerEvent).
    - (t1) first 원(09:01:00 · 홀로) 중심에 down → 299ms 에는 툴팁이 없고 → 300ms 에 툴팁이 뜬다. 툴팁 줄 = 마우스와 같은 2줄(lines[0] `09:01:00 팀 매수 9주 · 0.02억 @174,300 · 1조각 · 팀매수 시작`) · accum-order-hover 1개 · 툴팁 `data-touch="1"` · style.left `4px` · style.top = `${touchTipTopOf(cy, 0, 472)}px`(jsdom 높이 0). pointerUp → 툴팁 · 고리가 사라진다.
    - (t2) down 뒤 300ms 전에 clientX + 12 로 move → 1000ms 가 지나도 툴팁이 없다(끌기로 넘어감).
    - (t3) 활성 뒤 두 번째 손가락(pointerId 2) down → 툴팁이 사라진다.
    - (t4) svg 에 `new Event('touchmove', { bubbles: true, cancelable: true })` 를 쏜다: 활성 전에는 defaultPrevented false, 활성 중에는 true, pointerUp 뒤에는 false.
    - (t5) 활성 중 같은 손가락을 누적 판(clientY 300)으로 move → 툴팁이 `^\d\d:\d\d:\d\d · 순매수 누적` 으로 바뀐다(훑기). 다시 first 원으로 move → 2줄 주문 툴팁. pointerCancel → 사라진다.
    - (t6) 활성 중 묶음 원(Task 1 c9g 와 같은 방법으로 찾은 3줄 원) 중심으로 move → 3줄 + accum-order-seed 1개.
    - (t7) contextmenu 이벤트(fireEvent.contextMenu)는 활성 중에만 defaultPrevented 다.
    - 기존 (c9) 의 `at(cx, cy, 'touch')`(길게 누르지 않은 터치 이동)는 그대로 툴팁 없음이다. 그 줄 주석을 「길게 누르지 않은 터치 이동은 상자를 띄우지 않는다」 로 고친다.
  </behavior>
  <action>
RED 먼저 — behavior 의 컴포넌트 테스트를 쓰고 실패를 확인한 뒤 커밋한다. 메시지: 「test(quick-261028-ggj): 매집 차트 터치 길게 누르기 살펴보기 실패 테스트」.

GREEN — `webapp/src/components/analytics/accum-chart.tsx`. 새 훅은 모두 이른 반환 `if (!hasPrice) return null;` 위에 둔다.
1. `const inspectRef = useRef(false);` 를 두고 useChartGestures 호출을 `useChartGestures(svgRef, { L, W, R }, hasPrice ? ctl : null, inspectRef)` 로 바꾼다.
2. 터치 앵커 상태: `type TouchAnchor = { x: number; y: number; bw: number; bh: number }`(svg 상자 기준 client 오프셋 + 그때 상자 크기) · `const [touchPt, setTouchPt] = useState<TouchAnchor | null>(null)`. 앵커 → viewBox 좌표 = `mx = (x * W) / (bw || W)` · `my = (y * H) / (bh || H)`(onPointerMove 와 같은 변환).
3. 상태기는 한 번만 만든다: `const [tracker] = useState(() => createTouchInspect({ onStart, onEnd }))`. 콜백은 ref · setter 만 만지므로 낡은 클로저 문제가 없다.
   - onStart: svgRef.current 가 없으면 return. `inspectRef.current = true` 로 두고, `getBoundingClientRect()` 로 앵커를 만들어 setTouchPt 한다.
   - onEnd: `inspectRef.current = false` · setTouchPt(null).
   - `useEffect(() => () => tracker.dispose(), [tracker])` 로 언마운트 때 타이머를 지운다.
4. 비수동 touchmove(TOUCH-COEXIST): `useEffect` 안에서 `const el = svgRef.current; if (!el || !hasPrice) return;`. 그다음 `el.addEventListener('touchmove', fn, { passive: false })` 를 단다. fn = `if (inspectRef.current && e.cancelable) e.preventDefault()`. cleanup 에서 리스너를 뗀다. 의존성은 [hasPrice]. React onTouchMove 는 루트 passive 리스너라 preventDefault 가 먹지 않는다 — 훅 휠 리스너와 같은 이유(Pitfall 11)를 주석에 적는다. touch-action 은 터치 시작 때 정해져 도중에 못 바꾸므로 preventDefault 로 막는다는 것도 적는다.
5. 터치 툴팁 높이 측정: `const tipRef = useRef<HTMLDivElement>(null)` · `const [tipH, setTipH] = useState(0)` · 의존성 없는 `useLayoutEffect`.
   - 본문: `tipRef.current` 가 있고 `dataset.touch === '1'` 이며 `offsetHeight !== tipH` 일 때만 setTipH 한다.
   - 그리기 전에 다시 렌더되어 깜빡임이 없다. jsdom 은 0 이라 루프가 없다.
6. 이른 반환 뒤:
   - `const touchHover = touchPt === null ? null : pickAt(mxOf(touchPt), myOf(touchPt))` — mx 가 [L, right] 밖이면 null(onPointerMove 와 같은 범위 규칙).
   - 보여줄 대상 `tip` = touchHover 가 있으면 `{ ...touchHover, ax, ay, touch: true }`, 아니면 hover 가 있으면 `{ ...hover, touch: false }`, 둘 다 없으면 null.
   - touchHover 는 dragging 으로 가리지 않는다(훅이 터치 down 에도 dragging = true 로 둔다). 고리 · 툴팁 렌더는 모두 `hover` 대신 `tip` 을 읽는다.
7. 포인터 핸들러(svg):
   - `onPointerDown={(e) => tracker.down(e)}`.
   - `onPointerUp` · `onPointerCancel` · `onLostPointerCapture` 는 `(e) => tracker.end(e)` 를 쓴다(end 두 번째 호출은 아무것도 안 한다).
   - `onContextMenu={(e) => { if (inspectRef.current) e.preventDefault(); }}` 로 안드로이드 길게 누르기 메뉴를 막는다.
   - onPointerMove 맨 앞 터치 갈래: `if (e.pointerType === 'touch') { if (!tracker.move(e)) return; … return; }`. 살펴보기 중이면 이벤트로 앵커를 만들고 `pickAt` 으로 key 를 구한다. 그 key 가 지금 `touchHover?.key ?? null` 과 다를 때만 setTouchPt(앵커) 한다(마우스와 같은 dedupe · 매 touchmove 전체 SVG 재렌더 방지).
   - 마우스 · 펜 갈래는 Task 1 그대로다.
8. svg style 에 `WebkitTouchCallout: 'none'` 을 더한다(iOS 콜아웃 · TOUCH-TIP). touchAction 'pan-y' · userSelect none 은 그대로 둔다.
9. 툴팁 div 에 `ref={tipRef}` 와 `data-touch={tip.touch ? '1' : undefined}` 를 단다.
   - 터치면 style = `{ left: 4, maxWidth: W - 8, top: touchTipTopOf(tip.ay, tipH, H) }` 다. right · bottom 은 쓰지 않는다.
   - 마우스면 지금 left/right/top/bottom 규칙 그대로다.
10. 머리 주석 79~84: 「터치는 상자를 띄우지 않는다 — 폰은 KPI 줄 …」 문장을 새 규칙으로 바꾼다. 담을 내용: 길게 누르기(300ms · 8px 안) 살펴보기 · 같은 pickAt 툴팁 · 고리 · 손가락으로 훑기 · 살펴보기 중 끌기 억제(inspectRef) · 비수동 touchmove 로 스크롤 억제 · 떼거나 cancel 이면 지움 · 두 번째 손가락이면 끔(핀치 그대로) · 툴팁은 차트 안 손가락 위(touchTipTopOf) · quick-261028-ggj. D-15 폰 글자 대체 문구는 지운다.

GREEN 확인(verify)이 끝나면 커밋한다. 메시지: 「feat(quick-261028-ggj): 매집 차트 모바일 길게 누르기 살펴보기 — 묶음 툴팁 · 고리 · 손가락 훑기 · 떼면 숨김」. 커밋 직전에 `git status -sb` 를 다시 보고, 이 task 의 코드 2개 경로만 하나씩 add 한다. 한글 메시지 · Co-Authored-By 없음 · push 없음.

인박스 노트 — 위 feat 커밋 sha(짧은 8자리)를 `git rev-parse --short=8 HEAD` 로 얻는다. `docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md` 를 Edit 로 고친다.
   - frontmatter `status: open` → `status: done`.
   - `done_commit:` → `done_commit: <Task 3 feat sha>   # quick-261028-ggj (<Task 1 feat sha> 묶음 툴팁 · <Task 3 feat sha> 모바일 길게 누르기)`.
   - 본문 끝에 `## gh-radar 반영 (2026-10-28 · quick-261028-ggj)` 단락을 더하고 짧은 bullet 4개를 쓴다: ① 규칙 1~6 반영(웹 1줄 = 웹 한 원 툴팁 2줄을 ' · ' 로 이은 줄 — 웹 한 원 툴팁이 title + 맥락 2줄이라서) ② 굵은 고리 = 테마 전경색 2.5px ③ ` (NXT 포함)` 은 규칙만 구현 — 웹 payload.orders 에 거래소 칸이 없어(accum_flow export KRX 전용 · 261022 노트) 화면에는 나오지 않음, export 에 원별 거래소가 실리면 알려 달라 ④ 웹 추가: 폰 길게 누르기(300ms)로 같은 툴팁 · 고리.
   - 이 노트는 지금 untracked 다. 커밋 직전에 `git status -sb` 를 보고 `git add docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md` 로 그 경로만 add 한다(다른 untracked 인박스 노트 261028-launch-plan-*.md 는 건드리지 않는다).
   - 메시지: 「docs(quick-261028-ggj): 인박스 261028-accum-chart-hover-group done — 묶음 툴팁 반영」. Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/accum-detail.test.tsx src/lib/__tests__/accum-chart.test.ts src/lib/__tests__/touch-inspect.test.ts src/hooks/__tests__/use-chart-view.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/analytics/accum-chart.tsx && grep -q '^status: done' docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md && grep -Eq '^done_commit: [0-9a-f]{8}' docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md && git ls-files --error-unmatch docs/inbox/from-gh-trade/261028-accum-chart-hover-group.md</automated>
  </verify>
  <done>폰에서 차트를 300ms 길게 누르면 마우스와 같은 툴팁 · 묶음 고리가 손가락 위 차트 안에 뜨고, 훑으면 대상이 바뀌며, 그동안 창 이동 · 페이지 스크롤 · 콜아웃 · 컨텍스트 메뉴가 없다. 떼거나 cancel 이면 사라진다. 300ms 전 이동 · 두 번째 손가락이면 기존 끌기 · 스크롤 · 핀치 그대로다. 관련 vitest 4파일 · typecheck · eslint 가 통과한다. 인박스 노트가 done · done_commit 으로 경로 지정 커밋된다. 커밋 3개(test · feat · docs) · 플랜 전체 7개.</done>
</task>

</tasks>

<verification>
- 세 task 의 verify 가 모두 통과한다. Task 3 verify 가 관련 vitest 4파일(accum-detail · accum-chart · touch-inspect · use-chart-view) · webapp typecheck(tsc + e2e tsconfig) · eslint 를 한 번에 돈다.
- 동시 세션 메모리 보호: vitest 는 늘 `--maxWorkers=2` 로 관련 파일만 돈다. Playwright · e2e 전체 회귀는 범위 밖이다(사용자 제약). P34-AC1b 는 기대값만 고치고 타입 검사로만 확인한다. SUMMARY 에 「e2e 미실행」 을 적는다.
- 범위 밖 무변경: `git diff --name-only <플랜 시작 HEAD>..HEAD` 결과가 frontmatter files_modified 10개 안에 든다. relay · server · supabase · packages/shared 변경이 없다.
- 동시 세션 커밋 경합: 커밋마다 직전 `git status -sb`, 경로 지정 add 를 한다. 실행은 메인 트리 master 에서 순차로 한다(worktree 격리 없이 — quick 순차 규칙).
- push · 배포는 하지 않는다(push 가 곧 webapp 프로덕션 배포 · 메인 세션 몫).
</verification>

<success_criteria>
- 노트 규칙 1~6: 직접 닿음 묶음(사슬 없음 · 보이는 원 · 가격 0 제외) · 시간순 · 크기 1 그대로 · 묶음 고리 1.5 + 고른 원 2.5 · 3줄 정확 문자열(노트 예시 2 · 3줄 일치) · 씨앗 바뀌면 다시 그림 — lib · 컴포넌트 테스트로 잠김.
- 모바일: 300ms · 8px 길게 누르기 살펴보기 · 훑기 · 떼면 숨김 · 살펴보기 중 pan/스크롤 억제 · 기존 세로 스크롤 · 가로 끌기 · 핀치 공존 · 툴팁 차트 안 손가락 위 · iOS 콜아웃 · 안드로이드 컨텍스트 메뉴 억제.
- 인박스 노트 done · done_commit · gh-radar 반영 단락(NXT 데이터 사실 포함).
- 커밋 7개(task 1 · 2 · 3 의 test → feat, 노트 docs 1) · 한글 메시지 `(quick-261028-ggj)` · Co-Authored-By 없음 · 경로 지정 스테이징 · push 없음.
</success_criteria>

<output>
Create `.planning/quick/261028-ggj-accum-chart-group-tooltip-touch/261028-ggj-SUMMARY.md` when done(discretion 5항목 · NXT 데이터 사실 · e2e 미실행 · 커밋 sha 목록 포함).
</output>
