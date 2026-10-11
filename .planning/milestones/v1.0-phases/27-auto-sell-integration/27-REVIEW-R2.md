---
phase: 27-auto-sell-integration
round: 2
reviewed: 2026-10-10T02:34:45Z
depth: standard
review_base: 3048cc54
review_head: e303c4eb
files_reviewed: 21
files_reviewed_list:
  - packages/shared/src/__tests__/strategy-event-labels.test.ts
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - relay/tests/ws-autosell.test.ts
  - relay/tests/ws-latch.test.ts
  - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/latch-led.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/card/constants.ts
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/latch-led.tsx
  - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/lib/lc-ranges.ts
  - webapp/src/lib/limit-chaser.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 27: 코드 리뷰 보고서 — 2라운드

**리뷰 시각:** 2026-10-10T02:34:45Z
**깊이:** standard
**리뷰한 파일:** 21개
**상태:** issues_found

## 요약

1라운드 뒤에 들어온 `fix(27)` 커밋 12건을 대상으로 했다(WR-01~05, IN-01~06, IN-04 재판정 `4f0d1c86`). 각 커밋의 diff(`git show <sha>`)와 현재 코드를 대조했다. Phase 28·29가 같은 파일을 나중에 고친 부분(`/me` S1 묶음 카드 레이아웃, fanout 29-16 세션 선택 등)도 현재 코드 그대로 읽었다. 다만 이번 라운드의 결함으로 잡은 것은 수정 커밋이 만든 것만이다.

검증: 바뀐 webapp 테스트 4파일(strategy-card-flow, limit-chaser-defaults, limit-chaser, latch-led)을 main checkout에서 돌렸고 258건 모두 통과했다.

### 1라운드 지적 종결 여부

| ID | 판정 | 근거 |
|----|------|------|
| WR-01 | **닫힘** | 41 거부 경로가 `acceptAnswer`를 부르지 않는다(`strategy-card.tsx:709-715`). 3초 무응답은 전용 `autoSellUnacked`만 세운다(:832-842). 폼 훅에는 `unacked`만 넘어간다. 단, arm 채널을 거쳐 다시 들어오는 경로가 남아 있다(IN-R2-01). |
| WR-02 | **닫힘** | 키별 `server` 이펙트가 같은 `settleAutoSell`로 41 대기를 푼다(:562-565). |
| WR-03 | **닫힘, 회귀 2건** | 아무 에코로나 지워지던 문제와 무로그 문제는 해결됐다. 대신 「미반영」이 거둬지는 경로가 너무 좁아져서 영구히 남는 경우가 생겼다(WR-R2-01, WR-R2-02). |
| WR-04 | **닫힘** | `isServerMessageForStrategy`가 표시 판정에 i·a 축을 더했다(`limit-chaser.ts:798-805`, `strategy-card.tsx:700`). |
| WR-05 | **닫힘** | 실패에 시도한 값을 같이 저장한다. 84가 그 값을 싣고 오면 실패를 거둔다(`limit-chaser-defaults.tsx:399-407`). |
| IN-01 | **41은 닫힘** | relay 거부 10곳 모두 `kind`에 출처를 싣는다. `isAutoSellCommandRejection`은 `autosell.cmd` 또는 빈 값만 받는다. `isLimitChaserArmRejection`은 태그를 아직 보지 않는다(IN-R2-01). |
| IN-02 | **닫힘, 잔여 1건** | 11칸 전부를 검사한다. 위반 칸이 2개 이상이면 저장할 방법이 없어지는 교착이 남는다(IN-R2-02). |
| IN-03 | **주석으로 명시(허용)** | `limit-chaser-defaults.tsx:418-425` |
| IN-04 | **재판정 후 닫힘** | LED는 WinForms `ledAutoSell` 동형이다(기준가격 > 0이면 꼬리 · 기준 0은 「상한가」). 낱말은 shared `autoSellBasisLabel` 하나로 모았다. 동작은 원래 LED와 같다. |
| IN-05 | **지적 범위는 닫힘** | `lib/limit-chaser.ts`에서 `lc-fields` import가 사라졌다. `fitsLcRange`의 판정 결과가 이전과 같은지 9칸 모두 대조했고 같다. 다만 fix 보고서의 불변식 주장은 사실과 다르다(IN-R2-04). |
| IN-06 | **닫힘** | relay zod·superRefine과 webapp `lc-ranges`가 `LC_AUTO_SELL_RANGES`를 읽는다. 메시지 문자열도 이전과 같다. |

Critical은 없다. Warning 2건은 같은 뿌리다. WR-03이 41 「미반영」(`autoSellUnacked`)을 아무 에코로나 지워지지 않게 만들면서, 거두는 경로를 「기대 전이 · 다음 41 전송 · 키 변경」 셋으로 좁혔다. 그런데 서버가 실제로 답했거나 상황이 바뀌어 41이 무의미해진 경우가 이 셋에 들어 있지 않다. 그 경우 상태줄은 「미반영 · 서버 응답을 기다리고 있어요」를 계속 보인다. 수정 전에는 공용 `unacked`가 다음 에코에 지워졌기 때문에 이런 일이 없었다. 따라서 이번 수정이 만든 회귀다.

## Warnings

### WR-R2-01: 3초 뒤에 온 41 거부가 「미반영」을 거두지 않는다 — 거부 원문과 「응답을 기다리고 있어요」가 동시에 선다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:696-697`, `:709-715`, `:721-722`, `:832-842`

**문제:** 41 거부 판정(`autoSellAnswer`)은 `autoSellCmdRef.current !== null`일 때, 즉 3초 창 안에서만 묻는다. 3초 무응답 타이머가 먼저 발화하면 `autoSellCmdRef`는 null이 되고, `autoSellTimedOutRef`에 action이 남고, `autoSellUnacked`는 true가 된다. 그 뒤 서버의 41 거부(`src:"AutoSellCommand"`, i·a 일치, ERROR, 예: 「보유수량 0」)가 늦게 도착하면 다음과 같이 처리된다.

- `autoSellAnswer`는 false다(창이 이미 닫혔다).
- `mine`(`isLimitChaserServerMessage ∧ isServerMessageForStrategy`)은 참이다. 그래서 로그 줄이 남고 `setLastError`로 상태줄에 거부 원문이 선다.
- `autoSellTimedOutRef`와 `autoSellUnacked`를 내리는 곳은 이 경로에 없다.

그 결과 상태줄(`CardNotices`)에 「자동매도 바로시작 거부 — 보유수량 0」과 「미반영 · 서버 응답을 기다리고 있어요」가 **동시에** 선다. 같은 파일 :723-726 주석이 「안 거두면 상태줄 한 줄이 『응답을 기다리고 있어요』와 『이래서 거부됐습니다』를 동시에 말한다」며 금지한 바로 그 모순이다. 이 「미반영」은 다음 41 전송이나 키 변경 전까지 사라지지 않는다.

수정 전(1라운드 시점)에는 공용 `unacked`가 그 키의 다음 런타임 에코에 바로 지워졌기 때문에 이 상태가 오래 남지 않았다. 41 응답이 3초를 넘는 경우는 이 프로젝트에서 실제로 관측된 네트워크 정지(터널 정지, 서울 엣지 주기 끊김)에서 생길 수 있다. relay 거부(`kind:"autosell.cmd"`)가 늦게 오는 경우도 같은 결과다. 이때는 `mine`이 false라서 원문 줄조차 서지 않는다.

**수정:** 무응답으로 끝난 41에도 같은 거부 판정을 적용해서 「미반영」을 거둔다. 대기 중 거부와 같은 표시 경로를 타게 한다.

```tsx
const autoSellAnswer =
  autoSellCmdRef.current !== null && isAutoSellCommandRejection(msg, isin, accountNo);
// 3초 뒤에 온 41 거부 — 서버는 답했다. 「미반영」을 거두고 원문을 세운다(재전송 없음).
const lateAutoSellAnswer =
  autoSellCmdRef.current === null &&
  autoSellTimedOutRef.current !== null &&
  isAutoSellCommandRejection(msg, isin, accountNo);
const autoSellReply = autoSellAnswer || lateAutoSellAnswer;
...
if (!armAnswer && !autoSellReply && !mine) continue;
...
if (autoSellReply) {
  if (autoSellAnswer) setAutoSellCmd(null);
  autoSellTimedOutRef.current = null;
  setAutoSellUnacked(false);
}
...
if (level !== "error" && !armAnswer && !autoSellReply) continue;
```

테스트도 하나 더한다. 「press start → 3초 경과 → AutoSellCommand ERROR 도착」에서 `card-unacked`가 null이고 `card-server-error`가 서는지 단언한다.

### WR-R2-02: 41 무응답 「미반영」이 전략 삭제나 자동매도 끄기 뒤에도 영구히 남는다 — 버튼이 잠겨 사용자가 걷어낼 수도 없다

**파일:** `webapp/src/components/trading/card/strategy-card.tsx:537-548`(`settleAutoSell`), `:570-582`(삭제 갈래), `:484-497`(키 변경 리셋), `webapp/src/lib/limit-chaser.ts:1008-1012`(`autoSellButtonsOf`)

**문제:** `autoSellUnacked`를 거두는 경로는 셋뿐이다. (a) 무응답으로 끝난 action의 기대 전이(start면 상태 3 ∧ enabled, stop이면 !enabled), (b) 다음 41 전송, (c) 키 변경. 다음 경우는 셋 중 어디에도 해당하지 않는다.

1. **전략 삭제.** 무응답 바로시작 뒤 사용자가 게이트를 모두 꺼서 전략을 지우면 `server`는 null이 된다. 삭제 갈래(:571-582)는 `acceptAnswer()`로 공용 `unacked`만 내리고, `autoSellUnacked`는 손대지 않는다. 철거 에코가 「상태 3 ∧ enabled」를 실을 리 없으므로 (a)도 일어나지 않는다. `autoSellButtonsOf(null)`은 두 버튼을 모두 막으므로 (b)도 불가능하다. 키(isin:계좌:거래소)도 그대로라서 (c)도 없다. 결국 빈 카드에 「미반영 · 서버 응답을 기다리고 있어요」가 거래소를 바꾸거나 카드를 다시 마운트할 때까지 남는다.
2. **자동매도 끄기.** 무응답 바로시작 뒤 폼에서 자동매도 스위치를 끄면 lc.set 에코는 `autoSellEnabled:false`이고 lc.set 자체는 성공한다. 하지만 start의 기대 전이는 영원히 오지 않으므로 「미반영」이 남는다. 폼 커밋은 성공 플래시를 보이는데 카드는 「응답을 기다리고 있어요」라고 말한다.
3. **41을 모르는 옛 서버(127).** 바로시작이 항상 무응답이다. 그 뒤 lc.set 에코가 몇 번 성공해도 「미반영」은 다시 누르기 전까지 남는다. 1라운드 fix 보고서는 이 경우 「미반영과 로그 한 줄이 남아야 한다」고 했다. 하지만 기한 없이 남는 것은 의도와 다르다. 실패 사실은 이미 error 로그 줄이 영속으로 기록하므로 PC-7(무로그 fail-safe 금지)도 충족된다.

이 문구는 lc.set의 「미반영」과 같은 문구라서, 사용자는 지금 무엇이 응답을 기다리는지 가를 수 없다.

**수정:** 41이 더는 의미가 없어지는 전이에서도 거둔다.

```tsx
const clearAutoSellTimeout = () => {
  autoSellTimedOutRef.current = null;
  setAutoSellUnacked(false);
};

const settleAutoSell = useCallback((echo: RelayLimitChaser) => {
  const pending = autoSellCmdRef.current;
  if (pending !== null && isAutoSellCommandSettled(pending, echo)) setAutoSellCmd(null);
  const timedOut = autoSellTimedOutRef.current;
  if (timedOut === null) return;
  // 기대 전이(늦은 성공) 또는 그 action 이 더는 의미 없는 상태(자동매도 꺼짐 · 철거 에코) — 기다릴 답이 없다.
  if (isAutoSellCommandSettled(timedOut, echo) || !echo.autoSellEnabled || echo.crud === "D") {
    clearAutoSellTimeout();
  }
}, [setAutoSellCmd]);

// 삭제 갈래(:571-)
if (server === null) {
  if (prev !== null) {
    ...
    acceptAnswer();
    autoSellTimedOutRef.current = null;
    setAutoSellUnacked(false);
    ...
  }
  return;
}
```

또는 41 「미반영」의 수명을 제한해도 된다. 실패 사실은 error 로그 줄이 영속으로 남기기 때문이다. 테스트로는 「무응답 start → 철거 에코(server null)」와 「무응답 start → autoSellEnabled:false 에코」에서 `card-unacked`가 null인지 단언한다.

## Info

### IN-R2-01: `isLimitChaserArmRejection`이 relay 출처 태그를 보지 않는다 — arm 채널로 WR-01 오염이 다시 들어온다

**파일:** `webapp/src/lib/limit-chaser.ts:931`, `webapp/src/components/trading/card/strategy-card.tsx:690-691`, `:704-708`

**문제:** IN-01 수정으로 relay 거부에 `kind`(거부된 인바운드 `t`)가 실린다. 그런데 arm 판정의 `Relay` 갈래는 아직 모양(i 빈 · a 빈 또는 이 계좌)만 본다. 그래서 다음 두 일이 생긴다.

- 카드 B의 LED arm이 진행 중일 때 카드 A의 41 relay 거부(`kind:"autosell.cmd"`)나 lc.set 조립·송신 실패(`kind:"lc.set"`, i "")가 오면, B는 그 문구를 자기 arm의 거부로 읽는다. 로그 줄과 상태줄 빨간 줄이 B에 선다.
- 같은 카드에서 arm·41·다른 그룹 lc.set이 동시에 진행 중이면, 41 relay 거부가 `armAnswer`로 잡혀 `acceptAnswer()`가 `answerSeq`를 올린다. 그러면 진행 중인 lc.set이 거짓 「반영 안 됨」으로 떨어진다. WR-01이 막은 오염이 arm 채널을 거쳐 다시 들어오는 것이다.

동시에 진행 중이어야 하는 조건이 겹쳐서 실제로 닿기는 드물다. fix 보고서도 범위 밖으로 남겼다고 적었다. 이제 태그가 있어 고치기는 한 줄이다.

**수정:** `if (msg.src === 'Relay') { if (msg.kind !== 'lc.arm' && msg.kind !== '') return false; return msg.i === '' && (msg.a === '' || msg.a === accountNo); }`. 같은 김에 lc.set relay 거부(`kind:"lc.set"`)를 `isLimitChaserSetRejection`의 답으로 받을지도 검토할 만하다. 지금은 relay가 사유를 이미 말했는데도 lc.set이 3초 「미반영」 → 타임아웃 경로를 탄다.

### IN-R2-02: `/me` 42 — 84 캐시에 범위 밖 칸이 2개 이상이면 어떤 행도 저장할 수 없다(교착)

**파일:** `webapp/src/components/me/limit-chaser-defaults.tsx:186-192`, `:313-318`

**문제:** `userSettingsValuesIssue`는 11칸 전부를 보고 첫 위반 칸 하나만 보고한다. 캐시에 위반 칸 X·Y가 있으면 다음처럼 막힌다.

- X를 고쳐도 Y 때문에 `invalid`가 된다.
- Y를 고쳐도 X 때문에 `invalid`가 된다.
- 다른 행도 모두 `invalid`다.

결국 UI 안에서는 빠져나갈 길이 없다. 자동매도 4칸(`autoSellPeriodSec` · `auctionSellRatioPct` · `autoSellRatioDefaultPct` · `autoSellMethodDefault`)은 모두 min 1이다. 그래서 필드가 빠진 84가 0으로 채워지는 경로가 생기면 4칸이 한꺼번에 위반이 된다. 현재 서버는 범위 밖 행을 저장소 로드에서 버리므로 닿을 가능성은 낮다. 그리고 수정 전 동작(소켓 4400 종료)보다는 확실히 낫다.

**수정:** 근본 수정은 relay `user.settings.set`의 범위 위반을 소켓 종료(`#reject`)가 아니라 `rejectFrame(kind:"user.settings.set")`로 답하는 것이다. 그러면 웹이 보내고 서버나 relay가 사유를 말하게 할 수 있다. 최소 수정으로는 위반 칸을 전부 나열하는 문구로 바꿔 사용자가 상황을 알게 한다.

### IN-R2-03: `lc-ranges.ts` 머리 주석의 「런타임 import 가 없다」가 IN-06 뒤로 사실과 다르다

**파일:** `webapp/src/lib/lc-ranges.ts:6`, `:28`

**문제:** IN-05에서 「이 모듈은 런타임 import 가 없다」고 적었다. 그런데 바로 다음 커밋 IN-06(`a652152b`)이 `import { LC_AUTO_SELL_RANGES } from '@gh-radar/shared'`(런타임)를 더했다. 외부 패키지라서 순환은 없다. 다만 「순수 상수 모듈」의 근거로 든 문장이 틀렸으므로, 다음 사람이 이 모듈에 `@/lib/limit-chaser` 값 import를 더해도 된다고 오판할 수 있다.

**수정:** 「`@/` 앱 모듈을 런타임 import 하지 않는다(shared 패키지 상수만 읽는다)」로 고친다.

### IN-R2-04: IN-05 fix 보고서의 「lib → components 런타임 import 없음」 불변식이 사실과 다르다

**파일:** `webapp/src/lib/strategy-log-feed.tsx:33-39`

**문제:** `27-REVIEW-FIX-R2.md`는 「이제 `webapp/src/lib` 에서 `@/components` 를 런타임 import 하는 곳은 없다. 남은 것은 `trading-alerts.ts` 의 `import type` 하나뿐」이라고 적었다. 그런데 `lib/strategy-log-feed.tsx`는 `@/components/trading/strategy-log`에서 `isRuntimeOnlyEcho` · `serverMessageLogLine` · `strategyLogLine` 등 **값**을 런타임 import 한다(Phase 24부터 있던 코드). 지금은 `strategy-log.tsx`가 `@/lib/utils`만 가져와서 순환은 없다. 결함 자체는 이번 수정이 만든 것이 아니다. 하지만 종결 근거로 쓴 문장이 틀려서, IN-05가 막으려던 같은 종류의 계층 역전이 남아 있다는 사실이 기록에서 빠졌다.

**수정:** 판정 함수(`isRuntimeOnlyEcho` · `strategyLogLine` · `serverMessageLogLine`)를 `lib/`로 내리거나, 최소한 fix 보고서의 문장을 정정한다.

---

_리뷰 시각: 2026-10-10T02:34:45Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
_라운드: 2_
