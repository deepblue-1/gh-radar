---
phase: 38-own-orders-on-ticks
plan: 07
subsystem: ticks
tags: [react, svg, tick-chart, tooltip, own-orders]

requires:
  - phase: 38-06
    provides: "OwnModel(fills · fillsOfRec · orders.evidence · evidenceRec · evidenceLabel) · 뷰어 rows · ownLineRec · onOwnSelect · onOwnBack(알약)"
provides:
  - "tick-chart.ts: OwnMark · ownMarksOf(◆ · 추정 · ◇ · ○ — 창 ± 2% · 그리기 순서 ○ → ◇ → ◆) · ownMarkAt(반지름 + 3px 판정) · OWN_MARK_R(4 / 3.5) · OWN_MARK_HIT_PAD"
  - "tick-chart-tip.ts: tickOwnTipOf · tickOwnLinesOf · tickHoverWithOwn(팀 줄 뒤 덧붙이기)"
  - "TickChart props own · onOwnJump(rec, back?) · onOwnFillLine(fillId) · data-slot tick-own-mark · tick-own-ev-mark · tick-chart-own-legend"
  - "뷰어 결선: ◆ = 그 A3 행 · ○ = 근거 행 + 되돌아가기 알약 · ◇ = 그 짝 없음 줄 선택"
affects: [38-08, 38-09, 38-10]

estimate:
  tokens: 60000
  tasks: 2
actuals:
  tokens: 12100
  tasks: 2
  commits: 3
plan_head_before: 696944963db57f64c7aebee12dfa07ae313f4516
plan_head_after: c7c529d387274f47fef0488c6f1b65ac6cf2042d

tech-stack:
  added: []
  patterns:
    - "차트 우리 점 클릭은 요소(data-own-i) → 아니면 가격 판 안 기하 판정(반지름 + 3px) 순 — 팀 원(data-order-rec)보다 먼저 보고, 그 점 콜백이 없으면 팀 원 · 시각 클릭으로 넘긴다"
    - "툴팁 합치기는 팀 hover 객체를 그대로 두고 줄만 뒤에 붙인 새 객체 — 우리 점이 없으면 팀 hover 그 객체를 돌려준다(D-16)"

key-files:
  created: []
  modified:
    - webapp/src/lib/ticks/tick-chart.ts
    - webapp/src/lib/ticks/__tests__/tick-chart.test.ts
    - webapp/src/lib/ticks/tick-chart-tip.ts
    - webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts
    - webapp/src/components/ticks/tick-chart.tsx
    - webapp/src/components/ticks/__tests__/tick-chart.test.tsx
    - webapp/src/components/ticks/tick-viewer.tsx

key-decisions:
  - "○ 는 evidenceRec 하나에 한 점 — OwnMark 에 orderIds(근거가 같은 주문 전부)를 더해 툴팁이 주문마다 줄을 낸다 · 클릭 되돌아가기는 첫 주문"
  - "판 밖(가격 범위 위/아래로 클립된) 우리 점은 툴팁 · 묶음에 올리지 않는다 — 보이지 않는 점의 줄이 팀 툴팁에 붙지 않게"
  - "우리 범례는 기존 tick-chart-legend(누적 문구) 와 따로 tick-chart-own-legend 칸 — 누적 범례 문구 · 당일 화면 범례 없음 동작을 그대로 두려고"
  - "범례 표시 = 하루에 우리 체결이나 근거가 하나라도 있을 때(창과 무관 — 확대/이동으로 깜박이지 않게)"

patterns-established:
  - "차트 콜백 onOwnJump(rec, back?) — back 이 있으면 뷰어가 되돌아가기 알약을 남기고 커서를 옮긴다(카드 「보기 ›」 와 같은 알약)"

requirements-completed: []

coverage:
  - id: D1
    description: "ownMarksOf — 같은 A3 두 체결 = ◆ 한 점 · 추정 섞이면 est · 짝 없음 = gw 시각 · 체결가 · 근거 b6 = B6 수신 시각 · ev_price · 같은 근거 주문 둘 = ○ 한 점 · 구간 = 끝 A3 · 창 밖 제외 · 순서 ○ → ◇ → ◆ · ownMarkAt 판정"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/tick-chart.test.ts#ownMarksOf — ◆ · ◇ · ○ (Phase 38-07)"
        status: pass
    human_judgment: false
  - id: D2
    description: "가격 판 ◆(채움 --mine) · 추정 빈 ◆ 점선 3 2 · ◇ 빈 실선 · ○ 빈 원 --mine 테두리 — 팀 원 위 · 클립 안 · own 없으면 없음 · 구간 띠 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart.test.tsx#TickChart — 우리 점 ◆ · ◇ · ○ (Phase 38-07)"
        status: pass
    human_judgment: true
    rationale: "R 4px ◆ · ○ 의 실제 크기 · 팀 원과 겹칠 때 읽힘 · 다크 테마 민트 대비는 jsdom 이 못 재서 눈 확인 필요(38-09 e2e · 38-10 UAT)"
  - id: D3
    description: "클릭 — ◆ = onOwnJump(A3 rec) · ◇ = onOwnFillLine(fillId) · ○ = onOwnJump(근거 rec, 주문 id) · 우리 점 둘레 빈 곳도 우리 점이 먼저 · 멀면 시각 점프 · 팀 원 클릭 그대로"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart.test.tsx#◆ 클릭 · ◇ 클릭 · 우리 점 둘레"
        status: pass
    human_judgment: true
    rationale: "뷰어 결선(커서 이동 · 짝 없음 줄 선택 · 알약)은 단위 테스트가 차트 콜백만 단언 — 실제 왕복은 38-09 e2e · 38-10 UAT"
  - id: D4
    description: "툴팁 — ◆ 체결마다 우리/전체 · 계좌 끝 4 · 주문 # · 추정 · ◇ 짝 전문 없음/전문 아직 안 옴 · ○ 조건 근거 줄 · 팀 묶음 뒤 덧붙이기(팀 줄 불변) · 범례 두 칸"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts#tickOwnTipOf · tickHoverWithOwn — 우리 체결 · 근거 줄(Phase 38-07)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-chart.test.tsx#범례 · 마우스가 ◆ 위"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 07: 차트 ◆ · ◇ · ○ + 툴팁 줄 + 클릭 Summary

**틱 차트 가격 판에 우리 체결 ◆(같은 A3 는 한 점 · 추정이면 빈 ◆ 점선) · 짝 없음/대기 ◇ · 조건 근거 ○(구간이면 끝 A3 하나)를 팀 원 위에 그리고, ◆ 클릭은 그 체결 A3 행 · ○ 클릭은 근거 행 + 되돌아가기 알약 · ◇ 클릭은 그 짝 없음 줄로 보내며, 툴팁은 팀 묶음 줄 뒤에 「우리 체결 n주 / 전체 m주 · 계좌 ···끝4 · 주문 #」 · 「조건 근거 {종류} · 주문 #」 줄을 덧붙인다.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-03T07:01:38Z
- **Completed:** 2026-11-03T07:11:30Z
- **Tasks:** 2 (Task 1 tracer · Task 2 tdd)
- **Files modified:** 7 (새 파일 없음)

## Accomplishments
- `ownMarksOf`: own 모델 → 가격 판 점 목록. ◆ = `fillsOfRec` 의 A3 rec 마다(x = 그 A3 수신 ms · y = A3 가격) · ◇ = 짝 없음 · 대기 체결마다(gw 시각 · 체결가) · ○ = evidenceRec 마다(B6 = 그 B6 수신 ms · ev_price · 단건 A3 · 체결통보 · 구간 끝 = 그 A3). 창 ± 2% · 가격 0 이하 제외 · 그리기 순서 ○ → ◇ → ◆.
- TickChart own 레이어: `tick-price-layer` 클립 안 팀 원 · 고리 뒤(위)에 ◆ = 2R 정사각 `rotate(45)` · 추정 `strokeDasharray="3 2"` · ○ = `r = R − 1` — 전부 `vector-effect="non-scaling-stroke"`. 구간 띠 · 주문 시각 눈금 없음(D-08).
- 클릭: 우리 점(요소 또는 반지름 + 3px 기하 판정)이 팀 원보다 먼저 → ◆ `onOwnJump(rec)` · ◇ `onOwnFillLine(fillId)` · ○ `onOwnJump(rec, orderId)`. 빈 곳 · 팀 원 · `+ − 0` 키 동작 그대로.
- 뷰어: `TickChart own={ownModel}` · ○ 는 38-06 `onOwnBack` 알약을 남기고 커서 이동 · ◇ 는 `rows.ownPosOfFill` → `ownLineRec` → `onOwnSelect({kind:'fill'})`.
- 툴팁: `tickOwnTipOf`(가로 R + 3px 안 · 세로로 가장 가까운 보이는 점) · `tickHoverWithOwn`(팀 씨앗 ± 5px 안 우리 점 줄을 팀 줄 **뒤에** · 팀 hover 없으면 우리 줄만 · key `own:` 접두). 계좌는 끝 4자리만(D-02).
- 범례: 머리에 「◆ 우리 체결」 「○ 조건 근거」 두 칸(민트 · 목업 범례 꼴) — 우리 점이 하루에 하나라도 있을 때만.

## Task Commits

1. **Task 1 (tracer): 차트 ◆ · 추정 · ◇ · ○ · 클릭 이동** — `3a1d03a8` (feat)
2. **Task 2 (tdd): 툴팁 우리 줄 · 근거 줄 · 범례** — RED `3a305083` (test) → GREEN `c7c529d3` (feat) · REFACTOR 없음

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `webapp/src/lib/ticks/tick-chart.ts` — `OwnMark` · `ownMarksOf` · `ownMarkAt` · `OWN_MARK_R` · `OWN_MARK_HIT_PAD`
- `webapp/src/lib/ticks/__tests__/tick-chart.test.ts` — `ownMarksOf` 절 6건
- `webapp/src/lib/ticks/tick-chart-tip.ts` — `tickOwnTipOf` · `tickOwnLinesOf` · `tickHoverWithOwn`
- `webapp/src/lib/ticks/__tests__/tick-chart-tip.test.ts` — 우리 줄 · 합치기 절 6건
- `webapp/src/components/ticks/tick-chart.tsx` — own props · `OwnDiamond` · ○ 렌더 · 클릭 판정 · hover 합치기 · 우리 범례
- `webapp/src/components/ticks/__tests__/tick-chart.test.tsx` — 우리 점 렌더 · 클릭 · 범례 · 마우스 절 8건
- `webapp/src/components/ticks/tick-viewer.tsx` — `onChartOwnJump` · `onChartOwnFillLine` 결선

## Verification (실행 결과 그대로)
- Task 1 `<verify>`: `pnpm --filter @gh-radar/shared build` 통과 · `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e) 통과 · `vitest run tick-chart.test.ts tick-chart.test.tsx --maxWorkers=2` 2 files · 50 passed
- 트레이서 게이트: auto_advance false · human_verify_mode 기본(end-of-phase) · `<verify>` 자동만 → 재실행 통과로 체크포인트 없이 확장. 추가로 `tick-viewer-live.test.tsx` 9 passed(뷰어 결선 회귀).
- Task 2 RED: `vitest run tick-chart-tip.test.ts tick-chart.test.tsx` — 8 failed(새 절 · `tickOwnTipOf is not a function` · 범례 없음) · 30 passed → `3a305083`
- Task 2 `<verify>`: shared build · typecheck 통과 · `vitest run tick-chart-tip · tick-chart(lib) · tick-chart(컴포넌트) · team-model --maxWorkers=2` 4 files · 83 passed
- 회귀: `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` — 24 files · 319 passed
- eslint(변경 7파일) 경고 0 · 수용 기준 grep 7건 전부 PASS · `team-model.ts` · `tick-team-panel.tsx` diff 0 · `tick-chart-tip.ts` 기존 코드의 삭제 줄은 import 2줄 교체뿐 · 기존 팀 툴팁 테스트 무수정 통과(D-16)
- 미실행: e2e(38-09 몫) · 실제 화면 ◆ 크기 · 다크 대비 · 폰 눈 확인 · 배포(38-10 메인 세션)

## Decisions Made
frontmatter key-decisions 4건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함 예방] 판 밖으로 잘린 우리 점은 툴팁 · 묶음에서 뺌**
- **Found during:** Task 2
- **Issue:** 가격 판 범위(창 안 체결가 min/max + 8%)는 우리 점으로 넓히지 않으므로(팀 원과 같은 규칙) 체결가와 먼 ◇ · 근거 ○ 는 클립 밖에 그려져 안 보인다. 그 점이 팀 씨앗 ± 5px 안이면 보이지 않는 점의 줄이 팀 툴팁에 붙는다.
- **Fix:** `ownVisible`(cy 가 [y1a − R, y1b + R] 안)인 점만 툴팁 · 합치기 대상.
- **Files modified:** webapp/src/lib/ticks/tick-chart-tip.ts
- **Verification:** 컴포넌트 「마우스가 ◆ 위」 — 99,999원 ◇(판 밖)는 줄에 없고 ○ · ◆ 줄만
- **Committed in:** c7c529d3

### 계획 대비 작은 차이(기록)
- **OwnMark 필드 추가** — 계획 인터페이스에 `orderIds: number[]` 를 더했다(근거가 같은 주문 여럿 = ○ 한 점인데 툴팁은 「주문 여럿이면 줄 여럿」 이라 주문 전부가 필요). `orderId` 는 그 첫째.
- **`ownMarkAt` · `OWN_MARK_HIT_PAD` · `OWN_MARK_R` 추가 export** — 클릭 판정(반지름 + 3px)을 컴포넌트 밖에서 테스트하려고. 폰 R = 3.5(계획은 데스크톱 4 만 지정).
- **`tickOwnTipOf` 반환 꼴** — 계획 「줄 목록」 대신 `{ key, lines, mark }`(hover key · 합치기에서 같은 점 중복 제거에 필요). 합치기는 별도 함수 `tickHoverWithOwn` · 줄 만들기는 `tickOwnLinesOf`.
- **범례 칸 위치** — 계획 「범례(`tick-chart-legend`)에」 대신 옆 칸 `tick-chart-own-legend`. 기존 칸은 누적 문구 정확 비교 · 당일 화면이면 칸 자체가 없음(테스트 잠금)이라 같은 칸에 넣으면 두 동작이 바뀐다. 화면에서는 같은 머리 줄에 나란히 보인다.
- **Task 1 에 컴포넌트 테스트 추가** — 계획 Task 1 files 에 `tick-chart.test.tsx` 가 없지만 트레이서 경로(◆ 클릭 → onOwnJump(rec))를 잠그려고 렌더 · 클릭 절 6건을 Task 1 커밋에 넣었다.
- **테스트 고정 데이터** — 처음 쓴 호가 근거(매도1 16,450)가 고정 데이터의 가격 범위(16,300~16,400) 위라 ○ 가 판 밖에 그려져 기하 클릭 테스트가 실패했다 → 범위 안 B6(seq 100 · 16,400)로 바꿨다(구현 변경 없음).
- **TDD 커밋 분리** — Task 2 를 RED(test) · GREEN(feat) 두 커밋으로(38-04 ~ 38-06 과 같은 꼴). 커밋 3개.

---

**Total deviations:** 1 auto-fixed(Rule 1) + 기록 7건
**Impact on plan:** 금지 사항 무변경 — 구간 띠 없음 · 주문 시각 눈금 없음 · 팀 원 · 팀 평단 · 팀 계단 · 팀 툴팁 문구 무변경(우리 줄은 뒤에 덧붙이기만) · 다른 판(순매수 · 막대 · 거래대금)에 우리 점 없음.

## TDD Gate Compliance
- Task 2: RED `3a305083`(test · 8 failed — 함수 없음 · 범례 없음) → GREEN `c7c529d3`(feat · 38 passed) · REFACTOR 없음.

## Issues Encountered
- 이 세션 격리 검사가 복합 git 명령(`$(git rev-parse --git-dir)` 안의 리다이렉트)을 막아 플랜 커밋 원장 파일을 쓰지 못했다 — 시작 HEAD `69694496` 을 직접 기록해 `git rev-list --count 69694496..HEAD` = 3 으로 쟀다(결과물 영향 없음).

## Known Limitations
- 가격 판 범위는 우리 점으로 넓히지 않는다(팀 원 · 평단과 같은 규칙). 근거 B6 의 ev_price 나 짝 없음 체결가가 창 안 체결가 범위 + 8% 밖이면 그 점은 클립되어 안 보이고 툴팁에도 안 오른다. 매물소진 근거는 보통 매수 체결가와 같은 매도1 가격이라 범위 안이지만, 10초 창처럼 좁게 확대하면 빠질 수 있다 — UAT(38-10)에서 「판 끝에 붙이기」 가 필요한지 확인 대상.

## Known Stubs
없음 — ◆ · ◇ · ○ · 툴팁 · 범례 · 클릭 모두 실제 own 모델 · 뷰어 콜백에 결선됨.

## User Setup Required
None — 배포는 38-10 메인 세션.

## Next Phase Readiness
- 38-08 이후(탐색 알약 · `[` `]` 등)는 `ownMarksOf` 순서(○ → ◇ → ◆ · 시각순)와 뷰어 `onChartOwnJump` · `onChartOwnFillLine` 을 그대로 쓸 수 있다.
- 커서가 든 우리 체결 ◆ 강조(팀 원의 --fg 고리 같은 것)는 계획에 없어 넣지 않았다 — 필요하면 UAT 에서 정한다.

## Self-Check: PASSED
- 변경 파일 7개 존재 확인 · 커밋 `3a1d03a8` · `3a305083` · `c7c529d3` 이 HEAD 이력에 있음 · `git rev-list --count 69694496..HEAD` = 3 · 삭제 파일 0.
