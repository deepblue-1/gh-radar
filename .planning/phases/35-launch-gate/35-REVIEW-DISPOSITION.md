---
phase: 35
review: 35-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "적용됐을 수 있는 계획 저장을 「offline · 미반영」 으로 확정 보고하고 영구 이력에 그렇게 기록함"
  - id: WR-01
    severity: warning
    disposition: open
    title: "저장은 ok 인데 relay 가 재조회 값을 못 실으면 화면이 저장 전 계획을 계속 보임(D-27 「성공 뒤 다시 조회」 미이행)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "백필 계획의 논리 키에 `fire_base` 가 없어 DB PK(20261030200000 뒤)와 어긋남 — A KRX 재확인 회차 조각 · 머리가 섞이거나 버려짐"
  - id: IN-01
    severity: info
    disposition: open
    title: "잘못된 `?fire=` 값은 정본화(replace)하지 않음"
  - id: IN-02
    severity: info
    disposition: open
    title: "16:00 머리 카드의 「N조각 · 결과」 가 뒤탐침을 실조각처럼 셈"
  - id: IN-03
    severity: info
    disposition: open
    title: "저장 중 입력한 값이 저장 응답 도착 시 덮어써짐"
  - id: IN-04
    severity: info
    disposition: open
    title: "백필 입력 검증이 느슨함 — profile · fire_exchange 미검증, `.json` 은 무조건 첨부 형식"
open: 7
total: 7
recorded: 2026-10-31T15:45:58.266Z
---

# Phase 35: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
