---
phase: 27-auto-sell-integration
review: 27-REVIEW-R3.md
round: 3
updated: 2026-10-10
open: 0
total: 4
---

# Phase 27 — 3라운드 리뷰 처분 기록

2라운드 처분은 27-REVIEW-R2-DISPOSITION.md 가 정본. 이 표는 3라운드(b9e03bed · 0948efe5 — WR-R2-01/02 수정분) 발견만 다룬다.
처분: `open`(기록됨·미분류) · `fixed` · `skipped` · `deferred`. 사유는 Source 칸.

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| WR-R3-01 | warning | fixed | 28857466 — quick-261010-jix (relay 출처만 무응답 뒤 LC_ORPHAN_WAIT_MS 로 묶음 · 키 출처는 늦은 창 내내) |
| WR-R3-02 | warning | fixed | af93ea10 — quick-261010-jix (켜짐 → 꺼짐은 start 대기만 끊음 — stop 은 settleAutoSell 이 먼저 풂) |
| IN-R3-01 | info | fixed | 28857466 — quick-261010-jix |
| IN-R3-02 | info | fixed | af93ea10 — quick-261010-jix |
