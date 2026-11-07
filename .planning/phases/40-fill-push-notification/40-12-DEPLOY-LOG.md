# 40-12 Task 2 배포 기록 (2026-11-07 토)

Task 1(배포 전 게이트)은 PREDEPLOY-OK · 커밋 `f6efe70e`. 이어서 메인 세션이 Task 2 를 끝냈다. Task 3(실기기 UAT)은 다음 거래일 장중에 한다.
40-12-SUMMARY.md 는 Task 3 뒤에 쓴다 — 이 파일의 표를 그대로 옮긴다.

| 순서 | 단계 | 결과 | 시각(KST) |
|---|---|---|---|
| 0 | 기존 실패 · pgTAP 미실행 | 없음(질문 생략) | — |
| 1 | 시각 · 미커밋 마이그레이션 | 토요일 · 남의 마이그레이션 없음 | 09:22 |
| 2 | `supabase db push --linked --yes` | `20261107100000` · `20261107100100` 둘 다 Local · Remote | 09:44 |
| 3 | 사용자 `!` `setup-relay-iam.sh` · `setup-push-secrets.sh apns` | FCM API 켜짐 · relay SA `roles/firebasecloudmessaging.admin` · `gh-radar-apns-auth-key` · `gh-radar-apns-key-id` ENABLED 1 | 09:46 |
| 4 | relay 조상 확인 → `deploy-relay.sh` | 운영 `7257f0a0` 은 HEAD 조상 · 새 버전 `8226fdb2` · `✓ APNs 비밀 확인` · healthz ok · Cloud Logging `[push] 켜짐 platforms=ios,android` · `[push] FCM 권한 확인` | 09:48 |
| 5 | `git push` (Phase 40 커밋 77개뿐) | 첫 Vercel 빌드 Error — `native-push.ts` prefer-const 린트 오류(병합 게이트가 typecheck 만 돌려 놓침) → `1b770497` 수정 · 로컬 `next build` 통과 · 재 push → Production Ready | 09:49 · 09:54 |
| 6 | `GHTRADE_FORCE_PROFILE=1 native:release` | 첫 시도 iOS 즉시 실패(sigh `force` + `readonly` 충돌 · 업로드 전) → `9d16ebbd` Fastfile 수정 → 재시도 성공 | 09:57 · 10:00 |

| 7 | **server(Cloud Run) 배포 — 플랜에서 빠져 있었음** | 사용자 확인 중 앱 카드가 「켜지 못했어요」 · 「기기 목록을 읽지 못했어요」 → 운영 server 가 `e6879a2d`(Phase 40 전)라 `/api/push-devices` 404. 조상 확인 뒤 `deploy-server.sh`(라이브 env: SUPABASE_URL · CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL · TICKGW_URL) → revision `gh-radar-server-00083-chf` · APP_VERSION `825382f7` · 스모크 15/15 · 미인증 401 | 10:31 |

## 릴리스 결과

| 플랫폼 | 빌드 | 검사 | 배포 |
|---|---|---|---|
| iOS | 202611071000 | IPA CHECK OK(aps-environment production · Firebase 0) | TestFlight VALID · 내부 그룹 자동 배포 |
| Android | versionCode 611071006 | APK CHECK OK(google_app_id) | Firebase App Distribution `ghtrade-testers` 알림 |

## 배포 중 고친 것 (Phase 40 결함)

- `1b770497` fix(40-10) — 푸시 등록 타이머 `const` (Vercel 린트 오류).
- `9d16ebbd` fix(40-13) — Fastfile `get_provisioning_profile` 에서 `readonly: false` 제거. fastlane_core 는 두 옵션이 nil 이 아니면 값과 무관하게 충돌로 본다 → 이 수정 전에는 평소 릴리스도 실패했을 것.

- 40-12 Task 2 순서(DB → 비밀/IAM → relay → git push → 앱)에 server 배포가 없었다. git push 는 webapp(Vercel)만 올린다 — 40-07 의 `/api/push-devices` 는 Cloud Run 배포가 따로 필요했다.

## UAT 전 알아 둘 것

- Android 테스터는 App Tester 앱에서 새 빌드를 직접 설치해야 한다(앱 내 업데이트 SDK 는 넣지 않기로 함 — Play 정책).
- iOS 는 TestFlight 자동 업데이트가 꺼져 있으면 수동 업데이트.
- 비상 끄기: `PUSH_NOTIFY=off bash scripts/deploy-relay.sh`.

## 부분 UAT (2026-11-07 토 · 장외)

- iOS: 「이 기기 체결 알림」 켜기 성공(server 재배포 뒤). 수동 매수 → 장외 거부 → 거부 푸시 도착(사용자 확인). relay 로그 `[push] 송신` 10:38:04 · 10:38:19 KST.
- 남은 확인(장중): 체결 3초 · 3조각 → 2건 · 탭 착지 · 포그라운드 배너와 토스트 숨김 · 끄기 → 0 · 계좌 범위 · PC 카드 · 로그아웃 정리 · Android 전 항목.
