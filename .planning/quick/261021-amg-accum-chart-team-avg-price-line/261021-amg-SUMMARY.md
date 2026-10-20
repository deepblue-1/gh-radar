---
phase: quick-261021-amg
plan: 01
subsystem: webapp/analytics (매집감지 상세 차트)
tags: [accum, chart, svg, avg_px, legend]
status: complete
requires:
  - gh-trade quick-261021-3rf payload.avg_px (7번째 키)
provides:
  - AccumReportPayload.avg_px 선택 키
  - avgPxPointsOf · avgPxPathOf 순수 기하
  - 가격 판 팀 평단 계단 path[data-slot=accum-team-avg-path]
  - 범례 「팀 평단」(9항목)
affects:
  - 34-UI-SPEC A5 · A6
tech-stack:
  added: []
  patterns:
    - 선택 키 모양 방어는 선 단위 함수가 맡는다(payloadOf 무변경 — pnlOf 와 같은 방식)
key-files:
  created: []
  modified:
    - packages/shared/src/accum-report.ts
    - webapp/src/lib/accum-chart.ts
    - webapp/src/lib/__tests__/accum-chart.test.ts
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/components/analytics/__tests__/accum-detail.test.tsx
    - webapp/src/components/analytics/accum-detail.tsx
    - webapp/src/components/analytics/__tests__/accum-report.test.tsx
    - .planning/phases/34-accum/34-UI-SPEC.md
decisions:
  - payloadOf 무변경 — avg_px 선 단위 방어는 avgPxPointsOf 가 맡는다(결측·불량이면 선만 생략, 행·차트 그대로)
  - 열린 마지막 평단 조각의 끝 = max(마지막 체결 칸 시각, 마지막 점 시각) — 가격 선과 같은 끝, T2000 연장 안 함
  - 평단은 가격 축 맞춤(priceRangeOf · D-14)에 넣지 않고 판 안 [lo, hi] 로 클램프만(WinForms AccumChartPanel 동형)
metrics:
  duration: ~15min
  completed: 2026-10-21
actuals:
  tokens: 8800
  tasks: 2
  commits: 3
plan_head_before: 61e15f3c
plan_head_after: 3aaf6c36
---

# Phase quick-261021-amg Plan 01: 매집감지 상세 팀 평단 계단 Summary

payload.avg_px(gh-trade 7번째 키)를 매집감지 상세 가격 판에 --up 1.25 `1 2` 점점선 계단으로 그린다. px 0 에서 끊기고, 09:00 전 점은 09:00 에 붙고, 판 안으로 클램프되며, 열린 끝은 마지막 체결 칸까지 간다. 범례에는 「팀 평단」 이 들어가 9항목이 되었다.

## Commits

| Task | Commit | 내용 |
|------|--------|------|
| 1 RED | c5a5983a | test: 팀 평단 계단 경로 · avg_px 모양 방어 · 가격 판 렌더 단언 (c8~c10) |
| 1 GREEN | 66e1c901 | feat: shared avg_px 선택 키 · avgPxPointsOf/avgPxPathOf · 가격 레이어 path |
| 2 | 3aaf6c36 | feat: 범례 「팀 평단」 · 스켈레톤 14칸 기대값 · 34 UI-SPEC A5 · A6 반영 |

## 검증

- vitest(`--maxWorkers=2`) 4파일(accum-chart · accum-report lib · accum-detail · accum-report 컴포넌트): 143 통과
- RED 확인: Task 1 신규 10건 실패 → GREEN 후 통과. Task 2 기대값 2건 실패 → GREEN 후 통과.
- shared build/typecheck · webapp typecheck(tsc + e2e tsconfig) · eslint 6파일 통과
- e2e `accum-report.spec.ts --workers=1`: 18/18 통과(setup 포함). 픽스처에 avg_px 가 없어 평단 선 없는 상태로 기존 단언 전부 유지됨. (reuseExistingServer 설정상 이미 떠 있던 3100 dev 서버를 재사용했을 수 있음 — 작업 트리 코드 그대로라 결과에 영향 없음)
- 계획 마무리 게이트(8경로만 · Co-Authored-By 없음 · 해당 경로 작업 트리 깨끗) 통과. accum-chart.ts 삭제 줄 0, accum-chart.tsx · accum-detail.tsx 삭제 줄은 주석뿐.

## 결정

- **payloadOf 무변경 — 선 단위 방어는 avgPxPointsOf.** avg_px 가 없거나(10/21 이전 export) 모양이 어긋나면 [] → 평단 선만 빠지고 KPI · 차트 · 사이클 표 · 손익은 그대로(c9 · c10 · lib 단언).
- 실측 픽스처(10/14)에는 avg_px 가 없어 라이브 자료 확인은 10/21 이후 적재분(운영 DB 10/1~10/20 재적재분 포함)으로 메인 세션 UAT 가 맡는다.

## Deviations from Plan

None - plan executed exactly as written. (UI-SPEC 레이어 5 문구는 「끊는다. · 그 위」 의 구두점을 「끊는다 · 그 위 … 동형).」 로 다듬음 — 내용 동일.)

## Self-Check: PASSED

- 8개 수정 파일 모두 존재, 커밋 c5a5983a · 66e1c901 · 3aaf6c36 모두 HEAD 조상.
