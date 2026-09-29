---
phase: quick-260929-sas
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260929190000_dma_gateway_identities.sql
  - supabase/tests/dma_gateway_identities.test.sql
  - supabase/tests/dma_strategy_read.test.sql
  - relay/src/journal/types.ts
  - relay/src/journal/identities.ts
  - relay/src/ws/fanout.ts
  - relay/src/index.ts
  - relay/tests/journal-identities.test.ts
  - relay/tests/journal-push.test.ts
  - relay/tests/journal-boot.test.ts
  - relay/tests/helpers/supabase-stub.ts
  - infra/relay/README.md
  - .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh
  - .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.ts
autonomous: false
requirements: [SAS-DB, SAS-RELAY, SAS-OPS, SAS-LIVE]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-01: dma_credentials 에 gateway text NOT NULL DEFAULT 'KB' 칸이 생기고 기존 행은 전부 'KB' 다. PK(user_id)는 그대로이고 (gateway, dma_user_id) UNIQUE 는 만들지 않는다 — junysim 이 gh-radar 사용자 2명에게 공유된 실데이터가 있다 (SAS-DB)"
    - "D-02: dma_gateway_identities(user_id → auth.users ON DELETE CASCADE, gateway, dma_user_id, created_at, PK (user_id, gateway))가 RLS 활성 · 정책 0개 · anon/authenticated 명시 REVOKE · service_role 전용이다. 같은 잠금이 뷰 dma_visibility_identities(security_invoker)와 함수 dma_visible_accounts(uuid)에도 걸린다 (SAS-DB)"
    - "D-03: 가시성 규칙은 뷰 dma_visibility_identities 한 곳에만 있다 — 자격증명 신원(user_id, gateway, dma_user_id) UNION ALL 연결 신원(단, 그 사용자에게 자격증명이 있고 연결 gateway 가 자격증명 gateway 와 다를 때만). dma_visible_accounts(p_user_id) 가 이 뷰로 (gateway, account_no) 를 DISTINCT 로 풀고, dma_journal_orders_for_user · dma_strategy_events_for_user · dma_order_events_for_user 세 RPC 가 전부 이 함수만 쓴다. 세 RPC 의 시그니처 · 반환 모양 · 권한은 바뀌지 않아 server 코드는 무수정이다 (SAS-DB)"
    - "D-04: 시드는 데이터 기반이다(저장소에 실 id 리터럴 0). 오늘 KYOBO 매핑에 있는 dma_user_id 를 가진 자격증명 행마다 (user_id, 'KYOBO', dma_user_id) 연결을 넣는다. 그래서 적용 직후 각 사용자의 가시 (gateway, account) 집합과 오늘 주문 행 수가 적용 전과 같다. 이후 새로 생기는 KYOBO id 는 KB 자격증명 문자열과 같아도 명시 연결 전까지 아무에게도 안 보인다 (SAS-DB)"
    - "D-05: relay 는 추가 게이트웨이(KYOBO)의 journal.rows · journal.events 푸시를 그 게이트웨이 신원이 있는 gh-radar 사용자에게만, 그 신원의 dma_user_id 매핑으로만 보낸다(자격증명 문자열은 보지 않는다). 신원은 dma_visibility_identities 를 부팅 즉시 + 주기 재적재로 읽고, 첫 적재 전 · 조회 실패 첫 구간은 아무에게도 보내지 않는다(fail closed). KB 푸시 경로 · 결선 줄 · /healthz · 503 판정식은 그대로이고, KYOBO env 가 없으면 신원 조회 자체가 없다 (SAS-RELAY)"
    - "D-06: infra/relay/README.md 다중 게이트웨이 절이 새 신원 규칙과 연결 추가 · 제거 SQL 절차(서비스롤)를 담고, 옛 「다른 사람이면 … 겹치면 안 된다」 경고를 대체한다 (SAS-OPS)"
    - "[메인 세션] supabase db push --dry-run 의 미적용 목록을 사용자에게 보이고, Phase 25 마이그레이션 3개가 섞이면 명시 승인 없이는 push 하지 않는다. 적용했다면 원격 검증 스크립트 check 가 ALL PASS(연결 = 기대 시드 · 사용자별 가시 집합 = 옛 규칙 · 오늘/최근 거래일 행 수 동일)다. relay 는 배포 버전..HEAD 의 relay/shared 변경이 이 quick 커밋뿐일 때만 배포한다 (SAS-LIVE)"
  artifacts:
    - path: "supabase/migrations/20260929190000_dma_gateway_identities.sql"
      provides: "gateway 칸 · 연결 테이블 · 데이터 기반 시드 · 규칙 뷰 · dma_visible_accounts · 세 조회 RPC 재정의 · 권한 재명시"
      contains: "dma_visible_accounts(p_user_id)"
    - path: "supabase/tests/dma_gateway_identities.test.sql"
      provides: "pgTAP — 스키마 · 권한 · 가시성 매트릭스(공유 문자열 충돌 · 자기 게이트웨이 연결 무시 · 자격증명 없는 연결 무시 · 다른 id 연결) · ⑨ · 전략 RPC 2종 · cascade"
    - path: "relay/src/journal/identities.ts"
      provides: "GatewayIdentities — dma_visibility_identities 적재 · 주기 재적재 · fail closed · viewOf(gateway)"
      exports: ["GatewayIdentities", "IDENTITY_REFRESH_MS"]
    - path: ".planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh"
      provides: "원격 검증 래퍼 — snapshot(적용 전) · check(적용 후) · selftest(네트워크 없음)"
  key_links:
    - from: "dma_journal_orders_for_user · dma_strategy_events_for_user · dma_order_events_for_user"
      to: "dma_visible_accounts(uuid) → dma_visibility_identities"
      via: "세 RPC 의 가시성 조인이 전부 이 함수 호출 하나 — 규칙은 뷰 한 곳"
      pattern: "dma_visible_accounts\\(p_user_id\\)"
    - from: "relay/src/index.ts 추가 게이트웨이 루프"
      to: "fanout.deliverJournalRows(rows, route) · fanout.deliverStrategyEvents(rows, route)"
      via: "route = { access: extra.access, identities: gatewayIdentities.viewOf(extra.upstream.gateway) }"
      pattern: "viewOf\\("
    - from: "relay/src/journal/identities.ts"
      to: "PostgREST dma_visibility_identities"
      via: "from(\"dma_visibility_identities\").select(user_id, gateway, dma_user_id).in(\"gateway\", 추가 게이트웨이 키)"
      pattern: "dma_visibility_identities"
---

<objective>
gh-radar 사용자와 게이트웨이 계좌를 잇는 가시성 조인을 **게이트웨이 인지**로 바꾼다. 지금은 `dma_credentials.dma_user_id` 문자열 하나로 모든 게이트웨이의 `dma_account_access` 와 잇는다(T-c8e-02). 바뀐 뒤에는 KB 는 자격증명 신원으로, 추가 게이트웨이(KYOBO)는 **명시적 신원 연결**로만 보인다. 규칙은 DB 뷰 한 곳에 두고, REST 조회 RPC 3종과 relay 추가 게이트웨이 푸시(journal.rows · journal.events)가 같은 규칙을 쓴다.

잠금 설계(오케스트레이터 · 의미 변경 금지) ↔ 이 계획의 결정 ID:
- D-01 = `dma_credentials.gateway text NOT NULL DEFAULT 'KB'` (PK 변경 없음)
- D-02 = 연결 테이블 `dma_gateway_identities` (service_role 전용 · 명시 REVOKE)
- D-03 = 신원 집합 = 자격증명 UNION ALL 연결 · 모든 가시성 조인이 `gateway` + `dma_user_id` 둘 다로 · SQL 헬퍼 하나
- D-04 = 데이터 기반 시드(오늘 승인된 KYOBO 가시성 그대로 재현 · 실 id 리터럴 0)
- D-05 = relay 추가 게이트웨이 푸시도 같은 규칙 · KB 경로 불변
- D-06 = README 연결 추가 · 제거 절차 · 옛 경고 대체

플래너 정밀화(의미 유지 · 사용자가 알아야 할 것):
- 뷰는 연결 신원을 **그 사용자에게 자격증명이 있을 때만**, 그리고 **연결 gateway 가 자격증명 gateway 와 다를 때만** 센다. 앞의 조건은 D-12(자격증명 행 = allowlist)를 REST 에서도 지킨다. 뒤의 조건은 relay KB 푸시(자격증명 문자열 · 불변)와 REST 가 어긋나지 않게 한다.
- 이 마이그레이션은 Phase 25 조회 RPC 2종도 재정의하므로 버전이 `20260929180200` 뒤(`20260929190000`)다. 원격에 Phase 25 가 아직 없으면 `supabase db push` 가 네 파일을 함께 올린다 → Task 3 이 사용자 승인으로 가른다.

Purpose: 교보 users.toml 에 KB 의 다른 사람과 같은 user_id 문자열이 들어와도 그 사람에게 교보 계좌 주문이 새지 않게 한다(오늘은 시드로 현행 가시성 유지).
Output: 마이그레이션 1 · pgTAP 1(+ Phase 25 픽스처 1줄) · relay 신원 적재기 + 푸시 경로 · README 절 · 원격 검증 스크립트.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260929-c8e-relay-kyobo-observer/260929-c8e-SUMMARY.md

계획 시점 사실(2026-09-29 20:3x KST 확인):
- `supabase migration list`: 원격 최신 = `20260924200100`. `20260929180000` · `20260929180100` · `20260929180200`(Phase 25)는 **Local 에만** 있다. 25-11 이 사용자 `supabase db push` 로 올릴 예정이고, 25-11 계획은 「다른 미적용 파일이 섞이면 중단」 이다.
- 배포된 relay = `4c143596`(healthz). 그 뒤 HEAD 까지 relay/shared 에 Phase 25 커밋 14건(a058f26f 전략 기록기 등)이 있다. 그래서 **HEAD relay 를 지금 배포하면 Phase 25 relay 가 함께 나간다** — 25-12 의 선행 조건(DB 적용 · gh-trade 서버 배포) 없이는 금지.
- 실데이터: dma_credentials 3행(milles → 1명, junysim → 2명), dma_account_access KB 3 · KYOBO 3(ezmesya · junysim · milles). 사용자는 오늘의 KYOBO 가시성(junysim 2명 · milles 1명)을 승인했다. ezmesya 는 자격증명이 없다.
- 원격 조회 관례: `workers/master-sync/.env` 를 `set -a; source` 로만 읽고(값 출력 금지) `pnpm --filter @gh-radar/relay exec tsx <스크립트>` 로 실행한다(`scripts/dma-credentials.sh` 선례). 서비스롤 클라이언트는 `relay/src/store/supabase.ts` 의 `createRelaySupabase`.
- pgTAP 러너: `bash scripts/verify-dma-orders-price-check.sh --test <파일>` — 일회용 로컬 컨테이너에 전 마이그레이션을 재생(원격 접촉 0). 이미지 로컬 존재 확인됨.
- c8e 하네스 `260929-c8e-verify.sh` 의 R9(`deliverJournalRows` 가 `?: JournalAccessView` 를 받는다)는 이 quick 이 의도적으로 대체한다 — 그 하네스를 게이트로 돌리지 않는다.

동시 작업 주의:
- 다른 세션의 미커밋 `.planning/state.json` · `webapp/e2e/fixtures/relay.ts` 등은 **절대 stage 하지 않는다**. 경로를 명시해 `git add` 하고, 커밋 직전마다 `git status -sb` 를 본다.
- 병행 quick 260929-sar 가 `infra/relay/README.md`(알림 문단) · `scripts/deploy-relay.sh` 를 먼저 고친다. 이 계획은 deploy-relay.sh 를 건드리지 않고, README 는 「신원 규칙」 절과 새 절 · 롤아웃 4단계 문구 · 끄기 항목만 고친다.
- 커밋: 한글, 접두 `test(quick-260929-sas):` · `feat(quick-260929-sas):` · `docs(quick-260929-sas):`, **Co-Authored-By 줄 없음**(사용자 규칙), push 없음.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): KYOBO 통보 행 한 건 — REST ⑨ 와 relay journal.rows 푸시가 둘 다 명시 신원 연결로만 (D-01 · D-02 · D-03 · D-04 · D-05)</name>
  <files>supabase/migrations/20260929190000_dma_gateway_identities.sql, supabase/tests/dma_gateway_identities.test.sql, relay/src/journal/types.ts, relay/src/journal/identities.ts, relay/src/ws/fanout.ts, relay/src/index.ts, relay/tests/journal-identities.test.ts, relay/tests/journal-push.test.ts, relay/tests/journal-boot.test.ts, relay/tests/helpers/supabase-stub.ts</files>
  <read_first>
    - supabase/migrations/20260905120100_dma_credentials.sql (잠금 4줄 구성 · 정책 금지 이유)
    - supabase/migrations/20260924200000_dma_journal_tables.sql (dma_account_access PK · dma_account_orders 필수 칸)
    - supabase/migrations/20260924200100_dma_journal_rpcs.sql 555-630 (⑨ RETURNS TABLE 25칸 · 본문 · 권한 3줄 — 재정의는 여기서 그대로 복사)
    - supabase/tests/dma_strategy_read.test.sql 1-60 (pgTAP 파일 골격 · 픽스처 · sync_access 사용법 · 단언 설명 튜플 관례)
    - relay/src/journal/access.ts (JournalAccess 로그 · 재시도 · safePgError 관례)
    - relay/src/journal/types.ts 215-225 (JournalAccessView)
    - relay/src/ws/fanout.ts 355-370 (UserEntry.dmaUserId) · 1489-1535 (deliverJournalRows · #pushJournalRows)
    - relay/src/index.ts 전체 (추가 게이트웨이 루프 · 종료 절차 · 키 리터럴 금지 관례)
    - relay/tests/journal-push.test.ts 40-140 (USER_A1/A2 공유 dma-shared · USER_B dma-other · 헬퍼) · 500-545 (⑥)
    - relay/tests/helpers/supabase-stub.ts (KNOWN_PATHS · unknownRequests)
    - relay/tests/journal-boot.test.ts 480-600 (M1 · M2)
  </read_first>
  <behavior>
    - pgTAP 매트릭스(사용자 U1·U2 = 같은 자격증명 문자열 dma-shared, U3 dma-solo, U4 dma-kb4, U5 자격증명 없음 / KB 매핑 dma-shared→…001 · dma-solo→…002 / KYOBO 매핑 dma-shared→…011 · dma-ky4→…012 / 연결 U1(KYOBO, dma-shared) · U3(KB, dma-shared) · U4(KYOBO, dma-ky4) · U5(KYOBO, dma-shared)):
      U1 → {(KB,…001),(KYOBO,…011)} · U2 → {(KB,…001)} 만(같은 문자열이지만 연결 없음 — 핵심) · U3 → {(KB,…002)} 만(자기 게이트웨이 연결 무시) · U4 → {(KYOBO,…012)} 만(다른 id 연결) · U5 → 없음(자격증명 없는 연결 무시)
    - ⑨ dma_journal_orders_for_user 가 같은 매트릭스의 계좌 행만, 중복 없이 돌려준다
    - 자격증명 없이 INSERT 한 행의 gateway = 'KB' · 사용자 삭제 시 연결 cascade · 자격증명을 지우면 연결 행이 남아도 가시 집합은 비어 있다
    - 권한: 연결 테이블 · 뷰 · dma_visible_accounts · ⑨ 모두 anon/authenticated 불가 · service_role 가능 · 연결 테이블 RLS 활성 + 정책 0개 · 뷰 security_invoker=true
    - relay: 추가 게이트웨이 행은 신원이 있는 사용자에게 그 신원 dma_user_id 매핑으로만 간다 — A1(연결 dma-shared)은 받고 A2(같은 자격증명 문자열 · 연결 없음)는 못 받는다 · B(연결 id 가 자격증명과 다름)는 자기 연결 계좌 행을 받는다 · 인자 없는 호출(KB)은 종전대로 A1·A2 둘 다
    - 신원 적재기: 첫 적재 전 undefined(fail closed) · 적재 후 viewOf(gw).dmaUserIdOf(user) · 실패 시 직전 값 유지 · 주기 재적재가 삭제된 연결을 거둔다 · close 뒤 조회 없음 · 조회 겹침 없음
    - 부팅: KYOBO env 없으면 dma_visibility_identities 요청 0건(M1) · 있으면 gateway=in.(KYOBO) 요청이 있고 unknownRequests 는 여전히 빈 배열(M2)
  </behavior>
  <action>
**RED 먼저 — 실패 테스트를 쓰고 커밋한다.**

(R1) `supabase/tests/dma_gateway_identities.test.sql`(신규). `dma_strategy_read.test.sql` 골격을 따른다: 머리 주석(무엇을 잠그는가 · 실행 명령 · 전체 한 트랜잭션 · 끝에서 ROLLBACK · 단언 설명에 (사용자, 게이트웨이, 계좌 말미, 기대) 튜플), `BEGIN;` · `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;` · `SET LOCAL search_path = public, extensions;`. 픽스처는 <behavior> 의 매트릭스 그대로다. 사용자 uuid 는 `00000000-0000-4000-8000-0000000026xx`, 이메일 `sas-uN@example.invalid`, 계좌는 `2600000001` 같은 명백한 가짜값. 자격증명은 gateway 칸을 **생략**해 INSERT 한다(기본값 검증). 매핑은 `dma_journal_sync_access('KB', …)` · `('KYOBO', …)` 로 넣는다. 주문은 `dma_account_orders` 에 직접 INSERT 한다(계좌당 1행, trade_date 2026-09-29, 필수 칸은 schema 테스트의 직접 INSERT 형태를 따른다). 연결 4행은 `dma_gateway_identities` 에 직접 INSERT 한다. 단언(`plan(N)` 은 실제 개수와 정확히 같게):
- 스키마: dma_credentials.gateway 존재 · NOT NULL · 기본값 'KB' · 생략 INSERT 행 값 'KB' / 연결 테이블 존재 · PK (user_id, gateway) · auth.users FK · RLS 활성 · 정책 0개 · anon · authenticated 각각 SELECT/INSERT/UPDATE/DELETE 불가 · service_role 4종 가능 / 뷰 dma_visibility_identities 존재 · reloptions 에 security_invoker=true · anon · authenticated SELECT 불가 · service_role SELECT 가능 / `dma_visible_accounts(uuid)` 와 `dma_journal_orders_for_user(uuid, date)` EXECUTE 가 anon · authenticated 불가 · service_role 가능.
- 매트릭스: 사용자 5명 각각 `dma_visible_accounts` 결과를 `set_eq` 로. 뷰에서 U3 은 KB 자격증명 1행만, U5 는 0행.
- ⑨: 사용자별 반환 account_no 집합이 매트릭스와 같고, U1 행 수 = distinct id 수(중복 없음).
- 수명: U1 자격증명 DELETE 뒤 `dma_visible_accounts(U1)` 0행이면서 U1 연결 행은 남아 있다. U4 를 auth.users 에서 DELETE 하면 U4 연결 행 0.
끝은 `SELECT * FROM finish();` · `ROLLBACK;`.

(R2) relay 테스트:
- `relay/tests/journal-identities.test.ts`(신규). `from(table).select(cols).in(col, vals)` 체인을 기록하고 결과를 차례로 돌려주는 최소 가짜 supabase 를 파일 안에 둔다. 케이스: 요청 모양(테이블 dma_visibility_identities · select 에 user_id · gateway · dma_user_id · in gateway = 생성자 게이트웨이 목록) / 첫 적재 전 undefined / 적재 후 viewOf('KYOBO').dmaUserIdOf(user) = 신원 · 모르는 사용자 undefined · 목록 밖 게이트웨이 viewOf 는 늘 undefined / 실패 시 직전 값 유지 + error 로그에 사용자 · dma id 가 없음 / 재적재가 사라진 연결을 거둠 / close 뒤 추가 조회 없음 / 느린 조회 중 다음 주기가 겹쳐 부르지 않음. 주기는 생성자 `refreshMs` 를 작게 주입한다.
- `relay/tests/journal-push.test.ts`: ⑥ 은 새 규칙으로만 갱신한다 — `kyoboAccess` 대신 route `{ access: kyoboAccess, identities: <USER_B → "dma-other" 인 가짜 뷰> }` 를 넘기고 나머지 단언은 그대로 둔다. 새 케이스 ⑧ 을 더한다: KYOBO 매핑 dma-shared→가짜 교보 계좌 K1 · kyobo-b→K2, 신원 USER_A1→dma-shared · USER_B→kyobo-b. K1 행 → A1 만 · A2 는 0(같은 자격증명 문자열 dma-shared 지만 연결 없음 — 핵심 회귀) · K2 행 → B 만 · 누구에게도 매핑되지 않은 계좌 행 → 0 · U 는 늘 0. ①–⑤ · ⑦ 케이스 본문은 바꾸지 않는다.
- `relay/tests/helpers/supabase-stub.ts`: 경로 `/rest/v1/dma_visibility_identities` 를 KNOWN_PATHS 에 넣고, 기본 빈 배열 · `seedIdentities(rows)` 로 시드한 행을 돌려준다. 머리 주석 경로 목록에 한 줄.
- `relay/tests/journal-boot.test.ts`: M1 에 「dma_visibility_identities 요청 0건」 단언, M2 에 「query.gateway 가 `in.(KYOBO)` 인 요청 ≥ 1 · select 에 user_id 와 dma_user_id 포함」 단언을 더한다(기존 단언 유지 · unknownRequests 빈 배열 단언이 계속 통과해야 한다).
RED 확인: pgTAP 러너가 마이그레이션 부재로 실패하고, relay 신규 케이스가 실패(타입 오류 포함)한다. 커밋: `test(quick-260929-sas): 게이트웨이 인지 가시성 실패 테스트 — pgTAP 신원 매트릭스 · relay 신원 적재기 · 추가 게이트웨이 journal.rows 명시 연결 푸시`.

**GREEN.**

(G1) `supabase/migrations/20260929190000_dma_gateway_identities.sql`(신규 · `BEGIN; … COMMIT;`). 머리 주석: 목적(T-c8e-02 대체) · D-01~D-05 근거 · 뷰 정밀화 두 조건의 이유(D-12 allowlist · KB 푸시와 REST 일치) · **이 파일은 20260929180200 뒤에 적용돼야 한다(Task 2 가 전략 조회 RPC 2종을 여기서 재정의)** · 멱등 근거 · 되돌리기 메모(⑨ 는 20260924200100 본문, 전략 2종은 20260929180200 본문으로 CREATE OR REPLACE → dma_visible_accounts DROP → 뷰 DROP → 연결 테이블 DROP → dma_credentials.gateway DROP COLUMN) · 하지 않는 것(정책 추가 금지 · (gateway, dma_user_id) UNIQUE 금지 — 공유 계정 실데이터 · 실 id 리터럴 금지 · SECURITY DEFINER 금지). 옛 조인 문구를 **코드 줄**에 남기지 않는다(주석은 `--` 줄 시작으로만).
순서:
① `ALTER TABLE public.dma_credentials ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'KB' CHECK (gateway <> '')` — 자격증명 자신의 게이트웨이(D-01). 주석: relay SessionManager 로그인은 여전히 DMA_BROKER 게이트웨이이고 이 칸은 가시성 규칙용이다.
② `CREATE TABLE IF NOT EXISTS public.dma_gateway_identities` — `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` · `gateway text NOT NULL CHECK (gateway <> '')` · `dma_user_id text NOT NULL CHECK (dma_user_id <> '')` · `created_at timestamptz NOT NULL DEFAULT now()` · `PRIMARY KEY (user_id, gateway)`(D-02). 잠금 4줄(`ENABLE ROW LEVEL SECURITY` · `REVOKE ALL … FROM PUBLIC` · `REVOKE ALL … FROM anon, authenticated` · `GRANT SELECT, INSERT, UPDATE, DELETE … TO service_role`).
③ 시드(D-04): `INSERT INTO public.dma_gateway_identities (user_id, gateway, dma_user_id) SELECT DISTINCT c.user_id, 'KYOBO', c.dma_user_id FROM public.dma_credentials c WHERE EXISTS (SELECT 1 FROM public.dma_account_access a WHERE a.gateway = 'KYOBO' AND a.dma_user_id = c.dma_user_id) ON CONFLICT (user_id, gateway) DO NOTHING`. 주석: 적용 시점 원격 데이터로 오늘 승인된 가시성을 그대로 재현한다(로컬 재생에서는 0행) · 이후 새 KYOBO id 는 README 절차로만 연결한다.
④ `CREATE OR REPLACE VIEW public.dma_visibility_identities WITH (security_invoker = true)` — 칸 (user_id, gateway, dma_user_id). 첫 갈래 = dma_credentials 전 행. `UNION ALL` 둘째 갈래 = dma_gateway_identities l 을 dma_credentials c 와 `c.user_id = l.user_id` 로 JOIN 하고 `l.gateway <> c.gateway` 인 행(D-03). 권한 `REVOKE ALL … FROM PUBLIC` · `REVOKE ALL … FROM anon, authenticated` · `GRANT SELECT … TO service_role`.
⑤ `CREATE OR REPLACE FUNCTION public.dma_visible_accounts(p_user_id uuid) RETURNS TABLE (gateway text, account_no text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp` — 본문: dma_account_access a 를 뷰 i 와 `i.gateway = a.gateway AND i.dma_user_id = a.dma_user_id` 로 JOIN, `WHERE i.user_id = p_user_id`, `SELECT DISTINCT a.gateway, a.account_no`(칸 참조는 전부 별칭으로 한정). 권한 3줄(시그니처 `(uuid)` 정확히).
⑥ `CREATE OR REPLACE FUNCTION public.dma_journal_orders_for_user(p_user_id uuid, p_trade_date date)` — RETURNS TABLE 25칸 · LANGUAGE/STABLE/INVOKER/search_path · SELECT 목록 · LEFT JOIN stocks · ORDER BY 는 20260924200100 에서 **글자 그대로** 복사한다. 바뀌는 것은 가시성 조인 하나: FROM dma_account_orders o 뒤에 `JOIN public.dma_visible_accounts(p_user_id) v ON v.gateway = o.gateway AND v.account_no = o.account_no`, WHERE 는 `o.trade_date = p_trade_date` 만. 함수 위 주석을 새 규칙으로 고친다(DISTINCT 헬퍼라 한 주문 행이 두 번 나오지 않는다). 권한 3줄 재명시(`(uuid, date)`).

(G2) `relay/src/journal/types.ts`: `GatewayIdentityView = { dmaUserIdOf(userId: string): string | undefined }` 와 `ExtraGatewayRoute = { access: JournalAccessView; identities: GatewayIdentityView }` 를 JSDoc 과 함께 더한다(신원은 gh-radar user_id 기준 · 게이트웨이당 사용자 1신원은 뷰 구성이 보장).

(G3) `relay/src/journal/identities.ts`(신규) — `export const IDENTITY_REFRESH_MS = 60_000` 과 `export class GatewayIdentities`. 생성자 deps `{ supabase: SupabaseClient; gateways: readonly string[]; refreshMs?: number }`. `start()` = 즉시 1회 적재 + `setInterval(refreshMs)`(`unref`). 적재 = `from("dma_visibility_identities").select("user_id, gateway, dma_user_id").in("gateway", [...gateways])` → 성공 시 `Map<gateway, Map<userId, dmaUserId>>` 를 **통째로 교체**, 진행 중이면 다음 주기를 건너뛴다(겹침 금지). 실패 시 직전 맵 유지 + `logger.error({ gateways, pgError: safePgError(err), attempt }, …)`. 첫 성공 전에는 빈 맵(fail closed — 추가 게이트웨이 푸시 없음 · REST 새로고침이 복원). info 로그는 첫 적재와 게이트웨이별 행 수가 바뀔 때만 `{ rows: { <gateway>: n } }` 로 남긴다 — 사용자 id · dma id 는 어떤 로그에도 싣지 않는다(T-19-14). `viewOf(gateway): GatewayIdentityView` 는 호출 시점의 최신 맵을 읽는 뷰를 돌려준다(교체 후에도 같은 뷰 객체가 새 값을 본다). `close()` = 타이머 해제 · 이후 적재 안 함. 머리 주석: 정본 규칙은 DB 뷰(D-03) · 이 모듈은 사본 · 연결 변경은 최대 refreshMs 뒤 푸시에 반영(REST 는 즉시) · 주 게이트웨이는 이 모듈을 쓰지 않는다(D-05).

(G4) `relay/src/ws/fanout.ts`: `deliverJournalRows(rows, extra?: ExtraGatewayRoute)` 로 두 번째 인자 타입을 바꾼다. `extra` 가 있으면 새 private 메서드로 보낸다 — `#users` 를 돌며 `extra.identities.dmaUserIdOf(userId)` 가 undefined 면 건너뛰고, 있으면 `extra.access.accountsOf(<그 신원>)` 로 부분집합을 걸러 비어 있지 않을 때만 `#deliver(userId, { t: "journal.rows", rows: subset })`. **`entry.dmaUserId` 는 추가 게이트웨이 경로에서 보지 않는다.** 인자가 없을 때의 주 게이트웨이 분기와 `#pushJournalRows` 는 동작을 바꾸지 않는다. JSDoc 의 「게이트웨이 무관 신원 규칙」 문장을 새 규칙(주 게이트웨이 = 자격증명 신원 · 추가 게이트웨이 = 명시 연결 신원 · REST dma_visible_accounts 와 같은 규칙)으로 고친다. `deliverStrategyEvents` 는 이 태스크에서 건드리지 않는다(Task 2).

(G5) `relay/src/index.ts`: 추가 게이트웨이가 1개 이상일 때만 `new GatewayIdentities({ supabase, gateways: extraJournals.map((p) => p.upstream.gateway) })` 를 만든다(없으면 null — KYOBO env 없는 relay 는 조회 0건 · 오늘과 같다). 결선 루프에서 게이트웨이마다 route `{ access: extra.access, identities: <loader>.viewOf(extra.upstream.gateway) }` 를 만들고 `extra.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, route))` 로 바꾼다. 전략 결선 줄은 Task 2 까지 그대로 둔다. 적재기 `start()` 는 관찰자 `start()` 루프 **앞**에 둔다. 종료 절차 5단계에서 적재기 `close()`. 머리 주석 quick-260929-c8e 문단 뒤에 quick-260929-sas 한 줄(추가 게이트웨이 푸시는 명시 연결 신원으로만). 주 게이트웨이 결선 줄 `journalWriter.on("applied", (rows) => fanout.deliverJournalRows(rows));` · 전략 · 상태 결선 줄은 **글자 그대로** 둔다. 게이트웨이 키 리터럴을 쓰지 않는다.

GREEN 확인 후 커밋: `feat(quick-260929-sas): 주문 가시성 게이트웨이 인지 — dma_credentials.gateway · 신원 연결 테이블 · 규칙 뷰 · ⑨ 재정의 · relay 추가 게이트웨이 journal.rows 명시 연결 푸시`. 경로를 명시해 stage 한다(이 태스크 files 목록만).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_gateway_identities.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql && pnpm --filter @gh-radar/relay exec vitest run tests/journal-identities.test.ts tests/journal-push.test.ts tests/journal-boot.test.ts && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && ! (grep -v '^[[:space:]]*--' supabase/migrations/20260929190000_dma_gateway_identities.sql | grep -qF 'c.dma_user_id = a.dma_user_id') && grep -qF 'journalWriter.on("applied", (rows) => fanout.deliverJournalRows(rows));' relay/src/index.ts && ! grep -q '"KYOBO"' relay/src/index.ts</automated>
    <fails_when>pgTAP 4파일 중 하나라도 `not ok` 이거나 마이그레이션 재생이 실패할 때, relay 대상 3파일 · typecheck 가 실패할 때, 마이그레이션 코드 줄에 옛 문자열 조인이 남거나 index.ts 주 게이트웨이 결선 줄이 바뀌거나 게이트웨이 키 리터럴이 생겼을 때</fails_when>
  </verify>
  <acceptance_criteria>
    - pgTAP 4파일 모두 `not ok` 0줄 · 러너 종료 0 (신규 + 기존 apply · schema · strategy_read 회귀)
    - relay 대상 3파일 통과 · typecheck · typecheck:tests 0
    - 마이그레이션 코드 줄(주석 제외)에 옛 문자열 조인 0 · `dma_visible_accounts(p_user_id)` ≥ 1
    - index.ts 주 게이트웨이 결선 줄이 글자 그대로 있고 게이트웨이 키 리터럴이 없다
    - 커밋 2건(test → feat) · Co-Authored-By 없음 · 다른 세션 파일 미포함
  </acceptance_criteria>
  <done>로컬 재생 DB 에서 KYOBO 계좌는 명시 연결 사용자에게만 보이고(공유 문자열 충돌 차단), ⑨ 가 같은 규칙으로 돌려준다. relay 는 추가 게이트웨이 journal.rows 를 신원 연결 사용자에게만 푸시하고, KB 경로 · KYOBO env 없는 부팅은 그대로다. RED → GREEN 커밋 2건.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Phase 25 전략 표면(조회 RPC 2종 · journal.events 푸시)도 같은 신원 규칙 + 연결 추가 · 제거 절차 · 원격 검증 스크립트 (D-03 · D-05 · D-06)</name>
  <files>supabase/migrations/20260929190000_dma_gateway_identities.sql, supabase/tests/dma_gateway_identities.test.sql, supabase/tests/dma_strategy_read.test.sql, relay/src/ws/fanout.ts, relay/src/index.ts, relay/tests/journal-push.test.ts, infra/relay/README.md, .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh, .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.ts</files>
  <read_first>
    - supabase/migrations/20260929180200_dma_strategy_read_rpcs.sql 전체 (재정의할 두 함수 본문 · 권한 줄)
    - supabase/tests/dma_strategy_read.test.sql 36-130 (U4 픽스처 · pg_temp.sev · dma_journal_apply 픽스처 모양)
    - relay/src/ws/fanout.ts 1535-1570 (deliverStrategyEvents)
    - relay/tests/journal-push.test.ts 545-600 (⑦ 전략 트레이서 · strategyDbRowOf)
    - infra/relay/README.md 「### 다중 게이트웨이 관찰자」 절 전체 — **편집 직전에 다시 읽는다**(260929-sar 가 먼저 고쳤을 수 있다)
    - scripts/dma-credentials.sh (env 로드 · 값 비출력 · relay 워크스페이스 경유 tsx 실행 관례)
    - relay/src/store/supabase.ts (createRelaySupabase)
  </read_first>
  <behavior>
    - 전략 목록 RPC: KYOBO 시세 이벤트(kind 1·2)는 KYOBO 신원이 있고 KYOBO 가시 계좌가 있는 사용자만 · KYOBO 주문 이벤트는 그 계좌 가시 사용자만. U2(공유 문자열 · 연결 없음)는 KB 이벤트만 본다
    - 주문 이벤트 RPC: KYOBO 주문 행 id 를 U2 가 넘기면 0행 · U1 이 넘기면 통보 행 ≥ 1
    - 두 함수 EXECUTE 는 anon · authenticated 불가 · service_role 가능(재명시)
    - Phase 25 dma_strategy_read 24단언이 U4 연결 1줄만 더한 픽스처로 그대로 통과
    - relay: 추가 게이트웨이 journal.events — 시세 이벤트는 신원 있는 사용자(A1 · B)만, A2 는 0 · 주문 이벤트는 신원 매핑 계좌 사용자만 · 인자 없는 호출(KB)은 종전대로
    - 원격 검증 selftest: 기대 시드 계산 · 옛 규칙 집합 · 새 규칙 집합 · 비교기가 일치/불일치를 옳게 판정(충돌 픽스처로 불일치 검출) · 네트워크 없이 종료 0
  </behavior>
  <action>
**RED.**
(R1) `supabase/tests/dma_gateway_identities.test.sql` 에 전략 단언을 더하고 plan 수를 맞춘다. 픽스처: `dma_strategy_apply('KB', …)` 로 KB 시세 1 · KB 주문 이벤트(…001) 1, `dma_strategy_apply('KYOBO', …)` 로 KYOBO 시세 1 · KYOBO 주문 이벤트(…011) 1. 주문 이벤트 RPC 용으로 `dma_journal_apply('KYOBO', …)` 로 …011 접수 통보 1건(주문 행 생성). 이벤트 JSON 모양은 `dma_strategy_read.test.sql` 의 pg_temp 헬퍼를 이 파일 안에 같은 방식으로 둔다. 단언: 사용자별 `dma_strategy_events_for_user(u, '2026-09-29')` 의 (gateway, kind, account_no) 집합 — U1 = KB 2 + KYOBO 2 · U2 = KB 2 만 · U4 = KYOBO 시세 1 만 · U5 = 0 / `dma_order_events_for_user(U2, <KYOBO 주문 id>, NULL)` 0행 · `(U1, 같은 id, NULL)` ≥ 1 / 두 함수 EXECUTE 권한 anon · authenticated false · service_role true. 이 단언들은 Task 1 의 사용자 · 연결 픽스처를 재사용한다(수명 단언보다 **앞**에 둬서 U1 자격증명 삭제 · U4 삭제의 영향을 받지 않게).
(R2) `supabase/tests/dma_strategy_read.test.sql`: 자격증명 INSERT 바로 뒤에 U4 의 연결 1행(`'KYOBO'`, `'dma-kyobo'`)을 더하고 주석 한 줄(quick-260929-sas — 추가 게이트웨이 가시성은 명시 연결로만). 머리 주석 사용자 줄의 U4 설명에 「연결」을 덧붙인다. 단언 본문 · `plan(24)` 은 바꾸지 않는다.
(R3) `relay/tests/journal-push.test.ts` 새 케이스 ⑨: `deliverStrategyEvents(rows, route)` — 신원 USER_A1→dma-shared · USER_B→kyobo-b, 매핑 dma-shared→K1 · kyobo-b→K2. KYOBO 시세 이벤트 1 + K1 주문 이벤트 1 → A1 은 둘 다 · B 는 시세만 · A2 · U 는 0. 이벤트 행은 ⑦ 의 픽스처 헬퍼로 만든다. 기존 케이스 본문은 바꾸지 않는다.
RED 확인 후 커밋: `test(quick-260929-sas): 전략 조회 RPC · journal.events 추가 게이트웨이 신원 규칙 실패 테스트 — Phase 25 픽스처 연결 1줄`.

**GREEN.**
(G1) 마이그레이션 `20260929190000_dma_gateway_identities.sql` 의 ⑥ 뒤 · `COMMIT;` 앞에 ⑦ 을 더한다: `dma_strategy_events_for_user(uuid, date)` 와 `dma_order_events_for_user(uuid, uuid, text[])` 를 CREATE OR REPLACE — 시그니처 · 반환 · 속성 · SELECT/CTE/UNION/ORDER BY 는 20260929180200 에서 **글자 그대로** 복사하고, 가시성 EXISTS 세 곳만 바꾼다: 목록 함수의 주문 갈래 = `EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id) v WHERE v.gateway = e.gateway AND v.account_no = e.account_no)`, 시세 갈래 = 같은 함수에 `v.gateway = e.gateway` 만, 주문 이벤트 함수 CTE o = `v.gateway = r.gateway AND v.account_no = r.account_no`. 권한 3줄씩 재명시. 머리 주석 목록을 갱신한다(세 RPC 가 전부 dma_visible_accounts 하나 · 20260929180200 파일의 옛 본문은 이력이며 원격에서는 이 파일이 덮는다).
(G2) `relay/src/ws/fanout.ts`: `deliverStrategyEvents(rows, extra?: ExtraGatewayRoute)` — extra 가 있으면 사용자마다 `extra.identities.dmaUserIdOf(userId)` → 없으면 건너뜀 → `extra.access.accountsOf(<신원>)` 가 없거나 비면 건너뜀 → 부분집합 = `isMarketStrategyEvent(row.kind)` 또는 계좌 포함 → `journal.events` 전송. 인자 없는 주 게이트웨이 분기의 동작은 바꾸지 않는다. JSDoc 의 신원 규칙 문장을 Task 1 과 같은 새 규칙으로.
(G3) `relay/src/index.ts`: 추가 게이트웨이 루프의 전략 결선 줄을 같은 route 로 넘기게 바꾼다. 주 게이트웨이 전략 결선 줄은 글자 그대로.
GREEN 확인 후 커밋: `feat(quick-260929-sas): Phase 25 전략 조회 RPC 2종 · journal.events 추가 게이트웨이 푸시도 명시 신원 연결 규칙`.

**문서 · 운영 도구.**
(D1) `infra/relay/README.md`(편집 직전 재독). 고치는 곳은 넷뿐이다 — /healthz 필드의 「한계」 · 알림 문단과 다른 절은 건드리지 않는다(260929-sar 영역).
- 「#### 신원 규칙」 본문을 새 규칙으로 바꾼다: 주 게이트웨이(KB) = `dma_credentials`(gateway 칸 · 기본 KB)의 dma_user_id · 추가 게이트웨이(KYOBO) = `dma_gateway_identities` 명시 연결 · 정본은 뷰 `dma_visibility_identities` 하나이고 REST 3종(`dma_visible_accounts` 경유)과 relay 푸시가 같은 규칙 · 연결은 자격증명이 있을 때만 유효하고 자격증명과 같은 게이트웨이의 연결은 무시된다 · 같은 문자열이 KB 와 교보에 있어도 연결 없이는 안 보인다. 옛 「다른 사람이면 … 겹치면 안 된다」 경고 줄은 지운다.
- 그 바로 뒤에 새 절 「#### 신원 연결 추가 · 제거 (quick-260929-sas)」: Supabase 대시보드 SQL 편집기(또는 서비스롤) 기준 SQL 세 토막 — 추가(auth.users 를 이메일로 찾아 dma_credentials 와 JOIN 한 사용자에게 (user_id, 'KYOBO', '<교보 users.toml user_id>') INSERT · 자격증명이 없으면 0행이 정상), 제거(이메일 + gateway 로 DELETE), 현황(gateway · user_id 앞 8자 · dma_user_id · created_at). 규칙 불릿: 반영 시점(REST 즉시 · relay 푸시는 최대 60초 — `IDENTITY_REFRESH_MS`) · 공유 계정(같은 dma id 를 쓰는 gh-radar 사용자는 **사용자마다** 한 행) · 자격증명을 지워 권한을 거둘 때 연결 행도 함께 지운다(남기면 자격증명 재등록 때 되살아난다) · 시드 이력(2026-09 적용 시 기존 KYOBO 가시성 그대로 연결) · 과도기(배포된 relay 가 이 quick 커밋을 포함하기 전에는 KYOBO 푸시가 옛 문자열 규칙이다 — 그동안 kyobo127 에 새 user_id 를 추가하지 않는다; 포함 여부는 `/healthz` version 과 `git merge-base --is-ancestor` 로 확인).
- 「롤아웃 순서」 4단계의 신원 교차 확인 괄호 문구를 「새 KYOBO user_id 는 연결을 추가하기 전까지 누구에게도 보이지 않는다 — 연결 추가가 곧 승인이다(§신원 연결)」 로 바꾼다.
- 「끄기 · 롤백」 의 가시성 거두기 불릿을 「연결 행 삭제(§신원 연결) — 매핑 행 삭제는 필요 없다」 로 바꾼다.
(D2) 원격 검증 도구 두 파일.
- `260929-sas-verify-remote.sh`: `set -euo pipefail` · 저장소 루트로 이동 · 첫 인자 모드(`snapshot` · `check` · `selftest`). selftest 는 env 없이 실행한다. 나머지 모드는 `workers/master-sync/.env` 를 `set -a; source; set +a` 로만 읽고(값 · 파일 내용 출력 금지, 빈 키는 이름만), `exec pnpm --filter @gh-radar/relay exec tsx ../.planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.ts "$@"`. 머리 주석에 사용법 · 안전 경계(읽기 전용 · 비밀 비출력).
- `260929-sas-verify-remote.ts`: `createRelaySupabase` 를 상대 경로 `../../../relay/src/store/supabase.js` 로 가져온다. **순수 함수**(export): 옛 규칙 가시 집합(자격증명 dma_user_id 문자열 ↔ 모든 게이트웨이 매핑) · 새 규칙 가시 집합(뷰 두 조건 그대로) · 기대 시드(자격증명 × KYOBO 매핑 id) · 집합 비교. 조회는 `dma_credentials?select=user_id,gateway,dma_user_id`(비밀번호 칸 금지) · `dma_account_access?select=gateway,dma_user_id,account_no` · `dma_gateway_identities` · `dma_account_orders?select=gateway,account_no,trade_date` · RPC.
  - **스냅샷 경로는 스크립트가 고정한다:** 기본값 `$HOME/.cache/gh-radar/260929-sas-baseline.json`(저장소 밖). 디렉터리는 0700 으로 만들고 파일은 0600 으로 쓴다. 메인 세션의 Bash 호출 사이에는 셸 변수가 남지 않고 25-11 이월 시 다른 세션이 이어받을 수 있어서, 환경 변수가 아니라 고정 경로로 (b) → (e) → verify 를 잇는다. `--out` · `--baseline` 은 선택 인자(덮어쓰기용)이고, 저장소 안 경로를 주면 거부한다.
  - `snapshot [--out <경로>]`(적용 전): KST 오늘과 그 전 최근 거래일(dma_account_orders 기준)에 대해 사용자별 ⑨ 행 수 · 옛 규칙 가시 집합 크기(게이트웨이별)와, 기대 시드를 dma_user_id → 사용자 수로 출력하고, 수치만 담은 JSON 을 스냅샷 경로에 쓴 뒤 그 경로를 한 줄 출력한다.
  - `check [--baseline <경로>]`(적용 후): 스냅샷 파일이 없거나 JSON 이 깨졌으면 `FAIL C0 스냅샷 없음 — 먼저 snapshot` 한 줄과 끝줄 `FAIL 1` 로 종료 1(원격 조회 전에 멈춘다). 있으면 C1 연결 행 집합 = 기대 시드 / C2 사용자별 `dma_visible_accounts` = 옛 규칙 집합 = 클라이언트 새 규칙 집합 / C3 사용자별 · 날짜별 ⑨ 행 수 = 현재 데이터 기준 옛 규칙 행 수, 그리고 ≥ baseline(차이는 표시) / C4 뷰의 gateway=KYOBO 행 수 = KYOBO 연결 수 / C5 `dma_strategy_events_for_user(u, 오늘)` · `dma_order_events_for_user(u, <가시 주문 id 하나>, null)` 오류 없음(후자 ≥ 1행) / C6 env 에 `SUPABASE_ANON_KEY` 가 있으면 anon 으로 연결 테이블 · 뷰 · `dma_visible_accounts` 가 전부 거부됨, 없으면 SKIP 한 줄. 출력은 `PASS|FAIL|SKIP <ID> <설명>` 과 끝줄 `ALL PASS` 또는 `FAIL <n>`, FAIL 이 있으면 종료 1. 사용자는 user_id 앞 8자, 계좌는 뒤 4자리만.
  - `selftest`: 가짜 자격증명(공유 문자열 2명 · 단독 1명) · 매핑(KB · KYOBO) · 연결로 순수 함수를 검증하고, 연결에서 한 사람을 빼면 비교기가 불일치를 잡는지까지 확인한다. 기본 스냅샷 경로가 저장소 밖으로 풀리는지와 저장소 안 경로 거부도 확인한다. 네트워크 호출 0 · 통과 시 `SELFTEST PASS` 종료 0.
커밋: `docs(quick-260929-sas): README 신원 연결 추가 · 제거 절차 · 원격 검증 스크립트(snapshot · check · selftest)`. 경로 명시 stage.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && for t in dma_gateway_identities dma_strategy_read dma_strategy_apply dma_journal_apply dma_journal_schema dma_orders_modified dma_orders_price_check; do bash scripts/verify-dma-orders-price-check.sh --test "supabase/tests/$t.test.sql" > /dev/null || { echo "PGTAP FAIL $t"; exit 1; }; done && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test && bash -n .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh && bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh selftest && test "$(grep -v '^[[:space:]]*--' supabase/migrations/20260929190000_dma_gateway_identities.sql | grep -cF 'dma_visible_accounts(p_user_id)')" -ge 4 && ! (grep -v '^[[:space:]]*--' supabase/migrations/20260929190000_dma_gateway_identities.sql | grep -qF 'c.dma_user_id = a.dma_user_id') && grep -q 'dma_gateway_identities' infra/relay/README.md && grep -q 'dma_visibility_identities' infra/relay/README.md && ! grep -q '어떤 KB dma_user_id 와도 겹치지 않아야' infra/relay/README.md && git diff --quiet HEAD -- scripts/deploy-relay.sh</automated>
    <fails_when>pgTAP 7파일 · relay 전량 · typecheck · selftest 중 하나라도 실패할 때, 가시성 호출이 4곳 미만이거나 옛 문자열 조인이 남을 때, README 에 새 절이 없거나 옛 경고가 남을 때, deploy-relay.sh 가 바뀌었을 때</fails_when>
  </verify>
  <acceptance_criteria>
    - pgTAP 7파일 전부 통과(Phase 25 strategy_read 24단언은 픽스처 1줄 추가만으로)
    - relay 전량 테스트 · 두 typecheck 통과
    - 마이그레이션 코드 줄의 `dma_visible_accounts(p_user_id)` 호출 ≥ 4(⑨ 1 · 목록 2 · 주문 이벤트 1) · 옛 문자열 조인 0
    - selftest `SELFTEST PASS` · 래퍼 문법 OK · 스크립트가 비밀번호 칸을 조회하지 않는다
    - README: 새 규칙 · 연결 절차 · 60초 반영 · 과도기 문구가 있고 옛 경고 줄은 없다 · deploy-relay.sh 무변경
    - 커밋 3건(test → feat → docs) · Co-Authored-By 없음 · push 없음
  </acceptance_criteria>
  <done>세 REST 조회 RPC 와 relay 추가 게이트웨이 푸시 두 종류가 모두 뷰 하나의 규칙을 따른다. 운영자는 README SQL 로 연결을 추가 · 제거하고, 원격 적용 전후를 스크립트 하나로 대조한다.</done>
</task>

<task type="checkpoint:human-action" gate="blocking-human" executor="main-session">
  <name>Task 3 [executor: main-session — gsd-executor 는 실행 금지, 여기서 멈추고 반환]: 원격 적용 결정 · 사용자 db push · 적용 전후 대조 · relay 배포 판정 · KB smoke</name>
  <files>(저장소 변경 없음 — .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-SUMMARY.md 에 「라이브 반영 결과」 절만 추가)</files>
  <precondition>Task 1 · 2 커밋(test · feat · test · feat · docs)이 HEAD 조상에 있고 `bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh selftest` 가 SELFTEST PASS 다. supabase CLI 가 이 프로젝트에 link 돼 있다(`supabase/.temp/project-ref` 존재).</precondition>
  <action>
**gsd-executor 는 이 태스크를 실행하지 않는다.** 여기 닿으면 CHECKPOINT REACHED 로 반환한다. 이후는 메인 세션이 직접 한다(원격 적용 · 배포는 서브에이전트에서 분류기가 막는다 — 메모리). `supabase db push` 는 **사용자가** 실행한다.

AskUserQuestion 은 질문 2~3문장, 비교는 option description 에 넣는다. 실행 주체 라벨은 「Claude가 실행」 / 「직접 실행」.

(0) 사전 점검: KST 시각 · `git status -sb` · `git status --porcelain -- supabase/migrations` 가 비어 있음(남의 미커밋 마이그레이션이 push 에 섞이지 않게).

(a) 미적용 목록 — 읽기 전용. `supabase migration list` 와 `supabase db push --dry-run` 을 실행해 적용될 파일 목록을 그대로 보여 준다. 계획 시점 기대값은 `20260929180000` · `20260929180100` · `20260929180200`(Phase 25) + `20260929190000`(이 quick) 넷이다. 이 넷 밖의 파일이 섞이면 멈추고 보고한다. Phase 25 셋이 이미 Remote 에 있으면 (c) 결정 없이 (b) → (d) 로 간다.

(b) 적용 전 스냅샷 — 읽기 전용. `bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh snapshot`(인자 없음 — 스크립트 고정 경로 `$HOME/.cache/gh-radar/260929-sas-baseline.json` 에 쓰고 그 경로를 출력한다. 셸 변수로 넘기지 않는다). 파일이 생겼는지 `test -s "$HOME/.cache/gh-radar/260929-sas-baseline.json"` 로 확인한다. 출력(사용자별 ⑨ 행 수 · 옛 규칙 집합 크기 · 기대 시드 dma_user_id → 사용자 수)을 사용자에게 보인다. 기대 시드는 오늘 승인된 대로 junysim 2 · milles 1 이어야 한다 — 다르면 멈추고 보고한다. 메인 세션에서 env 읽기가 막히면 같은 명령을 사용자에게 `!` 로 안내한다.

(c) 결정 — Phase 25 파일이 목록에 있을 때만 AskUserQuestion 한 번. 질문: 「db push 에 Phase 25 마이그레이션 3개가 함께 올라갑니다. 지금 넷을 함께 적용할까요, 25-11 때 함께 할까요?」
- 옵션 「넷 함께 지금 적용」 description: Phase 25 스키마(전략 이벤트 테이블 46칸 · 커서 칸 2 · 함수 3 · 원문 무기한 보관)도 지금 원격에 올라간다. 전부 추가형이라 배포된 relay(4c143596) · server 동작은 바뀌지 않는다. 25-11 의 원격 적용 단계는 「이미 적용 — migration list 확인만」 이 된다.
- 옵션 「보류 — 25-11 때 함께」 description: 이 quick 의 DB 단계는 25-11 로 넘긴다. 25-11 push 목록에 네 파일이 뜨는 것이 정상이 되고, 그때 (b) 스냅샷 → push → (d) check 를 같이 돈다. 그 전까지 가시성은 오늘과 같다.
보류면 (d) · (e) 를 건너뛰고 (f) · (g) · (h) 만 하고, SUMMARY 에 「원격 미적용 · 25-11 로 이월(네 파일 · 스냅샷 → push → check 순서)」 을 적는다. 이월 시에는 (b) 스냅샷을 25-11 push 직전에 **다시** 찍는다(같은 고정 경로를 덮어쓴다 — 오늘 찍은 값은 그때 낡는다).

(d) 적용 — 사용자 실행. 사용자에게 저장소 루트에서 `supabase db push` 를 직접 실행하도록 안내한다. 확인 프롬프트의 파일 목록이 (a) dry-run 과 같을 때만 Y 이고, 다르면 n 후 보고. 끝나면 메인 세션이 `supabase migration list` 로 해당 버전들이 Local · Remote 둘 다에 있음을 확인한다.

(e) 적용 후 대조 — 읽기 전용. `bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh check`(인자 없음 — (b) 와 같은 고정 경로의 스냅샷을 읽는다)가 `ALL PASS` 여야 한다(C1 연결 = 기대 시드 · C2 사용자 3명 가시 집합 = 옛 규칙 · C3 오늘/최근 거래일 ⑨ 행 수 동일 · C4 · C5 · C6 은 anon 키가 없으면 SKIP 이 정상).
FAIL 분기: 더 보이는 사용자가 있으면 README §신원 연결의 제거 SQL 로 해당 연결을 즉시 지우고, 덜 보이는 사용자가 있으면 추가 SQL 로 채운다(SQL 은 사용자가 대시보드에서 실행). 스키마 자체 오류면 마이그레이션 머리 주석의 되돌리기 순서를 사용자에게 보이고 결정을 받는다. 어느 쪽이든 원인과 조치를 SUMMARY 에 남긴다.

(f) relay 배포 판정 — 결정적 규칙. `curl -s https://dma.jx1.io/healthz | jq -r .version` 로 배포 SHA 를 읽고 `git log --oneline <그 SHA>..HEAD -- relay packages/shared` 를 본다.
- 이 quick 커밋 밖의 커밋이 하나라도 있으면(계획 시점: Phase 25 14건) **relay 를 배포하지 않는다.** SUMMARY 에 「relay 반영은 Phase 25 relay 배포(25-12)에 실린다 — 그때까지 KYOBO 푸시는 옛 문자열 규칙이며 시드 덕에 오늘과 같다 · 25-12 뒤 확인: docker logs 에 신원 연결 적재 info 줄(gateway KYOBO 행 수)」 을 적는다.
- 이 quick 커밋뿐이면: KST 20:00 이후(장중이면 시점을 한 번 묻는다), 깨끗한 worktree(`git worktree add --detach <scratchpad>/sas-deploy HEAD`)에서 평소 env(메모리 reference_deploy_worker_env — 사용자에게 다시 묻지 않는다 · DMA_HOST · KYOBO 호스트는 보존)로 `bash scripts/deploy-relay.sh`. 확인: healthz status ok · journal.state live · journalGateways.KYOBO.state live, `gcloud compute ssh radar-gw --zone=asia-northeast3-a --tunnel-through-iap --command "sudo docker logs --since 10m gh-radar-relay 2>&1 | grep 신원 | tail -5"` 에 적재 줄. worktree 제거.

(g) KB 회귀: `bash scripts/smoke-relay.sh` PASS(INV-9 · INV-10 SKIP 은 평소와 같음).

(h) SUMMARY 「라이브 반영 결과」: 각 단계 KST · (a) 목록 · (c) 결정 · (b) 스냅샷 요약(수치만) · (d) migration list 전후 · (e) check 출력 · (f) 판정과 근거 SHA · (g) smoke · 멈춘 분기 증거 · 「저장소 변경은 Task 1 · 2 커밋뿐 · push 는 이 quick 범위 밖」. 보류 · 이월이면 25-11 · 25-12 가 할 일을 한 줄씩.
  </action>
  <instructions>메인 세션이 (0) → (h) 순서로 직접 실행한다. 사용자의 몫: (c) 결정, (d) `supabase db push` 실행과 프롬프트 확인, (e) FAIL 시 대시보드 SQL, (f) 장중이면 배포 시점. 멈춤 분기는 그 자리에서 보고하고 끝낸다.</instructions>
  <verification>적용했다면 (e) check 가 ALL PASS 이고 migration list 에서 적용 버전이 Remote 에 있다. 보류했다면 결정과 이월 절차가 SUMMARY 에 있다. (f) 판정 근거(배포 SHA · 로그 목록)가 SUMMARY 에 있고, 배포했다면 healthz ok · KYOBO live 다. (g) smoke PASS.</verification>
  <verify>
    <automated>test -s "$HOME/.cache/gh-radar/260929-sas-baseline.json" && bash /Users/alex/repos/gh-radar/.planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh check | tail -1 | grep -qx 'ALL PASS'</automated>
    <fails_when>(b) 스냅샷 파일이 고정 경로에 없거나, 적용 후 가시 집합 · 연결 · ⑨ 행 수 중 하나라도 옛 규칙 · 기대 시드와 다를 때 (보류 분기에서는 실행하지 않는다 — done 이 이월 기록으로 대신한다)</fails_when>
  </verify>
  <done>원격에 게이트웨이 인지 가시성이 적용돼 세 사용자의 가시 행이 적용 전과 같거나(검증 ALL PASS), 사용자가 보류해 25-11 로 이월한 결정이 기록됐다. relay 배포 여부가 결정적 규칙대로 판정 · 기록됐고 KB smoke 가 PASS 다.</done>
  <resume-signal>메인 세션이 (h)까지 끝내거나 멈춤 분기를 증거와 함께 보고하면 종료</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → PostgREST(anon/authenticated) | 새 테이블 · 뷰 · 함수가 PostgREST 에 노출되는 경계. 서비스롤 전용이어야 한다 |
| server(서비스롤) → 조회 RPC 3종 | `p_user_id` 는 requireAuth 로 확정한 값만. 가시성은 RPC 안 규칙 하나 |
| relay → 브라우저 journal.rows · journal.events | 계좌 행 = 사용자 데이터. 추가 게이트웨이는 명시 연결 신원으로만 라우팅 |
| 운영자(대시보드 SQL) → dma_gateway_identities | 연결 추가 · 제거가 곧 가시성 부여 · 회수 |
| 사용자 db push → 원격 스키마 | 미적용 Phase 25 마이그레이션이 함께 나갈 수 있는 경계 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-sas-01 | Information Disclosure | 게이트웨이 무관 문자열 신원 조인(T-c8e-02 후속) | medium | mitigate | 뷰 하나로 규칙을 모으고 세 RPC · relay 추가 경로가 gateway + dma_user_id 로만 잇는다. pgTAP 매트릭스의 U2(공유 문자열 · 연결 없음)와 relay ⑧ 의 A2 가 회귀를 잠근다 |
| T-sas-02 | Elevation of Privilege | dma_gateway_identities · dma_visibility_identities · dma_visible_accounts PostgREST 노출 | high | mitigate | 테이블 RLS 활성 + 정책 0개, 세 객체 모두 PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT, 뷰 security_invoker=true. pgTAP 권한 단언, 원격은 anon 키가 있으면 check C6 |
| T-sas-03 | Tampering | CREATE OR REPLACE 로 시그니처 · 반환 · 권한이 바뀜 | medium | mitigate | 본문은 원본에서 글자 그대로 복사하고 가시성 조인만 바꾼다. 권한 3줄씩 재명시. 기존 pgTAP(apply · strategy_read) 회귀와 새 EXECUTE 단언. server 무수정으로 계약 불변 확인 |
| T-sas-04 | Information Disclosure | 자격증명 없는 연결로 D-12 allowlist 우회(REST) | medium | mitigate | 뷰가 연결을 자격증명과 JOIN 할 때만 센다. pgTAP U5 · 자격증명 삭제 뒤 0행 단언. README 가 권한 회수 시 연결 삭제를 규정 |
| T-sas-05 | Information Disclosure | 자기 게이트웨이 연결로 REST 만 넓어져 푸시와 어긋남 | low | mitigate | 뷰가 `l.gateway <> c.gateway` 조건으로 무시. pgTAP U3 단언 |
| T-sas-06 | Denial of Service | relay 신원 적재 실패 | low | mitigate | 추가 게이트웨이만 영향(fail closed · 직전 값 유지 · REST 새로고침 복원). KB 경로 · /healthz · 503 판정 불변. KYOBO env 없으면 조회 0(부팅 M1) |
| T-sas-07 | Information Disclosure | 연결 삭제 뒤 relay 푸시 잔존 | low | accept | 최대 IDENTITY_REFRESH_MS(60초). REST 는 즉시 반영. README 에 명시 |
| T-sas-08 | Repudiation | Phase 25 마이그레이션이 사용자 승인 없이 원격 적용 | medium | mitigate | Task 3 (a) dry-run 목록 공개 → (c) 명시 결정 → (d) 사용자 실행 · 프롬프트 목록 대조. 넷 밖 파일이 섞이면 중단 |
| T-sas-09 | Tampering | HEAD relay 배포가 Phase 25 relay 를 미리 내보냄 | medium | mitigate | Task 3 (f) 결정적 규칙 — 배포 SHA..HEAD 에 이 quick 밖 relay/shared 커밋이 있으면 배포하지 않는다 |
| T-sas-10 | Information Disclosure | 검증 스크립트 · 로그의 식별자 · 비밀 | low | mitigate | env 는 source 만 · 값 비출력, 비밀번호 칸 미조회, user_id 앞 8자 · 계좌 뒤 4자리, 스냅샷 JSON 은 수치만 · 저장소 밖 경로만. relay 로그는 행 수만 |
| T-sas-11 | Tampering | 시드가 오늘 승인 범위 밖 가시성을 만듦 | medium | mitigate | 시드를 gateway='KYOBO' 로 한정(잠금 설계 그대로). (b) 에서 기대 시드를 사람이 확인(junysim 2 · milles 1), (e) C1 · C2 가 적용 결과를 대조 |

패키지 설치 없음 — T-sas-SC 해당 없음.
</threat_model>

<verification>
- 로컬: pgTAP 7파일 전부 통과(Task 2 verify) · relay 전량 테스트 · typecheck 2종 · selftest.
- 구조 게이트: 마이그레이션 코드 줄에 옛 문자열 조인 0, `dma_visible_accounts(p_user_id)` 호출 4 · index.ts 주 게이트웨이 결선 줄 불변 · 키 리터럴 0 · README 새 절 존재 · 옛 경고 부재 · deploy-relay.sh 무변경.
- 라이브(메인 세션): 적용했다면 check ALL PASS, 보류했다면 이월 기록. relay 배포 판정 근거 기록. smoke PASS.
</verification>

<success_criteria>
- Task 1: 로컬 재생 DB 와 relay 에서 KYOBO 계좌 가시성이 명시 연결로만 성립하고(공유 문자열 충돌 차단), KB 경로와 KYOBO env 없는 relay 는 그대로다. test + feat 커밋.
- Task 2: 전략 조회 RPC 2종과 journal.events 추가 게이트웨이 푸시도 같은 규칙이다. README 가 연결 추가 · 제거 절차를 담고, 원격 검증 스크립트 selftest 가 통과한다. test + feat + docs 커밋.
- Task 3: 원격 적용(또는 사용자 결정에 따른 25-11 이월)과 적용 전후 대조, relay 배포 판정, KB smoke 가 SUMMARY 에 기록된다.
</success_criteria>

<output>
`/Users/alex/repos/gh-radar/.planning/quick/260929-sas-gateway-aware-visibility/260929-sas-SUMMARY.md` 를 만든다. Task 1 · 2 실행자는 커밋 표(해시 · 메시지 · 파일) · RED/GREEN 기록 · pgTAP 파일별 단언 수 · relay 테스트 수 전후 · 「원격 미적용 마이그레이션 1(20260929190000) — Phase 25 셋 뒤에 적용」 · c8e 하네스 R9 대체 사실을 적는다. Task 3 은 메인 세션이 「라이브 반영 결과」 절을 더한다.
</output>
