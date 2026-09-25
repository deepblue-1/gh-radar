---
phase: 21-gh-trade-mobile-app
plan: 04
subsystem: webapp-native-bridge
tags: [capacitor, react, next-app-router, radix, tailwind-v4, native-bridge]

requires:
  - phase: 21-01
    provides: "native-detect.ts — NATIVE_DETECT_SCRIPT · isNativeApp · nativePlatform · 채널 우선순위(iOS ghTrade → Android GhTradeBridge)"
  - phase: 21-02
    provides: "Android GhTradeBridge @JavascriptInterface postMessage(String) 채널"
provides:
  - "postNative(type, payload) · NativeMsgType — 웹 → 네이티브 단일 송신 통로"
  - "NativeBridgeProvider · useNativeBridge · NativeRefreshFn · window.__ghTrade = { refresh, navigate, back } (앱에서만)"
  - "useNativeRefresh(fn) — 당겨서 새로고침 훅 등록(마운트 등록 · 언마운트 해제)"
  - "NativeOverlayMarker — Sheet·Dialog·NumberPadSheet Content 마운트 수명 = 오버레이 열림"
  - "CSS @custom-variant native · html.native-app body * { overscroll-behavior-y: contain }"
  - "테스트 헬퍼 native-app-mode.ts — enterNativeApp/enterBrowser/resetNativeMode · 실제 송신 JSON 파싱"
affects: [21-05, 21-06, 21-07, 21-08, 21-10, 21-11, 21-12, 21-13]

actuals:
  tokens: 13800
  tasks: 2
  commits: 4
plan_head_before: fc679d5b489cb0da059ea0718e446fdac914d60c

tech-stack:
  added: []
  patterns:
    - "앱 분기는 Provider 하나 — 앱이 아니면 전역·송신 전부 no-op(브라우저 동작 변화 0)"
    - "오버레이 신호 = Content 안 null 마커의 마운트 수명 참조계수(0↔1 전이만 송신)"
    - "refresh 레지스트리 = 등록 훅 전부 Promise.allSettled · 등록 0 이면 location.reload"
    - "네이티브 → 웹 입력(navigate)은 웹에서 재검증 — 역슬래시·제어문자까지 차단"

key-files:
  created:
    - webapp/src/lib/native/post-native.ts
    - webapp/src/lib/native/native-bridge-provider.tsx
    - webapp/src/lib/native/use-native-refresh.ts
    - webapp/src/lib/native/native-overlay-marker.tsx
    - webapp/src/lib/native/__tests__/post-native.test.ts
    - webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx
    - webapp/src/lib/native/__tests__/native-overlay.test.tsx
    - webapp/src/lib/native/__tests__/native-app-mode.ts
  modified:
    - webapp/src/app/layout.tsx
    - webapp/src/components/ui/sheet.tsx
    - webapp/src/components/ui/dialog.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/styles/globals.css

key-decisions:
  - "refresh 레지스트리는 「스택·마지막 우선」이 아니라 등록 훅 전부 호출(Promise.allSettled) — 종목상세 섹션별 재조회가 D-18 을 섹션 경계 안에서 지킨다"
  - "navigate 는 `/` 시작·`//` 금지에 더해 역슬래시·제어문자(U+0000–001F·U+007F)도 거부 — URL 파서가 `/\\evil`·`/<탭>/evil` 을 `//evil` 로 읽는다(T-21-16 강화)"
  - "overlay 송신 여부는 Provider state 가 아니라 isNativeApp()(DOM 클래스)을 직접 읽는다 — 자식 Content effect 가 Provider 마운트 effect 보다 먼저 돌아도 계수·신호가 어긋나지 않는다"
  - "theme 신호는 resolvedTheme 이 undefined(해석 전)면 보내지 않는다 — 하이드레이션 전 light 로 한 번 튀는 것 방지. isNative state(마운트 후에만 true)가 곧 mounted 가드"
  - "pull 판정의 스크롤 조상은 overflow auto|scroll 이면서 실제로 넘치는(scrollHeight > clientHeight) 요소만 — 높이 제한 없는 AppShell main(overflow-auto)은 건너뛴다"

patterns-established:
  - "네이티브 테스트: native-app-mode.ts 헬퍼로 모드 설치/원복, 단언은 postMessage 인자 JSON 파싱 배열로"
  - "공용 오버레이 컴포넌트는 Content 첫 자식에 <NativeOverlayMarker /> — 새 오버레이 원천도 같은 한 줄"

requirements-completed: []  # MOBILE-01 은 Phase 21 의 여러 플랜이 공유 — requirements.ready-ids 가 0/1(형제 플랜 미완)이라 표시하지 않음

coverage:
  - id: D1
    description: "postNative — iOS 우선·Android 폴백·채널 없음 false·SSR 가드·송신 예외 [gh-radar] 로그"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/post-native.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "NativeBridgeProvider — 앱에서만 window.__ghTrade 설치/해제 · refresh 전부 호출/실패 격리/언마운트 해제/등록 0 reload · navigate 검증·재탭 최상단 · route/theme/pull 신호 · 브라우저 무변화 · Provider 밖 폴백"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "오버레이 참조계수 — Sheet·Dialog·NumberPadSheet 열림/닫힘 0↔1 전이만 송신 · 부모 직접 open · back() 가장 위 레이어만 · 브라우저 무송신"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-overlay.test.tsx"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test (113 files · 2169 pass · 1 skip)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실기기/에뮬레이터에서 네이티브가 window.__ghTrade 를 evaluate 하고 overlay/route/theme/pull 메시지를 소비하는 종단 동작"
    requirement: MOBILE-01
    verification: []
    human_judgment: true
    rationale: "네이티브 소비자(탭바·당김·뒤로가기)는 21-10~21-13 에서 만들어진다 — 이 플랜은 웹 쪽 계약만 단위로 잠갔다. 종단 확인은 해당 플랜의 시뮬레이터/에뮬레이터 스모크 몫"
  - id: D5
    description: "CSS native 변형·overscroll-behavior-y: contain 이 앱에서 내부 스크롤 체이닝을 실제로 끊는지(iOS WebKit)"
    verification: []
    human_judgment: true
    rationale: "jsdom 은 스크롤 체이닝을 재현하지 않는다. Tailwind 컴파일로 `native:` 변형 생성·규칙 존재만 확인했고, 체감 동작은 기기에서 봐야 한다"

duration: 11min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 04: NativeBridgeProvider Summary

**앱(`html.native-app`)에서만 켜지는 웹 쪽 네이티브 브리지 — `postNative` 채널 래퍼, `window.__ghTrade`(refresh·navigate·back), 등록 훅 전부 호출하는 refresh 레지스트리, Sheet·Dialog·NumberPadSheet 마커 기반 오버레이 참조계수, route/theme/pull 신호. 브라우저에서는 전역·송신 0.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-25T15:24:45Z
- **Completed:** 2026-09-25T15:35:22Z (KST 2026-09-26)
- **Tasks:** 2 (각각 TDD RED → GREEN)
- **Files modified:** 13 (생성 8 · 수정 5)

## Accomplishments

- `postNative(type, payload)`: iOS `webkit.messageHandlers.ghTrade` 우선, 없으면 Android `window.GhTradeBridge`, 둘 다 없으면 `false`. 메시지는 `{type,payload}` JSON 문자열. 송신 예외는 `[gh-radar]` 로그와 함께 `false` 로 돌려준다.
- `NativeBridgeProvider`: 앱에서만 `window.__ghTrade = { refresh, navigate, back }` 를 설치하고 언마운트 때 지운다.
  - `refresh` 는 등록된 훅을 전부 `Promise.allSettled` 로 부르고, 실패는 `[gh-radar]` 로 남긴다. 등록된 훅이 없으면 `location.reload()`.
  - `navigate` 는 경로를 다시 검증하고, 같은 경로면 스크롤만 최상단으로 올린다.
  - `back` 은 오버레이가 열려 있으면 합성 Escape 를 보내 가장 위 레이어만 닫는다.
  - `route` 는 경로가 바뀔 때마다, `theme` 는 마운트 후와 `resolvedTheme` 이 바뀔 때 보낸다. `pull` 은 Android 에서만, 값이 바뀔 때만 보낸다.
- `useNativeRefresh(fn)`: 마운트 때 한 번 등록하고 늘 최신 `fn` 을 부른다. `null` 은 무시한다.
- `layout.tsx`: `ThemeProvider` 바로 안쪽에 `<NativeBridgeProvider>` 를 두었다(Auth/Relay/Chat 바깥).
- `NativeOverlayMarker`: `ui/sheet`·`ui/dialog`·`number-pad-sheet` Content 의 첫 자식으로 넣었다. DOM 을 만들지 않아 레이아웃 변화가 없다.
- `globals.css`: `@custom-variant native` 와 `html.native-app body * { overscroll-behavior-y: contain; }` 를 추가했다. Tailwind 컴파일로 `native:hidden` 변형이 생성되는 것을 확인했다.

## Task Commits

1. **Task 1 RED:** `6b54f8a` (test) — post-native·provider 실패 테스트와 시그니처 골격. `check tdd-red-evidence` = RED_EVIDENCE_OK(22건 중 17건 실패)
2. **Task 1 GREEN:** `db1c445` (feat) — postNative·Provider·useNativeRefresh 구현, layout 에 마운트
3. **Task 2 RED:** `75569dd` (test) — 오버레이 참조계수·back() 실패 테스트와 마커 골격. RED_EVIDENCE_OK(6건 중 3건 실패)
4. **Task 2 GREEN:** `1f3706d` (feat) — 마커 3곳, CSS native 변형과 overscroll

**Plan metadata:** 별도 docs 커밋(SUMMARY) · STATE/ROADMAP 커밋

## Files Created/Modified

- `webapp/src/lib/native/post-native.ts` — 채널 래퍼 · `NativeMsgType`
- `webapp/src/lib/native/native-bridge-provider.tsx` — Provider · `useNativeBridge` · `window.__ghTrade`
- `webapp/src/lib/native/use-native-refresh.ts` — 새로고침 훅 등록
- `webapp/src/lib/native/native-overlay-marker.tsx` — 오버레이 마커
- `webapp/src/lib/native/__tests__/{post-native.test.ts, native-bridge-provider.test.tsx, native-overlay.test.tsx}` — 단위 테스트(5 + 17 + 7)
- `webapp/src/lib/native/__tests__/native-app-mode.ts` — 앱/브라우저 모드 테스트 헬퍼
- `webapp/src/app/layout.tsx` — Provider 마운트
- `webapp/src/components/ui/sheet.tsx` · `ui/dialog.tsx` · `trading/lc/number-pad-sheet.tsx` — 마커 1줄씩
- `webapp/src/styles/globals.css` — `native` 변형 + overscroll 규칙

## Decisions Made

key-decisions(프론트매터)와 같다. 핵심은 둘이다. 레지스트리는 등록된 훅을 전부 부르고, `navigate` 는 역슬래시·제어문자까지 거부한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] navigate 가 역슬래시·제어문자 우회를 막지 못함**
- **Found during:** Task 1 GREEN
- **Issue:** 플랜 조건(`/` 시작 · `//` 금지 · 문자열)만으로는 `'/\\evil.com'` · `'/\t/evil.com'` 이 통과한다. WHATWG URL 파서는 `\` 를 `/` 로 읽고 탭·개행을 지우므로 둘 다 `//evil.com`(프로토콜 상대 경로)이 된다. T-21-16 의 목적을 우회할 수 있었다.
- **Fix:** `isSafeInternalPath` 가 `[\\\u0000-\u001f\u007f]` 를 거부한다. 테스트 9 에 두 입력을 추가했다.
- **Files modified:** native-bridge-provider.tsx, native-bridge-provider.test.tsx
- **Committed in:** db1c445

**2. [Rule 2 - Correctness] theme 신호가 해석 전 값으로 나갈 수 있음**
- **Found during:** Task 1 GREEN
- **Issue:** 플랜 식 `resolvedTheme === 'dark' ? 'dark' : 'light'` 는 `resolvedTheme` 이 아직 `undefined` 일 때 `light` 를 보낸다. 다크 사용자라면 light 다음 dark 로 한 번 튄다(「하이드레이션 전 값 금지」 위반).
- **Fix:** `resolvedTheme` 이 없으면 보내지 않는다. 테스트 11b 를 추가했다.
- **Committed in:** db1c445

**3. [Rule 3 - Blocking/테스트 구조] 공용 테스트 헬퍼 파일 추가**
- **Issue:** 플랜 Task 2 는 「Task 1 과 같은 모양의 앱 모드 헬퍼 — 공용 헬퍼가 있으면 재사용」을 요구했지만, 플랜 files 목록에 헬퍼 파일이 없었다.
- **Fix:** `__tests__/native-app-mode.ts` 를 만들었다(`*.test.*` 가 아니라 수집 대상이 아님). 세 테스트 파일이 이 헬퍼를 쓴다.
- **Committed in:** 6b54f8a

**4. [범위 보강] NumberPadSheet 오버레이 케이스 추가**
- 플랜 behavior 는 Sheet·Dialog 만 렌더했다. 세 번째 원천인 키패드 시트도 `{open:true}`/`{open:false}` 를 보내는지 케이스 6 으로 잠갔다.
- 뮤테이션 확인: 키패드의 마커를 지우면 케이스 6 이 실패한다.
- **Committed in:** 1f3706d

---

**Total deviations:** 4건(Rule 2 ×2 · Rule 3 ×1 · 테스트 보강 ×1)
**Impact on plan:** 계약·산출물은 플랜 그대로다. 보안 검증과 신호 정확성만 강화했고 범위 확장은 없다.

## Issues Encountered

- **모달 아래 시트는 접근성 이름 계산에서 빠진다.** back() 테스트에서 Dialog B(모달) 아래의 Sheet A 는 `aria-hidden` 이라 `getByRole('dialog', {name})` 로 찾을 수 없었다. 동작은 맞았고 테스트 쿼리만 문제였으므로 `[data-slot="sheet-content"]` 존재로 단언하도록 바꿨다.
- **기본 브랜치 커밋.** gsd-tools 의 `git.base-branch --is-protected master` 는 `true` 다. 그러나 오케스트레이터가 master 메인 트리 순차 실행을 명시했고(branching_strategy none, 21-01·21-02 도 master), 그 지시에 따라 로컬 커밋만 했다. push 는 하지 않았다.

## TDD Gate Compliance

- Task 1: RED `6b54f8a` → GREEN `db1c445`
- Task 2: RED `75569dd` → GREEN `1f3706d`
- 두 RED 모두 `gsd-tools check tdd-red-evidence` = `RED_EVIDENCE_OK` 이다. vitest `tap-flat` 출력에 실제 ok/not ok 줄 수로 `# tests/# pass/# fail` 요약을 덧붙여 판정했다.
- 골격 모듈은 RED 에서 시그니처만 갖췄으므로 실패 원인은 로드 오류가 아니라 단언 실패다.
- REFACTOR 커밋은 없다(필요 없었음).

## Verification

- `vitest --run src/lib/native` → 4파일 · 37 통과
- `vitest --run native-overlay · number-pad-sheet · global-search` → 48 통과
- `pnpm --filter @gh-radar/webapp run typecheck` → error TS 0
- `pnpm --filter @gh-radar/webapp run test` → **113 파일 · 2169 통과 · 1 skip · 실패 0**
  - stderr 출처는 기존 tick-rule·orderbook 테스트뿐이고, native 관련 출력은 0이다.
- eslint(변경 파일) → 0 problems
- 수용 기준 grep 전부 통과: postNative export, NativeMsgType 유니온, `__ghTrade` ×7, `allSettled` ×2, layout `<NativeBridgeProvider>`, `useNativeRefresh` export, 마커 파일당 1줄, `@custom-variant native`, `overscroll-behavior-y: contain`, 마커 코드 내 `onOpenChange` 0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-05(앱 셸 CSS)·21-06(safe-area)은 `native:` 변형과 `html.native-app` 규칙 자리를 바로 쓸 수 있다.
- 21-07·21-08: 페이지·섹션이 `useNativeRefresh(fn)` 한 줄로 당김 재조회를 연결한다.
- 21-10~21-13: 네이티브는 두 가지를 쓴다.
  - 부르는 쪽: `window.__ghTrade.{refresh,navigate,back}` 를 evaluate 한다.
  - 받는 쪽: `route {path}` · `theme {theme}` · `overlay {open}` · `pull {blocked}`(Android) JSON 문자열 메시지를 파싱한다.
- 막힌 것 없음. 21-03 은 아직 미실행(이 플랜은 21-01 에만 의존).

## Self-Check: PASSED

- 생성 파일 8개 모두 FOUND
- 커밋 6b54f8a · db1c445 · 75569dd · 1f3706d 모두 FOUND
- 수용 기준 · plan-level verification 재실행 통과

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
