---
phase: quick-261010-jix
plan: 01
subsystem: webapp/trading (상따 카드 41 자동매도 명령)
tags: [phase-27, review-r3, autosell, strategy-card, limit-chaser]
status: complete
requires:
  - Phase 27 2라운드 수정(b9e03bed WR-R2-01 · 0948efe5 WR-R2-02)
provides:
  - isKeyedAutoSellRejection(msg) — 키(i · a)를 싣는 41 거부 출처 판정
  - autoSellLateRelayUntilRef — 늦은 relay 41 거부 수평선(무응답 뒤 LC_ORPHAN_WAIT_MS)
  - 「41 이 더는 의미 없음」 수평선(삭제 · 켜짐 → 꺼짐)의 대기 중 41 종료
affects:
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/lib/limit-chaser.ts
tech-stack:
  added: []
  patterns:
    - "Date.now() 마감 ref — 54 도착 시에만 읽어 별도 타이머 · 정리 대상 없이 결과 모름 수평선 구현"
key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - .planning/phases/27-auto-sell-integration/27-REVIEW-R3-DISPOSITION.md
decisions:
  - "출처 구분은 리뷰 예시의 카드 인라인 `msg.src !== \"Relay\"` 대신 lib `isKeyedAutoSellRejection` 으로 — 카드의 src 직접 비교 금지 규율(직접 비교 0건 유지)"
  - "켜짐 → 꺼짐 전이에서는 start 대기만 끊는다 — stop 대기는 같은 커밋에서 먼저 도는 settleAutoSell 이 !enabled 기대 전이로 이미 푼다"
metrics:
  duration: 4min
  completed: 2026-10-10
  tasks: 3
  files: 5
actuals:
  tokens: 6250
  tasks: 3
  commits: 5
plan_head_before: 6e5878cbd41abc0a477122976b693941ec18b894
plan_head_after: ec1afc32467098d89efd7714de5bcfd9a8e70471
---

# Phase quick-261010-jix Plan 01: Phase 27 3라운드 리뷰 4건 수정 Summary

늦은 relay 41 거부를 무응답 뒤 `LC_ORPHAN_WAIT_MS` 수평선으로 묶었다. 키를 싣는 거부(AutoSellCommand · Account)는 늦은 창 내내 받는다. 또 전략 삭제나 자동매도 켜짐 → 꺼짐 전이가 오면 대기 중인 41 타이머도 함께 끈다. 이로써 카드 간 표시 오염(WR-04 재발)과 빈 카드에 「미반영」이 다시 서는 갇힘을 둘 다 막았다.

## 커밋

| Task | 종류 | 해시 | 제목 |
|------|------|------|------|
| 1 RED | test | d11373ce | 늦은 relay 41 거부 수평선 실패 테스트 — WR-R3-01 |
| 1 GREEN | fix | 28857466 | 늦은 relay 41 거부를 결과 모름 수평선으로 묶음 — WR-R3-01 · IN-R3-01 |
| 2 RED | test | d7056f15 | 대기 중 41 종료 실패 테스트 · 켜진 채 런타임 에코 음성 고정 — WR-R3-02 · IN-R3-02 |
| 2 GREEN | fix | af93ea10 | 「41 이 더는 의미 없음」 수평선에서 대기 중 41 도 끝냄 — WR-R3-02 |
| 3 | docs | ec1afc32 | Phase 27 3라운드 리뷰 처분 — 4건 fixed · open 0 |

모든 커밋은 경로를 지정해 만들었다. Co-Authored-By는 넣지 않았고 push도 하지 않았다. `git show --stat`로 확인한 변경 파일은 files_modified 안에만 있다.

## 한 일

- **WR-R3-01**
  - lib에 `isKeyedAutoSellRejection`을 추가했다. 카드에는 `autoSellLateRelayUntilRef`(epoch ms, 0이면 닫힘)를 두었다.
  - 이 값은 41 타이머 콜백이 `Date.now() + LC_ORPHAN_WAIT_MS`로 세우고, `clearAutoSellUnacked`가 0으로 내린다. 내리는 곳은 이 한 곳뿐이다.
  - `lateAutoSellAnswer`에 `(isKeyedAutoSellRejection(msg) || Date.now() <= 수평선)` 조건을 더했다. 대기 창의 `autoSellAnswer`는 바꾸지 않았다.
- **IN-R3-01**: `isAutoSellCommandRejection` 계약 주석을 고쳤다.
  - 창 전제를 「결과 모름 수평선 안에서만 묻는다(대기 창 또는 무응답 뒤 늦은 창 · relay 출처는 시간으로 묶음)」로 바꿨다.
  - 「오판 방향은 종전과 같다」 문장에는 「호출자가 창을 시간으로 묶을 때만」이라는 조건을 붙였다.
  - 함수 본문은 바꾸지 않았다.
- **WR-R3-02**
  - 삭제 갈래에서 `clearAutoSellUnacked()` 앞에 `setAutoSellCmd(null)`을 부른다.
  - 켜짐 → 꺼짐 전이는 블록으로 바꿨다. 안에서 `autoSellCmdRef.current === "start"`이면 `setAutoSellCmd(null)`을 부른 다음 `clearAutoSellUnacked()`를 부른다.
  - 이펙트 의존성 배열에 `setAutoSellCmd`를 더했다.
  - 리뷰 「참고」를 반영해 「런타임 전용 조기 반환보다 먼저」 주석을 고쳤다. 이 순서는 동작상 필수는 아니고, 판정이 그 집합 구성에 기대지 않게 하려는 것이다.
- **IN-R3-02**: 무응답 뒤 켜진 채인 런타임 에코(`autoSellSoldQty: 10`)로는 「미반영」이 거둬지지 않는다는 음성 테스트를 추가했다. 대기 중 경로 테스트 2건(WR-R3-02)도 함께 넣었다.

## 불변식 확인

- `setAutoSellUnacked(false)`는 1곳(`clearAutoSellUnacked` 본문), `setAutoSellUnacked(true)`도 1곳(41 타이머 콜백)뿐이다.
- 카드에서 `msg.src`를 직접 비교하는 코드는 0건이다.
- 늦은 경로는 여전히 `acceptAnswer`를 부르지 않는다(WR-01). 테스트가 `lastCard.unacked === false`를 단언한다.
- 재전송은 없다. 모든 새 테스트가 `asCmds()` 길이 1을 단언한다.
- `setAutoSellCmd(null)` 코드 호출은 3곳에서 5곳(키 변경 리셋 · settleAutoSell · 삭제 갈래 · 켜짐 → 꺼짐 · 대기 중 거부)으로 늘었다.

## 검증 결과

- RED 확인
  - Task 1: 3건이 실패했다. lib는 `isKeyedAutoSellRejection is not a function`, 흐름 2건은 `expected 3 to be 2`로 수평선 밖 relay 줄이 그려졌다.
  - Task 2: WR-R3-02 2건이 `expected 'start' to be null`로 실패했다. IN-R3-02 1건은 계획대로 통과했다.
- GREEN 필터 실행
  - Task 1(`isKeyedAutoSellRejection|isAutoSellCommandRejection|WR-01|WR-R2|WR-R3`): 33 passed, 0 failed.
  - Task 2(`WR-0|WR-R2|WR-R3|IN-R3|기대 전이`): 34 passed, 0 failed.
- 대상 두 파일 전체 실행(`npx vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/strategy-card-flow.test.tsx`)
  - 결과: **215 passed / 0 failed**(lib 120, 흐름 95).
  - 소요: Duration 8.25s, 벽시계 9s.
  - 부하: 실행 전 uptime load 7.19 7.28 12.64, 실행 후 6.91 7.22 12.56.
  - 타임아웃은 없었고 재실행도 하지 않았다.
- `npx tsc --noEmit -p .`: exit 0.
- `npx eslint` 대상 4파일: exit 0.
- Task 3 verify(처분 4행 fixed · `open: 0`): 통과.

## Deviations from Plan

**1. [실행 환경] vitest 플래그 `--minWorkers=1 --maxWorkers=2` 생략**
- 계획 작성 뒤 동시 세션 커밋 7a26556d가 `webapp/vitest.config.ts`에 `minWorkers: 1` · `maxWorkers: 2`(기본값)를 넣었다.
- 그래서 플래그 없이도 워커가 2개 이하로 돌고, 계획이 경고한 tinypool RangeError나 0건 실행도 일어나지 않는다.
- 모든 실행을 플래그 없이 했고, 실제로 테스트 실행 건수를 확인했다(33 · 34 · 215).

그 밖에는 계획대로 실행했다.

## 재량 결정(리뷰 예시와 다름)

리뷰는 출처 구분을 카드에서 인라인 `msg.src !== "Relay"`로 하자고 제안했다. 이번에는 대신 lib `isKeyedAutoSellRejection` 한 곳에 두었다. strategy-card.tsx는 src를 직접 비교하지 않는다는 규율을 주석으로 명시하고 있고, 지금 직접 비교는 0건이다. 그래서 출처 판정도 다른 판정 함수들처럼 lib에 둔다.

## 배포 대기

webapp 변경은 push가 곧 프로덕션 배포다(Vercel). 이 실행은 push하지 않았다. push 여부는 오케스트레이터와 사용자가 정한다.

## Self-Check: PASSED

- 수정 파일 5개가 모두 존재한다.
- 커밋 d11373ce · 28857466 · d7056f15 · af93ea10 · ec1afc32는 모두 HEAD의 조상이다.
