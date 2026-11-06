# Phase 40 — 외부 준비물 완료 기록 (40-04)

- **날짜:** 2026-11-07
- **누가:** 사용자(Apple Developer · Firebase 콘솔 작업 · 파일 이동) · 메인 세션(권한 교정) · executor(모양 검사 · 이 기록)
- **값은 기록하지 않음.** 이 문서에는 키 내용 · Key ID · API 키 · 앱 ID 값이 없다. 파일 존재 · 권한 · 판정 결과 · google-services.json 의 sha256 만 적는다.
- `.p8` 은 내용을 열지 않았다(`cat` · `head` · `open` 없음) — 존재 · 개수 · 권한만 봤다.

## 항목

| 항목 | 상태 | 위치 · 권한 | 검사 |
|---|---|---|---|
| App ID `com.ghtrade.app` Push Notifications capability | 켜짐(사용자 확인) | Apple Developer 팀 954QPCS3F5 → Identifiers | 콘솔 작업 — 저장소에서 검증 불가 · 사용자 답 「준비물 완료」 |
| APNs Auth Key(.p8 · 토큰 인증) | 발급 · 보관 | `~/.config/gh-trade/push/AuthKey_<KeyID>.p8` · 600 | 폴더 안 `AuthKey_*.p8` 정확히 1개 · 권한 600 · 내용 미열람 |
| APNs 키 Environment | Sandbox & Production | Apple Developer → Keys | 사용자 흐름(Configure 에서 환경 선택 후 Continue) |
| 보관 폴더 | 있음 | `~/.config/gh-trade/push/` · 700 | `stat -f '%Lp'` = 700 |
| Android `google-services.json` | 받음 | `~/.config/gh-trade/push/google-services.json` · 600 | GSJ-OK(아래) |
| iOS `GoogleService-Info.plist` | 받지 않음(의도) | — | iOS 는 Firebase 없이 APNs 직접(SC-5) |

## google-services.json 모양 검사 (GSJ-OK)

공개 클라이언트 설정이라 값 자체는 비밀이 아니지만, 출력은 판정 줄만 남겼다.

- `project_info.project_id` = `gh-radar` — 통과
- `client` 원소 1개 · 그중 `client_info.android_client_info.package_name` = `com.ghtrade.app` 인 원소 정확히 1개 — 통과
- 어느 깊이에도 `private_key` 없음 · `service_account` 없음(서비스 계정 키 혼동 아님) — 통과
- **sha256:** `69e95dd80859788e03cc32977f89bf69f1c68fe42cccb618f6acea87d57437cc`
  (40-08 이 `mobile/android/app/google-services.json` 으로 복사한 뒤 같은 값인지 대조한다)

## 권한 교정 (메인 세션)

사용자가 만든 직후 상태는 폴더 755 · `google-services.json` 644 였다(플랜 안내의 `mv` 줄은 파일 권한을 바꾸지 않는다). 메인 세션이 `chmod` 로 폴더 700 · `.p8` 600 · `google-services.json` 600 으로 맞췄고, 이 executor 의 재검사에서 세 값이 모두 기대값이었다.

## 진행 중 막힘 (40-12 참고)

- Apple Developer 의 Identifiers 화면이 처음에는 열리지 않았다 — 최신 **Program License Agreement** 동의가 필요했다. 사용자가 동의한 뒤 진행됐다. 40-12 에서 배포 프로파일 재생성(`GHTRADE_FORCE_PROFILE=1`)이나 키 작업 중 같은 화면이 막히면 계약 동의부터 확인한다.
- APNs 키 생성 화면은 Configure 에서 환경(Sandbox & Production)을 고른 뒤에야 Continue 가 됐다.

## 보관 위치 분리

- 푸시 비밀: `~/.config/gh-trade/push/` (이 기록)
- 릴리스 비밀: `~/.config/gh-trade/release/` (ASC API 키 .p8 등) — **다른 폴더**. 두 .p8 을 섞지 않는다. `mobile/scripts/check-release-hygiene.sh` (4) 는 release 폴더만 본다.

## 다음 사용처

- **40-08** (Android Firebase): `~/.config/gh-trade/push/google-services.json` → `mobile/android/app/google-services.json` 복사 · 추적 · 커밋(Phase 22 D-17 의 Android 부분만 번복). sha256 대조.
- **40-12** (relay 배포): 사용자가 `scripts/setup-push-secrets.sh` 를 `!` 로 실행 → `AuthKey_*.p8` 을 base64 한 줄로 `gcloud secrets versions add gh-radar-apns-auth-key --data-file=-`. Key ID 는 스크립트가 파일 이름에서 읽는다. App ID capability 가 바뀌었으므로 iOS 배포 프로파일 재생성(`GHTRADE_FORCE_PROFILE=1`) 필요.
