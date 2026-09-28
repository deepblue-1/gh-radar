---
phase: quick-260929-akj
plan: 01
subsystem: webapp/trading (상따 필드 확정 훅 · 카드 · 폼)
status: complete
tags: [limit-chaser, lc.set, rejection, echo, auto-check, 24-REVIEW-R3]
requirements: [R3-WR-01, R3-WR-02]
requires:
  - 24-REVIEW-R3 (R3-WR-01 · R3-WR-02)
provides:
  - LC_REJECT_ECHO_GRACE_MS (1,000ms) — 거부 통지 답의 같은 제출 에코 유예
  - StrategyCardState.rejectSeq → CardBody serverRejectSeq → LimitChaserForm → useLcFieldCommit
  - 보낸 성공 신호 sentSuccessSeq · lastSentSuccessField (옛 불리언 신호 대체)
affects:
  - webapp/src/components/trading/lc/use-lc-field-commit.ts
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
tech-stack:
  added: []
  patterns:
    - "거부 통지 전용 신호(rejectSeq) + 훅 판정 유예 — 에코가 오면 에코가 정본, 없으면 유예 끝에 거부"
    - "성공 신호 2개 분리 — 일반(모든 성공) · 보낸 성공(해소 ① in-flight 답만)"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
decisions:
  - "R3-WR-01 — 카드가 lc.set 거부 통지에 rejectSeq 를 따로 올리고, 훅은 「보낸 뒤 거부 신호 증가 ∧ 답 신호 증가 ∧ 이 렌더에 에코 없음」일 때만 LC_REJECT_ECHO_GRACE_MS(1,000ms) 판정을 미룬다. 거부 신호 없는 답은 종전대로 즉시 판정한다"
  - "R3-WR-02 — 보낸 프레임의 답 전용 신호(sentSuccessSeq · lastSentSuccessField)를 분리하고 옛 불리언 신호를 제거했다. 폼 자동 체크 줄과 편집기 닫기는 보낸 성공으로 소비하고, 일반 성공은 줄 없이 슬롯만 비운다"
metrics:
  duration: "약 11분 (07:54 ~ 08:05 KST)"
  completed: 2026-09-29
  tasks: 3
  files: 9
estimate:
  tokens: 110000
  tasks: 3
actuals:
  tokens: 15064
  tasks: 3
  commits: 3
plan_head_before: b2e6d5c3344f0318bf5e47ee1e0cf200e3185469
commits: 3
---

# Quick 260929-akj: 24-REVIEW-R3 R3-WR-01 · R3-WR-02 수정 요약

부분 거부 ERROR 가 에코보다 먼저 와도 in-flight 판정을 같은 제출의 에코까지 미룬다(카드 `rejectSeq` 신호 + 훅 1,000ms 유예). 그리고 「보낸 프레임의 답」 성공 신호를 분리해, 같은 판정 실행의 늦은 에코 성공이 선매수 자동 체크 줄과 편집기 닫기를 덮지 않게 했다.

**결론: 24-REVIEW-R3 의 R3-WR-01 과 R3-WR-02 는 닫혔다.** 남은 것은 아래 「잔여 한계」에 적은, 에코가 유예보다 늦게 오는 비정상 지연 1건이다. 이는 설계상 수용한 한계다.

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| 1 | `7fd7da49` | fix — R3-WR-01 카드 거부 신호 · 훅 에코 유예 · 카드 흐름 통합 회귀 · 전면 거부 통합 케이스 유예 반영 |
| 2 | `214ae025` | fix — R3-WR-02 보낸 성공 신호 분리 · 폼 자동 체크 소비 규칙 (a)(b)(c) · 편집기 닫기 · GC-IN-03 describe 이전 |
| 3 | `808a29a2` | test — R3-WR-01 훅 H1~H4 · 폼 F1 · F2 회귀 잠금 |

모든 커밋 메시지는 한국어이고 공동 저자 트레일러가 없다. push · 배포는 하지 않았다.

## 설계 선택

**R3-WR-01 — 카드 거부 신호 + 1,000ms 유예**
- 카드(`strategy-card.tsx`)는 `isLimitChaserSetRejection` 분기에서 `acceptAnswer()` 와 `setRejectSeq(n => n + 1)` 를 함께 한다. 신호는 `StrategyCardState.rejectSeq` → `card-body` `serverRejectSeq` → 폼 prop → 훅 옵션으로 흐른다.
- 훅 해소 ① 의 순서는 matches → unacked → [answered ∧ 거부 신호 ≠ `rejectSeqAtSend` ∧ !serverChanged → 유예] → answered 면 즉시 거부다.
  - 유예 중 에코가 오면 에코가 판정한다. 주 필드가 일치하면 보낸 성공이고, 아니면 그 렌더에서 즉시 거부다.
  - 에코가 없으면(전면 거부) 타이머가 `failInflight(inf, 'rejected')` 만 부른다. 전송은 없다(T-16-10).
  - 이미 걸린 유예의 마감은 늘리지 않는다. 타이머는 성공 · 실패 · 언마운트 때 해제한다.
- 유예 1초의 근거: gh-trade `ProcessSetLimitChaser` 는 ERROR → 저장 → 에코를 같은 연결로 동기 송신하므로 도착 간격은 전송 + 렌더 1회 수준이다. ERROR 원문 줄과 상태줄은 카드가 지금처럼 즉시 세운다.
- 기각한 대안:
  - **A** (거부 문구로 부분 · 전면 분류): 서버 문구를 웹이 다시 분류하게 되어 문구 원천이 둘이 된다.
  - **B** (신호 없이 에코를 못 본 모든 답을 유예): 거부가 아닌 답(미등록 키 철거 에코)의 판정까지 늦어지고, 「답만 증가 = 즉시 거부」를 잠근 기존 테스트 수십 곳을 고쳐야 한다.

**R3-WR-02 — 보낸 성공 신호 분리**
- 훅의 성공 상태를 `{ seq, field }` 로 줄였다. `sentSuccess` 는 해소 ① matches 분기에서만 오른다. 한 판정 실행에 in-flight 는 최대 1건이라 덮일 수 없다.
- 옛 불리언 신호는 `webapp/src` 어디에도 남지 않았다(negative grep 0건).
- 폼 자동 체크 이펙트는 세 단계다.
  - (a) 실패한 슬롯을 버린다.
  - (b) 보낸 성공(값이 바뀐 실행에서 한 번)이면 슬롯을 소비하고 줄을 쓴다.
  - (c) 일반 성공이면 줄 없이 슬롯만 비운다(no-op · 대기 접기 — D-08 · GC-IN-03).
- 편집기 · 시트 닫기 이펙트를 보낸 성공 신호에도 하나 더 두었다. 닫기는 멱등이다.

## 테스트 수

- 시작 전: 대상 6개 파일 459건 green. `src/components/trading` 은 33파일 1,395건(계획 시점 기준선).
- 추가: Task 1 +1(카드 흐름 통합) · Task 2 +3(훅 1 · 폼 2) · Task 3 +6(훅 H1~H4 · 폼 F1 · F2) = **+10**
- 최종: `npx vitest run src/components/trading` → **33파일 1,405건 green**. `npx tsc --noEmit` → green.
- RED 확인:
  - Task 1 통합 케이스는 수정 전 ERROR 렌더에서 「반영하지 못했어요」가 서서 실패했다.
  - Task 2 의 세 케이스는 수정 전 각각 새 필드 없음 · 자동 체크 줄 0 · 편집기 열림으로 실패했다.

## 변이 확인

- 훅의 유예 조건 앞에 `false &&` 를 붙여 유예를 무력화했다.
- 그 상태에서 H1 · F1 · 카드 흐름 R3-WR-01 이 **모두 실패**했다. H2 · H3 · F2 도 함께 실패했다.
- H4(언마운트)만 통과했다. H4 는 유예 경로가 아니라 타이머 정리를 잠그는 케이스라 의도와 맞다.
- `git checkout -- webapp/src/components/trading/lc/use-lc-field-commit.ts` 로 되돌린 뒤 `git diff --quiet HEAD` 를 통과했고, 다시 green 이었다.

## e2e 미실행 근거

e2e(Playwright)는 돌리지 않았다. 작은 수정에 전체 e2e 를 돌리지 않는다는 교훈을 따랐고, `webapp/e2e` 스펙에 폼 실패 문구(「반영하지 못했어요」) 단언이 0건임을 grep 으로 확인했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] lc-tracer ⑬(시트 경로 전면 거부)에도 유예 단계를 넣었다**
- **Found during:** Task 1
- **Issue:** 계획은 lc-tracer ⑤ 와 카드 흐름 ㉑-e 만 유예 반영 대상으로 꼽았다. 그런데 ⑬(터치 시트 · 실제 거부 메시지 → 즉시 「반영하지 못했어요」)도 같은 전면 거부 통합 경로라 유예 도입 뒤 실패했다.
- **Fix:** ⑤ 와 같은 기계적 조정을 했다. 거부 rerender 직후 「시트 상태 줄 alert 없음」을 단언하고, `LC_REJECT_ECHO_GRACE_MS` 를 진행한 뒤 기존 단언을 그대로 둔다.
- **Files modified:** `webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx`
- **Commit:** `7fd7da49`

**2. [기록] GC-IN-03 describe 는 7케이스가 아니라 6케이스였다**
- 계획은 옛 불리언 신호 describe 를 「7케이스」로 적었지만 실제 `it` 은 6개였다. 6개 모두 같은 의미로 새 신호에 옮겼다.
- 첫 케이스에는 초기값(`sentSuccessSeq 0` · `lastSentSuccessField null`) 단언을 더했다.

그 밖에는 계획대로 실행했다. 기존 「답만 증가 → 즉시 거부」 훅 · 폼 테스트와 GC-WR-01~04 · GC-IN-03 · D-35 · ⑲ 폼 케이스는 기대를 바꾸지 않고 통과한다. 예외는 옛 불리언 신호 describe 의 이름 · 필드 이전뿐이다.

## 잔여 한계

- 에코가 유예(1,000ms)보다 늦게 오는 비정상 지연이면 종전처럼 동작한다. 먼저 실패하고, 뒤이은 늦은 에코가 성공으로 거둔다(보낸 성공 아님 → 자동 체크 줄 없음 · 대기 건은 이미 실패로 접힘). 설계상 수용한 한계이며 `LC_REJECT_ECHO_GRACE_MS` JSDoc 에 적었다.
- 전면 거부의 폼 실패 표시는 최대 1초 늦게 선다. ERROR 원문 로그 줄 · 상태줄 · 「미반영」 해제는 카드가 즉시 한다.

## Threat Flags

없음. 새 네트워크 표면 · 저장 · 외부 호출이 없다. 유예 타이머는 실패 표시만 하며, 새 테스트는 모두 전송 수를 센다(T-akj-03).

## Self-Check: PASSED

- 수정 파일 9개가 존재한다.
- 커밋 `7fd7da49` · `214ae025` · `808a29a2` 가 존재한다(`git log` 확인).
- `git rev-list --count b2e6d5c3..HEAD` = 3.
