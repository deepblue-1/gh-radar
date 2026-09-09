---
phase: 16-trading-limit-chaser-vi-my-page
plan: 32
subsystem: webapp
tags: [vi, my-page, send-contract, optimistic-lock, time-compare, vitest]

requires:
  - phase: 16
    provides: "16-19 의 `send: (msg) => boolean` 계약 (`use-relay-socket.ts:863`)"
  - phase: 16
    provides: "16-23 이 만든 `latestAccountTime` — 계좌 전체를 훑는 전역 반영 시각 (CR-01)"
  - phase: 16
    provides: "16-31 의 교훈 — `send` 계약을 읽는 호출부를 늘리면 그 컴포넌트를 렌더하는 **모든** 테스트 파일의 스텁을 함께 세워야 한다"
provides:
  - "VI 확인 체크(`vi.confirm`)의 boolean 분기 — 못 보낸 확인에 낙관 반영도 `sending` 잠금도 걸지 않는다"
  - "VI 설정(`vi.set`)의 boolean 분기 + `ViSubmitResult` 3갈래 — `failed` 면 확인 다이얼로그를 성공처럼 닫지 않는다"
  - "`serverTimeKey` / `isNewerServerTime` — `st` **원문**에서 만드는 비교 축(날짜 유무가 첫 번째 축)"
  - "`me-client.test.tsx` — `latestAccountTime` 의 첫 테스트(그전까지 0건)"
affects: [VI 주문내역 확인 체크, VI 설정 시작·중지·수정, My page 상태줄 반영 시각]

tech-stack:
  added: []
  patterns:
    - "실패 표시 자리를 **카드/목록 안**에 둔다 — `DirtyActionBar` 는 더티 0 이면 렌더되지 않아 스위치·체크 실패 사유를 담을 수 없다 (16-31 승계)"
    - "다이얼로그를 거치는 전송은 **결과 3갈래**(`sent`/`blocked`/`failed`)로 창의 거취를 가른다 — 「닫힘」이 성공 신호로 읽히지 않게"
    - "시각 비교는 **정규화 전** 값으로. 표시 포맷터가 버리는 정보(날짜)가 곧 비교의 정확성이다"
    - "회귀 잠금 실증: 새 분기를 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27~16-31 승계)"

key-files:
  created:
    - webapp/src/components/trading/__tests__/me-client.test.tsx
  modified:
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/vi-order-list.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx

key-decisions:
  - "`vi-order-list` 의 실패 분기는 `setOptimistic`·`setSending` **앞**에서 `return` 한다(`:253-255` → `:258-259`). 이 화면에서 잠금을 푸는 유일한 신호가 서버 73 델타라, 나가지 않은 요청에 건 잠금은 **영구**다 — 순서가 곧 안전장치다"
  - "`vi-settings-card` 의 `submit` 을 `boolean` 이 아니라 **`ViSubmitResult` 3갈래**로 만들었다. `blocked`(세션 잠금·연타·금액 상한)는 사유가 **카드 안에 이미** 떠 있어 다이얼로그를 닫아야 그 사유가 보이고, `failed`(소켓이 안 받음)는 사유가 아직 없어 창을 열어 둬야 한다. boolean 하나로는 두 경우가 뭉개진다"
  - "`failed` 사유를 **다이얼로그 안에도** 그렸다(`error` prop). 카드 안의 같은 문구는 Radix 오버레이에 가려 보이지 않아, 사용자에게는 「눌렀는데 아무 일도 없었다」로만 남는다. 상태는 카드의 `sendError` 하나뿐이고 렌더 자리만 둘이다"
  - "`latestAccountTime` 은 계획의 선택지 (a) — 원문에서 비교 키를 만들고 **승자의 원문에서** 표시값을 뽑는다. epoch 로 만들지 않은 이유: `HH:MM:SS` 만 오는 값은 날짜를 모르므로 epoch 로 승격하려면 「오늘」을 **가정**해야 하고, 그 가정이 곧 자정 뒤집힘의 원인이다"
  - "비교 축의 1순위를 `dated`(날짜 유무)로 뒀다 — 날짜 없는 `23:59:00` 이 오늘인지 어제인지 이 함수는 알 수 없다. 모르는 값을 오늘로 가정하지 않고, **아는 값을 이기게** 한다"
  - "두 테스트 파일의 `beforeEach` 를 `mockClear()` → `mockReset() + mockReturnValue(true)` 로 바꿨다 — 16-31 이 `limit-chaser-client.test.tsx` 에서 겪은 사고(스텁 `undefined` 가 「보내지 못했다」로 읽힘)를 **커밋 전에** 막았다"

patterns-established:
  - "`send` 반환값을 읽는 호출부를 늘릴 때는 같은 커밋에서 그 컴포넌트를 렌더하는 모든 테스트 파일의 스텁을 세운다 (16-31 Rule 1 의 예방 적용)"

requirements-completed: []

duration: 18min
completed: 2026-09-09
---

# Phase 16 Plan 32: VI 표면과 My page 가 「보냈다」와 「보냈다고 믿는다」를 구분한다 Summary

**GC-WR-06 의 남은 2곳(`vi.confirm`·`vi.set`)이 `send` 반환값을 읽게 됐고, 상태줄의 「가장 최근 반영 시각」이 날짜를 버린 뒤가 아니라 원문으로 비교하게 됐다 — 세 자리 모두 「화면이 사실과 다른 것을 말하던」 곳이다.**

## Performance

- **Duration:** 약 18분
- **Tasks:** 2/2
- **Files:** 신규 1 (`me-client.test.tsx`) · 수정 5 · 마이그레이션 0
- **webapp 테스트:** 665 → **672 passed / 1 skipped** (57 → **58 files**)

## Accomplishments

### Task 1 — VI 두 호출부가 `send()` 반환값을 읽는다 (GC-WR-06) · commit `551d89c`

`grep -c "if (!send("` = **1 · 1** (두 파일 각각).

**① `vi-order-list.tsx` — 잘못 건 잠금은 영구다**

`toggle` 은 `send(...)` 의 반환값을 버리고 곧바로 낙관 반영과 행 잠금을 걸었다. 이 화면에서 **잠금을 푸는 유일한 신호는 서버 73 델타**인데, 요청이 나가지 않았으므로 그 델타는 오지 않는다 — 사용자는 「119초 자동취소를 면제시켰다」고 믿고, 행은 영구히 회색으로 남는다. 이 화면에서 그 오독의 대가는 **취소되지 말았어야 할 주문이 취소되는 것**이다.

```ts
// vi-order-list.tsx:253-259
if (!send({ t: 'vi.confirm', orderNo: item.orderNo, confirmed: next })) {   // :253
  setSendError(VI_CONFIRM_SEND_FAILED_TEXT);                                 // :254
  return;                                                                    // :255  ← 여기서 끊는다
}
setSendError('');                                                            // :257
setOptimistic((prev) => new Map(prev).set(item.orderNo, next));               // :258
setSending((prev) => new Set(prev).add(item.orderNo));                        // :259
```

**`return`(`:255`)이 `setOptimistic`(`:258`)·`setSending`(`:259`)보다 앞**이다 — 순서가 곧 안전장치다.

`isConfirmable(item, disabled)` 가드는 **손대지 않았다**. 이 분기는 그 가드가 막지 못하는 얇은 창(화면의 `ready` 표시와 소켓 `readyState` 가 어긋나는 순간)을 메우는 것이다.

실패 표시는 이 파일 안에서 끝냈다(새 컴포넌트 없음): 상태 `sendError` 하나 + `<p data-slot="vi-confirm-error" role="alert">`(`:301`, 헤더 바로 아래). 문구 `VI_CONFIRM_SEND_FAILED_TEXT` = 「연결이 끊겨 확인을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」 — `strategy-status-card.tsx:358` 과 **같은 어조**다. `grep -c "보내지 못했"` = **1**.

파일 머리말 ③ 에 한 줄 덧붙였다: 「타임아웃 UI 를 만들지 않는다」(**보낸 뒤 무응답** — 서버 무응답이 정상 경로다)와 「보내지 못했다」(**애초에 안 나갔다**)는 **다른 사실**이라는 것. 이 구분이 없으면 다음 사람이 ③ 을 근거로 이 분기를 지운다.

**② `vi-settings-card.tsx` — 「닫힘」이 성공 신호로 읽히지 않게**

`submit` 의 반환형을 `void` → **`ViSubmitResult = 'sent' | 'blocked' | 'failed'`** 로 바꿨다(`:125`). boolean 하나로는 뭉개지는 것이 있어서다:

| 결과 | 언제 | 다이얼로그 | 근거 |
|---|---|---|---|
| `sent` | 나갔다 | **닫는다** | 에코(61)를 기다린다 |
| `blocked` | 세션 잠금 · 연타 · 금액 상한 | **닫는다** | 사유(`vi-amount-limit` 등)가 **카드 안에 이미** 떠 있다 — 창을 닫아야 그게 보인다 |
| `failed` | 소켓이 안 받았다 | **열어 둔다** | 「눌렀고 창이 닫혔다」가 곧 성공 신호로 읽힌다. 이 화면에서 그 오독은 「자동매수를 켰다고 믿는 사용자」다 |

```ts
// vi-settings-card.tsx:359-370
if (!send(msg)) {              // :359
  setSendError(VI_SET_SEND_FAILED_TEXT);
  return 'failed';             // :361  ← submittingRef·onSent·setSubmitting·ackTimer 어느 것도 안 걸린다
}
setSendError('');
submittingRef.current = true;  // :364
onSent?.(msg);
setSubmitting(true);           // :366
```

`submittingRef.current = true` 를 `send` **뒤로 옮겼다** — 옛 순서는 보내지도 않은 요청에 연타 가드를 걸었다. `submitting` 잠금을 걸지 않는 근거는 파일 머리말 ④ 에 적었다: 그 잠금은 「보냈으니 에코를 기다린다」는 뜻인데, 보내지 않았으면 기다릴 에코가 없다 — 잠그면 `VI_ACK_TIMEOUT_MS`(3초) 동안 「반영 중…」이 뜨고 사용자는 등록됐다고 믿는다.

`failed` 사유는 **두 자리**에 그린다(상태는 `sendError` 하나): 카드 안 `vi-send-error`(`:590`, 「수정」 경로용 — `DirtyActionBar` 는 더티 0 이면 렌더되지 않아 시작/중지 실패를 담을 수 없다, 16-31 과 같은 함정) · 다이얼로그 안 `vi-confirm-error`(`:853`, `error` prop). 후자가 없으면 카드의 문구가 Radix 오버레이에 가려 사용자에게는 「눌렀는데 아무 일도 없었다」로만 남는다.

**③ 테스트 스텁을 함께 세웠다 (16-31 교훈의 예방 적용)**

두 파일의 `beforeEach` 를 `sendMock.mockClear()` → `mockReset() + mockReturnValue(true)` 로 바꿨다. 16-31 은 이것을 놓쳐 `limit-chaser-client.test.tsx` 2건이 한 커밋 동안 깨져 있었다 — 이번에는 **같은 커밋 안에서** 세웠고 중간에 깨진 상태가 없었다.

### Task 2 — 「가장 최근 반영 시각」을 정규화 전 값으로 비교한다 (GC-IN-03) · commit `821486f`

`latestAccountTime`(`me-client.tsx:95`)은 `formatServerTime(state.st)` 으로 **날짜를 버린 뒤** 문자열을 비교했다. 날짜를 버리면 두 자리에서 최댓값이 뒤집힌다:

- **자정 경계** — `"23:59:00" > "00:01:00"` 이라 **어제 값이 「가장 최근」으로 뽑힌다.**
- **혼합 포맷** — 게이트웨이는 `YYYYMMDDHHMMSS`, 구현·스텁은 `HH:MM:SS` 를 준다(`packages/shared/src/relay.ts:623` 은 「갱신시각 (표시용)」 이상을 계약하지 않는다). 날짜를 버리면 날짜를 **아는** 값이 모르는 값과 같은 축에서 겨루고, 진다.

**채택: 계획의 선택지 (a)** — 원문에서 비교 키를 만들고, **승자의 원문에서** 표시값을 뽑는다.

```ts
interface ServerTimeKey { dated: boolean; key: string; }   // :112

function serverTimeKey(raw)   { … dated ? digits.slice(0,14) : digits(6) }   // :120
function isNewerServerTime(a, b) {                                            // :135
  if (a.dated !== b.dated) return a.dated;   // ★ 날짜를 아는 값이 언제나 이긴다
  return a.key > b.key;
}
```

**epoch 로 만들지 않은 근거**(주석에 남겼다): `HH:MM:SS` 만 오는 값은 날짜를 모르므로 epoch 로 승격하려면 「오늘」을 **가정**해야 하고, 그 가정이 정확히 자정 뒤집힘의 원인이다. 모르는 값을 오늘로 가정하는 대신 **아는 값을 이기게** 한다.

바꾸지 않은 것: 반환 계약(표시 문자열 · 없으면 `null`) · 소비부(상태줄 C1 `반영 {HH:MM:SS}`)의 표시 형식 · `formatServerTime` 자체 · 「계좌가 하나면 결과가 이전과 완전히 같다」는 16-23 보장. **바뀐 것은 어느 값을 고르는가뿐이다.**

함수 위 ★ 문단의 틀린 근거(「비교는 **정규화한 뒤**에 한다 … 원문끼리 비교하면 자릿수가 다른 두 모양이 뒤섞여 엉뚱한 값이 최댓값이 된다」)를 정정했다. 옛 문단은 **관찰은 맞고 결론이 틀렸다** — 자릿수가 다른 두 모양이 섞이는 것은 사실이지만, 답은 「날짜를 버린다」가 아니라 「날짜 유무를 축으로 **분리**한다」였다.

## Verification

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp test` | **672 passed / 1 skipped** (58 files) — 665 → **+7** |
| `pnpm --filter @gh-radar/webapp exec vitest run …/vi-order-list.test.tsx` | **28 passed** (26 → +2) |
| `pnpm --filter @gh-radar/webapp exec vitest run …/vi-settings-card.test.tsx` | **26 passed** (23 → +3) |
| `pnpm --filter @gh-radar/webapp exec vitest run …/me-client.test.tsx` | **7 passed** (신규 파일, 0 → +7) |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (`tsc --noEmit` + e2e tsconfig) |
| `pnpm --filter @gh-radar/webapp exec eslint vi-order-list.tsx vi-settings-card.tsx me-client.tsx` | exit 0 · **경고 0건** |
| `grep -c "if (!send(" vi-order-list.tsx` | **1** (≥1) — `:253` |
| `grep -c "if (!send(" vi-settings-card.tsx` | **1** (≥1) — `:359` |
| `grep -c "보내지 못했" vi-order-list.tsx` | **1** (≥1) |
| 실패 분기가 `setOptimistic`·`setSending` **앞**에서 `return` | ✅ `return` `:255` < `setOptimistic` `:258` < `setSending` `:259` |
| `webapp/src/components/trading/__tests__/me-client.test.tsx` 존재 · `latestAccountTime` 케이스 | **6케이스** (≥4) + `formatServerTime` 1 |
| `grep -c "자정" me-client.tsx` | **2** (≥1) |
| `grep -c "정규화한 뒤에 한다" me-client.tsx` | **0** (== 0) |

### 신규 8케이스 (이름 그대로 인용)

**Task 1 — `describe('⑨ 보내지 못한 확인에는 낙관 반영도 잠금도 걸리지 않는다 (GC-WR-06)')`** (`vi-order-list.test.tsx`)
- `` `send` 가 false 면 체크가 켜지지 않고 행이 잠기지 않으며 사유가 뜬다 `` — `data-state="unchecked"` 유지 + 문구 + **두 번째 클릭이 나간다**(잠기지 않았다는 증명) + 성공 전송이 사유를 지운다
- `` `send` 가 true 면 기존 낙관 반영·잠금이 그대로 걸린다 (회귀 방지) `` — 연타 잠금이 살아 있다

**Task 1 — `describe('⑨ 보내지 못한 `vi.set` 은 성공처럼 보이지 않는다 (GC-WR-06)')`** (`vi-settings-card.test.tsx`)
- `「수정」이 못 나가면 실패 문구가 뜨고 「반영 중…」으로 잠기지 않는다` — 버튼이 `시작` 그대로 · 「수정」이 여전히 enabled · 복구 후 재전송
- `「시작」이 못 나가면 다이얼로그가 열린 채 사유를 보여 준다 — 닫힘 = 성공이 아니다` — 창 유지 + `vi-confirm-error` + `vi-run-bar[data-run="false"]` + 복구 후 같은 자리에서 나가고 **그때야** 닫힌다
- `전송에 성공하면 기존 잠금·다이얼로그 닫힘이 그대로다 (회귀 방지)` — `반영 중…` 이 뜨고 창이 닫힌다

**Task 2 — `describe('latestAccountTime — 비교는 정규화 **전** 값으로 (GC-IN-03)')`** (`me-client.test.tsx`, 신규)
- `모두 HH:MM:SS 면 가장 늦은 시각을 고른다 (기존 동작 회귀)`
- `계좌가 하나면 결과가 그 계좌의 표시값과 완전히 같다 (16-23 보장 유지)`
- `★ 혼합 포맷 — 날짜가 있는 오늘 09:00 이 날짜 없는 23:59 를 이긴다` — **맵 순서를 뒤집어도 같다**(승부가 순회 순서에 기대지 않는다)
- `★ 자정 경계 — 전일 23:59 과 당일 00:01 중 00:01 이 뽑힌다` — 역시 양방향
- `빈 맵이면 null 이다 — 없는 시각을 그리느니 칸을 비운다`
- `읽을 수 없는 st 는 건너뛰고, 전부 그렇다면 null 이다`

(+ `describe('formatServerTime — 표시 정규화 (변경 없음)')` 1건 — 이 plan 이 포맷터를 건드리지 않았다는 사실을 잠근다.)

### 회귀 잠금 실증 (16-27~16-31 승계)

새 테스트가 「그냥 통과하는 테스트」가 아님을 세 번 확인하고 매번 복원했다:

- `vi-order-list` 의 `if (!send(...))` + `vi-settings-card` 의 `if (!send(...))` 를 **동시에** 옛 형태(`send(...)` 한 줄)로 되돌림 → **3건 실패**(⑨ 각 1·2건), 나머지 **51 통과**
- `isNewerServerTime` 의 `dated` 축 한 줄(`if (a.dated !== b.dated) return a.dated;`)만 제거 → **혼합 포맷 1건 실패**, 나머지 6 통과 — 축이 **한 줄로** 잠겨 있음이 실증됐다
- `latestAccountTime` 본문을 16-23 원형(정규화 후 비교)으로 되돌림 → **2건 실패**(혼합 포맷 + 자정 경계), 나머지 5 통과

## Deviations from Plan

**계획대로 실행했다. 계획이 위임한 선택 1건, 계획보다 넓힌 것 2건, 계획 문언과 저장소 실제가 어긋난 항목 2건이 있다. 자동 수정(Rule 1~3)은 0건 — 이번에는 예방이 먼저 들어갔다.**

**1. [계획이 위임한 선택] GC-IN-03 구현 — (a) 원문 비교 키**
- 계획: 「(a) 비교 가능한 키(epoch ms 또는 14자리)를 만들어 최댓값을 고르고 표시는 승자에게서 / (b) 포맷을 판별해 분리 처리」
- 채택: **(a)의 14자리 변형 + `dated` 축**. epoch 를 고르지 않은 근거는 위 Task 2 절(모르는 날짜를 「오늘」로 가정하는 것이 곧 버그의 원인)이고, 코드 주석에도 남겼다.

**2. [계획보다 넓힘] `submit` 의 반환형이 boolean 이 아니라 3갈래다**
- 계획 ② 는 「같은 규율으로 바꾼다 … 실패 시 다이얼로그를 성공처럼 닫지 않고 사유를 남긴다」였다. boolean 으로 만들면 `blocked`(세션 잠금·연타·금액 상한)까지 창이 열린 채 남는데, 그 경우 사유는 **카드 안**(`vi-amount-limit`)에 있어 오버레이에 가린다 — 「사유를 남긴다」를 만족하지 못한다.
- 그래서 `ViSubmitResult` 3갈래로 갈랐다. 기존 케이스 `상한 초과 상태(서버 에코발)에서는 vi.set 이 아예 나가지 않는다` 는 그대로 통과한다.

**3. [계획보다 넓힘] 테스트 8케이스 (계획은 3 + 4 = 7)**
- Task 1 에 `전송에 성공하면 기존 잠금·다이얼로그 닫힘이 그대로다` 를 추가했다 — 계획의 `vi-settings-card` 요구는 실패 경로 1건뿐이라, 새 3갈래 분기가 **성공 경로를 갉아먹었는지**는 잠기지 않았다.
- Task 2 에 `읽을 수 없는 st 는 건너뛰고…` 와 `formatServerTime` 회귀 1건을 추가했다 — 비교 키 함수가 `formatServerTime` 과 **같은 기준**으로 값을 버린다는 사실(두 함수가 갈리면 「고른 값을 그릴 수 없는」 경우가 생긴다)을 잠근다.

**4. [계획 문언 오류] `pnpm --filter gh-radar-webapp` 은 존재하지 않는 필터다 (16-31 과 동일)**
- 계획의 verify·acceptance_criteria 는 전부 `--filter gh-radar-webapp` 이지만 `webapp/package.json` 의 name 은 **`@gh-radar/webapp`** 이다. 그대로 돌리면 `No projects matched the filters` 로 exit 1.
- 실행: 전부 `--filter @gh-radar/webapp` 으로 바꿔 돌렸다. 명령의 의도는 그대로다. **2라운드에서 두 번째 반복**이므로, 남은 plan(16-33~16-35)의 같은 문자열도 같은 치환이 필요하다.

**5. [계획 전제와 다름] `vi-order-list`·`vi-settings-card` 에 오류 표시 채널이 없었다**
- 계획 ① 은 「이 컴포넌트에 에러 표시 자리가 없으면 최소한의 상태 하나(`error` 문자열)를 만든다」로 이미 열어 뒀고, 실제로 **두 파일 다 없었다**(`vi-settings-card` 의 `vi-amount-limit`·`vi-alert-reason` 은 각각 금액 상한·알림 권한 전용이다).
- 최소 추가로 맞췄다: 상태 `useState('')` 각 1개 + `<p role="alert">` 렌더 자리(목록 1 · 카드 1 · 다이얼로그 1). 마크업·색(`--destructive`)·`role` 은 `strategy-status-card.tsx:466-475` 의 `strategy-disable-error` 를 승계했다. **새 컴포넌트도 토스트도 만들지 않았다.**

**사전 존재 경고·무관 실패를 건드리지 않았고, `deferred-items.md` 에 새로 적을 항목도 없다. 자동 포매터는 돌리지 않았다**(이 저장소에 prettier 설정이 없어 무관한 줄이 통째로 재배열된다 — 16-30 사고).

## 검증 기준의 정정 — `10.41.1.120` 0건 조건 (16-29~16-31 승계)

2라운드 공통 기준의 `grep -rn "10.41.1.120" relay/` **0건** 조건은 **성립하지 않는다.** 실측은 여전히 **2건**이고, 둘 다 산문이다:

- `relay/README.md:17` — 「기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 …」 **경고 문장**
- `relay/src/dma/link-health.ts:20` — 「게이트웨이가 `10.41.1.120` 이라 이 조건이 곧 "터널이 서 있다"」 **주석**

접속 대상 설정이 아니다. **지우지 않았다** — 지우면 D-27 안전장치의 근거가 사라진다. 이 plan 은 `relay/` 를 한 줄도 손대지 않았다(webapp 5파일 + 신규 테스트 1).

## Requirements

**`requirements.mark-complete` 를 돌리지 않았다.**

- **TRADE-02** — 이 plan 이 닫은 것은 VI 표면의 **전송 정직성**이고, 종결 판정은 2라운드 종결 plan 의 배포·실측 몫이다.
- **MYPAGE-01** — 상태줄 표시 정확성 1건을 고쳤을 뿐 표면 전체의 종결 판정이 아니다.

## Threat Model 처리

| Threat ID | Disposition | 이 plan 의 처리 |
|---|---|---|
| T-16-62 | mitigate | ✅ `toggle` 이 boolean 을 읽는다(`:253`). 실패 시 `setOptimistic`·`setSending` 미호출 + 문구. 「false 면 잠기지 않는다」 케이스가 두 번째 클릭으로 잠금 부재를 실증한다 |
| T-16-63 | mitigate | ✅ 잘못 건 잠금을 **애초에 만들지 않는다**. 성공 경로의 낙관 반영·연타 잠금은 회귀 케이스로 그대로 유지 |
| T-16-64 | mitigate | ✅ `submit` 이 `failed` 를 돌려주면 `submitting`·`ackTimer`·`onSent` 어느 것도 걸지 않고 **다이얼로그를 닫지 않으며** 그 안에 사유를 띄운다 |
| T-16-65 | mitigate | ✅ 비교 축을 `st` **원문**으로 옮겼다(`dated` 우선). 혼합 포맷·자정 경계 케이스가 양방향 순회로 잠근다 |
| T-16-13 | accept | ✅ jsdom 단위 테스트·스텁만 사용. 실서버·실계좌 접속 0회 (D-27 승계) |

## 배포

**미실시.** webapp(Vercel) 배포는 2라운드 종결 plan 에서 relay 재배포와 함께 일괄 처리한다(16-27~16-31 과 같은 규율). 이 plan 의 변경은 아직 프로덕션에 없다.

## Known Stubs

없음. 하드코딩된 빈 값·placeholder·「준비 중」 문구를 만들지 않았고, 새로 만든 표시 표면 3종(`vi-confirm-error` ×2 · `vi-send-error`)은 모두 실제 상태(`sendError`)에 연결돼 있다.

## Next

- **GC-WR-06 은 이 plan 으로 닫혔다** — 상따 폼 2곳(16-31) + VI 2곳(16-32)으로 `send` 반환값을 버리는 호출부가 남아 있지 않다. 새 호출부를 만들 때는 **같은 커밋에서 테스트 스텁을 `mockReturnValue(true)` 로** 세울 것.
- 16-33~16-35 (2라운드 잔여 갭 클로징) — 계획서의 `--filter gh-radar-webapp` 은 `@gh-radar/webapp` 으로 읽을 것.
- 2라운드 종결 plan 의 배포(webapp + relay) 후 프로덕션 확인.

## Self-Check: PASSED

- 파일 4종 실재 확인 (`16-32-SUMMARY.md` · `me-client.test.tsx` · `vi-order-list.tsx` · `vi-settings-card.tsx`)
- 커밋 2건 실재 확인 (`551d89c` · `821486f`)
