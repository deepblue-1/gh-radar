---
phase: quick-260927-s4j
plan: 01
subsystem: mobile-release
status: complete
tags: [fastlane, release, security, testflight, play, firebase-app-distribution]
requires: [Phase 22 릴리스 lane · 래퍼 · 위생 검사]
provides:
  - iOS beta lane 업로드 전 check-ipa 게이트 + 검사한 IPA 명시 업로드
  - Android build · beta lane 업로드 전 check-aab 게이트
  - 위생 검사 (10) lane 단위 업로드 전 검사 순서
  - release-apps.sh 화면 표식 요약 · URL 가림 · 로그 700/600
  - 오프라인 스텁 회귀 테스트 test-release-apps-output.sh
affects: [Phase 23 Play 경로, native:release 운영 절차]
tech-stack:
  added: []
  patterns:
    - "fastlane sh(\"bash\", 검사 스크립트, 절대 경로) 로 lane 안 업로드 전 게이트 — 실패 시 예외로 lane 중단"
    - "화면 필터 = 끝까지 읽는 read 루프 + fd 3 로그 + 허용 표식 정규식 + URL 가림(항상 0 · pipefail 로 원 종료 코드 보존)"
key-files:
  created:
    - mobile/scripts/test-release-apps-output.sh
  modified:
    - mobile/ios/App/fastlane/Fastfile
    - mobile/scripts/release-ios.sh
    - mobile/android/fastlane/Fastfile
    - mobile/scripts/release-android.sh
    - mobile/scripts/check-release-hygiene.sh
    - mobile/scripts/release-apps.sh
    - mobile/README.md
    - .planning/phases/22-gh-trade-ios-testflight-android-play/22-SECURITY.md
decisions:
  - "Android check-aab 게이트는 helper 로 묶지 않고 build · beta lane 에 각각 인라인으로 둔다 — 위생 (10) 의 lane 단위 판정과 플랜 검증(awk)이 lane 본문 안의 check-aab.sh 를 본다"
  - "release-apps.sh 는 전역 umask 를 바꾸지 않는다 — 로그 파일만 서브셸 umask 077 + chmod 600, 로그 폴더 chmod 700"
  - "화면 필터 매칭은 bash [[ =~ ]] (포크 없음), 표식 줄에만 LC_ALL=C sed 로 ANSI 제거 · URL 가림 — 대용량 빌드 로그에서도 줄마다 프로세스를 띄우지 않는다"
metrics:
  duration: "약 25분"
  completed: 2026-09-27
actuals:
  tokens: 9400
  tasks: 3
  commits: 3
plan_head_before: 34fda0ef319c0d4c273a6e0b70a6f4f9252e6582
---

# Quick 260927-s4j: Phase 22 보안 W-1 · W-2 해소 Summary

iOS check-ipa · Play check-aab 를 fastlane lane 안의 업로드 전 게이트(sh 예외로 중단, 검사한 산출물을 `ipa:`/`aab:` 로 명시 업로드)로 옮기고 위생 검사 (10) 로 lane 단위 순서를 잠갔으며, release-apps.sh 는 화면에 표식 줄만(URL 가림) 내고 전체 출력을 700/600 로그에만 쓰게 바꿨다.

## 태스크별 커밋

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 (tracer) | iOS check-ipa → beta lane 업로드 전 게이트 | d71e841c | ios/App/fastlane/Fastfile · scripts/release-ios.sh |
| 2 | Play check-aab → build · beta lane 게이트 + 위생 (10) | 49c9c380 | android/fastlane/Fastfile · scripts/release-android.sh · scripts/check-release-hygiene.sh |
| 3 | release-apps.sh 화면 요약 · 700/600 로그 + 스텁 테스트 + 문서 | 473bfb7e | scripts/release-apps.sh · scripts/test-release-apps-output.sh(신규, 100755) · README.md · 22-SECURITY.md |

세 커밋 모두 `git commit -m … -- <자기 경로>` 로 자기 파일만 담았다(git log --stat 확인). Co-Authored-By 없음 · push 없음. 다른 세션 파일(.planning/research/.cache/ 등)은 건드리지 않았다.

## 무엇이 바뀌었나

- **iOS beta lane:** `ipa = build_app(...)` → `File.expand_path` + 없으면 `UI.user_error!("릴리스 IPA 없음: …")` → `sh("bash", check-ipa.sh 절대 경로, ipa, build_number.to_s)` → `upload_to_testflight(api_key:, ipa: ipa, skip_waiting_for_build_processing: true)`. 머리 주석 흐름 3곳 + desc 갱신. release-ios.sh 는 lane 뒤 `bash scripts/check-ipa.sh` 를 지웠고, 마지막 실행 줄이 `(cd ios/App && bundle exec fastlane beta)` 다.
- **Android build · beta lane:** AAB 절대 경로 고정 → `sh("bash", check-aab.sh 절대 경로, aab)` → (beta) `upload_to_play_store(aab: aab, …)`. release_status · skip_* · Pitfall 9 주석은 그대로. release-android.sh 의 lane 뒤 check-aab case 를 지웠다. 주석이 아닌 check-aab 호출은 단독 `check` 모드 1개뿐이다. firebase · firebase_latest · validate · track lane 은 바뀌지 않았다.
- **위생 (10):** awk 로 `lane :` 마다 「검사 봤음」 표시를 초기화하고, `upload_to_testflight(` ↔ `check-ipa.sh`, `upload_to_play_store(` ↔ `check-aab.sh`, `firebase_app_distribution(` ↔ `check-apk.sh` 짝을 본다. iOS 는 `ipa:` 개수 < `upload_to_testflight(` 개수이면 FAIL 이다. OK 줄 끝에 「· 업로드 전 검사 순서」가 붙는다.
- **release-apps.sh:** 로그 폴더 `chmod 700`, `new_log`(서브셸 umask 077 + chmod 600), `screen_filter`(IFS= read -r · 마지막 줄 개행 없음 처리 · `done 3>>"$log"` · 표식만 화면 · 항상 0), `mask_lines`(ESC 바이트 printf 생성 · ANSI 제거 · `스킴://…` → 「(URL 생략 — 로그)」 · 4칸 들여쓰기), `fail_summary`(오류 줄 마지막 20줄 + 「전체 로그: … (600 · 저장소 밖)」). tee 파이프를 `pnpm … 2>&1 | screen_filter "$log"` 로 바꿨다. say · wait_new_minute · VALID 폴링 · firebase-latest 대조 · 결과 표 · STATUS 규칙은 그대로다. 헤더 규약 로그 줄을 고쳤고(「표식」 포함) `-h` 범위를 `4,27p` 로 다시 맞췄다.

## 검증 (전부 오프라인)

- `ruby -c` 두 Fastfile → Syntax OK. `bash -n` · `/bin/bash -n` 을 release-apps · release-ios · release-android · check-release-hygiene · test-release-apps-output 에 돌려 모두 통과했다.
- 래퍼 프로브: release-apps/ios/android `nope` → 2 · `GHTRADE_RELEASE_ENV=/nonexistent/x.env` 로 release-ios beta → 3 · release-android beta → 3 · build → 3.
- check-ipa(lane 과 같은 인자 형태, 로컬 산출물): `…/gh-trade-release/ios/App.ipa` + `202609271538` → 「IPA CHECK OK build=202609271538」 exit 0. 기대 번호 `000000000000` → exit 1.
- check-aab `/nonexistent/x.aab` → 1 · check-apk `/nonexistent/x.apk` → 1(음성만).
- 위생 검사 (bash 5 · /bin/bash 3.2) → 「RELEASE HYGIENE OK — … · Firebase 자격 명시 · 업로드 전 검사 순서」.
- 태스크별 `<verify>` 자동 명령: TASK1-OK · TASK2-OK · TASK3-OK.
- **스텁 테스트 RED → GREEN:** 구현 전(tee) 「RELEASE APPS OUTPUT TEST FAIL — 경우 A 화면에 「://」 가 있다」 exit 1 → 구현 뒤 bash 5.3 과 /bin/bash 3.2 모두 「RELEASE APPS OUTPUT TEST OK — 화면 URL 0 · 표식 줄 · 로그 700/600 · 성공/실패 전달 · iOS 실패 → Android 건너뜀 · 인자 오류 2 · 트립와이어 0」 exit 0.
- 실제 `$HOME/Library/Developer/gh-trade-release/logs` 는 여전히 없다. 실제 release-apps.sh 는 인자 오류(exit 2) 경로로만 돌렸다.

### 위생 (10) 스크래치 미러 증명

미러 = 스크래치패드에 check-release-hygiene.sh + 두 Fastfile 복사 + `git init -q`, `GHTRADE_RELEASE_DIR=/nonexistent/rel`.

```
== 원본                → 「업로드 전 검사 없음」 0건
== (a) iOS check-ipa 주석
RELEASE HYGIENE FAIL — ios/App/fastlane/Fastfile lane beta: 72줄 upload_to_testflight 앞에 check-ipa.sh 가 없다 — 업로드 전 검사 없음(CR-01)
== (b) android beta lane check-aab 만 주석 (build lane 82줄 check-aab 는 그대로)
RELEASE HYGIENE FAIL — android/fastlane/Fastfile lane beta: 93줄 upload_to_play_store 앞에 check-aab.sh 가 없다 — 업로드 전 검사 없음(CR-01)
== (c) ipa: 인자 제거
RELEASE HYGIENE FAIL — ios/App/fastlane/Fastfile upload_to_testflight 1개에 ipa: 가 0개뿐 — 검사한 IPA 와 올리는 IPA 가 다를 수 있다(CR-01)
== (추가) firebase lane check-apk 주석
RELEASE HYGIENE FAIL — android/fastlane/Fastfile lane firebase: 122줄 firebase_app_distribution 앞에 check-apk.sh 가 없다 — 업로드 전 검사 없음(CR-01)
```

(b) 가 lane 단위 초기화를 증명한다(같은 파일 build lane 의 check-aab 로는 통과하지 않는다). firebase_latest 의 `firebase_app_distribution_get_latest_release(` 는 업로드로 세지 않았다.

## 돌리지 않은 것과 사유

- 실제 업로드 · 릴리스(native:release*, fastlane beta/build/firebase, pilot, supply): 제약상 금지다. lane 안 `sh` 게이트의 실제 동작(예외로 lane 중단)은 기존 firebase lane 의 check-apk 와 같은 성질에 기대며, 실행으로 확인하지 않았다. 다음 실제 `native:release` 때 화면에 `IPA CHECK OK` 가 `Successfully uploaded …` 보다 먼저 나오는지 본다.
- iOS 성공 경로 스텁: VALID 폴링(최대 15분 · 30초 간격) 때문에 다루지 않았다.
- check-apk · check-aab 양성: SHA-1 이 비밀 파일(android.env)에 있고 로컬 AAB 도 없다. 음성(없는 경로)만 돌렸다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 위생 (10) 결과 루프의 `[[ … ]] && fail` 을 if 문으로**
- **Found during:** Task 2
- **Issue:** `set -e` 아래 while 본문 마지막이 `&&` 목록이면, 빈 줄에서 루프 종료 코드가 1 이 되어 해석이 모호해진다.
- **Fix:** `if [[ -n "$line" ]]; then fail "$line"; fi`
- **Files modified:** mobile/scripts/check-release-hygiene.sh
- **Commit:** 49c9c380

**2. [계획 보완] README 비밀 파일 절의 위생 검사 설명에 「업로드 전 검사 순서」 추가, 스텁 테스트에 ANSI · 개행 없는 마지막 줄 단언 추가**
- plan behavior 에는 없었지만 action 요구(ANSI 제거 · 마지막 줄 개행 없음 처리)를 테스트로 잠그려고 넣었다.

그 밖에는 계획대로 실행했다. Android 게이트를 한때 helper 함수로 묶었다가, lane 단위 판정(위생 10 · 플랜 awk)과 맞추려고 커밋 전에 lane 인라인으로 되돌렸다.

## 남은 참고 사항

- Play AAB 는 APK 처럼 빌드 전 삭제하지 않고 versionCode 도 대조하지 않는다(check-aab 는 서명 SHA-1 · 디버그 · 운영 설정만 본다). Phase 23 에서 check-aab 보강(빌드 전 이전 AAB 삭제 · 기대 versionCode 인자)을 검토한다.
- 화면 필터는 허용 목록 방식이다. 앞으로 새 성공/실패 표식이 생기면 release-apps.sh 의 `SCREEN_MARKS` 에 출처 주석과 함께 더해야 화면에 보인다. 전체 원문은 항상 로그에 있다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 엔드포인트 · 인증 경로가 없다. 로그 파일 접근은 계획의 T-S4J-04 범위 안이다.

## Self-Check: PASSED

- FOUND: mobile/scripts/test-release-apps-output.sh (100755)
- FOUND: d71e841c · 49c9c380 · 473bfb7e (git rev-list 34fda0ef..HEAD = 3)
