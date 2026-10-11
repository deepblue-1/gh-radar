# Phase 20: 호가주문 토스식 재구성 (실험 브랜치) - Pattern Map

**Mapped:** 2026-09-25
**Files analyzed:** 20 (신규 11 · 수정 9, 테스트/e2e 포함)
**Analogs found:** 19 / 20

모든 경로는 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/toss-b` 기준이며 git 추적 소스다.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `packages/shared/src/krxTick.ts` (신규) | utility(순수) | transform | `packages/shared/src/limitUp.ts:84-95` · `webapp/src/components/orderbook/order-panel.tsx:104-120` | exact |
| `packages/shared/src/krxTick.test.ts` (신규) | test | — | `packages/shared/src/limitUp.test.ts` | exact |
| `packages/shared/src/limitUp.ts` (수정) | utility | transform | 자기 자신 — 7구간 if 사슬을 `krxTickSize` 호출로 | exact |
| `packages/shared/src/index.ts` (수정) | config(barrel) | — | 같은 파일 `export { limitUpPrice } from "./limitUp";` 줄 | exact |
| `webapp/src/lib/use-edit-mode.ts` (신규) | hook | event-driven(matchMedia 구독) | `webapp/src/components/trading/workbench/card-grid.tsx:113-122`(useSyncExternalStore) · `workbench/alert-toasts.tsx:46-47`(matchMedia 가드) | role-match |
| `webapp/src/lib/numpad.ts` (신규) | utility(순수 리듀서) | transform | `limit-chaser-form.tsx:1609` `parseDigits` · `manual-order-form.tsx:1245-1262` `clampPieces/formatDigits/digitsToNumber` | partial |
| `webapp/src/lib/__tests__/{use-edit-mode,numpad}.test.ts` (신규) | test | — | `components/trading/__tests__/alert-toasts.test.tsx:44-66`(matchMedia 교체/복원) | role-match |
| `webapp/src/components/trading/lc/lc-fields.ts` (신규) | config(필드 스펙) | — | `limit-chaser-form.tsx:700-1020` 의 필드 id·라벨 나열 | partial |
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` (신규) | hook(상태 기계) | request-response(send→에코) | `limit-chaser-form.tsx:575-656` `toggleGate`/`handleSubmit` | exact(로직 이식) |
| `webapp/src/components/trading/lc/number-pad-sheet.tsx` (신규) | component(모달) | event-driven | `webapp/src/components/ui/sheet.tsx`(Radix Dialog 조립) | role-match |
| `webapp/src/components/trading/lc/setting-group.tsx` (신규) | component | event-driven | `limit-chaser-form.tsx:1269-1390` `Group`·`GateSwitch`·`Row` + `components/ui/switch.tsx` | exact |
| `webapp/src/components/trading/lc/inline-value-editor.tsx` (신규) | component | event-driven | `limit-chaser-form.tsx:1392-1477` `NumInput` + `components/ui/popover.tsx` | exact |
| `webapp/src/components/trading/limit-chaser-form.tsx` (수정) | component(조립) | request-response | 자기 자신 | — |
| `webapp/src/components/trading/card/manual-order-form.tsx` (수정) | component | request-response | 자기 자신 `Row`(:1117)·`UnitBox`(:1148)·`OrderButton`(:1199) | — |
| `webapp/src/components/trading/card/card-body.tsx` (수정) | component(배선) | — | 자기 자신 | — |
| `webapp/src/components/orderbook/order-panel.tsx` (수정) | component | transform | `:104-120` `TICK_TABLE`/`tickFromTable` → `krxTickSize` | exact |
| `webapp/src/styles/globals.css` (수정) | config(토큰) | — | `:root`(:39) / `.dark`(:149) 블록 | exact |
| `webapp/src/styles/__tests__/tds-tokens.test.ts` (수정) | test | — | 자기 자신 `LIGHT_EXPECTED` | exact |
| `__tests__/limit-chaser-form.test.tsx` · `card-body` · `strategy-card-flow` · `manual-order-form` · `lc/__tests__/number-pad-sheet.test.tsx` | test | — | `limit-chaser-form.test.tsx:1-80`(relay 스텁) | exact |
| `e2e/specs/{trading-workbench,orderbook,a11y,sidebar-tree}.spec.ts` (수정) | test(e2e) | — | `trading-workbench.spec.ts:100-125` 셀렉터 헬퍼 | exact |

## Pattern Assignments

### `packages/shared/src/krxTick.ts` (utility, transform)

**Analog:** `packages/shared/src/limitUp.ts:84-95` (7구간 정본, target 가격 기준)
```ts
export function limitUpPrice(prevClose: number): number {
  const tgt = prevClose * 1.3;
  let unit: number;
  if (tgt < 2000) unit = 1;
  else if (tgt < 5000) unit = 5;
  else if (tgt < 20000) unit = 10;
  else if (tgt < 50000) unit = 50;
  else if (tgt < 200000) unit = 100;
  else if (tgt < 500000) unit = 500;
  else unit = 1000;
  return Math.floor(tgt / unit) * unit;
}
```
**표 형태 참고:** `webapp/src/components/orderbook/order-panel.tsx:104-120`
```ts
const TICK_TABLE: readonly [limit: number, tick: number][] = [
  [2_000, 1], [5_000, 5], [20_000, 10], [50_000, 50], [200_000, 100], [500_000, 500],
];
function tickFromTable(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 1;
  for (const [limit, tick] of TICK_TABLE) { if (price < limit) return tick; }
  return 1_000;
}
```
- `krxTickSize` 는 위 표를 그대로 옮기고(비정상 입력 → 1), `limitUpPrice` 는 `krxTickSize(tgt)` 호출로 치환해 **행동 보존**(기존 `limitUp.test.ts` 가 회귀 가드). `order-panel.tsx` 의 `tickFromTable` 은 import 로 교체(`deriveTickSize` 관측값 우선 로직 :127-144 는 유지).
- 파일 머리에 한국어 JSDoc(출처·Pitfall) 다는 관례 유지 — `limitUp.ts:73-83` 스타일.
- barrel: `packages/shared/src/index.ts` 에 `export { krxTickSize, tickUp, tickDown, priceInputIssue } from "./krxTick";` 를 `limitUpPrice` 줄 옆에.

**Test analog:** `packages/shared/src/limitUp.test.ts:1-30` — `import { describe, it, expect } from "vitest";`, describe 명 한국어, 경계 직하/직상 케이스를 계산 주석과 함께 나열.

---

### `webapp/src/lib/use-edit-mode.ts` (hook, event-driven)

**Analog:** `webapp/src/components/trading/workbench/card-grid.tsx:113-122`
```ts
const noopSubscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
```
- 같은 `useSyncExternalStore` 형태로 subscribe = `matchMedia('(pointer: coarse)')`(+ `any-pointer: fine` 등 판정식은 RESEARCH 재량)의 `addEventListener('change', …)`, server snapshot = `false`(→ `'inline'`).
- matchMedia 부재 가드: `workbench/alert-toasts.tsx:46`
```ts
if (typeof window === "undefined" || typeof window.matchMedia !== "function") return TOAST_TTL_MS;
```
- jsdom 기본: `webapp/tests/setup.ts:37-48` polyfill 은 `matches:false` 고정 → 기본 inline. coarse 케이스 테스트는 `alert-toasts.test.tsx:44-66` 처럼 `realMatchMedia` 저장 → `window.matchMedia = ((query) => ({ matches: …, … })) as unknown as typeof window.matchMedia` → afterEach 복원.

---

### `webapp/src/lib/numpad.ts` (utility, transform)

**Analog(부분):** 숫자 파싱/포맷 헬퍼 — `limit-chaser-form.tsx:1609` `parseDigits(raw)`, `manual-order-form.tsx:1245-1262` `clampPieces`·`formatDigits`·`digitsToNumber`·`parseDigits`, 표시 포맷은 폼의 `NUM.format(value)`(:1446). 리듀서 자체(fresh 덮어쓰기·00·9자리·⌫)와 칩 스펙은 analog 없음 → RESEARCH 코드 예시 사용. 순수 함수 + `src/lib/__tests__/` 배치는 `lib/__tests__/limit-chaser.test.ts`·`queued-window.test.ts` 관례.

---

### `webapp/src/components/trading/lc/use-lc-field-commit.ts` (hook, request-response)

**Analog:** `limit-chaser-form.tsx:575-599` (`toggleGate` — 즉시 전송의 정본)
```ts
const values: LimitChaserFormValues = { ...formRef.current, [key]: next };
const cfg = buildCfg(values);
if (!send({ t: 'lc.set', cfg })) {
  setSubmitError(SEND_FAILED_TEXT.gate);
  return;
}
setForm(values);
setSubmitError('');
sentNotifyRef.current?.(cfg);
```
- 필드 확정도 같은 순서: **send 성공 후에만 낙관 반영**(GC-WR-06), false = 「연결」 문구·잠금 해제.
- 무장/철거 판정은 `handleSubmit`(:602-656)의 `isDeleteIntent` → `GATE_KEYS.find(... gateBlocked(key,true))` → `setSubmitError(GATE_LABEL+ARM_BLOCKED_SEP+armBlockedTextOf)` 블록을 그대로 이식(잠금 **앞**에서 판정).
- `buildCfg`(:464-481) · `sentNotifyRef`(:506-507) 재사용. 실패 판정은 카드 `handleSent`/`ACK_TIMEOUT_MS=3_000`(`card/strategy-card.tsx:109,321-330`) → `unacked` prop.

---

### `webapp/src/components/trading/lc/setting-group.tsx` (component)

**Analog:** `limit-chaser-form.tsx:1269-1334` `Group` — 슬롯 유니온·`data-slot` 보존 필수
```tsx
slot: 'buy' | 'buy-price' | 'sweep' | 'sell' | 'sell-price' | 'cancel';
...
const hasHeader = title != null || status != null || switchProps != null;
<section data-slot={`lc-group-${slot}`} title={hint} ...>
```
- 헤더 게이트는 네이티브 체크박스(`GateSwitch` :1336-1356, `aria-label={label}`, tone 색 `--up/--down/--primary`) → `components/ui/switch.tsx` 로 교체:
```tsx
import { Switch as SwitchPrimitive } from "radix-ui"
<SwitchPrimitive.Root data-slot="switch" className={cn("... data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className)} {...props}>
```
  `<Switch checked onCheckedChange aria-label="매수주문 켜기" className=…>` — 라벨 문자열은 기존 `GroupSwitchProps.label` 그대로(테스트가 `getByRole('switch', { name })` 로 전환). 꺼짐색은 새 토큰 `--switch-off` 를 className 으로.
- `Row`(:1358-1390)의 `<label htmlFor>` 연결 패턴은 인라인 모드에서 유지(옛 id 보존).
- `CheckValueRow` = `CheckRow`(:1523-) 의 네이티브 체크 + 값 버튼. 레이아웃 유틸은 `@min-[700px]/lc:` 만(뷰포트 BP 금지 — `strategy-card.test.tsx:407-426`).

---

### `webapp/src/components/trading/lc/inline-value-editor.tsx` (component)

**Analog:** `limit-chaser-form.tsx:1392-1477` `NumInput`
- 그대로 가져올 것: `inputMode="numeric"`, `data-focus-ring="seamless"` + 래퍼 `focus-within:border-[var(--ring)]` 한 쌍, 전체 선택
```tsx
onFocus={(e) => { const el = e.currentTarget; el.select(); window.setTimeout(() => el.select(), 0); }}
onClick={(e) => e.currentTarget.select()}
```
  모바일 16px 글꼴 규칙(:1455-1463 주석)도 유지. 높이는 46 → 행 44 안(1.5px inset 테두리)으로.
- 말풍선(실패/가격 이유)은 `components/ui/popover.tsx` `PopoverContent`(Portal + `data-slot="popover-content"`) 사용.

---

### `webapp/src/components/trading/lc/number-pad-sheet.tsx` (component, 모달)

**Analog:** `webapp/src/components/ui/sheet.tsx:1-80`
```tsx
import { Dialog as SheetPrimitive } from "radix-ui"
<SheetPrimitive.Portal><SheetPrimitive.Overlay className="fixed inset-0 z-50 ..." />
<SheetPrimitive.Content data-side="bottom" className="fixed z-50 ... data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 ...">
```
- Radix Dialog 가 body 포털·`role=dialog`·포커스 트랩·Esc/바깥 닫기·트리거 포커스 복귀를 준다. 스타일은 TDS(좌우 10 · 최대 440 가운데 · radius 28 · `--dim`)로 새로 지정하고 `showCloseButton` X 는 쓰지 않는다. busy 잠금 = `onEscapeKeyDown`/`onPointerDownOutside` 에서 `e.preventDefault()`.
- 제목/설명은 `SheetPrimitive.Title`/`Description`(sheet.tsx 하단의 `SheetTitle`/`SheetDescription` 조립 참고). 확정 버튼 문구 `「{필드명} 적용」|「{필드명} 입력」`(D-23).
- 채움 버튼 글자색은 `--primary-fg` 대신 `--destructive-fg` (`dirty-action-bar.tsx` 주석 ③ LOCKED 색 규칙).

---

### `webapp/src/components/trading/limit-chaser-form.tsx` (수정)

- 제거: `createPortal`(:106) · `DirtyBarHostContext` import(:128)·`useContext`(:383) · 바 포털 블록(:1129-1146) · `handleSubmit`/`handleRevert` · 더티 prop. `buildCfg`·`toggleGate`·`gateBlocked`·에코 동기화는 유지.
- 보존 셀렉터: `lc-group-{slot}`, `data-pane`, 옛 input id(`lc-buy-watch-price`:703, `lc-buy-watch-qty`:776, `lc-buy-trade`:785, `lc-buy-min-trade-qty`:793, `lc-buy-order-price`:808, `lc-buy-order-amount`:817, `lc-sweep-tick`:840, `lc-sweep-watch-price`:849, `lc-cancel-*`:871-913, `lc-sell-*`:942-1018) → `lc-fields.ts` 스펙의 `legacyId` 로 옮기고 행에 `data-lc-field` + 값 `data-slot="lc-row-value"`.

### `webapp/src/components/trading/card/manual-order-form.tsx` (수정)

- 유지: `Row label="가격" htmlFor={`mo-price-${isin}`}`(:759) · `mo-qty-`(:777) · `mo-pieces-`(:795) id/label 연결(테스트·e2e `orderbook.spec.ts:123-124` 가 의존), `formOrderLockOf`/`modifyLockReason`/`canModify` 등 export 판정 함수 무변경.
- 제거: `StepButton` 「조각 늘리기/줄이기」(:812, 함수 :1172). `UnitBox`(:1148) → TDS 상자, `OrderButton`(:1199) → 48px 2열 + 정정/취소 38px.

### `webapp/src/components/trading/card/card-body.tsx` (수정)

- 컨테이너 쿼리 그리드(:305-308) 불변, `container-type` 선언 금지. 더티 prop 전달 제거, `currentPrice`·`unacked` 전달 추가.

### `webapp/src/styles/globals.css` + `tds-tokens.test.ts` (수정)

- `:root {`(:39) · `.dark {`(:149) 양쪽에 `--group-bg`·`--switch-off`·`--dim` 을 hex/rgba 로(oklch 금지 — 테스트가 검사). 테스트는 `parseBlock(':root')`/`parseBlock('.dark')` 로 읽으므로 `LIGHT_EXPECTED`/다크 기대값과 `THEME_COLOR_TOKENS` 에 키만 추가.

---

## Shared Patterns

### Relay 전송 계약 (모든 즉시 반영)
**Source:** `limit-chaser-form.tsx:584-598` — `send({ t: 'lc.set', cfg })` 반환 false 면 상태 불변 + 문구, true 면 `setForm` → `sentNotifyRef.current?.(cfg)`. 반영 판정은 에코 수신.

### 단위 테스트 relay 스텁
**Source:** `components/trading/__tests__/limit-chaser-form.test.tsx:35-62`
```ts
const sendMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }) };
});
function sentConfigs(): RelayLimitChaserInput[] {
  return sendMock.mock.calls.map(([msg]) => msg as RelayLcSetMsg)
    .filter((msg) => msg?.t === 'lc.set').map((msg) => msg.cfg);
}
```
+ `echo(over)` 팩토리(:68-). 실행: `pnpm --filter @gh-radar/webapp exec vitest --run <경로>`.

### e2e 셀렉터 헬퍼
**Source:** `e2e/specs/trading-workbench.spec.ts:102-125` — `const field = (page, id) => page.locator(`#${id}`)`, `cardOf(page, isin)`. `dirtyBar` 헬퍼(:117)는 제거 대상. 값 단언은 `[data-lc-field="…"] [data-slot="lc-row-value"]` 의 `toHaveText`.

### 컨테이너 쿼리 전용
`@min-[700px]/lc:` 만 사용, `LC_CONTAINER_CLASS`(`strategy-card.tsx:120`) 선언 위치 불변.

### 주석 관례
파일 머리·핵심 분기 위에 한국어 `★` 근거 주석(결정 ID·Pitfall·되돌리지 말 것) — 모든 analog 공통.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/numpad.ts` 의 키패드 버퍼 리듀서·칩 연산 | utility | transform | 자체 키패드가 처음. 숫자 헬퍼만 부분 참고, 본체는 RESEARCH 코드 예시 |

## Metadata

**Analog search scope:** `packages/shared/src`, `webapp/src/components/{ui,trading,orderbook}`, `webapp/src/lib`, `webapp/src/styles`, `webapp/tests`, `webapp/e2e/specs`
**Files scanned:** ~20
**Pattern extraction date:** 2026-09-25
