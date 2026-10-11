---
phase: 18-gh-trade-ui-nxt-vi
plan: 26
subsystem: relay + webapp
tags: [relay, lc.snap, limit-chaser, focus, knowsRegistered, gap-closure, tdd, GC-IN-02]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-22 · 18-23)
    provides: "limitChaserSnapSeq · knowsRegistered(빈 목록 모호 처리) · deferred-items 18-22 relay 콜드 세션 항목"
provides:
  - "SubscriptionHub.hasLimitChaserList(userId) · 사용자별 64 수신 집합 #limitChaserKnown (세션 교체·closeAll 에서 삭제)"
  - "fanout 인증 경로 조건부 lc.snap — relay 가 내리는 lc.snap 은 언제나 확정 목록"
  - "webapp 리듀서: state 가 ready 로 전환될 때 limitChaserSnapSeq = 0"
  - "작업대 knowsRegistered(snapSeq) 단일 인자 = snapSeq > 0"
affects: [18-32 (배포 순서 — relay 먼저, webapp 나중 · deferred-items 해소 기록), 사이드바/`?focus=` 포커스 보류]

actuals:
  tokens: 7556
  tasks: 2
  commits: 4
plan_head_before: 73bab2a7d0e9a963fdcfe7b7e349d714a14a59e3

tech-stack:
  added: []
  patterns:
    - "「모름」 은 프레임 부재로만 표현한다 — 상따 목록도 VI 설정(getViTrigger 3상태)과 같은 규율"
    - "연결별 확정 스냅샷 기준점 — ready 전환마다 0, 확정 스냅샷마다 +1, 소비처는 > 0 만 읽는다"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts
    - relay/tests/strategy-hub.test.ts
    - packages/shared/src/relay.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx

key-decisions:
  - "relay 는 게이트웨이 64 를 받았을 때만 인증 경로 lc.snap 을 보낸다 — 60 에코는 「받았음」 을 기록하지 않는다(목록 전체를 말하지 않으므로) · 기록은 캐시 교체와 같은 자리에서 팬아웃 전에 (GC-IN-02)"
  - "knowsRegistered = limitChaserSnapSeq > 0 하나 — 빈 확정 목록 뒤의 미스는 버린다(0건 사용자 ①·전부 지운 뒤 ②)"
  - "limitChaserSnapSeq 는 state 가 ready 로 전환될 때만 0 (새 연결 인증 ACK 포함 · ready→ready 반복 불변) — 재연결 뒤 새 64 전의 미스는 보류 (③)"
  - "webapp 변경은 relay 배포 뒤에만 나가야 한다 — 옛 relay 는 콜드 세션에서 빈 lc.snap 을 먼저 내려 ?focus= 가 버려진다(D-02 회귀). push·배포하지 않았다"

patterns-established:
  - "스냅샷 프레임의 확정성은 송신측 계약이 말한다 — 수신측이 빈 배열을 모호하게 다루는 우회를 두지 않는다"

requirements-completed: []

duration: 12min
completed: 2026-09-22
---

# Phase 18 Plan 26: relay 64 수신 게이트 · 연결별 확정 스냅샷 기준점 Summary

**relay 가 게이트웨이 64(LimitChaserList)를 받았을 때만 인증 경로 `lc.snap` 을 내리게 하고(`hasLimitChaserList`), 그 계약 위에서 작업대 포커스 보류 판정을 `knowsRegistered(snapSeq) = snapSeq > 0` 로 줄였다. 리듀서는 ready 전환마다 기준점을 0 으로 되돌린다. GC-IN-02 의 세 틈(0건 사용자 · 전부 지운 뒤 · 재연결)을 한 슬라이스로 닫았다.**

## Performance

- **Duration:** 약 12분
- **Completed:** 2026-09-22
- **Tasks:** 2/2
- **Files modified:** 9

## Accomplishments

- **relay hub** — `#limitChaserKnown`(키 `userId`) 집합과 공개 판정 `hasLimitChaserList(userId)`. `#onLimitChaserList` 가 캐시 전량 교체와 같은 자리에서, 팬아웃 **전에** 기록한다. `#clearCaches(userId)`(세션 객체 교체)·`closeAll()` 이 지운다. 60 에코는 기록하지 않는다. `getLimitChasers` 는 무변경(에코 조회 경로가 배열을 쓴다). `stats()` 는 건드리지 않았다(선택 사항).
- **relay fanout 인증 경로** — `hasLimitChaserList(userId)` 일 때만 `lc.snap`. 모르면 보내지 않고, 곧 오는 64 팬아웃이 그 연결의 첫 `lc.snap` 이 된다. `vi.list`·`rate.cross.snap` 의 「비어 있어도 1프레임」 규율은 바꾸지 않았고 그 이유를 주석에 한 줄씩 남겼다.
- **shared** — `RelayLimitChaserSnapMsg` 머리 주석에 확정 목록 계약 4줄. 타입 선언 줄은 바뀌지 않았다(`git diff` 에 `+ *` 주석 줄만).
- **webapp 리듀서** — `state` 분기: `frame.s === "ready" && state.status !== "ready"` 일 때만 `limitChaserSnapSeq = 0`. JSDoc 을 새 뜻(「이번 ready 구간에서 받은 확정 64 수」)으로 다시 썼고, 「소비처는 빈 목록을 모호하게 다룬다」 문단을 지웠다.
- **작업대** — `function knowsRegistered(snapSeq: number): boolean { return snapSeq > 0; }`. 두 호출부(유입 효과 · 사이드바 요청)는 같은 함수를 부르는 구조 그대로. 머리 주석 ⑥ ★ 문단과 JSDoc 을 새 계약으로 고쳤다.

## Task Commits

1. **Task 1 RED:** `20d01f2` — test(18-26): ⑭(B) 새 규율 · ⑭-4 콜드 세션 · 허브 ⑯
2. **Task 1 GREEN:** `38b54cb` — fix(18-26): relay 는 64 를 받았을 때만 인증 경로 lc.snap
3. **Task 2 RED:** `99161fb` — test(18-26): 기준점 ④⑤⑥ · 작업대 ①②③ · 콜드 세션 재작성
4. **Task 2 GREEN:** `51d9c22` — fix(18-26): knowsRegistered(snapSeq) · ready 전환 기준점

## TDD Gate Compliance

| Task | RED | GREEN | 비고 |
|------|-----|-------|------|
| 1 (tracer) | `20d01f2` test(18-26) | `38b54cb` fix(18-26) | 트레이서 게이트: GREEN 뒤 `<verify>` 전량 재실행 통과 후 Task 2 로 확장 |
| 2 | `99161fb` test(18-26) | `51d9c22` fix(18-26) | — |

### Task 1 RED 원문 (수정 전 코드 · `npx vitest run fanout strategy-hub`)

```
× ⑯ 64 를 받았는지 사용자별로 안다 — 60 에코·세션 교체·closeAll·사용자 교차 (18-26 / GC-IN-02)
× ⑭ 0건도 프레임이 오지만, VI 를 아직 모르면 vi 프레임은 오지 않는다
× ⑭-4 콜드 세션 — 64 전에 인증한 탭은 lc.snap 을 받지 않고, 첫 lc.snap 이 곧 64 다 (18-26 / GC-IN-02)
FAIL tests/fanout.test.ts > WsFanout > ⑭ 0건도 프레임이 오지만, VI 를 아직 모르면 vi 프레임은 오지 않는다
AssertionError: expected [ { t: 'lc.snap', items: [] } ] to have a length of +0 but got 1
FAIL tests/fanout.test.ts > WsFanout > ⑭-4 콜드 세션 — 64 전에 인증한 탭은 lc.snap 을 받지 않고, 첫 lc.snap 이 곧 64 다 (18-26 / GC-IN-02)
AssertionError: expected [ { t: 'lc.snap', items: [] } ] to have a length of +0 but got 1
FAIL tests/strategy-hub.test.ts > SubscriptionHub — 전략 캐시 (D-12/D-13) > ⑯ ...
TypeError: hub.hasLimitChaserList is not a function
Tests  3 failed | 63 passed (66)
```

- ⑭(B)·⑭-4 는 **행동 단언**에서 실패한다(프레임 단언을 hub 조회보다 앞에 두어 새 API 부재가 먼저 터지지 않게 했다) — 콜드/모르는 세션의 탭이 빈 `lc.snap` 을 먼저 받는 결함 그 자체다.
- ⑯ 은 새 허브 판정(`hasLimitChaserList`)이 아예 없던 것이 RED 의 형태다(TypeError). 이 사실은 「64 수신」 이 hub 가 알 수 없던 사실이었다는 것과 같은 말이다.
- **⑭(B) 의 옛 단언 `expect(framesOf(tabB.inbox, "lc.snap")[0]).toEqual({ t: "lc.snap", items: [] })` 은 결함을 진실로 잠그고 있었다** — 64 를 한 번도 받지 못한 사용자에게 「등록 전략 없음」 을 확정으로 보내는 것을 기대값으로 삼았다. 18-22 가 deferred-items 로 이연한 바로 그 결함이다. 이 phase 의 「기존 테스트가 결함을 진실로 잠근 사례」 에 1건 추가.

### Task 2 RED 원문 (수정 전 코드 · `pnpm --filter @gh-radar/webapp test -- trading-workbench relay-socket`)

```
× limitChaserSnapSeq … > ⑤ 세션이 reconnecting → ready 로 **전환**되면 0 으로 돌아간다 — 옛 목록은 남는다 (GC-IN-02 ③ · 18-26)
× limitChaserSnapSeq … > ⑥ 소켓 재연결 뒤 새 연결의 인증 ACK(ready) 도 전환이다 — 0 으로 돌아간다 (GC-IN-02 ③ · 18-26)
× TradingWorkbench — WR-07 … > ① 등록 전략 0건 사용자 — 확정 빈 스냅샷 뒤 요청 K 는 버려진다 → 나중에 K 가 등록돼도 접힌 채 (GC-IN-02 · 18-26)
× TradingWorkbench — WR-07 … > ② 목록이 있다가 모두 지워진 뒤(snapSeq 2 · 빈 목록) 요청 K 는 버려진다 (GC-IN-02 · 18-26)
FAIL … ⑤ … AssertionError: expected 1 to be +0 // Object.is equality
FAIL … ⑥ … AssertionError: expected 1 to be +0 // Object.is equality
FAIL … ① … AssertionError: expected 'true' to be 'false' // Object.is equality
FAIL … ② … AssertionError: expected 'true' to be 'false' // Object.is equality
Test Files  2 failed | 90 passed (92)
     Tests  4 failed | 1385 passed | 1 skipped (1390)
```

- ①② 는 수정 전 `knowsRegistered(snapSeq, list) = snapSeq > 0 && list.length > 0` 이 빈 확정 목록 뒤의 미스를 보류했다가, 나중에 K 가 60 으로 등록되는 순간 사용자 조작 없이 카드를 펼친 결과다(WR-07 원 결함).
- ③(작업대) 과 ④(ready 반복 불변) 은 수정 전에도 green 이다 — 계획대로다. ③ 의 RED 는 리듀서 기준점 ⑤⑥ 이 낸다.
- **491 콜드 세션 케이스 재작성 이유:** 옛 케이스는 `snapped([], 1)` → `snapped([A, K], 2)` 로, 옛 relay 가 콜드 세션에서 64 전에 빈 `lc.snap` 을 먼저 내리는 것을 전제로 「빈 첫 스냅샷을 모호하게 다룬다」 는 우회를 잠그고 있었다. 새 relay 계약에서 콜드 세션은 첫 64 까지 `snapSeq 0` 이므로 `snapped([], 0)` → `snapped([A, K], 1)` 로 다시 썼다. 옛 형태를 남기면 「빈 확정 목록 = 모호」 라는 우회를 계속 요구하게 된다(prohibition 위반).

## Verification

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay test -- fanout strategy-hub` | Test Files 20 passed · **Tests 523 passed** |
| `pnpm --filter @gh-radar/relay run test` · `typecheck` · `typecheck:tests` | **523 passed (≥ 516)** · tsc exit 0 · tsc tests exit 0 |
| `pnpm --filter @gh-radar/webapp test -- trading-workbench relay-socket relay-provider` | Test Files 92 passed · **Tests 1389 passed · 1 skipped** |
| `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (`tsc --noEmit && tsc -p tsconfig.e2e.json`) |
| `pnpm --filter @gh-radar/webapp run test:e2e -- sidebar-tree trading-workbench me.spec a11y` | exit 0 · **64 passed (3.2m)** · failed 0 |

- 두 vitest 필터가 사실상 전 파일을 돌렸다(relay 20 파일 · webapp 92 파일) — 필터 오타로 0건 통과한 것이 아니다.
- acceptance grep: `hasLimitChaserList` — `subscription-hub.ts`(선언) · `fanout.ts`(인증 경로 게이트) 각 1줄 이상. `#limitChaserKnown` — 선언 · `#onLimitChaserList` 기록 · `closeAll` `.clear()` · `#clearCaches` `.delete(userId)`. `function knowsRegistered(snapSeq: number): boolean` — 매개변수 1개.
- 소비처 영향: `strategy-status-card.tsx` `useSnapshotSeen` 은 `status === "ready"` 래치라 영향 없음 · e2e `me`·`a11y` 는 스텁 게이트웨이의 24→64 자동 응답으로 목록이 그려져 green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 새 relay 케이스 번호를 ⑭-3 → ⑭-4 로**
- **Found during:** Task 1
- **Issue:** `fanout.test.ts` 에 이미 「⑭-3 드롭 0 게이트 — 76·77·78 왕복 …(T-17-10)」 이 있어 계획의 「⑭-3 신설」 번호가 겹친다.
- **Fix:** 새 콜드 세션 케이스를 ⑭-4 로 붙였다. 내용은 계획의 ⑭-3 그대로(로그인 응답을 붙잡아 64 전 인증 → `lc.snap` 0 → `buildLoginRespFrame` 을 `gateway.sendFrame` 으로 보내 ready → 첫 `lc.snap` = 64 2건).
- **Commit:** `20d01f2`

**2. [Rule 2 - 정확성] webapp 기준점 케이스를 기존 describe 번호 체계에 맞춰 ④⑤⑥ 으로**
- 계획은 「기준점 3케이스(전환 시 0 · 반복 ready 불변 · reconnecting→ready 재설정)」 다. 기존 ① 이 이미 「인증 ACK 만으로는 0」 을 보므로, 「전환 시 0」 은 **새 소켓 재연결 뒤 ACK** 로 강화해 ⑥ 으로 두었다(옛 연결 목록이 남은 상태에서 0 이 되는지 — 수정 전 RED). 범위 확대 없음.

그 외 계획대로 실행.

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 경로·인증 경로 없음. `hasLimitChaserList` 는 hub 내부 조회이고 `/healthz` 에 노출하지 않았다(`stats()` 무변경). T-18-110(사용자 교차)은 허브 ⑯ 이 A 의 64 가 B 를 「받았음」 으로 만들지 않음과 세션 교체가 A 만 지움을 고정한다.

## Deployment Note (T-18-111)

**배포 순서가 결합돼 있다 — relay 먼저, webapp 나중.** 새 `knowsRegistered`(빈 목록도 확정)는 relay 의 「받았음」 게이트가 배포된 뒤에만 안전하다. 옛 relay 는 콜드 세션에서 빈 `lc.snap` 을 먼저 내리므로, webapp 만 먼저 나가면 콜드 세션 `?focus=` 가 진짜 목록 전에 버려진다(D-02 회귀). 이 저장소에서 `git push` 는 곧 webapp 프로덕션 배포다 — 이 플랜은 push·배포하지 않았고, 순서 기록은 18-32 몫이다. deferred-items.md 18-22 항목의 해소 기록도 18-32 가 더한다.

## Next Phase Readiness

- relay 계약(`lc.snap` = 확정 목록) 이 코드로 섰다. 프로덕션 반영은 relay 배포 → 검증 → push 순서로 18-32 에서.
- TRADE-09 는 R3 최종 게이트(18-32)까지 Pending 유지.

## Self-Check: PASSED

- 커밋 4건(20d01f2 · 38b54cb · 99161fb · 51d9c22) 존재 · 수정 파일 존재 · `#limitChaserKnown` 선언/기록/closeAll/#clearCaches 4곳 · fanout `hasLimitChaserList` 1곳
