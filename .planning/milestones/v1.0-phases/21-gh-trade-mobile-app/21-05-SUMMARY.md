---
phase: 21-gh-trade-mobile-app
plan: 05
subsystem: webapp-app-shell
tags: [capacitor, app-shell, tailwind-v4, playwright, native-bridge]

requires:
  - phase: 21-01
    provides: "NATIVE_DETECT_SCRIPT — <head> 인라인 감지 → html.native-app · data-native-platform · ready 메시지"
  - phase: 21-04
    provides: "NativeBridgeProvider(window.__ghTrade · route/overlay/theme) · @custom-variant native"
provides:
  - "마크업 계약 data-slot=app-aside · app-menu-button · stock-ai-button"
  - "globals.css 앱 셸 규칙 — html.native-app 에서 aside 숨김 · 햄버거 inline-flex(≥lg 포함)"
  - "ChatFab native:hidden(표시만) · 종목상세 히어로 「AI 분석」 버튼 → openChat({code,name})"
  - "e2e 픽스처 installNativeApp(page,{platform}) · nativeMessages(page) · CapturedNativeMsg · NativeTestPlatform"
  - "e2e/specs/native-shell.spec.ts — 앱 모드 4 + 브라우저 회귀 2"
affects: [21-06, 21-08, 21-09]

actuals:
  tokens: 4330
  tasks: 2
  commits: 3
plan_head_before: 3849f763d3b8262c7204e4ea6879e5abba306db1

tech-stack:
  added: []
  patterns:
    - "셸 분기 중 lg: 유틸과 경합하는 것은 레이어 밖 CSS 규칙(html.native-app [data-slot=…]) — 커스텀 변형과 lg: 의 출력 순서를 믿지 않는다"
    - "경합 없는 표시 토글은 native: 변형(hidden → native:inline-flex, 기존 유틸 + native:hidden)"
    - "앱 모드 e2e = 가짜 Capacitor + 캡처 채널만 심고 감지 스크립트·Provider 는 실물을 태운다"

key-files:
  created:
    - webapp/e2e/fixtures/native-app.ts
    - webapp/e2e/specs/native-shell.spec.ts
  modified:
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/stock/stock-hero.tsx
    - webapp/src/styles/globals.css

key-decisions:
  - "「AI 분석」 버튼은 ml-auto shrink-0 으로 첫 줄 오른쪽 끝(헤더 액션 자리)에 둔다 — 360 폰은 3px 초과로 줄이 넘치고 긴 종목명도 넘치므로, 넘칠 때 다음 줄 왼쪽 외톨이 대신 오른쪽 끝(새로고침과 같은 열)에 선다"
  - "AI 버튼은 로그인 게이트 없이 openChat 을 부른다 — 비로그인은 ChatSheet 가 스스로 LoginRequiredState 를 보여 준다(새 권한 경로 없음, T-21-15)"
  - "e2e 에서 FAB 은 toBeHidden 만이 아니라 toHaveCount(1) + --chat-fab-w 0px 까지 단언 — 없음(부재)과 숨김을 구분하고 더티 바 여백 0 을 잠근다"

patterns-established:
  - "앱 모드 e2e: installNativeApp(page) 먼저 → goto → expect.poll(nativeMessages) 로 메시지 단언"
  - "숨김 단언은 toHaveCount(1) + toBeHidden 짝 — 요소 부재로 우연히 통과하지 않게"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — 형제 플랜 미완

coverage:
  - id: D1
    description: "D-09·D-13 — 앱 1280 에서 aside 숨김 · 햄버거 보임 · 드로어로만 사이드바 열림"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/native-shell.spec.ts — 앱 1280 홈 · 햄버거 드로어"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-10 — 앱 종목상세 FAB 숨김(폭 변수 0px) · 「AI 분석」 → ChatSheet(종목 컨텍스트)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/native-shell.spec.ts — 390 종목상세"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-11·D-12·D-06a — ready 먼저 · route · overlay open/close · __ghTrade.navigate 클라 내비"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/native-shell.spec.ts — 앱 describe 4건"
        status: pass
    human_judgment: false
  - id: D4
    description: "브라우저 셸 무변화 — aside·햄버거·FAB·AI 버튼·__ghTrade · 기존 셸 불변식"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "native-shell.spec 브라우저 회귀 2건 · home.spec + chat.spec 15건"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test (114 files · 2179 pass · 1 skip)"
        status: pass
    human_judgment: false
  - id: D5
    description: "실기기 WebView(iOS WKWebView · Android)에서 셸 분기 체감 — 탭바와 드로어·「AI 분석」 배치"
    verification: []
    human_judgment: true
    rationale: "네이티브 탭바는 21-10·21-12 에서 생긴다. 이 플랜은 Chromium 에서 앱 모드를 재현해 웹 쪽만 잠갔다"

duration: 10min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 05: 앱 셸 분기 + 앱 모드 e2e 픽스처 Summary

**`html.native-app` 하나로 고정 사이드바를 드로어 전용으로(D-09), 종목상세 FAB 을 히어로 「AI 분석」 버튼으로(D-10) 바꿨다. 가짜 Capacitor 위에서 실제 감지 스크립트·Provider 를 태우는 Playwright 픽스처 `installNativeApp` 과 셸 e2e(앱 4 · 브라우저 회귀 2)를 추가했다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-25T21:43Z (KST 06:43)
- **Completed:** 2026-09-25T21:53Z (KST 06:53)
- **Tasks:** 2
- **Files modified:** 7 (생성 2 · 수정 5)

## Accomplishments

- **D-09 · D-13 사이드바:** `app-shell` aside 에 `data-slot="app-aside"`, `app-header` 햄버거에 `data-slot="app-menu-button"` 를 달았다.
  - `globals.css` 레이어 밖 규칙으로 앱에서는 폭과 무관하게 aside 를 숨기고 햄버거를 보인다.
  - 1280(iPad 가로)에서도 드로어로만 사이드바를 연다. 폭으로 탭바 여부를 가르는 웹 분기는 없다.
- **D-10 FAB:** `ChatFab` 에 `native:hidden` 만 더했다. 경로·로그인 게이트와 measureRef 는 그대로다.
  - 숨은 버튼의 `--chat-fab-w` 는 0px 이다. e2e 로 확인했다.
- **D-10 「AI 분석」:** `stock-hero` 첫 줄 `WatchlistToggle` 뒤에 버튼을 두었다(`hidden native:inline-flex`, Sparkles 14).
  - `openChat({code,name})` 으로 기존 ChatSheet 를 연다.
- **e2e 픽스처** `webapp/e2e/fixtures/native-app.ts` 를 만들었다. `addInitScript` 로 `window.Capacitor` 와 iOS/Android 채널 캡처를 심는다.
  - `nativeMessages(page)` 는 파싱한 메시지를 돌려준다.
- **`native-shell.spec.ts` 앱 모드 4건:**
  - 1280 홈: 클래스·플랫폼 속성, aside 숨김, 햄버거 보임, 첫 메시지 `ready`, `route /`
  - 드로어: 열면 `overlay{open:true}`, Escape 로 닫으면 `overlay{open:false}`
  - 390 종목상세: FAB 숨김, 「AI 분석」 클릭 → 챗 시트 + overlay
  - `__ghTrade.navigate('/scanner')`: 새로고침 없이 이동하고 `route` 를 남긴다(마커 유지, ready 1회)
- **`native-shell.spec.ts` 브라우저 회귀 2건:** 1280 홈과 390 종목상세.

## Task Commits

1. **Task 1: 셸 분기** — `df06948` (feat)
2. **Task 1 후속 시각 보정:** `7ad8af5` (fix) — 「AI 분석」 버튼 줄 끝 정렬
3. **Task 2: e2e 픽스처 + spec** — `175ef37` (test)

**Plan metadata:** 별도 docs 커밋(SUMMARY · STATE · ROADMAP)

## Files Created/Modified

- `webapp/src/components/layout/app-shell.tsx`: aside `data-slot="app-aside"` 와 D-09 주석을 넣었다. 클래스는 바꾸지 않았다.
- `webapp/src/components/layout/app-header.tsx`: 햄버거에 `data-slot="app-menu-button"` 를 달았다. 클래스·aria·잉크 보정 주석은 그대로다.
- `webapp/src/styles/globals.css`: 「Phase 21 앱 셸 — 사이드바·햄버거」 레이어 밖 블록을 추가했다. 주석은 D-09·D-13, 레이어 밖을 쓰는 이유, §2.2b 뷰포트 층이라는 점을 설명한다.
- `webapp/src/components/chat/chat-fab.tsx`: `native:hidden` 을 더하고 폭 변수 0 에 대한 주석을 달았다.
- `webapp/src/components/stock/stock-hero.tsx`: `useChat().openChat` 과 「AI 분석」 버튼을 추가했다.
- `webapp/e2e/fixtures/native-app.ts`: `installNativeApp` · `nativeMessages` 와 전역 타입(`__nativeMsgs` · `__ghTrade`).
- `webapp/e2e/specs/native-shell.spec.ts`: 셸 e2e 6건.

## Decisions Made

key-decisions(프론트매터) 참고. 핵심은 두 가지다.
- 「AI 분석」 버튼은 줄 오른쪽 끝에 붙인다.
- 숨김 단언은 요소 부재와 숨김을 구분한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] 360 폰에서 「AI 분석」 버튼이 다음 줄 왼쪽에 외톨이로 떨어짐**
- **Found during:** Task 2 스크린샷 확인(앱 모드 360·390, 긴 종목명)
- **Issue:** 첫 줄 너비는 버튼 26 + 이름 57 + 코드 59 + 배지 50 + 별 36 + AI 79 + 간격 40 = 347px 인데, 360 폰의 본문은 344px 라 3px 넘친다. `flex-wrap` 줄이라 버튼이 다음 줄 왼쪽에 혼자 떨어진다. 긴 종목명은 390 에서도 같은 일이 생긴다.
- **Fix:** 버튼에 `ml-auto shrink-0` 를 주었다. 줄이 넘치지 않으면 첫 줄 오른쪽 끝에 붙고, 넘치면 다음 줄 오른쪽 끝(새로고침과 같은 열)에 선다.
  - 패딩을 줄여 딱 맞추는 방법은 쓰지 않았다. 폰트 렌더링 차이에 취약하고 긴 이름은 어차피 넘친다.
  - 브라우저에서는 이 버튼이 `hidden` 이라 영향이 없다.
- **Files modified:** webapp/src/components/stock/stock-hero.tsx
- **Commit:** 7ad8af5

**2. [주석 문구] 수용 기준 grep 이 정확히 1줄이 되도록 주석 표현을 조정**
- `app-shell` 과 `chat-fab` 주석에 `data-slot="app-aside"` · `native:hidden` 이 그대로 들어가 있어 grep 이 2줄이 됐다. 주석을 「`app-aside` 슬롯」 · 「`native` 변형의 hidden」으로 바꿨다.

---

**Total deviations:** 2건(Rule 1 시각 결함 ×1 · 주석 문구 ×1)
**Impact on plan:** 계약·산출물은 플랜 그대로다. 버튼 위치만 줄 끝으로 정했다.

## Issues Encountered

- **TDD(Task 2 `tdd="true"`):** Task 2 는 테스트 전용이고(`e2e/` 파일만), 구현은 Task 1 에서 이미 커밋됐다. 그래서 RED 커밋 대신 **뮤테이션 확인**으로 대신했다.
  - aside 규칙 셀렉터를 바꾸고 FAB 의 `native:hidden` 을 빼면, 앱 1280 홈과 390 종목상세 두 케이스가 `toBeHidden` 에서 실패한다.
  - 원복하면 7/7 통과한다.
- **기본 브랜치 커밋:** 오케스트레이터 지시(branching_strategy none · master 순차 실행)에 따라 로컬 커밋만 했다. push 는 하지 않았다(21-16 게이트).
- **dev 서버:** 3100 에 떠 있는 리스너가 없어 Playwright `webServer` 가 스스로 띄우고 내렸다. 끝난 뒤 3100 리스너가 없는 것을 확인했다.

## Verification

- 단위 4파일(app-shell-chrome · app-sidebar · chat-fab · stock-hero) → 49 통과. `app-shell-chrome` 은 수정하지 않았다.
- `pnpm --filter @gh-radar/webapp run typecheck`(`tsconfig.e2e.json` 포함) → error TS 0
- `playwright test e2e/specs/native-shell.spec.ts` → **7 passed**(setup 1 + 6)
- 회귀: `playwright test e2e/specs/home.spec.ts e2e/specs/chat.spec.ts` → 15 passed. 셸 패딩·잉크 불변식과 FAB 챗 플로우 포함.
- `pnpm --filter @gh-radar/webapp run test` → **114 파일 · 2179 통과 · 1 skip · 실패 0**. stderr 는 기존 섹션 fetch 실패 로그뿐이다.
- eslint(변경 파일 6개) → 0 problems
- 수용 기준 grep: app-aside 1 · app-menu-button 1 · css 규칙 2개 각 1 · `native:hidden` 1 · stock-ai-button 1 · `native:inline-flex` 1 · `installNativeApp` export 1 · addInitScript ≥1 · spec 의 stock-ai-button · `__ghTrade.navigate` ≥1

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-06(safe-area)은 `installNativeApp` 으로 앱 모드를 재현하고 `native-shell.spec.ts` 에 케이스를 덧붙이면 된다.
- 21-08(검색)과 21-09(계정 카드)도 같은 픽스처를 쓴다.
- 네이티브 탭바(21-10·21-12)가 생기면 D5(실기기 체감)를 스모크에서 본다.

## Self-Check: PASSED

- 생성 파일 2개 모두 FOUND: `webapp/e2e/fixtures/native-app.ts` · `webapp/e2e/specs/native-shell.spec.ts`
- 커밋 `df06948` · `7ad8af5` · `175ef37` 모두 FOUND
- `commits: 3` = `git rev-list --count 3849f76..HEAD`

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
