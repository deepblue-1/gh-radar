---
phase: 18-gh-trade-ui-nxt-vi
plan: 04
subsystem: ui
tags: [webapp, pure-functions, localStorage, web-audio, relay-subscription, tdd]
status: complete

requires:
  - phase: 18-01
    provides: "RelayRateCrossItem.name?/code? 보강, RelayQueuedWindowMsg 6필드, relay 리듀서의 rateCrossItems(76 upsert·78 전량 교체·정렬·상한 200)"
provides:
  - "queued-window.ts — affordanceOf(77 창 · 거래소 · 주문유형) 라벨·조각입력·확인문구 매핑 유일 지점 + 예약 안내 문구 상수 2개"
  - "breakout-list.ts — shouldRemoveBreakout 삭제 판정 유일 지점, KST 날짜 키 {d, ids} 집합 I/O, 기기 설정(알림음·단 수), trackBreakoutMeta·breakoutRowsFrom·isHighlighted·newBreakoutsToAnnounce"
  - "use-breakout-quotes.ts — useBreakoutQuotes 다중 구독 훅(KRX 고정·상한 40·카드 예산 제외·overflow 반환)"
  - "alert-tone.ts — playBreakoutTone·isTonePlaybackBlocked·resumeToneContext (Web Audio 880Hz/160ms)"
affects: [18-05, 18-06, 18-07, trading-workbench, manual-order-form, breakout-strip, workbench-status-bar]

actuals:
  tokens: 14500
  tasks: 3
  commits: 6
plan_head_before: 68d2a2623e8bdb9a4d7251264ea22a858f898604

tech-stack:
  added: []
  patterns:
    - "판정의 유일 지점: 표시와 가드가 같은 순수 함수를 부른다(affordanceOf · shouldRemoveBreakout)"
    - "구독 diff 훅: 안정 문자열 시그니처 + held ref 로 빠진 키만 해제·새 키만 구독(남는 키 참조계수 불변)"
    - "기기별 날짜 키 집합 {d, ids}: 날짜 다르면 읽을 때 빈 집합 — 리셋 타이머 없음"
    - "순수 모듈은 타이머를 소유하지 않는다 — 강조 만료는 호출자의 목록 전체 1초 tick 1개"

key-files:
  created:
    - webapp/src/lib/queued-window.ts
    - webapp/src/lib/breakout-list.ts
    - webapp/src/lib/use-breakout-quotes.ts
    - webapp/src/lib/alert-tone.ts
    - webapp/src/lib/__tests__/queued-window.test.ts
    - webapp/src/lib/__tests__/breakout-list.test.ts
    - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
    - webapp/src/lib/__tests__/alert-tone.test.ts
  modified: []

key-decisions:
  - "affordanceOf 의 maxPieces 는 조각 입력이 보일 때만 서버 값, 숨길 때는 1(= 실제 보내는 조각 수) — 클라 기본 상한을 만들지 않는다"
  - "useBreakoutQuotes 는 effect 전량 해제·재구독이 아니라 held ref diff — [A,B]→[B,C] 에서 B 참조계수가 0 을 지나지 않게(업스트림 해제·재구독 1회 절약)"
  - "76/78 유래 구분은 relay 컨텍스트에 없으므로 trackBreakoutMeta 의 silent 를 호출자가 넘긴다(첫 채움·전량 교체로 들어온 새 종목 = silent)"
  - "무장은 등재 뒤 관측만 센다 — 등재를 일으킨 76 자체를 관측으로 치면 3초 유예가 무의미해진다"
  - "breakoutRowsFrom 에 이탈로 지운 키(removed, isin|exchange) 선택 인자 — 지운 종목(ISIN, 일 단위 영속)과 별개의 세션 기억"

patterns-established:
  - "RED 스텁: 새 모듈의 RED 는 시그니처만 있는 스텁을 함께 커밋해 import 실패가 아니라 단언 실패로 RED 를 만든다"

requirements-completed: [TRADE-06, TRADE-07]

coverage:
  - id: D1
    description: "77 → 라벨·조각입력·확인문구 매핑 5경우 + 시간외종가 최상위 + NXT 예약구간 제외 + 모름 전부 false + 벽시계 미사용"
    requirement: TRADE-07
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/queued-window.test.ts#affordanceOf — 77 → 라벨·입력 매핑 (10 tests)"
        status: pass
      - kind: other
        ref: "! grep -nE 'new Date|Date\\.now' webapp/src/lib/queued-window.ts"
        status: pass
  - id: D2
    description: "돌파 이탈 삭제 판정(현재가 모름 불삭제 · 임계−2.0%p · 무장/3초 유예) + KST 날짜 키 집합(ISIN 만) + 30초 강조 + 78 무음·무강조·기록"
    requirement: TRADE-06
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/breakout-list.test.ts (25 tests)"
        status: pass
      - kind: other
        ref: "! grep -nE 'setTimeout|setInterval' webapp/src/lib/breakout-list.ts"
        status: pass
  - id: D3
    description: "돌파 종목 다중 시세 구독 — 참조계수 API 만, KRX 고정, diff 6케이스, 상한 40·카드 예산 제외·overflow"
    requirement: TRADE-06
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-breakout-quotes.test.tsx (9 tests)"
        status: pass
  - id: D4
    description: "알림음 — 기본 꺼짐 무동작, suspended 차단 판정, 880Hz/160ms/0.18, 지연 생성, 파일 자산 없음"
    requirement: TRADE-06
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/alert-tone.test.ts (7 tests)"
        status: pass

duration: 10min
completed: 2026-09-22
---

# Phase 18 Plan 04: 판정 함수 네 벌 Summary

**77 창 힌트 → 수동주문 라벨 매핑(`affordanceOf`), 돌파 목록 클라 몫 규칙(`shouldRemoveBreakout` 외), 돌파 다중 시세 구독 훅(`useBreakoutQuotes`), Web Audio 알림음(`alert-tone`)을 TDD 로 만들었다. UI 가 붙기 전에 표시와 가드가 같은 함수를 부르게 고정했다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-22T08:53+09:00
- **Completed:** 2026-09-22T09:03+09:00
- **Tasks:** 3/3
- **Files:** 8개 신규 (소스 4 + 테스트 4)

## Accomplishments

- `affordanceOf`: 우선순위는 시간외종가 > `open∧KRX` > `preopenOpen∧KRX` > `nxtPreopenOpen∧NXT` > 그 외·모름. 반환 필드는 5개로 고정했고 「제출 금지」 필드는 없다. 벽시계를 읽지 않는다는 점은 fake timer 테스트와 grep 둘 다로 확인했다.
- `breakout-list`: `shouldRemoveBreakout` 는 현재가를 모르면 무조건 false 다. 아는 경우에는 `등락률 < 임계−2.0 ∧ (무장 ∨ 3초 경과)` 일 때만 지운다. `{d, ids}` 는 KST 날짜 키이고, 저장소가 throw 하거나 JSON 이 깨져도 안전한 기본값으로 떨어진다. 저장하는 값은 ISIN 뿐이다.
- `useBreakoutQuotes`: 참조계수 `subscribe`/`unsubscribe` 만 쓰고 소켓에 직접 보내지 않는다. 거래소는 KRX 로 고정했고, 안정 시그니처로 비교해 바뀐 키만 구독·해제한다. `MAX_BREAKOUT_SUBS=40` 은 측정값이 아니라 보수적으로 정한 값이며, 게이트웨이 상한은 아직 확인하지 않았다고 주석에 적었다. 카드 종목은 예산에서 빼고, 상한을 넘은 종목은 `overflow` 로 돌려준다.
- `alert-tone`: 기본은 꺼짐이고 컨텍스트는 처음 필요할 때 만든다. sine 880Hz · 160ms · gain 0→0.18(10ms)→exp 로 소리를 낸다. `suspended` 상태면 차단으로 보고, `resume()` 은 사용자 제스처 안에서만 부르도록 docstring 에 적었다. 「`addSounded` 를 먼저 부른 뒤 재생」하는 순서 계약도 docstring 에 남겼다.

## Task Commits

1. **Task 1: queued-window** — `3d59abd` (test, RED) → `b16f5b8` (feat, GREEN)
2. **Task 2: breakout-list** — `e5adab0` (test, RED) → `6551595` (feat, GREEN)
3. **Task 3: use-breakout-quotes + alert-tone** — `32be6f5` (test, RED) → `f0e4af3` (feat, GREEN)

## TDD Gate Compliance

- 세 태스크 모두 RED(`test(18-04)`) 커밋이 GREEN(`feat(18-04)`) 커밋보다 앞에 있다. REFACTOR 는 필요 없었다.
- RED 증거는 매번 `gsd-tools check tdd-red-evidence` 를 돌려 `RED_EVIDENCE_OK` 를 받았다. 목표 테스트는 단언 실패로 떨어졌다.
  - Task 1: 「open ∧ KRX …」 테스트가 `expected 'normal' to be 'queued'` 로 실패
  - Task 2: 「임계 20 · 등락률 17.9 · 무장됨 → 지운다」 테스트가 `expected false to be true` 로 실패
  - Task 3a: 「[A, B] 로 마운트하면 …」 테스트가 `called 2 times, but got 0` 으로 실패
  - Task 3b: 「토글이 켜져 있으면 …」 테스트가 `expected false to be true` 로 실패
- 신규 모듈이라 RED 커밋에 시그니처만 있는 스텁을 함께 넣었다. 그래서 import 실패(INVALID_RED)가 아니라 단언 실패로 RED 가 났다.
- vitest `tap-flat` 출력에는 node 식 `# tests/# pass/# fail` 요약이 없다. 그래서 TAP 본문의 ok/not ok 줄 수를 세어 요약을 붙인 뒤 레코드를 만들었다. 값은 출력에서 계산한 것이다.

## Decisions Made

frontmatter `key-decisions` 5건과 같다. 후속 plan 에 넘길 사항은 아래 두 가지다.
- **76/78 구분은 호출자 몫이다.** relay 컨텍스트는 항목의 출처를 알려 주지 않는다. 작업대 plan 은 첫 채움과 전량 교체로 새로 들어온 종목을 `trackBreakoutMeta(..., { silent: true })` 로 넘겨야 한다.
- **호출 순서는 `newBreakoutsToAnnounce` → `addSounded(record)` → `sound.length > 0` 일 때 `playBreakoutTone()` 이다.** 이 순서를 지켜야 D-17 을 만족한다.

## Deviations from Plan

### 계획 문안과 다르게 구현한 것 (Rule 1 — 동작 요구 충족)

**1. [Rule 1] 구독 cleanup 방식을 held-ref diff 로 바꿈**
- **발견:** Task 3
- **문제:** 계획 action 은 「cleanup 이 클로저가 붙잡은 그 키들을 해제」(RESEARCH §Pattern 1 코드)라고 했다. 이 방식으로는 `[A,B]→[B,C]` 에서 B 도 해제됐다가 다시 구독된다. `<behavior>` 의 「B 는 그대로」를 만족하지 못한다.
- **수정:** held ref 로 diff 를 계산한다(빠진 키만 해제, 새 키만 구독). 언마운트나 API 교체 때 전량 해제하는 cleanup 은 별도 effect 로 둔다.
- **파일:** webapp/src/lib/use-breakout-quotes.ts
- **커밋:** f0e4af3

**2. [Rule 2] 계획에 없던 보조 export 추가**
- `breakout-list.ts` 에 `trackBreakoutMeta` · `isHighlighted` · `newBreakoutsToAnnounce` · `breakoutKey` 와 `breakoutRowsFrom` 의 `removed` 인자를 더했다. 계획 표현으로는 무장·등재 시각을 누가 갱신하는지, 이탈 삭제가 어디에 반영되는지, 78 기록과 소리 대상을 어떻게 가르는지가 빠져 있었다. 이게 없으면 판정 함수를 조립할 수 없다.
- `alert-tone.ts` 는 `webkitAudioContext` 로 폴백하고, 재생 실패를 `console.warn` 으로 남긴다(무로그 fail-safe 금지 규칙).
- 테스트 편의를 위해 `shouldRemoveBreakout` 에 선택 인자 `now` 를 두었다(기본 `Date.now()`).

그 밖에는 계획대로 진행했다.

## Issues Encountered

- `pnpm --filter @gh-radar/webapp test -- <filter>` 는 필터를 넘기지 못하고 전체 suite 를 돌린다(`--` 가 그대로 전달됨). 전체가 통과했으므로 판정에는 문제가 없다. 대상 파일만 돌리려면 `webapp/` 에서 `npx vitest --run <path>` 를 쓰면 된다.

## Verification

- `pnpm --filter @gh-radar/webapp test`: 77 files, **1066 passed** | 1 skipped. Phase 17 기준선 1008 이상이다.
- `pnpm --filter @gh-radar/webapp run typecheck`: 통과
- grep 가드 네 개 모두 통과: queued-window 에 벽시계 없음 · breakout-list 에 타이머 없음 · 훅에 `.send(` 없음 · `MAX_BREAKOUT_SUBS` 존재
- 새 오디오 파일 자산 없음

## Known Stubs

없다. RED 스텁은 모두 GREEN 커밋에서 실제 구현으로 바꿨다.

## Flagged Assumptions (계획에서 이어받음)

- **TRADE-06 / `unclassified`**: edge-probe 분류는 미해소 상태 그대로다. 권한 경계(서버 76/78 · relay 캐시 · localStorage)는 truths 와 prohibitions 4건으로 덮었고, 이 항목은 검증자에게 그대로 넘긴다.
- `MAX_BREAKOUT_SUBS=40` 과 `AudioContext` 자동재생 정책은 이번에 실측하지 않았다(RESEARCH 의 ASSUMED 표시 유지).

## Next Phase Readiness

- 카드와 호가 탭의 수동주문 폼은 `affordanceOf` 하나로 라벨을 정할 수 있다.
- 돌파 스트립·표에 필요한 조각이 모두 준비됐다: `useBreakoutQuotes` → `trackBreakoutMeta` → `breakoutRowsFrom` → `shouldRemoveBreakout`, 알림 순서는 `newBreakoutsToAnnounce` → `addSounded` → `playBreakoutTone`.
- 막힌 것은 없다. 18-03(원격 DB 마이그레이션)이 보류 중이어도 이 plan 에는 영향이 없다.
- `REQUIREMENTS.md` 의 TRADE-06/07 은 **Pending 으로 두었다**. frontmatter `requirements-completed` 는 plan 의 requirements 를 그대로 옮긴 것이다(18-01 관례). 이 plan 은 두 요구사항의 판정 층만 닫았고, 화면(스트립·폼)은 후속 plan 에서 붙는다. 그래서 `requirements.mark-complete` 가 체크한 것을 되돌렸다.

## Self-Check: PASSED

- 신규 8개 파일 모두 있음
- 커밋 6개(3d59abd · b16f5b8 · e5adab0 · 6551595 · 32be6f5 · f0e4af3) 모두 `git log` 에 있음
