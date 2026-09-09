---
phase: 16-trading-limit-chaser-vi-my-page
plan: 19
subsystem: ui
tags: [websocket, relay, react, kill-switch, fail-safe, vitest, rtl]

requires:
  - phase: 16-17
    provides: My page 전략 현황 카드(C2~C4)·킬 스위치·65 백스톱과 상따/VI 편집 표면
provides:
  - "`send(msg): boolean` — 소켓 미연결 드롭을 `console.error` + `false` 로 표면화 (PC-7)"
  - "킬 스위치 세션 가드 (`status !== \"ready\"` 면 비활성)"
  - "전송 실패 / ack 미수신을 **다른 문구**로 가르는 `strategy-disable-error` 라인"
  - "`vi.set` 송신 경로의 세션 가드 (감사 중 발견한 두 번째 구멍)"
  - "send 호출부 5곳의 가드 소재를 각 호출부 주석으로 고정"
affects: [16-20~16-26 갭 클로징, relay 소비자 신규 추가]

tech-stack:
  added: []
  patterns:
    - "송신구는 boolean 을 돌려준다 — 드롭을 삼키는 void 송신구를 새로 만들지 않는다"
    - "「보내지 못했다」(0바이트 확실)와 「반영을 확인하지 못했다」(결과 모름)는 다른 문구다"
    - "가드가 호출부와 다른 파일에 있으면 그 사실을 호출부 주석으로 못박는다"

key-files:
  created: []
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx

key-decisions:
  - "`send` 로그에는 `msg.t` 만 싣는다 — `lc.set.cfg`·`vi.set.accountNo` 의 계좌번호가 브라우저 콘솔로 새지 않게 (T-16-18). 테스트가 로그 인자에 계좌번호가 없음을 단언한다"
  - "전송 실패 시 `awaitingAck` 를 세우지 않는다 — 세우면 8초 동안 잠긴 채 아무 일도 없고 그동안 사용자는 「껐다」고 믿는다 (T-16-20)"
  - "8초 ack 미수신은 「실패」가 아니라 「반영을 확인하지 못했어요」다 — 65 만 유실됐고 전략은 실제로 꺼졌을 수 있다 (T-16-21)"
  - "감사 대상 4곳 중 `vi.set` 은 가드가 **없었다** — 16-REVIEW 의 「킬 스위치만 예외」 주장은 거짓이었고 예외는 2곳이었다"
  - "감사 4곳에 send 반환값 분기 UI 를 복제하지 않는다 — 가드가 실재하면 드롭이 없고, 그럼에도 드롭되면 Task 1 의 `console.error` 가 남는다"

patterns-established:
  - "계약 JSDoc 이 결함을 선언하고 있으면 코드와 함께 문장을 지운다 (「조용히 무시한다」 삭제)"
  - "가드 보강은 뮤테이션(가드 한 줄 주석 처리 → 테스트 실패)으로 실효를 실증한다"

requirements-completed: [MYPAGE-01, TRADE-03]

duration: 9min
completed: 2026-09-09
---

# Phase 16 Plan 19: 킬 스위치의 침묵 제거 (gap 3) Summary

**전략 4종의 유일한 출구였던 `send()` 가 이제 드롭을 `console.error` + `false` 로 드러내고, 킬 스위치는 단절 중 눌리지 않으며, 감사 과정에서 `vi.set` 에도 같은 구멍이 하나 더 있었음을 찾아 막았다.**

## Performance

- **Duration:** 9분
- **Started:** 2026-09-09T00:59:52Z
- **Completed:** 2026-09-09T01:09:22Z
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- **`send` 가 boolean 계약이 됐다.** 소켓이 없거나 `readyState !== OPEN` 이면 `console.error` 한 줄(`[relay] 소켓 미연결 — 전송하지 않음 (t=…)`)과 `false` 를 남긴다(`use-relay-socket.ts:856~868`). 두 계약 타입(`RelayConnectionState.send:212` · `RelaySocketState.send:252`)이 함께 `=> boolean` 이고, 결함을 선언하던 JSDoc 문장 「소켓이 열려 있지 않으면 조용히 무시한다」는 파일에서 사라졌다(`grep -c "조용히 무시"` = 0).
- **킬 스위치가 단절 중에 눌리지 않는다.** `disabled={nothingToDisable || awaitingAck || status !== "ready"}`(`strategy-status-card.tsx:500`). 리듀서가 단절 시 `isStale` 만 세우고 `limitChasers` 를 유지한다는 사실이 이제 버튼 활성 여부를 결정하지 못한다.
- **못 나간 사실이 화면에 뜬다.** `handleConfirm` 이 `if (!send({ t: "strategies.disable" }))`(`:394`) 로 갈라지고, 실패 경로는 `awaitingAck` 를 **세우지 않은 채**(`setAwaitingAck(true)` 는 `:406` — early return **뒤**다) `role="alert"` 인 `strategy-disable-error`(`:509`) 로 「연결이 끊겨 …」를 그린다.
- **8초가 조용히 지나가지 않는다.** ack 백스톱이 「전체 비활성화 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.」를 남기고, 65 가 뒤늦게 도착하면 그 문구를 지운다.
- **감사에서 두 번째 구멍을 찾았다.** `vi.set` 은 「시작/중지」 버튼(`locked || submitting`)으로만 가려져 있었고 `DirtyActionBar` 의 「수정」(`submitting` 만으로 잠김) 경로는 세션 판정을 통과하지 않았다. `submit` 첫 줄에 `if (locked) return;` 을 넣어 막았다.

## Task Commits

1. **Task 1: send 를 boolean 계약으로 바꾸고 드롭을 로그로 남긴다** — `d52e788` (fix)
2. **Task 2: 킬 스위치에 세션 가드 + 전송 실패·ack 타임아웃 표시** — `593f306` (fix)
3. **Task 3: 나머지 send 호출부 4곳 감사 — vi.set 가드 보강** — `5bb089f` (fix)

## Files Created/Modified

- `webapp/src/lib/use-relay-socket.ts` — `send` 구현·두 계약 타입·JSDoc
- `webapp/src/lib/relay-provider.tsx` — `EMPTY_RELAY_VALUE.send` 를 `NOOP` → `() => false` (PC-7 주석 동반)
- `webapp/src/components/trading/strategy-status-card.tsx` — 세션 가드 · `sendError` 상태 · `strategy-disable-error` 라인 · 파일 상단 ⑦ 규율 문단
- `webapp/src/components/trading/vi-settings-card.tsx` — `locked` 계산 상향 + `submit` 의 `if (locked) return;`
- `webapp/src/components/trading/limit-chaser-form.tsx` — 가드 소재 주석 2건(코드 변경 없음)
- `webapp/src/components/trading/vi-order-list.tsx` — 가드 소재 주석 1건(코드 변경 없음)
- `webapp/src/lib/__tests__/relay-socket.test.ts` — 케이스 ⑱ · ⑱-a
- `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx` — 케이스 ⑨ · ⑨-a · ⑩ · ⑪
- `webapp/src/components/trading/__tests__/vi-settings-card.test.tsx` — 케이스 ⑦ 2건

## Task 3 감사 결과 — send 호출부 5곳

| # | 호출부 | 가드 | prop | 부모 | 판정 |
|---|--------|------|------|------|------|
| 1 | `limit-chaser-form.tsx:313` (`toggleGate`, `lc.set`) | `if (disabled) return;` `:307` | `disabled` | `limit-chaser-client.tsx:574` `disabled={isin === '' \|\| accountNo === '' \|\| status !== 'ready'}` ← `status` from `useRelayContext()` `:157` | ✅ 실재 |
| 2 | `limit-chaser-form.tsx:327` (`handleSubmit`, `lc.set`) | `if (submitting \|\| disabled) return;` `:321` | `disabled` | 위와 동일 (`limit-chaser-client.tsx:574` → `:157`) | ✅ 실재 |
| 3 | `vi-settings-card.tsx:277` (`submit`, `vi.set`) | **없었음** → `if (locked) return;` `:266` 신설 (`locked = disabled \|\| server === undefined` `:255`) | `disabled` | `vi-client.tsx:359` `<ViSettingsCard disabled={!sessionReady}>` ← `sessionReady = status === 'ready'` `:283` ← `useRelayContext()` `:117` | ❌ **부재 → 보강** |
| 4 | `vi-order-list.tsx:230` (`toggle`, `vi.confirm`) | `if (!isConfirmable(item, disabled)) return;` `:225` | `disabled` | `vi-client.tsx:427` `<ViOrderList disabled={!sessionReady}>` ← `:283` ← `:117` | ✅ 실재 |
| 5 | `strategy-status-card.tsx:394` (`strategies.disable`) | Task 2 에서 신설 (`status !== "ready"` `:500` + 반환값 분기 `:394`) | — | 자기 컴포넌트가 `useRelayContext()` 로 `status` 직접 사용 | ✅ 보강 완료 |

**#3 이 왜 새는가.** 「시작/중지」 버튼은 `disabled={locked || submitting}`(`:468`)이라 단절 중 못 누른다. 그러나 `DirtyActionBar`(`dirty-action-bar.tsx:119`)의 「수정」은 `disabled={submitting}` 뿐이다. 세션이 `ready` 일 때 금액을 고쳐 더티를 만든 뒤 소켓이 끊기면 그 버튼은 그대로 살아 있고, 클릭이 `handleModify → submit → send(msg)` 까지 도달해 0바이트로 사라졌다. `limit-chaser-form` 은 같은 `DirtyActionBar` 를 쓰면서도 `handleSubmit` 안에 `disabled` 가드가 있어 무사했다 — 차이는 **가드를 콜백 안에 뒀는가**였다.

**뮤테이션 실증.** `if (locked) return;` 한 줄을 주석 처리하면 새 케이스 「더티 상태에서 세션이 끊기면 「수정」을 눌러도 아무것도 나가지 않는다」가 실패한다(1 failed | 19 passed). 가드를 되돌리면 20/20.

## Decisions Made

- **로그에 본문을 싣지 않는다.** `console.error` 는 `t=` 만 남긴다. 테스트 ⑱ 이 로그 인자에 계좌번호(`37728502101`)와 금액이 없음을 단언한다(T-16-18).
- **전송 실패는 대기 상태를 만들지 않는다.** 0바이트가 확실한 사건에 8초 잠금을 거는 것은 오히려 사용자를 속인다.
- **ack 미수신은 실패가 아니다.** 문구가 「확인하지 못했어요」인 이유는 65 유실과 실제 미반영을 구분할 수 없기 때문이다(Pitfall 9 동형). 테스트가 문구에 「실패」가 들어 있지 않음을 단언한다.
- **감사 4곳에 UI 를 복제하지 않았다.** 계획의 「하지 않는 것」 그대로. #3 도 문구가 아니라 가드 한 줄로 막았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 누락된 필수 기능] `vi.set` 송신 경로에 세션 가드 신설**
- **Found during:** Task 3 (감사)
- **Issue:** 계획은 「참이면 주석만, 거짓이면 가드 보강」을 지시했고 감사 결과 `vi-settings-card.tsx` 의 `submit` 이 거짓이었다. 16-REVIEW §「검토했으나 결함을 찾지 못한 영역」의 「`lc.set`/`vi.set`/`vi.confirm` 호출부는 전부 `status !== 'ready'` 로 가려져 있다」는 주장이 사실이 아니었다.
- **Fix:** `locked` 계산을 `submit` 위로 올리고 콜백 첫 줄에 `if (locked) return;` 추가. `useCallback` 의존성에 `locked` 포함.
- **Files modified:** `webapp/src/components/trading/vi-settings-card.tsx`, `webapp/src/components/trading/__tests__/vi-settings-card.test.tsx`
- **Verification:** 회귀 케이스 2건 + 뮤테이션(가드 주석 처리 시 실패) 실증
- **Committed in:** `5bb089f` (Task 3 커밋)

**2. [Rule 3 - 블로킹 이슈] `strategy-status-card.test.tsx` 의 `send` 스텁 타입 정정**
- **Found during:** Task 2/3 (typecheck)
- **Issue:** 기존 케이스 ⑤ 의 `vi.fn()` 이 `send` 의 새 boolean 계약에서 항상 falsy 로 읽혀 실패 경로를 타고, `vi.fn(() => true)` 로 바꾸면 `mock.calls` 가 빈 튜플로 추론돼 `tsc` 가 TS2493/TS2352 를 낸다.
- **Fix:** `vi.fn((_msg: unknown) => true)` 로 인자 타입을 남겼다.
- **Files modified:** `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx`
- **Verification:** `pnpm --filter @gh-radar/webapp run typecheck` exit 0
- **Committed in:** `5bb089f`

**3. [Rule 3 - 블로킹 이슈] 가짜 타이머 케이스가 Radix 다이얼로그 대기에 갇힘**
- **Found during:** Task 2 (케이스 ⑪)
- **Issue:** `vi.useFakeTimers()` + `userEvent` 조합에서 다이얼로그 열림 대기가 가짜 시계에 묶여 5초 테스트 타임아웃.
- **Fix:** `vi.useFakeTimers({ shouldAdvanceTime: true })` + `afterEach(() => vi.useRealTimers())`.
- **Files modified:** `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx`
- **Verification:** 17/17 통과, 후속 파일에 타이머 누수 없음(전체 57 파일 green)
- **Committed in:** `593f306`

---

**Total deviations:** 3 auto-fixed (Rule 2 × 1, Rule 3 × 2)
**Impact on plan:** 계획 범위 안이다. #1 은 계획이 명시적으로 지시한 분기(「거짓인 곳이 있으면 가드를 세운다」)이고, #2·#3 은 새 계약을 통과시키기 위한 테스트 하네스 정정이다. 스코프 확장 없음.

## Issues Encountered

- **acceptance_criteria 의 grep 패턴이 따옴표 스타일을 잘못 가정했다.** 계획은 `grep -c "status !== 'ready'"` 를 요구했지만 `strategy-status-card.tsx` 는 파일 전체가 큰따옴표다(`status === "ready"` 등). 파일 내 일관성을 우선해 `status !== "ready"` 로 작성했다 — 동등 검증은 `grep -c 'status !== "ready"' webapp/src/components/trading/strategy-status-card.tsx` = **1**(`:500`). Task 3 의 같은 기준은 `limit-chaser-client.tsx`(작은따옴표 파일)에서 그대로 성립한다: `status !== 'ready'` 1건(`:574`) · `vi-client.tsx` `sessionReady` 4건.

## Verification

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/relay-socket.test.ts` | ✅ 28 passed |
| `pnpm --filter @gh-radar/webapp exec vitest run …/strategy-status-card.test.tsx` | ✅ 17 passed |
| `pnpm --filter @gh-radar/webapp exec vitest run …/vi-settings-card.test.tsx` | ✅ 20 passed |
| `pnpm --filter @gh-radar/webapp test` | ✅ 57 files / **636 passed** + 1 skipped (기존 628 → +8) |
| `pnpm --filter @gh-radar/webapp run typecheck` | ✅ exit 0 (`tsc --noEmit` + `tsconfig.e2e.json`) |
| `pnpm typecheck` (13 워크스페이스) | ✅ exit 0 |
| `grep -rn "10\.41\.1\.120" webapp/src/` | ✅ 0건 (D-27 승계) |
| `grep -c "=> boolean" use-relay-socket.ts` | ✅ 2 |
| `grep -c "조용히 무시" use-relay-socket.ts` | ✅ 0 |
| `grep -c "strategy-disable-error"` | ✅ 1 |
| `grep -c "!send("` | ✅ 1 (`:394`) |
| `setAwaitingAck(true)`(`:406`) 가 `!send(...)` early return(`:394~403`) 뒤 | ✅ |

## must_haves 대조

| truth | 상태 | 근거 |
|-------|------|------|
| `send()` 가 로그를 남기고 false 를 돌려준다 | ✅ | `use-relay-socket.ts:856~868`, 테스트 ⑱ |
| 「전체 비활성화」가 `status !== 'ready'` 면 비활성 | ✅ | `:500`, 테스트 ⑨ / ⑨-a |
| 전송 실패 시 `awaitingAck` 미설정 + 「연결이 끊겨 …」 | ✅ | `:394~406`, 테스트 ⑩ |
| 8초 ack 타임아웃이 「반영을 확인하지 못했어요」를 남긴다 | ✅ | 백스톱 `useEffect`, 테스트 ⑪ |
| 나머지 4개 호출부가 전부 세션 준비 상태로 가려져 있음이 소스 단언으로 확인 | ⚠️ **정정** | 3곳은 실재, **`vi.set` 1곳은 부재였고 이 plan 이 세웠다**. 위 감사 표 참조 — 「킬 스위치만 예외」는 사실이 아니었다 |

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 표면·인증 경로·스키마 변경이 없다. 신규 `console.error` 는 위협 등록부 T-16-18 에 이미 있고 완화(본문 미기재 + 테스트 단언)했다.

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

- gap 3 종결. `MYPAGE-01` 의 킬 스위치 절이 「연결돼 있을 때만 참」인 상태에서 벗어났다.
- 남은 갭 클로징: 16-20~16-26 (gap 2 · gap 4 · CR-01 · WR-02~09).
- **후속 권고(비차단):** `DirtyActionBar` 는 세션 상태를 모른 채 「수정」을 그리는 공용 컴포넌트다. 지금은 두 소비자가 각자 콜백에서 막고 있으나, 세 번째 소비자가 생기면 같은 구멍이 다시 열린다. `disabled` prop 을 컴포넌트 계약에 넣는 편이 구조적으로 안전하다.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*
