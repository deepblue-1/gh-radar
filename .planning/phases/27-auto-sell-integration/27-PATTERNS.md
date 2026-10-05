# Phase 27: 자동매도 연동 — Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 41 (신규 4 · 수정 37)
**Analogs found:** 41 / 41 (모두 저장소 안 선례가 있다 — RESEARCH 「새 기계를 만들지 말 것」과 일치)

> 모든 analog 경로는 git 추적 소스다(`relay/src/generated/**` 는 **스크립트만 쓴다** — analog 로 복제하지 않고 import 대상일 뿐).
> 라인 번호는 2026-10-05 master(e0b56b9a) 실측. RESEARCH 와 다른 점은 ★ 로 표시.

## 정정 사항 (RESEARCH/지시 대비 실측)

- ★ `lc.arm` 브라우저 분기는 `relay/src/ws/order-handler.ts` 가 **아니라** `relay/src/ws/fanout.ts:889-915` 에 있다. `order-handler.ts` 는 `order.*`(수동주문) 전용 — 41/42 분기는 fanout.ts 의 `lc.arm` 바로 뒤에 둔다. order-handler.ts 는 수정 대상 아님.
- ★ 41 in-flight 선례는 `webapp/src/components/trading/card/strategy-card.tsx`(경로에 `card/` 포함) `:378-470, :588-606`.
- ★ `lc.arm` 의 relay 통합 테스트 analog 는 `relay/tests/ws-latch.test.ts` (autosell.cmd / user.settings.set 테스트 복제 원본).
- `LED_KINDS` 는 두 곳: `card/card-header.tsx:66`, `layout/app-sidebar.tsx:117` (사이드바는 플래너 재량).

## File Classification

| 파일 | 역할 | 데이터 흐름 | Closest Analog | Match |
|---|---|---|---|---|
| `relay/src/generated/**` (변경 7 · 신규 5 · fbs 사본) | generated | — | `sync-relay-schema.sh` 산출 | 생성물 |
| `relay/src/dma/msg-type.ts` | config(상수표) | event-driven | 같은 파일 77/83 항목 | exact |
| `relay/src/dma/envelope.ts` (schema 4 · 빌더 3 · 파서 1 · readLimitChaser +8) | codec | transform | `parseQueuedWindowState` :743 · `buildBareRequest` :1688 · rc4 `extraBuyBurstRelease` | exact |
| `relay/src/hub/subscription-hub.ts` | service(hub) | pub-sub + cache | `#queuedWindows` :735 · `#onQueuedWindow` :1861 | exact |
| `relay/src/ws/fanout.ts` | controller(ws) | request-response | 인증 재생 :722 · `lc.arm` :889 · `#isTeardown` :1237 | exact |
| `relay/src/ws/protocol.ts` | validation(zod) | request-response | `RelayLcArmSchema` :319 · union :428 | exact |
| `relay/src/dma/__tests__/codec.test.ts`, `envelope.test.ts` | test | — | 자기 파일 :240-252, :270, :1465 | exact |
| `relay/tests/hub.test.ts`, `fanout.test.ts`, `protocol.test.ts`, `ws-latch.test.ts` | test | — | 77 캐시/재생 · lc.arm 케이스 | exact |
| `relay/tests/helpers/frames.ts` | test helper | — | `buildQueuedWindowStateFrame` :1192 | exact |
| `relay/tests/helpers/fake-gateway.ts` | test helper | — | `STRATEGY_COMMAND_MSG_TYPES` :84 · `sendQueuedWindowState` :211/:807 | exact |
| `packages/shared/src/relay.ts` | model(타입 계약) | — | `RelayQueuedWindowMsg` :1236 · `RelayLcArmMsg` :629 · `LIMIT_CHASER_SERVER_*_FIELDS` :370-398 | exact |
| `packages/shared/src/strategy-event.ts` | model(상수) | — | 같은 파일 `BurstLimit: 10` | exact |
| `packages/shared/src/strategy-event-labels.ts` | utility(표) | transform | 같은 파일 :19-40 · `strategyEventSide` :136 | exact |
| `packages/shared/src/strategy-event-text.ts` | utility(조립기) | transform | `case 6` + `sellOrderBody` :201 | exact |
| `packages/shared/src/strategy-display.ts` | utility | transform | `serverMsgBadge` :84 | exact |
| `packages/shared/src/__fixtures__/strategy-day.ts` + `__tests__/*` | fixture/test | — | 기존 `STRATEGY_BRANCH_ROWS` | exact |
| `webapp/src/lib/use-relay-socket.ts` | store(reducer) | event-driven | `queuedWindow` :579/:715/:758/:1030/:2138 | exact |
| `webapp/src/lib/limit-chaser.ts` | utility(판정) | transform | `isLimitChaserArmRejection` :772 · `isDeleteIntent` :159 | exact |
| `webapp/src/components/trading/lc/lc-fields.ts` | config(spec) | — | `LC_SELL_GROUPS` :358 · `LcRowSpec` 유니온 :98-117 | exact |
| `webapp/src/components/trading/lc/setting-group.tsx` | component | — | `SettingRow` :198 · `DerivedRow` :823 | role-match(choice 행은 신규 kind) |
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | hook | request-response | `LC_GATE_FIELDS` :201 | exact |
| `webapp/src/components/trading/lc/limit-chaser-form.tsx` | component | — | 매도 pane :1623 · `touchedRef` 시딩 :723-743 | exact |
| `webapp/src/components/trading/card/strategy-card.tsx` | component | request-response | `armInFlightRef` :378-470/:588-606 | exact |
| `webapp/src/components/trading/latch-led.tsx`, `card/card-header.tsx` | component | — | `latchLedStateOf` :119 · `LED_KINDS` :66 | exact |
| **신규** `webapp/src/components/me/limit-chaser-defaults.tsx` | component | request-response(42→84) | `account-card.tsx`(카드 껍데기) + `SettingRow`/`NumberPadSheet` + strategy-card in-flight | role-match |
| **신규** `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx` | test | — | `components/me/__tests__/account-card.test.tsx` | exact |
| `webapp/src/components/trading/me-client.tsx` | component(page) | — | 자기 :291-299 | exact |
| `webapp/src/lib/order-log-feed.ts`, `order-log/order-log-filters.tsx` | utility/component | transform | 자기 :35, :48-57, :105-112, :220 | exact |
| `webapp/src/components/trading/origin-tag.tsx` | component | — | **변경 없음**(D-17 개정) | — |
| `webapp/src/test-fixtures/limit-chaser.ts` | fixture | — | `LC_BUY3_ECHO_DEFAULTS` :46 | exact |
| `webapp/e2e/fixtures/relay.ts` + specs `trading-workbench` · `me` · `order-log` | e2e | — | 자기 파일(`withLocalRelay` :650 · `readSetLimitChaserRequest`) | exact |
| `docs/inbox/from-gh-trade/261004-auto-sell-wire.md` | docs | — | `docs/inbox/from-gh-trade/README.md` 규약 | exact |

---

## Pattern Assignments

### 0. `relay/src/generated/**` — 생성물 (손편집 금지)

명령: `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` (반영 뒤 `--check` 재실행 = 신규/변경 0). SYNC MARKER = `2404509b`.
- 변경 7: `stock-dma.ts` · `stock-dma/{cancel-reason,envelope,msg-type,order-group,set-limit-chaser,strategy-event-kind}.ts`
- 신규 5: `stock-dma/{auto-sell-command-req,user-settings,limit-feature,member-delta,team-sim}.ts`

**수기 코드의 import 관례** (`relay/src/dma/envelope.ts:66-73`) — 클래스 단위 개별 경로, `.js` 확장자:
```ts
import { Envelope } from "../generated/stock-dma/envelope.js";
import { SetLimitChaser } from "../generated/stock-dma/set-limit-chaser.js";
```
→ 신규: `import { AutoSellCommandReq } from "../generated/stock-dma/auto-sell-command-req.js";` · `import { UserSettings } from "../generated/stock-dma/user-settings.js";`
사용 심볼: `Envelope.addAutoSellCommandReq` / `addUserSettings` / `env.userSettings()` · `SetLimitChaser.addAutoSell{Enabled,StartCond,RatioPct,Method}` / 접근자 `autoSell{Enabled,StartCond,RatioPct,Method,State,SoldQty,Basis,BasisPrice}()` · `UserSettings.{preBuyAmount,addBuyAmount,postBuyAmount,postBuyMaxCount,postBuyFloorQty,postBuyReboundPct,sellQtyTrackRatio,autoSellPeriodSec,auctionSellRatioPct,autoSellRatioDefaultPct,autoSellMethodDefault,present}()`.
enum 은 생성 `MsgType` 를 직접 쓰지 않고 수기 `MSG` 상수를 쓴다 — `codec.test.ts:16,197-199` 가 `MsgType as unknown as Record<string, number>` 로 이름·값 일치를 대조.

---

### 1. `relay/src/dma/msg-type.ts`

**MSG 항목 패턴** (:186-187):
```ts
  /** 예약/장전/시간외종가 발주 창 상태 (`queued_window_state` 슬롯). 로그인 직후 1프레임 + 창 마스크 전이마다 Notice. */
  QueuedWindowState: 77,
```
→ `AutoSellCommandReq: 41` · `SetUserSettingsReq: 42` · `GetUserSettingsReq: 43` · `UserSettingsResp: 84` (이름은 생성 enum 과 정확히 동일).

**INBOUND 화이트리스트** (:240-248): `MSG.QueuedWindowState, … MSG.QueueProgress,` 뒤에 `MSG.UserSettingsResp`.
**OUT_OF_SCOPE** (:270-271): `68, 70, 74, 75, 81, 82,` → `85` 추가. 상단 「하지 않는 것」 주석(:59-71 「이 목록이 정본」)도 같은 커밋.

**깨지는 단언 (같은 커밋)**: `codec.test.ts:246` `toBe(26)`→27, `:249` `toBeLessThanOrEqual(83)`→84(+테스트명 「50~83」), `envelope.test.ts:270` 배열에 85.

PC-12: 84 화이트리스트 추가와 hub `#onFrame`/`#onFeedFrame` case 는 **한 커밋**.

---

### 2. `relay/src/dma/envelope.ts`

**schema 파생** (:1301-1305) — 현재:
```ts
export function lcBuy3SchemaOf(cfg: Pick<LcSetCfg, "postBuyAuto" | "extraBuyBurstRelease">): number {
  if (cfg.postBuyAuto === undefined) return LC_FIXED_BUY3_SCHEMA;
  if (cfg.extraBuyBurstRelease === undefined) return LC_POST_BUY_AUTO_BUY3_SCHEMA;
  return LC_BURST_RELEASE_BUY3_SCHEMA;
}
```
→ Pick 에 4필드, 마지막 줄 앞에 「4필드 중 하나라도 undefined → 3」, 다 있으면 `LC_AUTO_SELL_BUY3_SCHEMA = 4`(상수는 :1283 옆). 하위 결손 경고는 :1382 `if (cfg.extraBuyBurstRelease !== undefined && buy3Schema !== LC_BURST_RELEASE_BUY3_SCHEMA)` 경고 패턴 복제.

**결손 수정** (:1467) `buy3Schema === LC_BURST_RELEASE_BUY3_SCHEMA` → `>=`. 바로 위 :1462 `postBuyAuto` 줄이 `>=` 모양 선례:
```ts
  if (buy3Schema >= LC_POST_BUY_AUTO_BUY3_SCHEMA && cfg.postBuyAuto !== undefined) {
    SetLimitChaser.addPostBuyAuto(b, cfg.postBuyAuto);
  }
```
→ 그 아래 `if (buy3Schema >= LC_AUTO_SELL_BUY3_SCHEMA) { SetLimitChaser.addAutoSellEnabled(...); …4개 }` (주석 형식: 「— 양방향(Phase 27 · vtable 140~146). schema 4 일 때만 싣는다 …」). 에코 전용 4필드는 머리 주석 「S→C 전용 11필드」 목록(:1319-1330 부근)에 「싣지 않는다」 로만 추가.

**파서 analog** (:743-757):
```ts
export function parseQueuedWindowState(env: Envelope): RelayQueuedWindowMsg | null {
  const q = env.queuedWindowState();
  if (q === null) {
    return dropField("slot-null", MSG.QueuedWindowState, { slot: "queued_window_state" });
  }
  return { t: "queued.window", open: q.open(), maxPieces: q.maxPieces(), … };
}
```
→ `parseUserSettings(env)`: `env.userSettings()` · slot `"user_settings"` · `{ t: "user.settings", present, …11 }`.

**바레 요청** (:1688-1699):
```ts
function buildBareRequest(msgType: number, capacity = 64): Uint8Array { … }
export function buildGetLimitChaserListReq(): Uint8Array {
  return buildBareRequest(MSG.GetLimitChaserListReq);
}
```
→ `buildGetUserSettingsReq = () => buildBareRequest(MSG.GetUserSettingsReq)`.

**테이블 요청 빌더**: `buildSetLimitChaserReq`(:1341)의 문자열 선생성 → `startX/addX/endX` → `Envelope.startEnvelope/addMsgType/addX/finish` 순서(:1468-1474) 그대로. `buildAutoSellCommandReq` 는 isin/accountNo/exchange 문자열을 테이블 열기 전 생성 + 같은 `truncateToWire(…,12)`·`isValid*` 가드. `buildSetUserSettingsReq` 는 `present` 를 싣지 않음.

**readLimitChaser** (:2195~) — `451c3070`(fim `postBuyUnlockQty`) 선례대로 8필드 읽기, 슬롯 부재 = false/0. 머리 주석 「S→C 전용 12」→16.

---

### 3. `relay/src/hub/subscription-hub.ts`

**캐시 선언** (:732-735) — JSDoc 3상태 규율 그대로 복제:
```ts
  readonly #queuedWindows = new Map<string, RelayQueuedWindowMsg>();
```
**#onFrame case** (:1733-1737):
```ts
      case MSG.QueuedWindowState: {
        const state = parseQueuedWindowState(e.env);
        if (state !== null) this.#onQueuedWindow(userId, session, state);
        return;
      }
```
**핸들러** (:1861-1865):
```ts
  #onQueuedWindow(userId: string, session: HubSession, state: RelayQueuedWindowMsg): void {
    this.#queuedWindows.set(userId, state);
    if (!session.isReady) return;
    this.#fanout(userId, state);
  }
```
**getter** (:1411-1413) `getQueuedWindow(userId)` → `getUserSettings`. **폐기**: `closeAll` :1626 `this.#queuedWindows.clear();` 옆, `#clearCaches` :2558 `this.#queuedWindows.delete(userId);` 옆.
**43 송신** (:1313) `session.send(buildGetVIOrderListReq());` 바로 뒤 `session.send(buildGetUserSettingsReq());` + 로그 문구(:1314-1317) 갱신.
**#onFeedFrame** (:1955-1959) warn 묶음에 `case MSG.UserSettingsResp:` 추가:
```ts
      case MSG.ServerMessage:
      case MSG.QueuedWindowState:
      case MSG.JournalBatch:
        logger.warn({ msgType: e.msgType }, "[HUB] quote 연결에 오지 않는 프레임 — 무시");
```

---

### 4. `relay/src/ws/fanout.ts`

**인증 직후 재생** (:718-723) — 「모르면 보내지 않는다」:
```ts
    const queuedWindow = this.#hub.getQueuedWindow(userId);
    if (queuedWindow !== undefined) this.#send(conn, queuedWindow);
```
→ 바로 아래 `userSettings` 동일 2줄.

**새 inbound 분기** — `lc.arm` (:889-915) 바로 뒤에 복제. 핵심 골격:
```ts
    if (msg.t === "lc.arm") {
      const session = this.#strategySession(conn, userId, msg.t);
      if (session === null) return;
      …
      if (!this.#accountAllowed(conn, session, userId, msg.t, accountNo)) return;
      …
      const payload = this.#buildStrategyPayload(conn, userId, msg.t, () =>
        buildArmLatchReq(ARM_LATCH_MSG_TYPE[latch], msg.key),
      );
      if (payload === null) return;
      if (!session.send(payload)) this.#onStrategySendFailed(conn, userId, msg.t);
      return;
    }
```
- `autosell.cmd`: 위 그대로, `accountNo = msg.accountNo`, builder `buildAutoSellCommandReq({…, action: msg.action === "start" ? 1 : 2})` (문자열→와이어 숫자 매핑 표는 :180 `ARM_LATCH_MSG_TYPE` 처럼 모듈 상수로). pending FIFO 미사용(:885-888 주석 사유 동일).
- `user.settings.set`: `#accountAllowed` 생략(계좌 축 없음), 나머지 동일.

**#isTeardown** (:1237-1250) Pick 에 `"autoSellEnabled"`, 반환식에 `&& cfg.autoSellEnabled !== true` (webapp `isDeleteIntent` 와 같은 커밋).

---

### 5. `relay/src/ws/protocol.ts`

**스키마 analog** (:319-323):
```ts
export const RelayLcArmSchema = z.object({
  t: z.literal("lc.arm"),
  key: z.string().min(1).max(64),
  latch: z.enum(["sell", "cancel", "buy"]),
});
```
→ `RelayAutoSellCmdSchema`(`isin`/`accountNo`/`exchange` 기존 스키마 재사용, `action: z.enum(["start","stop"])`), `RelayUserSettingsSetSchema`(`s: z.object({11값})`, 범위는 shared 상수). `.strict()` 금지. union(:428-440) 에 둘 추가. `RelayLcSetSchema` cfg(:149-243)에 4필드 optional + `superRefine` (기존 `postBuyReboundPct` 조건 규칙 모양). 머리 주석 :128-136 S→C 전용 목록 갱신.

---

### 6. relay 테스트 헬퍼

**`tests/helpers/frames.ts`** — `buildQueuedWindowStateFrame` (:1191-1206) 복제 → `buildUserSettingsFrame(input: FakeUserSettingsInput = {})` (기본값 = 서버 내장 4000·4000·4000·3·100000·30·55·3·20·10·3, present 기본 false):
```ts
export function buildQueuedWindowStateFrame(input: FakeQueuedWindowInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(128);
  QueuedWindowState.startQueuedWindowState(b);
  QueuedWindowState.addOpen(b, input.open ?? false);
  …
  const state = QueuedWindowState.endQueuedWindowState(b);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.QueuedWindowState);
  Envelope.addQueuedWindowState(b, state);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
```
`FakeLimitChaserInput`(→ `buildSetLimitChaserRespFrame` :790)에 8필드. `buildServerMessageFrame`(:224)은 이미 `src` 를 받음.

**`tests/helpers/fake-gateway.ts`** — `STRATEGY_COMMAND_MSG_TYPES` (:84-89) 에 `AutoSellCommandReq` · `SetUserSettingsReq` 추가(기록만, 자동응답 없음 — :80-83 주석 사유). 84 송신은 `sendQueuedWindowState` (:211 인터페이스 · :807 구현) 동형 `sendUserSettings(sock, input?)` 수동 메서드. 43 자동응답은 시드 옵션 기본 null(기존 프레임 개수 단언 보호).

**테스트 파일 analog**: hub 84 캐시/Ready 게이트 = `tests/hub.test.ts` 의 77 케이스, 인증 재생 = `tests/fanout.test.ts` 의 `queued.window` 케이스, 41/42 송신 = `tests/ws-latch.test.ts`(lc.arm), zod = `tests/protocol.test.ts` 의 `lc.arm` 케이스, schema 파생 = `src/dma/__tests__/envelope.test.ts:1465`.

---

### 7. `packages/shared/src/relay.ts`

- S→C 프레임 타입: `RelayQueuedWindowMsg` (:1236-1250) 형식 → `RelayUserSettingsMsg = { t: "user.settings"; present: boolean; …11 }`, `RelayOutbound` union(:1403~, :1419 `| RelayQueuedWindowMsg` 옆).
- C→S: `RelayLcArmMsg` (:629-642) 형식 → `RelayAutoSellCmdMsg` · `RelayUserSettingsSetMsg`, `RelayInbound` union(:760~, :765 `| RelayLcArmMsg` 옆).
- `RelayLimitChaser` 필드 JSDoc 은 `extraBuyBurstRelease` (:286-292) 형식(출처·vtable·구서버 부재 의미). 에코 전용 4필드는 새 `LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS` const 로 묶어 `LIMIT_CHASER_SERVER_ONLY_FIELDS` (:391-395) 스프레드에 추가:
```ts
export const LIMIT_CHASER_SERVER_ONLY_FIELDS = [
  ...LIMIT_CHASER_SERVER_COUNTER_FIELDS,
  ...LIMIT_CHASER_SERVER_LATCH_FIELDS,
  ...LIMIT_CHASER_SERVER_RUNTIME_FIELDS,
] as const satisfies readonly (keyof RelayLimitChaser)[];
```
- 사용자 설정 범위 상수(relay zod · webapp 시트 공용)도 여기(또는 strategy-event.ts 옆)에 하나.
- 헤더 변경 이력(:119-120 「58 → 59」 형식)에 한 줄.

---

### 8. shared 조립기 3파일

**라벨 표** (`strategy-event-labels.ts:19-31, 34-43`): `STRATEGY_EVENT_KIND_LABELS` 에 `11: "발동", 12: "정정", 13: "상태"`(14 는 표 밖 — `cond_actual` 분기), `ORDER_GROUP_LABELS[9] = "자동매도"`, `CANCEL_REASON_LABELS` 10/11.
**방향** (:136-146) `strategyEventSide` 에 `if (group === 9) return "sell";` — 기존 `if (group === 8) return "buy";` 줄 모양.

**조립기** (`strategy-event-text.ts:89-130`) — 분기 모양:
```ts
    case 6:
      return { ...orderBadge(ev), action: strategyKindLabel(6), body: sellOrderBody(ev), cum };
    …
    default:
      return { badge: orderGroupLabel(ev.group) ?? String(ev.kind), tone: "unknown", action: String(ev.kind), body: "", cum };
```
→ `case 6` 안에서 `isAutoSellReason(ev)` 면 `autoSellOrderBody(ev)`/`autoSellAuctionBody(ev)`; `case 11..14` 는 `default` 앞. 본문 함수 모양은 `sellOrderBody` (:201-210) — `joinDot([...])` + `NUM.format`:
```ts
function sellOrderBody(ev: StrategyEventRow): string {
  const method = ev.orderCondition === "" ? "" : ` ${orderConditionLabel(ev.orderCondition)}`;
  return joinDot([ conditionText(ev), evidenceText(ev), …, `${NUM.format(ev.price)}×${NUM.format(ev.qty)}주${method}`, latencyText(ev) ]);
}
```
자동매도 본문은 `conditionText`/`evidenceText` 를 **쓰지 않는다**(오독). 토큰 판정은 `reasonCode.split(" ", 1)[0]` + `Object.hasOwn` 집합(기존 `reasonOperator` 규율).

**배지** (`strategy-display.ts:84-88`):
```ts
export function serverMsgBadge(src: string): string {
  if (src === "LimitChaser") return "[상따]";
  if (src === "VITrigger") return "[VI]";
  return "[서버]";
}
```
→ `src === "AutoSell" || src === "AutoSellCommand"` 도 `"[상따]"`(D-17 개정, 정확 일치 유지).

**픽스처**: `__fixtures__/strategy-day.ts` 에 별도 `STRATEGY_AUTO_SELL_ROWS`(seq 201~) — 기존 「14줄 · 갈래 12개」 단언(`__tests__/strategy-event-text.test.ts:229`) 무변경. 골든은 `toBe(문자열)`.

---

### 9. `webapp/src/lib/use-relay-socket.ts` (84 슬라이스)

`queuedWindow` 5자리 복제: 타입 :579 · :715 `queuedWindow: RelayQueuedWindowMsg | undefined;` · 초기값 :758 `queuedWindow: undefined,` · 리듀서 :1030-1032:
```ts
    case "queued.window":
      // 최신 1건 보관. 상태 보관만 하고 UI 는 만들지 않는다(Phase 18).
      return { ...state, queuedWindow: frame };
```
· 컨텍스트 노출 :2138 `queuedWindow: data.queuedWindow,` → `userSettings` 동일.

---

### 10. `webapp/src/lib/limit-chaser.ts`

- `LimitChaserGates` (:77-80) Pick 에 `'autoSellEnabled'`; `isDeleteIntent` (:159-167) 6항; `isActiveStrategy` (:105-112) 인자·식에 `autoSellEnabled`.
- `isLimitChaserServerMessage` (:648-654) 에 `'AutoSell' | 'AutoSellCommand'`:
```ts
  if (msg.src === 'SetLimitChaser' || msg.src === 'LimitChaser') return true;
  return msg.src === 'Account' && msg.i !== '';
```
- 신규 `isAutoSellCommandRejection` — `isLimitChaserArmRejection` (:772-785) 복제:
```ts
export function isLimitChaserArmRejection(msg: {…}, isin: string, accountNo: string): boolean {
  if (isin === '' || accountNo === '') return false;
  if (msg.lv !== 'WARN' && msg.lv !== 'ERROR') return false;
  if (msg.src === 'System') return msg.i === '' && msg.a === '' && msg.kind === '';
  if (msg.src === 'Relay') return msg.i === '' && (msg.a === '' || msg.a === accountNo);
  if (msg.src === 'LimitChaser') return msg.i === isin;
  return false;
}
```
→ 분기: `AutoSellCommand`(i===isin && a===accountNo) · `Account`(i·a 일치) · `Relay`. 본문 `m` 은 읽지 않는다.
- `defaultLimitChaserForm`(:204-252) 4필드 기본(false · 0 · 10 · 3), `formFromServer`(:552-598) 요청 4필드. 84 시딩 함수는 D-04 상수 폴백 + lc 범위 밖이면 상수.

---

### 11. `webapp/src/components/trading/lc/lc-fields.ts`

- `LcRowSpec` `derived` (:116) 확장:
```ts
  | { kind: 'derived'; source: 'sellQtyTrackBaseline' | 'postBuyTriggerQty'; label: '잔량추적 기준선' | '발동잔량' }
```
→ source `'autoSellSoldQty' | 'autoSellBasisPrice'`, label `'누적 매도' | '기준'`. 새 kind `'choice'`(옵션 순서 3·1·2) — exhaustive switch(`lcRowById`/`lcRowOfField`/`lcNavigableRows`/`lcRowDimOf`/`lcRangeIssue`)가 컴파일로 누락을 잡는다.
- `LcGate` (:119-125) · `slot` (:132) · `title` (:137) 유니온에 자동매도 값.
- 그룹 정의는 `LC_SELL_GROUPS` (:358-) 첫 원소 모양 복제:
```ts
  {
    slot: 'sell', title: '매도주문', gate: 'sellEnabled', statusKey: 'sell',
    dimGate: 'sellEnabled', dimWhenOff: true, collapsible: false,
    rows: [ … ],
  },
```
→ `slot: 'auto-sell', title: '자동매도', gate/dimGate: 'autoSellEnabled', collapsible: true`, 배열 끝(세 번째).
- `lcValueTextOf`(:500-525) 시작조건 0 의미어, `lcSummaryOf`(:556-600) `case 'auto-sell'`, `lcRangeIssue` 조건 범위(:688-689 `postBuyReboundPct` 규칙 동형).

### 12. `setting-group.tsx` · `number-pad-sheet.tsx` · `inline-value-editor.tsx`
- 값 행: `SettingRow` (:198, 44px 클래스 :71) 재사용. 「기준 {상한가|매수가} N원」 은 `DerivedRow` (:823-) 값 포맷 자리 확장. choice 행은 `SettingRow` 레이아웃(라벨 ─ 값 ›) + 폰 3옵션 시트 / 데스크톱 세그먼트 — 새 컴포넌트지만 `/me` 와 공유하도록 이 파일에 둔다.
- `PadUnit`(`lib/numpad.ts:25`)에 `'초'`(/me 매도 주기).

### 13. `use-lc-field-commit.ts`
`LC_GATE_FIELDS` (:201-205) 에 `'autoSellEnabled'`. 41 과 상호 배제를 위해 훅 busy 상태를 카드에 노출(이미 `serverAnswerSeq` :319 계약 — 41 에코가 lc.set 답으로 오인되지 않게).

### 14. `card/strategy-card.tsx` (41 in-flight)
`armInFlightRef` 기계 복제 (:378-389 `startAckWait`, :421-426 `acceptAnswer`, :595-604 거부 귀속):
```ts
  const armInFlightRef = useRef(false);
  const startAckWait = useCallback(() => {
    setUnacked(false);
    if (ackTimer.current != null) window.clearTimeout(ackTimer.current);
    ackTimer.current = window.setTimeout(() => setUnacked(true), ACK_TIMEOUT_MS);
  }, []);
  …
      const armAnswer = armInFlightRef.current && isLimitChaserArmRejection(msg, isin, accountNo);
      if (!armAnswer && !isLimitChaserServerMessage(msg)) continue;
      …
      if (armAnswer) { armInFlightRef.current = false; acceptAnswer(); }
```
★ 차이: 키 일치 에코 이펙트(:463-470)는 **아무 에코**에나 `armInFlightRef=false` — 41 은 `autoSellCmdRef = { action } | null` 을 두고 기대 전이(Start: `autoSellState===3 && autoSellEnabled` · Stop: `!autoSellEnabled`)일 때만 해제. 키 변경 리셋(:428-439)에 같이 초기화.

### 15. `latch-led.tsx` · `card/card-header.tsx`
타입 (:42-54): `LatchLedKind` 에 `"autoSell"`, `ArmableLatchKind = Exclude<LatchLedKind, "buy" | "autoSell">`, `LatchLedLabel` 에 `"매도중" | "완료"`. **tone 추가 없음**(D-04 개정 — latent/armed 재사용). `LATCH_LED_NAMES.autoSell = "자동"`. `latchLedStateOf` (:119-) 의 `sell` 분기 모양:
```ts
  if (kind === "sell") {
    if (!server.sellEnabled) return OFF_STATE;
    return server.sellEntryLatched
      ? { tone: "armed", clickable: true, label: "감시", tooltip: TOOLTIPS.sell.off }
      : { tone: "latent", clickable: true, label: "대기", tooltip: TOOLTIPS.sell.on };
  }
```
→ `autoSellState` 1·4 latent · 2·3 armed · 그 밖 OFF, `clickable: false`. `card-header.tsx:66` `LED_KINDS` 에 `"autoSell"`.

### 16. 신규 `webapp/src/components/me/limit-chaser-defaults.tsx`
- 카드 껍데기·토큰: `account-card.tsx:64` `className="flex min-h-[72px] items-center gap-3 rounded-[16px] bg-[var(--card)] px-4 py-3.5"` (섹션은 세로 스택 변형).
- 행: `SettingRow` + `NumberPadSheet` + `InlineValueEditor` + choice 행(§12).
- 42 in-flight 1건 큐 · 3초 · 54 `src==="SetUserSettings"` 귀속: strategy-card §14 기계 복제(카드 대신 섹션 로컬 state). 조립은 `userSettings`(84 캐시) + 바뀐 1칸.
- 상태 3종: `userSettings === undefined` 불러오는 중 / `present` true·false — `queuedWindow` 3상태 규율.
- 삽입: `me-client.tsx:291-299` `<div className="mb-1"><AccountCard /></div>` 뒤, `<StrategyStatusCard />` 앞(DmaGate 분기에서는 그리지 않음).
- 테스트 analog: `components/me/__tests__/account-card.test.tsx`.

### 17. 주문로그
`order-log-feed.ts`: :35 유니온에 `'auto'`, :48-57 `{ value: 'sell', label: '매도' },` 뒤 `{ value: 'auto', label: '자동매도' }`, :105-112 `KIND_GROUPS` 에 `auto: [9]`, :220 쿼리 허용 `KINDS`. `order-log-filters.tsx:111` 은 표를 읽으므로 대개 무변경 확인만. `origin-tag.tsx` **변경 없음**.

### 18. 픽스처 · e2e
- `webapp/src/test-fixtures/limit-chaser.ts:46` `LC_BUY3_ECHO_DEFAULTS` 에 8필드 기본(0/false) — `makeLimitChaser`(:78) 가 자동 반영.
- e2e: `webapp/e2e/fixtures/relay.ts` 는 relay 테스트 헬퍼를 재수출(`DMA_MSG` :126, `readSetLimitChaserRequest` :135) — 새 `sendUserSettings`/41 기록 읽기도 같은 재수출 경로. 시나리오는 `trading-workbench.spec.ts`(60 에코 전이) · `me.spec.ts`(84 → 42) · `order-log.spec.ts`(필터 칩).

---

## Shared Patterns

### 서버 진실 · 원문 표시
**Source:** `limit-chaser.ts:772-785`(본문 `m` 미판독), `strategy-display.ts:84`(정확 일치). **Apply:** 41 거부 판정, 42 거부 줄, 54 배지 — 문구 파싱 금지.

### 3상태 캐시(모름/값)
**Source:** hub `#queuedWindows` :735 → fanout :722 → store :758. **Apply:** 84 전 경로. `undefined` 는 「모른다」 — 지어낸 기본값 송신 금지.

### in-flight 1건 · 3초 미반영 · 재시도 없음
**Source:** `card/strategy-card.tsx:378-470`. **Apply:** 41(카드), 42(/me 섹션).

### 수기 사본 + 테스트 단언 동시 갱신 (PC-12)
**Source:** `msg-type.ts:59-71` 주석 규약, `codec.test.ts:240-252`. **Apply:** relay 플랜 한 커밋.

### 삭제/철거 판정 대칭
**Source:** webapp `isDeleteIntent` :159 ↔ relay `#isTeardown` :1237 (주석 「같은 다섯 항」). **Apply:** 여섯 항으로 같은 커밋.

## No Analog Found

| 파일/요소 | 이유 | 대안 |
|---|---|---|
| `LcRowSpec` `'choice'` 3택 행 | 기존 행은 숫자/체크만 | `SettingRow` 레이아웃 + RESEARCH §4-c 권고 형태 |

## Metadata
**검색 범위:** `relay/src/{dma,hub,ws}`, `relay/tests`, `packages/shared/src`, `webapp/src/{lib,components/trading,components/me,test-fixtures}`, `webapp/e2e`
**Pattern extraction date:** 2026-10-05
