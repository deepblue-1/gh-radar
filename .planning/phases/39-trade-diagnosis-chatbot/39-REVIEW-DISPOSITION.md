---
phase: 39
review: 39-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "상한에 걸린 사용자의 시도도 전역 하루 카운터를 소모 — 한 사용자가 전원의 진단을 막을 수 있다"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`linkifyTickPaths` 정규식이 백틱·`**`·`|`·한글 조사·끝 마침표까지 URL 로 삼키고, 코드 블록 안까지 다시 쓴다"
  - id: WR-03
    severity: warning
    disposition: open
    title: "「임의 내부 화면 금지」 가드를 상대 경로로 우회할 수 있다"
  - id: WR-04
    severity: warning
    disposition: open
    title: "시세 창 수집기가 「수신 시각 단조」 를 가정하고 일찍 멈춘다 — 레코드가 조용히 빠지거나 거짓 「기록 없음」 이 나온다"
  - id: WR-05
    severity: warning
    disposition: open
    title: "당일 경로가 `X-Tick-Complete` 를 무시한다 — 구멍 난 하루를 완결 자료로 취급한다"
  - id: WR-06
    severity: warning
    disposition: open
    title: "하드 중단(마감 + 30초)이 도구 실행을 끊지 못한다"
  - id: WR-07
    severity: warning
    disposition: open
    title: "진단 시간 예산이 상담 1회 단위뿐이다 — 한 턴에서 진단을 두 번 부르면 Cloud Run 300초를 넘는다"
  - id: WR-08
    severity: warning
    disposition: open
    title: "주문로그 도구의 전략 이벤트·상태전이 줄에 계좌 표기가 없다 — 다계좌 사용자의 진단이 모호해진다"
  - id: IN-01
    severity: info
    disposition: open
    title: "틱 링크 `t` 의 시계가 프롬프트 안에서 서로 어긋나고, 「모델이 URL 을 짓지 않는다」 주석이 실제와 다르다"
  - id: IN-02
    severity: info
    disposition: open
    title: "당일 경로가 프레임마다 `zstdDecompressSync` 로 동기 해제한다 — 창 앞 프레임까지 전부"
  - id: IN-03
    severity: info
    disposition: open
    title: "같은 라운드 병렬 호출은 실행 단위 메모를 비켜 간다"
  - id: IN-04
    severity: info
    disposition: open
    title: "팀장이 `question` 없이 진단을 부르면 상한만 소모하고 API 400 으로 끝난다"
  - id: IN-05
    severity: info
    disposition: open
    title: "생성성 없는 일반화 — `runSpecialist` 의 `ctx?` 선택 인자와 `DIAGNOSIS_CONTEXT_MISSING_TEXT` 분기"
open: 13
total: 13
recorded: 2026-11-09T05:34:31.877Z
---

# Phase 39: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
