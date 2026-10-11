---
phase: "21"
slug: "gh-trade-mobile-app"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-25"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (웹 단위)** | Vitest ^2.1.9 + jsdom + @testing-library/react — `src/**/*.test.{ts,tsx}` · setup `webapp/tests/setup.ts` |
| **Framework (웹 e2e)** | Playwright ^1.59.1 — baseURL `http://localhost:3100` · setup 프로젝트 storageState 로그인 · 앱 모드는 `e2e/fixtures/native-app.ts` `installNativeApp`(21-05) |
| **Framework (iOS)** | `xcodebuild`(컴파일) · `xcrun swiftc`(`TabRoutes` 표 검사) · `xcrun simctl` + 통합 로그(`ready` 스모크) |
| **Framework (Android)** | Gradle `assembleDebug` · JUnit4 `testDebugUnitTest`(`TabRoutesTest` — `native:test:android`) · `adb` + logcat(`ready` 스모크) |
| **Config file** | `webapp/vitest.config.ts` · `webapp/playwright.config.ts` · `mobile/package.json` scripts(`native:*`) — 새 프레임워크 설치 없음 |
| **Quick run command** | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native` |
| **Full suite command** | `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp run typecheck` |
| **Estimated runtime** | 웹 단위 태스크별 ~20–40초 · webapp 전체 ~2분 · Playwright 전체 ~6–8분 · iOS 빌드 2–10분(첫 SPM 해석) · Android 빌드 1–5분 |

---

## Sampling Rate

- **After every task commit:** 웹 태스크 = 그 태스크의 `vitest --run <파일>` + (e2e 태스크면 그 spec) · 네이티브 태스크 = `native:build:ios` 또는 `native:build:android`(경로표 태스크는 `native:check-tab-routes:ios` / `TabRoutesTest`)
- **After every plan wave:** webapp 전체 단위 + typecheck · 네이티브 wave 는 양 플랫폼 빌드 + 해당 플랫폼 스모크(`native:smoke:*`)
- **Before `/gsd-verify-work`:** 21-16 Task 1 의 일곱 게이트 전부 green + Manual-Only UAT 승인
- **Max feedback latency:** 웹 40초 · 네이티브는 빌드 시간이 지배(태스크 단위가 아니라 wave 단위로 묶어 돌린다 — RESEARCH Validation Architecture)

---

## Per-Task Verification Map

테스트 ID `MOBILE-01a~o` 는 RESEARCH §Validation Architecture 정의, `p~r` 은 플래너 추가(p = D-14 탭 경로표 · q = 네이티브 `ready` 스모크 · r = 운영 설정 검사).

| Task ID | Plan | Wave | Requirement | Test ID | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | MOBILE-01 | — (D-20 게이트) | — | one-way 번들 ID 를 사람 확인 뒤에만 굽는다 | checkpoint:decision | — | — | ⬜ pending |
| 21-01-02 | 01 | 1 | MOBILE-01 | — (정당성) | T-21-SC | [SUS] 패키지 설치 전 blocking-human 확인 | checkpoint:human-verify | — | — | ⬜ pending |
| 21-01-03 | 01 | 1 | MOBILE-01 | 01a · 01n · 01q | T-21-01 · 02 · 04 · 05 · 14 · 22 · 23 | 메시지 화이트리스트·호스트 검사 · 금지 설정 키 0 · dev sync 복원 | unit + build + smoke | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/native-detect.test.ts` · `pnpm --filter @gh-radar/mobile run native:build:ios` · `pnpm --filter @gh-radar/mobile run native:smoke:ios` | ❌ 태스크가 생성 | ⬜ pending |
| 21-02-01 | 02 | 2 | MOBILE-01 | 01o | T-21-03 · 14 | JS 인터페이스 1메서드 · UI 스레드 호스트 검사 · 서명 비밀 0 | build | `pnpm --filter @gh-radar/mobile run native:build:android` | ❌ 태스크가 생성 | ⬜ pending |
| 21-02-02 | 02 | 2 | MOBILE-01 | 01q | T-21-01 | 스모크 후 운영 URL 복원 | smoke | `pnpm --filter @gh-radar/mobile run native:smoke:android` | ❌ 태스크가 생성 | ⬜ pending |
| 21-03-01 | 03 | 2 | MOBILE-01 | — | T-21-14 | 키스토어를 저장소에 두지 않음 | cli | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` | ✅ | ⬜ pending |
| 21-03-02 | 03 | 2 | MOBILE-01 | — | T-21-08 · 09 | Authorized Client IDs = 우리 3개 · Skip nonce off | checkpoint:human-action | — | — | ⬜ pending |
| 21-03-03 | 03 | 2 | MOBILE-01 | 01f(선행) | T-21-08 | 공개 ID 형식·역순 scheme 고정 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/google-client-ids.test.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 21-04-01 | 04 | 2 | MOBILE-01 | 01b · 01c · 01e | T-21-16 · 02 | navigate 경로 검증 · 페이로드는 신호뿐 · 브라우저 송신 0 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/post-native.test.ts src/lib/native/__tests__/native-bridge-provider.test.tsx` | ❌ 태스크가 생성 | ⬜ pending |
| 21-04-02 | 04 | 2 | MOBILE-01 | 01d | T-21-17 · 18 | 오버레이 0↔1 전이만 · back 은 최상위 레이어만 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/native-overlay.test.tsx` · `pnpm --filter @gh-radar/webapp run test` | ❌ 태스크가 생성 | ⬜ pending |
| 21-05-01 | 05 | 3 | MOBILE-01 | 01k | — | 브라우저 셸 계약 유지 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/layout/__tests__/app-shell-chrome.test.tsx src/components/chat/__tests__/chat-fab.test.tsx src/components/stock/__tests__/stock-hero.test.tsx` | ✅ | ⬜ pending |
| 21-05-02 | 05 | 3 | MOBILE-01 | 01j | T-21-29 | 앱 분기는 표시만(권한 경로 없음) | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/native-shell.spec.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 21-06-01 | 06 | 4 | MOBILE-01 | 01k | T-21-31 | 셸 좌우 safe-area | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/layout/__tests__/app-shell-chrome.test.tsx` | ✅ | ⬜ pending |
| 21-06-02 | 06 | 4 | MOBILE-01 | 01j | T-21-30 | 앱에서 하단 고정 바가 탭바 위 | unit + grep | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/stock/__tests__/stock-detail-tabs.test.tsx src/components/trading/__tests__/shared-panels.test.tsx src/components/trading/__tests__/alert-toasts.test.tsx` | ✅ | ⬜ pending |
| 21-06-03 | 06 | 4 | MOBILE-01 | 01j · 01k | T-21-30 | CTA bottom 92px(앱) · 본문 108px | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/native-shell.spec.ts` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/home.spec.ts -g "셸 불변식"` | ✅(spec 은 21-05 생성) | ⬜ pending |
| 21-07-01 | 07 | 3 | MOBILE-01 | 01m | T-21-13 | 재탐침은 제스처 한정 · 살아 있는 소켓 유지 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts -t probeNow` | ✅ 파일 · 케이스 신규 | ⬜ pending |
| 21-07-02 | 07 | 3 | MOBILE-01 | 01c(배선) | — | — | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/home src/components/theme src/components/watchlist src/components/trading/__tests__/trading-workbench.test.tsx src/components/trading/__tests__/me-client.test.tsx` | ✅ | ⬜ pending |
| 21-07-03 | 07 | 3 | MOBILE-01 | 01l | T-21-12 | 당김이 POST refresh(외부 수집)를 부르지 않음 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/stock/__tests__/stock-native-refresh.test.tsx` | ❌ 태스크가 생성 | ⬜ pending |
| 21-08-01 | 08 | 4 | MOBILE-01 | 01g | T-21-19 · 32 | 저장값 타입 필터 · 실패 무해 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/recent-search.test.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 21-08-02 | 08 | 4 | MOBILE-01 | 01g | T-21-33 | 폴링 없음 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/search src/components/layout/__tests__/app-sidebar.test.tsx` | ❌ 태스크가 생성 | ⬜ pending |
| 21-08-03 | 08 | 4 | MOBILE-01 | 01g | — | — | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/search-page.spec.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 21-09-01 | 09 | 5 | MOBILE-01 | 01i | T-21-21 | 저장 키 접두 불변 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/layout/__tests__/app-shell-chrome.test.tsx` | ✅ 파일 · 케이스 신규 | ⬜ pending |
| 21-09-02 | 09 | 5 | MOBILE-01 | 01h | T-21-35 | 로그아웃은 기존 signOut 경로 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/me/__tests__/account-card.test.tsx` | ❌ 태스크가 생성 | ⬜ pending |
| 21-09-03 | 09 | 5 | MOBILE-01 | 01h · 01i | T-21-21 | e2e 는 로그아웃을 누르지 않는다(세션 보존) | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/brand-account.spec.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 21-10-01 | 10 | 3 | MOBILE-01 | 01p | — | — | script | `pnpm --filter @gh-radar/mobile run native:check-tab-routes:ios` | ❌ 태스크가 생성 | ⬜ pending |
| 21-10-02 | 10 | 3 | MOBILE-01 | 01n | — | — | build | `pnpm --filter @gh-radar/mobile run native:build:ios` | ✅(21-01) | ⬜ pending |
| 21-10-03 | 10 | 3 | MOBILE-01 | 01n · 01q | T-21-36 | evaluateJavaScript 는 상수 경로만 | build + smoke | `pnpm --filter @gh-radar/mobile run native:build:ios` · `pnpm --filter @gh-radar/mobile run native:smoke:ios` | ✅(21-01) | ⬜ pending |
| 21-11-01 | 11 | 4 | MOBILE-01 | 01n · 01q | T-21-02 | theme 두 값만 수용 | build + smoke | `pnpm --filter @gh-radar/mobile run native:build:ios` · `pnpm --filter @gh-radar/mobile run native:smoke:ios` | ✅ | ⬜ pending |
| 21-11-02 | 11 | 4 | MOBILE-01 | 01n | T-21-06 · 37 · 38 | 폴백 복귀 출처 허용 목록 · 정책 결정은 원본 · 네트워크 오류만 | build + plist | `plutil -lint mobile/ios/App/App/Info.plist && pnpm --filter @gh-radar/mobile run native:build:ios` | ✅ | ⬜ pending |
| 21-12-01 | 12 | 4 | MOBILE-01 | 01p | — | — | JUnit | `pnpm --filter @gh-radar/mobile exec cap sync android && pnpm --filter @gh-radar/mobile run native:test:android` | ❌ 태스크가 생성 | ⬜ pending |
| 21-12-02 | 12 | 4 | MOBILE-01 | 01o | — | — | build | `pnpm --filter @gh-radar/mobile run native:build:android` | ✅(21-02) | ⬜ pending |
| 21-12-03 | 12 | 4 | MOBILE-01 | 01o · 01q | T-21-36 · 39 | 인셋 리스너는 탭바에만 · 상수 경로 | build + smoke | `pnpm --filter @gh-radar/mobile run native:build:android` · `pnpm --filter @gh-radar/mobile run native:smoke:android` | ✅ | ⬜ pending |
| 21-13-01 | 13 | 5 | MOBILE-01 | 01o | T-21-40 · 13 | Android 16 뒤로가기 · 1초 스피너 | build | `pnpm --filter @gh-radar/mobile run native:build:android` | ✅ | ⬜ pending |
| 21-13-02 | 13 | 5 | MOBILE-01 | 01o · 01p · 01q | T-21-06 · 38 | 네트워크 오류만 폴백 · URL 인코딩 | build + JUnit + smoke | `pnpm --filter @gh-radar/mobile run native:build:android` · `pnpm --filter @gh-radar/mobile run native:smoke:android` | ✅ | ⬜ pending |
| 21-14-01 | 14 | 3 | MOBILE-01 | — (D-22) | T-21-41 | 렌더는 인라인 자원만 | script | `node mobile/scripts/render-resources.mjs` · `sips -g pixelWidth -g pixelHeight mobile/resources/*.png` | ❌ 태스크가 생성 | ⬜ pending |
| 21-14-02 | 14 | 3 | MOBILE-01 | 01n · 01o | T-21-SC | assets 는 npx 고정 버전 · devDep 미추가 | build | `pnpm --filter @gh-radar/mobile run native:build:ios` · `pnpm --filter @gh-radar/mobile run native:build:android` | ✅ | ⬜ pending |
| 21-15-01 | 15 | 6 | MOBILE-01 | 01f | T-21-07 · 10 · 42 | raw↔SHA-256 nonce · forcePrompt · 토큰 무로그 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/native-google-login.test.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 21-15-02 | 15 | 6 | MOBILE-01 | 01f | T-21-11 | safeNext 오픈 리다이렉트 가드 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/login/__tests__/page.test.tsx src/lib/native` | ❌ 태스크가 생성 | ⬜ pending |
| 21-15-03 | 15 | 6 | MOBILE-01 | 01n · 01o | T-21-SC · 15 | 플러그인 정확 버전 · provider google 만 | build | `pnpm --filter @gh-radar/mobile run native:build:ios` · `pnpm --filter @gh-radar/mobile run native:build:android` | ✅ | ⬜ pending |
| 21-16-01 | 16 | 7 | MOBILE-01 | 01a~01r 전부 · 01r | T-21-01 · 14 · 28 | 운영 설정 증명 · 비밀 파일 미추적 · push 금지 | full gates | build_command · test_command · `pnpm typecheck` · `pnpm --filter @gh-radar/webapp exec playwright test` · 양 플랫폼 빌드·경로표·스모크 · `pnpm --filter @gh-radar/mobile run native:verify-prod` | ❌ verify 스크립트는 태스크가 생성 | ⬜ pending |
| 21-16-02 | 16 | 7 | MOBILE-01 | Manual-only 전부 | T-21-28 | 사람 확인 뒤에만 웹 배포 | checkpoint:human-verify | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

별도 Wave 0 플랜은 두지 않는다 — 새 테스트 파일은 각 태스크가 구현보다 먼저 만든다(`tdd="true"` 태스크의 RED 단계). 프레임워크 설치 없음(Vitest·Playwright·xcodebuild·Gradle/JUnit 기존).

- [ ] `webapp/src/lib/native/__tests__/native-detect.test.ts` — MOBILE-01a (21-01-03)
- [ ] `webapp/src/lib/native/__tests__/post-native.test.ts` · `native-bridge-provider.test.tsx` — MOBILE-01b·c·e (21-04-01)
- [ ] `webapp/src/lib/native/__tests__/native-overlay.test.tsx` — MOBILE-01d (21-04-02)
- [ ] `webapp/src/lib/native/__tests__/google-client-ids.test.ts` — 21-03-03
- [ ] `webapp/src/lib/native/__tests__/native-google-login.test.ts` · `webapp/src/app/login/__tests__/page.test.tsx` — MOBILE-01f (21-15)
- [ ] `webapp/src/lib/__tests__/relay-socket.test.ts` probeNow 케이스 P1~P3 — MOBILE-01m (21-07-01)
- [ ] `webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx` — MOBILE-01l (21-07-03)
- [ ] `webapp/src/lib/__tests__/recent-search.test.ts` · `webapp/src/components/search/__tests__/search-page-client.test.tsx` — MOBILE-01g (21-08)
- [ ] `webapp/src/components/me/__tests__/account-card.test.tsx` — MOBILE-01h (21-09-02)
- [ ] `webapp/e2e/fixtures/native-app.ts` + `webapp/e2e/specs/native-shell.spec.ts` — MOBILE-01j (21-05-02 · 21-06-03)
- [ ] `webapp/e2e/specs/search-page.spec.ts` (21-08-03) · `webapp/e2e/specs/brand-account.spec.ts` (21-09-03)
- [ ] `mobile/scripts/tab-routes-check.swift` + `check-tab-routes-ios.sh` (21-10-01) · `mobile/android/app/src/test/java/com/ghtrade/app/TabRoutesTest.kt` (21-12-01) — MOBILE-01p
- [ ] `mobile/scripts/smoke-ios.sh` (21-01-03) · `smoke-android.sh` (21-02-02) — MOBILE-01q
- [ ] `mobile/scripts/verify-prod-config.mjs` (21-16-01) — MOBILE-01r

---

## Manual-Only Verifications

자동화 불가 사유: 네이티브 UI 렌더·실제 OS 제스처·키보드·네트워크·회전·Google 계정 UI 는 시뮬레이터/에뮬레이터/실기에서 사람이 봐야 한다. 절차의 정본은 21-16 Task 2 `<how-to-verify>` 1~14.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 탭바 시각 — D-27a 수치 · 다크/라이트 · iPad 560 가운데 · 페이드 · Android 불투명 근사(A10) | MOBILE-01 (D-02 · D-15 · D-27a) | 네이티브 뷰 렌더 | iPhone 17 · iPad Pro 11 시뮬 · Android 에뮬 스크린샷을 스케치 004 와 비교 |
| 활성 탭 · 종목상세 5탭 비활성 · 로그인 화면 숨김 · 오버레이 150ms 페이드 · 키보드 숨김 | MOBILE-01 (D-12 · D-13 · D-14) | 네이티브 상태 전이 | 화면 이동·시트 열기·입력 포커스 시나리오 |
| 탭 이동이 클라 내비(relay 재연결 없음) · 재탭 최상단 | MOBILE-01 (D-06 · D-06a) | WebView 내비 관찰 | 트레이딩 탭 왕복 중 상태줄 확인 |
| 당겨서 새로고침 — 훅 호출 · 1초 스피너 · 시트 중 비활성 · 호가 사다리 안 무반응 · 종목상세 POST refresh 없음 | MOBILE-01 (D-04 · D-16 · D-17 · D-18) | 실제 제스처 | 수동 당김 + dev 서버 로그 확인 |
| 네이티브 Google 로그인 — 첫·재·로그아웃 후 재로그인 · 취소 문구 | MOBILE-01 (D-03) | Google 계정 선택 UI | iOS 시뮬 · Android 에뮬(Google 계정) · push 뒤 실기 1대 |
| 오프라인 폴백 — 비행기 모드 · 자동 복귀 · 탭 연타(-999) · 404 에 폴백 없음 | MOBILE-01 (D-19) | 네트워크 조작 | Network Link Conditioner · 에뮬 비행기 모드 |
| 테마 — 상태바·배경·탭바 즉시 전환 · 재실행 첫 프레임 · OS 다크모드 무시 | MOBILE-01 (D-23) | 시스템 UI | `/me` 계정 카드 토글 · 앱 재실행 |
| 회전 — 폰 세로 고정 · iPad 4방향 · Android 태블릿 | MOBILE-01 (D-24) | 기기 회전 | iPad 시뮬 회전 · (선택) sw600 AVD |
| Android 뒤로가기 — 시트 → 이전 → 홈 → 종료 · 제스처/3버튼 탭바 여백 | MOBILE-01 (D-26 · D-27a) | 시스템 제스처 | API 36.1 에뮬 두 내비 모드 |
| 하단 고정 바가 탭바 위 · 헤더 상태바 뒤 풀블리드 | MOBILE-01 (D-09 · D-10 · D-25) | 네이티브 오버레이 겹침 | 종목상세 CTA · /trading 폰 하단 패널 · 더티 바 누르기 |
| 아이콘·스플래시 — 홈 화면 · 29px 설정 아이콘 · 라이트/다크 스플래시 | MOBILE-01 (D-22) | 런처·시스템 스플래시 | 설치 후 홈 화면 · OS 다크모드 전환 후 실행 |
| 웹 회귀 — 브랜드·파비콘·`/search`·계정 카드 · iPhone Safari 가로 노치 · `gh-radar:` 설정 유지 | MOBILE-01 (D-07a · D-08a · D-21 · D-25) | 실브라우저·실기 Safari | 데스크톱 브라우저 + iPhone Safari |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (체크포인트 5개 제외 — 21-01-01 · 21-01-02 · 21-03-02 · 21-16-02 는 사람 게이트, 21-03-01 은 keytool)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (체크포인트 사이에 자동 태스크가 끼어 있다)
- [x] Wave 0 covers all MISSING references (각 태스크가 RED 먼저 생성)
- [x] No watch-mode flags (`vitest --run` · `playwright test`)
- [ ] Feedback latency — 웹은 40초 이내, 네이티브는 빌드 시간(wave 단위 샘플링으로 수용)
- [ ] `nyquist_compliant: true` set in frontmatter (validate-phase 가 설정)

**Approval:** pending (21-16 UAT 승인 후)
