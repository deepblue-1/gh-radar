---
phase: 42
review: 42-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "마우스 이동 · 커서 한 칸마다 누적 거래대금 경로를 메모 없이 다시 계산(O(창 안 체결 수) · 중복 계산)"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "수익률 판 「팀 체결 없음」 · 눈금 표시가 창 안 값이 아니라 창 밖 커서 점까지 포함한 `day` 로 갈린다"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "키보드로 차트 종류를 바꾸면 초점이 `<body>` 로 떨어진다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "창 밖 커서 점이 당일 수익률 경로에 이어져 눈금 밖 대각선 조각을 만든다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "재생 중 커서 한 칸마다 열 샘플링 전체를 최대 두 번 다시 한다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "당일 증분마다 봉 집계가 BigInt 시각 변환을 세 번째로 반복한다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "일 이동평균이 「앞 거래일」 연속성을 검사하지 않는다"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "패널과 「비트까지 같아야 하는」 수익률 서식이 복제본으로만 묶여 있다"
open: 0
total: 8
recorded: 2026-11-13T11:22:10.177Z
---

# Phase 42: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 42-REVIEW-FIX.md |
| WR-02 | warning | fixed | 42-REVIEW-FIX.md |
| WR-03 | warning | fixed | 42-REVIEW-FIX.md |
| IN-01 | info | fixed | 42-REVIEW-FIX.md |
| IN-02 | info | fixed | 42-REVIEW-FIX.md |
| IN-03 | info | fixed | 42-REVIEW-FIX.md |
| IN-04 | info | fixed | 42-REVIEW-FIX.md |
| IN-05 | info | fixed | 42-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
