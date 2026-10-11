# Phase 30: 인박스 KB 계좌별 주문자 IP/MAC - Pattern Map

**Mapped:** 2026-10-11
**Files analyzed:** 19 (신규 2 · 수정 17)
**Analogs found:** 19 / 19 (전부 git 추적 소스 — 미러 경로 없음)

> 이번 phase 는 신규 패턴이 없다. 모든 변경이 Phase 29 코드의 **같은 파일 안 확장**이라, 대부분 「analog = 자기 자신의 이웃 코드」다. 플래너는 아래 줄 번호를 그대로 action 에 인용하면 된다.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `packages/shared/src/order-endpoint.ts` (신규) | utility (순수 함수) | transform | `packages/shared/src/order-server.ts` | exact |
| `packages/shared/src/__tests__/order-endpoint.test.ts` (신규) | test | transform | `packages/shared/src/__tests__/order-server.test.ts` | exact |
| `packages/shared/src/index.ts` | config (barrel) | — | 같은 파일 :224 `export * from "./order-server";` | exact |
| `packages/shared/src/admin.ts` | model + transform | transform | 같은 파일 `orderServer?` 선택 필드(:185-191) · `deriveAdminUsersOverview`(:740) · `sameValues`(:409-418) | exact |
| `packages/shared/src/__tests__/admin.test.ts` · `admin-overview.test.ts` | test | transform | 기존 파일 | exact |
| `relay/src/admin/dispatcher.ts` | service | request-response (op 5 → op 1/3) | 같은 파일 `#applyServer`(:279-330) · `reconcileUser`(:142) | exact |
| `relay/src/admin/planner.ts` (D-16 R3-02) | service (순수 계획기) | transform | 같은 파일 `snapByNo` · `withServerEndpoint`(:76-83, :106-111) | exact |
| `relay/src/admin/admin-api.ts` | controller (내부 HTTP) | request-response | 같은 파일 PUT `/dma-users/:dma/accounts`(:421-434) · GET `/servers/status`(:581) | exact |
| `relay/tests/admin-dispatcher.test.ts` | test | — | 같은 파일 `FakeConn`(:96-135) | exact |
| `relay/tests/admin-planner.test.ts` · `admin-api.test.ts` | test | — | 기존 파일 | exact |
| `server/src/schemas/admin.ts` | validation schema | — | 같은 파일 `AdminPutAccountSchema`(:157-162) | exact |
| `server/src/routes/admin.ts` | controller | request-response | GET `/users`(:179-192) ← 병합 모양은 `server/src/routes/admin-servers.ts:94-118` | exact |
| `server/src/services/relay-admin-client.ts` | service (HTTP client) | request-response | 같은 파일 `serversStatus`(:106 · :313-314) | exact |
| `server/tests/routes/admin.test.ts` · `admin-dma.test.ts` · `services/relay-admin-client.test.ts` · `fixtures/fake-relay-admin.ts` | test | — | `server/tests/routes/admin-servers.test.ts`(relay 병렬 · null 폴백) | exact |
| `webapp/src/components/admin/account-editor.tsx` | component | request-response (폼 → PUT) | 같은 파일 `AccountRow`(:330-) · `AccountAddForm`(:603-) | exact |
| `webapp/src/components/admin/__tests__/account-editor.test.tsx` | test | — | 기존 파일 | exact |
| `webapp/e2e/fixtures/admin.ts` · `webapp/e2e/specs/admin.spec.ts` | test (E2E) | — | 기존 파일 | exact |
| `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` | doc | — | `docs/inbox/from-gh-trade/README.md` 형식 · 선례 `261005-member-top-int64.md`(`done_commit`) | exact |

---

## Pattern Assignments

### `packages/shared/src/order-endpoint.ts` (utility, transform) — 신규

**Analog:** `packages/shared/src/order-server.ts` (헤더 JSDoc 로 「규칙 한 벌 · 소비자 둘」 을 먼저 적고, 입력 타입 + 순수 함수)

**모양** (order-server.ts:1-44 요지):
```ts
/** Phase 29 Plan 46 — GC-06 … 규칙: … 소비자 둘 — **등록 목록만 달리 넣고 규칙은 이 함수 하나**(두 벌 금지) */
export type EffectiveOrderServerInput = { designated?: string | null; defaultKey?: string | null; registered: readonly string[]; defaultUnknown?: boolean };
export function resolveEffectiveOrderServer(input: EffectiveOrderServerInput): EffectiveOrderServer | null {
  const { designated, defaultKey, registered, defaultUnknown } = input;
  if (designated) return { key: designated, via: "designated" };
  …
}
```
- 헤더에 「gh-trade `AccountUtil.h` `NormalizeOrderIp/Mac` 이식 · trim 하지 않는다(호출자 몫)」 명시.
- 넣을 것: `normalizeOrderIp` · `normalizeOrderMac`(RESEARCH Pattern 4 골격 그대로 — `""`=빈 입력, `null`=형식 오류) · `validateOrderEndpointInput`(UI-SPEC §3 오류 우선순위 IP → MAC → 짝, 비어 있는 칸 표시) · `summarizeOrderEndpoint`(출처 = `resolveEffectiveOrderServer` 결과 key, 없으면 레지스트리 순 첫 active; `state: "set"|"unset"|"unknown"`; `mismatches[]`).
- `summarizeOrderEndpoint` 는 `resolveEffectiveOrderServer` 를 **import 해서 호출**(두 벌 금지 — GC-06).
- `index.ts` 에 `export * from "./order-endpoint";` 를 :224 옆에 추가.
- **주의(Pitfall 2):** shared 는 `dist` 로 소비 — 이 파일을 고친 태스크 끝에 `pnpm --filter @gh-radar/shared build`.

### `packages/shared/src/__tests__/order-endpoint.test.ts` — 신규

**Analog:** `packages/shared/src/__tests__/order-server.test.ts:1-20`
```ts
/** Phase 29-46 — GC-06 … 표. */
import { describe, expect, it } from "vitest";
import { resolveEffectiveOrderServer } from "../order-server";

describe("resolveEffectiveOrderServer — 유효 주문 서버 규칙 한 벌 (29-46 GC-06)", () => {
  it.each([
    { name: "지정 KB121 → 지정이 이긴다(등록 여부 무관)", input: {...}, expected: {...} },
```
- 같은 `it.each([{ name, input, expected }])` 표 형식으로 gh-trade 표본(12자리 · 점표기 · 256 · 빈 옥텟 · 꼬리 · 5옥텟 · 4자리 옥텟 · 구분자 · 대소문자 · `"::"`) 을 깐다.

---

### `packages/shared/src/admin.ts` (model + transform)

**선택 필드 추가 선례** (:185-191 — 기존 픽스처 호환):
```ts
  /**
   * 계좌 주문 서버 지정(29-37 G-1 ⑥) — … 선택 필드(기존 픽스처 호환) — `deriveAdminUsersOverview` 는 늘 채운다.
   */
  orderServer?: string | null;
  defaultOrderServer?: string | null;
```
→ `AdminAccountView.orderEndpoints?: Record<string, { orderIp: string; orderMac: string } | null>` 을 같은 주석 문체로.

**PUT 본문** (:325-328):
```ts
export interface AdminPutAccountBody {
  account: AdminAccountInput;
  servers: string[];
}
```
→ `orderEndpoint?: { orderIp: string; orderMac: string };` 추가(계좌 객체 **밖** — RESEARCH Pattern 2). `AdminOrderEndpointsRaw = { servers: Record<string, {dmaUserId; accountNo; orderIp; orderMac}[]> }` 타입 신설.

**파생 시그니처** (:740):
```ts
export function deriveAdminUsersOverview(raw: AdminUsersRaw): AdminUsersOverview {
```
→ `(raw: AdminUsersRaw, endpoints?: AdminOrderEndpointsRaw | null)`. `userAccounts(idx, …)` 안 계좌 뷰 생성 지점에서 active 등록 서버마다 `normalizeAccountNo` 키로 조회해 채운다(서버 키 없음 / 계좌 없음 = `null`).

**멱등 비교** (:409-418 — GC-02 규칙 유지):
```ts
function sameValues(intent: AdminAccountFields, snap: AdminAccountFields): boolean {
  return ( intent.name === snap.name && …
    (intent.orderIp === undefined || intent.orderIp === (snap.orderIp ?? "")) &&
    (intent.orderMac === undefined || intent.orderMac === (snap.orderMac ?? "")) );
}
```
→ `undefined` 제외 규칙은 그대로, 비교만 `(normalizeOrderIp(x) ?? x)` (정규화 실패 = 원문 비교 — gh-trade `Gateway.cpp` 와 동형).

**로그 금지 규약** — :97-100 주석(「사용자 PC 식별 정보 — 로그 금지」) 을 새 타입 주석에도 반복.

---

### `relay/src/admin/dispatcher.ts` (service, request-response) — IPMAC-01 · D-15

**Analog:** 같은 파일 `#applyServer` (:279-283 지금 계획 지점):
```ts
    const admin = this.#deps.pipelines.get(serverKey)?.admin;
    const snapshot = admin?.currentSnapshot() ?? null;
    if (admin === undefined || snapshot === null) return { server: serverKey, outcome: "offline" };
    const p = plan(snapshot);
    if (p.status === "no-snapshot") return { server: serverKey, outcome: "offline" };

    let usersRev = snapshot.usersRev.toString();
```
→ RESEARCH Pattern 1 골격(:196-218) 그대로 삽입: `p.ops` 에 op 3 또는 `passwordOnly` 아닌 op 1 이 있으면 `admin.command({ op: ADMIN_OP.ListUsers, userId: "" })` → `kind !== "result" || snapshot === undefined` 면 `timeout`/`offline` 로 **44 미송신 반환(fail closed)** → 새 스냅샷으로 `plan()` 재호출. `const snapshot` → `let`.

**op 실패 결과 모양** (같은 루프 :300-312 — 그대로 재사용):
```ts
      const outcome = await admin.command(input);
      if (outcome.kind !== "result") {
        failure = { server: serverKey, outcome: outcome.kind };
        break;
      }
```

**reconcileUser 옵션** (:142-149):
```ts
  reconcileUser(
    dmaUserId: string,
    opts: { password?: string; adminEmail: string; deadlineAt?: number },
  ): Promise<AdminServerResult[]> {
    const progress = newProgress();
    const full = this.#serial(dmaUserId, async () => {
      const intent = await this.#deps.store.intent(dmaUserId);
```
→ `opts.orderEndpoint?: { broker; accountNo; orderIp; orderMac }` 추가, `intent` 를 받은 직후 RESEARCH :254-259 의 `intent.map(...)` 으로 해당 active 행(`normalizeAccountNo` 비교)에만 `orderIp/orderMac` 을 얹는다. DB 저장 없음.

**로그 규약** — 같은 파일 :291-294 처럼 로그 객체에는 `server` · `op` · `reason` 만. IP/MAC 값 금지.

### `relay/src/admin/planner.ts` (transform) — D-16 R3-02

**Analog:** 같은 파일 :106-111
```ts
  const snapByNo = new Map<string, AdminAccountFields>();
  for (const a of snapUser?.accounts ?? []) {
    const k = normalizeAccountNo(a.accountNo);
    if (!snapByNo.has(k)) snapByNo.set(k, a);
  }
  const sendable = (a: AdminAccountFields): AdminAccountFields => withServerEndpoint(a, snapByNo.get(a.accountNo));
```
→ 그 유저 87 에 계좌가 없을 때의 폴백 맵(`otherByNo`)을 `input.snapshot.users` 중 **다른 유저**의 같은 정규화 번호(IP/MAC 비어 있지 않은 것)로 만들고 `snapByNo.get(k) ?? otherByNo.get(k)` 로 넘긴다. 우선순위는 `withServerEndpoint`(:80-83) 가 이미 보장 — 의도(override) 쌍 > 87 값 > `""`:
```ts
function withServerEndpoint(account: AdminAccountFields, snap: AdminAccountFields | undefined): AdminAccountFields {
  const src = account.orderIp !== undefined || account.orderMac !== undefined ? account : snap;
  return { ...account, orderIp: src?.orderIp ?? "", orderMac: src?.orderMac ?? "" };
}
```
- D-15 덕에 이 `snapshot` 은 op 5 로 새로 받은 87 이다(dispatcher 재계획). D-11 일괄 반영은 하지 않는다.

### `relay/src/admin/admin-api.ts` (controller)

**PUT 라우트 analog** (:421-434):
```ts
  router.put("/dma-users/:dma/accounts", async (req, res) => {
    const deadlineAt = deadlineOf();
    const { dma } = DmaParam.parse(req.params);
    const body = PutAccountBody.parse(req.body);
    assertKnownServers(body.servers);
    const { results } = await audited(res, "PUT /dma-users/:dma/accounts", dma, async () => {
      await deps.store.putAccount(dma, body.account, body.servers);
      return { results: await deps.dispatcher.reconcileUser(dma, { adminEmail: res.locals.adminEmail as string, deadlineAt }) };
    });
```
→ `store.putAccount` 인자는 그대로(IP/MAC 미적재), `reconcileUser` 옵션에만 `orderEndpoint` 전달(RESEARCH Code Examples :430-444).

**스키마 analog** (:168): `const PutAccountBody = z.object({ account: AccountSchema, servers: ServersSchema });` → `orderEndpoint: OrderEndpointSchema.optional()` + `.superRefine` 로 `broker !== "KB"` 거부(Pitfall 7). 형식 검사 금지(code 13 도달 보장). 오류는 기존 `toRelayError`(ZodError → 400 `VALIDATION_FAILED`)가 처리.

**GET 경로 analog** — `router.get("/servers/status", (_req, res) => {…})` (:581). 같은 모양으로 `router.get("/order-endpoints", …)` (RESEARCH :295-306 골격). deps 타입 :78-80
```ts
  pipelines: {
    get(key: string): { admin: { health(): { state: string } }; status: { health(nowMs: number): { state: string } } } | undefined;
  };
```
→ `admin` 에 `currentSnapshot(): AdminUsersSnapshot | null` 추가(실객체는 이미 만족). `relay/tests/admin-api.test.ts` 스텁도 같이(`typecheck:tests`).

### `relay/tests/admin-dispatcher.test.ts` (test) — Wave 0

**Analog:** `FakeConn.command` (:120-135):
```ts
  async command(input: CommandInput): Promise<AdminCommandOutcome> {
    this.sent.push(structuredClone(input));
    if (this.mode === "offline") return { kind: "offline" };
    if (this.mode === "timeout") { await sleep(this.timeoutMs); return { kind: "timeout" }; }
    if (this.delayMs > 0) await sleep(this.delayMs);
```
→ op 5 분기를 `sent.push` **앞**에: `refreshes++`, mode 존중, 정상이면 `this.#snapshot = snapshotOf(this.state)` 후 `{ kind: "result", result: {code:0, usersRev…}, snapshot }`. 기존 `sent` 단언 보존(Pitfall 3). R3-01 회귀 = `state` 만 바꾸고 캐시는 그대로 둔 채 reconcile.

---

### `server/src/schemas/admin.ts` (schema)

**Analog** (:157-162):
```ts
export const AdminPutAccountSchema = z
  .object({
    account: AdminAccountInputSchema,
    servers: ServerListSchema,
  })
  .superRefine(checkServersMatchBroker);
```
→ `orderEndpoint: OrderEndpointSchema.optional()` + 두 번째 `.superRefine` 로 KB 만(RESEARCH :449-463). 구조 · 길이만, 형식 검사 없음. **zod 기본 strip — 이 변경 없이 webapp 이 나가면 IP/MAC 이 조용히 사라진다(Pitfall 1 · 배포 relay → server → webapp).**

### `server/src/routes/admin.ts` (controller)

**현재 GET /users** (:179-192):
```ts
adminRouter.get("/users", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.rpc("admin_users_raw");
    …
    res.json(deriveAdminUsersOverview(data as AdminUsersRaw));
```
**병합 analog** — `server/src/routes/admin-servers.ts:94-118`:
```ts
async function fetchLiveStatus(req: Request): Promise<Record<string, AdminServerLiveStatus> | null> {
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  if (!relay) return null;
  const r = await relay.serversStatus(req.adminEmail!);
  const servers = r.status === 200 ? r.data?.servers : undefined;
  if (servers && typeof servers === "object" && !Array.isArray(servers)) return servers;
  logger.warn({ relay: { op: "servers-status", status: r.status } }, "[admin] relay 서버 상태 조회 실패 — 상태 null");
  return null;
}
…
    const [{ data, error }, live] = await Promise.all([
      supabase.rpc("admin_servers_raw"),
      fetchLiveStatus(req),
    ]);
```
→ `fetchOrderEndpoints(req)` 를 같은 모양(실패 = null · 200 유지 · 로그엔 status 만)으로 만들고 `Promise.all` 로 병렬.

**PUT 감사** (:396-408):
```ts
    audit(req, "dma-account-put", maskDmaUserId(dma), {
      broker: body.account.broker,
      servers: results.map((x) => `${x.server}:${x.outcome}`),
    });
```
→ `orderEndpoint: body.orderEndpoint ? (body.orderEndpoint.orderIp === "" ? "clear" : "set") : undefined` 플래그만 추가(값 금지 — Pitfall 6).

### `server/src/services/relay-admin-client.ts` (HTTP client)

**Analog** (:106 인터페이스 · :313-314 구현):
```ts
  serversStatus(adminEmail: string): Promise<RelayAdminResponse<RelayServersStatus>>;
…
    serversStatus: (adminEmail) =>
      request<RelayServersStatus>("GET", "/internal/admin/servers/status", adminEmail),
```
→ `orderEndpoints: (adminEmail) => request<AdminOrderEndpointsRaw>("GET", "/internal/admin/order-endpoints", adminEmail)`. `server/tests/fixtures/fake-relay-admin.ts` 에도 같은 메서드 스텁.

---

### `webapp/src/components/admin/account-editor.tsx` (component)

**문구 상수** (:60-82 `ACCOUNT_EDITOR_TEXT`) — UI-SPEC Copywriting 표의 키(`edit` · `save` · `editCancel` · `editSave` · 라벨 · 도움말 · 교보 · 검증 3종 · 「변경 없음」 · 「다른 계좌 편집 중」 · 「이름 없음」 · 미설정/확인 전 · 불일치 함수형)를 같은 객체에 추가. `cancel: "취소"` 재사용.

**클래스 상수** (:256-283) — 새 상수는 `EDIT_ERROR_LINE` 하나만, `WARN_LINE`(:278) 옆에:
```ts
const NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
const ERROR_LINE = "mt-1.5 text-[12.5px] break-keep text-[var(--destructive)]";
const WARN_LINE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--led-latent)]";
const ROW_FLASH = "[&_[data-state=checked]]:border-[var(--led-armed)]! …";
```
→ `const EDIT_ERROR_LINE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--destructive)]";`

**읽기 줄 analog** — `BranchTrader` (:289-297):
```tsx
    <p data-slot="admin-account-branch" className="mt-1 text-[12px] text-[var(--muted-fg)]">
      지점 {kb ? account.branchNo || "—" : na} · 트레이더 {kb ? account.traderId || "—" : na}
    </p>
```
→ 바로 아래 `OrderEndpointLine`(`data-slot="admin-account-ipmac"` · `tabular-nums` · KB 만) + 불일치 `WARN_LINE`(`data-slot="admin-account-ipmac-mismatch"`). 값은 shared `summarizeOrderEndpoint` 결과만 그린다(재정규화 금지).

**제목줄** — `AccountTitle` (:299-310): `{account.name && <span …>}` → 빈 이름이면 `--faint` 「이름 없음」, 편집 모드면 이름 숨김. 「편집」 버튼은 children 슬롯에서 「제거」 **왼쪽**에 같은 조합:
```tsx
        <Button type="button" size="sm" variant="secondary"
          aria-label={`${account.broker} ${account.accountNo} ${ACCOUNT_EDITOR_TEXT.remove}`}
          disabled={remove.state === "saving"}
          onClick={…}
          className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}>
```

**저장 훅 analog** — `AccountAddForm` (:614-622):
```tsx
  const save = useFieldSave<AdminPutAccountBody>((body) => putDmaAccount(dmaUserId, body), {
    retainValue: false,
    onSuccess: (body, res) => {
      if (res) onResults(accountKeyOf(body.account.broker, body.account.accountNo), res.results);
      onChanged();
      onClose();
    },
  });
```
→ 편집 저장도 같은 모양. 단 `onSuccess` 는 서버 일부 실패에도 불리므로 `res.results.every(r => r.outcome === "ok")` 일 때만 닫기. 본문은 RESEARCH :466-472(`{ ...accountInputOf(account), name: draft.name.trim() }` · servers = 현재 active · 필요 시만 `orderEndpoint` 원문 trim).

**폼 · 버튼 줄 analog** — `AccountAddForm` 의 `<form onSubmit>` + 끝부분(:755-766):
```tsx
      {save.error && (<p role="alert" className={ERROR_LINE}>{save.error}</p>)}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="secondary" onClick={onClose} className={cn(ADMIN_BUTTON_SECONDARY, ACCOUNT_BUTTON)}>…취소</Button>
        <Button type="submit" size="sm" disabled={!ready} className={cn(ADMIN_BUTTON_PRIMARY, ACCOUNT_BUTTON)}>…</Button>
      </div>
```
→ 편집 폼은 `<form data-slot="admin-account-edit">`, 동작 줄은 `mt-2.5` 추가, 오류 줄은 `EDIT_ERROR_LINE`, 계좌명 `Input size="sm" maxLength={40}`(추가 폼 :699-702 와 같게). 검증은 추가 폼의 `noInvalid`/`ready` 파생 방식(:625-635)처럼 렌더 중 계산.

**토글 경합(Pitfall 4)** — `toggle` 훅 (:343-351) `putDmaAccount(dmaUserId, { account: accountInputOf(account), servers })` 의 이름을 「마지막 저장 이름 ?? 개요 이름」 으로. `order` 훅의 `releaseOn: account` (:375-380) 선례를 편집 저장 훅에 적용.

**flash** — :394 `cn(ACCOUNT_CARD, toggle.state === "flash" && ROW_FLASH)` → 편집 저장 flash OR, 편집 중이면 `border-[var(--primary)]` + `data-editing="true"`.

**한 카드 잠금 · BusyLines 중복 제거** — `AccountEditor`(:789-) 에 `editingKey` 상태, `shownChips`(:818-827) 에서 편집 저장 출처 칩(`ChipView` 에 `source?: "edit"`)을 거른다.

### `webapp/src/components/admin/__tests__/account-editor.test.tsx` · E2E

- 버튼은 접근 이름으로 찾는다: `getByRole("button", { name: "KB 377-28-502101 편집 저장" })`(UI-SPEC).
- `webapp/e2e/fixtures/admin.ts` 계좌 픽스처에 `orderEndpoints` · PUT 본문 기록; `admin.spec.ts` 에 `P30` 시나리오(390 · 1080, `--workers=1`).

### `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` (doc)

- 형식 정본 `docs/inbox/from-gh-trade/README.md` — frontmatter `status: done` · `done_commit: <해시>`, 경로 지정 커밋. 질문 3개 답(D-12~14) · 「KB 운영 서버 값 설정 보류 권고」 해제는 **배포 확인 뒤**.

---

## Shared Patterns

### 87 이 정본 · DB 우회
**Source:** `relay/src/admin/planner.ts:63-83` (`fieldsOf` · `withServerEndpoint`)
**Apply to:** dispatcher · planner · admin-api — IP/MAC 은 의도 행에 「있을 때만」 싣고, 없으면 87 값 보존. DB(`store.putAccount`)에는 절대 싣지 않는다.

### relay 상태 병렬 병합 + null 폴백
**Source:** `server/src/routes/admin-servers.ts:94-118`
**Apply to:** `server/src/routes/admin.ts` GET /users — relay 실패는 null, 응답 200 유지, 파생 함수 두 번째 인자.

### 결과 = 서버별 칩 + 카드 안 줄, 서버 문구 원문
**Source:** `account-editor.tsx` `chipOfResult`(:108) · `BusyLines`(:160) · `busyLineText`(:146) · `skippedLineText`(:151)
**Apply to:** 편집 저장 결과 줄(「{서버키} 실패: {message}」 / 「{서버키} 미반영: …」). 토스트 없음, 문구 대조 없음.

### 오류 변환
**Source:** `relay/src/admin/admin-api.ts` `toRelayError` (ZodError → 400 `VALIDATION_FAILED`, 입력값 미포함) · server `parseOrThrow`
**Apply to:** 새 `orderEndpoint` 스키마 거부 경로.

### IP/MAC 로그 금지
**Source:** `packages/shared/src/admin.ts:97-100` · `relay/src/admin/types.ts:92-99` 주석 · server `audit()` (:155)
**Apply to:** 모든 로그 · 감사 — 값 대신 `"set" | "clear"` 플래그 / 개수.

### shared 빌드 선행
**Source:** `packages/shared/package.json` (`main: ./dist/index.cjs`)
**Apply to:** shared 를 고친 모든 태스크 → `pnpm --filter @gh-radar/shared build` 후 다른 워크스페이스 테스트.

## No Analog Found

없음. (gh-trade 정규화 규칙 이식은 외부 원문 `~/repos/gh-trade/server/src/broker/base/AccountUtil.h:42-131` 이 기준 — RESEARCH Pattern 4 골격 사용.)

## Metadata

**Analog search scope:** `packages/shared/src` · `relay/src/admin` · `relay/tests` · `server/src/{routes,schemas,services}` · `server/tests` · `webapp/src/components/admin` · `webapp/e2e` · `docs/inbox/from-gh-trade`
**Files scanned:** 약 15
**Pattern extraction date:** 2026-10-11
