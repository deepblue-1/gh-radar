---
phase: 32-account-axis
plan: 02
subsystem: ui
tags: [react, nextjs, playwright, vitest, me-page, account-axis]

requires:
  - phase: 32-account-axis
    provides: "32-01 — MeAccountChips · MeTabs 고른 계좌 상태(meAccountNo · shownAccountNo 게이트) · meAccountChoicesOf"
  - phase: 19
    provides: "TodayOrdersCard 저널 병합(복원 ∪ journal.rows) · mergeOrderNotices"
provides:
  - "TodayOrdersCard accountNo(고른 계좌 평탄 필터) · onRowAccountsChange(병합 행 계좌 집합 · 바뀔 때만)"
  - "today-orders-empty-account(「이 계좌의 오늘 주문이 없어요」 + 다른 계좌 N건 안내) · today-orders-flat 평탄 목록 컨테이너"
  - "AccountPanel hideAccountHeader — 계좌 전용 모드 머리 줄 생략(종목 축 무시)"
  - "/me 잔고 탭 = 고른 계좌 me-account-card 한 벌 · 「잔고 N」 = 고른 계좌 미체결 · 「주문 N」 = 고른 계좌 오늘 주문"
  - "/me 칩 목록 = accounts[] ∪ 전략 · 푸시 행 · 오늘 주문 복원 행 계좌(목록 밖 계좌 맨 뒤 — Pitfall 10)"
  - "E2E P32-orders · P32-balance · waitForAccountCard · rowsOfAccount/linesOfAccount 픽스처 헬퍼"
affects: [32-03, 32-09, 32-10]

actuals:
  tokens: 20300
  tasks: 3
  commits: 3
plan_head_before: 4aa1427ef0b00adc8ce34ef63f05d775eddb5ca0
plan_head_after: edde16326024a27179a69e8b3e3e7aeef2977dae

tech-stack:
  added: []
  patterns:
    - "카드는 계좌를 고르지 않고 prop 으로 받는다 — 표시 필터만 하고 조회 경로는 그대로(칩 전환 = 재조회 0)"
    - "자식 → 부모 집합 신호는 키 문자열 + 마지막 전송 ref 로 「바뀔 때만」(렌더마다 콜백 금지 · 빈 첫 집합 생략)"
    - "잔고 탭 · 잔고 라벨 · 주문 탭이 같은 게이트(shownAccountNo)를 읽는다 — 화면과 라벨이 어긋나지 않게"

key-files:
  created:
    - .planning/phases/32-account-axis/deferred-items.md
  modified:
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/src/lib/orders-api.ts
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "주문 탭 accountNo 는 플랜 문구(meAccountNo === '' ? undefined : meAccountNo) 대신 32-01 게이트 shownAccountNo 를 내린다 — accounts[] 미수신 동안 행 계좌만으로 정해진 칩으로 거르지 않게(칩 줄이 없는데 필터만 걸리는 상태 방지)"
  - "잔고 탭은 shownAccountNo 가 없으면 로딩 — 계좌 목록은 왔지만 기본 칩이 효과로 정해지기 전 한 박자에 빈 패널(「미체결 없음」)을 비추지 않는다. 잔고 라벨도 같은 게이트"
  - "onRowAccountsChange 는 처음 빈 집합을 올리지 않는다(부모 초기값과 같다) — 마지막 전송 키 ref 로 「바뀔 때만」"
  - "Task 3 웨이브 ① push = defer(32-10 에서 ②③ 와 함께) — 오케스트레이터 사전 결정 · executor 는 push 하지 않음"

patterns-established:
  - "고른 계좌 카드 대기(E2E): waitForAccountCard(page, accountNo) — 카드 1벌 + data-account-no"
  - "계좌별 화면 줄 수는 픽스처에서 센다(linesOfAccount) — 하드코딩 금지, 합이 TODAY_ORDER_LINES 와 맞는지 test 9 가 잠근다"

requirements-completed: [AXIS-04]

coverage:
  - id: D1
    description: "(트레이서 · D-23) 주문 탭 = 고른 계좌 평탄 목록 · 머리 「N건」 · 탭 「주문 N」 = 고른 계좌 건수 · B 칩 → B 행만"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#P32 고른 계좌 평탄 목록 (D-23)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-orders"
        status: pass
    human_judgment: false
  - id: D2
    description: "(D-23) 고른 계좌 0건 ∧ 다른 계좌 ≥ 1건 → 「이 계좌의 오늘 주문이 없어요」 + 「다른 계좌에 오늘 주문 N건이 있어요 · 위에서 계좌를 바꿔 보세요」 · 전 계좌 0건 → 종전 문구"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#P32 고른 계좌 평탄 목록 (D-23)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-orders"
        status: pass
    human_judgment: false
  - id: D3
    description: "(Pitfall 10 · D-20) 오늘 주문 복원 행에만 있는 계좌가 칩 목록 맨 뒤에 번호만으로 서고 고르면 그 행이 보인다"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#onRowAccountsChange — 목록 밖 계좌까지 처음 본 순으로 한 번만"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-orders"
        status: pass
    human_judgment: false
  - id: D4
    description: "(D-22) 잔고 탭 = 고른 계좌 AccountPanel 한 벌 · 머리 줄 없음 · 세로 반복 없음 · 「잔고 N」 = 고른 계좌 미체결 · 목록 밖 계좌 = 기존 빈 문구 · 계좌 0 = 로딩"
    requirement: AXIS-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/account-panel.test.tsx#P32 hideAccountHeader (D-22 · S7′)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx#B4 · B4b"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-balance"
        status: pass
    human_judgment: false
  - id: D5
    description: "(D-23) 표(≥1280) · 카드 목록(<1280) · 묶음 펼침 · 출처 칩 · NXT 태그 · 390 줄바꿈 불변 — 기존 me.spec 를 새 구조로 갱신해 전부 통과"
    requirement: AXIS-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts (전체 30/30 · test 1 · 7 · 8 · 9 · 10 · 11 · P25-E1~E7 · PEY-1~5)"
        status: pass
    human_judgment: false
  - id: D6
    description: "S13 populated 시각(선택 칩 --seg-on-bg · 네 탭이 그 계좌) — 목업 대비 시각 판정"
    verification:
      - kind: automated_ui
        ref: "playwright:webapp/test-results/me-tabs-390.png (PEY-5)"
        status: pass
    human_judgment: true
    rationale: "스크린샷은 자동으로 찍히지만 목업 대비 시각 판정은 사람 몫(UI 리뷰)"

duration: 13min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 02: 주문 · 잔고 탭도 칩을 따른다 Summary

**/me 주문 탭을 고른 계좌의 평탄 목록(그룹 소제목 제거 · 다른 계좌 안내 빈 상태 · 목록 밖 계좌는 칩으로 회수)으로, 잔고 탭을 고른 계좌 `AccountPanel` 한 벌(머리 줄 생략)로 바꾸고 두 탭 라벨 숫자를 고른 계좌 건수로 맞췄다(D-22 · D-23). 웨이브 ① push 는 defer.**

## Performance

- **Duration:** 약 13분(벽시계 측정값)
- **Started:** 2026-10-16T04:46:38Z
- **Completed:** 2026-10-16T04:59:56Z
- **Tasks:** 3 (Task 3 = 결정 갈래 · 커밋 없음)
- **Files modified:** 8 (+ deferred-items.md 생성)

## Accomplishments
- `TodayOrdersCard accountNo` — 고른 계좌 행만 평탄하게(표 · 카드 행 · 묶음 펼침 그대로), 「N건」 · `onCountChange` 는 고른 계좌 건수, 0건 ∧ 다른 계좌 있음이면 `today-orders-empty-account`
- `onRowAccountsChange` → `MeTabs rowAccounts` → `meAccountChoicesOf` extra — 복원 행에만 있는 계좌도 칩으로 선다(Pitfall 10 · E2E 로 칩 → 그 행 확인)
- 계좌 묶음 함수(orders-api)와 그룹 소제목 DOM 삭제(소비처 0)
- `AccountPanel hideAccountHeader` — 계좌 전용 모드에서만 머리 줄 생략, 다른 3표면은 prop 미전달이라 DOM 불변
- /me 잔고 탭: 세로 반복 → 고른 계좌 한 벌 · 「잔고 N」 = 고른 계좌 `unf.length`
- me.spec: `waitForAccountCard` · `rowsOfAccount`/`linesOfAccount` 헬퍼 · test 1 · 7 · 8 · 9 · 10 · 11 · PEY-2 새 구조 · P32-orders · P32-balance 신규

## Task Commits

1. **Task 1 (tracer): 주문 탭 = 고른 계좌 평탄 목록** — `9c51bb98` (feat) · 트레이서 게이트: `<verify>`(vitest 66/66 · P32-orders 1 passed) 재실행 통과 → 확장
2. **Task 2: 잔고 탭 = 고른 계좌 한 벌(TDD)** — RED `85bbb343` (test) → GREEN `edde1632` (feat)
3. **Task 3: 웨이브 ① 단독 push 여부** — **결정: defer**(커밋 없음 · 아래)

`commits: 3` 는 `git rev-list --count plan_head_before..HEAD` 측정값이다(SUMMARY 커밋 전).

## Task 3 결정 — defer
- 오케스트레이터 사전 결정 `user_response = "defer"`(플랜 `auto_select`). 지금 push 하면 동시 세션(Phase 33) 커밋이 함께 프로덕션으로 나가고, 사용자가 프로덕션 배포를 승인하지 않았다.
- executor 는 push 하지 않았다. 웨이브 ① 은 32-10 에서 ②③ 와 함께 push(메인 세션 · 직전 `git status -sb` · `git log origin/master..HEAD` 확인 · relay 먼저 규칙).

## TDD (Task 2)
- **RED** (`85bbb343`): 새 단언 4건 실패 — 실패 지점이 전부 계획한 단언이었다(me-client B4 「카드 [A, B] ≠ [A]」 세로 반복 · B4b 「[A] ≠ [목록 밖 Z]」 · account-panel 「머리 `account-panel-account-no` 가 null 이 아님」 ×2). 문법 · 임포트 · 픽스처 오류 0, 「prop 없음 회귀」 · 「종목 축 무시」 케이스는 의도대로 RED 에서도 통과(종전 동작 잠금). 플랜 `type: execute` 라 TAP 분류기(`check tdd-red-evidence`)는 돌리지 않았고 위 의미 판정만 기록한다(32-01 과 같은 처리).
- **GREEN** (`edde1632`): 3파일 168/168 · me.spec 30/30.
- **REFACTOR:** 없음.

## Decisions Made
- 주문 탭에 `shownAccountNo`(32-01 게이트)를 내림 — 플랜 문구 `meAccountNo === "" ? undefined : meAccountNo` 와 달리 `accounts[]` 미수신 동안에도 거르지 않는다(칩 줄이 없는데 행 계좌로 정해진 기본값으로 거르는 상태 방지).
- 잔고 탭 · 잔고 라벨 게이트도 `shownAccountNo` — 기본 칩이 효과로 정해지기 전 한 박자에 빈 패널을 비추지 않는다(로딩 문구 유지).
- E2E test 7 · 8 은 B 칩을 골라 B 카드로 잰다 — 플랜 문구는 「A 카드 기준」 이지만 그 두 케이스의 존재 이유가 B 의 스트레스 데이터(긴 종목명 · 7자리 가격)라, A 로 바꾸면 잘림 단언이 헛돈다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 잔고 탭 기본 칩 결정 전 빈 패널 한 박자**
- **Found during:** Task 2
- **Issue:** 플랜 그대로 `accounts.length === 0` 만 로딩으로 두면, 계좌 목록 도착 직후 `meAccountNo === ""` 인 렌더 한 번에 `selectedAccountNo=""` 패널이 「미체결 주문이 없어요」 를 비춘다.
- **Fix:** 로딩 게이트와 잔고 라벨 게이트를 `shownAccountNo === undefined` 로.
- **Files modified:** webapp/src/components/trading/me-client.tsx
- **Verification:** me-client B4(계좌 0 = 로딩) · me.spec 30/30
- **Committed in:** `edde1632`

**2. [Rule 2 - 정합] 주문 탭 accountNo 게이트를 32-01 `shownAccountNo` 로 통일**
- **Found during:** Task 1
- **Issue:** 플랜 문구대로면 `accounts[]` 미수신 동안 전략 · 푸시 행 계좌로 정해진 `meAccountNo` 로 걸러, 칩 줄 없이 목록만 줄어든다(현황 탭과 게이트가 갈림).
- **Fix:** `accountNo={shownAccountNo}`.
- **Committed in:** `9c51bb98`

**3. [Rule 3 - Blocking] 기존 단위 · E2E 케이스의 그룹 단언 정리**
- **Found during:** Task 1 · 2
- **Issue:** today-orders-card ⑪-1 · ⑪-2 · ⑪-6 · ⑫-1 과 me.spec test 1 · 7 · 8 · 9 · 10 · 11 · PEY-2 가 그룹 · 세로 반복 · 전 계좌 합을 단언했다.
- **Fix:** ⑪-1 = 평탄 목록 하나 · ⑪-2(행 없는 계좌 묶음 없음 — 개념 소멸)는 ⑪-1 로 흡수 · ⑪-6 = 고른 계좌의 조각만 접힘 · ⑫-1 = 평탄 컨테이너 비흐림. E2E 는 고른 계좌 기준 · B 의 행은 B 칩을 골라 같은 단언(출처 미상 · VI · 긴 종목명 잘림 0).
- **Committed in:** `9c51bb98` · `edde1632`

**4. [Rule 2 - 정합] 라벨 구분력 · 목록 밖 경로 테스트 보강**
- **Issue:** 픽스처 A · B 미체결이 각 1건이라 「잔고 N = 고른 계좌」 와 「합」 이 E2E 에서 갈리지 않는다. 목록 밖 계좌 잔고 경로도 단위로 잠기지 않았다.
- **Fix:** P32-balance 는 B 미체결 2건(합 3 · A 1 · B 2)으로 밀고, me-client B4b(목록 밖 계좌 칩 → 카드 한 벌 · 상태 null · 숫자 없음) 추가. P32-orders 는 목록 밖 계좌 칩 → 그 행 확인까지.
- **Committed in:** `85bbb343` · `edde1632` · `9c51bb98`

---

**Total deviations:** 4 auto-fixed (Rule 1 ×1 · Rule 2 ×2 · Rule 3 ×1)
**Impact on plan:** 범위 밖 변경 없음. 수용 기준 grep 중 「1줄」 기준 두 개(카드 문구 · me-client `hideAccountHeader`)는 주석이 같은 글자를 반복해 넘쳤고, 주석 표현만 바꿔 맞췄다(코드 무변경).

## Issues Encountered
- **a11y.spec `/trading — 위반 0 …` 1건 실패 — 범위 밖 기존 결함.** `lc-group-fold` 기대 4 · 실제 5. quick-261012-oif(`03584822` 매수취소 접이식)가 접힘 그룹을 늘리고 a11y.spec 를 고치지 않은 것으로 보인다. 32-02 는 `/trading` 상따 카드를 건드리지 않았고 같은 spec 의 /me 케이스는 통과했다. `deferred-items.md` 에 기록.
- STATE.md · ROADMAP.md · REQUIREMENTS.md · state.json 은 이 플랜이 건드리지 않았다(오케스트레이터 몫 · 작업 트리의 변경은 다른 세션).

## Verification
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — 통과(tsc + e2e tsconfig)
- eslint(바뀐 8파일) — 오류 · 경고 0
- vitest `src/components/trading src/components/orderbook src/components/me src/lib --maxWorkers=2` — 109파일 3374 passed · 1 skipped · FAIL 0
- playwright `me.spec.ts a11y.spec.ts unfilled-progress.spec.ts --workers=1` — 40 passed · 1 failed(위 범위 밖 `/trading` a11y). me.spec 단독 30/30.
- 수용 기준 grep: 「이 계좌의 오늘 주문이 없어요」 1줄 · `onRowAccountsChange` 6줄 · 지운 그룹 함수 0줄 · `onRowAccountsChange={setRowAccounts}` 1줄 · account-panel `hideAccountHeader` 4줄 · me-client 1줄 · `accounts.map((acct)` 0

## Known Stubs
None — 필터 · 칩 합집합 · 라벨 모두 relay 컨텍스트 · 복원 조회 실값에 물려 있다. 설정 탭은 아직 전 계좌(32-09 몫 — 플랜이 정한 범위).

## Next Phase Readiness
- 웨이브 ①(32-01 · 32-02)이 로컬 master 에 완결 — /me 네 탭 중 현황 · 잔고 · 주문이 칩을 따른다. 설정 탭은 웨이브 ③(32-07~32-09).
- 32-09: 설정 탭도 `shownAccountNo` 를 받으면 된다. 잠금은 `MeAccountChips locked`.
- 32-10: 웨이브 ① push 를 여기서 함께(defer 결정).

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*
