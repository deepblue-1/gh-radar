---
phase: 31
review: 31-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "구 탭 `lc.set`(금액 8필드 부재)을 relay가 금액 0으로 조립해 서버에 저장된 C# 만원 원값을 지운다"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "두 줄 행 아래 줄 · 시트 환산 안내가 비교가 0 갈래에서 에코 메모를 무시한다 — 제출 주와 다른 글자를 보인다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "줄매수 최소 > 최대 사전 검증이 금액끼리 비교해, 같은 금액이어도 제출 주는 최소 > 최대가 될 수 있다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "`amountEchoMatches`의 「에코 금액 0 = 성공」 관용이 새 서버에서도 열려 있어 늦게 온 푸시 에코로 조기 성공 판정이 난다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "제출 주 계산이 두 곳에 같은 식으로 복제돼 있다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "relay `envelope.ts`가 shared에 이미 있는 `LcAmountKey`를 로컬 타입으로 다시 적었다"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "두 줄 행 · 시트 안내는 렌더 `form`으로, 잠금 검증은 서버 동기값으로 계산해 비행 중에 갈릴 수 있다"
open: 0
total: 7
recorded: 2026-10-12T00:50:35.191Z
---

# Phase 31: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 31-REVIEW-FIX.md |
| WR-02 | warning | fixed | 31-REVIEW-FIX.md |
| IN-01 | info | fixed | 31-REVIEW-FIX-R2.md |
| IN-02 | info | fixed | 31-REVIEW-FIX-R2.md |
| IN-03 | info | fixed | 31-REVIEW-FIX-R2.md |
| IN-04 | info | fixed | 31-REVIEW-FIX-R2.md |
| IN-05 | info | fixed | 31-REVIEW-FIX-R2.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
