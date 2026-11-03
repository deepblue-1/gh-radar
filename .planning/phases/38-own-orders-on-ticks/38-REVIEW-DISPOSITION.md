---
phase: 38
review: 38-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "카드 체결 줄이 음수 시각차를 「+-NNms」 로 그린다 — 짝지은 체결의 약 절반"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "당일 끝자락 체결이 「대기」 가 아니라 더 이른 같은 가격 A3 에 잘못 짝지어진다"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "짝짓기 · 근거 특정이 중복 A3(같은 보드 · seq 재수신)를 거르지 않는다"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "고른 우리 줄(`ownPick`)을 id 로 기억해서 own 을 다시 받으면 다른 주문 · 체결을 가리킬 수 있다"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "「최신 받기」 때 own 조회가 한 번 실패하면 받아 둔 우리 층이 통째로 사라진다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "클라 재정렬 키가 RPC 정렬(「차감 순서의 정본」)과 다르다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "카드 「보기 ›」 · 「우리 주문」 표 행 클릭 · `onOwnOrder` 폴백도 고른 줄을 풀지 않는다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`useTickOwn` 모양 검사가 `events` · `orders` 를 보지 않는다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "근거 종류 낱말 「체결 구간」 만 shared 라벨 밖에 하드코딩"
open: 0
fixed: 9
total: 9
recorded: 2026-11-04T04:32:00.000Z
---

# Phase 38: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 38-REVIEW-FIX.md |
| WR-02 | warning | fixed | 38-REVIEW-FIX.md |
| WR-03 | warning | fixed | 38-REVIEW-FIX.md |
| WR-04 | warning | fixed | 38-REVIEW-FIX.md |
| WR-05 | warning | fixed | 38-REVIEW-FIX.md |
| IN-01 | info | fixed | 38-REVIEW-FIX-R2.md (R1-IN-01) |
| IN-02 | info | fixed | 38-REVIEW-FIX-R2.md (R1-IN-02) |
| IN-03 | info | fixed | 38-REVIEW-FIX-R2.md (R1-IN-03) |
| IN-04 | info | fixed | 38-REVIEW-FIX-R2.md (R1-IN-04) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
