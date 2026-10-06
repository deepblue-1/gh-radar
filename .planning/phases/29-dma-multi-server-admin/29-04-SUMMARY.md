---
phase: 29-dma-multi-server-admin
plan: 04
subsystem: admin
tags: [shared, relay, admin, planner, tdd, users-toml, dma]

requires:
  - phase: 29-dma-multi-server-admin
    provides: "gh-trade 계약(44/86/87 · op 1~5 · code 0~12) — 인박스 노트 261006 · StockDMA.fbs"
provides:
  - "packages/shared/src/admin.ts — Admin 계약 타입 전부 · normalizeAccountNo · isValidAccountNoInput · diffServerAccounts · interpretAdminResult · deriveAdminUsersOverview · deriveAdminServersOverview · REFLECT_LABEL · compareAccounts"
  - "relay/src/admin/planner.ts — planServerOps · planPasswordOps · PlannedOp · ServerPlan · AdminSnapshotView"
affects: [29-05, 29-10, 29-11, 29-13, 29-14, 29-15, 29-17, 29-18, 29-19]

actuals:
  tokens: 13524
  tasks: 3
  commits: 3
plan_head_before: 6f995f1acc36f5931b02863ca249b3cbcce260e7
plan_head_after: c874766a802faf60e70e5449eb3f41ce232a7534

tech-stack:
  added: []
  patterns:
    - "판정 한 벌: diffServerAccounts 를 relay planner(보낼 op)와 shared 개요(그릴 칩)가 같이 읽는다"
    - "칩 판정은 (유저, 서버) 단위 diff → 계좌 칩은 그 diff 의 pending 키 집합으로"

key-files:
  created:
    - packages/shared/src/admin.ts
    - packages/shared/src/__tests__/admin.test.ts
    - packages/shared/src/__tests__/admin-overview.test.ts
    - relay/src/admin/planner.ts
    - relay/tests/admin-planner.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "diffServerAccounts 는 87 미수신이면 { known: false } 만 돌려주고, 같은 계좌가 active 와 removing 에 다 있으면 active 가 이긴다(지우는 쪽으로 기울지 않음)"
  - "op 2 조건 = 그 서버 active 0 · toRemove ≥ 1 · serverOnly 0 — 87 에만 있는 계좌가 하나라도 있으면 op 4 로만 지우고 유저는 유지"
  - "칩 err 은 최근 결과 outcome === 'failed' 이고 그 계좌/서버에 아직 차이가 남았을 때만 — 차이가 없으면 옛 실패 결과는 무시하고 ok. timeout · offline 은 warn"
  - "87 을 아직 못 받은 서버의 칩은 warn(실패 결과가 있으면 err)"
  - "유저 칩 only = 그 유저 의도가 없는 서버에 87 계좌가 있음. 의도에 없는 87 계좌는 계좌 줄로 보이되 servers [] · serverOnlyOn 만"
  - "AdminServersRaw.userCounts 의 키는 29-05 계약대로 { serverKey, users } · 87 이 없는 서버는 userCount 0"
  - "AdminServersOverview = { groups: [{ broker: 'KB' }, { broker: 'KYOBO' }] } — 빈 그룹도 둔다"
  - "AdminUsersOverview 에 servers(레지스트리 순 원자료)를 그대로 싣는다 — 29-10 응답(users · pending · serverOnly · servers)"

patterns-established:
  - "Admin 판정 함수는 shared 순수 함수 — relay · Express · webapp 이 같은 모듈을 import"
  - "op 순서 op 1 → op 3 → op 4 — 추가가 먼저라 제거 중 계좌 0개 순간이 생기지 않는다"

requirements-completed: [ADMIN-05, ADMIN-09, ADMIN-10]

coverage:
  - id: D1
    description: "계좌번호 정규화(gh-trade NormalizeAccountNo 이식) · 입력 검사(trim 뒤 1~12자, 자르지 않고 거부)"
    requirement: ADMIN-09
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#normalizeAccountNo — gh-trade NormalizeAccountNo 이식"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#isValidAccountNoInput — trim 뒤 1~12자 (자르지 않고 거부)"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay op 계획기 — op 1/3/4/2 · removing settle · 서버에만 있음 보호 · 순서 · 비밀번호 op 1"
    requirement: ADMIN-05
    verification:
      - kind: unit
        ref: "relay/tests/admin-planner.test.ts (23건)"
        status: pass
    human_judgment: false
  - id: D3
    description: "86 결과 해석 — op 4 code 8 · op 2 code 4 = 반영됨, 그 밖 code = failed"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#interpretAdminResult — 86 code 해석 (D-23 ⑤)"
        status: pass
    human_judgment: false
  - id: D4
    description: "개요 파생 — 유저 칩 ok/warn/err(BUSY message 그대로)/only · 계좌 칩 · serverOnlyOn · serverOnly 행 · 승인 대기 · 서버 그룹 카드"
    requirement: ADMIN-10
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts (16건)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-06
status: complete
---

# Phase 29 Plan 04: Admin 계약과 판정 한 벌 Summary

**shared `diffServerAccounts` 하나로 relay `planServerOps`(op 1 → op 3 → op 4 / op 2)와 개요 칩(반영됨 · 미반영 · 실패 · BUSY · 서버에만 있음)을 같이 판정 — gh-trade `NormalizeAccountNo` 이식 · 86 code 해석 · 서버 그룹 카드 파생 포함.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-10-06T14:47:08Z
- **Completed:** 2026-10-06T14:56:18Z
- **Tasks:** 3
- **Files modified:** 6 (신규 5 · 수정 1)

## Accomplishments

- `packages/shared/src/admin.ts` — Admin 계약 타입 전부(Artifacts 표 32종) + 순수 함수 7개. 29-05 RPC jsonb 키가 따를 camelCase 원자료 형태(`AdminUsersRaw` · `AdminServersRaw`) 확정.
- `diffServerAccounts` — 정규화 계좌번호 키로 의도(active · removing) 대 87 을 비교해 `missing · changed · toRemove · settledRemovals · serverOnly` 를 priority → accountNo 순으로 낸다. 87 미수신이면 `{ known: false }`.
- `relay/src/admin/planner.ts` — diff 를 op 열로 옮기기만 한다. 87 에만 있는 계좌 · 유저를 지우는 op 는 어떤 경우에도 만들지 않는다(골든으로 고정).
- `deriveAdminUsersOverview` · `deriveAdminServersOverview` — 목업의 행 · 칩 · 계좌 줄 · 「웹 유저 없음」 행 · 서버 카드 숫자가 raw 한 덩이에서 나온다.

## planner 규칙 표

| 상황(그 유저 · 그 서버) | 계획 |
|---|---|
| 87 미수신 | `no-snapshot` · ops [] |
| 87 에 유저 없음 · active 있음 | op 1(첫 계좌 = priority → accountNo) + 나머지 op 3 · removing 은 전부 settle |
| 87 에 유저 있음 · 없는/값 다른 active | op 3(priority → accountNo 순) — 값 비교 = name · branchNo · traderId · priority |
| removing · 87 에 있음 | op 4(accountNo) |
| removing · 87 에 없음 | 보낼 것 없음 · `settleRemoved` |
| active 0 · removing 이 87 계좌 전부 | op 2(op 4 는 12 LAST_ACCOUNT) |
| active 0 · removing + 87 전용 계좌 X | op 4 만 — X · 유저 유지 |
| 87 전용 계좌(의도에 없음) | 절대 op 4 / op 2 대상 아님(D-23 ⑤) |
| 비밀번호 변경 | 87 에 유저 있는 서버만 op 1 passwordOnly · 없으면 [] · 87 없음 no-snapshot |
| 순서 | op 1 → op 3 → op 4(또는 op 2) |

| 86 해석 `interpretAdminResult(op, code)` | 결과 |
|---|---|
| code 0 | ok |
| op 4 · code 8(NO_SUCH_ACCOUNT) | ok — 이미 없음, 오류 칩 아님 |
| op 2 · code 4(NO_SUCH_USER) | ok — 유저 없음 = 반영됨 |
| 그 밖(9 BUSY · 12 · 3 · 5 · 7 …, op 3 의 8 포함) | failed — 칩은 서버 한국어 message 그대로 |

## shared 타입 목록

`AppRole` · `DmaBroker` · `SERVER_KEY_RE` · `brokerOfServerKey` · `AdminAccountFields` · `AdminIntentRow` · `AdminSnapshotAccountRow` · `AdminResultRow` · `AdminOutcome` · `AdminUsersRaw` · `AdminUsersOverview` · `AdminUserView` · `AdminAccountView` · `AdminReflectChip` · `ReflectTone` · `REFLECT_LABEL` · `AdminPendingUser` · `AdminServerOnlyUser` · `AdminServersRaw` · `AdminServerLiveStatus` · `AdminServerView` · `AdminServersOverview` · `AdminServerResult` · `AdminCommandResponse` · `AdminAccountInput` · `AdminDmaInput` · `AdminCreateUserBody` · `AdminRoleBody` · `AdminPasswordBody` · `AdminPutAccountBody` · `AdminServerUpsertBody` · `AdminServerPatchBody` · `ServerAccountsDiffInput` · `ServerAccountsDiff`

함수: `normalizeAccountNo` · `isValidAccountNoInput` · `compareAccounts` · `diffServerAccounts` · `interpretAdminResult` · `deriveAdminUsersOverview` · `deriveAdminServersOverview`

relay: `PlannedOp` · `ServerPlan` · `AdminSnapshotView` · `PlanServerOpsInput` · `planServerOps` · `planPasswordOps`

## Task Commits

1. **Task 1: 트레이서 — normalizeAccountNo · diffServerAccounts · planner op 1 · 개요 ok/warn** - `50c85fb0` (feat)
2. **Task 2: planner 규칙 전부 — op 3/4/2 · settle · 결과 해석 · 비밀번호 op 1** - `d1f778a1` (feat)
3. **Task 3: 개요 파생 전부 — 계좌 칩 · BUSY · 서버에만 있음 · 승인 대기 · 서버 개요** - `c874766a` (feat)

플랜 지시대로 태스크당 한 커밋(test 커밋 분리 없음). 각 태스크는 RED 를 먼저 관측한 뒤 GREEN 으로 갔다:
- Task 1 RED: `admin.ts` 스텁(잘못된 값 반환)으로 shared 골든 14건이 단언에서 실패. relay planner 테스트는 RED 관측 없이 바로 구현 — 모듈이 없어 load 실패만 났을 것이므로 단언 RED 로는 치지 않는다.
- Task 2 RED: `interpretAdminResult` · `planPasswordOps` 스텁 + Task 1 diff 로 shared 8건 · relay 15건이 단언에서 실패(op 3/4/2 · settle · removing 계약).
- Task 3 RED: `deriveAdminServersOverview` 스텁 + Task 1 개요로 overview 골든 12건이 단언에서 실패.

## Files Created/Modified

- `packages/shared/src/admin.ts` - Admin 계약 타입 · 정규화 · diff · 결과 해석 · 개요 파생
- `packages/shared/src/index.ts` - `export * from "./admin"` 재수출
- `packages/shared/src/__tests__/admin.test.ts` - 정규화 · 입력 검사 · diff · 결과 해석 · 칩 라벨 · 트레이서 개요 골든(29건)
- `packages/shared/src/__tests__/admin-overview.test.ts` - 개요 파생 골든(16건)
- `relay/src/admin/planner.ts` - op 계획기
- `relay/tests/admin-planner.test.ts` - planner 골든(23건)

## Decisions Made

- frontmatter `key-decisions` 참조. 플랜이 정하지 않은 세부(err 은 `outcome === "failed"` 일 때만 · timeout/offline 은 warn · 차이 없으면 옛 실패 무시 · 87 미수신 서버는 warn · 87 전용 계좌의 계좌 줄 표시 · `AdminServersOverview.groups` 형태 · 요청 바디 필드)는 목업 · CONTEXT D-14/D-17/D-23 · 29-05/29-13 플랜의 계약 표에서 끌어온 값이다.
- `compareAccounts` 를 shared 에서 export — planner 가 missing ∪ changed 를 같은 순서 기준으로 정렬하려고 쓴다(판정 두 벌 금지).

## Deviations from Plan

### 실행 환경 조정

**1. [Rule 3 - Blocking] `<automated>` 의 `cd /Users/alex/repos/gh-radar` 를 워크트리 안에서 실행**
- **Found during:** Task 1 verify
- **Issue:** 플랜 verify 명령이 메인 체크아웃 절대 경로로 `cd` 한다 — 그대로 돌리면 이 워크트리 변경이 아니라 main tree 를 검증한다(worktree-path-safety 0c).
- **Fix:** 같은 pnpm 명령을 워크트리 루트에서 `cd` 없이 실행. 워크트리에 node_modules 가 없어 `pnpm install --frozen-lockfile --prefer-offline`(lockfile 그대로 · 새 패키지 없음 · 추적 파일 변경 없음)을 먼저 돌렸다.
- **Files modified:** 없음
- **Verification:** shared admin 2파일 45/45 · shared build · relay typecheck · typecheck:tests · planner 23/23 green. 회귀로 shared 전체 433/433 · relay 전체 1035/1035 green.

---

**Total deviations:** 1 (실행 환경 조정 — 코드 변경 없음)
**Impact on plan:** 없음.

## Issues Encountered

None

## User Setup Required

None - 순수 함수만 추가. 외부 서비스 설정 없음.

## Next Phase Readiness

- 29-05: `admin_users_raw()` jsonb 키 = `AdminUsersRaw` 필드(appUsers · pending · intent · snapshots · snapshotAccounts · results · servers), intent 행 키 9개 · `admin_servers_raw()` = `{ servers(8열 camelCase), userCounts: { serverKey, users }[], snapshots }`.
- 29-10 / 29-13: `deriveAdminUsersOverview(raw)` · `deriveAdminServersOverview(raw, live | null)` 를 그대로 응답으로.
- 29-11: `planServerOps` 의 `settleRemoved` 는 87 에 이미 없는 removing 계좌. op 2 가 반영되면(`interpretAdminResult(2, 0 | 4) === "ok"`) 그 서버의 removing 전부 + 유저 제거로 settle 하는 것은 dispatcher 몫.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-06*
