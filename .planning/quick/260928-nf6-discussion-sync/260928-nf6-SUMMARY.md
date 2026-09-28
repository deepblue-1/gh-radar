---
phase: quick-260928-nf6
plan: 01
subsystem: workers/discussion-sync
tags: [discussion-sync, budget, api_usage, bugfix]
status: complete
requires: []
provides:
  - "하한 기준 사전 예산 판정 (MIN_REQUESTS_PER_STOCK = 1)"
  - "판정 근거 로그 필드 {budgetBefore, targets, minRequired, remaining, cap}"
affects:
  - "discussion-sync 매 정각 Cloud Run Job 실행 (오후 skip 해소)"
tech-stack:
  added: []
  patterns: ["사전 판정은 정확한 하한만, 상한은 요청 단위 원자적 하드캡"]
key-files:
  created:
    - workers/discussion-sync/tests/index.budget.test.ts
  modified:
    - workers/discussion-sync/src/index.ts
decisions:
  - "discussion-sync 사전 예산 판정은 남은 예산 < 종목 수 × 1 일 때만 skip, 상한은 onRequest 원자적 하드캡이 지킨다 (모드 사전 재현안은 종목별 DB 왕복·로직 중복으로 기각)"
metrics:
  duration: "~10m"
  completed: 2026-09-28
  tasks: 3
  files: 2
actuals:
  tokens: 3000
  tasks: 3
  commits: 1
plan_head_before: 70ff39ce201a5357ca6f829192a86aa7015fabdc
commits: 1
---

# Quick 260928-nf6: discussion-sync 사전 예산 판정 하한 교체 Summary

discussion-sync 의 사전 예산 판정을 "종목 수 × 백필 최대 페이지(3,120)" 과대 추정에서 "남은 예산 < 종목 수 × 1" 하한 판정으로 바꿨다. 실제 상한은 기존 onRequest 원자적 하드캡이 그대로 지킨다. 2026-09-28 07:00Z skip 조건(1986/104/5000)을 회귀 테스트로 고정했다.

## 변경

- `workers/discussion-sync/src/index.ts`
  - `MIN_REQUESTS_PER_STOCK = 1` 상수와 근거 주석 추가 (page 0 onRequest 는 모드 무관 1회 보장 → 정확한 하한).
  - 사전 판정: `remaining = cap − budgetBefore`, `minRequired = targets × 1`, `remaining < minRequired` 일 때만 warn `budget would exceed — skipping cycle` 후 return. 필드 `{budgetBefore, targets, minRequired, remaining, cap}`. `expectedTotal` 필드는 제거.
  - 통과 시 info `budget precheck passed` (같은 5필드).
  - 하드캡 warn `daily budget exceeded mid-cycle — stopAll` 필드를 `{used, cap}` 로 확장. 문구·레벨·stopAll 흐름 불변.
  - docblock 3번 항목을 새 판정에 맞게 갱신.
- `workers/discussion-sync/tests/index.budget.test.ts` (신규, 4케이스)
  1. 재현: 1986/104/5000/백필 30 → skip 0회, collectDiscussions 104회, precheck info 정확 일치, totalRequests 104, budgetAfter 2090, stopAll false
  2. 부족: 4950 → skip warn 1회(remaining 50), 수집 0회, summary 없음, counter 불변
  3. 경계: 4896(remaining 104 == minRequired) → 실행, granted 104, counter 5000, stopAll false
  4. 하드캡: 4890, 종목당 2페이지(수요 208) → granted 정확히 110, 첫 hardcap warn cap 5000 · used > 5000, stopAll true
  - 모든 케이스 error 로그 0건 단언.

## RED → GREEN

- RED (구현 전, `-t 재현`): `Tests 1 failed` — `expected [ { obj: { …(3) }, …(1) } ] to have a length of +0 but got 1` (기존 warn 필드 `{budgetBefore:1986, expectedTotal:3120, cap:5000}` 로 skip). 나머지 3케이스도 구현 전 모두 실패(4 failed).
- GREEN (구현 후): `tests/index.budget.test.ts` 4/4 통과, 5회 반복 실행 모두 통과(동시성 3 하드캡 케이스 안정).

## 게이트

- `pnpm --filter @gh-radar/discussion-sync test`: 16 files passed, 86 passed | 3 todo (기준선 15 files / 82 passed → +1 file / +4 tests)
- `pnpm --filter @gh-radar/discussion-sync typecheck`: green
- `index.ts` 의 `log.error` 는 기존 `proxy abort signal — stopAll` 1곳뿐.
- 커밋 `80df4f59` (master, 두 파일만, 한국어, 공동 저자 트레일러 없음). push 안 함 — origin/master 대비 ahead 1.

## Deviations from Plan

- Task 1 에서 재현 케이스만 먼저 쓰는 대신 4케이스를 한 번에 작성하고 RED 를 확인했다(재현 케이스는 `-t` 로 단독 RED 확인). 결과·커밋 구성에는 영향 없음.
- 커밋은 플랜·사용자 규칙대로 master 에 직접 했다(GSD 기본 보호 브랜치 가드보다 오케스트레이터·플랜 지시 우선).

그 외 없음 — 플랜대로 실행.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: workers/discussion-sync/src/index.ts
- FOUND: workers/discussion-sync/tests/index.budget.test.ts
- FOUND: commit 80df4f59
