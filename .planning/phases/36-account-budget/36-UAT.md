---
status: testing
phase: 36-account-budget
source: [36-VERIFICATION.md]
started: 2026-10-28T01:37:35Z
updated: 2026-10-28T01:37:35Z
---

## Current Test

number: 1
name: WR-05 처리 결정 — /me 잔고 탭 계좌 패널에 priceOf 를 주입해 작업대·수동주문과 같은 주문가능 값을 내도록 고칠지
expected: |
  시장가(price 0) 매수 미체결이 있는 계좌에서 /me 요약 줄의 「주문가능」 이 작업대 패널·수동주문 「주문가능」 과 같은 숫자
awaiting: user response

## Tests

### 1. WR-05 처리 결정 — /me 잔고 탭 계좌 패널 priceOf
expected: 시장가(price 0) 매수 미체결이 있는 계좌에서 /me 요약 줄의 「주문가능」 이 작업대 패널·수동주문 「주문가능」 과 같은 숫자
result: [pending]

### 2. WR-01 · WR-02 · WR-03 · WR-04 (예수금 쓰기 경로 경고 4건) 후속 수정 시점 결정
expected: Enter 만 눌러도 op 6 가 나가는 문제(WR-01), 67 live 우선으로 저장 직후 옛 값(WR-02), 다른 op 실패 시 op 3 뒤 되싣기 누락(WR-03), 공유 계좌 fan-out 범위(WR-04)가 후속 fix 로 닫힌다
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
