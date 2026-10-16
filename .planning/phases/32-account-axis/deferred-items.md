# Phase 32 — Deferred Items (범위 밖 발견)

## 32-02 실행 중

- **a11y.spec `/trading — 위반 0(세 그룹 카드 접힘 · 펼침 각각) …` 실패 — 기존 결함 · 32 범위 밖**
  - 증상: `a11y.spec.ts:400` `openCard.locator('[data-slot="lc-group-fold"]')` 기대 4 · 실제 5.
  - 원인 추정: quick-261012-oif(`03584822` 「매수취소 접이식」)이 상따 카드 접힘 그룹을 하나 늘렸는데 a11y.spec 의 접힘 수(4)를 고치지 않았다. 32-02 는 `/trading` 상따 카드 · `lc/setting-group.tsx` 를 건드리지 않았다.
  - /me 접근성 케이스(같은 spec 의 My page 탭 · 칩 줄 · 잔고 탭)는 통과했다.
  - 처리: 다음 a11y 정리(quick) 때 접힘 수 기대값을 실측(5)으로 맞추고 펼침 루프가 매수취소 카드도 도는지 확인.

> **해소(32-03):** 위 접힘 그룹 4 vs 5 는 32-03 이 같은 원인 세 곳을 실측 5로 맞춰 닫았다 — a11y.spec `/trading` 케이스(`31d6a073` · 상단 줄 live 단언 463 에 도달해야 했다) · a11y.spec `setLcFolds` 헬퍼(`9d74ac8a`) · trading-workbench.spec P24-2 요약 줄(`2c4d17cf`). a11y.spec 13/13 통과.

## 32-03 실행 중

- **trading-workbench.spec `P31-3 폰 시트 환산 · 잠금 …` 실패 — 기존 결함 · 32 범위 밖**
  - 증상: `trading-workbench.spec.ts` P31-3 「매도 비교가 0 에코 → 아래 줄 「비교가격 필요」」 단언에서 `lc-sell-watch-qty` 의 `lc-row-sub` 가 「777주」(기대 「비교가격 필요」 · data-tone alert). 단독 재실행에서도 같은 자리에서 실패(결정적).
  - 32-03 은 상따 카드 · `lc/*` · 시트를 건드리지 않았다(상단 줄 · /me 설정 카드만). 원인 추정: 261012 quick 들(`6a628d3b` u04 · `e14695c2` qld · `03584822` oif)이 매도 비교가 0 에코의 아래 줄 표시 규칙을 바꿨는데 이 E2E 를 고치지 않았다.
  - 32-03 전체 실행: 77 통과 · 1 실패(P31-3) · 3 미실행(serial) — 터치 시트 묶음 단독 재실행에서 P20-2 · P20-4 · P20-5 통과. 상단 줄 준비 신호를 쓰는 order-log · unfilled-progress · stock-detail-tabs 는 전부 통과.
  - 처리: 다음 상따 E2E 정리(quick) 때 `lc-fields` 의 비교가 0 아래 줄 규칙과 대조해 단언을 맞추거나 회귀를 고친다.
