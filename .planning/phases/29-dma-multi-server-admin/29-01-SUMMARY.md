---
phase: 29-dma-multi-server-admin
plan: 01
subsystem: database
tags: [supabase, postgres, pgtap, rls, security-definer, dma-registry, app-users]

requires:
  - phase: 15
    provides: "dma_credentials(시드 trader 원천 · 롤백 경로로 그대로 둠)"
  - phase: quick-260929-sas
    provides: "dma_gateway_identities 잠금 4줄 · RPC 권한 3줄 패턴"
provides:
  - "app_users(email PK · role admin/trader/viewer · dma_user_id) — 허용/역할 게이트 원천"
  - "my_app_access() RETURNS text — 본인 역할 또는 NULL(승인 대기) · authenticated 전용"
  - "is_theme_admin() 본문 재정의 — app_users.role = 'admin' (정책 이름 · theme_admins 표 유지)"
  - "dma_servers 레지스트리(시드 4) + 부분 유니크 uq_dma_servers_order · uq_dma_servers_quote"
  - "dma_users · dma_user_accounts · dma_account_servers(state active/removing) + 증권사 트리거"
  - "dma_app_access_map() · dma_admin_upsert_server · dma_admin_set_server_enabled · dma_admin_set_order_server · dma_admin_set_quote_primary (service_role 전용)"
affects: [29-03, 29-05, 29-06, 29-07, 29-09, 29-10, 29-12, 29-13, 29-24]

actuals:
  tokens: 11335
  tasks: 3
  commits: 2
plan_head_before: 6f995f1acc36f5931b02863ca249b3cbcce260e7
plan_head_after: c614a898c57330069931409abcb0795e71508ce4

tech-stack:
  added: []
  patterns:
    - "역할 판정은 JWT 클레임이 아니라 매 요청 SECURITY DEFINER 본인 1행 RPC (강등 즉시성 D-04)"
    - "레지스트리 불변식은 DB 가 쥔다 — 부분 유니크 + CHECK + 해제→지정 한 트랜잭션 RPC"
    - "운영 마이그레이션에는 테스트 신원을 넣지 않는다 — pgTAP 첫 단언이 재생 직후 시드 집합을 잠근다"

key-files:
  created:
    - supabase/migrations/20261006200000_app_access.sql
    - supabase/tests/app_access.test.sql
    - supabase/migrations/20261006200100_dma_registry_intent.sql
    - supabase/tests/dma_registry_intent.test.sql
  modified: []

key-decisions:
  - "D-05 one-way 문: 사용자가 db-intent 선택(2026-10-06, AskUserQuestion 으로 직접) — DB 의도 표가 정본, 87 은 반영 상태"
  - "my_app_access() 는 플랜대로 RETURNS text(역할만) — dma_user_id 는 service_role 접근 맵 dma_app_access_map() 이 싣는다"
  - "시드 host 는 infra/relay/startup.sh nft 허용 규칙(498·499 KB 120/121, 512 교보 119/127)에서 옮김 — KB121 도 실 규칙에 있어 [ASSUMED] 아님"
  - "레지스트리 RPC 오류 코드: 'server in use' · 'server disabled' · 'broker change not allowed' = P0001, 'server not found' = P0002, 증권사 트리거 = 23514"

patterns-established:
  - "새 표 잠금 4줄(RLS · REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role) + 새 RPC 권한 3줄"
  - "pgTAP 다건 잠금은 unnest(ARRAY[...]) 로 표/함수 × 역할 행을 펼쳐 튜플 설명을 format() 으로 만든다"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03]

coverage:
  - id: D1
    description: "app_users · my_app_access() · is_theme_admin 흡수 · D-20 운영 시드(admin 2행뿐 · trader 데이터 기반)"
    requirement: ADMIN-02
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/app_access.test.sql (30/30)"
        status: pass
    human_judgment: false
  - id: D2
    description: "dma_servers 레지스트리 시드 4 · 주문/시세 불변식 · 레지스트리 RPC 4종"
    requirement: ADMIN-01
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_registry_intent.test.sql (83/83)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DMA 의도 표(dma_users · dma_user_accounts · dma_account_servers) · 증권사 트리거 · 접근 맵 RPC"
    requirement: ADMIN-03
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_registry_intent.test.sql (83/83)"
        status: pass
      - kind: integration
        ref: "회귀 dma_gateway_identities · dma_journal_apply · dma_strategy_read · app_access — 전부 # RESULT: PASS"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-10-06
status: complete
---

# Phase 29 Plan 01: 허용/역할 원천 · 서버 레지스트리 · DMA 의도 표 Summary

**`app_users` + 본인 역할 RPC `my_app_access()` 로 웹 게이트 원천을 세우고(`is_theme_admin` 흡수 · 운영 시드 admin 2행), D-05 db-intent 확인 뒤 `dma_servers` 레지스트리(시드 4 · 주문/시세 부분 유니크) · DMA 의도 표 3개 · 증권사 트리거 · 접근 맵 · 레지스트리 RPC 4종을 additive 마이그레이션 2개로 만들어 로컬 pgTAP 113단언으로 잠갔다.**

## Performance

- **Duration:** 약 40분(Task 2 사용자 결정 대기 포함)
- **Completed:** 2026-10-06T14:52:19Z
- **Tasks:** 3 (Task 1 트레이서 · Task 2 결정 체크포인트 · Task 3)
- **Files created:** 4

## Accomplishments

- `20261006200000_app_access.sql`: 이메일 소문자 PK · 역할 CHECK 를 가진 `app_users` 를 만들었다. `my_app_access()` 는 JWT 이메일을 대소문자 무관하게 보고 역할 또는 NULL 을 돌려준다(anon EXECUTE 없음). `is_theme_admin()` 은 본문만 admin 판정으로 바꿨다. 시드는 alex · ezmesya admin 과 `dma_credentials` 보유자 trader 뿐이고 테스트 신원은 넣지 않았다.
- `20261006200100_dma_registry_intent.sql` 의 레지스트리: `dma_servers` 를 KB120(주문 · 시세 주) · KB121(꺼짐) · KYOBO119(주문) · KYOBO127(꺼짐), 포트 9100 으로 시드했다. 증권사당 주문 서버 1대 · 전체 시세 주 1대는 부분 유니크로, 끈 서버를 주문/시세로 고를 수 없게 하는 것은 CHECK 로 막는다.
- 같은 마이그레이션의 DMA 의도 표: `dma_users`(id ≤8B · 암호문 1개), `app_users.dma_user_id`(공유 허용 · ON DELETE SET NULL), `dma_user_accounts`(KB branch 5 · trader 6 / 교보 빈 값 · 계좌번호 ≤12), `dma_account_servers`(state active/removing). 등록 서버와 계좌의 증권사가 다르면 트리거가 23514 로 거부한다.
- 같은 마이그레이션의 RPC: `dma_app_access_map()` 은 가입한 허용 사용자만 돌려준다. 레지스트리 RPC 4종은 「해제 → 지정」 을 한 트랜잭션에서 하고 행을 잠근다.
- 새 표 6개는 모두 RLS 활성 · 정책 0개이고 anon · authenticated 를 명시해 REVOKE 했다. 새 RPC 도 마찬가지다(본인 판정 2종만 authenticated GRANT).

## Task Commits

1. **Task 1: 트레이서 — app_users · my_app_access · is_theme_admin 흡수 · 운영 시드 · pgTAP** — `f6b9bf04` (feat)
2. **Task 2: D-05 문 확인** — 커밋 없음(결정 체크포인트). **사용자 선택: `db-intent`** (2026-10-06, 사용자가 AskUserQuestion 으로 직접 선택 — DB 의도 표를 정본으로, 87 은 반영 상태)
3. **Task 3: 서버 레지스트리 · DMA 의도 표 · 접근 맵 · 레지스트리 RPC · pgTAP** — `c614a898` (feat)

## Files Created/Modified

- `supabase/migrations/20261006200000_app_access.sql` — 허용/역할 표 · 본인 역할 RPC · is_theme_admin 재정의 · 운영 시드
- `supabase/tests/app_access.test.sql` — 30단언(재생 직후 시드 집합 · 잠금 · RPC 역할 · 권한 · 정책 이름 · CHECK)
- `supabase/migrations/20261006200100_dma_registry_intent.sql` — 레지스트리 · 의도 표 · 트리거 · 접근 맵 · 레지스트리 RPC
- `supabase/tests/dma_registry_intent.test.sql` — 83단언(시드 키 · 잠금 20 · RPC 권한 15 · 불변식 · CHECK · 트리거 · 접근 맵 · 수명)

## 마이그레이션 버전 · 시드 출처

- 실제 버전은 계획과 같은 `20261006200000` · `20261006200100` 이다. 실행 시점의 마지막 버전이 `20261006120000` 이라 그대로 썼다.
- 시드 host 는 `infra/relay/startup.sh` 의 nft 허용 규칙에서 옮겼다. 498 · 499 줄이 KB `10.41.1.120` · `10.41.1.121`, 512 줄이 교보 `10.16.207.119` · `10.16.207.127` 이고 포트는 9100 이다. `reference/mockup-admin-servers.html` 의 표기와 일치한다. pgTAP 는 서버 키만 단언하고, 테스트가 쓰는 주소는 TEST-NET `192.0.2.x` 뿐이다.

## Decisions Made

- **D-05 one-way 문:** `db-intent` 를 택했다(사용자 확인). 기존 `dma_credentials` · `dma_gateway_identities` 는 건드리지 않았다. 롤백 시 옛 relay 가 이 표를 읽는다.
- `my_app_access()` 는 플랜대로 `RETURNS text` 다. RESEARCH ⑨ 의 `(role, dma_user_id)` 대신 역할만 돌려주고, DMA 연결은 service_role 전용 접근 맵이 싣는다(브라우저에 DMA id 를 노출하지 않는다).
- 레지스트리 RPC 의 예외 메시지(`server in use` · `server disabled` · `server not found` · `broker change not allowed`)를 고정했다. Express 29-13 이 이 문자열로 사용자 오류를 매핑한다.
- `dma_admin_upsert_server` 로 새 서버를 넣으면 `sort_order` 는 현재 최댓값 + 10, 포트는 `p_port` 가 NULL 일 때 9100 이다.
- 트리거 함수는 서버가 없으면 거부하지 않고 FK(23503)에 맡긴다. 오류 코드가 원인을 그대로 말하게 하려는 것이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합성] trader 시드가 공백이 섞인 auth 이메일에서 CHECK 로 마이그레이션 전체를 중단시키는 경로를 막았다**
- **Found during:** Task 1
- **Issue:** `lower(u.email)` 만 쓰면 앞뒤에 공백이 있는 auth 이메일 하나가 `email = lower(btrim(email))` CHECK 를 어긴다. 그러면 원격 적용(29-07)이 통째로 실패한다.
- **Fix:** `lower(btrim(u.email))` 와 `btrim(u.email) <> ''` 필터를 쓴다. pgTAP 가 같은 문으로 다시 실행한다.
- **Files modified:** supabase/migrations/20261006200000_app_access.sql, supabase/tests/app_access.test.sql
- **Committed in:** f6b9bf04

**2. [Rule 2 - 일관성] 트리거 함수 EXECUTE 도 PUBLIC · anon · authenticated 에서 REVOKE 했다**
- **Found during:** Task 3
- **Issue:** 플랜의 권한 줄 목록은 새 RPC 5종만 다룬다. 트리거 함수는 기본 PUBLIC EXECUTE 가 남는다.
- **Fix:** REVOKE 2줄을 넣었다. 트리거 발화에는 EXECUTE 권한이 필요하지 않아 동작은 같다(pgTAP 의 트리거 단언이 통과).
- **Committed in:** c614a898

**3. 단언 추가(범위 안):** Task 1 은 앞 공백 이메일 CHECK, 테마 정책 2개 이름 유지, `theme_admins` 표 남음, 이메일 없는 JWT 는 NULL, 자격증명이 있는 admin 은 admin 유지를 더 잠갔다. Task 3 은 끈 서버를 직접 주문/시세로 지정할 때의 CHECK, 키 접두 · broker 불일치, 주문 서버 교체가 다른 증권사에 영향 없음, upsert 신규 기본값과 broker 변경 거부, 계좌 없는 등록 서버 FK, `dma_user_id` FK, cascade 를 더 잠갔다.

**4. 문구:** Task 1 롤백 주석의 「DROP TABLE」 을 「표 제거(DROP)」 로 바꿨다. 수락 grep(`DROP TABLE` = 0)을 맞추기 위해서다.

---

**Total deviations:** 2건 자동 수정(Rule 2) + 단언 보강 + 주석 문구.
**Impact on plan:** 범위 변화는 없다. 시그니처와 열 이름은 플랜 표 그대로다.

## Issues Encountered

- 첫 pgTAP 실행에서 `plan()` 이 없어 「You tried to run a test without a plan!」 이 났다. 기존 테스트 관례대로 `SELECT plan(N)` 을 넣어 해결했다.

## 검증

- `app_access.test.sql`: 30/30 · `# RESULT: PASS` (Task 1 커밋 뒤 트레이서 게이트에서 다시 돌려도 PASS)
- `dma_registry_intent.test.sql`: 83/83 · `# RESULT: PASS`
- 회귀 `dma_gateway_identities` · `dma_journal_apply` · `dma_strategy_read` · `app_access`: 전부 `# RESULT: PASS` (마이그레이션 61개 재생)
- 수락 grep 은 Task 1 · Task 3 모두 기준 충족. 예: `FROM anon, authenticated` = 10, `DROP TABLE|DELETE FROM public.dma_credentials` = 0.
- 원격 접촉 없음. `supabase db push` · `git push` · 배포를 하지 않았다. 원격 적용은 29-07 [BLOCKING] 몫이다.
- spec-less probe fallback 은 건너뛰었다(visible skip — ROADMAP 요구사항 ID 없음). 보안검사는 `security_enforcement: false` 라 생략했다.

## User Setup Required

없음. 원격 적용은 29-07 체크포인트에서 사용자/메인 세션이 한다.

## Next Phase Readiness

- 29-03(relay `dma_servers` 읽기) · 29-05(의도 변경 RPC · 87 반영 표) · 29-06(`dma_app_access_map`) · 29-10/29-12(`my_app_access`) · 29-13(레지스트리 RPC)이 이 스키마에 바로 붙을 수 있다.
- 주의: 원격에 적용하는 순간부터 `is_theme_admin()` 이 `app_users` 를 본다. 현 테마 운영자 ezmesya 는 시드 덕에 권한이 이어진다. e2e 계정 admin 시드(`seed-test-user.ts`)는 29-07 이 맡는다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-06*

## Self-Check: PASSED

- 파일 4개 존재 · 커밋 f6b9bf04 · c614a898 HEAD 이력에 있음 · 작업 트리 깨끗
