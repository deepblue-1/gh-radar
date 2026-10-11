---
phase: 21-gh-trade-mobile-app
plan: 35
subsystem: mobile
tags: [capacitor, ios, android, gates, review, verify-prod, gap-closure, uat3]

requires:
  - phase: 21-gh-trade-mobile-app (21-25 ~ 21-34)
    provides: "UAT 3차 갭 12건(G-21-R3-1 ~ R3-11 · G-21-CR) 수정 커밋"
  - phase: quick-260926-rcc
    provides: "relay 돌파 ISIN 키 변경(e9e4c786 · 89f5680d) — relay:2fe94209 로 선배포 완료(사용자 결정)"
provides:
  - "UAT 3차 갭 클로징 뒤 전 자동 게이트 green 기록(운영 설정 기준 · 아래 게이트 표)"
  - "21-REVIEW-R2.md — 1차 리뷰 13건 처리 대조(수정 13 · 부분 0 · 미수정 0)"
  - "실서버 재확인 대상 표(21-36 push-then-recheck 경로가 쓴다)"
affects: [21-36 (push 결정 · push 후 실서버 확인)]

actuals:
  tokens: 9500     # chars/4 — 21-REVIEW-R2.md + 이 SUMMARY (코드 변경 없음)
  tasks: 3         # Task 1·2 실행 · Task 3 사용자 결정으로 생략
  commits: 1       # 측정값: git rev-list --count 2743a461..HEAD (SUMMARY 작성 시점) = e55cbeeb
plan_head_before: 2743a46191fd7b138f52543278073b1e8d8449b4

tech-stack:
  added: []
  patterns:
    - "백엔드 무변경 게이트는 「라운드 기준 이후 백엔드 커밋 0」 또는 「배포 이미지 SHA..HEAD 백엔드 diff 0」 둘 중 하나로 닫는다 — 후자는 선배포 사실을 기록한다"

key-files:
  created:
    - .planning/phases/21-gh-trade-mobile-app/21-REVIEW-R2.md
    - .planning/phases/21-gh-trade-mobile-app/21-35-SUMMARY.md
  modified: []

key-decisions:
  - "Task 1 ① 백엔드 무변경은 배포로 충족 — aba7954..HEAD 백엔드 커밋 2건(quick-260926-rcc e9e4c786 · 89f5680d)은 relay:2fe94209 선배포(2026-09-26 21:40 KST · 사용자 결정)에 들어 있고 git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/ 는 비어 있다"
  - "Task 3(dev UAT 환경)은 사용자 결정으로 생략 — push 후 실서버에서 확인(21-36 push-then-recheck 경로). UAT 프록시 · dev 빌드 · dev 설치를 하지 않았다"
  - "21-REVIEW-R2: 1차 13건 모두 「수정」 — WR-03 은 21-25 답 a. 구형 WebView 폴백(addJavascriptInterface) 잔여 위험은 iframe 부재를 근거로 수용"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "UAT 3차 갭 클로징(21-25 ~ 21-34) 뒤 전 자동 게이트 green — 백엔드 무변경(배포 충족) · build · typecheck · 단위 · 임시 worktree 프로덕션 빌드 · Playwright(알려진 3건 제외) · iOS 표·빌드·스모크 · Android JUnit·빌드·스모크 · verify-prod · 비밀 파일 0"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/ → 빈 출력(선배포 relay:2fe94209 가 라운드 백엔드 변경 전부 포함)"
        status: pass
      - kind: other
        ref: "shared build · relay typecheck · typecheck:tests · webapp typecheck · pnpm typecheck → exit 0 · error TS 0"
        status: pass
      - kind: unit
        ref: "relay test 28 files/630 passed · webapp test 122 files/2404 passed · 1 skipped"
        status: pass
      - kind: other
        ref: "임시 worktree(HEAD) webapp next build → Compiled successfully · static 18/18 · 실패 문자열 0 · worktree 제거"
        status: pass
      - kind: e2e
        ref: "playwright test --grep-invert \"격자 1/2/3단|P20-3 최악값|종목 추가 입력이 16px\" → 191 passed · 9 skipped · 0 failed (5.7m)"
        status: pass
      - kind: other
        ref: "TAB ROUTES OK 36 · EXTERNAL LINKS OK 32 · BUILD SUCCEEDED · SIM ENTITLEMENTS OK · SMOKE OK ready platform=ios (iPhone 17 UDID 지정)"
        status: pass
      - kind: unit
        ref: "cap sync android · native:test:android → TabRoutesTest 4/0 · ExternalLinksTest 1/0 (12:54:03Z 새 실행) · BUILD SUCCESSFUL · SMOKE OK ready platform=android"
        status: pass
      - kind: other
        ref: "native:verify-prod → PROD CONFIG OK · git ls-files 비밀 파일 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "G-21-CR — 21-REVIEW-R2.md 가 1차 13건의 처리 · 플랜 · 커밋 · 증거를 적고 21-REVIEW.md · 21-VERIFICATION.md · 21-UAT.md 는 무수정"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "Task 2 verify 루프 13 ID → REVIEW R2 OK · grep -c R2- = 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "push 후 실서버 재확인 대상 표(트레이딩 실동작 + dev 에서 보려던 UAT 항목 1~8)"
    requirement: MOBILE-01
    human_judgment: true
    rationale: "Task 3 dev UAT 환경은 사용자 결정으로 생략했다. 모든 사람 확인은 21-36 push 뒤 실서버 앱·웹에서 한다"

duration: 12min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 35: UAT 3차 갭 클로징 마감 게이트 · 리뷰 대조 Summary

**21-25 ~ 21-34 뒤 전 자동 게이트가 운영 설정 기준으로 green 이다.**
- 단위 테스트: relay 630 · webapp 2404 passed.
- 임시 worktree 프로덕션 빌드가 통과했다.
- Playwright: 191 passed, 알려진 3건만 제외했다.
- iOS: 경로표 36 · 링크표 32 · 빌드 · 스모크가 통과했다.
- Android: JUnit 5 · 빌드 · 스모크가 통과했다.
- PROD CONFIG OK 를 확인했다.

**백엔드 변경 2건(rcc)은 relay:2fe94209 선배포에 이미 들어 있다.** 1차 리뷰 13건은 21-REVIEW-R2.md 에서 모두 「수정」으로 대조했다. dev UAT 환경(Task 3)은 사용자 결정으로 만들지 않았다. 사람 확인은 21-36 push 뒤 실서버에서 한다.

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-26T12:44:49Z
- **Completed:** 2026-09-26T12:57:02Z
- **Tasks:** 3 (Task 1·2 실행 · Task 3 사용자 결정으로 생략)
- **Files modified:** 1 (21-REVIEW-R2.md 신규) + 이 SUMMARY

## 게이트 표 (Task 1 · 2026-09-26 21:44~21:55 KST 실측 · 운영 설정 기준)

| # | 게이트 | 결과 |
|---|---|---|
| ① | 백엔드 무변경 `git log --oneline aba7954..HEAD -- relay/ server/ supabase/ workers/ packages/shared/` | **2건.** `e9e4c786 fix(quick-260926-rcc): 돌파 원소 키를 ISIN 한 축으로 — relay 캐시·78 팬아웃·브라우저 upsert` · `89f5680d fix(quick-260926-rcc): 돌파 행 키를 ISIN 으로 …` → **relay 선배포 완료 relay:2fe94209 (사용자 결정 · 2026-09-26 21:40 KST · /healthz ok vpn·dma true · smoke-relay PASS 10/FAIL 0/SKIP 2 · 기록 커밋 2743a461).** 배포 이미지 이후 백엔드 변경은 `git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/` 로 확인했다. 출력이 **비어 있다** → 배포로 충족. push 때 백엔드 배포는 더 필요 없다 |
| ②-1 | `shared build` · `relay typecheck` · `relay typecheck:tests` · `webapp typecheck` · 루트 `pnpm typecheck` | exit 0 · `error TS` 0 |
| ②-2 | `relay test` · `webapp test` | relay **28 files / 630 passed** · webapp **122 files / 2404 passed · 1 skipped** · failed 0 |
| ②-3 | 임시 worktree(detach HEAD `2743a461`) · `pnpm install --frozen-lockfile` · webapp `next build` | **✓ Compiled successfully (11.8s) · static pages 18/18** · 「Failed to compile」·「Error occurred prerendering」·「Build error」 0 · worktree 제거 확인(`git worktree list` 에 남지 않음) |
| ②-4 | Playwright 전체 `--grep-invert "격자 1/2/3단\|P20-3 최악값\|종목 추가 입력이 16px"` | **191 passed · 9 skipped · 0 failed** (5.7m). 제외는 deferred-items.md 의 3건뿐이다. dev 서버는 기존 프로세스(아래)를 `reuseExistingServer` 로 썼다 |
| ②-5 | `native:check-tab-routes:ios` · `native:check-external-links:ios` | **TAB ROUTES OK 36** · **EXTERNAL LINKS OK 32** |
| ②-6 | `native:build:ios` (운영 sync) | **\*\* BUILD SUCCEEDED \*\*** · `SIM ENTITLEMENTS OK application-identifier=954QPCS3F5.com.ghtrade.app` |
| ②-7 | `native:smoke:ios` | **SMOKE OK ready platform=ios.** 부팅 기기가 둘(iPhone 17 · iPad Pro 11 M5)이었지만 `── 시뮬레이터: iPhone 17 (3B11B38C-DDE2-40F7-AA65-2163A581A6B9)` 에만 설치했다(IN-08 수정 동작). 끝에 운영 URL 로 다시 sync 했다 |
| ②-8 | `cap sync android` · `native:test:android` (`ANDROID_SERIAL=emulator-5554`) | BUILD SUCCESSFUL. 결과 XML 타임스탬프 **12:54:03Z** 는 새 실행이다(캐시 아님): **TabRoutesTest 4 / 0 failures · ExternalLinksTest 1 / 0 failures** |
| ②-9 | `native:build:android` · `native:smoke:android` | **BUILD SUCCESSFUL** · **SMOKE OK ready platform=android** · `FAILED`/`SMOKE FAIL` 0 |
| ②-10 | `native:verify-prod` · 비밀 파일 `git ls-files -- 'mobile/*.jks' '*.keystore' '*.p12' '*.mobileprovision'` | **PROD CONFIG OK — https://trade.jx1.io · cleartext 없음 · appId com.ghtrade.app (ios · android)** · 비밀 파일 0건 |
| + | 추적 파일 | `git status -sb` 에 Task 1 이 만든 변경은 없다. 다른 세션의 `.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock` 과 오케스트레이터의 `STATE.md` 만 있다 |

- **dev 서버 :3100 기동 주체 = 기존 프로세스.** next-server PID **97752** 는 13:20:38 에 시작했고 cwd 는 `/Users/alex/repos/gh-radar/webapp` 이다. 이 플랜이 띄우지 않았다. `curl /login` → 200. 끄지 않았다.
- Playwright relay e2e 는 spec 픽스처가 relay 를 잠깐 띄운다. 끝난 뒤 `lsof -iTCP:8090 -sTCP:LISTEN` 은 0줄이다.
- `native:smoke:android` 가 남긴 `adb reverse tcp:3100` 은 `adb -s emulator-5554 reverse --remove-all` 로 지웠다(dev UAT 를 하지 않으므로 정리). :8080 LISTEN 도 0줄이다.

## REVIEW-R2 요약 (Task 2)

`21-REVIEW-R2.md` 를 새로 만들었다. `21-REVIEW.md` · `21-VERIFICATION.md` · `21-UAT.md` 는 수정하지 않았다(`git diff --quiet`).

| 처리 | 건수 | ID |
|---|---|---|
| 수정 | 13 | WR-01 (21-27 `05671f9`) · WR-02 (21-29 `3d6e435`) · WR-03 (21-28 `d237822` iOS + 21-29 `3d6e435` Android · 답 a) · WR-04 (21-27 `09de489`/`abd2146`) · WR-05 (21-27 `f3215e2`/`9b763d7`) · IN-01 (21-29 `d430aec`) · IN-02 (21-28 `d237822` + 21-29 `446cd80`) · IN-03 (21-29 `446cd80` · 재현 뒤 수정) · IN-04 (21-34 `86563a6b`) · IN-05 (21-28 `3f00e92`) · IN-06 (21-27 `09de489`/`abd2146`) · IN-07 (21-27 `f3215e2`/`9b763d7`) · IN-08 (21-28 `3f00e92`) |
| 부분 수정 | 0 | — |
| 수정 안 함 | 0 | — |

- 행마다 증거 명령을 HEAD `2743a461` 에서 다시 돌렸다.
- 근거 단락은 두 개다.
  - **WR-03:** 구형 WebView 폴백 경로(`addJavascriptInterface`)에서는 프레임 검사가 없다. 이 잔여 위험은 iframe 이 없다는 근거로 수용했다.
  - **WR-04 · IN-03:** 실기 체감 확인은 실서버 재확인 대상이다.
- 머리 규칙: 라운드 2 코드 리뷰 결과는 이 파일의 「라운드 2 발견」 절에 합치고 ID 에 `R2-` 접두를 붙인다.

## UAT 환경 (Task 3) — 사용자 결정으로 생략

**사용자 결정으로 생략 — push 후 실서버 확인(21-36 push-then-recheck 경로).**
- 오케스트레이터가 실행 중에 사용자 결정을 전달했다.
- UAT 프록시(:8080), dev 빌드(`CAP_SERVER_URL=http://localhost:3100`), 세 기기 dev 새 설치를 **하지 않았다**. 되돌릴 것도 없었다.

| 항목 | 상태 |
|---|---|
| UAT 프록시 127.0.0.1:8080 | **띄우지 않음** — LISTEN 0줄 · 프록시 PID 없음 |
| dev 빌드 · dev 설치 | **하지 않음** — 생성 설정은 운영값(`native:verify-prod` → PROD CONFIG OK) |
| 기기 설치본 | 게이트 스모크가 남긴 설치본이다. iPhone 17 `3B11B38C-DDE2-40F7-AA65-2163A581A6B9` 과 Android `emulator-5554` 의 스모크 설치본은 dev URL 로 설치됐다(스모크 스크립트 규약). **21-36 은 push 뒤 운영 빌드를 재설치해야 한다.** iPad Pro 11-inch (M5) `52DD0C30-86BB-4374-89E8-748F6DE00998` 는 이 플랜에서 설치하지 않았다(부팅 상태 유지) |
| adb reverse | 없음(`--remove-all` 완료) |
| dev 서버 :3100 | 기존 프로세스 PID 97752(이 플랜이 띄우지 않음 · 끄지 않음) |
| relay :8090 | **띄우지 않음** — `lsof -iTCP:8090 -sTCP:LISTEN` 0줄 |

## 실서버 재확인 대상 (21-36 push 뒤 실서버 앱·웹에서 확인)

relay(실계좌)가 필요한 항목과, dev UAT 에서 보려던 21-36 UAT 항목 1~8 을 모두 실서버에서 확인한다.

**A. relay 필요 — 트레이딩 실동작 (실주문 금지)**

| # | 대상 | 확인 내용 |
|---|---|---|
| A1 | G-21-R3-2 (D-25a) | 앱 /trading 하단 공용 패널 숨김 · 카드 더티 바가 탭바를 비키는지 · /me 「현황 \| 로그」 전략 로그 실데이터 |
| A2 | G-21-R3-3 | 카드 주문금액(만원) 키패드 칩 「천만 · 오천만 · 1억 · 지우기」 — 현재 값에 더하기(예: 100 → 천만 → 1100) · 발주 없이 값만 |
| A3 | G-21-R3-5 | 제목 없는 가격 섹션 그룹(매수가격·주문금액 / 매도 가격) 위 여백이 아래와 대칭 |
| A4 | G-21-R3-6 | 카드 헤더 ✕ = 32 상자 · 16 아이콘 · 히트 44 · 접근 이름 「{종목명} 카드 닫기」 |
| A5 | G-21-R3-7 | 카드 ⓘ 종목정보 팝업 크기 고정 · ✕ · 앱 safe-area 패딩 |
| A6 | G-21-R3-8 팝업 쪽 | 카드 ⓘ 종목정보 팝업 → 뉴스·토론 전체목록(`newsView`) |
| A7 | G-21-R3-9 | 종목상세 「트레이딩」 → `/trading?code=` 카드 착지(보장·펼침·포커스) |
| A8 | G-21-R3-10 | 카드 수동주문 주문유형 「시간외종가」 — **실주문 금지**. 선택 · 잠김 · 확인 다이얼로그까지만 보고 「참고 종가」 값(KRX 종가)도 확인한다 |
| A9 | G-21-R3-11 | 트레이딩 탭 왕복 — 스크롤 복원 · 스켈레톤 없음 |
| A10 | WR-04 | 상따 설정 팝오버를 연 상태에서 Android 뒤로가기 → 팝오버만 닫힌다 |

**B. dev UAT 에서 보려던 21-36 UAT 항목 1~8 → 실서버에서 확인**

| # | 항목 | 확인 내용 |
|---|---|---|
| B1 | 키보드 (G-21-R3-1 · D-12a) | /search 입력 포커스 → 탭바가 키보드 위에 걸린 순간 없이 사라지고, 입력칸 이동 시 깜빡임이 없다. 키보드를 내리면 곧 다시 나타난다. iPad 하드웨어 키보드면 탭바가 유지된다 |
| B2 | 첫 로그인 (G-21-R3-4 · D-12b) | 새 설치 앱(저장값 없음) → 로그인 → 홈: 탭바가 로그인 잔상·빈 화면 위에 먼저 뜨지 않는다. 콜드 스타트도 같다. 기본 다크 |
| B3 | 탭 왕복 (G-21-R3-11 · D-32 축소) | 홈 스크롤 → 검색 → AI → 마이 → 홈: 스크롤 위치가 돌아오고 스켈레톤이 없다. 같은 탭을 다시 탭하면 맨 위로 간다 |
| B4 | 뉴스·토론 전체 (G-21-R3-8 · D-29) | 전체 보기 → 탭 안 전체목록 → 화면 안 ← · Android 뒤로가기 · 브라우저 뒤로 · 탭 재클릭 → 요약 + 원래 스크롤. 옛 `/stocks/005930/news` → 탭 안 전체목록 |
| B5 | 트레이딩 버튼 · 3탭 (G-21-R3-9 · R3-10) | 폰 하단 「트레이딩」 · 넓은 폭 히어로 알약(스케치 008 ② A) · 매매 불가 종목(ETF 등)에는 버튼이 없다 · 종목상세 3탭 · `?tab=orderbook` → 트레이딩/차트 |
| B6 | /me 전략 로그 (G-21-R3-2 · D-25a) | 배치 = 스케치 008 ① B 「현황 \| 로그」 + 실데이터(A1 과 함께) |
| B7 | 리뷰 사람 확인 (G-21-CR) | Android 팝오버 뒤로가기(WR-04) · /search 빠른 타이핑 때 엉뚱한 「없습니다」 번쩍임 없음(WR-05) · iPhone Safari 기본 다크 크롬 색 `#17171c`(IN-06) · 비행기 모드 → 오프라인 폴백 → 복구 시 **운영 `https://trade.jx1.io`** 로 복귀(IN-02 — 실서버라 dev 복귀가 아니라 운영 복귀가 기대값) · 폴백에서 뒤로가기 1회에 종료(IN-03) |
| B8 | 회귀 한 바퀴 | 탭바 모양·활성 · 당겨서 새로고침 · 시트를 열면 탭바 숨김 · 인앱 브라우저 · 로그아웃 → 로그인 · 테마 전환 |

## Accomplishments

- 갭 12건을 닫은 뒤 전 자동 게이트를 운영 설정 기준으로 다시 돌려 모두 green 을 확인했다. 21-23 대비 relay 630(+2) · webapp 2404(+138) · Playwright 191(+7) 이다.
- 라운드의 백엔드 변경은 선배포 relay 이미지에 모두 들어 있다(`2fe94209..HEAD` 백엔드 diff 0). push 가 새 백엔드 결합을 만들지 않는다.
- 1차 리뷰 13건을 새 파일에 행별 증거와 함께 대조했다. 1차 기록은 그대로다.

## Task Commits

1. **Task 1: 전 자동 게이트 + 임시 worktree 프로덕션 빌드 + 백엔드 무변경 확인** — 커밋 없음(검증 전용 · 실패 0 · 수정 0)
2. **Task 2: 21-REVIEW-R2.md 1차 13건 처리 대조 표** — `e55cbeeb` (docs)
3. **Task 3: push 전 UAT 환경** — 사용자 결정으로 생략. 커밋 없음

**Plan metadata:** 이 SUMMARY 커밋 · STATE/ROADMAP 커밋(docs)

## Files Created/Modified

- `.planning/phases/21-gh-trade-mobile-app/21-REVIEW-R2.md` — 1차 13건 처리 대조 · 근거 단락 · R2- 규칙
- `.planning/phases/21-gh-trade-mobile-app/21-35-SUMMARY.md` — 게이트 표 · REVIEW-R2 요약 · 실서버 재확인 대상

## Decisions Made

- Task 1 ① 은 「배포로 충족」으로 닫았다. 근거는 오케스트레이터가 전달한 사용자 결정(relay 선배포)과, 실측한 `2fe94209..HEAD` 백엔드 diff 0 이다.
- Task 3 은 사용자 결정으로 생략했다. dev 에서 보려던 항목은 모두 실서버 재확인 표 B 로 옮겼다.

## Deviations from Plan

**1. [사용자 결정] Task 1 ① 백엔드 무변경 — 커밋 2건 존재, 배포로 충족**
- **Found during:** Task 1 ①(이전 실행에서 멈춘 지점)
- **Issue:** `aba7954..HEAD` 에 quick-260926-rcc 백엔드 커밋 2건이 있다. 플랜 문자 그대로면 멈춰야 한다.
- **Resolution:** 사용자가 relay 선배포를 결정했고, relay:2fe94209 로 배포를 마쳤다. 이번 실행에서 `git diff --stat 2fe94209 HEAD -- <백엔드 경로>` 를 확인했고 출력이 비어 있다. 새 상황이 아니므로 진행했다.
- **Files modified:** 없음

**2. [사용자 결정] Task 3 생략**
- **Found during:** Task 1 실행 중(오케스트레이터 메시지)
- **Issue:** 사용자가 dev UAT 환경 대신 push 후 실서버 확인을 택했다.
- **Resolution:** 프록시 · dev 빌드 · dev 설치를 하지 않았다. 스모크가 남긴 `adb reverse` 를 정리했다. 실서버 재확인 표에 UAT 항목 1~8 을 합쳤다. Task 3 verify(UAT ENDPOINTS OK · verify-prod FAIL>0)는 의도적으로 실행하지 않았다. 생성 설정은 운영값이다.
- **Files modified:** 없음

**Total deviations:** 2 (둘 다 사용자 결정 · 코드 수정 0). **Impact:** 자동 게이트 범위는 줄지 않았다. 사람 확인은 모두 21-36 push 뒤로 옮겨졌다.

## Issues Encountered

- 없음. 게이트 실패 0.

## Known Stubs

없음(문서 전용 플랜).

## User Setup Required

없음.

## Next Phase Readiness

- **21-36 이 진행할 수 있다(push 결정).** 자동 게이트는 green, 백엔드 선배포는 완료(relay:2fe94209), 생성 설정은 운영값이다.
- **21-36 주의 — 백엔드 재확인 게이트.** 21-36 Task 2 ③(T-21-99)은 `aba7954..HEAD` 백엔드 경로를 다시 확인하고, 있으면 push 하지 않는다. 문자 그대로 돌리면 rcc 2건에 걸린다. 판정은 `git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/` 가 비어 있는지로 해야 한다(비어 있지 않으면 새 백엔드 변경이므로 사용자에게 묻는다).
- **21-36 체크포인트는 dev UAT 없이 push-then-recheck 경로를 탄다.** push 뒤 운영 빌드를 세 기기에 재설치한다. iPhone 17 과 emulator-5554 에는 스모크 dev 설치본이 남아 있다. 그다음 위 「실서버 재확인 대상」 A1~A10 · B1~B8 을 본다. B2 첫 로그인은 저장값 없는 새 설치가 조건이다(uninstall → install).
- dev 서버 PID 97752 는 이 플랜이 띄우지 않았다. 종료 판단은 21-36 또는 사용자가 한다.
- push 하지 않았다.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: `.planning/phases/21-gh-trade-mobile-app/21-REVIEW-R2.md` (verify 루프 13 ID → REVIEW R2 OK)
- FOUND: 커밋 `e55cbeeb` · 측정 `git rev-list --count 2743a461..HEAD` = 1
- :8090 · :8080 LISTEN 0줄 · `native:verify-prod` PROD CONFIG OK · `adb reverse` 없음
