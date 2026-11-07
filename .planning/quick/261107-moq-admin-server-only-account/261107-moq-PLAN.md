---
phase: quick-261107-moq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer) — 「이 사용자에 연결」 한 길: RPC → relay → server → 웹 카드
  - supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql
  - supabase/tests/dma_admin_server_only_account.test.sql
  - relay/src/admin/intent-store.ts
  - relay/src/admin/admin-api.ts
  - relay/tests/helpers/admin-db-fake.ts
  - relay/tests/admin-api.test.ts
  - server/src/schemas/admin.ts
  - server/src/services/relay-admin-client.ts
  - server/src/routes/admin.ts
  - server/tests/routes/admin-dma.test.ts
  - webapp/src/lib/admin-api.ts
  - webapp/src/lib/__tests__/admin-api.test.ts
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/admin/__tests__/account-editor.test.tsx
  # Task 2 — 「서버에서 빼기」 한 길(같은 파일들의 remove 갈래)
autonomous: true
requirements: ["261107-moq"]

estimate:
  tokens: 160000
  raw_tokens: 160000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "T-1 (D-01): 사용자 시트의 흐린 점선 「서버에만 있음」 계좌 카드(ServerOnlyAccountRow)에 칩 아래 설명 한 줄 「<서버키 · 로 이음> 서버 설정에만 있고 이 사용자에 연결돼 있지 않아요. 그래서 여기서 연결 해제해도 그 서버에는 닿지 않아요.」 와 버튼 줄 [이 사용자에 연결] [서버에서 빼기](빨강 글씨)가 있다. 버튼을 누르면 같은 자리에 확인 상자가 버튼 줄을 대신하고, 「취소」 면 버튼 줄로 돌아간다"
    - "T-2 (D-01 · D-02 · D-03 · D-04 · D-05): 연결 확인(파랑 테두리) 「<계좌명>을 <dma> 에 연결해요. <서버> 서버 설정은 그대로예요.」 → 「연결」 = POST /api/admin/dma-users/:dma/accounts/:broker/:accountNo/server-only { action: link } 1건 → relay 가 RPC 만 부르고 44 는 0건 · 200 { results: [] } → DB 에 87 값(이름 · 지점 · 트레이더 · priority)으로 계좌 + 원천 서버마다 active 등록 행 → 재조회 뒤 그 계좌는 일반 계좌 카드(서버 체크 · 연결 해제)로 보인다"
    - "T-3 (D-01 · D-02 · D-03): 빼기 확인(빨강 테두리) 「<서버> 서버 설정에서 <dma> 의 <계좌명>을 빼요. <dma> 는 다시 로그인하면 계좌 목록에서 사라져요.」 + 작은 글씨 BUSY 안내 → 「서버에서 빼기」 = 같은 경로 { action: remove } → RPC 가 원천 서버마다 removing 행 → relay reconcileUser 가 그 서버에 op 4(그 서버의 그 유저 계좌 전부면 op 2) → ok 면 settle 이 행 · 계좌 연결을 지워 재조회 뒤 카드가 사라지고 「✓ <서버> 에서 <계좌명>을 뺐어요 — <dma> 가 다시 로그인하면 반영돼요.」 한 줄이 남는다"
    - "T-4 (D-01 · D-03): 서버가 거절하면(BUSY 등) 그 계좌는 removing 등록으로 남고 기존 계좌 카드와 같은 반영 칩 · 「실패 · BUSY」 줄로 보인다(onResults 경로 재사용) · 완료 줄은 없다. 87 에 그 유저의 다른 「서버에만 있음」 계좌가 남아 있으면 op 2 가 아니라 op 4 만 간다(D-23 ⑤ 유지)"
    - "T-5 (D-02 · D-03): 원천 0건(이미 정리됐거나 오래된 화면 · 꺼진 서버뿐 · 다른 증권사 서버뿐 · 이미 등록 행이 있는 서버뿐)은 409 NOT_SERVER_ONLY, 없는 DMA id 는 409 NO_DMA_USER 로 끝나고 아무 행도 바뀌지 않는다 — 카드 오류 줄에 한 줄. 87 계좌번호의 앞자리 0 · 앞뒤 공백은 정규화해 맞춘다"
    - "T-6 (D-02 · D-06): 새 RPC dma_admin_adopt_server_only_account 는 service_role 전용(anon · authenticated EXECUTE 없음)이고, 기존 dma_admin_adopt_server_accounts · relay planner · dispatcher · packages/shared diff 는 이 작업의 커밋에서 한 줄도 바뀌지 않는다. 의도 계좌 서버 줄의 「서버에만 있음」 칩(case b)과 사용자 목록 ServerOnlyRow 도 그대로다"
  artifacts:
    - path: supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql
      provides: "dma_admin_adopt_server_only_account(p_dma_user_id, p_broker, p_account_no, p_remove) — NO_DMA_USER · NOT_SERVER_ONLY · 87 값 삽입 · 원천 서버마다 active/removing · { servers } · REVOKE PUBLIC/anon/authenticated · GRANT service_role"
      contains: "dma_admin_adopt_server_only_account"
    - path: supabase/tests/dma_admin_server_only_account.test.sql
      provides: "pgTAP — link · remove · 가드 · 정규화 · sort_order 첫 행 값 · 23514 · 권한"
      contains: "NOT_SERVER_ONLY"
    - path: relay/src/admin/intent-store.ts
      provides: "adoptServerOnlyAccount · INTENT_ERROR_CODES 에 NOT_SERVER_ONLY"
      contains: "adoptServerOnlyAccount"
    - path: relay/src/admin/admin-api.ts
      provides: "POST /dma-users/:dma/accounts/:broker/:accountNo/server-only — link(op 없음) · remove(reconcileUser + 지정 재적재) · audited · 마감"
      contains: "/server-only"
    - path: server/src/routes/admin.ts
      provides: "같은 경로 Express 프록시(requireAdmin 뒤) · relayResults · 감사"
      contains: "/server-only"
    - path: server/src/services/relay-admin-client.ts
      provides: "serverOnlyAccount(dma, broker, accountNo, action, adminEmail)"
      contains: "serverOnlyAccount"
    - path: webapp/src/lib/admin-api.ts
      provides: "serverOnlyAccount(dmaUserId, broker, accountNo, action) — RELAY_TIMEOUT_MS"
      contains: "serverOnlyAccount"
    - path: webapp/src/components/admin/account-editor.tsx
      provides: "ServerOnlyAccountRow 설명 줄 · 버튼 줄 · 파랑/빨강 확인 상자 · 완료 줄 · josaEulReul"
      contains: "data-server-only"
  key_links:
    - from: webapp/src/components/admin/account-editor.tsx
      to: webapp/src/lib/admin-api.ts
      via: "ServerOnlyAccountRow 의 useFieldSave → serverOnlyAccount(dmaUserId, broker, accountNo, action)"
      pattern: "serverOnlyAccount\\("
    - from: server/src/routes/admin.ts
      to: relay /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/server-only
      via: "relay.serverOnlyAccount → relayResults"
      pattern: "serverOnlyAccount"
    - from: relay/src/admin/admin-api.ts
      to: supabase RPC dma_admin_adopt_server_only_account
      via: "deps.store.adoptServerOnlyAccount → #rpc"
      pattern: "adoptServerOnlyAccount"
    - from: relay/src/admin/admin-api.ts
      to: relay/src/admin/dispatcher.ts
      via: "remove 갈래만 deps.dispatcher.reconcileUser(dma, { adminEmail, deadlineAt }) — planner 가 removing 을 op 4 / op 2 로"
      pattern: "reconcileUser"
---

<objective>
어드민 사용자 시트의 흐린 점선 「서버에만 있음」 계좌 카드(`ServerOnlyAccountRow` — 그 사용자 의도에 없는 계좌가 87 에만 있음)에
「이 사용자에 연결」 · 「서버에서 빼기」 두 동작을 목업 B 그대로 붙인다(D-01). 두 동작은 새 RPC 하나
`dma_admin_adopt_server_only_account(..., p_remove)` 가 의도 행을 만들고(D-02), relay `POST …/server-only` 가 link 는 op 없이 ·
remove 는 기존 reconcile 로 op 4/op 2 를 보내며(D-03), Express 가 같은 경로를 프록시하고(D-04), 웹이 기존 `onResults` · `onChanged`
경로로 결과를 그린다(D-05). 범위는 D-06 — 위 5곳 + 각 단위 테스트만, planner · dispatcher · shared diff 무변경.

Purpose: 11/5 교보 112 처럼 users.toml 복사로 생긴 「서버에만 있음」 계좌를, 자동 adopt 없이(gh-trade-85 · D-23 ⑤ 유지) Admin 이
확인을 받고 등록하거나 그 서버에서 뺄 수 있게 한다 — 수동 SQL · relay 내부 DELETE 런북을 화면 한 번으로.
Output: 마이그레이션 1 + pgTAP 1 · relay 라우트 · intent-store 메서드 · Express 프록시 · 웹 클라이언트 함수 · 카드 UI + 각 테스트.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/261107-moq-admin-server-only-account/261107-moq-CONTEXT.md
@.planning/quick/261107-moq-admin-server-only-account/reference/mockup-server-only-account.html

<!-- 읽을 원천 — 패턴 정본(필요한 구간만 Read · grep 으로 위치 확인) -->
@supabase/migrations/20261006200300_dma_admin_reflect.sql
@supabase/tests/dma_admin_reflect.test.sql
@relay/src/admin/intent-store.ts
@relay/tests/helpers/admin-db-fake.ts

<interfaces>
<!-- 실행자가 다시 탐색하지 않게 확인해 둔 계약 -->

DB 표(20261006200100 · 20261006200300):
- dma_users(dma_user_id PK)
- dma_user_accounts(dma_user_id, broker, account_no, name, branch_no, trader_id, priority, updated_at) PK (dma_user_id, broker, account_no)
  CHECK KB → length(branch_no)=5 AND length(trader_id)=6 · KYOBO → branch_no='' AND trader_id='' · BEFORE INSERT 트리거
  trg_dma_user_accounts_ensure_master 가 dma_accounts 마스터를 ON CONFLICT DO NOTHING 으로 채운다(20261106300000).
- dma_account_servers(dma_user_id, broker, account_no, server_key, state 'active'|'removing', is_order default false, updated_at)
  PK (dma_user_id, broker, account_no, server_key) · FK → dma_user_accounts · broker guard 트리거(서버 증권사 = 계좌 증권사).
- dma_server_user_accounts(server_key, dma_user_id, account_no, name, branch_no, trader_id, priority) — 87 원문 그대로(계좌번호 재정규화 없음).
- dma_servers(key, broker, enabled, sort_order, …) — 시드 KB120(enabled, 10) · KB121(꺼짐, 20) · KYOBO119(enabled, 30) · KYOBO127(꺼짐, 40).
- 업무 거부 규약: RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'. 잠금 규약: dma_admin_mark_account_removed 의
  `PERFORM 1 FROM public.dma_users d WHERE d.dma_user_id = p_dma_user_id FOR UPDATE;` + 함수 권한 3줄(REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role).
- 계좌번호 정규화(shared normalizeAccountNo): 앞뒤 공백/탭 제거 → 앞자리 0 제거 → 전부 0 이면 "0".

relay:
- relay/src/admin/admin-api.ts — `AccountParam`(dma · broker enum · accountNo 검사 뒤 normalizeAccountNo) · `deadlineOf()` · `audited(res, route, dma, run, extra)` ·
  `awaitWithinDeadline(reloadOrderServers(route), deadlineAt, route, "order-servers")` · `respond(res, results)` · `toRelayError`(IntentError → 409 · INTERNAL → 500 · ZodError → 400 VALIDATION_FAILED) ·
  `INTENT_MESSAGE` 표 · `AdminApiDeps.store` 는 `Pick<AdminIntentStore, …>` · `maskAccountNo` import 있음. 기존 DELETE 계좌 라우트(~613행)가 그대로의 모양 정본.
- relay/src/admin/intent-store.ts — `INTENT_ERROR_CODES`(허용 목록 밖 P0001 은 INTERNAL 로 접힘) · `#rpc(name, args)` · `stringList`.
- relay/tests/admin-api.test.ts — `startHarness()`(KB120 · KB121 · KYOBO119 레지스트리 · KB120/KB121 대역 87 · 상태 `stateWithOther()` 에 "other" 유저) ·
  `call(h, method, path, body)` · `createBody(over)` · `h.db`(AdminDbFake) · `h.states[key].users / busyAccounts` · `h.gateways[key].pushAdminSnapshot(sock, { usersRev, users })` +
  `waitForAdminConnection()` · `h.commands(key)`(op 5 뺀 44) · `h.orderServersReload`(vi.fn) · `spyLogs()` · `waitFor()`.
- 대역 87 handler: op 4 → 없는 계좌 8 · 마지막 계좌 12 · busyAccounts 9 / op 2 → 없는 유저 4 · 서버 마지막 사용자 12 · 그 유저 계좌 중 busy 면 9.
- planner(무변경): removing 계좌는 87 에 있을 때만 op 4 · active 0 이고 그 유저 87 계좌가 전부 removing 이면 op 2 · 87 에만 있는 계좌가 하나라도 남으면 op 2 안 보냄.

server(Express):
- server/src/routes/admin.ts — `parseOrThrow(dmaAccountParam, req.params)` · `requireRelayAdmin(req)` · `relayResults(res, op)`(200 + results 배열 → 그대로 · 400/409 → 같은 코드 ·
  못 닿음/5xx → 502 RELAY_FAILED) · `audit(req, op, maskDmaUserId(dma), extra)` · 기존 DELETE 계좌 라우트(~596행)가 모양 정본.
- server/src/services/relay-admin-client.ts — `RelayAdminClient` 인터페이스 + `relayAdminClientFrom(request)` 안 `account(dma, broker, accountNo)` 경로 빌더.
- server/tests/fixtures/fake-relay-admin.ts — 실제 `relayAdminClientFrom` 위 가짜 request(새 메서드는 자동으로 잡힌다) · `makeFakeRelay(handler)` · `relayReject(status, code, msg)`.

webapp:
- webapp/src/lib/admin-api.ts — `authFetch` · `dmaPath(dma)` · `enc` · `jsonInit("POST", body, { timeoutMs: RELAY_TIMEOUT_MS })` · `removeDmaAccount` 가 모양 정본.
- webapp/src/components/admin/account-editor.tsx — `ServerOnlyAccountRow({ account })`(~1379행 · 지금 보기만 · 카드 전체 opacity-60) · `AccountEditor` 가 `a.servers.length === 0` 이면
  그것을 그린다(~1595행) · 내부 `onResults(accountKey, results)`(overlay) · props `onChanged` · `useFieldSave(save, { retainValue, onSuccess })` ·
  `ACCOUNT_EDITOR_TEXT` · `josaEunNeun` · 클래스 상수 `ACCOUNT_CARD` · `ACCOUNT_BUTTON` · `ERROR_LINE` · `NOTE` · `ADMIN_BUTTON_PRIMARY/SECONDARY`(reflect-chip) ·
  `ReflectChip tone="only"`(「<키> · 서버에만 있음」). user-sheet.tsx 가 이 파일을 import 하므로 user-sheet 의 `ADMIN_BUTTON_DANGER` 를 역으로 import 하지 않는다(순환).
- webapp/src/components/admin/__tests__/account-editor.test.tsx — `vi.mock('@/lib/admin-api', …)` 목 목록 · `ONLY_ACCT`(KYOBO 5550001 · 이름 빈 값 · serverOnlyOn ['KYOBO127']) ·
  `setup(accounts)`(dmaUserId "kimtr") · `acctRow(no)`. 141행 테스트가 지금 「87 전용 줄에 버튼 없음」 을 단언한다 — Task 1 에서 새 동작으로 바꾼다.
</interfaces>
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): 「이 사용자에 연결」 한 길 — 새 RPC · relay link · Express 프록시 · 웹 카드 설명 줄 + 연결 확인</name>
  <files>supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql, supabase/tests/dma_admin_server_only_account.test.sql, relay/src/admin/intent-store.ts, relay/src/admin/admin-api.ts, relay/tests/helpers/admin-db-fake.ts, relay/tests/admin-api.test.ts, server/src/schemas/admin.ts, server/src/services/relay-admin-client.ts, server/src/routes/admin.ts, server/tests/routes/admin-dma.test.ts, webapp/src/lib/admin-api.ts, webapp/src/lib/__tests__/admin-api.test.ts, webapp/src/components/admin/account-editor.tsx, webapp/src/components/admin/__tests__/account-editor.test.tsx</files>
  <precondition>Docker 데몬이 떠 있다(`docker info` 성공) — pgTAP 은 scripts/verify-dma-orders-price-check.sh 가 일회용 로컬 컨테이너에서 돌린다(원격 DB 접촉 0).</precondition>
  <action>
**① DB — 새 마이그레이션(D-02).** 파일 이름은 `supabase/migrations/20261107300000_dma_admin_adopt_server_only_account.sql`. 만들기 직전 `ls supabase/migrations | tail -3` 으로 옆 세션이 그보다 늦은 타임스탬프를 넣었는지 보고, 있으면 그 뒤 빈 타임스탬프로 올리고 SUMMARY 에 적는다. 머리 주석은 20261006200300 형식(결정 근거 · 권한 · 적용 · 멱등 · 되돌리기 = 함수 DROP)으로, 배경은 CONTEXT 첫 절 한두 줄. `BEGIN; … COMMIT;` 안에 `CREATE OR REPLACE FUNCTION public.dma_admin_adopt_server_only_account(p_dma_user_id text, p_broker text, p_account_no text, p_remove boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`. 본문 순서:
(a) dma_users 행을 `FOR UPDATE` 로 잠그고 없으면(`NOT FOUND`) P0001 `NO_DMA_USER`.
(b) 입력 계좌번호를 shared normalizeAccountNo 와 같은 규칙으로 지역 변수에 정규화(btrim 공백/탭 → ltrim '0' → 빈 값이면 '0'). 이 정규화값이 삽입 키다.
(c) 원천 = `dma_server_user_accounts c JOIN dma_servers s ON s.key = c.server_key` 중 `c.dma_user_id = p_dma_user_id` · `s.broker = p_broker` · `s.enabled` · 87 계좌번호를 같은 규칙으로 정규화해 비교(앞자리 0 · 공백 차이를 맞춘다 — `ltrim(btrim(c.account_no, E' \t'), '0')` 를 정규화값의 ltrim '0' 과 견주면 전부-0 경우까지 같다) · `NOT EXISTS` 그 (유저, p_broker, 정규화값, c.server_key) 의 dma_account_servers 행. 원천 서버 키를 `s.sort_order, s.key` 순 배열로 모은다 — 비면 P0001 `NOT_SERVER_ONLY`.
(d) `dma_user_accounts` 에 (p_dma_user_id, p_broker, 정규화값, 87 name · branch_no · trader_id · priority) 를 원천 중 **sort_order 첫 행** 값으로 `ON CONFLICT (dma_user_id, broker, account_no) DO NOTHING` 삽입. CHECK 를 미리 거르지 않는다 — 깨진 87 값은 원래 23514 그대로 올라간다(D-02 · 기존 adopt 의 사전 필터는 복제하지 않는다). 마스터는 기존 트리거가 채운다.
(e) `dma_account_servers` 에 원천 서버마다 state = `CASE WHEN p_remove IS TRUE THEN 'removing' ELSE 'active' END` 삽입(is_order 는 기본 false 그대로).
(f) 반환 `jsonb_build_object('servers', to_jsonb(서버 배열))`. 함수 뒤 권한 3줄: REVOKE EXECUTE … FROM PUBLIC · FROM anon, authenticated · GRANT EXECUTE … TO service_role(메모리 함정 — auto-grant 가 PUBLIC REVOKE 를 덮는다). 기존 `dma_admin_adopt_server_accounts(p_server)` 는 손대지 않는다.

**② pgTAP — `supabase/tests/dma_admin_server_only_account.test.sql`.** dma_admin_reflect.test.sql 의 머리 주석 · 픽스처(auth.users + app_users + `dma_admin_create_dma_user`) · `dma_admin_apply_snapshot` 로 87 심기 · `SELECT plan(N)` · 끝 `finish(); ROLLBACK;` 형식을 따른다. 실행 줄: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_server_only_account.test.sql`. 테스트 안에서 `UPDATE dma_servers SET enabled = true WHERE key = 'KB121'`(트랜잭션 안 · ROLLBACK). 단언 설명은 (대상, 기대) 튜플. 잠그는 것:
- link 트레이서: KB120 의도 계좌가 있는 DMA 유저 + KB121 87 에만 있는 KB 계좌 → `p_remove false` 반환 `{"servers":["KB121"]}` · dma_user_accounts 에 87 이름 · priority · dma_account_servers 그 서버 active · dma_accounts 마스터 행 생김.
- 같은 계좌가 KB120 · KB121 87 둘 다에 있고 값이 다름 → 서버 배열 sort_order 순 · 계좌 값은 KB120(첫 행) 값.
- remove: `p_remove true` → 원천 서버마다 state 'removing'.
- 정규화: 87 계좌번호 '00' 접두 → 정규화 키로 삽입되고 입력이 정규화값이든 0 붙은 값이든 맞는다.
- 거부(P0001 · throws_ok): 같은 호출 두 번째 `NOT_SERVER_ONLY` · 원천이 꺼진 서버(KYOBO127)뿐 · p_broker 가 다른 증권사 · 이미 등록 행이 있는 서버뿐(removing 행 포함) · 없는 DMA id `NO_DMA_USER` · 거부 뒤 행 수 불변.
- CHECK: KB 87 행의 branch 빈 값 → 23514.
- 권한: anon · authenticated EXECUTE 없음 · service_role 있음.

**③ relay — intent-store(D-03).** `INTENT_ERROR_CODES` 에 `NOT_SERVER_ONLY` 를 주석(quick 261107-moq — 87 에만 있는 그 계좌 원천이 없다: 이미 정리됨 · 오래된 화면)과 함께 더한다(`NO_DMA_USER` 는 이미 있다). 새 메서드 `adoptServerOnlyAccount(dmaUserId, broker, accountNo, remove: boolean): Promise<string[]>` — RPC 1:1 래퍼(`p_dma_user_id` · `p_broker` · `p_account_no` · `p_remove`), 반환 `stringList(data?.servers)`. JSDoc 은 이 파일 형식(판정은 DB · 로그에 식별자 없음).

**④ relay — admin-api 라우트(이 Task 는 link 갈래).** `AdminApiDeps.store` Pick 에 `"adoptServerOnlyAccount"` 추가. `INTENT_MESSAGE` 에 `NOT_SERVER_ONLY` 한국어 한 문장(화면에 「저장하지 못했어요 · <문장>」 으로 그대로 보인다 — 예: 「서버에만 있는 계좌가 아니에요 — 이미 정리됐거나 화면이 오래됐어요」). 기존 DELETE 계좌 라우트 바로 뒤에 `router.post("/dma-users/:dma/accounts/:broker/:accountNo/server-only", …)`: 첫 줄 `deadlineOf()` · `AccountParam.parse(req.params)` · 바디 zod 는 strict 객체 `{ action }`(이 Task 는 `z.enum(["link"])` — Task 2 가 remove 를 연다) · `audited(res, route, dma, run, { broker, account: maskAccountNo(accountNo), action })` 안에서 `deps.store.adoptServerOnlyAccount(dma, broker, accountNo, false)` 뒤 `{ results: [] }`(link 는 op 없음 — 서버에 이미 같은 값이 있다 · D-03) → `respond`. link 는 지정 재적재를 걸지 않는다(지정 무변경 — R4 선례). 파일 머리 주석에 이 경로 한 단락(바디 · link/remove 의미 · 409 코드 · 감사 extra)과 409 코드 목록에 `NOT_SERVER_ONLY` 를 더한다. IntentError 매핑은 기존 규약 그대로(업무 거부 전부 409 — NO_DMA_USER 도 409).

**⑤ relay 대역 · 테스트.** `relay/tests/helpers/admin-db-fake.ts` 에 87 표 대역 `serverAccounts: Array<{ serverKey, dmaUserId, accountNo, name, branchNo, traderId, priority }>`(테스트가 push) 와 `case "dma_admin_adopt_server_only_account"` 를 마이그레이션과 같은 순서로(NO_DMA_USER → 정규화 비교 · serverBroker 증권사 일치 · 이미 등록 행 제외 → 0건 NOT_SERVER_ONLY → 첫 행 값으로 계좌 없으면 push → 서버마다 serverRows push(state = p_remove ? removing : active) → `ok({ servers })`). enabled · sort_order 판정은 pgTAP 몫이라고 주석(대역은 레지스트리 enabled 를 모른다). 머리 주석의 「rpc 11종」 목록 갱신. `relay/tests/admin-api.test.ts` 에 새 describe 「quick-261107-moq 「서버에만 있음」 계좌 — 연결 · 서버에서 빼기」 와 파일 머리 「잠그는 것」 블록 몇 줄: `createBody({ servers: ["KB120"] })` 로 tr01 생성 → `h.db.serverAccounts` 에 KB121 · tr01 · 계좌 X 를 심음 → POST `/internal/admin/dma-users/tr01/accounts/KB/<X>/server-only` `{ action: "link" }` → 200 `{ results: [] }` · RPC 1회 인자(`p_remove: false` · 정규화 계좌번호) · 그 호출 전후 `h.commands("KB120")` · `h.commands("KB121")` 길이 불변(44 0건) · `h.db.intentOf("tr01")` 에 X@KB121 active · `h.orderServersReload` 0회 · 감사 info 1줄(route 패턴 · dma 마스킹 · account 마스킹 · action link · 원문 계좌번호/DMA id 없음). 같은 호출 다시 → 409 `NOT_SERVER_ONLY` · 없는 유저 → 409 `NO_DMA_USER` · `{ action: "nuke" }` · 바디 없음 · 추가 키 → 400 `VALIDATION_FAILED` 이고 RPC 0회.

**⑥ server(Express · D-04).** `server/src/schemas/admin.ts` 에 `AdminServerOnlyAccountSchema = z.object({ action: z.enum(["link", "remove"]) }).strict()`(프록시는 action 을 가리지 않는다 — 판정은 relay · DB) + JSDoc. `relay-admin-client.ts` 인터페이스에 `serverOnlyAccount(dmaUserId, broker, accountNo, action: "link" | "remove", adminEmail): Promise<RelayAdminResponse<AdminCommandResponse>>`(JSDoc: link = op 없음 · remove = op 4/op 2 · 409 NOT_SERVER_ONLY · NO_DMA_USER) + `relayAdminClientFrom` 안 `request<AdminCommandResponse>("POST", `${account(dma, broker, accountNo)}/server-only`, adminEmail, { action })`. `routes/admin.ts` 에 DELETE 계좌 라우트 뒤 `adminRouter.post("/dma-users/:dma/accounts/:broker/:accountNo/server-only", …)` — `dmaAccountParam` · 새 스키마 · `requireRelayAdmin` · `relayResults(…, "dma-account-server-only")` · `audit(req, "dma-account-server-only", maskDmaUserId(dma), { broker, action, servers: results.map(server:outcome) })` · `res.json({ results })`. 파일 머리 라우트 목록에 한 줄. `server/tests/routes/admin-dma.test.ts` 의 「DMA 프록시 — relay 계약(29-11) 1:1」 describe 에: link 프록시(relay.calls = POST `/internal/admin/dma-users/kim01/accounts/KYOBO/<번호>/server-only` · adminEmail · body `{ action: "link" }` · 200 `{ results: [] }` 그대로) · relay 409 NOT_SERVER_ONLY 그대로(코드 · 문구) · action 밖 값 / 추가 키 → 400 relay 0 · 기존 502/503 `it.each` 표와 403(trader 토큰) 표에 이 경로 한 줄씩.

**⑦ webapp 클라이언트(D-05).** `webapp/src/lib/admin-api.ts` 에 `export type ServerOnlyAccountAction = "link" | "remove"` 와 `serverOnlyAccount(dmaUserId, broker, accountNo, action): Promise<AdminCommandResponse>` — `${dmaPath(dmaUserId)}/accounts/${enc(broker)}/${enc(accountNo)}/server-only` · `jsonInit("POST", { action }, { timeoutMs: RELAY_TIMEOUT_MS })`(remove 는 relay 를 거쳐 서버까지 간다 — ④ 머리 주석 이유). JSDoc 한 줄. 파일 머리 ② 문단에 quick 261107-moq 한 줄. `webapp/src/lib/__tests__/admin-api.test.ts` 에 경로 인코딩(`kim/tr` · 공백 계좌번호) · POST · JSON 바디 · `RELAY_TIMEOUT_MS` · 응답 그대로 테스트 1개.

**⑧ webapp 카드 — 설명 줄 + 버튼 줄 + 연결 확인(D-01 · 목업 B 문구 그대로).** `account-editor.tsx`:
- `josaEulReul(word): "을" | "를"` 을 `josaEunNeun` 옆에 export — 끝 글자가 한글 음절이면 받침 유무(받침 있음 「을」), 숫자면 josaEunNeun 과 같은 한자어 읽기(2 · 4 · 5 · 9 → 「를」, 그 밖 숫자 → 「을」), 그 밖 「을」.
- 표시 이름 = `account.name` 이 비면 `account.accountNo`. 서버 문구 = `account.serverOnlyOn.join(" · ")`.
- `ACCOUNT_EDITOR_TEXT` 에 새 문구(목업 B 원문 — 마침표 · 띄어쓰기 · 조사 붙임까지 그대로): 설명 꼬리 「 서버 설정에만 있고 이 사용자에 연결돼 있지 않아요. 그래서 여기서 연결 해제해도 그 서버에는 닿지 않아요.」 · 버튼 「이 사용자에 연결」 · 「서버에서 빼기」 · 연결 확인 본문 「{이름}{을/를} **{dma}** 에 연결해요. {서버} 서버 설정은 그대로예요.」 · 작은 글씨 「연결하면 위 계좌들처럼 서버를 켜고 끄거나 연결 해제할 수 있어요.」 · 확인 버튼은 기존 `cancel`(취소) · `submit`(연결) 재사용. 굵은 부분은 JSX `<b>` 로(문자열 함수 + 조각 조합 — 실행자 재량).
- `ServerOnlyAccountRow` props 를 `{ account, dmaUserId, onResults, onChanged }` 로 넓히고 `AccountEditor` 가 넘긴다(시트가 이미 주는 onChanged · 편집기 내부 onResults 재사용 — user-sheet.tsx 무변경). 카드: 점선 테두리 유지 · 카드 전체 `opacity-60` 을 없애고 흐림은 제목 줄과 칩 줄에만(목업 `.dimmed`) — 설명 · 버튼은 또렷하게. 칩 줄 아래 `<p data-slot="admin-server-only-why">`(12.5px · muted · 서버 문구는 `<b>` fg-2 semibold) → 그 아래 상태 `mode: "idle" | "link"`(Task 2 가 "remove" 추가): idle 이면 버튼 줄 `<div data-slot="admin-server-only-actions">` 에 `[이 사용자에 연결](secondary)` 하나(「서버에서 빼기」 버튼은 동작과 함께 Task 2 가 더한다 — 누를 수 있는데 아무 일 없는 버튼을 커밋에 남기지 않는다); link 면 확인 상자 `<div data-slot="admin-server-only-confirm" data-kind="link">`(rounded-[10px] · border color-mix(var(--primary) 40%) · bg color-mix(var(--primary) 5%) · p-3 · 세로 gap — 목업 `.confirm.blue`) 안에 본문 13px fg · 작은 글씨 12px muted · 오른쪽 정렬 `[취소](secondary)` `[연결](primary)`. 버튼은 `ACCOUNT_BUTTON` 높이 규약.
- 저장: `useFieldSave<ServerOnlyAccountAction>((action) => serverOnlyAccount(dmaUserId, account.broker, account.accountNo, action), { retainValue: false, onSuccess: (_a, res) => { if (res) onResults(accountKeyOf(...), res.results); onChanged(); } })`. 저장 중엔 확인 상자 버튼 비활성. 실패면 상자는 열린 채 그 아래 `<p role="alert" data-slot="admin-account-error">`(기존 `ERROR_LINE` · 기본 문구 「저장하지 못했어요 · <서버 문구>」).
- 파일 머리 JSDoc 의 「87 에만 있는 계좌는 흐린 「서버에만 있음」 줄로 보기만 한다(D-23 ⑤)」 를 quick 261107-moq 동작(설명 + 연결/서버에서 빼기 · 자동 정리는 여전히 없음)으로 고친다. 의도 계좌 서버 줄의 `serverOnlyOn` 칩(case b) · user-sheet 의 ServerOnlyRow 는 손대지 않는다(D-01 대상 아님).
- `account-editor.test.tsx`: 목에 `serverOnlyAccount` 추가 · beforeEach reset. 141행 테스트의 「87 전용 줄 버튼 없음」 단언을 「설명 줄 문장(「KYOBO127 서버 설정에만 있고 이 사용자에 연결돼 있지 않아요. 그래서 여기서 연결 해제해도 그 서버에는 닿지 않아요.」) + 버튼 「이 사용자에 연결」 1개 · 체크박스 0」 으로 바꾼다(Task 2 가 버튼 2개로 넓힌다). 새 describe 「quick-261107-moq 서버에만 있음 계좌 — 연결」: ① 「이 사용자에 연결」 → 확인 상자(data-kind link) 문장 「5550001을 kimtr 에 연결해요. KYOBO127 서버 설정은 그대로예요.」 · 버튼 줄 사라짐 → 「취소」 → 버튼 줄 복귀 · 호출 0 ② 이름 있는 계좌(예: 이름 「교보 김현중」 · serverOnlyOn 두 서버)로 「교보 김현중을 kimtr 에 연결해요. KYOBO119 · KYOBO127 서버 설정은 그대로예요.」 ③ 「연결」 → mock 인자 ('kimtr', 'KYOBO', '5550001', 'link') 1회 · resolve `{ results: [] }` 뒤 onChanged 1회 ④ reject `new ApiClientError(...)` 409 NOT_SERVER_ONLY → alert 줄에 서버 문구 · onChanged 0. `josaEulReul` 단위 단언(「교보 김현중」 → 을 · 「위탁」 → 을 · 「교보」 → 를 · '5550001' → 을 · '12' → 를 · 'abc' → 을).

**커밋.** 옆 세션이 같은 master 트리에 커밋한다 — `git status -sb` 확인 뒤 이 Task 의 경로만 `git add <경로들>`(절대 `git add -A` · `git add .` 금지 · .planning/STATE.md · 다른 quick 디렉터리 금지) → `git commit -m "feat(quick-261107-moq): 서버에만 있음 계좌 「이 사용자에 연결」 — RPC · relay link · Express 프록시 · 웹 확인 상자"`(한글 · Co-Authored-By 줄 없음). push · 배포 · `supabase db push` 금지(메인 세션 몫).
  </action>
  <verify>
    <automated>bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_server_only_account.test.sql && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/admin-api.test.ts src/components/admin/__tests__/account-editor.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>pgTAP 이 link · remove 상태 · 가드 · 정규화 · 첫 행 값 · 23514 · 권한을 전부 ok 로 통과한다. relay `POST …/server-only {action:link}` 가 RPC 1회 · 44 0건 · 200 `{results:[]}` · 409 NOT_SERVER_ONLY / NO_DMA_USER · 400 검증을 테스트로 잠근다. Express 가 같은 경로를 1:1 프록시한다(200 · 409 · 400 · 502 · 503 · 403). 웹 카드가 설명 줄 · 버튼 줄 · 파랑 확인 상자(목업 B 문구) · 연결 → 재조회 · 오류 줄을 보인다. 이 Task 경로만 커밋됐다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 「서버에서 빼기」 한 길 — relay remove(reconcile → op 4/op 2 → settle) · 빨강 확인 상자 · 완료 줄 · 실패는 기존 반영 칩</name>
  <files>relay/src/admin/admin-api.ts, relay/tests/admin-api.test.ts, relay/tests/helpers/admin-db-fake.ts, server/tests/routes/admin-dma.test.ts, webapp/src/components/admin/account-editor.tsx, webapp/src/components/admin/__tests__/account-editor.test.tsx</files>
  <behavior>
    - relay: tr01(KB120 의도) + KB121 87 에 tr01 계좌 X 만(의도 없음 · db.serverAccounts 에도 심음) → `{ action: "remove" }` → RPC `p_remove: true` 1회 → KB121 에 op 2(accountNos [X]) 1건 → 대역 87 에서 tr01 사라짐 → 200 results 에 KB121 ok → `h.db.intentOf("tr01")` 에 X 없음(settle 이 행 · 계좌 정리) · `h.orderServersReload` 1회 · 감사 1줄 action remove
    - relay: KB121 87 에 tr01 계좌 X · Y(둘 다 의도 없음)일 때 X 만 remove → op 4 X 1건만 · op 2 없음 · Y 는 87 에 남는다(D-23 ⑤)
    - relay: KB121 `busyAccounts` 에 X → KB121 결과 failed + 서버 문구 · X@KB121 removing 행이 남는다(settle 안 됨) · 그래도 200
    - relay: remove 원천 0건 → 409 NOT_SERVER_ONLY · 44 0건 · 재적재 0회
    - server: `{ action: "remove" }` 바디가 relay 로 그대로 가고 relay results(failed 포함) 를 그대로 200 으로 돌려준다
    - web: 「서버에서 빼기」 → 빨강 확인 상자 문장 「KYOBO127 서버 설정에서 kimtr 의 5550001을 빼요. kimtr 는 다시 로그인하면 계좌 목록에서 사라져요.」 + 작은 글씨 BUSY 안내 원문 · 「취소」 로 복귀
    - web: 확인 「서버에서 빼기」 → mock ('kimtr','KYOBO','5550001','remove') 1회 → 결과 전부 ok 면 onChanged 1회 + 완료 줄 「✓ KYOBO127 에서 5550001을 뺐어요 — kimtr 가 다시 로그인하면 반영돼요.」 — 그 계좌가 빠진 accounts 로 rerender 해도 완료 줄은 남는다
    - web: 결과에 failed(BUSY) 가 있으면 완료 줄 없음 · onChanged 1회 · 그 계좌가 removing 등록으로 돌아온 accounts 로 rerender 하면 기존 AccountRow 의 실패 칩(title = 서버 문구)과 BUSY 줄이 보인다(onResults 경로)
  </behavior>
  <action>
**relay(D-03).** Task 1 의 라우트 바디 zod 를 `z.enum(["link", "remove"])` 로 연다. remove 갈래: `audited` 안에서 `deps.store.adoptServerOnlyAccount(dma, broker, accountNo, true)` 뒤 `{ results: await deps.dispatcher.reconcileUser(dma, { adminEmail: res.locals.adminEmail as string, deadlineAt }) }` — 기존 planner 가 removing 계좌를 op 4(그 서버의 그 유저 계좌 전부면 op 2)로 보내고 settle 이 행 · 연결을 지운다. planner · dispatcher · shared 는 고치지 않는다(D-06). `audited` 뒤 remove 일 때만 기존 DELETE 라우트처럼 `await awaitWithinDeadline(reloadOrderServers(route), deadlineAt, route, "order-servers")` → `respond`. link 는 Task 1 그대로(op 없음 · 재적재 없음). 머리 주석 단락의 remove 설명을 실제 동작과 맞춘다. 거부 409 는 `audited` 가 거부 코드로 감사 1줄을 남기고 재적재는 타지 않는다.

**relay 테스트.** Task 1 describe 에 `<behavior>` 의 relay 4건을 더한다. KB121 87 에 tr01 을 넣는 법: `h.states.KB121!.users.set("tr01", [...])` 뒤 `h.gateways.KB121!.pushAdminSnapshot(await h.gateways.KB121!.waitForAdminConnection(), { usersRev, users })`(대역 상태의 전 유저 — "other" 포함) → `waitFor(() => h.conns.KB121!.currentSnapshot()?.users.some(u => u.userId === "tr01"))`. 단언은 `h.commands("KB121")` 의 op · account/accountNos 와 `results.find(r => r.server === "KB121")`(reconcile 이 KB120 결과도 실을 수 있으니 전체 배열 단언 대신). 대역 RPC 가 remove 를 이미 다루면 admin-db-fake 는 손대지 않고, settle 경로에서 모자라는 의미가 있으면 마이그레이션 의미에 맞춰 고친다.

**server 테스트(D-04).** admin-dma.test.ts 에 remove 프록시 1건(relay.calls 바디 `{ action: "remove" }` · relay 가 `{ results: [{ server: "KYOBO112", outcome: "failed", code: 9, message: "…" }] }` 를 주면 200 그대로). 라우트 코드는 Task 1 에서 이미 action 을 가리지 않으니 바꾸지 않는다.

**webapp(D-01 · D-05).** `ServerOnlyAccountRow` mode 에 "remove" 추가 · 버튼 줄에 `[서버에서 빼기]`(secondary + `text-[var(--destructive)]` — 목업 `.btn.sm.danger` 빨강 글씨)를 「이 사용자에 연결」 오른쪽에 더한다. 「87 전용 줄」 기존 테스트 단언을 「버튼 정확히 2개(이 사용자에 연결 · 서버에서 빼기)」 로 넓힌다. 빨강 확인 상자 `data-kind="remove"`(border color-mix(var(--destructive) 40%) · bg color-mix(var(--destructive) 5%) — 목업 `.confirm.red`): 본문 「**{서버}** 서버 설정에서 {dma} 의 {이름}{을/를} 빼요. {dma} 는 다시 로그인하면 계좌 목록에서 사라져요.」 · 작은 글씨 원문 「이 계좌에 상따·VI·미체결·예약이 남아 있으면 서버가 거절해요(같은 계좌를 가진 다른 사용자 것도 포함) — 장 마감 뒤에 하세요.」(가운뎃점 붙임 · 괄호 · 줄표까지 목업 그대로) · `[취소](secondary)` `[서버에서 빼기]`(`variant="destructive"` 채움 · text-[12px] font-semibold — account-master-sheet 선례). 새 문구는 전부 `ACCOUNT_EDITOR_TEXT` 에.
완료 줄(목업 「빼기 끝」 상태): `AccountEditor` 에 상태 하나(완료 문장 | null)를 두고 `ServerOnlyAccountRow` 에 `onRemoved(text)` 를 넘긴다. 행의 onSuccess 에서 action 이 remove 이고 결과가 1건 이상 · 전부 `ok` 일 때만 「✓ {서버} 에서 {이름}{을/를} 뺐어요 — {dma} 가 다시 로그인하면 반영돼요.」 를 올린다(timeout · failed · offline 은 올리지 않는다 — 그때는 계좌가 removing 등록으로 남아 기존 칩 · BusyLines 가 말한다). 렌더 자리 = 계좌 카드 목록 뒤 · 「+ 계좌 연결」 앞, `<p data-slot="admin-server-only-removed">` (12.5px · `text-[var(--led-armed)]` — 목업 `.res`). 다른 서버에만 있음 동작을 새로 시작하면 지운다. 결과 칩은 Task 1 의 `onResults(accountKey, results)` 그대로 — 실패 시 재조회로 돌아온 removing 계좌의 AccountRow 가 overlay 칩을 그린다.
`account-editor.test.tsx` 에 새 describe 「quick-261107-moq 서버에만 있음 계좌 — 서버에서 빼기」 로 `<behavior>` 의 web 3건(RED 먼저 → 구현 → GREEN). 실패 rerender 픽스처: 같은 계좌번호 · `servers: [{ serverKey: 'KYOBO127', tone: 'failed', message: BUSY, state: 'removing' }]` · `serverOnlyOn: []`.

**커밋.** `git status -sb` 확인 → 이 Task 경로만 `git add <경로들>` → `git commit -m "feat(quick-261107-moq): 서버에만 있음 계좌 「서버에서 빼기」 — relay remove(reconcile · 지정 재적재) · 빨강 확인 · 완료 줄"`(한글 · Co-Authored-By 없음). push · 배포 금지. 마지막에 D-06 경계 확인 — 이 작업 커밋이 planner · dispatcher · packages/shared/src 를 건드리지 않았는지(아래 verify 마지막 조건).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts tests/admin-planner.test.ts tests/admin-dispatcher.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/admin-api.test.ts src/components/admin/__tests__/account-editor.test.tsx src/components/admin/__tests__/user-sheet.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_admin_server_only_account.test.sql && MOQ_LOG="$(git log --format=%s 4be2a91a..HEAD -- relay/src/admin/planner.ts relay/src/admin/dispatcher.ts packages/shared/src supabase/migrations/20261006200300_dma_admin_reflect.sql)" && ! printf '%s\n' "$MOQ_LOG" | grep -q 'quick-261107-moq'</automated>
  </verify>
  <done>remove 가 RPC(removing) → reconcile → op 2/op 4 → settle 로 행 · 계좌를 지우고, 87 에 다른 서버에만 있음 계좌가 남으면 op 4 만 간다. BUSY 면 removing 이 남고 failed 결과가 200 으로 온다. 지정 재적재는 remove 에만 1회. 웹은 빨강 확인 상자(목업 B 문구) · 전부 ok 일 때만 완료 줄 · 실패는 기존 반영 칩 · BUSY 줄로 보인다. 관련 relay · server · webapp 단위 + typecheck + pgTAP 통과 · 이 작업 커밋에 planner/dispatcher/shared/기존 adopt 마이그레이션 변경 0.</done>
</task>

</tasks>

<verification>
- 두 Task 의 `<automated>` 가 모두 통과한다(pgTAP · relay admin-api/planner/dispatcher · server admin-dma · webapp admin-api/account-editor/user-sheet 단위 + 세 패키지 typecheck). vitest 는 전부 `--maxWorkers=2`(동시 세션 메모리) · e2e 전체 회귀는 돌리지 않는다(이 카드를 다루는 spec 없음 — D-06).
- `git log --format=%h\ %s -3` 에 `feat(quick-261107-moq): …` 커밋 2개 · 각 커밋의 `git show --stat` 이 이 plan 의 files_modified 안 경로만 담는다(.planning/STATE.md · 다른 quick 디렉터리 없음).
- 원격 무접촉: `supabase db push` · 배포 스크립트 · `git push` 실행 0. 배포 순서(DB → relay → server → push)는 SUMMARY 에 메인 세션 몫으로 적는다.
</verification>

<success_criteria>
- 「서버에만 있음」 계좌 카드에서 확인 한 번으로 그 계좌를 이 사용자 의도로 들이거나(서버 무접촉) 그 서버에서 뺄 수 있다(op 4/op 2 → settle).
- 오래된 화면 · 이미 정리된 계좌는 409 NOT_SERVER_ONLY 한 줄로 끝나고 아무것도 바뀌지 않는다.
- D-01 ~ D-06 전부 반영 · 범위 밖 파일 변경 0.
</success_criteria>

<output>
Create `.planning/quick/261107-moq-admin-server-only-account/261107-moq-SUMMARY.md` when done — 커밋 해시 2개 · 실제 마이그레이션 파일명 · 배포 순서(DB 마이그레이션 → relay → server → push(webapp), 메인 세션) · 운영 확인 방법(112 같은 서버에만 있음 계좌 카드에서 연결/빼기).
</output>
