# Phase 22: GH Trade 테스트 배포 (iOS TestFlight · Android Play 내부 테스트) - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 21 의 GH Trade 앱(Capacitor Remote-URL 셸 · appId `com.ghtrade.app` · 운영 URL `https://trade.jx1.io`)을 **5명 미만의 지인이 자기 iPhone·Android 폰에 설치해 써 볼 수 있게** 테스트 배포한다.

- **iOS:** App Store Connect 앱 레코드 생성 → 배포 서명 → Release archive → **TestFlight 내부 테스터** 배포(심사 없음).
- **Android:** 업로드 키 생성·보관(저장소 밖) → 서명된 AAB → Play Console 앱 생성 → **내부 테스트 트랙** 배포(심사 없음).
- **공통:** 릴리스 빌드에서 네이티브 Google 로그인 유지(Android 릴리스·Play 앱 서명 SHA-1 등록) · 반복 가능한 빌드·업로드 절차(fastlane) · 버전 규칙 · `native:verify-prod` 게이트 · 개인정보처리방침 `/privacy` 페이지.

**범위 밖:** 스토어 정식 출시·심사 대응 · TestFlight 외부 테스터(베타 심사) · Play 비공개/공개 테스트 · **Play 데이터 보안 양식 · App Store 앱 개인정보 양식(사용자 결정으로 정식 출시 phase 로 이연 — ROADMAP.md 의 「범위 안」 문구 정정 필요)** · 푸시 알림 · 딥링크/유니버설 링크 · 결제 · 웹 화면 변경(`/privacy` 공개 라우트 1개 추가만 예외).

**REQUIREMENTS.md:** MOBILE-02 로 정의 예정(plan-phase 에서). Out of Scope 「스토어 제출」 행을 「정식 출시·심사」 로 정정하고, 테스트 배포는 범위 안으로 옮긴다.

</domain>

<decisions>
## Implementation Decisions

### 계정 · 테스터 범위
- **D-01:** Apple Developer Program 유료 멤버십(팀 `954QPCS3F5`)과 Google Play Console 개발자 계정은 **둘 다 보유**(2026-09-27 사용자 확인). 계정 개설 태스크 불필요. App Store Connect 앱 레코드와 Play 앱은 아직 없으므로 생성은 이 phase 에서 한다.
- **D-02:** 테스터 = **5명 미만 지인**. 배포 경로는 **iOS TestFlight 내부 테스터 + Play 내부 테스트 트랙**. 둘 다 심사가 없고 테스터 설치 절차는 「초대 수락 → TestFlight 앱/Play 스토어 → 설치」 뿐이다. 외부 테스터·공개 링크는 준비하지 않는다. 테스터 이메일(Apple ID · Google 계정)은 사용자가 콘솔에 수기 등록한다. — **Reversibility:** reversible — 외부 테스터 그룹은 나중에 추가만 하면 된다(단 Beta App Review 가 붙는다).
  - *리서치 메모(2026-09-27 · 22-RESEARCH Pitfall 6):* TestFlight 내부 테스터는 App Store Connect 팀 사용자여야 한다 → 테스터 절차는 「ASC 초대 수락(Marketing 역할 · GH Trade 앱 한정) → TestFlight 초대 → 설치」 **3단계**. 심사 없는 경로는 이것뿐이므로 D-02 유지. 개인 멤버십의 ASC 사용자 추가 가능 여부는 [ASSUMED] — 불가로 드러나면 D-02 재논의.
- **D-03:** 업데이트 절차는 「빌드 번호 올리고 빌드·업로드」 만. TestFlight 는 내부 그룹에 자동 배포(빌드 90일 만료 — 절차 문서에 명시), Play 는 스토어 자동 업데이트(versionCode 증가 필수).

### 테스터 권한 · 로그인 허용
- **D-04:** **트레이딩 접근은 지금 그대로 — 코드 변경 없음.** 누구나 `/trading` 에 진입하지만 relay 가 `dma_credentials` 행이 없는 사용자에게 `unauthorized` 상태를 보내 시세 구독·주문을 거부하고 웹은 `DmaGate` 안내만 보여 준다. 테스터에게는 `dma_credentials` 행을 발급하지 않는다. 실돈 발주는 사용자 본인 계정만 가능. 탭 숨김·역할 allow-list 는 채택하지 않음. — **Reversibility:** reversible.
- **D-05:** **Google 로그인 허용은 현재 설정 유지.** 운영 웹과 같은 OAuth 클라이언트를 쓰므로 변경 없음. GCP OAuth 동의 화면이 「테스트」 상태면 테스터 이메일을 테스트 사용자 목록에 추가(사용자 콘솔 작업), 「프로덕션」이면 할 일 없음. **플랜에 「동의 화면 게시 상태 확인」 태스크를 넣는다.** Supabase 가입 제한(hook · trigger · allow-list)은 추가하지 않는다.

### 빌드 · 서명 · 업로드 절차
- **D-06:** **실행 주체 = Claude.** Claude 가 스크립트·Fastfile 을 만들고 빌드·업로드까지 실행한다. 비밀(업로드 키스토어 비밀번호 · App Store Connect API 키 `.p8` · Play 서비스 계정 JSON)은 기존 관례대로 **사용자가 `! bash …` 한 줄로 저장소 밖 파일에 주입**한다. Xcode 계정 로그인(팀 `954QPCS3F5`)은 이미 되어 있어 재사용.
- **D-07:** **도구 = fastlane.** `/Users/alex/repos/weekly-wine-app` 의 검증된 Fastfile 2개(`ios/App/fastlane/Fastfile` lane `beta` · `android/fastlane/Fastfile` lane `beta`)를 복사해 식별자(`com.ghtrade.app`)·비밀 경로만 바꾼다. 같은 Apple 팀이므로 **App Store Connect API 키를 재사용**하고, Play 도 같은 개발자 계정이면 기존 서비스 계정에 GH Trade 앱 권한만 부여한다. `mobile/package.json` 에 `native:release:ios` · `native:release:android` 스크립트로 감싼다. Ruby·bundler 는 `/opt/homebrew/opt/ruby` 경로(weekly-wine 과 동일). **weekly-wine 의 결함은 따라 하지 않는다:** build.gradle 의 키스토어 비밀번호 평문 기본값 금지, 문서에 비밀번호 기재 금지. — **Reversibility:** reversible — 쉘 스크립트로 바꿔도 산출물(archive · AAB)은 같다.
  - *리서치 메모(2026-09-27 · 22-RESEARCH Pattern 1·3 · Pitfall 2·3·9):* weekly-wine Fastfile 에서 따라 하지 않을 것 3건 추가 — ① `increment_build_number`(Info.plist·pbxproj 를 리터럴로 덮어씀 → `xcargs CURRENT_PROJECT_VERSION=` 주입) ② `get_provisioning_profile(readonly: true)`(GH Trade 프로파일이 없어 첫 실행 실패 → `readonly: false`) ③ Android lane 의 versionCode 미증가(→ `-PghtradeVersionCode=` 주입). weekly-wine 에서 검증된 것은 iOS 경로뿐(Android lane 실행 흔적 없음). **Play 서비스 계정 JSON 은 존재하지 않아 새로 만든다**(재사용은 ASC API 키 · Apple Distribution 인증서만). fastlane 은 `mobile/Gemfile` 하나(2.240.x · Homebrew Ruby 4.0.2)로 `ios/App`·`android` 가 공유. 첫 Play 릴리스는 콘솔에서 내부 테스트 출시까지 수동(supply 의 draft-app 오류 회피).
- **D-08:** **Android 서명 = Play 앱 서명 + 업로드 키.** Google 이 앱 서명 키를 보관하고, 우리는 업로드 키스토어만 생성해 **홈 디렉터리(`~/.config/gh-trade/` 같은 저장소 밖 경로)** 에 두고 비밀번호는 환경변수 파일로 읽는다. **GCP Secret Manager 에 백업 1본**(쓰기는 사용자 `!` 실행). GCP OAuth 에는 **업로드 키 SHA-1 과 Play 앱 서명 키 SHA-1 을 각각 Android 클라이언트로 추가 등록**한다(id_token 은 web 클라이언트로 발급되므로 코드 변경 없음). — **Reversibility:** one-way — Play 앱 서명은 첫 업로드 뒤 해제할 수 없고, 업로드 키 분실 시 Google 에 재설정을 요청해야 한다.
  - *리서치 메모(2026-09-27 · 22-RESEARCH Pitfall 5):* 신규 Play 앱은 「양자 대비 하이브리드 서명」(키 3개)이 기본이라 Google 로그인 `DEVELOPER_ERROR` 미해결 사례가 있다 → 첫 수동 업로드의 서명 키 선택에서 **고전 Google 생성 키를 고를 수 있으면 선택**(내부 테스트 단계에서는 키 변경 가능 → one-way 는 공개 테스트·프로덕션 전까지 완화), 「Download certificates」 의 **앱 서명 인증서 전부**의 SHA-1 + 업로드 키 SHA-1 을 각각 Android 클라이언트로 등록, Play 설치본에서 `adb logcat -s GoogleProvider` 의 `signingSha1` 을 등록값과 대조하는 UAT 를 둔다.
- **D-09:** **버전 규칙 = 마케팅 버전 1.0 고정 · 빌드 번호 = 타임스탬프.** fastlane 이 빌드 시점에 iOS `CFBundleVersion` 을 `YYYYMMDDHHMM` 으로, Android `versionCode` 를 단조 증가 정수(상한 2,100,000,000 을 넘지 않는 `YYMMDDHHmm` 형태)로 설정한다. 저장소의 `MARKETING_VERSION` · `versionName` 은 사용자가 올리고 싶을 때만 수동 변경. 빌드 번호를 커밋하지 않는다.
- **D-09a (2026-09-27 리서치 정정 · 의도 동일):** Android `versionCode` 의 `YYMMDDHHmm` 표기는 2026년에 이미 26억대(`2609270049`)라 Play 상한 2,100,000,000 을 넘는다(22-RESEARCH Pitfall 1). 공식은 **`(연도−2020)·10^8 + MMDDHHmm`** — 2026-09-27 00:49 → `609270049`, 2040-12-31 23:59 → `2012312359` < 상한, 연도 증가분 10^8 > MMDDHHmm 최대값(12,312,359)이라 단조 증가. iOS `CFBundleVersion` = `YYYYMMDDHHMM` 은 그대로. 두 값 모두 lane 이 계산해 `xcargs CURRENT_PROJECT_VERSION=` · `-PghtradeVersionCode=` 로 주입하고 저장소 파일(Info.plist · pbxproj · build.gradle)은 바꾸지 않는다 — 릴리스 후 `git status --porcelain mobile/` 가 비어 있어야 한다. — **Reversibility:** reversible — 업로드된 값보다 큰 값이면 공식을 바꿔도 된다.
- **D-10:** Play 첫 AAB 는 정책상 콘솔 수동 업로드 1회(사용자), 이후 fastlane 자동. iOS 첫 업로드는 fastlane 으로 가능하되 앱 레코드 생성은 사용자 콘솔 작업(또는 fastlane `produce`).

### 스토어 최소 자료
- **D-11:** **개인정보처리방침 = 웹앱 공개 라우트 `/privacy`**(`https://trade.jx1.io/privacy`). 미들웨어 공개 prefix(`/login` · `/auth`)에 `/privacy` 를 추가해 로그인 없이 열리게 한다. Claude 가 코드 기준으로 수집 항목(Google 계정 이메일·프로필 · 관심종목·채팅 기록 · DMA 계정 정보 · 오프라인 폴백 등)을 확인해 **한글 초안** 을 쓰고 사용자가 검토한 뒤 배포한다. 이 웹 변경은 브라우저 사용자에게도 배포된다(`git push` = Vercel 배포 · relay 결합 없음 확인 필요).
- **D-12:** **Play 데이터 보안 양식 · App Store 앱 개인정보 양식은 이번에 채우지 않는다.** 내부 테스트에 필수가 아니므로 정식 출시 phase 로 이연. ROADMAP.md Phase 22 「범위 안」 3번째 항목의 「Play 데이터 보안 양식」 문구를 plan-phase 에서 정정한다.

### Claude's Discretion
- `native:verify-prod` 를 fastlane lane 앞단 게이트로 실행(sync 뒤 · 실패 시 중단). dev URL·cleartext 가 섞인 빌드가 업로드되지 않게 한다.
- `.gitignore` 보강: `*.p12` · `*.mobileprovision` · `key.properties` · `AuthKey*.p8` · `play-store-key.json` · `*.aab` · `*.ipa` · fastlane `report.xml`/`.env.default`.
- 앱 레코드 생성값: 앱 이름 **GH Trade** · 기본 언어 **한국어** · 아이콘 = `native:assets` 산출물 재사용 · SKU `com.ghtrade.app` · 스크린샷 생략(내부 테스트 불필요) · iOS 수출 규정 = HTTPS 만 사용(면제, `ITSAppUsesNonExemptEncryption = NO` 를 Info.plist 에 추가해 매 빌드 질문 생략).
- iOS 서명 방식(자동 서명 archive + App Store 프로파일 export — weekly-wine 방식) · Release 설정에 Debug 와 다른 값이 필요한지(현재 동일) · PrivacyInfo.xcprivacy 필요 여부(ITMS-91056 경고 — TestFlight 업로드는 통과하므로 경고만 기록).
- 릴리스 절차 문서 위치(`mobile/README.md` 「릴리스」 절 추가 vs `mobile/RELEASE.md` 신설).
- 테스터 안내문(초대 수락 → TestFlight 설치 → 설치 · Play 참여 링크) 작성 여부.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 21 산출물 (현재 앱 상태의 정본)
- `.planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md` — D-01 Remote-URL 셸 · D-03 네이티브 Google 로그인 · D-20 appId/표시명 · 범위 밖·Deferred 목록
- `.planning/phases/21-gh-trade-mobile-app/21-36-SUMMARY.md` — 운영 빌드·설치 절차(sync → verify-prod → push 게이트 → 빌드 → 설치). Release·archive·업로드는 없음
- `mobile/README.md` — `native:*` 명령 · 「기기 빌드 전」 절 · 「비밀 파일」 절 · Deferred 목록(release 서명 자동화 · release SHA-1 · Privacy manifest)
- `.planning/quick/260926-v5n-*/260926-v5n-SUMMARY.md` · `.planning/quick/260926-vk9-*/260926-vk9-SUMMARY.md` — 실기기 iPhone 16(mesya) 자동 서명 빌드·devicectl 설치 이력

### 현재 설정 (수정 대상)
- `mobile/capacitor.config.ts` — `server.url` · appId · SocialLogin 플러그인 설정
- `mobile/package.json` — `native:*` 스크립트(여기에 `native:release:*` 추가) · `@capgo/capacitor-social-login` 8.5.11
- `mobile/scripts/verify-prod-config.mjs` — 릴리스 게이트로 재사용할 검사 항목
- `mobile/ios/App/App.xcodeproj/project.pbxproj` — `DEVELOPMENT_TEAM = 954QPCS3F5` · `CODE_SIGN_STYLE = Automatic` · `MARKETING_VERSION = 1.0` · `CURRENT_PROJECT_VERSION = 1`
- `mobile/ios/App/App/Info.plist` — Google URL scheme · 버전 변수 참조(`ITSAppUsesNonExemptEncryption` 추가 위치)
- `mobile/android/app/build.gradle` — `versionCode 1` · `versionName "1.0"` · release `signingConfigs` 없음(추가 대상)
- `mobile/.gitignore` · `mobile/android/.gitignore` — `*.jks`/`*.keystore` 만 있음(보강 대상)
- `webapp/src/lib/native/google-client-ids.ts` — web/iOS/Android OAuth 클라이언트 ID · 「release SHA-1 미등록」 주석(갱신 대상)
- `webapp/src/lib/native/native-google-login.ts` — id_token 이 web 클라이언트로 발급됨(코드 변경 불필요 근거)
- `webapp/src/lib/supabase/middleware.ts` — 공개 prefix `/login` · `/auth`(`/privacy` 추가 위치)
- `relay/src/store/credentials.ts` · `relay/src/ws/fanout.ts` — `dma_credentials` 행 = allow-list(D-04 근거)

### 참조 구현 (복사 원본)
- `/Users/alex/repos/weekly-wine-app/ios/App/fastlane/Fastfile` — lane `beta`: ASC API 키 · 타임스탬프 빌드 번호 · `get_provisioning_profile` · `build_app`(app-store export) · `upload_to_testflight`
- `/Users/alex/repos/weekly-wine-app/android/fastlane/Fastfile` · `Appfile` — lane `beta`: `gradle bundle Release` · `upload_to_play_store(track: internal)` · 서비스 계정 JSON 경로
- `/Users/alex/repos/weekly-wine-app/docs/android-deploy.md` — Play 서비스 계정 발급 절차 · 첫 AAB 수동 업로드 1회 규칙(비밀번호 기재 부분은 따라 하지 않음)
- `/Users/alex/repos/weekly-wine-app/package.json` — `fastlane:*` 스크립트 · Ruby PATH 관례
- `/Users/alex/repos/weekly-wine-app/.gitignore` — fastlane 비밀·산출물 ignore 패턴

### 관례
- `CLAUDE.md`(루트) 커밋 규칙 · 메모리 「비밀 주입은 사용자 `!` 실행」 · 「배포는 relay 먼저·push 나중」(`/privacy` 웹 변경 push 시 적용)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mobile/scripts/verify-prod-config.mjs`: 생성된 `capacitor.config.json` 2개·Android 매니페스트·Info.plist 를 검사. fastlane lane 앞단 게이트로 그대로 호출.
- `mobile/scripts/check-sim-entitlements.sh`: 시뮬레이터 entitlements 검사 — 릴리스 archive 의 entitlements 검사로 변형 가능.
- `native:assets` 산출물(iOS AppIcon 1024 · Android adaptive icon): 스토어 앱 레코드 아이콘 그대로.
- weekly-wine Fastfile 2개 + `Gemfile`: 복사 원본.

### Established Patterns
- 비밀 파일은 저장소 밖 + 사용자 `!` 실행 주입. Android debug 키는 `~/.android/debug.keystore`.
- `git push` = webapp 프로덕션 배포. `/privacy` 추가 시 relay 결합 없음을 확인하고 push.
- iOS 실기기 빌드는 scratchpad DerivedData + 자동 서명(팀 `954QPCS3F5`) + `devicectl` 설치(quick v5n·vk9). Release archive 도 저장소 밖 산출 경로를 쓴다.
- Release 빌드 설정이 Debug 와 동일 — `webContentsDebuggingEnabled` 등은 verify-prod 가 이미 금지.

### Integration Points
- `mobile/android/app/build.gradle` release `signingConfigs` ← 환경변수(`GHTRADE_UPLOAD_STORE_FILE` 등) · 기본값 없음.
- `mobile/package.json` `native:release:ios|android` → `native:sync` → `native:verify-prod` → `bundle exec fastlane beta`.
- GCP OAuth Android 클라이언트 2개 추가(업로드 키 SHA-1 · Play 앱 서명 SHA-1) — 코드 변경 없음, `google-client-ids.ts` 주석만 갱신.
- `webapp/src/app/privacy/page.tsx` 신설 + `webapp/src/lib/supabase/middleware.ts` 공개 prefix 추가.
- App Store Connect · Play Console 콘솔 작업(앱 레코드 · 테스터 등록 · 서비스 계정 권한 · 첫 AAB 수동 업로드 · OAuth 테스트 사용자)은 사용자 태스크로 플랜에 명시.

</code_context>

<specifics>
## Specific Ideas

- 「사용할 사람은 5명 미만인데, 설치 절차가 복잡하거나 그런 건 싫어서」 — 테스터 쪽 절차는 초대 수락 · 앱 설치 두 단계를 넘지 않게.
- 「weekly-wine-app 은 어떻게 했어?」 — 검증된 fastlane 구성을 그대로 가져오되 비밀번호 평문·문서 기재만 제거.
- 테스터의 실돈 발주 경로 차단은 기존 `dma_credentials` allow-list 로 충분(사용자 확인).

</specifics>

<deferred>
## Deferred Ideas

- **Play 데이터 보안 양식 · App Store 앱 개인정보 양식(nutrition label)** — 정식 출시 phase. 이때 `/privacy` 초안의 수집 항목 목록을 재사용.
- **TestFlight 외부 테스터 · Play 비공개/공개 테스트** — 심사(Beta App Review · Play 심사)가 붙으므로 정식 출시 phase 와 함께.
- **PrivacyInfo.xcprivacy(ITMS-91056)** — Phase 21 Deferred 유지. TestFlight 업로드 시 경고가 나오면 기록만.
- 푸시 알림 · 딥링크/유니버설 링크 — Phase 21 Deferred 유지.

</deferred>

---

*Phase: 22-gh-trade-ios-testflight-android-play*
*Context gathered: 2026-09-27*
