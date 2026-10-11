---
phase: quick-260923-iwz
plan: 01
subsystem: webapp-trading-limit-chaser-form
status: complete
tags: [trading, ui, mockup, limit-chaser]
requires:
  - "3284bea (게이트 체크박스 · 전 밴드 틴트 · 수동주문 2×2 — 목업 없이 나가 디자인이 망가진 커밋)"
provides:
  - "게이트 체크박스 = 그룹 제목 왼쪽(CheckRow 와 같은 x) · LED 제거"
  - "폰 탭 화면 방향색 배경 = 옵션 pane 가장자리까지(같은 색 box-shadow spread 8px) · 2열 둥근 여백 · 데스크톱 카드 테두리"
affects:
  - webapp/src/components/trading/limit-chaser-form.tsx
key-files:
  created:
    - .planning/quick/260923-iwz-led-pane-box-shadow-spread-2-2-2/260923-iwz-mockup.html
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
decisions:
  - "목업 먼저 → 사용자 「이렇게 작업해줘」 승인 후 구현 (memory feedback_ui_html_mockups_first)"
  - "폰 bleed 는 음수 마진이 아니라 같은 색 box-shadow spread — 음수 마진은 래퍼 scrollWidth 를 8px 늘려 e2e 잘림 검사(test 4, 카드 699px)에 걸렸다. 잉크 오버플로는 레이아웃에 없다"
  - "LED(상태 점) 제거 — 체크 여부 + 상태문구(감시 중/꺼짐)와 겹침"
metrics:
  completed: "2026-09-23"
---

# quick-260923-iwz — 상따 폼 디자인 정리 (목업 승인)

## 배경

`3284bea` 가 목업 없이 나가 (1) 게이트 체크박스가 헤더 우측 끝에 홀로 붙고 (2) 폰 탭 화면 틴트가 여백 없이 색만 칠해졌다. 사용자 지적 → 목업(`260923-iwz-mockup.html`, 라이트/다크 · 폰 3탭 · 컴팩트 2열 · 데스크톱) → 승인 → 구현.

## 수정 (`limit-chaser-form.tsx`)

- `Group` 헤더: `[체크박스][제목][상태문구]`. `led` prop 과 상태 점 제거. `GateSwitch` 는 17px 네이티브 체크박스, `ml-auto` 제거, accent = 매수 `--up` / 매도 `--down`.
- `Card`: 방향 카드는 `py-1.5` + 배경 틴트 + **같은 색 `shadow-[0_0_0_8px_…]`**(폰 bleed). `@min-[700px]/lc:` 에서 `shadow-none rounded-[--r-md] px-2`. 배경 선언은 요소당 한 줄 유지(ⓑ).
- 주석 ⓐ/ⓒ 정정(왜 음수 마진·안쪽 여백이 아닌지).

## 검증

- webapp tsc 0 · vitest trading 652 (limit-chaser-form 86).
- Playwright trading-workbench + a11y + orderbook **59 passed** — 카드 342/699/700/829/830/991/992 잘림 0 포함.
- 실 렌더 스크린샷(로컬 relay + 스텁 게이트웨이, 카드 342 매수/매도 탭 · 760 · 1100)이 목업과 일치.

## 관찰

- 폰에서 그림자 위쪽 8px 이 탭 줄 아래 여백(`mb-2`)을 채워 색면이 탭에 붙는다 — 목업(8px 흰 여백)과 다르지만 승인 범위 안의 차이로 보고 그대로 둔다.
