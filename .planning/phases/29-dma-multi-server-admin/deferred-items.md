# Phase 29 — 범위 밖 발견 (deferred)

## 29-15 실행 중

- **`components/ui/button.tsx` `size="sm"` 글자 크기 · 변형 글자색 충돌.** `sm` 의 `text-[var(--t-caption)]` 을
  tailwind-merge 가 「글자색」 으로 읽어, 같은 버튼의 변형 글자색(`text-[var(--primary-fg)]` · `--secondary-fg`)을
  지우고 글자 크기도 주지 못한다(부모 글자 크기를 물려받는다). 실측: `twMerge("… text-[var(--primary-fg)] … text-[var(--t-caption)]")`
  → `text-[var(--primary-fg)]` 소실. 라이트 테마의 기본(파랑) 작은 버튼은 글자가 `--fg`(검정)로 그려질 수 있다.
  29-15 는 Admin 버튼에만 `ADMIN_BUTTON_PRIMARY/SECONDARY`(크기 · 색 재지정)로 피했다. 근본 수정은
  `text-[length:var(--t-caption)]` 로 바꾸는 것이지만 모든 `size="sm"` 사용처의 시각이 바뀌므로 별도 quick 으로.

## 29-17 실행 중

- **`components/chat/chat-sheet.tsx` 우측 시트 폭이 440 이 아니라 384px 일 가능성.** 기본 `SheetContent` 의
  `data-[side=right]:w-3/4 · data-[side=right]:sm:max-w-sm` 는 속성 선택자라 맨 `w-full · sm:max-w-[440px]` 보다 명시도가 높아
  이긴다(tailwind-merge 는 변형 접두가 달라 둘 다 남긴다). `AdminSheet` 는 29-17 e2e 실측(384px)으로 같은 접두를 달아 고쳤다
  (`data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]`). chat-sheet(262행)도 같은 문법이라 같은 결함으로 보인다 — 실측 뒤 별도 quick.
- **데스크톱 Admin 시트의 배경 흐림.** 공용 `SheetOverlay`(backdrop-blur) 때문에 우측 패널이 열리면 왼쪽 목록이 흐려지고 클릭하면 시트가
  닫힌다. 목업 A 의 데스크톱 `.panel` 은 스크림 없이 목록이 그대로 보이는 그림이다(D-14 「목록은 남는다」 — 행 사이 이동). 비모달
  시트(포커스 트랩 · 바깥 클릭 의미가 바뀐다)는 29-15 `AdminSheet` 골격의 결정이라 이 플랜에서 바꾸지 않았다.
