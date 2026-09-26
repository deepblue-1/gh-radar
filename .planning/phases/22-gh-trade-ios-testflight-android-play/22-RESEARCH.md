# Phase 22: GH Trade 테스트 배포 (iOS TestFlight · Android Play 내부 테스트) - Research

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
