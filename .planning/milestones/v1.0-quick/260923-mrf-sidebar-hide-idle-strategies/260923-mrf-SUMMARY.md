---
phase: quick-260923-mrf
plan: 01
subsystem: webapp-sidebar
status: complete
tags: [sidebar, trading, limit-chaser]
affects:
  - webapp/src/components/layout/app-sidebar.tsx
metrics:
  completed: "2026-09-23"
---

# quick-260923-mrf — 사이드바에서 매수·매도 둘 다 OFF 인 전략 숨김

## 배경

서버(gh-trade `StrategyManager::SetLimitChaser`)는 crud "D"·장 마감 정리로만 전략을 지운다. 에코의 `buyEnabled`/`sellEnabled`
는 무장 상태라 발주가 나가거나(매수 disarm) 설정 불완전으로 켜기가 거부되면 OFF 로 오지만 전략은 남는다 → 사이드바에 회색 3점 전략이 쌓였다.

## 수정

- `app-sidebar.tsx` — `limitChasers.filter(c => c.buyEnabled || c.sellEnabled)` 만 3단에 싣는다. 취소만 켜진 전략도 숨김(사용자 결정).
  남는 전략·VI 둘 다 없으면 3단 목록 미렌더(기존 규칙). 작업대 카드·My page 목록은 전체 그대로.

## 검증

- vitest layout 36 (신규 ⑨ 2건). tsc 0.
- e2e: `me.spec` 전체 비활성화 후 사이드바 매수 점 0개로 기대 변경. `sidebar-tree.spec` 1a 의 매도주문 `switch` → `checkbox`
  (3284bea 가 게이트를 체크박스로 바꿀 때 누락된 스펙). sidebar-tree+me+a11y+작업대 61 passed.
