---
phase: 18-gh-trade-ui-nxt-vi
plan: 28
subsystem: webapp
tags: [webapp, vi, account, gap-closure, tdd, GC-WR-04, CR-02]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-15 · 18-23)
    provides: "CR-02 계좌 정본 viRowAccountOf · 불일치 고지(vi-row-account) · ViConfirmDialog 요약 「계좌」 줄"
provides:
  - "viMoveTargetOf(server, 상태줄 계좌) — 등록 ∧ run:false ∧ 상태줄 공란 아님 ∧ 계좌 다름일 때만 {from, to}"
  - "VI_MOVE_STALE_TEXT — 옮기기 창을 연 뒤 상태가 바뀌어 보내지 않았을 때 문구"
  - "「상태줄 계좌({A})로 옮겨 시작」 명시 동작(data-slot=vi-row-move) — 중지 줄의 불일치 고지 옆"
  - "ViConfirmDialog 선택 prop moveFrom — 요약 「계좌」 줄 B → A · data-move"
  - "submit(nextRun, accountOverride?) — 계좌 지정 송신은 가동 중이면 blocked"
  - "viRegisteredAccountText(accountNo, name, run) — 가동/중지 두 갈래 고지"
affects: [18-32 (R3 최종 게이트 — TRADE-08 · 2계좌 UAT 인계)]

actuals:
  tokens: 7200
  tasks: 2
  commits: 4
plan_head_before: e9ed74d6b1d30beac26c3894c16bf5d0b46ea76e

tech-stack:
  added: []
  patterns:
    - "명시 동작은 창을 연 순간의 스냅샷을 잡고, 요약과 송신이 그 한 값을 읽는다. 확정 직전에 같은 판정을 지금 렌더로 다시 계산해 전체 일치일 때만 보낸다"
    - "위험한 예외 경로는 두 겹으로 막는다 — 표면 부재(DOM) + 송신 함수 안의 가드"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx

key-decisions:
  - "VI 계좌 이동은 중지(run:false) ∧ 등록 계좌 ≠ 상태줄 계좌일 때만, 명시 동작 「상태줄 계좌({A})로 옮겨 시작」 하나로 — 확정 = 같은 거래소 슬롯 vi.set{accountNo:A, run:true} 1회. 일반 스위치 시작·「수정」 은 계속 등록 계좌 B (GC-WR-04 · 사용자 결정 2026-09-22)"
  - "옮기기 확정 직전 viMoveTargetOf 를 지금 렌더로 다시 계산해 스냅샷 from·to 와 모두 같을 때만 보낸다. 다르면 전송 0 · 창 안 VI_MOVE_STALE_TEXT · 창 유지 (T-18-118)"
  - "불일치 고지는 run 으로 두 갈래 — 가동: 「가동 중에는 이 계좌로만 나가요 · 옮기려면 먼저 중지하세요」 / 중지: 「수정·시작은 이 계좌로 나가요」"
  - "viRegisteredAccountText 의 run 인자는 필수 — 기본값이 있으면 가동 중 줄이 중지 문구로 조용히 떨어질 수 있다"

patterns-established:
  - "확인 다이얼로그 스냅샷은 onOpenChange(false) · 확정 · 일반 스위치 열기에서 모두 비운다 — 옮기기 창을 취소하고 일반 시작을 열면 이동이 남지 않는다"

requirements-completed: []

duration: 12min
completed: 2026-09-22
---

# Phase 18 Plan 28: 중지 VI 만 상태줄 계좌로 옮겨 시작 (GC-WR-04) Summary

**중지된 VI 줄의 등록 계좌가 상태줄 계좌와 다를 때만 고지 옆에 「상태줄 계좌({A})로 옮겨 시작」 이 붙는다. 누르면 시작 확인 창의 「계좌」 줄에 「B → A」 가 뜨고, 확정하면 `vi.set{accountNo:A, run:true}` 가 한 번 나간다. 가동 중에는 버튼이 없고 `submit` 도 막는다. 창을 연 뒤 상태가 바뀌면 아무것도 보내지 않는다.**

## Performance

- **Duration:** 약 12분
- **Completed:** 2026-09-22
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- `viMoveTargetOf` 판정 · `VI_MOVE_STALE_TEXT` export.
- 옮기기 버튼(`vi-row-move`)은 채택 목업 `18-R3-gap-mockup.html` §① 그대로다.
  - 1-a: 테두리형, 26px · 11px로 「수정」 과 같은 크기 축이다. 채움은 없다.
  - 고지와 버튼은 `vi-row-account-box` 안에 `flex-wrap` · `min-w-0` 으로 놓여, 폭이 좁으면 버튼이 아래 줄로 내려간다.
- `ViConfirmDialog` 에 `moveFrom` 을 더했다(목업 1-c).
  - 「계좌」 줄에서 옛 계좌는 흐린 취소선, 새 계좌는 굵게 쓴다.
  - `data-move="true"` 가 붙는다.
  - 제목 · 경고 · 버튼 · 기본 포커스(취소) · `showCloseButton={false}` 는 일반 시작과 같다.
- 요약과 송신 계좌는 같은 스냅샷(`moveSnapshot`)에서 나온다(T-18-119).
- 확정 직전 재판정이 스냅샷과 어긋나면 창 안에 `vi-confirm-error` 로 사유를 띄우고 창을 닫지 않는다(목업 1-d, GC-WR-06 규율).
- 가동 중 고지는 「옮기려면 먼저 중지하세요」 로 바꿨다(목업 1-b).

## Task Commits

1. **Task 1 RED:** `15058f9` test(18-28): 중지 VI 상태줄 계좌로 옮겨 시작 — 판정 · 요약 B → A · 일반 시작/가동 중은 B 회귀
2. **Task 1 GREEN:** `7c966d9` feat(18-28): viMoveTargetOf · 확인 요약 B → A · 확정 직전 재판정
3. **Task 2 RED:** `428e385` test(18-28): 고지 문구 가동/중지 갈래 · 상태 변화 3종 전송 0 · 가동 중 계좌 B 회귀
4. **Task 2 GREEN:** `f30f831` fix(18-28): VI 불일치 고지를 가동/중지 두 갈래로

## TDD Gate Compliance

**Task 1 RED:** 수정 전 코드에는 `viMoveTargetOf` 와 옮기기 버튼이 없어 `Tests  10 failed | 50 passed (60)` 이었다. 원문 발췌:
- `Error: Unable to fire a "click" event - please provide a DOM element.` (moveButton 부재)
- `received value must be an HTMLElement or an SVGElement.` (disabled 단언 대상 부재)

GREEN 후 `Tests  60 passed (60)`.

**Task 2 RED:** `Tests  2 failed | 64 passed (66)`. 실패한 2건은 고지 문구 두 갈래(가동 / 중지)다.

나머지 4건은 RED 시점에 이미 green 이었다. 상태 변화 3종(다른 단말 시작 · 상태줄 C · 등록 D)과 가동 중 「수정」+중지 계좌 B 케이스다. 플랜 Task 1 action 이 확정 직전 재판정을 Task 1 에 넣으라고 했기 때문이다. Task 2 는 그 동작을 회귀로 고정했다. 이는 의도된 RED 증거가 아니라 고정(regression lock) 테스트다.

GREEN 후 `Tests  66 passed (66)`.

## 검증

- `pnpm --filter @gh-radar/webapp test -- vi-settings-rows trading-workbench`: `Test Files 92 passed (92)` · `Tests 1418 passed | 1 skipped`. 이 스크립트는 `--` 뒤 필터가 먹지 않아 webapp 단위 전량이 돈다.
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`: `error TS` 0.
- `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench -g "VI"`: `45 passed (1.2m)`. `-g` 도 필터가 먹지 않아 trading-workbench 전 45건이 돌았고, 그중 VI 20~28 이 포함된다.
- `grep vi-row-move` 1줄 · `grep "옮기려면 먼저 중지하세요"` 1줄 · `VI_MOVE_STALE_TEXT` 선언 169 · 사용 662.

## 가드 경로 메모 (T-18-117)

- `submit(nextRun, accountOverride)` 는 계좌 지정 송신이 오면 그 순간 `server?.run === true`(또는 지정 계좌 공란)일 때 `'blocked'` 를 돌려준다.
- 테스트는 `accountOverride` 를 직접 줄 수 없다. 「창을 연 뒤 다른 단말이 시작(run:true 에코)」 케이스에서는 확정 직전 재판정(`viMoveTargetOf` → null)이 먼저 막는다. 그래서 `submit` 가드는 이 경로에서 실행되지 않는 **두 번째 겹**이다.
- 두 겹 모두 같은 렌더의 `server.run` 을 읽는다. 재판정이 통과하면 가드도 통과하므로, 가드는 앞으로 재판정이 약해질 때를 대비한 보험이다.
- 플랜이 기대한 「가동 전환 뒤 확정 케이스가 가드까지 함께 지난다」 는 문자 그대로는 성립하지 않는다. 같은 조건에서 앞 겹이 먼저 막기 때문이다.

## Deviations from Plan

### CR-02 describe 수정 1줄 (플랜이 허용한 예외)

- `vi-settings-rows.test.tsx` CR-02 describe 의 「불일치면 그 줄 아래에만 role=status 고지」 케이스는 `viRegisteredAccountText(REGISTERED, '등록계좌')` 를 `viRegisteredAccountText(REGISTERED, '등록계좌', false)` 로 바꿨다.
- `run` 인자를 필수로 만든 결과이고, 문구 계약이 사용자 결정으로 바뀐 것이다. 동작 단언(role · 계좌번호 · NXT 부재)은 그대로다.
- CR-02 describe 안의 다른 삭제 줄은 0이다. 18-15 의 601 케이스(일반 스위치 시작은 B)도 수정 없이 green 이다.

### 경미한 정리 (Rule 1 범주 아님 · 동작 무변)

- `rowAccountName` 계산을 새 `accountNameOf` 하나로 합쳤다. 정본 계좌 이름과 옮기기 양쪽 이름이 같은 규칙을 쓴다.

그 밖에는 플랜대로 실행했다.

## Known Stubs

없음.

## UAT 인계

- e2e 픽스처는 계좌가 1개(`E2E_ACCOUNT_NO`)라 불일치 상태를 만들 수 없다.
- 2계좌 실기 확인(중지 B 줄 → 옮기기 → 서버 61 에코가 A → 고지 · 버튼 사라짐)은 18-32 가 18-VERIFICATION-R2 #7 확장으로 인계받는다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/vi-settings-rows.tsx
- FOUND: webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
- FOUND commits: 15058f9 · 7c966d9 · 428e385 · f30f831 (`git rev-list --count e9ed74d..HEAD` = 4)
