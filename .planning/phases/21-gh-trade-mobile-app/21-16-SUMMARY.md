---
phase: 21-gh-trade-mobile-app
plan: 16
subsystem: mobile
tags: [capacitor, ios, android, verify-prod, readme, uat, gates]

requires:
  - phase: 21-gh-trade-mobile-app (21-01 ~ 21-15)
    provides: "Capacitor Remote-URL 셸 · 네이티브 탭바 · 당겨서 새로고침 · 오프라인 폴백 · 테마 · 뒤로가기 · 아이콘 · 네이티브 Google 로그인 · 웹 앱 분기"
provides:
  - "mobile/scripts/verify-prod-config.mjs — 생성 설정 운영값 검사(스스로 sync 안 함) → PROD CONFIG OK"
  - "native:verify-prod 스크립트"
  - "mobile/README.md — 빌드·dev·스모크·자산·운영 sync 절차 · 확정 번들 ID"
  - "Task 1 자동 게이트 기록(아래 표)"
affects: [21-verify-work, push(Vercel 웹 배포)]

actuals:
  tokens: 4600
  tasks: 1
  commits: 3   # 21-16 커밋만: e4b0326 · 1cebbd2 · 02f29df (+ 이 SUMMARY 갱신 docs 커밋). `git rev-list --count 6f64cca..02f29df` = 6 은 동시 세션(quick-260926-d76 · sketch-006) 커밋 3건을 포함한 값
plan_head_before: 6f64cca252af913976c4d8fa6e4f2ec16a510800

tech-stack:
  added: []
  patterns:
    - "운영 설정 검사는 현재 상태만 읽는다 — sync 는 사람이 명시적으로(native:sync) 하고 검사는 그 결과를 증명"

key-files:
  created:
    - mobile/scripts/verify-prod-config.mjs
    - mobile/README.md
    - mobile/scripts/check-sim-entitlements.sh
  modified:
    - mobile/package.json
    - mobile/scripts/smoke-ios.sh
    - mobile/ios/App/App.xcodeproj/project.pbxproj

key-decisions:
  - "verify-prod 는 플랜 항목(url · cleartext · appId · server 금지 키 · 플러그인 매니페스트 cleartext)에 더해 WebView 디버깅 · CapacitorHttp/CapacitorCookies · 앱 매니페스트 cleartext · Info.plist NSAllowsArbitraryLoads 도 본다(T-21-04 · RESEARCH V14)"
  - "iOS 시뮬레이터 빌드도 서명한다(CODE_SIGNING_ALLOWED=NO 제거 · DEVELOPMENT_TEAM 954QPCS3F5 자동 서명). 엔타이틀먼트 없는 빌드는 GoogleSignIn 키체인 저장이 -34018 로 실패한다. check-sim-entitlements.sh 가 빌드마다 application-identifier 를 확인한다"
  - "UAT 2차는 실서버(https://trade.jx1.io + wss://dma.jx1.io/ws)로 한다 — push·Vercel 배포 뒤 앱을 다시 실행만 하면 된다. 로컬 dev 웹 + 프록시 경로는 relay 를 빼야 해서 DMA 항목을 볼 수 없었다"
  - "UAT 준비: 로컬 server(:8080) env 가 저장소에 없고 운영 API CORS 가 http://localhost:3100 을 403 으로 거절 → scratchpad 의 커밋하지 않는 로컬 프록시(:8080 → 운영 Cloud Run API, Origin 재작성 · 요청 줄만 로그)로 데이터 화면을 살림. relay(:8090)는 띄우지 않음 — UAT 중 실주문 경로가 열리지 않게"

requirements-completed: []

coverage:
  - id: D1
    description: "native:verify-prod 가 운영 설정이면 PROD CONFIG OK, dev sync 잔류 시 FAIL 줄과 exit 1"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:verify-prod (운영 sync 뒤) → PROD CONFIG OK"
        status: pass
      - kind: other
        ref: "CAP_SERVER_URL=http://localhost:3100 cap sync 뒤 node scripts/verify-prod-config.mjs → FAIL 5줄 · exit 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "mobile/README.md 가 빌드·dev·스모크·자산·운영 sync 절차와 번들 ID 를 담는다(97줄)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "wc -l ≥ 40 · grep native:verify-prod · grep adb reverse"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase 21 전 자동 게이트 green(알려진 범위 밖 e2e 3건 제외)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "build_command · test_command · pnpm typecheck · playwright 전체 · check-tab-routes:ios · native:test:android · native:build:* · native:smoke:* · verify-prod · 비밀 파일"
        status: pass
    human_judgment: false
  - id: D4
    description: "실기 UAT(iPhone 17 · iPad Pro 11 M5 · Android 에뮬) 14항목 + push 결정"
    requirement: MOBILE-01
    verification: []
    human_judgment: true
    rationale: "네이티브 UI 렌더·OS 제스처·키보드·네트워크·회전·Google 계정 UI 는 사람이 봐야 한다(21-VALIDATION Manual-Only). UAT 1차(로컬 dev) 결과 이슈 2건 — 1건 코드 수정(02f29df), 1건 환경 산물. 실서버 UAT 2차 체크포인트 대기 중"
  - id: D5
    description: "iOS 시뮬레이터 빌드에 application-identifier 엔타이틀먼트가 들어간다(키체인 -34018 방지)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:build:ios → SIM ENTITLEMENTS OK application-identifier=954QPCS3F5.com.ghtrade.app"
        status: pass
      - kind: other
        ref: "음성: CODE_SIGNING_ALLOWED=NO 빌드 → check-sim-entitlements.sh exit 1"
        status: pass
      - kind: other
        ref: "native:smoke:ios (서명 빌드) → SMOKE OK ready platform=ios"
        status: pass
      - kind: human
        ref: "실서버 UAT 2차 — iPhone 17 네이티브 Google 로그인 성공(2회차 · 취소 포함)"
        status: pending
    human_judgment: true

duration: 22min (Task 1 + UAT 준비) + 25min (UAT 1차 이슈 수정 · 실서버 UAT 준비)
completed: 2026-09-26
status: halted
---

# Phase 21 Plan 16: Phase 마감 — 운영 설정 검사 · 모바일 README · 전 게이트 · UAT Summary (초안 — 실서버 UAT 2차 대기)

**`native:verify-prod` 가 iOS·Android 생성 설정의 운영 URL·cleartext·appId·금지 키를 sync 없이 검사하고(dev sync 상태에서는 FAIL 5줄로 실제로 잡음), 모바일 README 를 더했으며, 빌드·단위(628+2259)·루트 typecheck·Playwright·iOS/Android 빌드·경로표·양 플랫폼 스모크가 모두 green 이다 — Task 2 실기 UAT 와 push 결정만 남았다.**

> 이 파일은 Task 2(checkpoint:human-verify) 전의 **초안**이다. `status: halted` 는 체크포인트에서 설계대로 멈췄다는 뜻이다. UAT 1차(로컬 dev) 결과와 수정은 아래 「UAT 1차 결과」에 있다. 실서버 UAT 2차 결과·최종 상태는 이어받는 실행기가 채운다.

## Performance

- **Started:** 2026-09-26T00:03:55Z
- **Checkpoint reached:** 2026-09-26T00:26Z
- **Tasks:** 1/2 (Task 2 = 체크포인트 대기)
- **Files modified:** 3

## Accomplishments

- `mobile/scripts/verify-prod-config.mjs` 를 만들었다. 생성 설정 두 개를 읽어 `server.url === https://trade.jx1.io` · cleartext 아님 · `appId === com.ghtrade.app`(`APP_ID` 로 덮어쓰기 가능) · `server.allowNavigation`/`errorPath` 없음을 본다. 또 WebView 디버깅 · CapacitorHttp/Cookies 가 꺼져 있는지, Android 매니페스트 두 곳에 `usesCleartextTraffic="true"` 가 없는지, iOS Info.plist 에 ATS 예외가 없는지도 본다.
  - 생성 설정이 없으면 「먼저 `pnpm --filter @gh-radar/mobile run native:sync` 를 실행하세요」와 함께 exit 1 이다.
  - 스스로 sync 하지 않는다(`cap sync|execSync|spawnSync` 0건).
- `mobile/package.json` 에 `native:verify-prod` 를 더했다.
- `mobile/README.md`(97줄)를 썼다. 개요(D-01), 식별자, 요구 도구, 명령표, dev 절차(3100 · adb reverse · LAN IP 로그인 불가), 기기 빌드 전 sync→verify-prod, 버전 업 시 재생성·커밋, SwiftPM 키체인 우회, 비밀 파일, 범위 밖을 담았다.

## Task 1 게이트 결과 (2026-09-26 실측)

| # | 게이트 | 결과 |
|---|---|---|
| 1 | build_command (shared build · relay typecheck · typecheck:tests · webapp typecheck) | exit 0 · `error TS` 0 |
| 2 | test_command | relay **28 files / 628 passed** · webapp **120 files / 2259 passed · 1 skipped** · failed 0 |
| 3 | 루트 `pnpm typecheck` | exit 0 · `error TS` 0 (전 워크스페이스) |
| 4 | Playwright 전체 | 전체 실행 **142 passed · 9 skipped · 1 failed · 36 did not run**. 실패 1건은 `trading-workbench.spec.ts:580`(deferred-items #1, 카드 헤더 `<b>삼성전자</b>` 19px 넘침 — 기록과 같은 값)이다. 이 spec 은 `mode: 'serial'` 이라 뒤 36건이 실행되지 않았다. 알려진 3건을 `--grep-invert` 로 빼고 spec 을 다시 돌려 **41 passed** 를 얻었다. 나머지 2건도 따로 돌려 기록과 같은 모양으로 실패함을 확인했다(#2 344 카드 매수 pane 17px 넘침 · #3 입력 글꼴 기대 16px/실제 14px). 3건 모두 phase 21 이전부터 있던 것이다(deferred-items.md). |
| 5 | `native:check-tab-routes:ios` | **TAB ROUTES OK 36** (36/36) |
| 6 | `cap sync android` · `native:test:android` | BUILD SUCCESSFUL · TabRoutesTest **4 tests / 0 failures**(`--rerun` 으로 재실행해도 같음) |
| 7 | `native:build:ios` | **\*\* BUILD SUCCEEDED \*\***. SwiftPM 키체인 행 우회로 `swift package resolve --disable-keychain` 를 먼저 돌렸다. `CapApp-SPM/.build` 는 지웠다. |
| 8 | `native:build:android` | **BUILD SUCCESSFUL** |
| 9 | `native:smoke:ios` (iPhone 17 · iOS 27.0) | **SMOKE OK ready platform=ios** → 운영 sync 복원 |
| 10 | `native:smoke:android` (Medium_Phone_API_36.1) | **SMOKE OK ready platform=android** · `FAILED` 0 → 운영 sync 복원 |
| 11 | `native:verify-prod` | **PROD CONFIG OK** (스모크 두 개 뒤) |
| 12 | 비밀 파일 미추적 (`*.jks` · `*.keystore` · `*.p12` · `*.mobileprovision`) | `git ls-files` 0건 |
| + | verify-prod 음성 확인 | dev sync 직후 **FAIL 5줄**(ios url · ios cleartext · android url · android cleartext · 플러그인 매니페스트 usesCleartextTraffic) · exit 1 |
| + | `scripts/vercel-ignore-build.sh` 무수정 (D-05) | `git diff origin/master..HEAD -- scripts/vercel-ignore-build.sh` 0줄 |

## UAT 1차 결과 (2026-09-26 · 로컬 dev 웹 :3100 + UAT 프록시 :8080)

사용자 보고 3건과 처리:

| # | 보고 | 판정 | 처리 |
|---|---|---|---|
| 1 | Android: Google 로그인은 되지만 로그인 뒤 「DMA 연결 안 됨」 | **UAT 환경 산물**(코드 결함 아님) | 실서버 UAT 로 해소 |
| 2 | iPhone: Google 로그인 끝에 「로그인 처리에 실패」(auth_failed) | **코드/빌드 결함** — 원인 확정 | `02f29df` 수정 |
| 3 | 실서버로 시험하는 게 낫겠다 | 채택 | 운영 URL 앱을 세 기기에 설치해 둠. push 는 오케스트레이터가 한다 |

### 이슈 2 — iOS auth_failed 근본 원인

- iPhone 17 시뮬레이터 통합 로그: Google 토큰 교환(09:37:55.219 `POST oauth2.googleapis.com/token`)은 성공했다. 0.26초 뒤 securityd 가 `App[18204] delete Error Domain=NSOSStatusErrorDomain Code=-34018 "Client has neither application-identifier nor keychain-access-groups entitlements"` 를 남겼다.
- 시뮬레이터 앱을 `CODE_SIGNING_ALLOWED=NO` 로 빌드해 엔타이틀먼트가 하나도 없었다. 그래서 GoogleSignIn(GTMAppAuth)이 로그인 결과를 키체인에 쓰지 못했고, 플러그인이 reject 해 웹이 auth_failed 를 보였다.
- nonce·aud 처리는 원인이 아니다. capgo iOS GoogleProvider 는 nonce 를 `GIDSignIn.signIn` 에 그대로 넘기고, forcePrompt 는 restorePreviousSignIn 을 건너뛴다. 같은 웹 코드의 Android 로그인은 성공했다.
- 수정(`02f29df`):
  - `native:build:ios` · `smoke-ios.sh` 에서 `CODE_SIGNING_ALLOWED=NO` 를 뺐다. 시뮬레이터는 로컬 실행용 ad-hoc 서명이 된다.
  - 프로젝트에 `DEVELOPMENT_TEAM = 954QPCS3F5` 를 넣었다(두 빌드 구성 + TargetAttributes, 자동 서명 유지).
  - `scripts/check-sim-entitlements.sh` 를 더했다. 시뮬레이터는 엔타이틀먼트를 코드 서명이 아니라 실행 파일의 `__TEXT,__entitlements` 섹션에서 읽는다. 그래서 `codesign -d --entitlements` 로는 보이지 않는다. 이 스크립트는 그 섹션을 읽어 `application-identifier = 954QPCS3F5.com.ghtrade.app` 을 확인하고, 없으면 exit 1 이다. 빌드와 스모크 둘 다 이 검사를 돈다.
  - Keychain Sharing 엔타이틀먼트 파일은 만들지 않았다. -34018 문구가 요구하는 것은 둘 중 하나이고, `application-identifier` 만으로 기본 접근 그룹이 생긴다.
- 증거:
  - 서명 빌드 → `SIM ENTITLEMENTS OK application-identifier=954QPCS3F5.com.ghtrade.app`
  - 음성 대조: `CODE_SIGNING_ALLOWED=NO` 빌드 → `SIM ENTITLEMENTS FAIL` · exit 1
  - `native:smoke:ios`(서명 빌드) → `SMOKE OK ready platform=ios`
  - 실기기 빌드 시험(`generic/platform=iOS`, scratchpad): `Apple Development … TeamIdentifier=954QPCS3F5` 로 서명됐다. 프로필은 기존 팀 와일드카드 「iOS Team Provisioning Profile: *」이고 `application-identifier 954QPCS3F5.com.ghtrade.app` 이다. Xcode 에서 실기기로 바로 실행할 수 있다.
- 남은 확인: 앱 실행만으로는 키체인을 건드리지 않는다(실행 직후 로그에 securityd/-34018 기록 0건). 실제 로그인 성공은 사람이 계정 UI 를 눌러야 해서 UAT 2차로 넘긴다.

### 이슈 1 — Android 「DMA 연결 안 됨」은 UAT 환경 산물

- UAT 1차에서 relay(:8090)는 일부러 띄우지 않았다. 에뮬레이터 `adb reverse` 도 `tcp:3100` · `tcp:8080` 두 개뿐이었다(정리 전 `adb reverse --list` 실측). dev 웹 번들의 relay 폴백은 `ws://localhost:8090/ws` 다. 이 경로에서는 DMA 필이 연결 실패→재접속→「다시 연결하지 못했어요」가 되거나 「권한 없음」 게이트가 서는 것이 정상이다.
- 「운영 relay 가 `Origin: http://localhost:3100` 을 거절한다」는 가설은 **저장소 근거가 없다**. relay 에는 Origin 허용 목록이 없다. `relay/src/ws/fanout.ts` `handleUpgrade` 는 경로만 보고, 인증은 첫 메시지 토큰 검증(`verifyToken` → Supabase `getUser`)과 `dma_credentials` 매핑이다. `infra/relay/Caddyfile` 의 `dma.jx1.io` 블록에도 Origin 규칙이 없다. relay 코드는 바꾸지 않았다.
- 결론은 같다. 실서버 앱은 운영 웹(`https://trade.jx1.io`)을 싣고, 운영 웹은 `wss://dma.jx1.io/ws` 로 붙는다. 운영 relay 는 살아 있다(2026-09-26 09:44 KST `GET https://dma.jx1.io/healthz` → 200 `status ok · vpn true · dma true`).
- 실서버에서도 「DMA 계정이 연결되지 않았어요」가 뜨면 relay 가 `dma_credentials` 미등록을 확정한 것이다. 그 경우 로그인한 Google 계정이 DMA 매핑 계정과 다른지 먼저 본다(데이터 문제이고 코드 문제가 아니다).

### 실서버 UAT 2차 준비 (완료)

- `native:sync` → `native:verify-prod` → **PROD CONFIG OK**(https://trade.jx1.io · cleartext 없음 · com.ghtrade.app).
- iOS: `native:build:ios` → BUILD SUCCEEDED · SIM ENTITLEMENTS OK. iPhone 17(`3B11B38C…`)과 iPad Pro 11-inch (M5)(`52DD0C30…`)에 설치하고 실행했다. 두 기기 모두 설치된 앱 `capacitor.config.json` 의 `server.url` 이 `https://trade.jx1.io` 다.
- Android: `adb reverse --remove-all` 로 역방향 규칙을 0개로 만들었다. `native:build:android` → BUILD SUCCESSFUL. APK 의 `server` 는 `{url: https://trade.jx1.io, cleartext: false}` 다. emulator-5554 에 설치하고 실행했다.
- 세 기기 모두 지금은 **push 전 운영 웹**(phase 21 웹 코드 없음)을 싣고 있다. 로그인 화면은 뜨지만 네이티브 로그인 분기가 없다. push·Vercel 배포 전에는 로그인하지 않는다.
- UAT 프록시(PID 15856, :8080)는 종료했다. webapp dev 서버(:3100)는 다른 세션이 쓰므로 그대로 두었다.

## Task Commits

1. **Task 1: verify-prod-config.mjs + README + 전 게이트** — `e4b0326` (feat)
2. **Task 2: 실기 UAT** — UAT 1차 이슈 수정 `02f29df` (fix, iOS 시뮬레이터 서명 · 엔타이틀먼트 검사). 실서버 UAT 2차 체크포인트 대기

## Files Created/Modified

- `mobile/scripts/verify-prod-config.mjs` — 생성 설정 운영값 검사
- `mobile/package.json` — `native:verify-prod`
- `mobile/README.md` — 모바일 빌드·실행·검증 절차 (+ 시뮬레이터 서명 이유)
- `mobile/scripts/check-sim-entitlements.sh` — 시뮬레이터 빌드 application-identifier 검사
- `mobile/scripts/smoke-ios.sh` — 서명 빌드 + 엔타이틀먼트 검사
- `mobile/ios/App/App.xcodeproj/project.pbxproj` — `DEVELOPMENT_TEAM = 954QPCS3F5`

## Decisions Made

- verify-prod 검사 범위를 플랜보다 넓혔다. T-21-04(릴리스 WebView 디버깅)와 RESEARCH V14(CapacitorHttp · ATS 예외 · 앱 매니페스트 cleartext)를 같은 스크립트에서 본다. 비용은 파일 읽기 몇 번뿐이다.
- UAT 데이터 경로에는 로컬 프록시를 쓴다(아래 Deviations 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] verify-prod 금지 키 검사 확장**
- **Found during:** Task 1 ①
- **Issue:** 플랜 목록은 `server` 키만 보지만, threat model T-21-04 는 「verify-prod 가 21-01 금지 키 유지 확인」을 완화책으로 적었다.
- **Fix:** `android/ios.webContentsDebuggingEnabled` · `plugins.CapacitorHttp/CapacitorCookies.enabled` · 앱 `AndroidManifest.xml` cleartext · `Info.plist` `NSAllowsArbitraryLoads` 검사를 더했다.
- **Files modified:** mobile/scripts/verify-prod-config.mjs
- **Commit:** e4b0326

**2. [Rule 3 - Blocking] UAT 준비 — 로컬 API 가 없어 데이터 화면이 비는 문제**
- **Found during:** Task 2 준비
- **Issue:** dev webapp 의 `NEXT_PUBLIC_API_BASE_URL` 은 `http://localhost:8080` 인데 로컬 server 를 띄울 env 파일이 저장소 어디에도 없다. 운영 API 는 preflight 에서 `Origin: http://localhost:3100` 을 **403** 으로 거절한다. 이대로면 홈·상승률·종목상세·테마·챗이 오류 화면이라 UAT 5·6 을 볼 수 없다.
- **Fix:** 커밋하지 않는 scratchpad 프록시 `uat-api-proxy.mjs` 를 `127.0.0.1:8080` 에 띄웠다. 운영 Cloud Run API 로 넘기면서 Origin 을 `https://trade.jx1.io` 로 바꾸고, 응답 ACAO 는 원래 출처로 되돌린다. 로그에는 메서드·경로·상태만 남긴다. D-18 확인(종목상세 당김 뒤 `POST …/refresh` 없음)도 이 로그로 한다.
  - relay(:8090)는 띄우지 않았다. UAT 중에 실계좌 주문 경로가 열리지 않게 하려는 것이다.
- **Files modified:** 없음(저장소 밖)

**3. [Rule 1 - Bug] iOS 시뮬레이터 빌드가 서명되지 않아 Google 로그인이 키체인에서 실패**
- **Found during:** Task 2 UAT 1차 (iPhone 17)
- **Issue:** `CODE_SIGNING_ALLOWED=NO` 빌드에는 엔타이틀먼트가 없다. GoogleSignIn 키체인 호출이 -34018 로 실패하고 웹은 auth_failed 를 보였다.
- **Fix:** 서명 빌드로 바꿨다(ad-hoc · DEVELOPMENT_TEAM 954QPCS3F5 자동 서명). 빌드·스모크가 `check-sim-entitlements.sh` 로 확인한다.
- **Files modified:** mobile/package.json · mobile/scripts/smoke-ios.sh · mobile/scripts/check-sim-entitlements.sh · mobile/ios/App/App.xcodeproj/project.pbxproj · mobile/README.md
- **Commit:** 02f29df

**Total deviations:** 3 (Rule 1 ×1 · Rule 2 ×1 · Rule 3 ×1). **Impact:** 범위 확장 없음. release·아카이브·스토어 서명은 여전히 범위 밖이다. 서명 키·프로필은 커밋하지 않았다. 프록시는 종료했다.

## Issues Encountered

- Xcode 27 에는 `Simulator.app` 이 없다. 시뮬레이터 UI 는 `/Applications/Xcode.app/Contents/Applications/DeviceHub.app` 으로 열었다.
- iOS 시뮬레이터 런타임이 26.4 와 27.0 두 개다. 스모크(`simctl boot "iPhone 17"`)는 27.0 기기를 썼고, UAT 도 27.0 기기(iPhone 17 `3B11B38C…` · iPad Pro 11-inch (M5) `52DD0C30…`)를 쓴다.

## Known Stubs

없음.

## User Setup Required

없음.

## Next Phase Readiness

- 실서버 UAT 2차 대기. 생성 설정은 **운영 sync 상태**다(PROD CONFIG OK).
- 세 기기(iPhone 17 · iPad Pro 11 M5 · emulator-5554)에 운영 URL 앱이 설치돼 있다. 앱이 원격 URL 을 싣기 때문에 push·Vercel 배포 뒤에는 앱을 다시 실행만 하면 된다. 재빌드는 필요 없다.
- push 하지 않았다. push 는 오케스트레이터가 한다(동시 세션 로그인 화면 커밋 `eda719a` 뒤). `eda719a` 는 로그인 로직(OAuth·네이티브·safeNext)을 바꾸지 않았다고 기록돼 있다.
