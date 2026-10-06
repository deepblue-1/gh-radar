# Phase 29 — 범위 밖 발견 (deferred)

## 29-15 실행 중

- **`components/ui/button.tsx` `size="sm"` 글자 크기 · 변형 글자색 충돌.** `sm` 의 `text-[var(--t-caption)]` 을
  tailwind-merge 가 「글자색」 으로 읽어, 같은 버튼의 변형 글자색(`text-[var(--primary-fg)]` · `--secondary-fg`)을
  지우고 글자 크기도 주지 못한다(부모 글자 크기를 물려받는다). 실측: `twMerge("… text-[var(--primary-fg)] … text-[var(--t-caption)]")`
  → `text-[var(--primary-fg)]` 소실. 라이트 테마의 기본(파랑) 작은 버튼은 글자가 `--fg`(검정)로 그려질 수 있다.
  29-15 는 Admin 버튼에만 `ADMIN_BUTTON_PRIMARY/SECONDARY`(크기 · 색 재지정)로 피했다. 근본 수정은
  `text-[length:var(--t-caption)]` 로 바꾸는 것이지만 모든 `size="sm"` 사용처의 시각이 바뀌므로 별도 quick 으로.
