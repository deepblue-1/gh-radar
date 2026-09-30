# Phase 26: 시세 전용 공유 연결 — relay 종목 단위 팬아웃 - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 22 (신규 5 · 수정 17)
**Analogs found:** 22 / 22 (모든 경로 `git ls-files` 로 추적 확인. `relay/src/quote/` 는 아직 없음 — 신규)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `relay/src/quote/feed.ts` (신규) | service (상태기계) | event-driven / TCP 스트리밍 | `relay/src/journal/observer.ts` (+ `HubSession` 표면 `relay/src/hub/subscription-hub.ts:148-166`) | role-match (상태기계 뼈대만 복사, 저널 의존 제거) |
| `relay/src/quote/status.ts` (신규) | service (상태 요약) | event-driven → frame + healthz | `relay/src/journal/status.ts` | exact |
| (선택) `relay/src/quote/codec.ts` 또는 feed 내부 분류 | utility | transform | `relay/src/journal/codec.ts:23-47` | exact |
| `relay/src/hub/subscription-hub.ts` | service (hub) | pub-sub | 자기 자신 (현행 subKey·#refs·#sendSubscribe·#onReady·#clearCaches) | self |
| `relay/src/ws/fanout.ts` | controller (wss) | pub-sub / request-response | 자기 자신 (`sub` 처리 · `#deliver` · `deliverJournalState` · `rejectFrame`) | self |
| `relay/src/dma/envelope.ts` | utility (codec) | transform | `buildObserverLoginReq`/`parseObserverLoginResp` :2721-2800 | self |
| `relay/src/journal/types.ts` | model | — | `ObserverLoginResult` :125-145 | self |
| `relay/src/order/order-api.ts` | controller (healthz) | request-response | `/healthz` 핸들러 :290-346 (journal 축) | self |
| `relay/src/config.ts` | config | — | `DMA_OBSERVER_SECRET` 읽기 :115-118 | self |
| `relay/src/index.ts` | config (부팅 결선) | — | `createJournalPipeline` :122-137 · 결선 :211-221 · start :266 | self |
| `relay/src/generated/stock-dma/observer-login-{req,resp}.ts` · `StockDMA.fbs` | generated | — | `sync-relay-schema.sh` 결과만 커밋 | n/a (수기 편집 금지) |
| `relay/tests/helpers/frames.ts` | test helper | — | `buildObserverLoginRespFrame` :1320-1345 | self |
| `relay/tests/helpers/fake-gateway.ts` | test helper | — | `ObserverLoginRequest` :111 · `readObserverLoginRequest` :274 · `startFakeGateway` :548 | self |
| `relay/tests/quote-feed.test.ts` (신규) | test | event-driven | `relay/tests/journal-observer.test.ts` (`FakeTransport` :42 · `FakeCodec` :93) | exact |
| `relay/tests/quote-gateway.test.ts` (신규) | test | 실 TCP | `relay/tests/journal-gateway.test.ts` | exact |
| `relay/tests/quote-status.test.ts` (신규) | test | — | `relay/tests/journal-status.test.ts` | exact |
| `relay/tests/hub.test.ts` · `fanout.test.ts` · `order-api.test.ts` | test | — | 자기 자신 (`FakeSession` hub.test.ts:103 · `decodeReq` :61) | self (빅뱅 재작성) |
| `packages/shared/src/relay.ts` | model (와이어 타입) | — | `RelayJournalStateMsg` :1286-1291 · `RelayOutbound` :1327-1348 | exact |
| `webapp/src/lib/use-relay-socket.ts` | hook (리듀서) | event-driven | `journalState` :405-408 · :661 · :701 · `applyFrame` :853-855 · :2025 | exact |
| `webapp/src/components/trading/workbench/workbench-status-bar.tsx` | component | — | DMA 필 :122-133 | self |
| `webapp/src/components/trading/me-client.tsx` (`MeStatusBar`) | component | — | :168-190 | self |
| `webapp/e2e/fixtures/relay.ts` | test fixture | — | `withLocalRelay` (`DMA_OBSERVER_SECRET: ''` :~696) · `gatewaySocket()` :~741-760 | self |

주의: 조율 컨텍스트의 `webapp/src/components/trading/workbench-status-bar.tsx`, `webapp/src/app/me/me-client.tsx` 경로는 존재하지 않는다. 정확한 추적 경로는 위 표(`.../trading/workbench/workbench-status-bar.tsx`, `.../trading/me-client.tsx`)다. `/healthz` 는 `index.ts` 가 아니라 `order/order-api.ts` 에 있다.

## Pattern Assignments

### `relay/src/quote/feed.ts` (service, event-driven)

**Analog:** `relay/src/journal/observer.ts` — 상태기계 뼈대만. `start()` 의 커서 로드(:222-242)·`writer`/`access` 의존은 복사하지 않는다(RESEARCH Pattern 2, Anti-pattern 「JournalObserver 에 role 분기」).

**client 이름 상수** (observer.ts:64) — quote 는 다른 값으로:
```ts
export const OBSERVER_CLIENT_NAME = "gh-radar-relay";
// → QUOTE_CLIENT_NAME = "gh-radar-relay/quote"
```

**up → 로그인 송신 → 타이머** (observer.ts:248-279, 축약 대상):
```ts
#handleUp(e: TransportUpEvent): void {
  const transport = this.#transport;
  if (transport === null || this.#stopped) return;
  if (e.generation !== transport.generation) return; // 구세대
  if (this.#state === "rejected") { logger.warn(...); return; }
  const secret = this.#deps.secret;
  if (secret === undefined || secret === "") return;
  const payload = this.#deps.codec.buildLoginReq({ secret, sinceSeq, epoch, client: this.#client, strategySinceSeq });
  this.#setState("logging_in");
  if (!transport.send(payload)) { this.#dropTransport("관찰자 로그인 송신 실패"); return; }
  logger.info({ gateway, sinceSeq, strategySinceSeq, epoch }, "[JOURNAL] 관찰자 로그인 요청");
  this.#armLoginTimer(e.generation);
}
```
quote 페이로드: `{ secret, sinceSeq: 0, epoch: "", client: "gh-radar-relay/quote", strategySinceSeq: 0, role: 1 }`. 로그 태그는 `[QUOTE]`. 비밀은 로그 금지(T-19-03).

**down** (observer.ts:282-287):
```ts
#handleDown(e: TransportDownEvent): void {
  this.#clearLoginTimer();
  if (this.#stopped || this.#state === "rejected" || this.#state === "disabled") return;
  logger.warn({ gateway, reason: e.reason }, "[JOURNAL] 관찰자 연결 끊김 — DmaClient 가 재접속한다");
  this.#setState("connecting");
}
```
→ quote 는 여기서 `reconnects++`, `role_mismatch` 도 early-return 목록에 추가.

**frame 동기 처리** (observer.ts:290-300): 세대 검사 → `rejected` 무시 → 분기. quote 는 79 만 스스로 소비하고 나머지는 `this.emit("frame", e)` 로 hub 에 넘긴다(HubSession 과 같은 이벤트 모양).

**로그인 판단** (observer.ts:322-331) + 거부 (observer.ts:449-456):
```ts
#onLogin(result: ObserverLoginResult): void {
  if (this.#state !== "logging_in") { logger.warn(..., "예상 밖 시점의 관찰자 로그인 응답 — 무시"); return; }
  this.#clearLoginTimer();
  if (!result.success) { this.#reject(result.message); return; }
  ...
}
#reject(gatewayMessage: string): void {
  logger.error({ gateway, gatewayMessage }, "[JOURNAL] 관찰자 로그인 거부 — 재접속 중단 (D-13)");
  const transport = this.#transport;
  // 루프를 먼저 끊고 전송을 닫는다 — 순서가 바뀌면 닫힘이 부른 down 이 재접속을 예약한다.
  transport?.stopReconnect("관찰자 로그인 거부");
  transport?.destroy();
  this.#setState("rejected");
}
```
quote 추가: `result.success && result.role !== 1` → 같은 순서(stopReconnect → destroy)로 `role_mismatch` (Pitfall 2). 성공이면 `ready` + `emit("ready", …)`.

**로그인 타이머** (observer.ts:485-504): `#armLoginTimer(gen)` / `#clearLoginTimer()` 그대로 복사 (`unref?.()` 포함, 세대 재검사).

**hub 가 요구하는 표면** (subscription-hub.ts:148-166 `HubSession`):
```ts
readonly isReady: boolean;
send(payload: Uint8Array): boolean;
on(event: "frame", listener: (e: TransportFrameEvent) => void): unknown;
on(event: "ready", listener: (e: SessionReadyEvent) => void): unknown;
```
→ `HubQuoteFeed` 인터페이스로 `userId`·`allowedAccounts` 를 뺀 형태. `QuoteFeed` 가 구조적으로 만족.

**재사용 부품:** `DmaClient`(dma-client.ts, `PING_INTERVAL_MS` :71), `LOGIN_RESP_TIMEOUT_MS`(session.ts), `ObserverTransport`(journal/types.ts:210-226).

---

### `relay/src/quote/status.ts` (service, event-driven → frame + healthz)

**Analog:** `relay/src/journal/status.ts` — 구조 그대로 복제.

**imports + 상수 + 알림 판정** (status.ts:28-52):
```ts
import { EventEmitter } from "node:events";
import type { RelayJournalStateMsg } from "@gh-radar/shared";
import { inTradingWindow } from "./trading-window.js";

export const JOURNAL_DELAYED_AFTER_MS = 10_000;
export const JOURNAL_ALERT_AFTER_MS = 180_000;

export function journalAlerting(health: JournalHealth, now: Date): boolean {
  if (!inTradingWindow(now)) return false;
  if (health.state === "rejected") return true;
  if (health.state === "live" || health.state === "disabled") return false;
  return (health.disconnectedSec ?? 0) * 1000 >= JOURNAL_ALERT_AFTER_MS;
}
```
→ `quoteAlerting`: D-16 에 따라 **`rejected`·`role_mismatch` 검사를 `inTradingWindow` 보다 먼저**(창과 무관하게 즉시 503). 그다음 창 밖 false, `disabled` false, 유예 `QUOTE_ALERT_AFTER_MS`(권고 60초 — Pitfall 7). import 는 `../journal/trading-window.js`. 디바운스 `QUOTE_DOWN_AFTER_MS` 권고 3초.

**관찰자 view 타입** (status.ts:54-64 `StatusObserverView`): `state` + `on/off("state")` 만 남긴다.

**클래스 골격** (status.ts:88-128): `interface JournalStatus { on("frame") ; emit("frame") }` 선언 병합 → `class extends EventEmitter` · `#notLiveSinceMs` 는 기동 시각 · 생성자에서 `observer.on("state", #onChange)` · `frame()` 은 `#lastFrame`(모르면 null) · `health(nowMs)` 는 식별자 없는 계수만.
```ts
frame(): RelayJournalStateMsg | null { return this.#lastFrame; }
```

**재평가** (status.ts:~180-200 `#reevaluate`): live 로 복귀 시 타이머 해제 + 직전 프레임이 down/없음일 때만 live 발행; disabled 는 프레임 없음. quote 프레임은 `{ t: "quote.state", s: "live" | "down", since? }`.

**`health()` 필드** (RESEARCH Pattern 8): `{ state, keyCount, lingerCount, lastFrameAgeSec, reconnects, subLimitRejects, disconnectedSec }` — `secondsBetween`·`isTracked` 헬퍼는 status.ts 하단에서 복사. 금지 키: `accountNo|userId|account_no|user_id` (smoke-relay.sh:113-119).

---

### quote 프레임 분류 (feed.ts 내부 또는 `relay/src/quote/codec.ts`)

**Analog:** `relay/src/journal/codec.ts:23-47`
```ts
export function createJournalCodec(): JournalCodec {
  return {
    buildLoginReq(input) { return buildObserverLoginReq(input); },
    decode(e): ObserverFrame {
      switch (e.msgType) {
        case MSG.ObserverLoginResp: {
          const result = parseObserverLoginResp(e.env);
          return result === null ? { k: "malformed", msgType } : { k: "login", result };
        }
        case MSG.JournalBatch: ...
        case MSG.RateCrossAlert:
        case MSG.ServerMessage:
          return { k: "ignore", msgType };
        default:
          return { k: "unexpected", msgType };
      }
    },
  };
}
```
→ quote: 79 = login, 그 밖 = `{ k: "market" }` 로 hub 전달(58/59/69/71 · 76/78/83 은 hub 명시 case 무시). 74/75/82 는 envelope 단계에서 이미 드롭(msg-type.ts:270-272) — 코드 추가 없음. `buildLoginReq` 는 `role: 1` 고정 주입.

---

### `relay/src/hub/subscription-hub.ts` (service, pub-sub) — 전역화

**키 함수** (:248-255) — 둘로 분리:
```ts
/** 구독 키. **userId 를 포함한다** — 사용자 간 구독 교차를 구조적으로 막는다 (D-13). */
function subKey(userId: string, isin: string, exchange: RelayExchange): string {
  return `${userId}|${isin}|${exchange}`;
}
function userPrefix(userId: string): string { return `${userId}|`; }
```
→ `marketKey(isin, ex)` = `${isin}|${ex}` (refs·quotes·tapes·판정기·linger), `progressKey(userId,isin,ex)` = 기존 3단(83 캐시 전용 — `#onQueueProgress` :1264-1293, 계좌 필터 캐시 **전** 유지).

**맵 선언** (:374-383):
```ts
readonly #refs = new Map<string, SubRefs>();
readonly #quotes = new Map<string, RelayQuote>();
readonly #tapes = new Map<string, RelayTapeEntry[]>();
readonly #pending = new Map<string, Map<string, PendingTape>>();   // userId → 키 → 배치
readonly #flushTimers = new Map<string, NodeJS.Timeout>();         // userId → 타이머 1개 (D-35)
```
→ `#refs/#quotes/#tapes` 는 marketKey, `#pending: Map<marketKey, PendingTape>`, 타이머 **전역 1개**. 신규 `#userRefs: Map<userId, Map<marketKey, number>>`(D-15 사용자당 200 · 83 넛지), linger 표식·타이머, PRICE 판정기 상태.

**참조계수 · 승격** (:552-585) — 로직 유지, 송신자만 교체:
```ts
const prevTotal = totalRefs(refs);
const prevLevel = prevTotal > 0 ? effectiveLevel(refs) : undefined;
refs[level] += 1;
const nextLevel = effectiveLevel(refs);
if (prevTotal === 0) { this.#sendSubscribe(userId, isin, exchange, nextLevel); return; }
if (prevLevel === "price" && nextLevel === "full") { ...; this.#sendSubscribe(..., "full"); return; }
```
→ `prevTotal === 0` 앞에 가드(전역 2000 · 사용자 200 — linger 키 먼저 해제 후 판단, 초과면 `"limit"` 반환 + `subLimitRejects++` + `logger.warn`). linger 중 키는 타이머 해제만(프레임 없음, level 달라지면 승격/강등 규칙).

**0→1 프레임 조립** (:1689-1724) — 순서가 계약:
```ts
const session = this.#sessions.get(userId);
if (session === undefined) { logger.warn(..., "세션 없이 구독 — 참조계수만 기록"); return; }
if (!session.isReady) { logger.info(..., "Ready 이전 구독 — 참조계수만 기록 (ready 에서 전량 재구독)"); return; }
session.send(buildGetQuoteReq(isin, exchange));
session.send(buildSubscribeQuoteReq(isin, exchange, true, levelByte(level)));
if (level === "full") session.send(buildGetTradeTapeReq(isin, exchange, TAPE_REQUEST_COUNT));
```
→ `session` 을 `this.#feed` 로. 송신은 페이싱 큐(Pattern 7 — in-flight 32 키 / 3초)를 거친다.

**ready 훅** (:1726-1745): `this.resubscribeAll(userId);` 한 줄 **삭제**. 나머지(`requestAccountState` · `requestStrategySnapshot` · 83 재동기화 · `symbolMaster.onSessionReady`) 유지 + 사용자 보유 키 83 넛지 추가. 합집합 재구독은 `#feed` 의 `ready` 에서 `resubscribeAll()`(인자 없음).

**시세 수신** (:1296-1299):
```ts
#onQuote(userId: string, quote: RelayQuote): void {
  this.#quotes.set(subKey(userId, quote.i, quote.x), quote);
  this.#fanout(userId, quote);
}
```
→ `#onQuote(quote)` : 전역 캐시 + PRICE 판정(Pattern 5, `et` 제외 필드 서명 · `PRICE_MIN_INTERVAL_MS = 100` with `MarketPublisher.h:159` 인용) + `this.emit("market", { msg, full, price })`. `"market"` 페이로드 타입은 `RelayQuote | RelayTape` 로 좁힌다(T-15-02 재정의 주석). `#fanout(userId, …)` (:1748-1750) 은 사용자 데이터 전용으로 유지.

**세션 교체 prefix 삭제** (:1752-1758):
```ts
#clearCaches(userId: string): void {
  const prefix = userPrefix(userId);
  for (const key of [...this.#quotes.keys()]) if (key.startsWith(prefix)) this.#quotes.delete(key);
  for (const key of [...this.#tapes.keys()]) if (key.startsWith(prefix)) this.#tapes.delete(key);
  for (const key of [...this.#accountStates.keys()]) { ...
```
→ `#quotes`/`#tapes` 두 루프 삭제. 나머지 사용자 맵 루프 유지.

**`#onFrame(userId, session, e)`** (:1019-1150): 사용자 세션에서 58/59/69/71 이 오면 **명시 case warn + 무시**(`default:` 로 떨어뜨려 PC-12 `unhandledFrameCount` 오염 금지). 새 `#onFeedFrame(e)` : 58/59 → `#onQuote`, 69/71 → `#onTape`, 76/78/83/79 → 명시 무시, 54/77/80 → warn.

---

### `relay/src/ws/fanout.ts` (controller, pub-sub)

**Conn 키 기록** (:327) + `keyOf` (:369-371):
```ts
keys: Map<string, { isin: string; ex: RelayExchange; lv: RelaySubLevel }>;
function keyOf(isin: string, ex: RelayExchange): string { return `${isin}|${ex}`; }
```
→ `#keyConns = new Map<string, Set<Conn>>()` 를 `conn.keys.set/delete` 와 **같은 자리**(sub 신규 · unsub · `#onClose` :1406-1410)에서만 갱신.

**sub 처리** (:963-1005) — 흐름 유지:
```ts
conn.keys.set(key, { isin: msg.isin, ex: msg.ex, lv });
this.#hub.subscribe(userId, msg.isin, msg.ex, lv);
const snapshot = this.#hub.getSnapshot(userId, msg.isin, msg.ex);
if (snapshot !== undefined) this.#send(conn, snapshot);
if (lv === "full") this.#sendTapeSnapshot(conn, userId, msg.isin, msg.ex);
```
→ `subscribe` 가 `"limit"` 이면 `conn.keys`·`#keyConns` 에 넣지 않고 `{ t: "sub.limit", i, x }` 를 그 소켓에만 `#send`. `getSnapshot(isin, ex)` 전역 시그니처. level 갱신 분기(「새 level 먼저 올리고 옛 level 내림」)는 그대로.

**거부 프레임** (:345-347) — 한도 오류에는 **쓰지 않는다**(strategy-card 오류 오염, RESEARCH Pattern 9-2):
```ts
function rejectFrame(reason: string, accountNo = "", isin = ""): RelayServerMsg {
  return { t: "msg", lv: "ERROR", m: reason, i: isin, a: accountNo, src: RELAY_MSG_SOURCE, kind: "" };
}
```

**전 사용자 상태 푸시** (:1633-1636) — `deliverQuoteState` 가 그대로 복제:
```ts
deliverJournalState(frame: RelayJournalStateMsg): void {
  for (const entry of this.#users.values()) {
    for (const conn of entry.conns) this.#send(conn, frame);
  }
}
```
**인증 직후 스냅샷** (:715-718):
```ts
const journalFrame = this.#journalState?.frame() ?? null;
if (journalFrame !== null) this.#send(conn, journalFrame);
```
→ `quoteState?.frame()` 같은 줄 추가(모르면 안 보냄).

**`#deliver`** (:1637-1647): tape 필터 줄 `if (msg.t === "tape" && conn.keys.get(...)?.lv === "price") continue;` 는 **삭제**(시세가 더 이상 이 경로로 안 옴). 신규 `#deliverMarket(e)`: `#keyConns.get(keyOf(i,x))` 순회 — `q` 는 full 전부 + price 는 `e.price` 일 때만(타이머 발화분은 `full:false` 이므로 price 만), `tape` 는 full 만. 계좌 필터 없음.

---

### `relay/src/dma/envelope.ts` + `relay/src/journal/types.ts` (codec, transform)

**현행** (:2721-2768):
```ts
export type ObserverLoginReqInput = { secret; sinceSeq; epoch; client; strategySinceSeq: number; };
const req = ObserverLoginReq.createObserverLoginReq(b, secret, BigInt(sinceSeq), epoch, client, BigInt(strategySinceSeq));
```
→ `role?: 0 | 1` 추가, 7번째 인자 `input.role ?? 0`. `parseObserverLoginResp`(:2777-) 반환에 `role: r.role()`, `ObserverLoginResult`(types.ts:125-145)에 `role: number`. 재동기화 생성물 + 이 수정 + frames.ts + fake-gateway.ts 는 **한 커밋**(Pitfall 1, `typecheck:tests` 포함).

---

### `relay/src/order/order-api.ts` (controller, request-response)

**Analog** (:303-346):
```ts
const now = deps.now?.() ?? new Date();
const journal = deps.journal?.health(now.getTime());
const journalOk = journal === undefined || !journalAlerting(journal, now);
const healthy = linkUp && sessionsOk && journalOk;
...
const payload: HealthPayload = {
  status: healthy ? "ok" : "degraded", vpn: linkUp, dma: sessionsOk, ...
  ...(journal !== undefined ? { journal } : {}),
};
res.status(healthy ? 200 : 503).json(payload);
```
→ `deps.quote?.health(...)` · `quoteOk = quote === undefined || !quoteAlerting(quote, now)` · `healthy = ... && quoteOk` · `...(quote !== undefined ? { quote } : {})`. 주석 블록(:290-300 「추가 게이트웨이는 503 밖」)과 달리 quote 는 503 축임을 주석으로 명시.

---

### `relay/src/config.ts` · `relay/src/index.ts` (config / boot)

**비밀 읽기** (config.ts:115-118):
```ts
const dmaObserverSecret = optional("DMA_OBSERVER_SECRET") || undefined;
if (nodeEnv === "production" && dmaObserverSecret === undefined) throw new Error(...);
```
→ D-17: `dmaQuoteObserverSecret = optional("DMA_QUOTE_OBSERVER_SECRET") || dmaObserverSecret`. logger redact 목록(config.ts:47 주석 「비밀 env 이름은 logger redact 에도 더한다」)에 새 키 추가.

**파이프라인 생성** (index.ts:122-137):
```ts
function createJournalPipeline(upstream: JournalUpstream): JournalPipeline {
  ...
  const observer = new JournalObserver({ secret: upstream.secret, gateway: upstream.gateway, host: upstream.host, port: upstream.port, codec: createJournalCodec(), writer, strategyWriter, access });
  const status = new JournalStatus({ observer, writer, strategyWriter });
  return { ... };
}
```
**결선** (index.ts:211-221 · :251-252 · :266):
```ts
journalState: journalStatus,                                   // fanout deps
journalStatus.on("frame", (frame) => fanout.deliverJournalState(frame));
journal: journalStatus,                                         // order-api deps
for (const p of journalPipelines) p.observer.start();
```
→ `new QuoteFeed({ secret, host: primaryUpstream.host, port: primaryUpstream.port })` · `new QuoteStatus({ feed, hub })` · `hub.attachFeed(feed)` · `hub.on("market", e => fanout.deliverMarket(e))` · `quoteStatus.on("frame", f => fanout.deliverQuoteState(f))` · `quote: quoteStatus` · `quoteFeed.start()`, 종료 경로에 `stop()`.

---

### 테스트

- **`quote-feed.test.ts`** ← `relay/tests/journal-observer.test.ts`: `class FakeTransport extends EventEmitter implements ObserverTransport` (:42) · `FakeCodec` (:93) · 하네스 (:262-287). 시나리오: 79 success role 1 → ready · success=false → rejected + stopReconnect · role 0 → role_mismatch · 로그인 타임아웃 · 비밀 없음 → disabled.
- **`quote-gateway.test.ts`** ← `relay/tests/journal-gateway.test.ts`: imports (:11-25) `startFakeGateway, type FakeGateway` from `./helpers/fake-gateway.js`, `resetDroppedEnvelopeCount`. 시나리오: 로그인 요청 role=1 · client `gh-radar-relay/quote` · 79 role 에코 + 78 1회 · 재구독 in-flight ≤ 창 크기(Pitfall 3).
- **`quote-status.test.ts`** ← `relay/tests/journal-status.test.ts`: 디바운스·`frame()` null·`quoteAlerting`(창 밖 rejected 즉시 true, 창 안 60초 유예).
- **`hub.test.ts`** ← 자기 `FakeSession`(:103) · `decodeReq`(:61) 패턴으로 `FakeFeed`. 두 사용자 × 같은 종목 → 업스트림 29 1건 · 2000/200 가드 · linger · PRICE 판정(호가만 59 → price false, 60ms 뒤 체결 → 100ms 시점 1건) · 83 넛지(Pitfall 6) · 사용자 세션 58/59 명시 무시.
- **`fanout.test.ts`**: ⑦ 등 per-user 단언을 「구독 소켓만 수신 · 미구독 사용자 0건」 으로 재작성(Pitfall 9). 계좌·전략·83 격리 테스트는 유지.
- **`helpers/frames.ts`** (:1330-1343): `createObserverLoginResp(..., input.strategyResync ?? false, input.role ?? 0)` + `FakeObserverLoginRespInput.role?`.
- **`helpers/fake-gateway.ts`**: `ObserverLoginRequest`(:111)에 `role`, `readObserverLoginRequest`(:274-285)에 `role: req.role()`, 자동 응답(:~601)을 role 별(1 → 79 role 1 + 빈 78).

---

### `packages/shared/src/relay.ts` (model)

**Analog** (:1286-1291):
```ts
export type RelayJournalStateMsg = {
  t: "journal.state";
  s: RelayJournalState;
  /** `live` 를 벗어난 시각(ISO). `live` 이면 없다. */
  since?: string;
};
```
→ `RelayQuoteStateMsg = { t: "quote.state"; s: "live" | "down"; since?: string }` · `RelaySubLimitMsg = { t: "sub.limit"; i: string; x: RelayExchange }` 를 `RelayOutbound` union(:1327-1348, `| RelayJournalStateMsg` 옆)에 추가. 59 본문 타입은 무변경(D-07).

---

### `webapp/src/lib/use-relay-socket.ts` (hook, event-driven)

**Analog:** `journalState` 4 지점 — `RelayData` 필드(:405-408), 내부 state(:661), INITIAL `journalState: null`(:701), 리듀서:
```ts
case "journal.state":
  return { ...state, journalState: frame };
```
(:853-855), 노출(:2025 `journalState: data.journalState`). → `quoteState`·`subLimit`(최신 1건) 동형 추가, `reset` 에서 null. `default:` 는 모르는 `t` 무시(:990-994) — relay 선배포 안전. `isStale` 는 건드리지 않는다(D-04).

---

### `workbench-status-bar.tsx` · `me-client.tsx` (component)

**Analog** (`webapp/src/components/trading/workbench/workbench-status-bar.tsx:122-133`):
```tsx
<span data-slot="workbench-dma" aria-live="polite" className="inline-flex items-center gap-1.5 whitespace-nowrap">
  <span aria-hidden="true" data-tone={status === "ready" ? "ok" : "off"}
    className={cn("block size-[7px] shrink-0 rounded-full",
      status === "ready" ? "bg-[var(--led-armed)]" : "bg-[var(--flat)]",
      PROGRESS_STATES.has(status) && "animate-pulse motion-reduce:animate-none")} />
  DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
</span>
```
→ 「시세」 필(`data-slot="workbench-quote"`, live=`--led-armed` / down=적색 토큰 + 「HH:MM:SS 이후 갱신 없음」) 추가, 기존 필 문구 「주문」. `quoteState === null` 이면 필을 그리지 않는다. `MeStatusBar`(`webapp/src/components/trading/me-client.tsx:168-190`, `data-slot="me-status-bar"`, :190 `DMA <b ...>{label}</b>`)도 동형. D-14: 구현 전 HTML 목업 1장 human-verify. 테스트: `webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx` · `me-client.test.tsx`.

---

### `webapp/e2e/fixtures/relay.ts` (fixture)

`withLocalRelay()` env 에 `DMA_QUOTE_OBSERVER_SECRET` 만 넣고(`DMA_OBSERVER_SECRET: ''` 유지 — journal 꺼짐), `pushQuote` 대상 소켓 선택을 `gatewaySocket()` 에서 quote 소켓으로. 83 주입(`unfilled-progress.spec.ts`)은 사용자 세션 소켓 유지(Pitfall 8).

## Shared Patterns

### 관찰자 거부 = 루프 중단 순서
**Source:** `relay/src/journal/observer.ts:449-456` · **Apply to:** `quote/feed.ts` (rejected · role_mismatch)
`stopReconnect` → `destroy` → `setState` 순서 고정. 재시도 없음.

### 상태 한 원천 (frame + healthz)
**Source:** `relay/src/journal/status.ts` + `fanout.ts:1633-1636, :715-718` + `order-api.ts:303-346` · **Apply to:** QuoteStatus · fanout · order-api · index 결선
모르면(null/disabled) 프레임을 보내지 않는다. healthz 본문에 식별자 금지.

### 장중 창 판정
**Source:** `relay/src/journal/trading-window.ts` `inTradingWindow` · **Apply to:** `quoteAlerting` (새 KST 계산 금지)

### 명시 case 무시 (PC-12)
**Source:** `relay/src/hub/subscription-hub.ts #onFrame` · **Apply to:** hub 사용자 세션 58/59/69/71 · feed 76/78/79/83 — `default:` 로 떨어뜨리지 않는다.

### 사용자 데이터 격리 (T-15-02 / T-25-24)
**Source:** `subscription-hub.ts #fanout` (:1748) · `#onQueueProgress` (:1264-1293) · **Apply to:** 새 `"market"` 경로는 `RelayQuote | RelayTape` 타입으로만 — 계좌·주문·83 은 기존 사용자 경로 유지.

### 수기 사본 3곳 규약
`relay/src/generated/` 는 `sync-relay-schema.sh` 결과만. 손대는 곳은 `msg-type.ts`(이번엔 변경 없음 확인) · `envelope.ts` · `subscription-hub.ts #onFrame`.

## No Analog Found

| File/Part | Role | Data Flow | Reason |
|---|---|---|---|
| hub PRICE 통과 판정기 (subscription-hub.ts 내부) | utility | transform | relay 에 선례 없음 — 서버 `MarketPublisher.cpp:1919-1932` 규칙 복제(RESEARCH Pattern 5) |
| 합집합 재구독 in-flight 페이싱 큐 | utility | batch | 선례 없음 — RESEARCH Pattern 7 (32 키 / 3초) |
| linger 타이머 | utility | — | 선례 없음 — RESEARCH Pattern 6 (권고 15초). 타이머 스타일은 session-manager `SESSION_GRACE_MS` 유예(:187-250) 참고 |

## Metadata

**Analog search scope:** `relay/src/{journal,hub,ws,dma,order}`, `relay/src/{index,config}.ts`, `relay/tests/`, `packages/shared/src/relay.ts`, `webapp/src/lib`, `webapp/src/components/trading`, `webapp/e2e/fixtures`
**Files scanned:** 16
**Pattern extraction date:** 2026-09-30
