---
phase: 32
review: 32-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "「이 계좌 끄기」 대기 해제가 계좌가 아니라 FIFO 맨 앞을 푼다 — relay 가 0프레임으로 끝나는 끄기가 끼면 다른 계좌가 풀린다"
  - id: WR-02
    severity: warning
    disposition: open
    title: "계좌 끄기 거부 · 0답 종료가 웹 킬 스위치 in-flight 창을 8초 동안 열어 둔다 — 그동안 무관한 60 에코가 「킬 스위치」 원인으로 읽힌다"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Ready 중 추가 선언된 계좌의 VI 슬롯을 relay 가 영영 묻지 않는다 — 작업대 VI 행이 「미조회」 잠금으로 남는다"
  - id: WR-04
    severity: warning
    disposition: open
    title: "/me 설정 탭 저장 기계가 서버 전환을 넘어 상태를 들고 간다 — 계좌 칩만 바꿔도 값이 다른 행이 「저장 성공」 플래시를 낸다"
  - id: WR-05
    severity: warning
    disposition: open
    title: "`?account=` 가 URL 에 남는다 — 새로고침 · 앱 새로고침이 사용자가 나중에 고른 작업대 계좌를 되돌린다"
  - id: WR-06
    severity: warning
    disposition: open
    title: "/me 기본 계좌 칩이 한 렌더 동안 첫 계좌로 섰다가 기억 계좌로 바뀐다 — 네 탭이 엉뚱한 계좌를 한 번 그린다"
  - id: IN-01
    severity: info
    disposition: open
    title: "`RelayViTriggerMsg`(`vi`)가 더 나가지 않는데 `RelayOutbound` 합집합에 남아 있다"
  - id: IN-02
    severity: info
    disposition: open
    title: "계좌 칩 radiogroup 의 화살표 키가 포커스만 옮긴다 — WAI-ARIA radio 패턴(화살표 = 이동 + 선택)과 다르다"
  - id: IN-03
    severity: info
    disposition: open
    title: "배포 창(relay 먼저 ~ webapp push) 동안 구 /me 가 non-primary 서버의 실시간 84 로 덮인다"
  - id: IN-04
    severity: info
    disposition: open
    title: "세션 분리 뒤 브라우저의 VI 슬롯 · 사이드바 「VI 가동」 이 남는다 — 「이 계좌 끄기」 가 눌리지만 relay 는 「끌 것 없음」 으로 거부한다"
  - id: IN-05
    severity: info
    disposition: open
    title: "VI 스트립 계좌 필터와 카드 격자 스코프의 게이트가 다르다"
open: 11
total: 11
recorded: 2026-10-16T11:34:54.853Z
---

# Phase 32: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
