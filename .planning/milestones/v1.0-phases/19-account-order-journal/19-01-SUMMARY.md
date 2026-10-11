---
phase: 19-account-order-journal
plan: 01
subsystem: database
tags: [supabase, postgres, plpgsql, pgtap, rls, journal, idempotency, gh-trade-handoff]

requires:
  - phase: 15-dma-relay-kb-gh-trade-server-10-wss
    provides: "dma_credentials(user_id PK → dma_user_id, UNIQUE 아님) · 서비스롤 전용 RLS/REVOKE 4줄 패턴"
  - phase: 18-gh-trade-ui-nxt-vi
    provides: "상태 6종(modified 포함) · 단조 격자(relay order/notice-status.ts)"
provides:
  - "테이블 4종: dma_journal_events(원문·PK 멱등 게이트) · dma_account_orders(계좌 기준 투영) · dma_account_access(매핑) · dma_journal_cursor"
  - "RPC 6종: dma_journal_status_rank · dma_journal_next_status · dma_journal_project(A 갈래) · dma_journal_apply · dma_journal_sync_access · dma_journal_orders_for_user"
  - "이벤트 JSON 키 23종 계약(relay 기록기 19-05 입력) · 공개 행 컬럼 25종(dma_user_id 제외)"
  - "pgTAP 2파일(추적 40건 · 스키마/권한 90건)"
  - "19-GH-TRADE-HANDOFF.md — gh-trade Phase 23 discuss 입력"
affects: [19-03, 19-04, 19-05, 19-07, 19-09, 19-11, gh-trade Phase 23]

actuals:
  tokens: 19464
  tasks: 3
  commits: 3
plan_head_before: 4e54830828df6206a63edc91d62a011cadf3816d

tech-stack:
  added: []
  patterns:
    - "이벤트 PK INSERT ON CONFLICT DO NOTHING → NOT FOUND 면 투영 건너뜀(재생 멱등의 유일한 근거)"
    - "이벤트별 plpgsql EXCEPTION 서브블록 → apply_error 기록 · 배치·커서 계속(포이즌 격리)"
    - "pg_advisory_xact_lock(hashtext('dma_journal:' || gateway)) 로 적용·매핑 교체 직렬화"
    - "apply 반환 rows 와 조회 RPC 컬럼 목록 동일성을 pgTAP set_eq 로 잠금"

key-files:
  created:
    - supabase/migrations/20260924200000_dma_journal_tables.sql
    - supabase/migrations/20260924200100_dma_journal_rpcs.sql
    - supabase/tests/dma_journal_apply.test.sql
    - supabase/tests/dma_journal_schema.test.sql
    - .planning/phases/19-account-order-journal/19-GH-TRADE-HANDOFF.md
  modified: []

key-decisions:
  - "dma_journal_apply 필수 키는 seq·trade_date·gw_time_ms 셋 — 형식 오류면 배치 전체 실패(계약 위반을 조용히 넘기지 않음, relay 가 커서 미전진 재시도). 나머지 키는 ''/0/false 로 적재"
  - "dma_journal_project 는 알 수 없는 request_kind · 빈 account_no 를 RAISE — apply_error 로 드러나고 배치는 진행"
  - "dma_journal_sync_access 는 빈 dma_user_id/account_no 행이 하나라도 있으면 교체 전체 거부(기존 매핑 보존)"
  - "접수(A)가 기존 행을 갱신할 때 first_seq=LEAST · created_at=LEAST · updated_at=GREATEST, 빈 칸만 COALESCE(qty·price·org_order_no·origin·side·dma_user_id·board·requester·request_kind)"

patterns-established:
  - "저널 pgTAP 은 scripts/verify-dma-orders-price-check.sh --test <file> 로 일회용 로컬 Postgres 17 에서 전 마이그레이션 재생 후 실행 — 로컬 이미지의 supabase_admin 기본 ACL 이 anon/authenticated 자동 부여를 재현하므로 명시 REVOKE 누락을 잡는다"

requirements-completed: [D-02, D-05, D-06, D-09, D-11, D-12]

coverage:
  - id: D1
    description: "저널 테이블 4종(user_id 없음 · RLS 활성 · 정책 0 · anon/authenticated 권한 0) — dma_orders 무수정"
    requirement: D-05
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql"
        status: pass
    human_judgment: false
  - id: D2
    description: "dma_journal_apply 재생 멱등(같은 배치 재호출 applied 0 · skipped 1 · 행/이벤트/커서 불변)과 한 트랜잭션 커서 전진"
    requirement: D-12
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#(seq 1 재생, …7801)"
        status: pass
    human_judgment: false
  - id: D3
    description: "포이즌 이벤트 격리 — CHECK 위반 이벤트는 apply_error 에 남고 같은 배치의 다음 이벤트·커서는 진행"
    requirement: D-12
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#(seq 3·4, …7801)"
        status: pass
    human_judgment: false
  - id: D4
    description: "계좌 매핑 가시성 — 같은 dma_user_id 공유 사용자 동일 id 집합 · 매핑 없는 사용자 0행 · rows 에 dma_user_id 없음"
    requirement: D-06
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#(seq 1, …7801) U2 id 집합 = U1"
        status: pass
    human_judgment: false
  - id: D5
    description: "전 계좌 기록 — 매핑 없는 계좌의 통보도 행이 생기고 sync_access 뒤 바로 조회"
    requirement: D-11
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql#(seq 2, …3201)"
        status: pass
    human_judgment: false
  - id: D6
    description: "reject_seq 키 · 키 xor CHECK · reject epoch CHECK · 부분 유니크 2종(로컬 거부 행 모델 스키마)"
    requirement: D-02
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_schema.test.sql#키 xor · uq_dma_account_orders_reject"
        status: pass
    human_judgment: false
  - id: D7
    description: "함수 6종 EXECUTE service_role 전용(anon/authenticated false) — T-19-01 IDOR 차단"
    verification:
      - kind: integration
        ref: "supabase/tests/dma_journal_schema.test.sql#has_function_privilege × 18"
        status: pass
    human_judgment: false
  - id: D8
    description: "gh-trade 인계서(와이어 계약 · seq 조밀성 · 관찰자 서버측 거부 · 펌프 · 보관 · epoch/resync · G1/G2)"
    requirement: D-09
    verification:
      - kind: other
        ref: "grep -c -E 'ObserverLoginReq|…|sync-relay-schema.sh' 19-GH-TRADE-HANDOFF.md → 23 · 절 8개 · 23 키 전부 · IP/비밀 0"
        status: pass
    human_judgment: true
    rationale: "인계서가 gh-trade Phase 23 discuss 의 입력으로 충분한지는 gh-trade 세션(사람)이 읽고 판단해야 한다 — grep 은 존재만 증명한다"

duration: 10min
completed: 2026-09-25
status: complete
---

# Phase 19 Plan 01: 저널 DB 뼈대 · gh-trade 인계서 Summary

**게이트웨이 저널 레코드(접수 A) → `dma_journal_apply` 한 호출로 원문 적재·계좌 기준 투영·커서 전진을 한 트랜잭션에 끝내고(PK 게이트 멱등 · 포이즌 격리), 같은 DMA 계정 사용자들이 `dma_journal_orders_for_user` 로 같은 행을 보는 경로를 pgTAP 130건으로 잠갔다. gh-trade 쪽 와이어 계약 인계서도 썼다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-24T15:08:15Z
- **Completed:** 2026-09-24T15:18Z (KST 2026-09-25 00:18)
- **Tasks:** 3/3
- **Files created:** 5 (modified 0)

## Accomplishments
- 새 계좌 기준 테이블 4종을 만들었다(`user_id` 없음, 계좌·주문번호·seq 가 키). `dma_orders` 와 그 마이그레이션·테스트는 한 줄도 건드리지 않았다(D-05 동결).
- `dma_journal_apply`: advisory lock → 이벤트 `ON CONFLICT DO NOTHING` → 삽입된 경우에만 투영 → 커서(같은 epoch 면 GREATEST, 다르면 교체)를 한 트랜잭션으로 묶었다. 같은 배치를 두 번 넣어도 행·이벤트·커서가 그대로다(D-12). 투영이 실패한 이벤트는 `apply_error` 에 사유가 남고 배치는 계속된다.
- `dma_journal_orders_for_user`: `user_id → dma_credentials.dma_user_id → dma_account_access → 계좌` 조인 하나로 가시성을 정한다. `dma_user_id` 는 반환하지 않는다. apply 반환 rows 도 같은 25컬럼이며, pgTAP `set_eq` 가 두 키 집합이 같은지 확인한다.
- 권한: 네 테이블은 RLS 활성·정책 0·anon/authenticated 권한 0이고, 함수 6종의 EXECUTE 는 service_role 만 가진다. 로컬 이미지의 기본 ACL 이 anon/authenticated 자동 부여를 재현하므로, 명시 REVOKE 가 빠지면 이 테스트가 잡는다.
- `19-GH-TRADE-HANDOFF.md`: 요청 5 · 응답 79/80 제안, 23필드 ↔ 이벤트 JSON 키 대응표, seq 조밀성·epoch/resync·예열 제외·Q-ID 포함·로컬 거부 4지점, 관찰자 서버측 거부, 펌프 스로틀·디스크 보관·핫패스 규율, G1/G2 게이트를 담았다.

## Task Commits

1. **Task 1: [tracer] 테이블 4 · RPC · 추적 pgTAP** — `3f41cb7` (feat)
2. **Task 2: 스키마·권한 pgTAP** — `45995d8` (test)
3. **Task 3: gh-trade 인계서** — `28d844c` (docs)

## Verification

| 명령 | 결과 |
|------|------|
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` | 마이그레이션 44개 재생 · `1..40` · ok 40 · not ok 0 · `# RESULT: PASS` (exit 0) |
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql` | 마이그레이션 44개 재생 · `1..90` · ok 90 · not ok 0 · `# RESULT: PASS` (exit 0) |
| TDD RED — 같은 스키마 테스트를 `--until 20260923120000`(저널 마이그레이션 제외)로 실행 | `not ok 4 - public.dma_journal_cursor 테이블이 있다` 뒤 relation 없음 ERROR · FAIL — 테스트가 실제로 스키마를 잰다는 증거 |
| Task 1 acceptance grep | user_id 줄 0 · RLS 4 · 테이블 anon REVOKE 4 · 함수 anon REVOKE 6 · service_role GRANT 6 · advisory lock 2 · ON CONFLICT DO NOTHING 2 · dma_orders 동결 파일 status 없음 |
| Task 2 acceptance grep | has_function_privilege 18 · has_table_privilege 48 · pg_policies 3 · relrowsecurity 5 |
| Task 3 verify | 키워드 grep 23(≥8) · `^## ` 8 · IP/비밀 패턴 0 · 23키 대응표 누락 0 |
| `git diff --name-only 4e54830 HEAD -- supabase/` 의 dma_orders | 없음 |
| gh-trade `git status --porcelain` 작업 전/후 | 둘 다 `?? .planning/milestone.lock` 한 줄 — 같음(gh-trade 무수정) |
| 로컬 이미지 기본 ACL 점검(`pg_default_acl`) | supabase_admin·postgres 모두 public 테이블·함수에 anon/authenticated 자동 부여 → 권한 pgTAP 이 거짓 초록이 아님 |

원격 DB 에는 아무것도 반영하지 않았다(원격 push 는 19-11 [BLOCKING] 몫이다). 테스트는 전부 일회용 로컬 컨테이너(`public.ecr.aws/supabase/postgres:17.6.1.104`)에서 돌렸고 원격에 접속하지 않았다.

## Files Created/Modified
- `supabase/migrations/20260924200000_dma_journal_tables.sql` — 테이블 4종, 부분 유니크 2종·인덱스 3종, 머리 주석 3단(결정 근거·함정·하지 않는 것), RLS/REVOKE 4줄 × 4
- `supabase/migrations/20260924200100_dma_journal_rpcs.sql` — 함수 6종(SECURITY INVOKER · search_path 고정), 이벤트 JSON 키 23종 계약 주석, 권한 3줄 × 6
- `supabase/tests/dma_journal_apply.test.sql` — 추적 경로 pgTAP 40건(behavior 8항목 + 늦은 A 재판정 + epoch 교체)
- `supabase/tests/dma_journal_schema.test.sql` — 스키마·권한 pgTAP 90건(T-19-01 · T-19-11 회귀 정본)
- `.planning/phases/19-account-order-journal/19-GH-TRADE-HANDOFF.md` — gh-trade Phase 23 입력 인계서(절 8개)

## Decisions Made
- **필수 키 3개(seq·trade_date·gw_time_ms)가 깨지면 배치 전체를 실패시킨다.** 이벤트 원문 적재 단계에서 이 셋을 모르면 PK·거래일·시각을 지어낼 수 없다. relay 는 커서를 올리지 않고 재시도하며 db_error 로 드러낸다. 나머지 키는 `''/0/false` 로 적재하므로 형식 이상은 투영 단계의 포이즌 격리가 받는다.
- **알 수 없는 `request_kind`, 빈 `account_no` 는 투영 RAISE** 로 처리한다. 조용히 N 으로 분류하거나 빈 계좌 행을 만들면 틀린 행이 남는다. `apply_error` 로 드러내는 편이 낫다.
- **`sync_access` 는 빈 키 행이 있으면 교체 전체를 거부**한다. 일부 행만 버리면 매핑이 조용히 줄어들어 사용자에게 행이 안 보이는데, 이것을 알아채기 어렵다.
- **A 갱신 시 `first_seq = LEAST`** 로 둔다. 늦게 온 A 가 seq 로는 더 크더라도 첫 이벤트 seq 는 유지한다. 격자 재판정은 `filled_qty + modified_qty >= qty` 로 한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 입력 검증] RPC 입력 가드 추가**
- **Found during:** Task 1
- **Issue:** 플랜 골격에는 빈 gateway/epoch, 배열이 아닌 p_events/p_rows, 빈 dma_user_id/account_no 매핑 행, 알 수 없는 request_kind, 빈 account_no 에 대한 처리가 없었다. 그대로 두면 틀린 행이 생기거나 NOT NULL 오류가 투영 밖에서 나 배치를 막는다.
- **Fix:** apply·sync_access 진입부에서 RAISE 하고, project 에서 알 수 없는 request_kind·빈 account_no 를 RAISE 한다(포이즌 격리로 흡수). 필수 3키 외에는 COALESCE 기본값을 쓴다.
- **Files modified:** supabase/migrations/20260924200100_dma_journal_rpcs.sql
- **Verification:** apply pgTAP 40/40
- **Committed in:** 3f41cb7

**2. [Rule 2 - 테스트 보강] 플랜 behavior 8항목 밖의 단언 추가**
- **Found during:** Task 1
- **Issue:** 플랜 action 은 「체결이 먼저 온 행에 A 가 qty 를 채우면 격자 재판정」 과 「epoch 가 다르면 커서 교체」 를 요구했지만 behavior 목록에는 없었다. 이 둘은 검증되지 않은 코드 경로였다.
- **Fix:** E 가 만들 모양의 행을 직접 넣고 A 를 적용해 `(10,10,filled,5,6)` 과 LEAST/GREATEST 시각을 확인하는 단언, ep-2 적용 뒤 커서가 `(ep-2,1)` 로 바뀌는 단언을 더했다. apply rows 키 집합과 조회 RPC 컬럼 집합이 같은지 확인하는 `set_eq` 도 더했다.
- **Files modified:** supabase/tests/dma_journal_apply.test.sql
- **Committed in:** 3f41cb7

**3. [Rule 2 - 테스트 보강] 스키마 테스트에 service_role 테이블 권한 16건 추가**
- **Found during:** Task 2
- **Issue:** 플랜 behavior 는 service_role 의 SELECT/INSERT/UPDATE/DELETE true 를 요구했는데, acceptance 최소치(32)는 anon/authenticated 만 셌다.
- **Fix:** service_role × 4테이블 × 4권한을 단언했다(has_table_privilege 합계 48).
- **Committed in:** 45995d8

### 참고 — 보호 브랜치 가드
- executor 규약의 pre-commit HEAD 가드에서 `git.base-branch --is-protected master` 는 `true` 를 반환했다. 오케스트레이터가 이번 실행을 「main working tree · branch master · sequential · normal git commits」 로 명시했고, 이 저장소는 `branching_strategy: none` 으로 직전 phase 커밋도 모두 master 에 있다. 그래서 master 에 커밋했다. push 는 하지 않았다.

---

**Total deviations:** 3 auto-fixed (Rule 2 × 3). **Impact:** 모두 입력 검증과 테스트 커버리지 보강이다. 스키마·계약 범위는 늘리지 않았다.

## Issues Encountered
- 없음. 첫 실행에 40/40·90/90 이 통과했다.

## Known Stubs
- 없음. `dma_journal_project` 가 E·C·M·R·로컬 거부 통보에 RAISE 하는 것은 스텁이 아니라 플랜이 정한 경계다. 이 통보들은 `apply_error` 에 「미구현 — 19-03」 사유로 남아 조용히 삼켜지지 않으며, 19-03 이 같은 함수에 갈래를 채운다.

## Threat Flags
- 없음. 새 표면(테이블 4 · 함수 6)은 모두 플랜 threat_model(T-19-01·05·06·08·10·11·13·15)에 들어 있고, 완화 조치는 pgTAP 로 확인했다.

## User Setup Required
None — 외부 서비스 설정 없음(원격 반영은 19-11).

## Next Phase Readiness
- **19-03:** 같은 `dma_journal_project` 에 E 누적·C/M/R·로컬 거부(`reject_seq`) 갈래를 채우고, `dma_journal_apply.test.sql` 에 단언을 더한다. 헬퍼 `dma_journal_next_status` 와 늦은 A 재판정 경로는 이미 있다.
- **19-05:** relay 기록기는 머리 주석의 이벤트 JSON 키 23종으로 `rpc("dma_journal_apply", {p_gateway, p_epoch, p_events})` 를 부른다. 반환값은 `{applied, skipped, errors[{seq,error}], last_seq, rows[]}` 이다.
- **19-04:** server 는 `rpc("dma_journal_orders_for_user", {p_user_id, p_trade_date})` 를 부른다. 반환 25컬럼(snake_case)이다.
- **gh-trade:** `19-GH-TRADE-HANDOFF.md` 를 gh-trade 세션에 넘겨야 한다(Phase 23 discuss 입력). 계약 번호·필드는 G1 에서 고정한다.
- **원격 미반영:** 두 마이그레이션은 로컬 파일로만 있다. 19-11 [BLOCKING] 에서 사람 승인 뒤 push 한다.

## Self-Check: PASSED
- FOUND: 5개 파일 전부(마이그레이션 2 · pgTAP 2 · 인계서 1)
- FOUND: 커밋 3f41cb7 · 45995d8 · 28d844c
- pgTAP 2파일 GREEN(40/40 · 90/90), acceptance 전 항목 PASS

---
*Phase: 19-account-order-journal*
*Completed: 2026-09-25*
