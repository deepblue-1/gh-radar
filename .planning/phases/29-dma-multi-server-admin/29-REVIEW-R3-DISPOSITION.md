---
phase: 29-dma-multi-server-admin
review: 29-REVIEW-R3.md
round: 3
updated: 2026-10-11
open: 0
total: 10
---

# Phase 29 — 3라운드 리뷰 처분 기록

1라운드(29-REVIEW.md) 처분은 29-REVIEW-DISPOSITION.md, 2라운드(29-REVIEW-R2.md · GC-01~15 · N-01) 처분은 29-REVIEW-R2-DISPOSITION.md 가 정본. 이 표는 3라운드 발견(R3-01~R3-10)만 다룬다.
2026-10-11 사용자 결정 — Phase 29 를 닫고 넘긴다(재검증 R3 gaps_found 의 R3-01 은 override 로 수용 · 나머지는 켜기 전/다음 작업으로 연기).
처분: `open`(기록됨·미분류) · `fixed` · `skipped` · `deferred`. 사유는 Source 칸.

| ID | Severity | Disposition | Source |
|----|----------|-------------|--------|
| R3-01 | critical | deferred | 마일스톤 마무리 뒤 IP/MAC 작업(웹 입력칸 · 인박스 261010 항목 4)과 함께 — 계획 직전 op 5 재조회. 그 전까지 KB 운영 서버 IP/MAC 설정 보류(인박스 48행 정정) · VERIFICATION-R3 override |
| R3-02 | warning | deferred | R3-01 과 같은 IP/MAC 작업 — 다른 유저 같은 계좌 추가 시 87 전체에서 IP/MAC 찾기 (값 설정 전엔 노출 없음) |
| R3-03 | warning | deferred | 두 번째 서버 켜기 전 수정 — 29-53-SUMMARY 「켜기 전 결정」 4 |
| R3-04 | warning | deferred | 다음 relay 작업 — 같은 세션 재접속(#onReady)에서 14 송신자 FIFO 비우기. 단일 서버에서도 재접속 30초 안 재누름이면 도달(좁은 경로 · 결과는 「전부 정지」 확인 누락/확인 못 함 표시 — 서버 쪽 정지는 실행됨) |
| R3-05 | warning | deferred | 두 번째 서버 켜기 전 수정 — 29-53-SUMMARY 「켜기 전 결정」 5 |
| R3-06 | warning | deferred | 두 번째 서버 켜기 전 수정 — 29-53-SUMMARY 「켜기 전 결정」 6 |
| R3-07 | info | deferred | 두 번째 서버 켜기 전 함께 — #userSweepsSettled 시간 상한 |
| R3-08 | info | deferred | R3-05 와 함께 — 대여 중 꼬리표 없는 65 억제 제거 검토 |
| R3-09 | info | deferred | Admin 여러 대 분기 유일 등록 서버 표시 · 경고 문구 — 두 번째 서버 켜기 전 함께 |
| R3-10 | info | deferred | 주석만 — 다음 relay 작업 때 session-manager.ts:26 정정 |
