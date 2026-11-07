---
phase: quick-261107-fbj
plan: 01
status: complete
subsystem: webapp /me · 앱 셸(webapp §21 · iOS · Android)
tags: [me, push, account-card, native-shell, safe-area, tabbar-removal]
requires: []
provides:
  - "PushAlertBell + usePushAlertOn (webapp/src/components/me/push-alert-bell.tsx)"
  - "PushDevicesPanel + PUSH_DEVICES_TEXT 「매매 알림」 (webapp/src/components/me/push-devices-panel.tsx)"
  - "globals §21 — 앱 = 브라우저 안전영역 규칙 · --app-safe-bottom = env() 만"
  - "AppRoutes(normalize · isAuthPath) — Android 뒤로가기 전용"
affects: [/me, /trading 앱 폰 밴드, 종목상세 앱 CTA, GH Trade iOS · Android 새 빌드]
tech-stack:
  added: []
  patterns: ["Popover(데스크톱) / Sheet(폰 · 앱) 한 열림 state 갈림", "usePushDevices 모듈 저장소 공유 — 종 · 패널 서버 호출 1벌"]
key-files:
  created:
    - webapp/src/components/me/push-alert-bell.tsx
    - webapp/src/components/me/__tests__/push-alert-bell.test.tsx
  modified:
    - webapp/src/components/me/push-devices-panel.tsx (git mv ← push-devices-card.tsx)
    - webapp/src/components/me/account-card.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/lib/alert-tone.ts
    - webapp/src/lib/breakout-list.ts
    - webapp/src/styles/globals.css
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/lib/native/native-bridge-provider.tsx
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/AppRoutes.kt (git mv ← TabRoutes.kt)
  deleted:
    - webapp/src/components/me/device-settings-card.tsx (+ 테스트)
    - mobile/ios/App/App/GHTradeTabBar.swift · TabRoutes.swift
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt · res/drawable/ic_tab_*.xml(10)
    - mobile/scripts/check-tab-routes-ios.sh · tab-routes-check.swift
decisions:
  - "종의 점 판정: 앱 = 이 기기 키 행 enabled(키는 렌더마다 다시 읽음) · PC 브라우저 = 아무 기기 enabled · 마운트 전 false"
  - "DMA 게이트 화면 계정 카드에도 종을 둔다 — 푸시는 사용자 단위, 숨기면 미매핑 사용자가 기존 기기를 끌 곳이 없다"
  - "돌파 알림음은 playBreakoutTone() 이 언제나 false — 시그니처 유지로 호출부 · 목 무변경"
  - "앱 주요 목적지 프리페치는 유지(이름만 NATIVE_PREFETCH_PATHS) — 드로어 이동 · 푸시 착지도 같은 이득"
metrics:
  duration: "약 15분(02:20Z ~ 02:36Z)"
  completed: 2026-11-07
actuals:
  tokens: 74000
  tasks: 3
  commits: 3
plan_head_before: 0a567410babf9146dc52d14d205ae9f729cf6e2b
plan_head_after: b8ce4b3a5c1df739cd1dab86b29c4e244a881ff6
---

# Phase quick-261107-fbj Plan 01: /me 매매 알림 종 · 앱 네이티브 탭바 제거 Summary

/me 를 스케치 030 A 대로 정리(탭 순서 현황→잔고→주문→손익→설정 · 설정 탭 = 상따 기본설정만 · 계정 카드 「매매 알림」 종 → 폰/앱 바텀 시트 · 데스크톱 팝오버 · 돌파 알림음 끔)하고, GH Trade iOS · Android 네이티브 하단 플로팅 탭바를 걷어 낸 뒤 웹 앱 셸을 브라우저와 같은 안전영역 규칙(앱 /trading 공용 패널 복원 포함)으로 되돌렸다.

## Task 별 커밋

| Task | 내용 | 커밋 |
| ---- | ---- | ---- |
| 1 | /me 탭 순서 · 설정 탭 정리 · 계정 카드 매매 알림 종 · 돌파 알림음 끔 | `2297155b` |
| 2 | 앱 네이티브 하단 탭바 제거 — iOS · Android | `0e76b3d1` |
| 3 | 앱 탭바 여백 걷기 · /trading 하단 공용 패널 복원 · overlay 즉시 필드 걷기 · 주석 정리 | `b8ce4b3a` |

## 검증 (실행한 것)

- **Task 1 vitest** — push-alert-bell(10) · push-devices-panel(17) · account-card(10) · me-client(34) · alert-tone(3) · breakout-list(33) · breakout-strip(46) · use-trading-alerts(28) · workbench-status-bar(46) · trading-workbench(155) + 필터에 걸린 home-client(6): 11 파일 388 통과.
- **Task 3 vitest** — shared-panels(27) · strategy-card(27) · native-overlay(11) · native-bridge-provider(23) · post-native(6) · number-pad-sheet(39): 6 파일 133 통과.
- **typecheck**(앱 + e2e tsconfig) 통과 · **lint** 에러 0(기존 경고만).
- **부정 grep** 전부 빈 결과 — Task 1 두 개 · Task 2 두 개 · Task 3 세 개 · 마지막 교차 확인 1개.
- **plutil -lint** project.pbxproj OK.
- **Android** `native:test:android`(Gradle testDebugUnitTest — main Kotlin 컴파일 포함) BUILD SUCCESSFUL · AppRoutesTest 2 · ExternalLinksTest 1 통과.
- **iOS** `xcodebuild … -destination 'generic/platform=iOS Simulator' build` 성공(exit 0 · 지운 두 파일의 낡은 오브젝트 정리 로그만).
- **e2e(3100 비어 있어 실행)** — brand-account 5 통과 · me.spec 「전략 3 · 계좌 2」 2 통과 · me.spec 「PEY-1」(탭 순서) 2 통과 · native-shell 15 통과 · trading-workbench 「앱 공용 패널|앱 키패드 시트」 3 통과(각 수치에 setup 1 포함).

## 미실행

- order-log.spec P25-8(앱에서 창 분리 버튼 숨김)은 돌리지 않았다 — 패널이 앱에서 다시 보이지만 버튼은 `native:hidden` + `isNativeApp()` 이중 가드라 동작 변화가 없다고 코드로 확인했다.
- 실기기(iOS · Android) UAT 는 메인 세션 · 배포 뒤 몫.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] trading-workbench.test.tsx 의 alert-tone 목 정리**
- **Found during:** Task 1
- **Issue:** 계획 파일 목록에 없던 `webapp/src/components/trading/__tests__/trading-workbench.test.tsx` 가 지운 함수 두 개를 목에 적어 Task 1 부정 grep(`webapp/src`)에 걸렸다.
- **Fix:** 목에서 그 두 줄만 지우고 `playBreakoutTone` 만 남겼다(155 테스트 통과).
- **Commit:** `2297155b`

**2. [Rule 2 - 접근성] 시트 닫힘 초점 복귀**
- **Found during:** Task 1
- **Issue:** 바텀 시트는 Radix 트리거가 없어(열림은 PopoverTrigger 경유) 닫으면 초점이 body 로 떨어진다.
- **Fix:** `SheetContent onCloseAutoFocus` 에서 종 버튼으로 초점을 돌린다.
- **Commit:** `2297155b`

**3. [Rule 1 - 정확성] 주석 사실 정리(계획 목록 밖 1곳)**
- `webapp/e2e/specs/home.spec.ts` 의 「네이티브 탭바가 부르는 실제 경로」 주석을 「옛 탭바 · 지금은 Android 뒤로가기 ④」 로 고쳤다(코드 변화 없음). `number-pad-sheet.tsx` 머리 주석의 「SystemBars 주입 변수가 우선」 문장도 §21 변경(env() 만)에 맞게 고쳤다.
- **Commit:** `b8ce4b3a`

**4. 커밋 브랜치** — `gsd-tools query git.base-branch --is-protected master` 가 true 였지만, `.planning/config.json` `git.branching_strategy: "none"` · 오케스트레이터의 순차(main tree) 지시 · 프로젝트 관례(작업은 master)에 따라 master 에 경로 지정 커밋했다. push 하지 않았다.

**5. 테스트 보강(계획보다 조금 더)**
- push-devices-panel 앱 목록 케이스에 소제목 「다른 기기」 단언 1줄.
- native-shell 에 「앱 android 390 종목상세 — 주입 bottom 48px 무시 · CTA 하단 20」 별도 케이스(계획의 「또는」 둘 다 넣음).
- me-client B2 에 설정 탭 = 상따 기본설정만(패널 · 스위치 · 「알림음」 문구 없음) 단언.

## Known Stubs

없음.

## 메인 세션 할 일

- **webapp/ 변경 → `git push`(Vercel)로 배포.** 단 Task 3 은 overlay 즉시 필드를 걷고 앱 공용 패널을 다시 보이게 하므로, **옛 앱 빌드(탭바 있음)에서는 /trading 공용 패널이 네이티브 탭바와 겹쳐 보일 수 있다**(사용자 결정 「옛 빌드 호환 불필요」 U-5 — 새 빌드 배포와 묶어 진행 권장).
- **mobile/ 변경 → 앱 릴리스 필요:** `pnpm --filter @gh-radar/mobile run native:release`(iOS · Android 새 빌드). `cap sync` 는 실행하지 않았다(플러그인 변경 없음).
- **server/ · relay/ · workers/ · packages/ 변경 0** — 배포 없음.
- UAT: ① /me 폰 · 데스크톱에서 종 → 시트/팝오버 · 이 기기 스위치 켜면 점 ② 설정 탭 = 상따 기본설정만 ③ 새 앱 빌드에 하단 탭바 없음 · 햄버거로 이동 · Android 뒤로가기 ④ 앱 /trading 하단 공용 패널 · 종목상세 CTA 가 홈 인디케이터 위에 붙어 섬.

## 범위 밖 메모

- Android 알림 채널 이름 「체결 알림」(`packages/shared` `PUSH_CHANNEL_NAME` · `lib/push/native-push.ts` 주석)은 OS 설정 화면 범주 이름이라 그대로 뒀다.
- `/me` 「현황 | 로그」 전환은 앱 공용 패널이 돌아온 뒤에도 두 번째 입구로 유지(주석만 갱신).

## Self-Check: PASSED

- FOUND: webapp/src/components/me/push-alert-bell.tsx · push-devices-panel.tsx · __tests__/push-alert-bell.test.tsx · mobile/android/.../AppRoutes.kt · AppRoutesTest.kt
- FOUND commits: 2297155b · 0e76b3d1 · b8ce4b3a (모두 HEAD 조상)
