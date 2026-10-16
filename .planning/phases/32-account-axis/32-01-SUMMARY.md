---
phase: 32-account-axis
plan: 01
subsystem: ui
tags: [react, nextjs, localStorage, radiogroup, playwright, vitest, me-page]

requires:
  - phase: 16-mypage
    provides: /me 4탭 셸 · StrategyStatusCard · MeStatusBar
  - phase: 29
    provides: RelayAccount.serverKey(표시용 서버키)
provides:
  - D-12 계좌 라벨 한 벌 — accountFullLabelOf · accountChipLabelOf · accountShortLabelOf (lib/account-label.ts)
  - /me 계좌 기억 — ME_ACCOUNT_KEY_PREFIX · readMeAccount · writeMeAccount · meAccountChoicesOf · meAccountOf · MeAccountChoice (lib/trading-layout.ts)
  - MeAccountChips — 탭 위 계좌 칩 radiogroup(roving tabindex · locked/lockedTitle prop)
  - MeTabs 의 고른 계좌 상태(meAccountNo · shownAccountNo 게이트 = accounts.length > 0)
  - StrategyStatusCard accountNo prop · viTriggersOfAccount · strategy-account-empty
  - MeStatusBar accountNo prop(상따 N건 · VI 고른 계좌 기준 · 「계좌 N개」 제거)
  - E2E P32-chips · P32-status
affects: [32-02, 32-03, 32-04, 32-05, 32-06, 32-09, 32-10, 32-13]

actuals:
  tokens: 31000
  tasks: 3
  commits: 4
plan_head_before: 4df49cafeabe84252f22a2dacdd13f2722923b95
plan_head_after: 3058b4b90d2493df666f19320a6ea588da3aab01

tech-stack:
  added: []
  patterns:
    - "/me 계좌 칩: MeTabs 가 상태를 쥐고 각 카드는 accountNo prop 만 받는다(카드는 스스로 계좌를 고르지 않는다)"
    - "기억값은 마운트 뒤 효과에서 읽고(하이드레이션 규약) 기본 선택은 순수 함수(meAccountOf) 효과로 맞춘다 — 작업대 pillAccountOf 와 같은 모양"
    - "accounts[] 미수신 동안 accountNo=undefined 로 내려 종전(전 계좌) 모양 유지"

key-files:
  created:
    - webapp/src/components/me/account-chips.tsx
    - webapp/src/components/me/__tests__/account-chips.test.tsx
    - webapp/src/lib/__tests__/account-label.test.ts
  modified:
    - webapp/src/lib/account-label.ts
    - webapp/src/lib/trading-layout.ts
    - webapp/src/lib/__tests__/trading-layout.test.ts
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "칩 줄 ↔ 탭 줄 12px 는 me-page flex gap 이 준다(MeTabs Fragment 의 두 자식이 형제) — 별도 mb 없음. 계정 카드 mb-1(16) 은 플랜대로 그대로"
  - "칩 scrollIntoView 는 마운트 1회가 아니라 「첫 선택 칩이 생긴 순간 1회」(revealed 래치) — 기본 선택이 부모 효과에서 한 박자 뒤에 정해지기 때문"
  - "/me 끄기 UI 는 전체 모드 코드를 남기지 않고 지움(D-27) — 32-06 은 커밋 8aa49eab 의 strategy-status-card.tsx 를 git show 로 참고해 계좌 모드로만 다시 만든다"
  - "Task 3 문구 보류 — ROADMAP.md 에 다른 세션(Phase 33) 미커밋 변경이 있어 두 파일을 열지 않았다"

patterns-established:
  - "고른 계좌 게이트: accounts.length > 0 && meAccountNo !== '' ? meAccountNo : undefined — 32-02 잔고 · 주문 · 32-09 설정이 같은 값을 받는다"
  - "VI 표시 필터: viTriggersOfAccount(viTriggers, accountNo) — 웨이브 ④ 전 등록 계좌 거래소만(viTriggers 모양 · relay VI 캐시 무변경)"

requirements-completed: [AXIS-03, AXIS-04]

coverage:
  - id: D1
    description: "D-12 계좌 라벨 한 벌(전체 · 칩 · 짧은 라벨) — 빈 칸 생략 · 자르지 않음 · 기존 accountLabelOf 불변"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/account-label.test.ts#P32 계좌 라벨 한 벌 (D-12 · S11)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/me 계좌 기억(gh-radar:me-account:{userId} · { v: 1, accountNo }) · 작업대 키와 독립 · 기본 선택 순서(화면 기억 → 작업대 기억 → 현재 → 첫 칩)"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/trading-layout.test.ts#P32 /me 계좌 기억 (D-20)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-chips"
        status: pass
    human_judgment: false
  - id: D3
    description: "MeAccountChips — radiogroup 「My page 계좌」 · roving tabindex(←/→ 포커스만 · Home/End) · Enter/Space/클릭 선택 · 잠금 · 빈 목록 = 줄 없음 · 부분별 렌더"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/account-chips.test.tsx#P32 MeAccountChips (D-20 · S13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/me 탭 위 칩 → 현황 탭 전략 행이 고른 계좌만 · 새로고침 뒤 기억 유지 · 작업대 키 불변"
    requirement: AXIS-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-chips"
        status: pass
    human_judgment: false
  - id: D5
    description: "현황 탭 = 고른 계좌 — 상태줄 상따 N건 · VI 고른 계좌 기준 · 「계좌 N개」 없음 · VI 행 등록 계좌에만 · 「이 계좌에 등록된 전략 없음」 · 행 2줄째 계좌번호 없음"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx#P32 고른 계좌 (D-21 · S5′)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#P32 MeStatusBar 고른 계좌 (D-21) · 계좌 칩 (D-20)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-status"
        status: pass
    human_judgment: false
  - id: D6
    description: "(D-27) /me 현황에 끄기 UI(kill 줄 · 전체 비활성화 버튼 · 다이얼로그 · 오류 줄) 없음"
    requirement: AXIS-03
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx#P32 끄기 UI 없음 (D-27)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#3. 전략 0 · VI 중지 — 빈 문구 · 끄기 버튼 없음"
        status: pass
    human_judgment: false
  - id: D7
    description: "칩 줄 시각(폰 390 · 칩 면색 · 간격 · 서버키 칩) — 목업 ⑥ B 와의 시각 일치"
    verification:
      - kind: automated_ui
        ref: "playwright:webapp/test-results/me-tabs-390.png (PEY-5)"
        status: pass
    human_judgment: true
    rationale: "스크린샷은 자동으로 찍히지만 목업 대비 시각 판정은 사람 몫(UI 리뷰). 폭 백스톱(계좌 4개 최악값)은 32-10 몫"

duration: 11min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 01: /me 탭 위 계좌 칩 · 현황 탭 고른 계좌 Summary

**/me 계정 카드 아래 계좌 칩 radiogroup(기기별 기억 · 작업대와 독립)을 세우고, 현황 탭의 전략 행 · VI 행 · 상태줄 · 빈 상태가 고른 계좌만 따르게 했으며 /me 「전체 비활성화」 UI 를 지웠다(D-20 · D-21 · D-27)**

## Performance

- **Duration:** 약 11분(벽시계 측정값)
- **Started:** 2026-10-16T04:32:16Z
- **Completed:** 2026-10-16T04:43:37Z
- **Tasks:** 3 (Task 3 은 문구 보류 갈래)
- **Files modified:** 11 (생성 3 · 수정 8)

## Accomplishments
- D-12 라벨 한 벌 `accountFullLabelOf` · `accountChipLabelOf` · `accountShortLabelOf` — 32-03 · 32-04 · 32-05 가 같은 글자를 읽는다
- `MeAccountChips` + `MeTabs` 상태 — 칩 → `writeMeAccount` → `meAccountNo` → `StrategyStatusCard accountNo` · `MeStatusBar accountNo` 한 경로(E2E P32-chips 증명)
- 현황 탭 D-21: 상태줄 「계좌 N개」 제거 · 상따 N건/VI 고른 계좌 기준 · VI 행 등록 계좌 규칙(`viTriggersOfAccount`) · 「이 계좌에 등록된 전략 없음」 · 행 2줄째 = 코드 · 거래소
- D-27: /me 끄기 UI 전부 삭제(relay 무인자 `strategies.disable` 경로 · `#allStopTargets` 무변경 — webapp 소비처만 사라짐)

## Task Commits

1. **Task 1 (tracer): /me 계좌 칩 → 기억 → 현황 전략 행** — `8aa49eab` (feat)
2. **Task 2: 현황 탭 마무리(TDD)** — RED `47061474` (test) → GREEN `3058b4b9` (feat)
3. **Task 3: REQUIREMENTS · ROADMAP 문구** — 커밋 없음(문구 보류)

`commits: 4` 는 `git rev-list --count plan_head_before..HEAD` 측정값이다 — 그 범위에 동시 세션의 `974dc480`(docs(inbox) gh-trade 261016 NXT 인계)이 끼어 있어, 이 플랜의 커밋은 위 3개다.

## Files Created/Modified
- `webapp/src/lib/account-label.ts` — D-12 라벨 3함수 추가(기존 `accountLabelOf` 불변)
- `webapp/src/lib/trading-layout.ts` — 「/me 계좌 칩 (Phase 32 D-20)」 절: 키 · read/write · 목록 합집합 · 기본 선택 규칙
- `webapp/src/components/me/account-chips.tsx` — 신규 `MeAccountChips`
- `webapp/src/components/trading/me-client.tsx` — 머리 주석 ② 재작성 · `MeTabs` 칩 상태 · `MeStatusBar accountNo`
- `webapp/src/components/trading/strategy-status-card.tsx` — `accountNo` 필터 · `viTriggersOfAccount` · 계좌 빈 상태 · 끄기 UI 삭제 · 행 2줄째 계좌번호 삭제
- 테스트: `account-label.test.ts`(신규) · `account-chips.test.tsx`(신규) · `trading-layout.test.ts` · `strategy-status-card.test.tsx` · `me-client.test.tsx` · `e2e/specs/me.spec.ts`

## TDD (Task 2)
- **RED** (`47061474`): 새 단언 10건 실패 — 실패 지점이 전부 계획한 단언이었다(「086520·KRX·37728502101 에 계좌번호 포함」 · 「버튼 1개(전체 비활성화)」 · 「상따 3 · VI 가동 ≠ 상따 2 · VI 가동」 · 상태줄 「계좌」 칸 · 칩 없음). 문법 · 임포트 · 픽스처 오류 0. `accountNo` 없음 회귀 케이스는 의도대로 RED 단계에서도 통과(종전 동작 잠금). 이 플랜은 `type: execute` 라 TAP 분류기(`check tdd-red-evidence`)는 돌리지 않았고 위 의미 판정만 기록한다.
- **GREEN** (`3058b4b9`): 두 파일 49/49 통과.
- **REFACTOR:** 없음.

## Decisions Made
- 칩 줄 아래 간격은 `me-page` gap 12 가 이미 준다 — 플랜의 「칩 줄 아래 mb- 로 12」 는 추가 클래스 없이 충족(스크린샷 확인).
- 칩 `scrollIntoView` 는 첫 선택 칩이 생긴 순간 1회(래치) — 마운트 순간에는 기본 선택이 아직 "" 라 선택 칩이 없다.
- 기존 E2E 케이스 의미 보존: test 2 는 대상 전략(B 의 NXT)을 지키려고 B 칩을 고른 뒤 그 유일한 행을 누른다 · test 8 은 2줄째 판정을 계좌 조각 대신 `strategy-row-meta` 줄로 · test 11 은 기본 칩 A 기준 2행.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] test 11 의 `waitForStrategies(page, 3)` 도 2 로**
- **Found during:** Task 2
- **Issue:** 플랜 Task 2 목록은 1 · 2 · 3 · 4 · 8 만 들었지만 test 11(잔고 행 → /trading)도 전 계좌 3행을 기다려 기본 칩 A(2행)에서 시간 초과가 난다.
- **Fix:** 기본 칩 기준 2행으로(잔고 · 취소 단언은 무변경).
- **Files modified:** webapp/e2e/specs/me.spec.ts
- **Verification:** me.spec 전체 28/28 통과
- **Committed in:** `3058b4b9`

**2. [Rule 3 - Blocking] 쓰지 않게 된 E2E import 제거**
- **Found during:** Task 2 (test 4 삭제)
- **Issue:** `DMA_MSG` · `buildSetVITriggerRespFrame` 이 test 4 전용이라 남기면 미사용 import.
- **Fix:** 두 import 삭제.
- **Committed in:** `3058b4b9`

**3. [Rule 2 - 정합] me-client 단위에 칩 줄 게이트 케이스 추가**
- **Issue:** 플랜 behavior 의 「accountNo undefined → 종전」 은 카드 단위만 다뤘고, `accounts[]` 미수신 동안 칩 줄 · 상태줄 · 카드가 전 계좌인지(플랜 체커 W2 게이트)는 단위로 잠기지 않았다.
- **Fix:** `P32 MeStatusBar 고른 계좌` describe 에 「accounts[] 미수신이면 칩 줄 없음 · 전 계좌」 케이스 추가.
- **Committed in:** `47061474` · `3058b4b9`

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2 · Rule 2 ×1)
**Impact on plan:** 범위 밖 변경 없음 — 모두 이 플랜 변경이 깨뜨리거나 비워 둔 자리를 메웠다.

## Issues Encountered
- **Task 3 — 문구 보류 — 메인 세션이 다른 세션 커밋 뒤 적용(오케스트레이터 보고서 문구).** 가드 `git status --porcelain -- .planning/REQUIREMENTS.md .planning/ROADMAP.md` 가 ` M .planning/ROADMAP.md`(Phase 33 세션 미커밋)를 돌려줘 두 파일을 열지 않았다. 적용할 문구는 32-01-PLAN.md Task 3 `<action>` 1~2 그대로다(AXIS-02~05 · ROADMAP 62줄 · Goal · Depends on · 성공 기준 2~5 · 배포 순서 · Plans 0/14 + 14줄 · 진행 표 0/14).
- STATE.md · ROADMAP.md · state.json 은 이 플랜이 건드리지 않았다(오케스트레이터 몫).

## Verification
- `pnpm --filter @gh-radar/webapp run typecheck` — 통과(tsc + e2e tsconfig)
- eslint(바뀐 9파일) — 경고 · 오류 0
- vitest 5파일 `--maxWorkers=2` — 96/96 통과
- playwright `e2e/specs/me.spec.ts --workers=1` 전체 — 28/28 통과(잔고 · 주문 탭 7 · 9 · 10 · 11 · PEY-* · P25-* 포함 · test 4 는 삭제)
- 수용 기준 grep(Task 1 · 2) 전부 기대값

## Known Stubs
None — 칩 · 필터 · 상태줄 모두 relay 컨텍스트 실값에 물려 있다. 잔고 · 주문 · 설정 탭은 아직 전 계좌(32-02 · 32-09 몫 — 플랜이 정한 범위).

## User Setup Required
None — 외부 서비스 설정 없음.

## Next Phase Readiness
- 32-02: `MeTabs` 의 `shownAccountNo` 를 `AccountPanel` · `TodayOrdersCard` 에 내리고, 오늘 주문 REST 행 계좌를 `meAccountChoicesOf` 의 extra 로 더하면 된다.
- 32-06: 「이 계좌 끄기」 는 `StrategyStatusCard` 카드 맨 아래(현재 비어 있음)에 계좌 모드로 세운다 — 옛 전체 모드 코드는 `git show 8aa49eab:webapp/src/components/trading/strategy-status-card.tsx`.
- 32-09: `MeAccountChips locked` · `lockedTitle="저장 중에는 계좌를 바꿀 수 없어요"` 를 그대로 쓴다.
- 배포: 이 커밋들은 로컬 master 에만 있다(push = 프로덕션 · 오케스트레이터/사용자 결정).

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*
