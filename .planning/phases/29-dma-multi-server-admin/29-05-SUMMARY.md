---
phase: 29-dma-multi-server-admin
plan: 05
subsystem: database
tags: [supabase, postgres, pgtap, rpc, security-definer, dma-admin, admin-raw]

requires:
  - phase: 29-dma-multi-server-admin
    provides: "29-01 표(app_users · dma_servers · dma_users · dma_user_accounts · dma_account_servers) · 증권사 트리거 · 잠금 4줄 · RPC 권한 3줄 패턴"
  - phase: 29-dma-multi-server-admin
    provides: "29-04 shared 계약 — AdminIntentRow · AdminSnapshotAccountRow · AdminResultRow · AdminUsersRaw · AdminServersRaw(userCounts { serverKey, users }) camelCase 키"
provides:
  - "의도 변경 RPC 7종: dma_admin_create_dma_user · dma_admin_set_password · dma_admin_put_account · dma_admin_mark_account_removed · dma_admin_settle_server · dma_admin_delete_dma_user · dma_admin_intent"
  - "87 반영 상태 표 dma_server_snapshots · dma_server_user_accounts + dma_admin_apply_snapshot(서버별 원자 교체)"
  - "최근 결과 표 dma_admin_results + dma_admin_record_results"
  - "개요 원자료 admin_users_raw()(AdminUsersRaw 7키) · admin_servers_raw()(AdminServersRaw 3키)"
  - "배포 창 입양 dma_admin_adopt_server_accounts(server)"
affects: [29-07, 29-10, 29-11, 29-13, 29-14, 29-25]

actuals:
  tokens: 15580
  tasks: 2
  commits: 2
plan_head_before: e008dd839da9c51f2ecae872d113e652f49d8127
plan_head_after: aeaef3820bee93a27637b0d411711c0ba1de1db9

tech-stack:
  added: []
  patterns:
    - "업무 거부 = RAISE EXCEPTION USING ERRCODE 'P0001', MESSAGE '<CODE>' — Express · relay 가 MESSAGE 로 분기"
    - "유저 단위 변경 RPC 는 dma_users 행 FOR UPDATE 로 같은 유저의 동시 변경을 줄 세운다"
    - "개요 원자료는 jsonb_build_object 한 번 — Cloud Run 왕복 1회"
    - "입양은 데이터 변경 CTE 한 문장(계좌 insert + 등록 행 insert) — 87 원천을 한 스냅숏으로 읽는다"

key-files:
  created:
    - supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql
    - supabase/migrations/20261006200300_dma_admin_reflect.sql
    - supabase/tests/dma_admin_intent.test.sql
    - supabase/tests/dma_admin_reflect.test.sql
  modified: []

key-decisions:
  - "dma_admin_put_account 반환 { activated, removing } = 지금 active 인 등록 서버(정리한 p_servers) · 이 계좌의 removing 서버 전부(키 순)"
  - "dma_admin_settle_server 반환 { deletedRows, deletedAccounts } 는 행 수(정수). user_removed=false 는 removing 행만 지우고 active 는 건드리지 않는다. 없는 DMA id 는 0 · 0(재시도 안전)"
  - "LAST_ACCOUNT = 그 유저의 다른 계좌에 active 등록 서버가 하나도 없을 때. 이미 전부 removing 인 계좌를 다시 제거하면 그대로(멱등)"
  - "SERVER_BROKER_MISMATCH 는 트리거 예외를 잡아 바꾸지 않고 RPC 가 먼저 검사해 낸다(트리거는 최후 방어로 그대로)"
  - "dma_admin_results.dma_user_id 는 dma_users 를 참조하고 ON DELETE CASCADE — 같은 DMA id 를 다시 만들면 옛 실패 칩이 되살아나지 않는다. record_results 는 없는 DMA id · 모르는 서버 결과를 버리고 기록 행 수를 돌려준다"
  - "입양은 의도 표 CHECK(KB branch 5 · trader 6 · 교보 빈 값 · 계좌번호 ≤12)를 못 맞추는 87 행을 건너뛴다. 그 행은 「서버에만 있음」 으로 남고, 반환값은 들여온 (계좌, 서버) 등록 행 수다"
  - "admin_users_raw.pending 은 이메일을 lower(btrim) 으로 보이고 같은 이메일이 여럿이면 가장 이른 가입 시각 1행만 보인다"

patterns-established:
  - "jsonb 원자료 키 = shared 타입 필드 이름 — pgTAP 가 jsonb_object_keys 로 키 집합을 정확히 잠근다"
  - "내부 헬퍼 함수(dma_admin__*)는 SECURITY INVOKER에 anon · authenticated REVOKE. 공개 RPC 만 service_role GRANT"

requirements-completed: [ADMIN-03, ADMIN-05, ADMIN-09, ADMIN-10]

coverage:
  - id: D1
    description: "트레이서 — 생성 RPC → admin_users_raw.intent → apply_snapshot → snapshotAccounts 가 shared camelCase 키로 이어진다"
    requirement: ADMIN-05
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_reflect.test.sql (72/72)"
        status: pass
    human_judgment: false
  - id: D2
    description: "의도 변경 RPC — 생성 · 비밀번호 · 계좌 put(removing) · 제거(LAST_ACCOUNT) · settle · 유저 삭제(SERVERS_REMAIN) · 의도 조회 · 오류 규약 8코드"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_intent.test.sql (69/69)"
        status: pass
    human_judgment: false
  - id: D3
    description: "87 반영 상태(원자 교체 · users_rev 비교 없음 · 교보 빈 값) · 최근 결과 · admin_servers_raw · 입양(dma_users 에 있는 DMA id 만 · 멱등)"
    requirement: ADMIN-10
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_reflect.test.sql (72/72)"
        status: pass
    human_judgment: false
  - id: D4
    description: "회귀 — 앞선 pgTAP 4파일 그대로 통과"
    requirement: ADMIN-09
    verification:
      - kind: integration
        ref: "app_access · dma_registry_intent · dma_gateway_identities · dma_journal_apply — 전부 # RESULT: PASS"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-06
status: complete
---

# Phase 29 Plan 05: DMA 의도 변경 RPC · 87 반영 상태 · Admin 원자료 RPC Summary

**Admin 의 모든 의도 변경(생성 · 비밀번호 · 계좌 put/제거 · settle · 삭제)과 서버별 87 원자 교체 · 최근 결과 · 입양을 service_role 전용 RPC 로 만들었다. `admin_users_raw()` · `admin_servers_raw()` 는 shared `AdminUsersRaw` · `AdminServersRaw` 키를 한 번에 낸다. 마이그레이션 2개를 로컬 pgTAP 141단언(신규)과 회귀 4파일로 확인했다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-10-06T15:12:39Z
- **Completed:** 2026-10-06T15:22Z
- **Tasks:** 2 (Task 1 트레이서 · Task 2)
- **Files created:** 4

## Accomplishments

- **트레이서(Task 1):** `dma_admin_create_dma_user` 를 부르면 `admin_users_raw().intent` 에 그 행이 생기고 `snapshotAccounts` 는 빈 배열이다. 이어서 `dma_admin_apply_snapshot('KB120', 2, …)` 을 부르면 `snapshotAccounts` 에 같은 계좌가 들어간다. 이 한 경로가 shared camelCase 키 그대로 로컬에서 선다. 트레이서 `<verify>` 를 다시 돌려 통과한 뒤에 확장했다.
- **87 적재:** 서버마다 advisory lock 을 잡고 그 서버 행을 지운 뒤 다시 넣는다(`dma_journal_sync_access` 와 같은 방식). `users_rev` 는 7 → 1 로 낮아져도 그대로 저장한다. 빈 `userId` · `accountNo` 가 있으면 교체 전체를 거부해 기존 상태를 지킨다. 교보 계좌의 빈 branch/trader 는 그대로 둔다.
- **의도 변경:** `put_account` 는 목록에서 빠진 서버를 `removing` 으로 돌리고, 목록에 다시 넣은 서버는 `active` 로 되살린다. `mark_account_removed` 는 마지막 active 계좌이면 `LAST_ACCOUNT` 로 거부한다. `settle_server` 는 removing 행(user_removed 이면 그 서버 행 전부)을 지운 뒤 등록 서버가 0 이 된 계좌를 지운다. `delete_dma_user` 는 서버 행이 남아 있으면 `SERVERS_REMAIN` 이고, 지우면 `app_users.dma_user_id` 가 NULL 이 된다.
- **최근 결과 · 서버 원자료:** `dma_admin_results` 는 (DMA 유저, 서버)당 1행으로 upsert 하고, `admin_users_raw.results` 가 이 표를 싣는다. `admin_servers_raw()` 는 servers(전 열) · userCounts(87 의 서로 다른 DMA id 수) · snapshots 를 한 번에 낸다.
- **입양:** `dma_admin_adopt_server_accounts` 는 `dma_users` 에 있는 DMA id 의 87 계좌만 의도로 들여온다(ON CONFLICT DO NOTHING). 두 번째 호출은 0행이고, removing 중인 행은 되살리지 않는다.
- **잠금:** 새 표 3개는 RLS 를 켜고 정책을 두지 않았으며 anon · authenticated 를 명시해 REVOKE 했다. 새 공개 RPC 12종은 anon · authenticated EXECUTE 가 없고 service_role 에만 GRANT 했다.

## Task Commits

1. **Task 1: 트레이서 — 유저 생성 RPC → 87 적재 RPC → admin_users_raw (pgTAP)** — `58d31f53` (feat)
2. **Task 2: 나머지 변경 RPC · 최근 결과 표 · admin_servers_raw · 입양 RPC · 회귀** — `aeaef382` (feat)

## RPC 시그니처

| RPC | 반환 | 파일 | 비고 |
|---|---|---|---|
| `dma_admin_create_dma_user(p_email text, p_dma_user_id text, p_password_enc text, p_account jsonb, p_servers text[])` | `jsonb` `{ dmaUserId }` | 200200 | 이메일 lower(btrim) · 서버 목록 NULL/빈 값/중복 정리 |
| `dma_admin_set_password(p_dma_user_id text, p_password_enc text)` | `void` | 200200 | `password_set_at = now()` |
| `dma_admin_put_account(p_dma_user_id text, p_account jsonb, p_servers text[])` | `jsonb` `{ activated: text[], removing: text[] }` | 200200 | 계좌 upsert · 빠진 서버 removing |
| `dma_admin_mark_account_removed(p_dma_user_id text, p_broker text, p_account_no text)` | `void` | 200200 | 그 계좌 서버 행 전부 removing |
| `dma_admin_settle_server(p_dma_user_id text, p_server_key text, p_removed_accounts text[], p_user_removed boolean)` | `jsonb` `{ deletedRows: int, deletedAccounts: int }` | 200200 | relay 전용 · 멱등 |
| `dma_admin_delete_dma_user(p_dma_user_id text)` | `void` | 200200 | 결과 행 cascade |
| `dma_admin_intent(p_dma_user_id text)` | `jsonb` `AdminIntentRow[]` | 200200 | priority → accountNo → serverKey |
| `dma_admin_apply_snapshot(p_server text, p_users_rev bigint, p_users jsonb)` | `integer`(넣은 계좌 행) | 200300 | `[{ userId, accounts: [{ accountNo, name, branchNo, traderId, priority }] }]` |
| `dma_admin_record_results(p_dma_user_id text, p_results jsonb)` | `integer`(기록 행) | 200300 | `[{ server, outcome, code?, message? }]` |
| `admin_users_raw()` | `jsonb` `AdminUsersRaw` | 200300 | appUsers · pending · intent · snapshots · snapshotAccounts · results · servers |
| `admin_servers_raw()` | `jsonb` `AdminServersRaw` | 200300 | servers · userCounts · snapshots |
| `dma_admin_adopt_server_accounts(p_server text)` | `integer`(들여온 등록 행) | 200300 | 없는 서버 P0002 `server not found` |

## 오류 코드 (ERRCODE P0001 · MESSAGE)

| 코드 | 내는 RPC | 뜻 |
|---|---|---|
| `NO_APP_USER` | create | 허용 표에 그 이메일이 없다 |
| `DMA_USER_EXISTS` | create | 같은 DMA id 가 이미 있다(동시 생성 unique_violation 도 같은 코드) |
| `NO_DMA_USER` | set_password · put_account · delete_dma_user | DMA id 가 없다 |
| `NO_SUCH_ACCOUNT` | mark_account_removed | 그 유저에게 (증권사, 계좌번호) 계좌가 없다 |
| `LAST_ACCOUNT` | mark_account_removed | 마지막 active 계좌 — 유저 삭제로 유도(D-15) |
| `SERVER_BROKER_MISMATCH` | create · put_account | 등록 서버 증권사 ≠ 계좌 증권사 |
| `NO_SERVERS` | create · put_account | 등록 서버 목록이 비었다(NULL · 빈 문자열만인 경우 포함) |
| `SERVERS_REMAIN` | delete_dma_user | 아직 settle 되지 않은 서버 행이 남았다 |

그 밖의 제약 위반은 원래 코드 그대로 올라온다. 의도 표 CHECK 는 23514, 없는 서버 키는 FK 23503 이다. apply · record 의 입력 형식 오류는 P0001 이지만 메시지는 위 코드가 아닌 한국어 문장이다.

## Files Created/Modified

- `supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql`: 의도 변경 RPC 7종과 내부 헬퍼 2종(`dma_admin__server_list` · `dma_admin__activate_servers`)
- `supabase/migrations/20261006200300_dma_admin_reflect.sql`: 반영 표 3개, apply · record, 원자료 2종, 입양
- `supabase/tests/dma_admin_intent.test.sql`: 69단언
- `supabase/tests/dma_admin_reflect.test.sql`: 72단언

## Decisions Made

frontmatter `key-decisions` 와 같다. 플랜이 비워 둔 반환 모양(put_account · settle_server · record_results)은 relay(29-11)가 바로 쓸 수 있게 정했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합성] `dma_admin_results.dma_user_id` 에 `dma_users` FK(ON DELETE CASCADE)를 더했다**
- **Found during:** Task 2
- **Issue:** 플랜의 표 정의는 `dma_user_id text NOT NULL` 뿐이다. 그대로 두면 유저를 지워도 결과 행이 남는다. 같은 DMA id 를 다시 만들면 옛 「실패 · BUSY」 칩이 shared 개요에서 되살아난다(pending 이 있고 마지막 결과가 failed 이면 err).
- **Fix:** FK cascade 를 걸었다. `dma_admin_record_results` 는 없는 DMA id · 모르는 서버 결과를 버리므로, 유저 삭제 직후 늦게 온 기록이 FK 로 실패하지 않는다.
- **Files modified:** supabase/migrations/20261006200300_dma_admin_reflect.sql
- **Verification:** intent pgTAP 「p5d1 삭제 뒤 최근 결과 cascade 0행」 · reflect pgTAP 「r5ghost 0행 · KB999 버림」
- **Committed in:** aeaef382

**2. [Rule 2 - 정합성] 입양이 의도 표 CHECK 를 못 맞추는 87 행을 건너뛴다**
- **Found during:** Task 2
- **Issue:** 87 의 KB 계좌에 branch/trader 가 비어 있으면 `dma_user_accounts` CHECK(23514)가 입양 문장 전체를 실패시킨다. 그러면 배포 창 런북 단계(29-25)가 통째로 막힌다.
- **Fix:** 계좌번호 1~12자이고 증권사별 branch/trader 규칙을 맞추는 행만 들여온다. 나머지는 「서버에만 있음」 으로 남는다.
- **Files modified:** supabase/migrations/20261006200300_dma_admin_reflect.sql
- **Verification:** reflect pgTAP 「adopt KB120 …0007 branch 빈 KB 계좌, 들여오지 않음」
- **Committed in:** aeaef382

**3. [Rule 1 - 단순화] SERVER_BROKER_MISMATCH 를 트리거 예외 변환이 아니라 RPC 앞단 검사로 낸다**
- **Found during:** Task 1
- **Issue:** 플랜은 「트리거 오류를 SERVER_BROKER_MISMATCH 로 바꿔 올린다」 이다. 그러려면 EXCEPTION 서브블록(savepoint)과 SQLERRM 문자열 비교가 필요하다.
- **Fix:** 등록 서버의 증권사를 먼저 검사해 같은 코드를 낸다. 트리거는 최후 방어로 그대로 둔다. 바깥에서 보이는 동작(코드 · 부분 생성 없음)은 같다.
- **Files modified:** supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql
- **Verification:** intent pgTAP 「create 교보 계좌 · KB120 → SERVER_BROKER_MISMATCH · 부분 생성 없음」 · 「put 교보 계좌 · KB120」
- **Committed in:** 58d31f53

---

**Total deviations:** 3건 자동 처리(Rule 2 정합성 2건 · Rule 1 단순화 1건). **Impact:** 계약 키와 RPC 시그니처는 플랜 표와 같다. 바뀐 것은 결과 표 FK 하나와 입양 필터뿐이다.

## Issues Encountered

없음.

## User Setup Required

없음. 원격 적용은 29-07 [BLOCKING] 체크포인트에서 메인 세션이 한다(29-01 두 파일과 함께 4개).

## Next Phase Readiness

- 29-10 · 29-13(Express 개요)은 `admin_users_raw()` · `admin_servers_raw()` 를 한 번 불러 shared `deriveAdminUsersOverview` · `deriveAdminServersOverview` 에 그대로 넘기면 된다.
- 29-11(relay 디스패처)은 위 오류 코드 표의 MESSAGE 로 `IntentError { code }` 를 만들 수 있다. settle 은 op 4 code 0/8 · op 2 code 0/4 뒤에만 부른다.
- 29-14(snapshot-sink)는 `p_users_rev` 를 숫자(bigint)로 넘긴다. 원자료의 `usersRev` 는 문자열이다.
- 29-25 런북은 서버마다 87 을 한 번 받은 뒤 `dma_admin_adopt_server_accounts(server)` 를 부른다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql · supabase/migrations/20261006200300_dma_admin_reflect.sql · supabase/tests/dma_admin_intent.test.sql · supabase/tests/dma_admin_reflect.test.sql
- FOUND commits: 58d31f53 · aeaef382 (HEAD 조상)
- 수용 기준: create_dma_user 정의 1 · advisory lock 2 · snapshotAccounts 2 · settle_server 정의 1 · 'LAST_ACCOUNT' 1 · adopt 정의 1 · dma_admin_results CREATE TABLE 1
- pgTAP 신규 2(69 · 72) + 회귀 4(app_access · dma_registry_intent · dma_gateway_identities · dma_journal_apply) 전부 `# RESULT: PASS`
