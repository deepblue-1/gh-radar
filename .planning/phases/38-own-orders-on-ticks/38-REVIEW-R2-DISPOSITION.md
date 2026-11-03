---
phase: 38
review: 38-REVIEW-R2.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "호가 근거(ev_kind 1)는 여전히 중복 B6 를 근거 행으로 고른다 — 원 WR-03 이 절반만 닫혔다"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "당일 대기 판정이 짝을 찾을 수 있는 체결까지 「전문 아직 안 옴」 으로 내린다 — 장 마감 · 한산한 종목에서는 영구"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "다시 받기 실패 뒤 낡은 우리 층이 새 세션 위에 표시 없이 남는다 — `status` 를 읽는 곳이 없다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "체결 안정 키 `gateway|seq` 는 하루 안에서도 유일하지 않을 수 있다 — 원천 PK 는 `(gateway, journal_epoch, seq)`"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "골든 「skip 을 넘겨도 오라클 그대로」 블록은 구조상 실패할 수 없다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "WR-04 배선(뷰어의 키 기억 · 렌더 때 풀기)을 덮는 테스트가 없고, 기준 rec 는 다시 풀지 않는다"
open: 0
fixed: 6
total: 6
recorded: 2026-11-04T04:32:00.000Z
---

# Phase 38: Code Review Disposition — R2

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 38-REVIEW-FIX-R2.md (R2-WR-01) |
| WR-02 | warning | fixed | 38-REVIEW-FIX-R2.md (R2-WR-02) — 장중 한산한 종목 대기는 서버 응답 시각 필요(후속) |
| WR-03 | warning | fixed | 38-REVIEW-FIX-R2.md (R2-WR-03) |
| IN-01 | info | fixed | 38-REVIEW-FIX-R2.md (R2-IN-01) — 클라 완화만, RPC `journal_epoch` 노출은 후속 |
| IN-02 | info | fixed | 38-REVIEW-FIX-R2.md (R2-IN-02) |
| IN-03 | info | fixed | 38-REVIEW-FIX-R2.md (R2-IN-03) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
R2 의 finding id 는 38-REVIEW-R2.md 기준이다(R1 장부 38-REVIEW-DISPOSITION.md 와 id 가 겹친다).
