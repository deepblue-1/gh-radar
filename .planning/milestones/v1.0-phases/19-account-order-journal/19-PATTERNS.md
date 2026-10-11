# Phase 19: 계좌별 주문기록 전용 연결 - Pattern Map

**Mapped:** 2026-09-24
**Files analyzed:** 22 (신규 11 · 수정 9 · 삭제 2)
**Analogs found:** 21 / 22
**범위:** gh-radar 만. gh-trade(`ObserverLoginReq=5` · `ObserverLoginResp=79` · `JournalBatch=80`, fbs)는 gh-trade Phase 23 소관 — gh-radar 쪽은 `sync-relay-schema.sh`(RELAY= 지정)로 `relay/src/generated/**` 를 재생성한 **뒤에만** envelope/msg-type 작업을 확정한다 ([BLOCKING] 게이트). 생성물은 손편집 금지.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/2026092xxxxx00_dma_journal_tables.sql` (신규) | migration | CRUD | `supabase/migrations/20260905120200_dma_orders.sql` + `20260905120100_dma_credentials.sql` | exact |
| `supabase/migrations/2026092xxxxx10_dma_journal_rpcs.sql` (신규) | migration (plpgsql RPC) | transform/batch | `supabase/migrations/20260914090000_stock_comovement_inputs_rpc.sql` (REVOKE/GRANT 블록) | role-match (기존 RPC 는 `LANGUAGE sql`; plpgsql·advisory lock 은 RESEARCH Pattern D) |
| `supabase/tests/dma_journal_apply.test.sql` (신규) | test (pgTAP) | CRUD | `supabase/tests/dma_orders_modified.test.sql` | exact |
| `relay/src/journal/observer.ts` (신규) | service (상태기계) | event-driven / streaming | `relay/src/dma/session.ts` (DmaClient 위 로그인 상태기계) | role-match |
| `relay/src/journal/writer.ts` (신규) | service (큐+워커) | batch | `relay/src/store/orders.ts` `OrderStore` (L930~, 큐·flushNow·로깅) | role-match |
| `relay/src/journal/access.ts` (신규) | utility (메모리 맵) | transform | `relay/src/store/gateway-symbols.ts` | partial |
| `relay/src/journal/trading-window.ts` (신규) | utility | transform | `packages/shared/src/krxCalendar.ts` (`isKrxHoliday` L33, `kstDateIso` L53) | partial (재사용 대상) |
| `relay/src/dma/msg-type.ts` (수정) | config (상수) | — | 자기 자신 `MSG` L65~ | exact |
| `relay/src/dma/envelope.ts` (수정) | utility (codec) | transform | 자기 자신 `buildLoginReq` L322, `parseLoginResp` L803, `readAccountEntries` L733 | exact |
| `relay/src/ws/order-handler.ts` (수정, 기록부 제거) | controller | request-response | RESEARCH 「D-01 제거 인벤토리」(라인 표) | n/a (삭제 작업) |
| `relay/src/ws/fanout.ts` (수정) | controller (WS 팬아웃) | pub-sub | 자기 자신 `#deliver` L1386, 생성자 L400-416 | exact |
| `relay/src/order/order-api.ts` (수정) | controller (/healthz) | request-response | 자기 자신 `HealthPayload` L79, 핸들러 L253-279 | exact |
| `relay/src/index.ts` (수정) | config (부트 결선) | — | 자기 자신 L111-131, 216-217 (OrderStore 생성·종료) | exact |
| `relay/src/config.ts` · `relay/src/logger.ts` (수정) | config | — | `config.ts` L75-83 (`get`/`optional`), `logger.ts` redact 목록 | exact |
| `relay/src/store/orders.ts` (삭제) · `relay/tests/order-store.test.ts` (삭제) | — | — | — | n/a |
| `relay/tests/journal-observer.test.ts` · `journal-writer.test.ts` (신규) | test | event-driven | `relay/tests/session.test.ts`, `relay/tests/order-store.test.ts` | role-match |
| `relay/tests/helpers/fake-gateway.ts` · `frames.ts` (수정) | test helper | — | `frames.ts` `buildLoginRespFrame` L257 | exact |
| `packages/shared/src/relay.ts` (수정) | model (타입) | — | 같은 파일 `RelayOrderMsg`/`DmaOrderRow`, `{t:...}` 유니온 L400~ | exact |
| `server/src/services/dma-orders.ts` (수정) | service | request-response | 자기 자신 (L1-128) + RPC 호출 규약 | exact |
| `webapp/src/lib/orders-api.ts` (수정) | utility (fetch+병합) | request-response | 자기 자신 `mergeTodayOrders` L63, `STATUS_RANK` | exact |
| `webapp/src/components/trading/today-orders-card.tsx` (수정, B′) | component | request-response | 자기 자신 + `19-today-orders-mockup.html` | exact |
| `webapp/src/components/trading/origin-tag.tsx` (신규, 추출) | component | — | `webapp/src/components/orderbook/account-panel.tsx` L1410-1420 `OriginTag` | exact |
| `scripts/deploy-relay.sh` · `scripts/setup-relay-iam.sh` (수정) | config (배포) | — | deploy-relay.sh L184, L287-314 / setup-relay-iam.sh L179 | exact |
| `ops/alert-relay-down.yaml` (문서 행) | config | — | 자기 자신 | exact |

## Pattern Assignments

### `supabase/migrations/..._dma_journal_tables.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260905120200_dma_orders.sql`

**헤더 주석 규약** (L1-45): `-- ====` 블록에 「결정 근거(D-xx)」 · 「함정」 · 「하지 않는 것」 3단. 새 파일도 D-05/D-06/D-11/D-12 를 이 형태로 적는다.

**테이블 + 트랜잭션 골격** (L47-72):
```sql
BEGIN;
CREATE TABLE public.dma_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
  exchange     text NOT NULL CHECK (exchange IN ('KRX','NXT')),
  side         text NOT NULL CHECK (side IN ('B','S')),
  notice_type  text,     -- 원문 1자 — 해석하지 않는다 (CHECK 없음은 의도)
  filled_qty   integer NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dma_orders_order_no ON public.dma_orders (order_no) WHERE order_no IS NOT NULL;
ALTER TABLE public.dma_orders ENABLE ROW LEVEL SECURITY;
```
→ events 는 `seq`(bigint) + `journal_epoch` PK, orders 는 `(account_no, trade_date, order_no)` 류 유니크, `isin` 12자 CHECK·FK 없음 규약 그대로.

**서비스롤 전용 잠금** (`20260905120100_dma_credentials.sql` L50-54) — 4개 테이블 전부:
```sql
ALTER TABLE public.dma_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_credentials FROM PUBLIC;
REVOKE ALL ON public.dma_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_credentials TO service_role;
```
정책(POLICY) 0개 = default deny. **`dma_orders` 는 건드리지 않는다(동결, D-05).**

---

### `supabase/migrations/..._dma_journal_rpcs.sql` (plpgsql RPC)

**Analog:** `supabase/migrations/20260914090000_stock_comovement_inputs_rpc.sql` (L21-30, L90-92)
```sql
CREATE OR REPLACE FUNCTION public.stock_comovement_inputs(p_code text)
...
SECURITY INVOKER
...
REVOKE EXECUTE ON FUNCTION public.stock_comovement_inputs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stock_comovement_inputs(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_comovement_inputs(text) TO service_role;
```
- 세 RPC(apply · sync_access · orders_for_user) 모두 위 3줄을 **시그니처 정확히** 반복.
- apply 본문: `pg_advisory_xact_lock` → 이벤트 `INSERT ... ON CONFLICT DO NOTHING` 성공 시에만 투영 → 커서 갱신, 한 트랜잭션 (RESEARCH Pattern D / Pitfall 2). `STATUS_RANK` 단조 규칙은 `webapp/src/lib/orders-api.ts` `STATUS_RANK` 및 `relay/src/order/notice-status.ts` 와 같은 축으로 이식.
- orders_for_user: server 왕복 1회(메모리 「Cloud Run 왕복 비용」) — 매핑 조인 + KST 날짜 필터를 RPC 안에서.

---

### `supabase/tests/dma_journal_apply.test.sql` (pgTAP)

**Analog:** `supabase/tests/dma_orders_modified.test.sql` (L1-40)
```sql
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>.sql`
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000923', 'dma-modified@example.invalid');
SELECT plan(15);
SELECT has_column(...); SELECT lives_ok($$INSERT ...$$, 'accepts (...)');
... ROLLBACK;
```
필수 단언: 같은 배치 2회 호출 → 행 불변(filled_qty 두 배 금지), anon/authenticated 에 EXECUTE/SELECT 없음(`function_privs_are`/`table_privs_are`), 로컬 거부 `reject_seq` 행.

---

### `relay/src/dma/msg-type.ts` · `envelope.ts` (codec)

**msg-type 상수 규약** (`msg-type.ts` L65-110): `MSG` 객체에 JSDoc 1줄씩, 요청 대역/응답 대역 섹션 분리. `ObserverLoginReq: 5` 는 요청 섹션, `ObserverLoginResp: 79` · `JournalBatch: 80` 은 응답 섹션. 헤더 주석(L20-45)의 「화이트리스트 확장의 대가」 문단에 새 번호 추가 + **`INBOUND_MSG_TYPES` 와 hub/observer 명시 `case` 는 같은 커밋**.

**빌더 패턴** (`envelope.ts` L322-335):
```ts
export function buildLoginReq(userId: string, password: string, broker: string): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const req = LoginReq.createLoginReq(b, b.createString(userId), b.createString(password), b.createString(broker));
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.LoginReq);
  Envelope.addLoginReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
```
`since_seq: ulong` 은 `BigInt` 로 넣고, 받는 쪽은 `toNum(v, label)` (L249) 사용.

**파서 패턴** (L733-755 `readAccountEntries`, L803-811 `parseLoginResp`):
```ts
const n = takeCount(lr.accountsLength(), MAX_ACCOUNT_LIST_COUNT, "계좌 목록");
const scratch = new AccountEntry();
for (let i = 0; i < n; i += 1) {
  const e = lr.accounts(i, scratch);
  if (e === null) { skipAccount("entry-null", i, ""); continue; }
  ...  // 항목만 건너뛴다 — 프레임 전체를 버리면 정상 계좌까지 사라진다.
}
...
if (lr === null) return dropField("slot-null", MSG.LoginResp, { slot: "login_resp" });
```
→ `parseObserverLoginResp`(ObserverAccount 벡터), `parseJournalBatch`(레코드 벡터 — 새 `MAX_JOURNAL_BATCH_COUNT` 상수를 L96-122 상한 상수 옆에). 계좌번호는 `isValidAccountNo`(L283) 검사만, 재정규화 금지(Pitfall 7). 로그에는 `maskAccountNo`(L293).

---

### `relay/src/journal/observer.ts` (상태기계, event-driven)

**Analog:** `relay/src/dma/dma-client.ts` 재사용 + `relay/src/dma/session.ts` 로그인 흐름

**전송 계층은 새로 만들지 않는다** (`dma-client.ts` L118-183):
```ts
export type DmaClientOptions = { host: string; port: number; autoReconnect?: boolean };
export interface DmaClient {
  on(event: "up", listener: (e: TransportUpEvent) => void): this;
  on(event: "down", listener: (e: TransportDownEvent) => void): this;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): this;
  on(event: "reconnecting", listener: (e: TransportReconnectingEvent) => void): this;
}
```
- `up` → `buildObserverLoginReq(secret, sinceSeq, epoch)` 송신, `frame` 은 `e.generation === client.generation` 대조(세대 규율) 후 msg_type 분기.
- 인증 실패(D-13) → `stopReconnect(reason)` (L234-238):
```ts
stopReconnect(reason: string): void {
  this.#autoReconnect = false;
  this.#clearReconnectTimer();
  logger.warn({ reason }, "[DMA] 자동 재접속 중단 (재시도해도 결과가 같은 실패)");
}
```
- 상수 `PING_INTERVAL_MS`·`RECONNECT_MAX_DELAY_MS`·`backoffDelayMs` (L65-101) 재사용, 24h 상시(세션 grace 없음).
- 상태 변화는 EventEmitter 로 내보내 fanout 이 `journal.state` 스냅샷으로 전달.

---

### `relay/src/journal/writer.ts` (메모리 큐 + 직렬 RPC, batch)

**Analog:** `relay/src/store/orders.ts` `OrderStore` (L930~; 삭제 전에 패턴만 옮긴다)
- 큐 필드 `#queue: QueueItem[]` (L937), 진행 중 플래그로 tick 은 건너뛰고 종료는 기다리는 규율 (L944-945 주석), `unref` 타이머 (L1024), `flushNow()` → `close()` 종료 순서 (L928).
- 오류 로깅 규약 (L544, L646):
```ts
logger.error({ pgError: safePgError(error), column: sel.column }, "[orders] dma_orders update 실패");
```
→ `safePgError`(`relay/src/store/pg-error.ts`) 유지, 접두 `[journal]`. 무로그 catch 금지.
- Supabase 클라이언트는 `relay/src/store/supabase.ts` 에서 받아 `.rpc("dma_journal_apply", {...})` 1회/배치, 반환된 변경 행을 fanout 에 넘김.

---

### `relay/src/ws/fanout.ts` (pub-sub)

**사용자 격리 전달** (L1386-1397) — 저널 행 푸시도 반드시 이 경로:
```ts
#deliver(userId: string, msg: RelayOutbound): void {
  const entry = this.#users.get(userId);
  if (entry === undefined) return;
  for (const conn of entry.conns) { ... this.#send(conn, msg); }
}
```
`deliverJournalRows(rows)` 는 access 맵으로 계좌→사용자 집합을 풀어 `#deliver` 만 호출 (전역 순회 금지, T-15-02). `UserEntry` 에 `dmaUserId` 추가.

**결선 변경** (L400-416 / deps L266-267): `deps.orderStore !== undefined && deps.symbols !== undefined` → `deps.symbols !== undefined` 만. `WsFanoutDeps.orderStore` 와 `createOrderHandler` 의 `orderStore` 인자 제거, warn 문구 갱신.

---

### `relay/src/order/order-api.ts` (/healthz)

**Analog:** 자기 자신 L79-110 `HealthPayload`, L253-279 핸들러
```ts
const payload: HealthPayload = { status: healthy ? "ok" : "degraded", vpn: linkUp, dma: sessionsOk, ... };
res.status(healthy ? 200 : 503).json(payload);
```
- 새 필드(예: `journal: { state, lagMs }`)는 **식별자 금지**(주석 L79-81 규율 — seq/epoch 값 공개 여부 먼저 검토).
- 「장중 지연 → 503」은 `trading-window.ts` 판정을 주입받아 `healthy` 식에 AND. 기존 판정 문단(L200-250)처럼 날짜 붙은 ★ 보강 문단으로 근거를 남긴다(되돌리지 않는 추가임을 명시).

---

### `relay/src/config.ts` · `logger.ts` · `index.ts`

- config (L75-83): `dmaObserverSecret: get("DMA_OBSERVER_SECRET")` (필수) — `dmaCredKey` 와 동형.
- logger: redact 경로 배열에 `dmaObserverSecret`, `*.secret` 추가 (파일 헤더 L5-18 규율).
- index.ts: L111-121 OrderStore 생성·`start()`, L131 주입, L216-217 `flushNow`/`close` 를 observer+writer 생성·종료로 교체.

---

### `relay/tests/helpers/frames.ts` · `fake-gateway.ts`

**Analog:** `frames.ts` L257-280 `buildLoginRespFrame`
```ts
const b = new flatbuffers.Builder(256);
const message = b.createString(input.message ?? "");
// 문자열은 테이블 조립 **전에** 전부 만들어 둔다 (FlatBuffers 중첩 제약).
const entries = rows.map((a) => AccountEntry.createAccountEntry(b, b.createString(a.accountNo), b.createString(a.name ?? "")));
const accounts = LoginResp.createAccountsVector(b, entries);
LoginResp.startLoginResp(b); ... Envelope.addMsgType(b, MSG.LoginResp);
```
→ `buildObserverLoginRespFrame`, `buildJournalBatchFrame`. fake-gateway 에는 요청 리더 `readObserverLoginRequest(msgType, payload)` 를 L240-356 `read*Request` 형태로.

---

### `packages/shared/src/relay.ts` (model)

기존 `{ t: "..." }` 판별 유니온(L400~) 규약: `RelayJournalRowsMsg = { t: "journal.rows"; rows: JournalOrderRow[] }`, `RelayJournalStateMsg = { t: "journal.state"; ... }` 를 `RelayOutbound` 유니온에 추가. `DmaOrderRow` 는 webapp 전환 후 참조 0 이면 삭제/deprecated. 변경 후 `pnpm --filter @gh-radar/shared build` 먼저.

---

### `server/src/services/dma-orders.ts` (service)

**Analog:** 자기 자신 (L1-128)
- 유지: 서비스롤 `SupabaseClient` 인자 순수 함수, `DbError = (msg) => new ApiError(500, "DB_ERROR", msg)`, snake→camel `mapOrder`, `kstDayRangeUtc`(400 검증) 또는 `kstDateIso()` 를 RPC 파라미터로.
- 교체:
```ts
const { data, error } = await supabase.from("dma_orders").select(ORDER_COLS).eq("user_id", userId)...
if (error) throw DbError("주문 목록 조회에 실패했습니다.");
```
→ `supabase.rpc("dma_orders_for_user", { p_user_id: userId, p_date: day })` 1회. 소유권 필터는 이제 RPC 안(매핑 조인)이 정본 — 헤더 주석의 T-15-01 문단 갱신. `server/src/routes/orders.ts` L39 라우트는 형태 유지.

---

### `webapp/src/lib/orders-api.ts` (utility)

**Analog:** 자기 자신
- `fetchTodayOrders` (L55) → `authFetch<JournalOrderRow[]>("/api/orders")` 쿼리 없음 규약(주석 ②) 유지.
- `mergeTodayOrders` (L63-95) 의 「첫 등장만 취한다」 Map 패턴을 **키 `id`, 비교 `lastSeq` 큰 쪽** 으로 교체(D-03). 라이브 `{t:"order"}` 병합 경로·`unmatchedOrderNos` 는 토스트 전용 전환에 따라 제거.
- `STATUS_LABELS`/`STATUS_RANK` (L120-150) 표 형태 유지, `orderDisplayStatus` 는 단순화.

---

### `webapp/src/components/trading/origin-tag.tsx` (component, 추출)

**Analog:** `webapp/src/components/orderbook/account-panel.tsx` L1410-1420
```tsx
function OriginTag({ tag }: { tag?: AccountOriginTag }) {
  if (tag === undefined) return null;
  return (
    <span data-slot="account-origin-tag"
      className="whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted-fg)]">
      {tag}
    </span>
  );
}
```
export 하고 account-panel 은 import 로 교체. 「수동」 값 추가(D-08). `data-slot` 이름은 기존 테스트 셀렉터 호환 유지.

---

### `webapp/src/components/trading/today-orders-card.tsx` (component, B′)

**Analog:** 자기 자신(L100-492: `orderTime`, `stockLabel`, `RowKey`/`RowValue`, `SideTag` L451, `StatusTag` L477) + 확정 목업 `19-today-orders-mockup.html`
- 계좌별 그룹 헤더, 전 행 `OriginTag` + `ExchangeTag`(NXT), 로컬 거부 가격 「—」, 「· 수동」 꼬리 제거.
- 390px 줄바꿈: 목업 `.fix .l2{flex-wrap:wrap;row-gap:2px}` → Tailwind `flex-wrap gap-y-0.5`.
- 「기록 지연」 배지는 `journal.state` 프레임 구독. 뷰포트 브레이크포인트 `max-[1279px]` 유지(D-07, 상따 컨테이너쿼리 규칙 비적용).

---

### `scripts/deploy-relay.sh` · `scripts/setup-relay-iam.sh`

- deploy-relay.sh L184 사전검사 루프에 `gh-radar-dma-observer-secret` 추가, L312-314 옆에 `OBS_SECRET="$(fetch_secret gh-radar-dma-observer-secret)"`, env-file 에 `DMA_OBSERVER_SECRET`, 빈 값 검사 동일 형태.
- setup-relay-iam.sh L179 `for SECRET_NAME in ...` 에 추가.

## Shared Patterns

### 서비스롤 전용 잠금 (Supabase)
**Source:** `supabase/migrations/20260905120100_dma_credentials.sql` L50-54, `20260914090000_stock_comovement_inputs_rpc.sql` L90-92
**Apply to:** 신규 테이블 4종 · RPC 3종 — RLS 활성 + 정책 0 + `FROM PUBLIC` 그리고 `FROM anon, authenticated` 명시 REVOKE + `TO service_role` GRANT.

### 사용자 격리 전달
**Source:** `relay/src/ws/fanout.ts` L1386 `#deliver`
**Apply to:** journal.rows / journal.state 푸시 전부. 전역 브로드캐스트 경로 신설 금지.

### 오류 로깅 (무로그 fail-safe 금지)
**Source:** `relay/src/store/orders.ts` L544/646 (`safePgError`), `envelope.ts` `drop`/`dropField`/`skipAccount`
**Apply to:** observer · writer · 파서. catch 는 사유 필드와 함께 `logger.error/warn`, 비밀·계좌번호 원문 금지(`maskAccountNo`).

### 세대(generation) 규율
**Source:** `relay/src/dma/dma-client.ts` `generation` 게터 · `TransportFrameEvent.generation`
**Apply to:** observer 의 모든 비동기 콜백(로그인 응답·배치 처리 후 커서 반영).

### 날짜/휴장일
**Source:** `packages/shared/src/krxCalendar.ts` `isKrxHoliday` L33, `kstDateIso` L53
**Apply to:** trading-window.ts, server RPC 파라미터. 새 KST 계산 함수 금지.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| RPC apply 본문(plpgsql, advisory lock, ON CONFLICT 게이트 투영) | migration | transform | 기존 RPC 는 전부 `LANGUAGE sql` 조회용 — RESEARCH Pattern D 를 정본으로 |

(`relay/src/journal/access.ts` 는 partial analog 로 `store/gateway-symbols.ts` 메모리 맵 형태 참고.)

## Metadata

**Analog search scope:** supabase/migrations, supabase/tests, relay/src/{dma,ws,order,store}, relay/tests/helpers, server/src/services·routes, webapp/src/lib·components, packages/shared/src, scripts
**Files scanned:** ~25
**Pattern extraction date:** 2026-09-24
**gh-trade 의존:** 와이어 계약(fbs) 확정·`sync-relay-schema.sh` 생성물 커밋 전에는 envelope/msg-type/frames 확정 불가.
