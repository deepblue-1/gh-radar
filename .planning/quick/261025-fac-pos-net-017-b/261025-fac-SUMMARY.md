---
phase: quick-261025-fac
plan: 01
subsystem: webapp/analytics (매집감지 보고서 상세 차트)
status: complete
tags: [accum, chart, pos_net, sketch-017-B]
requires: [gh-trade payload.pos_net (inbox 261024-accum-hidden-carry10 「추가 2026-10-25」)]
provides:
  - AccumReportPayload.pos_net 선택 키 타입
  - posNetPointsOf · posNetPathOf · cumRangeOf(cum, pos) · cumTipAt 포지션 문구
  - 누적 판 포지션 순매수 계단(data-slot accum-pos-net-path) · 판 제목 분기 · 범례 분기 · 판정 기준 본문 2
affects: [webapp 매집감지 상세 /analytics/accum]
tech-stack:
  added: []
  patterns: [선택 키 선 단위 모양 방어(avgPxPointsOf 선례) · 스냅샷 툴팁(두 선 t 이하 마지막 사건)]
key-files:
  created: []
  modified:
    - packages/shared/src/accum-report.ts
    - webapp/src/lib/accum-chart.ts
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/lib/accum-report.ts
    - webapp/src/test-fixtures/accum-export.ts
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/lib/__tests__/accum-report.test.ts
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
decisions:
  - "pos_net 은 payloadOf 무변경 · posNetPointsOf 가 선 단위로 방어(키 없음/불량 → [] → 오늘 차트 그대로)"
  - "누적 판 툴팁은 두 선 스냅샷 — tk = 그날 · 포지션 중 t 이하 마지막 점 시각의 늦은 쪽 · 포지션 공백 판정은 posNetPathOf 조각 규칙과 짝"
  - "이월 종목 그날 팀 체결 0 이어도 「팀 체결 없음」 글자는 사실이라 유지"
  - "cumRangeOf 는 09:00 전 건너뛴 포지션 점 값도 범위에 포함(차이 작아 단순함 우선)"
  - "판정 기준 본문 2 는 상수라 pos_net 없는 옛 행에도 같은 글 — gh-trade 재생성으로 키가 생기므로 수용"
metrics:
  duration: ~12min
  completed: 2026-10-25
actuals:
  tokens: 7600   # diff 줄 바이트/4(한글 3바이트라 글자 기준보다 큼) — 계획 estimate 65000 은 문맥 포함 추정
  tasks: 3
  commits: 6
plan_head_before: da97a6d2
plan_head_after: f88226e4
---

# Phase quick-261025-fac Plan 01: 매집감지 누적 판 포지션 순매수 선(스케치 017 B) Summary

payload.pos_net(이월 포함 · 우리 체결 제외)을 누적 판 주인공 굵은 --team 계단(cycle · end≠0 끊김 · 09:00 맞춤 · 열린 마지막 조각만 20:00)으로 그리고, 그날 계단(day_cum_net)은 --muted-fg 1 · .7 보조로 내렸다. 두 선은 한 축을 쓰고 판 제목 · 범례(10항목) · 툴팁(「포지션 순매수 ±Y억(이월 포함)」 / 「포지션 —」) · 판정 기준 본문 2 를 함께 바꿨다. pos_net 이 없는 옛 행은 오늘 모양 그대로다.

## Tasks

| # | Task | RED | GREEN |
|---|------|-----|-------|
| 1 | 트레이서 — shared 타입 → 기하 → 차트 레이어 · 회색 그날 계단 · 합친 축 · 판 제목 · posNet 픽스처 | 132c9d94 | 52990557 |
| 2 | 포지션 툴팁 · 기하 경계 잠금 · posNetCarry 픽스처 | 499ad5c4 | 687dc7db |
| 3 | 범례 두 항목(pos 있을 때만) · 판정 기준 본문 2 | ddde8a54 | f88226e4 |

트레이서 피드백 게이트: Task 1 verify(accum-detail + accum-chart) 재실행 통과 → 확장 진행.

## Verification

- vitest(--maxWorkers=2): accum-chart.test.ts 76 · accum-detail.test.tsx 30 · accum-report.test.tsx 30 · accum-report.test.ts 32 = **168 passed / 0 failed**
- shared build · shared typecheck 통과 · webapp typecheck(tsc + e2e tsconfig) 통과
- eslint(지정 8파일): 0 errors · 4 warnings(전부 기존 줄 — accum-report.test.ts 339~341 `_side/_px/_cum`, accum-export.ts 46 `_payload` · 이번 변경 무관)
- 산출물 grep 4개 통과
- Playwright · e2e · 전체 회귀 미실행(계획 범위 밖 · 동시 세션 메모리 보호)

## Deviations from Plan

None - plan executed exactly as written.

(참고: Task 2 RED 시점에 기하 경계 테스트 · (f3) 는 Task 1 구현으로 이미 통과 — 계획이 허용한 「경계 잠금」. 실패는 툴팁 3건 + (f4) 였다.)

## Known Stubs

None.

## Self-Check: PASSED

- 수정 파일 9개 존재 · 커밋 6개(132c9d94 · 52990557 · 499ad5c4 · 687dc7db · ddde8a54 · f88226e4) 모두 HEAD 조상 · Co-Authored-By 없음 · push/배포 없음
