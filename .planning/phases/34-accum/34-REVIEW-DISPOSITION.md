---
phase: 34-accum
review: 34-REVIEW.md
recorded: 2026-10-21
counts: { critical: 0, warning: 5, info: 6 }
---

# Phase 34 코드 리뷰 처리 기록

리뷰는 배포 · 라이브 UAT 뒤에 돌았다. 그래서 이 phase 안에서는 고치지 않았고 모든 항목이 `open` 이다. 수정은 `/gsd-code-review 34 --fix` 같은 후속 작업으로 넘긴다. 적용된 마이그레이션을 고쳐야 하는 항목은 없다.

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| WR-01 | warning | open | 확대 창 경계에서 가격 선이 가격 판 밖으로 뻗는다 — 가격 판 높이 클립 필요 |
| WR-02 | warning | open | accum_flow 가 깨지면 그날 6표 · team_flow 까지 실패 — 워커 사전 검증 · 0행 격리 |
| WR-03 | warning | open | 상세 캐시 무만료 · row:null 고정 · inflight 사용자 전환 미정리 |
| WR-04 | warning | open | 소급 CLI 상대 --out 이 relay/ 기준 — 기본값은 절대 경로라 34-11 실행은 무영향 |
| WR-05 | warning | open | 상세 payload 모양 검증 없음 — 키 누락 시 페이지 전체 오류 |
| IN-01 | info | open | ticksOf 주석 불일치 |
| IN-02 | info | open | 종료 행 sr 설명 종료 시각 중복 |
| IN-03 | info | open | 테스트 전용 공개 API |
| IN-04 | info | open | CLI 전용 모듈이 relay 런타임 소스 트리에 있음 |
| IN-05 | info | open | 창 끝에서 화살표 키가 페이지 스크롤을 막음 |
| IN-06 | info | open | 가격이 한 값일 때 가격 축 글자 겹침 |
