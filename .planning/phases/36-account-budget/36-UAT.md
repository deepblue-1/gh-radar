---
status: complete
phase: 36-account-budget
source: [36-VERIFICATION.md, 36-REVIEW-FIX.md]
started: 2026-10-28T01:37:35Z
updated: 2026-10-28T02:53:03.313Z
---

## Current Test

[testing complete]

## Tests

### 1. /me 잔고 탭 주문가능 숫자 (WR-05 수정 확인)
expected: 시장가 매수 미체결이 있는 계좌에서 /me 잔고 탭 요약 줄의 「주문가능」 이 작업대 계좌 패널·수동주문 「주문가능」 과 같은 숫자
result: pass

### 2. 예수금 칸 Enter (WR-01 수정 확인)
expected: 어드민 계좌 카드 예수금 칸을 고치지 않고 Enter → 「변경 없음」, 서버별 칩 요청 없음, 서버 예수금(원 단위) 그대로. 같은 만원 표기를 다시 쳐서 끝자리를 버리는 동작은 이제 안 됨 — 이 동작을 받아들일 수 있음
result: pass

### 3. 저장·체결 뒤 다시 열기 값 (WR-02 수정 확인)
expected: 예수금 저장 → 시트 닫고 다시 열기 → 새 값 · 불일치 줄 없음 / 체결 뒤 다시 열기 → 체결 조정된 값
result: pass

### 4. WR-04 공유 계좌 반영 범위 — 처리 결정
expected: 공유 계좌 값이 그 사용자의 등록 서버에만 반영되는 문제(새 RPC + D-03·D-07 범위 결정 필요)를 후속 작업으로 미룰지 결정
result: skipped
reason: "Deferred follow-up: 사용자 결정 「4 미룸」 — 새 RPC · D-03/D-07 범위 결정이 필요해 후속 작업으로"

## Summary

total: 4
passed: 3
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

## Deferred Follow-Ups

- test: 4
  idea: "WR-04 공유 계좌 예수금·비용률 반영 범위 — 그 계좌를 가진 다른 DMA 유저의 등록 서버까지 op 6/7 · 되싣기 대상 넓히기(계좌 기준 의도 조회 RPC 필요, D-03/D-07 범위 재결정, 36-REVIEW-FIX.md 참조)"
  deferred_at: 2026-10-28
