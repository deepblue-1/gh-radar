---
phase: quick-260913-0em
plan: 01
quick_id: 260913-0em
subsystem: webapp/layout
tags: [layout, a11y, e2e, css]
status: complete
requires: [quick-260912-u58]
provides:
  - "헤더 좌우 끝 아이콘 **잉크**가 본문 여백선에 서는 불변식(+ e2e 잠금)"
affects:
  - webapp/src/components/layout/app-header.tsx
  - webapp/src/components/search/search-trigger.tsx
  - webapp/e2e/specs/home.spec.ts
tech-stack:
  added: []
  patterns:
    - "터치 타깃(44×44)은 고정, **음수 마진으로 잉크만** 여백선에 맞춘다"
    - "공유 컴포넌트가 아니라 **호출부 래퍼**에서 위치 보정을 준다"
key-files:
  created: []
  modified:
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/components/search/search-trigger.tsx
    - webapp/e2e/specs/home.spec.ts
decisions:
  - "패딩 램프(`px-2 md:px-4 lg:px-6` / `p-2 md:p-4 lg:p-6`)는 **손대지 않는다** — 박스는 이미 정확했고 결함은 잉크였다"
  - "폰(<md)은 8, `md`(768)↑ 는 12 로 **비대칭** — 폰에서 12 를 당기면 오른쪽 버튼이 뷰포트를 넘어 가로 스크롤이 생긴다"
  - "44×44 를 줄여 맞추지 않는다(WCAG 2.5.5) — 음수 마진만 쓴다"
  - "`ThemeToggle` 컴포넌트가 아니라 `app-header.tsx` 호출부 래퍼에 보정을 준다 — 사이드바 하단 자리에서는 이 보정이 틀리다"
  - "e2e 는 절대 px 이 아니라 **본문 여백선과의 상대 거리**로 잰다 — 헤드리스 스크롤바 폭 의존 제거"
metrics:
  duration: ~25m
  completed: 2026-09-13
actuals:
  tokens: 2400
  tasks: 1
  commits: 1
plan_head_before: 74600c371761ff5a287c910860143ba8269e0047
---

# quick-260913-0em — 헤더 아이콘 잉크를 본문 여백선에 맞춘다 Summary

헤더 좌우 끝 아이콘 버튼에 음수 마진(`-8` / `md`↑ `-12`)을 줘서, 44×44 터치 타깃 안쪽 12px 에 갇혀 있던 **아이콘 잉크**를 본문 카드의 좌우 여백선에 정렬했다. 패딩 박스와 터치 타깃은 둘 다 그대로다.

## 무엇이 문제였나

사용자 신고 「본문 좌우 여백과 헤더 좌우여백이 다른데?」(뷰포트 ~1004).

패딩 **박스**는 260912-u58 이 맞춰 놓은 대로 이미 정확히 같았다(헤더 `px` 램프 == `main` `p` 램프). 어긋나 보인 것은 **보이는 잉크**다 — 헤더 좌우 끝 컨트롤이 44×44 터치 타깃 한가운데 20px 아이콘을 두는 아이콘 버튼이라, 버튼 상자가 여백선에 붙어 있어도 아이콘은 12px 안쪽에서 시작한다. 본문 카드는 테두리가 여백선에 딱 붙으므로 둘이 12px 짝짝이로 보였다.

## 무엇을 했나

| 대상 | 변경 |
|---|---|
| `app-header.tsx` 햄버거(`lg:hidden`) | `-ml-2 md:-ml-3` |
| `search-trigger.tsx` 모바일 아이콘 버튼(`lg:hidden`) | `-mr-2 md:-mr-3` |
| `app-header.tsx` `themeToggle` 래퍼(호출부) | `-mr-2 md:-mr-3` |

**건드리지 않은 것(의도):**
- 패딩 램프 — 박스는 맞아 있었다. 고치면 어제 맞춘 정렬이 도로 어긋난다.
- 44×44 터치 타깃 — 줄여서 맞추지 않았다(WCAG 2.5.5).
- `search-trigger.tsx` 의 **데스크톱 readonly input 버튼(`lg:flex`)** — `lg+` 에서 헤더 가운데에 뜨므로 여백선과 무관하다.
- `ThemeToggle` **컴포넌트** — 사이드바 하단 유저 섹션에서도 쓰이고 거기서는 이 보정이 틀리다. 호출부 래퍼에만 줬다.

세 곳 모두 **왜 음수 마진인지 / 폰이 왜 8 인지 / 44×44 를 줄이지 말라**는 근거 주석을 남겼다. 다음 사람이 「여백이 안 맞네」라며 패딩을 고치는 것이 이 변경의 주된 회귀 경로라서다.

### 폰만 8 인 이유

패딩이 8 인 폰에서 12 를 다 당기면 **오른쪽 버튼이 뷰포트 밖으로 4px 나가 가로 스크롤이 생긴다**(왼쪽 음수 오버플로는 스크롤을 만들지 않지만 오른쪽은 만든다). 그래서 폰 구간은 8 에서 멈춘다 — 잉크가 좌우 **대칭으로 4px 안쪽**에 서고, 기존 12px 짝짝이보다 3배 낫다. `md`(768)↑ 는 패딩이 16 이라 12 를 다 당겨도 안전하고 **정확히 일치**한다.

## e2e 잠금

`home.spec.ts` 의 기존 박스 단언(260912-u58 ⑤) **옆에** 잉크 케이스를 추가했다. 기존 단언은 지우지 않았다 — 둘 다 참이어야 한다(박스가 맞아도 잉크가 틀릴 수 있다는 것이 이번 결함 자체다).

- 잉크 = 아이콘 `<svg>` 경계 상자. `display:none` 인 `lg+` 전용 컨트롤은 0 크기로 걸러진다.
- 뷰포트 390 / 768 / 1004 / 1023 — 390 은 `inset 4`(좌우 대칭), 나머지는 `inset 0`(정확 일치).
- 모든 폭에서 `document.documentElement.scrollWidth === clientWidth` — 음수 마진이라 가로 스크롤을 만들 수 있는 종류라서 같은 케이스에서 함께 본다.
- 값을 절대 px 로 굳히지 않고 **본문 여백선과의 상대 거리**로 쟀다 — 헤드리스 스크롤바가 `clientWidth` 를 깎아 절대값은 환경 의존이다.
- `inkCount === 2` 를 먼저 단언한다 — 0개면 `Math.min(...[])` 이 `Infinity` 라 비교가 조용히 통과한다.

실행 결과(플랜 표와 일치): 네 폭 전부 통과, 가로 스크롤 0.

## 게이트

| 게이트 | 기준선 | 결과 |
|---|---|---|
| `pnpm -C webapp typecheck` | exit 0 | **exit 0** |
| `pnpm -C webapp test` | ≥820 passed | **820 passed / 1 skipped, exit 0** |
| `pnpm lint` | warning ≤3 | **warning 3, exit 0** (전부 선재, 이 변경과 무관) |
| `pnpm -C webapp build` | exit 0 | **exit 0** (`lsof -ti:3100` 로 dev 서버 부재 확인 후 실행) |
| `pnpm -C webapp test:e2e` | 131 passed / 0 failed | **132 passed / 0 failed / 9 skipped, exit 0** (+1 = 신규 잉크 케이스) |

임시 계측 스펙(`e2e/specs/_tmp-*`)은 만들지 않았다.

## Deviations from Plan

### 자동 수정

**1. [Rule 1 - Bug] 신규 e2e 케이스의 로케이터가 hidden 요소를 집었다**
- **발견 시점:** 1차 전량 e2e (1 failed)
- **문제:** `getByLabel('종목 검색 열기')` 에 해당하는 버튼이 **둘**이다(데스크톱 readonly input + 모바일 아이콘). DOM 순서상 데스크톱이 먼저라 `.first()` 는 `<lg` 에서 항상 `hidden` 인 쪽을 집어 `waitFor` 가 타임아웃했다.
- **수정:** `.last()` 로 바꾸고 「같은 라벨 버튼이 둘」이라는 사실을 주석에 남겼다. 제품 코드 결함이 아니라 **내가 새로 쓴 테스트의 결함**이었다 — 제품 코드는 그대로다.
- **파일:** `webapp/e2e/specs/home.spec.ts`
- **커밋:** 79c24c4 (같은 원자 커밋 안)

계획 대비 그 외 이탈 없음.

## Known Stubs

없음.

## Self-Check: PASSED

- `webapp/src/components/layout/app-header.tsx` — FOUND (`-ml-2 … md:-ml-3`, `-mr-2 flex … md:-mr-3`)
- `webapp/src/components/search/search-trigger.tsx` — FOUND (`-mr-2 … md:-mr-3`, `lg:flex` 버튼 무변경)
- `webapp/e2e/specs/home.spec.ts` — FOUND (기존 박스 케이스 + 신규 잉크 케이스 둘 다 존재)
- 커밋 `79c24c4` — FOUND, 3 files changed, 삭제 0건
- 측정된 커밋 수: `git rev-list --count 74600c37..HEAD` = **1**
