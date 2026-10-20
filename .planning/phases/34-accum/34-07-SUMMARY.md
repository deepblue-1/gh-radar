---
phase: 34-accum
plan: 07
status: complete
subsystem: ui
tags: [nextjs, react, svg, chart, pointer-events, wheel, a11y, tdd, tracer]

requires:
  - phase: 34-06
    provides: "AccumChart 정적 3판(view prop) · clampView · MIN_VIEW_MS · dayBoundsOf · priceAxisWidthOf · ACCUM_CHART.R · 합성 상세 noPrice/noTeam"
provides:
  - "webapp lib/accum-chart.ts: ChartPreset · lastTradeMsOf · presetOf · zoomAt · panBy · fmtViewRange"
  - "webapp hooks/use-chart-view.ts: useChartView(창 · 프리셋 · apply · schedule(rAF 합치기) · onKeyDown) · useChartGestures(네이티브 wheel passive:false · Pointer 끌기/핀치)"
  - "AccumDetail 차트 블록 머리: 범례 8(data-slot accum-legend) · 프리셋 3(accum-presets · aria-pressed) · 창 범위(accum-view-range) · 캡션(accum-caption) · 「그날 체결 자료 없음」(accum-no-price)"
  - "AccumChart 래퍼 role=group tabIndex=0 키보드 영역 · SVG touch-action pan-y"
affects: [34-08, 34-09, 34-10, 34-12]

actuals:
  tokens: 14600
  tasks: 2
  commits: 4
plan_head_before: 464af869471426cc7e0a5735b73da12fcb4c0036
plan_head_after: e1e8b6d1e57d4fe08dbfbb61186369d7c3c6088b

tech-stack:
  added: []
  patterns:
    - "제스처는 schedule(fn) 하나로 — fn 을 대기 창에 합성하고 프레임당 setState 1회. 창이 안 바뀌면 false 를 돌려 호출 쪽이 이벤트를 넘긴다(휠 넘김 규칙)"
    - "확대 폭은 [10분, 하루] 로 먼저 자른 정확한 값 — 10분 창에서 더 확대하면 「변화 없음」 이 되어 창이 옆으로 밀리지 않고 휠이 페이지로 넘어간다"
    - "핀치 = 이전 손가락 중점 아래 시각을 거리 비로 확대한 뒤 새 중점 자리로 옮김(증분 · 손가락을 따라간다)"
    - "핸들러가 읽는 최신 창은 setter 안에서만 갱신하는 ref 거울(viewRef) · geom/ctl 은 useLayoutEffect 로 ref 에 — 리스너는 한 번만 단다"
    - "동기 rAF 폴리필 대비 예약 표시('pending') — flush 가 예약 중에 먼저 돌아도 핸들이 남지 않는다"

key-files:
  created:
    - webapp/src/hooks/use-chart-view.ts
    - webapp/src/hooks/__tests__/use-chart-view.test.tsx
    - .planning/phases/34-accum/tdd-evidence/34-07-T1-red.json
    - .planning/phases/34-accum/tdd-evidence/34-07-T2-red.json
  modified:
    - webapp/src/lib/accum-chart.ts
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx

key-decisions:
  - "presetOf('last2h') 는 끝(마지막 체결 칸)이 null 이면 「전체」 로 폴백 — 버튼은 disabled 라 실제로는 안 탄다"
  - "끌기 방향 = 목업 C 그대로 「내용을 잡아 끈다」 — 왼쪽으로 끌면 창이 뒤 시각으로 · 가로 휠 deltaX + 도 뒤 시각"
  - "키보드는 Alt · Ctrl · Meta 조합이면 처리하지 않는다 — ⌘= · ⌘0(브라우저 확대)을 먹지 않게"
  - "키보드 ← → + − 도 schedule(rAF) 경로 · 0 만 setPreset 즉시"
  - "price.idx 빔과 payload null 을 같은 「그날 체결 자료 없음」 한 줄로 — 둘 다 그릴 가격이 없다"
  - "AccumChart 의 ctl 은 필수 prop — 정적(조작 없는) 경로는 호출처가 없어 두지 않았다"
  - "휠 deltaMode 줄(1) = 16px · 쪽(2) = 400px 로 환산(Firefox 줄 단위 휠)"

patterns-established:
  - "제스처 훅 테스트: getBoundingClientRect 목(left 0 · width = viewBox W) · MouseEvent 에 pointerId/pointerType 을 defineProperty · rAF 는 vi.stubGlobal 수동 큐로 프레임을 진행"

requirements-completed: []

coverage:
  - id: D-14-presets
    description: "프리셋 3 「전체 · 정규장 · 마지막 2시간」 · 기본 전체 켜짐 · aria-pressed · 창 범위 「HH:MM ~ HH:MM」 · 프리셋 전환 시 SVG 접근 이름 · 가격 축 재맞춤 경로"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/accum-chart.test.ts#보기 창 조작"
        status: pass
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(h1)"
        status: pass
    human_judgment: false
  - id: D-14-gestures
    description: "네이티브 휠 passive:false · 넘김 규칙 · ctrlKey 늘 preventDefault · 가로 휠 이동 · 끌기 · pointercancel 해제 · 핀치 ½ · 최소 10분 · 키보드 ←/→/+/−/0 · rAF 프레임당 1회 · 조작 시 프리셋 셋 다 꺼짐"
    verification:
      - kind: unit
        ref: "webapp/src/hooks/__tests__/use-chart-view.test.tsx#(w1)~(w5) (p1)~(p4) (k1) (r1) (r2)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/analytics/__tests__/accum-detail.test.tsx#(h4)"
        status: pass
    human_judgment: false
  - id: D-18
    description: "price.idx 빔 → 범례 · 프리셋 · 차트 · 캡션 대신 「그날 체결 자료 없음」(KPI 줄은 남음) · 팀 체결 없음 캡션 접두"
    verification:
      - kind: unit
        ref: "accum-detail.test.tsx#(h2)(h3)"
        status: pass
    human_judgment: false
  - id: REAL-BROWSER
    description: "실브라우저 휠 · 트랙패드 · 폰 핀치 · 세로 스크롤 비갇힘 · 한선엔지니어링급 프레임 끊김"
    verification: []
    human_judgment: true
    rationale: "jsdom 에는 레이아웃 · 실제 PointerEvent · touch-action 동작이 없다 — 34-09 E2E 휠 스모크 · 34-12 라이브 UAT 몫"

duration: 9min
completed: 2026-10-20
---

# Phase 34 Plan 07: 매집감지 상세 차트 조작 + 차트 블록 머리 Summary

**34-06 의 고정 창 차트에 보기 창 훅 `useChartView` 를 붙였다. 프리셋 3개(전체 · 정규장 · 마지막 2시간)와 창 범위 글자, 범례 8항목, 캡션, 「그날 체결 자료 없음」 대체 줄을 차트 블록에 넣었다. 조작은 네이티브 휠(`passive: false`), 끌기, 두 손가락 핀치, 키보드 ←/→/+/−/0 이다. 이벤트는 rAF 로 합쳐 프레임당 한 번만 다시 그린다. 창이 바뀌지 않는 휠은 페이지 스크롤로 넘긴다.**

## Performance

- **Duration:** 약 9분 (14:03Z 시작 → 14:11Z 마지막 태스크 커밋)
- **Completed:** 2026-10-20
- **Tasks:** 2개 (Task 1 tracer · Task 2 auto). 태스크마다 RED → GREEN 커밋을 한 쌍씩 남겼다.
- **Files:** 신규 4개 (훅 1 · 훅 테스트 1 · RED 증거 2), 수정 5개

## Accomplishments

- **프리셋 · 차트 블록 머리 (Task 1, 트레이서)**
  - lib 에 다섯 함수를 더했다.
    - `lastTradeMsOf`: 마지막 idx 칸 시각. 천일 15:30:00, 한선 19:59:50 이다.
    - `presetOf`: clampView 를 거친다. 끝이 null 이면 「전체」 로 폴백한다.
    - `zoomAt` · `panBy` · `fmtViewRange`.
  - `useChartView` 는 창과 프리셋 상태를 가진다.
    - `setPreset` 은 창을 즉시 바꾸고 그 프리셋을 켠다.
    - `apply` 와 `schedule` 은 프리셋을 끈다.
  - `AccumDetail` 차트 블록은 KPI 줄 → 범례 → 프리셋 줄 → 차트 → 캡션 순서다.
    - **범례:** 견본은 `span aria-hidden` 이고 `<i>` 는 0개다.
    - **프리셋 버튼:** 켜짐 `--pill-on-*`, 꺼짐 `--muted` 면 위 `--fg-2` 글자다. 「마지막 2시간」 은 끝이 null 이면 disabled 다.
    - **창 범위:** `ml-auto` 에 mono 글자로 둔다. `aria-live` 는 없다.
    - **캡션:** `break-keep` 이다. `day_cum_net` 이 비면 앞에 「팀 체결 없음 · 」 을 붙인다.
- **제스처 (Task 2)**
  - `useChartGestures(svgRef, { L, W, R }, ctl)` 가 네이티브 리스너를 단다.
    - `wheel` 은 `{ passive: false }` 다. 세로 휠은 커서 시각 기준 `exp(deltaY × 0.0015)` 로 확대/축소하고, `|deltaX| > |deltaY|` 면 좌우로 옮긴다.
    - 포인터 1개는 끌기, 2개는 핀치다. 핀치는 중점 아래 시각이 손가락을 따라간다.
    - `pointerup` · `pointercancel` · `lostpointercapture` 에서 끌기를 푼다.
  - **넘김 규칙:** 창이 안 바뀌는 일반 휠은 preventDefault 하지 않는다. ctrlKey 휠은 늘 preventDefault 한다.
  - **rAF 합치기:** `schedule` 이 대기 창에 변환을 합성한다. 프레임당 setState 는 1회다. 언마운트 때 예약을 취소한다.
  - **키보드:** ← → 는 창 폭 20% 이동, + = 는 ×0.5, − _ 는 ×2, 0 은 「전체」 다. 처리한 키만 preventDefault 하고, 수정키 조합은 넘긴다.
  - **`AccumChart` 래퍼:** `role="group"` · `tabIndex={0}` 에 A6 키보드 접근 이름을 단다.
  - **SVG:** `touch-action: pan-y` · `user-select: none` 이다. 커서는 `cursor-grab`, 끌기 중에는 `cursor-grabbing` 이다.

## Task Commits

1. **Task 1 RED:** `fe6a966c` test(34-07): 프리셋 · 창 범위 · 범례 실패 테스트
2. **Task 1 GREEN:** `77fb9f3e` feat(34-07): 차트 블록 머리 — 범례 · 프리셋 · 창 범위 · 캡션
3. **Task 2 RED:** `a760d160` test(34-07): 휠 · 끌기 · 핀치 · 키보드 실패 테스트
4. **Task 2 GREEN:** `e1e8b6d1` feat(34-07): 차트 확대/축소 · 이동 · 핀치 · 키보드(rAF)

REFACTOR 커밋은 없다. 정리할 것이 없었다.

## TDD Gate Compliance

- **Task 1 RED**
  - **대상:** `(h1) 천일고속 — 범례 8 순서 …` 가 첫 단언(`accum-legend` 존재)에서 AssertionError(`expected null to be truthy`)로 실패했다.
  - **분류기 판정:** `RED_EVIDENCE_OK (target_test_failed)` (`tdd-evidence/34-07-T1-red.json`).
  - **의미 판정:** 목록 렌더 · 펼침 · 기존 차트 (c1)~(c7) 는 green 이었다. 머리가 아직 없어서 실패했다.
  - **같은 묶음:** lib 4건은 골격 모듈(빈 값)에서 단언 실패였다. RTL (h2)(h3) 도 단언 실패였다.
- **Task 2 RED**
  - **대상:** `(w2) 전체 창에서 deltaY −100 …` 가 `preventDefault` 단언(`expected false to be true`)에서 실패했다.
  - **분류기 판정:** `RED_EVIDENCE_OK` (`tdd-evidence/34-07-T2-red.json`).
  - **의미 판정:** 하네스 렌더 · rect 목 · 이벤트 디스패치는 통과했다. 골격이 리스너를 달지 않아서 실패했다.
  - **같은 묶음:** (w3)(w4)(p1)(p3)(p4)(k1)(r1) 과 RTL (h4) 도 단언 실패였다.
  - **잠금 테스트:** (w1)(w5)(p2)(r2) 는 넘김 · 해제 · 언마운트 잠금이라 골격에서도 green 이다(의도).
- **GREEN:** 두 태스크 모두 feat 커밋에서 대상 테스트를 포함한 전부가 통과했다.
- **트레이서 게이트(Task 1):** 대화형 · end-of-phase 모드이고 `<verify>` 가 자동 검증뿐이다. verify 를 다시 돌려 exit 0 · 83/83 과 tsc 0 을 확인한 뒤 확장했다.

## Verification

- **Task 2 verify(플랜 verification)** 는 exit 0 이다.
  - 순서: shared build → webapp typecheck(`tsc --noEmit && tsc -p tsconfig.e2e.json`) → vitest.
  - vitest 대상: `use-chart-view.test.tsx` · `accum-chart.test.ts` · `accum-detail.test.tsx`, 회귀로 `accum-report.test.tsx` 를 더했다.
  - 결과는 **96/96** 이다. 훅 12 · lib 45 · 상세 RTL 12 · 목록 RTL 회귀.
- 변경 파일 eslint 는 error 0 · warning 0 이다.
- **수용 grep:**
  - 훅: `addEventListener('wheel'` · `passive: false` · `setPointerCapture` · `pointercancel` · `requestAnimationFrame`
  - 차트: `pan-y` · `role="group"` · `tabIndex={0}` · 「차트 보기 창 — 왼쪽·오른쪽 화살표 이동, +·− 확대/축소, 0 전체」
  - 상세: `accum-legend` · `accum-presets` · `aria-pressed` · `--pill-on-bg` · 캡션 원문 · 「그날 체결 자료 없음」
  - 차트 라이브러리 import 0
  - 전부 확인했다.

## Decisions Made

- 「마지막 2시간」 은 끝이 null 이면 「전체」 로 폴백한다(버튼은 disabled).
- 끌기 방향은 목업 C 와 같다(내용을 잡아 끈다). 가로 휠 deltaX + 는 뒤 시각이다.
- 키보드는 Alt · Ctrl · Meta 조합을 처리하지 않는다. 브라우저 확대 단축키를 먹지 않기 위해서다.
- 확대 폭은 [10분, 하루] 로 먼저 자른다. 10분 창에서 더 확대하면 「변화 없음」 → 페이지 스크롤로 넘어간다. 창이 옆으로 밀리지 않는다.
- payload null 도 「그날 체결 자료 없음」 이다.
- `AccumChart` 의 `ctl` 은 필수 prop 이다.
- 휠 deltaMode 줄 단위는 16px, 쪽 단위는 400px 로 환산한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 10분 창에서 더 확대할 때 창이 옆으로 밀림**
- **Found during:** Task 2 설계
- **Issue:** `zoomAt` 결과를 clampView 에 그대로 넣으면 문제가 생긴다. 10분 창에서 커서가 가운데가 아닐 때 확대하면, 폭은 10분으로 다시 넓어지는데 시작점은 커서 쪽으로 움직인다. 그래서 창이 조금씩 밀린다. 이것이 「변화 있음」 으로 판정되어 넘김 규칙(Discretion 7)도 깨진다.
- **Fix:** 훅 내부 `zoomView` 가 목표 폭을 [10분, 하루] 로 먼저 자른 뒤 `zoomAt(v, tc, w/span)` 으로 위치를 잡는다. 폭은 정확히 w 로 고정한다. 테스트 (w5) 가 잠근다.
- **Files modified:** `webapp/src/hooks/use-chart-view.ts`
- **Commit:** `e1e8b6d1`

**2. [Rule 3 - Blocking] RED 커밋에 골격 동봉(34-02 · 34-06 선례)**
- 없는 모듈이나 함수를 import 하면 로드 실패다. TDD 게이트는 이를 INVALID_RED 로 본다.
- 그래서 Task 1 RED 에 lib 골격을, Task 2 RED 에 `schedule` · `onKeyDown` · `useChartGestures` 골격을 함께 넣었다.

**3. [API 확정] 훅 geom 에 R 추가**
- RED 골격의 geom 은 `{ L, W }` 였다. 플랜 action 은 「그림 영역 좌우(L · W − R)를 `ACCUM_CHART.R` 와 같은 값으로 넘긴다」 고 한다.
- 그래서 GREEN 에서 `{ L, W, R }` 로 확정했다. 하네스도 `R: 56` 을 넘긴다.
- **Commit:** `e1e8b6d1`

그 밖에는 계획대로 실행했다.

## Issues Encountered

None

## Known Stubs

없음. 34-06 의 stub(「`price.idx` 빔이면 차트가 null 만 내고 대체 문구가 없음」)은 이 플랜이 해소했다. `accum-no-price` 와 RTL (h2) 가 이를 잠근다.

## Next Phase Readiness

- **34-08:** 사이클 표 · 손익 줄 · 판정 기준 · 출처 칩은 차트 블록(`accum-chart-block`) 다음에 붙인다. 상세 section 은 `gap-4` 다.
- **34-09 E2E 휠 스모크:**
  - 대상: SVG `data-slot="accum-chart"` 휠 → `[data-slot="accum-view-range"]` 글자 변화, 그리고 프리셋 `aria-pressed`.
  - 실제 브라우저 휠은 `page.mouse.wheel` 로 보낸다.
- **34-10 폭 백스톱:** 폰 310 에서 프리셋 3개와 창 범위가 `flex-wrap` 으로 줄바꿈되는지 본다(A5 overflow).
- **34-12 라이브 UAT:**
  - 한선엔지니어링급 휠과 끌기에서 프레임이 끊기지 않는지 확인한다.
  - 폰에서 차트 위 세로 스와이프로 페이지가 내려가는지 확인한다.
  - 맥 트랙패드 핀치(ctrlKey 휠)를 확인한다.
- 원격 DB 적용 · push · 배포는 하지 않았다.

## Self-Check: PASSED
- FOUND: hooks/use-chart-view.ts · hooks/__tests__/use-chart-view.test.tsx · tdd-evidence 34-07-T1/T2-red.json · lib/accum-chart.ts · analytics/accum-chart.tsx · analytics/accum-detail.tsx
- FOUND: fe6a966c · 77fb9f3e · a760d160 · e1e8b6d1 (HEAD 조상)

---
*Phase: 34-accum*
*Completed: 2026-10-20*
