---
phase: 18-gh-trade-ui-nxt-vi
plan: 02
subsystem: ui
tags: [design-tokens, globals-css, container-query, limit-chaser, refactor]
status: complete

requires:
  - phase: 17
    provides: "--led-* 양쪽 테마 정의 선례, §2.2b 4밴드 정본 표"
provides:
  - "--new-bg / --new-bd 토큰 (globals.css §9 :root 라이트 + .dark 다크 양쪽)"
  - "§2.2b 「이 표를 재는 컨테이너는 둘이다 — lc · wb」 문단 (밴드 수치 표 무변경)"
  - "parseStrategyKey 가 @/lib/limit-chaser 에서 strategyKey 와 짝을 이룸"
affects: [18-03, 18-04, 18-05, 18-06, 18-07, trading-workbench, strategy-card, breakout-strip, vi-trigger-strip]

actuals:
  tokens: 2500
  tasks: 2
  commits: 3
plan_head_before: f91f32f40716abcdae241bdbe8ea417bb1adf235

tech-stack:
  added: []
  patterns:
    - "새 색 토큰은 :root/.dark 양쪽 정의 + 쓰이는 자리를 주석에 명시 (--led-* 선례)"
    - "§2.2b 에는 측정 대상(컨테이너)만 추가하고 경계 숫자는 재기재하지 않는다"

key-files:
  created: []
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx

key-decisions:
  - "parseStrategyKey 는 따옴표 스타일까지 원문 그대로 이동(순수 이동 계약) — lib 파일의 작은따옴표 관례와 달라도 바꾸지 않음"
  - "컴포넌트 테스트의 parseStrategyKey describe 블록은 삭제하고 lib 테스트로 흡수 — 재-export 없이 정의·테스트가 한 곳"
  - "카드 헤더 한 줄 접힘 경계는 §2.2b 네 번째 경계가 아닌 컴포넌트 로컬 규칙으로 명시하되 숫자는 적지 않음"

requirements-completed: [TRADE-09]

coverage:
  - deliverable: "--new-bg/--new-bd 라이트·다크 양쪽 정의, --ctl-h 미승격"
    human_judgment: false
    verification:
      - kind: command
        ref: "grep -c -- '--new-bg:' / '--new-bd:' webapp/src/styles/globals.css → 각 2 ; ! grep -q -- '--ctl-h'"
        status: pass
  - deliverable: "§2.2b lc/wb 컨테이너 문단 (밴드 표 무변경)"
    human_judgment: false
    verification:
      - kind: command
        ref: "git diff c807651~1 c807651 -- globals.css 삭제 줄 0 (추가만)"
        status: pass
  - deliverable: "parseStrategyKey lib 이동 + 왕복/형식 어긋남 테스트"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#parseStrategyKey — 전략 키 분해 (strategyKey 의 짝)"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass

duration: 2 min
completed: 2026-09-22
---

# Phase 18 Plan 02: 디자인 시스템 바닥 — 신규/미확인 토큰 · 컨테이너 둘 문단 · parseStrategyKey 이동 Summary

**globals.css §9 에 신규/미확인 강조 토큰 `--new-bg`·`--new-bd` 를 라이트·다크 양쪽으로 승격하고, §2.2b 에 lc(카드 본문)·wb(작업대 본문) 두 컨테이너 문단을 숫자 재기재 없이 추가했으며, `parseStrategyKey` 를 `lib/limit-chaser.ts` 의 `strategyKey` 옆으로 순수 이동했다.**

## Performance

- **Duration:** 약 2분
- **Completed:** 2026-09-22
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `--new-bg`/`--new-bd` 가 `:root`·`.dark` 에 각 1회씩 정의 — 쓰이는 자리 네 곳과 「양쪽 정의」 경고 주석 포함. 목업 전용 `--ctl-h` 는 옮기지 않음.
- §2.2b 끝에 「이 표를 재는 컨테이너는 둘이다」 문단 — `lc`/`wb` 각각의 쓰임, 「밴드 수치는 위 표 그대로, 측정 대상만 다르다」, 카드 헤더 로컬 경계는 네 번째 경계가 아님. 포털 규율 문단에 「카드가 여럿이라 바 문구에 종목명을 쓴다」 한 줄.
- `parseStrategyKey` 정의·docstring·실패 분기를 한 글자도 바꾸지 않고 이동, 호출부는 import 만 교체. 왕복·형식 어긋남 테스트 추가.

## Task Commits

1. **Task 1: 토큰 승격 + §2.2b 문단** - `c807651` (feat)
2. **Task 2: parseStrategyKey 이동** - `66b7ced` (test, RED) → `46ad97b` (feat, GREEN)

## Files Created/Modified
- `webapp/src/styles/globals.css` - §9 토큰 2건 × 2테마, §2.2b 문단·포털 한 줄 (추가만, 삭제 0줄)
- `webapp/src/lib/limit-chaser.ts` - `parseStrategyKey` 합류
- `webapp/src/lib/__tests__/limit-chaser.test.ts` - 분해·형식 어긋남·왕복 테스트
- `webapp/src/components/trading/limit-chaser-client.tsx` - 정의 제거, `@/lib/limit-chaser` import
- `webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx` - 중복 parseStrategyKey 블록 제거(lib 테스트로 흡수)

## TDD Gate Compliance
- RED `66b7ced`: lib 테스트 3건 실패 확인 (`parseStrategyKey is not a function`)
- GREEN `46ad97b`: 102/102 (관련 2파일), 전체 webapp 1015 passed | 1 skipped
- REFACTOR: 변경 없음 (순수 이동)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 컴포넌트 테스트가 `../limit-chaser-client` 에서 parseStrategyKey 를 import**
- **Found during:** Task 2
- **Issue:** 정의 제거 후 `limit-chaser-client.test.tsx` 가 사라진 export 를 import — 계획의 `<files>` 목록에 없던 파일
- **Fix:** 해당 import 와 describe 블록을 제거하고, 같은 케이스(+추가 케이스)를 lib 테스트로 흡수. 재-export 를 두지 않아 정의가 한 곳만 남음
- **Files modified:** webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
- **Commit:** 46ad97b

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** 테스트 커버리지 감소 없음 — 이동만.

## Issues Encountered
- `pnpm --filter @gh-radar/webapp test -- limit-chaser` 는 `--` 뒤 필터가 vitest 로 전달되지 않아 전체 스위트(73파일)가 돈다. 결과는 exit 0 이라 검증은 통과하지만 필터 효과는 없다(기존 동작, 범위 밖).

## Next Phase Readiness
- 후속 UI 플랜(스트립·카드·격자·호가 탭)이 `--new-bg`/`--new-bd` 와 `lc`/`wb` 규율, `@/lib/limit-chaser` 의 `parseStrategyKey` 를 바로 사용 가능. Ready for 18-03.

## Self-Check: PASSED
- 파일 5개 존재, 커밋 c807651 · 66b7ced · 46ad97b 존재 확인
- typecheck exit 0, `export function parseStrategyKey` 1회, 컴포넌트 쪽 정의 0회
