---
phase: 18-gh-trade-ui-nxt-vi
plan: 15
subsystem: trading-vi-settings
status: complete
tags: [gap-closure, CR-02, TRADE-08, webapp, vi, account]
gap_closure: true
requires:
  - 18-13
provides:
  - "viRowAccountOf — VI 줄 계좌 판정 유일 지점(등록 계좌가 정본, 미등록·공란이면 상태줄 계좌)"
  - "vi.set.accountNo = 정본 계좌 (「수정」·시작·중지 전부)"
  - "[data-slot=vi-row-account] 불일치 고지(role=status) · viRegisteredAccountText"
  - "시작·중지 확인 요약 맨 앞 「계좌」 = 실제 송신 계좌"
affects:
  - 18-VERIFICATION truth #10 (CR-02) 재검증 근거
  - 18-VERIFICATION human_verification #7 (2계좌 실기 재현은 UAT 로 남음)
tech-stack:
  added: []
  patterns:
    - "등록 전략의 키(계좌)가 정본, 상태줄 선택은 미등록 슬롯의 기본값 — UI-SPEC Q-3 을 VI 줄에 적용"
    - "잠금 대신 정본 송신 + 고지 한 줄 — 끄는 조작(중지)을 막지 않는다"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
key-decisions:
  - "VI 줄은 등록된 전략의 계좌(server.accountNo)가 정본 — 잠금·송신·확인 요약·고지가 viRowAccountOf 한 값을 읽는다 (CR-02, UI-SPEC Q-3 VI 판)"
  - "계좌 불일치여도 줄을 잠그지 않는다 — 잠그면 중지도 막힌다. 정본 계좌로 보내면 옮겨지는 것 자체가 없다"
  - "정본 계좌 이름은 useRelayContext().accounts 로 조회, 없으면 정본=상태줄일 때만 상태줄 이름 prop — 다른 계좌 번호 옆에 상태줄 이름을 붙이지 않는다"
requirements-completed: [TRADE-08]
metrics:
  duration: "4 min"
  started: "2026-09-22T06:47:00Z"
  completed: "2026-09-22T06:55:00Z"
  tasks: 2
  files: 2
estimate:
  tokens: 40000
  tasks: 2
actuals:
  tokens: 4700
  tasks: 2
  commits: 4
plan_head_before: 8b4fd50a7a341476aed2c7923164a7b56cf3ac8d
coverage:
  - deliverable: "등록 계좌 B · 상태줄 A 의 「수정」 페이로드가 B (run 현재값)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#★ 서버 KRX 계좌 B · 상태줄 A → 「수정」 은 B 로 나간다 (run 현재값)"
        status: pass
  - deliverable: "viRowAccountOf 순수 판정 (미조회·미등록·동일·상이·공란)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#CR-02 — 등록 전략의 계좌가 정본 > viRowAccountOf ×4"
        status: pass
  - deliverable: "불일치일 때만 vi-row-account role=status 고지"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#불일치면 그 줄 아래에만 role=status 고지 · 등록 계좌 = 상태줄 계좌면 고지가 DOM 에 없다"
        status: pass
  - deliverable: "시작·중지 확인 요약 「계좌」 = 정본 계좌 · 불일치에도 중지 스위치 열림"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx#서버 계좌 B(중지)/(가동) · 계좌가 같으면 두 요약"
        status: pass
  - deliverable: "기존 VI 왕복 무변경 (e2e)"
    human_judgment: false
    verification:
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench -g VI (41 passed)"
        status: pass
  - deliverable: "2계좌 실기에서 불일치 고지·송신 계좌 확인"
    human_judgment: true
    rationale: "e2e 픽스처는 계좌 1개 — 2계좌 실세션 재현은 18-VERIFICATION human_verification #7 UAT 몫"
---

# Phase 18 Plan 15: VI 줄 계좌 정본 (CR-02) Summary

**등록된 VI 전략의 계좌(`server.accountNo`)를 `viRowAccountOf` 한 곳에서 정본으로 판정해 「수정」·시작·중지 `vi.set` 과 확인 요약에 싣고, 상태줄 계좌와 다르면 줄 아래 `role="status"` 로 「계좌 {번호} · 이름 에 등록된 VI 예요」를 말한다. 줄은 잠그지 않는다.**

## Performance

- **Duration:** 약 4분 (구현) + e2e 1.2분
- **Tasks:** 2 (각 RED → GREEN)
- **Files modified:** 2

## Accomplishments

- `viRowAccountOf(server, statusAccountNo)` export — 객체 ∧ `accountNo` 공란 아님이면 등록 계좌, 아니면 상태줄 계좌. `differs` 는 등록 계좌 ≠ 상태줄 계좌일 때만 참
- `ViSettingsRow` 가 이 값을 한 번 계산해 `locked` · `RelayViSetMsg.accountNo` · 고지 · 확인 다이얼로그가 같은 값을 읽는다 (18-VERIFICATION key link `server.accountNo → vi.set.accountNo` WIRED)
- `viRegisteredAccountText` + `[data-slot="vi-row-account"]` 고지 — 불일치일 때만 그린다, 평상시 D-05 레이아웃은 그대로
- `ViConfirmDialog` 요약 맨 앞 「계좌」 줄을 시작·중지 공통으로 — 이름은 `useRelayContext().accounts` 에서 정본 계좌로 조회
- 머리 주석 ⑨ 「계좌 정본」 — 잠금이 아니라 정본인 이유

## Task Commits

1. **Task 1 [tracer]: 정본 계좌 한 경로 — viRowAccountOf → vi.set.accountNo · 불일치 고지**
   - RED `db0af86` (test) — 수정 전 코드에서 페이로드가 `accountNo:"A-111"` 로 실패, 순수 함수 4건 미정의, 고지 없음(6 failed)
   - GREEN `d09944e` (fix)
2. **Task 2: 시작·중지 확인 요약이 정본 계좌를 말한다 + VI e2e 회귀**
   - RED `09ee8a7` (test) — 시작 요약이 상태줄 계좌, 중지 요약에 「계좌」 없음(3 failed)
   - GREEN `446a1f9` (fix)

## Verification

- `pnpm --filter @gh-radar/webapp test -- vi-settings-rows` — Test Files 92 passed, Tests 1336 passed | 1 skipped (필터가 전 스위트를 돈다 — "No test files" 아님)
- `grep -c viRowAccountOf vi-settings-rows.tsx` = 4
- `pnpm --filter @gh-radar/webapp run typecheck` — error TS 0
- 만원 곱셈 인라인 `grep -nE "\* *10000|\* *10_000"` = 0줄
- `pnpm --filter @gh-radar/webapp run test:e2e -- trading-workbench -g "VI"` — 41 passed (케이스 20~28 VI 포함, spec 무수정)
- 기존 describe 「줄 구성 (D-05)」 「① 줄의 거래소를 실어 보낸다」 「E2 loading · error」 「D-27」 무수정 green

## TDD Gate Compliance

두 태스크 모두 `test(18-15)` RED 커밋이 실패를 확인한 뒤 `fix(18-15)` GREEN 커밋이 따랐다. REFACTOR 변경 없음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 정합] 기존 「계좌가 비어 있으면 잠긴다」 테스트를 정본 계좌 기준으로 보정**
- **Found during:** Task 1 GREEN
- **Issue:** 기존 테스트(describe 「이관 — ⑤ 미조회 · ⑦ 세션 가드」)는 `accountNo=''` 에 등록 전략이 있는 픽스처로 KRX 스위치 잠금을 단언했다. 플랜이 `locked` 의 계좌 판정을 정본 계좌 기준으로 옮기므로(등록 계좌가 있으면 공란이 아님) 이 단언은 새 계약과 충돌한다.
- **Fix:** 의도(「계좌 없는 `vi.set` 을 만들지 않는다」)는 유지하고 픽스처를 둘로 나눴다 — 미등록(null) 줄 + 상태줄 공란 → 잠김, 등록된 가동 줄 → 중지 스위치 열림. 플랜이 「무수정 green」 을 요구한 4개 describe 에는 해당하지 않는다.
- **Files modified:** webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
- **Commit:** d09944e

**2. [테스트 하네스] relay-provider 모킹에 `accounts` 주입 변수 추가**
- 정본 계좌 이름 조회를 검증하려고 `accountsMock`(beforeEach 에서 `[]` 로 초기화)을 더했다. 기존 케이스는 빈 배열 그대로라 동작이 같다.

**Total deviations:** 1 auto-fixed (Rule 1) + 하네스 보강 1. **Impact:** 제품 동작은 플랜 그대로. 상태줄 계좌가 비어 있어도 등록된 줄은 자기 계좌로 조작(특히 중지)할 수 있다 — prohibitions 「중지를 잠그지 않는다」 와 일치.

## Issues Encountered

None.

## Threat Surface

T-18-70/71/72 mitigate 모두 적용 — 등록 전략은 `server.accountNo` 만 송신, 요약 계좌 = 송신 계좌, 불일치 중지 비잠금. 새 네트워크 표면 없음.

## Next Phase Readiness

18-16 이후 갭 클로징 플랜 진행 가능. 2계좌 실기 확인은 UAT(human_verification #7).

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/vi-settings-rows.tsx
- FOUND: webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
- FOUND commits: db0af86, d09944e, 09ee8a7, 446a1f9
