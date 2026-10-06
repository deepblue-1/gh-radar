---
sketch: 012
name: limitup-lock-risk
question: "상한가 보고서 펼친 상세의 「잠김 구간」 에 gh-trade 새 export 열(잠김 누적 매도 · 취소 · 위험도 +3/+10/+60초 · 깨짐(끝) 3초 전)을 어떻게 보여줄까?"
winner: "A"
tags: [analytics, limitup, report, lock-risk, chart, phase-28, gh-trade-ea8d9171]
---

# Sketch 012: 잠김 누적 매도 · 취소 · 위험도

## Design Question
gh-trade ea8d9171(인박스 261006-limitup-lock-risk)이 locks 에 sell_krw · cancel_krw · risk_3s/10s/60s · risk_pre, 격자에 lock_sell_krw · lock_cancel_krw 를 더했다. 보고서에 어떤 모양으로 싣나.
실시간 카드 「상한가」 탭은 WinForms 동형(gh-trade gp8 — 「지금」 행 제거 · 「누적」 행 · 잠김 경과 행 머리 · 상태는 툴팁)이라 변형 없이 확인용으로만 둔다.

## How to View
open .planning/sketches/012-limitup-lock-risk/index.html

## Variants
- **A: 요약 칩** — 잠김 구간 차트 위 칩 한 줄(누적 매도 · 취소 파랑 · 위험도 4시점). 차트 무변경.
- **B: 차트에 선** — 누적 매도(파랑 실선) · 취소(회색 점선)를 잔량과 같은 금액 축에 겹치고 4시점 위험도 라벨.
- **C: 위험도 표 + 목록 열** — 차트 아래 잠김별 표 + 목록 「끝 3초 전 위험도」 열.

## Data
잔량 곡선 = 10/02 픽스처 실데이터. 누적 매도 · 취소 · 위험도 = 예시값(새 열 모양만).

## Decision (2026-10-06)
- **A 요약 칩** 채택 — 펼친 상세 「잠김 구간」 차트 위 칩 한 줄: 누적 매도 · 취소(파랑) · 위험도 +3초 / +10초 / +60초 / 깨짐(끝) 3초 전(색 없음, 정수 %, 100% 초과 가능, null 「—」). 차트·목록 무변경. 잠김이 여럿이면 잠김마다 한 줄.
- 실시간 카드 「상한가」 탭 = WinForms 동형(gh-trade gp8 · f1j): 행 누적 / 10초 / 창구, 잠김 중 누적 행 머리 = 경과 m:ss(빨강), 상태(지금 행)는 툴팁 첫 줄.
