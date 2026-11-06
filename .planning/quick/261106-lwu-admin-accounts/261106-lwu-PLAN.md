---
phase: quick-261106-lwu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 계좌 마스터 계약(DB → shared → Express)
  - supabase/migrations/20261106300000_dma_accounts_master.sql
  - supabase/tests/fixtures/261106_pre_accounts_master.sql
  - supabase/tests/dma_accounts_master.test.sql
  - packages/shared/src/admin.ts
  - server/src/schemas/admin.ts
  - server/src/routes/admin-accounts.ts
  - server/src/routes/admin.ts
  - server/src/app.ts
  - server/tests/routes/admin-accounts.test.ts
  - server/tests/routes/admin-dma.test.ts
  - server/tests/routes/admin.test.ts
  # Task 2 — /admin/accounts 화면 + 사이드바
  - webapp/src/lib/admin-api.ts
  - webapp/src/app/admin/accounts/page.tsx
  - webapp/src/components/admin/accounts-client.tsx
  - webapp/src/components/admin/account-master-sheet.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/admin/__tests__/accounts-client.test.tsx
  - webapp/src/components/admin/__tests__/account-master-sheet.test.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  # Task 3 — 사용자 시트 · 사용자 만들기의 계좌 고르기(A)
  - webapp/src/components/admin/account-picker.tsx
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/admin/dma-connect-fields.tsx
  - webapp/src/components/admin/user-sheet.tsx
  - webapp/src/components/admin/user-create-sheet.tsx
  - webapp/src/components/admin/users-client.tsx
  - webapp/src/components/admin/__tests__/account-picker.test.tsx
  - webapp/src/components/admin/__tests__/account-editor.test.tsx
  - webapp/src/components/admin/__tests__/dma-connect-fields.test.tsx
  - webapp/src/components/admin/__tests__/user-sheet.test.tsx
  - webapp/src/components/admin/__tests__/user-create-sheet.test.tsx
  - webapp/src/components/admin/__tests__/users-client.test.tsx
autonomous: false
requirements: ["261106-lwu"]

estimate:
  tokens: 260000
  raw_tokens: 260000
  tasks: 4
  confidence: low

must_haves:
  truths:
    - "사이드바 순서가 「… 분석 · My page · Admin」 이고 Admin 하위가 사용자 · 계좌 · 서버 · 발사 · 매매손익 순이다(D-01 · D-02). /admin/accounts 는 기존 /admin 관문(middleware · Express requireAdmin)으로만 열린다"
    - "마이그레이션 적용 직후 /admin/accounts 에 지금 사용자들에게 붙은 계좌가 (증권사, 계좌번호)당 한 줄로 보이고, 같은 계좌를 여러 DMA 사용자가 쓰면 「쓰는 사용자」 에 그 DMA id 가 모두 칩으로 보인다. 값이 갈리던 계좌는 updated_at 최신 행 값이다. 마이그레이션을 두 번 적용해도 행이 늘지 않는다(D-05)"
    - "「+ 계좌」 등록은 DB 마스터에만 쓰고 relay · 증권사 서버를 부르지 않는다. 같은 증권사 · 정규화 계좌번호를 다시 등록하면 409 ACCOUNT_EXISTS 로 막히고 계좌번호 칸 아래 한 줄이 선다(D-03 · D-07)"
    - "계좌 시트에서 계좌명 · 지점 · 트레이더를 저장하면 마스터와 모든 연결 행(dma_user_accounts)이 한 트랜잭션으로 바뀌고, 연결된 DMA 사용자마다 기존 PUT /dma-users/:dma/accounts relay 경로(그 사용자의 지금 active 등록 서버 · priority 그대로)로 반영돼 사용자 · 서버별 결과 칩이 붙는다. relay 실패는 그 사용자 줄에만 서버 message 원문으로 남고 나머지는 계속된다(D-08)"
    - "연결된 사용자가 있는 계좌는 삭제 버튼이 잠기고 안내 문구가 보이며, 서버도 409 ACCOUNT_IN_USE 로 막는다. 연결 0명 계좌는 시트 안 확인 박스(브라우저 confirm 아님)로 삭제되고 목록에서 사라진다(D-08)"
    - "사용자 시트 「+ 계좌 연결」 은 검색칸 + 그 DMA 사용자에 아직 없는 등록 계좌 목록(라디오 · 쓰는 사용자/연결 없음) + 고른 계좌 증권사의 등록 서버 체크(기본 체크 없음 · 꺼진 서버 비활성)로 연결하고, 계좌 카드는 「연결 해제」 · 편집 모드에 계좌명 칸 없음 · 교보는 「편집」 없음 · 메타 줄 안내가 보인다. 등록 서버 · 주문 서버 · IP/MAC · 예수금 · 수수료 동작은 그대로다(D-04 · D-09)"
    - "사용자 만들기 · DMA 연결의 첫 계좌는 같은 피커(연결/취소 버튼 없음)로 고르고, 생성 바디 AdminDmaInput.account 모양은 그대로 마스터 값으로 채워진다(D-10)"
    - "연결 경로 3개(POST /users dma · POST /users/:email/dma · PUT /dma-users/:dma/accounts)는 마스터에 없는 계좌면 relay · app_users 쓰기 전에 409 ACCOUNT_NOT_REGISTERED 이고, 있으면 계좌명 · 지점 · 트레이더를 웹이 보낸 값 대신 마스터 값으로 relay 에 넘긴다. relay 코드는 바뀌지 않는다(서버측 정합 규칙)"
  artifacts:
    - path: supabase/migrations/20261106300000_dma_accounts_master.sql
      provides: "dma_accounts 표(PK broker, account_no · KB/교보 CHECK · RLS · service_role 전용) · 멱등 백필 · 연결 행 → 마스터 자동 등록 트리거 · FK ON DELETE RESTRICT · RPC admin_accounts_raw / dma_admin_create_account / dma_admin_update_account / dma_admin_delete_account (전부 REVOKE PUBLIC, anon, authenticated)"
    - path: supabase/tests/dma_accounts_master.test.sql
      provides: "백필 · 멱등 · 트리거 · FK · RPC 4종 · 권한 pgTAP"
    - path: server/src/routes/admin-accounts.ts
      provides: "GET/POST /accounts · PUT/DELETE /accounts/:broker/:accountNo (경로 한정 관문 · 팬아웃)"
    - path: server/src/routes/admin.ts
      provides: "registeredAccount 마스터 검사 + 마스터 값 덮어쓰기 — 연결 경로 3개"
    - path: webapp/src/components/admin/accounts-client.tsx
      provides: "/admin/accounts 목록(필터 세그먼트 · 행 · 쓰는 사용자 칩)"
    - path: webapp/src/components/admin/account-master-sheet.tsx
      provides: "등록 시트 ② · 수정/삭제 시트 ③ (팬아웃 결과 칩 · 시트 안 삭제 확인)"
    - path: webapp/src/components/admin/account-picker.tsx
      provides: "AccountPicker(A) — 검색 + 라디오 목록 + 「계좌」 링크 · 순수 헬퍼 matchesAccountQuery"
  key_links:
    - from: server/src/routes/admin-accounts.ts
      to: "RPC admin_accounts_raw · dma_admin_update_account"
      via: "supabase.rpc — 응답 jsonb 키가 shared AdminAccountsOverview / links 모양과 같아야 함"
    - from: server/src/routes/admin-accounts.ts
      to: "relay putAccount (PUT /internal/admin/dma-users/:dma/accounts)"
      via: "PUT /accounts/:broker/:accountNo 팬아웃 — 링크마다 { account: 마스터 값 + 그 링크 priority, servers: 그 링크 active 키 } · relayResults 로 해석"
    - from: server/src/routes/admin.ts
      to: dma_accounts
      via: "registeredAccount(supabase, account) — select eq broker · eq account_no(normalizeAccountNo) maybeSingle, 없으면 409 ACCOUNT_NOT_REGISTERED"
    - from: webapp/src/components/admin/users-client.tsx
      to: webapp/src/components/admin/account-picker.tsx
      via: "load() 가 fetchAdminAccounts 를 병렬로 읽어 UserSheet → AccountEditor(masterAccounts) · DmaConnect/UserCreateSheet → DmaConnectFields(accounts) 로 내려 보냄"
    - from: "dma_user_accounts"
      to: "dma_accounts"
      via: "FK (broker, account_no) ON DELETE RESTRICT + BEFORE INSERT 트리거 dma_user_accounts_ensure_master"
---

<assumption_delta_decision>
- 주 명사(primary noun): **계좌 = (broker, account_no)**. 지금까지 계좌는 DMA 사용자 아래 자식 행(`dma_user_accounts` PK = dma_user_id, broker, account_no)이었고, 이 작업으로 독립 엔티티 `dma_accounts`(마스터)가 되고 사용자와는 「연결」 관계가 된다.
- 결정: **add-alongside.** `dma_user_accounts` 의 name · branch_no · trader_id 값 열을 남긴다 — relay planner · 87 diff(shared `diffServerAccounts`)가 그 열을 읽으므로 relay 무변경 조건(CONTEXT 「서버측 정합 규칙」)을 지키려면 지울 수 없다. 마스터가 정본이고 (a) 마스터 수정 RPC 가 연결 행을 같은 트랜잭션에서 갱신, (b) 연결 시 Express 가 마스터 값으로 덮어써 relay 에 넘김, (c) FK 로 「연결 행은 늘 마스터를 가진다」 를 DB 가 쥔다.
- 수용한 부채: 같은 값이 두 곳(마스터 · 연결 행)에 있다. 백필 시점에 사용자마다 값이 갈리던 계좌는 연결 행을 건드리지 않으므로(건드리면 87 대비 「미반영」 칩이 갑자기 뜬다) 다음 계좌 저장 · 연결 저장 때 수렴한다.
- 나중에 promote 를 강제할 신호: relay planner 를 손볼 일이 생길 때(값을 마스터 조인으로 읽게 하고 연결 행 값 열 제거), 또는 연결 행 값이 마스터와 갈리는 사고가 한 번이라도 관측될 때.
- 불변식 테스트(pgTAP Task 1): 연결 행은 늘 마스터를 가진다(FK) · 마스터 저장은 모든 연결 행에 같은 값으로 왕복한다.
</assumption_delta_decision>

<objective>
어드민에 「계좌」 메뉴(`/admin/accounts`)를 추가해 관리 계좌를 마스터로 등록 · 수정 · 삭제하고(기존 계좌 백필), 사용자 시트 · 사용자 만들기에서는 등록된 계좌를 골라 연결만 하게 바꾼다. 사이드바는 My page 를 Admin 위로 올린다. CONTEXT D-01 ~ D-10 과 「서버측 정합 규칙」 을 그대로 구현한다.

Purpose: 같은 계좌를 여러 DMA 사용자가 쓸 때 사용자마다 따로 치던 계좌 값을 한 곳에서 관리하고, 수정은 연결된 모든 사용자의 서버에 한 번에 반영한다.
Output: 마이그레이션 1 · pgTAP 1 · Express 라우터 1 · webapp 화면 1(+시트 · 피커) · 사용자 시트 변경 · 테스트. 배포는 메인 세션(Task 4 체크포인트).

분해 메모: 오케스트레이터 지정 3분할(계약 → 계좌 화면 → 사용자 시트)을 따른다. 각 task 가 끝나면 관리자가 할 수 있는 일이 하나씩 생긴다 — ① API 로 계좌 목록 · 등록 · 수정 팬아웃 · 삭제 + 미등록 계좌 연결 거부 ② 화면에서 계좌 관리 ③ 사용자에게 등록 계좌 연결.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261106-lwu-admin-accounts/261106-lwu-CONTEXT.md
@.planning/quick/261106-lwu-admin-accounts/reference/mockup-admin-accounts.html

## 확정 사실 (플래너 조사 — 다시 조사하지 말 것)
- 계좌 의도 표 · 제약: `supabase/migrations/20261006200100_dma_registry_intent.sql` ④⑤ — `dma_user_accounts` PK (dma_user_id, broker, account_no) · KB CHECK(branch 5 · trader 6) · 교보 CHECK(둘 다 빈 값) · RLS · service_role 전용. `dma_account_servers` 는 (dma_user_id, broker, account_no) FK CASCADE, state active|removing.
- 연결 행을 쓰는 곳은 RPC 뿐이다: `dma_admin_put_account`(최신 본문 `20261010200100_dma_account_order_server.sql` ④ — INSERT … ON CONFLICT DO UPDATE 로 name · branch_no · trader_id · priority 갱신 + 넘긴 서버 active · 빠진 active 는 removing), `dma_admin_create_dma_user`(`20261010200000`), `dma_admin_adopt_server_accounts`(`20261006200300` · 코드 호출처 없음 · pgTAP `dma_admin_reflect.test.sql` 만 씀). relay 는 `relay/src/admin/intent-store.ts` 가 RPC 만 부르고 의도를 캐시하지 않는다(재조정마다 `dma_admin_intent` 재조회).
- relay `PUT /internal/admin/dma-users/:dma/accounts`(`relay/src/admin/admin-api.ts` ~L554) = `store.putAccount` → `dispatcher.reconcileUser`(의도 대 87 diff 만 보냄). servers 에 지금 active 집합을 그대로 넘기면 서버 상태 · 주문 서버 지정(is_order)은 그대로다. orderEndpoint 를 안 실으면 87 IP/MAC 보존. relay 계좌 zod: name ≤64 · KB branch 5 · trader 6. 빈 servers 는 NO_SERVERS 409.
- Express 관례(`server/src/routes/admin.ts` · `admin-servers.ts`): service_role 클라이언트 `req.app.locals.supabase` · `parseOrThrow` · `DbError` · `audit`(계좌번호는 감사 줄에 넣지 않는다 — broker 만, DMA id 는 `maskDmaUserId`) · `relayResults`(409 그대로 · 그 밖 502 RELAY_FAILED) · `requireRelayAdmin`. 경로 한정 관문 라우터는 `app.ts` 에서 adminRouter **앞**에 마운트(`app.use("/api/admin", …)` L154~158). RPC 업무 오류는 `RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='<CODE>'` → Express 가 `error.message` 로 분기.
- server 테스트 fixture `server/tests/fixtures/admin-supabase.ts`: `rpc: { 이름: handler }` · `tables: { 표: 행[] }`(select · update · delete + eq · maybeSingle 지원, insert 없음) · `rec.rpcCalls` · `rec.ops`. relay 가짜 `server/tests/fixtures/fake-relay-admin.ts`(`makeFakeRelay` · `relayReject`). **기존 `admin-dma.test.ts` · `admin.test.ts` 의 dma 경로 테스트는 `tables.dma_accounts` 가 없으면 이제 실패한다** — makeApp 기본 tables 에 그 테스트들이 쓰는 계좌(예 KB 12345678901 등)를 넣는다.
- pgTAP 러너: `bash scripts/verify-dma-orders-price-check.sh [--until <버전>] [--with <sql> …] --test <파일>` — 일회용 로컬 컨테이너(이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 있음 확인) · 원격 접촉 0 · `not ok` 있으면 non-zero. `--until` 은 그 버전 이하만 재생, `--with` 는 재생 뒤 · 테스트 전 순서대로 적용(저장소 루트 상대 경로). 지금 최신 마이그레이션 = `20261106200000_stock_float.sql`.
- webapp: 목록 화면 꼴 = `webapp/src/components/admin/users-client.tsx`(LoadState · seq 가드 · `AdminPanelPage` · `PageHeader` · `CARD`/`ROW_DIVIDER`/`SECTION_*`) · 시트 = `admin-sheet.tsx` `AdminSheet`(데스크톱 비모달 · 폰 모달) · 페이지 = `webapp/src/app/admin/servers/page.tsx` 꼴. 세그먼트 = `role-segment.tsx` `ADMIN_SEGMENT_ROOT/ITEM` + `ToggleGroup`. 결과 칩 = `account-editor.tsx` `ResultChips` · `BusyLines` · `busyLineText` · `chipOfResult`(재사용 — 새 문구 만들지 말 것). 저장 훅 = `use-field-save.ts` `useFieldSave`. ui 에 radio-group 없음 → 네이티브 `input type="radio"` 사용(새 의존성 금지).
- 사이드바 `webapp/src/components/layout/app-sidebar.tsx`: NAV_ADMIN* L197~203 · NAV_ME L206 · Admin 블록 L742~792 · My page 블록 L794~798 · 머리 주석 L41~42 · L191~196. 테스트 `components/layout/__tests__/app-sidebar.test.tsx` L1511~ 「Admin」 describe 의 순서 배열(L1538~1556)과 하위 링크 단언.
- `account-editor.tsx`(2007줄): `ACCOUNT_EDITOR_TEXT` L123 · 편집 모드 계좌명 칸 L1371~1386 · `EditFields`/`editSaveBodyOf` L1099~1142 · `confirmedName` L1204 · 「편집」/「제거」 버튼 L1336~1361 · 추가 폼 L1690~1875 · `AccountEditor` L1898~2007.
- `dma-connect-fields.tsx`: `DmaConnectValue`(broker · accountNo · branchNo · traderId 포함) · `validateDmaConnect` · `toDmaInput` · `clearChangedErrors` · 두 소비처 = `user-create-sheet.tsx` · `user-sheet.tsx` 의 `DmaConnect`.
- 동시 세션: 작업 트리에 다른 세션의 미커밋 변경(server/src/services/specialists/** · webapp/src/components/chat/** · .planning/phases/39-*/reference/)이 있다. **자기 경로만 `git add <경로>` — `-A`/`.` 금지.** 커밋 전 `git status -sb` 재확인. vitest 는 항상 `--maxWorkers=2`.
- 커밋 메시지는 한글 · Co-Authored-By 트레일러 넣지 않음(사용자 규칙). 배포 명령(supabase db push · server 배포 · git push)은 실행하지 않는다.

<interfaces>
shared 에 더할 계약(이름 · 모양 고정 — RPC jsonb 키도 이 이름):

  /** 계좌 마스터를 쓰는 DMA 사용자 1명(quick 261106-lwu D-06 · D-08). */
  export interface AdminAccountMasterUser {
    dmaUserId: string;
    emails: string[];                                  // app_users.dma_user_id 가 이 id 인 이메일(오름차순 · 없으면 [])
    priority: number;                                  // 그 사용자 연결 행의 priority
    servers: { serverKey: string; state: "active" | "removing" }[]; // dma_servers.sort_order, key 순
  }
  /** 계좌 마스터 1행(D-03). accountNo = normalizeAccountNo 정규화값. */
  export interface AdminAccountMaster {
    broker: DmaBroker; accountNo: string; name: string; branchNo: string; traderId: string;
    updatedAt: string;
    users: AdminAccountMasterUser[];                   // dmaUserId 오름차순 · 연결 없으면 []
  }
  export interface AdminAccountsOverview { accounts: AdminAccountMaster[] }   // broker, accountNo 순
  export interface AdminAccountCreateBody { broker: DmaBroker; accountNo: string; name: string; branchNo: string; traderId: string }
  export interface AdminAccountSaveBody { name: string; branchNo: string; traderId: string }
  /** PUT /api/admin/accounts/:broker/:accountNo 팬아웃 1건 — results 는 relay 원문, error 는 그 사용자 relay 거부/실패. */
  export interface AdminAccountFanout { dmaUserId: string; results: AdminServerResult[]; error: { code: string; message: string } | null }
  export interface AdminAccountSaveResponse { ok: true; fanout: AdminAccountFanout[] }

기존(바꾸지 않음): AdminAccountInput · AdminDmaInput · AdminPutAccountBody · AdminServerResult · normalizeAccountNo · isValidAccountNoInput (packages/shared/src/admin.ts).
relay client(server/src/services/relay-admin-client.ts): putAccount(dmaUserId, body: AdminPutAccountBody, adminEmail) → RelayAdminResponse<AdminCommandResponse>.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 계좌 마스터 계약 — dma_accounts 표 · 멱등 백필 · RPC 4종 + Express /api/admin/accounts + 연결 시 마스터 검사</name>
  <files>supabase/migrations/20261106300000_dma_accounts_master.sql, supabase/tests/fixtures/261106_pre_accounts_master.sql, supabase/tests/dma_accounts_master.test.sql, packages/shared/src/admin.ts, server/src/schemas/admin.ts, server/src/routes/admin-accounts.ts, server/src/routes/admin.ts, server/src/app.ts, server/tests/routes/admin-accounts.test.ts, server/tests/routes/admin-dma.test.ts, server/tests/routes/admin.test.ts</files>
  <precondition>로컬 docker 에 이미지 public.ecr.aws/supabase/postgres:17.6.1.104 가 있다(러너는 pull 하지 않는다).</precondition>
  <behavior>
    - pgTAP 백필(D-05): 픽스처의 연결 행 4개(KB 계좌 A 를 u1 · u2 가 이름 · 지점 · 트레이더를 다르게 · updated_at 다르게 보유, KB 계좌 B, 교보 계좌 C)→ 마스터 3행, A 는 updated_at 최신 행 값. 마이그레이션 두 번 적용 뒤에도 3행.
    - pgTAP 트리거 · FK: 마스터에 없는 계좌로 연결 행을 넣으면 마스터가 그 값으로 자동 생성 · 연결 있는 마스터 직접 DELETE 는 23503.
    - pgTAP RPC: admin_accounts_raw 모양(accounts[] 키 · users[].emails · servers[].state · 연결 0 계좌 users []) · create 정상/중복 ACCOUNT_EXISTS/KB 길이 위반 23514 · update 가 마스터+모든 연결 행 동시 갱신하고 links 에 active 서버만(removing-only 링크는 servers []) · 없는 계좌 NO_SUCH_ACCOUNT · delete 연결 있으면 ACCOUNT_IN_USE · 연결 0 이면 삭제 · 4 RPC 모두 anon/authenticated EXECUTE 없음 · dma_accounts 표 anon/authenticated 권한 없음 · RLS on.
    - supertest GET /api/admin/accounts: RPC admin_accounts_raw 1회 · 그대로 응답 · 역할 조회는 관문 1회(adminRouter 가 한 번 더 하지 않음) · trader 403.
    - POST /accounts: 계좌번호 정규화(" 00123" → "123")해 RPC 로 · 교보 지점/트레이더는 빈 값으로 · KB 길이 위반 400 · RPC ACCOUNT_EXISTS → 409 ACCOUNT_EXISTS · relay 호출 0.
    - PUT /accounts/:broker/:accountNo: 링크 2명(active 서버 있음) + removing-only 1명 → relay putAccount 2회(각 링크 priority · active 서버 그대로 · 계좌 값 = 저장한 값 · orderEndpoint 없음), 응답 fanout 2건. 한 사용자 relay 409/502 → 200 유지 · 그 항목 error {code, message} · 다른 항목 results. 링크 0 → relay 0. relay 클라이언트 없음 + 링크 있음 → 각 항목 error RELAY_UNAVAILABLE(마스터 저장은 됨). NO_SUCH_ACCOUNT → 404.
    - DELETE /accounts/:broker/:accountNo: ACCOUNT_IN_USE → 409 같은 코드 · 23503 도 409 ACCOUNT_IN_USE · NO_SUCH_ACCOUNT → 404 · 성공 {ok:true}.
    - 연결 경로: POST /users(dma) · POST /users/:email/dma · PUT /dma-users/:dma/accounts 가 마스터 없음 → 409 ACCOUNT_NOT_REGISTERED 이고 relay 호출 0 · app_users upsert 0(POST /users). 마스터 있음 → relay 바디의 account.name/branchNo/traderId 가 마스터 값(웹 값과 달라도) · accountNo 정규화값 · priority 는 웹 값.
  </behavior>
  <action>
① 마이그레이션 `supabase/migrations/20261106300000_dma_accounts_master.sql` (머리 주석에 결정 근거 D-03 · D-05 · D-08 · 정합 규칙 · 멱등 · 되돌리기 순서 · 하지 않는 것 — 기존 dma 마이그레이션 머리 꼴). BEGIN/COMMIT 한 덩이:
  - 표 `public.dma_accounts`(broker text CHECK IN ('KB','KYOBO') · account_no text CHECK (<> '' AND length ≤ 12) · name/branch_no/trader_id text NOT NULL DEFAULT '' · created_at/updated_at timestamptz NOT NULL DEFAULT now() · PRIMARY KEY (broker, account_no) · `dma_user_accounts` 와 같은 KB/교보 CHECK 2개)를 CREATE TABLE IF NOT EXISTS. ENABLE RLS · REVOKE ALL FROM PUBLIC · REVOKE ALL FROM anon, authenticated · GRANT SELECT, INSERT, UPDATE, DELETE TO service_role. 정책(POLICY) 없음(per 정합 규칙 · 어드민 전용).
  - 백필(per D-05): `dma_user_accounts` 에서 DISTINCT ON (broker, account_no) · ORDER BY broker, account_no, updated_at DESC, dma_user_id 로 한 행씩 골라 INSERT … ON CONFLICT (broker, account_no) DO NOTHING(마스터 updated_at = 고른 행 updated_at). 연결 행 값은 건드리지 않는다(assumption_delta 부채 메모).
  - 트리거 함수 `public.dma_user_accounts_ensure_master()`(plpgsql · SET search_path = public, pg_temp · SECURITY DEFINER 아님): NEW 의 broker/account_no/name/branch_no/trader_id 로 마스터 INSERT … ON CONFLICT DO NOTHING 후 RETURN NEW. REVOKE EXECUTE FROM PUBLIC 및 anon, authenticated. DROP TRIGGER IF EXISTS 후 `trg_dma_user_accounts_ensure_master` BEFORE INSERT ON dma_user_accounts FOR EACH ROW. 주석: 웹 연결 경로의 게이트는 Express 409 이고, 이 트리거는 Express 밖 writer(배포 창의 옛 server · adopt RPC · 테스트 픽스처)가 만든 연결도 목록에서 빠지지 않게 하는 그물.
  - CREATE INDEX IF NOT EXISTS `ix_dma_user_accounts_broker_account` ON dma_user_accounts (broker, account_no) · FK `fk_dma_user_accounts_master` (broker, account_no) REFERENCES dma_accounts (broker, account_no) ON DELETE RESTRICT 를 pg_constraint 에 없을 때만 DO 블록으로 추가(재적용 멱등).
  - RPC 4종 — 전부 SECURITY DEFINER · SET search_path = public, pg_temp · 업무 오류 P0001 MESSAGE 코드 · REVOKE EXECUTE … FROM PUBLIC · REVOKE … FROM anon, authenticated · GRANT EXECUTE … TO service_role:
    (a) `admin_accounts_raw()` STABLE RETURNS jsonb = {"accounts": [...]} — 키는 위 interfaces 의 camelCase 그대로, 정렬 broker, account_no / users 는 dma_user_id / emails 는 email / servers 는 dma_servers.sort_order, key. 모든 배열 coalesce '[]'.
    (b) `dma_admin_create_account(p_account jsonb)` RETURNS void — broker · accountNo · name · branchNo · traderId 로 INSERT, 이미 있으면 'ACCOUNT_EXISTS'. CHECK 위반은 23514 그대로.
    (c) `dma_admin_update_account(p_broker text, p_account_no text, p_name text, p_branch_no text, p_trader_id text)` RETURNS jsonb — 마스터 FOR UPDATE(없으면 'NO_SUCH_ACCOUNT') → 마스터 UPDATE(updated_at now()) → 같은 (broker, account_no) 의 모든 dma_user_accounts 행 name/branch_no/trader_id/updated_at UPDATE(정합 규칙 「마스터 수정 시 연결 행도 같이 갱신」) → {"links": [{dmaUserId, priority, servers: [active server_key …]}]} dmaUserId 순(active 없는 링크도 servers [] 로 포함).
    (d) `dma_admin_delete_account(p_broker text, p_account_no text)` RETURNS void — FOR UPDATE(없으면 'NO_SUCH_ACCOUNT') · 연결 행 있으면 'ACCOUNT_IN_USE' · DELETE.
② 픽스처 `supabase/tests/fixtures/261106_pre_accounts_master.sql`(커밋되는 SQL · 트랜잭션 없음): dma_servers 는 시드 그대로 쓰고, dma_users 2~3명 · app_users(이메일 소문자 · role trader · dma_user_id) · dma_user_accounts 4행(위 behavior 의 A·B·C, A 는 u1 · u2 값 다름 · updated_at 다름) · dma_account_servers(일부 active · u2 의 한 계좌는 removing 만). 픽스처는 마이그레이션 전(--until 20261106200000) 상태에 들어가므로 마스터 표를 참조하지 않는다.
③ pgTAP `supabase/tests/dma_accounts_master.test.sql`: 기존 dma pgTAP 머리 꼴(잠그는 것 · 실행 명령 · BEGIN … ROLLBACK · 단언 설명에 (대상, 기대) 튜플). 실행 명령 = 아래 verify 의 첫 줄. behavior 의 pgTAP 항목 전부.
④ shared `packages/shared/src/admin.ts`: interfaces 의 타입 7개를 Admin 계약 구역에 추가(머리 주석에 quick 261106-lwu D-03 · D-06 · D-08). 기존 타입은 바꾸지 않는다.
⑤ `server/src/schemas/admin.ts`: `AdminAccountCreateSchema`(broker · accountNo isValidAccountNoInput 후 normalizeAccountNo 변환 · name trim ≤40 기본 "" · branchNo/traderId — KB 5/6 superRefine · 교보는 빈 값으로 transform) · `AdminAccountSaveSchema`(name · branchNo · traderId 기본 "" — 증권사별 길이 판정은 경로 broker 를 아는 라우트에서) · `accountMasterParam`(broker enum · accountNo isValid → normalizeAccountNo). 문구는 기존 한국어 고정 문구 재사용(zod 메시지에 입력값을 싣지 않는다). KB 지점/트레이더 판정은 기존 AdminAccountInputSchema 의 superRefine 과 한 함수로 묶어 중복을 없앤다(동작 동일).
⑥ 새 라우터 `server/src/routes/admin-accounts.ts`(`admin-servers.ts` 꼴 · 머리 주석에 라우트 표): `adminAccountsRouter.use("/accounts", requireAuth(), requireAdmin())`. `app.ts` 에서 adminRouter 앞에 `app.use("/api/admin", adminAccountsRouter)`.
  - GET /accounts → rpc admin_accounts_raw 1회, 객체 · accounts 배열 아니면 DbError, 그대로 json.
  - POST /accounts → 스키마 → rpc dma_admin_create_account({ p_account }) → 'ACCOUNT_EXISTS' 409 ACCOUNT_EXISTS 「이미 등록된 계좌예요.」 · 23514 → 400 · 그 밖 DbError → {ok:true} · audit("account-create", broker). relay 를 부르지 않는다(per D-07).
  - PUT /accounts/:broker/:accountNo → 파라미터 · 바디 파싱 · KB 면 5/6 검사(위반 ValidationFailed) · 교보면 지점/트레이더 "" 로 → rpc dma_admin_update_account → 'NO_SUCH_ACCOUNT' 404 NOT_FOUND 「등록되지 않은 계좌예요.」 → links 중 servers 가 1개 이상인 것만 Promise.all 로 relay.putAccount(dma, { account: { broker, accountNo, name, branchNo, traderId, priority: 링크 priority }, servers: 링크 servers }, adminEmail) 을 `relayResults` 로 해석 — throw 된 ApiError 는 그 항목 error {code, message} 로 접고(전체 실패로 만들지 않음 · per D-08) relay 클라이언트가 없으면 각 항목 error RELAY_UNAVAILABLE. 응답 { ok: true, fanout }. audit("account-save", broker, { users: 링크 수, fanout: `${maskDmaUserId}:${server}:${outcome}` 목록 }).
  - DELETE /accounts/:broker/:accountNo → rpc dma_admin_delete_account → 'ACCOUNT_IN_USE' 또는 code 23503 → 409 ACCOUNT_IN_USE 「연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요」 · 'NO_SUCH_ACCOUNT' 404 → {ok:true} · audit.
⑦ `server/src/routes/admin.ts` 연결 시 마스터 검사(정합 규칙): `registeredAccount(supabase, account: AdminAccountInput)` 헬퍼 — `from("dma_accounts").select("broker, account_no, name, branch_no, trader_id").eq("broker", …).eq("account_no", normalizeAccountNo(accountNo)).maybeSingle()` · 오류 DbError · 없으면 409 ACCOUNT_NOT_REGISTERED 「「계좌」 메뉴에 등록되지 않은 계좌예요 — 먼저 등록하세요.」 · 있으면 { ...account, accountNo: 정규화값, name/branchNo/traderId: 마스터 값 }. 적용: POST /users(body.dma — DMA_LINKED 검사 뒤 · app_users upsert **앞**) · POST /users/:email/dma(DMA_LINKED 검사 뒤 · relay 앞) · PUT /dma-users/:dma/accounts(relay 앞 · orderEndpoint 는 그대로). 머리 라우트 표 주석에 한 줄 추가. DELETE · budget · fee · order-server 경로는 건드리지 않는다(per D-04).
⑧ 테스트: 새 `server/tests/routes/admin-accounts.test.ts`(admin-servers.test.ts 꼴 · behavior 의 supertest 항목). `admin-dma.test.ts` · `admin.test.ts` 의 makeApp 기본 `tables` 에 그 파일이 쓰는 계좌들의 `dma_accounts` 행을 넣어 기존 단언을 살리고, 연결 경로 3개의 409 ACCOUNT_NOT_REGISTERED · 마스터 값 덮어쓰기 케이스를 admin-dma.test.ts 에 추가. 기존 테스트의 단언 의미는 바꾸지 않는다(fixture 만 보강).
커밋: `feat(quick-261106-lwu): 계좌 마스터 표·백필·RPC + /api/admin/accounts · 연결 시 마스터 검사` — 이 task 경로만 git add.
  </action>
  <verify>
    <automated>bash scripts/verify-dma-orders-price-check.sh --until 20261106200000 --with supabase/tests/fixtures/261106_pre_accounts_master.sql --with supabase/migrations/20261106300000_dma_accounts_master.sql --with supabase/migrations/20261106300000_dma_accounts_master.sql --test supabase/tests/dma_accounts_master.test.sql | tail -5</automated>
    <automated>for t in dma_registry_intent dma_admin_intent dma_admin_create_guard dma_admin_reflect dma_account_order_server dma_pnl_daily; do bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/$t.test.sql > /dev/null || { echo "FAIL $t"; exit 1; }; done; echo ALL_OK</automated>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-accounts.test.ts tests/routes/admin-dma.test.ts tests/routes/admin.test.ts tests/routes/admin-servers.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server typecheck</automated>
  </verify>
  <done>새 pgTAP 전부 ok(백필 3행 · 멱등 · 트리거 · FK · RPC 4종 · 권한) · 기존 dma pgTAP 6개 회귀 없음(FK · 트리거가 기존 픽스처 · adopt 를 깨지 않음) · server admin 라우트 테스트 green · typecheck 통과 · relay/ 아래 변경 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: /admin/accounts 화면 — 목록 · 등록 시트 · 수정/삭제 시트 + 사이드바 순서</name>
  <files>webapp/src/lib/admin-api.ts, webapp/src/app/admin/accounts/page.tsx, webapp/src/components/admin/accounts-client.tsx, webapp/src/components/admin/account-master-sheet.tsx, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/admin/__tests__/accounts-client.test.tsx, webapp/src/components/admin/__tests__/account-master-sheet.test.tsx, webapp/src/components/layout/__tests__/app-sidebar.test.tsx</files>
  <behavior>
    - 목록: 행마다 증권사 배지(KB/교보) · 계좌번호 · 계좌명(빈 값이면 흐린 「이름 없음」) · KB 「지점 {br} · 트레이더 {tr}」/교보 「지점 · 트레이더 해당 없음」 · 쓰는 사용자 DMA id 칩들 또는 점선 「연결 없음」 · ›. 머리 「계좌」 · 부제 · 「+ 계좌」. 「계좌 N」 개수 + 세그먼트 「전체 N · KB n · 교보 n」 으로 거르기. 하단 안내 한 줄. 로딩 스켈레톤 · 403 한 줄 · 그 밖 오류 다시 시도.
    - 등록 시트: 증권사 세그먼트 · 계좌번호 · 계좌명(선택) · KB 일 때만 지점/트레이더 · 교보로 바꾸면 두 칸 사라짐. 형식 미완이면 「등록」 비활성. 이미 목록에 있는 (증권사, 정규화 번호) 또는 서버 409 ACCOUNT_EXISTS → 계좌번호 칸 아래 「이미 등록된 계좌예요」. 성공 → 시트 닫힘 · 재조회 · createAdminAccount 만 호출(다른 relay 경로 호출 없음).
    - 수정 시트: 증권사 · 계좌번호 읽기 전용 · 바뀐 값 있을 때만 「저장」 활성 · 저장 → saveAdminAccount 1회 → 쓰는 사용자 줄마다 결과 칩(ResultChips) · BUSY 줄 · 사용자 error 는 그 줄 아래 「{dmaUserId} 반영 실패 · {message}」 · 재조회.
    - 삭제: 쓰는 사용자 ≥1 → 삭제 버튼 disabled + 잠금 문구 · window.confirm 미사용. 0명 → 「삭제」 → 시트 안 확인 박스(취소/삭제) → deleteAdminAccount → 닫힘 · 재조회. 서버 409 ACCOUNT_IN_USE 는 확인 박스 아래 message 한 줄.
    - 사이드바(admin · trading ready): 링크 순서 배열 끝이 「… AI 애널리스트 · My page · Admin · 사용자 · 계좌 · 서버 · 발사 · 매매손익」 · 「계좌」 href /admin/accounts · data-sidebar-item admin-accounts.
  </behavior>
  <action>
① `webapp/src/lib/admin-api.ts`(머리 주석 ② 경로 표에 한 줄): fetchAdminAccounts() GET /api/admin/accounts · createAdminAccount(body: AdminAccountCreateBody) POST · saveAdminAccount(broker, accountNo, body: AdminAccountSaveBody) PUT `/api/admin/accounts/${enc(broker)}/${enc(accountNo)}` with `timeoutMs: RELAY_TIMEOUT_MS`(팬아웃이 relay 를 부른다) → AdminAccountSaveResponse · deleteAdminAccount(broker, accountNo) DELETE → {ok:true}. 타입은 shared 것.
② `webapp/src/app/admin/accounts/page.tsx` — `admin/servers/page.tsx` 꼴(AppShell + AppSidebar + AccountsClient · 머리 주석에 quick 261106-lwu D-01).
③ `webapp/src/components/admin/accounts-client.tsx` — `users-client.tsx` 구조 그대로(per D-06): LoadState · seq 가드 · `AdminPanelPage panelOpen` · `PageHeader`(제목 「계좌」 · 부제 「관리 계좌 등록 · 수정 · 삭제 — 사용자에게 연결은 「사용자」 메뉴에서」 · 「+ 계좌」 secondary 버튼) · 섹션 제목 「계좌」 + 개수 + `ToggleGroup`(ADMIN_SEGMENT_ROOT/ITEM) 「전체 N」「KB n」「교보 n」 · `CARD` 목록 · `ROW_DIVIDER` · 행 버튼(user-row.tsx 의 ROW_BOX/ROW_HOVER 결) · 하단 안내 「연결 없음 계좌는 어느 서버에도 올라가 있지 않다 — 삭제할 수 있다.」. 선택 키 = `${broker}|${accountNo}` · 생성/편집 시트는 한 번에 하나(users-client 와 같은 규칙) · 쓰기 성공 뒤 load() · 재조회 뒤 같은 키의 최신 행을 시트에 · 사라지면 시트 닫힘. 문구는 `ADMIN_ACCOUNTS_TEXT` 상수로 export(테스트가 읽는다).
④ `webapp/src/components/admin/account-master-sheet.tsx` — `AdminSheet` 하나에 mode "create" | "edit"(per D-07 · D-08), 목업 ②③ 문구 그대로:
  - create: 제목 「계좌 등록」 · 증권사 세그먼트(KB/교보) · 「계좌번호 · 등록 뒤 못 바꿈」 · 「계좌명 · 선택」(placeholder 「예: 주식」 · maxLength 40) · KB 면 「지점 · 5자」「트레이더 · 6자」 · 안내 「교보 계좌는 지점 · 트레이더 칸이 없다. 등록만으로는 서버에 보내지 않는다 — 「사용자」 에서 연결하면 그 사용자의 서버에 올라간다.」 · 하단 취소/등록. 검증은 shared isValidAccountNoInput · KB 5/6. 중복은 부모가 준 목록에서 normalizeAccountNo 비교로 먼저 막고 서버 409 ACCOUNT_EXISTS 도 같은 자리.
  - edit: 제목 = 배지 · 계좌번호 · 계좌명 · 증권사/계좌번호 읽기 전용 + 「증권사 · 계좌번호는 못 바꾼다 — 삭제 뒤 다시 등록.」 · 계좌명 · (KB) 지점 · 트레이더 입력 · 쓰는 사용자 ≥1 이면 「저장하면 쓰는 사용자 모두의 서버 설정에 함께 반영돼요.」 · 취소/저장. 「쓰는 사용자 N명 · 등록 서버」 섹션 — 사용자 줄 = DMA id · 이메일들 · 서버 키(저장 전 · removing 은 흐림) → 저장 뒤 그 사용자 fanout.results 를 `ResultChips` 로, 실패 칩은 `BusyLines`(서버 키 자리에 `${dmaUserId} · ${serverKey}`), error 는 줄 아래 한 줄. 0명이면 「쓰는 사용자 0명」 + 「어느 사용자에게도 연결되지 않은 계좌 — 서버에 올라가 있지 않다.」. 삭제 영역: 연결 있으면 비활성 「삭제」 + 「연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요」, 없으면 「삭제」 → 시트 안 확인 박스 「{KB|교보} {계좌번호} {계좌명} 계좌를 삭제할까요? 목록에서 사라지고 되돌릴 수 없어요.」 취소/삭제(브라우저 confirm 금지 · per D-08). 저장/삭제 비행 중 버튼 잠금. 결과 칩 문구 · 색은 account-editor 의 것을 import 해 재사용하고 새 칩 컴포넌트를 만들지 않는다.
⑤ `webapp/src/components/layout/app-sidebar.tsx`(per D-01 · D-02): `NAV_ADMIN_ACCOUNTS = { href: "/admin/accounts", label: "계좌" }` 를 사용자 다음에 정의 · Admin 하위 목록에 사용자 다음 `<li>`(item "admin-accounts") · My page `<li>` 블록을 Admin 블록 **앞**으로 옮김(노출 조건 tradingVisible 그대로) · 머리 주석(L41~42 · L191~196 · L744 의 「My page 앞」)을 「My page 뒤」 순서로 고침. 모바일 탭바는 건드리지 않는다.
⑥ 테스트: 새 accounts-client.test.tsx · account-master-sheet.test.tsx(behavior 항목 · `vi.mock("@/lib/admin-api")` 꼴은 user-sheet.test.tsx 참고) · app-sidebar.test.tsx 의 Admin describe 제목 · 순서 배열 · 「계좌」 링크 단언 갱신(다른 describe 의 순서 배열은 Admin 이 없으므로 그대로).
커밋: `feat(quick-261106-lwu): 어드민 「계좌」 화면(목록·등록·수정 팬아웃·삭제) + 사이드바 My page↔Admin 순서` — 이 task 경로만 git add.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/accounts-client.test.tsx src/components/admin/__tests__/account-master-sheet.test.tsx src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>세 테스트 파일 green · webapp typecheck 통과 · /admin/accounts 페이지 파일 존재 · 사이드바 순서가 My page → Admin(사용자 · 계좌 · 서버 · 발사 · 매매손익).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 사용자 시트 · 사용자 만들기 — 등록 계좌 고르기(A) · 카드 「연결 해제」 · 계좌명 편집 제거</name>
  <files>webapp/src/components/admin/account-picker.tsx, webapp/src/components/admin/account-editor.tsx, webapp/src/components/admin/dma-connect-fields.tsx, webapp/src/components/admin/user-sheet.tsx, webapp/src/components/admin/user-create-sheet.tsx, webapp/src/components/admin/users-client.tsx, webapp/src/components/admin/__tests__/account-picker.test.tsx, webapp/src/components/admin/__tests__/account-editor.test.tsx, webapp/src/components/admin/__tests__/dma-connect-fields.test.tsx, webapp/src/components/admin/__tests__/user-sheet.test.tsx, webapp/src/components/admin/__tests__/user-create-sheet.test.tsx, webapp/src/components/admin/__tests__/users-client.test.tsx</files>
  <behavior>
    - matchesAccountQuery: 빈 검색 → 참 · 계좌번호 부분 일치 · 계좌명 부분 일치(대소문자 무시) · 둘 다 아니면 거짓.
    - AccountPicker: 후보마다 라디오 · 배지 · 계좌번호 · 계좌명/「이름 없음」 · 오른쪽 쓰는 사용자 DMA id 를 「 · 」 로 이은 글자 또는 「연결 없음」 · 검색으로 좁혀짐 · 제외 판정(isExcluded)에 걸린 계좌는 안 보임 · 후보 0 이면 「연결할 수 있는 계좌가 없어요」 · accounts null 이면 「계좌 목록을 불러오지 못했어요」 · 늘 「목록에 없으면 「계좌」 에서 등록」 링크(/admin/accounts).
    - AccountEditor: 「+ 계좌 연결」 → 피커 + 고른 계좌 증권사의 등록 서버 체크(기본 체크 없음 · 꺼진 서버 보이되 disabled) + 취소/연결 · 이미 이 사용자 의도에 있는 계좌는 후보에서 빠짐 · 계좌와 서버 1개 이상 골라야 「연결」 활성 · 연결 → putDmaAccount(dmaUserId, { account: 마스터 broker/accountNo/name/branchNo/traderId + nextPriority, servers: 레지스트리 순 }) 1회 → onResults/onChanged/닫힘 · 409 ACCOUNT_NOT_REGISTERED 등은 message 한 줄.
    - 카드: 버튼 글자 「연결 해제」(접근 이름 「{broker} {accountNo} 연결 해제」 · 동작 = 기존 DELETE · 마지막 계좌는 onRemoveLast 그대로) · KB 편집 모드에 계좌명 입력칸 없음(첫 포커스 IP) · IP/MAC 저장 바디는 기존과 같음 · 교보 카드에 「편집」 버튼 없음 · 메타 줄에 「계좌명 · 지점 · 트레이더는 「계좌」 메뉴에서」 · 하단 안내가 목업 ④ 문장.
    - DmaConnectFields: 계좌번호 · 지점 · 트레이더 · 증권사 입력칸 대신 「첫 계좌」 피커(버튼 없음 · 마스터 전체) · 고르면 value.account 설정 + 서버 체크 초기화 · 등록 서버는 고른 계좌 증권사 서버만(꺼진 서버 disabled) · validateDmaConnect 는 계좌 미선택이면 invalid · toDmaInput 의 account = 고른 마스터 값(priority 0) · 서버 레지스트리 순.
    - UsersClient: 마운트 시 fetchAdminUsers 와 fetchAdminAccounts 를 병렬로 · accounts 실패해도 사용자 목록은 뜸(피커만 실패 문구) · 쓰기 뒤 재조회는 둘 다.
  </behavior>
  <action>
① 새 `webapp/src/components/admin/account-picker.tsx`(per D-09 · D-10 · 목업 ④⑤ 방식 A): export `matchesAccountQuery(account, query)` 순수 함수 · `ACCOUNT_PICKER_TEXT` 문구 상수 · `AccountPicker` 컴포넌트 props = { accounts: readonly AdminAccountMaster[] | null; selectedKey: string | null; onSelect(account); isExcluded?(account) → boolean; title(「계좌 연결」 또는 「첫 계좌」); idPrefix; disabled? }. 검색칸 placeholder 「계좌번호 · 계좌명 검색」 · 목록은 `role="radiogroup"` + 네이티브 `input type="radio"`(ui 에 radio-group 없음 · 새 의존성 금지) · 배지/이름 없음 모양은 account-editor 의 BROKER_BADGE 결을 따른다(필요하면 상수만 export 해 재사용) · 하단 Next `Link` 「목록에 없으면 「계좌」 에서 등록」 → /admin/accounts. 서버 체크 · 버튼은 부모 몫(피커는 계좌 고르기만). 순환 import 를 만들지 않도록 제외 판정은 부모가 predicate 로 준다.
② `account-editor.tsx` — 필요한 곳만(D-04 동작 · 쓰기 경로 그대로):
  - `AccountEditorProps` 에 `masterAccounts: readonly AdminAccountMaster[] | null` 추가.
  - 「계좌 추가」 직접 입력 폼 컴포넌트를 `AccountLinkForm` 으로 바꾼다: AccountPicker(isExcluded = 지금 `editable` 키 집합에 accountKeyOf 로 있는 계좌) + 고른 계좌 증권사의 레지스트리 서버 체크(enabled=false 는 disabled · 기본 체크 없음 · 계좌를 바꾸면 체크 초기화) + 취소/「연결」. 저장은 기존과 같은 `useFieldSave` + `putDmaAccount` · retainValue false · onSuccess 에서 onResults/onChanged/onClose · 바디 계좌 값은 마스터 값 · priority = nextPriority. 직접 입력용 상태 · 검증 문구(accountNoInvalid · branchInvalid · traderInvalid · duplicate)는 더 쓰는 곳이 없으면 지운다.
  - `ACCOUNT_EDITOR_TEXT`: remove 「연결 해제」 · add 「+ 계좌 연결」 · submit 「연결」 · lastAccountNote/하단 안내 = 목업 ④ 문장 「「연결 해제」 는 이 사용자의 서버에서만 계좌를 뺀다 — 계좌는 「계좌」 목록에 남는다. 마지막 계좌 해제는 지금처럼 사용자 삭제로 이어진다.」 · 새 `masterHint` 「계좌명 · 지점 · 트레이더는 「계좌」 메뉴에서」.
  - 편집 모드: 계좌명 라벨 · 입력칸 · `EditFields.name` · `nameChanged` 를 걷어내고 `editSaveBodyOf` 는 IP/MAC 변경(또는 불일치 맞추기)일 때만 바디를 만든다(계좌 값은 `accountInputOf(account)`). `confirmedName` 은 더 필요 없으면 토글 바디를 `accountInputOf(account)` 로. 첫 포커스는 IP 칸. 교보 카드(broker KYOBO)는 「편집」 버튼을 그리지 않는다(per D-09 — 편집할 것이 없다).
  - 편집 가능한 카드의 지점 · 트레이더 메타 줄 끝에 「 · {masterHint}」(87 전용 줄 ServerOnlyAccountRow 에는 붙이지 않는다).
  - 그 밖(등록 서버 토글 · 주문 서버 · IP/MAC · 예수금 · 수수료 · 결과 칩 · 공유 계좌 안내)은 손대지 않는다.
③ `dma-connect-fields.tsx`(per D-10): `DmaConnectValue` 의 broker · accountNo · branchNo · traderId 를 `account: AdminAccountMaster | null` 하나로 바꾸고 `DmaConnectField` 에서 accountNo/branchNo/traderId 를 빼고 "account" 를 넣는다(clearChangedErrors 는 계좌 키 비교). 첫 계좌 영역 = AccountPicker(title 「첫 계좌」 · 제외 없음 · 버튼 없음) · 등록 서버 체크는 `value.account?.broker` 의 서버만(미선택이면 서버 칸 대신 짧은 안내) · validateDmaConnect 는 account 필수 + 서버 증권사 일치 · enabled · toDmaInput 은 AdminDmaInput 모양 그대로 account = { broker, accountNo, name, branchNo, traderId, priority: 0 }. Props 에 `accounts` 추가. DMA id · 비밀번호 칸 · 오류 처리는 그대로.
④ `user-sheet.tsx` · `user-create-sheet.tsx`: props 로 `accounts: readonly AdminAccountMaster[] | null` 를 받아 AccountEditor(`masterAccounts`) · DmaConnect/DmaConnectFields(`accounts`) 로 내려 보낸다. 머리 주석의 「제거」 언급을 「연결 해제」 로.
⑤ `users-client.tsx`: load() 가 fetchAdminUsers 와 fetchAdminAccounts(실패는 null 로 접음)를 Promise.all 로 읽어 ready 상태에 `accounts` 를 함께 둔다 · UserSheet/UserCreateSheet 에 전달. seq 가드 · 재조회 실패 시 이전 목록 유지 규칙 그대로.
⑥ 테스트: 새 account-picker.test.tsx(behavior 의 순수 함수 · 렌더 항목) · account-editor.test.tsx(추가 폼 테스트를 연결 폼으로 교체 · 「제거」 단언을 「연결 해제」 로 · 계좌명 편집 테스트를 「칸 없음」 단언으로 · 교보 편집 없음 · 메타 힌트) · dma-connect-fields.test.tsx · user-create-sheet.test.tsx · user-sheet.test.tsx(admin-api mock 에 fetchAdminAccounts 추가 · 피커로 첫 계좌 고르는 흐름) · users-client.test.tsx(병렬 로드 · accounts 실패에도 목록). 기존 테스트 중 바뀐 결정과 무관한 단언은 그대로 둔다.
커밋: `feat(quick-261106-lwu): 사용자 시트·사용자 만들기 계좌 고르기(A) · 카드 「연결 해제」 · 계좌명 편집은 「계좌」 메뉴로` — 이 task 경로만 git add.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/admin --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>src/components/admin 전체 테스트 green(새 피커 테스트 포함) · webapp typecheck 통과 · 직접 입력 계좌 추가 폼이 코드에서 사라지고 피커 연결만 남음 · AccountEditor 의 서버 토글 · 주문 서버 · IP/MAC · 예수금 · 수수료 테스트가 수정 없이(또는 문구만) 통과.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: [BLOCKING] 배포 — 메인 세션이 DB → server → git push 순서로</name>
  <action>메인 세션(오케스트레이터)이 DB 적용 → server 배포 → git push 를 이 순서로 실행한다. 실행 에이전트는 여기서 멈추고 배포 명령을 실행하지 않는다(서브에이전트 배포는 분류기 차단 · push 자체가 webapp 프로덕션 배포).</action>
  <instructions>
    실행 에이전트가 끝낸 것: Task 1~3 커밋(마이그레이션 20261106300000 · server 라우트 · webapp 화면 · 테스트 green). 메인 세션이 할 것:
    1. `git status -sb` 로 다른 세션 미커밋 변경(server/src/services/specialists/** 등)을 확인. `scripts/deploy-server.sh` 는 작업 트리로 docker build 하므로 남의 미커밋 변경이 섞이지 않게 이 작업 커밋 HEAD 의 깨끗한 worktree 에서 배포한다. 배포 전 라이브 server 이미지(APP_VERSION)가 내 HEAD 의 조상인지 확인.
    2. `supabase db push --linked --yes` — 20261106300000_dma_accounts_master 적용(백필 · 트리거 · FK · RPC). 옛 server 는 새 DB 에서도 그대로 동작한다(트리거가 새 연결을 마스터에 넣는다).
    3. server 배포(`scripts/deploy-server.sh` — 라이브 Cloud Run env 에서 GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS 추출). relay 는 변경 없음 → 배포 없음.
    4. `git push` (webapp Vercel 배포) — 2·3 이 끝난 뒤에만.
  </instructions>
  <verification>GET /api/admin/accounts(어드민) 개수 = dma_user_accounts 의 서로 다른 (broker, account_no) 수 · 각 계좌 「쓰는 사용자」 가 사용자 시트와 일치 · 웹 /admin/accounts 와 사용자 시트 「+ 계좌 연결」 육안 확인 · 사이드바 My page 가 Admin 위.</verification>
  <resume-signal>「배포 완료」 또는 실패 단계 · 로그를 알려 주세요</resume-signal>
</task>

</tasks>

<source_audit>
| 출처 | 항목 | 담당 |
|------|------|------|
| GOAL | 계좌 메뉴 등록/수정/삭제 · 기존 계좌 백필 · 사용자 시트에서 골라 연결 · 사이드바 교체 | Task 1~3 |
| CONTEXT | D-01 새 메뉴 · 순서 · 관문 | Task 2(화면 · 사이드바) · Task 1(경로 한정 requireAdmin) |
| CONTEXT | D-02 My page ↔ Admin | Task 2 ⑤ |
| CONTEXT | D-03 마스터 값 · 번호 고정 · 정규화 한 벌 | Task 1 ①⑤ · Task 2 ④ |
| CONTEXT | D-04 연결별 설정 그대로 | Task 3 ②(손대지 않음) · Task 1 ⑦(budget/fee/order-server 무변경) |
| CONTEXT | D-05 멱등 백필 · 최신 값 | Task 1 ①②③ |
| CONTEXT | D-06 목록 화면 | Task 2 ③ |
| CONTEXT | D-07 등록 시트 · 서버 전송 없음 · 409 | Task 1 ⑥ · Task 2 ④ |
| CONTEXT | D-08 수정 팬아웃 · 결과 칩 · 삭제 409 · 시트 안 확인 | Task 1 ①(c)(d) ⑥ · Task 2 ④ |
| CONTEXT | D-09 피커 A · 연결 해제 · 계좌명 칸 제거 · 교보 편집 숨김 · 메타 안내 | Task 3 ①② |
| CONTEXT | D-10 첫 계좌 피커 · 바디 모양 유지 | Task 3 ③ |
| CONTEXT | 정합 규칙(마스터만 연결 409 · 마스터 값 정본 · 연결 행 값 열 유지 · relay 0 · RLS/REVOKE) | Task 1 ①⑦ · assumption_delta_decision |
| REQ / RESEARCH | 없음(quick · 리서치 생략) | — |
범위 밖(CONTEXT): IP/MAC · 예수금 마스터 이동 · 계좌 메뉴에서 연결/해제 · 계좌번호 변경 · /admin/pnl 계좌명 출처 — 어떤 task 도 다루지 않는다.
</source_audit>

<verification>
- pgTAP: 새 파일(픽스처 + 마이그레이션 2회 적용) green · 기존 dma pgTAP 6개 green.
- server: `pnpm --filter @gh-radar/server exec vitest run tests/routes --maxWorkers=2` green · `pnpm --filter @gh-radar/server typecheck`.
- webapp: `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin src/components/layout --maxWorkers=2` green · `pnpm --filter @gh-radar/webapp run typecheck`.
- relay 무변경: `git diff --stat <작업 시작 커밋>..HEAD -- relay/` 출력 없음.
- 배포 명령은 실행하지 않았다 — SUMMARY 에 Task 4 순서(db push → server → git push)를 그대로 적는다. Playwright e2e 는 추가 · 실행하지 않는다.
</verification>

<success_criteria>
- 관리자가 /admin/accounts 에서 백필된 기존 계좌를 보고, 새 계좌를 등록(서버 전송 없음) · 수정(연결된 모든 사용자 서버에 반영 + 결과 칩) · 연결 0일 때만 삭제할 수 있다.
- 사용자 시트 · 사용자 만들기에서 계좌는 등록 목록에서 고르기만 하고, 마스터에 없는 계좌는 서버가 409 로 거부하며, 연결 값은 늘 마스터 값이다.
- 카드의 연결별 설정 동작(등록 서버 · 주문 서버 · IP/MAC · 예수금 · 수수료)과 relay 코드는 그대로다.
- 사이드바는 … 분석 · My page · Admin(사용자 · 계좌 · 서버 · 발사 · 매매손익).
</success_criteria>

<output>
Create `.planning/quick/261106-lwu-admin-accounts/261106-lwu-SUMMARY.md` when done (Task 4 배포 순서 · 메인 세션 할 일 포함).
</output>
