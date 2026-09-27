---
phase: 22-gh-trade-ios-testflight-android-play
plan: 05
subsystem: mobile-release
tags: [firebase, app-distribution, gcp-iam, service-account, oauth, android, release-hygiene]

requires:
  - phase: 22-04
    provides: "setup-release-secrets.sh 규약(dir · keystore · backup · play-sa · 값 비출력) · check-release-hygiene.sh (1)~(7) · 업로드 인증서 SHA-1"
  - phase: 21-03
    provides: "기존 GCP OAuth 클라이언트 3개(웹 · iOS · Android debug) · Supabase Client IDs — 바꾸지 않음"
provides:
  - "setup-release-secrets.sh stage firebase-sa — API 사용 설정 · 전용 SA gh-trade-appdistro · 역할 roles/firebaseappdistro.admin 하나 · 키 600 · 값 비출력 · Secret Manager 백업 없음"
  - "check-release-hygiene.sh 보강 — ignore 21경로 · google-services.json 추적/존재 금지 (3)(8) · Firebase SA 키 권한 (4) · Fastfile Firebase 호출 자격 명시 불변식 (9)"
  - "Firebase(gh-radar) · Android 앱 com.ghtrade.app(SHA-1 없음) · App Distribution 온보딩 · 그룹 ghtrade-testers(본인 1명)"
  - "Firebase Android 앱 ID 1:1023658565518:android:3b06f0472060afa97e4edf (22-07 GHTRADE_FIREBASE_ANDROID_APP_ID 가 읽는 공개 식별자)"
  - "GCP Android OAuth 클라이언트 GH Trade Android (upload key) — 업로드 키 SHA-1"
  - "SA 키 ~/.config/gh-trade/release/firebase-appdistro-service-account.json (600 · 디렉터리 700)"
affects: [22-07, 22-08, 22-09, 23]

actuals:
  tokens: 1630     # chars/4 — 68b8008e 의 추가 줄 6,504자(3개 파일). Task 2·3 은 저장소 변경 없음
  tasks: 3
  commits: 1       # MEASURED: git rev-list --count --grep='(22-05)' a2bf1be4..HEAD = 1 · 원시 범위 a2bf1be4..HEAD = 7 은 끼어든 22-06(3) · 22-07(3) 커밋 포함
plan_head_before: a2bf1be4d595195b15252337d61c094ce14987e6

tech-stack:
  added: []
  patterns:
    - "릴리스 도구 전용 SA 는 역할 하나만 · 키는 사용자/허가된 실행으로만 생성 · Secret Manager 사본 없이 분실 시 재발급"
    - "위생 검사 개수 세기는 set -euo pipefail 아래 { grep -o … || true; } | wc -l — 0건 grep 의 exit 1 이 스크립트를 조용히 끊지 않게"
    - "앱에 Firebase SDK 없음 — google-services.json 은 .gitignore + 추적 정규식 + 존재 FAIL 3중 방어"

key-files:
  created: []
  modified:
    - mobile/scripts/setup-release-secrets.sh
    - mobile/scripts/check-release-hygiene.sh
    - mobile/.gitignore

key-decisions:
  - "22-05 D-17: Firebase 를 기존 GCP 프로젝트 gh-radar 에 추가(사용자 결정 · 새 전용 프로젝트 안은 기각) — 이후 FCM 푸시를 붙일 수 있어 Firebase 프로젝트가 장기 자산이고 백엔드와 같은 곳에 둔다. 사전 상태: 활성 API 36개 중 firebase|identitytoolkit|appdistribution 0건(2026-09-27)"
  - "22-05: Firebase Android 앱 ID = 1:1023658565518:android:3b06f0472060afa97e4edf · 그룹 별칭 ghtrade-testers(본인 1명)"
  - "22-05: 업로드 SA = gh-trade-appdistro · 프로젝트 역할 roles/firebaseappdistro.admin 정확히 하나(IAM 정책 조회로 확인) · 키 600 · Secret Manager 백업 없음"
  - "22-05: OAuth 동의 화면은 「테스트」 모드 — 테스터 Google 계정마다 테스트 사용자로 추가해야 로그인된다(22-08 인계) · Supabase 가입 제한은 추가하지 않음(D-05)"

patterns-established:
  - "one-way 외부 변경(프로젝트에 Firebase 추가)은 사전 상태 실측 + 부수 효과 목록 고지 + blocking 결정 뒤에만"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "setup-release-secrets.sh firebase-sa 단계 — 모르는 stage exit 2 · 비밀 디렉터리 없으면 gcloud 준비 전 ERROR · 부여 역할 하나 · 백업 없음"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "bash -n mobile/scripts/setup-release-secrets.sh && bash -n mobile/scripts/check-release-hygiene.sh"
        status: pass
      - kind: integration
        ref: "bash mobile/scripts/setup-release-secrets.sh nope → rc 2 · 사용법에 firebase-sa"
        status: pass
      - kind: integration
        ref: "GHTRADE_RELEASE_DIR=/nonexistent/… bash mobile/scripts/setup-release-secrets.sh firebase-sa → rc≠0 · 'ERROR firebase-sa' · '^OK gcloud' 없음"
        status: pass
      - kind: other
        ref: "grep -c 'roles/firebaseappdistro.admin' = 1 · grep -c -- '--role=' = 1 · stage_firebase_sa 영역 'gcloud secrets' 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "위생 검사 보강 — ignore 21경로 · google-services.json 존재 시 FAIL · Firebase SA 키 644 FAIL · Fastfile 자격 명시 불변식"
    requirement: MOBILE-02
    verification:
      - kind: integration
        ref: "bash mobile/scripts/check-release-hygiene.sh | grep -q 'RELEASE HYGIENE OK.*ignore 21경로'"
        status: pass
      - kind: integration
        ref: "임시 mobile/android/app/google-services.json 생성 → hygiene rc 1 → 파일 제거 확인"
        status: pass
      - kind: integration
        ref: "GHTRADE_RELEASE_DIR=<tmp> 에 644 firebase-appdistro-service-account.json → hygiene rc 1 · FAIL 에 파일명"
        status: pass
      - kind: other
        ref: "git check-ignore -q mobile/android/app/google-services.json && git check-ignore -q mobile/firebase-appdistro-service-account.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "Firebase 업로드 자격 — 전용 SA 역할 정확히 하나 · App Distribution API 사용 설정 · 키 600(내용 미열람) · 위생 OK"
    requirement: MOBILE-02
    verification:
      - kind: integration
        ref: "bash mobile/scripts/check-release-hygiene.sh | grep -q 'RELEASE HYGIENE OK' && stat -f '%Lp' ~/.config/gh-trade/release/firebase-appdistro-service-account.json = 600"
        status: pass
      - kind: integration
        ref: "gcloud projects get-iam-policy gh-radar --flatten bindings[].members --filter serviceAccount:gh-trade-appdistro@gh-radar… → 'roles/firebaseappdistro.admin' 한 줄"
        status: pass
      - kind: integration
        ref: "gcloud services list --enabled --project gh-radar | grep -qx firebaseappdistribution.googleapis.com"
        status: pass
    human_judgment: false
  - id: D4
    description: "Firebase 콘솔 설정(gh-radar 추가 · Android 앱 SHA-1 없이 등록 · 「시작하기」 · 그룹 ghtrade-testers 본인 1명) · GCP Android OAuth 클라이언트(업로드 SHA-1) · 동의 화면 「테스트」 · 웹 로그인 회귀 ok"
    requirement: MOBILE-02
    verification:
      - kind: manual_procedural
        ref: "재개 신호 done project=gh-radar appId=1:1023658565518:android:3b06f0472060afa97e4edf group=ghtrade-testers androidOAuth=1 consent=테스트 webLogin=ok · appId 정규식 ^1:[0-9]+:android:[0-9a-f]+$ 일치"
        status: pass
    human_judgment: true
    rationale: "콘솔 상태(온보딩 · 그룹 구성 · OAuth 클라이언트 · 웹 로그인)는 이 계정의 CLI 로 전부 조회되지 않는다 — 사용자(Claude Cowork 대행) 보고에 근거하며, 실제 성립은 22-07 업로드 · 22-08 설치/로그인에서 입증된다"

duration: 2h 21m (실행 약 15min · 결정/콘솔 체크포인트 대기 별도)
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 05: Firebase App Distribution 선행 조건 Summary

**gh-radar 에 Firebase 를 붙이고(사용자 결정) Android 앱 `1:1023658565518:android:3b06f0472060afa97e4edf` · 그룹 `ghtrade-testers` · 전용 업로드 SA `gh-trade-appdistro`(역할 `roles/firebaseappdistro.admin` 하나 · 키 600)를 갖췄다. 업로드 키 SHA-1 로 GCP Android OAuth 클라이언트도 만들었고, 위생 검사가 google-services.json 유입과 Firebase 자격 누락을 잡는다.**

## Performance

- **Duration:** 약 2h 21m (계획 커밋 10:43 KST → 마감 13:07 KST · 실행 약 15min, 나머지는 결정·콘솔 체크포인트 대기)
- **Started:** 2026-09-27T01:43:12Z (재범위 플랜 커밋 a2bf1be4 기준)
- **Completed:** 2026-09-27T04:07:26Z
- **Tasks:** 3 (auto 1 · decision 1 · human-action 1)
- **Files modified:** 3

## Accomplishments

- `setup-release-secrets.sh firebase-sa` 단계: `firebaseappdistribution.googleapis.com` 사용 설정 → SA `gh-trade-appdistro` 생성 → 역할 `roles/firebaseappdistro.admin` 하나만 부여(`--condition=None` · 정책 전문은 버림) → 키 600 생성. 출력은 OK/SKIP/ERROR 와 SA 이메일뿐이고, Secret Manager 백업은 없다(분실하면 재발급).
- `check-release-hygiene.sh`:
  - ignore 검사 21경로(Firebase SA 키 · `android/app/google-services.json` · 릴리스 APK 추가)
  - 추적 파일 정규식에 `google-services.json` 추가
  - SA 키 권한 목록에 Firebase 키 추가
  - 새 검사 (8): `mobile/android/app/google-services.json` 이 있으면 FAIL
  - 새 검사 (9): Fastfile 의 Firebase 호출마다 `service_credentials_file:` · `android_artifact_path:` 가 있는지 확인(자격 명시 불변식)
- `mobile/.gitignore` 에 `google-services.json` 을 추가했다(D-17 — 앱에 Firebase SDK 없음).
- Firebase 를 gh-radar 에 추가했다. Android 앱 `com.ghtrade.app`(닉네임 GH Trade)은 SHA-1 없이 등록했고, App Distribution 「시작하기」를 마쳤으며, 그룹 `ghtrade-testers` 는 본인 1명이다.
- GCP Android OAuth 클라이언트 `GH Trade Android (upload key)` 를 업로드 SHA-1 로 1개 추가했다. 기존 debug 클라이언트와 Supabase Client IDs 는 그대로다.
- 읽기 전용 사후 확인을 모두 통과했다: 위생 OK · 키 600(디렉터리 700) · SA 역할 정확히 하나 · API 사용 설정 · 앱 ID 형식.

## Task Commits

1. **Task 1: firebase-sa 단계 · 위생 검사 보강 · .gitignore** - `68b8008e` (feat)
2. **Task 2: D-17 Firebase 프로젝트 결정** - 커밋 없음(결정만 · 아래 「결정」)
3. **Task 3: 콘솔 작업 · firebase-sa 실행 · OAuth 클라이언트 · 동의 화면 · 웹 로그인 회귀** - 커밋 없음(외부 설정 · 저장소 변경 없음)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `mobile/scripts/setup-release-secrets.sh`: stage `firebase-sa`(stage_firebase_sa)를 추가했다. 헤더 stages · usage · 사전 이름 검증 · dispatch 네 곳에 반영했고, 새 GCP 프로젝트용 실행법도 적었다.
- `mobile/scripts/check-release-hygiene.sh`: ignore 21경로 · google-services.json (3)(8) · Firebase 키 권한 (4) · 자격 명시 불변식 (9) · OK 메시지 확장
- `mobile/.gitignore`: 릴리스 절에 `google-services.json` 한 줄과 주석을 추가했다.

## 결정

### Task 2 — Firebase 를 붙일 GCP 프로젝트 (D-17 · one-way)

- **선택:** `gh-radar`. 사용자는 체크포인트 전에 채팅으로 이미 답했다.
- **근거:** 나중에 FCM 푸시를 붙일 수 있어 Firebase 프로젝트는 오래 쓸 자산이다. 그래서 백엔드와 같은 프로젝트에 둔다.
- **사전 상태(2026-09-27 · deployer 키 조회):** gh-radar 활성 API 36개 중 `firebase|identitytoolkit|appdistribution` 은 0건이었다. 사후에는 9건이다.
- **사용자에게 제시한 부수 효과(되돌릴 수 없음):**
  - 켜지는 API 약 15개: App Engine Admin · Cloud Pub/Sub · Cloud Resource Manager · Cloud Runtime Configuration · Cloud Testing · FCM · Firebase Dynamic Links · Firebase Hosting · Firebase Installations · Firebase Management · Remote Config(+Realtime) · Firebase Rules · Identity Toolkit · Token Service
  - 생기는 SA 2개: `service-1023658565518@gcp-sa-firebase` · `firebase-adminsdk-xxxxx@gh-radar`. adminsdk SA 에는 키를 만들지 않는다.
  - 「Browser」 API 키(Firebase API 로 자동 제한)와 라벨 `firebase:enabled`
  - 결제가 켜져 있으면 Blaze 로 표시된다(App Distribution 자체는 무료).
  - 프로젝트에서 떼어 낼 수 없다(API 비활성화·리소스 삭제만 수동으로 가능).
- **기각한 대안:** 새 전용 GCP 프로젝트

### Task 3 — 콘솔 · 자격 결과

| 항목 | 값 |
|---|---|
| Firebase 프로젝트 | `gh-radar` (번호 1023658565518) |
| Android 앱 | `com.ghtrade.app` · 닉네임 GH Trade · 디버그 SHA-1 칸 비움 · google-services.json 미다운로드(저장소에 없음 확인) |
| **Firebase Android 앱 ID** | `1:1023658565518:android:3b06f0472060afa97e4edf` (공개 식별자 · 22-07 이 읽는다) |
| App Distribution 온보딩 | 「시작하기」 완료 |
| 테스터 그룹 별칭 | `ghtrade-testers` — 본인 1명(주소 미기록 · 다른 테스터는 22-08) |
| GCP Android OAuth 클라이언트 | 1개 추가 — `GH Trade Android (upload key)` · `com.ghtrade.app` · 업로드 SHA-1 `2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D` · 기존 debug 클라이언트 유지 · 코드 변경 없음 |
| OAuth 동의 화면 게시 상태 | **테스트** — 테스터의 Google 계정마다 테스트 사용자로 추가해야 로그인된다(**22-08 인계**) · Supabase 가입 제한은 추가하지 않음(D-05) |
| 웹 로그인 회귀 | ok — Firebase 추가 뒤 https://trade.jx1.io Google 로그인 정상(FA-A6) |
| 업로드 SA | `gh-trade-appdistro` — 프로젝트 역할 `roles/firebaseappdistro.admin` **정확히 하나**(IAM 정책 조회) · 키 `~/.config/gh-trade/release/firebase-appdistro-service-account.json` 600(내용 미열람) |
| API | `firebaseappdistribution.googleapis.com` 사용 설정 확인 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 위생 검사 (9) 의 개수 세기가 0건일 때 스크립트를 조용히 끊음**
- **Found during:** Task 1 (위생 검사 보강)
- **Issue:** `set -euo pipefail` 아래에서는 `grep -o … | wc -l` 의 grep 이 0건이면 exit 1 을 낸다. 그러면 파이프라인이 실패로 끝나 스크립트가 FAIL/OK 출력 없이 중단됐다. Fastfile 에 Firebase 호출이 없는 경우가 이에 해당한다.
- **Fix:** 개수 세기를 `{ grep … || true; } | wc -l` 로 감쌌다. 0건은 0 으로 세고 통과한다.
- **Files modified:** mobile/scripts/check-release-hygiene.sh
- **Verification:** 여섯 `<automated>` 와 acceptance 가 모두 통과했다(당시 Fastfile 에 Firebase 호출 0개 → OK).
- **Committed in:** 68b8008e (Task 1 커밋)

### 절차 편차 (코드 변경 아님)

**2. firebase-sa 를 사용자 `!` 대신 오케스트레이터가 실행**
- 플랜 문구(D-06 · Task 3 5번)는 「사용자 `!` 한 줄로만」 이었다.
- 실제로는 사용자가 이 명령 하나에만 해당하는 좁은 Bash 권한 규칙을 직접 추가했다. 그 뒤 오케스트레이터가 `bash mobile/scripts/setup-release-secrets.sh firebase-sa` 를 실행했다.
- 출력은 세 줄뿐이었고 비밀 값은 출력되지 않았다: `OK gcloud — 인증: SA 키 파일 …/gh-radar-deployer.json · 프로젝트 gh-radar` · `OK firebase-sa` · `SA: gh-trade-appdistro@gh-radar.iam.gserviceaccount.com`
- 이 실행기는 키 파일 내용을 읽지 않았다. stat 으로 권한만 확인했다.
- D-06 의 목적(비밀 비출력 · 사용자 명시 허가)은 유지됐다.

**3. 콘솔 단계(1~4 · 6~9)를 Claude Cowork 가 사용자 대신 수행**
- 사용자 대행으로 수행했다. 결과는 재개 신호 한 줄로 보고됐다.
- 결과 중 CLI 로 조회 가능한 항목(SA 역할 · API)은 사후에 읽기 전용으로 확인했다.

**4. 기본 브랜치(master) 커밋**
- 오케스트레이터 지시와 `branching_strategy: none` 에 따라 master 에 커밋했다(push 없음).
- `git.base-branch --is-protected master` 는 true 로 나오지만, 이 저장소의 phase 22 플랜들은 모두 master 에 커밋해 왔다.

---

**Total deviations:** 1 auto-fixed (Rule 1 bug) + 3 절차 편차(실행 주체 · 대행 · 브랜치)
**Impact on plan:** auto-fix 는 위생 검사의 정확성에 필요했다. 절차 편차는 비밀 비출력과 사용자 허가 원칙 안에서 일어났다. 범위 확장은 없다.

## Issues Encountered

- 위생 검사가 「안내: play-service-account.json 아직 주입 전」 을 낸다. Play SA 는 Phase 23 범위라 예상된 안내이고, 실패가 아니다.

## User Setup Required

- 콘솔 설정은 Task 3 에서 모두 끝났다. 별도 USER-SETUP.md 는 만들지 않았다.
- 남은 사람 작업은 22-08 의 테스터 초대다. 동의 화면이 「테스트」 라 **테스터마다 OAuth 테스트 사용자 추가**도 필요하다.

## Next Phase Readiness

- **22-07:** 앱 ID · 온보딩 · 전용 SA 키가 모두 준비됐다. 22-07 은 업로드 게이트에서 멈춰 있고, 이 SUMMARY 의 앱 ID 를 `GHTRADE_FIREBASE_ANDROID_APP_ID` 로 쓴다.
- **22-08:** 테스터 초대가 남았다. 두 곳에 모두 추가해야 한다:
  - Firebase 그룹 `ghtrade-testers`
  - GCP OAuth 동의 화면의 **테스트 사용자**(게시 상태가 「테스트」라 필수)
- **Phase 23:** Play SA(`play-sa`)는 아직 만들지 않았다. gh-radar 에 둘 예정이다.

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*

## Self-Check: PASSED

- 파일 4개 존재(스크립트 2 · .gitignore · SUMMARY) · 커밋 68b8008e · b9263f4a 존재
- Task 3 읽기 전용 확인 3건 + 앱 ID 정규식 통과
