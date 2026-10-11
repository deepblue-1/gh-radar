---
phase: 21-gh-trade-mobile-app
plan: 06
subsystem: webapp-app-shell
tags: [capacitor, safe-area, viewport-fit, native-tabbar, css-variables, playwright]

requires:
  - phase: 21-04
    provides: "@custom-variant native · NativeBridgeProvider"
  - phase: 21-05
    provides: "installNativeApp 픽스처 · native-shell.spec.ts · 앱 셸 레이어 밖 규칙 패턴"
  - phase: 21-10
    provides: "iOS 탭바 기하 — 바닥 = safe + 14(하한 14) · 높이 70 (D-27a)"
provides:
  - "layout.tsx viewport viewportFit: 'cover' (웹·앱 공통)"
  - "globals.css §21 — --app-safe-{top,bottom,left,right} · --native-tabbar-gap · --native-tabbar-offset · --native-body-reserve · 하단 고정 요소 규칙"
  - "마크업 계약 data-slot=shared-panels · data-pinned · data-order-cta"
  - "native-shell.spec.ts safe-area·탭바 여백 describe 4건 (MOBILE-01j 2부)"
affects: [21-11, 21-12, 21-13, 21-16]

actuals:
  tokens: 8200
  tasks: 3
  commits: 5
plan_head_before: c3393bacae6f87f48418b0706cfeb75bcdf070e2

tech-stack:
  added: []
  patterns:
    - "안전영역은 --app-safe-* 네 변수로만 읽는다 — var(--safe-area-inset-*, env(...)) 폴백 체인(Android SystemBars 주입 우선), 주입 이름은 정의하지 않는다"
    - "앱 전용 여백은 :root 0px 기본값 + html.native-app 재정의 — 브라우저에서 같은 식이 종전 값으로 떨어진다"
    - "인라인 style 로 bottom 을 쓰는 컴포넌트는 calc(var(--native-tabbar-offset, 0px) + N px) 로 변수를 합산한다(인라인이 CSS 규칙을 이기므로)"
    - "시트는 투명 테두리로 안전영역을 비킨다 — 배경이 border-box 까지 칠해지고 소비처 패딩은 그대로"

key-files:
  created:
    - .planning/phases/21-gh-trade-mobile-app/deferred-items.md
  modified:
    - webapp/src/app/layout.tsx
    - webapp/src/styles/globals.css
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/trading/workbench/alert-toasts.tsx
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/e2e/specs/native-shell.spec.ts

key-decisions:
  - "헤더의 투명 1px 아래 테두리를 걷었다 — box-content 에서 높이가 57 이 되어 aside top · scroll-mt(56 기준)가 어긋나고 e2e 56 계약이 깨진다. 콘텐츠 박스가 55→56 이 되어 세로 가운데가 0.5px 움직이는 것은 수용"
  - "헤더 z-10 → z-30 — main overflow-auto 로 sticky 가 죽은 종목상세 탭 바(z-20)가 스크롤 중 헤더를 덮던 기존 결함. 앱 본문 108 여백으로 짧은 화면에서도 드러나 같은 표면 결함으로 바로 고쳤다"
  - "globals.css 주석에 env(safe-area-inset-…) 리터럴을 쓰지 않는다 — Task 2 grep 게이트(정의 4줄 외 0)가 주석까지 센다"

patterns-established:
  - "앱 모드 기하 e2e = 크롬 안전영역 0 기준 식(14 + 70 + 8 = 92 · 108 · 76)을 계산 스타일로 단언하고, 식을 제목·주석에 적는다"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — 형제 플랜 미완

coverage:
  - id: D1
    description: "D-25 — viewport-fit=cover · 헤더 56(크롬) · 앱 main 하단 108(390·1280)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/native-shell.spec.ts — safe-area · 탭바 여백 describe(앱 390 홈 · 앱 1280 홈)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-25 · D-27a — 앱 종목상세 CTA bottom 92 · 하단 10 · 예약 76 · 버튼이 탭바 윗변 위"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "native-shell.spec.ts — 앱 390 종목상세"
        status: pass
    human_judgment: false
  - id: D3
    description: "브라우저 회귀 — CTA bottom 0 · 하단 20 · 예약 96 · main 하단 8 · 셸 불변식"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "native-shell.spec.ts 브라우저 390 · home.spec -g 셸 불변식 2건(수정 없음)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test (115 files · 2192 pass · 1 skip)"
        status: pass
    human_judgment: false
  - id: D4
    description: "하단 고정 요소 이동 — /trading 폰 공용 패널이 앱에서 탭바 위 8, 브라우저에서 safe 패딩"
    requirement: MOBILE-01
    verification:
      - kind: manual
        ref: "임시 Playwright 스크린샷 — --safe-area-inset-* 주입(47/34) + 가짜 탭바 오버레이, 360·390 앱/브라우저 · 1280 앱 · 드로어"
        status: pass
    human_judgment: false
  - id: D5
    description: "실기기(iPhone 노치 · Android 제스처 내비)에서 헤더 풀블리드 · 탭바와 CTA·패널 간격 체감"
    verification: []
    human_judgment: true
    rationale: "Chromium 에서는 env() 가 0 이라 주입 경로만 재현된다. iOS env 경로와 Android SystemBars 실주입은 21-16 UAT 몫"

duration: 20min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 06: safe-area · 네이티브 탭바 여백 Summary

**`viewport-fit=cover` 와 `--app-safe-*` 네 변수로 안전영역 원천을 하나로 모았다. 앱(`html.native-app`)에서는 `--native-tabbar-offset`(= max(safe−14, 14) + 70 + 8)으로 CTA · 공용 패널 · 더티 바 · 토스트를 탭바 위로 올리고, 본문 하단에 108 을 두었다. 브라우저는 안전영역만큼만 비켜 서고 크롬에서는 종전 값 그대로다.**

## Performance

- **Duration:** 약 20분
- **Started:** 2026-09-25T22:25Z (KST 07:25)
- **Completed:** 2026-09-25T22:45Z (KST 07:45)
- **Tasks:** 3
- **Files modified:** 12 (코드 10 · 테스트 2), 문서 1 생성

## Accomplishments

- **토대(Task 1):**
  - `layout.tsx` viewport 에 `viewportFit: 'cover'` 를 넣었다.
  - `globals.css` §21 에 `--app-safe-*` 를 두었다. 값은 `var(--safe-area-inset-*, env(...))` 순서로 읽는다.
  - 탭바 변수는 `:root` 에서 0px 이고 `html.native-app` 에서 gap · offset · reserve 108 로 바뀐다. 앱 `main` 하단 여백은 108 이다.
  - 헤더는 `box-content pt-[var(--app-safe-top)]` 이다. 셸 래퍼는 좌우 안전영역만큼 패딩을 준다.
  - aside 의 sticky `top` 과 높이, 카드 `scroll-mt` 에 상단 안전영역을 더했다.
- **하단 고정 요소(Task 2):**
  - 더티 바 · 폰 공용 패널(`data-pinned`) · 시트(투명 테두리)가 브라우저에서 안전영역을 비킨다.
  - 앱에서는 더티 바 · CTA(하단 10 · 예약 76) · 공용 패널이 offset 위에 선다. ≥700 알림 토스트는 offset + 12 에 선다. 더티 바 우측 여백은 0 이다.
  - `shared-panels` 예약의 인라인 `bottom` 은 `calc(var(--native-tabbar-offset, 0px) + 예약px)` 다.
  - 챗 FAB · 토스트 · 키패드 · CTA 도 `--app-safe-*` 만 읽는다. 코드에서 `env(safe-area-inset-` 은 정의 4줄에만 남았다.
- **e2e(Task 3):** `native-shell.spec.ts` 에 앱 390 홈 · 앱 390 종목상세 · 브라우저 390 종목상세 · 앱 1280 홈 4건을 더했다(11/11 통과). `home.spec` 셸 불변식 2건은 파일을 수정하지 않고 통과했다.
- **시각 확인:**
  - 안전영역 47/34 를 Android 식으로 `<html>` 에 인라인 주입하고, D-27a 기하로 가짜 탭바를 겹쳐 캡처했다.
  - 대상: 360·390 앱/브라우저 종목상세와 /trading, 1280 앱 홈, 앱 드로어.
  - 앱 /trading 360 에서 패널 하단(702)과 탭바 윗변(710)이 정확히 8 떨어져 있다.
  - 브라우저에서 패널 높이는 46 + 34 이다.

## Task Commits

1. **Task 1: 토대** — `130a0f1` (feat)
2. **Task 2: 하단 고정 요소** — `ee5e1ba` (feat)
3. **Task 3 중 발견 — 헤더 높이 56 · z-30** — `3e384a4` (fix)
4. **Task 3: e2e** — `038abd9` (test)
5. **공용 패널 예약 식 정리** — `04e28f4` (refactor)

**Plan metadata:** 별도 docs 커밋(SUMMARY · STATE · ROADMAP · deferred-items)

## Files Created/Modified

- `webapp/src/app/layout.tsx` — `viewportFit: 'cover'` 를 넣고 D-25 주석을 달았다.
- `webapp/src/styles/globals.css` — §21 구역(변수 · 앱 본문 108 · 하단 고정 요소 규칙)을 추가했다. FAB 들어올림 식은 `--app-safe-bottom` 을 쓴다.
- `webapp/src/components/layout/app-header.tsx` — `box-content` · 상단 안전영역 · `z-30` 을 적용하고 투명 아래 테두리를 제거했다.
- `webapp/src/components/layout/app-shell.tsx` — 래퍼 좌우 안전영역을 주고, aside sticky 식을 보정했다.
- `webapp/src/components/trading/card/strategy-card.tsx` — `scroll-mt-[calc(4rem+var(--app-safe-top))]`
- `webapp/src/components/trading/workbench/shared-panels.tsx` — `data-slot` · `data-pinned` · 예약 `bottom` 식 · ⑤-c 주석
- `webapp/src/components/stock/stock-detail-tabs.tsx` — `data-order-cta` · 예약/CTA 가 `--app-safe-bottom` 을 읽는다. 앱 분기 주석을 달았다.
- `webapp/src/components/trading/workbench/alert-toasts.tsx` · `chat/chat-fab.tsx` · `trading/lc/number-pad-sheet.tsx` — 안전영역 유틸을 적용했다.
- `webapp/src/components/trading/__tests__/shared-panels.test.tsx` — 예약 `bottom` 기대값을 `reserveBottom(px)` 헬퍼로 바꿨다.
- `webapp/e2e/specs/native-shell.spec.ts` — safe-area · 탭바 여백 describe 4건을 추가했다.

## Decisions Made

- 헤더 아래 테두리(투명 1px)를 제거했다. 이유는 아래 Deviations 2 에 있다.
- 헤더 z-index 를 z-30 으로 올렸다. 이유는 아래 Deviations 3 에 있다.
- 카드 안 더티 바의 JS 핀(`usePinnedToViewportBottom`)은 고치지 않았다. 지금 렌더하는 소비처가 없어서다. 되살릴 때 필요한 수정은 deferred-items.md 에 적었다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shared-panels 단위 테스트 기대값 갱신**
- **Found during:** Task 2
- **Issue:** 플랜이 정한 예약 `bottom` 식 변경으로 `style.bottom === '128px'` 같은 단언 4건이 실패했다.
- **Fix:** `reserveBottom(px)` 헬퍼로 새 식을 단언하도록 바꿨다. 의미(바 높이만큼 비킴)는 같다.
- **Files modified:** `webapp/src/components/trading/__tests__/shared-panels.test.tsx`
- **Commit:** `ee5e1ba`

**2. [Rule 1 - Bug] content-box 헤더가 57px 이 되는 문제**
- **Found during:** Task 3 (behavior 「헤더 높이 56」 준비 중)
- **Issue:** 헤더에는 `border-b border-transparent`(1px)가 있다. 플랜대로 `box-content` 를 쓰면 전체 높이가 56 + 1 = 57 이 된다. aside `top` 과 카드 `scroll-mt` 는 56 기준이라 1px 어긋난다.
- **Fix:** 보이지 않는 테두리를 제거했다. `h-14` 계약(단위 테스트)은 유지된다.
- **Files modified:** `webapp/src/components/layout/app-header.tsx`
- **Commit:** `3e384a4`

**3. [Rule 1 - Bug · 같은 표면 시각 결함] 종목상세 탭 바가 헤더를 덮음**
- **Found during:** 시각 확인(앱 360 종목상세 끝까지 스크롤)
- **Issue:** 탭 바는 `sticky top-0 z-20` 이지만 `main` 이 `overflow-auto` 라 sticky 가 붙지 않고 흐름대로 올라온다. 그러다 `z-10` 헤더 위에 칠해진다.
  - 브라우저에서도 긴 화면에서는 같은 문제가 난다.
  - 앱에서는 본문 108 여백 때문에 짧은 화면에서도 보인다.
- **Fix:** 헤더를 `z-30` 으로 올렸다. 하단 고정층과는 위치가 겹치지 않고, 시트·토스트(z-50)는 여전히 헤더 위다.
- **Files modified:** `webapp/src/components/layout/app-header.tsx`
- **Commit:** `3e384a4`

**4. [Rule 1 - 주석 정확성] number-pad-sheet ② 주석**
- **Found during:** Task 2
- **Issue:** 주석에 「`viewport-fit` 이 없어 실효 10px」이라고 적혀 있었는데, 이제 사실이 아니다. 주석에 `env(safe-area-inset-` 리터럴도 있어 grep 게이트에 걸렸다.
- **Fix:** 주석을 새 동작(`--app-safe-bottom` · 오버레이 시 탭바 숨김)에 맞게 다시 썼다.
- **Commit:** `ee5e1ba`

### Acceptance 비고

- `grep "box-content pt-\[var(--app-safe-top)\]" app-header.tsx` 는 1줄이 나온다. 다만 걸리는 줄은 주석이다. className 에서는 두 토큰 사이에 `flex h-14 items-center` 가 있다. 뜻은 같다.
- `grep "native-tabbar-offset, 0px" shared-panels.tsx` 는 2줄이 나온다(⑤-c 주석 + `reserveBottom` 코드).

## Issues Encountered

- 기존 e2e 실패 3건이 있다. 모두 `trading-workbench.spec.ts` 에 있고 이 플랜과 무관하다. 삼성전자 이름 넘침 2건과 낡은 16px 입력 글꼴 단언 1건이다.
  - 넘침 2건은 플랜 시작 커밋 `c3393ba` 의 `webapp/src` 로 되돌려도 똑같이 실패했다.
  - 3건을 빼고 돌린 나머지 41건은 통과했다. 기록은 `deferred-items.md` 에 있다.

## Verification

- 단위 테스트: Task 1(2 files, 37), Task 2(5 files, 80), 전체 `pnpm --filter @gh-radar/webapp run test` 115 files · 2192 pass · 1 skip 이다.
- typecheck 0 error.
- e2e 통과:
  - `native-shell.spec.ts` 11
  - `home.spec -g 셸 불변식` 2
  - `native-shell` · `home` · `stock-detail-tabs` · `chat` · `sidebar-tree` · `stock-detail` · `a11y` 합계 55
  - `trading-workbench` 41(기존 실패 3건 제외)
- grep: 코드에서 `env(safe-area-inset-` 은 globals.css 의 `--app-safe-*` 정의 4줄에만 있다. `--safe-area-inset-*` 을 정의하는 줄은 0이다.

## Next Phase Readiness

- 21-12(Android 탭바)와 21-13 은 SystemBars 가 주입하는 `--safe-area-inset-*` 를 그대로 받는다. 웹 쪽 추가 작업은 없다.
- 탭바 기하를 바꾸면 D-27a, globals.css §21, 네이티브 상수, native-shell.spec 수치를 함께 고쳐야 한다.
- 21-16 UAT 에서 실기기로 확인할 것: iPhone 노치 헤더 풀블리드, 가로 노치 좌우, Android 제스처 내비 탭바 간격.

## Self-Check: PASSED
