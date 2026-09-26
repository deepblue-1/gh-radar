---
phase: quick-260926-v5n
plan: 01
subsystem: mobile-native-shell
tags: [ios, android, keyboard, tabbar, D-12a']
status: complete
requires: [Phase 21 D-12 · D-12a · D-12b 탭바 가시성 상태기]
provides: [키보드 사유 탭바 즉시 숨김(애니메이션 없음) — iOS · Android 공통]
affects: [mobile/ios GHTradeBridgeViewController · mobile/android MainActivity · 21-CONTEXT.md D-12a']
tech-stack:
  added: []
  patterns: [UIView.performWithoutAnimation 으로 키보드 애니메이션 트랜잭션 상속 차단]
key-files:
  created: []
  modified:
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - .planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md
decisions:
  - "D-12a': 키보드 사유 탭바 숨김 = 애니메이션 없이 즉시(두 플랫폼 공통). iOS 는 performWithoutAnimation + removeAllAnimations 로 키보드 트랜잭션 상속까지 끊음. 나머지 D-12a(이동 없음 · 재표시 90ms · 하드웨어/플로팅 키보드 유지)와 D-12 · D-12b 불변"
requirements: [V5N-1, V5N-2, V5N-3, V5N-4]
metrics:
  completed: 2026-09-26
  duration: ~5분(22:35~22:40 KST)
actuals:
  tokens: 4260
  tasks: 3
  commits: 2
plan_head_before: a2e64f75
---

# Quick 260926-v5n: iOS·Android 키보드 사유 탭바 즉시 숨김 Summary

키보드가 올라올 때 하단 네이티브 탭바가 페이드 없이 그 호출 안에서 곧바로 사라진다. iOS 는 `UIView.performWithoutAnimation` 과 `removeAllAnimations` 를 함께 써서, keyboardWillShow 가 키보드 애니메이션 트랜잭션 안에서 와도 그 길이·곡선을 물려받지 않는다. Android 는 `animate().cancel()` 뒤 alpha 0 과 GONE 을 바로 적용한다. 두 플랫폼 모두 재표시 90ms 디바운스와 비키보드 150ms + 0.2s 경로는 그대로다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | `b9cf376e` | iOS 키보드 분기 즉시 숨김 · 키보드 길이·곡선 상태 삭제 · 21-CONTEXT.md D-12a' 추기(D-12a 끝 포인터 + 새 bullet) |
| 2 | `41311b4a` | Android 키보드 분기 즉시 숨김 · IME 길이·보간기 필드 삭제 · `keyboardRising()` 인자 제거(호출부 2곳) |
| 3 | (커밋 없음) | 운영 sync · 빌드 · 세 기기 설치만 |

push 하지 않았다. `origin/master` 보다 2커밋 앞서 있다.

## 게이트 결과

| 게이트 | 결과 |
|--------|------|
| Task 1 grep 게이트(키보드 길이·곡선 상태 0 · performWithoutAnimation · 150ms/90ms/0.2s/8pt · 끝 프레임 판정 · D-12a' ≥ 2) | PASS |
| native:check-tab-routes:ios | TAB ROUTES OK 36 |
| native:check-external-links:ios | EXTERNAL LINKS OK 32 |
| native:smoke:ios (iPhone 17 · 3B11B38C-…) | SMOKE OK ready platform=ios (22:36:22) |
| Task 2 grep 게이트(IME 길이·보간기 0 · keyboardRising() ≥ 3 · 150/90/8dp) | PASS |
| native:test:android (TabRoutesTest · ExternalLinksTest · compileDebugKotlin 포함) | BUILD SUCCESSFUL |
| native:smoke:android (emulator-5554) | SMOKE OK ready platform=android (22:37:26) |
| native:sync → native:verify-prod (설치 전) | PROD CONFIG OK |
| native:build:ios | BUILD SUCCEEDED · SIM ENTITLEMENTS OK |
| native:build:android | BUILD SUCCESSFUL |
| 산출물 server(시뮬레이터 App.app · APK · 실기기 App.app) | 셋 다 `{"url":"https://trade.jx1.io","cleartext":false}` |
| native:verify-prod (설치 후) | PROD CONFIG OK |
| Task 3 자동 verify(webapp diff 0 · 커밋 2 · 로컬 전용) | PASS |

## 기기 설치

| 기기 | 방식 | 결과 |
|------|------|------|
| iPhone 17 시뮬레이터 (3B11B38C-DDE2-40F7-AA65-2163A581A6B9) | terminate → `simctl install` 덮어쓰기(uninstall 없음) → launch | ready platform=ios nativeApp=true 22:38:17 |
| emulator-5554 | force-stop → `adb install -r`(uninstall 없음) → am start | ready platform=android nativeApp=true 22:38:36 |
| 실기기 mesya (00008140-0016043836F2801C · iPhone 16 · iPhone17,3) | connected·physical 확인 → 저장소 밖 scratchpad DerivedData(`v5n-device-dd`)에서 `generic/platform=iOS` 자동 서명 빌드 → `devicectl device install app`(uninstall 없음) → `devicectl device process launch` | 설치 성공 · 실행 성공 22:39:34 |

adb reverse 목록은 비어 있다. dev 서버(:3100)는 이미 떠 있던 것을 썼다. 이 실행에서 띄운 것이 아니므로 종료하지 않았다.

## 사용자 체감 확인 요청

실기기에서 주문 수량 입력칸을 눌러 탭바가 즉시 사라지는지 봐 주세요. 함께 볼 것은 두 가지입니다.
- 키보드를 내리면 약 90ms 뒤 탭바가 0.2s 페이드로 돌아오는지
- 입력칸 사이를 옮길 때 탭바가 깜빡이지 않는지

## 범위 밖 후속 후보

그래도 지연이 남는다면 원인은 keyboardWillShow 가 전달되는 시점 자체다. 다음 수단은 웹 focusin 신호다. 이번에는 구현하지 않았다.

## Deviations from Plan

None - plan executed exactly as written.

참고: iOS 새 분기에는 플랜 문구대로 진행 중 애니메이션을 걷어내는 이유를 한 줄 주석으로 달았다(비키보드 숨김 완료 핸들러는 finished=false). Android 에도 cancel 된 애니메이터의 withEndAction 이 불리지 않는다는 주석을 한 줄 달았다. 동작 변화는 없다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: mobile/ios/App/App/GHTradeBridgeViewController.swift (performWithoutAnimation)
- FOUND: mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt (private fun keyboardRising())
- FOUND: .planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md (D-12a' 2회)
- FOUND: b9cf376e · 41311b4a
