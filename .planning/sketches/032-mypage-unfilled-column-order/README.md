---
sketch: 032
name: mypage-unfilled-column-order
question: "My page 잔고 탭 미체결 표(데스크톱 ≥1280) 열 순서 — 지금 주문번호 · 구분 · 종목 → A 종목 · 구분 · 주문번호(순서만) / B 종목+구분 한 칸 · 주문번호 흐리게 / C 종목 칸 두 줄(주문번호 밑 작은 글씨)?"
winner: "B"
tags: [me, mypage, account-panel, unfilled, table]
---

# Sketch 032: My page 미체결 열 순서

## Design Question
미체결 표가 주문번호로 시작해 종목을 찾으려면 셋째 열까지 가야 한다. 종목 → 매수/매도 → 주문번호 순으로 바꿀 때 어떤 모양으로?

## How to View
open .planning/sketches/032-mypage-unfilled-column-order/index.html

## Variants
- **A: 순서만 바꾸기** — 종목 · 구분 · 주문번호 · 주문가 · 주문 · 미체결 · 취소. 종목명 굵게.
- **B: 종목 + 구분 한 칸** — 「나노팀 ▲매수」 한 칸 · 주문번호 흐린 mono 열 · 열 6개.
- **C: 종목 칸 두 줄** — 종목명 + 구분 알약, 밑에 주문번호 작은 흐린 글씨 · 열 5개.

## 범위
- 대상: `webapp/src/components/orderbook/account-panel.tsx` 기본(계좌 전용) 배치의 데스크톱 표만. 폰 카드(<1280)는 이미 종목명이 맨 앞.
- 진행률 보조행(후매수 · N주 · 막대)은 그대로 — 새 순서에선 종목 밑에서 시작한다.

## Decision (2026-11-17)
- **B 종목 + 구분 한 칸 · 주문번호 흐린 열** 채택. 구분 태그는 기존 `SideTag`(글자색만) 그대로 — 목업의 옅은 배경 알약은 넣지 않았다(폰 카드 · 임베드 표와 같은 태그 유지).
- 종목명 14px 굵게, 주문번호는 `--muted-fg` mono(선택된 행에서는 accent 색 상속). 진행률 보조행 colSpan 7 → 6.
