---
phase: quick-260926-vk9
plan: 01
subsystem: mobile-shell / native-bridge
tags: [D-12a'', tabbar, numpad-sheet, overlay, ios, android]
status: complete
requires: [quick-260926-v5n (D-12a' 키보드 즉시 경로)]
provides: [overlay immediate 신호 · 키패드 시트 열림 = 탭바 즉시 숨김(두 플랫폼)]
affects: [webapp NativeBridgeProvider · NativeOverlayMarker · NumberPadSheet, iOS GHTradeBridgeViewController, Android MainActivity]
tech-stack:
  added: []
  patterns: [opt-in 페이로드 필드(양방향 무시 가능) · 기존 즉시 경로 재사용]
key-files:
  created: []
  modified:
    - webapp/src/lib/native/native-overlay-marker.tsx
    - webapp/src/lib/native/native-bridge-provider.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/lib/native/__tests__/native-overlay.test.tsx
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - webapp/src/lib/native/post-native.ts
    - .planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md
    - webapp/e2e/specs/trading-workbench.spec.ts
decisions:
  - "D-12a'': 키패드 시트(NumberPadSheet)는 키보드 대체 입력이라 D-12a' 즉시 경로를 탄다. Sheet·Dialog·Popover 는 D-12(150ms + 0.2s) 그대로"
  - "신호 = overlay {open:true, immediate:true} — 계수 0→1 을 immediate 마커가 만들 때만. 재표시는 키보드 90ms 디바운스 대상 아님(D-12 보임)"
metrics:
  duration: 9min
  completed: 2026-09-26
  tasks: 3
  files: 9
actuals:
  tokens: 8639
  tasks: 3
  commits: 2
plan_head_before: 58857cd6df64fe6e6d27ef2fe657b85c47c0fdec
---

# Quick 260926-vk9: 키패드 시트 열림 → 네이티브 탭바 즉시 숨김 Summary

웹 `NativeOverlayMarker immediate`(NumberPadSheet 에서만 씀)가 0→1 열림 신호에 `immediate:true` 를 싣고, iOS·Android 는 그 신호를 받으면 v5n 이 키보드용으로 만든 즉시 숨김 경로(애니메이션·대기·이동 없음)를 그대로 탄다. 재표시와 다른 오버레이는 D-12 그대로다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | `b02156a5` | 웹 overlay immediate 신호(마커 · Provider · 키패드) + 단위 회귀면 6(ios·android)·8a·8b·8c + iOS 즉시 경로 |
| 2 | `97e12d6c` | Android 즉시 경로 · post-native.ts 계약 주석 · 21-CONTEXT.md D-12a'' 추기와 D-12 끝 포인터 · 앱 모드 e2e |
| 3 | (저장소 변경 없음) | 운영 설정 복원 · 운영 빌드 · 세 기기 설치 |

push 하지 않았다. `master` 는 origin 보다 5커밋 앞선다(v5n 3개 + vk9 2개).

## 게이트 결과

| 게이트 | 결과 |
|--------|------|
| vitest RED(수정 전) | 6[ios] · 6[android] · 8b 실패 확인 |
| vitest native-overlay · native-bridge-provider · post-native · number-pad-sheet | 70/70 green |
| vitest 전체 (`pnpm --filter @gh-radar/webapp run test`) | 122 files · 2408 passed · 1 skipped(사전 존재) |
| webapp typecheck (tsc + e2e tsconfig) | green |
| Playwright `trading-workbench -g vk9` (새 앱 모드 키패드) | 2 passed(setup 포함) |
| Playwright `native-shell.spec.ts` | 11 passed |
| Playwright `a11y -g "시트 열린 상태"` | 2 passed |
| grep 게이트 Task 1 · Task 2 | OK (components 안 immediate 마커 사용처 정확히 1곳 · CONTEXT D-12a'' 2회) |
| native:check-tab-routes:ios | TAB ROUTES OK 36 |
| native:check-external-links:ios | EXTERNAL LINKS OK 32 |
| native:smoke:ios (3B11B38C-…) | SMOKE OK ready platform=ios |
| native:test:android | BUILD SUCCESSFUL (compileDebugKotlin 실행 · TabRoutesTest · ExternalLinksTest) |
| native:smoke:android (emulator-5554) | SMOKE OK ready platform=android |
| native:sync → native:verify-prod (설치 전) | PROD CONFIG OK — https://trade.jx1.io · cleartext 없음 |
| native:build:ios | BUILD SUCCEEDED · SIM ENTITLEMENTS OK application-identifier=954QPCS3F5.com.ghtrade.app |
| native:build:android | BUILD SUCCESSFUL |
| 산출물 server (시뮬 App.app · APK · 실기기 App.app) | 모두 `{"url":"https://trade.jx1.io","cleartext":false}` |
| native:verify-prod (설치 후) | PROD CONFIG OK |
| Task 3 verify (변경 파일 정확히 9개 · 커밋 ≥2 · HEAD 미push) | OK |

## 세 기기 설치 결과 (운영 빌드)

| 기기 | 방식 | 결과 |
|------|------|------|
| iPhone 17 시뮬레이터 `3B11B38C-DDE2-40F7-AA65-2163A581A6B9` | terminate → simctl install(덮어쓰기) → launch | `2026-09-26 23:02:45.818 [com.ghtrade.app:bridge] ready platform=ios nativeApp=true` |
| emulator-5554 | force-stop → `install -r` → logcat -c → am start | `09-26 23:03:09.510 I/GHTrade ready platform=android nativeApp=true` |
| 실기기 mesya `00008140-0016043836F2801C` (iPhone 16 · iPhone17,3 · connected physical) | 저장소 밖 scratchpad DerivedData 로 xcodebuild(팀 954QPCS3F5 자동 서명) → server 운영값 확인 → devicectl install → process launch | 23:03:56 설치 성공(installationURL …/7A053655-…/App.app) · 「Launched application with com.ghtrade.app bundle identifier.」 |

uninstall 은 어느 기기에서도 하지 않았다(로그인 상태 보존). adb reverse 는 비었다. dev 서버 :3100 은 이 실행 전부터 떠 있던 것(PID 97752)이라 건드리지 않았다. sync 가 추적 파일을 바꾸지 않았다(git status 는 무관 변경만).

## 효과 발생 조건

- **네이티브 쪽은 세 기기에 설치됐다.** 새 네이티브는 `immediate` 를 읽을 줄 안다.
- **웹 쪽(immediate 신호)은 운영 웹에 배포돼야, 즉 push 뒤에야 체감된다.** 앱은 https://trade.jx1.io 를 로드하기 때문이다. 그 전에는 새 네이티브 + 운영 옛 웹 조합이라 필드가 없고, 종전 D-12(150ms + 0.2s)와 같아 회귀가 없다.

### 조합 안전표

| 네이티브 | 웹 | 키패드 열림 탭바 |
|----------|----|------------------|
| 옛 | 새 | 모르는 필드 무시 → D-12 |
| 새 | 옛 | 필드 없음 → D-12 |
| 새 | 새 | 즉시 (D-12a'') |
| 옛 | 옛 | D-12 (현 운영) |

### push 때 함께 나가는 것

- v5n 미push 커밋 3개: `b9cf376e`(iOS) · `41311b4a`(Android) · `58857cd6`(docs) — 네이티브·문서 전용
- 이번 커밋 2개: `b02156a5` · `97e12d6c` — webapp 포함 → Vercel 운영 빌드가 돈다
- (오케스트레이터 docs 커밋이 뒤따르면 그것도)

### push 뒤 확인 방법

1. iOS Console(subsystem `com.ghtrade.app` · debug 포함) 또는 `adb logcat -s GHTrade:D` 에 `overlay open=true immediate=true` 가 찍히는지 본다.
2. 실기기에서 수량·가격 칸을 누르면 탭바가 키패드와 함께 즉시 사라지는지 본다.
3. 키패드를 닫으면 시트가 내려간 뒤 탭바가 0.2s 페이드로 돌아오는지 본다.
4. 드로어·시트·다이얼로그는 여전히 150ms 뒤 페이드로 사라지는지 본다.

## Deviations from Plan

None - plan executed exactly as written. (e2e 에서 열림 신호 poll 을 「1개 이상이 될 때까지 기다린 뒤 전부 `{open:true, immediate:true}` 인지 단언」으로 썼다 — 빈 목록이 `every` 로 통과하는 약한 단언을 피하려는 작성 선택이며 플랜 의도와 같다.)

## 사전 존재 실패

없음. vitest 전체의 1 skipped 는 이 플랜이 만든 것이 아니다.

## Known Stubs

없음.

## Self-Check: PASSED

- 9개 수정 파일 모두 존재 · `git diff --name-only 58857cd6 HEAD` 가 정확히 9개
- 커밋 `b02156a5` · `97e12d6c` 존재(`git rev-list --count 58857cd6..HEAD` = 2) · HEAD 는 origin/master 의 조상 아님(미push)
