---
title: Android 앱 안 새 빌드 알림 — Firebase App Distribution SDK
created: 2026-11-07
source: Phase 40 배포 중 사용자 요청
area: mobile
---

## 요청

Android(Firebase App Distribution) 사용자는 새 빌드를 메일·App Tester 앱에서 직접 받아 설치해야 한다.
iOS TestFlight 처럼 업데이트가 따라오게 App Distribution SDK 를 넣자.

## 미리 알아 둘 사실

- **완전 자동이 아니다.** SDK 는 앱을 열 때 「새 빌드가 있어요」 창을 띄우고, 누르면 내려받는다.
  Android 는 조용한 설치를 허용하지 않아서 마지막에 시스템 설치 확인을 한 번 눌러야 한다.
- **테스터 로그인이 한 번 필요하다.** SDK 가 처음에 Google 계정으로 테스터 확인을 받는다.
- **Play 스토어 빌드에는 넣으면 안 된다.** 자체 업데이트 기능이라 Play 정책 위반이다. Google 권고대로
  App Distribution 배포 변형에만 전체 SDK 를 넣고, 나머지에는 API 전용 아티팩트를 쓴다.
  Phase 22 이름이 「Android Play」 를 포함하므로 Play 배포 계획이 있으면 변형 분리가 먼저다.
- 권한 `REQUEST_INSTALL_PACKAGES` 가 필요하다. 위생 검사(check-release-hygiene · check-apk)에 반영해야 한다.
- Phase 22 D-17(앱 안 Firebase SDK 없음)은 Phase 40 에서 Android FCM 만 번복됐다. 이 SDK 는 그 위에 하나 더 얹는 결정이다.
- 앱 껍데기 변경이라 네이티브 릴리스가 한 번 더 필요하다.

## 다음 단계

Phase 40 마무리 뒤 `/gsd-quick` 또는 작은 phase 로. 첫 질문: Play 배포 계획이 있는가(변형 분리 필요 여부).
