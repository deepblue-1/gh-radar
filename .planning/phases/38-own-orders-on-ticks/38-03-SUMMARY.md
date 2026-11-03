---
phase: 38-own-orders-on-ticks
plan: 03
subsystem: ticks
tags: [supabase, rpc, pgtap, express, supertest, tick-viewer, visibility]

requires:
  - phase: 38-own-orders-on-ticks
    provides: "38-01 tick_own_for_user RPC · 부분 인덱스 2 · pgTAP 스모크 9 · getTickOwn · GET /api/ticks/own"
provides:
  - "pgTAP 전체 행렬 supabase/tests/tick_own.test.sql — 스모크 9 + 절 A~H + 대조 2 = plan(52)"
  - "server supertest 절 「GET /api/ticks/own (Phase 38 D-01 · D-14)」 8케이스"
  - "SC-4(가시성 서버측 강제 · RPC 1회) · SC-5(켜진 서버만 · 켜면 자동 포함) 를 테스트로 잠금"
affects: [38-09, 38-10]

actuals:
  tokens: 8683
  tasks: 2
  commits: 2
plan_head_before: 8994aa9097baee91fa2032239c673b4df634d05e
plan_head_after: e7fe84f780df5259899bd5aca9032ada616fa3cc

tech-stack:
  added: []
  patterns:
    - "pgTAP 결과 비교는 배열 순서 그대로 「gateway:seq」 / 「gateway:order_no」 문자열 — 포함 · 제외 · 정렬을 한 단언으로"
    - "「없음」 jsonpath 단언에는 같은 경로식이 참이 되는 양성 대조를 붙인다(공허한 참 방지)"
    - "레지스트리 상태를 바꾸는 절(E)은 맨 뒤 — 앞 절들은 시드 상태(KB120 · KYOBO119 켜짐)를 전제"

key-files:
  created: []
  modified:
    - supabase/tests/tick_own.test.sql
    - server/tests/routes/ticks.test.ts

key-decisions:
  - "KYOBO119 끄기는 `SET enabled = false, is_order_server = false` — 레지스트리 CHECK(NOT is_order_server OR enabled) 때문에 주문 서버 플래그를 같이 내려야 한다(계획 문구는 enabled 만)"
  - "필터 제외 행은 전부 U1 계좌에 두고 어드민 U4 로 확인 — 가시성이 아니라 필터만이 제외 이유가 되게"
  - "정렬 · ms 절사 픽스처는 U2 계좌에 둬 스모크 5 · 6(U1 fills = 1행) 기대값을 그대로 유지"
  - "마이그레이션 · 서비스 · 라우트 수정 없음 — 38-01 구현이 52 단언 · 8 케이스를 전부 그대로 통과"

patterns-established:
  - "켜면 자동 포함 검사: 같은 트랜잭션에서 UPDATE dma_servers 뒤 같은 RPC 를 다시 불러 fills · events · orders · servers 를 모두 확인"

requirements-completed: []

coverage:
  - id: D1
    description: "RPC tick_own_for_user — 권한(service_role 만 · SECURITY INVOKER · STABLE) · 게이트(NULL · 매핑 없음 · 매핑 없는 어드민 → {access:false}) · 최상위 키 8"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql (1..52 전부 ok · RESULT: PASS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "가시성(D-01) — trader 는 자기 가시 계좌의 체결 · 이벤트 · 주문만 · 어드민(role admin · 매핑 있음)은 전 계좌"
    verification:
      - kind: integration
        ref: "supabase/tests/tick_own.test.sql#C15~C20 · D21~D23"
        status: pass
    human_judgment: false
  - id: D3
    description: "켜진 서버(D-03 · SC-5) — KB121 UPDATE enabled=true 뒤 같은 호출에 자동 포함 · KYOBO119 끄면 빠짐 · servers 도 레지스트리를 따른다"
    verification:
      - kind: integration
        ref: "supabase/tests/tick_own.test.sql#E42~E48 (+ 대조 E45b)"
        status: pass
    human_judgment: false
  - id: D4
    description: "필터 · 모양(D-14) — E ∧ exec_qty>0 · 날짜 · isin · 거래소 · kind 3·6 ∧ order_no · N ∧ filled_qty>0 ∧ order_no · (gw_time, gateway, seq) 정렬 · ms 절사 · 키 집합 19/8/8 · dma_user_id 없음 · 부분 인덱스 2"
    verification:
      - kind: integration
        ref: "supabase/tests/tick_own.test.sql#F24~F35 · G36~G41 · H49~H50"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/ticks/own — 401 · 400(RPC 0회) · 403 DMA_UNMAPPED · 500 DB_ERROR(원문 비노출 · 배열 모양 위반) · RPC 1회 · 인자 키 4개 · 클라 입력 무시 · no-store"
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts tests/routes/ticks-live.test.ts --maxWorkers=2 (44 passed)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-03
status: complete
---

# Phase 38 Plan 03: RPC · 라우트 잠금 Summary

**`tick_own_for_user` 를 pgTAP 52 단언(권한 · 게이트 · trader 가시 계좌 · 어드민 전 계좌 · KB121 켜면 자동 포함 / KYOBO119 끄면 빠짐 · 필터 · 정렬 · ms 절사 · 키 집합 · 인덱스)으로, `GET /api/ticks/own` 을 supertest 8케이스(401 · 400 · 403 · 500 · RPC 1회 · 인자 4개 · 클라 입력 무시 · no-store)로 잠갔다 — 38-01 구현은 수정 없이 전부 통과.**

## Performance

- **Duration:** 약 5분(실행) — 문서 읽기 포함 약 8분
- **Started:** 2026-11-03T06:13:29Z
- **Completed:** 2026-11-03T06:18:11Z
- **Tasks:** 2 (tracer 1 · auto tdd 1)
- **Files modified:** 2

## Accomplishments
- pgTAP: 사용자 U1~U5(trader 2 · 매핑 없음 · admin 매핑 있음/없음) + 아무에게도 매핑 안 된 KYOBO119 계좌로 D-01 가시성 · 어드민 전 계좌를 행렬로 확인. 결과를 「gateway:seq」 문자열로 비교해 포함 · 제외 · 정렬을 한 단언에 잠갔다.
- D-03: 같은 트랜잭션에서 `UPDATE public.dma_servers SET enabled = true WHERE key = 'KB121'` 뒤 U1 의 KB121 체결 · 이벤트 · 주문 · `servers`(sort_order 순 KB120 · KB121 · KYOBO119)가 자동 포함, KYOBO119 를 끄면 어드민 응답의 세 배열 · `servers` 에서 빠짐.
- D-14: 제외 행 11종(A 통보 · exec_qty 0 · 다른 날짜 · 다른 isin · NXT · kind 2/5/15 · 빈 order_no · C · 체결 0 · order_no NULL 거부 행)을 어드민으로도 안 보이는지 확인 · 같은 gw_time seq 오름차순 · 09:00:00.9995 → …999 절사 · 이벤트 키 19 · 주문 키 8 · 체결 키 8 · 인덱스 열 (trade_date, isin, exchange).
- supertest: 기존 `makeSupabase`(from() throw) 그대로 `/own` 절 8케이스.

## Task Commits

1. **Task 1 (tracer): pgTAP 전체 행렬** — `34d0a5d9` (test)
2. **Task 2: /api/ticks/own supertest 행렬** — `e7fe84f7` (test)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## Files Created/Modified
- `supabase/tests/tick_own.test.sql` — 스모크 9 → plan(52) · 머리 주석 「잠그는 것」 절 A~H · 대조 갱신
- `server/tests/routes/ticks.test.ts` — describe 「GET /api/ticks/own (Phase 38 D-01 · D-14)」 8케이스

## Verification (실행 결과 그대로)
- `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql` — 마이그레이션 98개 재생 · `1..52` 전부 ok · `RESULT: PASS`(커밋 뒤 최종본으로 재실행 · 로컬 일회용 컨테이너 · 원격 접촉 0)
- `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` — `1..109` not ok 0 · `RESULT: PASS`
- `pnpm --filter @gh-radar/shared build` 통과 · `pnpm --filter @gh-radar/server run typecheck` 통과
- `pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts tests/routes/ticks-live.test.ts --maxWorkers=2` — 2 files · 44 passed(새 own 8 포함 · 기존 회귀 0). 로그의 WARNING/ERROR 줄은 400/403/500 케이스가 의도적으로 낸 요청 로그(`cause.message: "boom"` 은 로그에만, 응답 본문엔 없음을 단언)
- 수용 기준 grep 전부 PASS — `SET enabled = true WHERE key = 'KB121'` 1 · `'admin'` 3 · `has_index` 2 · `plan(52)` ≥ 30 · `/api/ticks/own` 3 · `DMA_UNMAPPED` 6 · `no-store` 3
- 트레이서 게이트: auto 아님 · human_verify_mode end-of-phase · `<verify>` 자동만 → 재실행 통과로 체크포인트 없이 확장
- server 에는 lint 스크립트가 없어 lint 미실행

## Decisions Made
- frontmatter key-decisions 참고. 요지: KYOBO119 끄기는 레지스트리 CHECK 때문에 `is_order_server = false` 를 같이 · 필터 제외 행은 어드민으로 확인 · 정렬/절사 픽스처는 U2 에 둬 스모크 기대값 유지.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] KYOBO119 끄기 UPDATE 에 `is_order_server = false` 추가**
- **Found during:** Task 1 (절 E 작성)
- **Issue:** 계획 문구 `UPDATE … SET enabled = false WHERE key = 'KYOBO119'` 그대로면 시드에서 KYOBO119 가 `is_order_server = true` 라 `dma_servers` CHECK(`NOT is_order_server OR enabled`)에 걸려 트랜잭션이 깨진다.
- **Fix:** `SET enabled = false, is_order_server = false` + 이유 주석. 운영 레지스트리 RPC 도 주문 서버를 먼저 옮기지 않으면 끌 수 없는 같은 규칙이다.
- **Files modified:** supabase/tests/tick_own.test.sql
- **Verification:** E46~E48 ok
- **Committed in:** 34d0a5d9

**2. [Rule 2 - 견고성] 양성 대조 단언 2개(C16b · E45b) 추가 — plan 50 → 52**
- **Found during:** Task 1 (첫 실행 전부 통과 뒤 점검)
- **Issue:** C16 · E47 은 `$.*[*]` lax jsonpath 의 「없음」 단언이라, 경로식이 아무것도 못 잡아도 참이 된다(공허한 참).
- **Fix:** 같은 경로식이 어드민 응답에선 참(C16b), KYOBO119 끄기 전엔 체결 · 이벤트 · 주문 3행을 잡음(E45b)을 단언.
- **Files modified:** supabase/tests/tick_own.test.sql
- **Verification:** 52/52 ok
- **Committed in:** 34d0a5d9

**3. [계획 보강] has_index 를 열 배열 형태로**
- **Found during:** Task 1
- **Issue:** 4인자 `has_index(schema, table, index, desc)` 는 pgTAP 오버로드가 모호할 수 있고 열 구성을 잠그지 못한다.
- **Fix:** `ARRAY['trade_date', 'isin', 'exchange']` 를 넘기는 5인자 형태(저장소 dma_journal_schema.test.sql 과 같은 꼴).
- **Committed in:** 34d0a5d9

---

**Total deviations:** 3 (Rule 3 1 · Rule 2 1 · 보강 1)
**Impact on plan:** 테스트를 약하게 한 것은 없다 — 모두 단언을 성립시키거나 더 엄격하게 하는 방향. 마이그레이션 · 서비스 · 라우트는 수정할 결함이 없었다.

## TDD 메모
- Task 2 는 `tdd="true"` 지만 구현(`getTickOwn` · `/own`)이 38-01 트레이서에서 먼저 들어와 있어 RED 단계가 없었다 — 8케이스가 첫 실행에 통과. 계획의 「실패하는 케이스가 있으면 고친다」 경로는 발동하지 않았다. 서버에 어드민 · 가시성 판정은 더하지 않았다.

## Issues Encountered
- 이 세션의 격리 검사가 heredoc · 파이프 뒤 `${PIPESTATUS}` · 출력 리다이렉트를 포함한 복합 명령을 막아, 파일은 Write/Edit 로, 검증은 단순 명령으로 나눠 실행했다(결과물 영향 없음). 플랜 커밋 기준점(ledger)은 git-dir 파일 대신 이 SUMMARY 의 `plan_head_before` 로만 기록했다.

## Known Stubs
없음 — 테스트 파일만 바꿨다.

## User Setup Required
None — 원격 적용(`supabase db push`) · server 배포는 38-10 메인 세션.

## Next Phase Readiness
- RPC 계약(인자 4개 · jsonb 키 · 필터 · 정렬)이 pgTAP 로 잠겼으므로 38-04 이후 플랜이 이 모양을 전제로 화면을 얹어도 된다. RPC 를 바꾸면 이 52 단언이 먼저 깨진다.
- 38-10 배포 전 원격 push 시 이 마이그레이션 파일 그대로(수정 없음).

## Self-Check: PASSED
- 파일 2개 존재 · 커밋 `34d0a5d9` · `e7fe84f7` 이 HEAD 조상 · `git diff 8994aa90..HEAD --stat` = 계획 files_modified 중 테스트 2개만(마이그레이션 · 서비스 · 라우트 무변경 — 결함 없음)
