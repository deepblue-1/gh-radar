---
phase: quick-260923-cre
plan: 01
subsystem: webapp/home
status: complete
tags: [home, clipboard, copy, solo-card, e2e]
requires: [quick-260914-jtj CopyTextButton, home-format]
provides: [formatSingleBlock, formatSinglesSummary, SoloCard 급등이유 복사 버튼, 개별 급등 전체 복사]
affects: [webapp/src/components/home]
tech-stack:
  added: []
  patterns: [stretched-link 형제 z-20 버튼, 섹션 헤더 헬퍼 공유(snapshotHeader)]
key-files:
  created: []
  modified:
    - webapp/src/components/home/home-format.ts
    - webapp/src/components/home/solo-card.tsx
    - webapp/src/components/home/home-client.tsx
    - webapp/src/components/home/__tests__/home-format.test.ts
    - webapp/src/components/home/__tests__/solo-card.test.tsx
    - webapp/src/components/home/__tests__/home-client.test.tsx
    - webapp/e2e/specs/home.spec.ts
decisions:
  - "카드 복사 버튼은 오버레이 Link 의 형제 + CopyTextButton wrapper z-20 (preventDefault 없음) — 실브라우저 force 없는 클릭으로 hit-test 증명"
  - "formatThemesSummary·formatSinglesSummary 가 비공개 snapshotHeader 하나를 공유 — 주도 테마 출력은 바이트 동일"
  - "-my-1 로 32px 아이콘 박스를 상쇄해 SoloCard 헤더 행 높이 27px 유지(390·1280 실측)"
metrics:
  duration: 9min
  completed: 2026-09-23
actuals:
  tokens: 6000
  tasks: 3
  commits: 3
plan_head_before: 25cf420f2358f1f4ec530840fc36ba5b49739bb2
---

# Phase quick-260923-cre Plan 01: 개별 급등 급등이유 복사 Summary

개별 급등 섹션에 카드별 아이콘 복사('{종목명} {+x.x%}' + reason 줄)와 제목 행 '전체 복사'('[개별 급등] {tradeDate} {KST HH:MM}' + 번호 블록)를 추가했다. 기존 CopyTextButton 을 고치지 않고 재사용했고, 버튼은 stretched-link 오버레이(z-10) 위 z-20 형제라 눌러도 상세로 이동하지 않는다.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 카드별 급등이유 복사 (tracer) — formatSingleBlock + SoloCard 아이콘 버튼 | 6e0a01a | home-format.ts, solo-card.tsx, solo-card.test.tsx, home-format.test.ts |
| 2 | 개별 급등 제목 행 '전체 복사' — formatSinglesSummary + snapshotHeader 공유 + HomeClient 배선 | e26599c | home-format.ts, home-client.tsx, home-format.test.ts, home-client.test.tsx |
| 3 | 실브라우저 E2E(클립보드·hit-test·390px) + 게이트 + 시각 점검 | cf3a665 | e2e/specs/home.spec.ts |

TDD: Task 1 은 새 테스트 7건, Task 2 는 5건이 구현 전에 실패하는 것(RED)을 먼저 확인한 뒤 구현해 통과시켰다(GREEN).

## Verification

- `pnpm -C webapp test`: 테스트 파일 92개 통과, 테스트 1479 통과 · 1 skip(기존)
- `pnpm -C webapp typecheck` (app + tsconfig.e2e): 통과
- `pnpm --filter @gh-radar/webapp lint`: exit 0. 경고 3건은 모두 이번 변경과 무관한 파일에 원래 있던 것(theme-detail-client.tsx, strategy-status-card.test.tsx, use-relay-socket.ts)
- E2E `playwright test e2e/specs/home.spec.ts`: **11/11 통과**(마지막 실행 기준, setup 포함). 첫 실행에서는 새 테스트는 통과했지만 기존 테스트 'C(종목 → 상세)' 가 1건 실패했다. 원인은 dev 서버가 `/stocks/[code]` 를 처음 컴파일하느라 `toHaveURL` 5초를 넘긴 것이다. ThemeCard 는 이번 작업에서 건드리지 않았다. 단독 재실행(--repeat-each 2)과 전체 재실행 모두 통과했으니 콜드 컴파일 때문에 흔들리는 테스트로 본다.
- 그렙: `formatSingleBlock(single)` 1줄, `formatSinglesSummary(snapshot, singles)` 1줄. `git diff 25cf420 -- copy-text-button.tsx` 는 비어 있음(D-03).

## 시각 점검 (390px / 1280px, 임시 스크린샷 — 확인 후 임시 spec 삭제)

- SoloCard 헤더 행 높이는 390·1280 모두 27px 로 전과 같다(-my-1 이 32px 박스를 상쇄). 종목명·코드·등락%·아이콘이 한 줄이다.
- '복사됨' 말풍선은 아이콘 위에 뜨고 등락%를 가리지 않는다. 390px 에서는 제목 행 '전체 복사' 바로 아래 몇 px 거리까지 가지만 겹치지 않는다(E2E 교차 단언 통과).
- 제목 행 '전체 복사' 는 "개별 급등 N" 행 오른쪽 끝에 붙어, 주도 테마 행과 같은 배치다.
- 줄바꿈·잘림·겹침이 없어 고친 것은 없다.

## Deviations from Plan

None - plan executed exactly as written.

## Notes

- 작업 중 다른 세션이 만든 추적되지 않은 디렉터리 `.planning/quick/260923-cqj-relay-27-57-supabase-stocks/` 가 나타났다. 손대지 않았고 스테이징하지 않았다.
- 커밋은 프로젝트의 quick 관례와 오케스트레이터 지시대로 master 에 직접 했고, push 는 하지 않았다.

## Threat Flags

None — 새 네트워크·인증 표면은 없다. 일반 텍스트 writeText 만 쓴다(T-cre-01).

## Self-Check: PASSED

- 수정한 파일 7개가 모두 존재한다.
- 커밋 6e0a01a, e26599c, cf3a665 가 git log 에 있다.
