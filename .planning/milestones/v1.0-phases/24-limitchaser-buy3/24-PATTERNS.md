# Phase 24: limitchaser-buy3 - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 18 (수정 16 · 재생성 2 · 신설 1)
**Analogs found:** 18 / 18 (대부분 「자기 자신의 기존 갈래」가 정본 analog — 이번 phase 는 기존 필드 결을 그대로 늘리는 작업)

모든 경로는 `git ls-files` 로 추적 소스임을 확인했다(16/16). 줄 번호는 브랜치 `gsd/phase-24-limitchaser-buy3` HEAD `a8836fb2` 실측.

## File Classification

| 수정/신설 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `relay/src/generated/stock-dma/set-limit-chaser.ts` · `relay/src/generated/StockDMA.fbs` | generated | transform | 스크립트 산출물(`server/scripts/sync-relay-schema.sh`, gh-trade) — 손대지 않음 | exact |
| `relay/src/dma/envelope.ts` (`buildSetLimitChaserReq`) | codec/builder | request-response (C→S) | 같은 함수의 sweep 고정 3필드 · `toWireUByte` 경로 (:1143-1147, :1245-1246) | exact |
| `relay/src/dma/envelope.ts` (`readLimitChaser`) | codec/parser | transform (S→C) | 같은 함수의 S→C 전용 필드 읽기 (`cancelEntryLatched` :2048 부근) | exact |
| `relay/src/dma/msg-type.ts` | config/const | — | `MSG.ArmSellLatchReq/ArmCancelLatchReq` (:111-115) | exact |
| `relay/src/ws/protocol.ts` | validation(zod) | request-response | `RelayLcArmSchema` (:246-250) | exact |
| `relay/src/ws/fanout.ts` | controller(ws 라우터) | request-response | `lc.arm` 분기 (:820-833) · `#strategyArmable` (:1207-1259) · `rejectFrame` (:331) | exact |
| `relay/tests/helpers/frames.ts` | test helper | transform | `FakeLimitChaserInput` (:556) · 빌더 (:668-731) | exact |
| `relay/tests/helpers/fake-gateway.ts` | test helper | transform | `readViSetRequest` (:338-352) · `readArmLatchRequest` (:389-394) | exact |
| `packages/shared/src/relay.ts` | model(type 계약) | — | `LIMIT_CHASER_SERVER_*_FIELDS` (:270-289) · `RelayLimitChaserInput` (:309) · `RelayLcArmMsg` (:503-512) | exact |
| `webapp/src/lib/limit-chaser.ts` | utility(도메인 로직) | transform | `buyOrderQtyFromAmount` (:89-92) · `DIRTY_COMPARED_FIELDS` (:153-175) · `formFromServer` (:301-330) | exact |
| `webapp/src/components/trading/lc/lc-fields.ts` | config(선언형 스펙) | — | `LcGroupSpec` (:85-104) · `LC_BUY_GROUPS` (:106-159) | exact |
| `webapp/src/components/trading/lc/setting-group.tsx` | component | event-driven | `SettingGroup` (:250-314) · `DerivedRow` (:594) | role-match(접기·요약줄은 신규) |
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | hook | request-response | `LC_GATE_FIELDS` (:129) · `lcAmountBlockOf` (:148-152) · `isGateField` (:194-196) | exact |
| `webapp/src/components/trading/limit-chaser-form.tsx` | component(조립) | event-driven | 자기 자신 — `buildCfg`/`armBlockOf`/`canArmOf` | exact |
| `webapp/src/components/trading/latch-led.tsx` | component | transform | `latchLedStateOf` sell 갈래 (:123-128) | exact |
| `webapp/src/components/trading/strategy-log.tsx` | utility+component | event-driven | `TRANSITION_ORDER` (:120) · `VALUE_COMPARE_SKIP`/`RUNTIME_ONLY_SKIP` (:158-176) · `strategyLogLine` (:220-262) | exact |
| `webapp/src/components/trading/card/card-body.tsx` | component | transform | `cardGroupStatusOf` (:123-142) | exact |
| `webapp/src/components/trading/card/strategy-card.tsx` | component(상태기) | request-response | 자기 자신 — `hadOrder` (:156-169) · `lc.arm` in-flight (:327-334, :410) | exact |
| `webapp/src/test-fixtures/limit-chaser.ts` (신설) | test fixture | — | 인라인 `RelayLimitChaser` 팩토리 17곳(아래 목록) | role-match |

## Pattern Assignments

### `relay/src/generated/*` (generated)
**규율:** 손편집 금지. gh-trade 워크트리에서 `RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh`(먼저 `--check`). 재생성 커밋은 `envelope.ts:2061`(`buyEntryLatched: t.buyEntryLatched()`) · `relay/tests/helpers/frames.ts:720`(`addBuyEntryLatched`) · shared `buyEntryLatched`(:235, :276) 제거와 **같은 커밋** 이어야 typecheck 가 초록(RESEARCH relay 1).

---

### `relay/src/dma/envelope.ts` — `buildSetLimitChaserReq` (builder, C→S)
**Analog:** 같은 함수의 고정값 · ubyte 경로.

고정값 상수 패턴 (:1143-1147) — `LC_FIXED_BUY3_SCHEMA = 1` 을 이 옆에 같은 결로 추가:
```ts
export const LC_FIXED_SWEEP_RECALC_ENABLED = true;
export const LC_FIXED_SWEEP_MIN_COUNT = 0;
export const LC_FIXED_SWEEP_MIN_RATE = 0;
```
문자열 선생성 + 이름있는 `addXxx` 조립 (:1214-1238) — `buyWatchSideOff`(:1220) · `addBuyWatchSide`(:1233) · `const buyWatchSide = toWireWatchSide(...)`(:1194 부근) 삭제:
```ts
  const b = new flatbuffers.Builder(512);
  // 문자열 6종을 테이블 열기 전에 만든다.
  const isinOff = b.createString(isin);
  ...
  const buyWatchSideOff = b.createString(buyWatchSide);   // ← 삭제
  SetLimitChaser.startSetLimitChaser(b);
  SetLimitChaser.addBuyOrderQty(b, toWireUint(cfg.buyOrderQty, "buyOrderQty"));
  SetLimitChaser.addBuyWatchSide(b, buyWatchSideOff);     // ← 삭제
  SetLimitChaser.addBuyEnabled(b, cfg.buyEnabled);
```
ubyte/고정 필드 (:1245-1246) — `postBuyReboundPct`·`postBuyReentry` 는 `toWireUByte`, uint 6종은 `toWireUint`, bool 3종은 그대로:
```ts
  SetLimitChaser.addSweepMinTickCount(b, toWireUByte(cfg.sweepMinTickCount, "sweepMinTickCount"));
  SetLimitChaser.addSweepRecalcEnabled(b, LC_FIXED_SWEEP_RECALC_ENABLED);
```
→ 신설: `SetLimitChaser.addBuy3Schema(b, LC_FIXED_BUY3_SCHEMA);` (입력 타입에 두지 않음). S→C 4필드(`extraBuyAbandoned`·`postBuyTriggerQty`·`postBuyReentryLeft`·`postBuyPhase`)는 호출하지 않는다 — 함수 JSDoc(:1150-1165)의 「S→C 전용 6필드」 목록·「33 필드」 산식을 45 로 갱신. `toWireWatchSide`(:924) 삭제.

### `relay/src/dma/envelope.ts` — `readLimitChaser` (parser, S→C)
**Analog:** 같은 함수 (:1995-2071). 60(`parseLimitChaserEcho`)·64(`parseLimitChaserList`) 공용이므로 여기 한 곳만 고친다.
```ts
      // S→C 전용 — 취소 진입 확인 래치 원값. ... 무장(armed)과 **접지 않는다**.
      cancelEntryLatched: t.cancelEntryLatched(),
      // S→C 전용 — 매수 진입 확인 래치 원값. ...
      buyEntryLatched: t.buyEntryLatched(),     // ← 삭제(접근자 소멸)
```
- 신필드 16 + `buy3Schema` 를 같은 결(`name: t.name()`, 주석으로 C→S/S→C 구분)로 추가. S→C 4필드도 **읽는다**.
- `buyWatchSide: fromWireWatchSide(t.buyWatchSide() ?? "")`(:2022) 유지 → 새 서버에서 `"0"`.
- D-21: 후매수 체크 에코 해석 한 항만 반영.
- 테스트 영향: `envelope.test.ts:1495` `toHaveLength(40)` → 재계산값.

---

### `relay/src/dma/msg-type.ts` (const)
**Analog:** :111-115 `ArmSellLatchReq: 36, ArmCancelLatchReq: 37, ArmBuyLatchReq: 38`. `ArmBuyLatchReq` 행 삭제 + 「38 봉인」 주석. 연쇄: `envelope.ts` `ArmLatchMsgType`(:1427-1430) 36|37 로 축소, `relay/src/dma/__tests__/codec.test.ts:202-233` 이름 대조, `fake-gateway.ts:369-373` 집합.

### `relay/src/ws/protocol.ts` (zod)
**Analog:** `RelayLcArmSchema` (:246-250)
```ts
export const RelayLcArmSchema = z.object({
  t: z.literal("lc.arm"),
  key: z.string().min(1).max(64),
  latch: z.enum(["sell", "cancel", "buy"]),   // ← "buy" 는 한시 관용으로 남김(구 탭 소켓 보존, F-4)
});
```
`lc.set` 스키마: `buyWatchSide` 제거, 신 C→S 12필드를 기존 uint/bool 필드와 같은 zod 결로 추가(ubyte 2종은 0~255 상한).

### `relay/src/ws/fanout.ts` (ws controller)
**Analog 1 — `lc.arm` 분기** (:820-833). `latch === "buy"` 이면 `#buildStrategyPayload` 전에 거부:
```ts
    if (msg.t === "lc.arm") {
      const session = this.#strategySession(conn, userId, msg.t);
      if (session === null) return;
      const accountNo = this.#armLatchAccount(conn, userId, msg);
      if (accountNo === null) return;
      if (!this.#accountAllowed(conn, session, userId, msg.t, accountNo)) return;
      const payload = this.#buildStrategyPayload(conn, userId, msg.t, () =>
        buildArmLatchReq(ARM_LATCH_MSG_TYPE[msg.latch], msg.key),
      );
```
거부 프레임 형식은 `rejectFrame(reason, accountNo = "", isin = "")` (:331), 기존 사용례 :1064 `this.#send(conn, rejectFrame("전략 키 형식이 올바르지 않아 래치 요청을 보내지 못했습니다."))`.
`ARM_LATCH_MSG_TYPE`(:167-171) 에서 `buy` 키 제거.

**Analog 2 — `#strategyArmable`** (:1207-1259). 삼항 체인에 `preBuy`/`extraBuy`/`postBuy` 갈래 추가, `buy` 식은 `buyOrderPrice===0 || buyWatchPrice===0` 으로, `sweep` 은 `preBuyEnabled &&` 선행(RESEARCH relay 4):
```ts
    if (this.#isTeardown(cfg)) return true;   // 무변경 — 지우지 말 것
    const reason =
      cfg.buyEnabled && (cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0)
        ? "buy"
        : cfg.sellEnabled && (cfg.sellOrderPrice === 0 || cfg.sellWatchQty === 0)
          ? "sell"
          : cfg.sweepEnabled &&
              (cfg.sweepWatchPrice === 0 || cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0)
            ? "sweep"
            : null;
    if (reason === null) return true;
    logger.error({ userId, t, isin: cfg.isin, gate: reason }, "[WS] 발주가·수량 0 인 게이트 무장 — ...");
```
문구는 갈래별로 가르지 않는다(기존 주석 규율 유지) — 갈래는 로그 `gate` 로만. 영향 테스트 `relay/tests/fanout.test.ts:1129·1307-1310·1389·1411`, `relay/tests/ws-latch.test.ts` buy 갈래.

---

### `relay/tests/helpers/frames.ts` (test helper)
**Analog:** `FakeLimitChaserInput` (:556) + 테이블 빌더 (:668-731). 신필드를 `input.xxx ?? 기본` 결로 추가, `SetLimitChaser.addBuyEntryLatched(b, input.buyEntryLatched ?? false);`(:720) 삭제.

### `relay/tests/helpers/fake-gateway.ts` (test helper)
**Analog:** `readViSetRequest` (:338-352) — 요청 페이로드를 꺼내 평문 객체로:
```ts
export function readViSetRequest(msgType: number, payload: Buffer): ViSetRequest | null {
  if (msgType !== STRATEGY_MSG.SetVITriggerReq) return null;
  const req = rootEnvelope(payload)?.setViTrigger();
  if (req === null || req === undefined) return null;
  return { accountNo: req.accountNo() ?? "", ... };
}
```
→ 신설 `readSetLimitChaserRequest` 를 같은 모양으로(buy3Schema·신 13필드 송신 증거). `ARM_LATCH_MSG_TYPES`(:370-374) 에서 `MSG.ArmBuyLatchReq` 제거, 주석 「36/37/38」 갱신.

---

### `packages/shared/src/relay.ts` (type 계약)
**Analog:** S→C 필드 정본 const (:273-289)
```ts
export const LIMIT_CHASER_SERVER_LATCH_FIELDS = [
  "sellEntryLatched",
  "cancelEntryLatched",
  "buyEntryLatched",          // ← 삭제
] as const satisfies readonly (keyof RelayLimitChaser)[];

export const LIMIT_CHASER_SERVER_ONLY_FIELDS = [
  ...LIMIT_CHASER_SERVER_COUNTER_FIELDS,
  ...LIMIT_CHASER_SERVER_LATCH_FIELDS,
] as const satisfies readonly (keyof RelayLimitChaser)[];
```
- S→C 4필드(`extraBuyAbandoned`·`postBuyTriggerQty`·`postBuyReentryLeft`·`postBuyPhase`) + `buy3Schema` 는 `LIMIT_CHASER_SERVER_COUNTER_FIELDS` 쪽(런타임 카운터 = 로그 안 남김, D-13)에 합류시키면 `RelayLimitChaserInput` Omit(:309)·webapp skip 집합이 자동 파생된다.
- `RelayLimitChaserInput` Omit 에 `"buyWatchSide"` 추가(입력에서 제거) — JSDoc 「29 + 3 = 32」 산식 갱신.
- `RelayLcArmMsg.latch`(:511) → `"sell" | "cancel"`, 주석 `"buy"=38` 삭제.

---

### `webapp/src/lib/limit-chaser.ts` (도메인 utility)
**Analog 1 — 금액→수량** (:89-92). 추가매수·후매수 수량도 같은 함수 재사용(3벌 = 호출 3곳, 함수 복제 금지):
```ts
export function buyOrderQtyFromAmount(amountManwon: number, price: number): number {
  if (!(price > 0)) return 0;
  return Math.floor((amountManwon * 10_000) / price);
}
```
**Analog 2 — `DIRTY_COMPARED_FIELDS`** (:153-175) `as const satisfies readonly (keyof LimitChaserFormValues)[]` — `'buyWatchSide'` 제거, 신 C→S 사용자 필드 추가(S→C 4는 넣지 않음).
**Analog 3 — `formFromServer`** (:301-330) 금액 보존 특례:
```ts
    buyOrderAmount: server.buyOrderAmount === 0 ? prev.buyOrderAmount : server.buyOrderAmount,
```
→ `extraBuyOrderAmount`·`postBuyOrderAmount` 도 같은 식(에코 0 = prev 보존, D-03 「—」 표시는 UI 쪽).
**기본값:** `defaultLimitChaserForm` (:249) · `seedFromUpperLimit` (:234) 에 D-04 표 값 추가, 상장주식수 시딩(D-17)은 새 순수 함수로 이 파일에 둔다.

---

### `webapp/src/components/trading/lc/lc-fields.ts` (선언형 스펙)
**Analog:** `LcGroupSpec` (:85-104) + `LC_BUY_GROUPS` (:106-159)
```ts
export interface LcGroupSpec {
  slot: 'buy-price' | 'buy' | 'sweep' | 'sell-price' | 'sell' | 'cancel';
  title?: '매수주문' | '한방체결' | '매도주문' | '매수취소';
  ariaLabel?: string;
  hint?: string;
  gate?: LcGate;
  statusKey?: LcStatusKey;
  dimWhenOff: boolean;
  rows: readonly LcRowSpec[];
}
```
행 종류 유니온 `LcRowSpec` (:63-78) — `value` · `checkValue` · `check` · `watch` · `derived`. 신 슬롯(`pre-buy`·`extra-buy`·`post-buy`), `LcGate`(:81)·`LcStatusKey`(:83)·`LC_SWITCH_LABEL`(:229) 확장. 행 선언 예:
```ts
      { kind: 'value', field: 'buyOrderPrice', id: 'lc-buy-order-price', label: '매수가격', unit: '원', desc: '넣을 매수 주문 가격이에요' },
```
D-09 개명(「매수가격」→「주문가격」, 「호가잔량」/「취소잔량」→「매수잔량」, desc 로 구분). `{ kind: 'watch' }`(:126) 는 `buyWatchSide` 제거로 삭제 대상. 후매수 「최대」·트리거 같은 읽기 전용은 `derived` 결을 확장. `lcRangeIssue`(:281)에 후매수 범위(반등 1~100) — 후매수 ON 일 때만(D-20).

### `webapp/src/components/trading/lc/setting-group.tsx` (component)
**Analog:** `SettingGroup` (:275-314). 접기 헤더·요약줄(`data-slot="lc-group-summary"`)은 헤더 div(`data-slot="lc-group-header"`) 뒤에 같은 결로 추가, `dim` 처리 유지:
```tsx
export function SettingGroup({ spec, statusText, on, switchNode, children }: SettingGroupProps) {
  const dim = spec.dimWhenOff && on === false;
  const titleId = useId();
  return (
    <section data-slot={`lc-group-${spec.slot}`} title={spec.hint} aria-label={spec.ariaLabel}
      className={cn('min-w-0 rounded-[16px] bg-[var(--group-bg)] px-2.5 pb-1', spec.title ? 'pt-2.5' : 'pt-1')}>
      {spec.title ? (<div data-slot="lc-group-header" ...>...{switchNode}</div>) : null}
      <div data-slot="lc-group-rows" className={cn('min-w-0', dim && 'opacity-45')}>
```
상태 색: `statusText === '감시 중' ? 'text-[var(--led-armed)]' : 'text-[var(--muted-fg)]'`. 칩(「포기」·「소진」)도 토큰 클래스만. 읽기 전용 행 = `DerivedRow` (:594-) 결(`data-slot="lc-derived"`, `ROW_BOX`). 값 포맷은 `formatSettingValue` (:42) — D-10 의미어(「무제한」「1주」「없음」)는 여기서 unit 별 분기 또는 `valueText` override 로. UI-SPEC data-slot: `lc-group-precheck` · `lc-group-summary` · `lc-post-buy-trigger` · `lc-post-buy-exhausted`.

### `webapp/src/components/trading/lc/use-lc-field-commit.ts` (hook)
**Analog:** 게이트 집합 + 차단 판정 (:129, :148-152, :194-196)
```ts
export const LC_GATE_FIELDS = ['buyEnabled', 'sweepEnabled', 'sellEnabled', 'cancelQtyEnabled'] as const satisfies readonly LcFieldKey[];

export function lcAmountBlockOf(amountRequired: boolean, field: LcFieldKey, value: unknown): string | null {
  if (!amountRequired || field === 'buyOrderAmount') return null;
  if (isGateField(field) && value === false) return null;
  return LC_COMMIT_TEXT.amountRequired;
}
```
- `LC_GATE_FIELDS` 에 `preBuyEnabled`·`extraBuyEnabled`·`postBuyEnabled` 추가(첫 스위치 = 등록).
- D-03: 새 그룹 금액 0 은 **그 그룹 스위치만** 막는 별도 판정 함수를 `lcAmountBlockOf` 옆에 같은 모양으로(문구는 `LC_COMMIT_TEXT.amountRequired` 재사용, 새 문구 원천 금지).
- D-01/D-02 companions(마스터 동반): `Pending` (:170-) 에 동반 필드를 싣고, 전송 cfg 조립은 여전히 `buildCfg` 하나(옵션 주석 「여기서 복제하지 않는다」).

### `webapp/src/components/trading/limit-chaser-form.tsx` (조립)
**Analog:** 자기 자신. `buildCfg`·`armBlockOf`·`canArmOf` 가 relay `#strategyArmable` 과 동형이어야 한다(두 식 같은 커밋). D-06/D-07 자동 체크 · D-16 상한가 차단은 「사람이 켜는 순간」 핸들러에만(에코 경로 금지, D-08).

---

### `webapp/src/components/trading/latch-led.tsx` (component)
**Analog:** sell 갈래 (:123-128) 의 반환 모양:
```ts
  if (kind === "sell") {
    if (!server.sellEnabled) return OFF_STATE;
    return server.sellEntryLatched
      ? { tone: "armed", clickable: true, label: "감시", tooltip: TOOLTIPS.sell.off }
      : { tone: "latent", clickable: true, label: "대기", tooltip: TOOLTIPS.sell.on };
  }
```
매수 갈래(:142-156) 교체: `!buyEnabled` → OFF_STATE, `postBuyPhase === 2` → `{ tone: "latent", clickable: false, label: "보유중" }`, 그 외 `{ tone: "armed", clickable: false, label: "감시" }`. `LatchLedLabel`(:47) 에 `"보유중"` 추가. `buyWatchSide`·`buyEntryLatched` 참조 제거(주석 :26 포함). 토큰 신설 없음(`--led-latent` 재사용).

### `webapp/src/components/trading/strategy-log.tsx`
**Analog:** 전이 집합 + 비교 루프.
- `TRANSITION_ORDER` (:120-) · `TRANSITION_TEXT` (:91) 에서 `buyLatched/buyUnlatched` 삭제, `preBuyOn/Off`·`extraBuyOn/Off`·`postBuyOn/Off` + 마스터 동반 전이 추가.
- `strategyLogLine` (:220-262) 의 기존 무장 전이 결 그대로:
```ts
    if (!prev.buyEnabled && next.buyEnabled) hit.add('buyArmed');
    if (prev.buyEnabled && !next.buyEnabled) {
      hit.add(opts.hadOrder === true ? 'buyFired' : 'buyDisarmed');
    }
    if (!prev.buyEntryLatched && next.buyEntryLatched) hit.add('buyLatched');   // ← 삭제(:248-249, :237)
```
- skip 집합 (:158-176) 은 shared const 파생이라 shared 쪽 확장만으로 따라온다; `VALUE_COMPARE_SKIP` 에는 그룹 게이트 3종(`preBuyEnabled` 등)을 `buyEnabled` 옆에 명시 추가.

### `webapp/src/components/trading/card/card-body.tsx`
**Analog:** `cardGroupStatusOf` (:123-142)
```ts
  return {
    buy: server?.buyEnabled === true ? stage('buy') : fired ? '발주 완료 · 무장 해제' : '꺼짐',
    sweep: server?.sweepEnabled === true ? '켜짐' : '꺼짐',
    sell: server?.sellEnabled === true ? stage('sell') : '꺼짐',
    cancel: cancelOff ? '꺼짐' : stage('cancel'),
  };
```
→ 신 그룹 키(pre/extra/post), D-02 「세 그룹 OFF · 마스터 ON」 중립 문구, D-15 `postBuyPhase === 2` 일 때 sell·cancel 에 `' · 후매수 발동'` 접미.

### `webapp/src/components/trading/card/strategy-card.tsx`
**Analog:** 자기 자신. `hadOrder` 합성(`{ ...item, hadOrder }` :169) 유지, `lc.arm` 호출부에서 `latch: 'buy'` 경로 제거(LED 매수 비클릭). 발동 override(서버가 매도·취소 값을 덮은 에코)는 「다른 단말 변경」 배너로 오인하지 않게 런타임 에코 분류(:438-442 주석 규율)에 귀속.

---

### `webapp/src/test-fixtures/limit-chaser.ts` (신설 fixture)
**Analog:** 현재 `buyEntryLatched: false` 를 인라인으로 가진 팩토리 17곳:
`webapp/src/components/layout/__tests__/app-sidebar.test.tsx`, `webapp/src/components/trading/lc/__tests__/{lc-tracer,use-lc-field-commit,inline-navigation}.test.tsx`, `webapp/src/components/trading/__tests__/{strategy-card,card-body,strategy-card-flow,card-header,strategy-log,limit-chaser-form,strategy-status-card,latch-led,strategy-badge}.test.tsx`, `webapp/src/lib/__tests__/{isin-labels.test.tsx,limit-chaser.test.ts,strategy-log-feed.test.tsx,relay-provider.test.tsx}`.
`makeLimitChaser(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser` 하나로 기본 전체 필드를 두고 각 테스트는 override 만. `webapp/src/test-fixtures/` 디렉터리는 아직 없다(신설).

E2E: `webapp/e2e/specs/trading-workbench.spec.ts` — D-09 라벨 개명·새 data-slot 셀렉터 영향.

## Shared Patterns

### S→C 필드 단일 정본
**Source:** `packages/shared/src/relay.ts:270-289`
**Apply to:** shared · relay builder JSDoc · webapp `strategy-log.tsx` skip · `limit-chaser.ts` 폼 타입. 필드 목록을 두 벌 두지 말고 const 에서 파생.

### relay/UI 무장 가드 동형
**Source:** `relay/src/ws/fanout.ts:1225-1238` ↔ `limit-chaser-form.tsx` `canArmOf`/`armBlockOf`
**Apply to:** 두 파일을 같은 태스크에서 함께 수정. relay 는 문구 1종 + 로그 `gate`, UI 가 필드별 안내.

### 에코 경로는 제출을 만들지 않는다
**Source:** `use-lc-field-commit.ts` 확정 경로 · `strategy-card.tsx:438-442` 주석
**Apply to:** D-01/D-02/D-06/D-07/D-16/D-17 — 전부 「사람 입력 핸들러」에서만, 에코/재접속 경로 금지.

### 문구 원천 한 곳
**Source:** `use-lc-field-commit.ts` `LC_COMMIT_TEXT` (:132-142), `strategy-log.tsx` `TRANSITION_TEXT` (:91)
**Apply to:** 신 문구는 이 두 const 에만 추가. 서버 사유 줄(D-13·D-18)은 원문 그대로 통과.

### 색은 토큰 클래스만
**Source:** `latch-led.tsx` `DOT_CLASS` (:158-), `setting-group.tsx` 상태 색
**Apply to:** 보유중 LED·칩. JS 로 토큰값 주입 금지, 새 토큰 없음.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (부분) `setting-group.tsx` 접기/요약줄 | component | event-driven | 기존 그룹 카드는 접기 상태가 없다 — 구조는 `SettingGroup`, 동작은 UI-SPEC 계약을 따른다 |
| D-14 운영 전략 추출(첫 웨이브 독립 태스크) | ops script | batch | 코드 파일 아님 — 현 서버 64 열거를 읽는 일회성 점검. 필요 시 `relay/tests/helpers/frames.ts` `buildLimitChaserListRespFrame`(:748) 역방향 파싱 참고 |

## Metadata
**Analog search scope:** `relay/src/{dma,ws}`, `relay/tests/helpers`, `packages/shared/src`, `webapp/src/{lib,components/trading}`, `webapp/src/**/__tests__`, `webapp/e2e/specs`
**Files scanned:** 약 40
**Pattern extraction date:** 2026-09-27
