---
phase: 44
review: 44-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "「다시 반영」 을 거치지 않은 고치기 · 지우기 · 정산 취소에서 예수금이 두 번 들어가거나 되돌려지지 않는다"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "거래 시트의 「오늘」 이 마지막으로 불러온 시각에 고정돼, 자정을 넘긴 탭에서는 오늘 날짜를 저장할 수 없다"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Generality without instantiation — `AccountTable` 의 `labels` prop 을 넘기는 곳이 없다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "지우기 · 정산 취소는 되돌릴 증감을 보내기 전에 남기지 않는다(저장 경로와 다름)"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "쥬니 묶음 「원금 4억까지 … 남음」 문구가 0 일 때와 지난 정산이 있을 때 사실과 다르다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "음수 예수금 하나가 읽은 값 기록 전체를 실패시키고, 화면에는 「미설정」 으로 보인다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "반영했던 거래를 「예수금에도 반영」 을 끄고 고치면, 예수금에 들어간 증감의 기록이 사라진다"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "쓰기 요청에 멱등 키가 없고, 같은 계좌 동시 반영은 읽고-고치고-쓰기 경합이다"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "`settlementBudgetOf` 의 `as unknown as` 캐스트가 계좌 메뉴 입력 모양 검사를 끈다"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "`SETTLEMENT_WRITE_TIMEOUT_MS` 주석이 실제 보내기 순서와 다르다"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "미리 보기는 못 읽은(stale) 계좌도 바뀔 값으로 보이지만, server 는 그 계좌를 보내지 않는다"
open: 0
total: 11
recorded: 2026-11-21T02:43:23.618Z
---

# Phase 44: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 44-REVIEW-FIX.md |
| WR-01 | warning | fixed | 44-REVIEW-FIX.md |
| WR-02 | warning | fixed | 44-REVIEW-FIX.md |
| IN-01 | info | fixed | 44-REVIEW-FIX.md |
| IN-02 | info | fixed | 44-REVIEW-FIX.md |
| IN-03 | info | fixed | 44-REVIEW-FIX.md |
| IN-04 | info | fixed | 44-REVIEW-FIX.md |
| IN-05 | info | fixed | 44-REVIEW-FIX.md |
| IN-06 | info | fixed | 44-REVIEW-FIX.md |
| IN-07 | info | fixed | 44-REVIEW-FIX.md |
| IN-08 | info | fixed | 44-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
