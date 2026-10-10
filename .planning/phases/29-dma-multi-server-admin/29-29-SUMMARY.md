---
phase: 29-dma-multi-server-admin
plan: 29
subsystem: database
tags: [g-1, account-order-server, supabase, pgtap, rpc, migration, gap-closure]
status: halted

requires:
  - phase: 29-26
    provides: "원격 적용된 의도 표 · RPC(20261006200100 · 200200 · 200300) · 배포 뒤 pgTAP 실행 경로"
provides:
  - "dma_account_servers.is_order + CHECK chk_dma_account_servers_order_active + 부분 유니크 uq_dma_account_servers_order (안 A) — 백필 없음"
  - "dma_admin_set_account_order_server(p_dma_user_id, p_broker, p_account_no, p_server_key) RETURNS jsonb { orderServer } — service_role 전용"
  - "dma_account_order_servers() RETURNS TABLE (dma_user_id, broker, account_no, server_key) — 지정 계좌만 · service_role 전용"
  - "dma_admin_put_account · dma_admin_mark_account_removed — removing 으로 바꿀 때 지정 해제(시그니처 무변경)"
  - "dma_admin_intent · admin_users_raw().intent 의 isOrder · admin_users_raw().servers 의 isOrderServer"
affects: [29-30, 29-33, 29-35, 29-36, 29-37, 29-38, 29-39, 29-41, 29-42]

tech-stack:
  added: []
  patterns:
    - "계좌별 덮어쓰기 = 등록 행 플래그 + CHECK(NOT flag OR state='active') + 부분 유니크 — removing 으로 바꾸는 UPDATE 가 같은 문장에서 플래그를 내린다"
    - "지정 RPC 는 검증을 모두 마친 뒤에만 쓴다(내리고 → 세운다) — 거부는 기존 지정을 바꾸지 않는다"

key-files:
  created:
    - supabase/migrations/20261010200100_dma_account_order_server.sql
    - supabase/tests/dma_account_order_server.test.sql
  modified:
    - supabase/tests/dma_admin_intent.test.sql
    - supabase/tests/dma_admin_reflect.test.sql

key-decisions:
  - "Task 1 — 사용자 선택 `flag-on-registration`(안 A 「등록 서버 행 플래그」 dma_account_servers.is_order, 2026-10-10 오케스트레이터 경유)"
  - "빈 키(공백)는 NULL 과 같게 정리한다(nullif(btrim)) — dma_admin__server_list 의 빈 키 처리와 같은 규율"
  - "꺼진 서버로의 지정도 받는다 — G-1 운영 규칙 「지정 서버가 꺼지면 기본값, 지정은 지우지 않는다」 와 맞추려고. enabled 판정은 relay(29-33)"
  - "dma_account_order_servers() 는 서버 enabled 로 거르지 않는다 — 유효 주문 서버 판정은 relay 몫"
  - "put 으로 removing 서버를 되살려도 지정은 되살리지 않는다(기본값 유지)"

requirements-completed: [ADMIN-06, ADMIN-03]

coverage:
  - id: D1
    description: "계좌별 주문 서버 지정 저장 · 등록 서버로만(거부 코드) · 해제 시 기본 복귀(put · 계좌 제거 · settle) · 안 A 제약 · 보존(백필 없음) · 권한"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_account_order_server.test.sql (48/48)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --with supabase/migrations/20261010200100_dma_account_order_server.sql --test supabase/tests/dma_account_order_server.test.sql (재적용 멱등 48/48)"
        status: pass
    human_judgment: false
  - id: D2
    description: "의도 · 개요 원자료 모양 — dma_admin_intent / admin_users_raw().intent 의 isOrder · servers[].isOrderServer · 기존 회귀 무손상"
    requirement: "ADMIN-03"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_intent.test.sql (69/69)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_reflect.test.sql (72/72)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_registry_intent.test.sql (83/83)"
        status: pass
    human_judgment: false
  - id: D3
    description: "gh-trade-0d 확인 질문 전달(와이어 무변경 · 두 서버 동시 세션 · 다른 서버 전략 독립 · 재로그인 빈도)"
    verification: []
    human_judgment: true
    rationale: "사용자가 gh-trade 세션에 직접 전달하는 외부 행위 — executor 는 gh-trade 저장소 · 세션에 쓰지 않는다. 답은 29-41 go/no-go 에서 확인"

actuals:
  tokens: 9650
  tasks: 2
  commits: 2
plan_head_before: f45d11cebad2244f836fed94978572243caced3f
plan_head_after: 2cee6c0065151cf0c89f54f26c57a095ddeb3d9e

duration: 20min
completed: 2026-10-10
---

# Phase 29 Plan 29: G-1 계좌별 주문 서버 — DB 끝 (안 A 등록 행 플래그) Summary

**`dma_account_servers.is_order` 플래그(CHECK: active 행만 · 부분 유니크: 계좌당 1개)로 계좌별 주문 서버를 저장한다. `dma_admin_set_account_order_server`(NULL = 증권사 기본값 · `ORDER_SERVER_NOT_REGISTERED`)로 지정하고, relay 는 `dma_account_order_servers()` 로 읽는다. put · 계좌 제거 · settle 로 등록에서 빠지면 같은 트랜잭션에서 기본값으로 돌아간다. 백필은 없어서 적용 직후 기존 계좌는 전부 기본 주문 서버 그대로다.**

## Performance

- **Duration:** 약 20분
- **Completed:** 2026-10-10T08:37Z (Task 2 커밋 기준 — Task 3 전달 대기)
- **Tasks:** 2/3 (Task 1 결정 기록 · Task 2 실행) — Task 3 전달 대기
- **Files modified:** 4 (신규 2 · 수정 2)

## Task 1 — DB 저장 위치 결정 (checkpoint:decision · blocking-human)

- **사용자 선택:** `flag-on-registration` — 「A 등록행 플래그」 (`dma_account_servers.is_order`). 2026-10-10 오케스트레이터가 이 디스패치 전에 사용자에게 제시해 받은 답이다.
- 이 선택에 따라 Task 2 는 안 A 로 구현했다. 안 A 전용 제약 단언:
  - **CHECK** `chk_dma_account_servers_order_active (NOT is_order OR state = 'active')` — removing 행 `…0002@KB120` 에 직접 플래그를 세우면 **23514**(단언 #37)
  - **부분 유니크** `uq_dma_account_servers_order (dma_user_id, broker, account_no) WHERE is_order` — 한 계좌 두 행(`…0003` KB120 · KB121)에 직접 플래그를 세우면 **23505**(단언 #39)

## Task 2 — 트레이서(DB 끝) · TDD

| 단계 | 커밋 | 내용 |
|---|---|---|
| RED | `412552f8` | 신규 `dma_account_order_server.test.sql`(48 단언). 기존 두 파일의 모양 단언에 새 키를 반영 |
| GREEN | `2cee6c00` | 마이그레이션 `20261010200100_dma_account_order_server.sql` |
| REFACTOR | — | 필요 없음 |

**RED 근거(재생: 현재 마이그레이션 65개, 새 파일 없음):**
- `dma_admin_intent.test.sql` → `not ok 6`(키 집합 10개 · isOrder 포함) · `not ok 7`(첫 행 객체의 `isOrder:false`). 나머지 67개는 ok이고 psql 종료 코드는 0이다. 목표 단언이 단언 수준에서 실패한, 유효한 RED다.
- `dma_account_order_server.test.sql` → `not ok 1~3`(is_order 열 · NOT NULL · 기본값 없음). 그 뒤 #4 에서 `function public.dma_account_order_servers() does not exist` 로 스크립트가 멈춘다. #1~3 은 계획한 단언의 실패지만 #4 이후는 로드형 실패다. 이 부분은 GREEN 에서 함께 확인했다.

**GREEN(재생: 마이그레이션 66개):**

| 파일 | 결과 |
|---|---|
| `dma_account_order_server.test.sql` | 48/48 PASS |
| 같은 파일 + `--with` 로 새 마이그레이션 한 번 더 적용(멱등) | 48/48 PASS |
| `dma_admin_intent.test.sql` | 69/69 PASS |
| `dma_admin_reflect.test.sql` | 72/72 PASS |
| `dma_registry_intent.test.sql` | 83/83 PASS |

**트레이서 게이트:** interactive · end-of-phase · `<verify>` 는 automated 뿐이다. 위 GREEN 재실행이 전부 통과해 확장(Task 3)으로 넘어갔다.

**acceptance_criteria:**

| 기준 | 값 | 판정 |
|---|---|---|
| `grep -c dma_admin_set_account_order_server` ≥ 4 | 5 | PASS |
| `grep -c dma_account_order_servers` ≥ 4 | 6 | PASS |
| `grep -c ORDER_SERVER_NOT_REGISTERED` ≥ 1 | 2 | PASS |
| `grep -cE "FROM anon, authenticated"` ≥ 6 | 6(새 RPC 2 + 재정의 4) | PASS |
| 백필 UPDATE/INSERT 없음 · 보존 단언 green | 최상위 UPDATE/INSERT 0 — 전부 함수 본문 안. 단언 #4(재생 직후 0행) · #5(기존 등록 6행 지정 0) PASS | PASS |
| SUMMARY 에 안 · 안 전용 제약 단언 | 위 Task 1 절 | PASS |

**고정된 계약(뒤 플랜 29-33 · 29-37 이 쓴다):**
- `dma_admin_set_account_order_server(text, text, text, text) RETURNS jsonb` → `{ "orderServer": <키 | null> }`. 오류(P0001)는 `NO_DMA_USER` · `NO_SUCH_ACCOUNT` · `ORDER_SERVER_NOT_REGISTERED`(미등록 · removing · 다른 증권사 · 없는 서버 키 전부)다. 같은 유저 변경은 `dma_users FOR UPDATE` 로 줄 세운다. 같은 값으로 다시 지정해도 결과가 같다(멱등). 빈 키는 NULL 과 같고, 꺼진 서버로의 지정도 받는다.
- `dma_account_order_servers() RETURNS TABLE (dma_user_id, broker, account_no, server_key)` — 지정된 계좌만 나오고 enabled 로 거르지 않는다. STABLE SECURITY DEFINER.
- 의도 행 `isOrder: boolean` · `admin_users_raw().servers[]` = `{ key, broker, enabled, isOrderServer }`. raw 의 7키와 정렬은 그대로다.
- 원격 적용된 20261006200100 · 200200 · 200300 은 고치지 않았다. 4개 함수는 새 파일에서 CREATE OR REPLACE 하고 권한 3줄을 다시 선언했다. `dma_servers.is_order_server` · `uq_dma_servers_order` 도 건드리지 않았다.

## Task 3 — gh-trade-0d 확인 질문 (checkpoint:human-action · blocking-human)

**상태: 전달 대기**(사용자가 gh-trade 세션 `gh-trade-0d` 에 전달한다. executor 는 gh-trade 저장소 · 세션에 쓰지 않는다.)

전달할 질문 원문(그대로 복사):

> gh-radar G-1 「계좌별 주문 서버」 를 만든다. 같은 DMA 유저의 계좌마다 등록 서버 중 하나를 주문 서버로 고르고, relay 는 그 계좌의 주문 · 상따 · 자동매도를 그 서버 세션으로만 보낸다. gh-trade 쪽 와이어 변경은 없다고 보는데 아래 네 가지를 확인해 달라.
> ① 같은 DMA user_id 가 같은 증권사의 서로 다른 서버 두 대(예: KB120 · KB121)에 relay 사용자 세션으로 동시에 로그인해도 서버 쪽 문제가 없는가(세션 합류 user_id@BROKER 는 서버 단위라 서로 무관한가).
> ② 계좌가 두 서버 users.toml 에 동시에 등록된 채 한 서버로만 주문 · 전략을 보내는 운용에서, 다른 서버에 남은 그 계좌의 전략(상따 · VI)과 미체결은 그 서버에서 독립적으로 계속 도는가. relay 는 그 계좌의 주문 서버가 아닌 세션에서 오는 그 계좌 프레임(51 · 60/64 · 66/67 · 83)을 웹에 보이지 않을 계획이다.
> ③ 주문 서버 지정이 바뀌면 relay 가 그 DMA 유저 세션을 닫고 곧바로(1~3초 안) 다시 로그인한다. Admin 이 증권사 기본 주문 서버를 바꾸면 그 증권사에서 지정이 없는 사용자 전원이 같은 방식으로 한꺼번에 재로그인한다 — 같은 서버 재로그인을 포함해 짧은 재로그인 · 동시 재로그인에 빈도 제한 · 계정 잠금 우려가 있는가.
> ④ 와이어(StockDMA.fbs) · users.toml 형식 변경이 정말 필요 없는가.
>
> 답은 인박스 노트(`docs/inbox/from-gh-trade/`) 또는 세션 메시지로 받는다. 답이 오면 29-41 의 go/no-go 에서 확인한다 — 반대 답(예: ① 이 안 됨)이면 29-41 에서 배포를 멈추고 재계획한다.

전달 기록: _(전달 대기 — 사용자 「보냄」(시각) 또는 답 요지를 받으면 이 줄을 갱신한다)_

## Files Created/Modified

- `supabase/migrations/20261010200100_dma_account_order_server.sql` — 열 · CHECK · 부분 유니크, 지정 · 조회 RPC, put · remove 해제 복귀, intent · raw 모양(원격 적용은 29-41)
- `supabase/tests/dma_account_order_server.test.sql` — pgTAP 48: 보존 · 지정 · 멱등 · 옮김 · 해제 · 거부 6종 · put/remove/settle 복귀 · 안 A 제약 · 모양 · 권한
- `supabase/tests/dma_admin_intent.test.sql` — 의도 행 키 집합 9 → 10(isOrder), 첫 행 객체에 `isOrder:false`
- `supabase/tests/dma_admin_reflect.test.sql` — raw.servers 에 `isOrderServer`, tracer raw.intent 객체에 `isOrder:false`

## Decisions Made

- Task 1: `flag-on-registration`(안 A).
- 빈 키 = NULL · 꺼진 서버 지정 허용 · 조회 RPC 는 enabled 로 거르지 않음 · 되살린 서버에는 지정을 복원하지 않음 — 전부 G-1 운영 규칙(판정은 relay, 지정은 꺼져도 유지)에 맞춘 것이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 회귀의 전체 객체 비교 단언 2건도 새 키에 맞춤**
- **Found during:** Task 2 (RED 작성)
- **Issue:** 플랜이 지목한 곳은 `dma_admin_intent.test.sql` 73-74행(키 집합)과 `dma_admin_reflect.test.sql` servers 값 단언뿐이었다. 그런데 `dma_admin_intent.test.sql` 77-80행(의도 첫 행 jsonb 전체 비교)과 `dma_admin_reflect.test.sql` 54-58행(tracer raw.intent 전체 비교)도 행 객체를 통째로 비교한다. `isOrder` 키가 추가되면 이 두 단언도 반드시 깨진다.
- **Fix:** 두 단언의 기대 객체에 `"isOrder":false` 만 넣었다. 단언 수 · 다른 단언은 그대로다.
- **Files modified:** supabase/tests/dma_admin_intent.test.sql, supabase/tests/dma_admin_reflect.test.sql
- **Verification:** intent 69/69 · reflect 72/72 PASS
- **Committed in:** `412552f8`

### 실행 환경 메모(편차 아님)

- 플랜 verify 명령은 `cd /Users/alex/repos/gh-radar && …` 이다. 그대로 돌리면 main checkout 을 검증하게 되므로 같은 명령을 **worktree 루트에서** 돌렸다(형제 executor 선례와 같음).
- 컨테이너는 한 번에 하나씩 순차로 띄웠고(러너가 trap 으로 정리), 타임아웃은 늘리지 않았다.

---

**Total deviations:** 1 auto-fixed (Rule 1 — 키 추가로 반드시 깨지는 기존 단언 2건)
**Impact on plan:** 계약 범위 안이다. 범위 확장은 없다.

## Issues Encountered

없음.

## TDD Gate Compliance

- RED `test(29-29)` `412552f8` → GREEN `feat(29-29)` `2cee6c00` 순서다. REFACTOR 는 없다.
- RED 증거: intent #6 · #7 은 단언 수준 실패다. 신규 파일은 #1~3 이 단언 수준 실패이고, 그 뒤 없는 함수 호출로 로드형 중단이 일어났다(GREEN 에서 48/48 로 확인).

## User Setup Required

없음. 원격 적용은 29-41 [BLOCKING] 의 push 목록에 `20261010200100` 으로 올라간다.

## Next Phase Readiness

- 29-33(relay 적재기) · 29-37(Admin 경로)이 위 RPC 계약 위에 설 수 있다.
- Task 3 질문 전달과 gh-trade 답은 29-41 go/no-go 의 전제다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261010200100_dma_account_order_server.sql · supabase/tests/dma_account_order_server.test.sql · 29-29-SUMMARY.md
- FOUND: `412552f8`(RED) · `2cee6c00`(GREEN) — `git log f45d11ce..HEAD`

---
*Phase: 29-dma-multi-server-admin*
*Status: Task 3 전달 대기 (2026-10-10)*
