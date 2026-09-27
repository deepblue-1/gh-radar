# GH Trade 모바일 앱 (`@gh-radar/mobile`)

iOS·iPadOS·Android 네이티브 앱이다. Capacitor 8 로 만든 **Remote-URL 셸**이다(D-01).

- 앱은 운영 웹 `https://trade.jx1.io` 를 WebView 로 띄운다. 화면은 전부 웹(`webapp/`)이고, 이 패키지에는 정적 번들도 static export 도 없다.
- 네이티브가 직접 그리는 것은 하단 탭바, 당겨서 새로고침, 오프라인 폴백(`www/index.html`), 상태바·테마, Android 뒤로가기, 네이티브 Google 로그인 시트뿐이다.
- 웹 변경은 `git push`(= Vercel 프로덕션 배포)만으로 앱에 반영된다. 네이티브 코드를 고쳤을 때만 앱을 다시 빌드한다.

## 식별자

| 항목 | 값 | 출처 |
|---|---|---|
| 번들 ID / appId | `com.ghtrade.app` | 21-01 SUMMARY (D-20) |
| 앱 이름 | `GH Trade` | `capacitor.config.ts` |
| Apple 팀 | `954QPCS3F5` (개인 유료 Developer Program) | 21-01 SUMMARY |
| Google OAuth 클라이언트 | 웹·iOS·Android 3개 — 공개 상수 `webapp/src/lib/native/google-client-ids.ts` | 21-03 SUMMARY |

Google OAuth 콘솔 설정(GCP 클라이언트 3개 · Supabase Client IDs `web,ios,android` · Skip nonce checks OFF · Android debug SHA-1)은 `.planning/phases/21-gh-trade-mobile-app/21-03-SUMMARY.md` 에 기록돼 있다. 브라우저 OAuth 설정은 `webapp/SETUP.md` 에 있다.

## 요구 도구

- Xcode 27 과 iOS 시뮬레이터 런타임 26.x. 기본 기기는 `iPhone 17` · `iPad Pro 11-inch (M5)` 이고, 배포 타깃은 iOS 15 다.
- Android SDK 36(`ANDROID_HOME`), JDK 21(Android Studio JBR), AVD `Medium_Phone_API_36.1`
- Node 22 이상, pnpm. 로컬 `node_modules/.pnpm` 을 쓴다. 전역 가상 스토어는 금지다(Pitfall 17).
- CocoaPods 는 필요 없다. iOS 는 SPM 을 쓴다.

## 명령

모든 명령은 저장소 루트에서 `pnpm --filter @gh-radar/mobile run <스크립트>` 로 실행한다.

| 스크립트 | 하는 일 |
|---|---|
| `native:sync` | **운영** 동기화(`https://trade.jx1.io`, cleartext 없음). 기기 빌드 전에 반드시 실행한다. |
| `native:sync:dev` | dev 동기화(`CAP_SERVER_URL=http://localhost:3100`). 시뮬레이터·에뮬레이터 전용이다. |
| `native:build:ios` | 운영 sync → 시뮬레이터용 Debug 빌드(`ios/DerivedData`, 로컬 실행용 서명) → `SIM ENTITLEMENTS OK` 확인 |
| `native:build:android` | 운영 sync → `assembleDebug` |
| `native:smoke:ios` | dev sync → 빌드 → 시뮬레이터(`DEVICE` 이름 · 기본 `iPhone 17` 또는 `IOS_DEVICE_UDID`) 에 UDID 로 설치·실행 → 웹 `ready` 로그 확인 → 종료 시 운영 sync 복원. 여러 기기가 부팅돼 있으면 `DEVICE`/`IOS_DEVICE_UDID` 로 지정한다. 성공하면 `SMOKE OK ready platform=ios` 가 나온다. |
| `native:smoke:android` | dev sync → 빌드 → 에뮬레이터(`AVD` · `ANDROID_SERIAL`) 설치·실행 → logcat `ready` 확인 → 운영 sync 복원. 모든 adb 호출은 `adb -s <시리얼>` — 여러 기기면 `ANDROID_SERIAL` 지정 필수(없으면 실패). 성공하면 `SMOKE OK ready platform=android` 가 나온다. |
| `native:check-tab-routes:ios` | iOS 탭 경로표(`TabRoutes`)를 swiftc 로 검사한다. 성공하면 `TAB ROUTES OK` 가 나온다. |
| `native:check-external-links:ios` | iOS 인앱 브라우저 링크 판정표(`ExternalLinks`)를 swiftc 로 검사한다. 성공하면 `EXTERNAL LINKS OK` 가 나온다. |
| `native:test:android` | Android JUnit — 탭 경로표(`TabRoutesTest`) · 인앱 브라우저 링크 판정표(`ExternalLinksTest`) |
| `native:verify-prod` | 생성 설정이 운영값인지 검사한다. 성공하면 `PROD CONFIG OK` 가 나온다. 스스로 sync 하지 않는다. |
| `native:assets` | `resources/` 원본으로 아이콘·스플래시를 재생성한다(`@capacitor/assets@3.0.5`). |
| `native:open:ios` · `native:open:android` | Xcode · Android Studio 를 연다. |

## dev 절차 (시뮬레이터·에뮬레이터)

1. webapp dev 서버를 **3100** 에 띄운다: `PORT=3100 pnpm --filter @gh-radar/webapp run dev`
   - `dev.sh` 는 쓰지 않는다. 다른 세션이 쓰는 포트의 프로세스를 kill 한다.
   - 3000 을 가정하지 않는다.
2. iOS 시뮬레이터는 호스트 네트워크를 공유한다. `http://localhost:3100` 이 그대로 열린다.
3. Android 에뮬레이터의 localhost 는 에뮬레이터 자신이다. 포트를 호스트로 잇는다.
   - `adb reverse tcp:3100 tcp:3100`
   - 로컬 relay·API 를 쓰면 `adb reverse tcp:8080 tcp:8080` · `adb reverse tcp:8090 tcp:8090` 도 잇는다.
4. `pnpm --filter @gh-radar/mobile run native:sync:dev` 다음에 Xcode·Android Studio 에서 실행한다. 또는 `native:smoke:*` 를 돌린다.
5. **LAN IP(`http://192.168.x.x:3100`) dev 에서는 네이티브 로그인이 안 된다(Pitfall 16).**
   - `crypto.subtle` 은 보안 출처(https 또는 `http://localhost`)에서만 있다.
   - 운영 API CORS 와 relay 주소도 LAN 출처를 모른다.
   - 실기기는 운영 URL(웹 push 뒤)로 확인한다.
6. 끝나면 `native:sync` → `native:verify-prod` 로 운영 설정을 되돌린다.

## 기기 빌드 전 (Pitfall 15)

`cap sync` 는 설정을 gitignore 대상 생성 파일에 굽는다.

- 생성 파일: `ios/App/App/capacitor.config.json` · `android/app/src/main/assets/capacitor.config.json` · `android/capacitor-cordova-android-plugins/…/AndroidManifest.xml`
- dev sync 뒤 그대로 기기용으로 빌드하면 localhost 를 로드하고, Android 는 cleartext 허용 상태가 된다.

그래서 실기기 설치·아카이브 전에는 **반드시** 아래 순서로 실행한다.

```bash
pnpm --filter @gh-radar/mobile run native:sync
pnpm --filter @gh-radar/mobile run native:verify-prod   # PROD CONFIG OK 여야 한다
```

그다음 Xcode(서명 팀 `954QPCS3F5`) 또는 Android Studio 에서 기기를 골라 실행한다.

시뮬레이터 빌드도 서명한다. `CODE_SIGNING_ALLOWED=NO` 를 붙이면 앱에 `application-identifier` 엔타이틀먼트가 없어 Google 로그인이 키체인 오류(-34018)로 실패하고, 웹에는 「로그인 처리에 실패」만 보인다. 서명 팀은 프로젝트에 `DEVELOPMENT_TEAM = 954QPCS3F5`(자동 서명)로 들어 있다. `scripts/check-sim-entitlements.sh` 가 빌드 결과를 확인한다(`SIM ENTITLEMENTS OK`).

## 릴리스 (TestFlight · Firebase APK — Phase 22)

테스터 5명 미만에게 심사 없이 배포한다. iOS 는 TestFlight 내부 테스터로, Android 는 Firebase App Distribution 으로 보낸다(D-13).

- Claude 가 빌드·업로드 명령을 실행한다.
- 비밀은 사용자가 `!` 한 줄로 저장소 밖에 넣는다(D-06). 스크립트는 값을 화면에 찍지 않는다.

### 릴리스 명령

저장소 루트에서 `pnpm --filter @gh-radar/mobile run <스크립트>` 로 실행한다. 네 명령 모두 `cap sync`(양 플랫폼) → `native:verify-prod`(`PROD CONFIG OK`)를 먼저 돈다.

| 스크립트 | 하는 일 | 성공 표식 |
|---|---|---|
| `native:release:ios` | Release archive(App Store 프로파일) → TestFlight 업로드 → IPA 검사 | `IPA CHECK OK` |
| `native:release:android` | 업로드 키로 서명한 release APK → APK 검사 → Firebase 업로드(그룹 `ghtrade-testers`). Android 기본 경로다(D-15). | `APK CHECK OK` 다음 `App Distribution upload finished successfully` |
| `native:release:android:aab` | 서명된 AAB 만 만든다. 업로드는 없다(Play 경로 보존 · D-16). | `AAB CHECK OK` |
| `native:release:android:play` | AAB → Play 내부 테스트 트랙. **Phase 23 용**이다(Play 개발자 인증 뒤). 지금은 Play SA 키(`play-sa`)가 없어 exit 3 으로 멈춘다. | — |

보조 모드는 업로드 없이 확인만 한다(저장소 루트에서 실행).

| 명령 | 하는 일 |
|---|---|
| `bash mobile/scripts/release-ios.sh latest` | 최신 TestFlight 빌드 — `latest TestFlight build N state S`. `VALID` 면 처리 완료다. |
| `bash mobile/scripts/release-android.sh firebase-latest` | 최신 Firebase 릴리스 — `latest Firebase build N` |
| `bash mobile/scripts/release-android.sh check-apk` | 마지막 release APK 검사만(서명자 SHA-1 · versionCode · debuggable 아님 · 운영 설정) |
| `bash mobile/scripts/release-android.sh build` · `check` | AAB 빌드 · AAB 검사만. `build` 는 sync 를 하지 않으니 평소에는 `native:release:android:aab` 를 쓴다. |

래퍼 종료 코드: 2 = 모르는 모드 · 3 = env 파일·키·키스토어·SA 키가 없다(fastlane 시작 전에 멈추고 주입 명령을 안내한다).

### 처음 1회 (끝남 — 새 Mac·키 분실 때 참고)

1. **Apple** (22-01)
   - developer.apple.com → Identifiers 에 **Explicit** 번들 ID `com.ghtrade.app` 를 등록한다(Capabilities 없음).
   - App Store Connect 앱 레코드 `GH Trade` 를 만든다(한국어 · SKU `com.ghtrade.app`).
   - TestFlight 내부 그룹 `GH Trade 테스터` 를 만들고 **자동 배포**를 켠다.
2. `! bash mobile/scripts/setup-release-secrets.sh dir asc` — 비밀 디렉터리와 ASC API 키(22-01)
3. `! bash mobile/scripts/setup-release-secrets.sh keystore backup` — 업로드 키스토어 생성과 Secret Manager 백업(22-04). 키스토어가 이미 있으면 SKIP 한다.
4. **Firebase** (22-05)
   - Firebase 콘솔에서 GCP 프로젝트 `gh-radar` 에 Firebase 를 추가한다(D-17 · Analytics 끔).
   - Android 앱 `com.ghtrade.app` 을 등록한다. **SHA-1 칸은 비운다.** `google-services.json` 은 받지 않는다(앱 안에 Firebase SDK 없음).
   - App Distribution 에서 **「시작하기」** 를 누른다.
   - 테스터 및 그룹에서 그룹 `ghtrade-testers` 를 만든다.
   - Firebase Android 앱 ID 는 `android/fastlane/Fastfile` 상수 `GHTRADE_FIREBASE_ANDROID_APP_ID` 에 있다.
5. `! bash mobile/scripts/setup-release-secrets.sh firebase-sa` — 업로드 전용 SA `gh-trade-appdistro` 의 키(22-05). 역할은 App Distribution 관리자 하나뿐이다.
6. **GCP Android OAuth 클라이언트** (22-05)
   - GCP 콘솔(gh-radar) → Google Auth Platform → 클라이언트 → Android 클라이언트 `GH Trade Android (upload key)`
   - 패키지 `com.ghtrade.app` + 업로드 키 SHA-1(`check-apk` 출력과 같다)
   - 기존 debug 클라이언트와 Supabase Client IDs 는 그대로 둔다. id_token 의 aud 는 웹 클라이언트다.
7. **OAuth 동의 화면 게시 상태** — Google Auth Platform → 대상(Audience)
   - 2026-09-27 현재 **테스트** 다. 테스터 Google 계정마다 테스트 사용자로 넣어야 로그인된다.
   - 「프로덕션」 이면 할 일이 없다.

### 업데이트 (D-03 · D-15)

- **빌드 번호는 자동이다.** 저장소 파일에 쓰지 않는다. 릴리스 뒤 `git status mobile/` 가 비어 있어야 한다.
  - iOS `CFBundleVersion` = `YYYYMMDDHHMM`
  - Android `versionCode` = `(연도−2020)·10^8 + MMDDHHmm`. 상한 2,100,000,000 안에서 2040년 말까지 쓴다.
- **플랫폼마다 명령 한 번:** `native:release:ios` · `native:release:android`
- **iOS:** 처리가 끝나면(`release-ios.sh latest` 가 `VALID`) TestFlight 가 내부 그룹에 자동 배포한다.
- **Android:** Firebase 가 테스터에게 「새 빌드」 메일(App Tester 알림)을 보낸다. 테스터가 탭해 덮어 설치한다. 자동 업데이트는 아니다.
- **만료:** TestFlight 빌드는 90일, Firebase 빌드는 150일 뒤 사라진다. 그 전에 새 빌드를 올린다.
- 같은 분에 두 번 올리지 않는다. 번호가 같아 거절되거나 구분되지 않는다. 1분 뒤 다시 한다.
- iOS·Android 명령을 동시에 돌리지 않는다. 둘 다 `cap sync` 로 같은 생성 파일을 다시 쓴다.
- 마케팅 버전 `1.0` 은 올리고 싶을 때만 손으로 바꾼다(iOS `MARKETING_VERSION` · Android `versionName`).

### 릴리스 비밀 파일

`~/.config/gh-trade/release/`(700) 아래 파일은 모두 600 이다. 여기에는 파일 이름만 적는다. 값·키 ID·비밀번호·SA 이메일은 적지 않는다.

| 파일 | 용도 | 만든 단계 |
|---|---|---|
| `ios.env` | ASC API 키 경로·식별 변수 · iOS 산출 경로 | `asc` |
| `AuthKey_{KEYID}.p8` | App Store Connect API 키 | `asc` |
| `android.env` | 업로드 키스토어 경로·비밀번호·alias·SHA-1 변수 | `keystore` |
| `ghtrade-upload.jks` | Android 업로드 키스토어(PKCS12) | `keystore` |
| `firebase-appdistro-service-account.json` | Firebase 업로드 SA `gh-trade-appdistro` 키 | `firebase-sa` |

- iOS 산출물(IPA · dSYM · 프로파일)은 `~/Library/Developer/gh-trade-release/ios/` 에 둔다. Android APK·AAB 는 ignore 되는 `android/app/build/outputs/` 아래에 생긴다.
- Secret Manager 백업(gh-radar)은 `gh-radar-ghtrade-upload-keystore` · `gh-radar-ghtrade-upload-keystore-password` · `gh-radar-ghtrade-asc-api-key` 세 개다.
- Firebase SA 키는 백업하지 않는다. 잃으면 새 키를 발급하고 옛 키를 GCP 에서 지운다.
- **업로드 키스토어는 절대 새로 만들지 않는다.** 서명이 바뀌면 테스터 폰의 Firebase 설치본이 업데이트되지 않고, Phase 23 Play 업로드 키도 깨진다. 잃으면 Secret Manager 에서 되살린다.

### 문제 해결

| 증상 | 조치 |
|---|---|
| Android 로그인 실패 `[28444]` · `DEVELOPER_ERROR` | 기기를 연결해 `adb logcat -d -s GoogleProvider` 의 `signingSha1` 을 GCP Android 클라이언트(업로드 키 SHA-1)와 대조한다. 새 클라이언트는 반영에 수 분~수 시간 걸릴 수 있으니 10분 간격으로 다시 해 본다. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` · 「앱이 설치되지 않았습니다」 | 개발판(debug) GH Trade 를 먼저 삭제한다. 서명이 달라 덮어 설치가 안 된다. |
| Firebase `INVALID_APP_ID` | Firebase 콘솔 → App Distribution 에서 「시작하기」 를 누른다. |
| 업로드 로그에 `Application Default Credentials` 인증 줄 | 멈춘다. 전용 SA 자격 명시가 깨진 것이다. 정상은 `Authenticating with --service_credentials_file` 이다. |
| sigh 권한 오류(App Store 프로파일 생성 실패) | Apple Developer 포털에서 `com.ghtrade.app` App Store 프로파일을 손으로 만든 뒤 다시 한다. |
| ITMS-91053 경고 메일 | 기록만 한다. Privacy manifest 는 Deferred 다. |
| 업로드 로그의 「link expires in 1 hour」 다운로드 링크 | 공유하지 않는다. 테스터는 초대 메일·App Tester 로만 받는다. |

### 테스터 초대 (운영자)

본인 기기에서 설치·Google 로그인이 된 것을 확인한 뒤에만 초대한다. 이메일은 콘솔에만 넣고 저장소에 적지 않는다.

- **Android:** Firebase 콘솔 → App Distribution → 테스터 및 그룹 → `ghtrade-testers` 에 테스터 Google 계정을 추가한다.
- **iPhone:** App Store Connect → 사용자 및 액세스 → 「+」 → 역할 **Marketing** · 앱 액세스 **GH Trade 만**. Developer 역할은 인증서 접근이 붙으므로 쓰지 않는다. 테스터가 수락하면 TestFlight 내부 그룹 `GH Trade 테스터` 에 추가한다.
- **OAuth 동의 화면이 「테스트」 면:** Google Auth Platform → 대상 → 테스트 사용자에 테스터 Google 계정을 추가한다.
- 트레이딩 권한(`dma_credentials`)은 누구에게도 주지 않는다(D-04).

### 테스터 안내

아래 문구를 테스터에게 그대로 보낸다.

> **iPhone (3단계)**
>
> 1. App Store Connect 초대 메일을 3일 안에 수락해 주세요.
> 2. App Store 에서 TestFlight 앱을 깔고, GH Trade 초대를 수락해 주세요.
> 3. TestFlight 에서 GH Trade 를 설치해 주세요. 새 버전이 나오면 TestFlight 가 알려 줍니다.
>
> 단계가 셋인 이유: 심사 없이 받는 TestFlight 내부 테스터는 App Store Connect 팀 사용자여야 합니다. 권한은 가장 낮은 Marketing 이고 GH Trade 앱만 볼 수 있습니다.
>
> **Android**
>
> 1. 예전에 받은 개발판 GH Trade 가 있으면 먼저 삭제해 주세요.
> 2. Firebase 초대 메일을 열고 Google 계정으로 로그인해 초대를 수락해 주세요(30일 안 · 한 번만).
> 3. (선택) 안내에 나오는 App Tester 앱을 깔면 새 버전 알림을 앱에서 받습니다.
> 4. 브라우저(또는 App Tester)에 「출처를 알 수 없는 앱 설치」 를 허용한 뒤 다운로드해 설치해 주세요. Play 프로텍트 경고가 뜨면 「그래도 설치」 를 누르고, 그 화면을 캡처해 보내 주세요.
>
> 새 버전이 나오면 메일(또는 App Tester) 알림을 탭해 덮어 설치하면 됩니다. 삭제하지 않아도 됩니다.
>
> **공통**
>
> - 로그인은 Google 계정으로 합니다.
> - 트레이딩 탭은 안내 화면만 보이는 것이 정상입니다.
> - APK 파일을 메신저·드라이브로 주고받지 말아 주세요. 설치는 초대 메일로만 합니다.
>
> **Android 참고**
>
> - 이 설치 방식은 Play 개발자 인증 전까지 쓰는 임시 경로입니다. Google 의 사이드로드 개발자 인증이 2027년 전 세계로 확대되면 이 방식으로는 설치가 막힐 수 있습니다(2026-09-27 확인).
> - 나중에 Play 스토어로 옮기면 서명이 달라져 한 번 삭제한 뒤 Play 에서 다시 설치해야 합니다. 다시 로그인하는 것 말고 잃는 것은 없습니다.

## 버전을 올릴 때 (Pitfall 17)

Capacitor CLI 는 플러그인 경로를 pnpm 실경로(`node_modules/.pnpm/@capacitor+…`)로 계산한다. 이 경로는 `ios/App/CapApp-SPM/Package.swift` · `android/capacitor.settings.gradle` 에 들어간다. 경로에 버전이 들어가므로 Capacitor·플러그인 버전을 올리면 다음을 한다.

1. `pnpm --filter @gh-radar/mobile exec cap sync` 로 SPM·Gradle 경로를 재생성한다.
2. 바뀐 `Package.swift` · `Package.resolved` · `capacitor.settings.gradle` 을 커밋한다.

- `@capgo/capacitor-social-login` 의 `capacitor:sync:before` 훅은 pnpm 저장소 안 자기 `Package.swift`·`gradle.properties` 를 고친다. 새 클론·`pnpm install` 뒤에는 빌드 전에 sync 가 필요하다. `native:build:*` 가 sync 를 먼저 돌린다.
- SPM 해석이 키체인 프롬프트에서 멈추면 `ios/App/CapApp-SPM` 에서 `swift package resolve --disable-keychain` 를 한 번 돌린다. 그다음 그 폴더에 생긴 `.build`·`Package.resolved` 는 지운다. 커밋 대상은 앱 워크스페이스의 `Package.resolved` 다.

## 비밀 파일

서명 키(`*.jks` · `*.keystore` · `*.p12` · `*.mobileprovision`)는 커밋하지 않는다(T-21-14). Android debug 키는 `~/.android/debug.keystore` 를 쓴다.

릴리스 비밀(ASC API 키 · 업로드 키스토어 · Firebase SA 키)은 `~/.config/gh-trade/release/` 에만 있다. 저장소에는 경로와 변수 이름만 있다(위 「릴리스 비밀 파일」).

`bash mobile/scripts/check-release-hygiene.sh` 로 비밀 파일 권한(700/600) · git ignore · `google-services.json` 부재를 확인한다. `RELEASE HYGIENE OK` 가 나와야 한다.

## 범위 밖 (Phase 21 · 22 Deferred)

- 스토어 정식 출시·심사 · TestFlight 외부 테스터 · Play 스토어 배포(Phase 23 — Play 개발자 인증 뒤) · Play 비공개/공개 테스트 · Play 데이터 보안 양식 · App Store 앱 개인정보 양식(D-12)
- 앱 안 계정 삭제(App Store 가이드라인 5.1.1(v)) — 정식 심사 때
- 푸시 알림
- 딥링크 · 유니버설 링크
- Privacy manifest(ITMS-91056) 점검 — 스토어 제출 때 한다.
