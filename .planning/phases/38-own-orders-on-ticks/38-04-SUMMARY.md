---
phase: 38-own-orders-on-ticks
plan: 04
subsystem: ticks
tags: [react, tick-viewer, msg-list, rail, own-orders, typed-array]

requires:
  - phase: 38-01
    provides: "buildOwnModel · OwnModel · ownChipOf · TickOwnEvent/Order/Fill 계약 · --mine 토큰 · 전문 목록 own prop"
provides:
  - "own-model: OwnOrderView(gateway|order_no 묶기 · 이벤트 → 보조 주문 → 체결만) · OwnSel · OwnFillState(matched|nofill|pending) · OWN_PENDING_GRACE_MS(1200) · slotOfOrder · slotOfFill · ownOrderLineText"
  - "msg-rows: MSG_ITEM.ORDER(3) · NOFILL(4) · buildMsgRows(session, mode, own?) · ownPosOfOrder · ownPosOfFill · ownLineRec · ownRailOf · RAIL_HALF · RAIL_NODE"
  - "shared: conditionTextOf · evidenceTextOf export(좁은 입력 타입 ConditionTextInput · EvidenceTextInput)"
  - "전문 목록: data-slot tick-own-order · tick-own-nofill · tick-own-rail(data-node order|fill|nofill) · props ownSel · onOwnSelect"
  - "뷰어: buildOwnModel live 전달 · ownPick 파생 선택(PaneCtx.ownSel · onOwnSelect)"
affects: [38-05, 38-06, 38-07, 38-08, 38-09]

estimate:
  tokens: 70000
  tasks: 2
actuals:
  tokens: 20163
  tasks: 2
  commits: 3
plan_head_before: c50bda7bc097e69babf747ced67ca5f8d5665baf
plan_head_after: 4152aca1c27815a5d901d888d32daf9061df1b03

tech-stack:
  added: []
  patterns:
    - "우리 줄 자리 = 수신순 lowerBoundRecv 슬롯 p 하나(두 순열 공통) · ROW(order[p]) 앞 · 다조각 묶음 사이면 그 꼬리 뒤로 민다"
    - "둘째 레일 = 주문별 [주문 줄 · 체결 자리] 최소~최대 구간 → 경계 차분 배열(실선 · 점선 따로) · 실선 우선 — O(항목 + 체결)"
    - "팀/일반 3px 레일은 시각 칸(-ml-1.5 pl-1.5 · self-stretch)에 box-shadow — 글자 자리는 Phase 37 그대로"
    - "우리 줄 선택은 뷰어 상태 (줄, 기준 rec) + 커서 rec 일치 파생 — 효과 없음"

key-files:
  created:
    - webapp/src/lib/ticks/__tests__/own-model.test.ts
  modified:
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - webapp/src/lib/ticks/own-model.ts
    - webapp/src/lib/ticks/msg-rows.ts
    - webapp/src/lib/ticks/__tests__/msg-rows.test.ts
    - webapp/src/components/ticks/tick-msg-list.tsx
    - webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx
    - webapp/src/components/ticks/tick-viewer.tsx

key-decisions:
  - "주문 줄 출처 그룹 = 이벤트 group · 이벤트가 없으면 보조 주문 origin(manual → 7 · vi → 8) · limit_chaser 는 0(구분 · 출처 생략) — 낱말은 orderGroupLabel · orderGroupOriginText 그대로"
  - "가격 · 수량 0 이하는 없는 값으로 본다(주문 줄에서 생략 — 가짜 0 금지)"
  - "주문 정렬 = 주문 시각(시각 없는 체결만 주문은 첫 체결 시각) · 동률은 묶기 키 — 주문 id 가 이 순서"
  - "레일 마디 우선순위는 항목 종류로 자연 분리(● 주문 줄 · ◆ ROW · ◇ NOFILL) — 한 ROW 에 여러 주문 체결이 붙어도 ◆ 하나"
  - "꼬리 줄도 격자(14px 레일 칸 + 내용 한 칸)로 바꿔 레일 선이 꼬리 줄을 지나간다 · 꼬리 글자는 시각 글자보다 14px 안쪽(Phase 37 들여쓰기 유지)"

patterns-established:
  - "MSG_ITEM 새 종류는 idx 를 자기 색인(주문 id · 체결 id)으로 쓰고 posOfRec 와 분리된 색인(ownPosOfOrder · ownPosOfFill)을 둔다 — own 없으면 길이 0 · 항목 바이트 동일"
  - "MsgRow 에는 레일 값도 원시값(railHalf · railNode · ownSelected)으로 넘겨 memo 유지"

requirements-completed: []

coverage:
  - id: D1
    description: "주문 줄 「● 주문 …」 이 주문 시각 이후 첫 전문 앞에 두 순열 모두 · 다조각 묶음 사이면 꼬리 뒤 · own 없으면 Phase 37 과 같은 항목"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/msg-rows.test.ts#buildMsgRows — 우리 주문 줄 · 짝 없음 줄(Phase 38)"
        status: pass
    human_judgment: false
  - id: D2
    description: "짝 없는 체결 「◆ 우리 체결 n주 · 짝 전문 없음」 줄 · 당일 대기 「전문 아직 안 옴」(OWN_PENDING_GRACE_MS 1200) · 과거 대기 0 · 누락 0(모든 체결이 주문에 속함)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/own-model.test.ts#buildOwnModel — 당일 대기 · 주문 묶기"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx#TickMsgList — 우리 줄 · 둘째 레일(Phase 38-04)"
        status: pass
    human_judgment: false
  - id: D3
    description: "주문 줄 문구 — 구분 · 조건 · 출처 낱말이 shared conditionTextOf · orderGroupLabel 과 같다(수동 「조건 없음 · 수동 주문」)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/own-model.test.ts#ownOrderLineText"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#conditionTextOf · evidenceTextOf export (Phase 38-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "둘째 레일 계산 — 구간 · 추정 점선 · 겹침 실선 우선 · 길이 1 마디만 · own 없음 빈 배열"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/msg-rows.test.ts#ownRailOf — 둘째 레일(Phase 38 D-04)"
        status: pass
    human_judgment: false
  - id: D5
    description: "레일 칸 렌더 · 줄 클릭 선택(onOwnSelect · 민트 18%) · 커서 이동 시 해제(파생)"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx#TickMsgList — 우리 줄 · 둘째 레일(Phase 38-04)"
        status: pass
    human_judgment: true
    rationale: "레일 선 · 마디 치수(목업 B 5px/3px · 11px 원 · 9px 마름모)와 폰 390 에서 14px 칸 · 시각 칸 3px 레일 위치는 jsdom 이 배치를 못 재서 실제 화면 눈 확인 필요 — e2e 38-09 · 배포 UAT 38-10"

duration: 13min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 04: 주문 줄 · 짝 없음 줄 · 둘째 레일 Summary

**저널 주문 이벤트를 `gateway|order_no` 로 묶어 주문 시각(이벤트 gw → 보조 주문 created_ms) 슬롯에 점선 「● 주문 수동 매수 16,400 ×300 · 조건 없음 · 수동 주문 · KB120 ···3801 #…」 줄과 짝 없는 체결 「◆ 우리 체결 n주 · 짝 전문 없음 / 전문 아직 안 옴」 줄을 두 순열에 끼우고, 전문 목록 맨 앞 14px 둘째 레일에 ● → ◆ 민트 선(추정 점선 · ◇)을 그렸다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-03T06:21:58Z
- **Completed:** 2026-11-03T06:34:59Z
- **Tasks:** 2 (Task 1 tracer · Task 2 tdd)
- **Files modified:** 9 (새 1 · 수정 8)

## Accomplishments
- shared `conditionTextOf` · `evidenceTextOf` export — 좁은 `Pick` 입력 · 주문 본문 내부 호출도 같은 함수(골든 147 그대로 통과).
- own-model: 주문 묶기(이벤트 kind 3·6 ∪ 체결 주문번호 · 가장 이른 이벤트 → 보조 주문 행 → 체결만) · `slotOfOrder`/`slotOfFill`(`lowerBoundRecv`) · 체결 `order` · `state`(matched/nofill/pending — 당일만 대기) · `ownOrderLineText`.
- msg-rows: `MSG_ITEM.ORDER 3 · NOFILL 4` · 슬롯 p 의 ROW 앞 · 같은 슬롯은 시각 → 주문 먼저 · 다조각 묶음 사이면 그 꼬리 뒤(Pitfall 3) · `ownPosOfOrder` · `ownPosOfFill` · `ownLineRec` · `ownRailOf`.
- 전문 목록: 점선 우리 줄 2종(`--mine` 60% 점선 · 7% 바탕 · 「주문」/「체결」 배지 · seq 「—」 · title 로 잘림 보완) · 14px 레일 칸(머리 빈 칸 · 폰 유지) · 기존 3px 레일은 시각 칸으로 · 줄 선택 18% · 대기 ◇ 점선 테두리.
- 뷰어: `buildOwnModel(session, own, { live })` · `ownPick` → 커서 rec 일치 파생 `ownSel` · `onOwnSelect` = 기억 + `jumpToRec`.

## Task Commits

1. **Task 1 (tracer): 주문 줄 · 짝 없음 줄** — `e779a398` (feat)
2. **Task 2 (tdd): 둘째 레일 · 줄 선택 · 대기** — RED `19c92e4f` (test) → GREEN `4152aca1` (feat) · REFACTOR 없음

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `packages/shared/src/strategy-event-text.ts` — `ConditionTextInput` · `EvidenceTextInput` · `conditionTextOf` · `evidenceTextOf` export
- `packages/shared/src/__tests__/strategy-event-text.test.ts` — export 두 함수 = 골든 조각(조건 · 근거 호가 · 체결통보 · 수동 출처)
- `webapp/src/lib/ticks/own-model.ts` — 주문 · 슬롯 · 대기 · 줄 문구
- `webapp/src/lib/ticks/__tests__/own-model.test.ts` — 새 파일 12 케이스
- `webapp/src/lib/ticks/msg-rows.ts` — ORDER · NOFILL · 색인 · `ownLineRec` · `ownRailOf`
- `webapp/src/lib/ticks/__tests__/msg-rows.test.ts` — 우리 줄 절 6 · 레일 절 5
- `webapp/src/components/ticks/tick-msg-list.tsx` — 레일 칸 · 우리 줄 · 선택 · 시각 칸 레일
- `webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx` — 우리 줄 · 레일 절 4
- `webapp/src/components/ticks/tick-viewer.tsx` — live · ownPick 결선

## Verification (실행 결과 그대로)
- Task 1 `<verify>`: `pnpm --filter @gh-radar/shared build` 통과 · `vitest run src/__tests__/strategy-event-text.test.ts --maxWorkers=2` 147 passed · `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e) 통과 · `vitest run own-model · msg-rows · tick-msg-list --maxWorkers=2` 41 passed
- 트레이서 게이트: auto 아님 · human_verify_mode end-of-phase · `<verify>` 자동만 → 재실행 통과로 체크포인트 없이 확장(Task 2)
- Task 2 RED: `vitest run msg-rows.test.ts` — 레일 절 5 failed(`ownRailOf is not a function`) · 기존 21 passed → `19c92e4f`
- Task 2 `<verify>`: shared build · webapp typecheck 통과 · `vitest run msg-rows · tick-msg-list · own-model · use-fixed-window --maxWorkers=2` 54 passed
- 추가 회귀(계획 밖): `vitest run src/components/ticks src/lib/ticks --maxWorkers=2` — 24 파일 277 passed · eslint(변경 webapp 7파일) 경고 0
- 수용 기준 grep 전부 PASS(Task 1 9개 · Task 2 7개) · 금지 「◆ 다음 우리 체결」 버튼 없음 · `posOfRec` 의미 · 행 높이 24/22 · `useFixedWindow` 무변경
- 미실행: e2e(38-09 몫) · 실제 화면 레일 치수 · 폰 390 눈 확인(배치 측정 불가 — 38-09/38-10)

## Decisions Made
frontmatter key-decisions 5건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그 예방] 꼬리 줄을 격자로 바꿈**
- **Found during:** Task 2(레일 칸 추가)
- **Issue:** 꼬리 줄은 `block` 이라 격자 열이 없다 — 레일 칸이 빠지면 우리 주문 구간이 꼬리 줄을 지날 때(주문 줄을 꼬리 뒤로 민 경우 등) 민트 선이 끊기고, 기존 3px 레일도 시각 칸으로 옮기면 꼬리 줄만 어긋난다.
- **Fix:** 꼬리 줄 = `grid-cols-[14px_minmax(0,1fr)]`(폰 같음) · 레일 칸 + 내용 한 칸(시각 칸과 같은 왼쪽 끝에 3px 레일 · 글자는 `pl-5` 로 Phase 37 의 「시각 글자보다 14px 안쪽」 유지).
- **Files modified:** webapp/src/components/ticks/tick-msg-list.tsx
- **Verification:** tick-msg-list 기존 「꼬리 클릭 = 마지막 조각」 · 「┗ 3조각 1단」 테스트 통과
- **Committed in:** 4152aca1

**2. [Rule 2 - 방어] buildMsgRows 가 꼬리를 못 만난 민 줄을 끝에 둔다**
- **Found during:** Task 1
- **Issue:** 이론상 민 줄은 늘 그 주문 꼬리 뒤에 놓이지만, 못 놓이면 항목 배열 끝이 0(빈 ROW rec 0)으로 남아 창 가상화가 틀린 행을 그린다.
- **Fix:** 루프 뒤 남은 민 줄을 끝에 넣어 항목 수를 늘 맞춘다(정상 경로에선 비어 있음 — 테스트로 꼬리 바로 뒤 자리 확인).
- **Committed in:** e779a398

**3. [계획 보강] TDD RED 커밋 분리**
- 계획은 Task 2 커밋 1개였지만 tdd="true" 라 RED(`test(38-04)` 19c92e4f) → GREEN(`feat(38-04)` 4152aca1) 두 커밋으로 남겼다(커밋 메시지 GREEN 은 계획 문구 그대로).

---

**Total deviations:** 2 auto-fixed(Rule 1 1 · Rule 2 1) + 커밋 분리 1
**Impact on plan:** 계약 · 동작 범위 변화 없음 — 화면 결함(레일 끊김)과 항목 수 어긋남을 미리 막았다.

## TDD Gate Compliance
- RED `19c92e4f`(test · 5 failed — 함수 없음) → GREEN `4152aca1`(feat · 26 passed) · REFACTOR 없음.

## Issues Encountered
- 이 세션의 격리 검사가 heredoc · 복합 git 명령을 막아 파일은 Write/Edit, git 은 단순 명령으로 나눠 실행했다(결과물 영향 없음).

## Known Stubs
- 주문 줄의 근거 조각 「· 근거 {호가|체결} ↑」 과 근거 ○ · 앵커 ◌ 마디는 계획상 38-06 몫(`ownOrderLineText` 주석에 명시) — 이 플랜 목표(주문 시각 · 짝 없음 · 레일 ● → ◆)는 막지 않는다.

## User Setup Required
None — 배포는 38-10 메인 세션.

## Next Phase Readiness
- 38-05/06(근거 · 카드)은 `OwnOrderView.event` · `OwnSel` · `ownPosOfOrder` · `ownRailOf` 위에서 근거 마디(○ ◌)와 카드 섹션을 더하면 된다. 38-07(탐색 알약 · `[` `]`)은 `ownPosOfFill` + `posOfRec[fill.rec]` 로 이동 대상을 만든다.
- 메인 트리 `msg-rows.ts` 의 다른 세션 미커밋 변경(스케치 024)과는 `MSG_ITEM` 줄 · `MsgRowsModel` 끝 · `buildMsgRows` 루프 · 파일 중간(`nextInversionFrom` 뒤) 에서 겹칠 수 있다 — 파일 끝 덧붙이기는 하지 않았다.

## Self-Check: PASSED
- 파일 9개 존재 · 커밋 `e779a398` · `19c92e4f` · `4152aca1` 이 HEAD 조상 · `git rev-list --count c50bda7b..HEAD` = 3 · 삭제 파일 0.
