---
phase: 35
review: 35-REVIEW-R4.md
titles: json
findings:
  - id: R4-IN-01
    severity: info
    disposition: open
    title: "offline 결과 칩 · 이력 알약 글자는 여전히 「서버 연결 안 됨」 — 결과 줄은 「relay 가 거부했어요」 인데 바로 옆 칩은 gh-trade 서버 연결 문제처럼 읽힘"
  - id: R4-IN-02
    severity: info
    disposition: open
    title: "`saveRowSeenIn` 이 다른 저장의 행도 「이 저장을 처리했음」 증거로 받음 — 그 행이 반영되지 않은 저장(offline · skipped · failed)이면 저장 전 값을 「확인」 으로 보임"
  - id: R4-IN-03
    severity: info
    disposition: open
    title: "테스트 신뢰성 — 「연결된 뒤 응답 대기는 ECONNABORTED」 테스트의 연결 상한 50ms 는 부하 아래에서 흔들릴 수 있음"
open: 3
total: 3
recorded: 2026-11-01T08:10:00.000Z
---

# Phase 35: Code Review Disposition — 4차(R4)

1차 처리 기록은 `35-REVIEW-DISPOSITION.md`(7/7 fixed), 2차는 `35-REVIEW-R2-DISPOSITION.md`(4/4 fixed), 3차는 `35-REVIEW-R3-DISPOSITION.md`(5/5 fixed)가 정본이다. 이 파일은 3차 수정분을 다시 본 `35-REVIEW-R4.md` 의 findings 만 기록한다. R3 지적 5건은 R4 리뷰에서 모두 닫힘으로 판정됐다(R3-IN-02 의 남은 부분은 R4-IN-01 로 이관). 새 findings 는 Info 3건(Critical 0 · Warning 0)이며 아직 처리 결정 전이다.

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| R4-IN-01 | info | open | 35-REVIEW-R4.md |
| R4-IN-02 | info | open | 35-REVIEW-R4.md |
| R4-IN-03 | info | open | 35-REVIEW-R4.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
