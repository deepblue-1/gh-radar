---
phase: 28-limitup-feature-ingest
review: 28-REVIEW-R2.md
round: 2
updated: 2026-10-10
open: 6
total: 9
---

# Phase 28 — 2라운드 리뷰 처분 기록

1라운드(28-REVIEW.md) 처분은 28-REVIEW-FIX.md(all_fixed 11) 가 정본. 이 표는 2라운드 발견만 다룬다.
처분: `open`(기록됨·미분류) · `fixed` · `skipped` · `deferred`. 사유는 Source 칸.

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| WR-R2-01 | warning | fixed | quick-261010-h22 — 가드 = 직전 재조회 꼬리 이동 + 최소 간격 60초 · 회귀 테스트(상한 뒤 축출 연속) |
| WR-R2-02 | warning | fixed | quick-261010-h22 — purgeOld 실패를 result.purgeError 로 · main 판정(stale 로그 보존) |
| IN-R2-01 | info | open | - |
| IN-R2-02 | info | fixed | quick-261010-h22 — Freshness.calendarStale + `limitup-sync calendar stale` warn |
| IN-R2-03 | info | open | - |
| IN-R2-04 | info | open | - |
| IN-R2-05 | info | open | - |
| IN-R2-06 | info | open | - |
| IN-R2-07 | info | open | - |
