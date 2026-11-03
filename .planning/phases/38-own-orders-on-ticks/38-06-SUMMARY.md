---
phase: 38-own-orders-on-ticks
plan: 06
subsystem: ticks
tags: [react, tick-viewer, evidence, anchor, own-orders, card]

requires:
  - phase: 38-04
    provides: "OwnOrderView · OwnSel · ownOrderLineText · ownPosOfOrder · ownPosOfFill · ownLineRec · ownRailOf · 레일 칸"
  - phase: 38-05
    provides: "shared cumIndexOf · locateEvidence · anchorOf · OwnEvidence"
provides:
  - "own-model: OwnOrderView.evidence · evidenceLabel · evidenceRec · evidenceFirstRec · anchorRec · OwnModel.ordersOfEvidenceRec · ownOrderGroupLabel · ownConditionLineText · ownEvidenceText · 주문 줄 「 · 근거 {종류} ↑」"
  - "msg-rows: RAIL_NODE.EVIDENCE(4 ○) · ANCHOR(5 ◌) · 구간 근거 첫 ○ … 끝 ○ 점선 · 마디 우선순위 ◆ > ● > ○ > ◇ > ◌"
  - "tick-own-section.tsx: TickOwnSection(data-slot tick-own-section) · TickOwnEvidenceOrders(tick-own-evidence-orders) · TickOwnTable(tick-own-table)"
  - "TickOrderCard props own · ownSel · onOwnJump · onOwnBack · onOwnOrder · export ownOrdersAt"
  - "TickMsgList rows prop · 뷰어 rows 한 번 · onOwnOrder · ownBack 알약(data-slot tick-own-back)"
affects: [38-07, 38-08, 38-09, 38-10]

estimate:
  tokens: 75000
  tasks: 2
actuals:
  tokens: 19400
  tasks: 2
  commits: 3
plan_head_before: bee55f471bb50545a351a43d0705cb90690fad28
plan_head_after: 27f04121915f7e794e58d93f15a2b57404d80819

tech-stack:
  added: []
  patterns:
    - "근거 색인(cumIndexOf)은 buildOwnModel 안에서 이벤트가 있을 때만 세션당 한 번 — 주문마다 locateEvidence · anchorOf"
    - "구간 근거 점선은 [첫 ○, 끝 ○] 따로 · 주문 실선 구간은 끝 ○ 부터 센다(실선이 겹침을 이기므로)"
    - "되돌아가기 알약은 주문 묶기 키(gateway|order_no) + 화면 범위(isin|d|ex)로 기억하고 파생으로 지운다 — 효과 없음"

key-files:
  created:
    - webapp/src/components/ticks/tick-own-section.tsx
  modified:
    - webapp/src/lib/ticks/own-model.ts
    - webapp/src/lib/ticks/__tests__/own-model.test.ts
    - webapp/src/lib/ticks/msg-rows.ts
    - webapp/src/lib/ticks/__tests__/msg-rows.test.ts
    - webapp/src/components/ticks/tick-msg-list.tsx
    - webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx
    - webapp/src/components/ticks/tick-order-card.tsx
    - webapp/src/components/ticks/__tests__/tick-order-card.test.tsx
    - webapp/src/components/ticks/tick-viewer.tsx

key-decisions:
  - "체결통보(ev_kind 3) 근거 = 같은 게이트웨이 · 계좌의 gw ≤ 이벤트 gw ∧ 가격 · 수량 일치 우리 체결 중 마지막 것 — 그 체결이 짝 없으면 근거 없음(더 이른 체결로 거슬러 가지 않음 · Open Q3 UAT 대상)"
  - "앵커가 근거 행(구간이면 첫 · 끝 ○ 어느 쪽이든)과 같으면 anchorRec −1"
  - "카드 근거 줄은 evidenceTextOf 문구에서 머리 「근거 」 만 뺀다 — 키 칸이 이미 「근거 {종류}」"
  - "되돌아가기 알약은 주문 id 대신 묶기 키로 기억 — 당일 증분으로 주문 id 가 밀려도 같은 주문으로 돌아간다"
  - "표 행 · 역참조 · 알약의 「주문 줄 선택」 순서 = 주문 줄 → 첫 짝 체결 A3 → 첫 짝 없음 줄"

patterns-established:
  - "카드 콜백은 onOwnJump(rec) · onOwnBack(id) · onOwnOrder(id) 세 갈래 — 주문 줄 자리를 아는 쪽(뷰어 rows)이 선택을 푼다"

requirements-completed: []

coverage:
  - id: D1
    description: "근거 · 앵커 모델 — 호가 b6 · 단건 a3 · 구간(첫/끝) · 체결통보 → 우리 체결 짝 · 다른 계좌/이전 체결 없음 → 없음 · 앵커(근거와 같으면 −1) · ordersOfEvidenceRec · 주문 줄 「근거 호가 ↑」"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/own-model.test.ts#buildOwnModel — 근거 · 앵커(38-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "레일 ○ ◌ — 띠 시작 = 근거 행 · 구간 첫 ○ … 끝 ○ 점선 · 앵커 마디만 · ◆ > ○ 우선 · ○ 렌더(data-node evidence)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/ticks/__tests__/msg-rows.test.ts#ownRailOf — 근거 ○ · 앵커 ◌(Phase 38-06)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx#38-06 — 근거 B6 행 ○ 마디"
        status: pass
    human_judgment: true
    rationale: "○ 11px · ◌ 7px 마디와 점선 띠의 실제 모양 · 폰 390 은 jsdom 이 배치를 못 재서 눈 확인 필요(38-09 e2e · 38-10 UAT)"
  - id: D3
    description: "카드 ◆ 우리 주문 섹션 — 주문 · 조건(D-13 문구) · 근거(보기 ›) · 직전 체결 · 체결(부분 · 추정 · 짝 없음 · 대기) · 꼬리말 두 문구"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-order-card.test.tsx#TickOrderCard — 우리 주문(Phase 38) ④ ⑤ ⑥"
        status: pass
    human_judgment: false
  - id: D4
    description: "「우리 주문」 표 늘 표시 · 캡션 정확 · 「?」 · 행 클릭 · 근거 칸 · 근거 역참조 목록"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-order-card.test.tsx#TickOrderCard — 우리 주문(Phase 38) ① ② ③ ⑦"
        status: pass
    human_judgment: false
  - id: D5
    description: "되돌아가기 알약(뷰어) · rows 한 번 · 주문 줄 선택 결선"
    verification:
      - kind: unit
        ref: "webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx#38-06 — rows prop"
        status: pass
    human_judgment: true
    rationale: "알약 렌더 · 클릭 후 주문 줄로 복귀는 뷰어 전체 결선이라 단위 테스트는 카드 콜백만 단언(계획대로) — 실제 왕복은 38-09 e2e · 38-10 UAT"

duration: 14min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 06: 근거 마디 · 「이 주문」 카드 우리 섹션 · 「우리 주문」 표 · 되돌아가기 Summary

**주문 이벤트마다 shared `locateEvidence` · `anchorOf` 로 근거 전문(B6 · 단건 A3 · 체결 구간 · 체결통보 → 우리 체결 짝)과 「직전 체결」 앵커를 정해, 레일에 ○ · ◌ 와 구간 점선을, 주문 줄에 「· 근거 호가 ↑」 을, 「이 주문」 카드에 「◆ 우리 주문 #…」 섹션(근거 · 직전 체결 「보기 ›」) · 근거 역참조 목록 · 늘 보이는 「우리 주문」 표 · 「‹ 주문 #… 로」 되돌아가기 알약을 붙였다.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-03T06:44:53Z
- **Completed:** 2026-11-03T06:58:37Z
- **Tasks:** 2 (Task 1 tracer · Task 2 tdd)
- **Files modified:** 10 (새 1 · 수정 9)

## Accomplishments
- own-model: `cumIndexOf` 한 번(이벤트 있을 때만) → 주문마다 근거 · 앵커 · `ordersOfEvidenceRec`(근거 rec · 구간 첫 rec 둘 다 키) · 체결통보는 같은 게이트웨이 · 계좌 이전 우리 체결 짝 A3. 카드용 순수 함수 `ownOrderGroupLabel` · `ownConditionLineText`(D-13 문구) · `ownEvidenceText`.
- msg-rows `ownRailOf`: ○ 근거(띠에 포함) · ◌ 앵커(마디만) · 구간 첫 ○ … 끝 ○ 점선 · 마디 우선순위 표. 전문 목록 레일 칸에 ○(11px 빈 원 · `--mine` 테두리) · ◌(7px · `--faint` 테두리) 렌더.
- `tick-own-section.tsx`: `TickOwnSection`(주문 · 조건 · 근거 · 직전 체결 · 체결 · 꼬리말) · `TickOwnEvidenceOrders` · `TickOwnTable` — 목업 `.sect` · `.ln` · `.lk` · `.lk.ghost` · `table.rl2` · `.foot` 꼴.
- 카드 배치 = 본문 → 섹션(또는 역참조) → 「우리 주문」 표 → 37 「최근 주문」 표(그대로).
- 뷰어: `buildMsgRows` 한 번(목록 `rows` prop) · `onOwnOrder`(주문 줄 → 첫 짝 체결 → 짝 없음 줄) · `ownBack` 알약(side 칸 맨 위 · 전체 폭 줄 · 한 단계 · 덮어씀 · 화면 범위가 바뀌면 파생으로 사라짐).

## Task Commits

1. **Task 1 (tracer): 조건 근거 — 레일 ○ ◌ · 구간 점선 · 주문 줄 근거 ↑ · 카드 섹션 보기 ›** — `cb422991` (feat)
2. **Task 2 (tdd): 「우리 주문」 표 · 근거 역참조 · 직전 체결 · 꼬리말 · 되돌아가기 알약** — RED `89e4f2cd` (test) → GREEN `27f04121` (feat) · REFACTOR 없음

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `webapp/src/components/ticks/tick-own-section.tsx` — 새 파일 · 섹션 · 역참조 · 표
- `webapp/src/lib/ticks/own-model.ts` — 근거 · 앵커 필드 · 역참조 맵 · 카드 문구 함수 · 주문 줄 근거 조각
- `webapp/src/lib/ticks/__tests__/own-model.test.ts` — 근거 · 앵커 절 7건
- `webapp/src/lib/ticks/msg-rows.ts` — `RAIL_NODE.EVIDENCE` · `ANCHOR` · 우선순위 · 구간 점선
- `webapp/src/lib/ticks/__tests__/msg-rows.test.ts` — 근거 ○ · 앵커 ◌ 절 4건
- `webapp/src/components/ticks/tick-msg-list.tsx` — ○ ◌ 마디 · `rows` prop
- `webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx` — ○ 렌더 · `rows` prop 2건
- `webapp/src/components/ticks/tick-order-card.tsx` — own props · `ownOrdersAt` · 섹션 · 역참조 · 표 배치
- `webapp/src/components/ticks/__tests__/tick-order-card.test.tsx` — 「우리 주문(Phase 38)」 절 9건
- `webapp/src/components/ticks/tick-viewer.tsx` — rows 공용 · `onOwnOrder` · `ownBack` 알약

## Verification (실행 결과 그대로)
- Task 1 `<verify>`: `pnpm --filter @gh-radar/shared build` 통과 · `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e) 통과 · `vitest run own-model · msg-rows · tick-msg-list · tick-order-card --maxWorkers=2` 4 files · 66 passed
- 트레이서 게이트: auto 아님 · `<verify>` 자동만 · human_verify_mode end-of-phase → 재실행 통과로 체크포인트 없이 확장
- Task 2 RED: `vitest run tick-order-card.test.tsx` — 7 failed(새 절) · 7 passed(기존 5 + 모델 전제 · ⑦) → `89e4f2cd`
- Task 2 `<verify>`: shared build · typecheck 통과 · `vitest run tick-order-card · tick-msg-list · msg-rows · tick-team-panel · team-model --maxWorkers=2` + 추가로 `tick-viewer-live` — 6 files · 88 passed
- 계획 `<verification>`: `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` — 24 files · 299 passed
- eslint(변경 10파일) 경고 0 · 수용 기준 grep 전부 PASS(Task 1 7개 · Task 2 6개) · 팀 모델 · 팀 패널 · 그 테스트 무변경(diff 0 — D-16)
- 참고: `tick-viewer-live.test.tsx` 실행 중 `[tick-own] … No "fetchTickOwn" export is defined on the "@/lib/ticks/tick-api" mock` 로그가 찍힌다 — 그 테스트의 기존 mock 에 `fetchTickOwn` 이 없어 `use-tick-own` 이 실패를 로깅하는 것(이 플랜이 건드리지 않은 경로 · 테스트는 통과). 범위 밖이라 고치지 않았다.
- 미실행: e2e(38-09 몫) · 실제 화면 마디 치수 · 폰 390 눈 확인 · 배포(38-10 메인 세션)

## Decisions Made
frontmatter key-decisions 5건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함 예방] 카드 근거 줄에서 문구 머리 「근거 」 를 뺌**
- **Found during:** Task 1
- **Issue:** 키 칸이 「근거 호가」 인데 값에 `evidenceTextOf` 를 그대로 넣으면 「근거 호가 | 13:00:00.150 · 근거 호가(매도1잔량 …)」 처럼 같은 낱말이 두 번 나오고 330px 카드에서 줄이 하나 더 접힌다.
- **Fix:** 값은 「{근거 행 수신 시각} · 호가(매도1잔량 52,100→38,200)」 — 정본 문구에서 머리 「근거 」 만 뺐다(나머지 낱말 그대로).
- **Files modified:** webapp/src/components/ticks/tick-own-section.tsx
- **Verification:** 카드 테스트 ④ 문자열 정확 비교
- **Committed in:** cb422991

### 계획 대비 작은 차이(기록)
- **TickOwnSection 인자** — 계획 문구 `orderIds` 대신 주문 하나를 받는 `orderId` 로 두고 카드가 `ownOrdersAt` 결과를 돌며 섹션을 그린다(「주문이 둘이면 섹션 둘」 동작은 같다). 역참조 · 표는 같은 파일의 `TickOwnEvidenceOrders` · `TickOwnTable` 로 나눴다(data-slot 은 계획 그대로).
- **카드 콜백 `onOwnOrder(id)` 추가** — 계획은 `onOwnJump` · `onOwnBack` 만 적었지만 「행 클릭 — 체결 없으면 주문 줄 선택」 · 「역참조 항목 클릭 = 주문 줄 선택」 은 주문 줄 자리(rows)를 아는 뷰어만 풀 수 있어 콜백 하나를 더했다.
- **알약 기억 단위** — 계획 `useState<number | null>(주문 id)` 대신 `{ key: gateway|order_no, scope: isin|d|ex }` — 당일 증분으로 주문 id 가 밀려도 같은 주문, 종목 · 날짜 · 거래소가 바뀌면 효과 없이 사라짐(D-10).
- **추정 꼬리말의 {d}** — `OWN_MATCH_EST_MS`(20) 를 쓰고 {k} 는 매칭의 후보 수(창 [−200, +1500]ms 안 같은 가격 · 남은 수량 충족 A3 수)다. 엄밀히는 「20ms 안 후보 수」 가 아니라 「후보 수 k · 첫째 · 둘째 차가 20ms 미만」 이다 — 정확한 「20ms 안」 개수는 shared `matchOwnFills` 가 내주지 않아 계획 문구 그대로 두었다(UAT 에서 문구 확인 대상).
- **수용 기준 `grep -q "주문 시각 위치만" tick-own-section.tsx`** — 문구 정본은 `own-model.ts` `ownConditionLineText` 에 있고 섹션 파일에는 머리 주석에만 있다(grep 은 통과 · 화면 문구는 테스트 ⑤ ⑥ 이 정확 비교).
- **tick-msg-list 테스트 2건 추가** — 계획 files 의 Task 2 목록 밖(`tick-msg-list.test.tsx`)이지만 `rows` prop 과 ○ 렌더를 단언하려고 더했다.
- **TDD 커밋 분리** — Task 2 를 RED(test) · GREEN(feat) 두 커밋으로(38-04 · 38-05 와 같은 꼴). 커밋 3개.

---

**Total deviations:** 1 auto-fixed(Rule 1) + 기록 7건
**Impact on plan:** 계약 · 금지 사항 무변경 — 근거 행 「→ 주문 #n」 칩 없음 · 별도 패널 없음 · 「기록 없는 게이트웨이」 안내 없음 · 다른 후보 A3 흐린 표식 없음 · 팀 패널 · 팀 손익 무변경 · /me 진입점 없음.

## TDD Gate Compliance
- Task 2: RED `89e4f2cd`(test · 7 failed — 표 · 역참조 · 섹션 줄 없음) → GREEN `27f04121`(feat · 14 passed) · REFACTOR 없음.

## Issues Encountered
- 이 세션의 격리 검사가 heredoc · 복합 git 명령(한 줄에 git 여러 번)을 막아 파일은 Write/Edit, git 은 단순 명령으로 나눠 실행했다(결과물 영향 없음).

## Known Stubs
없음 — 근거 · 앵커 · 카드 섹션 · 표 · 알약 모두 실제 모델에 결선됨.

## User Setup Required
None — 배포는 38-10 메인 세션.

## Next Phase Readiness
- 38-07(탐색 알약 · `[` `]`)은 `ownPosOfFill` · `posOfRec[fill.rec]` 와 이번 `onOwnOrder`(뷰어) 를 그대로 쓸 수 있다. 레일 마디 클릭(D-10 「띠는 링크」)은 아직 없다 — 마디가 `pointer-events-none` 이고 행 클릭이 같은 rec 로 가므로 38-07 탐색과 함께 정하면 된다.
- 38-08(차트 ○)은 `OwnOrderView.evidenceRec`(구간이면 끝 rec — D-11 「차트 ○ 는 구간 끝 하나」)를 쓰면 된다.
- 메인 트리 `msg-rows.ts` 의 다른 세션 미커밋 변경(스케치 024)과는 `RAIL_NODE` 줄 · `ownRailOf` 본문에서만 겹칠 수 있다 — 파일 끝 덧붙이기는 하지 않았다.

## Self-Check: PASSED
- 파일 존재(새 `tick-own-section.tsx` 포함 6개 확인) · 커밋 `cb422991` · `89e4f2cd` · `27f04121` 이 HEAD 이력에 있음 · `git rev-list --count bee55f47..HEAD` = 3 · 삭제 파일 0.
