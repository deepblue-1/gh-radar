---
phase: 29-dma-multi-server-admin
plan: 27
subsystem: database
tags: [cr-01, gap-closure, pgtap, plpgsql, relay, express, admin, dma-linked, ops-sql]
status: complete

requires:
  - phase: 29-26
    provides: "Phase 29 원격 배포 완료 상태 · pgTAP 러너 --until/--with/--test 경로"
provides:
  - "마이그레이션 20261010200000 — dma_admin_create_dma_user 같은 시그니처 CREATE OR REPLACE · app_users FOR UPDATE + P0001 DMA_LINKED · 끝 UPDATE dma_user_id IS NULL 이중 방어 (원격 적용은 29-41)"
  - "pgTAP dma_admin_create_guard.test.sql 19건 — 연결된 이메일 재생성 거부 · 행 수/연결 불변 · 종전 오류 코드 회귀 · 오버로드 없음 · 권한"
  - "relay INTENT_ERROR_CODES · INTENT_MESSAGE += DMA_LINKED → 409 그대로"
  - "Express POST /api/admin/users — dma 가 있으면 upsert 전 dma_user_id 사전 확인 → 409 DMA_LINKED (upsert 0 · relay 0)"
  - "운영 점검 쿼리 supabase/ops/29-orphan-dma-users.sql (읽기 전용 · 29-41 배포 창에서 메인 세션 실행)"
  - "생성 시트 409 DMA_LINKED 하단 한 줄 회귀 테스트"
affects: [29-41, 29-gap-closure]

tech-stack:
  added: []
  patterns:
    - "업무 가드는 DB RPC 가 정본, Express 는 쓰기 전에 거르는 앞단 — 같은 코드(DMA_LINKED)를 두 층이 같은 문구로 낸다"
    - "운영 점검 SQL 은 supabase/ops/ 에 읽기 전용 SELECT 로 두고, 러너 --with 로 재생 스키마에 적용해 문법 · 열 이름을 검증"

key-files:
  created:
    - supabase/migrations/20261010200000_dma_admin_create_dma_linked.sql
    - supabase/tests/dma_admin_create_guard.test.sql
    - supabase/ops/29-orphan-dma-users.sql
  modified:
    - relay/src/admin/intent-store.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/helpers/admin-db-fake.ts
    - relay/tests/admin-api.test.ts
    - server/src/routes/admin.ts
    - server/tests/routes/admin-dma.test.ts
    - webapp/src/components/admin/__tests__/user-create-sheet.test.tsx

key-decisions:
  - "DB 가드 순서 = NO_APP_USER → DMA_LINKED → DMA_USER_EXISTS → NO_SERVERS — 연결된 이메일이 같은 DMA id 를 재사용해도 DMA_LINKED 가 먼저(pgTAP 5번이 잠금)"
  - "끝 UPDATE 에 dma_user_id IS NULL 조건 + 0행이면 DMA_LINKED — FOR UPDATE 잠금과 이중 방어"
  - "relay 대역 DB(admin-db-fake)에 이메일 → DMA id 연결 맵(appUserDma)을 두고 seedUser(email) · 생성 성공 시 연결, 삭제 시 연결 해제(ON DELETE SET NULL) — DB 와 같은 순서로 DMA_LINKED"
  - "Express 사전 확인의 조회 오류 경로 테스트는 넣지 않음 — 목의 select 오류 주입이 requireAdmin 역할 조회부터 막아 무엇도 증명하지 못한다"

requirements-completed: [ADMIN-03, ADMIN-09]

coverage:
  - id: D1
    description: "DB 정본 가드 — 이미 DMA 가 연결된 이메일로 생성 RPC 호출 시 P0001 DMA_LINKED, 의도 표 3종 행 수와 app_users 연결 불변"
    requirement: ADMIN-09
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_create_guard.test.sql (19/19 PASS · --until 20261007200100 에서 8건 not ok)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_intent.test.sql (69/69 회귀 PASS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay 가 DB 의 DMA_LINKED 를 409 { error: { code: DMA_LINKED } } 로 그대로 올림 · 44 0건 · 의도 표 불변 · 감사 1줄 rejected"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#T5 (29-27 CR-01) 이미 DMA 가 연결된 이메일 → 409 DMA_LINKED 그대로"
        status: pass
    human_judgment: false
  - id: D3
    description: "Express POST /api/admin/users — 연결된 이메일 + dma 는 upsert 전 409 DMA_LINKED (upsert 0 · 역할 그대로 · relay 0), 미연결 이메일은 종전 경로"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#(29-27 CR-01) 이미 DMA 가 연결된 이메일 + dma → 409 DMA_LINKED"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#(29-27) 연결 없는 기존 사용자 + dma → 종전 경로"
        status: pass
    human_judgment: false
  - id: D4
    description: "생성 시트가 409 DMA_LINKED 를 하단 한 줄(서버 문구)로 보이고 DMA id 칸 오류와 섞이지 않음 · 시트 유지"
    requirement: ADMIN-03
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/user-create-sheet.test.tsx#(29-27 CR-01) 409 DMA_LINKED → 하단 한 줄"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 고아 DMA 유저 점검 쿼리(읽기 전용) — 재생 스키마에 오류 없이 적용, 원격 실행은 29-41 배포 창"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --with supabase/ops/29-orphan-dma-users.sql --test supabase/tests/dma_admin_create_guard.test.sql (exit 0)"
        status: pass
    human_judgment: true
    rationale: "원격 운영 DB 에서의 실제 결과(고아 행 유무)와 정리 여부는 29-41 배포 창에서 사용자가 보고 정한다"

actuals:
  tokens: 8100
  tasks: 2
  commits: 2
plan_head_before: f45d11cebad2244f836fed94978572243caced3f
plan_head_after: 2b7fdd1ddb913836b10861e41266f445118552f6

duration: 7min
completed: 2026-10-10
---

# Phase 29 Plan 27: CR-01 「+ 사용자」 DMA 덮어쓰기 차단 Summary

**DB 생성 RPC 가 정본 가드다. `app_users` 행을 `FOR UPDATE` 로 잠그고 이미 연결돼 있으면 P0001 `DMA_LINKED` 로 거부한다. relay 는 이 코드를 409 로 그대로 올리고, Express `POST /users` 는 upsert 전에 같은 409 로 먼저 거른다. 이로써 「+ 사용자」 가 기존 DMA 연결을 덮어써 옛 DMA 유저를 고아로 만드는 경로가 세 층 모두에서 닫혔다. 배포 창용 읽기 전용 고아 점검 쿼리도 함께 넣었다.**

## Performance

- **Duration:** 약 7분
- **Started:** 2026-10-10T07:54:14Z
- **Completed:** 2026-10-10T08:00:53Z
- **Tasks:** 2
- **Files modified:** 10 (신규 3 · 수정 7)

## Accomplishments

- **DB(정본)**: 새 마이그레이션 `20261010200000_dma_admin_create_dma_linked.sql` 은 시그니처 `(text, text, text, jsonb, text[])` 를 그대로 둔 채 함수를 CREATE OR REPLACE 한다. 처음 단계에서 대상 `app_users.dma_user_id` 를 `FOR UPDATE` 로 읽는다. 행이 없으면 `NO_APP_USER`, 값이 있으면 `DMA_LINKED` 로 끝나고, 그다음은 종전 순서(`DMA_USER_EXISTS` · `NO_SERVERS`)다. 끝 `UPDATE` 에도 `dma_user_id IS NULL` 조건을 붙였고 0행이면 `DMA_LINKED` 로 거부한다. 권한 3줄은 같은 시그니처로 다시 적었다. `20261006200200` 은 고치지 않았다.
- **relay**: `INTENT_ERROR_CODES` 에 `"DMA_LINKED"` 를, `INTENT_MESSAGE.DMA_LINKED` 에 「이미 DMA 가 연결된 웹 사용자입니다」 를 넣었고, 라우터 머리 409 목록에도 추가했다. 전에는 목록 밖 P0001 이라 `INTERNAL` 로 접혀 500 이 났다. 이제는 409 다.
- **Express**: `POST /users` 는 `body.dma` 가 있을 때 `requireRelayAdmin` 뒤 · upsert 앞에서 `app_users.dma_user_id` 를 `maybeSingle` 로 읽는다. 오류면 `DbError`, 값이 있으면 `DmaLinked()` 409 다. 그래서 역할 변경(upsert)도 일어나지 않는다.
- **화면**: 생성 시트의 409 `DMA_LINKED` 는 하단 한 줄 「만들지 못했어요 · 이미 DMA 가 연결된 사용자예요.」 로 보인다. DMA id 칸 오류와 섞이지 않고 시트도 닫히지 않는다. 화면 코드는 바꾸지 않았다(`dmaConnectFailure` 가 이미 그 갈래다).
- **운영**: `supabase/ops/29-orphan-dma-users.sql` 은 어떤 `app_users` 에도 연결되지 않은 `dma_users` 를 나열한다. 열은 DMA id · 생성 시각 · 의도 등록 서버(`키:상태`) · 87 반영 서버다. 읽기 전용 SELECT 하나뿐이다.

## TDD 기록 (Task 1 · Task 2)

### RED — pgTAP, 수정 전 컷오프 `--until 20261007200100`

`bash scripts/verify-dma-orders-price-check.sh --until 20261007200100 --test supabase/tests/dma_admin_create_guard.test.sql` → exit 1

```
# replayed 65 migrations (until 20261007200100)
1..19
ok 1 - (create cg-x → cgd1 첫 연결, 성공)
ok 2 - (app_users cg-x, dma_user_id = cgd1)
not ok 3 - (create 연결된 cg-x → 새 cgd2, DMA_LINKED)
#       caught: no exception
#       wanted: P0001
not ok 4 - (create 연결된 cg-x · 대문자 · 공백 이메일, DMA_LINKED)
#       caught: P0001: DMA_USER_EXISTS
not ok 5 - (create 연결된 cg-x · 같은 cgd1 재사용, DMA_LINKED 가 DMA_USER_EXISTS 보다 먼저)
#       caught: P0001: DMA_USER_EXISTS
not ok 6 - (DMA_LINKED 뒤, dma_users 에 cgd2 없음)            have: 1  want: 0
not ok 7 - (DMA_LINKED 뒤, dma_users 행 수 불변)              have: 2  want: 1
not ok 8 - (DMA_LINKED 뒤, dma_user_accounts 행 수 불변)      have: 2  want: 1
not ok 9 - (DMA_LINKED 뒤, dma_account_servers 행 수 불변)    have: 2  want: 1
not ok 10 - (DMA_LINKED 뒤, app_users cg-x 연결 = cgd1 그대로)  have: cgd2  want: cgd1
ok 11 … ok 19
# Looks like you failed 8 tests of 19
```

**의미 판정**: 대상 단언이 계획한 이유로 실패했다. 옛 함수는 예외 없이 연결을 cgd2 로 덮어쓰고 고아 행을 남겼다(3 · 6~10). 4 · 5 는 앞선 호출이 cgd2 를 이미 만들었거나 cgd1 이 이미 있어서 `DMA_USER_EXISTS` 가 먼저 났다. 둘 다 CR-01 의 같은 결함을 보여 준다. 픽스처 · 문법 · 로드 실패는 없었다(1 · 2 · 11~19 ok).

### RED — relay / server

- relay `T5` 는 대역 DB 가 `DMA_LINKED` 를 냈지만 relay 가 그 코드를 몰랐다. 그래서 `INTERNAL` 로 접혀 `expected 500 to be 409` 로 실패했다.
- server `(29-27 CR-01)` 케이스는 사전 확인이 없어 upsert → relay 경로가 그대로 돌았다. 결과는 `expected 200 to be 409` 실패였다.

### GREEN

- pgTAP `dma_admin_create_guard.test.sql`: **19/19 PASS**(66 마이그레이션 재생). 기존 `dma_admin_intent.test.sql` 회귀도 **69/69 PASS** 다.
- relay: `typecheck` · `typecheck:tests` 0 오류. `tests/admin-api.test.ts` **23/23**. 대역을 공유하는 `admin-dispatcher.test.ts` · `quote-switch.test.ts` 도 **28/28** 이다.
- server: `typecheck` 0 오류. `tests/routes/admin-dma.test.ts` + `tests/routes/admin.test.ts` **87/87**.
- webapp: `typecheck`(tsc + e2e tsconfig) 0 오류. `user-create-sheet.test.tsx` **13/13**.
- ops: `--with supabase/ops/29-orphan-dma-users.sql --test …create_guard…` 는 exit 0 이다(적용 실패 5 아님). 의미 확인용 일회성 pgTAP(스크래치 · 미커밋)에서 이 파일의 쿼리 본문을 그대로 뷰로 감싸 3/3 PASS 를 얻었다. 연결된 DMA 는 빠지고 고아만 나왔으며, `intent_servers` = `KB120:active · KB121:removing`, `reflected_servers` 는 중복 없이 키 순이었다.

Task 2 의 생성 시트 케이스는 회귀 고정용이다. 처음 실행부터 통과했다. 계획대로 화면 코드는 이미 그 동작이었고 바꾸지 않았다.

## Task Commits

1. **Task 1: 트레이서 — DB 가드 DMA_LINKED → relay 409 → Express 사전 409** - `075e3916` (fix)
2. **Task 2: 고아 DMA 유저 점검 쿼리 · 생성 시트 DMA_LINKED 회귀** - `2b7fdd1d` (test)

트레이서 게이트: 대화형 · `end-of-phase` · `<verify>` 는 automated 만이라 세 verify 를 다시 돌렸다. 전부 green 이어서 Task 2 로 넘어갔다.

## Files Created/Modified

- `supabase/migrations/20261010200000_dma_admin_create_dma_linked.sql` — 생성 RPC 를 같은 시그니처로 교체한다. DMA_LINKED 가드와 권한 3줄이 들어 있다.
- `supabase/tests/dma_admin_create_guard.test.sql` — pgTAP 19건.
- `supabase/ops/29-orphan-dma-users.sql` — 고아 DMA 유저 점검(읽기 전용).
- `relay/src/admin/intent-store.ts` — `INTENT_ERROR_CODES` += `DMA_LINKED`.
- `relay/src/admin/admin-api.ts` — `INTENT_MESSAGE.DMA_LINKED` · 머리 409 목록.
- `relay/tests/helpers/admin-db-fake.ts` — `appUserDma` 연결 맵 · 생성 RPC 의 DB 동일 순서 거부 · 삭제 시 연결 해제.
- `relay/tests/admin-api.test.ts` — T5.
- `server/src/routes/admin.ts` — `POST /users` 사전 확인 · 주석(정본 가드 = DB).
- `server/tests/routes/admin-dma.test.ts` — 연결된 이메일 409 케이스 · 미연결 종전 경로 케이스.
- `webapp/src/components/admin/__tests__/user-create-sheet.test.tsx` — 409 DMA_LINKED 하단 한 줄 케이스.

## Decisions Made

- 가드 순서는 `NO_APP_USER → DMA_LINKED → DMA_USER_EXISTS → NO_SERVERS` 다. 연결된 사용자가 같은 DMA id 를 다시 넣어도 「이미 연결됨」 이 먼저 보이는 것이 맞다.
- relay 대역 `seedUser({ email })` 은 이제 그 이메일을 DMA id 에 연결한다. 실제 DB 에서도 email 이 있는 시드는 연결된 사용자이고, 기존 호출처(admin-dispatcher)는 email 없이 시드하므로 영향이 없다.
- Express 사전 확인의 「조회 오류 → DB_ERROR」 테스트는 넣지 않았다. 목의 select 오류 주입이 `requireAdmin` 의 역할 조회부터 막아서, 그 테스트는 사전 확인 코드를 증명하지 못한다.

## Deviations from Plan

### 실행 위치 조정

**1. [Rule 3 - Blocking] `<automated>` 명령의 `cd /Users/alex/repos/gh-radar` 대신 이 worktree 루트에서 같은 명령을 실행**
- **Found during:** Task 1 시작 전(worktree-path-safety step 0c)
- **Issue:** 플랜의 verify 명령은 main checkout 으로 `cd` 한다. worktree 실행에서 그대로 돌리면 이 worktree 의 변경이 아니라 main tree 를 검증하게 된다.
- **Fix:** 접두 `cd` 만 빼고 같은 명령(같은 스크립트 · 같은 필터 · 같은 테스트 파일 · `--maxWorkers=1`)을 worktree 루트에서 실행했다. 플랜 파일은 고치지 않았다.
- **Files modified:** 없음
- **Verification:** 모든 결과는 worktree 의 새 파일을 대상으로 나왔다(마이그레이션 66개 재생 · T5 등 신규 케이스 실행).

---

**Total deviations:** 1건(Rule 3 — 실행 위치)
**Impact on plan:** 코드 · 범위 변화는 없다. 이후 갭 클로징 플랜도 worktree 로 실행한다면 `<automated>` 를 저장소 루트 기준 상대 명령으로 쓰는 편이 맞다.

## Issues Encountered

None

## User Setup Required

None. 원격 적용은 29-41 [BLOCKING] 배포 창 몫이다. 메인 세션이 그때 할 일은 두 가지다. ① `supabase db push --linked --yes` 대상에 `20261010200000` 이 오른다. ② `supabase/ops/29-orphan-dma-users.sql` 을 읽기 전용으로 1회 실행하고 결과를 사용자에게 보인다.

## Next Phase Readiness

- CR-01 갭의 truth(「DMA user_id 는 웹유저당 1개 — 어느 경로로도 덮어써지지 않는다」)가 DB · relay · Express · 화면 네 곳에서 테스트로 고정됐다.
- 남은 일은 원격 적용(29-41)과 고아 점검 결과 확인이다. relay 를 배포하기 전에 DB 가 먼저 적용되어도 괜찮다. 옛 relay 는 `DMA_LINKED` 를 몰라 500 을 내지만, Express 사전 확인이 앞에서 409 로 거르므로 정상 경로로는 닿지 않는다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*

## Self-Check: PASSED
