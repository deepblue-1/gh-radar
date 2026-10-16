---
phase: 32-account-axis
plan: 05
subsystem: ui
tags: [react, nextjs, playwright, vitest, sidebar, account-axis, a11y]

requires:
  - phase: 32-account-axis
    provides: "32-01 — accountShortLabelOf · accountFullLabelOf(D-12) · 32-04 — 작업대 계좌 스코프 + 포커스 요청 경로의 pickAccount 전환"
  - phase: 18
    provides: "사이드바 트레이딩 3단(VI 줄 · StrategyItem LED 3점) · requestTradingFocus · ?focus= 링크"
provides:
  - "sidebarGroupsOf(accounts, chasers, viTriggers) → SidebarAccountGroup[] — accounts[] 순 · 목록 밖 계좌 맨 뒤(처음 본 순서) · 빈 묶음 제외 · 전략 순서 보존 · VI 는 cfg 계좌 묶음"
  - "AccountGroupItem — li[data-slot=sidebar-account-group][data-account-no] → div#useId[data-slot=sidebar-account-heading](title = 전체 라벨) → ul[aria-labelledby] → VI 줄 → 전략 줄"
  - "서버키 칩 data-slot=sidebar-account-server · 번호 라벨은 mono"
  - "E2E P32-sidebar · P32-sidebar-click · P32-sidebar-vi"
affects: [32-13]

actuals:
  tokens: 10200
  tasks: 2
  commits: 3
plan_head_before: be1b96a24c6ca630c32a4cdd055c58f243a436a1
plan_head_after: 0aaf9550ba6489d48152651afa727ec8ef230060

tech-stack:
  added: []
  patterns:
    - "묶음 순수 함수(Map 삽입 순서 = accounts[] 순 → 목록 밖 처음 본 순서) + 렌더는 groups.map 하나 — 3단 렌더 조건 = groups.length > 0"
    - "사이드바는 aside · drawer 두 곳에 그려지므로 소제목 id 는 useId(계좌번호 id 금지)"
    - "flex 소제목 안 접근 이름 띄어쓰기는 공백 글자 노드 — flex 는 그리지 않고 aria-labelledby 이름은 「김알렉스 KB120」"

key-files:
  created: []
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts

key-decisions:
  - "목록 밖 계좌 묶음의 「처음 본 순서」 는 전략 먼저 · VI 나중으로 센다 — 전략이 사이드바의 주 내용이다"
  - "짧은 라벨의 siblings = 보이는 묶음 전부(목록 밖 묶음은 번호만 있는 입력) — UI-SPEC 「보이는 다른 묶음과 상품명 · 서버키가 같으면 번호」"
  - "Task 1 은 VI 줄을 종전 위치(3단 맨 위)에 두고 전략 묶음만 그렸다 — Task 2 RED 가 실제 실패로 서게(VI 묶음 이동은 Task 2 GREEN)"
  - "VI 줄 클릭 동작 · ViItem 은 손대지 않았다 — 계좌 전환은 웨이브 ④(32-13)"

patterns-established:
  - "sidebar-tree.spec 다계좌 케이스도 trading-workbench.spec 과 같이 beforeEach 가 respondLogin({ success: true }) 로 한 계좌를 복원한다"

requirements-completed: [AXIS-01]

coverage:
  - id: D1
    description: "(트레이서 · D-02) 3단 = accounts[] 순 계좌 묶음 — 소제목(짧은 라벨 + 서버키 칩 · title 전체 라벨) 아래 그 계좌 켜진 전략 줄"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#P32 사이드바 계좌 묶음 (D-02 · S3) (11)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts#P32-sidebar"
        status: pass
    human_judgment: false
  - id: D2
    description: "(D-02 · D-16) VI 줄은 cfg 계좌 묶음 안 · 두 거래소가 다른 계좌면 묶음마다 한 줄 · VI 만 가동 묶음도 선다 · 목록 밖 = 맨 뒤 번호 소제목 · 전부 비면 3단 없음"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#P32 사이드바 VI 줄 · 목록 밖 (D-02 · S3) (5)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts#P32-sidebar-vi"
        status: pass
    human_judgment: false
  - id: D3
    description: "(CONTEXT 재량 · S3) 다른 계좌 전략 줄 클릭 → /trading?focus= · 작업대 셀렉트 = 그 계좌 · 그 카드 보임 · 다른 계좌 카드 숨김"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/sidebar-tree.spec.ts#P32-sidebar-click"
        status: pass
    human_judgment: false
  - id: D4
    description: "S3 시각(소제목 12/600 · 위 8 아래 4 좌우 8 · 서버키 칩 10/700 · 목업 ② .ah 대비) · 사이드바 240 · 드로어 280 최악값 말줄임"
    verification:
      - kind: e2e
        ref: "P32-sidebar 소제목 박스 ≤ nav 폭 · a11y.spec + shell-chrome.spec 23 passed"
        status: pass
    human_judgment: true
    rationale: "목업 대비 시각 판정(간격 · 칩 정렬 · 말줄임 모양)은 사람 몫(UI 리뷰)"

duration: 10min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 05: 사이드바 계좌 묶음 트리 Summary

**사이드바 「트레이딩」 3단이 `accounts[]` 순 계좌 묶음 트리가 됐다. 소제목(상품명 · 중복이면 번호 + 서버키 칩) 아래에 그 계좌의 VI 줄과 켜진 전략 줄이 서고, 다른 계좌 전략을 누르면 작업대가 그 계좌로 바뀐다(AXIS-01 · D-02).**

## Performance

- **Duration:** 약 10분(벽시계 측정값)
- **Started:** 2026-10-16T06:05:39Z
- **Completed:** 2026-10-16T06:15:47Z
- **Tasks:** 2
- **Files modified:** 3 (소스 1 · 테스트 2 — 생성 0)

## Accomplishments
- `sidebarGroupsOf(accounts, chasers, viTriggers)` 순수 함수를 추가했다. 묶음 순서는 `accounts[]` 순이고, 목록 밖 계좌는 처음 본 순서로 맨 뒤에 선다(`account` 없음). 켜진 전략도 가동 VI 도 없는 묶음은 버린다. VI 는 `VI_TAG_ORDER` 순으로 `run === true` 인 거래소를 그 cfg 계좌 묶음에 넣는다(D-16 · 웨이브 ④ 전 규칙).
- `AccountGroupItem` 렌더 구조: `li[data-slot=sidebar-account-group]` → 소제목 `div`(`useId` · 링크 · 버튼 · tabindex 없음 · `title` = 전체 라벨) → `ul[aria-labelledby]` → VI 줄 → 전략 줄(`StrategyItem` 그대로). 추가 들여쓰기는 없다(바깥 `SUB_LIST` 하나).
- 소제목 글자는 `accountShortLabelOf(계좌, 보이는 묶음들)` 이다. 번호로 대신할 때는 `mono` 를 쓴다. 서버키 칩은 `ml-auto shrink-0 whitespace-nowrap`(10/700 · `--muted` 면 · 모서리 4)이다. 목록 접근 이름은 「김알렉스 KB120」 이다(공백 글자 노드).
- 3단 목록 렌더 조건은 `groups.length > 0` 이다. 「트레이딩」 레일 배지는 `sidebarChasers.length`(전 계좌 합)로 바뀌지 않았다.
- 다른 계좌 전략 클릭은 기존 `requestTradingFocus` 를 거쳐 32-04 의 `pickAccount` 로 작업대 계좌를 전환한다. E2E 로 증명했다(코드 추가 없음).
- E2E `P32-sidebar` · `P32-sidebar-click` · `P32-sidebar-vi` 를 새로 넣었다. `beforeEach` 가 로그인 응답을 한 계좌로 되돌린다.

## Task Commits

1. **Task 1 (tracer): 계좌 묶음 트리 한 경로** — `3e19e752` (feat). 트레이서 게이트(interactive · `end-of-phase` · automated-only `<verify>`): vitest 76/76, sidebar-tree 전체 10 passed(`P32-sidebar` 포함)로 재실행 통과 → 확장
2. **Task 2: VI 줄 묶음 안 · 목록 밖 · 빈 묶음 · 클릭 전환 E2E** — RED `9a3df62a` (test) → GREEN `0aaf9550` (feat)

`commits: 3` = `git rev-list --count be1b96a2..0aaf9550`(전부 32-05 커밋 · SUMMARY 커밋 전).

## TDD Gate Compliance

플랜은 `type: execute` 이고 Task 2 만 `tdd="true"` 다. `test(32-05)` → `feat(32-05)` 순서로 커밋했다. REFACTOR 커밋은 없다. TAP 분류기(`check tdd-red-evidence`)는 돌리지 않았다. 아래 의미 판정만 기록한다(32-01 ~ 32-04 와 같은 처리).

- **RED** (`9a3df62a`): 단위 3건이 계획한 단언에서 실패했다. `['strategy']`≠`['vi','strategy']`(A 묶음 안 VI 없음), VI 링크 1≠2(거래소별 묶음 분리 없음), 묶음 `[A]`≠`[A, B]`(VI 만 가동 묶음 없음). 픽스처 · 문법 오류는 없었다. 「목록 밖 맨 뒤 번호 · 칩 없음」 · 「전부 비면 ul 없음」 2건은 RED 에서 이미 통과했다. Task 1 이 `sidebarGroupsOf` 에 넣은 규칙의 회귀 고정이다. E2E `P32-sidebar-vi` 는 A 묶음 VI 줄 count 0≠1 로 실패했다. `P32-sidebar-click` 은 32-04 포커스 경로 위에서 이미 통과했다(회귀 고정).
- **GREEN** (`0aaf9550`): vitest 81/81 · sidebar-tree E2E 11/11 · typecheck 통과.

## Decisions Made
- 목록 밖 묶음의 「처음 본 순서」 는 전략을 먼저 세고 VI 를 나중에 센다.
- 짧은 라벨 siblings 는 보이는 묶음 전부다. 목록 밖 묶음은 `{ accountNo }` 만 있으므로 항상 번호다.
- Task 1 은 VI 줄을 종전 위치(3단 맨 위)에 두었다. 그래서 Task 2 RED 가 실제 실패로 섰다. 중간 상태에서도 기존 단위 · E2E 는 깨지지 않았다.
- `ViItem` 자체와 VI 줄 클릭(작업대 이동)은 바꾸지 않았다. 계좌 전환은 웨이브 ④(32-13)가 맡는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 접근성] 소제목 접근 이름 띄어쓰기**
- **Found during:** Task 1
- **Issue:** 이름 `span` 과 서버키 칩 `span` 이 붙어 있어 `aria-labelledby` 목록 이름이 「김알렉스KB120」 이 된다(UI-SPEC 접근성 행 「김알렉스 KB120」).
- **Fix:** 서버키가 있을 때 두 span 사이에 `" "` 글자 노드를 넣었다. flex 컨테이너라 화면에는 그리지 않는다.
- **Files modified:** webapp/src/components/layout/app-sidebar.tsx
- **Verification:** 단위 「접근성 — … 목록 이름 「김알렉스 KB120」」 · E2E `getByRole('list', { name: /^위탁종합/ })`
- **Committed in:** `3e19e752`

**2. [Rule 3 - Blocking] sidebar-tree.spec 로그인 응답 누수 차단**
- **Found during:** Task 1
- **Issue:** `relay.reset()` 은 로그인 응답(계좌 목록)을 되돌리지 않는다(32-04 와 같은 원인). 그래서 P32 다계좌 케이스 뒤 케이스가 두 계좌로 시작할 수 있다.
- **Fix:** describe `beforeEach` 에 `relay.gateway.respondLogin({ success: true })` 를 넣었다.
- **Committed in:** `3e19e752`

**3. [플랜 세부 조정] 묶음 `li` 에 `data-account-no` 추가**
- Artifacts 표에 없는 속성이다. E2E 가 묶음 순서를 글자가 아닌 계좌번호로 단언하려고 넣었다(표시 · 접근성 무영향).

---

**Total deviations:** 3건(Rule 2 ×1 · Rule 3 ×1 · 세부 조정 1)
**Impact on plan:** 범위 확장은 없다. 파일은 플랜 선언 3개뿐이다.

## Issues Encountered
- 없음. 기존 단위 3단 케이스(VI · 전략 순서 · 빈 목록)는 셀렉터를 바꾸지 않고 통과했다. `tradingSubList()` 는 바깥 `SUB_LIST` 를 잡고, 링크 질의는 하위 묶음까지 내려간다.
- deferred-items 의 P31-3(trading-workbench.spec)은 이 플랜의 실행 범위 밖이다. 이 플랜은 그 spec 을 돌리지 않았고 상따 카드 · 시트를 건드리지 않았다.

## Verification
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — exit 0 · error TS 0
- `vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` — 81 passed · FAIL 0. 「P32 사이드바 계좌 묶음」 it 11 · 「P32 사이드바 VI 줄 · 목록 밖」 it 5
- `playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` — 11 passed(+ setup)
- `playwright test e2e/specs/shell-chrome.spec.ts e2e/specs/a11y.spec.ts --workers=1` — 23 passed(앱 셸 · 레일 · 접근성 회귀 없음)
- 수용 grep(app-sidebar.tsx): `export function sidebarGroupsOf(` 1 · `data-slot="sidebar-account-heading"` 1 · `accountShortLabelOf(` 1 · `aria-labelledby` 2 · `group.viRunning` 2 · `requestTradingFocus(` 1

## Known Stubs
없음.

## User Setup Required
None.

## Next Phase Readiness
- 웨이브 ④(32-13)는 `sidebarGroupsOf` 의 VI 분배 한 곳(cfg 계좌 → 계좌별 슬롯)만 바꾸면 된다. VI 줄 클릭의 계좌 전환도 그때 더한다.
- push · 배포하지 않았다(커밋은 로컬 master).

## Self-Check: PASSED
- FOUND: webapp/src/components/layout/app-sidebar.tsx · webapp/src/components/layout/__tests__/app-sidebar.test.tsx · webapp/e2e/specs/sidebar-tree.spec.ts
- FOUND commits: 3e19e752 · 9a3df62a · 0aaf9550 (HEAD 조상)
