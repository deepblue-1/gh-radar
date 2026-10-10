---
phase: 29-dma-multi-server-admin
reviewed: 2026-10-10T06:07:19Z
depth: standard
files_reviewed: 173
files_reviewed_list:
  - docs/inbox/from-gh-trade/261006-admin-users-role2-44-86-87.md
  - infra/relay/README.md
  - ops/alert-kyobo-observer-down.yaml
  - packages/shared/src/__tests__/admin-overview.test.ts
  - packages/shared/src/__tests__/admin.test.ts
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/access/app-access.ts
  - relay/src/admin/admin-api.ts
  - relay/src/admin/admin-conn.ts
  - relay/src/admin/dispatcher.ts
  - relay/src/admin/intent-store.ts
  - relay/src/admin/planner.ts
  - relay/src/admin/session-sync.ts
  - relay/src/admin/snapshot-sink.ts
  - relay/src/admin/types.ts
  - relay/src/config.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/dma/session-manager.ts
  - relay/src/dma/session.ts
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma.ts
  - relay/src/generated/stock-dma/admin-account.ts
  - relay/src/generated/stock-dma/admin-command-req.ts
  - relay/src/generated/stock-dma/admin-command-resp.ts
  - relay/src/generated/stock-dma/admin-user.ts
  - relay/src/generated/stock-dma/admin-users-snapshot.ts
  - relay/src/generated/stock-dma/envelope.ts
  - relay/src/generated/stock-dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/access.ts
  - relay/src/journal/observer.ts
  - relay/src/journal/types.ts
  - relay/src/order/order-api.ts
  - relay/src/quote/quote-switch.ts
  - relay/src/registry/order-journal.ts
  - relay/src/registry/pipelines.ts
  - relay/src/registry/registry.ts
  - relay/src/store/credentials.ts
  - relay/src/store/dma-users-migrate.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/tests/account-declare.test.ts
  - relay/tests/admin-api.test.ts
  - relay/tests/admin-conn.test.ts
  - relay/tests/admin-dispatcher.test.ts
  - relay/tests/admin-planner.test.ts
  - relay/tests/admin-session-sync.test.ts
  - relay/tests/admin-snapshot-sink.test.ts
  - relay/tests/app-access.test.ts
  - relay/tests/config-quote.test.ts
  - relay/tests/config-registry.test.ts
  - relay/tests/config-upstreams.test.ts
  - relay/tests/credentials.test.ts
  - relay/tests/dma-users-migrate.test.ts
  - relay/tests/fake-gateway.test.ts
  - relay/tests/fanout-access.test.ts
  - relay/tests/fanout-multi-session.test.ts
  - relay/tests/fanout.test.ts
  - relay/tests/helpers/admin-db-fake.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/helpers/supabase-stub.ts
  - relay/tests/hub-multi-session.test.ts
  - relay/tests/hub.test.ts
  - relay/tests/journal-boot.test.ts
  - relay/tests/journal-observer.test.ts
  - relay/tests/order-api.test.ts
  - relay/tests/order-server-notice.test.ts
  - relay/tests/pipelines.test.ts
  - relay/tests/quote-switch.test.ts
  - relay/tests/registry.test.ts
  - relay/tests/session-manager.test.ts
  - relay/tests/session-routing.test.ts
  - relay/tests/session.test.ts
  - relay/tests/ws-order.test.ts
  - scripts/deploy-relay.sh
  - scripts/deploy-server.sh
  - scripts/dma-credentials.ts
  - scripts/migrate-dma-users.ts
  - scripts/smoke-relay.sh
  - scripts/smoke-server.sh
  - scripts/verify-dma-orders-price-check.sh
  - server/src/app.ts
  - server/src/config.ts
  - server/src/logger.ts
  - server/src/middleware/require-admin.ts
  - server/src/middleware/require-auth.ts
  - server/src/routes/admin-servers.ts
  - server/src/routes/admin.ts
  - server/src/schemas/admin.ts
  - server/src/server.ts
  - server/src/services/relay-admin-client.ts
  - server/src/types/express.d.ts
  - server/tests/fixtures/admin-supabase.ts
  - server/tests/fixtures/fake-relay-admin.ts
  - server/tests/middleware/require-admin.test.ts
  - server/tests/routes/admin-dma.test.ts
  - server/tests/routes/admin-servers.test.ts
  - server/tests/routes/admin.test.ts
  - server/tests/services/relay-admin-client.test.ts
  - supabase/migrations/20261006200000_app_access.sql
  - supabase/migrations/20261006200100_dma_registry_intent.sql
  - supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql
  - supabase/migrations/20261006200300_dma_admin_reflect.sql
  - supabase/rollback/29-gateway-key-rename-revert.sql
  - supabase/tests/app_access.test.sql
  - supabase/tests/dma_admin_intent.test.sql
  - supabase/tests/dma_admin_reflect.test.sql
  - supabase/tests/dma_gateway_identities.test.sql
  - supabase/tests/dma_journal_apply.test.sql
  - supabase/tests/dma_registry_intent.test.sql
  - supabase/tests/dma_visibility_v2.test.sql
  - supabase/tests/fixtures/29_pre_rename.sql
  - supabase/tests/gateway_key_rename.test.sql
  - supabase/tests/gateway_key_rename_revert.test.sql
  - webapp/SETUP.md
  - webapp/e2e/fixtures/admin.ts
  - webapp/e2e/fixtures/relay.ts
  - webapp/e2e/specs/access-gate.spec.ts
  - webapp/e2e/specs/admin-servers.spec.ts
  - webapp/e2e/specs/admin.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/scripts/seed-test-user.ts
  - webapp/src/app/admin/servers/page.tsx
  - webapp/src/app/admin/users/page.tsx
  - webapp/src/app/auth/callback/route.ts
  - webapp/src/app/pending/page.tsx
  - webapp/src/components/admin/__tests__/account-editor.test.tsx
  - webapp/src/components/admin/__tests__/admin-sheet.test.tsx
  - webapp/src/components/admin/__tests__/dma-connect-fields.test.tsx
  - webapp/src/components/admin/__tests__/server-sheet.test.tsx
  - webapp/src/components/admin/__tests__/servers-client.test.tsx
  - webapp/src/components/admin/__tests__/user-create-sheet.test.tsx
  - webapp/src/components/admin/__tests__/user-sheet.test.tsx
  - webapp/src/components/admin/__tests__/users-client.test.tsx
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/admin/admin-sheet.tsx
  - webapp/src/components/admin/dma-connect-fields.tsx
  - webapp/src/components/admin/password-change.tsx
  - webapp/src/components/admin/pending-section.tsx
  - webapp/src/components/admin/reflect-chip.tsx
  - webapp/src/components/admin/role-segment.tsx
  - webapp/src/components/admin/server-card.tsx
  - webapp/src/components/admin/server-sheet.tsx
  - webapp/src/components/admin/servers-client.tsx
  - webapp/src/components/admin/use-field-save.ts
  - webapp/src/components/admin/user-create-sheet.tsx
  - webapp/src/components/admin/user-row.tsx
  - webapp/src/components/admin/user-sheet.tsx
  - webapp/src/components/admin/users-client.tsx
  - webapp/src/components/auth/pending-card.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/hooks/__tests__/use-app-role.test.tsx
  - webapp/src/hooks/use-app-role.ts
  - webapp/src/lib/__tests__/admin-api.test.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/admin-api.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/supabase/__tests__/access-gate.test.ts
  - webapp/src/lib/supabase/access-gate.ts
  - webapp/src/lib/supabase/middleware.ts
  - webapp/src/lib/use-relay-socket.ts
findings:
  critical: 1
  warning: 7
  info: 3
  total: 11
status: issues_found
---

# Phase 29: Code Review Report

**Reviewed:** 2026-10-10T06:07:19Z
**Depth:** standard
**Files Reviewed:** 173
**Status:** issues_found

## Summary

Phase 29 변경 파일 173개를 standard 깊이로 검토했다. 운영 소스(relay `admin/*` · `access` · `registry` · `quote-switch` · `ws/fanout` · `dma/session*`, Express Admin 라우트 · 스키마 · relay 클라이언트, Supabase 마이그레이션 4개 · 롤백 SQL, webapp Admin 컴포넌트 · middleware · 역할 게이트, 배포 · 이관 스크립트)는 끝까지 읽었다. 테스트는 거짓 통과(skip · only · 빈 단언) 위주로 훑었고, 그런 패턴은 찾지 못했다.

전체 골격(DB = 의도 · 87 = 반영, 서버당 1건 비행 · request_id 상관, 세대 가드, fail-closed 접근 맵, service_role 전용 RPC 권한 3줄)은 일관되고 방어적이다. 그래도 증명 가능한 결함이 남아 있다.

- **[CR-01]** 「+ 사용자」(`POST /api/admin/users`)는 이미 DMA 가 연결된 웹 사용자의 연결을 아무 확인 없이 새 DMA id 로 덮어쓴다. 전용 라우트(`POST /users/:email/dma`)는 같은 경우를 `DMA_LINKED` 로 막는데, 이 라우트에는 그 가드가 없다. 옛 DMA 유저는 서버 users.toml 과 DB 의도에 그대로 남지만, Admin 화면에서는 편집할 수 없는 「서버에만 있음」 행으로만 보인다.
- **동시성 · 경합:** settle 의 「서버 행 전부 삭제」가 갓 들어온 active 의도를 지운다(WR-01). 진행 중 재적재 Promise 를 공유해 「즉시 반영」 이 최대 60초 늦을 수 있다(WR-02).
- **운영 정합성:** 시세 주 서버의 주소를 바꿔도 quote 연결은 옛 주소에 남는다(WR-03). 등록 서버가 꺼져 있으면 사용자 삭제가 끝나지 않는다(WR-04). 「재접속하면 적용」 배지 문구가 실제 세션 재사용 규칙과 맞지 않는다(WR-05).
- **UI · 시간 상한:** 계좌 추가 폼이 기존 계좌의 등록 서버 집합을 조용히 덮어쓴다(WR-06). relay 쪽 총 대기 시간에 상한이 없어 Express 12초 타임아웃을 넘을 수 있다(WR-07).

이미 수용된 항목(Button size="sm" · 데스크톱 시트 오버레이 · chat-sheet 384px · gh-trade 마지막 사용자 삭제 가드 재배포 대기 · 주문 서버의 계좌 단위 전환 예정)은 다시 올리지 않았다.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: 「+ 사용자」 경로가 기존 DMA 연결을 확인 없이 덮어써 옛 DMA 유저를 고아로 만든다

**File:** `server/src/routes/admin.ts:173-205` · `supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql:120-122` (대조: `server/src/routes/admin.ts:332-335`)
**Issue:**
1. `POST /users` 는 먼저 `app_users` 를 upsert 해 역할을 바꾼다.
2. 바디에 `dma` 가 있으면 곧바로 `relay.createDmaUser` 를 부른다.
3. 생성 RPC 는 `UPDATE public.app_users SET dma_user_id = p_dma_user_id WHERE email = v_email` 를 **조건 없이** 실행한다.

그래서 이미 DMA 가 연결된 trader 의 이메일을 「+ 사용자」 시트에 넣고 새 DMA id 로 만들면 다음 일이 차례로 일어난다.
- 웹 사용자의 DMA 신원이 조용히 바뀐다. relay 는 `lostAccess` 로 그 사용자의 wss 를 끊는다.
- 옛 DMA 유저의 `dma_users` · `dma_user_accounts` · `dma_account_servers` 행과 서버 users.toml 계정이 그대로 남는다.
- 그 DMA id 는 이제 어떤 웹 사용자에도 연결되지 않는다. 그래서 개요에서 편집 · 삭제가 안 되는 「서버에만 있음」 행으로만 보이고(`serverOnlyUsers`), Admin UI 로는 정리할 길이 없다. 「다시 반영」 도 돌지 않는다.

같은 상황을 전용 라우트(`POST /users/:email/dma`)는 `DmaLinked()` 409 로 막는다. 이 차이가 「덮어쓰면 안 된다」 는 의도를 보여 준다. 생성 시트 안내문(「이미 가입했으면 승인 대기에서 빠진다」)도 기존 사용자에게 이 시트를 쓰도록 유도한다.

또 relay 가 409 · 502 로 실패해도, 앞에서 upsert 한 역할 변경은 되돌려지지 않는다.

**Fix:** 정본 가드를 DB 에 두고, Express 에서도 쓰기 전에 거른다.
```sql
-- dma_admin_create_dma_user
PERFORM 1 FROM public.app_users a WHERE a.email = v_email FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='NO_APP_USER'; END IF;
IF EXISTS (SELECT 1 FROM public.app_users a WHERE a.email = v_email AND a.dma_user_id IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DMA_LINKED';
END IF;
```
```ts
// server/src/routes/admin.ts POST /users — upsert 전에
if (body.dma) {
  const { data: cur } = await supabase.from("app_users").select("dma_user_id").eq("email", body.email).maybeSingle();
  if (cur?.dma_user_id) throw DmaLinked();
}
```
relay 의 `INTENT_ERROR_CODES` · `INTENT_MESSAGE` 에 `DMA_LINKED` 를 더해 409 로 그대로 올린다.

## Warnings

### WR-01: op 2 settle 이 그 서버의 의도 행을 **전부** 지워, 동시에 들어온 active 등록을 날린다

**File:** `relay/src/admin/dispatcher.ts:223-234` · `supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql:274-276` · `relay/src/admin/admin-api.ts:318-337`
**Issue:**
- reconcile 경로에서 op 2 가 ok 이면 `#settle(dmaUserId, serverKey, removed, true)` 를 부른다.
- 그러면 `dma_admin_settle_server` 가 `DELETE … WHERE dma_user_id = $1 AND server_key = $2` 로 상태와 무관하게 그 서버의 행을 전부 지운다.
- 계획 시점에는 그 서버의 active 가 0 이었다. 그런데 `putAccount` 의 DB 쓰기는 `#serial` **밖**(admin-api 라우트)에서 즉시 커밋된다.

경합 시나리오:
1. 계좌 A 에서 KB121 해제 → op 2 진행 중.
2. 그 사이 계좌 B 에 KB121 체크 → B/KB121 active 행 커밋.
3. 1의 settle 이 B/KB121 행을 지운다.
4. 2의 reconcile 은 B/KB121 이 없는 의도를 읽는다. 결과적으로 B 는 KB121 에 영영 등록되지 않고, 화면도 그 사실을 보이지 않는다.

계좌마다 `useFieldSave` 가 따로라서 두 요청이 동시에 나는 것은 정상 조작이다.

**Fix:** op 2 settle 도 removing 행만 지운다(`p_user_removed` 이면 `AND state = 'removing'`). 「유저 삭제」 경로(`settleUserOnOk`)만 전 행 삭제가 필요하다면, 그 경로에 별도 플래그를 둔다. 또는 `putAccount` · `markAccountRemoved` 의 DB 쓰기를 dispatcher `#serial` 안으로 옮겨 같은 DMA 유저의 의도 변경과 반영을 줄 세운다.

### WR-02: 「즉시 재적재」 가 진행 중인 주기 재적재 Promise 를 공유해 커밋 전 데이터를 돌려준다

**File:** `relay/src/access/app-access.ts:148-156` · `relay/src/registry/registry.ts:245-254` · `relay/src/admin/admin-api.ts:360-374`
**Issue:** `reload()` 는 `#inFlight` 가 있으면 그 Promise 를 그대로 돌려준다. Express 가 역할 강등 · 허용 해제 · 서버 편집을 커밋한 직후 `/internal/admin/{access,registry}/reload` 를 부를 때, 60초 주기 재적재가 그 커밋 **전에** 시작돼 있으면 이렇게 된다.
- 옛 행을 읽은 결과를 받고 `ok: true` 로 끝난다.
- 강등된 사용자의 `revoked` 가 나지 않아, 다음 주기까지 최대 60초 동안 wss · DMA 세션이 열려 있다. 그 사이 주문도 가능하다.
- 레지스트리 변경(서버 끄기 · 주문 서버 교체)도 같은 시간만큼 늦는다.

D-04 「강등 · 해제 즉시」 를 확률적으로 깬다. `quote-switch.ts` 머리 주석에도 같은 문제가 적혀 있다.
**Fix:** 진행 중 적재가 있으면 그것이 끝난 뒤 **한 번 더** 읽는다(꼬리 재적재).
```ts
reload(): Promise<AppAccessReloadResult> {
  if (this.#inFlight !== null) {
    this.#rerun ??= this.#inFlight.then(() => { this.#rerun = null; return this.reload(); });
    return this.#rerun;
  }
  …
}
```
`ServerRegistry.reload` 도 같은 방식으로 고친다. 주기 타이머는 기존 공유 동작을 써도 된다.

### WR-03: 시세 주 서버의 host · port 를 바꿔도 quote 연결은 옛 주소에 남는다

**File:** `relay/src/index.ts:463-473` · `relay/src/quote/quote-switch.ts:183` · `relay/src/quote/quote-switch.ts:242-249`
**Issue:**
- 레지스트리 변경 처리기는 `change.roles` 일 때만 `quoteSwitch.reconcileWithRegistry` 를 부른다.
- host · port 변경은 `change.changed` 로만 잡힌다. 저널 · admin 파이프라인은 재생성되지만 quote 는 아무 처리도 받지 않는다.
- `reconcileWithRegistry` 와 `switchTo` 는 키만 비교한다(`this.#server?.key === server.key` → noop). 같은 키를 다시 골라 강제로 맞출 수도 없다.

그래서 Admin 이 시세 주 서버 카드에서 주소를 고치면(주소를 고치는 이유는 보통 옛 주소가 죽었기 때문이다) quote 는 relay 재시작 전까지 옛 주소로 재접속만 되풀이한다. healthz `quote` 는 503 축이라 장중 알림으로 이어진다.
**Fix:** `registry.on("changed")` 에서 `change.changed` 에 현재 quote 서버 키가 들어 있으면 같은 키로 break-then-make 재연결한다. `switchTo` 의 noop 판정도 키뿐 아니라 host · port 까지 비교하도록 바꾼다.
```ts
if (this.#server?.key === server.key && this.#server.host === server.host && this.#server.port === server.port)
  return { ok: true, changed: false };
```

### WR-04: 등록 서버가 하나라도 꺼져 있으면 사용자 삭제가 영원히 끝나지 않는다

**File:** `relay/src/admin/dispatcher.ts:153` · `relay/src/admin/dispatcher.ts:186-187`
**Issue:**
- `#applyServer` 는 레지스트리에서 꺼진 서버를 `skipped` 로 돌려준다.
- `deleteUser` 는 `results.every((r) => r.outcome === "ok")` 일 때만 `dma_admin_delete_dma_user` 를 부른다.

계좌가 등록된 서버를 나중에 끄면(시드 KB121 · KYOBO127 처럼) 그 사용자는 서버를 다시 켜기 전까지 삭제되지 않는다. 그 서버의 removing 행도 settle 되지 않는다. 화면에는 「일부 서버에서 지우지 못해…」 와 사유 없는 「미반영」 칩만 보여서, Admin 은 원인(꺼진 서버)을 알 수 없다.
**Fix:** 최소한 `skipped` 결과에 `message: "사용이 꺼진 서버 — 켜고 다시 삭제"` 를 실어 화면에 사유를 보인다. 꺼진 서버의 의도 행을 정리할 정책(예: Admin 확인 뒤 DB 의도만 지우고 서버는 켜질 때 대조)을 정해 `deleted` 판정에 넣는다.

### WR-05: 「주문 서버가 X 로 바뀜 — 재접속하면 적용」 배지가 따라 해도 적용되지 않는 지시를 한다

**File:** `webapp/src/components/trading/workbench/workbench-status-bar.tsx:94` · `relay/src/dma/session-manager.ts:253` · `relay/src/ws/fanout.ts:782`
**Issue:** `acquireFor` 는 사용자 × 증권사 세션이 살아 있으면 서버와 무관하게 그 세션을 재사용한다. 유예(5분) 중이면 유예를 취소하고 재사용한다. 따라서 사용자가 배지 문구대로 새로고침 · 재접속해도 같은 옛 서버 세션에 다시 붙는다. 그러면 fanout 이 `fresh` 연결에 같은 배지를 다시 보내 배지가 그대로 남는다. 실제로 새 서버가 적용되는 길은 「모든 탭을 닫고 5분 넘게 기다리기」 또는 「세션이 회선 실패로 죽기」뿐이다. 사용자는 조치를 했는데도 적용되지 않는 상황을 겪는다.
**Fix:** 문구를 실제 규칙에 맞춘다(예: 「모든 창을 닫고 5분 뒤 다시 열면 적용」). 또는 「지금 옮기기」 같은 명시 동작(그 증권사 세션 release + 유예 생략)을 제공한다. 정리 · 이동을 사용자 몫으로 둔다는 D-10 은 문구를 정확히 하는 쪽으로 지킨다.

### WR-06: 「+ 계좌 추가」 에 기존 계좌번호를 넣으면 그 계좌의 등록 서버 집합 · 값이 조용히 덮인다

**File:** `webapp/src/components/admin/account-editor.tsx:412-453` · `supabase/migrations/20261006200200_dma_admin_intent_rpcs.sql:186-205`
**Issue:** 추가 폼은 `PUT …/accounts` 1건(upsert)이다. `dma_admin_put_account` 는 기존 (증권사, 계좌번호)를 `ON CONFLICT DO UPDATE` 로 덮고, **목록에 없는 기존 active 서버를 removing 으로** 바꾼다. 같은 계좌번호(정규화 뒤 같은 값 포함)를 다른 서버 체크로 「추가」 하면 다음 일이 생긴다.
- 기존 등록 서버에서 op 4 / op 2 가 나가 실제 users.toml 에서 빠지고, 그 서버 세션이 끊길 수 있다.
- 이름 · 지점 · 트레이더 · priority 도 새 값으로 바뀐다.

폼에는 중복 검사도 경고도 없다.
**Fix:** 제출 전에 `accounts` 에서 `accountKeyOf(broker, normalizeAccountNo(accountNo))` 가 이미 있는지 확인하고 「이미 있는 계좌 — 위 계좌 줄에서 서버를 고르세요」 로 막는다. 서버 쪽에서도 「추가」 의도를 구분하려면 별도 플래그(예: `p_create_only`)로 `ACCOUNT_EXISTS` 를 돌려준다.

### WR-07: relay Admin 처리 시간에 총 상한이 없어 Express 12초 타임아웃을 넘긴다 — 반영됐는데 화면은 실패

**File:** `server/src/config.ts:110` · `server/src/services/relay-admin-client.ts:204-206` · `relay/src/admin/admin-conn.ts:82-85` · `relay/src/admin/dispatcher.ts:199-229` · `relay/src/admin/admin-api.ts:391-408`
**Issue:** relay 는 서버마다 op 를 **순차**로 보낸다. op 하나가 86 대기 5초 + 87 대기 1초, 최대 6초다. 서버당 FIFO 는 다른 Admin 요청과 공유한다. 그래서 다음 경우 12초를 쉽게 넘는다.
- 계좌가 여럿인 신규 서버 반영(op 1 + op 3 × N)
- 느린 서버에 대한 「다시 반영」
- 시세 주 서버 전환 실패 뒤 되돌리기(`switchTo` 10초 + DB 실패 시 되돌리기 `switchTo` 10초)

12초가 지나면 Express 는 502 `RELAY_FAILED` 를 주지만 relay 는 계속 반영한다. 생성 경로에서는 DB 의도 · 서버 반영이 끝났는데 화면은 「만들지 못했어요」 를 보인다. 재시도하면 `DMA_USER_EXISTS` 가 된다. 머리 주석의 「12초 > relay 대기」 전제는 op 1건 기준이라 성립하지 않는다.
**Fix:** relay 라우트에 요청 단위 마감(예: 10초)을 두고, 남은 op 는 결과를 `timeout` 으로 접어 응답한다. `admin-api` quote-primary 의 되돌리기 전환은 응답 뒤 비동기로 돌린다. 아니면 Express · 브라우저 타임아웃을 「서버당 op 상한 × 6초」 로 계산해 맞춘다.

## Info

### IN-01: DMA id 마스킹 함수가 세 벌이고 규칙이 서로 다르다

**File:** `relay/src/admin/admin-api.ts:207-210` · `relay/src/store/dma-users-migrate.ts:96-99` · `server/src/routes/admin.ts:82-84`
**Issue:** admin-api 는 3자 id 에서 앞 2자를 보이고, migrate 는 절반 이하(1자)만 보인다. server 는 UTF-16 길이 기준이다. 감사 로그마다 같은 id 가 다르게 가려지고, 짧은 id 는 거의 통째로 드러난다.
**Fix:** `@gh-radar/shared` 에 하나(`Math.min(2, floor(len/2))` · 코드포인트 기준)를 두고 세 곳이 그것을 쓴다.

### IN-02: `timeout` 결과가 시트에서는 err, 재조회 뒤 개요에서는 warn 으로 바뀐다

**File:** `webapp/src/components/admin/account-editor.tsx:75-81` · `packages/shared/src/admin.ts:503-506`
**Issue:** 응답 칩은 `timeout` → err 「응답 없음」 이다. 그런데 기록된 `dma_admin_results.outcome = 'timeout'` 은 `pendingTone` 이 `failed` 만 err 로 보므로 개요 재조회 뒤 warn 「미반영」 이 된다. 시트를 다시 열면 같은 상태의 칩 색이 달라진다.
**Fix:** `pendingTone` 에서 `timeout` 도 err(메시지 「응답 없음」)로 다루거나, 시트 쪽을 warn 으로 맞춘다.

### IN-03: `useFieldSave` 가 성공 뒤에도 마지막 값을 쥐고 있어 서버 쪽 이후 변경을 가린다

**File:** `webapp/src/components/admin/use-field-save.ts:116-123` · `webapp/src/components/admin/servers-client.tsx:111` · `webapp/src/components/admin/servers-client.tsx:230`
**Issue:** `quoteKey = quote.value ?? 서버값` · `orderKey = order.value ?? 서버값` 이라, 한 번 저장에 성공하면 그 페이지가 마운트된 동안 재조회 결과가 라디오에 반영되지 않는다. 다음 경우 화면이 틀린 서버를 가리킨다.
- relay 레지스트리 보정이 시세 주 서버를 되돌린 경우(`reconcileWithRegistry` 의 restore)
- 다른 Admin 이 바꾼 경우

역할 세그먼트도 같다.
**Fix:** 성공 시 `onSuccess` 뒤 `setValue(undefined)` 로 값을 놓아 재조회 값이 정본이 되게 한다(비행 · 대기 중에만 의도 값을 보인다).

---

_Reviewed: 2026-10-10T06:07:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
