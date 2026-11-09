---
phase: 40-fill-push-notification
plan: 12
subsystem: deploy
status: complete
tags: [deploy, supabase, relay, vercel, cloud-run, testflight, firebase-app-distribution, uat, push]

requires:
  - phase: 40-01..40-11 · 40-13
    provides: "판정 RPC · relay 송신기(APNs · FCM) · server /api/push-devices · 웹 기기 카드 · 탭 착지 · 토스트 숨김 · 앱 빌드 설정"
provides:
  - "운영 반영 — 원격 마이그레이션 2 · Secret 2 · relay 8226fdb2 · server 825382f7 · webapp · iOS 202611071000 · Android 611071006"
  - "40-VALIDATION.md status: validated(실기기 UAT 통과)"
affects: []

actuals:
  tasks: 3
plan_head_before: 82782afc65f448059ffa0ed98486a68ca12c26f8

key-files:
  created:
    - .planning/phases/40-fill-push-notification/40-12-DEPLOY-LOG.md
    - webapp/src/components/trading/order-log/order-log-route.tsx
  modified:
    - .planning/phases/40-fill-push-notification/40-VALIDATION.md
    - webapp/src/lib/push/native-push.ts
    - mobile/ios/App/fastlane/Fastfile
    - webapp/src/components/trading/order-log/order-log-window.tsx
    - webapp/src/app/trading/order-log/page.tsx
---

# Phase 40 Plan 12: 배포 · 실기기 UAT Summary

배포 전 게이트(PREDEPLOY-OK) 뒤 DB → 비밀/IAM → relay → webapp → server → 두 앱 순으로 운영에 올렸고, 2026-11-09(월) 장중 실기기 확인에서 사용자가 「푸시 다 잘돼」 로 전 항목 통과를 알렸다.

## Task 1 — 배포 전 게이트

커밋 `f6efe70e`. SC-3 diff 0 · 적용 RPC 재정의 0 · 전체 회귀 통과(server `admin-dma.test.ts` 5초 타임아웃은 Phase 34 부터 있던 간헐 실패 — 단독 실행 통과) · pgTAP 3파일 · 위생 · self-test 통과. `40-VALIDATION.md` 자동 부분 채움.

## Task 2 — 배포 (2026-11-07 토)

상세 표 · 명령 · 시각은 `40-12-DEPLOY-LOG.md` 가 정본이다.

| 순서 | 단계 | 결과 |
|---|---|---|
| 1 | DB | `20261107100000` · `20261107100100` Local · Remote (09:44) |
| 2 | 비밀 · IAM(사용자 `!`) | FCM API · relay SA 역할 · APNs Secret 2개 ENABLED (09:46) |
| 3 | relay | 운영 `7257f0a0` 조상 확인 → `8226fdb2` · `[push] 켜짐 platforms=ios,android` · FCM 권한 확인 (09:48) |
| 4 | webapp | 첫 Vercel 빌드 린트 오류 → `1b770497` → Ready (09:54) |
| 5 | 앱 | sigh 옵션 충돌 → `9d16ebbd` → iOS 202611071000 TestFlight VALID · Android 611071006 Firebase 배포 (10:00) |
| 6 | server(플랜 누락) | `/api/push-devices` 404 발견 → `deploy-server.sh` → `gh-radar-server-00083-chf` · APP_VERSION `825382f7` · 스모크 15/15 (10:31) |

### 배포 중 고친 것

- **`1b770497` fix(40-10)** — 푸시 등록 타이머 `const`. 병합 게이트가 typecheck 만 돌려 `next lint` 오류를 놓쳤다.
- **`9d16ebbd` fix(40-13)** — Fastfile `get_provisioning_profile` 에서 `readonly: false` 제거. fastlane 은 nil 이 아닌 두 옵션을 값과 무관하게 충돌로 본다.
- **플랜 누락** — 배포 순서에 server(Cloud Run)가 없었다. 앱 카드 「켜지 못했어요」 로 드러났고 메인 세션이 배포했다. 메모리 「배포 경로는 diff 디렉터리별로 대조」 로 남겼다.

## Task 3 — 실기기 UAT

| # | 항목 | iOS | Android |
|---|---|---|---|
| 1 | 스위치 켤 때 처음 권한 창 · 켜짐 유지 | 됨(11-07) | 됨 |
| 2 | 3초 안 배너 · 여러 조각 → 「체결」 + 「전량 체결」 · 접수 · 거부 · 취소 문구 · 계좌번호 없음 | 됨 | 됨 |
| 3 | 배너 탭 → 주문로그(종목 · 오늘 · 계좌) | 됨 | 됨 |
| 4 | 포그라운드 배너 · 작업대 주문 토스트 숨김 · 돌파 토스트 유지 | 됨 | 됨 |
| 5 | 스위치 끔 → 0건 · 남의 계좌 0건 | 됨 | 됨 |
| 6 | PC `/me` 기기 목록 · 끄기 · 지우기 | 됨 | 됨 |
| 7 | 앱 로그아웃 → PC 목록에서 사라짐 | 됨 | 됨 |

- **근거:** 11-07(토) 장외에서 iOS 켜기와 거부 푸시 도착을 사용자가 확인했다(relay 송신 10:38:04 · 10:38:19 KST). 11-09(월) 장중 사용 뒤 사용자 답은 「푸시 다 잘돼」 한 줄이다. 항목별 · 플랫폼별 답과 체결→배너 초 단위 실측은 따로 받지 않았다 — 위 표는 그 답을 전 항목 통과로 옮긴 것이다.
- **relay 집계(11-07 ~ 11-09, Cloud Logging `[push] 송신`):** 116회 · 기기 송신 성공 314 · 실패 0 · 토큰 제거 0. 11-09 09:00:27~33 장 시작 몰림 때 미룸(deferred)이 생겼고 이후 run 에서 보냈다. APNs 세션 오류 2회(11-07 13:08 · 11-09 08:00)는 다음 요청이 새 세션을 열어 넘어갔다.
- **UAT 중 고친 것:** 탭 착지 화면(PC 분리 창용)에 머리줄이 없어 하단 탭바가 걷힌 앱에서 나갈 길이 없었다 → `8a612976` 앱에서만 앱 셸로 감쌈(gsd-fast · 웹 배포만).
- **(선택) 재배포 다음 날 중복 없음:** 11-07 뒤 relay 가 다른 작업으로 재배포됐고(운영 `27e912bd`) 사용자 보고상 중복은 없었다.

## 이후 바뀐 것 (Phase 40 밖)

- quick-261109-dz1 이 계좌별 매매 알림 끄기(끈 계좌 표 · 판정 RPC 제외 조건 · `/api/push-devices/accounts`)를 더했다. Phase 40 판정 RPC 위에 얹힌 변경이다.

## Self-Check: PASSED

- `40-12-DEPLOY-LOG.md` · `40-VALIDATION.md` 존재 · `status: validated`
- 커밋 `f6efe70e` · `1b770497` · `9d16ebbd` · `0a567410` · `8a612976` 존재
