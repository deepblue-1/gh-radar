---
phase: 18-gh-trade-ui-nxt-vi
plan: 17
subsystem: trading-breakout
status: complete
tags: [gap-closure, TRADE-06, relay, webapp, breakout, ordering]
gap_closure: true
requires:
  - 18-14
provides:
  - "relay sortRateCrossNewestFirst — exchangeTime 내림차순 · 동률 isin 오름차순 (getter · 78 팬아웃 공용)"
  - "webapp sortRateCross 같은 축 (76 upsert · 78 전량 교체)"
  - "RelayRateCrossSnapMsg 순서 계약 주석 (relay 가 내리는 순서 = 최신 위)"
  - "e2e GC1 — 첫 칩 · 표 첫 행 · 76 추가 후 첫 칩"
affects:
  - 18-VERIFICATION TRADE-06 「새 돌파 상단」 재검증 근거
  - UI-SPEC E4 「최신 위」 문구와 실제 순서 일치
tech-stack:
  added: []
  patterns:
    - "순서의 정본은 relay 헬퍼 1개 + 웹 리듀서 1개 — 두 파일 주석이 서로를 가리키고, 표시 컴포넌트는 순서를 만들지 않는다"
key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/rate-cross.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - packages/shared/src/relay.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
key-decisions:
  - "돌파 목록 정렬 축 = exchangeTime 내림차순 · 동률 isin 오름차순. relay getter · 78 팬아웃 · 웹 76/78 리듀서가 한 축 (사용자 결정 2026-09-22 · D-14)"
  - "relay 캐시(#rateCrossItems)는 서버 원본 그대로 두고 정렬은 내리는 사본에만 한다. 76 단건 팬아웃은 순서가 없어 그대로"
  - "상한 200 은 정렬 뒤 절단이라, 넘치면 가장 오래된 돌파가 잘린다 (최신 유지)"
  - "StockDMA.fbs 의 「돌파 시각 오름차순」 주석은 게이트웨이 원순서 설명이라 손대지 않는다 (gh-trade 소유 생성물)"
requirements-completed: [TRADE-06]
metrics:
  duration: "약 15분"
  completed: 2026-09-22
  tasks: 2
  files: 6
actuals:
  tokens: 4600
  tasks: 2
  commits: 3
plan_head_before: 2f7fd5fbda0234b9cf1f839eee4246a7f1160d7f
coverage:
  - deliverable: "relay getter · 78 팬아웃이 최신 돌파 맨 위 · 동률 isin 오름차순"
    human_judgment: false
    verification:
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑤-2 · ⑤-2b"
        status: pass
  - deliverable: "웹 리듀서 76/78 이 같은 축 — 스냅샷 최신 위 · 새 76 맨 위 · 구간 안 76 자리 유지 · 재돌파 맨 위 · 동률"
    human_judgment: false
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#rate.cross 순서 — 최신 돌파가 맨 위"
        status: pass
  - deliverable: "실브라우저 칩 줄 · 표 첫 행이 가장 늦은 돌파"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#GC1"
        status: pass
---

# Phase 18 Plan 17: 돌파 목록 최신 위 Summary

**relay `sortRateCrossNewestFirst`(getter · 78 팬아웃)와 웹 `sortRateCross` 를 `exchangeTime` 내림차순 한 축으로 맞췄다. 이제 돌파 칩 줄과 표가 가장 최신 돌파부터 보인다. UI-SPEC 의 「최신 위」 문구가 실제 순서와 일치한다 (TRADE-06).**

## Performance

- **Duration:** 약 15분
- **Tasks:** 2 (tracer 1 + auto 1)
- **Files modified:** 6

## Accomplishments

- relay: 모듈 스코프 순수 헬퍼 `sortRateCrossNewestFirst` 를 추가했다(사본 정렬). `getRateCrossItems` 의 인라인 오름차순 정렬과 `#onRateCrossSnapshot` 의 팬아웃 `items` 가 둘 다 이 헬퍼를 거친다(`grep -c` = 5, 조건은 3 이상). 캐시와 76 단건 팬아웃은 그대로다.
- webapp: `sortRateCross` 비교자를 반전했다. 상태 필드 · `upsertRateCross` 주석은 relay 헬퍼를 가리키게 정정했다. 76 upsert 는 인덱스 교체로 바꾸지 않고 필터 후 재정렬을 유지했다. `exchangeTime` 이 구간을 연 시각이므로 구간 안 갱신은 자리를 지키고, 재돌파만 맨 위로 오른다.
- shared: `RelayRateCrossSnapMsg` 주석을 정정했다. 게이트웨이 원순서는 오름차순이고, relay 가 내리는 순서는 내림차순이다. 타입은 바꾸지 않았다.
- e2e GC1: 78 두 종목(0901 · 0903)을 넣으면 첫 칩과 표 첫 행이 0903 종목이다. 이어 76 으로 0905 종목을 넣으면 그 종목이 첫 칩 · 표 첫 행이 된다.

## Task Commits

1. **Task 1 RED** — `2c52844` test(18-17): relay getter · 78 팬아웃 · 동률 · 웹 리듀서 순서 회귀
2. **Task 1 GREEN** — `87f2ddd` feat(18-17): relay `sortRateCrossNewestFirst` + 웹 리듀서 같은 축
3. **Task 2** — `4267e7c` test(18-17): e2e GC1 + `RelayRateCrossSnapMsg` 계약 주석

## TDD Gate Compliance

- RED: `2c52844`. relay 2건 실패(⑤-2 · ⑤-2b), webapp 4건 실패. 모두 순서 단언 불일치이고 하네스 오류는 없었다.
- GREEN: `87f2ddd`. relay 510/510, webapp 1353 passed · 1 skipped. 기존 `breakout-strip` 테스트는 수정 없이 green 이다.
- REFACTOR: 없음(변경 불필요).

## Verification

- `pnpm --filter @gh-radar/relay test -- rate-cross` → 20 files · 510 passed
- `pnpm --filter @gh-radar/webapp test` → 92 files · 1353 passed · 1 skipped
- `! grep -nE "\.sort\(|\.reverse\(\)" breakout-strip.tsx` → 통과(스트립은 순서를 만들지 않는다)
- shared build · relay typecheck · relay typecheck:tests · webapp typecheck(e2e 포함) → 오류 0
- `test:e2e -- trading-workbench -g "GC1|돌파"` → 42 passed. GC1 과 케이스 3 · 28 을 포함하고, 케이스 3 · 28 은 수정하지 않았다.
- Tracer 게이트(end-of-phase, 자동 검증만): Task 1 `<verify>` 재실행 green → 확장 진행

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 보강 테스트 ③ 이 위치로 원소를 꺼내던 것을 isin 조회로**
- **Found during:** Task 1 RED 작성
- **Issue:** `rate-cross.test.ts` 보강 describe ③ 은 `const [known, unknown] = snaps[0].items` 로 원소를 꺼냈다. 이 방식은 오름차순 순서에 암묵적으로 의존하므로, 순서를 반전하면 보강 단언이 엉뚱한 원소를 보게 된다.
- **Fix:** `items.find((i) => i.isin === …)` 로 바꿨다. 이 케이스는 보강만 보고 순서는 ⑤-2 가 단언한다.
- **Files modified:** relay/tests/rate-cross.test.ts
- **Commit:** 2c52844

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** 테스트가 순서와 무관해졌을 뿐이고, 계약에는 변화가 없다.

## Issues Encountered

None.

## Known Stubs

None.

## Next Phase Readiness

18-17 이 끝났다. Phase 18 의 나머지 갭 클로징 플랜은 오케스트레이터가 이어서 진행한다. relay 변경은 배포 전이다. 사용자 규칙상 relay 를 먼저 배포하고 push 는 그 뒤에 한다.

## Self-Check: PASSED

- 수정 파일 6개가 디스크에 있다.
- 커밋 2c52844 · 87f2ddd · 4267e7c 가 `git log` 에 있다. `rev-list --count 2f7fd5f..HEAD` = 3.
