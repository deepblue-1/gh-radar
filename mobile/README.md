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
| `native:smoke:ios` | dev sync → 빌드 → `iPhone 17` 설치·실행 → 웹 `ready` 로그 확인 → 종료 시 운영 sync 복원. 성공하면 `SMOKE OK ready platform=ios` 가 나온다. |
| `native:smoke:android` | dev sync → 빌드 → 에뮬레이터 설치·실행 → logcat `ready` 확인 → 운영 sync 복원. 성공하면 `SMOKE OK ready platform=android` 가 나온다. |
| `native:check-tab-routes:ios` | iOS 탭 경로표(`TabRoutes`)를 swiftc 로 검사한다. 성공하면 `TAB ROUTES OK` 가 나온다. |
| `native:test:android` | Android 탭 경로표 JUnit(`TabRoutesTest`) |
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

## 버전을 올릴 때 (Pitfall 17)

Capacitor CLI 는 플러그인 경로를 pnpm 실경로(`node_modules/.pnpm/@capacitor+…`)로 계산한다. 이 경로는 `ios/App/CapApp-SPM/Package.swift` · `android/capacitor.settings.gradle` 에 들어간다. 경로에 버전이 들어가므로 Capacitor·플러그인 버전을 올리면 다음을 한다.

1. `pnpm --filter @gh-radar/mobile exec cap sync` 로 SPM·Gradle 경로를 재생성한다.
2. 바뀐 `Package.swift` · `Package.resolved` · `capacitor.settings.gradle` 을 커밋한다.

- `@capgo/capacitor-social-login` 의 `capacitor:sync:before` 훅은 pnpm 저장소 안 자기 `Package.swift`·`gradle.properties` 를 고친다. 새 클론·`pnpm install` 뒤에는 빌드 전에 sync 가 필요하다. `native:build:*` 가 sync 를 먼저 돌린다.
- SPM 해석이 키체인 프롬프트에서 멈추면 `ios/App/CapApp-SPM` 에서 `swift package resolve --disable-keychain` 를 한 번 돌린다. 그다음 그 폴더에 생긴 `.build`·`Package.resolved` 는 지운다. 커밋 대상은 앱 워크스페이스의 `Package.resolved` 다.

## 비밀 파일

서명 키(`*.jks` · `*.keystore` · `*.p12` · `*.mobileprovision`)는 커밋하지 않는다(T-21-14). Android debug 키는 `~/.android/debug.keystore` 를 쓴다.

## 범위 밖 (Phase 21 Deferred)

- App Store · Play 스토어 제출
- release 서명 자동화와 release SHA-1 등록
- 푸시 알림
- 딥링크 · 유니버설 링크
- Privacy manifest(ITMS-91056) 점검 — 스토어 제출 때 한다.
