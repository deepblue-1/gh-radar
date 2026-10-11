# Phase 29: DMA 다중 서버 · 웹 Admin 유저 관리 - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 41 (신규 26 · 수정 15)
**Analogs found:** 38 / 41

> 인용한 경로는 전부 `git ls-files` 로 추적 여부를 확인했다. 단 하나의 예외인 `server/src/services/relay-client.ts` 는 16-16 에서 지워졌으므로 **git 이력**(`git show b93681b6^:server/src/services/relay-client.ts`)으로 인용한다. 신규 파일은 계획 경로(RESEARCH §Recommended Project Structure)다.

## File Classification

| 신규/수정 파일 | Role | Data Flow | 가장 가까운 Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/2026100xxxxx00_admin_access_registry.sql` (신규) | migration | CRUD | `supabase/migrations/20260929190000_dma_gateway_identities.sql` + `20260610130000_theme_admin_overrides.sql` | exact |
| `supabase/migrations/2026100xxxxx01_dma_visibility_v2.sql` (신규) | migration (뷰 재정의) | transform | `supabase/migrations/20260929190000_dma_gateway_identities.sql` (뷰 96-109 · RPC 113-129) | exact |
| `supabase/migrations/2026100xxxxx02_gateway_key_rename.sql` (신규) | migration (UPDATE) | batch | `20260924200000_dma_journal_tables.sql` (대상 표 정의) | partial |
| `supabase/rollback/29-gateway-key-rename-revert.sql` (신규) | 수동 SQL | batch | 위와 같음 | no analog (rollback 디렉터리 없음) |
| `supabase/tests/admin_access_registry.test.sql` · `gateway_key_rename.test.sql` (신규) | test (pgTAP) | — | `supabase/tests/dma_gateway_identities.test.sql` | exact |
| `relay/src/config.ts` (수정) | config | — | 자기 자신(`EXTRA_OBSERVER_ENV` 52-54 · 143-173) | self |
| `relay/src/registry/registry.ts` (신규) | service (적재기) | polling/CRUD-read | `relay/src/journal/identities.ts` | exact |
| `relay/src/access/app-access.ts` (신규) | service (적재기) | polling | `relay/src/journal/identities.ts` | exact |
| `relay/src/admin/admin-conn.ts` (신규) | 상태기계 (게이트웨이 연결) | event-driven | `relay/src/quote/feed.ts` | exact |
| `relay/src/admin/admin-fanout.ts` (신규) | service | request-response (상관) | `relay/src/quote/feed.ts` 로그인 타이머 + 옛 relay-client 타임아웃 규율 | role-match |
| `relay/src/admin/snapshot-sink.ts` (신규) | service | event-driven → DB | `relay/src/journal/identities.ts` 통째 교체 + `journal/access.ts` replace | role-match |
| `relay/src/admin/admin-api.ts` (신규) | route (내부 HTTP) | request-response | `relay/src/order/order-api.ts` | exact |
| `relay/src/quote/quote-switch.ts` (신규) | wrapper | event-driven | `relay/src/quote/feed.ts` (HubQuoteFeed 표면) | role-match |
| `relay/src/index.ts` (수정) | 결선 | — | 자기 자신 | self |
| `relay/src/dma/session-manager.ts` · `session.ts` (수정) | service | event-driven | 자기 자신(acquire 187-215) | self |
| `relay/src/dma/envelope.ts` · `msg-type.ts` · `relay/src/hub/subscription-hub.ts` (수정) | codec / 화이트리스트 | transform | 자기 자신(envelope 3100-3111 · msg-type INBOUND) | self |
| `relay/src/store/credentials.ts` (수정, AAD=dma_user_id) | utility | — | 자기 자신(77-85) | self |
| `relay/src/ws/fanout.ts` · `ws/order-handler.ts` (수정) | handler | streaming | 자기 자신 | self |
| `relay/tests/helpers/fake-gateway.ts` (수정 — role 2 · 44/86/87) | test helper | — | 자기 자신(quote 모드 36-39 · 128-131 · 265-272) | self |
| `relay/tests/config-registry.test.ts` (신규) | test | — | `relay/tests/config-upstreams.test.ts` | exact |
| `relay/tests/registry.test.ts` · `app-access.test.ts` (신규) | test | — | `relay/tests/journal-identities.test.ts` | exact |
| `relay/tests/admin-conn.test.ts` · `admin-gateway.test.ts` · `admin-fanout.test.ts` · `quote-switch.test.ts` (신규) | test (fake gateway) | — | `relay/tests/quote-gateway.test.ts` | exact |
| `relay/tests/session-manager.test.ts` (확장) | test | — | 자기 자신 | self |
| `server/src/middleware/require-admin.ts` (신규) | middleware | request-response | `server/src/middleware/require-auth.ts` | exact |
| `server/src/routes/admin.ts` (신규) | route | request-response | `server/src/routes/orders.ts` | exact |
| `server/src/services/relay-admin-client.ts` (신규) | service (HTTP 클라) | request-response | 이력 `relay-client.ts` @ `b93681b6^` | exact |
| `server/src/app.ts` (수정) | 결선 | — | 자기 자신(54 · 88-98) | self |
| `server/tests/routes/admin.test.ts` · `server/tests/services/relay-admin-client.test.ts` (신규) | test (supertest) | — | `server/tests/routes/orders.test.ts` | exact |
| `webapp/src/lib/supabase/middleware.ts` (수정) | middleware | request-response | 자기 자신 | self |
| `webapp/src/lib/supabase/access-gate.ts` + `__tests__/access-gate.test.ts` (신규, 순수 판정) | utility | transform | `webapp/src/lib/supabase/public-path.ts` + `__tests__/public-path.test.ts` | exact |
| `webapp/src/app/auth/callback/route.ts` (수정 — 주석 19) | route | — | 자기 자신 | self |
| `webapp/src/app/pending/page.tsx` (신규) | page | — | `webapp/src/app/me/page.tsx` (셸 없이 단독) | role-match |
| `webapp/src/app/admin/users/page.tsx` · `admin/servers/page.tsx` (신규) | page | — | `webapp/src/app/me/page.tsx` | exact |
| `webapp/src/components/admin/*` (목록 · 시트 · 칩 · 카드, 신규) | component | request-response | `components/chat/chat-sheet.tsx`(우측 440px 시트) · `components/me/limit-chaser-defaults.tsx`(칩) | role-match |
| `webapp/src/components/admin/__tests__/*` (신규) | test | — | `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx` | exact |
| `webapp/src/lib/admin-api.ts` (신규) | client API | request-response | `webapp/src/lib/orders-api.ts` (`authFetch`) | exact |
| `webapp/src/components/layout/app-sidebar.tsx` (수정) | component | — | 자기 자신(NAV_ANALYTICS 109-118 · tradingVisible 분기) | self |
| `webapp/src/components/trading/dma-gate.tsx` (수정, 문구) | component | — | 자기 자신 | self |
| `webapp/e2e/specs/admin.spec.ts` + `e2e/fixtures/supabase-mock.ts` 확장 (신규/수정) | e2e | — | `webapp/e2e/specs/auth-guards.spec.ts` · `e2e/fixtures/relay.ts` | role-match |
| `scripts/deploy-relay.sh` (수정) | ops script | — | 자기 자신(34-48 DMA_HOST/KYOBO · 242-256 uptime) | self |
| `infra/relay/README.md` (수정 — §1110 · §1151 · §1212 · §1535) | doc | — | 자기 자신 | self |

## Pattern Assignments

### `supabase/migrations/2026100xxxxx00_admin_access_registry.sql` (migration, CRUD)

**Analog A:** `supabase/migrations/20260929190000_dma_gateway_identities.sql` — service_role 전용 표 잠금 4줄 (76-79):
```sql
ALTER TABLE public.dma_gateway_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_gateway_identities FROM PUBLIC;
REVOKE ALL ON public.dma_gateway_identities FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_gateway_identities TO service_role;
```
같은 파일 머리 규율: 멱등(`CREATE TABLE IF NOT EXISTS` · 시드 `ON CONFLICT DO NOTHING` · `CREATE OR REPLACE`, 40-41) · `BEGIN;`(58) … `COMMIT;`. RPC 권한 3줄(127-129):
```sql
REVOKE EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) TO service_role;
```
`dma_servers` · `app_users` · `dma_users` · `dma_user_accounts` · `dma_account_servers` · `dma_server_snapshots` · `dma_server_user_accounts` 전부 이 4줄 + RPC 3줄. 열 정의는 RESEARCH §데이터 모델 ①~⑥ 그대로.

**Analog B (본인 판정 RPC · `is_theme_admin` 흡수):** `supabase/migrations/20260610130000_theme_admin_overrides.sql` 45-59:
```sql
CREATE OR REPLACE FUNCTION public.is_theme_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM theme_admins a
    WHERE a.email = (auth.jwt() ->> 'email')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_theme_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_theme_admin() TO authenticated;
```
- `my_app_access()` (middleware 가 부르는 본인 1행) 는 이 형태 그대로 + **`REVOKE … FROM anon` 명시 추가**(메모리 `feedback_supabase_rpc_revoke` — 이 옛 파일은 anon 명시 REVOKE 가 없다. 새 RPC 는 따르지 말 것).
- `is_theme_admin()` 재정의 = 같은 시그니처 `CREATE OR REPLACE` 로 본문만 `app_users WHERE role='admin' AND email = lower(auth.jwt()->>'email')` 로 → 정책 `admin_update_system_themes`(64-67) · `admin_write_system_theme_stocks`(70-79) 이름 무변경.
- 시드는 88 행 형태(`INSERT … ON CONFLICT DO NOTHING`) — D-20: `alex@jx1.io` · `ezmesya@gmail.com` admin, `dma_credentials` 보유자 trader(auth.users 조인), KB121/KYOBO127 `enabled=false`.

---

### `supabase/migrations/…01_dma_visibility_v2.sql` (뷰 재정의)

**Analog:** `20260929190000_dma_gateway_identities.sql` 뷰 96-109 (`CREATE OR REPLACE VIEW public.dma_visibility_identities WITH (security_invoker = true)` + 권한 3줄 107-109) 와 RPC 본문 136-184(재명시 시 권한 3줄 반복 — 머리 주석 45 「권한 3줄씩 재명시」). 열 모양 `(user_id, gateway, dma_user_id)` 를 유지해야 `relay/src/journal/identities.ts:99-102` 와 RPC `dma_*_for_user` 가 무수정 통과한다.

---

### `supabase/migrations/…02_gateway_key_rename.sql` + `supabase/rollback/29-gateway-key-rename-revert.sql`

**Analog (대상 표):** `20260924200000_dma_journal_tables.sql` 171-189 잠금 블록에 나열된 `dma_journal_events` · `dma_account_orders` · `dma_account_access` · `dma_journal_cursor` + `dma_strategy_events`(20260929180000) · `dma_gateway_identities` · `dma_credentials.gateway`. 한 `BEGIN; … COMMIT;` 안에서 `UPDATE … SET gateway='KB120' WHERE gateway='KB'` 를 표마다. 역개명 파일은 마이그레이션 디렉터리 밖(적용 안 됨) — 기존 analog 없음, RESEARCH §키 개명 361-385 를 따른다.

---

### `supabase/tests/admin_access_registry.test.sql` · `gateway_key_rename.test.sql` (pgTAP)

**Analog:** `supabase/tests/dma_gateway_identities.test.sql`
- 머리 주석(1-27): 「잠그는 것」 목록 · 실행 명령 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>` · 픽스처 표.
- 골격(29-36, 352-354):
```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-000000002601', 'sas-u1@example.invalid'), …;
…
SELECT * FROM finish(true);
ROLLBACK;
```
- 단언 설명에 (사용자, 게이트웨이, 계좌 말미, 기대) 튜플을 적는 규칙(20).

---

### `relay/src/config.ts` (수정 — 레지스트리 원천 env 게이트, D-09)

**Self-analog** 143-173 — 안전 기본값 원칙과 키 중복 throw:
```ts
// 기본값은 로컬 mock 이다. 실서버 주소는 배포 env 가 반드시 명시해야 한다 (D-27).
const dmaHost = optional("DMA_HOST") ?? "127.0.0.1";
const dmaPort = Number(optional("DMA_PORT") ?? "9100");
const dmaBroker = optional("DMA_BROKER") ?? "KB";
const primary: JournalUpstream = { gateway: dmaBroker, host: dmaHost, port: dmaPort, secret: dmaObserverSecret };
```
production 필수 비밀 throw(130-134):
```ts
const nodeEnv = (process.env.NODE_ENV ?? "development") as RelayConfig["nodeEnv"];
const dmaObserverSecret = optional("DMA_OBSERVER_SECRET") || undefined;
if (nodeEnv === "production" && dmaObserverSecret === undefined) {
  throw new Error("DMA_OBSERVER_SECRET must be set in production (Phase 19 D-13)");
}
```
→ `DMA_REGISTRY_SOURCE=db` 이고 `nodeEnv !== "production"` 이면 같은 스타일로 throw. `env` 모드는 위 `primary` 를 합성 레지스트리 1행으로. 증권사별 비밀 표는 `EXTRA_OBSERVER_ENV`(52-54) 의 `secretEnv` 행 형태를 broker 키로 재사용(`KB → DMA_OBSERVER_SECRET`, `KYOBO → DMA_OBSERVER_SECRET_KYOBO`).

---

### `relay/src/registry/registry.ts` · `relay/src/access/app-access.ts` (주기 적재기)

**Analog:** `relay/src/journal/identities.ts`
- 상수 · deps(30-40): `export const IDENTITY_REFRESH_MS = 60_000;` · `refreshMs?` 테스트 주입.
- 수명(70-93): `start()` 즉시 1회 + `setInterval(...).unref?.()` · `close()`.
- 적재(95-115) — 겹침 금지 · 실패 시 직전 값 유지 · `safePgError` 로그:
```ts
async #load(): Promise<void> {
  if (this.#closed || this.#inFlight) return;
  this.#inFlight = true;
  try {
    const { data, error } = await this.#supabase
      .from("dma_visibility_identities")
      .select("user_id, gateway, dma_user_id")
      .in("gateway", [...this.#gateways]);
    if (error) throw error;
    if (this.#closed) return;
    this.#replace((data ?? []) as IdentityRow[]);
  } catch (err) {
    this.#failures += 1;
    logger.error({ gateways: this.#gateways, pgError: safePgError(err), attempt: this.#failures }, "[journal] 신원 연결 적재 실패 — 직전 값 유지(…)");
  } finally {
    this.#inFlight = false;
  }
}
```
- 통째 교체 + 변경 시에만 info(117-143): 행 타입 가드(`typeof row.x !== "string"` → skip) · `#lastCounts` JSON 비교.
- 레지스트리는 `#replace` 뒤 diff 이벤트(추가/삭제/변경 서버) 를 emit 해 index.ts 가 파이프라인을 올리고 내린다. `reload()` 공개 메서드는 `/internal/admin/registry/reload` 용(`#inFlight` 가드 재사용).
- app-access 는 교체 후 「사라졌거나 viewer 로 내려간 userId」 집합을 `fanout.revokeUser` 로.

---

### `relay/src/admin/admin-conn.ts` (role 2 연결 상태기계)

**Analog:** `relay/src/quote/feed.ts` — 파생 복사(저널 관찰자에 role 분기 금지 — RESEARCH Anti-Patterns).
- 상수/상태(67-81): `QUOTE_CLIENT_NAME` · `QUOTE_ROLE = 1` · `type QuoteFeedState = "disabled" | "connecting" | "logging_in" | "ready" | "rejected" | "role_mismatch";` → `ADMIN_CLIENT_NAME = "gh-radar-relay/admin"` · `ADMIN_ROLE = 2`.
- 필드 · 생성자(114-149): `#transport` · `#loginTimer` · `#rejectedRetryTimer` · `#rejectedCount` · `#onUp/#onDown/#onFrame` 화살표 바인딩.
- 로그인 송신(230-248):
```ts
const payload = buildObserverLoginReq({ secret, sinceSeq: 0, epoch: "", client: QUOTE_CLIENT_NAME, strategySinceSeq: 0, role: QUOTE_ROLE });
this.#setState("logging_in");
if (!transport.send(payload)) { this.#dropTransport("quote 로그인 송신 실패"); return; }
this.#armLoginTimer(e.generation);
```
- 79 판단(285-330): 거부 → `#halt("rejected")` + `#armRejectedRetry()`(5분 × 12) · `result.role !== QUOTE_ROLE` → `#halt("role_mismatch")` · 성공 → `resetReconnectAttempts()` · `setState("ready")` · `emit("ready")`. admin 은 ready 직후 op5 1건.
- 정지 순서(339-346):
```ts
#halt(next: "rejected" | "role_mismatch", reason: string, log: () => void): void {
  log();
  const transport = this.#transport;
  transport?.stopReconnect(reason);
  transport?.destroy();
  this.#setState(next);
}
```
- `#handleFrame`(258-283): generation 비교 · halted 무시 · ready 전 프레임 버림 → admin 은 86/87 만 처리, 나머지는 debug 드롭.
- 선결: `relay/src/dma/envelope.ts:3108-3111` 의 role 가드를 2 까지 넓힌다:
```ts
const role = input.role ?? 0;
if (role !== 0 && role !== 1) {
  throw new RangeError(`관찰자 로그인 role 이 0(journal) · 1(quote) 이 아니다: ${String(role)}`);
}
```

---

### `relay/src/admin/admin-fanout.ts` · `snapshot-sink.ts`

- request_id 상관: feed.ts 로그인 타이머(`#armLoginTimer`/`#clearLoginTimer`, generation 묶음) 를 `Map<bigint, {resolve, timer}>` 로 일반화. 타임아웃 5초 = `LOGIN_RESP_TIMEOUT_MS`(feed.ts 생성자 145 `deps.loginTimeoutMs ?? LOGIN_RESP_TIMEOUT_MS`).
- 결과 배열 모양은 RESEARCH Pattern 3(397-414): `{ results: [{ server, outcome: "ok"|"failed"|"timeout"|"offline", code?, message?, usersRev? }] }`.
- 87 적재: `dma_admin_apply_snapshot` RPC 1회(identities 의 통째 교체 규율) + `pipelines.get(serverKey)?.access.replace(rows)` — 행 모양은 `ObserverAccountRow`(`relay/src/journal/types.ts:117-122`, RESEARCH 인용). RESEARCH Code Examples 566-573 코드 그대로.
- 로그: 비밀번호 · 계좌번호 원문 금지(`maskAccountNo`), 실패 catch 는 사유 포함(메모리 `feedback_silent_failure_max_tokens`).

---

### `relay/src/admin/admin-api.ts` (내부 HTTP 라우터)

**Analog:** `relay/src/order/order-api.ts` — 관문(196-215):
```ts
function relaySecretGuard(expected: string): RequestHandler {
  return (req, _res, next) => {
    if (req.path === HEALTH_PATH) { next(); return; }
    const header = req.get("x-relay-secret");
    if (header === undefined || !secretMatches(header, expected)) {
      logger.warn({ path: req.path, method: req.method, hasHeader: header !== undefined }, "[order-api] 공유 비밀 불일치 — 401");
      next(new RelayApiError(401, "UNAUTHORIZED_RELAY", "Unauthorized"));
      return;
    }
    next();
  };
}
```
팩토리(221-227): `app.use(express.json({ limit: "16kb" })); app.use(relaySecretGuard(deps.relayOrderSecret));` → 그 뒤 404 앞에 `if (deps.admin !== undefined) app.use("/internal/admin", deps.admin.router);`(RESEARCH 556-564). 에러는 `RelayApiError` · 바디 검증은 zod(relay `zod ^4`).

---

### `relay/src/quote/quote-switch.ts`

**Analog:** `relay/src/quote/feed.ts` 의 hub 표면 — `get isReady()`(157-160) · `emit("frame"/"ready")` · `start()/stop()`(173 · 195). 래퍼가 같은 getter/이벤트를 재방출하고 안쪽 `QuoteFeed` 만 교체. 순서는 RESEARCH Pattern 6(426-428).

---

### `relay/src/dma/session-manager.ts` (수정 — (유저, 서버) 키)

**Self-analog** acquire(187-215): 유예 타이머 취소 · `RETRYABLE_DEAD_STATES` 재생성 · `NO_RETRY_STATES`(157 `new Set(["session_rejected", "unauthorized"])`) 재로그인 금지 · refCount. 키만 `${userId}|${serverKey}` 로 바꾸고 `#sessions.get(userId)` 호출부(188 · 230 · 250) 전부 교체. `SESSION_GRACE_MS = 300_000`(33) 유지.

---

### `relay/src/store/credentials.ts` (AAD 정정, D-19)

**Self** 77-85:
```ts
export function encryptDmaPassword(plain: string, userId: string, keyB64: string): string {
  const key = parseKey(keyB64);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  …
}
```
인자 의미만 `dmaUserId` 로(시그니처 · 저장 포맷 유지).

---

### `relay/tests/config-registry.test.ts`

**Analog:** `relay/tests/config-upstreams.test.ts` 1-40 — `TOUCHED` env 목록 저장/복원 · `beforeEach` 에서 추가 env delete · 주소는 TEST-NET(192.0.2.x)만(D-27) · `import { loadConfig } from "../src/config.js";`. `DMA_REGISTRY_SOURCE` 를 TOUCHED 에 추가.

### `relay/tests/registry.test.ts` · `app-access.test.ts`

**Analog:** `relay/tests/journal-identities.test.ts` (refreshMs 작게 주입 · supabase 목).

### `relay/tests/admin-*.test.ts` · `quote-switch.test.ts` + `relay/tests/helpers/fake-gateway.ts`

**Analog:** `relay/tests/quote-gateway.test.ts` import 블록(24-45):
```ts
import { DmaClient, type TransportFrameEvent } from "../src/dma/dma-client.js";
import { MSG } from "../src/dma/msg-type.js";
import { … parseObserverLoginResp, resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { QUOTE_CLIENT_NAME, QuoteFeed } from "../src/quote/feed.js";
import { startFakeGateway, … } from "./helpers/fake-gateway.js";
```
fake gateway 확장은 quote 모드 선례 그대로: 옵션 `quoteLoginResp?`(128-131) · `respondQuoteLogin(resp | null)`(265-268) · `quoteLoginRequests()`(269-270) · 「살아 있는 연결 대기」(272) → `adminLoginResp?` · `respondAdminLogin` · `adminLoginRequests()` · `adminCommandRequests()` · `respondAdminCommand(code, message, usersRev)` · `pushAdminSnapshot(...)`. 요청 파서는 `readObserverLoginRequest`(327-) 형태로 `readAdminCommandRequest` 추가. 다중 서버 fan-out 테스트는 게이트웨이 2개 기동.

---

### `server/src/middleware/require-admin.ts`

**Analog:** `server/src/middleware/require-auth.ts` 18-40:
```ts
export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다." } }); return; }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "세션이 만료되었습니다." } }); return; }
    req.userId = data.user.id;
    next();
  };
}
```
→ `requireAuth()` 뒤에 체인. `data.user.email` 을 `req.userEmail` 로도 싣고, `app_users` 를 service_role 로 `.eq("email", lower(email))` 1회 조회 → role ≠ admin 이면 `403 { error: { code: "FORBIDDEN", message: "관리자만 사용할 수 있어요." } }`. 기존 403 선례 코드명은 `DMA_UNMAPPED`(`server/src/routes/limitup-report.ts:20`).

### `server/src/routes/admin.ts`

**Analog:** `server/src/routes/orders.ts` — 라우터 선언 · zod safeParse → `ValidationFailed` · `next(e)` (48-70):
```ts
export const ordersRouter: RouterT = Router();
ordersRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = OrderListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    …
    res.json(data);
  } catch (e) { next(e); }
});
```
머리 주석의 「방어선」 표(35-45) 형식 그대로 admin 방어선을 적는다. 정적 경로를 `/:id…` 보다 먼저 등록(18-19). 스키마는 `server/src/schemas/*.js` 관례. 결선은 `server/src/app.ts:98` 옆에 `app.use("/api/admin", adminRouter);`(`apiRateLimiter` 88 뒤).

### `server/src/services/relay-admin-client.ts`

**Analog (이력):** `git show b93681b6^:server/src/services/relay-client.ts` 95-163 — 사설 대역 가드와 axios 팩토리:
```ts
const SUBNET_PREFIX = "10.10.0.";
const SUBNET_HOST_MAX = 63;
export function assertRelayUrl(rawUrl: string, nodeEnv: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("RELAY_INTERNAL_URL must be a valid URL"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(…);
  const host = url.hostname;
  if (isRelaySubnetHost(host)) return url;
  if (nodeEnv !== "production" && isLoopbackHost(host)) return url;
  throw new Error(`RELAY_INTERNAL_URL host must be inside ${SUBNET_PREFIX}0/26 (got: ${host})`);
}
export function createRelayClient(opts: { baseUrl; secret; timeoutMs; nodeEnv }): RelayClient {
  const url = assertRelayUrl(opts.baseUrl, opts.nodeEnv);
  const http = axios.create({ baseURL: url.origin, timeout: opts.timeoutMs + 500,
    headers: { "content-type": "application/json", "X-Relay-Secret": opts.secret } });
  …
}
```
그리고 `validateStatus: () => true` 로 상태코드 직접 분기 · 로그에 비밀/계좌 원문 금지(172-176 주석). 타임아웃은 relay 서버별 5초 + 여유.

### `server/tests/routes/admin.test.ts`

**Analog:** `server/tests/routes/orders.test.ts` — `import request from "supertest"; import { createApp } from "../../src/app";` · `makeSupabase(opts)` 목(50-75: `auth.getUser` · `rpc(fn, params)` 기록 · `from(table)` 기록). relay 클라는 deps 주입으로 가짜.

---

### `webapp/src/lib/supabase/middleware.ts` + `access-gate.ts`

**Self** 46-73 — getUser 뒤 분기 자리:
```ts
const { data: { user } } = await supabase.auth.getUser();
const pathname = request.nextUrl.pathname;
const isPublic = isPublicPath(pathname);
if (!user && !isPublic) { const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = ""; url.searchParams.set("next", pathname + request.nextUrl.search); return NextResponse.redirect(url); }
if (user && pathname === "/login") { … url.pathname = "/"; … return NextResponse.redirect(url); }
return supabaseResponse;
```
→ 그 사이에 `supabase.rpc("my_app_access")` 1회 + 판정(RESEARCH 541-554). 판정 표 자체는 **`public-path.ts` 처럼 import 없는 순수 함수**로 분리(`public-path.ts` 10-12 주석이 근거): `decideAccess(pathname, role) → null | "/pending" | "/"`. 테스트는 `src/lib/supabase/__tests__/public-path.test.ts` 형식. 리다이렉트 응답에도 `supabaseResponse` 쿠키를 잃지 않게 주의(머리 주석 Pitfall 1).

### `webapp/src/app/auth/callback/route.ts`
주석 19 「whitelist/role 체크 없음 (D-04)」 → 「판정은 middleware(Phase 29 D-01)」 로 갱신만.

### `webapp/src/app/admin/users/page.tsx` · `admin/servers/page.tsx` · `app/pending/page.tsx`

**Analog:** `webapp/src/app/me/page.tsx` 1-24:
```tsx
'use client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MeClient } from '@/components/trading/me-client';
export default function MePage() {
  return (<AppShell sidebar={<AppSidebar />}><MeClient /></AppShell>);
}
```
본문은 `components/admin/*-client.tsx` 가 소유. `/pending` 은 셸 없이 안내 1줄 + 로그아웃 1개(사이드바가 trading 데이터를 끌어오지 않게).

### `webapp/src/components/admin/*` (시트 · 칩 · 카드)

- **시트(데스크톱 우측 440px):** `webapp/src/components/chat/chat-sheet.tsx` 260-262 `<SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">`. 폰 바텀시트는 `webapp/src/components/ui/sheet.tsx` 의 `side?: "top" | "right" | "bottom" | "left"`(64) · `data-[side=bottom]` 클래스(77). 바텀시트 선례 `components/trading/lc/number-pad-sheet.tsx`.
- **결과 칩:** `webapp/src/components/me/limit-chaser-defaults.tsx` 134-144 — 상태 → 클래스/`data-tone` 두 표, 새 색 토큰 0:
```tsx
const CHIP_TONE_CLASS: Readonly<Record<UserSettingsStatus, string>> = {
  loading: "bg-[var(--muted)] text-[var(--muted-fg)]",
  present: "bg-[color-mix(in_srgb,var(--led-armed)_16%,transparent)] text-[var(--led-armed)]",
  absent: "bg-[color-mix(in_srgb,var(--led-latent)_18%,transparent)] text-[var(--led-latent)]",
};
const CHIP_TONE_ATTR = { loading: "loading", present: "ok", absent: "warn" };
```
렌더(511-518): `data-slot="…-chip"` + `data-tone={…}` — 반영됨(ok) · 미반영(warn) · 실패·BUSY(err) · 서버에만 있음(흐린). 즉시 저장 플래시 `USER_SETTINGS_FLASH_MS = 700`(153-154) 재사용 가능. 상태 문구 표 `USER_SETTINGS_STATUS_TEXT`(122) 형식.
- 목업 3장(`reference/mockup-admin-*.html`)에 없는 요소(토스트·힌트) 금지.

### `webapp/src/lib/admin-api.ts`

**Analog:** `webapp/src/lib/orders-api.ts` 33 · 40-42:
```ts
import { authFetch } from "./auth-fetch";
export function fetchTodayOrders(): Promise<JournalOrderRow[]> {
  return authFetch<JournalOrderRow[]>("/api/orders");
}
```
쓰기는 `authFetch(path, { method: "POST", body })`(`src/lib/auth-fetch.ts:16` 시그니처 `authFetch<T>(path, init: ApiFetchInit = {})`). 테스트 선례 `src/lib/__tests__/orders-api.test.ts`.

### `webapp/src/components/layout/app-sidebar.tsx`

**Self:** 그룹 제목 + 하위 항목 상수(109-118 `NAV_ANALYTICS` · `NAV_LIMITUP_REPORT`), 노출 조건 `{tradingVisible && (<> <GroupHeading … /> … </>)}`(436-) · 하위 `<ul className={SUB_LIST}>`. → `NAV_ADMIN`(`/admin/users` 링크) + `NAV_ADMIN_USERS`/`NAV_ADMIN_SERVERS`, 조건은 admin 역할(새 훅, `my_app_access` 결과). 활성 판정은 `limitupActive = pathname.startsWith(…)`(418) 형식. viewer 숨김 규칙도 같은 분기. 테스트 `components/layout/__tests__/app-sidebar.test.tsx` 확장. 모바일 탭바 미추가(D-13).

### `webapp/e2e/specs/admin.spec.ts` + fixtures

**Analog:** `webapp/e2e/specs/auth-guards.spec.ts`(차단 리다이렉트) · `e2e/fixtures/supabase-mock.ts`(`page.route("**/rest/v1/…")` 16-17 형식 → `**/rest/v1/rpc/my_app_access` 스텁 = admin 기본 시드, D-20 Pitfall 6) · `e2e/fixtures/relay.ts`(fake gateway 재export 129-149 형식으로 admin 헬퍼 재export) · `e2e/fixtures/auth.ts`.

---

### `scripts/deploy-relay.sh` · `infra/relay/README.md`

- deploy: 34-48 `DMA_HOST` 보존 규칙 · `DMA_KYOBO_HOST/PORT` 주입을 마지막 배포에서 `DMA_REGISTRY_SOURCE=db` 로 대체. uptime 함수 `uptime_check_name()`(126-) · `sync_kyobo_monitoring`(242-256) 패턴을 레지스트리 키 기준으로(무료 한도 — RESEARCH Pitfall 3).
- README: §관찰자 비밀(1110) · §다중 게이트웨이 관찰자(1151) · §신원 연결 추가·제거(1212) · §DMA 서버 추가 절차(1535) 를 Admin 경로 + 롤백 역개명 SQL 로 갱신.

## Shared Patterns

### Supabase 권한 잠금
**Source:** `supabase/migrations/20260929190000_dma_gateway_identities.sql:76-79, 127-129`
**Apply to:** 모든 새 표 · 뷰 · RPC. 예외는 본인 판정 RPC(`my_app_access`, `is_theme_admin`)뿐 — `SECURITY DEFINER` + `SET search_path = public, pg_temp` + `REVOKE FROM PUBLIC, anon` + `GRANT TO authenticated`.

### 주기 재적재(통째 교체 · 겹침 금지 · 실패 시 직전 유지)
**Source:** `relay/src/journal/identities.ts:70-143`
**Apply to:** registry · app-access · (선택) 87 캐시.

### 관찰자 연결 상태기계
**Source:** `relay/src/quote/feed.ts:114-346`
**Apply to:** admin-conn · quote-switch 내부 feed.

### 내부 HTTP 공유 비밀
**Source:** relay `relay/src/order/order-api.ts:196-227` (수신) · 이력 `relay-client.ts@b93681b6^` 95-163 (송신)
**Apply to:** `/internal/admin/*` · `relay-admin-client.ts`.

### Express 인증 · 에러
**Source:** `server/src/middleware/require-auth.ts:18-40` · `server/src/routes/orders.ts:51-70` (zod → `ValidationFailed` · `next(e)`) · `server/src/services/dma-orders.ts:54` (`new ApiError(500, "DB_ERROR", msg, cause)` — 응답은 고정 문구, cause 는 로그만)
**Apply to:** admin 라우트 전부.

### 로그 위생
비밀번호 · dmaUserId · 계좌번호 원문 금지(계좌는 `maskAccountNo`), 실패 catch 는 사유 로깅(`safePgError` — identities.ts 109).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `supabase/rollback/29-gateway-key-rename-revert.sql` | 수동 SQL | batch | `supabase/rollback/` 디렉터리 자체가 없다 — RESEARCH §키 개명을 따른다 |
| `relay/src/admin/admin-fanout.ts` 의 request_id 상관 맵 | service | request-response | 게이트웨이에 request_id 상관을 거는 코드가 없다(주문은 세션 단위). feed.ts 타이머를 일반화 |
| 44/86/87 코덱(envelope · 생성물) | codec | transform | gh-trade fbs 미확정(착수 게이트) — 생성물 이름은 sync 출력이 정한다 |

## Metadata

**Analog search scope:** supabase/migrations · supabase/tests · relay/src · relay/tests · server/src · server/tests · webapp/src · webapp/e2e · scripts · infra/relay · git 이력(b93681b6)
**Files scanned:** ~45
**Pattern extraction date:** 2026-10-06
