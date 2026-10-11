---
phase: 30-kb-ip-mac
plan: 09
subsystem: webapp-admin
tags: [shared, webapp, admin, order-ip-mac, shared-account, gap-closure, e2e]
status: complete
gap_closure: true

requires:
  - phase: 30-08
    provides: "IP/MAC 표시 표기(formatOrderIp/Mac) · 편집 초깃값 · 30-08 e2e 표시 상수"
  - phase: 30-05
    provides: "IP/MAC 편집칸 · editSaveBodyOf · 편집 블록 구조(도움말 · 불일치 줄 · 동작 줄)"
  - phase: 30-04
    provides: "편집 저장 결과 줄(서버 message 원문 · 문장 대조 없음) · onChanged 재조회"
provides:
  - "shared findSharedAccountHolders · SharedAccountHolder — 개요에서 같은 계좌를 쓰는 다른 DMA 사용자(증권사 · 정규화 계좌번호 · 서버 겹침)"
  - "KB 계좌 편집 모드 공유 계좌 안내 줄(admin-account-edit-shared · WARN_LINE · 불일치 줄 아래 · 「취소 · 저장」 위)"
  - "개요 users prop 결선 UsersClient → UserSheet → AccountEditor → AccountRow"
  - "e2e 픽스처 ADMIN_SHARED_ACCOUNT · ADMIN_CODE7_MESSAGE · 목 PUT gh-trade 261011 전파 흉내(머리 주석 ⑥)"
affects: [30-07, webapp-account-editor, webapp-e2e-admin]

actuals:
  tokens: 9957
  tasks: 3
  commits: 4
plan_head_before: 6badc89d7e9577d0cbb8e0be3770904dffef8237
plan_head_after: 5687c2824d463cdcf01941b440039b21f15c1447

tech-stack:
  added: []
  patterns:
    - "공유 계좌 판정은 shared 순수 함수 한 벌 · 개요 데이터만(추가 요청 0) — 웹은 안내만, 동시 반영은 gh-trade 서버 몫"
    - "서버 거절 문구(code 7)는 결과 줄에 원문 그대로 — 문구가 넓어져도 웹 변경 없음"
    - "e2e 목은 외부 서버의 미배포 동작(전파)을 흉내 내고, 배포 전 실동작(code 7)은 onRequest 로 따로 본다"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-09-SUMMARY.md
  modified:
    - packages/shared/src/admin.ts
    - packages/shared/src/__tests__/admin.test.ts
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/user-sheet.tsx
    - webapp/src/components/admin/users-client.tsx
    - webapp/src/components/admin/__tests__/users-client.test.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts

key-decisions:
  - "findSharedAccountHolders 의 상대 서버 = active 등록 서버 ∪ serverOnlyOn(removing 제외) · 입력 servers = 이 계좌의 active 등록 서버(저장이 가는 서버 · intent) · 겹침 없으면 제외"
  - "안내 줄은 KB 편집 모드에서만 · 판정은 렌더 중 개요 데이터로(요청 0) · code 7 특수 처리 없음 — 결과 줄은 기존 「<서버> 실패: <원문>」"
  - "안내 문구는 주문자 IP · MAC 만 말한다 — gh-trade 46a10ce9 는 함께 쓰는 사용자에 orderIp/orderMac 만 옮기고 지점번호 · 거래자ID · 계좌명은 옮기지 않는다"
  - "e2e code 7 상수는 gh-trade 46a10ce9 의 넓힌 문구 「…다른 지점번호/거래자ID/주문자 IP·MAC 으로 보유하고 있습니다」"

patterns-established:
  - "개요 전체가 필요한 계좌 카드 판정은 users prop 을 UsersClient → UserSheet → AccountEditor 로 내리고 모듈 상수 빈 배열을 기본값으로 둔다"

requirements-completed: [IPMAC-02, IPMAC-03]

coverage:
  - id: D1
    description: "shared findSharedAccountHolders — 오름차순 · 정규화 계좌번호 · 증권사 · 서버 겹침(serverOnlyOn 포함 · removing 제외) · 자기/DMA 없음 제외 · 같은 id 합침"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#P30 공유 계좌 — findSharedAccountHolders (D-18)"
        status: pass
    human_judgment: false
  - id: D2
    description: "다른 사용자 87 에 전파된 IP/MAC 은 drift 가 아니다 — diffServerAccounts changed 0 · 개요 칩 ok · orderEndpoints 에 전파값(relay · server 무변경 근거)"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin.test.ts#P30 공유 계좌 전파는 drift 가 아니다 (D-18)"
        status: pass
      - kind: other
        ref: "git diff --stat 2234a1b5..HEAD -- relay/src server/src (빈 출력)"
        status: pass
    human_judgment: false
  - id: D3
    description: "KB 편집 모드 안내 줄 문구 · WARN_LINE · role 없음 · 위치(불일치/도움말 뒤 · 취소 앞) · 0개 경우(읽기 · prop 없음 · 서버 안 겹침 · 교보)"
    requirement: IPMAC-02
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 공유 계좌 안내 (D-18)"
        status: pass
      - kind: integration
        ref: "webapp/src/components/admin/__tests__/users-client.test.tsx#UsersClient — P30 공유 계좌 안내 (D-18)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E6 공유 계좌 안내 · 저장 뒤 함께 쓰는 사용자 카드 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D4
    description: "저장 전부 ok → 편집 닫힘 · 개요 재조회 · 함께 쓰는 사용자(kim) 카드도 새 값(목 전파)"
    requirement: IPMAC-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E6 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D5
    description: "gh-trade 전파 배포 전 code 7 → 결과 줄 「KB120 실패: <서버 원문>」 · 편집 · 입력값 · 안내 줄 유지 · 문장 대조 없음"
    requirement: IPMAC-03
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P30 공유 계좌 안내 (D-18) code 7"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E7 공유 계좌 code 7 원문 · 편집 유지 (1080)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실서버에서 공유 계좌 IP/MAC 저장이 실제로 함께 바뀌는지(gh-trade 46a10ce9 KB120/121 배포 뒤)"
    requirement: IPMAC-02
    verification: []
    human_judgment: true
    rationale: "gh-trade 전파가 아직 KB120/121 에 배포되지 않았다 — e2e 목은 전파를 흉내 낼 뿐이라 실서버 확인은 30-07 배포 뒤 UAT 몫"

duration: 9min
completed: 2026-10-11
---

# Phase 30 Plan 09: 공유 계좌 IP/MAC 안내 (gap 2 · D-18) Summary

**shared `findSharedAccountHolders` 를 추가했다. 개요 데이터만 보고 같은 KB 계좌를 겹치는 서버에서 쓰는 다른 DMA 사용자를 찾는다. 그 결과로 편집 모드에 「이 계좌를 함께 쓰는 사용자 kimtr — 주문자 IP · MAC 이 함께 바뀌어요」 한 줄을 보인다. 저장 뒤에는 기존 재조회가 함께 쓰는 사용자의 카드도 새 값으로 그린다(E2E 로 증명). gh-trade 전파가 배포되기 전의 code 7 은 결과 줄에 서버 문구 원문 그대로 나온다. relay · server 는 바꾸지 않았다.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-11T08:04:30Z
- **Completed:** 2026-10-11T08:13:33Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- **shared(Task 1):** `findSharedAccountHolders({ users, dmaUserId, broker, accountNo, servers })` → `SharedAccountHolder[]`(`{ dmaUserId, servers }`)를 추가했다.
  - 자기 자신과 DMA 가 없는 웹 사용자는 건너뛴다. 같은 증권사이고 `normalizeAccountNo` 가 같은 계좌만 본다.
  - 상대 서버 집합(active 등록 서버 ∪ `serverOnlyOn`)과 입력 서버가 하나 이상 겹쳐야 넣는다. `servers` 는 입력 순서를 따른다.
  - 같은 id 가 여러 번 나오면 서버를 합쳐 한 항목으로 만든다. 결과는 id 오름차순이다.
  - JSDoc 에 적은 것 셋: 전파는 서버별 users.toml 안에서만 일어난다, gh-trade 가 옮기는 값은 IP · MAC 뿐이다, 87 전용 DMA id 는 목록에 나오지 않는다.
  - 기존 `index.ts` 의 `export * from "./admin"` 으로 재수출된다.
- **웹(Task 1):**
  - `ACCOUNT_EDITOR_TEXT.sharedAccountNote` 를 더하고, `AccountEditor` 에 `users?` prop 을 열었다. 기본값은 모듈 상수 `NO_USERS` 다.
  - `AccountRow` 는 KB 일 때만 `intent` 서버로 판정한다. 편집 블록의 불일치 줄 아래 · 동작 줄 위에 `<p data-slot="admin-account-edit-shared" className={WARN_LINE}>` 를 그린다(role 없음).
  - `UserSheet` 는 `users` 를 그대로 넘기고, `UsersClient` 는 `users={state.data.users}` 를 넘긴다. 세 파일의 머리 JSDoc 에 D-18 설명을 더했다.
- **테스트(Task 2):**
  - shared 쪽: 판정 규칙 4건 · drift 없음 2건. drift 테스트는 의도(IP/MAC 없음) 대 전파된 87 에서 `changed` 0 · 칩 ok · `orderEndpoints` 에 전파값이 실림을 본다. 파생 개요에 `findSharedAccountHolders` 를 돌린 결과도 함께 단언한다.
  - account-editor 7건: 문구 · 클래스 · 위치, 0개 경우 4가지, code 7 원문 결과 줄, 전부 ok 면 닫힘.
- **E2E(Task 3):**
  - 픽스처: alex · kim 에 공유 계좌 `11122233304` 를 목록 끝에 더했다. `ADMIN_CODE7_MESSAGE` 를 export 하고, 목 PUT 이 gh-trade 전파를 흉내 낸다(머리 주석 ⑥).
  - P30-E6(390 · 1080): 안내 줄, E7 overflow backstop, 공유 아닌 계좌에는 줄이 없음, PUT 1건(원문), 재조회 뒤 표시 표기, kim 시트 카드도 새 값.
  - P30-E7(1080): code 7 원문 결과 줄, 편집 · 입력 · 안내 줄이 남고, kim 상태는 그대로다.
- **390 육안 확인:** `admin-ipmac-shared-390` 에서 안내 줄이 카드 안에 한 줄로 들어간다. `admin-ipmac-code7-1080` 에서는 code 7 원문이 카드 안에서 `break-keep` 으로 두 줄로 감긴다.

## Task Commits

1. **Task 1 (트레이서): findSharedAccountHolders → 안내 줄 → UserSheet · UsersClient 결선:** RED `3586337c` (test) · GREEN `09d02508` (feat)
   - 트레이서 게이트: auto 모드가 아니고 end-of-phase 이며 verify 는 자동뿐이다. 그래서 verify 를 다시 돌렸고, 통과해서 확장으로 넘어갔다.
2. **Task 2: 판정 규칙 · drift 없음 · 안내 줄 상태 · code 7 원문 · 재조회 트리거 고정:** `74dc2aa3` (test). Task 1 구현이 처음부터 만족해서 fix 커밋은 없다.
3. **Task 3: E2E P30-E6 · P30-E7 + 회귀 게이트:** `5687c282` (test)

## Files Created/Modified

- `packages/shared/src/admin.ts`: `SharedAccountHolder` · `findSharedAccountHolders`
- `packages/shared/src/__tests__/admin.test.ts`: describe 「P30 공유 계좌 — findSharedAccountHolders (D-18)」 · 「P30 공유 계좌 전파는 drift 가 아니다 (D-18)」
- `webapp/src/components/admin/account-editor.tsx`: import · `sharedAccountNote` · `users` prop(`AccountEditorProps` 선택 · `AccountRowProps` 필수) · 안내 줄 · JSDoc
- `webapp/src/components/admin/user-sheet.tsx`: `users?` prop 을 `AccountEditor` 로 넘긴다
- `webapp/src/components/admin/users-client.tsx`: `users={state.data.users}` · JSDoc 한 줄
- `webapp/src/components/admin/__tests__/users-client.test.tsx`: describe 「UsersClient — P30 공유 계좌 안내 (D-18)」
- `webapp/src/components/admin/__tests__/account-editor.test.tsx`: describe 「P30 공유 계좌 안내 (D-18)」 7건
- `webapp/e2e/fixtures/admin.ts`: `ADMIN_SHARED_ACCOUNT` · `ADMIN_CODE7_MESSAGE` · 공유 계좌 2개 · 목 PUT 전파 · 머리 주석 ⑥
- `webapp/e2e/specs/admin.spec.ts`: P30-E6(390 · 1080) · P30-E7(1080) · import · 머리 주석

## Decisions Made

자세한 목록은 frontmatter `key-decisions` 에 있다. 핵심은 두 가지다.

- 판정 입력 `servers` 는 「저장이 가는 서버」 = `intent` 다(토글이 비행 중이면 그 값). 그래서 안내 줄과 실제 PUT 대상 서버가 늘 같다.
- 플랜 체커 조정 ① 에 따라 code 7 상수는 gh-trade 46a10ce9 의 넓힌 문구를 쓴다. 조정 ② 에 따라 안내 문구는 IP · MAC 만 말하고, 「지점번호 · 거래자ID · 계좌명은 옮기지 않는다」 를 JSDoc 에 적었다.

## Drift check 결론 · 30-07 재배포 범위

- `git diff --stat 2234a1b5..HEAD -- relay/src server/src` 의 출력이 비어 있다. relay · server 소스는 바뀌지 않았다.
- 그 근거는 플래너 drift check 와 shared drift 테스트다.
  - relay 는 요청한 DMA 사용자만 계획한다.
  - 의도에 IP/MAC 이 없으면 `sameValues` 가 비교하지 않는다(GC-02).
  - 개요 칩 판정의 `fieldsOf` 는 87 IP/MAC 을 쓰지 않는다.
- **30-07 재배포 범위:** webapp push 만 하면 된다(shared 는 webapp 번들에 들어간다). relay · server 재배포는 필요 없다.
- **한계:** gh-trade 전파(46a10ce9)는 아직 KB120/121 에 배포되지 않았다. 배포 전 실서버의 공유 계좌 IP/MAC 저장은 지금처럼 code 7 이고, 웹은 원문을 보여 준다(P30-E7). 배포 뒤 실제로 함께 바뀌는지는 30-07 UAT 몫이다(coverage D6).

## Verification

- Task 1: shared build, users-client 16 passed(「P30 공유 계좌」 포함), webapp typecheck exit 0.
- Task 2: shared admin + admin-overview 83 passed, webapp `src/components/admin` 186 passed, typecheck exit 0. 주석 줄을 뺀 `.code` 사용은 0건이다.
- Task 3:
  - typecheck:e2e exit 0. 포트 3100 이 비어 있음을 확인한 뒤 `admin.spec.ts --workers=1` 를 돌려 23 passed(setup · P29 12 · P30-E1~E7 10).
  - 회귀 게이트: shared vitest 542 passed, webapp vitest 3892 passed(+1 skipped, 원래 있던 것). webapp · relay · relay tests · server typecheck 는 모두 exit 0 이다.

## Deviations from Plan

None - plan executed exactly as written.

(실행 메모 하나. E7 스크린샷이 결과 줄을 뷰포트 끝에서 잘라 찍어서, 찍기 전에 `result.scrollIntoViewIfNeeded()` 를 더했다. 화면 결함이 아니라 스크린샷 구도 문제라 deviation 으로 세지 않는다.)

## Issues Encountered

None.

## Known Stubs

None. `NO_USERS`(빈 배열)는 `users` prop 을 넘기지 않는 호출자를 위한 기본값이다. UsersClient 는 늘 개요 users 를 넘긴다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 30-07(배포 · 인박스 닫기)만 남았다. 이 플랜은 webapp · shared 만 바꿨다. 그래서 30-07 은 webapp push 와, gh-trade 46a10ce9 의 KB120/121 배포 뒤 공유 계좌 저장 실서버 확인이면 된다.

## Self-Check: PASSED

- 수정 파일 9개가 존재한다. 커밋 3586337c · 09d02508 · 74dc2aa3 · 5687c282 가 HEAD 의 조상이다.
- 수용 기준을 모두 확인했다(PASS):
  - `export function findSharedAccountHolders` 1, `data-slot="admin-account-edit-shared"` 1, `findSharedAccountHolders(` 1, `users={state.data.users}` 1, `users={users}` 1
  - shared describe 「P30 공유 계좌」 2, `.code` 0
  - `ADMIN_SHARED_ACCOUNT = '11122233304'` 1, `ADMIN_CODE7_MESSAGE` 1, 「261011」 2, 「P30-E6|P30-E7」 3
