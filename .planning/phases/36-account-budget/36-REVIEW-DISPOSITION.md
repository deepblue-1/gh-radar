---
phase: 36-account-budget
review: 36-REVIEW.md
fix_report: 36-REVIEW-FIX.md
recorded: 2026-10-28
counts: { critical: 0, warning: 5, info: 6 }
---

# Phase 36 코드 리뷰 처리 기록

리뷰는 배포 · 라이브 UAT(「1-6 pass」) 뒤에 돌았다. 2026-10-28 `/gsd-code-review 36 --fix` 로 경고 4건을 고쳤다(건별 커밋 — 표의 해시 · 상세는 `36-REVIEW-FIX.md`). WR-04 와 정보 6건은 열려 있다. 적용된 마이그레이션은 고치지 않는다.

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| WR-01 | warning | fixed (3feb08dc) | 예수금 칸 만원 표시 vs 원 단위 「변경 없음」 비교 — 고치지 않은 Enter 가 op 6 로 체결 조정분(≤9,999원)을 덮어씀 |
| WR-02 | warning | fixed (e1f352a8) | 67 live 를 87 보다 무조건 우선 — 67 이 늦게 오면 저장 직후 옛 값 · 거짓 불일치 |
| WR-03 | warning | fixed (c3a6bd74) | op 3 뒤 되싣기가 같은 서버 계획에 실패가 하나라도 있으면 빠지고 다시 대상이 안 됨 |
| WR-04 | warning | skipped (새 RPC · D-03/D-07 범위 결정 필요 — 36-REVIEW-FIX.md) | op 6/7 · 되싣기 범위가 그 DMA 유저 등록 서버로 한정 — 공유 계좌 다른 유저 서버는 갈림 |
| WR-05 | warning | fixed (22dd07c7) | /me AccountPanel 에 priceOf 없음 — 주문가능이 작업대와 다른 숫자(D-11) |
| IN-01 | info | open | 계좌별 손익 묶음 키에 증권사 없음 |
| IN-02 | info | open | 체결 뒤 다중 등록 계좌 예수금 불일치 줄 상시 — D-03 의도 확인 |
| IN-03 | info | open | 「변경 없음」 칩이 확인 전 서버에도 붙음 |
| IN-04 | info | open | 매수 미체결 정정 · 상따 합 이중 차감 — WinForms 동형 여부 확인 |
| IN-05 | info | open | void opts.adminEmail · costTargetRows JSDoc 위치 |
| IN-06 | info | open | 되싣기가 reconcile 10초 마감 안 순차 — 성공해도 timeout 으로 접힐 수 있음 |

## 2라운드 (36-REVIEW-R2.md · 수정 36-REVIEW-FIX-R2.md)

2026-10-28 재리뷰 뒤 사용자 「진행해」 로 고쳤다. 배포: relay `relay:640ae663`(14:46 KST, smoke 11/11) · webapp push `cd1c28ed..a5c67ae7`(14:49, Vercel Ready).

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| CR-01 | critical | fixed (d13d32cb) | 「확인 전」 비용 칸 빈 Enter 가 op 6(0) · op 7(0,0) 로 예수금 · 비용률 해제 |
| WR-01(R2) | warning | fixed (7dc67654) | 불일치 상태 안 고친 Enter 가 시트 연 시점 옛 값으로 서버 조정분 되돌림 |
| WR-02(R2) | warning | fixed (4bd0464a) | /me 시세 미구독 — 굳은 옛 시세로 평가 · 주문가능 |
| WR-03(R2) | warning | fixed (6f9cb46a) | timeout 뒤 되싣기 영구 누락 — 87 상태 기준 멱등 조건으로 |
| IN-01(R2) · IN-02(R2) · IN-03(R2) | info | open | 마감 안 실패 가림 · 벽시계 비교 · op 5 87 계약 관측 장치 없음 |
