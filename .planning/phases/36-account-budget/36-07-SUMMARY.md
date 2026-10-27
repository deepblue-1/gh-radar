---
phase: 36-account-budget
plan: 07
subsystem: db+server
tags: [supabase, rpc, pgtap, server, pnl, d-17, d-18, d-19, tracer]
status: complete

requires:
  - phase: 36-05
    provides: "dma_journal_events 4열(realized_pnl_krw · fee_krw · tax_krw · avg_price) · 체결 부분 인덱스 idx_dma_journal_events_fill_day"
  - phase: 36-10
    provides: "shared pnl.ts — PnlReport · PnlGroup · PnlRange · PnlGroupBy · pnlRangeOf · kstDateIso"
provides:
  - "supabase/migrations/20261027210100_dma_pnl_rpcs.sql — dma_pnl_daily_build(date, date, text, uuid, text)(내부 조립) · dma_pnl_daily_for_user(uuid, text, date, date) · dma_pnl_daily_for_admin(date, date, text)"
  - "GET /api/pnl?account=&range= (pnlRouter · requireAuth · p_user_id = req.userId)"
  - "GET /api/admin/pnl?group=user|account&range= (adminPnlRouter · /pnl 경로 한정 관문 requireAuth → requireAdmin)"
  - "server schemas/pnl.ts PnlQuery · AdminPnlQuery · services/pnl.ts getMyPnl · getAdminPnl"
affects: [36-08, 36-09]

actuals:
  tokens: 14564
  tasks: 2
  commits: 3
plan_head_before: bf929046b106bf355ea09d81f9644ba98474461e
plan_head_after: 988674765ad241e6bb36c4e3cb00dd73e98e1c81

tech-stack:
  added: []
  patterns:
    - "/me · 어드민 집계 SQL 한 벌 — 내부 조립 함수 dma_pnl_daily_build(p_mode 'me' | 'user' | 'account') 하나에 원천 · 종목 · 일자 · 묶음 조립을 두고, 공개 RPC 2개는 얇은 래퍼(권한 3줄은 셋 다)"
    - "'me' 모드만 가시성(dma_visible_accounts EXISTS) · 계좌 거름 — 어드민 래퍼는 p_group 을 user/account 로 잠가 'me' · NULL 을 22023 으로 거부"
    - "금액 곱은 exec_qty::bigint × exec_price — int4 × int4 overflow(300억) 회피"

key-files:
  created:
    - supabase/migrations/20261027210100_dma_pnl_rpcs.sql
    - supabase/tests/dma_pnl_daily.test.sql
    - server/src/schemas/pnl.ts
    - server/src/services/pnl.ts
    - server/src/routes/pnl.ts
    - server/src/routes/admin-pnl.ts
    - server/tests/routes/pnl.test.ts
    - server/tests/routes/admin-pnl.test.ts
  modified:
    - server/src/app.ts

key-decisions:
  - "/me 응답의 dma_user_ids 는 항상 [] — 트레이더 조회 RPC 는 dma_user_id 를 내지 않는다(T-19-08 · D-08). 플랜은 「distinct 빈 값 제외」였으나 공유 계좌의 다른 DMA 유저 id 가 트레이더에게 새므로 Rule 2 로 막았다(36-08 /me 화면은 이 필드를 쓰지 않는다)"
  - "for_user · for_admin 의 집계가 갈라지지 않게 공용 내부 함수 dma_pnl_daily_build 로 뽑았다(플랜이 허용한 선택지) — 같은 권한 3줄 · SECURITY INVOKER"
  - "계좌별 묶음의 증권사 정렬 키 = 그 계좌 체결에 KB 게이트웨이가 하나라도 있으면 KB(0) · 교보만이면 1"
  - "/api/pnl 에서 보이지 않는 계좌는 403 이 아니라 200 groups [] — 계좌 존재 여부를 흘리지 않는다"
  - "마이그레이션 타임스탬프 20261027210100 그대로(작성 직전 ls 마지막 파일 20261027210000 — 충돌 없음)"

patterns-established:
  - "jsonb 집계 RPC 의 pgTAP 은 묶음 · 일자 · 종목 객체를 jsonb 리터럴과 통째로 비교한다(키 이름 · 정수 직렬화 · 정렬을 한 단언으로)"

requirements-completed: []

coverage:
  - id: D1
    description: "dma_pnl_daily_for_user — 가시성 조인 · 호출 1회 · E 만 · 일자 최신순 · 종목 정렬 · apply_error 포함 · 남의 계좌/매핑 없음/NULL = groups []"
    verification:
      - kind: pgtap
        ref: "supabase/tests/dma_pnl_daily.test.sql (ok 1~18)"
        status: pass
    human_judgment: false
  - id: D2
    description: "dma_pnl_daily_for_admin — user(미상 맨 뒤) · account(KB120/KB121 한 묶음 · KB → 교보 · account_name) · 300억 overflow 없음 · p_group x/me/NULL 22023"
    verification:
      - kind: pgtap
        ref: "supabase/tests/dma_pnl_daily.test.sql (ok 19~35)"
        status: pass
    human_judgment: false
  - id: D3
    description: "RPC 3종 권한 (anon, authenticated, service_role) = (f, f, t) · SECURITY INVOKER"
    verification:
      - kind: pgtap
        ref: "supabase/tests/dma_pnl_daily.test.sql (ok 36~39)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/pnl — 401 · p_user_id = 인증 사용자 · pnlRangeOf(KST) · month/90/7 · 400 RPC 0회 · 500 DB_ERROR · 모양 위반 500"
    verification:
      - kind: integration
        ref: "server/tests/routes/pnl.test.ts (16 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/admin/pnl — 401 · trader 403 · 기본 user/30 · account/90 · month · 400 RPC 0회 · 500 · /api/admin/users 역할 조회 1회"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-pnl.test.ts (15 tests)"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-launch.test.ts · admin-servers.test.ts · admin.test.ts · orders.test.ts 회귀"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-28
---

# Phase 36 Plan 07: 일자별 매매손익 집계 RPC + 라우트 Summary

**저널 체결(E) 손익 4열을 묶음 × 일자 × 종목 jsonb 한 덩이로 내는 RPC 2종(/me 가시성 조인 · 어드민 계정별/계좌별)과 그걸 그대로 통과시키는 `GET /api/pnl` · `GET /api/admin/pnl` — 요청 하나 = Supabase 왕복 1회.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-10-27T15:31:47Z
- **Completed:** 2026-10-27T15:40:49Z (KST 10-28 00:40)
- **Tasks:** 2 (Task 1 트레이서 · Task 2 RED → GREEN)
- **Files:** 신규 8 · 수정 1

## Accomplishments

- 마이그레이션 `supabase/migrations/20261027210100_dma_pnl_rpcs.sql`:
  - `dma_pnl_daily_build(p_from, p_to, p_mode, p_user_id, p_account_no)` — 내부 조립 한 벌(원천 E 만 · `exec_qty::bigint * j.exec_price` · 종목/일자/묶음 jsonb · 정렬).
  - `dma_pnl_daily_for_user(p_user_id, p_account_no, p_from, p_to)` — `dma_visible_accounts` 가시성 · 계좌 한 벌(0~1 묶음).
  - `dma_pnl_daily_for_admin(p_from, p_to, p_group)` — `user` | `account` 밖 22023.
  - 세 함수 모두 SECURITY INVOKER · `search_path = public, pg_temp` · REVOKE PUBLIC / anon, authenticated · GRANT service_role.
- server: `PnlQuery` · `AdminPnlQuery`(zod) · `getMyPnl` · `getAdminPnl`(`pnlRangeOf(range, kstDateIso())` → RPC 1회 → `groups` 배열 모양 검사) · `pnlRouter`(`/api/pnl`, `/api/orders` 다음) · `adminPnlRouter`(`/api/admin` · adminLaunchRouter 와 adminRouter 사이).

### RPC 반환 예시 (pgTAP 픽스처 — `for_user(u1, '1111150701', '2026-10-20', '2026-10-27')`)

```json
{
  "from": "2026-10-20", "to": "2026-10-27",
  "groups": [{
    "key": "1111150701",
    "accounts": [{"broker": "KB", "gateway": "KB120", "account_no": "1111150701"}],
    "dma_user_ids": [], "account_name": null,
    "total": {"pnl": 98990, "fee": 395, "tax": 2200, "buy": 1500000, "sell": 1100000, "fills": 4},
    "days": [
      {"date": "2026-10-27", "pnl": 98990, "fee": 325, "tax": 2200, "buy": 1050000, "sell": 1100000, "fills": 3,
       "stocks": [
         {"isin": "KR7005930003", "code": "005930", "name": "삼성전자", "pnl": 99000, "buy": 1000000, "sell": 1100000, "fills": 2},
         {"isin": "KR7999999990", "code": null, "name": null, "pnl": -10, "buy": 50000, "sell": 0, "fills": 1}]},
      {"date": "2026-10-26", "pnl": 0, "fee": 70, "tax": 0, "buy": 450000, "sell": 0, "fills": 1,
       "stocks": [{"isin": "KR7005930003", "code": "005930", "name": "삼성전자", "pnl": 0, "buy": 450000, "sell": 0, "fills": 1}]}
    ]
  }]
}
```

### pgTAP 결과

`bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_pnl_daily.test.sql` → `1..39` · not ok 0 · `# RESULT: PASS`(일회용 로컬 컨테이너 · 86 마이그레이션 재생 · 원격 접촉 0).

### 라우트 2

| 경로 | 관문 | RPC | 기본값 |
|------|------|-----|--------|
| `GET /api/pnl?account=&range=` | requireAuth · p_user_id = req.userId | `dma_pnl_daily_for_user` 1회 | range 30 |
| `GET /api/admin/pnl?group=&range=` | `/pnl` 한정 requireAuth → requireAdmin | `dma_pnl_daily_for_admin` 1회 | group user · range 30 |

## Task Commits

1. **Task 1 (tracer): /me 한 경로** — `7ffcf479` (feat)
2. **Task 2 RED: 어드민 실패 테스트** — `e2d428d1` (test)
3. **Task 2 GREEN: 어드민 RPC · 라우트** — `98867476` (feat)

트레이서 게이트: auto 모드 아님 · `end-of-phase` · verify 가 automated 전용 → verify 재실행 통과(pgTAP PASS · vitest 38 passed) 후 확장.

## Files Created/Modified

- `supabase/migrations/20261027210100_dma_pnl_rpcs.sql` — RPC 3종(내부 조립 1 + 공개 2)
- `supabase/tests/dma_pnl_daily.test.sql` — pgTAP 39 단언
- `server/src/schemas/pnl.ts` — PnlQuery · AdminPnlQuery
- `server/src/services/pnl.ts` — getMyPnl · getAdminPnl(DbError · causeOf · shapeCause · isObject 복제)
- `server/src/routes/pnl.ts` — pnlRouter
- `server/src/routes/admin-pnl.ts` — adminPnlRouter
- `server/src/app.ts` — 마운트 2줄 + 주석
- `server/tests/routes/pnl.test.ts` · `server/tests/routes/admin-pnl.test.ts` — supertest

## Decisions Made

frontmatter `key-decisions` 참고. 핵심: /me 는 `dma_user_ids: []`(T-19-08), 집계 SQL 은 내부 조립 함수 한 벌.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] /me 응답에서 DMA 유저 id 비노출**
- **Found during:** Task 1
- **Issue:** 플랜은 for_user 묶음의 `dma_user_ids` 를 「distinct 빈 값 제외」로 채우라 했으나, 공유 계좌면 다른 사용자의 DMA 유저 id 가 트레이더에게 나간다 — 기존 사용자 조회 RPC 규약(T-19-08 · D-08 「dma_user_id 는 반환하지 않는다」)과 어긋난다.
- **Fix:** 조립 함수에서 `p_mode = 'me'` 이면 `dma_user_ids = []`. pgTAP ok 6 이 잠근다. 어드민 모드는 그대로 채운다. 36-08 /me 화면은 이 필드를 쓰지 않는다(36-08-PLAN 은 어드민 계좌별 부제에만 사용).
- **Files modified:** supabase/migrations/20261027210100_dma_pnl_rpcs.sql, supabase/tests/dma_pnl_daily.test.sql
- **Commit:** 7ffcf479

**2. [설계 선택 — 플랜 허용 범위] 공용 내부 함수 + EXISTS 가시성**
- 플랜의 for_user 원천 CTE 는 `JOIN dma_visible_accounts(p_user_id)` 였다. 공용 조립 함수에서는 같은 의미의 `EXISTS`(헬퍼가 DISTINCT 라 결과 동일 · 한 체결이 두 번 세지지 않음)로 썼다. 마이그레이션 주석에 원래 JOIN 꼴을 남겼다.

**3. [Rule 1 - Test] pgTAP 단언 2건 표현 수정**
- jsonb `->` 와 `-` 연산자 우선순위(`->0 - 'stocks'` 가 `0 - 'stocks'` 로 해석) · record 텍스트 인용 형식. 단언 의도는 그대로이고 구현 변경은 없다.

**Total deviations:** 1 auto-fixed(보안) + 1 설계 선택 + 테스트 표현 수정 1. **Impact:** 응답 모양(`PnlReport`)은 그대로이고, /me 에서 DMA 유저 id 만 빈 배열이다.

## Issues Encountered

None.

## TDD Gate Compliance

Task 2(tdd="true"): RED `e2d428d1`(test — pgTAP 은 `dma_pnl_daily_for_admin does not exist` 로 실패 · supertest 12 failed) → GREEN `98867476`(feat — pgTAP 39 PASS · vitest 96 passed). REFACTOR 없음.

## User Setup Required

None — 원격 적용(`supabase db push`)은 36-09 메인 세션 몫.

## Next Phase Readiness

- 36-08(화면)이 `fetchMyPnl` · `fetchAdminPnl` 로 바로 붙일 수 있다 — 응답은 shared `PnlReport` 그대로.
- 36-09 배포: 마이그레이션 20261027210100 은 20261027210000(36-05) 뒤 · Phase 35 예정 20261028200000 앞(원격 순서 점검은 36-09).

## Self-Check: PASSED

- 파일 9개 존재 확인 · 커밋 7ffcf479 · e2d428d1 · 98867476 HEAD 조상 확인 · 수용 기준 grep 7종 PASS · `app.use("/api/admin"` 순서 adminLaunchRouter(128) < adminPnlRouter(130) < adminRouter(131).
