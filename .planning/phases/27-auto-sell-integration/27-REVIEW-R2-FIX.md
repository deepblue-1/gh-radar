---
phase: 27-auto-sell-integration
review: 27-REVIEW-R2.md
fixed_at: 2026-10-10T03:30:00Z
review_path: .planning/phases/27-auto-sell-integration/27-REVIEW-R2.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 27: 코드 리뷰 수정 보고서 — 2라운드

**수정 시각:** 2026-10-10T03:30:00Z
**원본 리뷰:** `.planning/phases/27-auto-sell-integration/27-REVIEW-R2.md`
**반복:** 1

**요약:**
- 범위 안 지적: 2건 (Warning 2 — WR-R2-01 · WR-R2-02)
- 수정: 2건
- 건너뜀: 0건
- 범위 밖: Info 4건 (IN-R2-01 ~ IN-R2-04, `fix_scope: critical_warning`)

## 설계 — 두 지적을 한 구조로 묶었다

두 Warning은 뿌리가 같다. WR-03 수정 뒤 41 「미반영」(`autoSellUnacked` + 근거 `autoSellTimedOutRef`)을 거두는 경로가 「기대 전이 · 다음 41 전송 · 키 변경」 셋뿐이었다. 그래서 서버가 실제로 답했거나(늦은 거부) 41이 더는 의미가 없어진 경우(전략 삭제 · 자동매도 끄기)에도 「미반영」이 남았다.

수정 방향은 패치 두 개를 따로 붙이는 대신 다음과 같이 잡았다.

- **해제 함수를 하나로 모았다.** `clearAutoSellUnacked()`가 근거 ref와 표시 state를 함께 내린다. 41 「미반영」을 내리는 곳은 이 함수 하나뿐이다. 이전에 흩어져 있던 4곳(키 변경 리셋 · `settleAutoSell` · 대기 중 거부 · 다음 41 전송)도 이 함수로 옮겼다.
- **부르는 조건은 두 종류로만 정의했다.** (1) 서버가 41에 답했다: 기대 전이, 거부(3초 안이든 뒤든). (2) 41이 더는 의미가 없다: 키 변경, 전략 삭제, 자동매도 켜짐 → 꺼짐 전이, 다음 41 전송.
- **그 키의 아무 에코로는 여전히 부르지 않는다.** WR-03 불변식(300ms 런타임 푸시와 lc.set 에코는 41의 답이 아니다)을 지킨다.

그대로 유지한 불변식은 다음과 같다. 낙관 반영 없음, 재전송 없음, 3초 무응답이면 「미반영」 + 버튼 해제 + error 로그 1줄, 기대 전이로 해제, 41이 lc.set · lc.arm 응답 채널(`unacked` · `answerSeq`)을 건드리지 않음(WR-01).

## 수정한 지적

### WR-R2-01: 3초 뒤에 온 41 거부가 「미반영」을 거두지 않는다

**수정한 파일:** `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`
**커밋:** b9e03bed
**적용한 수정:**
- 54 스트림 이펙트에 `lateAutoSellAnswer`를 더했다. 조건은 `autoSellCmdRef.current === null ∧ autoSellTimedOutRef.current !== null ∧ isAutoSellCommandRejection(...)`이다. 대기 중 답(`autoSellAnswer`)과 OR한 `autoSellReply` 하나로 표시 가드, 해제, 상태줄 가드(`level !== "error" && !armAnswer && !autoSellReply`)를 처리한다. 그래서 대기 중 거부와 같은 표시 경로를 탄다.
- `setAutoSellCmd(null)`은 대기 중 답일 때만 부른다. 「미반영」 해제는 두 경우 모두 `clearAutoSellUnacked()`로 한다. `acceptAnswer`는 부르지 않는다(WR-01 유지).
- relay 출처 늦은 거부(`src:"Relay"`, `kind:"autosell.cmd"`, i "")는 `mine`이 false다. 그래도 `autoSellReply`로 원문 로그 줄과 상태줄이 선다. 다른 요청의 relay 거부(`kind:"lc.set"` 등)는 `isAutoSellCommandRejection`이 이미 거르므로 41 「미반영」을 거두지 않는다.
- 판정 범위: 늦은 창은 `autoSellTimedOutRef`가 서 있는 동안이다. relay 거부(i "")는 이 동안 다른 카드의 41 relay 거부도 받는다. 이 오판은 대기 중 창과 같은 방향이다. 「미반영」이 일찍 거둬질 뿐이고, 거짓 「미반영」은 만들지 않는다. 한 번 받으면 ref가 비므로 같은 일이 반복되지 않는다.
- 회귀 테스트 3건(fake timers):
  - 3초 뒤 늦은 `AutoSellCommand` ERROR가 오면 `card-unacked`는 null이고 `card-server-error`에 거부 원문만 선다. 로그 줄이 남고, 공용 `unacked`는 false이며, 30초 뒤에도 재전송 0건이다.
  - 3초 뒤 늦은 relay 41 거부(`kind:"autosell.cmd"`)가 오면 원문 로그 · 상태줄이 서고 「미반영」이 해제된다.
  - 음성 대조: 3초 뒤 `kind:"lc.set"` relay 거부가 와도 41 「미반영」은 유지된다.
- 수정 전 소스(HEAD)로 돌려 실행해서 양성 테스트 2건이 실패하는 것을 확인한 뒤 되돌렸다.

### WR-R2-02: 41 무응답 「미반영」이 전략 삭제나 자동매도 끄기 뒤에도 영구히 남는다

**수정한 파일:** `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`
**커밋:** 0948efe5
**적용한 수정:**
- **전략 삭제:** 에코 이펙트의 삭제 갈래(`server === null ∧ prev !== null`)에서 `acceptAnswer()` 다음에 `clearAutoSellUnacked()`를 부른다. 삭제되면 `autoSellButtonsOf(null)`이 두 버튼을 다 막아서 사용자가 다시 눌러 걷어낼 수도 없으므로 이 해제가 필요하다.
- **자동매도 끄기:** 같은 이펙트에서 `prev.autoSellEnabled && !server.autoSellEnabled`(켜짐 → 꺼짐 **전이**)일 때 `clearAutoSellUnacked()`를 부른다. 이 검사는 `prev`를 소유한 이 이펙트에서, 런타임 전용 조기 반환보다 먼저 한다.
- **리뷰 제안과 다르게 한 점:** 리뷰는 `settleAutoSell`에서 `!echo.autoSellEnabled`라는 **상태**로 거두자고 제안했다. 그런데 `autoSellButtonsOf`는 `autoSellState`만 보기 때문에 자동매도가 꺼진 채로도 바로시작을 누를 수 있다. 그 41이 무응답이면, 꺼진 채인 다음 에코(다른 그룹 lc.set 에코나 런타임 푸시)가 곧바로 「미반영」을 지운다. 이것은 WR-03이 막은 「아무 에코로나 지워짐」이 다시 생기는 것이다. 그래서 **전이**로 판정했다. `crud:"D"` 철거 에코는 `server`를 null로 만들므로 위 삭제 갈래가 받는다.
- 회귀 테스트 3건(fake timers):
  - 무응답 바로시작 뒤 철거(`limitChasers: []` + `crud:"D"` 에코, 기대 전이 아님)가 오면 `card-unacked`는 null이다. 30초 뒤에도 재전송 0건이다.
  - 무응답 바로시작 뒤 `autoSellEnabled:false` 에코가 오면 `card-unacked`는 null이다.
  - 음성 대조: 꺼진 채(enabled false · state 0) 누른 바로시작의 무응답은 꺼진 채인 다른 그룹 lc.set 에코가 와도 「미반영」이 유지된다.
- 수정 전 소스(WR-R2-01 커밋 시점)로 돌려 실행해서 양성 테스트 2건이 실패하는 것을 확인한 뒤 되돌렸다.
- **리뷰 3번 사례(41을 모르는 옛 서버, 켜진 채 무응답)는 의도적으로 남겼다.** 리뷰가 대안으로 든 「수명 제한」은 서버가 아무 말도 하지 않았는데 시간이 지나면 「미반영」을 조용히 지우는 방식이다. 이 파일의 규율(`isAutoSellCommandSettled` 주석: 「아무 에코에나 풀면 3초 『미반영』이 조용히 사라진다」)에 어긋나므로 채택하지 않았다. 「미반영」은 다시 누르거나(버튼은 풀려 있다), 자동매도를 끄거나, 전략을 지우거나, 키가 바뀌면 거둬진다. 실패 사실은 error 로그 줄이 영속으로 남긴다. 이 판단은 코드 주석에도 적었다.
- **사람 확인 필요(논리 수정):** 「켜짐 → 꺼짐 전이」를 41이 무의미해지는 수평선으로 본 판단이 gh-trade의 바로시작 · 중지 의미와 맞는지 확인이 필요하다. 예를 들어 서버가 완료(상태 4)에서 enabled를 내리는 경우도 같은 해제로 읽힌다. 다만 그 경우도 41의 결과가 이미 지나간 뒤라서 해제하는 것이 맞다고 판단했다.

## 검증

- **실행 위치: main checkout**(`/Users/alex/repos/gh-radar`, master). `workflow.use_worktrees`는 true였다. 하지만 호출자가 같은 working tree에서 Phase 29 세션이 동시에 커밋 중이므로 내가 바꾼 파일만 경로를 지정해 커밋하라고 지시했다. 또 격리 worktree에는 `node_modules`가 없어 아래 게이트를 돌릴 수 없다. 그래서 worktree를 만들지 않았고, 정리할 sentinel이나 임시 브랜치도 없다. 아래 수치는 main checkout에서 재현할 수 있다.
- 커밋마다 다음 두 게이트가 모두 통과했다.
  - `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/__tests__/strategy-card.test.tsx`: 수정 전 106 → WR-R2-01 뒤 109 → WR-R2-02 뒤 **112 passed**
  - `pnpm --filter @gh-radar/webapp run typecheck`(`tsc --noEmit && tsc -p tsconfig.e2e.json`): 통과
- 각 커밋은 `strategy-card.tsx`와 `strategy-card-flow.test.tsx` 두 파일만 경로 지정으로 담았다. 무관한 수정 파일(`relay/tests/*`, `tasks/lessons.md`)은 건드리지 않았다. push와 배포는 하지 않았다.

---

_수정 시각: 2026-10-10T03:30:00Z_
_수정자: Claude (gsd-code-fixer)_
_반복: 1_
