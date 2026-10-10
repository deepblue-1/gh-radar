---
phase: 29
review: 29-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "「+ 사용자」 경로가 기존 DMA 연결을 확인 없이 덮어써 옛 DMA 유저를 고아로 만든다"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "op 2 settle 이 그 서버의 의도 행을 **전부** 지워, 동시에 들어온 active 등록을 날린다"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "「즉시 재적재」 가 진행 중인 주기 재적재 Promise 를 공유해 커밋 전 데이터를 돌려준다"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "시세 주 서버의 host · port 를 바꿔도 quote 연결은 옛 주소에 남는다"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "등록 서버가 하나라도 꺼져 있으면 사용자 삭제가 영원히 끝나지 않는다"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "「주문 서버가 X 로 바뀜 — 재접속하면 적용」 배지가 따라 해도 적용되지 않는 지시를 한다"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "「+ 계좌 추가」 에 기존 계좌번호를 넣으면 그 계좌의 등록 서버 집합 · 값이 조용히 덮인다"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "relay Admin 처리 시간에 총 상한이 없어 Express 12초 타임아웃을 넘긴다 — 반영됐는데 화면은 실패"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "DMA id 마스킹 함수가 세 벌이고 규칙이 서로 다르다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "`timeout` 결과가 시트에서는 err, 재조회 뒤 개요에서는 warn 으로 바뀐다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`useFieldSave` 가 성공 뒤에도 마지막 값을 쥐고 있어 서버 쪽 이후 변경을 가린다"
open: 0
total: 11
recorded: 2026-10-10T06:09:31.559Z
---

# Phase 29: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 29-27 |
| WR-01 | warning | fixed | 29-32 |
| WR-02 | warning | fixed | 29-28 |
| WR-03 | warning | fixed | 29-28 |
| WR-04 | warning | fixed | 29-34 |
| WR-05 | warning | fixed | 29-33 · 29-42 · 29-36 · 29-38 · 29-39 |
| WR-06 | warning | fixed | 29-31 |
| WR-07 | warning | fixed | 29-32 |
| IN-01 | info | fixed | 29-40 |
| IN-02 | info | fixed | 29-40 |
| IN-03 | info | fixed | 29-31 · 29-34 |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
