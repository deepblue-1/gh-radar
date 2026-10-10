---
phase: 27-auto-sell-integration
round: 3
reviewed: 2026-10-10T04:02:19Z
depth: standard
review_base: a8a68b65
review_head: 5bd05af1
files_reviewed: 2
files_reviewed_list:
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 27: 코드 리뷰 보고서 — 3라운드

**리뷰 시각:** 2026-10-10T04:02:19Z
**깊이:** standard
**리뷰한 파일:** 2개
**상태:** issues_found

## 요약

`git diff a8a68b65..HEAD`에서 두 파일을 봤다. 대상 커밋은 b9e03bed(WR-R2-01)와 0948efe5(WR-R2-02)다. 전체 파일 맥락은 `useStrategyCardState`(`strategy-card.tsx:417-879`)를 다시 읽어 확인했다. 호출되는 판정 함수(`webapp/src/lib/limit-chaser.ts`의 `isAutoSellCommandRejection` · `isAutoSellCommandSettled` · `autoSellButtonsOf` · `isLimitChaserServerMessage`)와 relay 거부 프레임 모양(`relay/src/ws/fanout.ts:433-440`, `:1237-1250`, `:1815-1826`)도 대조했다.

### 2라운드 지적 종결 여부

| ID | 판정 | 근거 |
|----|------|------|
| WR-R2-01 | **닫힘, 회귀 1건** | 3초 뒤에 늦게 온 41 거부가 `lateAutoSellAnswer`로 「미반영」을 거두고 원문만 세운다(`:729-750`). 그런데 그 늦은 창에는 기한이 없다. 그래서 키를 싣지 않는 relay 거부(i "")까지 무기한으로 받는다(WR-R3-01). |
| WR-R2-02 | **닫힘(타이머 발화 뒤 경로만), 잔여 1건** | 삭제 갈래(`:589`)와 켜짐 → 꺼짐 전이(`:610`)가 `clearAutoSellUnacked`를 부른다. 다만 둘 다 이미 세워진 「미반영」만 거둔다. 41이 **대기 중**(3초 안)일 때 같은 전이가 오면, 살아 있는 41 타이머가 뒤에 「미반영」을 다시 세운다(WR-R3-02). |
| WR-03 불변식 | **유지** | 꺼진 채인 에코로는 거두지 않는다. 전이로 묻는다(`:610`). 런타임 전용 조기 반환(`:629`)보다 먼저 판정한다. 음성 테스트(`strategy-card-flow.test.tsx:2263-2279`)가 있다. |
| WR-01 불변식 | **유지** | 늦은 거부 경로도 `acceptAnswer`를 부르지 않는다(`:745-750`). 테스트가 `lastCard.unacked === false`를 단언한다. |
| `clearAutoSellUnacked` 단일 해제 지점 | **사실** | `setAutoSellUnacked(false)`와 `autoSellTimedOutRef.current = null`은 `:445-446` 한 곳뿐이다. 세우는 곳은 41 타이머(`:872-874`) 하나다. |

Critical은 없다. Warning 2건은 모두 2라운드 수정이 해제 조건을 「타이머가 이미 발화한 상태」 하나에만 붙였기 때문에 생겼다.

- WR-R3-01: 늦은 창의 **시작**은 정했지만 **끝**을 정하지 않았다.
- WR-R3-02: 「41이 더는 의미 없음」을 판정하는 수평선이 대기 중(3초 안) 41을 보지 않는다.

**테스트 실행:** main checkout에서 두 번 돌렸다. 같은 머신에서 다른 세션의 vitest 프로세스 45~54개가 돌고 있었다(load avg 47~95).

- `vitest run strategy-card-flow.test.tsx -t "WR-R2"`: 새 테스트 **6건 모두 통과**했다.
- 파일 전체 실행: 1530초가 걸렸고 `4 failed | 70 passed (90)`이었다. 실패는 vitest `Timeout._onTimeout`이다. 출력이 잘려서 어느 테스트가 실패했는지는 확인하지 못했다.

과부하 때문에 생긴 타임아웃으로 보이지만, 전체 파일이 초록인지는 이 리뷰가 확인하지 못했다. 부하가 없을 때 다시 돌려야 한다. 아래 지적은 모두 정적 추적으로 확인했다.

## Warnings

### WR-R3-01: 늦은 41 거부를 받는 창에 기한이 없다 — 다른 카드의 relay 거부(i "")가 이 카드 로그·상태줄에 빨갛게 선다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:729-737`, `:745-757`, `webapp/src/lib/limit-chaser.ts:991-994`, `relay/src/ws/fanout.ts:1815-1826`

**문제:** `lateAutoSellAnswer`는 `autoSellTimedOutRef.current !== null`인 동안 계속 열려 있다. 이 ref가 비는 조건은 기대 전이, 거부, 삭제, 켜짐 → 꺼짐 전이, 다음 41 전송, 키 변경뿐이고 **시간으로는 비지 않는다.** fix 보고서도 41을 모르는 옛 서버(127)에서 켜진 채 무응답이 된 바로시작은 「의도적으로」 영구히 남긴다고 적었다. 그 경우 이 늦은 창도 영구히 열려 있다.

`isAutoSellCommandRejection`의 `Relay` 갈래는 전략 키를 보지 않는다. 보는 것은 모양(`i === ""` ∧ `a`가 빈 값 또는 이 계좌)과 `kind`(`"autosell.cmd"` 또는 `""`)뿐이다. 그런데 relay의 조립 실패와 송신 실패 거부는 `rejectFrame(reason, "", "", t)`, 즉 i도 a도 빈 값이다(`fanout.ts:1817`, `:1825`). 그래서 다음 순서가 그대로 일어난다.

1. 카드 A(종목 X)가 옛 서버에 바로시작을 보낸다. 3초 무응답이 되어 `autoSellTimedOutRef = "start"`가 영구히 남는다.
2. 같은 탭의 카드 B(종목 Y)가 바로시작을 보낸다. relay가 조립 또는 송신 실패로 `{src:"Relay", kind:"autosell.cmd", i:"", a:""}`를 이 연결로 보낸다.
3. 카드 A에서 `lateAutoSellAnswer`가 참이 된다. B의 거부 원문이 A의 전략 로그에 `pushLog`로 남고, A의 상태줄 `card-server-error`에 빨갛게 선다(`setLastError`). A의 「미반영」도 거둬진다.

수정 전에는 relay 줄이 `isLimitChaserServerMessage`의 표시 몫이 아니었다. 그래서 A의 3초 창 밖에서는 A에 아무것도 서지 않았다. 기존 테스트 「pending 이 아닐 때 같은 Relay 줄은 종전대로 그리지 않는다(표시 몫 불변)」(`test.tsx:2041`)가 고정한 불변식도 바로 이것이다. 이번 수정은 이 불변식을 「타이머가 발화한 뒤의 카드」에 대해서만 기한 없이 풀었다. WR-04가 막은 카드 간 표시 오염이 relay 갈래로 다시 들어온 것이다.

배포 순서 호환용 `kind === ""` 폴백(태그 이전 relay)에서는 범위가 더 넓다. lc.set · lc.arm · vi.set 등 **모든** relay 거부가 A의 늦은 답으로 읽힌다.

fix 보고서의 「오판은 대기 중 창과 같은 방향이다 — 『미반영』이 일찍 거둬질 뿐」이라는 설명은 해제 쪽에만 맞는다. 표시 쪽에서는 남의 거부 원문을 이 카드에 세우는 거짓 정보가 된다. 또 대기 중 창은 3초로 묶여 있지만 이 창은 묶여 있지 않으므로 「같은 방향」이라는 근거도 성립하지 않는다.

**수정:** 늦은 창에서는 키를 싣는 출처(`AutoSellCommand` · `Account`, i·a 일치)만 받는다. relay 거부는 그 41의 결과 모름 수평선(lc.set의 `ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS`와 같은 모양) 안에서만 받는다.

```tsx
// 41 타이머 콜백(:866-876)에서
autoSellTimedOutRef.current = action;
autoSellLateRelayUntilRef.current = Date.now() + LC_ORPHAN_WAIT_MS;

// 54 이펙트(:729-)
const timedOut = autoSellTimedOutRef.current;
const lateAutoSellAnswer =
  autoSellCmdRef.current === null &&
  timedOut !== null &&
  isAutoSellCommandRejection(msg, isin, accountNo) &&
  // relay 거부는 키가 없다 — 상관의 근거는 시간 창뿐이다. 창 밖이면 다른 요청의 답일 수 있다.
  (msg.src !== "Relay" || Date.now() <= autoSellLateRelayUntilRef.current);
```

`clearAutoSellUnacked`에서 `autoSellLateRelayUntilRef.current = 0`도 함께 내린다. 테스트도 둘 더한다. 하나는 「타이머 발화 → LC_ORPHAN_WAIT_MS 경과 → `{src:"Relay", kind:"autosell.cmd", i:"", a:""}` 도착」에서 `card-server-error`가 null이고 「미반영」이 유지되는지 본다. 다른 하나는 같은 상황에서 `kind:""`(옛 relay) 줄이 와도 그리지 않는지 본다.

### WR-R3-02: 41 대기 3초 안에 전략 삭제나 자동매도 꺼짐 전이가 오면 타이머가 뒤에 「미반영」을 다시 세운다 — WR-R2-02의 갇힘이 타이밍만 바꿔 남는다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:582-595`, `:610`, `:866-876`

**문제:** 두 「더는 의미 없음」 수평선은 `clearAutoSellUnacked()`만 부른다. 이 함수는 근거 ref와 표시 state만 내리고, 대기 중 41(`autoSellCmdRef` · `autoSellCmdTimer`)에는 손대지 않는다. 그래서 다음 순서가 생긴다.

1. 바로시작 전송 → `autoSellCmdRef = "start"`, 3초 타이머가 걸린다.
2. 1초 뒤 전략 삭제 에코가 온다(다른 단말, WinForms, 이 탭에서 남은 게이트를 끔). `server`가 null이 되고, 삭제 갈래가 `clearAutoSellUnacked()`를 부른다. 지금은 아무것도 서 있지 않으므로 무동작이다. 철거 에코는 start의 기대 전이(상태 3 ∧ enabled)를 싣지 않으므로 `settleAutoSell`도 대기를 풀지 않는다.
3. 3초에 41 타이머가 발화한다. 콜백(`:870-875`)은 지금 `server`를 보지 않고 무조건 `autoSellTimedOutRef = "start"`, `setAutoSellUnacked(true)`, error 로그 「자동매도 바로시작 — 서버 응답 없음」을 세운다.
4. 이제 `server === null`이라 `autoSellButtonsOf(null)`이 두 버튼을 모두 잠근다. 삭제 갈래는 `prev !== null`일 때만 돌므로 다시 실행되지 않는다. 빈 카드에 「미반영 · 서버 응답을 기다리고 있어요」가 키 변경이나 remount 전까지 남는다. WR-R2-02 1번 사례와 같은 결과다.

켜짐 → 꺼짐 전이(`:610`)도 같다. 대기 중에 다른 단말이나 서버 킬 스위치가 자동매도를 끄면, 전이 판정은 그 순간 지울 것이 없어 지나간다. 3초 뒤 타이머가 「미반영」을 세운다. 그 뒤로는 꺼진 채인 에코만 오므로(WR-03 음성 규칙) 다시 누르기 전까지 거둬지지 않는다.

전제는 「41이 무응답」이다. 즉 41을 모르는 옛 서버이거나 41만 유실된 경우로, WR-R2-02 자체의 전제와 같다. 이 탭의 폼은 41 대기 중에 자동매도 스위치와 그룹 확정을 잠근다(`limit-chaser-form.tsx:967-977`). 하지만 다른 게이트, 다른 단말, 서버발 전이는 막지 않는다.

키 변경 리셋(`:506-507`)은 이미 `setAutoSellCmd(null)`과 `clearAutoSellUnacked()`를 **둘 다** 부른다. 삭제 갈래만 그 짝을 빠뜨린 것이다.

**수정:** 「41이 더는 의미 없다」의 두 수평선에서 대기 중 41도 끝낸다. 타이머를 꺼야 뒤늦은 「미반영」이 서지 않는다.

```tsx
// 삭제 갈래(:587-589)
acceptAnswer();
// 41 도 더는 의미가 없다 — 대기 중이면 타이머까지 끈다(키 변경 리셋과 같은 짝).
setAutoSellCmd(null);
clearAutoSellUnacked();

// 켜짐 → 꺼짐 전이(:610)
if (prev !== null && prev.autoSellEnabled && !server.autoSellEnabled) {
  // 대기 중 start 의 기대 전이(상태 3 ∧ enabled)는 이제 오지 않는다 — stop 은 위 settleAutoSell 이 이미 풀었다.
  if (autoSellCmdRef.current === "start") setAutoSellCmd(null);
  clearAutoSellUnacked();
}
```

테스트로는 「press start → 1초 → 철거 에코(server null) → 3초 경과」에서 `card-unacked`가 null이고 「서버 응답 없음」 로그 줄이 없는지 본다. 「press start → 1초 → `autoSellEnabled:false` 에코 → 3초 경과」도 같은 단언을 한다. 현재 새 테스트 3건(`test.tsx:2218-2262`)은 모두 `vi.advanceTimersByTime(ACK_TIMEOUT_MS)` **뒤에** 전이를 보낸다. 그래서 이 경로를 다루지 않는다.

## Info

### IN-R3-01: `isAutoSellCommandRejection` 계약 주석이 「in-flight 창 안에서만 묻는다」로 남아 있다

**파일:** `webapp/src/lib/limit-chaser.ts:960-961`, `:976-977`

**문제:** 주석은 「호출자가 41 을 보내 놓은 **in-flight 창 안에서만** 묻는다 — … 창이 그 상관을 맡는다」고, 「오판 방향은 … 『미반영』이 일찍 거둬질 뿐」이라고 적는다. 그런데 b9e03bed부터 카드는 이 함수를 3초 무응답 **뒤의** 창(`autoSellTimedOutRef`가 서 있는 동안)에서도 부른다. 또 그 결과로 원문 줄과 상태줄을 세운다. 이 판정 함수의 소비자가 지켜야 할 전제가 바뀌었는데 정본 주석은 바뀌지 않았다. 다음 사람이 이 함수를 다른 화면에서 쓰면 창의 기한을 묻지 않게 된다. WR-R3-01은 바로 그 전제가 깨진 결과다.

**수정:** WR-R3-01을 고치면서 「대기 창 또는 무응답 뒤 결과 모름 수평선(relay 출처는 시간으로 묶음) 안에서만 묻는다」로 주석을 고친다.

### IN-R3-02: WR-R2-02 양성 테스트가 「꺼짐 전이」와 「삭제」를 각각 하나의 경로로만 고정한다 — 회귀 방지력이 좁다

**파일:** `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx:2218-2262`

**문제:** 새 테스트는 다음 두 가지를 다루지 않는다.

- 위의 대기 중 경로(WR-R3-02).
- 켜진 채인 런타임 푸시(`autoSellEnabled: true → true`, 예: `autoSellSoldQty`만 변화)가 **타이머 발화 뒤** 「미반영」을 거두지 않는다는 음성 단언. 이번 커밋이 이 이펙트에 새 해제를 넣었으므로 WR-03의 핵심 음성 케이스를 같은 블록에 두는 편이 안전하다. 현재 음성 테스트는 꺼진 채(false → false)뿐이다.

**수정:** 타이머 발화 뒤에 `const runtime = echo({ ...watching, autoSellSoldQty: 10 })`를 보낸다. `autoSellSoldQty`는 `LIMIT_CHASER_SERVER_AUTO_SELL_FIELDS`에 속하므로 이 에코는 `isRuntimeOnlyEcho` 경로를 탄다. 이때 「미반영」이 유지되는지 단언한다. WR-R3-02의 대기 중 경로 테스트 2건도 더한다.

참고: `:608` 주석의 「아래 런타임 전용 조기 반환보다 먼저」는 동작상 필수가 아니다. `autoSellEnabled`는 `RUNTIME_ONLY_SKIP`에 없으므로 켜짐 → 꺼짐 에코는 애초에 런타임 전용으로 판정되지 않는다. 해가 되지는 않는다.

---

_리뷰 시각: 2026-10-10T04:02:19Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
_라운드: 3_
