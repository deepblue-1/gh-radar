---
phase: 30-kb-ip-mac
plan: 06
subsystem: webapp-admin-e2e
tags: [webapp, admin, e2e, playwright, order-ip-mac, backstop, regression-gate]
status: complete

requires:
  - phase: 30-02
    provides: "shared normalizeOrderIp · normalizeOrderMac · normalizeAccountNo (목 API 가 서버 정규화를 흉내 낼 때 한 벌로 쓴다)"
  - phase: 30-03
    provides: "AdminAccountView.orderEndpoints · AdminPutAccountBody.orderEndpoint 계약"
  - phase: 30-04
    provides: "카드 편집 모드 · 한 카드 잠금 · 결과 줄"
  - phase: 30-05
    provides: "IP/MAC 편집칸 · 검증 · 보내기 규칙 · 「변경 없음」 · data-slot 들"
provides:
  - "e2e 픽스처 ADMIN_USERS_FIXTURE_P30(설정·일치 · 불일치 · 40자 이름 · 미설정 KB 계좌) · ADMIN_CODE13_MESSAGE"
  - "목 PUT /dma-users/:dma/accounts — 계좌명 반영 · orderEndpoint 를 shared 로 정규화해 active 등록 서버 전부 반영 · 형식/짝 오류면 서버마다 failed code 13"
  - "P30-E1 ~ E5 Admin E2E(390 · 1080 · 7건) + UI-SPEC backstop 3종(E1 overflow · E2 long-text · E4 overflow) 단언"
  - "계좌 카드 제목줄 계좌번호 shrink-0 — 말줄임은 계좌명만"
affects: [30-07, webapp-account-editor, webapp-e2e-admin]

actuals:
  tokens: 6443
  tasks: 2
  commits: 3
plan_head_before: c46662e2f04cba4a6652cb224ed1ab701fbe2062
plan_head_after: 5b20fd2098c65aa8377cd450e4a669fe373f0061

tech-stack:
  added: []
  patterns:
    - "목 API 의 서버 흉내는 shared 정규화 함수를 런타임 import 해 쓴다 — 서버 규칙과 테스트 규칙이 두 벌이 되지 않게"
    - "backstop 은 스크린샷이 아니라 단언 — 좌표(leavesOverflowing) · 자기 스크롤 폭(scrollWidth − clientWidth) · 상자 겹침(disjoint) · 말줄임 실제 작동(text-overflow ellipsis + 내용 폭 > 상자 폭)"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-06-SUMMARY.md
  modified:
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts
    - webapp/src/components/admin/account-editor.tsx

key-decisions:
  - "P30 계좌 상태는 ADMIN_USERS_FIXTURE 복제(ADMIN_USERS_FIXTURE_P30)에만 붙였다 — P29 테스트는 원본 픽스처 그대로(카드는 「확인 전」) · alex 에 KB 계좌 2개(불일치 11122233302 · 40자 이름 11122233303)를 더했다"
  - "목 PUT 은 서버 집합을 바꾸지 않는다(이름 · IP/MAC 만) — P29 토글 시나리오는 종전처럼 onRequest 가 맡는다. 새 계좌(추가 폼)는 상태에 없으면 종전처럼 ok 만"
  - "code 13 은 웹 검증이 형식 오류를 먼저 막으므로 onRequest 로 정상 값 PUT 에 failed code 13 을 돌려주어 본다(플랜 그대로)"
  - "계좌번호 span 은 shrink-0 — UI-SPEC E2 「계좌명은 truncate 로 한 줄」 은 계좌명만 줄인다는 뜻. 계좌번호가 같이 줄면 식별자가 잘린다"

patterns-established:
  - "P30 E2E 는 접근 이름(「KB {계좌} 편집」 · 「… 편집 저장」 · 「… 편집 취소」 · exact) · 라벨(「주문자 IP」 · 「MAC 주소」 · 「계좌명」) · data-slot(admin-account-ipmac · -ipmac-mismatch · -edit · -edit-help · -edit-invalid · -edit-result)으로 찾는다"

requirements-completed: [IPMAC-02, IPMAC-03, IPMAC-05]

coverage:
  - id: D1
    description: "읽기 카드 IP/MAC 줄 — 설정 87 정규화값 그대로 · 미설정 「미설정(서버 NIC 값)」 · 불일치 경고 줄 1개(KB121 미설정) · 교보 줄 없음 (390 · 1080)"
    requirement: IPMAC-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E1 IP/MAC 읽기 줄 · 불일치 · 긴 이름 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D2
    description: "편집 → 원문(10.41.1.124 · 1c:fd:08:7d:97:8e) 저장 → PUT 1건 · orderEndpoint 원문 · account 에 IP/MAC 키 없음 → 재조회 뒤 010041001124 · 1CFD087D978E → 다른 표기 같은 값은 요청 없이 「변경 없음」 (D-06 · D-07)"
    requirement: IPMAC-02
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E2 편집 → IP/MAC 저장 → 정규화 표기 · 변경 없음 (390) · (1080)"
        status: pass
    human_judgment: false
  - id: D3
    description: "IP 만 적으면 MAC 칸 aria-invalid · 짝 오류 문구 · 저장 disabled · code 13 결과 줄 「KB120 실패: {gh-trade 원문}」 · 편집 유지 · 입력값 유지 · 한 카드 잠금(다른 카드 「편집」 disabled · title 「다른 계좌 편집 중」)"
    requirement: IPMAC-03
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E3 검증 · code 13 원문 · 한 카드 잠금 (1080)"
        status: pass
    human_judgment: false
  - id: D4
    description: "계좌명만 바꿔 저장 → PUT 1건(orderEndpoint 키 없음 · servers 기존 active) → 재조회 뒤 제목줄 새 이름 · 「+ 계좌 추가」 폼에 IP/MAC 칸 · 문구 없음 (D-08)"
    requirement: IPMAC-05
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E4 계좌명 편집 → 카드 새 이름 (1080)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E5 계좌 추가 폼에는 IP/MAC 칸이 없다 (1080)"
        status: pass
    human_judgment: false
  - id: D5
    description: "UI-SPEC backstop 3종 — E1 IP/MAC · 불일치 줄 카드 밖으로 안 밀림 · 자기 상자 안 / E2 40자 계좌명 말줄임 한 줄 · 「편집」 · 「제거」 · 계좌번호와 겹치지 않음 · 계좌번호 안 잘림 / E4 2열 칸 placeholder 값 안 잘림 · 도움말 감김"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#P30-E1 (390) backstop E1 · E2 단언 · P30-E2 (390) backstop E4 단언"
        status: pass
      - kind: screenshot
        ref: "test-results/…P30-E1…390/admin-ipmac-read-390.png · …P30-E2…390/admin-ipmac-edit-390.png (육안 확인 — 계좌번호 11122233303 전체 · 이름 말줄임 · 칸 placeholder 온전)"
        status: pass
    human_judgment: false
  - id: D6
    description: "페이즈 회귀 게이트 — shared 519 · relay 1516 · server 508 · webapp 3882(+1 skipped) 단위 · build_command 타입체크 · server 타입체크 · admin.spec.ts 전체 20 passed"
    verification:
      - kind: command
        ref: "pnpm --filter @gh-radar/shared exec vitest run · relay run test · server exec vitest run · webapp run test (전부 --maxWorkers=2) · build_command · server typecheck · playwright admin.spec.ts --workers=1"
        status: pass
    human_judgment: false

duration: 13 min
completed: 2026-10-11
---

# Phase 30 Plan 06: P30 Admin E2E · backstop · 페이즈 회귀 게이트 Summary

**실제 Next 화면(목 API)에서 KB 주문자 IP/MAC 읽기 · 편집 · 원문 저장 → 정규화 표기 · 「변경 없음」 · 짝 검증 · code 13 원문 · 한 카드 잠금 · 계좌명 편집 · 추가 폼 무변경을 폰 390 · 데스크톱 1080 에서 증명하고, UI-SPEC backstop 3종을 단언으로 잠갔다. backstop 첫 실행이 폰에서 계좌번호가 「11…」 로 잘리는 결함을 잡아 계좌번호를 shrink-0 으로 고쳤다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-11T06:45:39Z
- **Completed:** 2026-10-11T06:58:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **픽스처(Task 1):** `ADMIN_USERS_FIXTURE_P30` — alex 위탁 11122233301 KB120 · KB121 설정 일치(`010041001124` · `1CFD087D978E`), alex 단타 11122233302 불일치(KB120 설정 · KB121 미설정), alex 11122233303 40자 계좌명 · 미설정, kim 위탁 12345678901 미설정, 교보는 빈 문자열(화면에 줄 없음). `ADMIN_CODE13_MESSAGE` = gh-trade 원문. 목 PUT `/dma-users/:dma/accounts` 가 계좌명을 반영하고 `orderEndpoint` 는 shared `normalizeOrderIp`/`normalizeOrderMac` 로 처리 — 성공 · 짝 맞음이면 active 등록 서버 전부 갱신 · ok, 아니면 상태 그대로 · 서버마다 failed code 13. `ADMIN_USERS_FIXTURE` 는 그대로(P29 12건 통과).
- **E2E(Task 2):** `P30-E1`(390 · 1080) 읽기 줄 4종 + backstop E1 · E2, `P30-E2`(390 · 1080) 원문 저장 → 정규화 표기 → 「변경 없음」 + backstop E4, `P30-E3` 짝 검증 · code 13 원문 · 잠금 · 취소로 잠금 해제, `P30-E4` 계좌명만 저장(`toEqual` 로 orderEndpoint 키 없음까지), `P30-E5` 추가 폼 IP/MAC 없음.
- **결함 수정:** 계좌 카드 제목줄 계좌번호 span `min-w-0 truncate` → `shrink-0`. 40자 계좌명과 「편집」 · 「제거」 버튼이 같은 줄에 서면 계좌번호도 함께 줄어 「11…」 로 잘렸다(폰 390 · scrollWidth 97 / clientWidth 35).
- **회귀 게이트:** shared 519 · relay 1516 · server 508 · webapp 3882 passed(+1 skipped — 기존) · build_command 타입체크 · server 타입체크 · Admin E2E 20 passed(setup + P29 12 + P30 7).

## Task Commits

1. **Task 1: e2e 픽스처 — orderEndpoints · PUT 이 이름 · IP/MAC 반영 · code 13 흉내** — `b21b28cf` (test)
2. **Task 2: P30 E2E 시나리오(390 · 1080) + backstop 3종 + 페이즈 회귀**
   - `75e54d92` fix(30-06): 계좌번호 shrink-0 (backstop 이 찾은 결함 — Rule 1)
   - `5b20fd20` test(30-06): P30-E1 ~ E5

## Files Created/Modified

- `webapp/e2e/fixtures/admin.ts` — 머리 주석 ⑤ · shared 정규화 런타임 import · `ADMIN_CODE13_MESSAGE` · `ADMIN_ORDER_IP/MAC` · `ADMIN_MISMATCH_ACCOUNT` · `ADMIN_LONG_NAME_ACCOUNT` · `ADMIN_LONG_ACCOUNT_NAME` · `ADMIN_USERS_FIXTURE_P30` · PUT accounts 분기
- `webapp/e2e/specs/admin.spec.ts` — 머리 주석 ⑤ · `openUserSheet` · `disjoint` · `ownOverflow` · P30-E1 ~ E5(7 테스트)
- `webapp/src/components/admin/account-editor.tsx` — `AccountTitle` 계좌번호 span `shrink-0 tabular-nums`(1줄 + 주석)

## Decisions Made

frontmatter `key-decisions` 참조. 요지: P30 상태는 복제 픽스처에만 · 목 PUT 은 이름 · IP/MAC 만(서버 집합 불변) · code 13 은 onRequest 로 · 말줄임은 계좌명만.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 폰 390 계좌 카드에서 긴 계좌명이 계좌번호를 「11…」 로 잘랐다**
- **Found during:** Task 2 (P30-E1 390 스크린샷 확인)
- **Issue:** `AccountTitle` 의 계좌번호 span 이 계좌명과 같은 `min-w-0 truncate` 라, 40자 계좌명 + 「편집」 · 「제거」 버튼이 한 줄에 서면 flex 수축이 계좌번호까지 나눠 줄였다(scrollWidth 97 · clientWidth 35). UI-SPEC E2 는 계좌명만 truncate 한다.
- **Fix:** 계좌번호 span → `shrink-0 tabular-nums`. P30-E1 에 계좌번호 자기 스크롤 폭 ≤ 1 · 계좌명 상자와 겹치지 않음 단언을 더했다.
- **Files modified:** webapp/src/components/admin/account-editor.tsx · webapp/e2e/specs/admin.spec.ts
- **Verification:** P30-E1 (390 · 1080) 통과 · 스크린샷에 「11122233303 연금저축 장…」 · admin 컴포넌트 176 passed · webapp typecheck · eslint 0
- **Commit:** 75e54d92

**2. [Rule 1 - Bug] 내 첫 테스트의 계좌번호 단언이 엉뚱한 요소를 쟀다**
- **Found during:** Task 2 — 첫 실행에서 7건이 다 통과했는데 스크린샷에는 잘린 계좌번호가 보였다.
- **Issue:** 계좌번호 텍스트로 찾은 뒤 `preceding-sibling::span[1]` 을 재서, 실제로는 「KB」 배지(안 넘침)를 쟀다.
- **Fix:** 계좌번호 span 자체를 잰다. 고치기 전 클래스에서 이 측정이 실패(97 vs 35)하는 것을 디버그 실행으로 확인했다. 디버그 spec 은 지웠다.
- **Files modified:** webapp/e2e/specs/admin.spec.ts
- **Commit:** 5b20fd20(spec 첫 커밋 전에 고쳤다)

**Total deviations:** 2 auto-fixed (Rule 1 ×2). **Impact:** 제품 1줄 수정. 플랜 범위(제목줄 long-text backstop)에서 나온 결함이라 범위 밖 변경은 없다.

- 참고(편차 아님): 회귀 게이트의 vitest 는 오케스트레이터 지시(동시 세션 메모리)에 따라 `--maxWorkers=2` 로 한 번에 한 스위트씩 돌렸다. Playwright 는 `--workers=1`, 3100 포트가 비어 있는 것을 확인한 뒤 이 checkout 에서 webServer 를 띄웠다.
- 디버그 실행 직후 E1 재실행 한 번이 webServer 120초 타임아웃으로 떨어졌다(NextFont 반복 로그 없음 · 3100 비어 있음). `.next` 를 지우지 않고 그대로 다시 돌려 통과했다.

## Issues Encountered

None — 위 webServer 타임아웃 1회는 재실행으로 끝났다.

## Known Stubs

없음.

## Next Phase Readiness

- 30-07(배포)의 전제인 전 워크스페이스 단위 테스트 · 타입체크 · Admin E2E 가 green 이다. push 는 하지 않았다(master push = webapp 프로덕션 배포).
- 75e54d92 는 webapp 화면 코드라, 30-07 배포 때 함께 나간다.

## Self-Check: PASSED

- FOUND: webapp/e2e/fixtures/admin.ts · webapp/e2e/specs/admin.spec.ts · webapp/src/components/admin/account-editor.tsx
- FOUND commits (HEAD 조상): b21b28cf · 75e54d92 · 5b20fd20
- 수용 기준: `export const ADMIN_USERS_FIXTURE_P30` 1줄 · `export const ADMIN_CODE13_MESSAGE` 1줄 · `normalizeOrderIp` 2줄 · typecheck:e2e exit 0 · `-g "P29"` 12 passed(+setup) · `grep -c "P30-E"` 6 · `-g "P30"` 7 passed(+setup) · admin.spec.ts 20 passed · backstop E1(leavesOverflowing · ownOverflow · scrollOverflowing) · E2(높이 · ellipsis · disjoint · 계좌번호 안 잘림) · E4(입력 scrollWidth ≤ clientWidth · 도움말 leavesOverflowing) 단언이 코드에 있다
