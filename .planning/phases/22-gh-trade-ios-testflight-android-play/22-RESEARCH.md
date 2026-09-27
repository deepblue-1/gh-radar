# Phase 22: GH Trade 테스트 배포 (iOS TestFlight · Android Play 내부 테스트) - Research

> **2026-09-27 재범위:** Android 경로는 Play 내부 테스트 대신 Firebase App Distribution APK 로 바뀌었다(CONTEXT D-13~D-18). 남은 작업(Android Firebase + 옛 22-05~07 의 iOS·공통 항목)은 이 문서 끝 **「재범위 부록: Android Firebase App Distribution APK (2026-09-27)」** 를 먼저 읽는다. 아래 본문의 Play 관련 내용(Pattern 3 `beta` · Pitfall 5·9·10 · MOBILE-02m)은 Phase 23 에서 쓴다.

**Researched:** 2026-09-27
**Domain:** 모바일 릴리스 엔지니어링. 범위는 fastlane(gym·sigh·pilot·supply), App Store Connect · TestFlight 내부 테스트, Play App Signing · 내부 테스트 트랙, Google OAuth Android 클라이언트, Next.js 공개 라우트 `/privacy` 다.
**Confidence:** 신뢰도는 세 등급이다.
- **HIGH:** 이번 세션에 직접 읽거나 실측한 것 — 저장소 파일, weekly-wine 소스, fastlane 2.232.2 로컬 소스와 2.240.1 GitHub 소스, `xcodebuild -help`, 키체인 인증서, rubygems API.
- **MEDIUM:** Apple · Google 공식 도움말 인용과 콘솔 절차.
- **LOW:** Play 양자 대비 하이브리드 서명과 Google 로그인의 상호작용, TestFlight 업로드에서 ITMS-91053 을 실제로 강제하는지 여부.

> **이 문서의 가장 중요한 발견 8가지** (플래너가 먼저 읽을 것)
> 1. **D-09 의 Android `versionCode` = `YYMMDDHHmm` 은 상한을 넘는다.** 2026-09-27 00:49 는 `2609270049` 로, Play 상한 `2100000000` 보다 크다. 권장 공식은 `(연도−2020)×10^8 + MMDDHHmm` 이다. 예시 값은 `609270049` 이고 2040-12-31 까지 상한 안이며 단조 증가한다. D-09 의 의도(타임스탬프 · 상한 이하 · 커밋 없음)는 그대로 지킨다.
> 2. **weekly-wine Fastfile 을 글자 그대로 복사하면 안 되는 결함이 세 개 더 있다.** D-07 은 평문 비밀번호 결함만 적었다.
>    - ① `increment_build_number`(agvtool)가 `Info.plist` 의 `$(CURRENT_PROJECT_VERSION)` 을 리터럴로 바꿔 쓰고 pbxproj 도 고친다. weekly-wine 은 이 변경이 기능 커밋 `88ffff7` 에 섞여 들어갔다. D-09 「빌드 번호를 커밋하지 않는다」 와 충돌한다. 대신 `build_app(xcargs: "CURRENT_PROJECT_VERSION=…")` 로 넘긴다.
>    - ② `get_provisioning_profile(readonly: true)` 는 프로파일이 없으면 즉시 실패한다. GH Trade 용 App Store 프로파일은 아직 없으므로 `readonly: false` 로 첫 실행 때 생성하게 한다.
>    - ③ Android lane 은 `versionCode` 를 올리지 않는다(weekly-wine 은 `versionCode 1` 고정). 이대로면 두 번째 업로드가 거절된다.
> 3. **weekly-wine 의 Android fastlane 경로는 한 번도 검증된 적이 없다.** `android/fastlane/` 에 `report.xml` 이 없고, 파일 자체가 git 에 올라가 있지 않다. `docs/android-deploy.md` 의 「남은 작업」 에는 서비스 계정 생성과 Play 앱 등록이 그대로 남아 있다. 따라서 **Play 서비스 계정 JSON 은 재사용할 것이 없다**. 이 phase 에서 새로 만든다. 또 그 문서의 「설정 → API 액세스」 절차는 지금은 맞지 않는다. 현재 절차는 Cloud 프로젝트 연결 없이 Play Console 「사용자 및 권한」 에 서비스 계정 이메일을 초대하는 것이다.
> 4. **Play 신규 앱은 기본으로 「양자 대비(quantum-ready) 하이브리드 서명」 에 자동 등록된다.** 키가 3개 생기고, Google 은 세 키의 지문을 모두 API 제공자에 등록하라고 한다. Play 배포본에서 Google 로그인이 `DEVELOPER_ERROR` 를 내는 미해결 사례가 있다(2026-09-25). 대처는 두 가지다.
>    - 첫 AAB 수동 업로드 때 서명 키 선택을 기존(고전) Google 생성 키로 고른다.
>    - 또는 표시되는 모든 인증서의 SHA-1 을 각각 GCP Android OAuth 클라이언트로 등록한다.
>    - 공개 테스트 · 프로덕션 전에는 앱 서명 키를 바꿀 수 있다. 그래서 내부 테스트 단계에서 D-08 의 one-way 는 완화된다.
> 5. **TestFlight 내부 테스터는 App Store Connect 팀 사용자여야 한다.** 역할은 Account Holder · Admin · App Manager · Developer · Marketing 중 하나다. 그래서 테스터 절차는 D-02 의 2단계보다 한 단계 많다: 「ASC 사용자 초대 메일 수락(3일 만료) → TestFlight 초대 → 설치」. 권장 역할은 **Marketing + 앱 접근 GH Trade 한정**이다.
> 6. **`com.ghtrade.app` 은 명시적 App ID 로 등록돼 있지 않을 가능성이 높다.** 이 맥에 설치된 개발 프로파일은 와일드카드 `iOS Team Provisioning Profile: *` 뿐이다. sigh 는 번들 ID 가 없으면 「Could not find App with App Identifier」 로 실패한다. fastlane `produce` 는 Apple ID 로그인이 필요해 API 키만으로는 앱을 만들 수 없다. 번들 ID 등록과 앱 레코드 생성은 사용자 콘솔 태스크다.
> 7. **fastlane 은 weekly-wine 잠금본(2.232.2)이 아니라 2.240.1 로 새로 잠근다.**
>    - 이 맥의 Homebrew Ruby 는 4.0.2 다.
>    - fastlane 은 2.238.0 에서 Ruby 4 를 공식 지원했고, 2.240.1 에서 「Ruby 4 std 제거 대응 cgi gem」 을 추가했다.
>    - 2.240.1 의 gym 은 `export_method` 로 `app-store` 만 허용하고 `app-store-connect` 는 거부한다.
>    - Xcode 27 은 `app-store` 를 여전히 받는다(deprecated 표기) — `xcodebuild -help` 로 실측했다.
> 8. **`native:release:*` 는 반드시 두 플랫폼을 모두 sync 한 뒤 verify-prod 를 돌린다.** `verify-prod-config.mjs` 는 iOS · Android 생성 설정을 **둘 다** 검사한다. 한쪽만 `cap sync ios` 하면 다른 쪽에 남은 dev 설정 때문에 게이트가 실패하거나, 반대로 검사 의미가 흐려진다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 계정 · 테스터 범위
- **D-01:** Apple Developer Program 유료 멤버십(팀 `954QPCS3F5`)과 Google Play Console 개발자 계정은 **둘 다 보유**(2026-09-27 사용자 확인). 계정 개설 태스크 불필요. App Store Connect 앱 레코드와 Play 앱은 아직 없으므로 생성은 이 phase 에서 한다.
- **D-02:** 테스터 = **5명 미만 지인**. 배포 경로는 **iOS TestFlight 내부 테스터 + Play 내부 테스트 트랙**. 둘 다 심사가 없고 테스터 설치 절차는 「초대 수락 → TestFlight 앱/Play 스토어 → 설치」 뿐이다. 외부 테스터·공개 링크는 준비하지 않는다. 테스터 이메일(Apple ID · Google 계정)은 사용자가 콘솔에 수기 등록한다. — **Reversibility:** reversible — 외부 테스터 그룹은 나중에 추가만 하면 된다(단 Beta App Review 가 붙는다).
- **D-03:** 업데이트 절차는 「빌드 번호 올리고 빌드·업로드」 만. TestFlight 는 내부 그룹에 자동 배포(빌드 90일 만료 — 절차 문서에 명시), Play 는 스토어 자동 업데이트(versionCode 증가 필수).

#### 테스터 권한 · 로그인 허용
- **D-04:** **트레이딩 접근은 지금 그대로 — 코드 변경 없음.** 누구나 `/trading` 에 진입하지만 relay 가 `dma_credentials` 행이 없는 사용자에게 `unauthorized` 상태를 보내 시세 구독·주문을 거부하고 웹은 `DmaGate` 안내만 보여 준다. 테스터에게는 `dma_credentials` 행을 발급하지 않는다. 실돈 발주는 사용자 본인 계정만 가능. 탭 숨김·역할 allow-list 는 채택하지 않음. — **Reversibility:** reversible.
- **D-05:** **Google 로그인 허용은 현재 설정 유지.** 운영 웹과 같은 OAuth 클라이언트를 쓰므로 변경 없음. GCP OAuth 동의 화면이 「테스트」 상태면 테스터 이메일을 테스트 사용자 목록에 추가(사용자 콘솔 작업), 「프로덕션」이면 할 일 없음. **플랜에 「동의 화면 게시 상태 확인」 태스크를 넣는다.** Supabase 가입 제한(hook · trigger · allow-list)은 추가하지 않는다.

#### 빌드 · 서명 · 업로드 절차
- **D-06:** **실행 주체 = Claude.** Claude 가 스크립트·Fastfile 을 만들고 빌드·업로드까지 실행한다. 비밀(업로드 키스토어 비밀번호 · App Store Connect API 키 `.p8` · Play 서비스 계정 JSON)은 기존 관례대로 **사용자가 `! bash …` 한 줄로 저장소 밖 파일에 주입**한다. Xcode 계정 로그인(팀 `954QPCS3F5`)은 이미 되어 있어 재사용.
- **D-07:** **도구 = fastlane.** `/Users/alex/repos/weekly-wine-app` 의 검증된 Fastfile 2개(`ios/App/fastlane/Fastfile` lane `beta` · `android/fastlane/Fastfile` lane `beta`)를 복사해 식별자(`com.ghtrade.app`)·비밀 경로만 바꾼다. 같은 Apple 팀이므로 **App Store Connect API 키를 재사용**하고, Play 도 같은 개발자 계정이면 기존 서비스 계정에 GH Trade 앱 권한만 부여한다. `mobile/package.json` 에 `native:release:ios` · `native:release:android` 스크립트로 감싼다. Ruby·bundler 는 `/opt/homebrew/opt/ruby` 경로(weekly-wine 과 동일). **weekly-wine 의 결함은 따라 하지 않는다:** build.gradle 의 키스토어 비밀번호 평문 기본값 금지, 문서에 비밀번호 기재 금지. — **Reversibility:** reversible — 쉘 스크립트로 바꿔도 산출물(archive · AAB)은 같다.
- **D-08:** **Android 서명 = Play 앱 서명 + 업로드 키.** Google 이 앱 서명 키를 보관하고, 우리는 업로드 키스토어만 생성해 **홈 디렉터리(`~/.config/gh-trade/` 같은 저장소 밖 경로)** 에 두고 비밀번호는 환경변수 파일로 읽는다. **GCP Secret Manager 에 백업 1본**(쓰기는 사용자 `!` 실행). GCP OAuth 에는 **업로드 키 SHA-1 과 Play 앱 서명 키 SHA-1 을 각각 Android 클라이언트로 추가 등록**한다(id_token 은 web 클라이언트로 발급되므로 코드 변경 없음). — **Reversibility:** one-way — Play 앱 서명은 첫 업로드 뒤 해제할 수 없고, 업로드 키 분실 시 Google 에 재설정을 요청해야 한다.
- **D-09:** **버전 규칙 = 마케팅 버전 1.0 고정 · 빌드 번호 = 타임스탬프.** fastlane 이 빌드 시점에 iOS `CFBundleVersion` 을 `YYYYMMDDHHMM` 으로, Android `versionCode` 를 단조 증가 정수(상한 2,100,000,000 을 넘지 않는 `YYMMDDHHmm` 형태)로 설정한다. 저장소의 `MARKETING_VERSION` · `versionName` 은 사용자가 올리고 싶을 때만 수동 변경. 빌드 번호를 커밋하지 않는다.
- **D-10:** Play 첫 AAB 는 정책상 콘솔 수동 업로드 1회(사용자), 이후 fastlane 자동. iOS 첫 업로드는 fastlane 으로 가능하되 앱 레코드 생성은 사용자 콘솔 작업(또는 fastlane `produce`).

#### 스토어 최소 자료
- **D-11:** **개인정보처리방침 = 웹앱 공개 라우트 `/privacy`**(`https://trade.jx1.io/privacy`). 미들웨어 공개 prefix(`/login` · `/auth`)에 `/privacy` 를 추가해 로그인 없이 열리게 한다. Claude 가 코드 기준으로 수집 항목(Google 계정 이메일·프로필 · 관심종목·채팅 기록 · DMA 계정 정보 · 오프라인 폴백 등)을 확인해 **한글 초안** 을 쓰고 사용자가 검토한 뒤 배포한다. 이 웹 변경은 브라우저 사용자에게도 배포된다(`git push` = Vercel 배포 · relay 결합 없음 확인 필요).
- **D-12:** **Play 데이터 보안 양식 · App Store 앱 개인정보 양식은 이번에 채우지 않는다.** 내부 테스트에 필수가 아니므로 정식 출시 phase 로 이연. ROADMAP.md Phase 22 「범위 안」 3번째 항목의 「Play 데이터 보안 양식」 문구를 plan-phase 에서 정정한다.

### Claude's Discretion
- `native:verify-prod` 를 fastlane lane 앞단 게이트로 실행(sync 뒤 · 실패 시 중단). dev URL·cleartext 가 섞인 빌드가 업로드되지 않게 한다.
- `.gitignore` 보강: `*.p12` · `*.mobileprovision` · `key.properties` · `AuthKey*.p8` · `play-store-key.json` · `*.aab` · `*.ipa` · fastlane `report.xml`/`.env.default`.
- 앱 레코드 생성값: 앱 이름 **GH Trade** · 기본 언어 **한국어** · 아이콘 = `native:assets` 산출물 재사용 · SKU `com.ghtrade.app` · 스크린샷 생략(내부 테스트 불필요) · iOS 수출 규정 = HTTPS 만 사용(면제, `ITSAppUsesNonExemptEncryption = NO` 를 Info.plist 에 추가해 매 빌드 질문 생략).
- iOS 서명 방식(자동 서명 archive + App Store 프로파일 export — weekly-wine 방식) · Release 설정에 Debug 와 다른 값이 필요한지(현재 동일) · PrivacyInfo.xcprivacy 필요 여부(ITMS-91056 경고 — TestFlight 업로드는 통과하므로 경고만 기록).
- 릴리스 절차 문서 위치(`mobile/README.md` 「릴리스」 절 추가 vs `mobile/RELEASE.md` 신설).
- 테스터 안내문(초대 수락 → TestFlight 설치 → 설치 · Play 참여 링크) 작성 여부.

### Deferred Ideas (OUT OF SCOPE)
- **Play 데이터 보안 양식 · App Store 앱 개인정보 양식(nutrition label)** — 정식 출시 phase. 이때 `/privacy` 초안의 수집 항목 목록을 재사용.
- **TestFlight 외부 테스터 · Play 비공개/공개 테스트** — 심사(Beta App Review · Play 심사)가 붙으므로 정식 출시 phase 와 함께.
- **PrivacyInfo.xcprivacy(ITMS-91056)** — Phase 21 Deferred 유지. TestFlight 업로드 시 경고가 나오면 기록만.
- 푸시 알림 · 딥링크/유니버설 링크 — Phase 21 Deferred 유지.
</user_constraints>

<phase_requirements>
## Phase Requirements

요구사항 ID 가 아직 없다. 플래너가 `REQUIREMENTS.md` 에 두 가지를 한다.
- **MOBILE-02** 를 추가한다(아래 제안 문장).
- Out of Scope 「~~모바일 앱~~」 행(`REQUIREMENTS.md:135`)의 「푸시 알림·딥링크·스토어 제출은 여전히 범위 밖」 을 「푸시 알림·딥링크·스토어 **정식 출시·심사**는 여전히 범위 밖(테스트 배포는 MOBILE-02)」 으로 정정한다. Coverage 카운트는 52→53 이 된다.

ROADMAP.md Phase 22 도 두 곳을 고친다.
- 「범위 안」 3번째 항목 「Play 데이터 보안 양식」 을 삭제한다(D-12).
- Goal 의 「필요 시 외부 테스터 베타 심사 경로까지」 를 삭제한다(D-02).
- 메모리 규칙: ROADMAP·STATE 를 고치는 태스크는 worktree 격리 없이 main tree 에서 직접 편집한다.

**제안 문장(REQUIREMENTS.md 에 그대로 옮길 것):**

> - [ ] **MOBILE-02**: GH Trade 테스트 배포 — iOS TestFlight 내부 테스터 · Android Play 내부 테스트 트랙으로 `com.ghtrade.app` 을 5명 미만 지인 기기에 설치 가능하게 한다. 구성 요소는 다음과 같다.
>   - fastlane(`native:release:ios|android` = 운영 sync → `native:verify-prod` 게이트 → lane `beta`)
>   - iOS: 자동 서명 Release archive + App Store 프로파일 export(API 키)
>   - Android: Play 앱 서명 + 저장소 밖 업로드 키스토어(환경변수 서명 · 평문 기본값 없음 · Secret Manager 백업)
>   - 빌드 번호: 마케팅 1.0 고정 · 빌드 번호 타임스탬프(iOS `YYYYMMDDHHMM` · Android `(연도−2020)·10^8+MMDDHHmm` ≤ 2,100,000,000) · 빌드 번호 무커밋
>   - 릴리스 빌드 네이티브 Google 로그인 유지(업로드 키 · Play 앱 서명 인증서 SHA-1 을 GCP Android OAuth 클라이언트로 등록 · 코드 변경 없음)
>   - 개인정보처리방침 공개 라우트 `/privacy`(한글)
>   - 테스터 트레이딩 차단은 기존 `dma_credentials` allow-list(무변경)
>   - 범위 밖: 정식 출시·심사·외부 테스터·데이터 보안/개인정보 양식 — Phase 22

| ID (제안) | Description | Research Support |
|----|-------------|------------------|
| MOBILE-02 | 위 문장 | 아래 전 섹션. 하위 인수조건은 §Validation Architecture 의 Req→Test 표 (MOBILE-02a~o) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| 출처 | 지시 | 이 phase 에 미치는 영향 |
|------|------|--------------------------|
| 사용자 전역 CLAUDE.md 커밋 규칙 | 커밋 메시지 한글 · 커밋 전 메시지 확인 · push 까지 · Co-Authored-By 금지 | 실행 단계 규칙이다. `git push` 는 webapp 프로덕션 배포다(`/privacy` 포함). 이 RESEARCH.md 는 커밋하지 않았다 — 커밋은 오케스트레이터와 사용자의 확인에 맡긴다. |
| CLAUDE.md Constraints | 배포 = 프론트 Vercel · 백엔드 Cloud Run | 인프라 변경은 없다. `/privacy` 는 Vercel 로만 나간다. `webapp/vercel.json` 의 `ignoreCommand` 가 `webapp/`·`packages/shared/`·`pnpm-lock.yaml` 변경만 빌드한다. 그래서 `mobile/` 만 바뀐 push 는 웹 빌드를 건너뛴다. |
| CLAUDE.md GSD Workflow Enforcement | 편집은 GSD 명령 안에서 | 실행은 `/gsd-execute-phase 22` 에서 한다. |
| MEMORY 비밀 주입은 사용자 `!` 실행 | Secret Manager·비밀 쓰기는 분류기가 차단 → 비출력 스크립트 + `! bash …` 한 줄 안내 | 키스토어 생성·비밀번호·Secret Manager 백업·ASC 키 복사·Play SA 키 생성은 모두 **사용자 실행 스크립트**다. 스크립트는 값을 절대 echo 하지 않는다(`scripts/dma-credentials.sh` 규약). **대화형 프롬프트는 쓰지 않는다** — 비밀번호는 스크립트가 `openssl rand` 로 생성한다(아래 Pattern 5). |
| MEMORY 기존 credentials 재요청 금지 | env·Secret Manager·이전 기록 먼저 확인 | 재사용할 것은 세 가지다: ASC API 키(weekly-wine `ios/App/fastlane/AuthKey.p8` + `.env.default` 의 `ASC_KEY_ID`·`ASC_ISSUER_ID`), Apple Distribution 인증서(키체인에 이미 있음), gcloud deployer SA. Play SA JSON 은 **존재하지 않음**(검색 결과 0)이라 새로 만든다. |
| MEMORY 배포는 relay 먼저·push 나중 | 백엔드 막히면 push 하지 말 것 | `/privacy` 는 relay·server 결합이 없다(순수 webapp). push 전 게이트는 `git diff --stat <배포 relay SHA> HEAD -- relay/ server/ supabase/ workers/ packages/shared/` = 0줄이다(21-36 방식). |
| MEMORY 동시 세션 커밋 경합 | `git add -A` 금지 · push 직전 `status -sb` 재확인 | 커밋은 명시 경로만 한다. |
| MEMORY dev 포트 3100 | webapp dev = `http://localhost:3100` | `/privacy` e2e 의 baseURL 은 :3100 이다(playwright.config.ts:109). |
| MEMORY UI 는 HTML 목업 먼저 · 목업 검토 게이트 | 새 웹 UI 는 목업 게이트 대상일 수 있다 | `/privacy` 는 텍스트 문서 페이지(기존 `CenterShell` + 타이포 토큰)다. 목업 대상인지 플래너가 판단한다 → Open Question 4. |
| MEMORY 병렬 Wave 는 worktree 분리 | shared tree 에서 git add race | `mobile/`(네이티브·fastlane)와 `webapp/`(`/privacy`)는 파일이 겹치지 않는다. 이 phase 는 pnpm 의존성을 추가하지 않으므로 lockfile 경합도 없다. |
| MEMORY GSD 필수 게이트 임의 생략 금지 | 체커 스킵 금지 | 플래너는 plan-checker 를 돌린다. |

## Summary

이 phase 는 세 층이다.
1. **릴리스 파이프라인(`mobile/`)**: Gemfile + fastlane lane 2개, 래퍼 스크립트 2개, Android `build.gradle` 의 환경변수 서명과 `versionCode` 주입, iOS `Info.plist` 의 수출 규정 키, `.gitignore` 보강, 산출물 검사 스크립트.
2. **콘솔·비밀 작업(사용자)**: 아래 목록.
   - Apple 번들 ID 등록과 ASC 앱 레코드, 내부 그룹, 테스터 초대.
   - Play 앱 생성, 첫 AAB 수동 업로드와 서명 키 선택, 테스터 목록.
   - Play 서비스 계정 초대, GCP Android OAuth 클라이언트 추가, OAuth 동의 화면 상태 확인.
   - 업로드 키스토어 생성·백업, ASC 키 복사.
3. **웹 한 조각**: `/privacy` 공개 라우트(미들웨어 prefix 1개 + 페이지 1개).

코드량은 작다. 위험은 콘솔 순서와 비밀 취급, 그리고 **Play 서명 인증서와 Google 로그인의 짝 맞추기**에 몰려 있다.

weekly-wine 에서 **검증된 것은 iOS 경로뿐**이다. `ios/App/fastlane/report.xml` 에 `app_store_connect_api_key → increment_build_number → get_provisioning_profile → build_app(35s) → upload_to_testflight(36s)` 전 단계 성공이 남아 있고, 빌드 번호는 `202603272220` 이다. Android 경로는 파일만 있고 실행 흔적이 없다.
- iOS 는 구조를 그대로 가져온다. 단 빌드 번호 주입 방식, `readonly`, 산출물 경로(저장소 밖)를 고친다.
- Android 는 lane 뼈대만 가져온다. 서명·versionCode·서비스 계정·첫 업로드 절차는 새로 설계한다.

환경은 준비돼 있다. 모두 이번 세션 실측이다.
- Xcode 27.0(27A266a, 2026-09-14 GA)이 있고 `xcodebuild -license check` exit 0 이다. STATE.md 의 라이선스 불일치는 해소됐다.
- 키체인에 `Apple Distribution: Hyun-joong Kim (954QPCS3F5)` 가 있다(만료 2027-03-24).
- Homebrew Ruby 4.0.2 · bundler 4.0.8, Xcode 내장 altool, JDK 21 keytool/jarsigner, build-tools 36.1.0 apksigner 가 있다.
- 없는 것: 전역 fastlane(번들러로 설치), bundletool(선택), Play SA JSON, 업로드 키스토어, gh-radar GCP 프로젝트의 `androidpublisher` API 활성화.

**Primary recommendation:**
- `mobile/Gemfile`(fastlane `~> 2.240`) 하나를 둔다. 번들러는 상위 디렉터리를 탐색하므로 `ios/App` 과 `android` 에서 공유된다 — 실측 확인.
- weekly-wine 구조의 lane 2개를 둔다.
  - iOS 는 `xcargs` 로 빌드 번호를 넘기고 sigh 는 `readonly:false` 로 둔다.
  - Android 는 환경변수 서명 + `-PghtradeVersionCode` 로 빌드한다.
- `native:release:*` = `cap sync`(양쪽) → `verify-prod` → 래퍼(비밀 env 로드 · 이름만 검증) → `bundle exec fastlane beta` → 산출물 검사(서명 인증서 · 빌드 번호 · 운영 URL)다.
- 콘솔 작업은 `checkpoint:human-action` 으로 쪼갠다. 비밀은 전부 `~/.config/gh-trade/release/`(700) 아래에 둔다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 운영 설정 게이트(dev URL·cleartext 차단) | Build tooling (`verify-prod-config.mjs`) | 산출물 검사 스크립트(IPA/AAB 안 `capacitor.config.json`) | 빌드 전 생성 설정 + 빌드 후 실물 둘 다 본다 |
| iOS archive·서명·export | Build tooling (fastlane gym → xcodebuild) | Apple Developer 포털(sigh 가 App Store 프로파일 생성) | archive 는 자동 서명(개발 프로파일), export 는 수동(App Store 프로파일) |
| iOS 업로드·배포 | App Store Connect (pilot/altool, API 키) | TestFlight 내부 그룹(자동 배포 설정) | 심사 없음 · 90일 만료 |
| Android 서명 | Build tooling (Gradle signingConfig ← 환경변수) | Play App Signing(Google 이 최종 서명) | 업로드 키만 로컬. 배포 APK 는 Google 키로 서명 |
| Android 업로드·배포 | Play Console (supply, 서비스 계정 JSON) | 내부 테스트 트랙 테스터 목록 | 첫 업로드는 콘솔 수동(D-10) |
| 빌드 번호 | Build tooling (lane 이 계산 → xcargs / gradle property) | — | 저장소 파일을 바꾸지 않는다(D-09) |
| 릴리스 비밀 보관 | 로컬 OS 파일(`~/.config/gh-trade/release/`, 600/700) | GCP Secret Manager(백업) | 저장소 밖 · 사용자 `!` 실행으로만 쓴다 |
| 네이티브 Google 로그인(릴리스) | Native plugin(capgo social-login) + Google OAuth(Android 클라이언트 = 패키지+SHA-1) | Supabase Auth(aud = web 클라이언트) | 코드 무변경. GCP 콘솔 등록만 |
| 테스터 트레이딩 차단 | relay(`dma_credentials` 없음 → `unauthorized`) | Browser(`DmaGate`) | D-04 · 무변경 |
| 개인정보처리방침 | Frontend Server(Next.js RSC 페이지) | Next middleware(공개 prefix) | 로그인 없이 열려야 한다(스토어·테스터가 URL 로 접근) |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastlane (RubyGem) | **2.240.1** (2026-09-15) — `Gemfile` 에 `gem "fastlane", "~> 2.240"` | gym(archive/export) · sigh(프로파일) · pilot(TestFlight) · supply(Play) · gradle | 두 스토어 업로드의 사실상 표준이다. weekly-wine iOS 경로 실증. 2.238.0 에서 Ruby 4 지원, 2.240.1 에서 Ruby 4 cgi 대응 [VERIFIED: rubygems.org API · github.com/fastlane/fastlane/releases] |
| Ruby (Homebrew) | 4.0.2 (`/opt/homebrew/opt/ruby/bin`) | fastlane 런타임 | 시스템 Ruby 2.6.10 은 fastlane 최소 3.1 미달 [VERIFIED: `ruby --version` 실측 · rubygems `ruby_version >= 3.1`] |
| Bundler | 4.0.8 | Gemfile 잠금 · `bundle exec` | 버전 고정·재현성 [VERIFIED: 실측] |
| Xcode | 27.0 (27A266a, GA 2026-09-14) | archive · export · altool | 업로드 가능한 GA 빌드 [VERIFIED: `xcodebuild -version`] · GA 여부 [CITED: blakecrosley.com/blog/xcode-27-release · discuss.circleci.com Xcode 27 Released] |
| JDK 21 keytool / jarsigner | Android Studio JBR 21.0.9 | 업로드 키 생성 · AAB 서명 인증서 확인 | 표준 JDK 도구 [VERIFIED: `which keytool jarsigner` · `java -version`] |
| Android Gradle Plugin | 8.13.0 (기존) | `bundleRelease` | 변경 없음 [VERIFIED: `mobile/android/build.gradle:10`] |

### Supporting
| Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| apksigner | build-tools 36.1.0 | 로컬 설치용 APK 서명 검증(선택) | bundletool 로 APK 를 뽑을 때만 |
| bundletool | 미설치 | AAB → 기기 설치용 APK 세트 | **선택.** 업로드 키 서명 AAB 를 실기기에 직접 깔아 볼 때만(`brew install bundletool`). 테스터 경로(Play)에는 불필요 |
| gcloud | `/opt/homebrew/bin/gcloud` + deployer SA | Secret Manager 백업 · `androidpublisher` API 활성화 · Play 게시용 SA 생성 | 비밀 쓰기는 사용자 `!` 실행 |
| `fastlane run validate_play_store_json_key` | fastlane 내장 | Play SA JSON 이 API 에 붙는지 사전 확인 | Play 콘솔에서 SA 초대 직후 [VERIFIED: fastlane 2.232.2 소스 `actions/validate_play_store_json_key.rb`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `increment_build_number` (weekly-wine) | `build_app(xcargs: "CURRENT_PROJECT_VERSION=<ts>")` | agvtool 은 Info.plist·pbxproj 를 실제로 고친다. xcargs 는 빌드 설정만 덮어써 작업 트리가 깨끗하다(D-09) |
| gradle `android.injected.signing.*` 속성(fastlane 문서 예시) | build.gradle 이 환경변수를 직접 읽음 | fastlane `gradle` 액션은 기본 `print_command: true` 라 `-P…password=` 가 로그에 찍힌다(fastlane 예시도 그래서 `print_command: false` 를 붙인다). 환경변수 방식은 명령줄에 비밀이 없다 |
| fastlane `produce`(앱 레코드 생성) | 사용자 콘솔 작업 | `produce` 는 Apple ID 로그인(2FA)이 필요하다. API 키로는 `Spaceship::ConnectAPI.login(username…)` 경로를 못 탄다 [VERIFIED: produce/itunes_connect.rb:14] |
| 두 플랫폼 각각 Gemfile(weekly-wine) | `mobile/Gemfile` 하나 | 잠금 파일 하나 · 설치 1회. 번들러가 상위 디렉터리의 Gemfile 을 찾는다 [VERIFIED: scratchpad 실측 — `ios/App` 하위에서 `BUNDLE_GEMFILE` = 상위 `Gemfile`] |

**Installation:**
```bash
cd mobile && PATH=/opt/homebrew/opt/ruby/bin:$PATH bundle config set --local path vendor/bundle \
  && PATH=/opt/homebrew/opt/ruby/bin:$PATH bundle install   # Gemfile.lock 커밋, vendor/·.bundle/ 는 ignore
```

**Version verification:** `curl -s https://rubygems.org/api/v1/versions/fastlane/latest.json` → `{"version":"2.240.1"}` (2026-09-15). 총 다운로드 213,818,495, source `https://github.com/fastlane/fastlane`, 첫 버전 2014-12-01.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fastlane | RubyGems | 약 12년(2014-12~) · 1,325 버전 | 213.8M 누적 | github.com/fastlane/fastlane | 수동 감사 OK (seam 미지원 — `package-legitimacy check` 는 npm/pypi/crates 만 받음) | Approved — weekly-wine 에서 실사용 · 공식 문서 docs.fastlane.tools |

**Packages removed due to [SLOP] verdict:** 없음
**Packages flagged as suspicious [SUS]:** 없음
**npm 패키지 추가:** 없음. 이 phase 는 `pnpm-lock.yaml` 을 건드리지 않는다.
**전이 gem**(google-apis-androidpublisher_v3, xcodeproj, spaceship 등)은 fastlane 이 끌어온다. weekly-wine 잠금본에 `google-apis-androidpublisher_v3-0.98.0` · `xcodeproj-1.27.0` 이 있다. 새 잠금본은 `bundle install` 결과를 커밋해 고정한다.

## Architecture Patterns

### System Architecture Diagram

```
[Claude: pnpm --filter @gh-radar/mobile run native:release:ios|android]
        │
        ▼
 cap sync (ios+android, 운영 URL)  ──►  생성 설정 2개 · Android 플러그인 매니페스트
        │
        ▼
 verify-prod-config.mjs ──FAIL──► 중단 (dev URL·cleartext·금지 키)
        │ PASS
        ▼
 release-<platform>.sh
   ├─ source ~/.config/gh-trade/release/<platform>.env   (값 출력 금지, 빈 키 "이름"만 보고)
   └─ cd ios/App | android && bundle exec fastlane beta
        │
        ├── iOS lane beta ─────────────────────────────────────────────┐
        │   app_store_connect_api_key(.p8 경로)                         │
        │   build_number = YYYYMMDDHHMM                                  │
        │   get_provisioning_profile(readonly:false) ──► Apple 포털:    │
        │       번들 ID 없음 → 실패(사용자: Identifiers 에 등록)         │
        │       프로파일 없음 → "com.ghtrade.app AppStore" 생성          │
        │   build_app(Release, archive=자동서명, export=app-store 수동) │
        │       xcargs CURRENT_PROJECT_VERSION=<ts>                      │
        │       output_directory = 저장소 밖                              │
        │   upload_to_testflight(skip_waiting) ──► ASC 처리 ──► 내부     │
        │       그룹(자동 배포 ON) ──► 테스터 TestFlight 앱 설치          │
        │                                                                │
        └── Android lane beta ─────────────────────────────────────────┐
            versionCode = (연도−2020)·10^8 + MMDDHHmm                    │
            gradle bundle Release -PghtradeVersionCode=<vc>              │
               build.gradle: GHTRADE_UPLOAD_* 환경변수 → signingConfig   │
               (없으면 bundleRelease 즉시 실패 · assembleDebug 는 통과)   │
            upload_to_play_store(track: internal, SA JSON) ──► Play      │
               (첫 1회는 사용자가 콘솔 수동 업로드 = 서명 키 선택)         │
               ──► Google 앱 서명 키로 재서명 ──► 내부 테스터 Play 설치   │
        │
        ▼
 check-ipa.sh / check-aab.sh  (서명 인증서 · 빌드 번호 · 운영 URL · 디버그 플래그)

 [테스터 기기] 앱 실행 → https://trade.jx1.io → /login → 네이티브 Google 로그인
     iOS: iOS OAuth 클라이언트(번들 ID 기준 · 서명 무관)
     Android: Credential Manager 가 (패키지, 설치본 서명 SHA-1) 로 Android OAuth 클라이언트 조회
              → Play 앱 서명 인증서 SHA-1 이 GCP 에 없으면 [28444]/DEVELOPER_ERROR
     → id_token(aud=web 클라이언트) → Supabase signInWithIdToken → 홈
     → /trading: relay 가 dma_credentials 없음 → unauthorized → DmaGate (D-04)

 [누구나] https://trade.jx1.io/privacy → middleware PUBLIC_PREFIXES 통과 → 정적 RSC 페이지
```

### Recommended Project Structure
```
mobile/
├── Gemfile                      # 신규 — fastlane ~> 2.240 (단일)
├── Gemfile.lock                 # 신규 — 커밋
├── .bundle/config               # bundle config --local path vendor/bundle → ignore
├── vendor/bundle/               # ignore
├── ios/App/fastlane/Fastfile    # 신규 — lane beta (weekly-wine 구조 + 수정 3건)
├── ios/App/fastlane/Appfile     # 신규 — app_identifier · team_id
├── android/fastlane/Fastfile    # 신규 — lane build(첫 수동 업로드용) · beta
├── android/fastlane/Appfile     # 신규 — json_key_file(ENV) · package_name
├── android/app/build.gradle     # 수정 — env 서명 · versionCode property · 실패 가드
├── ios/App/App/Info.plist       # 수정 — ITSAppUsesNonExemptEncryption false
├── scripts/release-ios.sh       # 신규 — env 로드·검증 → fastlane → check-ipa
├── scripts/release-android.sh   # 신규 — env 로드·검증 → fastlane → check-aab
├── scripts/check-ipa.sh         # 신규 — 산출물 검사
├── scripts/check-aab.sh         # 신규 — 산출물 검사
├── scripts/setup-release-secrets.sh  # 신규 — 사용자 `!` 실행(키스토어 생성·ASC 키 복사·백업)
├── .gitignore                   # 보강
└── README.md                    # 「릴리스」 절 · 「비밀 파일」 절 갱신 · Deferred 갱신
webapp/src/
├── lib/supabase/middleware.ts   # PUBLIC_PREFIXES 에 "/privacy"
└── app/privacy/page.tsx         # 신규 — 한글 개인정보처리방침(RSC · metadata)

~/.config/gh-trade/release/      # 저장소 밖 · chmod 700 (기존 ~/.config/gh-trade 는 755 · 다른 프로젝트 파일 있음)
├── ios.env                      # ASC_KEY_ID · ASC_ISSUER_ID · ASC_KEY_PATH (600)
├── AuthKey_<KEYID>.p8           # weekly-wine 에서 복사 (600)
├── android.env                  # GHTRADE_UPLOAD_* · GOOGLE_PLAY_JSON_KEY (600)
├── ghtrade-upload.jks           # 업로드 키스토어 (600)
└── play-service-account.json    # Play 게시 SA 키 (600)
```

### Pattern 1: iOS lane — weekly-wine 구조 + 수정 3건
**What:** 자동 서명으로 archive 하고, sigh 가 받은 App Store 프로파일로 수동 export 한 뒤 TestFlight 에 올린다.
**When:** `native:release:ios` 매회.
**수정점**(weekly-wine 원본 = `/Users/alex/repos/weekly-wine-app/ios/App/fastlane/Fastfile:1-49`):
1. `increment_build_number` 를 삭제하고 `xcargs` 에 `CURRENT_PROJECT_VERSION=<ts>` 를 넣는다(Pitfall 2).
2. `get_provisioning_profile` 의 `readonly: true` 를 `false` 로 바꾸고, `output_path` 를 저장소 밖으로 둔다(Pitfall 3 · 7).
3. `build_app` 의 `output_directory` 를 저장소 밖으로 둔다. weekly-wine 은 `ios/App/App.ipa`·`App.app.dSYM.zip`·`AppStore_…mobileprovision` 을 작업 트리에 남겼고, mobileprovision 은 ignore 도 안 됐다.

```ruby
# Source: /Users/alex/repos/weekly-wine-app/ios/App/fastlane/Fastfile (검증된 구조) + 이 연구의 수정
default_platform(:ios)

platform :ios do
  desc "Release archive(자동 서명) → App Store 프로파일 export → TestFlight 내부 그룹"
  lane :beta do
    %w[ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH GHTRADE_RELEASE_OUT].each do |k|
      UI.user_error!("환경변수 #{k} 없음 — ~/.config/gh-trade/release/ios.env") if ENV[k].to_s.empty?
    end
    api_key = app_store_connect_api_key(
      key_id: ENV["ASC_KEY_ID"], issuer_id: ENV["ASC_ISSUER_ID"],
      key_filepath: ENV["ASC_KEY_PATH"], in_house: false
    )
    build_number = Time.now.strftime("%Y%m%d%H%M")   # D-09 · 커밋하지 않는다
    out = ENV["GHTRADE_RELEASE_OUT"]                  # 저장소 밖 경로

    get_provisioning_profile(
      api_key: api_key, app_identifier: "com.ghtrade.app", team_id: "954QPCS3F5",
      readonly: false,          # 첫 실행에 "com.ghtrade.app AppStore" 생성, 이후 재사용
      output_path: out
    )
    build_app(
      project: "App.xcodeproj", scheme: "App", configuration: "Release",
      export_method: "app-store",   # 2.240.1 gym 은 app-store-connect 를 거부 — Xcode 27 은 app-store 를 받음
      export_options: {
        signingStyle: "manual", teamID: "954QPCS3F5",
        provisioningProfiles: { "com.ghtrade.app" => lane_context[SharedValues::SIGH_NAME] }
      },
      xcargs: "CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION=#{build_number} -allowProvisioningUpdates",
      output_directory: out, clean: true
    )
    upload_to_testflight(api_key: api_key, skip_waiting_for_build_processing: true)
  end
end
```
`-allowProvisioningUpdates` 는 quick v5n·vk9 실기기 빌드에서 쓴 것과 같다(Xcode 계정 로그인 · D-06). 무인 실행을 더 단단히 하려면 `-authenticationKeyPath/-authenticationKeyID/-authenticationKeyIssuerID` 를 추가한다. Xcode 27 에 세 플래그가 있음을 `xcodebuild -help` 로 확인했다.

### Pattern 2: Android — 환경변수 서명(기본값 없음) + versionCode property + 실패 가드
**What:** 업로드 키 경로·비밀번호는 환경변수로만 받는다. 환경변수가 없으면 릴리스 번들 태스크를 즉시 실패시키고, 디버그 빌드는 그대로 둔다.
**현재 상태:** `mobile/android/app/build.gradle:11-12` = `versionCode 1` · `versionName "1.0"`. `:20-25` = `buildTypes { release { minifyEnabled false … } }` 이고 signingConfigs 는 없다 [VERIFIED: 파일 전체 Read].
```groovy
// Source: 이 연구 제안 (weekly-wine 의 `System.getenv(...) ?: '<평문>'` 결함 제거) — 문법은 실행 단계에서 gradle 로 검증
def ghtradeUploadStoreFile = System.getenv("GHTRADE_UPLOAD_STORE_FILE")

android {
    defaultConfig {
        // D-09 — fastlane 이 -PghtradeVersionCode=<vc> 로 넘긴다. 로컬 디버그는 1.
        versionCode((project.findProperty("ghtradeVersionCode") ?: "1") as Integer)
        versionName "1.0"
    }
    signingConfigs {
        release {
            if (ghtradeUploadStoreFile) {
                storeFile file(ghtradeUploadStoreFile)
                storePassword System.getenv("GHTRADE_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("GHTRADE_UPLOAD_KEY_ALIAS")
                keyPassword System.getenv("GHTRADE_UPLOAD_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (ghtradeUploadStoreFile) signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

// 서명 없는 릴리스 AAB 가 만들어지는 경로를 막는다 — native:build:android(assembleDebug)는 영향 없음
gradle.taskGraph.whenReady { graph ->
    if (!ghtradeUploadStoreFile && graph.allTasks.any { it.name in ["bundleRelease", "assembleRelease"] }) {
        throw new GradleException("GHTRADE_UPLOAD_STORE_FILE 없음 — 릴리스는 native:release:android 로만 만든다")
    }
}
```

### Pattern 3: Android lane — build(첫 수동 업로드용) + beta
```ruby
# Source: /Users/alex/repos/weekly-wine-app/android/fastlane/Fastfile:1-20 (미검증 원본) + 이 연구의 수정
default_platform(:android)

platform :android do
  def ghtrade_version_code
    t = Time.now
    (t.year - 2020) * 100_000_000 + t.strftime("%m%d%H%M").to_i   # 2026-09-27 00:49 → 609270049 · 2040년까지 < 2_100_000_000
  end

  def build_release_aab
    %w[GHTRADE_UPLOAD_STORE_FILE GHTRADE_UPLOAD_STORE_PASSWORD GHTRADE_UPLOAD_KEY_ALIAS GHTRADE_UPLOAD_KEY_PASSWORD].each do |k|
      UI.user_error!("환경변수 #{k} 없음 — ~/.config/gh-trade/release/android.env") if ENV[k].to_s.empty?
    end
    gradle(project_dir: ".", task: "bundle", build_type: "Release",
           properties: { "ghtradeVersionCode" => ghtrade_version_code })   # 비밀 아님 — 로그에 찍혀도 됨
    lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH]
  end

  desc "AAB 만 빌드(Play 첫 업로드는 콘솔 수동 — D-10)"
  lane :build do
    UI.success("AAB: #{build_release_aab}")
  end

  desc "AAB 빌드 → Play 내부 테스트 트랙"
  lane :beta do
    aab = build_release_aab
    upload_to_play_store(
      track: "internal", aab: aab,
      release_status: ENV.fetch("PLAY_RELEASE_STATUS", "completed"),  # 「draft app」 오류 시 draft 로 (Pitfall 9)
      skip_upload_metadata: true, skip_upload_images: true,
      skip_upload_screenshots: true, skip_upload_changelogs: true
    )
  end
end
```
`Appfile`: `json_key_file(ENV["GOOGLE_PLAY_JSON_KEY"])` 와 `package_name("com.ghtrade.app")`. 저장소 안 기본 경로(weekly-wine 의 `"./fastlane/play-store-key.json"`)는 두지 않는다.

`GRADLE_AAB_OUTPUT_PATH` 가 lane_context 에 실리는 것은 확인했다 [VERIFIED: fastlane 2.232.2 `actions/gradle.rb:9,99`].

### Pattern 4: `native:release:*` 스크립트 사슬
```jsonc
// mobile/package.json — 이름에 단독 `build` 를 쓰지 않는다(루트 `pnpm -r run build` 가 집어 감 · 21-RESEARCH Wave 0)
"native:release:ios": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-ios.sh",
"native:release:android": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh",
"native:release:android:aab": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh build"
```
- `cap sync`(인자 없음)는 두 플랫폼을 모두 운영 설정으로 되돌린다. `verify-prod` 가 양쪽 생성 설정을 검사하기 때문이다(Pitfall 8).
- 래퍼는 `set -euo pipefail` 다음 `set -a; source "$ENV_FILE"; set +a` 로 env 를 읽는다. 누락은 **키 이름만** 출력하고 값은 출력하지 않는다(`scripts/dma-credentials.sh` 규약).
- 래퍼는 `PATH=/opt/homebrew/opt/ruby/bin:$PATH` 를 두고 `bundle exec fastlane <lane>` 을 실행한다.
- 성공하면 `check-ipa.sh`/`check-aab.sh` 를 실행한다.

### Pattern 5: 비밀 주입 = 사용자 `!` 실행 · 비대화형 · 비출력
**What:** `mobile/scripts/setup-release-secrets.sh` 를 Claude 가 작성하고, 사용자가 `! bash mobile/scripts/setup-release-secrets.sh <단계>` 로 실행한다. 단계는 다음과 같다.
- `dir`: `~/.config/gh-trade/release` 를 만들고 `chmod 700` 한다.
- `asc`: weekly-wine 의 `ios/App/fastlane/AuthKey.p8` 를 `AuthKey_<ID>.p8` 로 복사하고 `chmod 600` 한다. `.env.default` 에서 `ASC_KEY_ID`·`ASC_ISSUER_ID` 줄만 추출해 `ios.env` 에 쓰고 `ASC_KEY_PATH`·`GHTRADE_RELEASE_OUT` 을 덧붙인다. 출력은 「OK」 한 줄뿐이다.
- `keystore`: 비밀번호를 `openssl rand -base64 32` 로 생성한다. `keytool -genkeypair -keystore …/ghtrade-upload.jks -storetype PKCS12 -alias ghtrade-upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=GH Trade, C=KR" -storepass:env … -keypass:env …` 로 키스토어를 만든다. 결과를 `android.env`(600)에 쓴다. 출력은 **업로드 인증서 SHA-1**(공개 지문 · 비밀 아님)뿐이다.
  - PKCS12 는 store·key 비밀번호가 같아야 하므로 같은 값을 두 변수에 넣는다.
  - `:env` 형식을 쓰면 명령줄에 비밀번호가 드러나지 않는다.
- `backup`: `gcloud secrets create gh-radar-ghtrade-upload-keystore --data-file=…jks` + `gh-radar-ghtrade-upload-keystore-password` 로 백업한다. 선택으로 `gh-radar-ghtrade-asc-api-key` 도 둔다(.p8 은 재다운로드 불가).
  - 이름 규약은 기존 `gh-radar-*` 를 따른다 [VERIFIED: `gcloud secrets list` 실측].
- `play-sa`: `gcloud services enable androidpublisher.googleapis.com` → `gcloud iam service-accounts create gh-radar-play-publisher` → `keys create …/play-service-account.json` 순서로 진행한다. 출력은 SA 이메일뿐이다.
  - org 정책 `iam.disableServiceAccountKeyCreation` 은 비강제(`booleanPolicy: {}`)임을 실측했다.

**주의:** 메모리 규칙상 `!` 셸에는 TTY 가 없을 수 있다. 그래서 `read -s` 프롬프트나 `keytool` 대화형 입력은 쓰지 않는다.

### Pattern 6: `/privacy` 공개 라우트
- 미들웨어: `webapp/src/lib/supabase/middleware.ts:8` 은 현재 `const PUBLIC_PREFIXES = ["/login", "/auth"];` 다. 여기에 `"/privacy"` 를 추가한다.
  - 판정은 `:55-57` 의 `pathname === prefix || pathname.startsWith(\`${prefix}/\`)` 다. `/privacy-x` 같은 경로는 열리지 않는다(경계 안전).
  - 그 뒤 분기(`:72` `user && pathname === "/login"` → `/`)는 `/privacy` 에 영향이 없다. 로그인 사용자도 `/privacy` 를 그대로 본다 [VERIFIED: middleware.ts 전체 Read].
- 페이지: `webapp/src/app/privacy/page.tsx` 를 RSC 로 만들고 `export const metadata = { title: '개인정보처리방침 · GH Trade', description: … }` 를 둔다.
  - `/design` 이 같은 패턴이다(`webapp/src/app/design/page.tsx` `metadata`).
  - 셸은 `CenterShell`(헤더 + `max-w-4xl` 본문 · 테마 토글) 이다. `components/layout/center-shell.tsx:18-26` 에는 인증 의존 요소가 없다. 헤더 로고 링크 `/` 는 비로그인이면 `/login` 으로 튕기는데, 이는 기존 동작이다.
- 루트 레이아웃은 모든 페이지를 `AuthProvider → RelayProvider → ChatProvider…` 로 감싼다. 비로그인 `/login` 이 이미 같은 트리에서 정상 동작하므로 `/privacy` 도 같다. RelayProvider 는 세션이 있을 때만 wss 를 연다(layout.tsx:71-74 주석) [VERIFIED: layout.tsx Read].
- **relay 결합 없음:** 페이지는 정적 텍스트이고 API 호출이 없다. push 전 백엔드 게이트는 0줄이어야 한다.

### 개인정보처리방침 초안 — 코드 근거 수집 항목 (플래너가 섹션 명세에 그대로 쓸 것)

| # | 항목 | 저장 위치 | 근거(이번 세션 Read · 원문) | 목적 | 보유 |
|---|------|-----------|-------------------------------|------|------|
| 1 | Google 계정 이메일 · 이름 · 프로필 사진 URL | Supabase Auth(`auth.users`, Google provider 메타데이터) | `webapp/src/lib/auth-context.tsx:36-38` `user.user_metadata?.full_name` · `user.user_metadata?.name` · `user.email` / `components/me/account-card.tsx:49`·`components/layout/user-section.tsx:39` `user.user_metadata?.avatar_url` | 로그인 · 표시명 · 아바타 | 회원 탈퇴(요청) 시까지 |
| 2 | 관심종목 | `watchlists` | `supabase/migrations/20260416120000_watchlists.sql:24-30` `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, stock_code text …, added_at timestamptz …, position int` | 관심종목 기능 | 계정 삭제 시 CASCADE |
| 3 | 사용자 테마(직접 만든 종목 묶음) | `themes`(`owner_id`) | `20260609120000_theme_tables.sql:37-42` `owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE` · `name text NOT NULL` · `description text` | 테마 기능 | CASCADE |
| 4 | AI 애널리스트 대화(질문·답변 원문) | `conversations` · `messages` | `20260702170000_chat_conversations.sql:40-46` `user_id … ON DELETE CASCADE, stock_code …, title text` / `:55-62` `role text NOT NULL CHECK (role IN ('user','assistant')), content text NOT NULL, blocks jsonb` | 대화 이력 · 답변 생성 | CASCADE · 자동 삭제 주기 없음(코드에 보관 기간 로직 없음) |
| 5 | 질문 내용의 AI 처리(국외 이전 · 처리 위탁) | Anthropic API(미국) | `server/src/services/specialists/anthropic-client.ts:1-20`(`@anthropic-ai/sdk` 클라이언트) | 답변 생성 | Anthropic 정책 — [ASSUMED] 사용자가 약관 확인 |
| 6 | DMA 계정 정보(허용 사용자만) | `dma_credentials` | `20260905120100_dma_credentials.sql:41-47` `dma_user_id text NOT NULL` · `dma_password_enc text NOT NULL -- … AES-256-GCM, AAD = user_id` | 본인 계좌 주문 중계 | CASCADE · 테스터에게는 발급하지 않음(D-04) |
| 7 | 주문 기록(허용 사용자만) | `dma_orders` · `dma_account_orders` · `dma_journal_events` | `20260905120200_dma_orders.sql:48-68` `account_no text NOT NULL, isin …, side …, qty integer …, price integer …, status …` | 주문 · 체결 확인 | — [ASSUMED] 법정 보관 여부는 사용자 판단 |
| 8 | 기기 로컬 저장(서버 전송 없음) | 브라우저/WebView localStorage | `webapp/src/lib/recent-search.ts:17` `'gh-radar:recent-search'` · `lib/trading-layout.ts:25,110` `"gh-radar:trading-layout:"`·`"gh-radar:trading-panels"` · `lib/breakout-list.ts:31-37` `"gh-radar:breakout-sounded"`·`"gh-radar:breakout-dismissed"`·`"gh-radar:breakout-tone"`·`"gh-radar:trading-cols"` · 테마(next-themes) | 최근 검색어 · 화면 배치 · 알림음 설정 | 기기에서 삭제 시 |
| 9 | 로그인 세션 쿠키 | WebView/브라우저 쿠키(`@supabase/ssr`) | `webapp/src/lib/supabase/middleware.ts:27-46` | 로그인 유지 | 로그아웃 · 만료 |
| 10 | 네이티브 앱 설정 | iOS `UserDefaults`(테마) · Android 동등 | `mobile/ios/App/App/ThemeStore.swift:12,16` `UserDefaults.standard` | 첫 화면 테마 | 앱 삭제 시 |
| 11 | 오프라인 폴백 | 앱 번들 로컬 페이지(`mobile/www/index.html`) | 수집 없음 | — | — |

**처리 위탁 · 국외 이전 후보:**
- Supabase(DB·인증)와 Vercel(웹 호스팅): 리전 `icn1` 은 `webapp/vercel.json` 에서 확인했다.
- Google Cloud(API 서버 Cloud Run · relay VM), Google(로그인), Anthropic(AI 답변).
- 각사 리전과 이전 국가 표기는 [ASSUMED] 이므로 사용자가 확정한다.
- **분석·광고 SDK 는 없다**: webapp·server·relay `package.json` 에 `@vercel/analytics`·sentry·gtag 가 0건이다.
- **회원 탈퇴 기능은 없다**(`grep 탈퇴|deleteUser` 0건 — 사용자 테마 삭제만 있음). 방침에는 「이메일로 삭제 요청」 을 적는다. App Store 정식 심사(가이드라인 5.1.1(v) 앱 내 계정 삭제)는 이연 항목에 기록한다.

**권장 섹션 순서(개인정보 보호법 제30조 · 시행령 제31조 기재 사항 — [ASSUMED], 사용자·법률 검토 필요):**
1. 처리 목적
2. 처리 항목(위 표)
3. 보유·이용 기간
4. 제3자 제공(없음)
5. 처리 위탁
6. 국외 이전(Anthropic 등)
7. 정보주체 권리·행사 방법
8. 파기 절차·방법
9. 안전성 확보 조치(전송 구간 HTTPS · DMA 비밀번호 AES-256-GCM 암호화 · RLS)
10. 쿠키·로컬 저장소 운영과 거부
11. 개인정보 보호책임자·연락처
12. 변경 고지
13. 시행일

### Anti-Patterns to Avoid
- **`increment_build_number` 사용:** 작업 트리를 더럽혀 빌드 번호가 커밋에 섞인다. weekly-wine `88ffff7` 이 실제 사례다.
- **`build.gradle` 에 `?: '<비밀번호>'` 기본값:** 비밀번호가 git 이력에 남는다(weekly-wine 결함).
- **문서·주석에 비밀번호·키 ID 이외 비밀 기재:** weekly-wine `docs/android-deploy.md` 결함이다. 이 연구는 그 값을 옮기지 않는다.
- **`gradle(properties: { "android.injected.signing.*" => … })` + 기본 `print_command`:** 비밀번호가 fastlane 로그에 찍힌다.
- **산출물을 저장소 안에 떨어뜨림:** `.ipa`·`.dSYM.zip`·`.mobileprovision`·`.aab` 가 생긴다. 저장소 밖 출력 + ignore 이중 방어를 한다.
- **한 플랫폼만 sync 후 verify-prod:** Pitfall 8.
- **Play Console 첫 업로드에서 서명 키 기본값(양자 대비 하이브리드)을 그대로 수락:** Pitfall 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ASC JWT 인증 · 프로파일 생성 · TestFlight 업로드 | `curl` + 직접 JWT 서명 · altool 명령 조립 | fastlane `app_store_connect_api_key` · `get_provisioning_profile` · `upload_to_testflight` | JWT 만료·프로파일 이름 충돌 처리가 이미 있다(sigh `create_profile!` 이름 충돌 시 타임스탬프 부가) |
| Play Developer API edits(insert → upload → track → commit) | 직접 REST 호출 | `upload_to_play_store` | edit 트랜잭션·재시도·draft 처리 |
| 키 생성 | 직접 RSA/인증서 생성 | `keytool -genkeypair` | 표준 PKCS12 |
| 비밀번호 생성 | `$RANDOM` 조합 | `openssl rand -base64 32` | CSPRNG |
| AAB 서명 인증서 확인 | zip 파싱 | `keytool -printcert -jarfile app-release.aab` | JAR 서명 표준 도구 |
| IPA 서명·엔타이틀먼트 확인 | plist 수동 파싱 | `codesign -dvv` · `codesign -d --entitlements :-` · `/usr/libexec/PlistBuddy` | Apple 표준 |

**Key insight:** 이 phase 의 실패는 대부분 **콘솔 상태와 로컬 설정의 불일치**에서 나온다(번들 ID 미등록 · 프로파일 없음 · SHA-1 누락 · draft 앱). 그러므로 도구는 표준 것을 쓰고, 불일치를 **빌드 전·후 검사 스크립트**로 드러내는 데 힘을 쓴다.

## Common Pitfalls

### Pitfall 1: Android `versionCode` `YYMMDDHHmm` 은 상한 초과 (D-09 문구 모순)
**What goes wrong:** 2026-09-27 00:49 → `2609270049` > `2100000000` 이라 Play 업로드가 거절된다.
**Why:** 연도 2자리 `26` 이 맨 앞에 오면 이미 26억대다. Play 상한은 2,100,000,000 이다 [CITED: developer.android.com/studio/publish/versioning — "The greatest value Google Play allows for versionCode is 2100000000."].
**How to avoid:** `(year−2020)·10^8 + MMDDHHmm` 로 계산한다. 2026 → `6`·`09270049` = `609270049` 다. 최대 2040-12-31 23:59 = `2012312359` < 상한이다. 연도가 1 오를 때 10^8 이 더해지고 MMDDHHmm 최대값 12,312,359 보다 크므로 단조성이 유지된다. D-09 의 의도(타임스탬프 · 상한 이하 · 무커밋)를 지키는 표기 변경이므로 **플래너가 CONTEXT 정정 메모로 명시**한다.
**Warning signs:** supply 가 「versionCode … too large」 또는 Play 가 업로드를 거부한다.

### Pitfall 2: `increment_build_number` 가 Info.plist 를 리터럴로 바꿔 쓴다
**What goes wrong:** `Info.plist` 의 `<string>$(CURRENT_PROJECT_VERSION)</string>` 이 `<string>202603272220</string>` 이 되고, pbxproj 두 곳도 바뀐다. 다음 커밋에 섞여 들어간다.
**Evidence:** weekly-wine `git show HEAD:ios/App/App/Info.plist` 23-24행에 `<string>202603272220</string>`, pbxproj 303·326행에 `CURRENT_PROJECT_VERSION = 202603272220;` 가 있다. `git log -S` 로 기능 커밋 `88ffff7` 에 들어갔음을 확인했다 [VERIFIED: weekly-wine git 실측].
**How to avoid:** `xcargs: "CURRENT_PROJECT_VERSION=<ts>"` 로 넘긴다. GH Trade `Info.plist:34-35` 는 `<key>CFBundleVersion</key>` `<string>$(CURRENT_PROJECT_VERSION)</string>` 라 빌드 설정 덮어쓰기가 그대로 반영된다 [VERIFIED: Info.plist Read]. 검사: 릴리스 후 `git status --porcelain mobile/ios` 가 빈 출력이어야 한다.

### Pitfall 3: `get_provisioning_profile(readonly: true)` 첫 실행 실패
**What goes wrong:** 「No matching provisioning profile found and cannot create a new one because you enabled `readonly`」 [VERIFIED: fastlane sigh/runner.rb:51].
**Why:** 이 맥의 프로파일은 `kr.co.weeklywine.app AppStore`, `iOS Team Provisioning Profile: kr.co.weeklywine.app`, `iOS Team Provisioning Profile: *` 세 개뿐이다(실측). GH Trade App Store 프로파일은 없다.
**How to avoid:** `readonly: false` 로 둔다. sigh 는 있으면 재사용하고 없으면 `"com.ghtrade.app AppStore"` 를 만든다(runner.rb:157). 이를 위해 번들 ID 가 포털에 있어야 한다(Pitfall 4).

### Pitfall 4: 번들 ID `com.ghtrade.app` 미등록 · 앱 레코드 없음
**What goes wrong:** sigh 가 「Could not find App with App Identifier 'com.ghtrade.app'」 로 멈춘다(runner.rb:337-339). `upload_to_testflight` 는 앱 레코드가 없으면 실패한다.
**Why:** 실기기 빌드는 와일드카드 팀 프로파일로 서명됐을 가능성이 높다. 설치된 개발 프로파일 중 GH Trade 전용이 없다.
**How to avoid:** 사용자 콘솔 태스크 순서는 다음과 같다.
1. developer.apple.com → Identifiers → `+` → App IDs → **Explicit** `com.ghtrade.app` 을 만든다. Capabilities 는 추가하지 않는다.
2. App Store Connect → 앱 → `+` 신규 앱으로 앱 레코드를 만든다. 플랫폼 iOS, 이름, 기본 언어 한국어, 번들 ID 선택, SKU `com.ghtrade.app`, 사용자 액세스 「전체」.
- 앱 이름은 App Store 전체에서 고유해야 한다 [ASSUMED]. 「GH Trade」 가 선점돼 있으면 다른 이름(예: 「GH Trade 레이더」)을 쓴다. 홈 화면 이름은 `CFBundleDisplayName`(`GH Trade`)이라 영향이 없다.
- 이름이 선점된 경우 사용자 선택이 필요하다.

### Pitfall 5: Play 양자 대비 하이브리드 서명 × Google 로그인
**What goes wrong:** 내부 테스트로 설치한 앱에서 로그인이 `[28444] Developer console is not set up correctly` / `DEVELOPER_ERROR` 로 실패하고, 웹에는 「로그인 처리에 실패」 만 보인다.
**Why:**
- 신규 앱은 첫 AAB 업로드 때 「quantum-ready, hybrid signing with Google-generated keys」 에 자동 등록된다. 키는 세 개다(구형 기기용 고전 키 · 하이브리드용 새 고전 키 · PQC ML-DSA-65 키).
- Google 은 세 키의 지문을 모두 API 제공자에 등록하라고 한다 [CITED: support.google.com/googleplay/android-developer/answer/9842756].
- 콘솔 페이지에 지문 버튼이 모든 인증서에 있지 않다는 보고가 있다 [CITED: vmobify.com/blog/play-app-signing-sha1-google-sign-in, 2026-08-29].
- 두 인증서를 모두 등록해도 `DEVELOPER_ERROR` 가 나는 미해결 이슈가 있다 [CITED: github.com/react-native-google-signin/google-signin/issues/1525, 2026-09-25].
**How to avoid:**
1. 첫 수동 업로드의 「앱 서명 키 선택」 에서 **하이브리드(베타)가 아닌 고전 Google 생성 키**를 고를 수 있으면 고른다.
2. 이미 등록됐다면 「앱 서명 키 변경」 으로 고전 키로 바꾼다. 공개 테스트·프로덕션 전에는 허용된다.
3. 어느 경우든 「Download certificates」 로 받은 **모든 앱 서명 인증서의 SHA-1** 과 업로드 키 SHA-1 을 각각 GCP Android OAuth 클라이언트로 만든다. 패키지는 `com.ghtrade.app` 이다.
- 실제 SHA-1 은 기기 logcat 으로 대조한다. 플러그인이 `Log.i("GoogleProvider", "Google %s: package=%s signingSha1=%s webClientId=%s mode=%s")` 를 남긴다 [VERIFIED: capgo social-login 8.5.11 `GoogleProvider.java:63,146-160`].
- 플래너는 이 대조를 에뮬레이터/실기기에서 **Play 에서 설치한 빌드로** 확인하는 수동 UAT 를 넣는다.
**Warning signs:** Android 에서만 로그인이 실패하고 iOS 는 성공한다.

### Pitfall 6: TestFlight 내부 테스터 = ASC 팀 사용자 (테스터 절차가 한 단계 길다)
**What goes wrong:** 테스터 이메일만 내부 그룹에 넣으려 하면 목록에 나타나지 않는다.
**Why:** 내부 테스터는 「App Store Connect users with access to your content」 이고 역할은 Account Holder · Admin · App Manager · Developer · Marketing 이다. 초대 메일은 3일 뒤 만료된다 [CITED: developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers · …/manage-your-team/add-and-edit-users].
**How to avoid:** 사용자 콘솔 절차는 다음과 같다.
1. Users and Access 에서 **Marketing** 역할로 초대하고 「앱 접근」 을 GH Trade 로 한정한다. Developer 는 인증서 접근이 붙으므로 피한다.
2. 테스터가 초대 메일을 수락한다.
3. TestFlight 내부 그룹(예: 「GH Trade 테스터」, **자동 배포 켬**)에 추가한다.
4. 테스터가 TestFlight 초대를 받고 앱을 설치한다.
- 이 절차를 테스터 안내문에 적는다.
- 개인 멤버십에서도 ASC 사용자 추가가 되는지는 [ASSUMED] 다. 실패하면 대안은 외부 테스터(베타 심사)라 D-02 재논의 대상이다.

### Pitfall 7: 산출물·프로파일이 저장소 안에 떨어진다
**What goes wrong:** weekly-wine 은 `ios/App/App.ipa`, `App.app.dSYM.zip`, `AppStore_kr.co.weeklywine.app.mobileprovision` 을 남겼다. mobileprovision 은 ignore 되지 않은 untracked 파일이다(`git check-ignore` 결과 없음 · 실측).
**How to avoid:** `GHTRADE_RELEASE_OUT`(예: `~/Library/Developer/gh-trade-release`)을 sigh `output_path`와 gym `output_directory` 에 쓴다. gitignore 에도 패턴을 추가한다(이중 방어).

### Pitfall 8: 한쪽만 sync → verify-prod 실패 또는 무의미
**What goes wrong:** `verify-prod-config.mjs:30-33` 은 `ios/App/App/capacitor.config.json` 과 `android/app/src/main/assets/capacitor.config.json` 을 **둘 다** 읽는다. `native:sync:dev` 흔적이 Android 에 남은 채 iOS 만 sync 하면 iOS 릴리스가 막힌다(반대도 같다) [VERIFIED: 스크립트 Read].
**How to avoid:** `native:release:*` 는 `cap sync`(양쪽)로 시작한다. 플랫폼 인자를 추가하는 개조보다 단순하다.

### Pitfall 9: Play 「Only releases with status draft may be created on draft app」
**What goes wrong:** 한 번도 게시하지 않은 앱에 supply 기본 `release_status: completed` 로 올리면 거절된다 [CITED: github.com/fastlane/fastlane/discussions/18293 · issues/21491].
**How to avoid:** D-10 대로 첫 릴리스는 콘솔에서 수동으로 **내부 테스트에 출시(롤아웃)** 까지 한다. 이후에도 같은 오류가 나면 `PLAY_RELEASE_STATUS=draft` 로 올리고 콘솔에서 출시를 누른다(lane 에 스위치 포함).

### Pitfall 10: 첫 Play 업로드용 AAB 도 파이프라인으로 만든다
**What goes wrong:** Android Studio 「Generate Signed Bundle」 로 만들면 다른 키나 비밀번호가 섞이거나 versionCode 가 1 이 된다. 그러면 다음 fastlane 업로드와의 순서가 꼬이지는 않지만 규칙이 흐트러진다.
**How to avoid:** `native:release:android:aab`(lane `build`)로 만든 AAB 를 사용자가 콘솔에 올린다. 경로는 `mobile/android/app/build/outputs/bundle/release/app-release.aab` 이고 ignore 대상이다.

### Pitfall 11: ITMS-91053(Required Reason API) — App 타깃이 `UserDefaults` 를 쓴다
**What goes wrong:** Apple 은 2024-05-01 부터 앱 코드가 쓰는 required-reason API 의 사유를 privacy manifest 에 적지 않으면 App Store Connect 가 받지 않는다고 공지했다. GH Trade App 타깃은 `ThemeStore.swift:12,16` 에서 `UserDefaults.standard` 를 쓰고, App 타깃에 `PrivacyInfo.xcprivacy` 가 없다(실측).
**완화 증거:** weekly-wine 은 같은 조건이었다. `CookieViewController.swift` 에 `UserDefaults.standard` 가 2회 있고, IPA 에는 Capacitor/Cordova 프레임워크 manifest 만 있다. 그 상태로 2026-03-27 빌드가 `upload_to_testflight` 를 **통과**했다(report.xml). 다만 처리 후 결과(메일 경고 vs Invalid Binary)는 기록이 없다.
**How to avoid:** CONTEXT 는 이 항목을 Deferred(경고만 기록)로 두었다. 플래너는 **조건부 태스크**만 둔다: 「업로드 거절 또는 빌드가 Invalid 가 되면 사용자에게 알리고, App 타깃에 `PrivacyInfo.xcprivacy`(NSPrivacyAccessedAPICategoryUserDefaults · CA92.1)를 추가할지 묻는다」.
- SPM 의존성 쪽은 GoogleSignIn · AppAuth · GTMAppAuth · GTMSessionFetcher · GoogleUtilities · Promises 가 모두 자체 `PrivacyInfo.xcprivacy` 를 싣는다. DerivedData checkouts 에서 20개를 확인했다. 따라서 ITMS-91061(목록 SDK manifest 누락) 위험은 낮다.

### Pitfall 12: `.gitignore` 공백
**현재:** `mobile/.gitignore:26-27` 은 `*.jks` · `*.keystore` 뿐이다. `mobile/android/.gitignore` 는 `*.aab`·`fastlane/report.xml`·`fastlane/Preview.html`·`fastlane/screenshots`·`fastlane/test_output`·`fastlane/readme.md`(소문자)를 덮는다. `mobile/ios/.gitignore` 는 `App/build`·`App/Pods`·`App/output`·`DerivedData`·`xcuserdata` 다. 루트는 `.env`·`.env.local`·`.env.*.local`·`build/` 다 [VERIFIED: 네 파일 Read].
**추가할 것**(`mobile/.gitignore`):
- 비밀·서명: `*.p12` · `*.mobileprovision` · `*.p8` · `*.cer` · `key.properties` · `play-store-key.json` · `*service-account*.json`
- 산출물: `*.ipa` · `*.aab` · `*.apk` · `*.dSYM.zip`
- fastlane: `**/fastlane/report.xml` · `**/fastlane/README.md`(실행마다 재생성) · `**/fastlane/Preview.html` · `**/fastlane/screenshots/` · `**/fastlane/test_output/` · `**/fastlane/.env*`
- 번들러: `vendor/` · `.bundle/`
- `**/fastlane/README.md` 는 fastlane 이 매 실행마다 덮어쓴다. weekly-wine 도 ignore 한다.

### Pitfall 13: OAuth 동의 화면이 「테스트」 면 테스터 로그인 차단
**What goes wrong:** 「Testing」 게시 상태에서는 테스트 사용자 목록(최대 100)에 없는 계정이 로그인할 수 없다.
**Why:** 기본 범위(openid·email·profile)만 쓰면 7일 토큰 만료 예외에 해당한다. 그러나 사용자 제한은 남는다 [CITED: support.google.com/cloud/answer/15549945].
**How to avoid:** D-05 태스크로 처리한다. GCP 콘솔 → Google Auth Platform → 대상(Audience)에서 게시 상태를 확인한다. 「테스트」면 테스터 Google 계정을 추가하고, 「프로덕션」이면 할 일이 없다. 기본 범위만 쓰므로 프로덕션 전환에 검증이 요구되지 않을 가능성이 높다 [CITED 같은 문서 · 해석은 MEDIUM].

### Pitfall 14: Android 릴리스 빌드의 lintVital
**What goes wrong:** `bundleRelease` 는 `lintVitalAnalyzeRelease` 를 실행한다. 디버그에서 보이지 않던 치명 lint 가 릴리스에서만 실패할 수 있다 [ASSUMED].
**How to avoid:** 첫 `native:release:android:aab` 를 Wave 초반에 실행해 조기 발견한다. lint 를 끄지 않고 원인을 고친다.

## Code Examples

### IPA 검사(`check-ipa.sh` 핵심)
```bash
# Source: Apple 표준 도구 — codesign / PlistBuddy / unzip
IPA="$GHTRADE_RELEASE_OUT/App.ipa"; T="$(mktemp -d)"; unzip -q "$IPA" -d "$T"; APP="$T/Payload/App.app"
codesign -dvv "$APP" 2>&1 | grep -q "Authority=Apple Distribution: .*(954QPCS3F5)" || fail "배포 인증서 아님"
ENT="$(codesign -d --entitlements :- "$APP" 2>/dev/null)"
grep -q "<string>954QPCS3F5.com.ghtrade.app</string>" <<<"$ENT" || fail "application-identifier"
grep -A1 "get-task-allow" <<<"$ENT" | grep -q "<false/>" || fail "get-task-allow 가 true"
PB=/usr/libexec/PlistBuddy
[ "$($PB -c 'Print :CFBundleVersion' "$APP/Info.plist")" = "$EXPECTED_BUILD" ] || fail "CFBundleVersion"
[ "$($PB -c 'Print :ITSAppUsesNonExemptEncryption' "$APP/Info.plist")" = "false" ] || fail "수출 규정 키"
[ "$($PB -c 'Print :CAPACITOR_DEBUG' "$APP/Info.plist" 2>/dev/null)" != "true" ] || fail "CAPACITOR_DEBUG=true(웹 인스펙터)"
node -e 'const c=require(process.argv[1]);process.exit(c.server?.url==="https://trade.jx1.io"&&c.server?.cleartext!==true?0:1)' "$APP/capacitor.config.json" || fail "server.url"
```
`CAPACITOR_DEBUG` 검사 근거: Capacitor SPM xcframework 는 항상 release 빌드다. 따라서 웹 디버깅 여부는 `Info.plist` 의 `CAPACITOR_DEBUG == "true"` 로만 켜진다(`CAPInstanceDescriptor.swift:137-147`). GH Trade 는 `debug.xcconfig`(`CAPACITOR_DEBUG = true`)를 **Debug 구성에만** 연결한다(pbxproj `504EC3141FED…` Debug 와 `504EC3171FED…` Debug 에 `baseConfigurationReference = … debug.xcconfig`, Release 두 구성에는 없음). 그러므로 Release archive 에서 이 값은 빈 문자열이어야 한다 [VERIFIED: pbxproj 215-371 · debug.xcconfig · CAPInstanceDescriptor.swift Read].

### AAB 검사(`check-aab.sh` 핵심)
```bash
AAB="android/app/build/outputs/bundle/release/app-release.aab"
SHA1="$(keytool -printcert -jarfile "$AAB" | awk '/SHA1:/{print $2; exit}')"
[ "$SHA1" = "$GHTRADE_UPLOAD_SHA1" ] || fail "업로드 키로 서명되지 않음 ($SHA1)"   # 지문은 공개값 — android.env 에 둬도 됨
unzip -p "$AAB" base/assets/capacitor.config.json | node -e '…server.url==="https://trade.jx1.io"…' || fail "server.url"
jarsigner -verify "$AAB" >/dev/null || fail "서명 검증 실패"
```

### 테스터 수(최종 확인) — 업로드 뒤 자동 확인
```bash
bundle exec fastlane run google_play_track_version_codes track:internal json_key:"$GOOGLE_PLAY_JSON_KEY" package_name:com.ghtrade.app
bundle exec fastlane run latest_testflight_build_number app_identifier:com.ghtrade.app api_key_path:<json>   # 처리 완료 뒤
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Play Console 「설정 → API 액세스」 에서 Cloud 프로젝트 연결 후 SA 권한 부여 | Cloud 에서 SA 생성 → Play Console 「사용자 및 권한」 에 SA 이메일 초대 · 연결 불필요 | — (공식 문서 명시) | weekly-wine 문서 절차는 구식이다 [CITED: developers.google.com/android-publisher/getting_started — "You no longer need to link your developer account to a Google Cloud Project…"] |
| Play App Signing 단일 RSA 키 | 신규 앱 기본 = 양자 대비 하이브리드(3키) | 2026 | SHA-1 등록 대상 증가 · Google 로그인 호환 불확실(Pitfall 5) |
| Xcode export method `app-store` | `app-store-connect`(`app-store` 는 deprecated 로 계속 수용) | Xcode 15.3~ | fastlane 2.240.1 gym 은 여전히 `app-store` 만 허용하므로 그대로 쓴다 [VERIFIED: `xcodebuild -help` · gym/options.rb 2.240.1] |
| fastlane on Ruby 3.x | Ruby 4 지원(2.238.0) · 최소 Ruby 3.1(2.239.0) | 2026-08~09 | 새 잠금 필수 |
| 개인 Play 계정 프로덕션 = 20명 14일 | 12명 14일 비공개 테스트(2023-11-13 이후 개설 개인 계정) | 2024-12 | 내부 테스트에는 무관하다. 정식 출시 phase 의 선행 조건일 수 있다 [CITED: support.google.com/googleplay/android-developer/answer/14151465] |

**Deprecated/outdated:**
- weekly-wine `docs/android-deploy.md` 의 서비스 계정 절차와 평문 비밀번호 기재는 따라 하지 않는다.
- weekly-wine Fastfile 의 `increment_build_number` · `readonly: true` · 저장소 안 산출물도 따라 하지 않는다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | App Store 앱 이름(ASC 레코드)은 전역 고유라 「GH Trade」 가 선점돼 있을 수 있다 | Pitfall 4 | 앱 레코드 생성 단계에서 이름 변경 필요(사용자 선택) |
| A2 | 개인(Individual) Developer Program 에서도 ASC Users and Access 로 Marketing 사용자를 초대할 수 있다 | Pitfall 6 | 불가하면 내부 테스터 경로가 막힌다 → 외부 테스터(베타 심사) 재논의 |
| A3 | Play 첫 업로드 화면에서 하이브리드가 아닌 고전 Google 생성 키를 고를 수 있거나, 내부 테스트 단계에서 앱 서명 키 변경이 가능하다 | Pitfall 5 | 하이브리드가 강제되면 모든 인증서 SHA-1 등록 후 실기기 검증에 의존. 그래도 실패하면 Android 로그인 블로커 |
| A4 | GCP 는 같은 패키지명에 SHA-1 이 다른 Android OAuth 클라이언트를 여러 개 허용한다 | Pitfall 5 · D-08 | 불가하면 기존 debug 클라이언트 정리·재구성 필요 |
| A5 | OAuth 동의 화면 「테스트」 상태의 사용자 제한이 네이티브(Credential Manager · GoogleSignIn-iOS) 로그인에도 적용된다 | Pitfall 13 | 적용되지 않으면 태스크가 무해하게 no-op |
| A6 | TestFlight 업로드는 ITMS-91053 을 경고로만 처리한다(weekly-wine 업로드 통과가 부분 증거) | Pitfall 11 | 거절되면 App 타깃 PrivacyInfo.xcprivacy 추가(사용자 승인 필요 — Deferred 항목) |
| A7 | 개인정보처리방침 섹션 구성(개인정보 보호법 제30조 기재 사항)과 각 위탁사 리전·국외 이전 국가 | §개인정보처리방침 초안 | 법적 문구 오류 — 사용자 검토 게이트로 완화 |
| A8 | `bundleRelease` 의 lintVital 이 새 치명 오류를 낼 수 있다 | Pitfall 14 | 첫 빌드 지연 |
| A9 | weekly-wine ASC API 키의 역할이 프로파일 생성 권한(Admin/App Manager)을 가진다 — 같은 키로 sigh 가 `kr.co.weeklywine.app AppStore`(sigh 명명 규칙)를 만들었다는 정황 | Pattern 1 | 권한이 없으면 sigh 생성 실패 → 사용자가 포털에서 App Store 프로파일 수동 생성 또는 키 역할 상향 |
| A10 | Pattern 2 의 Groovy 문법(`as Integer` · `taskGraph.whenReady` 가드)은 AGP 8.13 에서 그대로 동작한다 | Pattern 2 | 실행 단계 gradle 검증으로 즉시 드러남 |
| A11 | Anthropic 의 데이터 보관·학습 미사용 정책 문구 | 개인정보 표 #5 | 방침 문구 오류 — 사용자 확인 |

## Open Questions

1. **D-09 Android `versionCode` 표기 정정**
   - What we know: `YYMMDDHHmm` 은 2026 년에 26억대라 상한을 초과한다.
   - Recommendation: `(연도−2020)·10^8 + MMDDHHmm` 로 쓰고, 플래너가 PLAN 에 「D-09 표기 정정(의도 동일)」 을 명시한다. 사용자 확인은 plan 리뷰에서 한다.
2. **Play 앱 서명 키 종류(하이브리드 vs 고전)**
   - What we know: 신규 앱 기본값은 하이브리드이고, Google 로그인 호환 문제 사례가 미해결이다.
   - What's unclear: 콘솔 첫 업로드 화면의 선택지 이름과 기본값.
   - Recommendation: 첫 수동 업로드 태스크(`checkpoint:human-action`)에 「고전 키 선택 가능하면 선택 · 화면 스크린샷/문구 보고」 를 넣는다. 이어서 SHA-1 등록 → Play 설치본 로그인 UAT 로 검증한다.
3. **내부 테스터용 ASC 사용자 역할**
   - Recommendation: Marketing + 앱 한정으로 한다. 테스터 안내문에 3단계(ASC 초대 수락 → TestFlight 초대 → 설치)를 적는다. 사용자가 D-02 의 「2단계」 기대와 다름을 알도록 plan 요약에 명시한다.
4. **`/privacy` 목업 게이트 여부**
   - What we know: 텍스트 문서 페이지이고, 기존 `CenterShell` + 타이포 토큰을 재사용한다.
   - Recommendation: 목업 대신 **문안 검토 게이트**(사용자가 한글 초안 확인 → 승인 후 커밋·push)를 둔다. 메모리 「UI 는 HTML 목업 먼저」 를 적용할지는 플래너가 사용자에게 한 줄로 묻는다.
5. **릴리스 문서 위치**
   - Recommendation: `mobile/README.md` 에 「릴리스(TestFlight · Play 내부 테스트)」 절을 추가한다. 비밀 파일 표, 첫 1회 콘솔 순서, 반복 명령, 90일 만료, versionCode 규칙, 테스터 안내문을 담는다. 이미 「비밀 파일」·「범위 밖」 절이 있어 갱신 지점이 한 파일에 모인다. `RELEASE.md` 는 분량이 README 의 절반을 넘으면 분리한다.
6. **PrivacyInfo.xcprivacy 선제 추가 여부**
   - Deferred 결정을 존중해 조건부로만 둔다(Pitfall 11). 사용자가 weekly-wine 빌드 `202603272220` 이 TestFlight 에서 정상 설치됐는지 기억한다면 A6 이 확정된다.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | archive · export · altool | ✓ | 27.0 (27A266a) · `xcodebuild -license check` exit 0 · `xcrun clang` 동작 | — |
| altool | `upload_to_testflight` | ✓ | `/Applications/Xcode.app/Contents/SharedFrameworks/ContentDelivery.framework/Resources/altool` | Transporter.app(미설치) |
| Apple Distribution 인증서(+개인키) | App Store export | ✓ | `Apple Distribution: Hyun-joong Kim (954QPCS3F5)` 만료 2027-03-24 | — |
| Apple Development 인증서 | 자동 서명 archive | ✓ | 만료 2027-03-24 | — |
| App Store 프로파일(GH Trade) | export | ✗ | — | sigh `readonly:false` 가 생성 |
| 번들 ID `com.ghtrade.app`(Explicit) | sigh · ASC 앱 레코드 | 미확인(가능성 낮음) | — | 사용자 포털 등록 |
| ASC API 키(.p8 + ID) | sigh · pilot | ✓ (weekly-wine 경로 `ios/App/fastlane/AuthKey.p8` · `.env.default`) | — | 새 키 발급(ASC → Users and Access → Integrations) |
| Homebrew Ruby | fastlane | ✓ | 4.0.2 | — |
| Bundler | Gemfile | ✓ | 4.0.8 | — |
| fastlane | lane | ✗ (전역 없음) | — | `bundle install` 로 2.240.1 |
| JDK keytool · jarsigner | 키 생성 · AAB 검사 | ✓ | 21.0.9 | — |
| apksigner | (선택) APK 검사 | ✓ | build-tools 36.1.0 | — |
| bundletool | (선택) 업로드 키 서명 AAB 로컬 설치 | ✗ | — | `brew install bundletool` 또는 생략 |
| Android SDK · Gradle · AVD | `bundleRelease` | ✓ | 21-RESEARCH 실측 그대로(compile/target 36 · AGP 8.13.0) | — |
| 업로드 키스토어 | AAB 서명 | ✗ | — | `setup-release-secrets.sh keystore`(사용자 `!`) |
| Play SA JSON | supply | ✗ (홈 전체 검색 0) | — | `setup-release-secrets.sh play-sa` + Play Console 초대 |
| GCP `androidpublisher.googleapis.com` | supply | ✗ (gh-radar 에 미활성) | — | `gcloud services enable` |
| gcloud + deployer SA | Secret Manager 백업 · API 활성화 | ✓ | 프로젝트 `gh-radar`(조직 소속 · SA 키 생성 비강제) | — |
| `~/.config/gh-trade/` | 비밀 보관 | ✓ (755 · `ghtrade-update.key` 600 존재 — 다른 용도) | — | 하위 `release/`(700) 신설 |
| 실기기(Android) | Play 설치본 로그인 UAT | 미확인 | — | 에뮬레이터 `Medium_Phone_API_36.1`(google_apis_playstore)에 Play 스토어 로그인 후 내부 테스트 참여 |
| 실기기(iPhone) | TestFlight 설치 UAT | ✓ (mesya iPhone 16 · 이력) | — | — |

**Missing dependencies with no fallback:** 없음. 모두 사용자 콘솔·비밀 태스크로 해소된다.
**Missing dependencies with fallback:** fastlane(번들러) · App Store 프로파일(sigh) · 키스토어 · Play SA · API 활성화 · bundletool(선택).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (웹 단위) | Vitest ^2.1.9 + jsdom + @testing-library/react (`webapp/vitest.config.ts`) |
| Framework (웹 e2e) | Playwright ^1.59.1 (`webapp/playwright.config.ts`, baseURL `http://localhost:3100`, 비로그인 스펙은 `auth-guards.spec.ts` 의 파일 레벨 `storageState` 비우기 패턴) |
| Framework (릴리스 파이프라인) | bash 검사 스크립트(`check-ipa.sh` · `check-aab.sh` · `check-release-hygiene.sh`) + `node scripts/verify-prod-config.mjs` + Ruby minitest(선택 — 빌드 번호 함수) |
| Quick run command | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy src/lib/supabase` |
| Full suite command | `pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp run typecheck` (+ config `test_command` 의 relay 테스트) |
| e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/auth-guards.spec.ts` |
| iOS release | `pnpm --filter @gh-radar/mobile run native:release:ios` (archive+upload · 수 분 · Wave 단위) |
| Android release | `pnpm --filter @gh-radar/mobile run native:release:android:aab` (빌드만) / `native:release:android` (업로드) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOBILE-02a | `/privacy` 비로그인 접근 → 리다이렉트 없이 200 · 제목 「개인정보처리방침」 · `/privacy-x` 는 여전히 `/login?next=` | e2e | `playwright test e2e/specs/auth-guards.spec.ts -g privacy` | ✅ 파일 존재 · 케이스 신규 |
| MOBILE-02b | 공개 경로 판정: `/privacy`·`/privacy/` 허용, `/privacyx` 차단, 기존 `/login`·`/auth/callback` 불변 | unit | `vitest --run src/lib/supabase/__tests__/public-path.test.ts` (판정 함수를 `isPublicPath` 로 추출해 export) | ❌ Wave 0 |
| MOBILE-02c | `/privacy` 페이지가 필수 섹션(처리 항목 · 목적 · 보유기간 · 위탁 · 국외 이전 · 권리 · 파기 · 안전성 · 쿠키/로컬 저장 · 책임자 · 시행일)을 렌더 · `metadata.title` | unit | `vitest --run src/app/privacy/__tests__/page.test.tsx` | ❌ Wave 0 |
| MOBILE-02d | 릴리스 사슬: dev sync 흔적이 있으면 `native:release:*` 가 fastlane 전에 멈춤 | smoke | `native:sync:dev` → `node scripts/verify-prod-config.mjs; test $? -eq 1` → `native:sync` → `verify-prod` exit 0 | ✅ 스크립트 존재 · 절차 신규 |
| MOBILE-02e | build.gradle 에 평문 비밀번호·기본값 없음 · env 없이 `assembleDebug` 통과 · env 없이 `bundleRelease` 즉시 실패(가드 메시지) | static + build | `! grep -nE "(store\|key)Password[^\n]*['\"]" android/app/build.gradle` · `./gradlew assembleDebug` · `./gradlew bundleRelease` 실패 메시지 grep | ❌ Wave 0 (`check-release-hygiene.sh`) |
| MOBILE-02f | versionCode 공식: 2026-09-27 00:49 → 609270049 · 2040-12-31 23:59 → 2012312359 < 2.1e9 · 연말→연초 단조 증가 | unit | `ruby mobile/fastlane/test/build_numbers_test.rb` (lane 함수를 `mobile/fastlane/build_numbers.rb` 로 추출해 두 Fastfile 이 require) | ❌ Wave 0 |
| MOBILE-02g | AAB 가 업로드 키로 서명 · 운영 URL 내장 · jarsigner 검증 | artifact | `bash mobile/scripts/check-aab.sh` | ❌ Wave 0 |
| MOBILE-02h | IPA: Apple Distribution(954QPCS3F5) · application-identifier · get-task-allow false · CFBundleVersion = 이번 빌드 번호 · ITSAppUsesNonExemptEncryption false · CAPACITOR_DEBUG≠true · 운영 URL | artifact | `bash mobile/scripts/check-ipa.sh` | ❌ Wave 0 |
| MOBILE-02i | 빌드 번호 무커밋: 릴리스 후 `git status --porcelain mobile/` 빈 출력(Info.plist·pbxproj·build.gradle 무변경) | smoke | `test -z "$(git status --porcelain mobile/)"` | 절차 신규 |
| MOBILE-02j | gitignore: 샘플 경로 전부 ignore(`App.ipa` · `x.aab` · `AuthKey_X.p8` · `play-store-key.json` · `a.mobileprovision` · `a.p12` · `key.properties` · `ios/App/fastlane/report.xml` · `ios/App/fastlane/README.md` · `vendor/bundle/x` · `.bundle/config`) · 추적 파일 중 비밀 패턴 0 | static | `check-release-hygiene.sh` 안 `git check-ignore -q` 반복 + `git ls-files mobile \| grep -E '\.(p8\|p12\|jks\|keystore\|mobileprovision)$'` 0줄 | ❌ Wave 0 |
| MOBILE-02k | 비밀 파일 권한: `~/.config/gh-trade/release` 700 · 파일 600 (내용 미열람) | static | `stat -f '%Lp' …` 비교 | ❌ Wave 0 (hygiene 스크립트) |
| MOBILE-02l | TestFlight 업로드 성공 · ASC 에 이번 빌드 번호 존재 | integration | lane exit 0 + `fastlane run latest_testflight_build_number …` = 기대값(처리 후) | 절차 신규 |
| MOBILE-02m | Play 내부 트랙에 이번 versionCode 존재 · SA 키 유효 | integration | `fastlane run validate_play_store_json_key …` · `fastlane run google_play_track_version_codes track:internal …` | 절차 신규 |
| MOBILE-02n | 테스터 기기에서 설치 → 네이티브 Google 로그인 → 홈 착지 (iOS TestFlight · Android Play 설치본) | manual | 아래 Manual-only | — |
| MOBILE-02o | 테스터 계정(dma_credentials 없음) `/trading` → `DmaGate` · 시세·주문 불가 | manual (+ 기존 e2e 커버) | 기존 `sidebar-tree.spec.ts` 가 unauthorized 게이트를 검증(21 이전) · 테스터 기기 수동 1회 | ✅ 기존 |

### Manual-only (자동화 불가 사유: 콘솔 UI · 사람 계정 · 실기기)
| 항목 | 누가 | 확인 방법 |
|------|------|-----------|
| 번들 ID Explicit 등록 · ASC 앱 레코드(이름 · 한국어 · SKU) | 사용자 | 포털/ASC 화면. 이름 선점 시 대안 선택 |
| ASC 내부 그룹 생성(자동 배포 ON) · 테스터 ASC 초대(Marketing · 앱 한정) → TestFlight 그룹 추가 | 사용자 | 테스터가 초대 수락 |
| Play 앱 생성 · 내부 테스트 테스터 목록(이메일) · 첫 AAB 수동 업로드 · **서명 키 선택** · 내부 테스트 출시 | 사용자 | Play Console. 선택한 서명 옵션 문구를 보고 |
| Play 앱 서명 인증서(들) SHA-1 복사/다운로드 → GCP Android OAuth 클라이언트 생성(각 SHA-1 · 업로드 키 SHA-1 포함) | 사용자 | GCP 콘솔 사용자 인증 정보 목록 |
| Play SA 이메일을 「사용자 및 권한」 에 초대(앱 권한: 테스트 트랙 출시 · 앱 정보 보기) | 사용자 | 이후 MOBILE-02m 자동 확인 |
| OAuth 동의 화면 게시 상태 확인 · 필요 시 테스트 사용자 추가(D-05) | 사용자 | GCP 콘솔 |
| 비밀 주입 `! bash mobile/scripts/setup-release-secrets.sh dir\|asc\|keystore\|backup\|play-sa` | 사용자 | 스크립트가 「OK」/SHA-1/SA 이메일만 출력 |
| `/privacy` 한글 초안 문안 검토 → 승인 | 사용자 | 승인 전 커밋·push 금지 |
| iPhone(TestFlight 설치본) 로그인 → 홈 · 재실행 · 로그아웃 후 재로그인 | 사용자(+Claude 로그 확인) | 실기기 mesya 또는 테스터 |
| Android(Play 설치본) 로그인 → 홈 · `adb logcat -s GoogleProvider` 의 `signingSha1` 이 GCP 등록값과 일치 | 사용자/Claude | 에뮬레이터 Play 스토어 로그인 + 내부 테스트 참여 링크 |
| 테스터 계정 `/trading` → DmaGate(실주문 금지) | 사용자 | 1회 |
| 두 번째 빌드 업로드 → 테스터 기기에 자동 업데이트 도착(D-03) | 사용자 | TestFlight 자동 배포 · Play 업데이트 |

### Sampling Rate
- **Per task commit:** 웹 태스크는 `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy src/lib/supabase` 를 돌린다. 네이티브 설정 태스크는 `bash mobile/scripts/check-release-hygiene.sh` + `node mobile/scripts/verify-prod-config.mjs` 를 돌린다.
- **Per wave merge:** 웹 full suite + typecheck + `auth-guards.spec.ts` 를 돌린다. 네이티브 Wave 는 `native:release:android:aab` + `check-aab.sh` 를 돌린다(업로드 없이).
- **Phase gate:** 위 전부 green 에 더해 iOS · Android 실제 업로드 1회씩(MOBILE-02l·m), 두 번째 빌드 업로드 1회(D-03 자동 업데이트), Manual-only 표 UAT 를 마친다 → `/gsd-verify-work 22`.

### Wave 0 Gaps
- [ ] `webapp/src/lib/supabase/__tests__/public-path.test.ts` + `isPublicPath` 추출(MOBILE-02b)
- [ ] `webapp/src/app/privacy/__tests__/page.test.tsx` (MOBILE-02c)
- [ ] `auth-guards.spec.ts` 에 `/privacy` 공개 · `/privacy-x` 차단 케이스(MOBILE-02a)
- [ ] `mobile/fastlane/build_numbers.rb` + `mobile/fastlane/test/build_numbers_test.rb` (MOBILE-02f) — Ruby 4 번들 minitest 사용
- [ ] `mobile/scripts/check-release-hygiene.sh` (MOBILE-02e·j·k)
- [ ] `mobile/scripts/check-ipa.sh` · `check-aab.sh` (MOBILE-02g·h)
- [ ] 프레임워크 설치: `cd mobile && bundle install` (fastlane 2.240.1) — 웹 쪽 추가 설치 없음

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture (비밀 경계) | yes | 비밀은 저장소 밖 `~/.config/gh-trade/release/`(700/600) + Secret Manager 백업. 저장소에는 경로·변수 이름만 둔다 |
| V2 Authentication | yes (무변경) | Google id_token → Supabase `signInWithIdToken` · nonce · `forcePrompt` 그대로. 릴리스는 OAuth 클라이언트 등록만 추가(aud 는 web 클라이언트 — `google-client-ids.ts:12-15`) |
| V3 Session Management | no (무변경) | 기존 `@supabase/ssr` 쿠키 |
| V4 Access Control | yes | `/privacy` 공개 prefix 는 경계 비교(`=== prefix` 또는 `prefix + '/'`)라 확장되지 않는다. 테스터 트레이딩은 relay `dma_credentials` allow-list(`relay/src/ws/fanout.ts:736-741` — unauthorized 연결의 모든 구독·전략 프레임 거부) |
| V5 Input Validation | no | 새 입력 표면 없음(정적 페이지) |
| V6 Cryptography | yes | 업로드 키 = `keytool` RSA-4096 PKCS12. 비밀번호 = `openssl rand`. 직접 구현 금지 |
| V7 Error Handling & Logging | yes | 래퍼·fastlane 로그에 비밀 금지. gradle 에 비밀 `-P` 금지. env 누락 시 **이름만** 출력. `print_command` 기본값 주의 |
| V8 Data Protection | yes | 개인정보처리방침이 실제 수집 항목과 일치해야 한다(코드 근거 표). DMA 비밀번호 AES-256-GCM 암호화 사실만 기재하고 구현은 무변경 |
| V10 Malicious Code (공급망) | yes | `Gemfile.lock` 커밋 · rubygems.org 단일 소스 · fastlane 공식 저장소 확인 |
| V14 Configuration | yes | `verify-prod` 게이트 + 산출물 검사(운영 URL · cleartext 없음 · `CAPACITOR_DEBUG` 없음 · `get-task-allow` false) · `.gitignore` 보강 · 문서에 비밀 기재 금지 |

### Known Threat Patterns for 모바일 릴리스 파이프라인
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 업로드 키스토어·비밀번호 유출 | Spoofing/Tampering | 저장소 밖 600 파일 · git ignore · Secret Manager(접근 IAM 최소) · 유출 시 Play 「업로드 키 재설정」(Google 이 앱 서명 키를 쥐므로 복구 가능) |
| ASC API 키(.p8) 유출 | Elevation | 600 파일 · 유출 시 ASC 에서 키 폐기(Revoke) · 필요 시 GH Trade 전용 App Manager 키로 교체 |
| Play SA JSON 유출 | Elevation | 앱 단위 최소 권한(테스트 트랙 출시만) · 유출 시 GCP 에서 키 삭제 |
| 비밀번호가 CI/로컬 로그·셸 히스토리에 남음 | Info Disclosure | `keytool -storepass:env` · env 파일 `source` · fastlane `-P` 에 비밀 금지 · 래퍼가 값 비출력 |
| dev URL·cleartext·웹 인스펙터가 켜진 빌드 배포 | Info Disclosure/Tampering | `cap sync`(양쪽) → `verify-prod` → 산출물 검사(IPA/AAB 안 설정·플래그) |
| 빌드 번호 파일 변경이 커밋에 섞임 | Tampering(무결성) | xcargs · gradle property 주입 · 릴리스 후 `git status` 빈지 확인 |
| 테스터가 실돈 주문 경로 접근 | Elevation | `dma_credentials` 미발급(D-04) · relay 서버측 거부 |
| 개인정보처리방침 부정확(실제보다 적게 기재) | Repudiation/법적 | 코드 근거 표 기반 초안 + 사용자 검토 게이트 |

## Sources

### Primary (HIGH confidence — 이번 세션 직접 Read · 실측)
- gh-radar:
  - `.planning/phases/22-…/22-CONTEXT.md` · `22-DISCUSSION-LOG.md` · `21-RESEARCH.md` · `21-36-SUMMARY.md`
  - `mobile/README.md` · `package.json` · `capacitor.config.ts` · `scripts/verify-prod-config.mjs` · `scripts/check-sim-entitlements.sh`
  - `mobile/.gitignore` · `android/.gitignore` · `ios/.gitignore` · `ios/debug.xcconfig`
  - `ios/App/App.xcodeproj/project.pbxproj`(215-371) · `ios/App/App/Info.plist` · `ios/App/CapApp-SPM/Package.swift` · `Package.resolved` · `ios/App/App/ThemeStore.swift:12,16`
  - `android/app/build.gradle` · `variables.gradle` · `build.gradle` · `app/src/main/AndroidManifest.xml`
  - `webapp/src/lib/native/google-client-ids.ts` · `native-google-login.ts` · `lib/supabase/middleware.ts` · `middleware.ts` · `app/layout.tsx` · `app/login/page.tsx` · `app/design/page.tsx` · `components/layout/center-shell.tsx` · `lib/auth-context.tsx` · `e2e/specs/auth-guards.spec.ts` · `vercel.json`
  - `scripts/vercel-ignore-build.sh` · `scripts/dma-credentials.sh`
  - `supabase/migrations/{watchlists,theme_tables,chat_conversations,dma_credentials,dma_orders}.sql` 해당 행
  - `relay/src/store/credentials.ts` · `relay/src/ws/fanout.ts:730-745` · `server/src/services/specialists/anthropic-client.ts` · 루트 `.gitignore` · `.planning/REQUIREMENTS.md` · `ROADMAP.md` Phase 22
- weekly-wine-app:
  - `ios/App/fastlane/{Fastfile,Appfile,report.xml,README.md}` · `ios/App/Gemfile` · `Gemfile.lock`(fastlane 2.232.2 · BUNDLED WITH 4.0.8)
  - `android/fastlane/{Fastfile,Appfile}` · `android/Gemfile`
  - `docs/android-deploy.md`(비밀번호 값 미전재) · `.gitignore` · `package.json` · `ios/App/App/Info.plist`
  - `android/app/build.gradle` 서명 블록(값 가림) · git 이력(`88ffff7`) · `App.ipa` 목록
- fastlane 소스:
  - 2.232.2(weekly-wine vendor): `sigh/lib/sigh/runner.rb` · `produce/lib/produce/itunes_connect.rb` · `gym/.../package_command_generator_xcode7.rb` · `fastlane/actions/gradle.rb` · `validate_play_store_json_key.rb`
  - 2.240.1(GitHub raw): `gym/lib/gym/options.rb:112-121` · `module.rb` · `package_command_generator_xcode7.rb:185-200`
- `@capgo/capacitor-social-login@8.5.11` `GoogleProvider.java:63,103-160` · `Package.swift` / `@capacitor/ios@8.5.2` `CAPInstanceDescriptor.swift:137-147`
- 실측:
  - Xcode·서명: `xcodebuild -version` · `-license check` · `-checkFirstLaunchStatus` · `-help`(method · allowProvisioningUpdates · authenticationKey*) · `xcrun --find altool` · `security find-identity` · 인증서 만료 · 프로파일 목록 · 아이콘 alpha
  - Ruby·번들러: `ruby`/`bundle` 버전 · 번들러 상위 Gemfile 탐색(scratchpad)
  - Android·JDK: `keytool`/`jarsigner`/`apksigner`
  - GCP: `gcloud secrets list` · `projects describe` · org-policy · `services list`
  - rubygems API(fastlane 2.240.1)

### Secondary (MEDIUM — 공식 문서 인용)
- https://docs.fastlane.tools/actions/gym/ · https://docs.fastlane.tools/actions/upload_to_play_store/ — 첫 빌드 수동 업로드 · release_status
- https://github.com/fastlane/fastlane/releases — 2.238.0 Ruby 4 · 2.239.0 Ruby 3.1 최소 · 2.240.0/2.240.1
- https://developer.android.com/studio/publish/versioning — versionCode 상한 2100000000
- https://support.google.com/googleplay/android-developer/answer/9842756 — Play App Signing · 양자 대비 하이브리드 서명 · 3키 지문 등록 · 업로드 키 재설정
- https://developers.google.com/android-publisher/getting_started — SA 초대 · 프로젝트 연결 불필요
- https://support.google.com/cloud/answer/15549945 — OAuth 게시 상태 Testing(100명) · 기본 범위 예외
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers — 내부 테스터 역할 · 100명 · 자동 배포 · 90일
- https://developer.apple.com/help/app-store-connect/manage-your-team/add-and-edit-users — 초대 3일 만료 · 앱 접근 제한
- https://developer.apple.com/news/?id=pvszzano — 2024-05-01 privacy manifest 요건
- https://support.google.com/googleplay/android-developer/answer/14151465 — 12명·14일 비공개 테스트(프로덕션 접근 전용)
- https://support.google.com/googleplay/android-developer/answer/9845334 — 앱 설정 미완료여도 내부 테스트 릴리스 가능

### Tertiary (LOW — 커뮤니티 · 단일 출처)
- https://github.com/react-native-google-signin/google-signin/issues/1525 — 양자 대비 서명 × DEVELOPER_ERROR(2026-09-25 · 미해결)
- https://vmobify.com/blog/play-app-signing-sha1-google-sign-in — 콘솔 지문 표시 함정(2026-08-29)
- https://capgo.app/docs/plugins/social-login/troubleshooting/ · https://github.com/Cap-go/capacitor-social-login/issues/422 — [28444] 원인
- https://github.com/fastlane/fastlane/discussions/18293 · https://github.com/fastlane/fastlane/issues/21491 — draft app 오류
- https://www.avanderlee.com/xcode/missing-api-declaration-required-reason-itms-91053/ — ITMS-91053
- https://blakecrosley.com/blog/xcode-27-release · https://discuss.circleci.com/t/xcode-27-released/54879 — Xcode 27 GA 빌드

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 버전과 동작을 로컬 실측, 레지스트리, fastlane 소스로 확인했다.
- Architecture (lane · gradle · 스크립트 사슬): HIGH(iOS — weekly-wine 실증 + 소스) / MEDIUM(Android — 원본 미검증, Groovy 가드는 실행 단계 검증 필요).
- Pitfalls: HIGH(1·2·3·7·8·12 — 실측·소스) / MEDIUM(4·6·9·10·13) / LOW(5·11·14).
- 콘솔 절차: MEDIUM — 공식 도움말 인용. 실제 화면 라벨은 사용자 작업 때 보고받는다.
- 개인정보처리방침 법적 구성: LOW — 사용자 검토 게이트 필수.

**Research date:** 2026-09-27
**Valid until:** 2026-10-11 (14일 — Play 양자 대비 서명(베타)·fastlane 주 단위 릴리스·Xcode 27 초기라 변동이 빠르다)

---

## 재범위 부록: Android Firebase App Distribution APK (2026-09-27)

**Researched:** 2026-09-27 (부록 · 위 본문은 그대로 두고 덧붙인다)
**Scope:** CONTEXT 「재범위」 절 D-13~D-18 이 D-02·D-03·D-08·D-10 의 Android 부분을 대체한다. 이 부록은 (1) Android 업로드 키 서명 APK → Firebase App Distribution 경로와 (2) 옛 22-05~22-07(현재 `.planning/phases/23-gh-trade-play/from-phase-22/`)에서 Phase 22 에 남는 iOS·공통 항목을 다룬다.
**Confidence:** 세 등급이다.
- **HIGH:** 이번 세션 실측 — 플러그인 gem 1.0.0 소스 Read, scratchpad 에서 `bundle lock`·`bundle install`·`fastlane action firebase_app_distribution` 실행, `gcloud iam roles describe`, `gcloud projects get-iam-policy`, org 정책 effective 조회, debug APK 에 `apksigner`·`keytool`·`jarsigner`·`aapt2` 실행, 저장소 파일 Read.
- **MEDIUM:** Firebase · Android 공식 문서 인용(2026-09-16~09-24 갱신본).
- **LOW:** 콘솔 화면 라벨, Play Protect 경고 문구, 2027 전 세계 적용일.

> **부록에서 가장 중요한 발견 10가지** (플래너가 먼저 읽을 것)
> 1. **fastlane 플러그인 `fastlane-plugin-firebase_app_distribution` 1.0.0 이 현재 잠금(fastlane 2.240.1 · Homebrew Ruby 4.0.2)에 그대로 얹힌다.** scratchpad 복사본에서 `mobile/Gemfile` 에 한 줄을 더하고 `bundle lock` 을 돌렸다. 추가되는 gem 은 3개뿐이고 fastlane 2.240.1 은 그대로다. 이어 `bundle exec fastlane action firebase_app_distribution` 로 플러그인 로드를 확인했다. 플러그인 요구는 Ruby >= 3.2, fastlane >= 2.232.0 이다.
> 2. **`fastlane add_plugin` 을 쓰지 말고 `mobile/Gemfile` 에 `gem` 줄을 직접 더한다.** fastlane 은 플러그인을 Gemfile 의 의존성 이름 가운데 `fastlane-plugin-` 로 시작하는 것에서 찾는다(`plugin_manager.rb` `available_gems` · `available_plugins`). 그래서 Pluginfile 이 필요 없다. `add_plugin` 은 `android/fastlane/Pluginfile` 을 만들고, Bundler 가 찾은 `mobile/Gemfile` 에 `fastlane/Pluginfile` 상대 경로를 붙인다. 두 경로가 어긋난다.
> 3. **업로드 인증은 `service_credentials_file` 을 반드시 명시한다.** 이 맥의 `~/.zshrc:28` 이 `GOOGLE_APPLICATION_CREDENTIALS` 를 deployer SA 키로 export 한다. 이 SA 는 gh-radar 의 **`roles/owner`** 다. 플러그인은 파일 인자가 없으면 `FIREBASE_TOKEN` → 캐시된 firebase-tools 토큰 → **ADC** 순서로 떨어진다. 인자를 빠뜨리면 조용히 owner 키로 업로드한다.
> 4. **전용 SA(`roles/firebaseappdistro.admin` 하나)를 권장한다. deployer SA 는 재사용하지 않는다.** 이 역할(GA)의 권한은 App Distribution 릴리스·테스터·그룹과 프로젝트/클라이언트 조회뿐이다. `setup-release-secrets.sh` 에 `firebase-sa` stage 를 더해 사용자 `!` 한 줄로 만든다. play-sa 와 같은 관례다. org 정책 `iam.disableServiceAccountKeyCreation` 은 비강제, `iam.allowedPolicyMemberDomains` 는 `allValues: ALLOW` 임을 실측했다.
> 5. **v2 전용으로 서명된 APK 는 `keytool`·`jarsigner` 로 검사할 수 없다. `check-aab.sh` 를 복사하면 안 된다.** AGP 8.13 은 `minSdkVersion = 24` 에서 v1(JAR) 서명을 끈다. 실측한 debug APK 는 v2 만 true 였다. 이 APK 에서 `keytool -printcert -jarfile` 은 **빈 출력**, `jarsigner -verify` 는 **`no manifest.`** 였다. `check-apk.sh` 는 `apksigner verify --print-certs`(build-tools 36.1.0)와 `aapt2 dump badging` 을 쓴다. APK 안 설정 경로도 AAB 의 `base/assets/…` 가 아니라 `assets/capacitor.config.json` 이다.
> 6. **플러그인의 기본 APK 경로는 쓰지 말고 `android_artifact_path` 로 명시한다.** 기본 경로는 fastlane `gradle` 액션의 `GRADLE_APK_OUTPUT_PATH` 다. 이 값은 `build/outputs/apk/**` 전체(debug 포함)에서 **mtime 이 가장 최근인 APK** 다. `assembleRelease` 가 up-to-date 로 건너뛰어지면 debug APK 가 선택될 수 있다.
> 7. **gh-radar 에 Firebase 를 붙이면 되돌릴 수 없고, 부수 효과가 문서화돼 있다.**
>    - API 약 15개가 켜진다(Identity Toolkit · FCM · Hosting · App Engine Admin 등).
>    - SA 2개(`service-<번호>@gcp-sa-firebase` · `firebase-adminsdk-xxxxx@gh-radar`)와 「Browser」 API 키, `firebase:enabled` 라벨이 생긴다.
>    - 결제가 켜진 프로젝트라 Blaze 요금제가 된다. App Distribution 은 Spark·Blaze 모두 무료 제품이다.
>    - 기존 Cloud Run·Secret Manager·IAM 바인딩을 바꾼다는 기술은 없다.
>    - D-17 기본값(gh-radar)은 유지해도 된다. 다만 체크포인트 본문에 이 목록을 그대로 보여 주고 사용자 확인을 받는다.
> 8. **앱에 Firebase SDK · `google-services.json` 은 필요 없다(D-17 확인).** 업로드에는 Firebase 앱 ID 와 콘솔 App Distribution 「시작하기」 온보딩만 필요하다. 온보딩을 안 하면 플러그인이 `INVALID_APP_ID` 를 낸다. **함정:** `build.gradle:81-88` 은 `google-services.json` 이 있으면 google-services 플러그인을 적용한다. 그런데 `android/.gitignore:65` 에서 그 ignore 줄이 **주석 처리**돼 있다. 콘솔이 내려 주는 파일을 `android/app/` 에 두면 빌드가 바뀌고 커밋까지 될 수 있다. 위생 검사에 부재 확인을 넣는다.
> 9. **Firebase 앱 등록 때 SHA-1 칸은 비워 둔다. Android OAuth 클라이언트는 GCP 콘솔에서만 만든다.**
>    - 「패키지명 + SHA-1」 쌍은 모든 Firebase·GCP 프로젝트를 통틀어 유일해야 한다.
>    - Firebase 에 SHA-1 을 넣으면 OAuth 클라이언트가 자동 생성될 수 있다.
>    - 여기에 GCP 콘솔 수동 생성이 겹치면 「An OAuth2 client already exists…」 가 난다.
>    - 등록할 클라이언트는 업로드 키 SHA-1 `2F:E3:…:7B:7D` 하나다(D-14). 코드 변경은 없다. id_token aud 는 웹 클라이언트다(`native-google-login.ts:99` `webClientId: GOOGLE_WEB_CLIENT_ID`).
> 10. **사이드로드 개발자 인증은 한국에서 아직 적용되지 않는다(2026-09-27 기준 · 시한부).**
>     - 2026-09-30 적용 대상은 브라질·인도네시아·싱가포르·태국의 **참여 스토어 설치**다.
>     - 공식 FAQ(2026-07-15)는 「다른 스토어나 직접 사이드로드에는 아직 적용되지 않는다」 고 적는다.
>     - 2027 전 세계 확대 뒤에는 미등록 앱의 사이드로드 설치가 막힌다. 예외는 ADB 와 advanced flow(24시간 대기)다.
>     - Android Developer Console 은 한 패키지에 **서명 키를 여러 개** 등록하게 해 준다. 따라서 Play 개발자 인증이 끝난 뒤 업로드 키 인증서도 `com.ghtrade.app` 에 등록하면, Firebase APK 경로가 2027 뒤에도 살 수 있다 [CITED · 절차 세부는 ASSUMED].

### 부록 — 남은 작업 재정리 (플래너용 인벤토리)

| # | 작업 | 출처(옛 플랜) | 성격 | 비고 |
|---|------|---------------|------|------|
| R1 | Firebase 프로젝트 결정(D-17) · Firebase 추가 · Android 앱 `com.ghtrade.app` 등록(SHA-1 칸 비움) · App Distribution 「시작하기」 · 테스터 그룹 생성(별칭) · 테스터 이메일 추가 | 신규(D-13·D-17) | 사용자 콘솔(checkpoint:decision + human-action) | 앱 ID(공개 식별자)를 재개 신호로 받는다 |
| R2 | `setup-release-secrets.sh firebase-sa` stage — API 사용 설정 · 전용 SA · 역할 바인딩 · 키 600 | 신규(D-17 · 부록 Pattern F4) | Claude 작성 → 사용자 `!` 실행 | 출력은 SA 이메일뿐 |
| R3 | Gemfile 플러그인 · Fastfile lane `firebase` · `firebase_latest` · `release-android.sh` 모드 · `check-apk.sh` · package.json 재배선 · 위생 검사 보강 | 신규(D-14·D-15·D-16) | auto(TDD 가능한 부분은 TDD) | AAB lane·`native:release:android:aab`·`play-sa` 는 보존(D-16) |
| R4 | GCP Android OAuth 클라이언트(업로드 키 SHA-1 하나) · OAuth 동의 화면 게시 상태 확인(D-05) | 옛 22-06 Task 1 의 3·4 단계(앱 서명 SHA-1 부분 제외) | 사용자 콘솔 | 기존 debug 클라이언트는 그대로 둔다 |
| R5 | ASC 테스터 초대(Marketing · 앱 한정) → TestFlight 내부 그룹 추가 | 옛 22-06 Task 1 의 5단계 | 사용자 콘솔 | 본문 Pitfall 6 |
| R6 | iOS lane `latest` · `release-ios.sh latest` 모드 · TestFlight 처리 완료 확인(22-01 빌드 `202609270252`) | 옛 22-06 Task 2 ①②⑤ | auto | 현재 `release-ios.sh` 에 MODE 분기 없음 · Fastfile 에는 `lane :beta` 하나 [VERIFIED: grep] |
| R7 | 첫 Firebase APK 업로드 → 로컬 에뮬레이터 사이드로드 로그인 스모크 → 테스터 설치 UAT | 옛 22-06 Task 2 ③④ 대체 | auto + manual | 부록 Pitfall F7 (debug 설치본 먼저 제거) |
| R8 | `mobile/README.md` 「릴리스」 절(TestFlight · Firebase APK) · 테스터 안내(iOS 3단계 · Android 4단계) · 비밀 파일 · 범위 밖 갱신 · `google-client-ids.ts` 주석 갱신(업로드 키 SHA-1 만 · 상수 무변경) | 옛 22-06 Task 3 | auto | Play 문구는 「Phase 23」 으로 |
| R9 | 전 자동 게이트 + 두 번째 릴리스(iOS · Android Firebase) — 번호 엄격 증가 · 저장소 무변경 · 테스터 업데이트 UAT | 옛 22-07 Task 1 | auto + manual | Android 는 「새 빌드 메일 → 탭 → 덮어 설치」(D-15) |
| R10 | push(=웹 프로덕션 배포) 결정 · 시행일 자리표시 4곳 채움 · 운영 `/privacy` 200 확인 | 옛 22-07 Task 2·3 · 22-03 SUMMARY 인계 | checkpoint:decision(blocking-human) + auto | origin/master 보다 로컬이 22커밋 앞섬 [VERIFIED: `git log --oneline origin/master..HEAD \| wc -l` = 22] |
| R11 | ROADMAP/REQUIREMENTS/STATE 정정(Phase 22 이름·목표의 Play → Firebase APK) | 재범위 | main tree 직접 편집(메모리 규칙) | REQUIREMENTS MOBILE-02 는 이미 재범위 문구가 붙어 있다 [VERIFIED: REQUIREMENTS.md:112] |

### 부록 — Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOBILE-02 | GH Trade 테스트 배포 — iOS TestFlight 내부 테스터 · Android **Firebase App Distribution(업로드 키 서명 APK)** 으로 `com.ghtrade.app` 을 5명 미만 지인 기기에 설치 가능하게 한다. 2026-09-27 재범위로 Play 앱 서명과 앱 서명 SHA-1 등록은 Phase 23 으로 넘어갔고, Phase 22 에서는 업로드 키 SHA-1 만 등록한다(REQUIREMENTS.md:112 요지) | Pattern F1~F7 · Pitfall F1~F12 · Validation(부록) V-F1~V-F16. iOS 쪽은 본문 Pattern 1 · Pitfall 6 · MOBILE-02h/l 과 R5·R6 |

### 부록 — Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| APK 빌드 · 업로드 키 서명 · versionCode 주입 | 로컬 빌드 머신(Gradle · fastlane) | — | 22-04 의 env 서명 gradle 을 그대로 쓴다(D-14). `assembleRelease` 만 추가 |
| 산출물 검사(서명 SHA-1 · 운영 URL · debuggable · versionCode) | 로컬 셸 스크립트(`check-apk.sh`) | — | 업로드 전 마지막 게이트 |
| 배포 · 테스터 알림 · 설치 링크 | Firebase App Distribution(외부 SaaS) | 테스터 브라우저 · App Tester | Play 불필요(D-13) |
| 업로드 인증 | GCP IAM(전용 SA · `roles/firebaseappdistro.admin`) | 저장소 밖 키 파일 600 | owner 키 재사용 금지(Pitfall F2) |
| 네이티브 Google 로그인 서명 확인 | GCP Google Auth Platform(Android OAuth 클라이언트 = 패키지 + 업로드 SHA-1) | Supabase(웹 클라이언트 aud 검증 · 무변경) | 코드 변경 없음(D-14) |
| 테스터의 실돈 주문 차단 | relay(`dma_credentials` allow-list) | 웹 `DmaGate` | 무변경(D-04) |

### 부록 — Standard Stack

#### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `fastlane-plugin-firebase_app_distribution` | **1.0.0** (rubygems 2026-03-04 · `required_ruby_version >= 3.2` · runtime `fastlane >= 2.232.0`) | lane 에서 APK 업로드 · 그룹 배포 · 릴리스 노트 · 최신 릴리스 조회(`firebase_app_distribution_get_latest_release`) | Firebase 공식 문서가 안내하는 fastlane 경로다 [CITED: firebase.google.com/docs/app-distribution/android/distribute-fastlane · 2026-09-24 갱신]. 이미 있는 `mobile/Gemfile`·Homebrew Ruby·`bundle exec` 패턴에 그대로 들어간다 [VERIFIED: scratchpad `bundle lock`·`bundle install`·`fastlane action` 실행] |
| fastlane | 2.240.1 (기존 잠금 유지) | lane 실행 | [VERIFIED: `mobile/Gemfile.lock` `fastlane (2.240.1)` · 플러그인 추가 뒤에도 변동 없음] |
| Android build-tools `apksigner` · `aapt2` | 36.1.0 (`$ANDROID_HOME/build-tools/36.1.0`) | APK 서명 인증서 · v2 검증 · versionCode · debuggable 검사 | v2 전용 APK 는 JDK `keytool`·`jarsigner` 로 볼 수 없다 [VERIFIED: 실측 · Pitfall F4] |
| Gradle `assembleRelease` (AGP 8.13.0) | 기존 | 업로드 키 서명 APK | 22-04 env 서명 설정을 그대로 탄다 [VERIFIED: `android/build.gradle:10` `classpath 'com.android.tools.build:gradle:8.13.0'` · `app/build.gradle:6` · `:76`] |

#### Supporting (플러그인이 끌어오는 gem · scratchpad 잠금 diff 로 확인)
| Gem | Version | Note |
|-----|---------|------|
| `google-apis-firebaseappdistribution_v1` | 0.22.0 | `google-apis-core (>= 0.15.0, < 2.a)` — 잠금의 `google-apis-core (1.2.5)` 와 호환 |
| `google-apis-firebaseappdistribution_v1alpha` | 0.30.0 | 같은 제약 |

#### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastlane 플러그인 | Firebase CLI `firebase appdistribution:distribute` | 로컬에 CLI 가 없다(`command -v firebase` 없음). npm 전역 설치(firebase-tools 15.31.0)가 늘고 lane 패턴에서 벗어난다. 인증은 같은 SA 키(`GOOGLE_APPLICATION_CREDENTIALS`)를 쓴다. `login:ci` 토큰(`FIREBASE_TOKEN`)은 firebase-tools 가 deprecated 로 표시한다 [CITED: github.com/firebase/firebase-tools/discussions/6283 · MEDIUM] |
| fastlane 플러그인 | Gradle 플러그인 `com.google.firebase.appdistribution` | `build.gradle` 에 Firebase 플러그인·설정이 들어간다 → 「Remote-URL 셸 무변경 · 앱에 Firebase 없음」(D-17)과 충돌 |
| fastlane 플러그인 | 콘솔 수동 업로드(드래그) | 첫 1회 디버깅용으로만 쓴다. 반복 절차(D-15 「명령 한 번」)를 만족하지 못한다 |
| 전용 SA | deployer SA 재사용(`service_credentials_file` = deployer 키) | 준비가 0단계라는 장점이 있다. 그러나 `roles/owner` 키가 릴리스 도구에 넘어간다 → T-22-10 과 같은 최소 권한 원칙에 어긋난다 |
| gh-radar 에 Firebase 추가(D-17 기본) | 새 GCP 프로젝트(예: `gh-trade-dist`)에 Firebase — 결제 없음 = Spark | **장점:** 운영 프로젝트에 부수 효과가 없고, 프로젝트째 삭제할 수 있다. **단점:** deployer SA 에 권한이 없어 SA 생성을 사용자 계정 gcloud(`CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE= …`)로 해야 하고, 관리할 프로젝트가 하나 늘어난다. 어느 쪽이든 앱에는 SDK 가 없으므로 OAuth 클라이언트(gh-radar)와는 무관하다 |

**설치(실행 단계):**
```bash
# mobile/Gemfile 에 한 줄 추가 후 — `fastlane add_plugin` 금지(Pitfall F1)
cd mobile && PATH=/opt/homebrew/opt/ruby/bin:$PATH bundle install   # BUNDLE_PATH vendor/bundle (기존 .bundle/config)
```

### 부록 — Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `fastlane-plugin-firebase_app_distribution` | rubygems | 첫 공개 수년 전 · 1.0.0 = 2026-03-04 | 누적 55,422,974 | github.com/fastlane/fastlane-plugin-firebase_app_distribution (Firebase 공식 문서가 링크) | seam 미지원(rubygems) → 수동 신호 OK | Approved — 공식 문서 + 레지스트리 + 소스 Read |
| `google-apis-firebaseappdistribution_v1` | rubygems | 0.22.0 = 2026-08-02 | 누적 29,371,975 | googleapis/google-api-ruby-client(생성 클라이언트) | 수동 신호 OK | Approved(전이 의존성) |
| `google-apis-firebaseappdistribution_v1alpha` | rubygems | 0.30.0 = 2026-07-26 | 누적 25,551,056 | 같음 | 수동 신호 OK | Approved(전이 의존성) |
| `firebase-tools` (대안 · 권장 안 함) | npm | 15.31.0 = 2026-09-23 | 주 3,341,666 | github.com/firebase/firebase-tools | **SUS**(사유 `too-new` — 최신 버전이 4일 전 공개) · postinstall 없음 | 설치하지 않는다. 대안 경로를 택하면 `checkpoint:human-verify` 필요 |

**Packages removed due to [SLOP] verdict:** 없음.
**Packages flagged as suspicious [SUS]:** `firebase-tools`(권장 경로 아님).
- `gsd-tools package-legitimacy check` 는 rubygems 를 받지 않는다. 사용법은 `--ecosystem <npm|pypi|crates>` 이고, 실행하면 에러가 난다.
- 그래서 rubygems 3종은 rubygems API(`/api/v1/gems/*.json` · `/api/v2/rubygems/*/versions/1.0.0.json`)의 버전·날짜·다운로드·의존성으로 대신 확인했다. Firebase 공식 문서의 안내와 교차 확인도 했다.

### 부록 — Architecture Patterns

#### System Architecture Diagram (Android 재범위)
```
[Claude: pnpm --filter @gh-radar/mobile run native:release:android]
      │
      ▼
 cap sync (iOS+Android 운영 설정) ──► verify-prod-config.mjs ──(FAIL)──► 중단
      │ PROD CONFIG OK
      ▼
 release-android.sh firebase
      │  android.env source(값 비출력) · 키 이름/키스토어/SA JSON 존재 확인 ──(누락)──► exit 3 + `!` 주입 안내
      │  GOOGLE_APPLICATION_CREDENTIALS 해제(ADC 폴백 차단)
      ▼
 fastlane lane firebase (mobile/android)
      │  versionCode = (연도−2020)·10^8 + MMDDHHmm
      │  gradle assembleRelease -PghtradeVersionCode=…  (서명 = build.gradle 이 env 로 직접)
      │  → android/app/build/outputs/apk/release/app-release.apk
      ▼
 check-apk.sh ──(FAIL: 서명 SHA-1≠업로드 · debuggable · dev URL · versionCode 불일치)──► 업로드 안 함
      │ APK CHECK OK
      ▼
 firebase_app_distribution(app: <Firebase 앱 ID>, android_artifact_path: 명시, groups: 별칭,
                           service_credentials_file: 전용 SA 키, release_notes: vc·git SHA)
      │  (Firebase App Distribution API · 전용 SA roles/firebaseappdistro.admin)
      ▼
 Firebase ──► 테스터 이메일(첫 배포 = 초대 · 이후 = 새 빌드 알림)
                 │
                 ▼
        테스터 폰: 초대 수락(Google 계정) → (선택) App Tester → 「이 출처 허용」 → 설치/덮어 설치
                 │
                 ▼
        GH Trade(WebView → https://trade.jx1.io) → 네이티브 Google 로그인
                 │  Credential Manager: 패키지+서명 SHA-1 ↔ GCP Android 클라이언트(업로드 SHA-1)
                 ▼  id_token(aud = 웹 클라이언트) → Supabase(무변경)
```

#### 인용 근거 — 이번 세션에 Read 한 저장소 값 (아래 스켈레톤의 모든 기존 값은 여기서 나온다)
- `mobile/android/app/build.gradle:6` — `def ghtradeUploadStoreFile = System.getenv("GHTRADE_UPLOAD_STORE_FILE")`
- `mobile/android/app/build.gradle:76-77`:
  - `    if (!ghtradeUploadStoreFile && graph.allTasks.any { it.name in ["bundleRelease", "assembleRelease"] }) {`
  - `        throw new GradleException("GHTRADE_UPLOAD_STORE_FILE 없음 — 릴리스 AAB 는 native:release:android(:aab) 로만 만든다 (D-08)")`
- `mobile/android/app/build.gradle:81-88`:
  - `    def servicesJSON = file('google-services.json')`
  - `        apply plugin: 'com.google.gms.google-services'`
- `mobile/android/.gitignore:64-65` — `# Google Services (e.g. APIs or Firebase)` / `# google-services.json` (주석 → **ignore 안 됨**)
- `mobile/android/variables.gradle:2` — `    minSdkVersion = 24`
- `mobile/android/fastlane/Fastfile:10` — `require File.expand_path("../../fastlane/build_numbers.rb", __dir__)`
- `mobile/android/fastlane/Fastfile:29` — `  [lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH], vc]`
- `mobile/android/fastlane/Fastfile` lanes — `lane :build do` (34) · `lane :beta do` (40) · `lane :validate do` (56) · `lane :track do` (61)
- `mobile/android/fastlane/Appfile:3-4` — `json_key_file(ENV["GOOGLE_PLAY_JSON_KEY"])` / `package_name("com.ghtrade.app")`
- `mobile/scripts/release-android.sh`:
  - `:36` — `MODE="${1:-beta}"`
  - `:38` — `  beta|build|validate|track|check) ;;`
  - `:48` — `ENV_FILE="${GHTRADE_RELEASE_ENV:-$HOME/.config/gh-trade/release/android.env}"`
  - `:50` — `INJECT_PLAY="! bash mobile/scripts/setup-release-secrets.sh play-sa"`
  - `:119` — `(cd android && bundle exec fastlane "$MODE")`
- `mobile/scripts/check-aab.sh`:
  - `:18` — `PROD_URL="https://trade.jx1.io"   # verify-prod-config.mjs PROD_URL 과 같은 값`
  - `:44` — `keytool -printcert -jarfile` 경로
  - `:61` — `-verify "$AAB"` / `grep -q "jar verified"`
  - `:66` — `base/assets/capacitor.config.json`
- `mobile/scripts/setup-release-secrets.sh`:
  - `:269` — `  local sa_name="gh-radar-play-publisher" sa_email key="$REL/play-service-account.json" err`
  - `:317` — `    dir | asc | keystore | backup | play-sa) ;;`
- `mobile/scripts/check-release-hygiene.sh:58` — 추적 파일 패턴 `…|play-store-key\.json$|service-account[^/]*\.json$'`
- `mobile/package.json:18-19`:
  - `"native:release:android": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh",`
  - `"native:release:android:aab": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh build"`
- `mobile/Gemfile:5` — `gem "fastlane", "~> 2.240"`
- `webapp/src/lib/native/native-google-login.ts:99` — `      webClientId: GOOGLE_WEB_CLIENT_ID,`
- 업로드 인증서 SHA-1(공개 지문): `2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D` (22-04-SUMMARY key-decisions · CONTEXT D-14)

새로 제안하는 이름(아직 저장소에 없음 · [ASSUMED] 제안값): 모드 `firebase` · `firebase-latest` · `check-apk`, lane `firebase` · `firebase_latest`, stage `firebase-sa`, SA `gh-trade-appdistro`, 키 파일 `firebase-appdistro-service-account.json`, 그룹 별칭 `ghtrade-testers`, npm 스크립트 `native:release:android:play`.

#### Pattern F1: Gemfile 한 줄 (Pluginfile 없음)
```ruby
# mobile/Gemfile — 기존 `gem "fastlane", "~> 2.240"` 아래
# Phase 22 재범위(D-13) — Android APK 를 Firebase App Distribution 으로. iOS lane 에도 로드되지만 무해하다.
gem "fastlane-plugin-firebase_app_distribution", "~> 1.0"
```
fastlane 은 Gemfile 의존성 이름에서 `fastlane-plugin-` 접두사로 플러그인을 찾는다. 근거는 `vendor/bundle/…/fastlane-2.240.1/fastlane/lib/fastlane/plugins/plugin_manager.rb:55-67` 의 `available_gems` → `dsl.dependencies.map(&:name)`, `available_plugins` → `start_with?(self.class.plugin_prefix)` 다. scratchpad 에서 이 한 줄만으로 「Used plugins」 표에 `fastlane-plugin-firebase_app_distribution 1.0.0` 이 나오는 것을 확인했다 [VERIFIED].

#### Pattern F2: Android lane `firebase` · `firebase_latest` (기존 4 lane 보존 · D-16)
```ruby
# mobile/android/fastlane/Fastfile — 기존 require · ghtrade_build_release_aab · lanes build/beta/validate/track 는 그대로 두고 덧붙인다.
# Firebase 앱 ID 는 공개 식별자다(google-client-ids.ts 선례 — 문자열 리터럴로 커밋). R1 체크포인트 재개 신호로 받는다.
GHTRADE_FIREBASE_ANDROID_APP_ID = "1:<프로젝트번호>:android:<해시>" # [ASSUMED 형식] — 실제 값으로 교체
GHTRADE_RELEASE_APK = File.expand_path("../app/build/outputs/apk/release/app-release.apk", __dir__)

def ghtrade_build_release_apk
  missing = %w[GHTRADE_UPLOAD_STORE_FILE GHTRADE_UPLOAD_STORE_PASSWORD GHTRADE_UPLOAD_KEY_ALIAS GHTRADE_UPLOAD_KEY_PASSWORD]
            .select { |k| ENV[k].to_s.empty? }
  UI.user_error!("환경변수 비어 있음: #{missing.join(' ')} — ~/.config/gh-trade/release/android.env") unless missing.empty?
  vc = GhTradeBuildNumbers.android_version_code
  UI.message("versionCode #{vc}")
  File.delete(GHTRADE_RELEASE_APK) if File.exist?(GHTRADE_RELEASE_APK) # 이전 산출물이 남아 검사를 통과하는 것 방지(Pitfall F3)
  gradle(project_dir: ".", task: "assemble", build_type: "Release",
         properties: { "ghtradeVersionCode" => vc }) # 서명 속성은 넘기지 않는다(명령줄이 로그에 찍힘 — 22-04 관례)
  UI.user_error!("릴리스 APK 없음: #{GHTRADE_RELEASE_APK}") unless File.exist?(GHTRADE_RELEASE_APK)
  File.write(File.join(File.dirname(GHTRADE_RELEASE_APK), "ghtrade-version-code.txt"), vc.to_s) # check-apk 기대값(ignore 되는 build/)
  [GHTRADE_RELEASE_APK, vc]
end

def ghtrade_appdistro_sa!
  sa = ENV["FIREBASE_APPDISTRO_SA_JSON"].to_s
  UI.user_error!("FIREBASE_APPDISTRO_SA_JSON 없음 — ! bash mobile/scripts/setup-release-secrets.sh firebase-sa") if sa.empty? || !File.exist?(sa)
  sa
end

platform :android do
  desc "업로드 키 서명 APK → Firebase App Distribution (D-13 · D-14 · D-15)"
  lane :firebase do
    apk, vc = ghtrade_build_release_apk
    sh("bash", File.expand_path("../../scripts/check-apk.sh", __dir__), apk) # 업로드 전 게이트 — 실패 시 lane 중단
    firebase_app_distribution(
      app: GHTRADE_FIREBASE_ANDROID_APP_ID,
      android_artifact_type: "APK",
      android_artifact_path: apk,                  # lane_context 기본값 금지(Pitfall F3)
      groups: ENV.fetch("FIREBASE_APPDISTRO_GROUPS", "ghtrade-testers"),
      release_notes: "GH Trade 1.0 (#{vc}) · #{`git rev-parse --short HEAD`.strip}",
      service_credentials_file: ghtrade_appdistro_sa! # 명시 필수 — 없으면 ADC(=owner 키)로 떨어진다(Pitfall F2)
    )
    UI.success("Firebase 배포 versionCode #{vc}")
  end

  desc "Firebase 최신 릴리스 조회(검증용)"
  lane :firebase_latest do
    r = firebase_app_distribution_get_latest_release(app: GHTRADE_FIREBASE_ANDROID_APP_ID,
                                                    service_credentials_file: ghtrade_appdistro_sa!)
    UI.message("latest Firebase build #{r && r[:buildVersion]}")
  end
end
```
- 옵션 이름은 이번 세션에 gem 1.0.0 소스를 Read 해 확인했다 [VERIFIED: `firebase_app_distribution_action.rb:457-610`].
  - 확인한 옵션: `app` · `android_artifact_type`(`'APK'`/`'AAB'` · 기본 `APK`) · `android_artifact_path` · `groups` · `testers` · `release_notes` · `service_credentials_file` · `service_credentials_json_data` · `firebase_cli_token`.
  - `apk_path` 는 `android_artifact_path` 로 대체된 옛 이름이다.
- `get_latest_release` 는 `buildVersion`(= versionCode)을 해시 키 `:buildVersion` 으로 돌려준다 [VERIFIED: `firebase_app_distribution_get_latest_release.rb` `map_release_hash`].
- `release_notes` 에 테스터 이메일·비밀을 넣지 않는다. `git rev-parse` 출력은 공개 정보다.

#### Pattern F3: `release-android.sh` 모드 추가 · `package.json` 재배선 (D-15 · D-16)
- `release-android.sh` 의 모드 목록에 `firebase` · `firebase-latest` · `check-apk` 를 더한다. 기존 `beta|build|validate|track|check` 는 유지한다.
- `firebase` 모드의 동작:
  - 기존 키 검사(업로드 키 4개 + `GHTRADE_UPLOAD_SHA1`)와 키스토어 파일 존재 확인을 한다.
  - SA JSON 을 확인한다. `FIREBASE_APPDISTRO_SA_JSON` 이 없으면 기본 경로 `$HOME/.config/gh-trade/release/firebase-appdistro-service-account.json` 을 쓴다. 파일이 없으면 exit 3 과 함께 `! bash mobile/scripts/setup-release-secrets.sh firebase-sa` 를 안내한다.
  - 그다음 `unset GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN` 후 `bundle exec fastlane firebase` 를 실행한다.
- `android.env` 는 바꾸지 않는다. 경로는 비밀이 아니므로 래퍼 기본값으로 충분하다.
- `package.json` 은 다음처럼 바꾼다.
  ```jsonc
  "native:release:android":      "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh firebase",   // D-15: Phase 22 기본 경로
  "native:release:android:aab":  "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh build",      // 보존(D-16)
  "native:release:android:play": "cap sync && node scripts/verify-prod-config.mjs && bash scripts/release-android.sh beta"        // 보존 — Phase 23 이 쓴다(D-16)
  ```
- 오늘 `native:release:android` 는 인자 없이 Play `beta` 로 간다(`package.json:18` · `release-android.sh:36`). 이 재배선이 없으면 D-15 의 「`native:release:android` 한 번」 이 Play 업로드를 시도하다 exit 3 으로 끝난다(play-sa 미주입).
- `build.gradle:77` 가드 메시지의 「릴리스 AAB 는 native:release:android(:aab) 로만」 은 APK 도 가리키도록 문구만 고친다. 로직은 그대로다. 가드 자체는 이미 `assembleRelease` 를 포함한다.

#### Pattern F4: `setup-release-secrets.sh firebase-sa` (사용자 `!` 실행 · 비대화형 · 값 비출력)
```bash
# stage 목록 검사(:317)에 firebase-sa 추가 · usage 갱신. play-sa 함수(:268~)와 같은 구조.
stage_firebase_sa() {
  local sa_name="gh-trade-appdistro" sa_email key="$REL/firebase-appdistro-service-account.json" err
  [[ -d "$REL" ]] || { echo "ERROR firebase-sa — 비밀 디렉터리가 없다: $REL (먼저 dir 단계를 실행)" >&2; return 1; }
  gcloud_prep || return 1                                   # 기본 = deployer 키(owner) — 생성 작업에만 쓰고, 업로드에는 쓰지 않는다
  sa_email="${sa_name}@${CLOUDSDK_CORE_PROJECT}.iam.gserviceaccount.com"
  gcloud services enable firebaseappdistribution.googleapis.com >/dev/null 2>&1 || { echo "ERROR firebase-sa — API 사용 설정 실패" >&2; gcloud_hint firebase-sa; return 1; }
  gcloud iam service-accounts describe "$sa_email" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$sa_name" --display-name="GH Trade App Distribution uploader" >/dev/null 2>&1 \
    || { echo "ERROR firebase-sa — SA 생성 실패" >&2; gcloud_hint firebase-sa; return 1; }
  gcloud projects add-iam-policy-binding "$CLOUDSDK_CORE_PROJECT" --member="serviceAccount:$sa_email" \
    --role=roles/firebaseappdistro.admin --condition=None >/dev/null 2>&1 \
    || { echo "ERROR firebase-sa — 역할 바인딩 실패" >&2; gcloud_hint firebase-sa; return 1; }
  if [[ -f "$key" ]]; then echo "SKIP firebase-sa 키 — 이미 있음"
  else gcloud iam service-accounts keys create "$key" --iam-account="$sa_email" >/dev/null 2>&1 \
         || { rm -f "$key"; echo "ERROR firebase-sa — 키 생성 실패" >&2; gcloud_hint firebase-sa; return 1; }
       chmod 600 "$key"; fi
  echo "OK firebase-sa"; echo "SA: $sa_email"
}
```
- **SA 이름:** `gh-trade-appdistro` 는 SA ID 규칙(6~30자 · 소문자 · 숫자 · 하이픈)에 맞는다 [ASSUMED 규칙 기억 · 실행 시 gcloud 가 검증].
- **키 파일 이름:** 기존 위생 검사의 추적 패턴 `service-account[^/]*\.json$`(`check-release-hygiene.sh:58`)에 걸리도록 `…-service-account.json` 으로 끝낸다.
- **프로젝트:** 새 Firebase 전용 프로젝트를 고르면(D-17 대안) deployer SA 에는 권한이 없다. 그때는 `! CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE= CLOUDSDK_CORE_PROJECT=<새 프로젝트> bash mobile/scripts/setup-release-secrets.sh firebase-sa` 로 실행한다. 기존 `gcloud_prep` 규약이 이미 이 분기를 지원한다.
- **백업:** SA 키는 백업하지 않는다(`backup` stage 대상 아님). 잃으면 새 키를 만들고 옛 키를 GCP 에서 삭제하면 된다. 업로드 키와 달리 재발급이 가능하다.

#### Pattern F5: `check-apk.sh` (v2 서명 APK 전용 검사 — `check-aab.sh` 복사 금지)
```bash
# 사용: bash scripts/check-apk.sh [APK]   기본 android/app/build/outputs/apk/release/app-release.apk
# 필요 env: GHTRADE_UPLOAD_SHA1(공개 지문). 기대 versionCode = 같은 폴더 ghtrade-version-code.txt
BT="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/* | sort -V | tail -1)"   # 36.1.0
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"     # apksigner 는 java 가 필요
"$BT/apksigner" verify --min-sdk-version 24 "$APK" >/dev/null 2>&1 || fail "apksigner verify 실패(서명 없음·손상)"
CERTS="$("$BT/apksigner" verify --print-certs "$APK" 2>/dev/null)"
[ "$(grep -c '^Signer #' <<<"$CERTS")" = "1" ] || fail "서명자가 1개가 아니다"
got="$(awk -F': ' '/certificate SHA-1 digest/{print $2; exit}' <<<"$CERTS")"                  # 예: 831a3b99… (소문자·콜론 없음)
want="$(printf '%s' "$GHTRADE_UPLOAD_SHA1" | tr -d ':' | tr '[:upper:]' '[:lower:]')"
[ "$got" = "$want" ] || fail "업로드 키로 서명되지 않았다 ($got)"
BADGING="$("$BT/aapt2" dump badging "$APK")"
grep -q "^package: name='com.ghtrade.app' versionCode='$(cat "$(dirname "$APK")/ghtrade-version-code.txt")'" <<<"$BADGING" || fail "패키지·versionCode 불일치"
! grep -q '^application-debuggable' <<<"$BADGING" || fail "debuggable APK"
unzip -p "$APK" assets/capacitor.config.json | node -e '…server.url===PROD_URL && cleartext!==true && android.webContentsDebuggingEnabled!==true…' || fail "운영 설정 아님"
echo "APK CHECK OK sha1=$got versionCode=…"
```
실측 근거는 다음과 같다(`mobile/android/app/build/outputs/apk/debug/app-debug.apk` · 2026-09-26 23:02 빌드) [VERIFIED].
- **서명 스킴:** `apksigner verify --verbose` 결과는 `Verified using v1 scheme (JAR signing): false` · `v2 … : true` · `v3 … : false` 다.
- **keytool:** `keytool -printcert -jarfile` 출력은 빈 줄이다.
- **jarsigner:** `jarsigner -verify` 출력은 `no manifest.` 다.
- **인증서 지문:** `apksigner verify --print-certs` 는 `Signer #1 certificate SHA-1 digest: 831a3b991c374500d46b90ac49cc14f0f012c3d3` 를 낸다. debug 키 지문이고, 형식은 소문자·콜론 없음이다.
- **aapt2:** `aapt2 dump badging` 은 `package: name='com.ghtrade.app' versionCode='1' versionName='1.0' …` 와 `application-debuggable` 을 낸다.
- **설정 파일 위치:** `unzip -l` 결과 `assets/capacitor.config.json` 이다.
- **음성 테스트 재료:** 이 debug APK 에 `check-apk.sh` 를 돌리면 SHA-1 불일치 · debuggable 두 줄로 실패해야 한다.

#### Pattern F6: Firebase 프로젝트 · 앱 등록 (사용자 콘솔 · R1 체크포인트)
1. **(checkpoint:decision · D-17)** 기본값 「gh-radar 에 Firebase 추가」 와 대안 「새 프로젝트(Spark)」 중에서 고른다. 결정 본문에 아래 「부수 효과」 목록을 그대로 붙인다.
2. Firebase 콘솔 → 프로젝트 만들기 → 페이지 아래 **「Google Cloud 프로젝트에 Firebase 추가」** → `gh-radar` 선택 → 약관 동의 → Google Analytics 는 **끈다**(선택 항목) [CITED: firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project · 2026-09-24].
3. 프로젝트 설정 → 앱 추가 → Android → 패키지 `com.ghtrade.app`(대소문자 구분 — 문서 명시) · 닉네임 `GH Trade` · **「디버그 서명 인증서 SHA-1」 칸은 비운다**(Pitfall F6) → 등록.
   - `google-services.json` 다운로드 단계와 SDK 추가 단계는 **건너뛴다**.
   - 파일을 받았다면 저장소 밖에 두거나 지운다(Pitfall F5).
4. App Distribution 메뉴 → 앱 선택 → **「시작하기」** 를 누른다. 이 온보딩을 안 하면 플러그인이 `INVALID_APP_ID` 를 낸다 [VERIFIED: 플러그인 `firebase_app_distribution_error_message.rb:14`].
5. 테스터 및 그룹 → 그룹 만들기(별칭 `ghtrade-testers`) → 테스터 Google 계정 이메일을 추가한다. 이메일은 저장소·SUMMARY 에 적지 않는다.
6. 프로젝트 설정 → 일반 → 앱 ID(`1:…:android:…`)를 복사해 재개 신호로 보낸다. 공개 식별자다.

**gh-radar 에 추가할 때의 부수 효과**(체크포인트 본문용 · [CITED: 같은 문서]):
- **켜지는 API:** App Engine Admin · Cloud Pub/Sub · Cloud Resource Manager · Cloud Runtime Configuration · Cloud Testing · FCM · Firebase Dynamic Links · Firebase Hosting · Firebase Installations · Firebase Management · Remote Config(+Realtime) · Firebase Rules · Identity Toolkit · Token Service.
- **생기는 SA:** `service-1023658565518@gcp-sa-firebase.iam.gserviceaccount.com` · `firebase-adminsdk-xxxxx@gh-radar.iam.gserviceaccount.com`.
- **그 밖에 생기는 것:** 「Browser」 API 키(Firebase API 로 자동 제한) · 라벨 `firebase:enabled`.
- **요금제:** 결제가 켜진 프로젝트면 Blaze 다.
  - App Distribution 은 무료 제품이다 [CITED: firebase.google.com/pricing].
  - gh-radar 의 결제 상태는 이번에 조회하지 못했다. Cloud Billing API 가 꺼져 있고 deployer 권한 오류가 났다. Cloud Run 운영 중이라 결제가 켜져 있다고 본다 [ASSUMED].
- **IAM:** 권한은 GCP 와 공유된다. 기존 바인딩을 바꾼다는 기술은 없다.
- **되돌리기:** 완전히 되돌릴 수 없다. API 비활성화와 리소스 삭제만 수동으로 가능하다.
- **현재 상태:** gh-radar 에는 Firebase 관련 API 가 아직 켜져 있지 않다 [VERIFIED: `gcloud services list --enabled` 에 `firebase|appdistri|identitytoolkit` 0건].

#### Pattern F7: GCP Android OAuth 클라이언트(업로드 키 SHA-1 하나 · R4)
- GCP 콘솔(gh-radar) → Google Auth Platform → 클라이언트 → 만들기 → 유형 Android → 입력값:
  - 이름: `GH Trade Android (upload key)`
  - 패키지: `com.ghtrade.app`
  - SHA-1: `2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D`
- 기존 debug 클라이언트(`GOOGLE_ANDROID_CLIENT_ID` · debug SHA-1)는 그대로 둔다.
- Supabase Client IDs 는 바꾸지 않는다. id_token 의 aud 가 웹 클라이언트이기 때문이다(`native-google-login.ts:99`) [VERIFIED: Read].
- Android 클라이언트는 인증서·패키지 쌍마다 1개가 필요하다. 그 쌍은 모든 Firebase·GCP 프로젝트에서 유일해야 한다 [CITED: support.google.com/firebase/answer/6401008 · support.google.com/googleapi/answer/6158849].
- 클라이언트 설정 반영에 몇 분~몇 시간이 걸릴 수 있다 [ASSUMED — 콘솔 안내 문구 기억]. 그러니 첫 로그인 실패를 곧바로 설정 오류로 단정하지 않는다. 10분 간격으로 재시도하고, logcat 으로 대조한다(Pitfall F7).

#### Anti-Patterns to Avoid (부록)
- `fastlane add_plugin firebase_app_distribution` 실행 — Pluginfile 경로가 어긋난다(F1).
- `firebase_app_distribution` 에서 `service_credentials_file` 생략 — owner ADC 폴백(F2).
- `android_artifact_path` 생략(lane_context 의존) — debug APK 업로드 위험(F3).
- `check-aab.sh` 를 APK 용으로 복사 — v2 APK 에서 항상 실패하거나, 검사를 느슨하게 고치다 무력화한다(F4).
- `google-services.json` 을 `android/app/` 에 두기 — google-services 플러그인이 자동 적용되고 추적 파일이 된다(F5).
- Firebase 앱 등록에 SHA-1 입력 + GCP 수동 클라이언트 생성을 둘 다 하기 — 쌍 중복(F6).
- 카톡·드라이브로 APK 직접 전달 — D-13 이 금지한다.
- 업로드 키 재생성 — Phase 23 Play 업로드 키가 깨진다(22-04 `keystore` SKIP 규약 유지).

### 부록 — Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Firebase 업로드 · 배포 · 재시도 | REST 직접 호출(`releases:upload` · operation 폴링 · distribute) | `firebase_app_distribution` 플러그인 | 1.0.0 은 이어받기 업로드 · 폴링 · 재시도 · AAB 통합 검사를 이미 한다 [CITED: 플러그인 릴리스 노트 「Make uploads resumable」] |
| APK 서명 인증서 파싱 | `unzip` + `openssl pkcs7` 로 META-INF 파싱 | `apksigner verify --print-certs` | v2/v3 서명 블록은 META-INF 에 없다(Pitfall F4) |
| APK 메타(versionCode · debuggable) | `AndroidManifest.xml` 바이너리 XML 직접 해석 | `aapt2 dump badging` | 바이너리 XML |
| 테스터 초대 메일 · 설치 페이지 | 자체 다운로드 페이지 · 링크 공유 | Firebase 초대 · App Tester | D-13 |
| 최신 릴리스 확인 | 콘솔 눈확인 | `firebase_app_distribution_get_latest_release` | 자동 검증(V-F9) |

### 부록 — Common Pitfalls

#### Pitfall F1: `fastlane add_plugin` 이 Pluginfile 을 엉뚱한 곳에 만든다
**What goes wrong:** Gemfile 은 `mobile/` 에, fastlane 폴더는 `mobile/android/fastlane/` 에 있다. `add_plugin` 은 Pluginfile 을 fastlane 폴더에 만들고 Gemfile 에 `eval_gemfile` 줄을 넣는다. 이때 경로가 Gemfile 기준 상대 경로라 둘이 어긋난다. 게다가 iOS lane(`ios/App/fastlane`)과도 공유되지 않는다.
**How to avoid:** Pattern F1 처럼 Gemfile 에 `gem` 줄을 직접 넣는다. 이 방법으로 플러그인 로드를 확인했다 [VERIFIED].
**Warning signs:** `Gemfile` 에 `eval_gemfile` 줄이 생기거나, `android/fastlane/Pluginfile` 이 생긴다.

#### Pitfall F2: 자격 증명을 명시하지 않으면 owner 키로 업로드된다
**What goes wrong:** 플러그인의 인증 우선순위는 다음과 같다 [VERIFIED: `firebase_app_distribution_auth_client.rb` `get_authorization`].
- `service_credentials_file` → `service_credentials_json_data` → `firebase_cli_token` → `ENV["FIREBASE_TOKEN"]` → `~/.config/configstore/firebase-tools.json` 의 refresh token → ADC.
- 이 맥은 `~/.zshrc:28` 에서 `GOOGLE_APPLICATION_CREDENTIALS` 를 deployer 키로 export 한다. 실측한 이번 셸의 값은 `/Users/alex/.config/gcloud/gh-radar-deployer.json` 이다.
- deployer SA 의 프로젝트 역할은 `roles/owner` · `roles/iap.tunnelResourceAccessor` 다 [VERIFIED: `gcloud projects get-iam-policy`].
**How to avoid:** lane 에서 `service_credentials_file:` 를 항상 명시한다. 래퍼는 fastlane 실행 전에 `unset GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN` 을 한다(이중 방어). 플러그인 로그 첫 줄 `🔐 Authenticating with --service_credentials_file path parameter: …` 를 검사 대상으로 삼는다(V-F7). 이 줄에는 경로만 찍히고 값은 찍히지 않는다.
**Warning signs:** 로그에 `Authenticating with Application Default Credentials` 가 나온다.

#### Pitfall F3: 기본 APK 경로 = 「가장 최근 mtime 의 APK」
**What goes wrong:** fastlane `gradle` 액션은 `build/outputs/apk/**` 의 모든 APK 가운데 mtime 이 가장 최근인 것을 `GRADLE_APK_OUTPUT_PATH` 로 둔다(debug 포함 · `gradle.rb:69-98`). 플러그인은 `android_artifact_path` 가 없으면 이 값을 쓴다(`firebase_app_distribution_action.rb:164-174`) [VERIFIED].
**How to avoid:**
- 절대 경로 `…/apk/release/app-release.apk` 를 명시한다.
- 빌드 전에 이전 release APK 를 지운다(Pattern F2). 그러면 up-to-date 건너뛰기로 옛 파일이 남을 수 없다.
- check-apk 가 versionCode 까지 대조한다.

#### Pitfall F4: v2 전용 APK 에 `keytool`·`jarsigner` 를 쓰면 검사가 무의미해진다
**What goes wrong:** `minSdkVersion = 24` 에서 AGP 는 v1 서명을 끈다. 실측한 debug APK 는 v2 만 서명돼 있었다. 이 경우 `keytool -printcert -jarfile` 은 빈 출력, `jarsigner -verify` 는 `no manifest.` 로 실패한다 [VERIFIED 실측]. `check-aab.sh` 를 복사하면 항상 FAIL 이 난다. 그걸 고치려고 검사를 빼면 서명 확인이 사라진다.
**Release APK 에도 같은가:** release `signingConfigs`·`buildTypes` 에는 `enableV1Signing` 등의 재정의가 없다(`build.gradle:26-42` Read — `storeFile` · `storePassword` · `keyAlias` · `keyPassword` · `signingConfig` · `minifyEnabled` · `proguardFiles` 만). 그래서 같을 것으로 본다 [ASSUMED — 첫 release APK 에서 `apksigner verify --verbose` 로 확인]. v1 이 있든 없든 `apksigner` 기반 검사는 둘 다 통과한다.
**How to avoid:** Pattern F5.

#### Pitfall F5: `google-services.json` 이 저장소 안에 들어오면 빌드가 바뀐다
**What goes wrong:** `build.gradle:81-88` 은 파일이 있으면 `com.google.gms.google-services` 를 적용한다. classpath 는 이미 있다(`android/build.gradle:11` `google-services:4.4.4`). 그런데 `android/.gitignore:65` 에서 ignore 줄이 주석 처리돼 있다. 콘솔 등록 마법사가 내려 준 파일을 무심코 `android/app/` 에 두면 두 가지가 생긴다. 릴리스 빌드에 Firebase 설정 리소스가 섞이고, 파일이 커밋된다. 이 파일의 API 키는 공개 식별자지만 D-17 「앱 안에 Firebase 없음」 을 어긴다.
**How to avoid:**
- 콘솔 절차에서 다운로드를 건너뛴다.
- 위생 검사에 `test ! -e mobile/android/app/google-services.json` 과 ignore 샘플(`android/app/google-services.json`)을 추가한다.
- `mobile/.gitignore` 에 `google-services.json` 을 더한다.

#### Pitfall F6: Firebase 앱 등록 SHA-1 × GCP 수동 OAuth 클라이언트 = 쌍 중복
**What goes wrong:** 패키지+SHA-1 쌍은 전 프로젝트에서 유일해야 한다. Firebase 는 앱에 SHA-1 이 들어가면 OAuth 클라이언트를 자동 생성할 수 있다. 여기에 GCP 콘솔에서 같은 쌍을 또 만들면 「An OAuth2 client already exists for this package name and SHA-1」 오류가 난다 [CITED: support.google.com/firebase/answer/6401008].
**How to avoid:** Firebase 등록에서는 SHA-1 을 비운다. OAuth 클라이언트는 Phase 21 과 같은 GCP 콘솔 경로 하나로만 만든다.

#### Pitfall F7: 기존 debug 설치본 위에 release APK 가 안 깔린다
**What goes wrong:** Android 는 업데이트할 때 인증서가 같아야 한다. 인증서가 다르면 설치를 거부한다 [CITED: developer.android.com/studio/publish/app-signing — "The system allows the update if the certificates match"]. Phase 21 에서 debug 키로 깐 에뮬레이터·실기기에 Firebase APK 를 받으면 「앱이 설치되지 않았습니다(패키지 충돌)」 가 나고, adb 로는 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 이 난다. 에뮬레이터 `emulator-5554` 가 지금 붙어 있다 [VERIFIED: `adb devices`].
**How to avoid:**
- 테스터 안내와 본인 UAT 절차 첫 줄에 「기존 GH Trade(개발판)가 있으면 먼저 삭제」 를 넣는다.
- 로컬 스모크는 `adb uninstall com.ghtrade.app && adb install app-release.apk` 순서로 한다.
- 로그인 실패 시 `adb logcat -d -s GoogleProvider` 의 `signingSha1` 을 업로드 SHA-1 과 대조한다(본문 Pitfall 5 의 진단법을 재사용).

#### Pitfall F8: App Distribution 「시작하기」 온보딩 누락
**What goes wrong:** 앱 등록만 하고 App Distribution 페이지의 「시작하기」 를 안 누르면 업로드가 `INVALID_APP_ID`(「…Make sure to onboard your app by pressing the "Get started" button…」)로 실패한다 [VERIFIED: 플러그인 에러 메시지 소스].
**How to avoid:** R1 체크포인트 지시문에 넣는다.

#### Pitfall F9: 로그에 1시간 유효 다운로드 링크가 찍힌다
**What goes wrong:** 업로드가 끝나면 플러그인이 세 줄을 출력한다 [VERIFIED: 액션 소스].
- `🔗 Download the release binary (link expires in 1 hour): <binary_download_uri>`
- `testing_uri`
- `firebase_console_uri`
다운로드 링크는 서명된 capability URL 이다.
**How to avoid:** SUMMARY·커밋·채팅 보고에 이 URL 을 붙이지 않는다. 버전과 versionCode 만 적는다. fastlane `report.xml` 은 이미 ignore 된다(`android/fastlane/report.xml` 이 위생 샘플에 있음).

#### Pitfall F10: 「업데이트」 는 자동이 아니다 (D-15 기대 관리)
**What goes wrong:** Firebase 는 새 릴리스를 배포하면 기존 테스터에게 「새 빌드」 메일을 보낸다 [CITED: distribute-console · 2026-09-24]. 그러나 설치는 테스터가 탭해야 한다. Play 처럼 백그라운드 자동 업데이트는 없다. versionCode 가 줄면(다운그레이드) 덮어 설치가 안 된다.
**How to avoid:** 테스터 안내문에 「메일/App Tester 알림 → 탭 → 설치」 를 적는다. 번호는 공식상 단조 증가한다. 같은 분에 두 번 실행하는 것은 금지한다(22-04 FA-1).

#### Pitfall F11: 빌드 150일 만료 · 초대 30일 만료
**What goes wrong:** 배포한 빌드는 150일 뒤 콘솔과 테스터 목록에서 사라진다. 만료 30일 전에 예고가 뜬다. 초대는 30일 안에 수락해야 하며 한 번만 수락할 수 있다. 수락은 초대받지 않은 다른 Google 계정으로도 된다 [CITED: firebase.google.com/docs/app-distribution/troubleshooting?platform=android · get-set-up-as-a-tester?platform=android · 2026-09-24].
**How to avoid:** README 에 「iOS 90일 · Android 150일 안에 새 빌드」 를 적는다. 이미 설치된 앱은 만료 뒤에도 기기에 남아 동작할 가능성이 높다 [ASSUMED].

#### Pitfall F12: Play Protect · 「출처를 알 수 없는 앱」 경고
**What goes wrong:** Android 8+ 에서 처음 설치하면 브라우저나 App Tester 에 「이 출처 허용」 을 켜야 한다 [CITED: troubleshooting]. 처음 보는 사이드로드 앱에는 Play Protect 가 「앱 검사」·「안전하지 않은 앱」 대화상자를 띄울 수 있다 [ASSUMED — 문구·빈도 미확인]. GH Trade 는 `INTERNET` 권한 하나뿐이다(`AndroidManifest.xml:43` Read). 민감 권한 기반 차단(사기 방지 파일럿) 대상일 가능성은 낮다 [ASSUMED].
**How to avoid:** 테스터 안내에 「경고가 나오면 '그래도 설치'」 한 줄과 캡처 요청을 넣는다. UAT 에서 실제 문구를 기록한다.

### 부록 — 테스터 UX · 한도 (Android · 요약)

| 항목 | 값 | 근거 |
|------|-----|------|
| 테스터 절차 | ① 초대 메일 열기 → Google 로그인 → 초대 수락 ② (선택) App Tester 설치 — `appdistribution.firebase.google.com` 에서 ③ 「이 출처 허용」 ④ Download → 설치. iOS 3단계와 같은 수준이다(D-13 의 4단계 문구와 일치) | [CITED: get-set-up-as-a-tester?platform=android] |
| 새 빌드 알림 | 기존 테스터에게 이메일(+ App Tester 목록) | [CITED: distribute-console] |
| 테스터 한도 | 프로젝트 500명 · 그룹 200명 | [CITED: troubleshooting] |
| 빌드 보관 | 150일 · 앱당 1,000릴리스 초과 시 오래된 것부터 삭제 | [CITED: troubleshooting] |
| 초대 만료 | 30일 · 1회 수락 | [CITED] |
| 바이너리 한도 | 2048 MiB | [CITED: 검색 결과 요약 · MEDIUM] |
| 비용 | 무료 제품(Spark·Blaze 공통) | [CITED: firebase.google.com/pricing] |
| Google 계정 | 테스터에게 필요하다. 앱 로그인 계정과 같지 않아도 된다 | [CITED: troubleshooting · get-set-up] |

### 부록 — Android 개발자 인증(사이드로드) 현황 (D-18 · 2026-09-27 기준 · 시한부)

| 시점 | 내용 | 근거 |
|------|------|------|
| 2026-08 | 개발자 API · 제한 배포 계정(기기 20대 · 신분증·등록비 없음) · advanced flow 출시 | [CITED: developer.android.com/developer-verification] |
| **2026-09-30** | **브라질 · 인도네시아 · 싱가포르 · 태국**의 **참여 스토어**(Google Play · Galaxy Store · OPPO · Honor 등) 설치에 적용. 한국은 명시 대상이 아니다 | [CITED: 같은 페이지 · support.google.com/android-developer-console/answer/16561738] |
| 현재(FAQ 2026-07-15) | "If you distribute your app through other stores, or if users sideload your app directly, these new verification requirements won't apply to your app yet." → **Firebase App Distribution(브라우저·App Tester 사이드로드) 설치는 아직 영향이 없다** | [CITED: developer.android.com/developer-verification/guides/faq] |
| 2027~ | 인증 기기 전 세계로 확대. 미등록 앱의 일반 사이드로드는 막히고, ADB 와 advanced flow(24시간 대기)만 예외다. 적용 월·국가 순서는 미발표다 [ASSUMED 미확인] | [CITED: FAQ] |
| 완화책 | ① Play 개발자 인증이 끝난 뒤 `com.ghtrade.app` 에 업로드 키 인증서도 등록한다(ADC 는 패키지당 서명 키 여러 개를 등록할 수 있다 — FAQ 2026-03-23). Play App Signing 앱은 자동 등록 대상이다 ② 제한 배포 계정(20대) ③ 본인 기기는 ADB | [CITED: FAQ] · 등록 UI 경로 [ASSUMED] |

**계획 영향:** 이번 phase 에는 코드·절차 변경이 없다. README 와 테스터 안내에 D-18 문장(「Play 개발자 인증 전까지의 임시 경로 · 2027 확대 뒤 설치 불가 가능」)과 확인 날짜(2026-09-27)를 적는다. **이 절은 2027 적용 공지가 나오면 다시 확인해야 한다.**

### 부록 — Phase 23 이관 메모 (D-14 결과)

- **재설치 필요:** Firebase APK 는 업로드 키로 서명된다. Play 배포본은 Play 앱 서명 키(Google 생성 · 신규 앱 기본은 양자 대비 하이브리드)로 서명된다. 인증서가 다르면 업데이트할 수 없다. 공식 문서는 이렇게 적는다 [CITED: developer.android.com/studio/publish/app-signing]: "If you sign the new version with a different certificate, you must assign a different package name to the app". 그래서 테스터는 Firebase 설치본을 **삭제한 뒤 Play 에서 설치**해야 한다(D-14).
- **재설치 비용이 작다:** Remote-URL 셸이라 기기에 남는 것은 WebView 저장소(로그인 세션 · 오프라인 폴백 캐시)뿐이다. 잃는 것은 재로그인 1회다 [ASSUMED — WebView 저장소 외 로컬 데이터 없음은 Phase 21 구조 기억].
- **대안 — 업로드 키를 앱 서명 키로 제공:** Play 첫 업로드 때 「Provide your own key」(PEPK)로 현재 업로드 키를 앱 서명 키로 넘기면 Firebase 설치본이 Play 업데이트를 그대로 받을 수 있다. 권장하지 않는 이유는 세 가지다.
  - Google 은 "For maximum security, your upload key and app signing key should be different" 라고 한다 [CITED: support.google.com/googleplay/android-developer/answer/9842756]. 새 업로드 키를 따로 만들어야 한다.
  - 앱 서명 키를 잃으면 복구할 수 없다.
  - 테스터 5명 미만의 재설치 비용보다 크다.
- **Phase 23 체크리스트에 넣을 것:**
  - (a) 테스터 안내: 「Firebase 판 삭제 → Play 참여 링크」.
  - (b) GCP Android 클라이언트에 Play 앱 서명 인증서 SHA-1 들을 추가한다(업로드 키 클라이언트는 유지 — Firebase·로컬 사이드로드가 계속 쓴다).
  - (c) Firebase 경로를 계속 둘지 결정한다(D-18 · 2027).
  - (d) Play 경로 스크립트: `native:release:android:play` · `play-sa`.

### 부록 — Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Homebrew Ruby · Bundler | 플러그인 | ✓ | ruby 4.0.2 (2026-03-17) [VERIFIED: `ruby -v`] · bundler 4.0.8(본문) | — |
| `fastlane-plugin-firebase_app_distribution` | lane `firebase` | ✗(미설치) → `bundle install` 로 설치 | 1.0.0 | Firebase CLI(비권장) |
| Firebase CLI(`firebase`) | (대안만) | ✗ | — | 불필요 |
| `~/.config/configstore/firebase-tools.json` | (플러그인 폴백 경로) | ✗ — `update-notifier-npm.json` 만 있음 | — | 없는 편이 안전하다(폴백 차단) |
| Android build-tools `apksigner` · `aapt2` | check-apk | ✓ | 36.1.0 (`$ANDROID_HOME/build-tools/`) · PATH 에는 없음 → 절대 경로 사용 | 36.0.0 · 35.0.0 도 있음 |
| `ANDROID_HOME` · `JAVA_HOME` | apksigner(java 필요) · gradle | ✓ | `/Users/alex/Library/Android/sdk` · Android Studio JBR(openjdk 21.0.9) | `!` 셸에서는 비어 있을 수 있다 → 스크립트 기본값 |
| `adb` · 에뮬레이터 | 로컬 사이드로드 스모크 · logcat | ✓ | `emulator-5554` 연결 중 | 실기기 |
| 업로드 키스토어 · `android.env` | assembleRelease 서명 | ✓ | `~/.config/gh-trade/release/` 700 · 파일 600 [VERIFIED: `ls -la` 권한만] | Secret Manager 백업 |
| Firebase SA 키 | 업로드 | ✗ | — | `setup-release-secrets.sh firebase-sa`(사용자 `!`) |
| gh-radar Firebase 추가 · Android 앱 · 온보딩 · 그룹 | 업로드 대상 | ✗ | — | 사용자 콘솔(R1) |
| `firebaseappdistribution.googleapis.com` | 업로드 | ✗(미사용 설정) · 서비스 존재 확인 [VERIFIED: `gcloud services list --available`] | — | firebase-sa stage 가 enable |
| gcloud + deployer SA | SA·역할·키 생성 | ✓ | `roles/owner` | 사용자 계정 gcloud |
| org 정책 | SA 키 생성 · IAM 바인딩 | ✓ 비제한 | `iam.disableServiceAccountKeyCreation` = `booleanPolicy: {}` · `iam.allowedPolicyMemberDomains` = `allValues: ALLOW` [VERIFIED: effective 조회] | — |

**Missing dependencies with no fallback:** 없음. 모두 사용자 콘솔 작업이나 `!` 비밀 주입으로 해소된다.

### 부록 — Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes(업로드 자격) | 전용 SA 키 · 600 · 저장소 밖 · 명시 경로 · ADC 폴백 차단 |
| V4 Access Control | yes | `roles/firebaseappdistro.admin` 단일 역할(프로젝트 수준). 테스터 = 그룹 별칭. 트레이딩 = `dma_credentials`(무변경) |
| V6 Cryptography | yes(서명) | 업로드 키 재생성 금지 · apksigner 로 서명자 1개 · SHA-1 대조 |
| V8 Data Protection | yes | 로그의 1시간 다운로드 URL · 테스터 이메일을 문서화하지 않는다 |
| V14 Configuration | yes | `google-services.json` 부재 · 운영 URL · debuggable off · 위생 검사 |

| Threat | STRIDE | Mitigation |
|--------|--------|-----------|
| SA 키 유출 → 임의 APK 를 테스터에게 배포 | Tampering / EoP | 전용 SA · 단일 역할 · 600 · 유출 시 GCP 에서 키 삭제. 기존 테스터 기기는 서명이 달라 덮어 설치가 거부된다(업로드 키는 따로 보호). 새 테스터는 위험하다 → 그룹 최소화 |
| owner 키가 릴리스 경로로 흘러감 | EoP | `service_credentials_file` 명시 + 래퍼 `unset GOOGLE_APPLICATION_CREDENTIALS` · V-F7 로그 검사 |
| debug/dev 설정 APK 배포 | Tampering | verify-prod 게이트 + check-apk(서명자 · debuggable · server.url · cleartext · webContentsDebugging · versionCode) |
| 캡처 URL 노출 | Information Disclosure | SUMMARY·채팅에 URL 을 적지 않는다(Pitfall F9) |
| Firebase 추가에 따른 운영 프로젝트 표면 증가(Browser API 키 · adminsdk SA) | EoP(잠재) | 체크포인트에서 사용자에게 고지한다. adminsdk SA 에 키를 만들지 않는다. Browser 키는 Firebase API 로 자동 제한된다 [CITED] |

### 부록 — Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| FA-A1 | gh-radar 는 결제가 켜져 있어 Firebase 추가 시 Blaze 가 된다(Cloud Run 운영 근거 · Billing API 조회 실패) | Pattern F6 | Spark 면 오히려 영향이 적다. App Distribution 은 어느 쪽이든 무료 |
| FA-A2 | 릴리스 APK 도 debug 처럼 v2 만 서명된다 | Pitfall F4 | v1 이 추가돼도 apksigner 검사는 통과 — 영향 없음 |
| FA-A3 | Play Protect 가 첫 사이드로드에 경고할 수 있다 · 민감 권한 파일럿 차단 대상 아님 | Pitfall F12 | 경고 문구가 다르면 안내문을 수정한다. 차단되면 D-13 재논의 |
| FA-A4 | 만료된 빌드도 이미 설치된 앱은 계속 동작한다 | Pitfall F11 | 150일마다 새 빌드가 필요하다(절차상 이미 권장) |
| FA-A5 | 새 OAuth 클라이언트 반영에 수 분~수 시간이 걸릴 수 있다 | Pattern F7 | 즉시 반영이면 재시도 절차가 no-op |
| FA-A6 | Firebase 추가가 기존 OAuth 동의 화면 · Supabase Google 로그인에 영향을 주지 않는다(Firebase Auth 를 켜지 않는 한) | Pattern F6 | 영향이 있으면 웹 로그인 회귀 — R1 뒤 웹 로그인 스모크 1회로 확인 |
| FA-A7 | 2027 전 세계 적용 월 · 순서 미발표 · ADC 에 업로드 키 인증서를 추가 등록하는 UI 경로 | 개발자 인증 절 | 날짜가 당겨지면 Phase 23 우선순위 상향 |
| FA-A8 | SA ID `gh-trade-appdistro` 형식 규칙 · 그룹 별칭 `ghtrade-testers` 허용 문자 | Pattern F4 · F6 | 생성 단계에서 오류 → 이름 변경 |
| FA-A9 | Remote-URL 셸의 재설치 손실 = 재로그인뿐 | Phase 23 메모 | 로컬 데이터가 더 있으면 안내문 보강 |
| FA-A10 | 새 Firebase 전용 프로젝트를 만들 권한(조직 1016457930201 아래 프로젝트 생성)이 사용자 계정에 있다 | Alternatives | 없으면 D-17 기본값(gh-radar)만 가능 |

### 부록 — Open Questions

1. **D-17 Firebase 프로젝트 선택**
   - What we know: gh-radar 추가는 되돌릴 수 없고, 부수 효과 목록이 문서화돼 있다. 기능적으로 기존 서비스를 바꾸지는 않는다. 새 프로젝트는 격리되지만 SA 생성을 사용자 계정으로 해야 한다.
   - Recommendation: **기본값(gh-radar) 유지를 권장한다.**
     - 근거 ①: 앱에 SDK 가 없어 Firebase 는 배포 도구로만 쓰인다.
     - 근거 ②: deployer 로 `firebase-sa` stage 가 한 번에 끝난다.
     - 근거 ③: Phase 23 Play SA 도 gh-radar 에 둔다.
   - 결정 방식: `checkpoint:decision` 본문에 부수 효과 목록과 대안을 싣고 사용자가 고른다.
2. **Firebase 앱 ID 보관 위치**
   - Recommendation: Fastfile 상수(공개 식별자 · `google-client-ids.ts` 선례). env 로 두면 주입 단계가 하나 늘 뿐 보안 이득이 없다.
3. **`release-android.sh` 인자 없는 기본 모드**
   - Recommendation: package.json 이 항상 모드를 명시하게 하고, 스크립트 기본값은 `firebase` 로 바꾼다(Phase 22 기본 경로).
   - 22-04 검증 명령은 모두 명시 모드를 썼으므로 회귀는 없다. 헤더 주석을 갱신한다.
4. **로컬 사이드로드 스모크를 Firebase 업로드 앞에 둘지**
   - Recommendation: 둔다. `adb install` 로 업로드 키 SHA-1 OAuth 클라이언트를 먼저 검증하면, 테스터에게 깨진 빌드 알림이 가는 일을 막는다(Pitfall F7).
5. **Android 테스터가 App Tester 를 깔지**
   - Recommendation: 「선택」 으로 둔다. 새 빌드 알림을 앱으로 받고 싶을 때만 깐다. 사용자 요구(「설치 절차 복잡한 건 싫다」)에 맞춘다.

### Validation Architecture (부록)

본문 Validation Architecture 의 MOBILE-02a~o 가운데 다음 항목은 Phase 23 으로 넘어간다.
- **MOBILE-02g**(AAB)는 `native:release:android:aab` 회귀로만 남는다.
- **MOBILE-02m**(Play 트랙)과 **MOBILE-02n 의 Android Play 설치본 부분**은 Phase 23 으로 이관한다.

Android Firebase 경로의 검사는 아래 V-F* 로 대체한다.

| ID | Behavior | Type | Automated Command | Exists? |
|----|----------|------|-------------------|---------|
| V-F1 | 플러그인 잠금: Gemfile.lock 에 `fastlane-plugin-firebase_app_distribution (1.0.` 이 있고 `fastlane (2.240.1)` 는 그대로 · `eval_gemfile`/Pluginfile 없음 | static | `cd mobile && grep -q 'fastlane-plugin-firebase_app_distribution (1\.0\.' Gemfile.lock && grep -q '    fastlane (2.240.1)' Gemfile.lock && ! grep -q eval_gemfile Gemfile && test ! -e android/fastlane/Pluginfile` | ❌ Wave 0 |
| V-F2 | 플러그인 로드 | smoke | `cd mobile/android && PATH=/opt/homebrew/opt/ruby/bin:$PATH FASTLANE_SKIP_UPDATE_CHECK=1 bundle exec fastlane action firebase_app_distribution \| grep -q 'fastlane-plugin-fireb'` | ❌ Wave 0 |
| V-F3 | 보존(D-16): 기존 lane 4개 · `native:release:android:aab` · `native:release:android:play` · `play-sa` stage 유지 · `native:release:android` 는 `firebase` 모드 | static | `grep -cE '^  lane :(build\|beta\|validate\|track) do' mobile/android/fastlane/Fastfile` = 4 · `node -e 'const s=require("./mobile/package.json").scripts;process.exit(/release-android\.sh firebase$/.test(s["native:release:android"])&&/ build$/.test(s["native:release:android:aab"])&&/ beta$/.test(s["native:release:android:play"])?0:1)'` · `grep -q 'play-sa' mobile/scripts/setup-release-secrets.sh` | ❌ Wave 0 |
| V-F4 | 래퍼 빈 엣지: env 파일 없음 → exit 3 · SA JSON 없음 → exit 3 + `setup-release-secrets.sh firebase-sa` 안내 · 모르는 모드 → exit 2 · 둘 다 fastlane 미실행 | unit(셸) | `GHTRADE_RELEASE_ENV=/nonexistent bash mobile/scripts/release-android.sh firebase; test $? -eq 3` · `FIREBASE_APPDISTRO_SA_JSON=/nonexistent bash mobile/scripts/release-android.sh firebase 2>&1 \| grep -q 'firebase-sa'` (exit 3 · 출력에 `Driving the lane` 없음) · `bash mobile/scripts/release-android.sh nope; test $? -eq 2` | ❌ Wave 0 |
| V-F5 | gradle 가드: env 없는 `assembleRelease` 즉시 실패 | build | `cd mobile/android && env -u GHTRADE_UPLOAD_STORE_FILE ./gradlew assembleRelease 2>&1 \| grep -q 'GHTRADE_UPLOAD_STORE_FILE 없음'` | ✅ 가드 존재 · 명령 신규 |
| V-F6 | check-apk 음성: Phase 21 debug APK → FAIL(SHA-1 불일치 + debuggable) · 없는 파일 → FAIL · 잘못된 `GHTRADE_UPLOAD_SHA1` → FAIL · 소문자·콜론 없는 SHA-1 입력 → 정규화 OK | unit(셸) | `GHTRADE_UPLOAD_SHA1=2F:E3:BA:78:A5:74:16:06:F8:79:A8:D3:3C:28:23:EF:72:98:7B:7D bash mobile/scripts/check-apk.sh mobile/android/app/build/outputs/apk/debug/app-debug.apk; test $? -eq 1` (+ 출력에 `debuggable` · `업로드 키`) · `bash mobile/scripts/check-apk.sh /nonexistent.apk; test $? -eq 1` | ❌ Wave 0 |
| V-F7 | 업로드 성공 · 인증 경로 = 전용 SA 파일 · ADC 미사용 · 출력에 `APK CHECK OK` | integration | `pnpm --filter @gh-radar/mobile run native:release:android 2>&1 \| tee "$SCRATCH/fad.log"` → `grep -q 'PROD CONFIG OK' && grep -q 'APK CHECK OK' && grep -q 'Authenticating with --service_credentials_file' && ! grep -q 'Application Default Credentials' && grep -q 'App Distribution upload finished successfully'` (로그는 scratchpad · 커밋 금지 · Pitfall F9) | 절차 신규 |
| V-F8 | APK 사실 검증: 서명자 1개 · SHA-1 = 업로드 · `versionCode` = lane 출력 · `application-debuggable` 없음 · `assets/capacitor.config.json` 운영값 | artifact | `bash mobile/scripts/check-apk.sh`(릴리스 APK · 인자 없음) → `APK CHECK OK sha1=2fe3ba78a574160…` | ❌ Wave 0 |
| V-F9 | Firebase 최신 릴리스 buildVersion = 방금 versionCode | integration | `bash mobile/scripts/release-android.sh firebase-latest \| grep -q "latest Firebase build $VC"` | ❌ Wave 0 |
| V-F10 | 번호 규칙: 두 번째 업로드 versionCode > 첫 번째 · ≤ 2,100,000,000 · 기존 minitest 유지 | unit + integration | `/opt/homebrew/opt/ruby/bin/ruby mobile/fastlane/test/build_numbers_test.rb` (0 failures) · SUMMARY 두 값 비교 | ✅ minitest 존재 |
| V-F11 | 저장소 무변경: 릴리스 두 번 뒤 `git status --porcelain mobile/` 빈 출력(APK · version-code.txt 는 ignore 된 build/) | smoke | `test -z "$(git status --porcelain mobile/)"` | ✅ 절차 존재 |
| V-F12 | 위생 보강: ignore 샘플에 `android/app/build/outputs/apk/release/app-release.apk` · `firebase-appdistro-service-account.json` · `android/app/google-services.json` 추가 · `google-services.json` 실파일 부재 · SA 키 600 · Fastfile 에 `service_credentials_file:` 명시 · `android_artifact_path:` 명시 | static | `bash mobile/scripts/check-release-hygiene.sh` → `RELEASE HYGIENE OK`(샘플 수 18→21) · `grep -c 'service_credentials_file:' mobile/android/fastlane/Fastfile` ≥ 2 · `grep -c 'android_artifact_path:' …` ≥ 1 | ❌ Wave 0(스크립트 보강) |
| V-F13 | 최소 권한: 전용 SA 의 프로젝트 역할이 정확히 `roles/firebaseappdistro.admin` 하나 | integration(읽기 전용) | `gcloud projects get-iam-policy gh-radar --flatten='bindings[].members' --filter='bindings.members:serviceAccount:gh-trade-appdistro@gh-radar.iam.gserviceaccount.com' --format='value(bindings.role)'` 출력 = 그 한 줄 | 절차 신규 |
| V-F14 | 로컬 사이드로드 스모크(에뮬레이터): debug 판 삭제 → release APK 설치 → 실행 | smoke(+manual 로그인) | `adb uninstall com.ghtrade.app; adb install mobile/android/app/build/outputs/apk/release/app-release.apk` → `Success` · 로그인 뒤 `adb logcat -d -s GoogleProvider \| grep -i signingSha1` 이 업로드 SHA-1 | 절차 신규 |
| V-F15 | iOS 잔여(R6): `release-ios.sh latest` 가 22-01 빌드 `202609270252`(처리 완료 뒤) · 모르는 모드 exit 2 | integration | `bash mobile/scripts/release-ios.sh latest \| grep -q 'latest TestFlight build'` · `bash mobile/scripts/release-ios.sh nope; test $? -eq 2` | ❌ Wave 0 |
| V-F16 | 웹 push 게이트(R10): 옛 22-07 Task 2 의 verify 4개 그대로(백엔드 diff 0 · 배포 relay SHA 이후 diff 0 · 방침 `status: approved` · 웹 변경 허용 7개 부분집합) + 시행일 자리표시 0건 | static | 옛 22-07 명령 재사용 + `! grep -q '○월' webapp/src/app/privacy/page.tsx` | ✅ 명령 존재(옛 플랜) |

**Manual-only (부록 · 자동화 불가: 콘솔 · 타인 계정 · 실기기):**
| 항목 | 누가 | 확인 |
|------|------|------|
| Firebase 추가 · 앱 등록(SHA-1 비움) · 「시작하기」 · 그룹 · 테스터 | 사용자 | 재개 신호 `done appId=1:…:android:… 그룹=ghtrade-testers 테스터=N명` |
| GCP Android OAuth 클라이언트(업로드 SHA-1) · 동의 화면 상태 | 사용자 | 재개 신호 `done Android클라이언트(upload)=1 동의화면=프로덕션\|테스트+N` |
| 테스터 기기: 초대 수락 → (선택) App Tester → 출처 허용 → 설치 → Google 로그인 → 홈 · 트레이딩 탭 DmaGate 만 | 사용자·테스터 | UAT 기록(경고 문구 · 걸린 단계 수) |
| 두 번째 빌드: 메일/App Tester 알림 → 탭 → 덮어 설치(삭제 없이) → 로그인 유지 | 사용자 | UAT |
| iOS: TestFlight 내부 그룹 자동 배포 · 실기기 설치 · 로그인 · 두 번째 빌드 자동 도착 | 사용자 | UAT(옛 22-06/07 그대로) |

**Sampling (부록):**
- **태스크 커밋마다:** `check-release-hygiene.sh` + V-F1·V-F3·V-F4·V-F6 을 돌린다. 모두 수 초 안에 끝나고 네트워크를 쓰지 않는다.
- **업로드 태스크:** V-F7·V-F8·V-F9·V-F11.
- **phase 게이트:** 본문의 build/test/e2e 게이트 + V-F10·V-F13·V-F15·V-F16.
- **Wave 0:** `check-apk.sh` 신설 · 위생 검사 보강 · 래퍼 모드 확장 · iOS `latest` 모드. 음성 테스트(V-F4·V-F6)가 먼저 RED 가 되게 한다.

### 부록 — Sources

**Primary (HIGH — 이번 세션 실측 · Read)**
- rubygems API: `fastlane-plugin-firebase_app_distribution` 1.0.0(2026-03-04 · ruby >= 3.2 · fastlane >= 2.232.0 · 누적 55,422,974) · `google-apis-firebaseappdistribution_v1` 0.22.0 · `_v1alpha` 0.30.0
- gem 1.0.0 소스 Read: `actions/firebase_app_distribution_action.rb`(옵션 · 경로 해석 · 로그 출력) · `helper/firebase_app_distribution_auth_client.rb`(인증 우선순위) · `actions/firebase_app_distribution_get_latest_release.rb` · `helper/firebase_app_distribution_error_message.rb`
- scratchpad `bundle lock` diff(+3 gem · fastlane 불변) · `bundle install` · `fastlane action firebase_app_distribution`(Ruby 4.0.2)
- fastlane 2.240.1 설치본 Read: `plugins/plugin_manager.rb:55-67` · `actions/gradle.rb:60-100`
- `gcloud iam roles describe roles/firebaseappdistro.admin` · `gcloud projects get-iam-policy`(deployer = owner) · org 정책 effective 2건 · `gcloud services list --enabled/--available`
- debug APK 실측: `apksigner verify --verbose/--print-certs` · `keytool -printcert -jarfile` · `jarsigner -verify` · `aapt2 dump badging` · `unzip -l`
- 저장소 Read: 위 「인용 근거」 목록 전부 · `22-CONTEXT.md` · `22-04-SUMMARY.md` · 옛 `22-06-PLAN.md` · `22-07-PLAN.md`

**Secondary (MEDIUM — 공식 문서 인용)**
- https://firebase.google.com/docs/app-distribution/android/distribute-fastlane — 설치 · 인증 방식 · 파라미터 표(2026-09-24)
- https://firebase.google.com/docs/app-distribution/troubleshooting?platform=android — 500명/200명 · 150일 · 1,000릴리스 · 30일 초대 · 출처 허용(2026-09-24)
- https://firebase.google.com/docs/app-distribution/get-set-up-as-a-tester?platform=android — 테스터 단계 · 다른 계정 수락 · 1회 수락
- https://firebase.google.com/docs/app-distribution/android/distribute-console — 「시작하기」 · 새 빌드 알림 메일 · 150일
- https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project — 기존 GCP 프로젝트에 추가 · 켜지는 API · SA · 되돌릴 수 없음(2026-09-24)
- https://firebase.google.com/docs/projects/learn-more — Firebase 프로젝트 = GCP 프로젝트 · IAM 공유 · 결제 시 Blaze
- https://firebase.google.com/pricing — App Distribution 무료 제품
- https://developer.android.com/developer-verification · https://developer.android.com/developer-verification/guides/faq · https://support.google.com/android-developer-console/answer/16561738 — 일정 · 사이드로드 미적용(FAQ 2026-07-15) · ADB · 다중 서명 키
- https://developer.android.com/studio/publish/app-signing — 같은 인증서여야 업데이트(2026-03-06)
- https://support.google.com/googleplay/android-developer/answer/9842756 — 앱 서명 키 선택지 · 업로드 키와 분리 권고
- https://support.google.com/firebase/answer/6401008 · https://support.google.com/googleapi/answer/6158849 — 패키지+SHA-1 쌍 유일 · 인증서당 Android 클라이언트 1개
- https://github.com/fastlane/fastlane-plugin-firebase_app_distribution/releases — 1.0.0 「Require Ruby >= 3.2」 · 「Make uploads resumable」

**Tertiary (LOW)**
- https://github.com/firebase/firebase-tools/discussions/6283 — `FIREBASE_TOKEN`/`login:ci` deprecated
- https://www.helpnetsecurity.com/2026/06/19/android-developer-verification-rollout-markets/ · https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/ — 일정 보도(공식 페이지와 교차 확인)

### 부록 — Metadata

**Confidence breakdown:**
- **Standard stack: HIGH.** 레지스트리, gem 소스, 실제 잠금과 로드를 실측했다.
- **Architecture:** 둘로 나뉜다.
  - HIGH — lane·래퍼·검사 설계. 플러그인과 fastlane 소스, 실측이 근거다.
  - MEDIUM — 콘솔 절차. 공식 문서 인용이고 화면 라벨은 미확인이다.
- **Pitfalls:** 셋으로 나뉜다.
  - HIGH — F1~F5·F8·F9. 소스와 실측이 근거다.
  - MEDIUM — F6·F7·F10·F11. 공식 문서가 근거다.
  - LOW — F12(Play Protect).
- **개발자 인증: MEDIUM · 시한부.** 공식 FAQ 가 근거다. 2027 세부는 미발표다.

**Research date:** 2026-09-27
**Valid until:** 2026-10-11. 기한을 14일로 둔 이유는 두 가지다. 개발자 인증은 2026-09-30 적용 직후라 공지가 바뀔 수 있다. Firebase 문서도 2026-09-24 에 갱신됐다. 2027 적용 공지가 나오면 즉시 다시 확인한다.
