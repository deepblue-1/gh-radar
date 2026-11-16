---
phase: 43
review: 43-REVIEW-R2.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "넣기 연속 실패 판정이 띄엄 조회 감시 대상에서 동작하지 않는다 — 넣기를 시도하지 않은 바퀴가 실패 기록을 지워 5분에 닿지 못하고, 그 건들은 warn 만 남기고 사라진다"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "임대 TTL 계산이 조회 시간을 빼고 세었다 — rn7 뒤 한 바퀴 호출이 늘어 OpenDART 가 느린 날 넣기가 55000 으로 거절되고, 실행은 「남이 넘겨받았다」 warn · 종료 0 으로 조용히 끝나며 다음 실행이 같은 바퀴를 되풀이한다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "멈춘 키 재탐침이 예산을 보지 않고 재개한다 — 예산을 넘긴 키가 한 바퀴 더 돌고 「다시 동작」 · 「멈췄습니다」 가 몇 초 간격으로 붙을 수 있다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "창 안 seed 로 시작한 실행은 하루 종일 auto 로 돌지만 멈출 때 남은 건 송신 · 미송신 error 를 건너뛴다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "날을 넘긴 장애의 「다시 동작」 문구가 전날 확인 도입 뒤의 실제 동작과 다르다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "주요사항보고서 종류 · 정정 env 를 바꾸는 안내에 seed 안내가 없다 — 다음 아침 전날 확인이 전날의 새로 맞는 건을 「(늦은 알림)」 으로 보낸다"
open: 0
total: 6
recorded: 2026-11-16T08:25:00Z
---

# Phase 43: Code Review Disposition (2회차 · 단계 마감 재리뷰)

1회차(43-REVIEW.md · 28건 전부 fixed)는 `43-REVIEW-DISPOSITION.md` 가 그대로 정본이다. 이 파일은 2회차(43-REVIEW-R2.md) 6건의 처분이다. 사용자 결정 2026-11-16 「전부 고치고 닫기」 → 전부 수정 · 시험 471 통과 · 2026-11-16 17:18 KST `dart-alert:a94cba72` 재배포 · 스모크 14/14.

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 43-REVIEW-FIX-R2.md · e7cc1445 |
| WR-01 | warning | fixed | 43-REVIEW-FIX-R2.md · 09e6e422 · 3a745e43 |
| IN-01 | info | fixed | 43-REVIEW-FIX-R2.md · ec258a52 |
| IN-02 | info | fixed | 43-REVIEW-FIX-R2.md · 00017b9b |
| IN-03 | info | fixed | 43-REVIEW-FIX-R2.md · 39d88766 |
| IN-04 | info | fixed | 43-REVIEW-FIX-R2.md · 0de7abb6 |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
