---
phase: 32-account-axis
plan: 13
subsystem: webapp
tags: [webapp, vi, me, sidebar, workbench, d-17, d-18, slot-only, playwright, vitest]

requires:
  - phase: 32-account-axis
    provides: "32-11 relay vi.slot(slot-only) · 웹 viSlots · viSlotOf · 임시 다리 viLegacyOf · fake gateway respondViSlots"
  - phase: 32-account-axis
    provides: "32-12 작업대 VI 설정 행 = 고른 계좌 슬롯(작업대는 이미 단일 칸을 읽지 않음) · E2E 픽스처 seedViSlots"
  - phase: 32-account-axis
    provides: "32-05 사이드바 계좌 묶음(sidebarGroupsOf · ViItem) · 32-04 작업대 pickAccount · 32-06 이 계좌 끄기"
provides:
  - "viSlotsOfAccount(viSlots, accountNo|undefined) → RelayViAccountSlots · viAccountRunning(viSlots, accountNo|undefined) — /me VI 행 · 요약 줄 · 상태줄 · 「이 계좌 끄기」 VI 판정의 한 함수"
  - "/me VI 행 ④ 뒤 늘 한 행(등록 슬롯 없으면 「중지 · —」) · 빈 상태 = 전략 0 ∧ 등록 슬롯 없음(빈 상태 줄 아래 VI 행이 함께 선다)"
  - "sidebarGroupsOf(accounts, chasers, viSlots) — 묶음마다 그 계좌 가동 거래소 태그 · 두 계좌가 같은 거래소를 켜면 두 묶음 모두"
  - "ViItem({ running, accountNo }) — href /trading?account= · 일반 클릭이면 requestTradingAccount(수식 키 클릭은 지금 탭 불변)"
  - "TRADING_ACCOUNT_EVENT · requestTradingAccount · useTradingAccountRequest(trading-focus.ts)"
  - "작업대 ?account= 마운트 1회 소비(계좌 수신 · 배치 복원 뒤 pickAccount) · 계좌 요청 이벤트 수신(목록 밖 계좌는 무시)"
  - "웹 거래소 단일 칸 VI 상태 · 그 타입 · 합집합 헬퍼 · 구 vi 리듀서 갈래 · 32-11 임시 다리 · 32-01 등록 계좌 필터 삭제 — 웹은 vi.slot 만 읽는다"
affects: [32-14]

actuals:
  tokens: 26500
  tasks: 2
  commits: 3
plan_head_before: a4d587119bce202ed1f31369cd785e28de798d17
plan_head_after: 24933fbfc5ef333c99889bc8c99e5c02b04cd046

tech-stack:
  added: []
  patterns:
    - "사이드바 → 작업대 전환 신호 짝: URL 쿼리(마운트 1회 소비) + CustomEvent(이미 그 화면 위일 때) — ?focus= / requestTradingFocus 와 같은 모양으로 ?account= / requestTradingAccount"
    - "쿼리 보류 슬롯은 어떤 pickAccount 든 지운다 — 사용자가 먼저 고른 계좌를 늦게 온 계좌 목록이 덮지 않게"
    - "④ 뒤 빈 상태 판정 = 「VI 행 없음」 이 아니라 「등록 슬롯 없음」(VI 행은 늘 선다)"

key-files:
  created: []
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/trading-focus.ts
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/me.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
    - packages/shared/src/relay.ts

key-decisions:
  - "D-17 = slot-only(오케스트레이터 전달) — 플랜 Flagged assumptions 대로 바뀌는 것 없음: case \"vi\" 0줄 · 웹은 vi.slot 만 읽는다. 32-11 의 임시 다리 viLegacyOf 도 함께 삭제"
  - "viSlotsOfAccount · viAccountRunning 의 accountNo 는 optional(undefined = 계좌 목록 미수신 → 전 계좌 슬롯 · 거래소마다 켜진 등록본 우선) — 플랜 「accountNo undefined 면 전 계좌 슬롯 기준」 을 한 함수에 담았다"
  - "작업대 ?account= 는 계좌가 accounts[] 에 들어오고 배치 복원(저장 계좌 읽기)이 끝난 뒤 소비한다 — 복원 전에 바꾸면 복원이 저장값으로 되돌린다. 계좌가 아직 없으면 보류하고, 그 사이 어떤 pickAccount 든 보류를 지운다"
  - "useTradingAccountRequest 핸들러는 shouldSwitchTo 를 거친다 — 목록 밖 계좌로는 바꾸지 않는다(셀렉트에 옵션이 없어 화면 계좌와 스코프가 갈린다)"
  - "ViItem href 는 encodeURIComponent(accountNo) — 계좌번호는 숫자라 결과는 같고, 쿼리 조립 규율은 ?focus= 와 맞춘다"
  - "shared RelayViTriggerMsg 는 지우지 않고 주석만 갱신 — 지우면 relay 테스트 4곳(「vi 프레임이 나가지 않는다」 단언)이 깨져 이 플랜 범위를 넘는다"

patterns-established:
  - "VI 슬롯 테스트 픽스처: viSlotsOf(...cfgs) → Map(`${accountNo}|${exchange}` → cfg) · 미등록은 null 값 엔트리"

requirements-completed: [AXIS-01, AXIS-03]

coverage:
  - id: D1
    description: "트레이서 — /me 고른 계좌 VI 행 · 요약 · 상태줄이 계좌 슬롯 기준(A KRX 가동 → 가동 · A 값 / B 미등록 → 「중지 · —」 / B NXT 61 → B 만 가동)"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx#StrategyStatusCard — P32 VI 슬롯 표면 (D-18) (5 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#P32 VI 슬롯 표면 (D-18) (2 passed)"
        status: pass
      - kind: e2e
        ref: "playwright me.spec.ts -g \"P32-vi-me\" --workers=1"
        status: pass
    human_judgment: false
  - id: D2
    description: "사이드바 VI 줄 = 각 계좌 묶음 안 그 계좌 가동 거래소 태그(같은 KRX 를 두 계좌가 켜면 두 묶음 모두 · 가동 없으면 줄 없음)"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#P32 VI 슬롯 표면 (D-18) — 사이드바 (3 passed)"
        status: pass
      - kind: e2e
        ref: "playwright sidebar-tree.spec.ts -g \"P32-sidebar-vi\" --workers=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "사이드바 VI 줄 클릭 → /trading?account=<번호> · 작업대 계좌 전환(이미 /trading 위 = 이벤트 · 다른 화면 = 마운트 1회 소비 · 저장값도 그 계좌) · 수식 키 클릭은 지금 탭 불변"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#P32 VI 슬롯 표면 (D-18) — 사이드바 VI 줄 → 작업대 계좌 (3 passed)"
        status: pass
      - kind: e2e
        ref: "playwright sidebar-tree.spec.ts -g \"P32-sidebar-vi\" (클릭 → URL ?account= · 셀렉트 값 전환 · /me 에서 클릭 → 마운트 소비)"
        status: pass
    human_judgment: false
  - id: D4
    description: "웹 거래소 단일 칸 VI 상태 · 구 vi 리듀서 갈래 · 합집합 헬퍼 · 32-11 다리 · 32-01 등록 계좌 필터 제거 — 구 vi 프레임은 무시, 컨텍스트에 단일 칸 없음"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#P32 viSlots 리듀서 (D-17 · vi.slot) > 구 vi 프레임(거래소 단일 칸)은 상태를 바꾸지 않는다 · 상태에 거래소 단일 칸이 없다 — 웹은 vi.slot 만 읽는다(32-13)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑥-b · ⑥-b2 · ⑧ (진단 대역 viSlotOf · vi-legacy absent)"
        status: pass
      - kind: other
        ref: "grep -rn \"viAnyRunning\\|RelayViTriggers\\|viTriggersOfAccount\\|relay\\.viTriggers\" webapp/src → 0줄 · grep -c 'case \"vi\":' use-relay-socket.ts → 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "회귀 — 작업대 · /me · 사이드바 · 접근성 · 주문 로그 · 미체결 진행 · 종목상세 탭 · 계좌 축 백스톱 E2E"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "playwright trading-workbench · me · sidebar-tree · a11y --workers=1 — 139 passed · 1 failed(P31-3 기존 deferred) · 3 did not run(serial) → 「터치 기기 시트」 재실행 4/4"
        status: pass
      - kind: e2e
        ref: "playwright order-log · unfilled-progress · stock-detail-tabs · account-axis-backstop --workers=1 — 39 passed"
        status: pass
      - kind: unit
        ref: "relay vitest 1617/1617 · webapp vitest 4299 passed · 1 skipped(기존)"
        status: pass
    human_judgment: false
  - id: D6
    description: "라이브 — 실 gh-trade 서버(Phase 33) · 교보119 다계좌에서 /me · 사이드바 VI 줄이 계좌별로 서고 클릭이 작업대 계좌를 바꾸는지"
    requirement: AXIS-03
    verification: []
    human_judgment: true
    rationale: "relay 배포 + webapp push 뒤에만 볼 수 있다(32-14 메인 세션 · D-18 교보119 UAT). 단위 · E2E 는 스텁 게이트웨이만 본다"

duration: 22min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 13: 웨이브 ④ /me · 사이드바 · 상태줄 VI = 계좌 슬롯 · 웹 거래소 단일 칸 VI 상태 제거 Summary

**/me VI 행 · 요약 줄 · 상태줄 · 「이 계좌 끄기」 판정이 고른 계좌의 (계좌, 거래소) 슬롯을 읽는다. 사이드바 VI 줄은 각 계좌 묶음 안에 그 계좌의 가동 거래소로 서고, 누르면 `/trading?account=` 로 가서 작업대 계좌를 그 계좌로 바꾼다. 웹의 거래소 단일 칸 VI 상태와 32-11 임시 다리는 지웠다 — 웹은 `vi.slot` 만 읽는다.**

## D-17 결정 반영

- 오케스트레이터가 전달한 결정은 **slot-only** 다. 플랜 Flagged assumptions 대로 이 플랜에서 바뀌는 것은 없다.
  - acceptance 의 `case "vi":` 0줄과 「웹은 `vi.slot` 만 읽는다」 가 그대로 성립한다.
- 32-11 이 넣은 임시 다리 `viLegacyOf` 도 단일 칸 상태와 함께 지웠다.

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-16T09:21:29Z
- **Completed:** 2026-10-16T09:44:11Z
- **Tasks:** 2 (1 트레이서 · 2 TDD)
- **Files modified:** 17

## Accomplishments

- **슬롯 헬퍼:** `viSlotsOfAccount` 와 `viAccountRunning` 을 `viSlotOf` 옆에 두었다. `accountNo` 가 undefined 이면(계좌 목록 미수신) 전 계좌 슬롯을 기준으로 한다.
- **/me 현황 카드 · 상태줄**
  - VI 행은 ④ 뒤 늘 한 행 선다. 등록 슬롯이 없으면 「중지 · —」 다.
  - 요약은 고른 계좌의 거래소별 값만 말한다. 같은 KRX 를 A · B 가 켜도 서로 덮지 않는다.
  - 빈 상태 조건은 「전략 0 ∧ 등록 슬롯 없음」 이다. 이때 빈 상태 한 줄 아래에 VI 행 「중지」 가 함께 선다.
  - 「이 계좌 끄기」 의 VI 판정과 `MeStatusBar` VI 는 `viAccountRunning` 한 함수를 쓴다.
- **사이드바:** `sidebarGroupsOf(accounts, chasers, viSlots)` 가 슬롯 중 가동인 것을 그 계좌 묶음에 KRX → NXT 순으로 둔다. 교보 세션 계좌도 같은 규칙이다.
- **사이드바 VI 줄 클릭**
  - `ViItem` 에 `accountNo` 를 더했다. 링크는 `/trading?account=<번호>` 다.
  - 일반 클릭이면 `requestTradingAccount` 를 쏜다. 수식 키 클릭은 지금 탭을 건드리지 않는다.
- **작업대**
  - `?account=` 를 마운트 1회만 소비한다. 계좌가 `accounts[]` 에 들어오고 배치 복원이 끝난 뒤 `pickAccount` 하므로 저장값도 그 계좌가 된다.
  - 이미 `/trading` 위이면 `useTradingAccountRequest` 가 계좌를 바꾼다. 목록 밖 계좌로는 바꾸지 않는다.
- **단일 칸 제거**
  - `use-relay-socket` 의 상태 · 기본값 · 컨텍스트 값에서 거래소 단일 칸 VI 와 그 타입, 합집합 헬퍼, 구 `vi` 리듀서 갈래, 32-11 다리를 지웠다.
  - `vi.slot` 갈래는 이제 슬롯만 쓴다. 구 `vi` 프레임은 default 로 무시된다.
  - `relay-provider` 기본값을 맞췄고, `strategy-status-card` 의 32-01 등록 계좌 필터를 지웠다.

## Task Commits

1. **Task 1 (tracer): /me · 사이드바 · 상태줄 VI 를 고른 계좌 슬롯으로** — `6b8c93a9` (feat)
   - 트레이서 게이트에서 `<verify>` 를 다시 돌렸다. typecheck 0 · vitest 301/301 이었고, E2E `P32-vi-me` · `P32-sidebar-vi` 는 커밋 직전 통과했다.
   - `⚡ Tracer verified end-to-end — expanding`
2. **Task 2 (TDD): 웹 거래소 단일 칸 VI 상태 제거**
   - RED `20025ade` (test) — 대상 3건이 모두 의도한 단언에서 실패했다.
   - GREEN `24933fbf` (feat) — REFACTOR 는 변경이 없어 커밋하지 않았다.

## TDD Gate Compliance (Task 2)

- **RED:** `test(32-13)` `20025ade`
  - 증거 명령: `pnpm exec vitest run src/lib/__tests__/relay-socket.test.ts --maxWorkers=2 -t "구 vi 프레임" --reporter=junit`(cwd webapp)
  - 대상 테스트: 「P32 viSlots 리듀서 (D-17 · vi.slot) > 구 vi 프레임(거래소 단일 칸)은 상태를 바꾸지 않는다 · 상태에 거래소 단일 칸이 없다 — 웹은 vi.slot 만 읽는다(32-13)」
  - `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK` (target_test_failed · junit · tests 154 · fail 1)
  - **의미 평가:** 대상 테스트는 실제로 실행됐다. 계획한 단언 `'viTriggers' in state === false` 에서 `expected true to be false` 로 실패했다. 상태에 단일 칸이 아직 있었다는 뜻이다.
  - 같은 RED 실행의 relay-provider 두 건(⑥-b2 · ⑧)도 계획한 단언 `vi-legacy` = `absent` 에서 `present` 로 실패했다.
  - 수집 · 구문 · 픽스처 오류는 없었다.
- **GREEN:** `feat(32-13)` `24933fbf`
  - webapp typecheck 0
  - `vitest run src/lib src/components/trading src/components/layout` 3323 passed · 1 skipped(기존)

## Files Created/Modified

- `webapp/src/lib/use-relay-socket.ts` — `RelayViAccountSlots` · `viSlotsOfAccount` · `viAccountRunning` 추가 · 단일 칸 상태 · 타입 · 헬퍼 · `case "vi"` · 다리 삭제 · `vi.slot` 갈래 단순화
- `webapp/src/lib/relay-provider.tsx` — 기본값에서 단일 칸 제거
- `webapp/src/lib/trading-focus.ts` — `TRADING_ACCOUNT_EVENT` · `requestTradingAccount` · `useTradingAccountRequest`
- `webapp/src/components/trading/strategy-status-card.tsx` — 슬롯 판정 · VI 행 늘 섬 · 빈 상태 = 등록 슬롯 없음 · 등록 계좌 필터 삭제
- `webapp/src/components/trading/me-client.tsx` — `MeStatusBar` VI = `viAccountRunning`
- `webapp/src/components/layout/app-sidebar.tsx` — `sidebarGroupsOf(…, viSlots)` · `ViItem` accountNo · 클릭 요청
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `?account=` 소비 · 계좌 요청 수신 · 머리 주석 ⑥-c
- 테스트:
  - `relay-socket` · `relay-provider` (RED/GREEN)
  - `strategy-status-card` · `me-client` · `app-sidebar` · `trading-workbench` — 「P32 VI 슬롯 표면 (D-18)」 13건과 기존 VI 픽스처의 슬롯 이행
  - `vi-settings-rows` — 래퍼 타입 · prop 이름
- E2E:
  - `me.spec.ts` — `P32-vi-me` 신규 · `P32-status` 와 「3. 전략 0 · VI 중지」 단언을 ④ 뒤 규칙으로 바꿨다
  - `sidebar-tree.spec.ts` — `P32-sidebar-vi` 를 슬롯 모드와 클릭 전환으로 다시 썼다 · 1b href 를 `?account=` 로 바꿨다
- `packages/shared/src/relay.ts` — `RelayViTriggerMsg` 주석 갱신(코드 변경 없음)

## Decisions Made

frontmatter `key-decisions` 와 같다. 요점은 다섯 가지다.

- slot-only 라 변경이 없고, 다리도 함께 지웠다.
- `accountNo` 가 optional 이면 전 계좌 슬롯이다.
- `?account=` 는 복원 뒤에 소비하고, 어떤 `pickAccount` 든 보류를 지운다.
- 목록 밖 계좌로는 전환하지 않는다.
- shared 타입은 남기고 주석만 고쳤다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 기존 VI E2E 단언 이행 — me.spec 「P32-status」 · 「3. 전략 0 · VI 중지」 · sidebar-tree 「1b」**
- **Found during:** Task 1
- **Issue:** ④ 뒤 규칙(/me VI 행 늘 섬 · VI 줄 href `?account=`)이 종전 단언과 어긋났다. 종전 단언은 B 칩에 VI 행이 0 이고, 전략 0 이면 VI 행이 0 이며, href 가 `/trading` 이라고 봤다.
- **Fix:** 단언을 S12 empty 와 S3 규칙으로 바꿨다. 테스트 의도(고른 계좌 기준 · 빈 상태 문구)는 그대로다.
- **Committed in:** `6b8c93a9`

**2. [Rule 3 - Blocking] `vi-settings-rows.test.tsx` 의 삭제 타입 참조 — 플랜 파일 목록 밖**
- **Found during:** Task 2 (typecheck)
- **Issue:** 32-12 테스트 래퍼가 지운 타입을 import 했다.
- **Fix:** `RelayViAccountSlots`(같은 모양)로 바꿨다. 래퍼 prop 이름도 슬롯 축(`accountSlots`)으로 바꿨다.
- **Committed in:** `24933fbf`

**3. [Rule 2 - 계약 일관] shared `RelayViTriggerMsg` 주석 — 플랜 파일 목록 밖**
- 기존 주석은 「32-13 이 지운다 · 웹 갈래가 남은 동안만」 이라 이제 사실과 다르다. 사실(relay 미송출 · 웹 미수신 · relay 테스트 부재 단언용)로 고쳤다.
- 타입 자체를 지우는 것도 시도했다. 그러면 relay 테스트 4곳의 `"vi"` 리터럴 단언이 타입 오류가 나서 되돌렸다.
- **Committed in:** `24933fbf`

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2 · Rule 2 ×1)
**Impact on plan:** 범위와 와이어 계약은 늘지 않았다.

## Issues Encountered

- 4 spec E2E 회귀에서 P31-3(「777주」 ≠ 「비교가격 필요」) 1건이 실패했다. `deferred-items.md` 32-03 · 32-10 에 있는 기존 결함이고 32 범위 밖이다.
  - 그 뒤 serial 3건은 실행되지 않았다. `-g "터치 기기 시트" --grep-invert "P31-3"` 로 다시 돌려 4/4(setup 포함) 통과했다.

## Known Stubs

없음.

## User Setup Required

None. 배포 순서(relay → gh-trade → webapp push 연달아)는 32-14 에서 메인 세션이 한다.

## Next Phase Readiness

- 32-14
  - 라이브 실증(D6)이 남았다. 교보119 · 다계좌에서 /me 와 사이드바 VI 줄이 계좌별로 서는지, 클릭하면 작업대 계좌가 바뀌는지 확인한다.
  - 32-11 이 남긴 sweeper n 프레임 결함(deferred-items)을 같은 배포에 묶을지 판단한다.
- 웹의 VI 읽기 경로는 이제 `viSlots` 하나다. 새로고침하지 않은 구 탭은 relay 배포부터 push 사이에 VI 가 「모름」 으로 보인다(32-11 사용자 결정 그대로).

## Self-Check: PASSED

- 파일: 수정 파일 17개가 디스크에 있다. 새로 만든 파일은 없다.
- 커밋: `6b8c93a9` · `20025ade` · `24933fbf` 가 HEAD 의 조상이다.
- Task 1 acceptance
  - `export function requestTradingAccount(` 1줄 · app-sidebar `requestTradingAccount(` 1줄 · workbench `useTradingAccountRequest(` 1줄 · status-card `viAccountRunning(` 1줄
  - vitest FAIL 0 · 「P32 VI 슬롯 표면」 13 passed · E2E `P32-vi-me` · `P32-sidebar-vi` failed 0
- Task 2 acceptance
  - `grep -rn "viAnyRunning\|RelayViTriggers\|viTriggersOfAccount\|relay\.viTriggers" webapp/src` 0줄 · `case "vi":` 0
  - typecheck exit 0 · vitest FAIL 0 · E2E 4 spec 은 P31-3(기존 deferred)만 실패
- Plan verification
  - shared build · relay typecheck · typecheck:tests · webapp typecheck 모두 error 0
  - relay 1617/1617 · webapp 4299 passed · 1 skipped(기존)
  - E2E 8 spec: 139 + 39 passed · P31-3 만 실패(기존 deferred)
