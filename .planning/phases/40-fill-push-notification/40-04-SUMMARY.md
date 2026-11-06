---
phase: 40-fill-push-notification
plan: 04
subsystem: infra
tags: [apns, fcm, firebase, google-services-json, external-prereq, secrets-hygiene]

requires: []
provides:
  - "저장소 밖 ~/.config/gh-trade/push/AuthKey_*.p8 (600 · 폴더 700) — 40-12 Secret gh-radar-apns-auth-key 원천"
  - "저장소 밖 ~/.config/gh-trade/push/google-services.json (600 · GSJ-OK) — 40-08 복사 원천"
  - "40-EXTERNAL-PREREQ.md — 값 없는 완료 기록 · google-services.json sha256"
affects: [40-08, 40-12]

actuals:
  tokens: 1400
  tasks: 2
  commits: 1
plan_head_before: 43ae0da89cf3a70bdf08391d636febece7346ff2
plan_head_after: 4eac2d5eab0e536f1c19cf97e956e7a41115fb92

tech-stack:
  added: []
  patterns:
    - "외부 비밀은 존재·개수·권한만 검사(stat -f '%Lp') — 내용 미열람"
    - "공개 설정 파일은 판정 줄 + sha256 만 기록 — 복사 후 대조용"

key-files:
  created:
    - .planning/phases/40-fill-push-notification/40-EXTERNAL-PREREQ.md
  modified: []

key-decisions:
  - "APNs 키 환경은 Sandbox & Production — 개발·TestFlight·스토어 빌드 모두 같은 키로 송신"
  - "푸시 비밀 폴더(~/.config/gh-trade/push/)는 릴리스 비밀 폴더와 분리 유지 — 두 .p8 을 섞지 않는다"

patterns-established:
  - "외부 준비물 기록: 값·Key ID 없이 위치·권한·판정·sha256 만"

requirements-completed: [SC-1, SC-5]

coverage:
  - id: D1
    description: "APNs Auth Key(.p8)가 저장소 밖 ~/.config/gh-trade/push/ 에 정확히 1개 · 폴더 700 · 파일 600"
    requirement: "SC-1"
    verification:
      - kind: other
        ref: "stat -f '%Lp' (dir=700 · p8=600 · p8count=1) + PREREQ-FILES-OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "google-services.json 이 gh-radar 프로젝트 · com.ghtrade.app 클라이언트 1개 · SA 키 아님 (GSJ-OK · PREREQ-OK)"
    requirement: "SC-5"
    verification:
      - kind: other
        ref: "40-04-PLAN Task 2 <verify> node -e 모양 검사 → PREREQ-OK"
        status: pass
    human_judgment: false
  - id: D3
    description: "App ID com.ghtrade.app Push Notifications capability 켜짐"
    requirement: "SC-1"
    verification: []
    human_judgment: true
    rationale: "Apple Developer 콘솔 상태라 저장소·CLI 에서 확인할 수 없다 — 사용자 답 「준비물 완료」 가 근거. 실제 확인은 40-12 프로파일 재생성 · 기기 토큰 수신."

duration: 4min
completed: 2026-11-07
status: complete
---

# Phase 40 Plan 04: 푸시 외부 준비물(APNs 키 · google-services.json) Summary

**사용자가 받은 APNs .p8(Sandbox & Production)과 Android google-services.json 을 저장소 밖 700/600 폴더에서 값 비출력으로 검사(GSJ-OK · PREREQ-OK)하고 sha256 포함 완료 기록을 커밋했다.**

## Performance

- **Duration:** 약 4분 (Task 2 · 이어받기 실행)
- **Completed:** 2026-11-07
- **Tasks:** 2/2 (Task 1 = 사용자 콘솔 작업 · checkpoint:human-action 해소)
- **Files modified:** 1 (저장소 안)

## Accomplishments

- 권한 재검사: `~/.config/gh-trade/push` = 700 · `AuthKey_*.p8` 정확히 1개 · 600 · `google-services.json` 600 — `.p8` 내용은 열지 않음
- `google-services.json` 모양 검사 GSJ-OK: `project_id` = gh-radar · 클라이언트 1개 중 `com.ghtrade.app` 1개 · `private_key` · `service_account` 없음
- sha256 `69e95dd8…37cc`(전체 값은 기록 파일) — 40-08 복사 후 대조용
- 기록에 Key ID 미포함을 값 비출력 카운트로 확인(0건) · `BEGIN PRIVATE KEY` 0건

## Task Commits

1. **Task 1: [사용자] Apple — App ID Push · APNs 키 / Firebase — google-services.json** — 커밋 없음(저장소 밖 작업 · 사용자 「준비물 완료」)
2. **Task 2: 준비물 모양 검사(값 비출력) · 완료 기록 커밋** — `4eac2d5e` (docs)

## Files Created/Modified

- `.planning/phases/40-fill-push-notification/40-EXTERNAL-PREREQ.md` — 값 없는 외부 준비물 완료 기록(항목 표 · GSJ-OK 판정 · sha256 · 권한 교정 이력 · 40-12 참고 메모 · 다음 사용처)

## Decisions Made

- APNs 키 Environment 는 Sandbox & Production(Apple UI 가 Configure 에서 환경 선택을 요구) — 디버그·릴리스 빌드가 같은 키를 쓴다.

## Deviations from Plan

### 권한 교정(메인 세션 · 기록에 반영)

- **발견:** Task 1 직후 — 사용자가 만든 폴더가 755, `google-services.json` 이 644 였다(플랜 안내의 `mv` 줄은 파일 권한을 바꾸지 않는다).
- **조치:** 메인 세션이 `chmod` 로 700 · 600 · 600 으로 맞췄다. Task 2 ① 의 「아니면 chmod 로 맞추고 기록에 적는다」 그대로이며, 이 executor 재검사 시점에는 세 값이 기대값이라 추가 변경 없음. 40-EXTERNAL-PREREQ.md 「권한 교정」 절에 적었다.

그 밖에는 플랜대로 실행.

## Issues Encountered

- Apple Developer Identifiers 화면이 최신 Program License Agreement 동의 전까지 막혔다(사용자 동의 후 진행). 40-12 에서 프로파일 재생성 · 키 작업이 막히면 계약 동의부터 확인 — 기록 파일에 메모.

## User Setup Required

없음 — 이 플랜의 사용자 작업(Task 1)은 끝났다. 남은 비밀 주입(`scripts/setup-push-secrets.sh` `!` 실행)은 40-12 몫.

## Next Phase Readiness

- 40-08: `google-services.json` 복사 가능(sha256 대조).
- 40-12: `.p8` 로 Secret `gh-radar-apns-auth-key` 생성 가능 · App ID capability 변경으로 iOS 배포 프로파일 재생성(`GHTRADE_FORCE_PROFILE=1`) 필요.

## Self-Check: PASSED

- FOUND: .planning/phases/40-fill-push-notification/40-EXTERNAL-PREREQ.md
- FOUND: 4eac2d5e (HEAD 조상)
- PREREQ-OK · `BEGIN PRIVATE KEY` 0 · sha256 줄 1 · Key ID 0
