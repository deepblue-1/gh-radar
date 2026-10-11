---
phase: 27-auto-sell-integration
fixed_at: 2026-10-05T08:52:47Z
review_path: .planning/phases/27-auto-sell-integration/27-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 27: 코드 리뷰 수정 보고서

**수정 시각:** 2026-10-05T08:52:47Z
**원본 리뷰:** .planning/phases/27-auto-sell-integration/27-REVIEW.md
**반복:** 1

**요약:**
- 범위 안 지적: 5건 (Warning 5 · `fix_scope: critical_warning` 이라 Info 6건은 범위 밖)
- 수정: 5건
- 건너뜀: 0건

리뷰 기준(`78486f1b`) 뒤에 들어온 Phase 28 커밋(`ae1fe66c` · `52da41a5` · `5ea22b16` 등)을 반영한 현재 코드를 다시 읽고 고쳤다. 지적 대상인 `strategy-card.tsx` · `limit-chaser.ts` · `limit-chaser-defaults.tsx` 의 해당 구조는 리뷰 때와 같았다. 줄 번호만 조금 밀려 있었다.

수정은 격리 worktree(`gsd-reviewfix/27-68440`)에서 했다. 그 사이 다른 세션이 master 에 `5ea22b16`(28-03, workers/limitup-sync · supabase · lockfile)과 `a854ae2d`(28-03 docs, .planning)를 커밋했다. 둘 다 이번에 고친 파일과 겹치지 않는다. 그래서 수정 커밋 5건을 master 위로 rebase 한 뒤 fast-forward 했다. 첫 fast-forward 시도는 `a854ae2d` 가 들어와 갈라져서 실패했고, 한 번 더 rebase 해서 성공했다. 아래 커밋 해시는 최종 master 의 값이다. push · 배포는 하지 않았다.

## Fixed Issues

### WR-01: 41의 거부·무응답이 다른 그룹 lc.set의 진행 판정을 오염시킨다

**Files modified:** `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/trading/__tests__/card-body.test.tsx`, `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`
**Commit:** def26175
**Applied fix:** 41 전용 `autoSellUnacked` 상태를 새로 두고 `StrategyCardState` 에 노출했다.
- 41 거부 경로는 더 이상 `acceptAnswer()` 를 부르지 않는다. 그래서 `answerSeq` · `ackTimer` 를 건드리지 않고, 41 대기와 `autoSellUnacked` 만 내린다.
- 41의 3초 타이머는 공용 `setUnacked(true)` 대신 `setAutoSellUnacked(true)` 를 세운다.
- 폼 커밋 훅에는 지금처럼 `unacked` 만 넘어간다. 카드 상태줄(`CardNotices`)은 `unacked || autoSellUnacked` 로 같은 「미반영」 문구를 그린다.
- 키가 바뀌거나 41을 다시 보내면 `autoSellUnacked` 를 내린다.

테스트 2건을 더했다. 41 거부 뒤에도 `answerSeq` 가 그대로인지, 41 무응답이 `unacked` 가 아니라 `autoSellUnacked` 만 세우는지(상태줄 「미반영」은 선다) 확인한다.

### WR-02: 41 해제가 단일 슬롯 `lastLimitChaserEcho`에만 묶여 다른 키 에코에 가려진다

**Files modified:** `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`
**Commit:** 1b08002a
**Applied fix:** 키별 정본인 `server`(`limitChasers` 에서 뽑은 값)가 바뀔 때도 `isAutoSellCommandSettled` 로 41 대기를 푸는 이펙트를 더했다. 기존 `lastLimitChaserEcho` 이펙트는 남겼다. `crud:"D"` 철거 에코는 `server` 를 null 로 두기 때문에 그 경우는 기존 이펙트만 볼 수 있다.

테스트를 하나 더했다. 내 상태 3 에코와 남의 키 런타임 에코가 같은 배치로 와서 단일 슬롯이 남의 키로 덮인 경우를 재현한다. 수정 전 코드에서는 실패하는 것을 확인했다.

### WR-03: 41 무응답 「미반영」이 그 키의 아무 에코에나 지워진다

**Files modified:** `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`
**Commit:** 5fd3b29a
**Applied fix:** WR-01 에서 표시 플래그를 따로 떼어 냈으므로, 키 일치 에코의 `acceptAnswer` 는 더 이상 41 「미반영」을 지우지 못한다.
- 무응답으로 끝난 action 을 `autoSellTimedOutRef` 에 기억한다. 두 해제 이펙트는 공용 `settleAutoSell(echo)` 로 묶었다. 「미반영」은 다음 셋에서만 내린다: 그 action 의 기대 전이가 늦게라도 보일 때, 다음 41 전송, 키 변경.
- 타임아웃 때 전략 로그에 error 줄을 하나 남긴다: `자동매도 바로시작 — 서버 응답 없음` 또는 `자동매도 중지 — 서버 응답 없음` (PC-7 무로그 fail-safe 금지).

테스트를 하나 더했다. 무응답이면 error 로그가 남는지, 같은 키의 런타임 에코(상태 2)에는 「미반영」이 유지되는지, 늦은 상태 3 에코에는 거둬지는지 확인한다.

### WR-04: `AutoSell`·`AutoSellCommand` 54가 isin과 무관하게 모든 카드의 로그와 상태줄에 선다

**Files modified:** `webapp/src/lib/limit-chaser.ts`, `webapp/src/components/trading/card/strategy-card.tsx`, `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`, `webapp/src/lib/__tests__/limit-chaser.test.ts`
**Commit:** 5d51b609
**Applied fix:** 판정을 한 곳에 두는 규율에 맞춰 lib 에 `isServerMessageForStrategy(msg, isin, accountNo)` 를 새로 두었다. 규칙은 `i` 가 비었으면 통과, 차 있으면 isin 이 같고 `a` 가 비었거나 계좌가 같을 때만 통과다. 카드 54 루프의 표시 판정을 `isLimitChaserServerMessage(msg) && isServerMessageForStrategy(...)` 로 좁혔다. 전 종목 피드(`strategy-log-feed`)는 지금처럼 전 종목을 그린다.

**동작 변경 1건:** 기존 테스트 `㉑-d` 는 「다른 계좌의 상따 거부 문구가 이 카드에 선다」를 기대했다. 리뷰가 지시한 계좌 축 규칙에 따라 이제는 문구도 서지 않는다. 그래서 테스트 기대를 고쳤다. 「미반영을 거두지 않는다」는 원래 단언은 그대로 유지한다. 테스트로 다른 종목 AutoSell/AutoSellCommand 줄이 이 카드에 서지 않는 경우와 헬퍼 단위 테스트를 더했다.

같은 종목 · 계좌의 KRX · NXT 두 카드는 54에 거래소가 없어 여전히 가르지 못한다. 이 한계는 주석에 적었다.

### WR-05: `/me` 행 실패 표시가 뒤늦게 온 84 성공에도 지워지지 않는다

**Files modified:** `webapp/src/components/me/limit-chaser-defaults.tsx`, `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx`
**Commit:** a901b8c5
**Applied fix:** 실패 상태를 내부적으로 `{ text, value }`(시도한 값 포함)로 바꿨다. 실패를 기록하는 네 곳 모두 시도한 값을 함께 기록한다: 끊김, 3초 무응답, 거부, 대기열 실패.
- 84 이펙트에서 `userSettings[key] === 시도한 값` 인 행의 실패를 거둔다.
- 렌더 계약 `failures: Partial<Record<Key, string>>` 는 `useMemo` 로 파생해서 그대로 유지했다.

테스트를 하나 더했다. 다른 값의 84에는 실패가 유지되고, 시도한 값의 늦은 84에는 거둬지며, 보낸 적 없는 대기 행은 실패로 남는지 확인한다. 수정 전 코드에서는 실패하는 것을 확인했다.

거부 원문 줄(`rejectText`)은 이번 범위에서 건드리지 않았다.

## 검증

수정마다 하는 검증과 전체 게이트는 **격리 worktree** 에서 돌렸다(`pnpm install --frozen-lockfile --offline` 로 의존성을 깔고 `@gh-radar/shared` 를 빌드한 뒤). 최종 fast-forward 뒤에는 **main checkout** 에서 타입체크와 바뀐 테스트 파일을 한 번 더 돌렸다.

- 수정마다: `pnpm exec tsc --noEmit -p .`(webapp) 통과. 관련 vitest 파일 통과. WR-02 · WR-05 는 수정을 뺀 상태에서 새 테스트가 실패하는 것도 확인했다.
- rebase 전 마지막 게이트:
  - config `build_command`(shared build → relay typecheck · typecheck:tests → webapp typecheck) 통과
  - `pnpm --filter @gh-radar/webapp run test`: 141 파일 · 3341 통과 · 1 skip · 실패 0
- 최종 fast-forward 뒤 **main checkout** 에서 다시 확인했다:
  - webapp `tsc --noEmit` 통과
  - 바뀐 테스트 6파일(strategy-card-flow · strategy-card · card-body · limit-chaser · me 2파일) 311건 통과
  - 웹앱 전체 스위트는 main checkout 에서 다시 돌리지 않았다. rebase 로 들어온 두 커밋은 webapp 과 겹치지 않는다.
- relay 테스트는 relay 소스를 바꾸지 않았으므로 돌리지 않았다.

## 사람 확인 권장

WR-01 ~ WR-05 는 모두 상태 판정 로직을 바꾼 것이다. 단위 테스트는 통과하지만 실제 동작은 사람이 확인하는 것이 좋다.
- **WR-04:** 다른 계좌 거부 문구가 카드에서 사라지는 동작 변경이 의도와 맞는지 확인 필요.
- **WR-03:** 새로 생긴 무응답 로그 줄의 문구가 적절한지 확인 필요.
- **운영 관찰:** 41을 모르는 옛 서버(127)에서 바로시작을 눌렀을 때, 다른 그룹 lc.set 은 더 이상 실패하지 않아야 한다. 대신 「미반영」과 로그 한 줄이 남아야 한다.

---

_Fixed: 2026-10-05T08:52:47Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
