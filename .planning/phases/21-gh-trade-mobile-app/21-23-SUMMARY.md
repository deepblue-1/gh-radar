---
phase: 21-gh-trade-mobile-app
plan: 23
subsystem: mobile
tags: [capacitor, ios, android, gates, uat, verify-prod, gap-closure]

requires:
  - phase: 21-gh-trade-mobile-app (21-17 ~ 21-22)
    provides: "G-21-1 탭바 캡슐 C(iOS·Android·웹 여백 98) · G-21-N1 기본 다크 · G-21-N2 테마 아이콘 목적지 규칙 · G-21-N3 호스트 밖 http(s) 인앱 브라우저(iOS·Android)"
provides:
  - "갭 클로징 뒤 전 자동 게이트 green 기록(운영 설정 기준 · 아래 게이트 표)"
  - "push 전 UAT 환경 — dev 웹 :3100 · UAT 프록시 127.0.0.1:8080(PID 36151) · 저장값 없는 dev 빌드 앱 세 기기 새 설치·실행 중(아래 UAT 환경 표)"
affects: [21-24 (UAT 재검증 · push 결정 · dev 설정 복원 · 프록시 종료)]

actuals:
  tokens: 5200     # chars/4 — 이 SUMMARY 한 파일(코드 변경 없음)
  tasks: 2
  commits: 0       # 측정값: git rev-list --count ee800fb..HEAD (SUMMARY 작성 시점). 검증 전용 플랜이라 태스크 커밋 없음 — 이 SUMMARY·STATE docs 커밋은 별도
plan_head_before: ee800fbc7ca719db3f5966de8c32015bc9181327

tech-stack:
  added: []
  patterns:
    - "게이트(운영 sync)와 UAT 설치(dev sync)를 태스크로 나눈다 — 게이트 스모크가 운영 sync 로 복원한 뒤에 dev 빌드를 굽기 때문에 게이트가 UAT 설치본을 덮지 않는다"

key-files:
  created:
    - .planning/phases/21-gh-trade-mobile-app/21-23-SUMMARY.md
  modified: []

key-decisions:
  - "UAT 프록시 업스트림은 gcloud run services describe 가 돌려준 https://gh-radar-server-fnbhvevuva-du.a.run.app 를 쓴다(env 파일 미열람). 21-16 스크립트의 하드코딩 주소는 빼고 UPSTREAM 환경변수 필수로 바꿨다(scratchpad · 커밋 안 함)"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "갭 네 건(G-21-1 · N1 · N2 · N3)을 닫은 21-17~21-22 뒤 전 자동 게이트 green — build · test · 루트 typecheck · Playwright(알려진 3건 제외) · iOS 경로표·링크표·빌드·스모크 · Android JUnit·빌드·스모크 · verify-prod · 비밀 파일 0"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "build_command + pnpm typecheck → exit 0 · error TS 0"
        status: pass
      - kind: unit
        ref: "test_command → relay 28 files/628 passed · webapp 121 files/2266 passed · 1 skipped"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test --grep-invert \"격자 1/2/3단|P20-3 최악값|종목 추가 입력이 16px\" → 184 passed · 9 skipped · 0 failed"
        status: pass
      - kind: other
        ref: "native:check-tab-routes:ios → TAB ROUTES OK 36 · native:check-external-links:ios → EXTERNAL LINKS OK 32 · native:build:ios → BUILD SUCCEEDED · native:smoke:ios → SMOKE OK ready platform=ios"
        status: pass
      - kind: unit
        ref: "native:test:android --rerun → TabRoutesTest 4/0 failures · ExternalLinksTest 1/0 failures · native:build:android BUILD SUCCESSFUL · native:smoke:android SMOKE OK ready platform=android"
        status: pass
      - kind: other
        ref: "native:verify-prod → PROD CONFIG OK · git ls-files 비밀 파일 0건"
        status: pass
    human_judgment: false
  - id: D2
    description: "push 전 UAT 환경 — dev 웹 :3100 · UAT 프록시 :8080 응답 · 저장값 없는 dev 빌드가 iPhone 17 · iPad Pro 11-inch (M5) · emulator-5554 에 새로 설치돼 실행 중 · relay(:8090) 미기동"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "curl :3100/login · :8080/api/health → UAT ENDPOINTS OK"
        status: pass
      - kind: other
        ref: "adb shell pm list packages com.ghtrade.app → 1 · simctl get_app_container 두 UDID 성공 · 세 기기 ready 로그"
        status: pass
      - kind: other
        ref: "native:verify-prod FAIL 줄 수 6(>0 — 생성 설정이 dev 임을 증명) · lsof :8090 LISTEN 0줄"
        status: pass
    human_judgment: true
    rationale: "환경 준비는 자동 확인됐지만, 이 환경으로 갭 네 건의 실제 모양(탭바 캡슐 · 다크 첫 프레임 · 아이콘 · 인앱 브라우저)을 보는 것은 21-24 사용자 UAT 몫이다"

duration: 12min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 23: 갭 클로징 전 게이트 · push 전 UAT 환경 Summary

**21-17~21-22(탭바 캡슐 C · 기본 다크 · 테마 아이콘 목적지 규칙 · 인앱 브라우저) 뒤 전 자동 게이트가 green 이다. 루트 typecheck · 단위 628+2266 · Playwright 184 passed(알려진 3건만 제외) · iOS 경로표 36 · 링크표 32 · Android JUnit 5 · 양 플랫폼 빌드·스모크 · PROD CONFIG OK 를 확인했다. 이어서 push 전 UAT 환경을 준비했다 — dev 웹 :3100 · UAT 프록시 :8080(PID 36151) · 저장값 없는 dev 빌드를 iPhone 17 · iPad Pro 11 (M5) · Android 에뮬레이터에 새로 설치했고, 세 기기 모두 다크 로그인 화면으로 떠 있다.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-26T04:38:04Z
- **Completed:** 2026-09-26T04:50:16Z
- **Tasks:** 2/2
- **Files modified:** 0 (코드 변경 없음 — 이 SUMMARY 만)

## 게이트 표 (Task 1 · 2026-09-26 실측 · 운영 설정 기준)

| # | 게이트 | 결과 |
|---|---|---|
| 1 | build_command (shared build · relay typecheck · typecheck:tests · webapp typecheck) | exit 0 · `error TS` 0 |
| 2 | 루트 `pnpm typecheck` (전 워크스페이스) | exit 0 · `error TS` 0 |
| 3 | test_command | relay **28 files / 628 passed** · webapp **121 files / 2266 passed · 1 skipped** · failed 0 |
| 4 | Playwright 전체 (`--grep-invert "격자 1/2/3단\|P20-3 최악값\|종목 추가 입력이 16px"`) | **184 passed · 9 skipped · 0 failed** (6.4m). 제외는 deferred-items.md 의 3건뿐이다 — `trading-workbench.spec.ts` 「5. 격자 1/2/3단 × 폰/와이드 … 잘림 0」 · 「P20-3 최악값 × 본문 344 · 700 · 830 · 992 …」 · 「터치 기기 · iPhone 가로 폭 844 에서 종목 추가 입력이 16px 다」 |
| 5 | `native:check-tab-routes:ios` | **TAB ROUTES OK 36** |
| 6 | `native:check-external-links:ios` | **EXTERNAL LINKS OK 32** |
| 7 | `native:build:ios` (운영 sync) | **\*\* BUILD SUCCEEDED \*\*** · SIM ENTITLEMENTS OK `954QPCS3F5.com.ghtrade.app` (SwiftPM 키체인 우회 불필요했다) |
| 8 | `native:smoke:ios` (iPhone 17 · iOS 27.0) | **SMOKE OK ready platform=ios** → 운영 sync 복원 |
| 9 | `cap sync android` · `native:test:android` | BUILD SUCCESSFUL. 첫 실행이 up-to-date(캐시)라 `--rerun` 으로 다시 실행: **TabRoutesTest 4 tests / 0 failures · ExternalLinksTest 1 test(26케이스 표) / 0 failures** (결과 XML 타임스탬프 04:46:44Z) |
| 10 | `native:build:android` (운영 sync) | **BUILD SUCCESSFUL** |
| 11 | `native:smoke:android` (emulator-5554 · Medium_Phone_API_36.1) | **SMOKE OK ready platform=android** · `FAILED` 0 → 운영 sync 복원 |
| 12 | `native:verify-prod` (스모크 두 개 뒤) | **PROD CONFIG OK — https://trade.jx1.io · cleartext 없음 · appId com.ghtrade.app (ios · android)** |
| 13 | 비밀 파일 미추적 (`*.jks` · `*.keystore` · `*.p12` · `*.mobileprovision`) | `git ls-files` 0건 |
| + | `scripts/vercel-ignore-build.sh` 무수정 | `git diff origin/master..HEAD` 0줄 |
| + | 추적 파일 | `git status -sb` 에 이 태스크가 만든 변경 없음(다른 세션의 `.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock` 만) |

- Playwright 의 relay e2e 는 spec 픽스처가 스텁 게이트웨이와 함께 relay 를 잠깐 띄운다. 끝난 뒤 `lsof :8090` LISTEN 0줄을 확인했다. UAT 에는 relay 가 없다.

## UAT 환경 (Task 2 · 21-24 가 이어받는다)

| 항목 | 값 |
|---|---|
| dev 웹 | `http://localhost:3100` — **이 플랜이 띄우지 않았다.** 21-20 이 재기동한 next-server **PID 97752**(cwd `/Users/alex/repos/gh-radar/webapp`, 13:20:38 시작, 이 작업 트리를 서빙). 로그 `/private/tmp/claude-501/-Users-alex-repos-gh-radar/ac3fb0a3-3d34-454c-962d-ec173e27f4ef/scratchpad/dev3100.log`. 종료 책임은 21-24 가 판단한다(다른 세션도 쓸 수 있다) |
| UAT 프록시 | `127.0.0.1:8080` → `https://gh-radar-server-fnbhvevuva-du.a.run.app` (gcloud 조회) · **PID 36151** (nohup) · 스크립트 `…/ac3fb0a3-…/scratchpad/uat-api-proxy.mjs` · 로그 `…/scratchpad/uat-api-proxy.log`(메서드·경로·상태만). Origin → `https://trade.jx1.io` 재작성, 응답 ACAO 는 원래 출처로 되돌림(`Origin: http://localhost:3100` → `200 acao=http://localhost:3100` 확인). 종료는 21-24 |
| relay (:8090) | **띄우지 않았다** — `lsof -iTCP:8090 -sTCP:LISTEN` 0줄. UAT 중 실주문 경로 없음(트레이딩 화면의 DMA 필은 연결 실패가 정상 — 21-16 UAT 1차 이슈 1과 같은 환경 산물) |
| 설치 URL | `http://localhost:3100` (dev · cleartext) — `CAP_SERVER_URL=http://localhost:3100 native:build:ios / native:build:android` |
| 생성 설정 | **dev 상태**(verify-prod FAIL 5줄: ios url · ios cleartext · android url · android cleartext · 플러그인 매니페스트 cleartext). 두 생성 파일은 gitignore 대상. 21-24 가 `native:sync` → `native:verify-prod` 로 복원한다 |
| 21-17 선택 | **a** — androidx.browser 1.9.0 을 앱 모듈에 선언(Android Custom Tabs) |

| 기기 | UDID / 시리얼 | 새 설치 | `get_app_container` | 설치본 `server.url` | 웹 ready |
|---|---|---|---|---|---|
| iPhone 17 (iOS 27.0) | `3B11B38C-DDE2-40F7-AA65-2163A581A6B9` | uninstall → install → launch (PID 37398) | **성공** | `http://localhost:3100` | `13:48:44 ready platform=ios nativeApp=true` |
| iPad Pro 11-inch (M5) (iOS 27.0) | `52DD0C30-86BB-4374-89E8-748F6DE00998` | uninstall → install → launch (PID 37543) | **성공** | `http://localhost:3100` | `13:48:48 ready platform=ios nativeApp=true` |
| Android emulator-5554 (Medium_Phone_API_36.1) | `emulator-5554` | `adb uninstall` → `adb install` → `am start` | — (`pm list packages` 1건) | `{"url":"http://localhost:3100","cleartext":true}` (APK assets) | `13:49:30 ready platform=android nativeApp=true` |

- **저장값 없음(N1 첫 실행 조건):** iOS 두 기기는 uninstall 로 데이터 컨테이너(UserDefaults · WebKit 저장소)가 지워졌다. Android 는 uninstall 뒤 첫 실행 전 `run-as … ls shared_prefs` → 없음. 21-21 이 남긴 로그인 세션·`theme=light` 저장값은 사라졌다.
- **첫 화면 확인(스크린샷):** 세 기기 모두 **다크** 배경의 `/login`(GH Trade 로고 · 「Google로 로그인」, 탭바 없음)이다. 좌하단 「N」 원은 Next dev 인디케이터로 dev 빌드에만 보인다.
- Android `adb reverse`: `tcp:3100` · `tcp:8080` 두 개(`--remove-all` 뒤 다시 설정). `tcp:8090` 은 잇지 않았다.
- 시뮬레이터 창은 `/Applications/Xcode.app/Contents/Applications/DeviceHub.app` 으로 열었다.
- 스크린샷: `…/scratchpad/u23-iphone.png` · `u23-ipad.png` · `u23-android.png`.

## Accomplishments

- 갭 네 건을 닫은 뒤 전 자동 게이트를 운영 설정 기준으로 다시 돌려 모두 green 을 확인했다(게이트 표). 21-16 대비 새 게이트 2개(`native:check-external-links:ios` 32 · `ExternalLinksTest`)도 들어 있다.
- push 전 UAT 환경을 추적 파일을 바꾸지 않고 준비했다. 프록시는 scratchpad, 생성 설정은 gitignore 대상이다.

## Task Commits

1. **Task 1: 갭 클로징 전 자동 게이트** — 커밋 없음(검증 전용 · 실패 0 · 수정 0)
2. **Task 2: push 전 UAT 환경 준비** — 커밋 없음(저장소 밖 · gitignore 대상만 변경)

**Plan metadata:** 이 SUMMARY · STATE · ROADMAP docs 커밋

## Files Created/Modified

- `.planning/phases/21-gh-trade-mobile-app/21-23-SUMMARY.md` — 게이트 표 · UAT 환경 표

## Decisions Made

- UAT 프록시 업스트림은 gcloud 조회값(`https://gh-radar-server-fnbhvevuva-du.a.run.app`)을 쓴다. 21-16 스크립트는 다른 형식의 주소를 하드코딩하고 있었다. 두 주소 모두 같은 Cloud Run 서비스를 가리키지만, 이번에는 조회값을 쓰도록 `UPSTREAM` 을 필수 환경변수로 바꿨다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `native:test:android` 는 첫 실행이 Gradle up-to-date(1초)라 실제 실행 여부가 불분명했다. 같은 필터에 `--rerun` 을 붙여 다시 돌렸고, 결과 XML 타임스탬프로 새 실행임을 확인했다.
- `native:build:android` (dev) 는 스모크가 같은 dev 설정으로 이미 만든 APK(13:46:57)를 up-to-date 로 재사용했다. APK assets 의 `server` 가 `http://localhost:3100` · cleartext true 임을 직접 확인했다.

## Known Stubs

없음.

## User Setup Required

없음.

## Next Phase Readiness

- **21-24 가 바로 UAT 를 받을 수 있다.** 세 기기 모두 저장값 없는 dev 빌드가 `/login` 다크 화면으로 떠 있다. 로그인은 사용자가 계정 UI 에서 한다(localhost 는 보안 출처라 네이티브 로그인 가능).
- 21-24 마무리 책임:
  - 생성 설정 운영 복원 — `native:sync` → `native:verify-prod` = PROD CONFIG OK
  - UAT 프록시 PID 36151 종료
  - `adb reverse --remove-all`
  - dev 서버 PID 97752 는 이 플랜이 띄운 것이 아니다(21-20 재기동)
- dev 에서 볼 수 없는 항목(DMA 실시간 · 운영 도메인 동작)은 21-24 의 「push 후 재확인」 선택지로 실서버에서 본다.
- 실기기에 옛 빌드(탭바 70)가 있으면 push 뒤 재설치해야 여백이 맞는다(21-24 체크포인트에서 고지).
- push 하지 않았다.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- `21-23-SUMMARY.md` 존재 · 태스크 커밋 0(검증 전용 — 측정값 `git rev-list --count ee800fb..HEAD` = 0, 코드 변경 없음이 정당한 0)
- 프록시 PID 36151 살아 있음 · :3100/:8080 응답 · :8090 LISTEN 0줄 · Android 패키지 1 · iOS 두 UDID get_app_container 성공
