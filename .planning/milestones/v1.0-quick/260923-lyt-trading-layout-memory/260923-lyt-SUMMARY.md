---
phase: quick-260923-lyt
plan: 01
subsystem: webapp-trading-workbench
status: complete
tags: [trading, localStorage, ux]
affects:
  - webapp/src/lib/trading-layout.ts
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
metrics:
  completed: "2026-09-23"
---

# quick-260923-lyt — 트레이딩 작업대 배치 기억

## 배경

작업대 카드·패널 상태가 컴포넌트 로컬이라 다른 메뉴에 갔다 오면(언마운트) 전부 초기화됐다 — 등록 전 카드는 사라지고
펼친 카드는 접히고, 닫아 둔 등록 전략 카드는 다시 생겼다. 사용자: 「마지막 세팅을 기억해놔야」.

## 수정

- `trading-layout.ts` (신규) — localStorage I/O. 카드 목록은 사용자별 키 `gh-radar:trading-layout:{userId}`
  (`{v:1, cards[{isin,accountNo,exchange,open,name?,code?}], seen[]}`), 패널은 기기 공용 `gh-radar:trading-panels`
  (`vi` · `breakout` · `sharedTab` · `sharedFolded`). 전부 try/catch · 마운트 후 읽기.
- 작업대 — 사용자 id 를 알면 1회 복원(`restoreSavedCards`: 저장 순서·펼침 앞, 새 등록 카드 뒤, 닫아 둔 등록 카드 제외 ·
  `seenKeys` 선채움). 복원 뒤부터 카드 변경마다 저장. `seen` 은 64 스냅샷 확정 뒤 현재 등록 키로 가지치기.
- VI · 돌파 스트립 펼침, 하단 공용 패널 탭·접힘 기억.
- 전략 **값**·카드 안 매수/매도/수동 탭은 기억하지 않는다(값은 서버가 정본).

## 검증

- tsc 0 · vitest lib+trading 1057 (신규 L1·L2 · restoreSavedCards 2 · VI 펼침 기억).
- 기존 테스트 2건 의도 변경: VI 「localStorage 에 남기지 않는다」→「기억한다」, GC-IN-04 는 두 렌더 사이 배치 삭제.
- e2e GC6 「다른 화면 다녀오면 카드 0」→「카드 1(기억)」. Playwright 작업대+a11y+호가 57 passed.
