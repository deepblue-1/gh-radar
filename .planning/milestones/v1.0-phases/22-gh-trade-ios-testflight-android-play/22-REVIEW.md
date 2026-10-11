---
phase: 22-gh-trade-ios-testflight-android-play
reviewed: 2026-09-27T08:03:09Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - mobile/.gitignore
  - mobile/Gemfile
  - mobile/Gemfile.lock
  - mobile/README.md
  - mobile/android/app/build.gradle
  - mobile/android/fastlane/Appfile
  - mobile/android/fastlane/Fastfile
  - mobile/fastlane/build_numbers.rb
  - mobile/fastlane/test/build_numbers_test.rb
  - mobile/ios/App/App/Info.plist
  - mobile/ios/App/fastlane/Appfile
  - mobile/ios/App/fastlane/Fastfile
  - mobile/package.json
  - mobile/scripts/check-aab.sh
  - mobile/scripts/check-apk.sh
  - mobile/scripts/check-ipa.sh
  - mobile/scripts/check-release-hygiene.sh
  - mobile/scripts/release-android.sh
  - mobile/scripts/release-apps.sh
  - mobile/scripts/release-ios.sh
  - mobile/scripts/setup-release-secrets.sh
  - tasks/lessons.md
  - webapp/e2e/specs/auth-guards.spec.ts
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/native-shell.spec.ts
  - webapp/src/app/layout.tsx
  - webapp/src/app/privacy/__tests__/page.test.tsx
  - webapp/src/app/privacy/page.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx
  - webapp/src/lib/native/google-client-ids.ts
  - webapp/src/lib/native/native-bridge-provider.tsx
  - webapp/src/lib/supabase/__tests__/public-path.test.ts
  - webapp/src/lib/supabase/middleware.ts
  - webapp/src/lib/supabase/public-path.ts
  - webapp/src/styles/globals.css
findings:
  critical: 1
  warning: 5
  info: 9
  total: 15
status: issues_found
---

# Phase 22: 코드 리뷰 보고서

**Reviewed:** 2026-09-27T08:03:09Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Phase 22 릴리스 파이프라인(fastlane lane 2개 · 래퍼 3개 · 산출물 검사 3개 · 위생 검사 · 비밀 주입)과 웹 쪽 변경(`/privacy` 공개 경로 · My page 종목 링크 · 앱 탭 프리페치 · Android safe-area/overscroll CSS)을 읽었다. 확인용으로 다음을 실행했다.

- `ruby mobile/fastlane/test/build_numbers_test.rb`: 7 runs, 0 failures
- vitest `public-path` · `native-bridge-provider` · `account-panel`: 94 passed
- `check-release-hygiene.sh`: `RELEASE HYGIENE OK`

비밀 취급(값 비출력 · `:env` 비밀번호 전달 · ADC 폴백 차단 · 600/700 권한)은 대체로 탄탄하다. `SystemBars.java`(8.5.2)도 대조했다. WebView < 140 에서는 네이티브 패딩과 주입 0 을 쓰고, ≥ 140 에서는 passthrough 로 실제 인셋을 주입한다. 그래서 top·left·right 를 `env()` 로만 읽는 CSS 변경은 코드와 맞다.

핵심 결함은 하나다. iOS 산출물 검사(`check-ipa.sh`)가 TestFlight **업로드 뒤에** 돈다. 그래서 문서가 「테스터에게 가기 전에 막는다」고 한 게이트가 실제로는 막지 못한다. Android 는 lane 안에서 업로드 전에 검사하므로 두 플랫폼이 비대칭이다. 그 밖에 릴리스 한 줄 스크립트(`release-apps.sh`)의 상태 판정 결함 2건과 빌드 번호의 시간대 의존 1건이 있다. `AccountPanel` 에는 prop 조합에 따라 잘못된 DOM 중첩이 생기는 잠재 위험 1건이 있다.

## Critical Issues

### CR-01: iOS IPA 검사가 TestFlight 업로드 뒤에 돈다. 게이트가 배포를 막지 못한다

**File:** `mobile/scripts/release-ios.sh:88-89`, `mobile/ios/App/fastlane/Fastfile:50-70`, `mobile/scripts/check-ipa.sh:4-8`
**Issue:**
`release-ios.sh` 는 `bundle exec fastlane beta` 를 먼저 끝까지 실행한 뒤 `bash scripts/check-ipa.sh` 를 부른다. `beta` lane 은 `build_app` 바로 다음에 `upload_to_testflight` 를 호출한다. 따라서 check-ipa 가 실패할 때에는 IPA 가 이미 App Store Connect 에 올라가 있다. README 에 따르면 내부 그룹 `GH Trade 테스터` 는 **자동 배포**가 켜져 있으므로, 처리가 끝나면 그 빌드가 테스터 기기로 나간다.

check-ipa.sh 헤더는 「여기서 막지 않으면 테스터가 …를 받는다」고 적고 있다. 막으려는 대상은 `application-identifier` 누락에 따른 Google 로그인 -34018 실패, 다른 팀 서명, `CAPACITOR_DEBUG=true`, 빌드 번호 불일치다. 이 중 서명·엔타이틀먼트·디버그 항목은 앞 단계 `verify-prod-config.mjs` 가 보지 않으므로, 현재 순서에서는 사후 경보일 뿐이다.

부수 효과도 있다. `release-apps.sh` 는 이 경우 `pnpm run native:release:ios` 가 실패했으므로 `IOS_RESULT="실패 — 로그 확인"` 으로 보고한다. 실제로는 결함 빌드가 TestFlight 에 올라가 배포 대기 중인데, 결과 표는 「안 올라갔다」로 읽힌다.

Android 는 lane `firebase` 안에서 `sh("bash", …check-apk.sh, apk)` 로 **업로드 전에** 검사한다(`android/fastlane/Fastfile:112`). iOS 만 순서가 반대다.

**Fix:** lane 안에서 export 와 upload 사이에 검사를 넣는다(Android 와 같은 구조).
```ruby
# ios/App/fastlane/Fastfile — beta lane
ipa = build_app(
  # …기존 인자 그대로…
)
# 업로드 전 게이트 — 실패하면 sh 가 예외를 던져 업로드하지 않는다
sh("bash", File.expand_path("../../../scripts/check-ipa.sh", __dir__), ipa, build_number)
upload_to_testflight(api_key: api_key, ipa: ipa, skip_waiting_for_build_processing: true)
```
```bash
# scripts/release-ios.sh — 사후 check-ipa 호출 삭제
(cd ios/App && bundle exec fastlane beta)
```

## Warnings

### WR-01: `release-apps.sh` 가 iOS 빌드 번호 파일 경로를 하드코딩한다. `ios.env` 의 `GHTRADE_RELEASE_OUT` 과 어긋날 수 있다

**File:** `mobile/scripts/release-apps.sh:44-45`, `:81`, `:87`
**Issue:** lane 은 `build_number.txt` 를 `ENV["GHTRADE_RELEASE_OUT"]` 에 쓴다(`ios/App/fastlane/Fastfile:36-38`). 이 값은 `ios.env` 에서 온다. `release-ios.sh` 는 `GHTRADE_RELEASE_ENV` 로 env 파일 자체를 바꿀 수도 있다. 반면 `release-apps.sh` 는 `$HOME/Library/Developer/gh-trade-release/ios/build_number.txt` 를 고정해 읽는다. 두 값이 다르면 다음 문제가 생긴다.
- `wait_new_minute` 가 옛 파일이나 없는 파일을 봐서 같은 분 재실행 보호가 무력화된다.
- 업로드가 성공한 뒤 `num` 을 읽는 `tr … < "$IOS_NUM_FILE"` 가 실패하면 `num` 이 빈 값이 되거나 **직전 릴리스 번호**가 된다. 함수가 `release_ios || STATUS=1` 문맥이라 `set -e` 도 꺼져 있다. 그 결과 15분 동안 엉뚱한 번호를 폴링하고, 「15분 안에 VALID 확인 못 함」 같은 틀린 결과를 낸다. 번호가 옛 VALID 빌드와 우연히 같으면 **거짓 「완료」** 가 된다.
**Fix:** 번호의 출처를 하나로 만든다. 예를 들어 lane 이 이미 찍는 `CFBundleVersion N` 줄을 이번 로그에서 추출한다.
```bash
num="$(grep -oE 'CFBundleVersion [0-9]{12}' "$log" | tail -1 | awk '{print $2}')"
[[ -n "$num" ]] || { IOS_RESULT="업로드됨 — 빌드 번호를 로그에서 못 찾음"; return 1; }
```
또는 `release-ios.sh` 가 `GHTRADE_RELEASE_OUT` 경로 한 줄만 출력하게 하고, `release-apps.sh` 가 그 값을 쓰게 한다.

### WR-02: TestFlight 폴링에서 INVALID·FAILED 판정이 이번 빌드 번호와 묶여 있지 않다

**File:** `mobile/scripts/release-apps.sh:93-94`
**Issue:** VALID 판정은 `"latest TestFlight build $num state VALID"` 와 번호까지 일치해야 한다. 반면 실패 판정은 `*"state INVALID"*` · `*"state FAILED"*` 로 **아무 번호에나** 걸린다. `latest` lane 이 아직 이전 빌드를 최신으로 돌려주는 순간이 있을 수 있고, 그 이전 빌드가 INVALID 였다면(= 처리 실패 뒤 고쳐서 다시 올리는 전형적인 재릴리스) 방금 올린 빌드를 실패로 오판한다. 그러면 `return 1` 로 Android 릴리스까지 건너뛴다.

반대 방향의 틈도 있다. 처리 단계에서 실패해 Build 리소스가 생기지 않으면 `latest` lane 은 `state UNKNOWN` 을 낸다. 이 경우 15분을 채운 뒤 「VALID 확인 못 함」으로 `STATUS=0` 을 유지하고 Android 로 넘어간다.
**Fix:**
```bash
case "$line" in
  "latest TestFlight build $num state VALID") state=VALID; break ;;
  "latest TestFlight build $num state INVALID"|"latest TestFlight build $num state FAILED") state="${line##* }"; break ;;
esac
```

### WR-03: 빌드 번호가 머신의 로컬 시간대를 따른다. 주석은 KST 라고 하지만 강제하지 않아 단조성이 깨질 수 있다

**File:** `mobile/fastlane/build_numbers.rb:18-27`, `mobile/scripts/release-apps.sh:57-58`, `:61-71`
**Issue:** `Time.now.strftime` 와 `date +…` 는 모두 프로세스 TZ 를 따른다. 주석은 「로컬 시각(KST)」 이라고 적지만 KST 로 고정하지 않는다. Mac 시간대가 KST 보다 서쪽으로 바뀌면(출장·자동 시간대·`TZ` env) 다음 번호가 직전 번호보다 **작아진다**. 이 경우 두 플랫폼 모두 실패한다.
- iOS: App Store Connect 가 같은 `CFBundleShortVersionString` 안에서 더 낮은 `CFBundleVersion` 을 거절한다.
- Android: 테스터 기기의 덮어 설치가 `INSTALL_FAILED_VERSION_DOWNGRADE` 로 실패한다.

`wait_new_minute` 는 `last == now` 만 보므로 `now < last` 를 잡지 못하고, 거절될 빌드를 끝까지 만든다. 단위 테스트는 `Time.new(...)` 로 로컬 시각만 주입하므로 이 경로를 잠그지 못한다.
**Fix:**
```ruby
KST = "+09:00"
def self.ios_build_number(t = Time.now) = t.getlocal(KST).strftime("%Y%m%d%H%M")
def self.android_version_code(t = Time.now)
  k = t.getlocal(KST)
  code = (k.year - 2020) * 100_000_000 + k.strftime("%m%d%H%M").to_i
  # …상한 검사 그대로…
end
```
```bash
ios_num_now() { TZ=Asia/Seoul date +%Y%m%d%H%M; }
# wait_new_minute: [[ "$now" -lt "$last" ]] 이면 즉시 실패(시계·시간대 역행)
```

### WR-04: `AccountPanel` 에서 `stockHref` 와 `onSelectUnfilled` 를 같이 넘기면 `<button>` 안에 `<a>` 가 들어가고 행 선택이 링크에 먹힌다

**File:** `webapp/src/components/orderbook/account-panel.tsx:536-553`, `:561-577`, `:851-866`
**Issue:** 카드 행의 종목명은 `selectHandle(view, stockLink(…, true, …))` 로 감싼다. `selectable`(= `onSelectUnfilled` 있음)이면 `selectHandle` 이 `<button aria-pressed>` 를 만들고, 그 안에 `stockLink` 의 `<Link>` 가 들어간다. 이는 interactive-in-interactive 로 HTML 규격 위반이고, 스크린리더에서는 역할이 두 개가 된다. 또 `stretch` 링크의 `::after` 가 `relative` 행 전체를 덮으므로, 행 `onClick`(선택)은 링크 클릭 버블로만 불리고 곧바로 페이지 이동이 일어난다. 결국 선택 기능이 사실상 사라진다. 표 행(`:784-791`)도 같은 조합에서 링크 클릭이 행 `onClick` 선택까지 같이 발화한다.

지금은 My page 만 `stockHref` 를 넘기고 `onSelectUnfilled` 는 넘기지 않아 드러나지 않는다. 그러나 prop 문서(「기본 배치의 … 넘기지 않으면 DOM 불변」)는 조합을 금지하지 않고, 코드에도 가드가 없다.
**Fix:** 두 prop 을 상호 배타로 만든다.
```tsx
const stockHrefOf = (isin: string): string | null =>
  selectable ? null : (stockHref?.(isin) ?? null); // 선택 모드에서는 링크를 만들지 않는다
```
타입 수준에서 막아도 된다(`stockHref` 와 `onSelectUnfilled` 를 discriminated union 으로). 조합 테스트(⑯-z 옆)도 하나 추가한다.

### WR-05: iOS archive 의 자동 서명이 Xcode 에 로그인된 Apple 계정에 암묵적으로 기대고 있다

**File:** `mobile/ios/App/fastlane/Fastfile:61`
**Issue:** `xcargs: "CODE_SIGN_STYLE=Automatic … -allowProvisioningUpdates"` 에는 `-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID` 가 없다. 이 상태에서 xcodebuild 가 개발 인증서나 프로파일을 만들거나 받으려면 **Xcode › Settings › Accounts 에 로그인된 Apple ID** 가 필요하다. 지금 Mac 에서는 캐시된 개발 프로파일로 동작하지만, README 「처음 1회 (새 Mac·키 분실 때 참고)」 에는 이 전제가 없다. 새 Mac 이나 캐시가 만료된 뒤에는 archive 가 서명 오류로 멈추고, 문서의 복구 절차로는 풀리지 않는다. ASC API 키는 이미 `ios.env` 에 있다.
**Fix:**
```ruby
xcargs: [
  "CODE_SIGN_STYLE=Automatic",
  "CURRENT_PROJECT_VERSION=#{build_number}",
  "-allowProvisioningUpdates",
  "-authenticationKeyPath #{ENV['ASC_KEY_PATH'].shellescape}",
  "-authenticationKeyID #{ENV['ASC_KEY_ID']}",
  "-authenticationKeyIssuerID #{ENV['ASC_ISSUER_ID']}",
].join(" "),
```
xcargs 는 gym 이 명령줄로 로그에 찍는다. 키 ID·발급자 ID·경로는 비밀이 아니지만, 저장소 규약상 로그에 남아도 되는지 한 번 확인한다. 안 된다면 README 첫 1회 절차에 「Xcode 에 팀 954QPCS3F5 Apple ID 로그인」을 명시한다.

## Info

### IN-01: env 파일에 경로를 따옴표 없이 쓰고, 그 파일을 `source` 한다

**File:** `mobile/scripts/setup-release-secrets.sh:147-148`, `:209`, `:214`
**Issue:** `ASC_KEY_PATH=$key_dst` · `GHTRADE_RELEASE_OUT=$HOME/…` · `GHTRADE_UPLOAD_STORE_FILE=$jks` 가 따옴표 없이 기록되고, `release-*.sh` 가 이를 `set -a; source` 한다. `$HOME` 이나 `GHTRADE_RELEASE_DIR` 에 공백이 있으면 source 가 잘못 파싱되고, 공백 뒤 토큰이 명령으로 실행된다.
**Fix:** `printf '%s=%q\n' ASC_KEY_PATH "$key_dst"` 처럼 `%q` 로 쓴다.

### IN-02: `stage_asc` 가 외부 저장소 파일의 줄을 `source` 로 평가한다

**File:** `mobile/scripts/setup-release-secrets.sh:115-120`
**Issue:** weekly-wine `.env.default` 에서 골라낸 `ASC_KEY_ID=…` 줄을 그대로 `source` 한다. 값에 `$(…)` 나 백틱이 있으면 실행된다. 그 파일도 사용자 소유이긴 하지만, 비밀 주입 스크립트가 다른 저장소의 셸 평가를 신뢰할 이유는 없다.
**Fix:** `sed -nE 's/^(export[[:space:]]+)?ASC_KEY_ID=["'\'']?([A-Za-z0-9]+)["'\'']?$/\2/p'` 처럼 값만 파싱하고 형식을 검증한다(발급자 ID 는 UUID 정규식).

### IN-03: `stage_keystore` 의 두 `mv` 가 원자적이지 않다

**File:** `mobile/scripts/setup-release-secrets.sh:219-220`
**Issue:** jks 를 옮긴 뒤 env 를 옮기다 실패하면, 다음 실행은 `:166` 에서 jks 가 있으니 SKIP 한다. 비밀번호는 `.android.env.new` 에만 남는다. `:170` 의 「env 만 있고 jks 없음」 가드는 있지만, 반대 경우(jks 만 있고 env 없음)에는 가드가 없다.
**Fix:** env 를 먼저 옮기거나, `[[ -f "$jks" && ! -f "$envf" ]]` 일 때 `.android.env.new` 존재를 알리고 멈춘다.

### IN-04: `check-aab.sh` 의 SHA-1 비교는 콜론을 정규화하지 않는다. `check-apk.sh` 와 기준이 다르다

**File:** `mobile/scripts/check-aab.sh:50-52`
**Issue:** check-apk 는 「대소문자·콜론 무관」으로 정규화하지만, check-aab 는 대소문자만 맞춘다. `GHTRADE_UPLOAD_SHA1` 을 콜론 없이 넣으면 APK 는 통과하고 AAB 는 실패한다.
**Fix:** check-apk 의 `norm_sha1` 을 같이 쓴다.

### IN-05: `release-apps.sh --help` 가 헤더 마지막 규약 줄을 잘라 먹는다

**File:** `mobile/scripts/release-apps.sh:32`
**Issue:** 헤더는 4~25행인데 `sed -n '4,24p'` 라서 25행(「한 플랫폼이 실패하면 거기서 멈춘다」)이 빠진다.
**Fix:** `sed -n '4,25p'` 로 바꾸거나, 헤더 끝 표식까지 출력한다.

### IN-06: 위생 검사 (9)는 호출 단위가 아니라 파일 전체 개수로 비교한다

**File:** `mobile/scripts/check-release-hygiene.sh:131-141`
**Issue:** 주석 줄만 제외하고 `service_credentials_file:` 가 나온 횟수를 센다. 다른 코드 줄의 문자열이나 줄 끝 주석에 키워드가 있으면, 호출 하나에서 인자가 빠져도 개수가 맞아 통과한다.
**Fix:** `firebase_app_distribution(` 부터 짝이 맞는 `)` 까지 블록 단위로 잘라 블록마다 검사한다(Ruby 한 줄 스크립트로 파싱).

### IN-07: `release-android.sh check` 가 쓰지 않는 키스토어 비밀번호·alias 까지 요구한다

**File:** `mobile/scripts/release-android.sh:82-88`
**Issue:** `check` 는 check-aab.sh 만 실행하고, 필요한 값은 `GHTRADE_UPLOAD_SHA1` 뿐이다. 그런데 `firebase|build|beta` 와 같은 묶음에 있어 비밀번호가 비면 exit 3 이 난다. `check-apk` 모드와 처리가 다르다.
**Fix:** `check` 를 `check-apk)` 분기로 옮긴다.

### IN-08: 업로드 키 env 가 있고 `ghtradeVersionCode` 가 없으면 release 산출물이 versionCode 1 로 조용히 만들어진다

**File:** `mobile/android/app/build.gradle:16`, `:75-79`
**Issue:** `whenReady` 가드는 서명 env 만 본다. `GHTRADE_UPLOAD_STORE_FILE` 을 export 한 셸에서 `./gradlew assembleRelease` 를 직접 돌리면, 업로드 키로 서명된 versionCode 1 APK/AAB 가 같은 출력 경로에 생긴다. lane 이 업로드 전에 지우고 check-apk 가 번호를 대조하므로 업로드까지 가지는 않는다. 다만 수동 배포나 사이드로드 사고 여지가 남는다.
**Fix:** release 태스크가 그래프에 있고 `!project.hasProperty("ghtradeVersionCode")` 이면 같은 가드에서 throw 한다.

### IN-09: 앱 탭 프리페치의 인증 경로 판정이 `isPublicPath` 와 따로 논다(`/privacy` 누락)

**File:** `webapp/src/lib/native/native-bridge-provider.tsx:93-95`, `:218-223`
**Issue:** `isAuthPath` 는 `/login`·`/auth` 만 제외한다. 미로그인 사용자가 앱에서 공개 경로 `/privacy` 를 열면 보호된 탭 5개를 프리페치한다. 각 요청이 미들웨어 `getUser()` 왕복 뒤 `/login` 리다이렉트만 받는다. 공개 경로 목록이 `public-path.ts` 와 여기에 두 벌로 있어, 이번처럼 한쪽만 늘어나는 드리프트가 이미 생겼다.
**Fix:** `import { isPublicPath } from '@/lib/supabase/public-path'` 로 판정을 공유하거나, 인증 상태(`useAuth`)가 로그인일 때만 프리페치한다.

---

_Reviewed: 2026-09-27T08:03:09Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
