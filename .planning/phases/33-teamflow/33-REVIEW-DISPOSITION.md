---
phase: 33
review: 33-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "team_flow backfill 이 실패하면 이미 정상 적재된 날짜가 상한가 보고서에서 내려간다(unpublish 오발동)"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "억 반올림이 부호에 따라 달라 같은 크기의 ± 값이 다르게 표시된다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "RPC 응답 모양이 잘못되면 500 이 아니라 403 으로 보고된다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "구간 가로 막대 — 측정 폭이 232px 미만이면 스케일이 음수가 된다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "최대 매집 창이 축 밖이면 가장자리 칸에 잘못 음영이 진다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "「고가」 보조줄 조건이 sr 설명과 다르다"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "상세 토글 셰브론에 reduced-motion 처리가 없다"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "로딩 문구가 보조기기에 알려지지 않는다"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "`isNum` 가드가 세 모듈에 복제돼 있다"
open: 0
total: 9
---
# Phase 33: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 33-REVIEW-FIX.md |
| WR-02 | warning | fixed | 33-REVIEW-FIX.md |
| IN-01 | info | fixed | 33-REVIEW-FIX.md |
| IN-02 | info | fixed | 33-REVIEW-FIX.md |
| IN-03 | info | fixed | 33-REVIEW-FIX.md |
| IN-04 | info | fixed | 33-REVIEW-FIX.md |
| IN-05 | info | fixed | 33-REVIEW-FIX.md |
| IN-06 | info | fixed | 33-REVIEW-FIX.md |
| IN-07 | info | fixed | 33-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
