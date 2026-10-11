# Phase 22: GH Trade 테스트 배포 (iOS TestFlight · Android Play 내부 테스트) - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 25 (신규 17 · 수정 8)
**Analogs found:** 22 / 25

> 경로 규칙: 접두 없는 경로 = gh-radar(git 추적 소스). `weekly-wine:` 접두 = 형제 저장소 `/Users/alex/repos/weekly-wine-app`(**읽기 전용 · EXTERNAL analog**).
> weekly-wine 추적 여부 실측: `ios/App/fastlane/Fastfile` · `ios/App/fastlane/Appfile` 만 추적된다. **`android/fastlane/*` 와 `Gemfile` 은 git 에 없다**(RESEARCH 발견 3 — Android 경로는 미검증). 루트 `Gemfile` 은 존재하지 않는다(플랫폼별 Gemfile 만).
> **비밀 규칙:** 이 문서에는 비밀값이 없다. weekly-wine `build.gradle`/`docs/android-deploy.md` 의 평문 비밀번호는 **옮기지 않았다**(`<REDACTED>` 대상 — 참조도 금지).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| **mobile — 신규** | | | | |
| `mobile/Gemfile` (+ `Gemfile.lock`) | config | — | weekly-wine 플랫폼별 Gemfile(미추적) · RESEARCH Standard Stack | partial |
| `mobile/ios/App/fastlane/Fastfile` | build lane | batch (build→upload) | `weekly-wine:ios/App/fastlane/Fastfile` (report.xml 실증) | exact (+수정 3건) |
| `mobile/ios/App/fastlane/Appfile` | config | — | `weekly-wine:ios/App/fastlane/Appfile` | exact |
| `mobile/android/fastlane/Fastfile` | build lane | batch | `weekly-wine:android/fastlane/Fastfile` (**미추적 · 미검증**) | role-match (뼈대만) |
| `mobile/android/fastlane/Appfile` | config | — | `weekly-wine:android/fastlane/Appfile` (미추적) | exact (기본 경로 제거) |
| `mobile/scripts/release-ios.sh` | wrapper script | batch | `scripts/dma-credentials.sh` (env 로드·키 이름만 보고) | role-match |
| `mobile/scripts/release-android.sh` | wrapper script | batch | `scripts/dma-credentials.sh` | role-match |
| `mobile/scripts/check-ipa.sh` | check script | file-I/O (artifact 검사) | `mobile/scripts/check-sim-entitlements.sh` | exact |
| `mobile/scripts/check-aab.sh` | check script | file-I/O | `mobile/scripts/check-sim-entitlements.sh` + `verify-prod-config.mjs` | role-match |
| `mobile/scripts/check-release-hygiene.sh` | check script | file-I/O (static) | `mobile/scripts/verify-prod-config.mjs` (fail 누적 → exit 1) | role-match |
| `mobile/scripts/setup-release-secrets.sh` | secret setup (사용자 `!`) | file-I/O | `scripts/dma-credentials.sh` (비출력 규약) | role-match |
| **mobile — 수정** | | | | |
| `mobile/package.json` (`native:release:*`) | config | — | 자기 자신 `native:build:ios` L9 · weekly-wine `package.json` L12-14 `fastlane:*` | exact |
| `mobile/android/app/build.gradle` | config (gradle) | — | 자기 자신 L7-25 | — (Pattern 2) |
| `mobile/ios/App/App/Info.plist` | config | — | 자기 자신 L34-35 `CFBundleVersion` | — |
| `mobile/.gitignore` | config | — | 자기 자신 L25-27 · `weekly-wine:.gitignore` L20-31 | exact |
| `mobile/android/.gitignore` | config | — | 자기 자신 L72-77 (fastlane 블록 이미 있음) | — |
| `mobile/README.md` | docs | — | 자기 자신 `## 비밀 파일` L90 · `## 범위 밖` L94 | — |
| **webapp — 신규** | | | | |
| `webapp/src/app/privacy/page.tsx` | page (RSC) | request-response (정적) | `webapp/src/app/design/page.tsx` (metadata) + `components/layout/center-shell.tsx` | role-match |
| `webapp/src/app/privacy/__tests__/page.test.tsx` | test | — | `webapp/src/app/login/__tests__/page.test.tsx` | exact |
| `webapp/src/lib/supabase/__tests__/public-path.test.ts` | test | — | `webapp/src/lib/__tests__/safe-path.test.ts` (it.each 판정 표) | exact |
| **webapp — 수정** | | | | |
| `webapp/src/lib/supabase/middleware.ts` (`isPublicPath` 추출 + `/privacy`) | middleware | request-response | 자기 자신 L8 · L54-57 | — |
| `webapp/e2e/specs/auth-guards.spec.ts` (`/privacy` 케이스) | e2e | — | 자기 자신 L26-44 | exact |
| `webapp/src/lib/native/google-client-ids.ts` (주석만) | config | — | 자기 자신 L12-15 | — |
| **계획 문서(수정)** — `REQUIREMENTS.md` · `ROADMAP.md` | docs | — | — (RESEARCH Phase Requirements 문구 그대로) | none |

## Pattern Assignments

### `mobile/ios/App/fastlane/Fastfile` (build lane, batch) — EXTERNAL analog

**Analog:** `weekly-wine:ios/App/fastlane/Fastfile` L1-49 (report.xml 에 전 단계 성공 기록)

**원본 구조** (L5-47 발췌):
```ruby
lane :beta do
  api_key = app_store_connect_api_key(
    key_id: ENV["ASC_KEY_ID"], issuer_id: ENV["ASC_ISSUER_ID"],
    key_filepath: ENV["ASC_KEY_PATH"], in_house: false
  )
  increment_build_number(                                 # ✗ 복사 금지 (결함 ①)
    build_number: Time.now.strftime("%Y%m%d%H%M"), xcodeproj: "App.xcodeproj"
  )
  get_provisioning_profile(api_key: api_key, app_identifier: "kr.co.weeklywine.app",
    team_id: "954QPCS3F5", readonly: true)                 # ✗ readonly:true 금지 (결함 ②)
  build_app(project: "App.xcodeproj", scheme: "App", configuration: "Release",
    export_method: "app-store",
    export_options: { signingStyle: "manual", teamID: "954QPCS3F5",
      provisioningProfiles: { "kr.co.weeklywine.app" => lane_context[SharedValues::SIGH_NAME] } },
    xcargs: "CODE_SIGN_STYLE=Automatic", clean: true)     # ✗ output_directory 없음 → 저장소 안에 .ipa/.dSYM 남음
  upload_to_testflight(api_key: api_key, skip_waiting_for_build_processing: true)
end
```

**적용 수정 (RESEARCH Pattern 1 코드가 정본):**
1. `increment_build_number` 삭제 → `xcargs: "CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION=#{build_number} -allowProvisioningUpdates"` (agvtool 이 Info.plist·pbxproj 를 바꿔 커밋에 섞임 — weekly-wine `88ffff7` 사례, D-09 위반).
2. `readonly: false` + `output_path: ENV["GHTRADE_RELEASE_OUT"]`.
3. `build_app(output_directory: out)` — 저장소 밖.
4. lane 선두에 `%w[ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH GHTRADE_RELEASE_OUT]` 비어 있음 검사(`UI.user_error!` 에 **이름만**).
5. 식별자 `kr.co.weeklywine.app` → `com.ghtrade.app`. 팀 `954QPCS3F5` 동일.
6. `export_method: "app-store"` 유지(fastlane 2.240.1 gym 은 `app-store-connect` 거부).

### `mobile/ios/App/fastlane/Appfile` / `mobile/android/fastlane/Appfile` (config) — EXTERNAL analog

**Analog:** `weekly-wine:android/fastlane/Appfile` L1-2 (미추적)
```ruby
json_key_file(ENV["GOOGLE_PLAY_JSON_KEY"] || "./fastlane/play-store-key.json")   # ✗ 저장소 안 기본 경로 제거
package_name("kr.co.weeklywine.app")
```
→ GH Trade: `json_key_file(ENV["GOOGLE_PLAY_JSON_KEY"])` · `package_name("com.ghtrade.app")`. iOS Appfile 은 `app_identifier("com.ghtrade.app")` · `team_id("954QPCS3F5")`.

### `mobile/android/fastlane/Fastfile` (build lane, batch) — EXTERNAL analog (미검증)

**Analog:** `weekly-wine:android/fastlane/Fastfile` L1-20 — **git 미추적 · 실행 흔적 없음. 뼈대만 참고.**
```ruby
lane :beta do
  gradle(project_dir: ".", task: "bundle", build_type: "Release")   # ✗ versionCode 주입 없음 (결함 ③ — 두 번째 업로드 거절)
  upload_to_play_store(track: "internal",
    aab: "app/build/outputs/bundle/release/app-release.aab",
    skip_upload_metadata: true, skip_upload_images: true, skip_upload_screenshots: true)
end
```
**적용 수정 (RESEARCH Pattern 3 코드가 정본):**
- `ghtrade_version_code = (year−2020)·10^8 + MMDDHHmm` (D-09 의 `YYMMDDHHmm` 은 상한 초과 — Pitfall 1).
- `gradle(properties: { "ghtradeVersionCode" => vc })` — **비밀은 properties 로 넘기지 않는다**(`android.injected.signing.*` + 기본 `print_command` 는 비밀번호를 로그에 찍음). 서명은 build.gradle 이 env 로 직접 읽음.
- `lane :build`(첫 수동 업로드용 AAB 만) + `lane :beta`. AAB 경로는 `lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH]`.
- `release_status: ENV.fetch("PLAY_RELEASE_STATUS", "completed")` · `skip_upload_changelogs: true` 추가.

### `mobile/android/app/build.gradle` (config, 수정)

**Analog:** 자기 자신
```groovy
// L7-12
defaultConfig {
    applicationId "com.ghtrade.app"
    ...
    versionCode 1
    versionName "1.0"
// L20-25
buildTypes {
    release {
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```
**적용:** RESEARCH Pattern 2 그대로 — 파일 상단 `def ghtradeUploadStoreFile = System.getenv("GHTRADE_UPLOAD_STORE_FILE")`, `versionCode((project.findProperty("ghtradeVersionCode") ?: "1") as Integer)`, `signingConfigs.release` 는 env 가 있을 때만 채움, `gradle.taskGraph.whenReady` 가드(bundleRelease/assembleRelease 만 실패 · assembleDebug 통과).
**금지 (weekly-wine 결함):** `System.getenv("...") ?: '<평문 비밀번호>'` 형태의 기본값. 검증: `check-release-hygiene.sh` 의 `grep -nE "(store|key)Password[^\n]*['\"]"` 0건.
기존 주석 스타일(L26 `// capacitor.build.gradle 의 … 와 같은 값`, L44 `// Custom Tabs(D-28 · …)`)처럼 한글 한 줄 근거 주석 + 결정 ID(D-08·D-09)를 단다.

### `mobile/ios/App/App/Info.plist` (config, 수정)

**Analog:** 자기 자신 L34-35
```xml
<key>CFBundleVersion</key>
<string>$(CURRENT_PROJECT_VERSION)</string>
```
- 이 변수 참조는 **절대 리터럴로 바꾸지 않는다**(xcargs 덮어쓰기가 여기로 반영됨).
- 추가: `<key>ITSAppUsesNonExemptEncryption</key><false/>` — 키 알파벳 순서 위치(`LSRequiresIPhoneOS` 앞 근처)에 탭 들여쓰기 유지.

### `mobile/package.json` (config, 수정)

**Analog:** 자기 자신 L7·L9·L16 + `weekly-wine:package.json` L12-14
```jsonc
// gh-radar L9 — 체인 + 검사 스크립트 후행 패턴
"native:build:ios": "cap sync ios && xcodebuild … build && bash scripts/check-sim-entitlements.sh",
"native:verify-prod": "node scripts/verify-prod-config.mjs",
// weekly-wine L13 (EXTERNAL) — Ruby PATH 관례
"fastlane:beta": "… && cd ios/App && PATH=/opt/homebrew/opt/ruby/bin:$PATH bundle exec fastlane beta",
```
**적용:** RESEARCH Pattern 4 — `"native:release:ios": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-ios.sh"` (android · android:aab 동일). `cap sync` **인자 없음**(양 플랫폼 — Pitfall 8). Ruby PATH 는 package.json 이 아니라 래퍼 스크립트 안에 둔다. 스크립트 이름에 단독 `build` 금지(루트 `pnpm -r run build`).

### `mobile/scripts/release-ios.sh` · `release-android.sh` (wrapper, batch)

**Analog:** `scripts/dma-credentials.sh`
```bash
# L1-2
#!/usr/bin/env bash
set -euo pipefail
# L21-24 (헤더 규약)
# 비밀은 이 래퍼가 화면에 내보내지 않는다 (deploy-relay.sh 와 동일 규약):
#   env 파일은 `set -a; source` 로만 읽고 내용을 echo 하지 않으며, 검증 실패 시에도
#   **비어 있는 키 이름만** 출력한다. 값은 어떤 경로로도 찍지 않는다.
# L31
cd "$(dirname "$0")/.."
# L45-46 · L53-58
set -a
# source "$ENV_FILE"; set +a
MISSING=""
if [[ -z "${SUPABASE_URL:-}" ]]; then MISSING="$MISSING SUPABASE_URL"; fi
if [[ -n "$MISSING" ]]; then
  echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
```
**적용:** `ENV_FILE="${GHTRADE_RELEASE_ENV:-$HOME/.config/gh-trade/release/ios.env}"` → 존재 확인 → `set -a; source; set +a` → 키 이름 검증(iOS: ASC_KEY_ID·ASC_ISSUER_ID·ASC_KEY_PATH·GHTRADE_RELEASE_OUT / Android: GHTRADE_UPLOAD_STORE_FILE·…_STORE_PASSWORD·…_KEY_ALIAS·…_KEY_PASSWORD·GOOGLE_PLAY_JSON_KEY) → `export PATH=/opt/homebrew/opt/ruby/bin:$PATH` → `(cd ios/App && bundle exec fastlane beta)` → `bash scripts/check-ipa.sh`. Android 래퍼는 `$1`(기본 `beta`, `build` 허용)을 lane 으로.

### `mobile/scripts/check-ipa.sh` · `check-aab.sh` (check script, artifact 검사)

**Analog:** `mobile/scripts/check-sim-entitlements.sh` L1-33 (가장 가까움 — 같은 번들 ID · 같은 엔타이틀먼트 검사)
```bash
# L1-13: 헤더 = 「왜」 한글 설명(실패 시 사용자가 겪는 일) → set -euo pipefail → cd "$(dirname "$0")/.."
set -euo pipefail
cd "$(dirname "$0")/.."
# L15-16: 인자 기본값 + 기대값 상수
BIN="${1:-ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app/App}"
EXPECT="954QPCS3F5.com.ghtrade.app"
# L18-21: 입력 없음 → 접두 FAIL 한 줄 stderr + exit 1
if [ ! -f "${BIN}" ]; then
  echo "SIM ENTITLEMENTS FAIL — 실행 파일이 없다: ${BIN}" >&2
  exit 1
fi
# L26-28: 성공 = 「<NAME> OK …」 한 줄 + exit 0
echo "SIM ENTITLEMENTS OK application-identifier=${EXPECT}"
# L31-33: 실패 = 원인 + 결과(사용자 영향) 두 줄
```
**적용:** 접두는 `IPA CHECK OK/FAIL` · `AAB CHECK OK/FAIL`. 검사 본문은 RESEARCH §Code Examples 「IPA 검사」「AAB 검사」(codesign Authority=Apple Distribution (954QPCS3F5) · get-task-allow false · CFBundleVersion = 이번 빌드 번호 · ITSAppUsesNonExemptEncryption false · CAPACITOR_DEBUG≠true · capacitor.config.json server.url / `keytool -printcert -jarfile` SHA-1 = `$GHTRADE_UPLOAD_SHA1` · `jarsigner -verify`). 임시 디렉터리는 `mktemp -d` + `trap 'rm -rf' EXIT`. 운영 URL 판정은 `verify-prod-config.mjs` L26 `PROD_URL = 'https://trade.jx1.io'` 와 같은 값.

### `mobile/scripts/check-release-hygiene.sh` (check script, static)

**Analog:** `mobile/scripts/verify-prod-config.mjs` L40-49 · L51-80 (fail 누적 → 마지막에 일괄 출력 · exit 1)
```js
const failures = [];
const fail = (msg) => failures.push(msg);
...
fail(`[${platform}] server.cleartext = true — 운영 빌드에 cleartext 허용이 남아 있다`);
```
**적용:** bash 로 `FAILS=()` 배열 누적 → 각 `FAIL …` 한 줄. 항목(MOBILE-02e·j·k): build.gradle 평문 비밀번호 grep 0건 · `git check-ignore -q` 샘플 경로 목록 · `git ls-files mobile | grep -E '\.(p8|p12|jks|keystore|mobileprovision)$'` 0줄 · `stat -f '%Lp'` 로 `~/.config/gh-trade/release` 700 · 파일 600(**내용 미열람**). 통과 시 `RELEASE HYGIENE OK` 한 줄.

### `mobile/scripts/setup-release-secrets.sh` (사용자 `!` 실행)

**Analog:** `scripts/dma-credentials.sh` 헤더·비출력 규약(위 발췌 L21-24). 차이: **대화형 프롬프트 금지**(`read -s` 없음 — `!` 셸 TTY 없음). 단계 인자 `dir|asc|keystore|backup|play-sa` (RESEARCH Pattern 5). 비밀번호 = `openssl rand -base64 32`, keytool 은 `-storepass:env`/`-keypass:env`. 출력 허용: `OK`, 업로드 인증서 SHA-1(공개 지문), SA 이메일 뿐. `asc` 단계는 weekly-wine `ios/App/fastlane/.env.default` 에서 `ASC_KEY_ID`·`ASC_ISSUER_ID` 줄만 `grep` 해 옮긴다 — 파일 전체를 cat 하지 않는다.

### `mobile/.gitignore` (config, 수정)

**Analog:** 자기 자신 L25-27 + `weekly-wine:.gitignore` L20-31 (EXTERNAL)
```gitignore
# gh-radar L25-27
# 서명 키 — 범위 밖, 절대 커밋하지 않는다(T-21-14)
*.jks
*.keystore
# weekly-wine L20-31 (발췌)
ios/App/fastlane/.env.default
ios/App/fastlane/AuthKey*.p8
ios/App/fastlane/report.xml
ios/App/fastlane/README.md
android/fastlane/play-store-key.json
android/fastlane/report.xml
android/fastlane/README.md
*.ipa
*.aab
```
**적용:** 섹션 주석 「# 릴리스 비밀·산출물 — 저장소 밖이 원칙, ignore 는 이중 방어(Phase 22)」 아래에 `*.p8` · `*.p12` · `*.mobileprovision` · `key.properties` · `play-store-key.json` · `*.ipa` · `*.aab` · `*.dSYM.zip` · `**/fastlane/report.xml` · `**/fastlane/README.md` · `**/fastlane/.env*` · `vendor/bundle/` · `.bundle/`. (weekly-wine 은 `*.mobileprovision` 누락 — 따라 하지 않음.) `Gemfile.lock` 은 **커밋**.
`mobile/android/.gitignore` 는 L7 `*.aab` · L72-77 fastlane 블록이 이미 있으므로 변경 최소(필요 시 L57-58 `#*.jks` 주석 해제 정도).

### `webapp/src/lib/supabase/middleware.ts` (middleware, 수정)

**Analog:** 자기 자신
```ts
// L4-8
/**
 * 공개 prefix — 로그인 없이 접근 가능한 경로 시작부
 * (D-10: /login 로그인 화면, /auth OAuth callback 등)
 */
const PUBLIC_PREFIXES = ["/login", "/auth"];
// L54-57
const pathname = request.nextUrl.pathname;
const isPublic = PUBLIC_PREFIXES.some(
  (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
);
```
**적용:** `PUBLIC_PREFIXES` 에 `"/privacy"` 추가(주석에 `/privacy 개인정보처리방침 — Phase 22 D-11`). 판정식을 `export function isPublicPath(pathname: string): boolean` 로 추출하고 L55 는 `const isPublic = isPublicPath(pathname);`. L72 `/login` 분기는 불변.

### `webapp/src/lib/supabase/__tests__/public-path.test.ts` (test) — 디렉터리 신규

**Analog:** `webapp/src/lib/__tests__/safe-path.test.ts` L1-25
```ts
import { describe, expect, it } from 'vitest';
import { isSafeInternalPath } from '../safe-path';
/**
 * Phase 21 Plan 27 Task 1 — …
 * 거부 표가 깨지면 → …(사용자 영향)
 * 통과 표가 깨지면 → …
 */
describe('isSafeInternalPath', () => {
  it.each(['/', '/me', …])('같은 출처 절대 경로 %j 는 통과', (path) => {
    expect(isSafeInternalPath(path)).toBe(true);
  });
  it.each([['프로토콜 상대', '//evil.com'], …])( … )
```
**적용:** `import { isPublicPath } from '../middleware';` — 통과 표 `/privacy` · `/privacy/` · `/login` · `/auth/callback`, 차단 표 `/privacyx` · `/privacy-x` · `/` · `/trading`. 헤더 주석은 「깨졌을 때 사용자가 겪는 일」 형식. (middleware 모듈이 `@supabase/ssr`·`next/server` 를 import 하므로 vitest 환경에서 import 가 되는지 첫 실행으로 확인 — 안 되면 `isPublicPath` 를 `lib/supabase/public-path.ts` 로 분리.)

### `webapp/src/app/privacy/page.tsx` (page RSC, 정적)

**Analog:** `webapp/src/app/design/page.tsx` L21-24 (metadata) + `components/layout/center-shell.tsx` L18-27
```ts
export const metadata = {
  title: 'Design Catalog · GH Trade',
  description: 'Phase 3 디자인 시스템 카탈로그 — …',
};
```
```tsx
export function CenterShell({ nav, children }: CenterShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--fg)]">
      <AppHeader nav={nav} themeToggle />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
```
**적용:** `"use client"` 없음(RSC). `metadata.title = '개인정보처리방침 · GH Trade'`. `<CenterShell>` 안에 `<h1>개인정보처리방침</h1>` + 섹션 13개(RESEARCH Pattern 6 권장 순서 · 수집 항목 표 11행). 색은 `var(--fg)`/`var(--muted-fg)` 토큰만. API 호출·relay 의존 없음. `/login/page.tsx` 는 `"use client"` + Suspense 라 이 페이지의 analog 로는 부적합(테스트 파일만 analog).

### `webapp/src/app/privacy/__tests__/page.test.tsx` (test)

**Analog:** `webapp/src/app/login/__tests__/page.test.tsx` L1-7 · L9-22 · L32-34
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import LoginPage from '../page';
/**
 * Phase 21 Plan 15 Task 2 — `/login` 앱 분기(D-03 · MOBILE-01f) 회귀면.
 * 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 */
describe('/login', () => {
  it('워드마크 「GH Trade」 만 있고 설명 문구는 없다', () => {
    render(<LoginPage />);
```
**적용:** `import PrivacyPage, { metadata } from '../page';` → `render(<PrivacyPage />)` → 필수 섹션 제목 `it.each` (`getByRole('heading', { name: … })`) + `metadata.title` 단언. `CenterShell` 안 `AppHeader` 가 context 를 요구하면 `vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))`. 헤더 주석 「Phase 22 — `/privacy`(D-11 · MOBILE-02c)」.

### `webapp/e2e/specs/auth-guards.spec.ts` (e2e, 케이스 추가)

**Analog:** 자기 자신 L26-44
```ts
test.describe("auth — 로그인 벽 + 리다이렉트 (미인증)", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });
  test("middleware-guard: 미인증 /scanner → /login?next=%2Fscanner", async ({ page }) => {
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/login\?next=%2Fscanner/);
  });
```
**적용:** 같은 describe 안에 `"public: 미인증 /privacy → 리다이렉트 없이 개인정보처리방침"`(`toHaveURL(/\/privacy$/)` + heading) · `"middleware-guard: 미인증 /privacy-x → /login?next=%2Fprivacy-x"`. baseURL :3100.

### `webapp/src/lib/native/google-client-ids.ts` (주석만)

**Analog:** 자기 자신 L12-15
```ts
 * - Android: Credential Manager 가 돌려주는 id_token 의 aud 는 **웹** 클라이언트 ID 다(21-RESEARCH A14).
 *   Android 클라이언트(패키지 `com.ghtrade.app` + debug SHA-1)는 GCP 가 앱 서명을 확인하는 데만 쓰여
 *   …
 *   release 서명 SHA-1 은 아직 미등록(스토어 서명 — Deferred).
```
**적용:** L15 를 「업로드 키 SHA-1 · Play 앱 서명 인증서 SHA-1(하이브리드면 전부)을 각각 Android OAuth 클라이언트로 등록(Phase 22 D-08). id_token aud 는 여전히 웹 — 코드 변경 없음」 으로. 상수 값·export 불변(기존 단위 테스트가 형식 잠금). SHA-1 은 공개 지문이지만 여기엔 적지 않고 콘솔 대조로 둔다(재량).

### `mobile/README.md` (docs)

**Analog:** 자기 자신 `## 기기 빌드 전 (Pitfall 15)` L62 · `## 비밀 파일` L90-92 · `## 범위 밖 (Phase 21 Deferred)` L94-100
**적용:** `## 릴리스 (Phase 22)` 절 신설(명령 3개 · 사전 조건 · 90일 만료 · versionCode 공식 · 첫 AAB 수동 업로드 · 테스터 절차) · `## 비밀 파일` 에 `~/.config/gh-trade/release/` 목록(**파일명만, 값 없음**) · Deferred 목록에서 「release 서명 자동화와 release SHA-1 등록」 제거, 「App Store · Play 스토어 제출」 → 「정식 출시·심사 · 데이터 보안/개인정보 양식」. weekly-wine `docs/android-deploy.md` 처럼 비밀번호를 문서에 적는 것 금지.

## Shared Patterns

### 비밀 비출력 · 키 이름만 보고
**Source:** `scripts/dma-credentials.sh` L21-24 · L45-58
**Apply to:** `release-*.sh` · `setup-release-secrets.sh` · Fastfile 2개(`UI.user_error!` 메시지) · `check-aab.sh`
`set -a; source "$ENV_FILE"; set +a` → 비어 있는 **키 이름**만 stderr. `set -x` 금지. 비밀을 명령줄 인자로 넘기지 않는다(keytool `:env`, gradle 은 env 직접 읽기).

### 검사 스크립트 출력 규약
**Source:** `mobile/scripts/check-sim-entitlements.sh` L12-33 · `verify-prod-config.mjs` L18 「통과: 성공 한 줄 · exit 0. 위반: 한 줄씩 `FAIL …` · exit 1」
**Apply to:** `check-ipa.sh` · `check-aab.sh` · `check-release-hygiene.sh`
헤더 주석에 「왜」(실패 시 사용자 영향) → `set -euo pipefail` → `cd "$(dirname "$0")/.."` → `<NAME> OK …` / `<NAME> FAIL — …` >&2.

### 운영 게이트 선행
**Source:** `mobile/package.json` L9 (`cap sync … && … && bash scripts/check-…`) · L16
**Apply to:** 모든 `native:release:*` — `cap sync`(양 플랫폼) → `verify-prod-config.mjs` → 래퍼 → 산출물 검사.

### 저장소 밖 산출물
**Apply to:** Fastfile 2개 · 래퍼 — `GHTRADE_RELEASE_OUT`(ios.env) 로 `.ipa`·`.dSYM.zip`·`.mobileprovision` 출력. 릴리스 뒤 `git status --porcelain mobile/` 빈 출력이 검사 기준(D-09).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `mobile/Gemfile` | config | — | 저장소에 Ruby 파일 없음. weekly-wine Gemfile 은 플랫폼별·미추적. RESEARCH Standard Stack(`gem "fastlane", "~> 2.240"`, source rubygems) 사용 |
| `mobile/android/app/build.gradle` 서명·가드 블록 | config | — | 저장소에 signingConfigs 선례 없음. weekly-wine 선례는 평문 기본값 결함 → RESEARCH Pattern 2 사용 |
| `REQUIREMENTS.md` · `ROADMAP.md` 정정 | docs | — | RESEARCH §Phase Requirements 제안 문장 그대로. ROADMAP/STATE 편집은 worktree 격리 없이 main tree |

## Metadata

**Analog search scope:** `mobile/scripts/` · `mobile/android/` · `mobile/ios/App/App/Info.plist` · `mobile/package.json` · `mobile/.gitignore` · `scripts/dma-credentials.sh` · `webapp/src/lib/supabase/` · `webapp/src/lib/__tests__/` · `webapp/src/app/{login,design}/` · `webapp/src/components/layout/center-shell.tsx` · `webapp/e2e/specs/auth-guards.spec.ts` · `webapp/src/lib/native/google-client-ids.ts` · `weekly-wine:{ios/App/fastlane,android/fastlane,.gitignore,package.json}`
**Files scanned:** 22
**Tracked-source gate:** gh-radar analog 전부 git 추적 소스. weekly-wine 은 외부 저장소 — `android/fastlane/*` 미추적 명시.
**Pattern extraction date:** 2026-09-27
