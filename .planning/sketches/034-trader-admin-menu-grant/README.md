---
sketch: 034
name: trader-admin-menu-grant
question: "trader 에게 어드민 「매매손익 · 정산」 메뉴만 여는 스위치 자리 — A 편집 시트 안 스위치 줄 / B 목록 줄 안 알약 / C 시트 안 알약?"
winner: "A"
tags: [admin, users, role, menu, permission]
---

# Sketch 034: trader 에게 어드민 메뉴 열기

## Design Question
millesjung 같은 trader 에게 어드민 메뉴 중 「매매손익」 · 「정산」 만 열어 주려면 `/admin/users` 의 어디에, 어떤 모양으로 켜고 끄나?

## How to View
open .planning/sketches/034-trader-admin-menu-grant/index.html

## Variants
- **A: 편집 시트 안 스위치 줄** — 「역할」 아래 「어드민 메뉴」 칸 · 메뉴마다 이름 · 한 줄 설명 · 스위치 · 누르는 즉시 저장. 목록 줄에는 켠 메뉴만 테두리 칩.
- **B: 목록 줄 안 알약** — 시트를 열지 않고 trader 줄의 알약으로 바로 켜고 끈다(폰은 줄 아래).
- **C: 시트 안 알약** — A 자리 · 알약 한 줄(설명 없음).

## 공통 규칙
- trader 만 대상(admin 은 전부 · viewer 는 칸 없음).
- 켠 메뉴만 그 사람 사이드바 Admin 아래에 보이고, 하나도 없으면 Admin 묶음이 없다.
- 주소를 직접 쳐도 닫힌 메뉴 · 사용자 · 계좌 · 서버 · 러쉬 주문은 홈으로.
- 정산은 보기 · 거래 적기 · 정산 확정 · 취소까지 관리자와 같다.

## Decision (2026-11-21)
- **A 편집 시트 안 스위치 줄** 채택 — 「역할」 아래 「어드민 메뉴」 칸 · 매매손익 · 정산 스위치(설명 한 줄) · 즉시 저장 · 목록 줄은 켠 메뉴만 테두리 칩.
