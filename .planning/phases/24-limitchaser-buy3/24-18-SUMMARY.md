---
phase: 24-limitchaser-buy3
plan: 18
subsystem: webapp 전략 카드 로그 귀속 · 다른 단말 배너
tags: [gap-closure, GC-WR-01, WR-05, strategy-log, strategy-card, tdd]
status: complete
requires: ["24-16"]
provides:
  - "echoAnswersSent(prev, sent, next) — 이 에코가 보낸 제출의 답인가(요청 변화가 하나라도 섰는가) · strategy-log 순수 함수"
  - "카드 거부 분기 = acceptAnswer 만 — 거부 통지는 보낸 제출 귀속의 끝이 아니다"
  - "에코 이펙트 귀속 · 소비 · 다른 단말 배너가 mine(echoAnswersSent) 판정 하나를 읽음"
  - "GC-WR-01 카드 흐름 6 케이스 · lib 표 10 케이스 · WR-05 거부 두 케이스 창 만료 뒤 재표현"
affects: [webapp 작업대 전략 카드 로그 · 상태 배너]
tech-stack:
  added: []
  patterns:
    - "귀속 판정 한 곳 — 거부 여부 · 서버 문구가 아니라 에코가 내 요청 변화를 싣는가로 판정"
key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/24-18-SUMMARY.md
  modified:
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
decisions:
  - "GC-WR-01: 거부 통지(isLimitChaserSetRejection)는 보낸 제출 귀속을 비우지 않는다 — 귀속의 끝은 내 요청 변화를 싣은 에코 소비 · 결과 모름 창(ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS) 만료 두 수평선"
  - "GC-WR-01: 귀속 판정은 strategy-log echoAnswersSent 한 곳 — 요청 변화(식별 3 · crud 제외, 후매수 단계 전이면 override 4필드 제외) 중 하나라도 섰으면 답. 싣지 않은 에코는 귀속을 받지도 소비하지도 않는다"
  - "창 안의 같은 변화 에코는 다른 단말이 만든 것이라도 내 답으로 읽는다(다른 탭 거부 팬아웃 뒤 내 에코와 구별 불가 · 에코 상태가 내 요청과 같음) — 24-24 체크포인트에서 사용자 확인 대상"
metrics:
  duration: "8 min (2026-09-28 08:40Z ~ 08:49Z)"
  completed: "2026-09-28"
  tasks: 2
  files: 5
actuals:
  tokens: 9200
  tasks: 2
  commits: 2
plan_head_before: 229526abcfdb13ed3767f943728f1da201c51b91
commits: 2
requirements-completed: []
coverage:
  - deliverable: "echoAnswersSent 순수 함수(부분 거부 · 요청 변화 없음 · 첫 스냅샷 · 후매수 단계 전이 override 제외 · 식별/crud 제외)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/strategy-log.test.tsx#echoAnswersSent — 이 에코가 보낸 제출의 답인가 (GC-WR-01)"
        status: pass
  - deliverable: "부분 거부 · 다른 탭 거부 뒤 내 제출의 에코가 내 것으로 귀속(동반 · serverFold 문장 · 거짓 배너 없음)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#GC-WR-01 — 부분 거부 · 다른 탭 거부 뒤 내 제출의 에코는 내 것이다 (24-VERIFICATION-R2 갭 1)"
        status: pass
  - deliverable: "round-1 WR-05 의도 유지(창 만료 뒤 무관 에코에 사유 안 붙음 · 창 안 무관 에코 비소비) · 재전송 0"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#WR-05 — 거부 · 무응답 제출의 사유는 그 사건에만 귀속된다 (24-VERIFICATION 갭 5)"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp exec vitest --run (125 files · 2779 passed · 1 skipped)"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
---

# Phase 24 Plan 18: GC-WR-01 — 부분 거부 · 다른 탭 거부 뒤 내 제출의 에코 귀속 Summary

**거부 통지로 보낸 제출 귀속을 끊던 24-11 분기를 걷고, 귀속을 `echoAnswersSent`(에코가 내 요청 변화를 하나라도 싣는가) 한 곳에서 판정하도록 바꿨다. 이제 gh-trade 부분 거부(ERROR 뒤 같은 제출의 에코)나 다른 탭 거부가 팬아웃된 뒤에도 D-01/D-02 동반 문장과 serverFold 문장이 그대로 서고, 거짓 「다른 단말에서 변경됐어요」 배너는 서지 않는다.**

## 수행 시간

- 시작 2026-09-28T08:40:53Z · 끝 2026-09-28T08:49Z · 약 8분
- 태스크 2 · 코드/테스트 파일 5

## 한 일

- **lib** `strategy-log.tsx` — `echoAnswersSent(prev, sent, next)` 를 `limitChaserValuesChanged` 옆에 새로 두었다. 판정에서 빼는 키는 모듈 스코프 `ECHO_ANSWER_SKIP` 하나(isin · accountNo · exchange · crud)다. 단계 전이 판정은 기존 `isPostBuyPhaseFlip` · `POST_BUY_OVERRIDE_SET` 을 재사용했다. 규칙은 이렇다. `prev === null` 이면 참이다. 요청 변화가 하나라도 `next` 에 섰으면 참이다. 요청 변화가 없거나 하나도 서지 않았으면 거짓이다.
- **카드** `strategy-card.tsx`
  - 거부 분기는 `acceptAnswer()` 만 남겼다. 귀속을 비우던 두 줄을 지우고, 주석을 사실대로 고쳤다. 전면 거부는 거래소 화이트리스트 · NXT 미거래 두 갈래뿐이고, 부분 거부는 ERROR 뒤에 에코가 온다.
  - 에코 이펙트에 `const mine = sent !== null && echoAnswersSent(prev, sent, server)` 를 넣었다. 귀속은 `mine` 일 때만 소비한다. `attributed = cause !== null || !mine ? null : sent` 이고, 다른 단말 배너는 `!mine` 을 읽는다.
  - `pendingRef` · `pendingCauseRef` JSDoc 의 수명 문장과 에코 이펙트 (iii)(iv) 문단을 새 규칙에 맞췄다.
- **테스트**
  - GC-WR-01 describe 6 케이스: 부분 거부 · 부분 거부 serverFold · 다른 탭 거부 팬아웃 · 창 안 무관 에코 비소비 · 거부 없는 경합 비소비 · 같은 변화 에코 정책 명시. 모든 케이스가 `send` 0 을 단언한다.
  - lib 표 10 케이스.
  - WR-05 describe 의 거부 두 케이스는 거부 뒤 `WINDOW_MS` 를 진행한 다음 무관 에코를 주도록 다시 썼다. 기대값은 바꾸지 않았다.

## TDD 기록

- **① RED (Task 1):** GC-WR-01 카드 두 케이스를 먼저 쓰고 돌리니 2건 모두 실패했다. 부분 거부 케이스는 로그에 `선매수 체크 — 매수주문도 켬` 이 없었다. 거부 분기가 귀속을 비워 개별 전이 문장과 「다른 단말」 줄이 섰기 때문이다. serverFold 케이스는 최상단이 `서버가 매수 그룹 해제 — …` 가 아니라 `매수주문 무장 해제` 였다.
- **GREEN:** lib 함수와 카드 판정을 넣은 뒤 두 파일 116 → 125 케이스가 모두 통과했다. 이때 WR-05 거부 두 케이스가 예상대로 실패해, 결과 모름 창 만료 뒤로 재표현했다.
- **Task 2 회귀 가드:** 추가한 4 케이스는 Task 1 코드로 바로 통과했다. 판정의 빈틈은 없었다. 이 가드가 실제로 무언가를 잡는지 변이 검사로 확인했다. 귀속 소비를 `if (true)` 로 바꾸면 비소비 두 케이스(창 안 무관 에코 · 거부 없는 경합)가 실패한다. 확인 뒤 원복했다.

## 태스크 커밋

| Task | 이름 | 커밋 |
|------|------|------|
| 1 (tracer) | 부분 거부 에코 귀속 · echoAnswersSent · 거부 분기 acceptAnswer 만 · WR-05 재표현 | `027844e4` |
| 2 | 다른 탭 · 창 안 무관 · 거부 없는 경합 · 정책 명시 회귀 · 카드 주석 정리 | `701c25c1` |

트레이서 피드백 게이트: `end-of-phase` 모드에 automated-only verify 라 `<verify>` 를 다시 돌렸고 green 이었다. `⚡ Tracer verified end-to-end — expanding`.

## 검증

- `vitest --run strategy-log.test.tsx strategy-card-flow.test.tsx` → 2 files · 125 passed
- `vitest --run strategy-card-flow · strategy-card · card-body · strategy-log` → 4 files · 200 passed
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` → 에러 0
- webapp 전체 `vitest --run` → 125 files · 2779 passed · 1 skipped
- `send` 호출 수 불변: GC-WR-01 · WR-05 모든 케이스가 `sendMock` 미호출을 단언한다

## 계획과 달라진 점

### 자동 수정

**1. [Rule 1 - 테스트 픽스처] strategy-card.test 두 카드 격리 프로브의 보낸 cfg 를 실제 요청 모양으로 맞춤**
- **발견:** Task 2 verify(`strategy-card.test.tsx` 포함)
- **문제:** 「카드 A 의 에코가 카드 B 의 pending·미반영을 건드리지 않는다」 케이스가 실패했다. 프로브는 서버 값과 같은 `{ buyEnabled: true }` 를 보내는데, 도착하는 A 에코는 `buyOrderQty: 2` 를 싣는다. 새 규칙에서는 요청 변화가 없는 제출이라 그 에코가 내 답이 아니고, 그래서 「다른 단말」 배너가 섰다. 코드가 아니라 픽스처가 실제 제출을 흉내 내지 못한 것이다. 실제 폼은 바뀐 필드를 cfg 에 싣는다.
- **수정:** 프로브가 보내는 cfg 를 `{ buyEnabled: true, buyOrderQty: 2 }` 로 바꾸고 근거 주석을 달았다. 이 파일은 플랜 `files_modified` 밖이지만, Task 2 verify 명령의 대상이다.
- **파일:** `webapp/src/components/trading/__tests__/strategy-card.test.tsx`
- **커밋:** `701c25c1`

**2. [Rule 1 - 주석 사실 오류] 거부 통지 주석의 「거부에는 60 에코가 없다 — 유일한 답」 문장 정정**
- **발견:** Task 1
- **문제:** 이 문장은 부분 거부를 포함하면 거짓이다. 플랜의 WR-05 문단 수정 범위 바로 위에 있었다.
- **수정:** 전면 거부(거래소 두 갈래)만 에코가 없고, 부분 거부는 뒤에 에코가 온다고 고쳤다.
- **커밋:** `027844e4`

**합계:** 자동 수정 2건(테스트 픽스처 1 · 주석 1). **영향:** 동작 범위는 플랜 그대로다. 와이어 · 전송 · relay 변경은 0 이다.

## Known Stubs

없음.

## 남은 판단 · 다음

- 창 안에서 다른 단말이 내 요청과 같은 변화를 만든 에코를 내 답으로 읽는 정책(T-24-64 accept)은 24-24 체크포인트의 사용자 확인 항목이다. relay 소켓 상관을 넣어 가리는 방안은 이월됐다.
- 다음: 24-19

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/strategy-log.tsx (`export function echoAnswersSent` 1)
- FOUND: webapp/src/components/trading/card/strategy-card.tsx (`echoAnswersSent(prev` 1 · `if (!mine && prev !== null && limitChaserValuesChanged(prev, server))` 1 · 거부 분기 `Ref.current = null` 0 · `GC-WR-01` 8)
- FOUND: strategy-card-flow.test.tsx GC-WR-01 describe 1 · `it(` 6 · WR-05 거부 두 케이스 `WINDOW_MS` 각 1 이상
- FOUND: strategy-log.test.tsx echoAnswersSent describe 1
- FOUND: 027844e4 · 701c25c1 (git log)
