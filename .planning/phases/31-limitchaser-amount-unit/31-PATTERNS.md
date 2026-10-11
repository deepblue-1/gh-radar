# Phase 31: 인박스 상따 금액 단위 - Pattern Map

**Mapped:** 2026-10-11
**Files analyzed:** 24 (신규 2 · 수정 22)
**Analogs found:** 24 / 24 (신규 2개는 shared 순수 모듈 선례, 나머지는 같은 파일 안의 선례 필드 `buyOrderAmount` · `extraBuyMinQty` · `postBuyFloorQty`)

모든 인용 경로는 `git ls-files` 로 tracked 임을 확인했다. 줄 번호는 2026-10-11 브랜치 `phase/31-limitchaser-amount-unit` 기준이다.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `packages/shared/src/lc-amount.ts` (신규) | utility(순수 함수 · 계약 표) | transform | `packages/shared/src/order-endpoint.ts` | role-match(gh-trade 규칙 이식 + 소비자 다수) |
| `packages/shared/src/__tests__/lc-amount.test.ts` (신규) | test | transform | `packages/shared/src/__tests__/order-endpoint.test.ts` | exact |
| `packages/shared/src/index.ts` | config(barrel) | — | 같은 파일 말미 `export * from "./order-endpoint";` | exact |
| `packages/shared/src/relay.ts` | model(계약 타입 · 범위) | — | 같은 파일 `buyOrderAmount`(152~158 · 236~240) · `extraBuyOrderAmount`(277) · `USER_SETTINGS_RANGES`(1433~1445) | exact |
| `relay/src/ws/protocol.ts` | middleware(zod 인바운드) | request-response | 같은 파일 `postBuyFloorQty: UIntSchema.optional()`(213) · `RelayUserSettingsSetSchema`(410~424) · 철거 기본값(560~572) | exact |
| `relay/src/dma/envelope.ts` | service(FlatBuffers 코덱) | transform | 같은 파일 `LcSetCfg`(1441~1452) · `addBuyOrderAmount`(1637) · `readLimitChaser`(2589 · 2621) · `buildSetUserSettingsReq`(2052~2072) · `parseUserSettings`(790~806) | exact |
| `relay/src/ws/fanout.ts` (권고 · Open Q1) | controller | request-response | 같은 파일 user.settings.set 경로 + `subscription-hub.ts getUserSettings` | role-match |
| `relay/tests/helpers/frames.ts` · `fake-gateway.ts` | test helper | transform | 같은 파일의 60/64/84 프레임 빌더 | exact |
| `relay/src/dma/__tests__/envelope.test.ts` | test | transform | 같은 파일 `buyOrderAmount: 100`(1351) → `t.buyOrderAmount()` 단언(1423) | exact |
| `relay/tests/protocol.test.ts` · `relay/tests/fanout.test.ts` | test | request-response | 같은 파일의 선택 필드 · 42 케이스 | exact |
| `webapp/src/lib/limit-chaser.ts` | utility(폼 값 모델) | transform | 같은 파일 `buyOrderQtyFromAmount`(107~110) · `formFromServer`(666~) · `seedListSharesDefaults`(315~326) · `isMasterOnlyDelta`(735) | exact |
| `webapp/src/lib/lc-ranges.ts` | config | — | 같은 파일 기존 만원 범위 | exact |
| `webapp/src/lib/numpad.ts` | utility | — | `PadUnit`(26) · `PAD_CHIPS.만원`(83~) | exact |
| `webapp/src/components/trading/limit-chaser-form.tsx` | component | request-response | 같은 파일 `buildCfg`(674~695) · `canArmOf`(338~355) · `armBlockedTextOf`(266~275) | exact |
| `webapp/src/components/trading/lc/lc-fields.ts` | config(행 스펙) | — | 같은 파일 `buyWatchQty` 행(224~231) · 요약 kv(705) | exact |
| `webapp/src/components/trading/lc/setting-group.tsx` | component | — | `ROW_BOX`(77~78) · `ValueWithChevron`(205~) · `SettingRow`(263) · `CheckValueRow`(771) · `DerivedRow`(910~) | exact |
| `webapp/src/components/trading/lc/number-pad-sheet.tsx` | component | event-driven | 같은 파일 `validate` prop(93 · 158) · 상태 줄 사슬(169~173) | exact |
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | hook | request-response | `sameAsServer`(404~408) · `sendNow` 차단/cfg(615~627) | exact |
| `webapp/src/components/me/limit-chaser-defaults.tsx` | component | request-response | `USER_SETTINGS_ROWS`(86~) · `userSettingsValuesOf`(194~208) | exact |
| `webapp/src/test-fixtures/limit-chaser.ts` | test fixture | — | 같은 파일 `RelayLimitChaser` 픽스처 | exact |
| `webapp/src/lib/__tests__/limit-chaser.test.ts` · `lc/__tests__/use-lc-field-commit.test.tsx` · `trading/__tests__/limit-chaser-form.test.tsx` · `me/__tests__/limit-chaser-defaults.test.tsx` | test | — | 같은 파일 기존 케이스 | exact |
| `webapp/e2e/specs/trading-workbench.spec.ts` · `me.spec.ts` | e2e test | — | 같은 파일 P20-3 · P24-7(44px 단언) · /me 84 픽스처 | exact |
| `docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md` | doc | — | `docs/inbox/from-gh-trade/README.md` 형식 | exact |

## Pattern Assignments

### `packages/shared/src/lc-amount.ts` (신규 · utility, transform)

**Analog:** `packages/shared/src/order-endpoint.ts`

**파일 머리 주석 패턴** (1~16행) — 「gh-trade 원본 이식 · 규칙 한 벌 · 소비자 목록」을 머리에 둔다:
```typescript
/**
 * Phase 30 (30-02) — KB 계좌 **주문자 IP/MAC** 정규화 · 검증 · 표시 판정 한 벌.
 *
 * 정규화 규칙은 gh-trade `server/src/broker/base/AccountUtil.h` `NormalizeOrderIp/Mac` 이식이다 — 규칙이 갈라지면 ...
 *   - relay 멱등 비교(...)
 *   - Express 개요(...)
 *   - webapp 계좌 편집기 검증 · 표시 · 「변경 없음」 판정.
 * - 오류 문구는 여기 두지 않는다(webapp `ACCOUNT_EDITOR_TEXT` 몫) — 여기는 오류 종류 · 칸만 낸다.
 */
import type { AdminAccountView } from "./admin";
```
→ lc-amount 머리에 「gh-trade `LimitChaserForm.cs:5691-5757` `QtyFromAmount/QtyForSubmit/NarrowQty/AmountFromQty/AmountOrDerive` 이식 · 소비자: webapp 행/시트/제출/검증/시딩, relay 테스트 픽스처」를 적는다. 타입은 `import type { RelayLimitChaser } from "./relay";` 로만(순환 금지). **거부 문장은 여기 두지 않는다**(webapp `armBlockedTextOf` 몫 — order-endpoint 의 「문구는 webapp 몫」 규칙과 같다).

**함수 본체 패턴** (order-endpoint.ts 24~32행 — 짧은 JSDoc + 가드 먼저 + 순수 반환):
```typescript
export function normalizeOrderIp(raw: string): string | null {
  if (raw === "") return "";
  if (/^\d{12}$/.test(raw)) return raw;
  ...
}
```
본체 식은 RESEARCH Pattern 1 · 2(`qtyFromAmount` · `narrowQty`(int.Max 2_147_483_647) · `amountFromQty`(+5000 · BigInt 폴백) · `amountOrDerive` · `LC_AMOUNT_PAIRS` · `echoAmountOf` · `qtyForSubmit`)를 그대로 쓴다. 기존 webapp 선례 `buyOrderQtyFromAmount`(`webapp/src/lib/limit-chaser.ts:107-110`)의 가드 `if (!(price > 0)) return 0;` 와 같은 어투다.

### `packages/shared/src/__tests__/lc-amount.test.ts` (신규 · test)

**Analog:** `packages/shared/src/__tests__/order-endpoint.test.ts` (1~20행)
```typescript
/**
 * Phase 30 (30-02) — 주문자 IP/MAC 정규화 · 검증 표(gh-trade `.../AccountUtil.h` ... 이식).
 * 규칙이 gh-trade 와 갈라지면 ... — 표본은 gh-trade 규칙 원문에서 뽑았다.
 */
import { describe, expect, it } from "vitest";

import { normalizeOrderIp, ... } from "../order-endpoint";

describe("normalizeOrderIp — gh-trade NormalizeOrderIp 이식 (D-04 · D-13)", () => {
  it.each([
    { name: "빈 입력 → \"\"(미설정)", input: "", expected: "" },
```
→ `it.each` 표에 UI-SPEC 「예시 수치 정정」 표(12,870원 · 1,000만 → 777주, 25,000주 → 32,175만, 127,400원 · 12만 → 0주 / 13만 → 1주)와 int.Max 좁힘 · BigInt 극단값 · 짝 검사 · 추적 ON 메모를 넣는다. 실행: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts`.

### `packages/shared/src/index.ts` (barrel)

**Analog:** 같은 파일 말미
```typescript
// --- Phase 30 (30-02) 주문자 IP/MAC 정규화 · 검증 · 표시 판정 한 벌(gh-trade AccountUtil.h 이식) — relay 멱등 비교 · Express 개요 · webapp 편집기 ---
export * from "./order-endpoint";
```
→ 그 아래에 `// --- Phase 31 상따 금액(만원)↔주 §10 환산 한 벌 ... ---` + `export * from "./lc-amount";` (확장자 없음 — Turbopack 규칙). 이름이 더해질 수 있으므로 모듈 단위 재수출(index 주석의 Phase 25 · 29 관행).

### `packages/shared/src/relay.ts` (model)

**Analog — 「보관·에코만」 금액 필드 선례:**
- `RelayLimitChaser` 블록 주의(152~158): 「`buyOrderAmount === 0` 이 "서버가 모른다"인 것은 구서버 에코에서만 ... 수량 x 가격 역산은 어느 쪽이든 금지」 — **이번 phase 는 8 금액에 대해 역산을 허용(D-06)** 하므로 8필드 JSDoc 은 이 문장과 다르게 「0 = 클라가 주에서 역산 표시(fbs 원문)」를 적는다. 152 주의 문단 자체는 `buyOrderAmount` 에만 해당한다고 남긴다.
- 필드 JSDoc 어투(277): `/** 줄매수 주문금액 — **단위 만원**. 서버는 보관·에코만 한다(`buyOrderAmount` 규약). */`
  → 예 `/** 선매수 매도잔량 금액 — **단위 만원** · 짝 `buyWatchQty`. 서버는 보관·에코만 한다(`buyOrderAmount` 규약 · 평가는 주). 부재/구서버 = 0 → 클라가 주에서 역산 표시. */`
- `RelayLimitChaserInput`(505~512)은 `Omit<RelayLimitChaser, LimitChaserServerOnlyField | ...>` 이므로 8필드를 `RelayLimitChaser` 에 넣으면 입력에서 **필수**가 된다 — S→C 전용 목록(`LIMIT_CHASER_SERVER_*_FIELDS`)에는 넣지 않는다(D-11).
- `RelayUserSettingsValues`(1395~1418): `/** 후매수 하한잔량(주) · 0~99999999. */ postBuyFloorQty: number;` → JSDoc 에 「봉인 — 신 클라는 0 을 싣고 읽지 않는다」, 새 줄 `/** 후매수 하한금액 — **만원** · 0~999999999. */ postBuyFloorAmount: number;`
- `USER_SETTINGS_RANGES`(1433~1445) — `satisfies Record<keyof RelayUserSettingsValues, ...>` 라서 Values 에 키를 더하면 범위 누락이 컴파일 에러가 된다:
```typescript
  postBuyFloorQty: { min: 0, max: 99_999_999 },
  // + postBuyFloorAmount: { min: 0, max: 999_999_999 },
```
주석 「사용자 설정 11값」(1424 · protocol.ts 13 · 405) 은 12값으로 고친다.

### `relay/src/ws/protocol.ts` (zod)

**Analog — 선택 필드 패턴** (196~217행):
```typescript
    // === Phase 24 매수 3종 C→S 12 (gh-trade D-17) — **선택**(구 탭 관용 · 24-03). 부재는
    //     fanout `buy3CfgOf` 가 판정한다 — 기본값을 여기서 채우지 않는다.
    ...
    /** 단위 만원. */
    extraBuyOrderAmount: UIntSchema.optional(),
    ...
    postBuyFloorQty: UIntSchema.optional(),
    // === 후매수 ☐자동(양방향 · ...) — 위 12필드 블록 **밖**이다.
    //   - 12필드 존재 판정(`buy3CfgOf`)에 들어가지 않는다 ...
```
→ 8필드는 「12필드 블록 밖」 주석 블록 형식으로 `UIntSchema.optional()` 8줄(RESEARCH Code Examples). `buy3CfgOf` · `lcBuy3SchemaOf` 에 넣지 않는다.

**user.settings.set** (404~424행) — `postBuyFloorQty: userSettingInt("postBuyFloorQty"),` 옆에 `postBuyFloorAmount: userSettingInt("postBuyFloorAmount"),` (필수냐 선택이냐는 RESEARCH Open Q1 · Pitfall 3 — 플래너가 사용자 확인 결과를 반영. 선택이면 `.optional()` + fanout 84 캐시 되싣기). `userSettingInt` 는 `USER_SETTINGS_RANGES` 를 읽으므로 범위는 shared 한 벌.

**철거 프레임 기본값** (560~572행) — `satisfies Partial<RelayLimitChaserInput>` 객체에 금액 8개를 넣을지는 철거 조립이 `?? 0` 으로 0 을 쓰므로 생략 가능. 다만 이 객체를 쓰는 철거 경로가 C# 원값을 지우게 되는지(D-10 one-way) 확인 — 철거는 crud D 이므로 문제 없음을 주석으로 남긴다.

### `relay/src/dma/envelope.ts` (코덱)

**LcSetCfg** (1441~1452) — 선택 재부착 선례:
```typescript
export type LcSetCfg = Omit<
  RelayLimitChaserInput,
  "postBuyAuto" | "extraBuyBurstRelease" | LcAutoSellReqKey | "extraBuyAuto"
> & {
  postBuyAuto?: boolean;
  ...
};
```
→ `| LcAmountKey` 를 Omit 에 더하고 `& Partial<Pick<RelayLimitChaserInput, LcAmountKey>>`.

**조립** (1637 선례 · 1698~1700 말미):
```typescript
  SetLimitChaser.addBuyOrderAmount(b, toWireUint(cfg.buyOrderAmount, "buyOrderAmount"));
  ...
  if (buy3Schema >= LC_EXTRA_BUY_AUTO_BUY3_SCHEMA && cfg.extraBuyAuto !== undefined) {
    SetLimitChaser.addExtraBuyAuto(b, cfg.extraBuyAuto);
  }
  const table = SetLimitChaser.endSetLimitChaser(b);
```
→ `addExtraBuyAuto` 블록 뒤 · `endSetLimitChaser` 앞에 주석 `// 금액 8(vtable 158~172 · buyOrderAmount 규약 · 부재 = 0)` + `SetLimitChaser.addBuyWatchAmount(b, toWireUint(cfg.buyWatchAmount ?? 0, "buyWatchAmount"));` 8줄. schema 조건 없이 늘 싣는다(0 은 기본값이라 버퍼에 안 쓰임).

**60/64 파서** (`readLimitChaser` 2530~ · 2589 `buyOrderAmount: t.buyOrderAmount(),` · 2621 `postBuyFloorQty: t.postBuyFloorQty(),`) → 같은 반환 객체에 `buyWatchAmount: t.buyWatchAmount(),` 등 8줄, 주석 「슬롯 부재(구 서버) = 0 · 역산은 웹 몫」(2615 `extraBuyAbandonQty` 주석 어투).

**42 조립** (2052~2072):
```typescript
  UserSettings.addPostBuyFloorQty(b, toWireUint(s.postBuyFloorQty, "postBuyFloorQty"));
  ...
  // present — 84 전용(서버가 42 요청값을 읽지 않는다). 싣지 않는다.
```
→ `UserSettings.addPostBuyFloorQty(b, 0); // 봉인 — 늘 0 (Phase 32 D-08)` + `UserSettings.addPostBuyFloorAmount(b, toWireUint(s.postBuyFloorAmount, "postBuyFloorAmount"));`

**84 파서** (790~806): `postBuyFloorQty: u.postBuyFloorQty(),` 아래 `postBuyFloorAmount: u.postBuyFloorAmount(), // vtable 28 · 구 84(부재) = 0`.

### relay 테스트 (`relay/src/dma/__tests__/envelope.test.ts` · `relay/tests/protocol.test.ts` · `relay/tests/fanout.test.ts` · `relay/tests/helpers/{frames,fake-gateway}.ts`)

**Analog:** envelope.test.ts 1351 cfg 픽스처 `buyOrderAmount: 100,` → 1423 `expect(t.buyOrderAmount()).toBe(100);` 왕복 단언. 8 금액도 같은 형식(왕복 + 부재 = 0 + 구 탭 cfg 에 금액 없음 → 0). 짝이 맞는 값은 shared `qtyFromAmount` 로 만든다(D-02 「두 곳에 적지 않는다」). protocol.test 는 기존 `.optional()` 필드 케이스(부재 통과 · 음수/소수 거부) 복제. 헬퍼 frames/fake-gateway 의 60/64/84 빌더와 10/42 디코드 기록에 필드 추가.

### `webapp/src/lib/limit-chaser.ts`

**formFromServer** (666~) — 「서버가 모르는 값 보존」 선례:
```typescript
    buyOrderAmount: isLegacyAmountUnknown(server) ? prev.buyOrderAmount : server.buyOrderAmount,
    ...
    buyWatchQty: server.buyWatchQty,
    sellWatchQty: server.sellWatchQty,
```
→ 주 8키 줄을 금액 8키 `buyWatchAmount: echoAmountOf(server, PAIR).shown` 로 교체(D-06 · 추적 ON 은 기준선 역산). `prev` 보존 규칙은 금액 8에는 쓰지 않는다(역산이 정본 — buyOrderAmount 와 다른 점을 JSDoc 에 명시).

**LimitChaserFormValues** (69~) — `Omit<..., 'buyOrderQty' | ...>` 목록에 주 8키를 더해 폼에서 뺀다(RESEARCH Pattern 3). `RelayLimitChaserInput` 이 주를 필수로 요구하므로 `buildCfg` 가 빠뜨리면 컴파일 에러.

**환산 선례** (100~110) `buyOrderQtyFromAmount` — 주석 「★ 역산을 만들지 않는다」는 금액 3칸(D-09)에만 남는다. 8칸은 shared `qtyFromAmount` 를 부른다(이 함수를 shared 로 옮기지 않는다 — D-09 범위 밖).

**seedListSharesDefaults** (315~326):
```typescript
  return {
    buyWatchQty: permille,
    buyMinTradeQty: permille,
    extraBuyMinQty: Math.min(permille, UINT32_MAX),
    extraBuyMaxQty: Math.min(percent, UINT32_MAX),
    sellMinTradeQty: permille,
  };
```
→ 금액 키 + `amountFromQty(주, 상한가)`(D-12 · Pitfall 9 — 가격 0 이면 null 로 미룸). `defaultLimitChaserForm`(226~) 은 7칸 0, `seedFromUserSettings`(399~) 는 `postBuyFloorAmount`.

`isMasterOnlyDelta`(735) · `groupAutoChecksOf`(491) 는 Pitfall 2 · 8 — 주 키 비교를 shared 쌍 표로.

### `webapp/src/components/trading/limit-chaser-form.tsx`

**buildCfg** (674~695):
```typescript
      // 발주 정본. **역산 금지** — 산출식은 `lib/limit-chaser.ts` 한 곳뿐이다.
      buyOrderQty: buyOrderQtyFromAmount(values.buyOrderAmount, values.buyOrderPrice),
      extraBuyOrderQty: buyOrderQtyFromAmount(values.extraBuyOrderAmount, values.buyOrderPrice),
      postBuyOrderQty: buyOrderQtyFromAmount(values.postBuyOrderAmount, values.buyOrderPrice),
```
→ 같은 자리에 `...Object.fromEntries(LC_AMOUNT_PAIRS.map(p => [p.qty, qtyForSubmit(values[p.amount], values[p.price], server ? echoAmountOf(server, p) : null)]))`. `server` 는 `serverRef.current` (deps 주의).

**armBlockedTextOf** (266~275 · 문장 산출 단일 지점) · **canArmOf** (338~355, `const sell = values.sellOrderPrice > 0 && values.sellWatchQty > 0;` → 환산 주). D-03/D-04 판정은 UI-SPEC 「등록 차단 문구」 표 순서로 이 파일 한 곳에.

### `webapp/src/components/trading/lc/use-lc-field-commit.ts`

**성공 판정** (404~408):
```typescript
function sameAsServer(server: RelayLimitChaser, field: LcFieldKey, value: unknown, companions?: ...): boolean {
  if (server[field] !== value) return false;
```
→ Pitfall 1: 금액 키는 `echoAmountOf(server, pair).shown === value` 또는 (에코 금액 0 ∧ 주 일치)로. 성공 판정 위치(93행 주석이 「주 필드만」 규약을 설명)도 같이 갱신.

**sendNow** (615~627) — 차단 · cfg 덮어쓰기 선례:
```typescript
      const blocked = turningOff ? null : (armBlockOf?.(next) ?? null);
      ...
      let cfg = buildCfg(next);
      if (server != null && amountUnknownNow()) {
        cfg = { ...cfg, buyOrderAmount: server.buyOrderAmount, buyOrderQty: server.buyOrderQty };
      }
```
→ `armBlockOf` 가 server(메모)를 받도록 시그니처 확장 또는 serverRef.

### `webapp/src/components/trading/lc/lc-fields.ts`

**Analog 행** (224~231):
```typescript
      {
        kind: 'value',
        field: 'buyWatchQty',
        id: 'lc-buy-watch-qty',
        label: '매도잔량',
        unit: '주',
        sheetTitle: '선매수 매도잔량',
        desc: '비교가격의 매도잔량이 이 값 이하로 줄면 선매수를 넣어요',
      },
```
→ `field: 'buyWatchAmount'`, `unit: '만'`, desc 「이 금액」(UI-SPEC 시트 설명 표), **id 는 그대로**(e2e 셀렉터 안정). `unit: '주'` 행 8곳: 229 · 240 · 299 · 309 · 363 · 427 · 450 · 472. 요약 kv(705 `fmt(values.buyWatchQty, '주')`) 는 UI-SPEC 「접힌 카드 요약 줄」.

### `webapp/src/components/trading/lc/setting-group.tsx`

**ROW_BOX** (77~78):
```typescript
const ROW_BOX =
  'flex min-h-[44px] w-full min-w-0 items-center justify-between gap-1 rounded-[10px] px-0 text-left @min-[685px]/lc:gap-1.5 @min-[685px]/lc:px-1';
```
→ 두 줄 변형용 `min-h-[56px]` 상수를 따로(44 행은 불변).
**ValueWithChevron** (205~) — `data-slot="lc-row-value"` 글자 불변 · 쉐브런 L3 규칙 주석을 그대로 두고, 아래 줄 `data-slot="lc-row-sub"`(`data-tone="alert"` 시 `--destructive`) 를 이 컴포넌트의 두 줄 변형에 추가. `CheckValueRow`(771~ · 852 값 버튼 `min-h-[44px]`) · `DerivedRow`(910~935 muted/empty 분기)도 같은 변형.

### `webapp/src/components/trading/lc/number-pad-sheet.tsx` + `webapp/src/lib/numpad.ts`

**validate 잠금** (93 · 158):
```typescript
  validate?: (value: number) => string | null;
  const issue = padIssue(pad, unit, ctx) ?? (value !== null && validate ? validate(value) : null);
```
**상태 줄 사슬** (169~173):
```typescript
  if (issue) line = { tone: 'alert', text: issue };
  else if (!busy && failureText) line = { tone: 'alert', text: failureText };
  else if (warning) line = { tone: 'warn', text: warning };
  else if (otherDevice) line = { tone: 'status', text: LC_COMMIT_TEXT.otherDevice };
  else if (armedNotice) line = { tone: 'status', text: LC_COMMIT_TEXT.armed, armed: true };
```
→ 환산 안내 `hint(value)` 새 prop 은 ⑤(status) — 감시 중이면 같은 줄 안 둘째 줄로 armed 안내(UI-SPEC 우선순위). numpad.ts: `PadUnit`(26)에 `'만'` 추가, `PAD_CHIPS`(83~)에 `만: PAD_CHIPS 만원 칩 재사용`(Record 타입이라 키 누락 시 컴파일 에러).

### `webapp/src/components/me/limit-chaser-defaults.tsx`

**행 스펙** (92):
```typescript
  { key: "postBuyFloorQty", label: "후매수 하한잔량", unit: "주", group: "후매수", id: "me-lc-post-buy-floor-qty" },
```
→ `{ key: "postBuyFloorAmount", label: "후매수 최소", unit: "만원", group: "후매수", id: "me-lc-post-buy-floor-amount" }` 같은 자리.
**42 조립** (194~208) `userSettingsValuesOf` — `postBuyFloorQty: s.postBuyFloorQty,` → `postBuyFloorQty: 0, // 봉인` + `postBuyFloorAmount: s.postBuyFloorAmount,`. 84 에 필드 부재면 「불러오는 중」 유지(UI-SPEC S5 · Pitfall 10).

## Shared Patterns

### 범위 정본 한 벌
**Source:** `packages/shared/src/relay.ts:1433-1445` (`USER_SETTINGS_RANGES ... satisfies Record<keyof RelayUserSettingsValues, ...>`)
**Apply to:** relay zod(`userSettingInt`) · /me 시트 · webapp `lc-ranges.ts` 금액 8칸(0~999,999,999 = `LC_AMOUNT_MAX_MANWON`).

### 「보관·에코만」 금액 필드 3층 (zod 선택 → 조립 `toWireUint(?? 0)` → 파서 그대로)
**Source:** `buyOrderAmount` — `relay/src/ws/protocol.ts:191` · `relay/src/dma/envelope.ts:1637` · `:2589` · `packages/shared/src/relay.ts:236-240` · `webapp/.../use-lc-field-commit.ts:626`
**Apply to:** 금액 8필드 전부 (차이: zod 는 `.optional()`, 조립은 `?? 0`).

### 문장 산출 단일 지점
**Source:** `webapp/src/components/trading/limit-chaser-form.tsx:266-275` `armBlockedTextOf` (주석 「두 곳에 따로 적으면 ... 신뢰 결함」)
**Apply to:** D-03/D-04 8 문구 · 시트 잠금 문구는 같은 문장 상수를 재사용.

### shared 순수 모듈 + 모듈 단위 재수출
**Source:** `packages/shared/src/order-endpoint.ts` + `index.ts` 말미 `export * from "./order-endpoint";`
**Apply to:** `lc-amount.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (없음) | — | — | 두 줄 행 변형은 선례가 없으나 `ValueWithChevron`/`DerivedRow` 확장이라 role-match 로 처리. 시각 기준은 목업 `reference/mockup-amount-unit.html` 변형 C · UI-SPEC S1~S4 |

## Metadata

**Analog search scope:** `packages/shared/src`, `relay/src/ws`, `relay/src/dma`, `webapp/src/lib`, `webapp/src/components/trading/lc`, `webapp/src/components/me`
**Files scanned:** 약 20
**Pattern extraction date:** 2026-10-11
