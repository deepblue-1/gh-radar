# Phase 32 — Deferred Items (범위 밖 발견)

## 32-02 실행 중

- **a11y.spec `/trading — 위반 0(세 그룹 카드 접힘 · 펼침 각각) …` 실패 — 기존 결함 · 32 범위 밖**
  - 증상: `a11y.spec.ts:400` `openCard.locator('[data-slot="lc-group-fold"]')` 기대 4 · 실제 5.
  - 원인 추정: quick-261012-oif(`03584822` 「매수취소 접이식」)이 상따 카드 접힘 그룹을 하나 늘렸는데 a11y.spec 의 접힘 수(4)를 고치지 않았다. 32-02 는 `/trading` 상따 카드 · `lc/setting-group.tsx` 를 건드리지 않았다.
  - /me 접근성 케이스(같은 spec 의 My page 탭 · 칩 줄 · 잔고 탭)는 통과했다.
  - 처리: 다음 a11y 정리(quick) 때 접힘 수 기대값을 실측(5)으로 맞추고 펼침 루프가 매수취소 카드도 도는지 확인.
