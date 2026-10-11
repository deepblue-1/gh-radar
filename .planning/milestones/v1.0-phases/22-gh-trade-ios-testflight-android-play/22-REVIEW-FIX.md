---
phase: 22-gh-trade-ios-testflight-android-play
fixed_at: 2026-09-27T08:25:00Z
review_path: .planning/phases/22-gh-trade-ios-testflight-android-play/22-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 22: 코드 리뷰 수정 보고서

**수정 시각:** 2026-09-27T08:25:00Z
**원본 리뷰:** .planning/phases/22-gh-trade-ios-testflight-android-play/22-REVIEW.md
**반복 차수:** 1

**요약:**
- 범위 안 발견: 6건 (CR-01, WR-01~WR-05. Info 9건은 범위 밖)
- 수정: 6건
- 건너뜀: 0건

**브랜치 메모:** 작업을 시작할 때 main checkout 은 다른 세션이 만든 `gsd/phase-24-limitchaser-buy3` 에 있었다. 그래서 Phase 22 수정은 그 브랜치가 아니라 `master`(3ab26687)에서 분기한 격리 worktree 에서 했다. 끝난 뒤 `git fetch . <임시 브랜치>:master` 로 `master` 를 fast-forward 했다(3ab26687 → ed010e25). `master` 는 어느 worktree 에도 체크아웃돼 있지 않았다. push 는 하지 않았다.

## 수정한 항목

### CR-01: iOS IPA 검사가 TestFlight 업로드 뒤에 돈다

**수정 파일:** `mobile/ios/App/fastlane/Fastfile`, `mobile/scripts/release-ios.sh`, `mobile/README.md`
**커밋:** 7cbef692
**상태:** fixed: requires human verification (실제 lane 은 서명·업로드가 필요해 실행하지 않았다)
**적용한 수정:** `beta` lane 에서 `ipa = build_app(...)` 다음, `upload_to_testflight` 전에 `sh("bash", File.expand_path("../../../scripts/check-ipa.sh", __dir__), File.expand_path(ipa), build_number)` 를 돌린다. 검사가 실패하면 `sh` 가 예외를 던져 lane 이 멈추고, 업로드하지 않는다. Android `firebase` lane 의 check-apk 와 같은 구조다. `upload_to_testflight` 에는 `ipa: ipa` 를 명시해, 검사한 바로 그 IPA 를 올린다. `release-ios.sh` 끝의 사후 `bash scripts/check-ipa.sh` 호출은 지웠다. 남겨 두면 같은 IPA 를 두 번 보고, 업로드 뒤라 막는 효과도 없다. 그래서 헤더와 종료 코드 주석, README 명령 표의 순서 설명(「IPA 검사 → TestFlight 업로드. 실패하면 올리지 않는다」)도 함께 고쳤다. check-ipa.sh 는 `[IPA] [EXPECTED_BUILD]` 인자로 수동 실행할 수 있어 그대로 둔다. `release-apps.sh` 의 「실패 — 로그 확인」 표기는 이제 실제로 업로드되지 않았다는 뜻과 맞는다.

### WR-01: `release-apps.sh` 가 iOS 빌드 번호 파일 경로를 하드코딩한다

**수정 파일:** `mobile/scripts/release-apps.sh`, `mobile/scripts/release-ios.sh`, `mobile/README.md`
**커밋:** 89194148
**상태:** fixed: requires human verification
**적용한 수정:**
- 업로드 뒤 폴링할 번호는 이번 실행 로그의 `CFBundleVersion [0-9]{12}` 줄에서만 읽는다(lane 의 `UI.message`). 못 찾으면 `IOS_RESULT="업로드됨 — 빌드 번호를 로그에서 못 찾음…"` 로 `return 1` 한다. 따라서 직전 릴리스 번호로 폴링해 거짓 「완료」 가 나는 경로가 없다.
- 같은 분 대기용 `build_number.txt` 위치는 하드코딩하지 않는다. 대신 `release-ios.sh` 에 조회 모드 `out-dir` 를 추가했다. 이 모드는 env 검사를 똑같이 통과한 뒤 `GHTRADE_RELEASE_OUT` 한 줄만 출력하고, 그 값은 비밀이 아니다. `release-apps.sh` 는 여기서 받은 값을 쓴다. `GHTRADE_RELEASE_ENV` 로 env 파일을 바꿔도 lane 과 같은 경로를 본다. env 가 없으면 대기를 건너뛰고, 이어지는 `native:release:ios` 가 exit 3 과 주입 명령을 낸다.
- README 보조 모드 표에 `out-dir` 한 줄을 추가했다.

### WR-02: TestFlight 폴링의 INVALID·FAILED 판정이 이번 빌드 번호와 묶여 있지 않다

**수정 파일:** `mobile/scripts/release-apps.sh`
**커밋:** aedcc622
**상태:** fixed: requires human verification (판정 로직 변경)
**적용한 수정:** 판정을 `case` 로 바꿔 VALID·INVALID·FAILED 가 모두 `latest TestFlight build $num state …` 에 대해서만 성립한다. 리뷰가 지적한 반대쪽 틈도 막았다. 15분 동안 이번 번호가 `PROCESSING` 으로 한 번이라도 보였다면 이전과 같이 느린 처리로 보고, 다음 플랫폼으로 넘어간다. 한 번도 안 보였거나 `UNKNOWN` 뿐이면 처리 단계 실패일 수 있다고 보고 `return 1` 로 멈춘다(「15분 동안 처리 기록 없음」). **이건 동작 변경이다.** 예전에는 이 경우 Android 로 넘어갔다. 처리가 15분보다 오래 걸려 계속 `UNKNOWN` 이 나오는 정상 사례가 있다면 Android 가 건너뛰어진다. 사람이 확인해야 한다.

### WR-03: 빌드 번호가 머신의 로컬 시간대를 따른다

**수정 파일:** `mobile/fastlane/build_numbers.rb`, `mobile/fastlane/test/build_numbers_test.rb`, `mobile/scripts/release-apps.sh`
**커밋:** ffeb0850
**적용한 수정:**
- `build_numbers.rb`: `KST_OFFSET = "+09:00"` 을 두고, 두 공식 모두 `t.getlocal(KST_OFFSET)` 로 계산한다. 한국은 서머타임이 없어 고정 오프셋으로 충분하다.
- minitest: 기존 테스트의 시각을 `+09:00` 명시로 바꿔 머신 시간대 의존을 없앴다. 새 테스트는 4개다. 입력 시간대 무관(iOS·Android), 서쪽 시간대로 옮겨도 1분 뒤 번호가 더 큰지(단조성), `ENV["TZ"]="America/Los_Angeles"` 일 때 기본 인자 검사다. 먼저 RED 를 확인했다(4 failures, 예: `202609261549` ≠ `202609270049`). 수정 뒤 GREEN 은 `11 runs, 27 assertions, 0 failures` 이고, TZ=America/Los_Angeles · UTC 에서도 통과한다.
- `release-apps.sh`: `kst_minute() { TZ=Asia/Seoul date … }` 로 date 를 한 번만 불러 두 번호를 계산한다. `wait_new_minute` 는 `now < last` 이면 역행으로 보고 `return 1` 한다. 이때 결과는 iOS·Android 각각 「시작 안 함 — … 역행(시계·시간대 확인)」 이다. last 값이 숫자가 아니면 무시한다.
- 부수 수정: 헤더가 한 줄 늘어서 `--help` 의 `sed -n '4,24p'` 가 헤더를 더 많이 잘랐다. 그래서 헤더 끝 표식(`^# ═══`)까지 출력하게 바꿨다. 이 수정으로 범위 밖 IN-05 도 함께 해소된다.

### WR-04: `AccountPanel` 에서 `stockHref` + `onSelectUnfilled` 조합 시 `<button>` 안에 `<a>`

**수정 파일:** `webapp/src/components/orderbook/account-panel.tsx`, `webapp/src/components/orderbook/__tests__/account-panel.test.tsx`
**커밋:** 63706a00
**적용한 수정:** 테스트 ⑯-x 를 먼저 추가해 RED 를 확인했다(`expected <a …> to have a length of +0 but got 1`). 이어서 `unfilledHrefOf = (isin) => selectable ? null : stockHrefOf(isin)` 를 도입했다. 미체결 행의 표 링크·카드 링크·카드 `relative` 는 모두 이 함수를 쓴다. 잔고 행은 선택 대상이 아니므로 리뷰 예시처럼 전체 링크를 끄지 않고 `stockHrefOf` 를 유지했다. `stockLink` 는 `isin` 대신 `href: string | null` 을 받도록 바꿔, 호출부가 어느 판정을 쓰는지 드러나게 했다. prop 문서에는 「함께 넘기면 선택 우선」 을 적었다. 현재 호출부는 `me-client.tsx` 하나이고 `onSelectUnfilled` 를 넘기지 않으므로 DOM 은 그대로다.

### WR-05: iOS archive 자동 서명이 Xcode 로그인 Apple ID 에 암묵적으로 기댄다

**수정 파일:** `mobile/README.md`, `mobile/ios/App/fastlane/Fastfile`
**커밋:** ed010e25
**상태:** fixed (코드 변경 아님, 문서화로 해결)
**적용한 수정:** README 「처음 1회 › 1. Apple」 에 「Xcode › Settings › Accounts 에 팀 `954QPCS3F5` 의 Apple ID 로 로그인」 을 추가했다. 이 로그인이 필요한 이유(자동 서명 archive 가 개발 인증서·프로파일을 받을 때 씀)와, 빠졌을 때 나는 서명 오류 증상도 함께 적었다. Fastfile `xcargs` 옆에는 이 전제와, ASC 키를 `-authenticationKeyPath/ID/IssuerID` 로 넘기지 않는 이유를 주석으로 남겼다. 리뷰가 제시한 코드 변경을 택하지 않은 이유는 두 가지다. 첫째, gym 이 xcodebuild 명령줄을 로그에 그대로 찍어 키 ID·발급자 ID 가 터미널과 로그에 남는다. 이는 저장소의 값 비출력 규약(release-ios.sh 헤더, README 「키 ID … 는 적지 않는다」)에 어긋난다. 둘째, 서명 없이 검증할 수 없다.

## 검증

모든 검증은 **격리 worktree**(`.claude/worktrees/rf-22-47767-…`, `master` 기준)에서 돌렸다. worktree 는 정리 때 지웠으므로 같은 명령을 main checkout 에서 다시 돌려야 재현된다. webapp 검증을 위해 worktree 안에서 `pnpm install --frozen-lockfile --offline`(webapp·relay 필터)과 `pnpm --filter @gh-radar/shared build` 를 실행했다. 릴리스·업로드·서명 명령과 비밀 파일 읽기는 하지 않았다.

- `ruby mobile/fastlane/test/build_numbers_test.rb` (Homebrew Ruby 4): 11 runs, 27 assertions, 0 failures. TZ=America/Los_Angeles 와 TZ=UTC 에서도 0 failures
- `ruby -c` Fastfile · build_numbers.rb: Syntax OK
- `bash -n mobile/scripts/*.sh`: 전부 통과. shellcheck 는 설치돼 있지 않다
- `bash mobile/scripts/check-release-hygiene.sh`: `RELEASE HYGIENE OK` (각 커밋 전)
- `release-ios.sh bogus`: exit 2. `release-ios.sh out-dir` 는 scratchpad 가짜 env(`GHTRADE_RELEASE_ENV`)로 경로 한 줄·exit 0 을 냈고, env 가 없으면 exit 3 을 냈다
- `release-apps.sh`: scratchpad 스텁 하네스(가짜 `pnpm`·`release-ios.sh`·`sleep`, `HOME` 격리)로 확인했다
  - 정상 VALID → 완료, exit 0
  - 이번 번호 FAILED → exit 1
  - 이전 빌드 INVALID 만 보임 → 즉시 오판하지 않고 15분(스텁) 뒤 「처리 기록 없음」, exit 1
  - PROCESSING 지속 → 넘어감, exit 0
  - UNKNOWN 지속 → exit 1
  - 로그에 번호 없음 → exit 1
  - 직전 번호가 미래 값 → 「시작 안 함」, exit 1(iOS·Android 모두)
  - 프로세스 TZ=LA 에서 같은 분 대기가 동작하고, `android_vc_now` 값이 Ruby 공식과 일치
  - `--help` 는 헤더 끝까지, 모르는 인자는 exit 2
- `pnpm --filter @gh-radar/webapp exec vitest run src/components/orderbook/__tests__/account-panel.test.tsx src/components/trading`: 33 files, 1127 tests passed
- `pnpm --filter @gh-radar/webapp run typecheck`: 통과

---

_수정: 2026-09-27T08:25:00Z_
_수정자: Claude (gsd-code-fixer)_
_반복 차수: 1_
