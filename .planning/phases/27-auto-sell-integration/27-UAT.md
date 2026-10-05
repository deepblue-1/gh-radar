---
status: testing
phase: 27-auto-sell-integration
source: [27-VERIFICATION.md]
started: 2026-10-05T08:34:55Z
updated: 2026-10-05T08:34:55Z
---

## Current Test

number: 1
name: 운영 화면 시각 확인 — /me 「상따 기본설정」 칩 · 상따 카드 「자동매도」 카드 · 헤더 LED 4칩 · 주문로그 「자동매도」 칩
expected: |
  열린 탭 · 앱 WebView 새로고침 뒤 /me 칩이 「서버 저장값」 또는 「서버 저장값 없음 · 내장 기본값」(불러오는 중에 멈추지 않음), 매도 탭에 자동매도 카드, 카드 헤더 LED 4칩, 주문로그 구분 칩에 「자동매도」 가 보인다.
awaiting: user response

## Tests

### 1. 운영 화면 시각 확인 (/me 칩 · 자동매도 카드 · LED 4칩 · 주문로그 칩)
expected: 새로고침 뒤 네 표면이 모두 보이고 /me 칩이 「불러오는 중」 에 멈추지 않는다
result: [pending]

### 2. 첫 거래일(2026-10-06) — WinForms LED · 칩 색 일치
expected: WinForms 에서 자동매도를 켠 종목의 웹 카드 칩 · LED 가 WinForms 와 같다(대기·완료 주황 · 감시·매도중 초록)
result: [pending]

### 3. 첫 거래일 — 실제 저널 kind 6 g9 / 11~14 문장
expected: 주문로그 「자동매도」 칩에 120 저널의 kind 6 g9 · 11~14 줄이 문장으로 선다(원문 숫자 없음)
result: [pending]

### 4. 첫 거래일 — 54 자동매도 사유 [상따] 배지 · 카드 간 혼입(리뷰 WR-04)
expected: 54 자동매도 사유 줄이 [상따] 배지로 해당 카드 로그에 선다. 다른 종목 카드에도 보이면 WR-04 로 기록
result: [pending]

### 5. 첫 거래일 — /me 값 = WinForms 기본설정창 값 · 41 은 실사용 중에만 관찰
expected: /me 11값이 WinForms 기본설정창과 같다. 바로시작 · 중지는 실사용 중 관찰만(시험 클릭 금지)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
