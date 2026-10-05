---
phase: 27-auto-sell-integration
reviewed: 2026-10-05T08:25:33Z
depth: standard
review_base: 465e7372
review_head: 78486f1b
files_reviewed: 28
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/strategy-display.ts
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/strategy-event.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/latch-led.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/numpad.ts
  - webapp/src/lib/order-log-feed.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 27: 코드 리뷰 보고서

**리뷰 시각:** 2026-10-05T08:25:33Z
**깊이:** standard
**리뷰한 파일:** 28개
**상태:** issues_found

## 요약

배포본(`78486f1b`) 기준으로 Phase 27 변경(`git diff 465e7372 78486f1b`)만 봤다. 워킹 트리에 있는 Phase 28 미커밋 편집과 `86cc9148`(85 LimitFeature · kind 15)는 범위에서 뺐다. 서버 계약은 gh-trade master의 `Gateway::ProcessAutoSellCommandReq`, `LimitChaser::ForceAutoSellStart`, `UserSettingsStore.h::ValidateUserSettings`와 직접 대조했다.

잘 맞는 부분:

- **와이어**: relay의 schema 4 파생(필드 존재로 단조 파생), S→C 전용 4필드 제외, `extraBuyBurstRelease`의 `>=` 수정은 서버 계약과 맞는다.
- **84 처리**: 84 캐시(Ready 전에는 캐시만 하고 인증 직후 재생)와 43 요청 시점이 맞다.
- **41 판정**: 성공 판정(Start면 상태 3 ∧ enabled, Stop이면 !enabled)이 서버 실제 동작과 일치한다. `ForceAutoSellStart`는 상태를 Selling으로 바꾸고 `PushLimitChaserEcho`로 즉시 에코한다.
- **42 범위**: `USER_SETTINGS_RANGES`가 서버 `ValidateUserSettings`와 같다.
- **조립기**: kind 11~14 칸 재해석이 서버의 `AutoSellEventFields` 채움과 맞는다.

Critical로 올릴 결함(잘못된 주문, 데이터 손실)은 찾지 못했다. Warning 5건 중 셋은 같은 뿌리다. **41(바로시작·중지) 대기 상태가 lc.set 응답 채널을 같이 쓰고 있다.** 그래서 41의 거부·무응답이 다른 그룹의 lc.set 판정을 오염시키고(WR-01), 41 해제가 단일 슬롯 에코에 묶여 있으며(WR-02), 41의 「미반영」이 상관없는 에코로 지워진다(WR-03). 나머지 둘은 카드 간 54 줄 혼입(WR-04)과 `/me` 실패 표시가 남는 문제(WR-05)다.

## Warnings

### WR-01: 41의 거부·무응답이 다른 그룹 lc.set의 진행 판정을 오염시킨다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:663-667`, `:782-789` (소비처 `webapp/src/components/trading/lc/use-lc-field-commit.ts:905`, `:917`, `:745`)

**문제:**

1. **거부 경로.** 41 거부 54(`AutoSellCommand`·`Account`·`Relay`)가 오면 `acceptAnswer()`를 부른다. 이 함수는 lc.set 공용 신호인 `answerSeq`를 올리고 공용 `ackTimer`를 끈다. 이때 다른 그룹(예: 매도주문 가격)의 lc.set이 진행 중이면 커밋 훅은 `answered === true ∧ matches === false ∧ rejectSeq 불변`으로 보고 `failInflight(inf, 'rejected')`로 떨어진다(use-lc-field-commit.ts:917). 그 결과:
   - 진행 중이던 필드에 거짓 「반영 안 됨」이 붙는다.
   - 토글이었다면 낙관 표시가 되돌려진다(`revertToggle`).
   - 대기열이 `failQueue('rejected')`로 **보내지지 않고 실패 처리된다**(:745).

   D-07은 「다른 그룹의 확정 상태는 무관」이라 다른 그룹 lc.set이 진행 중일 때도 바로시작을 누를 수 있다. 서버의 41 거부 중 「보유수량 0」이 흔하므로 실제로 닿을 수 있는 경로다.
2. **3초 무응답 경로.** 41 타이머는 공용 `setUnacked(true)`를 세운다(:787). 커밋 훅은 `unacked`가 참이면 진행 중인 lc.set을 `failInflight(inf, 'timeout')`으로 끝낸다(:905). 41만 늦었는데 lc.set이 타임아웃 처리되고 고아 장벽도 생긴다. 41을 모르는 옛 서버(127, 미배포)에서는 바로시작이 **항상** 이 경로를 탄다.

**수정:** 41은 lc.set 응답 채널과 분리한다. 거부 답은 41 대기만 풀고, 「미반영」은 41 전용 상태로 둔다.

```tsx
// strategy-card.tsx
const [autoSellUnacked, setAutoSellUnacked] = useState(false);
...
if (autoSellAnswer) {
  setAutoSellCmd(null);
  setAutoSellUnacked(false);
  // acceptAnswer() 를 부르지 않는다 — answerSeq/ackTimer 는 lc.set · lc.arm 전용
}
...
autoSellCmdTimer.current = window.setTimeout(() => {
  autoSellCmdTimer.current = null;
  autoSellCmdRef.current = null;
  setAutoSellPending(null);
  setAutoSellUnacked(true);   // 공용 setUnacked 금지
}, ACK_TIMEOUT_MS);
// 상태줄은 unacked || autoSellUnacked 로 그리고, 커밋 훅에는 unacked 만 넘긴다.
```

### WR-02: 41 해제가 단일 슬롯 `lastLimitChaserEcho`에만 묶여, 같은 렌더 배치에 들어온 다른 키의 에코에 가려진다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:515-521`

**문제:** 41 해제 이펙트는 `lastLimitChaserEcho`(리듀서가 매 `lc` 프레임마다 덮어쓰는 단일 값)만 본다. 작업대에 카드가 여럿이면 서버 300ms 플러시 틱에 여러 키의 60 에코가 연달아 온다. 그러면 내 41 즉답 에코(상태 3) 바로 뒤에 다른 키의 에코가 같은 React 배치에 들어올 수 있다. 이때 이펙트는 마지막 값(남의 키)만 보고 `key` 불일치로 return 한다. 그 결과:

- 서버는 이미 매도중인데 3초 뒤 거짓 「미반영」이 선다.
- 그 무응답이 WR-01 경로로 진행 중인 lc.set까지 실패시킨다.

카드에는 키별 정본인 `server`(`limitChasers`에서 뽑은 값)가 이미 있는데 해제 판정에 쓰지 않는다.

**수정:** 키별 `server`로도 해제한다(41 Start·Stop의 기대 전이는 등록 목록에 그대로 드러난다).

```tsx
useEffect(() => {
  const pending = autoSellCmdRef.current;
  if (pending === null || server === null) return;
  if (isAutoSellCommandSettled(pending, server)) setAutoSellCmd(null);
}, [server, setAutoSellCmd]);
```

### WR-03: 41 무응답 「미반영」이 그 키의 아무 에코에나 지워진다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:503-508`, `:787`

**문제:** 41 타임아웃은 공용 `unacked`를 세운다. 그런데 키 일치 에코 이펙트(:503-508)는 **어떤 에코든** `acceptAnswer()`로 `unacked`를 내린다. 자동매도가 감시·매도 중이면 300ms 런타임 에코(누적·기준 변화)가 계속 오므로, 41 「미반영」은 길어야 한 틱 보이고 사라진다. ⑥ 주석은 「300ms 런타임 푸시가 41의 답으로 둔갑한다」를 막으려고 전용 타이머를 뒀지만, 표시 플래그는 여전히 공용이라 같은 둔갑이 표시 쪽에서 일어난다. 41 실패를 알리는 로그 줄도 없어서, 사용자는 바로시작이 먹지 않았다는 사실을 놓친다.

**수정:** WR-01의 전용 `autoSellUnacked`를 쓴다. 이 값은 41 기대 전이(WR-02의 `server` 판정), 41 거부, 또는 다음 41 전송에서만 내린다. 타임아웃 때 `pushLog('자동매도 바로시작/중지 — 서버 응답 없음', 'error')` 한 줄을 남긴다(PC-7 무로그 fail-safe 금지).

### WR-04: `AutoSell`·`AutoSellCommand` 54가 isin과 무관하게 모든 카드의 로그와 상태줄에 선다

**파일:** `webapp/src/lib/limit-chaser.ts:771-779`, `webapp/src/components/trading/card/strategy-card.tsx:657-674`

**문제:** `isLimitChaserServerMessage`에 `AutoSell`·`AutoSellCommand`를 넣었다. 그런데 카드의 54 루프는 전역 `messages`를 isin 필터 없이 `pushLog`하고, ERROR면 `setLastError`까지 한다. 작업대에서 카드 A의 바로시작이 「자동매도 바로시작 거부 — 보유수량 0」으로 거부되면 **열려 있는 모든 카드**의 상태줄에 빨간 거부가 선다. 자동매도 전이 INFO(「자동매도 감시 → 매도중」 등)도 다른 종목 카드 로그에 섞인다. 서버는 두 출처 모두 `i`(isin)·`a`(계좌)를 채워 보내므로 거를 근거가 있다. 이 구조는 원래 `SetLimitChaser`·`LimitChaser`에도 있었지만, 이번 phase가 「주기적으로 흐르는 자동매도 사유 줄」까지 같은 경로에 얹어 영향이 커졌다.

**수정:** 카드 표시용 판정에 키 축을 더한다. `i`가 비었으면 통과, 차 있으면 내 isin이어야 한다(계좌가 차 있으면 계좌도 본다).

```ts
const mine = msg.i === '' || (msg.i === isin && (msg.a === '' || msg.a === accountNo));
if (!armAnswer && !autoSellAnswer && !(isLimitChaserServerMessage(msg) && mine)) continue;
```

### WR-05: `/me` 행 실패 표시가 뒤늦게 온 84 성공에도 지워지지 않는다

**파일:** `webapp/src/components/me/limit-chaser-defaults.tsx:287-293`, `:336-356`, `:373`

**문제:** 42를 보낸 뒤 3초 안에 84가 없으면 그 행에 「반영되지 않았어요」가 박힌다. 그 뒤 84가 실제로 그 값을 싣고 오면(서버 저장 성공, 늦은 응답), 84 이펙트는 바뀐 행을 플래시만 하고 `failures`는 그대로 둔다. 화면은 저장된 새 값을 보이면서 동시에 빨간 링과 「반영되지 않았어요」 말풍선을 계속 보인다. 이 상태는 사용자가 그 행을 다시 확정할 때까지 남는다. 거부 경로의 빈 문자열 실패(:373)도 같은 식으로 남는다. 상따 카드는 「③ 늦은 에코」로 실패를 성공으로 뒤집는데, 이 섹션에는 그 대응이 없다.

**수정:** 실패에 시도한 값을 함께 저장하고, 84가 그 값을 실으면 실패를 거둔다.

```ts
// failures: Partial<Record<UserSettingsKey, { text: string; value: number }>>
for (const row of USER_SETTINGS_ROWS) {
  const f = failuresRef.current[row.key];
  if (f !== undefined && userSettings[row.key] === f.value) clearFailure(row.key);
}
```

## Info

### IN-01: 41 거부 판정의 `Relay` 갈래가 상관없는 relay 거부까지 41의 답으로 읽는다

**파일:** `webapp/src/lib/limit-chaser.ts:953`

**문제:** `src === 'Relay' ∧ i === '' ∧ (a === '' || a === 내 계좌)`는 41과 무관한 relay 거부도 받는다. 예를 들면 다른 카드 lc.set의 `#buildStrategyPayload` 실패나 `#onStrategySendFailed` 문구다. 41 대기 3초 창 안에 오면 41 대기가 풀리고 그 문구가 이 카드에 선다. lc.arm 판정(:906)에서 그대로 옮겨 온 구조다.

**수정:** relay 거부 프레임에 출처 `t`를 실어(예: `kind: "autosell.cmd"`) 정확히 일치할 때만 41의 답으로 본다. 또는 이 한계를 주석으로 명시한다.

### IN-02: `/me` 42 조립이 바꾼 1칸만 검증한다 — 나머지 10칸 범위 밖이면 소켓이 닫힌다

**파일:** `webapp/src/components/me/limit-chaser-defaults.tsx:272-276`

**문제:** 42 본문은 84 캐시 11값에 바꾼 1칸을 더해 만든다. 범위 검사는 바꾼 칸만 한다. relay zod는 11칸 전부를 `USER_SETTINGS_RANGES`로 보고, 위반이면 close(4400)로 앱 소켓 전체를 끊는다. 현재 서버는 저장소 로드와 42 모두에서 범위 밖 행을 버리므로 실제로 닿을 가능성은 낮다. 다만 마지막 방어선이 연결 전체를 끊는 구조다(상따 카드의 `lcRangeIssue`는 cfg 전체를 본다).

**수정:** `dispatchOne`에서 `s`의 11칸 전부를 `userSettingsRangeIssue`로 검사하고, 위반이면 보내지 않고 실패로 둔다.

### IN-03: 다른 탭의 42 거부가 이 탭의 진행 중 행에 귀속된다

**파일:** `webapp/src/components/me/limit-chaser-defaults.tsx:368-376`

**문제:** 54 `SetUserSettings`는 isin·계좌가 비어 있고, relay는 같은 사용자의 모든 탭으로 팬아웃한다. 두 탭이 거의 동시에 42를 보내면 한쪽의 거부 원문이 다른 쪽 진행 중 행에 빨간 줄로 선다. 주석의 「비행 밖(다른 탭) 거부는 줄을 세우지 않는다」는 진행 창 밖만 막는다. 실제로 닿을 가능성은 낮으므로 주석에 한계를 적어 둔다.

### IN-04: 기준 낱말 판정이 세 벌이고 서로 갈린다

**파일:** `webapp/src/components/trading/latch-led.tsx:139-143`, `webapp/src/components/trading/lc/lc-fields.ts:658-661`, `packages/shared/src/strategy-event-labels.ts` `autoSellBasisLabel`

**문제:** LED 툴팁은 `basis === 2 ? "매수가" : "상한가"`를 따로 구현했고 `KRW` 포매터도 새로 만든다. 카드 「기준」 행은 `basis === 0`이면 「—」를 보이고, LED는 basis 0이라도 basisPrice > 0이면 「기준 상한가 N원」을 보인다. 같은 에코를 두 표면이 다르게 말한다.

**수정:** LED도 shared `autoSellBasisLabel`과 `lcAutoSellBasisText`의 「—」 규칙(상태 0 · 기준 0 → 꼬리 없음)을 그대로 쓴다.

### IN-05: 계층 역전 — `lib/limit-chaser.ts`가 `components/.../lc-fields`를 런타임 import 한다

**파일:** `webapp/src/lib/limit-chaser.ts:50`

**문제:** 순수 로직 모듈(lib)이 UI 정의 모듈(components)의 `lcRowOfField`를 런타임으로 가져온다. 지금은 lc-fields가 lib에서 타입만 가져와 순환이 없지만, lc-fields가 lib의 값 하나만 import 해도 런타임 순환(초기화 순서 undefined)이 된다. `/me`(`limit-chaser-defaults.tsx`)가 `ACK_TIMEOUT_MS`·`LC_CONTAINER_CLASS`를 무거운 클라이언트 컴포넌트 모듈 `strategy-card.tsx`에서 가져오는 것도 같은 종류의 결합이다.

**수정:** 범위 표(`range`/`inputRange`/옵션 값)를 lib 쪽 상수 모듈로 내려 두 곳이 같이 읽게 한다. 공용 상수는 `lib/`(또는 `card/constants.ts`)로 옮긴다.

### IN-06: 자동매도 요청 범위(0~9 · 1~50 · 1~3)가 세 곳에 리터럴로 흩어져 있다

**파일:** `relay/src/ws/protocol.ts:238-242`, `:257-276`, `webapp/src/components/trading/lc/lc-fields.ts` 자동매도 행 `range`/`inputRange`, `webapp/src/lib/limit-chaser.ts` `autoSellButtonsOf` 주변

**문제:** 사용자 설정 범위는 `USER_SETTINGS_RANGES` 한 벌로 모았다. 그런데 lc.set의 자동매도 요청 범위(시작조건 0~9, 비율 1~50, 방법 1~3)는 relay zod, relay superRefine, webapp 행 정의에 각각 숫자로 적혀 있다. 한쪽만 고치면 웹이 통과시킨 cfg를 relay가 4400으로 끊는다.

**수정:** shared에 `LC_AUTO_SELL_RANGES`를 두고 relay와 webapp이 같이 읽는다.

---

_리뷰 시각: 2026-10-05T08:25:33Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
