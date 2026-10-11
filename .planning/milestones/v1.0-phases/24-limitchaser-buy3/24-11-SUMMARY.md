---
phase: 24-limitchaser-buy3
plan: 11
subsystem: webapp-trading
tags: [limit-chaser, buy3, gap-closure, strategy-log, react, vitest]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-05 카드 귀속(handleSent(cfg, { cause }) → strategyLogLine sent · sentCause) · 24-09 배포된 buy3 스키마"
provides:
  - "거부 통지(isLimitChaserSetRejection) 분기에서 pendingRef · pendingCauseRef 즉시 비움"
  - "결과 모름 창(ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS) 만료 타이머 pendingExpiryTimer — 같은 cfg 일 때만 귀속 비움(동일성 가드)"
  - "15:40 · 전부 정지 원인 에코에는 strategyLogLine 에 sent · sentCause 를 넘기지 않음(attributed)"
  - "WR-05 회귀 describe 8케이스(거부 2 · 원인 귀속 1 · 창 만료 · 창 안 늦은 에코 · 동일성 가드 · 재전송 0 · 타이머 정리)"
affects: [24-12, 24-13, 24-15, 24-16]

actuals:
  tokens: 4400
  tasks: 2
  commits: 4
plan_head_before: 601ef1a2d9509eb7b05b0b6a82e9da11257408aa

tech-stack:
  added: []
  patterns:
    - "보낸 제출의 로그 귀속 수명 = 에코 소비 · 거부 · 결과 모름 창 만료 · 삭제 · 키 변경 — 무응답의 끝은 훅 고아 장벽과 같은 수평선(LC_ORPHAN_WAIT_MS)을 import 해 쓴다(값을 다시 적지 않는다)"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx

key-decisions:
  - "무응답 귀속은 3초가 아니라 결과 모름 창(3초 + LC_ORPHAN_WAIT_MS 7초) 만료 때 비운다 — 3초에 비우면 터널 정지로 늦게 닿은 내 에코가 거짓 「다른 단말」 배너를 세운다"
  - "거부는 확정 답이라 즉시 비운다 · 원인(15:40 · 전부 정지) 에코는 로그 귀속만 끊고 다른 단말 배너 판정은 종전 sent 를 유지한다"
  - "만료 타이머는 동일성 가드(pendingRef.current === cfg)로 뒤 제출의 귀속을 건드리지 않으며 아무것도 보내지 않는다(T-16-10)"

patterns-established:
  - "카드 로그 귀속 정리 경로는 ref 두 칸만 비우고 send 를 부르지 않는다 — 테스트가 30초 진행 뒤 send 0 을 단언한다"

requirements-completed: []

coverage:
  - id: D1
    description: "거부된 제출(serverFold 자동 끔 · D-02 전반 동반 끔)의 사유가 다음 무관한 에코에 붙지 않는다"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#WR-05 거부 — serverFold 자동 끔이 거부된 뒤 …"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#WR-05 거부(D-02 전반 동반) — …"
        status: pass
    human_judgment: false
  - id: D2
    description: "15:40 · 전부 정지 원인 에코에는 보낸 cfg · 사유를 귀속하지 않는다 — 원인 문장만 남는다"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#WR-05 원인 귀속 — serverFold 제출 뒤 15:40 귀속 에코 …"
        status: pass
    human_judgment: false
  - id: D3
    description: "무응답 제출의 귀속은 결과 모름 창 동안만 살고(창 안 늦은 내 에코는 내 것) 창이 닫히면 비워진다 · 재전송 0 · 타이머 정리"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#WR-05 창 만료 / 창 안 늦은 에코 / 동일성 가드 / 재전송 0 / 키 변경 · 언마운트 정리"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-09-28
---

# Phase 24 Plan 11: WR-05 거부 · 무응답 제출 사유 귀속 갭 클로징 Summary

**카드 전송↔에코 상관에서 보낸 cfg · 사유의 수명을 「거부 즉시 · 결과 모름 창(3초 + LC_ORPHAN_WAIT_MS) 만료 · 원인 에코 차단」으로 좁혀, 거부 · 무응답으로 끝난 serverFold · 동반 끔 사유가 다른 단말 · 15:40 에코에 「서버가 매수 그룹 해제」로 붙던 오귀속을 없앴다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-09-28T04:17:56Z
- **Completed:** 2026-09-28T04:24Z
- **Tasks:** 2 (tracer 1 + auto 1, 둘 다 tdd)
- **Files modified:** 2

## Accomplishments

- 거부 통지(`isLimitChaserSetRejection`) 분기가 `acceptAnswer()` 와 함께 `pendingRef` · `pendingCauseRef` 를 비운다 — 거부된 제출은 서버에 서지 않았다는 확정 답이다.
- 에코 이펙트가 `const attributed = cause !== null ? null : sent` 로 15:40 · 전부 정지 원인 에코에는 `sent` · `sentCause` 를 넘기지 않는다(옛 hadOrder 규율 복원). 다른 단말 배너 판정은 종전 `sent` 를 그대로 쓴다.
- `handleSent` 가 `pendingExpiryTimer` 를 `ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS` 로 걸고, 만료 때 **같은 cfg 일 때만** 귀속을 비운다. 키 변경 · 언마운트에서 정리한다. `lc.arm` 경로는 타이머를 걸지 않는다.
- WR-05 describe 8케이스 추가 — 거부 2 · 원인 귀속 1 · 창 만료 · 창 안 늦은 에코(배너 0 · 미반영 거둠) · 동일성 가드 · 재전송 0 · 타이머 정리.

## Task Commits

1. **Task 1 (tracer): 거부 분기 pending 비움 · 원인 귀속 에코 sent 차단**
   - RED `992fb901` test(24-11): 거부된 제출 · 15:40 원인 에코의 사유 오귀속 회귀 테스트
   - GREEN `795a72f7` fix(24-11): 거부된 제출의 사유를 즉시 비우고 15:40 · 전부 정지 원인 에코에는 보낸 cfg 를 귀속하지 않는다
2. **Task 2: 결과 모름 창 만료 타이머 · 동일성 가드 · 정리**
   - RED `7ad014ef` test(24-11): 무응답 제출 귀속의 결과 모름 창 만료 · 늦은 내 에코 · 동일성 가드 · 타이머 정리 테스트
   - GREEN `906c1c45` fix(24-11): 무응답 제출의 귀속을 결과 모름 창(3초 + LC_ORPHAN_WAIT_MS) 만료 때 비운다

## TDD 기록

- **Task 1 RED (①):** 새 3케이스가 전부 대상 단언에서 실패 — 거부 뒤 다른 단말 마스터 OFF 의 로그 최상단이 `Expected "매수주문 무장 해제" / Received "서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔"`, 동반 거부 케이스는 `Received "후매수 해제 — 매수주문도 끔"`, 15:40 케이스는 FOLD 문장 존재(`expected true to be false`). 이후 GREEN 109/109(flow + strategy-log).
- **Task 2 RED:** 창 만료 케이스가 같은 FOLD 문장으로 실패 · 타이머 정리 케이스가 만료 타이머 부재로 실패(나머지 3케이스는 현행 동작을 지키는 회귀 가드라 처음부터 통과). GREEN 124/124(flow + card + card-body).
- **REFACTOR:** 없음(변경 불필요).
- `gsd-tools check tdd-red-evidence` 는 node:test TAP 요약(`# tests` · `# pass` · `# fail`)을 요구해 vitest `tap-flat` 출력으로는 `zero_tests_discovered` 를 낸다 — 도구 형식 불일치이며, 실제 RED 는 위 대상 테스트 이름 · 단언 실패로 확인했다(이 플랜은 `type: execute` 라 plan-level TDD 게이트 대상이 아니다).

## Files Created/Modified

- `webapp/src/components/trading/card/strategy-card.tsx` — 거부 분기 pending 비움 · `attributed` 귀속 차단 · `pendingExpiryTimer`(설정 · 키 변경 정리 · 언마운트 정리) · `LC_ORPHAN_WAIT_MS` import · 수명 주석 갱신
- `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx` — describe 「WR-05 — 거부 · 무응답 제출의 사유는 그 사건에만 귀속된다 (24-VERIFICATION 갭 5)」 8케이스 · `LC_ORPHAN_WAIT_MS` import

## Decisions Made

- 무응답 귀속의 끝은 훅 고아 장벽과 같은 결과 모름 수평선(3초 + 7초)으로 잡는다 — 리뷰 제안 「3초 만료 때 비움」을 그대로 쓰면 늦게 닿은 내 에코가 거짓 「다른 단말」 배너를 세운다(플랜 설계 선택 그대로).
- 거부 분기 주석은 판정 규칙 주석 블록 끝으로 옮겨 `if` 본문을 `acceptAnswer()` · 두 비움만으로 짧게 두었다(수용 기준 grep 창 6줄 안에 비움이 서도록).

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `vitest --run strategy-card-flow + strategy-log` → 2 files · 109 passed
- `vitest --run strategy-card-flow + strategy-card + card-body` → 3 files · 124 passed
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` → 0 error TS
- 전체 webapp 테스트 → 125 files · 2695 passed · 1 skipped
- eslint(두 파일) → 0
- 수용 기준 grep: 거부 분기 +6줄 `pendingRef.current = null` 1 · `const attributed = …` 1 · WR-05 describe 1 · `LC_ORPHAN_WAIT_MS` 3 · `pendingRef.current === cfg` 1 · `pendingExpiryTimer` 7

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- webapp 단독 변경(relay 결합 없음) — 배포는 메인 세션 몫. 다음 24-12.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/card/strategy-card.tsx
- FOUND: webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
- FOUND: 992fb901 · 795a72f7 · 7ad014ef · 906c1c45
