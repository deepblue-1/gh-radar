---
phase: 21-gh-trade-mobile-app
plan: 18
subsystem: mobile
tags: [theme, next-themes, ios, android, capacitor, offline-fallback, playwright, gap-closure]
status: complete

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-04 NativeBridgeProvider theme 송신 · 21-11 iOS ThemeStore · 21-12/13 Android ThemeStore · 21-05 e2e installNativeApp 픽스처 · D-19 오프라인 폴백 페이지"
provides:
  - "웹 ThemeProvider defaultTheme=\"dark\" (enableSystem=false 유지)"
  - "iOS ThemeStore.load() 미저장·모르는 값 → .dark"
  - "Android ThemeStore.load() 미저장·모르는 값 → \"dark\" (정확히 \"light\" 일 때만 라이트)"
  - "mobile/www/index.html 오프라인 폴백 — ?theme=light 가 아니면 다크"
  - "e2e webapp/e2e/specs/theme-default.spec.ts (7 테스트)"
affects: [21-20, 21-21, 21-24]

actuals:
  tokens: 3300
  tasks: 2
  commits: 2
plan_head_before: 27dc76abcdbffeb46ba8a4f6f9a29335ea663997

tech-stack:
  added: []
  patterns:
    - "기본 테마는 네 곳(웹 next-themes · iOS/Android ThemeStore · 오프라인 폴백) 한 묶음 — 한 곳만 바꾸면 첫 프레임 번쩍임"
    - "첫 페인트 판정 = addInitScript DOMContentLoaded 시점 html className 기록(하이드레이션 뒤 전환과 구분)"

key-files:
  created:
    - webapp/e2e/specs/theme-default.spec.ts
  modified:
    - webapp/src/components/providers/theme-provider.tsx
    - webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx
    - mobile/ios/App/App/ThemeStore.swift
    - mobile/android/app/src/main/java/com/ghtrade/app/ThemeStore.kt
    - mobile/www/index.html

key-decisions:
  - "21-18: 저장값 없을 때 기본 테마 = 다크, 웹·iOS·Android·오프라인 폴백 공통(G-21-N1 사용자 결정 2026-09-26 · D-23a). 저장값 읽기 경로는 무변경 — 기존 사용자 선택 우선"
  - "기본값은 저장하지 않는다 — localStorage theme 은 사용자 토글 때만 생긴다(e2e 로 잠금)"

patterns-established:
  - "기본 테마 변경 시 theme-provider · ThemeStore.swift · ThemeStore.kt · mobile/www/index.html 을 함께, theme-default.spec.ts 로 검증"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "웹 기본 테마 다크 — 저장값 없음 첫 페인트 다크 · 기본값 미저장 · 저장값 light 유지"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx#defaultTheme=\"dark\" 로 next-themes 를 부른다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/theme-default.spec.ts#저장값 없음 → /login 첫 페인트부터 다크 · 기본값은 저장되지 않는다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/theme-default.spec.ts#저장값 light 는 유지 — 기본값이 사용자 선택을 덮지 않는다"
        status: pass
    human_judgment: false
  - id: D2
    description: "앱 첫 실행(저장값 없음) 웹 → 네이티브 theme {theme:'dark'} 송신"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/theme-default.spec.ts#앱 첫 실행(저장값 없음) → 네이티브에 theme {theme:\"dark\"} 송신"
        status: pass
    human_judgment: false
  - id: D3
    description: "iOS · Android ThemeStore 미저장 기본 다크"
    requirement: MOBILE-01
    verification:
      - kind: build
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios (BUILD SUCCEEDED · SIM ENTITLEMENTS OK)"
        status: pass
      - kind: build
        ref: "pnpm --filter @gh-radar/mobile run native:build:android (BUILD SUCCESSFUL · compileDebugKotlin 실행)"
        status: pass
    human_judgment: true
    rationale: "네이티브 미저장 기본은 빌드만 확인 — 새로 설치한 앱 첫 화면 다크·흰 번쩍임 없음·라이트 저장 유지는 21-24 UAT 항목 2 에서 사람 확인"
  - id: D4
    description: "오프라인 폴백 기본 다크(?theme 없음·모르는 값 → 다크, light 만 라이트)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/theme-default.spec.ts#오프라인 폴백 기본 다크 (D-19 · D-23a) 4케이스"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-26
---

# Phase 21 Plan 18: 기본 테마 다크 (G-21-N1) Summary

**저장값이 없을 때의 기본 테마를 웹 next-themes · iOS/Android ThemeStore · 오프라인 폴백 네 곳에서 함께 다크로 바꾸고, 첫 페인트·저장값 유지·앱 첫 theme 메시지·폴백 4케이스를 e2e 7개로 잠갔다.**

## Performance

- **Duration:** 약 4분
- **Started:** 2026-09-26T04:07:35Z
- **Completed:** 2026-09-26T04:11:30Z
- **Tasks:** 2 (Task 1 tracer · Task 2 auto)
- **Files modified:** 6 (신규 1 · 수정 5)

## 바꾼 기본값 4곳

| 곳 | 전 | 후 |
|---|---|---|
| 웹 `webapp/src/components/providers/theme-provider.tsx` | `defaultTheme="light"` | `defaultTheme="dark"` (`enableSystem={false}` · `attribute="class"` · `disableTransitionOnChange` 유지) |
| iOS `mobile/ios/App/App/ThemeStore.swift` `load()` | `?? .light` | `?? .dark` (key · save 무변경) |
| Android `.../ThemeStore.kt` `load()` | `getString(KEY, "light")` · `dark` 일 때만 dark | `getString(KEY, "dark")` · 정확히 `light` 일 때만 light (save 무변경) |
| 오프라인 폴백 `mobile/www/index.html` | `get('theme') === 'dark'` 일 때만 dark | `!== 'light'` 이면 dark (토큰·탐침·허용 출처 T-21-06 무변경) |

저장값 읽기 경로는 네 곳 모두 그대로다 — localStorage `theme` · UserDefaults `gh-trade.theme` · SharedPreferences `gh_trade/theme` 에 `light` 가 있으면 계속 라이트.

## e2e 결과 (theme-default.spec.ts — 7 passed, skip 0)

| 테스트 | 결과 |
|---|---|
| 저장값 없음 → /login 첫 페인트부터 다크 · 기본값은 저장되지 않는다 | ✓ |
| 저장값 light 는 유지 — 기본값이 사용자 선택을 덮지 않는다 | ✓ |
| 앱 첫 실행(저장값 없음) → 네이티브에 theme {theme:"dark"} 송신 | ✓ |
| 오프라인 폴백 · 쿼리 없음 → 다크(기본) | ✓ |
| 오프라인 폴백 · ?theme=light → 라이트 | ✓ |
| 오프라인 폴백 · ?theme=dark → 다크 | ✓ |
| 오프라인 폴백 · ?theme=bogus(모르는 값) → 다크(기본) | ✓ |

**음성 확인:** defaultTheme 을 임시로 `light` 로 되돌려 돌리면 「저장값 없음 첫 페인트」와 「앱 첫 theme 송신」 두 테스트가 실패했다(되돌림 후 원복 · 커밋에 포함되지 않음). spec 이 회귀를 실제로 잡는다.

## 빌드·단위 결과

- vitest `app-shell-chrome.test.tsx` 4/4 · `src/lib/native` + `src/components/layout` 109/109
- webapp `typecheck`(tsc + tsconfig.e2e) 통과
- `native:build:ios` — `** BUILD SUCCEEDED **` · `SIM ENTITLEMENTS OK` (Task 2 뒤 재빌드 — iOS public 사본에도 새 폴백 반영 확인)
- `native:build:android` — `BUILD SUCCESSFUL` (`:app:compileDebugKotlin` 실행 · APK 새로 생성)

## Task Commits

1. **Task 1: 웹 기본 다크 + iOS ThemeStore (tracer)** — `53fb1a8` (feat)
2. **Task 2: Android ThemeStore + 오프라인 폴백 + 폴백 e2e** — `fd15279` (feat)

트레이서 게이트: human_verify_mode end-of-phase · verify 자동 전용 → 재실행 통과 후 확장(체크포인트 없음).

## Decisions Made

- 기본 다크는 웹·앱 공통(사용자 결정 2026-09-26). CONTEXT D-23a 기록은 21-20 소유.
- theme-provider 의 ★ 저장값 우선 설명은 플랜 지시대로 그대로 두었다(예시가 dark 선택자 기준이지만 「저장값이 항상 우선」 서술은 여전히 참).

## Deviations from Plan

None - plan executed exactly as written. (`enableSystem` false 단언은 테스트에 이미 있어 추가하지 않았다.)

## Issues Encountered

- iOS `public/index.html` 사본은 Task 1 빌드 때 동기화돼 Task 2 의 폴백 변경이 빠져 있었다 → Task 2 뒤 `native:build:ios` 를 다시 돌려 반영 확인(추적 파일 아님 · 커밋 영향 없음).

## 범위 밖 (그대로 둔 것)

- 스플래시(OS 런치 화면)는 D-22 대로 OS 외형.
- 사전 로드 자리값(iOS VC · Android Activity `currentTheme` · 탭바 초기 팔레트)의 dark 전환은 21-20 · 21-21 소유 — `MainActivity.kt` 미변경 확인.
- push 안 함 — 웹 기본값 변경은 push 즉시 모든 새 방문자에게 적용되므로 21-24 체크포인트에서 결정.

## Next Phase Readiness

Ready for 21-19. 사람 확인(새로 설치한 앱 첫 화면 다크 · 흰 번쩍임 없음 · 라이트 저장 유지)은 21-24 UAT 항목 2.

## Self-Check: PASSED

- 파일 6개 존재 확인 · 커밋 `53fb1a8` `fd15279` 존재 확인 · 두 태스크 acceptance_criteria 전부 PASS
