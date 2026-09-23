---
phase: quick-260923-hfk
plan: 01
subsystem: webapp-trading-workbench
status: complete
tags: [trading, responsive, container-query, galaxy-fold]
requires: []
provides:
  - "격자 열 수 경계 wb 680 (카드 밴드 700 과 분리) — §2.2b 「격자 열 수 경계」 문단"
  - "trading-workbench `WB_SINGLE_COLUMN_BELOW` · `singleColumnOnly` 판정(상태줄 세그먼트 전용)"
affects:
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/card-grid.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/styles/globals.css
key-files:
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/card-grid.tsx
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/__tests__/card-grid.test.tsx
    - webapp/src/styles/globals.css
decisions:
  - "접근 (A): 단 수 가능 경계만 700 → 680 으로 분리. 공용 패널 sticky · 돌파/VI 표 열 접기 등 나머지 wb 700 무변경"
  - "PLAN 의 카드 폭 사다리 실측(340/337/330/320)은 사용자 요청(속도)으로 생략 — 680 은 계산값(카드 334px). 폴드 실기기 확인은 사용자 몫"
metrics:
  completed: "2026-09-23"
---

# quick-260923-hfk — 갤럭시 폴드에서 단 수 세그먼트가 사라지던 문제

## 원인

폴드 안쪽 화면은 CSS 뷰포트 ≈ 707px → 앱 셸 여백(−16) → `wb` ≈ 691px. 격자 열 지정·상태줄 단 수 세그먼트가 `wb < 700` 을 폰 밴드로 보고 1열 고정 + 세그먼트 DOM 제거. 700 은 카드 **본문**(`/lc`) 밴드 경계를 빌린 값이고, 2열 격자가 서는 최소 wb 폭(2×폰 카드 최소 폭 + gap 12)을 실측한 값이 아니었다.

## 수정

- `card-grid.tsx` `COLS_CLASS` 2·3단 `@min-[700px]/wb` → `@min-[680px]/wb`.
- `workbench-status-bar.tsx` 첫 페인트 CSS 폴백 `@min-[680px]/wb:inline-flex`, 주석 ③ 정정.
- `trading-workbench.tsx` `WB_SINGLE_COLUMN_BELOW = 680` + ResizeObserver 에서 `singleColumnOnly` 를 따로 내고 상태줄에 전달. `phoneBand`(<700) 는 공용 패널에 그대로.
- `globals.css` §2.2b 에 「격자 열 수 경계」 문단(값·근거·같아야 할 세 곳).
- `card-grid.test.tsx` 리터럴 700 → 680.

## 검증

- webapp `tsc --noEmit` 0.
- vitest `workbench-status-bar`(19) · `trading-workbench`(75) · `card-grid` 통과.
- Playwright 는 돌리지 않았다 — 기존 test 2 는 PHONE_VIEWPORT 390(<680) 이라 단언 불변, test 4/5 는 카드 컨테이너(1단) 폭 기준이라 무영향.

## 남은 것

- 폴드 실기기에서 2단 선택 시 카드(≈339px) 잘림 없는지 사용자 확인. 잘리면 카드 폰 밴드 쪽을 별도 quick 으로.
