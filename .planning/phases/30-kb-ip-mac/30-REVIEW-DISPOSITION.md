---
phase: 30
review: 30-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`GET /api/admin/users` now blocks on the relay for up to `RELAY_ADMIN_TIMEOUT_MS` (15 s)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The shape check in `fetchOrderEndpoints` is shallow, so a malformed row turns the overview into a 500"
  - id: WR-03
    severity: warning
    disposition: open
    title: "A server toggle during an in-flight edit save persists the not-yet-confirmed draft name"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Failures from an edit save disappear from `BusyLines` for good, even after the edit card closes"
  - id: IN-01
    severity: info
    disposition: open
    title: "The save button can be disabled with no visible reason when the initial 87 value fails web validation"
  - id: IN-02
    severity: info
    disposition: open
    title: "The shared-holder note approximates gh-trade's propagation set"
  - id: IN-03
    severity: info
    disposition: open
    title: "R3-02 copies the first other user that has IP/MAC set and ignores other users that are explicitly unset"
  - id: IN-04
    severity: info
    disposition: open
    title: "The overview ships KYOBO accounts' 87 IP/MAC to the browser"
  - id: IN-05
    severity: info
    disposition: open
    title: "The R3-01 re-read uses the request deadline before any op is sent"
  - id: IN-06
    severity: info
    disposition: open
    title: "When the state is \"확인 전\" (unknown), there is no way to express \"clear to 미설정\""
open: 10
total: 10
recorded: 2026-10-11T10:11:26.588Z
---

# Phase 30: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
