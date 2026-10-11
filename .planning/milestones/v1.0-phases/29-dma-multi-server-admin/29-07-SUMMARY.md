---
phase: 29-dma-multi-server-admin
plan: 07
subsystem: database
tags: [supabase, migration, db-push, e2e, seed, app-users]
status: complete

requires:
  - phase: 29-01
    provides: "20261006200000_app_access · 20261006200100_dma_registry_intent (app_users · 레지스트리 · 의도 표)"
  - phase: 29-05
    provides: "20261006200200_dma_admin_intent_rpcs · 20261006200300_dma_admin_reflect (의도 변경 RPC · 반영 표 · 원자료 RPC)"
provides:
  - "webapp/scripts/seed-test-user.ts — e2e 계정을 app_users admin 으로 멱등 upsert + 재조회 출력(D-20 개정 e2e 전용 경로)"
  - "webapp/SETUP.md §5.2 — Phase 29 이후 시드 스크립트 역할 부여 안내"
  - "원격 DB 에 Phase 29 additive 4개 마이그레이션 적용(20261006200000 · 200100 · 200200 · 200300) — 표 · RPC · is_theme_admin 재정의 · D-20 운영 시드(admin 2 · trader 2)"
  - "원격 app_users 에 e2e 계정 admin 1행(e2e 전용 시드 스크립트로만)"
affects: [29-09, 29-10, 29-12, 29-13, 29-25]

actuals:
  tokens: 1600     # chars/4 over seed-test-user.ts + SETUP.md 변경분(Task 2 는 원격 적용 · 코드 변경 없음)
  tasks: 2
  commits: 1       # MEASURED: git rev-list --count 0ba9c3c0..3081092b — 이 플랜의 코드 커밋. 그 뒤 HEAD 까지는 29-08 · 29-09 커밋이 끼어 있어 범위를 이 플랜 커밋으로 닫았다
plan_head_before: 0ba9c3c0d6b5a8be2ecac1227d9f54ea5dfb1491
plan_head_after: 3081092b90c28f5c21915018e4bfafe4f692936a

tech-stack:
  added: []
  patterns:
    - "테스트 신원의 권한은 운영 마이그레이션이 아니라 e2e 시드 스크립트(수동 · 멱등 · service role 은 셸에서만)가 준다"

key-files:
  created: []
  modified:
    - webapp/scripts/seed-test-user.ts
    - webapp/SETUP.md

key-decisions:
  - "D-20 개정 e2e 전용 경로 메커니즘 = 기존 seed-test-user.ts 확장(글로벌 셋업 upsert · 미들웨어 우회 기각 — 근거는 「메커니즘 선택 근거」)"
  - "사용자 존재 분기의 조기 return 제거 — 존재 · 생성 두 경로 모두 역할 부여로 내려간다(이미 있는 e2e 계정도 admin 이 된다)"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03]

duration: "Task 1 2min + Task 2 체크포인트(메인 세션)"
completed: "2026-10-07"
---

# Phase 29 Plan 07: additive 마이그레이션 원격 적용 + e2e 전용 시드 Summary

**Phase 29 additive 마이그레이션 4개를 원격에 적용(smoke a~d · f 통과, admin 2행 → e2e 시드 뒤 3행)하고, e2e 계정 admin 은 확장한 `seed-test-user.ts`(D-20 e2e 전용 경로)로만 부여**

## Task 1 결과 (executor — 원격 접촉 없음)

| 게이트 | 결과 |
|---|---|
| pgTAP 7파일(app_access · dma_registry_intent · dma_admin_intent · dma_admin_reflect · dma_gateway_identities · dma_journal_apply · dma_strategy_read) — 로컬 일회용 컨테이너 재생 | 전부 `# RESULT: PASS` |
| `supabase/migrations` 에 키 개명 · 가시성 v2 없음 + Phase 29 additive 4개 존재 | PASS |
| `20261006200000_app_access.sql` SQL 문에 e2e 테스트 도메인 0 (주석 제외) — `supabase/migrations/` 전체 grep 도 0건 | PASS |
| 시드 스크립트 env 누락 시 원격 접촉 전 exit 1 + `from("app_users")` · `onConflict: "email"` 존재 | PASS |
| 추가: `tsc --noEmit --strict` (스크립트 단독) | PASS |
| `git status --porcelain --untracked-files=no` | `M tasks/lessons.md` 1줄 — 다른 세션의 미커밋 변경(이 플랜과 무관 · 스테이징하지 않음). 이 플랜의 추적 파일은 0줄 |

`ls supabase/migrations | tail -6`:

```
20261006090500_limitup_commit_day_timeout.sql
20261006120000_limitup_locks_lock_risk.sql
20261006200000_app_access.sql
20261006200100_dma_registry_intent.sql
20261006200200_dma_admin_intent_rpcs.sql
20261006200300_dma_admin_reflect.sql
```

`ls supabase/deploy-window/29` → 디렉터리 없음(키 개명 · 가시성 v2 SQL 은 아직 작성 전 — 29-09 · 29-25 몫). 어느 쪽이든 `supabase/migrations/` 에 섞여 있지 않다.

커밋: `3081092b` chore(29-07): e2e 시드 스크립트가 app_users admin 을 upsert — D-20 e2e 전용 경로 (두 파일만)

## 메커니즘 선택 근거 (D-20 개정 — e2e 계정 admin 은 e2e 전용 경로로만)

택: **기존 `webapp/scripts/seed-test-user.ts` 확장.**

- **(a) 같은 곳 · 같은 수명주기.** 이 스크립트가 이미 e2e auth 사용자를 만드는 곳이고, 수명주기(SETUP.md §5 — 셸에서 service role 을 export 해 수동 · 멱등 실행)가 정해져 있다. 역할 행을 auth 사용자와 같은 곳 · 같은 수명주기에 둔다.
- **(b) Playwright 글로벌 셋업 upsert 기각.** service role 키를 러너 프로세스 env 에 올려야 하는데, `webServer`(Next dev)는 부모 env 를 물려받는다. 그래서 `playwright.config.ts` 가 그 키를 `E2E_ENV_ALLOWLIST` 에서 일부러 뺐다(SETUP.md §3 — webapp 런타임 주입 금지).
- **(c) 비운영 한정 미들웨어 우회 기각.** 운영 코드 경로에 인증 우회 분기를 싣는다 — env 하나 잘못 켜지면 전면 개방.

구현: 사용자 존재 시 조기 `return` 제거 → `roleEmail = email.trim().toLowerCase()`(표 CHECK 가 소문자 · btrim 요구) → `upsert({ email, role: "admin" }, { onConflict: "email" })` → `.select("email, role").eq(...).maybeSingle()` 재조회 → `app_users: <email> = admin` 출력. 행이 없거나 admin 이 아니면 exit 1. upsert · 재조회 오류는 `error.message` 와 「Phase 29 마이그레이션 원격 적용(29-07 Task 2 의 push) 뒤 재실행」 안내 후 exit 1. 출력은 이메일 · user id · 역할뿐.

## Task 2 명령 (메인 세션 — 사용자 확인 뒤)

적용 대상 버전 4개(29-01 · 29-05 SUMMARY 기준 — 재번호 없음):

- `20261006200000_app_access`
- `20261006200100_dma_registry_intent`
- `20261006200200_dma_admin_intent_rpcs`
- `20261006200300_dma_admin_reflect`

1. `cd /Users/alex/repos/gh-radar && git status -sb` — 남의 미커밋 · 로컬 커밋 확인.
2. `supabase migration list --linked` — Remote 칸이 빈 것이 위 네 버전(그리고 다른 세션이 의도해 둔 것)뿐인지. 원격 최신 버전이 `20261006200300` 보다 새로우면 **멈추고 보고**(`--include-all` 금지).
3. `supabase db push --linked --yes` (비TTY 면 `SUPABASE_ACCESS_TOKEN` 설정 뒤 · `yes |` · 출력 파이프 붙이지 않기). 출력에서 네 파일 적용 확인.
4. `supabase migration list --linked` — 네 버전이 Local · Remote 모두 있다.
5. smoke (service role 키는 변수에만 · 출력 금지, `SUPABASE_URL` 은 라이브 server Cloud Run env 값):
   - 준비: `SR="$(gcloud secrets versions access latest --secret=gh-radar-supabase-service-role)"`
   - a. `curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/admin_users_raw" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' -d '{}' | jq 'keys'` → `["appUsers","intent","pending","results","servers","snapshotAccounts","snapshots"]`
   - b. `curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/admin_servers_raw" -H "apikey: $SR" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' -d '{}' | jq '.servers | length'` → `4`
   - c. anon 키로 `curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/my_app_access" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' -d '{}'` → 401/403 또는 permission denied (anon 은 EXECUTE REVOKE)
   - d. `curl -s "$SUPABASE_URL/rest/v1/app_users?select=email,role&role=eq.admin" -H "apikey: $SR" -H "Authorization: Bearer $SR"` → admin **정확히 2행(alex@jx1.io · ezmesya@gmail.com)**. 3행 이상이면 멈추고 보고
   - e. 웹(운영) 테마 편집 화면에서 `ezmesya@gmail.com` 의 테마 편집 버튼이 그대로 보인다(is_theme_admin 흡수 회귀) — 확인 불가면 생략 표시
6. e2e 전용 시드 — **사용자 `!` 실행**(메인 세션은 비밀 파일을 읽지 않는다):
   `! cd /Users/alex/repos/gh-radar/webapp && set -a && . ./.env.test.local && set +a && ./node_modules/.bin/tsx scripts/seed-test-user.ts`
   → 출력에 `User exists: …`(또는 `Created: …`)와 `app_users: <e2e 이메일> = admin`. `Missing required env vars` 로 끝나면 `.env.test.local` 에 `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 가 없는 것 — SETUP.md §5.1 대로 같은 셸에서 export 한 뒤 재실행(값 출력 금지).
   - f. smoke d 와 같은 조회 → admin 3행(alex · ezmesya · e2e 계정).
7. 하나라도 기대값이 아니면 멈추고 보고.

## 되돌리기 (사용자 판단 · 수동 · 이 순서 — 각 파일 머리 주석 기준)

e2e 행만 되돌릴 때: `DELETE FROM public.app_users WHERE email = '<e2e 이메일 소문자>';`

전체 되돌리기(새 파일 역순):

1. **20261006200300_dma_admin_reflect** — 함수 DROP(`dma_admin_apply_snapshot` · `dma_admin_record_results` · `admin_users_raw` · `admin_servers_raw` · `dma_admin_adopt_server_accounts`) → 표 DROP `dma_admin_results` · `dma_server_user_accounts` · `dma_server_snapshots`.
2. **20261006200200_dma_admin_intent_rpcs** — 함수 DROP(`dma_admin_create_dma_user` · `dma_admin_set_password` · `dma_admin_put_account` · `dma_admin_mark_account_removed` · `dma_admin_settle_server` · `dma_admin_delete_dma_user` · `dma_admin_intent` · 헬퍼 `dma_admin__server_list` · `dma_admin__activate_servers`). 표는 29-01 소유라 건드리지 않는다.
3. **20261006200100_dma_registry_intent** — 레지스트리 RPC 4종(`dma_admin_upsert_server` · `dma_admin_set_server_enabled` · `dma_admin_set_order_server` · `dma_admin_set_quote_primary`) · `dma_app_access_map()` DROP → `dma_account_servers` · `dma_user_accounts` 표 DROP → `app_users.dma_user_id` 열 DROP → `dma_users` · `dma_servers` 표 DROP → 트리거 함수 `dma_account_servers_broker_guard` DROP.
4. **20261006200000_app_access** — `is_theme_admin()` 을 `20260610130000_theme_admin_overrides.sql` 본문(theme_admins 조회)으로 CREATE OR REPLACE(권한 줄 재명시 — theme_admins 표는 그대로 남아 있다) → `DROP FUNCTION public.my_app_access()` → `public.app_users` 표 DROP.
5. 원격 이력 정리가 필요하면 `supabase migration repair --status reverted <version>` (네 버전).

옛 relay(KB · KYOBO 키)는 이 넷을 읽지 않으므로 적용 · 되돌리기 모두 relay 무영향.

## Task 2 결과 (메인 세션 실행 · e2e 시드는 사용자 `!` 실행)

- **사용자 확인:** AskUserQuestion 「적용」 선택(2026-10-07).
- **사전 `supabase migration list --linked`:** Remote 빈 칸은 `20261006200000` · `20261006200100` · `20261006200200` · `20261006200300` 넷뿐. 원격 최신은 `20261006120000` — 우리 버전보다 새 원격 버전 없음(`--include-all` 불필요).
- **push:** `supabase db push --linked --yes` → 네 파일 Applying … → Finished. NOTICE 1줄: `trigger "trg_dma_account_servers_broker_guard" for relation "public.dma_account_servers" does not exist, skipping` — `DROP TRIGGER IF EXISTS` 의 첫 적용 정상 메시지.
- **사후 `supabase migration list --linked`:** 네 버전 Local = Remote.

| smoke | 기대 | 결과 |
|---|---|---|
| a. `admin_users_raw` keys | 7키 | `["appUsers","intent","pending","results","servers","snapshotAccounts","snapshots"]` PASS |
| b. `admin_servers_raw` `.servers \| length` | 4 | `4` PASS |
| c. anon → `rpc/my_app_access` | 401/403 · permission denied | HTTP 401 · `{"code":"42501","message":"permission denied for function my_app_access"}` PASS |
| d. `app_users` admin | 정확히 2행(테스트 신원 없음) | `["alex@jx1.io","ezmesya@gmail.com"]` · 역할 분포 admin 2 / trader 2 PASS |
| e. 운영 웹 테마 편집 버튼(ezmesya) | 그대로 보임 | **생략** — 운영 웹 화면 확인을 그 세션에서 할 수 없음 |
| e2e 전용 시드 | `= admin` | `User exists: e2e@gh-radar.local (id=37a91495-fa9f-4e64-97e9-650f689f6f98)` · `app_users: e2e@gh-radar.local = admin` PASS |
| f. `app_users` admin (시드 뒤) | 3행 | `["alex@jx1.io","ezmesya@gmail.com","e2e@gh-radar.local"]` · 역할 분포 admin 3 / trader 2 PASS |

옛 relay(KB · KYOBO 키) 무영향 — 이 넷은 새 표 · RPC · `is_theme_admin` 본문 재정의뿐이고, 키 개명 · 가시성 v2 는 `supabase/deploy-window/29/`(29-09 · 29-25)에 있어 이 push 에 섞이지 않았다.

## Deviations from Plan

None - 플랜대로 실행. (Task 1 에서 추가로 시드 스크립트 단독 `tsc --strict` 를 돌렸다 — 통과.) smoke e 는 플랜이 허용한 「확인 불가면 생략 표시」 경로.

## Issues Encountered

- `git status --porcelain --untracked-files=no` 가 0줄이 아니라 `M tasks/lessons.md` 1줄 — 다른 세션의 미커밋 변경. 이 플랜 파일이 아니므로 스테이징하지 않았고 게이트 판정에서 제외했다.
- Task 1 시점에 `supabase/deploy-window/29/` 는 아직 없었다(29-09 가 이후 만들었다) — 「섞이지 않음」 조건은 `supabase/migrations/` grep 으로 확인.

## Self-Check: PASSED

- FOUND: webapp/scripts/seed-test-user.ts · webapp/SETUP.md · 29-07-SUMMARY.md
- FOUND: 3081092b (HEAD 조상)
