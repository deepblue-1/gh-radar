---
phase: 16-trading-limit-chaser-vi-my-page
plan: 31
subsystem: webapp
tags: [limit-chaser, arming-guard, send-contract, ux-copy, type-predicate, vitest]

requires:
  - phase: 16
    provides: "16-19 의 `send: (msg) => boolean` 계약 (`use-relay-socket.ts:863`)"
  - phase: 16
    provides: "16-25 가 만든 `isPickable` (시장 미상 종목 선택 차단, truth 44)"
  - phase: 16
    provides: "16-29 의 relay `#strategyArmable` — UI `canArm*` 3식과 동형인 서버측 최후 관문"
provides:
  - "「수정」(`handleSubmit`)도 지나는 전송 직전 무장 가드 — 켜져 있는 게이트만 본다"
  - "상따 폼 `send` 호출부 2곳의 boolean 분기 — 못 보낸 요청에 낙관 반영·잠금을 걸지 않는다"
  - "`armBlockedTextOf(key, values)` — 무장 불가 사유를 **원인별로** 내는 단일 산출 지점"
  - "메모된 `canArm`(useMemo) → 실제로 메모되는 `gateBlocked`"
  - "타입 서술자 `isPickable(row): row is StockDetailResponse & { isin: string }`"
affects: [상따 폼의 전송 경로, 무장 불가 안내 문구, 상따 종목 검색 선택]

tech-stack:
  added: []
  patterns:
    - "판정 함수 하나를 **모든 출구가 지난다** — 렌더의 `disabled` · 스위치 · 「수정」 세 곳이 같은 `gateBlocked` 를 읽는다"
    - "문구도 **산출 지점 하나** — 그룹 사유줄과 전송 차단 문구가 같은 함수를 읽어 두 벌로 갈리지 않는다"
    - "타입 서술자로 런타임 검사와 타입을 같은 것으로 만든다 — 단언을 다른 곳으로 옮기지 않는다"
    - "회귀 잠금 실증: 새 분기를 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27·28·29 승계)"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx

key-decisions:
  - "무장 판정을 `setSubmitting(true)` **앞**에 뒀다 — 잠근 뒤에 막으면 잠금을 푸는 신호(60 에코)가 영영 오지 않아 「수정」 버튼이 영구히 죽는다"
  - "`handleSubmit` 의 가드는 **켜져 있는 게이트만** 본다(`values[key] && gateBlocked(key, true)`) — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나가야 한다(T-16-44 를 `toggleGate` 밖으로 확장)"
  - "`toggleGate` 의 `setForm` 낙관 반영을 **전송 뒤로 옮겼다.** 옛 순서는 소켓이 받지 않은 요청에도 스위치가 켜진 것처럼 보였다 — 이 화면 최악의 결과다"
  - "`ARM_BLOCKED_TEXT` 를 상수 3종이 아니라 **원인 6종 + 산출 함수 `armBlockedTextOf`** 로 바꿨다. 상수 유지 vs 함수는 계획이 실행자에게 맡긴 선택이고, `handleSubmit` 이 같은 값을 읽어야 한다는 요구가 함수를 강제했다 — 상수로 두면 렌더는 원인별 문구를, 전송 차단은 뭉뚱그린 문구를 내는 두 벌이 된다"
  - "`canArm` 은 **`useMemo`** 를 골랐다(세 boolean 개별 의존성이 아니라). `gateBlocked` 를 넘어 `canArm` 을 읽는 다른 소비자가 생겨도 메모가 자동으로 따라오고, eslint `react-hooks/exhaustive-deps` 가 그 사실을 계속 감시한다"
  - "실패·차단 사유를 **폼 맨 위**(`data-slot=\"lc-submit-error\"`, `role=\"alert\"`)에 뒀다. `DirtyActionBar` 안에 넣지 않은 이유: 그 바는 `dirtyCount === 0` 이면 아예 렌더되지 않고, 스위치 전송 실패가 정확히 그 경우다 — 바 안에 넣으면 사유가 통째로 사라진다"

patterns-established:
  - "테스트의 `send` 스텁은 `mockReturnValue(true)` 가 기본이다 — `mockReset()` 뒤 `undefined`(falsy)는 이제 「보내지 못했다」로 읽힌다"

requirements-completed: []

duration: 21min
completed: 2026-09-09
---

# Phase 16 Plan 31: 상따 폼이 자기 주석대로 동작한다 Summary

**「전송 직전 가드가 판정을 함께 읽는다」·「호출부가 반환값으로 못 보냈음을 안다」·「시세를 못 받아서다」 — 이 화면이 스스로에 대해 적어 둔 세 문장이 전부 사실이 아니었고, 셋을 사실로 만들었다.**

## Performance

- **Duration:** 약 21분
- **Tasks:** 3/3
- **Files modified:** 4 (신규 파일 0 · 마이그레이션 0)
- **webapp 테스트:** 660 passed / 1 skipped (57 files) — 상따 폼만 38 (30 → **+8**)

## Accomplishments

### Task 1 — 「수정」도 무장 판정을 지나고, `send` 2곳이 반환값을 읽는다 (GC-WR-09 + GC-WR-06) · commit `a44dd66`

파일 머리말(`:26`)은 「판정은 `gateBlocked()` 하나이고 렌더의 `disabled` 와 **전송 직전 가드**가 그것을 함께 읽는다」고 적어 왔지만 실제로 읽는 것은 `toggleGate` 하나였다. 서버 에코로 `buyEnabled: true` 를 받은 뒤 시세가 끊겨 가격 칸이 0 이 되면 「수정」은 relay 의 `#strategyArmable`(16-29 가 3갈래로 넓힌 그 관문)에 **통째로** 거부되고, 함께 실린 다른 값까지 **하나도 저장되지 않은 채** 일반 거부 프레임 한 줄만 남았다.

**이제 세 출구가 같은 판정을 지난다** — 렌더 `disabled`(`:505`·`:611`·`:651` → 현재 `:566`·`:672`·`:712`), `toggleGate`(`:460`), `handleSubmit`(`:495`). `grep -c "gateBlocked"` = **10**.

`handleSubmit` 의 가드(`limit-chaser-form.tsx:495-498`):

```ts
const blocked = GATE_KEYS.find((key) => values[key] && gateBlocked(key, true));
if (blocked !== undefined) {
  setSubmitError(armBlockedTextOf(blocked, values));
  return;
}
setSubmitting(true);   // ← 가드가 **이 줄보다 앞**이다
```

두 가지가 위치로 잠긴다. ① **`setSubmitting(true)` 앞**이다 — 잠근 뒤에 막으면 잠금을 푸는 신호가 60 에코인데 그 에코는 오지 않고, 「수정」 버튼이 영구히 `반영 중…` 으로 죽는다. ② **`values[key] &&`** 다 — 켜져 있는 게이트만 본다. 게이트를 **내리는** 「수정」은 무장 조건과 무관하게 나가야 한다(T-16-44 의 규율을 `toggleGate` 밖으로 확장한 것이고, 케이스 하나가 그것을 잠근다).

**`send` 반환값 분기 2곳** (`grep -c "if (!send("` = **2**):

| 호출부 | 실패 시 걸지 **않는** 것 | 남기는 것 |
|---|---|---|
| `toggleGate`(`:471`) | `setForm(values)` 낙관 반영 · `sentNotifyRef` | `SEND_FAILED_TEXT.gate` |
| `handleSubmit`(`:505`) | `submitting` 잠금(되돌린다) · `sentNotifyRef` | `SEND_FAILED_TEXT.submit` |

`toggleGate` 는 **`setForm` 을 전송 뒤로 옮겼다.** 옛 순서는 낙관 반영이 먼저였고, 그러면 소켓이 받지 않은 요청에도 스위치가 켜진 것처럼 보인다 — 사용자는 무장했다고 믿고 시장은 계속 움직인다. `send` 가 `false` 면 **보내지 않았음이 확실**하므로(`use-relay-socket.ts:863`) 폼도 그대로 둔다. 이동 근거는 코드 주석에 남겼다.

실패 문구는 `strategy-status-card.tsx:358` 의 「연결이 끊겨 … 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」와 **같은 어조**다(`SEND_FAILED_TEXT`, `:170`). 표시 자리는 `data-slot="lc-submit-error"` · `role="alert"`(`:865`)이고 에코가 도착하면 함께 접힌다.

### Task 2 — 안내가 원인을 값으로 가르고, 메모가 실제로 작동한다 (GC-WR-12 + GC-IN-01) · commit `f76daa3`

`ARM_BLOCKED_TEXT.buy` 는 「**시세를 받지 못해** 발주가·수량이 0 이에요」라고 단정했다. 그런데 e2e(`trading-limit-chaser.spec.ts:181-192`)가 고정한 실제 재현 조건은 「기본 주문금액 10만원으로 127,400원 종목 → `floor(10만/12.74만) = 0주`」다 — **시세는 정상이고 금액이 부족한 것**이다. 안전 게이트가 원인을 틀리게 말하면 사용자는 재접속·새로고침을 만지고 그 사이 시장은 움직인다.

**이제 원인이 값으로 갈린다** (`armBlockedTextOf`, `:147-165`):

| 게이트 | 판정 | 문구 |
|---|---|---|
| 매수 | `buyOrderPrice === 0` | `시세를 받지 못해 매수가격이 0 이에요. 매수가격을 입력하면 켤 수 있어요.` |
| 매수 | 그 외(=`buyQty === 0`) | `주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.` |
| 매도 | `sellOrderPrice === 0` | `시세를 받지 못해 매도가격이 0 이에요. 매도가격을 입력하면 켤 수 있어요.` |
| 매도 | 그 외(=`sellWatchQty === 0`) | `매도 호가잔량이 0 이에요. 감시할 잔량을 입력하면 켤 수 있어요.` |
| 한방 | `sweepWatchPrice === 0` | `시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.` |
| 한방 | 그 외(=매수 무장 불가) | `한방은 매수 무장 조건을 함께 요구해요 — ` + **매수 사유 그대로** |

세 갈래 모두 `canArm*` 3식과 같은 값을 본다(`limit-chaser.ts` 의 산출식을 복제하지 않는다). 매도는 「예상 매도수량」이 아니라 **감시 호가잔량**을 가리키게 바로잡았다 — `canArmSell` 은 `sellQty`(표시 전용)를 조건으로 쓰지 않는데 옛 문구는 그것을 짚고 있었다. 한방은 「어느 쪽이 0 인가」를 접두사로 분리해, 사용자가 한방가격을 만져야 하는지 주문금액을 만져야 하는지 문구만으로 알 수 있다.

**상수가 아니라 함수를 골랐다.** 계획이 실행자에게 맡긴 선택이고, 「`handleSubmit` 도 같은 함수/값을 읽어야 한다」는 요구가 함수를 강제했다 — 상수 3종으로 두면 렌더는 원인별 문구를, 전송 차단은 뭉뚱그린 문구를 내는 **두 벌**이 된다. `ARM_BLOCKED_TEXT` 위 문단의 잘못된 전제(「발생 조건은 시세를 못 받은 종목이다」)도 두 원인과 그중 흔한 쪽을 적는 것으로 정정했다(`:118-128`).

**GC-IN-01 — `useMemo` 를 골랐다** (`:435-438`). 세 boolean 을 개별 의존성으로 넘기는 대안도 성립하지만, `canArm` 을 읽는 소비자가 `gateBlocked` 말고 더 생길 때 메모가 자동으로 따라오고 eslint 가 그 사실을 계속 감시한다. 의존성은 `canArmBuy`/`canArmSell`/`canArmSweep` 셋이면 충분하고, 그 근거(「이 셋은 이미 폼 값에서 계산이 끝난 **결과**이고 이 객체는 키에 얹기만 한다. 폼 값을 다시 넣으면 결과가 그대로인 입력에도 참조가 깨진다」)를 주석에 남겼다.

### Task 3 — `isPickable` 이 타입 서술자가 됐다 (GC-IN-02) · commit `8e3227c`

`limit-chaser-client.tsx:790`:

```ts
function isPickable(row: StockDetailResponse): row is StockDetailResponse & { isin: string }
```

본문(`row.isin !== null && ORDERABLE_MARKETS.includes(row.market)`)과 `ORDERABLE_MARKETS` 판정은 **손대지 않았다** — 16-25 truth 44(「시장 미상 종목은 `isin === null` 과 같은 취급으로 선택 차단」)는 그대로다. 소비부(`:858`)의 `row.isin as string` 이 사라졌고, 서술자가 `onClick` 안의 `if (!isPickable(row)) return;` 뒤에서 그대로 좁힌다.

**단언을 다른 곳으로 옮기지 않았다는 증거:** `grep -c "as string" limit-chaser-client.tsx` = **1 → 0**.

## Verification

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp test` | **660 passed / 1 skipped** (57 files) |
| `pnpm --filter @gh-radar/webapp exec vitest run …/limit-chaser-form.test.tsx` | **38 passed** (30 → +8) |
| `pnpm --filter @gh-radar/webapp exec vitest run …/limit-chaser-client.test.tsx` | **19 passed** |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (`tsc --noEmit` + e2e tsconfig) |
| `pnpm --filter @gh-radar/webapp exec eslint limit-chaser-form.tsx limit-chaser-client.tsx` | exit 0 · **경고 0건** (GC-IN-01 경고 소멸 실측) |
| `grep -c "if (!send(" limit-chaser-form.tsx` | **2** (≥2) |
| `grep -c "gateBlocked" limit-chaser-form.tsx` | **10** (≥4) — `handleSubmit` 의 호출은 `:495` |
| `grep -c "주문금액이 매수가격보다 작아" limit-chaser-form.tsx` | **1** (≥1) |
| `grep -c "시세를 받지 못해 발주가·수량이 0 이에요" limit-chaser-form.tsx` | **0** |
| `grep -c "useMemo" limit-chaser-form.tsx` | **5** (≥1) — `canArm` 은 `:435` |
| `grep -c "row is StockDetailResponse" limit-chaser-client.tsx` | **1** (≥1) |
| `grep -c "row.isin as string" limit-chaser-client.tsx` | **0** |
| `grep -c "as string" limit-chaser-client.tsx` | **1 → 0** |

### 신규 테스트 8케이스 (이름 그대로 인용)

**Task 1 — `describe('⑭ 전송 직전 가드가 「수정」에도 걸리고, 못 보낸 요청은 반영되지 않는다 (GC-WR-09 / GC-WR-06)')`**
- `게이트가 켜진 채 발주가가 0 이면 「수정」이 나가지 않고 사유가 뜬다 (GC-WR-09)` — `send` **0회** + 사유 문구 + **버튼이 여전히 `수정`**(잠기지 않았다)
- `게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다 (T-16-44 승계)` — 스위치 OFF 후 「수정」이 그대로 나간다
- `` `send` 가 false 면 스위치 낙관 반영이 걸리지 않고 실패 문구가 뜬다 (GC-WR-06) `` — `aria-checked` 가 `false` 로 남는다
- `` `send` 가 false 면 「수정」이 잠기지 않아 다시 누를 수 있다 (GC-WR-06) `` — `반영 중…` 이 **없고**, 연결 복구 후 두 번째 클릭이 나간다

**Task 2 — `describe('⑮ 무장 불가 안내가 원인을 값으로 가른다 (GC-WR-12)')`**
- `매수가격이 0 이면 **시세** 문구다 — 만져야 할 것은 가격이다`
- `매수가격은 있는데 주문금액이 부족하면 **금액** 문구다 (e2e 가 고정한 흔한 쪽)` — 두 문구가 **배타적**임을 함께 단언
- `매도는 가격 0 과 감시 호가잔량 0 이 서로 다른 문구다`
- `한방은 자기 감시가가 0 인 경우와 매수가 막힌 경우를 가른다`

**Task 3** — 신규 케이스 없음. 기존 `⑯ 시장 미상 종목은 고를 수 없고 cfg 에 market 이 없다 (WR-03 / D-28)` 가 이미 선택 차단을 잠그고 있어(계획 ④ 의 조건부 항목) 통과 확인만 했다. 서술자의 좁히기 자체는 `typecheck` 가 잠근다.

### 회귀 잠금 실증 (16-27·28·29 승계)

새 테스트가 「그냥 통과하는 테스트」가 아님을 세 번 확인하고 매번 복원했다:

- `handleSubmit` 의 `blocked` 계산을 `undefined` 고정 + `toggleGate` 의 `if (!send(...))` 를 옛 형태로 되돌림 → **⑭ 2건 실패** (나머지 32 통과)
- `handleSubmit` 의 `if (!send(...))` 만 옛 형태로 되돌림 → **⑭ 1건 실패** (나머지 33 통과)
- `armBlockedTextOf` 의 매수 원인 분기를 시세 문구 고정으로 무력화 → **3건 실패**(⑮ 2건 + ⑬ 한방 1건, 나머지 35 통과) — 한방 문구가 매수 사유를 **승계**한다는 사실까지 함께 잡혔다

## Deviations from Plan

**계획대로 실행했다. 계획이 위임한 선택 2건, 계획 문언과 저장소 실제가 어긋난 항목 3건, 자동 수정 1건이 있다.**

**1. [계획이 위임한 선택] 무장 불가 문구 — 상수 유지가 아니라 산출 함수**
- 계획 문구: 「상수 객체를 유지할지 함수로 바꿀지는 실행자 판단이되, Task 1 의 `handleSubmit` 도 **같은 함수/값을 읽어야** 한다」
- 채택: `ARM_BLOCKED_TEXT`(원인 6종 문자열) + `armBlockedTextOf(key, values)`. 상수 3종을 유지하면 「원인별로 가른다」와 「두 곳이 같은 값을 읽는다」를 동시에 만족할 수 없다.
- 부수 변경: `ARM_BLOCKED_TEXT` 의 키를 `buy`/`sell`/`sweep` 에서 **게이트 필드명**(`GateKey` = `buyEnabled`/`sweepEnabled`/`sellEnabled`)으로 바꿨다(Task 1). `GATE_KEYS.find(...)` 가 돌려주는 키로 곧장 문구를 뽑기 위해서다.

**2. [계획이 위임한 선택] GC-IN-01 — `useMemo`(개별 의존성 아님)**
- 계획 문구: 「`useMemo` 로 감싸거나 세 boolean 을 개별 의존성으로 넘긴다. 어느 쪽이든 …」
- 채택: **`useMemo`**. 근거는 위 Task 2 절.

**3. [계획 문언 오류] `pnpm --filter gh-radar-webapp` 은 존재하지 않는 필터다**
- 계획의 verification·acceptance_criteria 는 전부 `--filter gh-radar-webapp` 을 쓰지만, `webapp/package.json` 의 name 은 **`@gh-radar/webapp`** 이다. 그대로 실행하면 `No projects matched the filters` 로 **exit 1** 이다.
- 실행: 전부 `--filter @gh-radar/webapp` 으로 바꿔 돌렸다. 명령의 의도는 그대로다.
- 또한 `run test` 스크립트 이름은 `test`(=`vitest --run --passWithNoTests`)이고, `run typecheck` 는 `tsc --noEmit && tsc -p tsconfig.e2e.json` 이다 — 둘 다 계획대로 존재한다.

**4. [계획 전제와 다름] `submitError` 상태는 「이미 쓰는 것」이 아니라 이번에 만들었다**
- 계획 ① 은 「표시 채널은 이 파일이 이미 쓰는 것(예: `submitError` 상태와 그 렌더 자리)을 그대로 쓴다 — 새 UI 를 만들지 않는다」였다. 실제로 이 파일에는 **오류 표시 채널이 하나도 없었다**(토스트를 쓰지 않고, `armBlocked` 사유줄은 「꺼져 있는 게이트」에만 뜬다 — GC-WR-09 상황은 게이트가 **켜져 있는** 경우라 그 자리로는 표현되지 않는다).
- 최소 추가로 맞췄다: `useState('')` 하나 + `<p data-slot="lc-submit-error" role="alert">` 한 줄. 마크업·색(`--destructive`)·`role` 은 `strategy-status-card.tsx:466-475` 의 `strategy-disable-error` 를 그대로 승계했다 — 새 컴포넌트도, 다이얼로그도, 토스트도 만들지 않았다.
- 자리를 **폼 맨 위**로 정한 근거: `DirtyActionBar` 는 `dirtyCount === 0` 이면 아예 렌더되지 않는데(파일 상단 ①) **스위치 전송 실패가 정확히 그 경우**다. 바 안에 넣으면 사유가 통째로 사라진다.

**5. [계획 전제와 다름] e2e 문구 단언은 없었고, 클라 테스트는 이미 잠그고 있었다**
- Task 2 ⑤: `e2e/specs/trading-limit-chaser.spec.ts:189` 는 `[data-slot="lc-arm-blocked"]` 의 **가시성만** 단언한다(문구 단언 없음). 계획의 「단언이 없으면 만들지 않는다」에 따라 e2e 를 건드리지 않았다.
- Task 3 ④: `limit-chaser-client.test.tsx` 의 `⑯` 이 이미 「KONEX·시장 null 행은 비활성이고 「주문 불가」 배지가 붙는다」를 잠그고 있어 신규 케이스를 만들지 않았다.

**6. [Rule 1 - 버그] `limit-chaser-client.test.tsx` 의 `send` 스텁이 `undefined` 를 돌려주던 것**
- **발견:** Task 3 실행 중(`limit-chaser-client.test.tsx` 실행 시)
- **원인:** Task 1 이 `send` 반환값 분기를 도입하면서, `sendMock.mockReset()` 뒤의 기본 반환 `undefined`(falsy)가 「보내지 못했다」로 읽히게 됐다. 폼 테스트에는 Task 1 에서 `mockReturnValue(true)` 를 넣었지만 **클라 테스트를 함께 세우지 않았다** — 그래서 commit `a44dd66` 시점에는 `limit-chaser-client.test.tsx` 2건(⑥·⑧)이 깨진 상태였다.
- **수정:** `beforeEach` 에 `sendMock.mockReturnValue(true)` 추가 + 그 이유를 주석으로.
- **파일:** `webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx`
- **커밋:** `8e3227c`
- **교훈:** `send` 계약을 읽는 호출부를 늘릴 때는 **그 컴포넌트를 렌더하는 모든 테스트 파일**의 스텁을 함께 세워야 한다. 다음에 같은 계약을 읽는 호출부(예: `vi-order-list.tsx` · `vi-settings-card.tsx` — GC-WR-06 의 남은 2곳)를 고칠 때 같은 자리에서 반복될 수 있다.

**7. [계획보다 넓힘] 테스트 8케이스 (계획은 5)**
- Task 1 에 `게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다` 를 추가했다 — 계획의 3케이스는 「막는다」만 잠그고 **T-16-44(끄는 것은 언제나 허용)를 「수정」 경로로 확장한 부분**을 잠그지 않았다. 이 케이스가 없으면 나중에 `values[key] &&` 조건을 지워도 테스트가 통과한다.
- Task 2 에 매도·한방 갈래 2케이스를 추가했다 — 계획 ③ 이 요구한 「매도·한방도 같은 기준으로 점검」의 결과를 코드 변경으로만 두지 않고 잠갔다.

**사전 존재 경고·무관 실패를 건드리지 않았고, `deferred-items.md` 에 새로 적을 항목도 없다.**

## 검증 기준의 정정 — `10.41.1.120` 0건 조건 (16-29·16-30 승계)

이 plan 의 verification 에는 해당 조건이 없지만, 2라운드 공통 기준으로 남아 있어 실측을 한 번 더 적는다. 여전히 **2건**이다:

- `relay/README.md:17` — 「기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 …」 **경고 문장**
- `relay/src/dma/link-health.ts:20` — 「게이트웨이가 `10.41.1.120` 이라 이 조건이 곧 "터널이 서 있다"」 **주석**

둘 다 산문이고 접속 대상 설정이 아니다. **지우지 않았다** — 지우면 D-27 안전장치의 근거가 사라진다. 이 plan 은 `relay/` 를 한 줄도 손대지 않았다(webapp 4파일만).

## Requirements

**`requirements.mark-complete` 를 돌리지 않았다.**

- **TRADE-01** — 이 plan 의 frontmatter 가 인용하지만 상태를 바꾸지 않는다. 이 plan 이 닫은 것은 안전 게이트의 **UI 측 정직성**이고, TRADE-01 의 종결 판정은 2라운드 종결 plan 의 배포·실측 몫이다.

## Threat Model 처리

| Threat ID | Disposition | 이 plan 의 처리 |
|---|---|---|
| T-16-59 | mitigate | ✅ `toggleGate`·`handleSubmit` 두 호출부가 boolean 을 읽는다. 실패 시 낙관 반영(`setForm`)·`submitting` 잠금·`sentNotify` 어느 것도 걸지 않고 문구를 남긴다 |
| T-16-60 | mitigate | ✅ 「수정」이 `gateBlocked` 를 지난다(`:495`). relay 통째 거부 전에 화면이 사유를 말한다 |
| T-16-61 | mitigate | ✅ 원인을 `buyOrderPrice === 0` vs `buyQty === 0` 으로 갈라 서로 다른 문구를 낸다. e2e 가 고정한 재현 조건(금액 부족)이 그 문구를 가리킨다 |
| T-16-44 | mitigate | ✅ **완화하지 않았다.** `gateBlocked` 의 「끄는 것은 언제나 허용」은 그대로이고, `handleSubmit` 의 새 가드도 `values[key]`(켜져 있는 게이트)에만 적용된다. 케이스 2건이 잠근다 |
| T-16-13 | accept | ✅ jsdom 단위 테스트·스텁만 사용. 실서버·실계좌 접속 0회 (D-27 승계) |

## 배포

**미실시.** webapp(Vercel) 배포는 2라운드 종결 plan 에서 relay 재배포와 함께 일괄 처리한다(16-27~16-30 과 같은 규율). 이 plan 의 변경은 아직 프로덕션에 없다.

## Known Stubs

없음. 하드코딩된 빈 값·placeholder·「준비 중」 문구를 만들지 않았고, 새로 만든 표시 표면(`lc-submit-error`)은 실제 상태(`submitError`)에 연결돼 있다.

## Next

- **GC-WR-06 의 남은 2곳** — `vi-order-list.tsx:230-233`(낙관 반영 + `sending` 잠금이 함께 걸린다) · `vi-settings-card.tsx`. 이 plan 은 상따 폼 2곳만 닫았다. 고칠 때 위 「Rule 1」 교훈(테스트 스텁을 함께 세울 것)을 그대로 적용한다.
- 16-32 이후 남은 갭 클로징 2라운드 plan
- 2라운드 종결 plan 의 배포(webapp + relay) 후 프로덕션 확인

## Self-Check: PASSED

- 파일 3종 실재 확인 (`16-31-SUMMARY.md` · `limit-chaser-form.tsx` · `limit-chaser-client.tsx`)
- 커밋 3건 실재 확인 (`a44dd66` · `f76daa3` · `8e3227c`)
