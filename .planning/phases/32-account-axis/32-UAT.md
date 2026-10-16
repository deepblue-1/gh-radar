---
status: testing
phase: 32-account-axis
source: [32-VERIFICATION.md]
started: 2026-10-16T11:51:04Z
updated: 2026-10-16T11:51:04Z
---

## Current Test

number: 1
name: 「이 계좌 끄기」 뒤 다른 계좌 대기가 풀리지 않는다 (WR-01 · WR-02)
expected: |
  relay 재배포 · push 뒤 /me 에서 한 계좌의 「이 계좌 끄기」를 누르면 그 계좌 대기만 풀리고, 다른 계좌 카드의 대기 · 결과 표시는 그대로다. 끌 전략이 없는 계좌는 relay 거부 원문이 그 계좌 오류 줄에 보인다.
awaiting: user response

## Tests

### 1. 「이 계좌 끄기」 뒤 다른 계좌 대기가 풀리지 않는다 (WR-01 · WR-02)
expected: 그 계좌 대기만 풀리고 다른 계좌 표시는 그대로 · 끌 전략이 없으면 relay 거부 원문이 그 계좌 오류 줄에 보인다
result: [pending]

### 2. Ready 중 계좌가 추가 선언돼도 작업대 VI 설정 행이 「미조회」 잠금으로 남지 않는다 (WR-03)
expected: 서버 세션이 Ready 인 상태에서 계좌가 추가 선언되면 relay 가 21 을 다시 묻고, 그 계좌의 VI 행이 빈 행(미등록) 또는 설정값으로 풀린다
result: [pending]

### 3. /me 칩을 KB120 → KYOBO119 로 바꿔도 설정 탭에 「저장 성공」 플래시가 따라오지 않는다 (WR-04 · WR-06)
expected: 계좌 칩 전환만으로는 저장 성공 · 실패 표시가 생기지 않고, /me 첫 진입에서 첫 계좌가 한 번 비쳤다가 기억 계좌로 바뀌지 않는다
result: [pending]

### 4. 새로고침이 `?account=` 로 나중에 고른 작업대 계좌를 되돌리지 않는다 (WR-05)
expected: 사이드바 VI 줄로 /trading?account= 에 들어간 뒤 주소창에서 account 파라미터가 사라지고, 다른 계좌를 고른 뒤 새로고침해도 그 계좌가 유지된다
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
