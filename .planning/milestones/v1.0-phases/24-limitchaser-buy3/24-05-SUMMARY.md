---
phase: 24-limitchaser-buy3
plan: 05
subsystem: webapp-trading-log
status: complete
tags: [strategy-log, echo-attribution, limit-chaser, buy3, pitfall-8, pitfall-11]
requires:
  - 24-01 (런타임 5필드 · VALUE_COMPARE_SKIP 그룹 게이트 · LC_BUY3_ECHO_DEFAULTS)
  - 24-04 (매수 카드 4장 · 마스터 「꺼짐」 상태 문구)
provides:
  - StrategyTransition 26종(그룹 전이 6 · D-01/D-02 동반 6 · masterOffAfterServerFold) · buyFired 은퇴
  - strategyLogLine(prev, next, { sent, sentCause }) · export type StrategySubmitCause = 'serverFold'
  - POST_BUY_OVERRIDE_FIELDS · limitChaserValuesChanged 발동/재진입 override 제외
  - 카드 handleSent(cfg, meta?: { cause }) · pendingCauseRef
affects: [24-06, 24-07, 24-08]
tech-stack:
  added: []
  patterns:
    - "보낸 cfg · 보낸 사유를 pendingRef 와 같은 수명으로 들고 에코 로그 귀속에만 쓴다(제출은 만들지 않는다)"
    - "값 비교 제외 판정 한 곳(limitChaserValuesChanged) — 로그 「서버 반영 완료」와 카드 「다른 단말」 배너가 같이 따른다"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/lib/strategy-log-feed.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/lib/__tests__/strategy-log-feed.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "카드 fired 상태 자체를 걷었다(StrategyCardState.fired 필드 제거) — strategyStatusOf(server, false) 로 함수 모양만 유지. 늘 false 인 필드를 남기지 않는다"
  - "D-01/D-02 동반 판정 입력은 보낸 cfg — 마스터와 그 그룹이 둘 다 sent 에 실리고 에코가 같은 방향일 때만. 보내지 않은 같은 모양 에코는 종전 두 문장"
  - "D-02 후반 판정: sentCause === 'serverFold' ∧ sent.buyEnabled === false ∧ 에코 마스터 ON→OFF — 사유가 있어도 마스터가 안 꺼진 에코는 종전 판정"
  - "override 제외는 단계 2 진입/이탈 전이((prev≠2) XOR (next≠2))에서만 — 1→1 · 2→2 의 같은 필드 변화는 사용자 값 변경"
metrics:
  duration: 9min
  completed: 2026-09-28
  tasks: 2
  files: 9
estimate:
  tokens: 60000
actuals:
  tokens: 17129
  tasks: 2
  commits: 4
plan_head_before: a65a0323ffa407c53a5dff18c28c1fd227763c51
---

# Phase 24 Plan 05: 전략 로그 · 에코 귀속 Summary

전략 로그 전이 표를 Phase 24 어휘로 교체했다. 「매수주문 무장/무장 해제」, 그룹 전이 6문장, 보낸 cfg 로 판정하는 D-01/D-02 동반 문장 6개, 보낸 사유(`serverFold`)로 판정하는 D-02 후반 서버 접힘 문장이 들어갔다. 카드의 마스터 발주 추론(`hadOrder`/`fired`/`buyFired`)은 걷었다. 후매수 발동 · 재진입 에코의 매도 · 취소 override 값은 서버 귀속으로 처리해 「서버 반영 완료」 조각과 「다른 단말」 배너가 서지 않는다.

## 한 일

### Task 1 — 전이 표 교체(`strategy-log.tsx`)
- `StrategyTransition` 에서 `buyFired` 를 빼고 13종(그룹 6 · 동반 6 · `masterOffAfterServerFold`)을 더했다. `TRANSITION_TEXT` · `TRANSITION_ORDER` 는 26종으로 같은 집합이다(단언 유지). 순서는 등록/삭제 → 매수주문(+ 동반 · 서버 접힘) → 선매수 → 추가매수 → 후매수 → 매도 → 취소 → 서버 반영 완료.
- `strategyLogLine(prev, next, { sent?, sentCause? })` 를 만들고 `hadOrder` 옵션은 지웠다. 첫 스냅샷에서 켜져 있는 그룹은 무장 문장으로 붙는다. `BUY_GROUPS` 표 하나가 게이트 · 전이 4종을 소유한다.
- `POST_BUY_OVERRIDE_FIELDS`(`sellWatchQty` · `cancelWatchQty` · `sellWatchPrice` · `sellOrderPrice`)를 새로 두었다. `limitChaserValuesChanged` 는 후매수 단계 2 진입/이탈 전이일 때만 이 네 필드를 비교에서 뺀다.
- `export type StrategySubmitCause = 'serverFold'`(24-06 확정 훅이 import 한다).
- `serverMessageLogLine` 은 코드를 바꾸지 않았다. 서버 사유 5문장과 SetLimitChaser 거부 원문이 그대로 통과하는지만 테스트로 더했다. 기존 서버 메시지 테스트는 기대값을 하나도 고치지 않았다.
- My page 피드(`strategy-log-feed.tsx`)는 코드를 바꾸지 않았다. `hadOrder` 를 가리키던 주석만 `sent` 로 고쳤고, 피드가 동반 문장을 만들지 않는다는 단언 1개를 더했다.

### Task 2 — 카드 귀속(`strategy-card.tsx`)
- `handleSent(cfg, meta?: { cause })` 에 `pendingCauseRef` 를 더했다. 수명은 `pendingRef` 와 같다: 보낼 때 세우고, 에코 소비 · 삭제 · 키 변경 때 비운다. 런타임 에코는 둘 다 소비하지 않는다.
- 에코 이펙트는 `strategyLogLine(prev, server, { sent, sentCause })` 를 부른다. `hadOrder` 계산, `setFired` 두 갈래, `fired` state, `StrategyCardState.fired` 필드를 모두 지웠다. `strategyStatusOf(server, false)` 로 함수 모양은 My page 와 그대로 공유한다.
- 「다른 단말」 배너는 종전처럼 `limitChaserValuesChanged` 한 곳에서 판정한다. override 제외도 거기서 되므로 카드에는 조건을 따로 두지 않았다.
- 15:40 · 전부 정지 귀속 로그는 그대로다.
- e2e `trading-workbench.spec.ts:1090` 의 「매수 무장」을 「매수주문 무장」으로 바꿨다.

## 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/strategy-log.test.tsx src/lib/__tests__/strategy-log-feed.test.tsx` | 2 files · 64 passed |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading src/lib src/components/layout` | 81 files · 2028 passed · 1 skipped |
| `pnpm --filter @gh-radar/webapp exec vitest --run` (webapp 전체) | 125 files · 2577 passed · 1 skipped |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (tsc + tsconfig.e2e) |
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts --grep-invert "5\. 격자\|P20-3 최악값\|iPhone 가로 폭 844"` | 68 passed (기존 실패 3건 제외 — deferred-items.md) |

수용 grep 결과: `'buyFired'` 0 · 「선매수 체크 — 매수주문도 켬」 1 · 「후매수 해제 — 매수주문도 끔」 1 · `POST_BUY_OVERRIDE_FIELDS` 4 · 서버 접힘 문구 1 · `export type StrategySubmitCause` 1 · `strategyLogLine(prev, server, { sent, sentCause })` 1 · `pendingCauseRef` 7 · `hadOrder =|setFired(true)` 0 · e2e `'매수 무장'` 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] card-body 테스트 픽스처의 `fired` 제거**
- **Found during:** Task 2
- **Issue:** 카드 `fired` 상태를 걷으면서 `StrategyCardState.fired` 필드도 없앴다. 그래서 `card-body.test.tsx` 의 `cardState()` 픽스처에 초과 속성이 남았다.
- **Fix:** 픽스처에서 `fired: false` 한 줄을 지웠다. 플랜 files 목록 밖의 파일이다.
- **Commit:** eff160e7

**2. [주석 정합] 은퇴한 `hadOrder` 를 가리키던 주석 3곳**
- `strategy-log-feed.tsx` 머리 ② · `diffLimitChasers` 문서, `card-header.tsx:93` LED 입력 주석을 새 계약(`sent` · 발주 이력 없음)에 맞췄다. 동작 변화는 없다.
- **Commits:** 9915b17e · db1ee477

**Total deviations:** 1 auto-fixed(Rule 3) + 주석 정합 1건. **Impact:** 아키텍처 변경 없음 · 범위 확장 없음.

## 뒤 플랜이 닫아야 할 것

- **24-06(스위치 규칙):** 실제 동반 제출을 붙여야 한다(D-01: 그룹 ON + `buyEnabled: true` / D-02 전반: 마지막 그룹 OFF + `buyEnabled: false`). 폼 `onSent` 가 카드 `handleSent(cfg, meta)` 에 `meta` 를 넘기도록 넓혀야 한다. 지금 `limit-chaser-form.tsx:404` · `use-lc-field-commit.ts:165` 는 `(cfg) => void` 다. D-02 후반 `dropMasterAfterServerFold` 는 `{ cause: 'serverFold' }` 로 보내야 로그에 서버 접힘 문장이 선다. `StrategySubmitCause` 는 `@/components/trading/strategy-log` 에서 import 한다.
- **24-08(사람 확인):** 새 로그 문장 모양을 사람이 확인해야 한다(D-01/D-02 한 줄 · 서버 접힘 · 후매수 발동 에코에서 배너가 없는지).
- **두 클라 동작:** WinForms 가 먼저 보낸 마스터 OFF 에코는 웹에서 `sent === null` 로 오므로 로그는 「매수주문 무장 해제」다. 발주로도, 서버 접힘으로도 쓰지 않는다. 의도된 동작이다.

## Known Stubs

없음. `sentCause` 는 지금 카드 테스트만 넘기고 제품 폼은 아직 넘기지 않는다. 24-06 이 채우기로 계획된 경계이고, 넘기지 않으면 종전 「매수주문 무장 해제」가 서므로 화면에 거짓 문장이 흐르지 않는다.

## Deferred Issues

`deferred-items.md` 의 기존 e2e 실패 3건(5. 격자 · P20-3 최악값 · iPhone 844 16px)은 그대로다. 이번 변경과 무관해서 `--grep-invert` 로 뺐다.

## TDD Gate Compliance

- Task 1: `test(24-05)` f1d81f28 — RED 22 failed / 64 (새 문구 · 동반 · 서버 접힘 · override · 표 26종). 서버 원문 케이스는 코드 변경 없이 통과가 의도다. → `feat(24-05)` 9915b17e green 64/64
- Task 2: `test(24-05)` eff160e7 — RED 5 failed / 47 (헤더 「발주 완료」 2 · D-01 동반 1 · 서버 접힘 2). Pitfall 8 카드 케이스 2건은 Task 1 의 판정 한 곳 덕에 이미 통과했다. → `feat(24-05)` db1ee477 green

## Threat Flags

없음. 새 네트워크 표면 · 인증 경로가 없다. 이행 내역:
- T-24-20: 서버 원문은 기존 텍스트 노드 경로 그대로이고 파싱하지 않는다.
- T-24-21: override 4필드를 발동/재진입 전이에서 빼고, 단위 테스트를 양방향으로 두었다.
- T-24-22: `fired` 경로를 제거했다.
- T-24-23: 카드 에코 처리 뒤 `send` 호출 0 을 D-01 · D-02 후반 · Pitfall 8 테스트에서 단언한다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/strategy-log.tsx · webapp/src/components/trading/card/strategy-card.tsx · webapp/e2e/specs/trading-workbench.spec.ts
- FOUND: f1d81f28 · 9915b17e · eff160e7 · db1ee477
