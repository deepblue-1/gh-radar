---
phase: 22-gh-trade-ios-testflight-android-play
plan: 04
subsystem: mobile-release
tags: [fastlane, android, google-play, aab, gradle, signing, keystore, secret-manager, minitest, capacitor, release-pipeline]

requires:
  - phase: 22-01
    provides: "mobile/Gemfile(.lock) fastlane 2.240.1 · GhTradeBuildNumbers.ios_build_number · setup-release-secrets.sh stages dir·asc · release-ios.sh exit 3 규약 · check-ipa.sh 출력 규약"
provides:
  - "native:release:android:aab 한 명령 — cap sync(양쪽) → PROD CONFIG OK → 래퍼(env 이름 검증 · exit 3) → fastlane build → 업로드 키 서명 AAB → AAB CHECK OK"
  - "업로드 키 서명 첫 AAB (versionCode 609270905) — 22-05 가 Play 콘솔에 처음 수동 업로드할 대상"
  - "native:release:android — fastlane beta(AAB → Play internal) · lanes validate · track (22-06 이 사용 · play-sa 주입 필요)"
  - "GhTradeBuildNumbers.android_version_code(t) = (연도−2020)·10^8 + MMDDHHmm · ANDROID_VERSION_CODE_MAX 2,100,000,000 · minitest 7건"
  - "build.gradle env 서명(기본값·리터럴 0) · -PghtradeVersionCode 주입 · env 없는 bundleRelease/assembleRelease 즉시 실패 가드"
  - "setup-release-secrets.sh stages keystore · backup · play-sa"
  - "check-aab.sh (서명 SHA-1 = 업로드 SHA-1 · jarsigner · 운영 URL · cleartext · WebView 디버깅)"
  - "check-release-hygiene.sh → RELEASE HYGIENE OK (7개 정적 검사)"
  - "업로드 키스토어(PKCS12 · RSA 4096 · alias ghtrade-upload) 저장소 밖 + Secret Manager 백업 3개"
affects: [22-05, 22-06, 22-07]

actuals:
  tokens: 8800     # chars/4 — aa107c25..38012fec 추가 줄 35,198자(10개 파일)
  tasks: 3
  commits: 4       # MEASURED: git rev-list --count aa107c25..HEAD (SUMMARY 커밋 전)
plan_head_before: aa107c259e29ae0064403991693ab4e497cb609c

tech-stack:
  added: ["Android fastlane lanes (supply · gradle 액션) — 22-01 의 fastlane 2.240.1 Gemfile 공유", "Ruby minitest(Homebrew Ruby 4 번들 — Gemfile 무변경)"]
  patterns:
    - "Android 서명은 build.gradle 이 env GHTRADE_UPLOAD_* 를 직접 읽는다 — fastlane 은 서명 속성을 넘기지 않는다(gradle 액션이 명령줄을 로그에 찍음)"
    - "versionCode 는 Gradle property ghtradeVersionCode 로만 주입 — 로그의 gradle 명령줄은 `bundleRelease -p . -PghtradeVersionCode=…` 뿐"
    - "릴리스 래퍼 계약(Android 확장): 모르는 모드 exit 2(env 로드 전) · env/키/키스토어/SA JSON 누락 exit 3 + 이름·주입 명령만"
    - "JDK 도구(keytool · jarsigner)는 JAVA_HOME → Android Studio JBR → PATH 순서로 찾는다 — /usr/bin 스텁 회피"

key-files:
  created:
    - mobile/fastlane/test/build_numbers_test.rb
    - mobile/scripts/check-release-hygiene.sh
    - mobile/android/fastlane/Fastfile
    - mobile/android/fastlane/Appfile
    - mobile/scripts/release-android.sh
    - mobile/scripts/check-aab.sh
  modified:
    - mobile/fastlane/build_numbers.rb
    - mobile/android/app/build.gradle
    - mobile/scripts/setup-release-secrets.sh
    - mobile/package.json

key-decisions:
  - "22-04: 업로드 인증서 SHA-1 = 2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D (공개 지문 — 22-06 GCP Android OAuth 클라이언트 등록에 쓴다)"
  - "22-04: 첫 AAB versionCode 609270905 (2026-09-27 09:05 KST) · mobile/android/app/build/outputs/bundle/release/app-release.aab · AAB CHECK OK — 22-05 콘솔 첫 업로드 대상"
  - "22-04: Secret Manager 백업 gh-radar-ghtrade-upload-keystore · gh-radar-ghtrade-upload-keystore-password · gh-radar-ghtrade-asc-api-key (2026-09-27 09:02 KST 생성 · gcloud 인증 = deployer SA 키 파일)"
  - "22-04: 첫 bundleRelease 의 lintVitalRelease 통과 — lint 수정 없음(Pitfall 14 미발생)"

patterns-established:
  - "Android 릴리스 래퍼: release-android.sh [beta|build|validate|track|check] — build/beta 뒤 check-aab 자동 실행"
  - "업로드 키스토어는 재생성하지 않는다: keystore 단계 SKIP · 래퍼는 키스토어 부재 시 Secret Manager 복구 안내만"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "native:release:android:aab 한 명령이 운영 sync → PROD CONFIG OK → fastlane build(lintVital 포함 bundleRelease) → 업로드 키 서명 AAB → AAB CHECK OK 까지 끝남"
    requirement: MOBILE-02
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/mobile run native:release:android:aab (exit 0 · PROD CONFIG OK · BUILD SUCCESSFUL in 43s · AAB CHECK OK sha1=2F:E3:…:7B:7D · versionCode 609270905)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Android versionCode 공식 D-09a — 6억대 9자리 · 2040년까지 상한 이하 · 연 경계 단조 · 2041년 ArgumentError(「상한」) · 같은 분 같은 값"
    requirement: MOBILE-02
    verification:
      - kind: unit
        ref: "mobile/fastlane/test/build_numbers_test.rb (7 runs · 17 assertions · 0 failures · RED 증거 c65146f4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "build.gradle env 서명(비밀번호 기본값·리터럴 0) · 디버그 빌드 무영향 · env 없는 bundleRelease 가드 실패 · 릴리스 뒤 build.gradle 무변경"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "native:build:android BUILD SUCCESSFUL · env -u GHTRADE_UPLOAD_STORE_FILE ./gradlew bundleRelease → 실패 + 가드 메시지 · git diff --quiet build.gradle/Info.plist/pbxproj · acceptance 음성 grep 2개"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty 엣지 — env 파일 없음/키 비어 있음이면 래퍼가 fastlane 전에 exit 3 · 키 이름·주입 명령만 · 모르는 모드 exit 2"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-missing-vars bash mobile/scripts/release-android.sh build → exit 3 · 「setup-release-secrets.sh keystore」 포함 · 「Driving the lane」 없음 · 빈 키 env → exit 3 · 모드 nope → exit 2"
        status: pass
    human_judgment: false
  - id: D5
    description: "업로드 키스토어 저장소 밖(700/600) + Secret Manager 백업 3개 존재 · keystore 재실행 SKIP · RELEASE HYGIENE OK"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "check-release-hygiene.sh → RELEASE HYGIENE OK · gcloud secrets describe 3개(메타데이터만) · stat 700/600 · 더미 키스토어 SKIP 테스트(shasum 불변) · 모르는 stage exit 2"
        status: pass
    human_judgment: false
  - id: D6
    description: "check-aab 가 잘못된 서명·미서명·dev URL AAB 를 거부"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "GHTRADE_UPLOAD_SHA1=AA:BB → AAB CHECK FAIL exit 1 · 없는 AAB → FAIL exit 1 · 미서명 localhost/cleartext/디버깅 가짜 AAB → FAIL 3줄 exit 1 · 소문자 SHA-1 → OK"
        status: pass
    human_judgment: false
  - id: D7
    description: "이 AAB 가 Play 콘솔에서 업로드 키로 받아들여지고 내부 테스트 트랙에 출시됨"
    requirement: MOBILE-02
    verification: []
    human_judgment: true
    rationale: "Play 첫 업로드는 정책상 콘솔 수동(D-10 · Pitfall 9) — 22-05 가 수행·확인한다"

duration: "약 6h (첫 계획 커밋 03:09 KST ~ 09:08 KST · 사용자 `!` 키스토어 게이트 대기 포함 · 실제 실행 Task 1 약 8분 + Task 3 약 4분 · AAB 빌드 44초)"
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 04: Android 업로드 키 서명 · versionCode · 첫 AAB Summary

**`native:release:android:aab` 한 명령이 운영 sync → PROD CONFIG OK → fastlane `build`(`bundleRelease -PghtradeVersionCode=609270905` · lintVital 통과) → 업로드 키(PKCS12 RSA 4096 · SHA-1 2F:E3:…:7B:7D)로 서명된 AAB → AAB CHECK OK 까지 끝났다 — 서명은 build.gradle 이 env 로만 읽고(기본값 0), versionCode 공식은 minitest 로 잠겼고, 키스토어는 저장소 밖과 Secret Manager 에만 있다.**

## Performance

- **Duration:** 약 6h (사람 게이트 대기 포함 — 실제 실행은 Task 1 약 8분 · Task 3 약 4분)
- **Started:** 2026-09-26T18:09:18Z (근사 — 22-03 마감 커밋 aa107c25 직후)
- **Completed:** 2026-09-27T00:08:00Z
- **Tasks:** 3 / 3 (Task 1 TDD · Task 2 사용자 `!` 게이트 · Task 3 AAB)
- **Files modified:** 10

## Accomplishments

- **첫 서명 AAB:** `mobile/android/app/build/outputs/bundle/release/app-release.aab` (4.9 MB · ignore 대상) · versionCode **609270905** · `AAB CHECK OK sha1=2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D` — 22-05 가 Play 콘솔에 올린다.
- **versionCode 공식 D-09a 잠금:** `(연도−2020)·10^8 + MMDDHHmm` — minitest 7건(연 경계 단조 · 2040-12-31 23:59 = 2012312359 ≤ 상한 · 2041년 거부 · 같은 분 같은 값).
- **gradle env 서명 + 가드:** 비밀번호 기본값·리터럴 0 · 디버그 빌드 그대로 · env 없는 `bundleRelease` 는 「GHTRADE_UPLOAD_STORE_FILE 없음 …」 으로 즉시 실패 · 릴리스 뒤 `build.gradle` 무변경.
- **비밀 경계:** 로그의 gradle 명령줄은 `bundleRelease -p . -PghtradeVersionCode=609270905` 뿐 — 실행 로그에서 `password|storePass|keyPass|android.injected` 0건. 실행기는 `android.env`·키스토어를 열지 않았다.
- **키스토어 백업:** Secret Manager 3개 존재 확인(메타데이터만) · 비밀 디렉터리 700 · 파일 600.
- **Android lane 4개 + 래퍼 + 검사:** `build` · `beta` · `validate` · `track` / `release-android.sh` 5모드 / `check-aab.sh` 음성 테스트 3종 통과.

## Task Commits

1. **Task 1 (TDD): 빌드 번호 공식 · gradle env 서명 · 비밀 주입 3단계 · 위생 검사**
   - RED `c65146f4` (test) — 실패 테스트
   - GREEN `0b191413` (feat) — `android_version_code` · 상한
   - `5600a3a3` (feat) — build.gradle · setup-release-secrets.sh keystore/backup/play-sa · check-release-hygiene.sh
2. **Task 2: 업로드 키스토어 생성 + Secret Manager 백업 (checkpoint:human-action)** — 커밋 없음 (사용자 `! bash mobile/scripts/setup-release-secrets.sh keystore backup` · 재개 신호 `done sha1=2F:E3:…:7B:7D`)
3. **Task 3: Android lane · 래퍼 · AAB 검사 · npm 스크립트 → 서명 AAB** — `38012fec` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `mobile/fastlane/build_numbers.rb` — `ANDROID_VERSION_CODE_MAX` · `android_version_code(t)` (상한 초과 ArgumentError)
- `mobile/fastlane/test/build_numbers_test.rb` — iOS·Android 빌드 번호 minitest 7건
- `mobile/android/app/build.gradle` — env 서명(`signingConfigs.release` · 파일 있을 때만) · `ghtradeVersionCode` property · `taskGraph.whenReady` 릴리스 가드
- `mobile/scripts/setup-release-secrets.sh` — stages `keystore` · `backup` · `play-sa` (대화형 없음 · 값 비출력 · 기존 파일 SKIP)
- `mobile/scripts/check-release-hygiene.sh` — 7개 정적 검사 → `RELEASE HYGIENE OK`
- `mobile/android/fastlane/Fastfile` — 헬퍼 `ghtrade_build_release_aab` + lanes `build` · `beta` · `validate` · `track`
- `mobile/android/fastlane/Appfile` — `json_key_file(ENV["GOOGLE_PLAY_JSON_KEY"])` · `com.ghtrade.app` (저장소 안 기본 경로 없음)
- `mobile/scripts/release-android.sh` — 모드 검증 → env 로드 → 키 이름 검증(exit 3) → fastlane → check-aab
- `mobile/scripts/check-aab.sh` — 서명 SHA-1 · jarsigner · 운영 URL · cleartext · WebView 디버깅
- `mobile/package.json` — `native:release:android` · `native:release:android:aab`

## Decisions Made

- **업로드 인증서 SHA-1 (공개 지문):** `2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D` — 22-06 이 GCP Android OAuth 클라이언트(업로드 키용)에 등록한다. Play 앱 서명 인증서 SHA-1 은 22-05 첫 업로드 뒤 콘솔에서 따로 받는다.
- **첫 AAB:** versionCode `609270905` (2026-09-27 09:05 KST) · 경로 `mobile/android/app/build/outputs/bundle/release/app-release.aab` · versionName `1.0`.
- **Secret Manager 백업 이름:** `gh-radar-ghtrade-upload-keystore` · `gh-radar-ghtrade-upload-keystore-password` · `gh-radar-ghtrade-asc-api-key` (프로젝트 gh-radar · 자동 복제 · 2026-09-27 00:02:45~53Z 생성).
- **gcloud 인증 경로:** deployer SA 키 파일(`~/.config/gcloud/gh-radar-deployer.json`) — 스크립트가 「OK gcloud — 인증: SA 키 파일 … · 프로젝트 gh-radar」 로 표시. 사용자 계정 `gcloud auth login` 분기는 필요 없었다.
- **lint:** 첫 `bundleRelease` 의 `lintVitalRelease` 통과 — 수정 없음.
- **Play SA JSON:** 아직 주입 전(`play-sa` 단계 미실행) — `beta` · `validate` · `track` 모드는 그 전까지 exit 3 + 「! bash mobile/scripts/setup-release-secrets.sh play-sa」 안내. 22-05/22-06 에서 주입한다.

## Authentication Gates

- **Task 2 (계획된 사용자 게이트):** 사용자가 `! bash mobile/scripts/setup-release-secrets.sh keystore backup` 실행 → 「OK keystore」 · 「업로드 인증서 SHA-1: …」 · 「OK gcloud — 인증: SA 키 파일 …」 · 「OK backup」 3줄. 재개 뒤 hygiene · 권한 · `gcloud secrets describe` 3개로 확인.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] setup-release-secrets.sh 가 stage 이름을 실행 전에 모두 검증**
- **Found during:** Task 1 (이전 실행기)
- **Issue:** `keystore nope` 처럼 뒤 인자에 오타가 있으면 앞 stage(키 생성·백업)가 이미 실행된 뒤에야 exit 2 가 난다 — 비밀 쓰기가 반쯤 진행된 상태가 남는다.
- **Fix:** 인자를 먼저 전부 검사해 모르는 stage 가 하나라도 있으면 아무것도 실행하지 않고 exit 2.
- **Files modified:** mobile/scripts/setup-release-secrets.sh
- **Verification:** Task 1 verify 4 (모르는 stage exit 2)
- **Committed in:** 5600a3a3

**2. [Rule 2 - Missing Critical] keytool · jarsigner 를 JAVA_HOME → Android Studio JBR 순서로 해석**
- **Found during:** Task 1 (이전 실행기) · Task 3 에서 check-aab.sh 에도 같은 헬퍼 적용
- **Issue:** 사용자 `!` 셸의 PATH 에는 JDK 가 없을 때 동작하지 않는 macOS 스텁(`/usr/bin/keytool` · `/usr/bin/jarsigner`)만 있을 수 있다.
- **Fix:** `jdk_tool` 헬퍼 — `$JAVA_HOME/bin` → `/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin` → PATH. 못 찾으면 이름만 담은 ERROR/FAIL.
- **Files modified:** mobile/scripts/setup-release-secrets.sh, mobile/scripts/check-aab.sh
- **Verification:** 사용자 실행 「OK keystore」 · `AAB CHECK OK`
- **Committed in:** 5600a3a3 · 38012fec

**3. [Rule 2 - Missing Critical] gcloud 인증 선택 규칙 + 인증 표시 줄**
- **Found during:** Task 1 (이전 실행기)
- **Issue:** 플랜 문구(「비어 있고 deployer 키가 있으면」)는 「사용자 계정으로 다시 실행」 안내(빈 값 지정)와 충돌한다 — 빈 값을 줘도 deployer 키로 덮인다.
- **Fix:** `CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE` 가 **미설정**이면 deployer 키, **빈 값으로 명시**하면 gcloud 사용자 계정. 어느 쪽인지 `OK gcloud — 인증: …` 한 줄로 표시(값 없음).
- **Files modified:** mobile/scripts/setup-release-secrets.sh
- **Verification:** 사용자 실행 출력 「OK gcloud — 인증: SA 키 파일 … · 프로젝트 gh-radar」
- **Committed in:** 5600a3a3

**4. [Rule 2 - Missing Critical] 위생 검사 ignore 샘플 18경로**
- **Found during:** Task 1 (이전 실행기)
- **Issue:** 플랜은 「22-01 acceptance 의 16개와 같은 목록」 을 지정했지만, 그 목록에는 이 플랜이 새로 만드는 업로드 키스토어(`ghtrade-upload.jks`)와 릴리스 AAB 경로(`android/app/build/outputs/bundle/release/app-release.aab`) 표본이 없다.
- **Fix:** 16개 + 2개 = 샘플 18경로 — `RELEASE HYGIENE OK … ignore 18경로`.
- **Files modified:** mobile/scripts/check-release-hygiene.sh
- **Verification:** RELEASE HYGIENE OK + 음성 테스트 2건
- **Committed in:** 5600a3a3

**5. [Rule 2 - Missing Critical] 래퍼가 키스토어 파일·SA JSON 파일 부재도 fastlane 전에 exit 3**
- **Found during:** Task 3
- **Issue:** 플랜은 env 키가 비어 있는지만 본다 — 키가 있어도 가리키는 파일이 없으면 gradle 깊숙이서 불명확하게 실패하고, 사용자가 키스토어를 「새로 만들어」 풀려 할 위험이 있다(업로드 키가 바뀌면 Play 거절).
- **Fix:** `build`·`beta` 는 `GHTRADE_UPLOAD_STORE_FILE` 파일 존재, `beta`·`validate`·`track` 은 `GOOGLE_PLAY_JSON_KEY` 파일 존재를 확인 — 없으면 exit 3. 키스토어 부재 시 「Secret Manager 백업에서 되살린다 — 새로 만들면 Play 가 업로드를 거부한다」 안내.
- **Files modified:** mobile/scripts/release-android.sh
- **Verification:** 빈 키 env → exit 3 · 실제 실행 통과
- **Committed in:** 38012fec

---

**Total deviations:** 5 auto-fixed (모두 Rule 2)
**Impact on plan:** 비밀 주입·릴리스 경로의 안전성·명확성 보강. 인터페이스(stages · 모드 · 출력 문구 · exit 코드 규약) 무변경, 스코프 확장 없음.

## Issues Encountered

- 없음 — 실패 분기(lintVital 실패 · 서명 불일치 · 운영 설정 불일치) 어느 것도 발생하지 않았다.
- 참고: GSD 기본 커밋 가드(`git.base-branch --is-protected master`)는 `true` 를 돌려주지만, 오케스트레이터 지시(순차 실행 · 메인 워킹트리 · master 커밋)와 22-01~22-03 관례에 따라 master 에 커밋했다.

## User Setup Required

- 이 플랜의 비밀 주입(키스토어·백업)은 완료됐다. 별도 USER-SETUP.md 는 만들지 않았다(22-01 과 같은 관례 — 설정은 사용자 `!` 스크립트로 끝남).
- 남은 것: `! bash mobile/scripts/setup-release-secrets.sh play-sa` (Play 게시용 SA) — 22-05/22-06 흐름에서.

## Next Phase Readiness

- **22-05:** 위 AAB(versionCode 609270905)를 Play 콘솔 내부 테스트에 수동 업로드 · 출시. 업로드 뒤 Play 앱 서명 인증서 SHA-1 을 받는다.
- **22-06:** 업로드 키 SHA-1 `2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D` + Play 앱 서명 SHA-1 로 GCP Android OAuth 클라이언트 등록 · `play-sa` 주입 뒤 `native:release:android`(beta) 사용.
- 주의: 같은 분 재실행은 같은 versionCode(FA-1) — 다음 업로드는 1분 이상 간격. iOS·Android 릴리스 명령 동시 실행 금지(FA-5).

## Self-Check: PASSED

- FOUND: mobile/fastlane/test/build_numbers_test.rb · mobile/scripts/check-release-hygiene.sh · mobile/android/fastlane/Fastfile · mobile/android/fastlane/Appfile · mobile/scripts/release-android.sh · mobile/scripts/check-aab.sh
- FOUND: 커밋 c65146f4 · 0b191413 · 5600a3a3 · 38012fec
- FOUND: mobile/android/app/build/outputs/bundle/release/app-release.aab (git check-ignore 통과)
- Task 3 `<automated>` 3개 통과 · acceptance 5항 통과(음성 grep 0 · `"ghtradeVersionCode" => vc` 1 · lane 4 · internal 2 · Appfile 1/0 · npm 스크립트 exit 0 · AAB 존재+ignore) · minitest 재실행 0 failures · RELEASE HYGIENE OK
