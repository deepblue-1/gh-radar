---
phase: 21-gh-trade-mobile-app
plan: 36
subsystem: mobile
tags: [capacitor, ios, android, deploy, vercel, push, gap-closure, uat3, verify-prod]

requires:
  - phase: 21-gh-trade-mobile-app (21-35)
    provides: "전 자동 게이트 green · 백엔드 선배포 충족(relay:2fe94209) · 실서버 재확인 대상 표 A1~A10 · B1~B8"
provides:
  - "UAT 3차 갭 클로징 라운드 웹 프로덕션 배포 — push 7fc86b9f..8e0fe57c (72 커밋)"
  - "운영 반영 확인 — 2026-09-26T13:03:31Z 운영 CSS 에 shared-panels-spacer"
  - "세 기기(iPhone 17 · iPad Pro 11 (M5) · emulator-5554) 운영 빌드 삭제 후 새 설치 · ready 확인 · PROD CONFIG OK"
  - "실서버 재확인 목록(A1~A10 · B1~B8) — /gsd-verify-work 21 이 받는다"
affects: [21 verify-work (21-VERIFICATION-R2.md)]

actuals:
  tokens: 5200     # chars/4 — 이 SUMMARY 만 (코드 변경 없음)
  tasks: 2         # Task 1 사용자 답(push-then-recheck) · Task 2 실행
  commits: 0       # 측정값: git rev-list --count 8e0fe57c..HEAD (SUMMARY 작성 시점) — 검증·배포 전용, 태스크 커밋 없음(문서 전용 = 0 이 정상)
plan_head_before: 8e0fe57c8021d34744bec7f41bfdb740521846ad

tech-stack:
  added: []
  patterns:
    - "push 전 백엔드 게이트는 배포 이미지 SHA 기준 diff(git diff --stat 2fe94209 HEAD -- 백엔드 경로) 가 빈지로 판정 — 선배포된 커밋은 막지 않는다"
    - "iOS 시뮬레이터에서 「저장값 없는 새 설치」를 만들려면 앱 삭제만으로는 부족 — 기기 전역 쿠키 저장소가 남는다(앱 안 로그아웃 또는 simctl erase)"

key-files:
  created:
    - .planning/phases/21-gh-trade-mobile-app/21-36-SUMMARY.md
  modified: []

key-decisions:
  - "Task 1 재개 신호 = push-then-recheck (사용자 2026-09-26 저녁: 「실제로 배포해서 실서버 버전으로 보자」) — dev UAT 생략, 실서버에서 확인"
  - "push 게이트 ① 은 21-35 기준 그대로 git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/ = 빈 출력으로 통과(aba7954..HEAD 의 rcc 2건은 relay:2fe94209 에 선배포됨)"
  - "push 게이트 ② origin/master..HEAD 72 커밋이 오케스트레이터 분류 집합(21-25~21-35 · rcc 4 · s5v 4 · 99f65502)과 정확히 일치 → push"
  - "세 기기는 install -r 이 아니라 삭제 후 새 설치 — B2(첫 로그인) 조건. 단 iOS 시뮬레이터는 기기 전역 쿠키로 로그인 상태가 남았다(아래 Issues)"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "UAT 정리 · 운영 설정 복원 — adb reverse 0 · :8080 LISTEN 0 · native:sync → PROD CONFIG OK (재설치 전·후 두 번)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "adb -s emulator-5554 reverse --remove-all → --list tcp 0 · lsof -iTCP:8080 -sTCP:LISTEN 0줄 · native:verify-prod → PROD CONFIG OK ×2"
        status: pass
    human_judgment: false
  - id: D2
    description: "웹 프로덕션 배포 — 백엔드 무변경(배포 SHA 기준) · 커밋 목록 대조 → push 7fc86b9f..8e0fe57c → 운영 CSS 반영 확인"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/ → 0줄"
        status: pass
      - kind: other
        ref: "git fetch · git status -sb [ahead 72] · git log origin/master..HEAD 72 = 알려진 집합 · git push → 7fc86b9f..8e0fe57c · 이후 status 에 ahead 없음"
        status: pass
      - kind: other
        ref: "curl https://trade.jx1.io/login → /_next/static/css/82a06ce9ae1097da.css 에 shared-panels-spacer (2026-09-26T13:03:31Z · push 후 약 77초)"
        status: pass
    human_judgment: false
  - id: D3
    description: "세 기기 운영 빌드 재설치 — 삭제 후 새 설치 · ready 로그 · 설치본 server = https://trade.jx1.io · cleartext false"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:build:ios BUILD SUCCEEDED · SIM ENTITLEMENTS OK · native:build:android BUILD SUCCESSFUL · 설치본 capacitor.config.json server={url:https://trade.jx1.io, cleartext:false} (ios · apk)"
        status: pass
      - kind: other
        ref: "ready platform=ios nativeApp=true (iPhone 17 22:03:53 · iPad Pro 11 22:04:01) · ready platform=android nativeApp=true (22:04:44 · bridge channel=webmessage origin=https://trade.jx1.io)"
        status: pass
    human_judgment: false
  - id: D4
    description: "UAT 3차 사람 확인 — 실서버 재확인 목록 A1~A10 · B1~B8 (dev UAT 는 사용자 결정으로 생략)"
    requirement: MOBILE-01
    verification: []
    human_judgment: true
    rationale: "사용자가 dev UAT 를 생략하고 실서버에서 보기로 했다. 트레이딩 실동작 · 키보드 · 첫 로그인 · 체감 항목은 사람이 실서버 앱·웹에서 확인해야 한다 — /gsd-verify-work 21"

duration: 7min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 36: UAT 3차 push 결정 · 웹 프로덕션 배포 · 운영 빌드 재설치 Summary

**사용자가 `push-then-recheck` 를 골랐다.** 두 push 게이트를 다시 확인한 뒤 72 커밋을 push 했다.
- 백엔드: 배포 이미지 `2fe94209` 이후 백엔드 diff 가 0 이다.
- 커밋 목록: 알려진 집합과 정확히 일치한다.
- push 범위: `7fc86b9f..8e0fe57c`.

**운영 반영은 약 77초 뒤(13:03:31Z) 운영 CSS 의 `shared-panels-spacer` 로 확인했다.** 이어서 세 기기에서 앱을 삭제하고 운영 빌드를 새로 설치했다(iPhone 17 · iPad Pro 11 (M5) · Android 에뮬레이터). 세 기기 모두 `ready` 를 보냈고 PROD CONFIG OK 다. 사람 확인은 모두 실서버 재확인 목록(이 문서 끝)으로 넘어간다.

## Performance

- **Duration:** 7 min (Task 2 · 체크포인트 대기 별도)
- **Started:** 2026-09-26T13:01:51Z
- **Completed:** 2026-09-26T13:09:00Z
- **Tasks:** 2 (Task 1 = 사용자 답 · Task 2 실행)
- **Files modified:** 0 (코드 변경 없음) + 이 SUMMARY

## Task 1 — UAT 3차 결과 · 재개 신호

- **재개 신호: `push-then-recheck`.** 사용자 답(2026-09-26 KST 저녁, 오케스트레이터 대화): 「실제로 배포해서 실서버 버전으로 보자」.
- 21-35 UAT 환경 생존 확인은 하지 않았다. 21-35 Task 3 이 사용자 결정으로 생략돼 환경이 없다(프록시 없음 · dev 설치 없음).

| # | UAT 항목 | iPhone 17 | iPad Pro 11 (M5) | Android 에뮬 | 브라우저 |
|---|---|---|---|---|---|
| 1 | 키보드 (G-21-R3-1) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 2 | 첫 로그인 (G-21-R3-4) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 3 | 탭 왕복 (G-21-R3-11) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 4 | 뉴스·토론 전체 (G-21-R3-8) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 5 | 트레이딩 버튼 · 3탭 (G-21-R3-9 · R3-10) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 6 | /me 전략 로그 (G-21-R3-2) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 7 | 리뷰 사람 확인 (G-21-CR) | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |
| 8 | 회귀 한 바퀴 | 미제공 — 사용자 결정으로 dev UAT 생략, 실서버에서 확인 예정 | 〃 | 〃 | 〃 |

항목 1~8 은 모두 21-35-SUMMARY 「실서버 재확인 대상」 B1~B8 로 옮겨졌다(이 문서 끝 목록).

## Task 2 — 마무리 기록

### ① UAT 정리

| 대상 | 조치 | 결과 |
|---|---|---|
| UAT 프록시 :8080 | 없음 — 21-35 가 띄우지 않았다 | `lsof -iTCP:8080 -sTCP:LISTEN` 0줄 |
| dev 서버 :3100 (next-server PID 97752) | **끄지 않음** — 21-35 가 띄운 프로세스가 아니다 | 계속 LISTEN |
| Android `adb reverse` | `adb -s emulator-5554 reverse --remove-all` | `--list` tcp 0개(빈 줄 1개만) |

### ② 운영 설정 복원

`native:sync` → `native:verify-prod` → **PROD CONFIG OK — https://trade.jx1.io · cleartext 없음 · appId com.ghtrade.app (ios · android)**

### ③ push 게이트 → push → 운영 반영

| 단계 | 명령 | 결과 |
|---|---|---|
| 백엔드 무변경 (T-21-99) | `git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/` | **0줄 → 통과.** 참고로 문자 그대로의 `git log aba7954..HEAD -- <백엔드>` 는 rcc 2건(`e9e4c786` · `89f5680d`)을 보인다. 이 2건은 relay:2fe94209 선배포에 들어 있다(21-35 결정) |
| 커밋 목록 (T-21-52) | `git fetch` → `git status -sb` → `git log --oneline origin/master..HEAD` | `[ahead 72]` · behind 0 · HEAD `8e0fe57c`(오케스트레이터 분류 시점과 같다). 72개 = 21-25 ~ 21-35 라운드 커밋 · quick-260926-rcc 4(`e9e4c786` · `89f5680d` · `4d62ba70` · `d6ea261b`) · quick-260926-s5v 4(`0c882544` · `a551023c` · `d28ac2d1` · `b22c06f0`) · 사용자 커밋 `99f65502`. **모르는 커밋 0 → 통과** |
| push | `git push origin master` (13:02:14Z) | `7fc86b9f..8e0fe57c  master -> master` · 이후 `git status -sb` = `## master...origin/master` (ahead 없음) |
| 운영 반영 (최대 10분 · 30초 간격) | `https://trade.jx1.io/login` HTML 의 CSS 에서 `shared-panels-spacer` 검색 | 1회차(13:03:01Z) 없음 → **2회차 2026-09-26T13:03:31Z (22:03:31 KST) 발견** · `/_next/static/css/82a06ce9ae1097da.css`. push 후 약 77초. 수동 prebuilt 배포는 필요 없었다 |

### ③ 운영 빌드 재설치

빌드: `native:build:ios` → **BUILD SUCCEEDED · SIM ENTITLEMENTS OK application-identifier=954QPCS3F5.com.ghtrade.app** · `native:build:android` → **BUILD SUCCESSFUL**. 설치본의 `capacitor.config.json` `server` 는 두 플랫폼 모두 `{"url":"https://trade.jx1.io","cleartext":false}` 다.

| 기기 | 조치 | ready |
|---|---|---|
| iPhone 17 `3B11B38C-DDE2-40F7-AA65-2163A581A6B9` | terminate → **uninstall** → install → launch (PID 93353) | `22:03:53.612 ready platform=ios nativeApp=true` |
| iPad Pro 11-inch (M5) `52DD0C30-86BB-4374-89E8-748F6DE00998` (이미 부팅돼 있었다) | terminate → **uninstall** → install → launch (PID 93719) | `22:04:01.574 ready platform=ios nativeApp=true` |
| Android `emulator-5554` | force-stop → **uninstall** → `install -r` Success → `am start` (PID 24817) | `22:04:44.096 GHTrade ready platform=android nativeApp=true` · `bridge channel=webmessage origin=https://trade.jx1.io` |
| 재설치 뒤 재검사 | `native:verify-prod` | **PROD CONFIG OK** |

- 스크린샷: Android 는 다크 `/login` 이다. iPhone 17 · iPad Pro 11 은 로그인된 홈(「오늘의 급등 테마」 · 탭바)이다. iOS 쪽 이유는 아래 Issues 를 본다. 파일은 `…/scratchpad/u36-iphone.png` · `u36-ipad.png` · `u36-android.png` 다.
- dev 인디케이터(「N」)는 세 기기 모두 없다.

### 실기기

- `xcrun devicectl list devices`: 목록의 세 기기(iPad Pro 11 (M5) · iPhone 17 · iPhone 18 Pro)가 모두 `Reality = simulated` 다.
- `adb devices -l`: `emulator-5554` 만 있다.
- **연결된 실기기 없음.** 실기기에 옛 빌드가 있다면 사용자가 재설치한다.

## Accomplishments

- UAT 3차 라운드(21-25 ~ 21-35)와 rcc · s5v · 사용자 커밋을 한 번에 웹 프로덕션으로 내보냈다(72 커밋). 게이트는 두 가지였다.
  - 백엔드: 선배포 이미지 이후 diff 0.
  - 커밋 목록: 알려진 집합과 정확히 일치.
- 운영 반영을 77초 만에 CSS 증거로 확인했다. 새 네이티브 셸(키보드 즉시 숨김 · 문서 로드 대기 · WebMessageListener 브리지 · 백업 끔)과 새 웹이 세 기기에서 짝을 이룬다.
- 생성 설정을 운영값으로 되돌렸고 adb reverse 도 비웠다. 1차 기록(21-UAT · 21-VERIFICATION · 21-REVIEW)은 그대로다.

## Task Commits

1. **Task 1: UAT 3차 재검증 + push 결정** — 사용자 답 `push-then-recheck`. 커밋 없음
2. **Task 2: 마무리 · push · 재설치** — 커밋 없음(검증·배포 전용). push 범위 `7fc86b9f..8e0fe57c`

**Plan metadata:** 이 SUMMARY 커밋 · STATE/ROADMAP 커밋(docs). 두 커밋은 뒤에 한 번 더 push 한다(docs 전용).

## Files Created/Modified

- `.planning/phases/21-gh-trade-mobile-app/21-36-SUMMARY.md` — 재개 신호 · push 게이트와 범위 · 운영 반영 시각 · 재설치 · 실서버 재확인 목록

## Decisions Made

- push 게이트 ① 은 플랜 문자(`aba7954..HEAD` 로그)가 아니라 21-35 결정 기준(`2fe94209..HEAD` 백엔드 diff 0)으로 판정했다. 오케스트레이터가 지시했고 21-35 SUMMARY 의 Next Phase Readiness 와 같다.
- 세 기기는 덮어쓰기(`install -r`)가 아니라 삭제 후 새 설치로 올렸다. B2 첫 로그인 조건을 맞추고, 스모크가 남긴 dev URL 설치본의 흔적을 없애기 위해서다.
- :3100 dev 서버(PID 97752)는 이 라운드가 띄우지 않았으므로 두었다.

## Deviations from Plan

**1. [사용자 결정] Task 1 — dev UAT 생략 · 환경 생존 확인 생략**
- **Found during:** Task 1
- **Issue:** 플랜은 dev UAT 환경에서 항목 1~8 을 확인한 뒤 결정을 받는다. 21-35 Task 3 이 사용자 결정으로 생략돼 환경이 없다.
- **Resolution:** 사용자가 바로 `push-then-recheck` 를 골랐다. 항목 1~8 결과는 「미제공」으로 기록했다. 실서버 재확인 목록 B1~B8 로 옮겼다.
- **Files modified:** 없음

**2. [오케스트레이터 지시 · 21-35 결정] Task 2 ③ 백엔드 게이트 판정 기준**
- **Found during:** Task 2 ③
- **Issue:** 플랜 문자 그대로의 `git log aba7954..HEAD -- <백엔드>` 는 rcc 2건을 보이므로 push 를 막는다.
- **Resolution:** 배포 이미지 기준 `git diff --stat 2fe94209 HEAD -- <백엔드>` = 0줄로 판정했다. 이 2건은 relay:2fe94209 에 이미 들어 있다.
- **Files modified:** 없음

**3. [Rule 3 성격 · 경미] 재설치를 덮어쓰기 대신 삭제 후 설치로**
- **Found during:** Task 2 ③ 재설치
- **Issue:** 플랜 문구는 `install -r`/설치·실행이다. 오케스트레이터 지시는 「uninstall/reinstall」이다. B2 첫 로그인은 저장값 없는 새 설치가 조건이다.
- **Resolution:** 세 기기 모두 uninstall 뒤 install 했다.
- **Files modified:** 없음

**Total deviations:** 3 (사용자 결정 1 · 지시된 판정 기준 1 · 절차 보강 1 · 코드 수정 0). **Impact:** 배포 안전 게이트는 줄지 않았다(백엔드 · 커밋 목록 · 운영 반영 모두 실측). 사람 확인은 모두 실서버로 넘어갔다.

## Issues Encountered

- **iOS 시뮬레이터는 앱을 삭제해도 로그인 상태가 남는다(시뮬레이터 특성 · 앱 결함 아님).**
  - 현상: 두 iOS 시뮬레이터는 새 데이터 컨테이너(22:03 생성)인데도 로그인된 홈으로 떴다. Android 는 `/login` 으로 떴다.
  - 원인: 기기 전역 쿠키 저장소 `…/Devices/<UDID>/data/Library/Cookies/Cookies.binarycookies` 에 `trade.jx1.io` 의 `sb-…-auth-token.0/.1` 쿠키가 남아 있다. 이 파일은 앱 컨테이너 밖에 있어 `simctl uninstall` 로 지워지지 않는다.
  - 네이티브 셸에는 쿠키 · 키체인 · 세션 코드가 없다(grep 0). 운영 `/` 는 비로그인 시 307 → `/login?next=%2F` 다.
  - **영향:** B2(첫 로그인 · 탭바가 로그인 잔상 위에 먼저 뜨지 않음)를 iOS 시뮬레이터에서 보려면 먼저 앱 안에서 **로그아웃**해야 한다. 그다음 앱을 종료했다가 다시 실행한다. 전부 지우려면 `xcrun simctl erase <UDID>` 를 쓴다(기기 전체 초기화 — 사용자 판단). Android 에뮬레이터는 이미 새 설치 조건이다.
- **관찰(B2 참고):** 세 기기 로그에 `document load wait ended reason=timeout` 이 보인다(iPhone 17 · Android). iPad 는 `reason=route` 였다. 첫 route 가 1.5초 안에 오지 않아 탭바가 타임아웃 경로로 나타났다는 뜻이다. 에뮬레이터 콜드 스타트 GC 정지(134ms+)와 새 설치 첫 로드가 겹친 것으로 보인다. 설계상 폴백 동작이다. B2 확인 때 탭바가 로그인 잔상 위에 먼저 뜨는지를 같이 본다.

## Known Stubs

없음(검증·배포 전용 플랜).

## User Setup Required

없음. 실기기에 옛 빌드가 있으면 사용자가 재설치한다(연결된 실기기는 없었다).

## Next Phase Readiness

- **다음 단계: `/gsd-verify-work 21`.** 재검증 산출물은 `21-VERIFICATION-R2.md` 다. 21-UAT.md · 21-VERIFICATION.md · 21-REVIEW.md 는 덮어쓰지 않는다.
- 웹(운영)과 세 기기(운영 빌드)가 같은 라운드 코드로 맞춰져 있다. relay 는 2fe94209 이미지다.
- 아래 실서버 재확인 목록 A1~A10 · B1~B8 을 실서버 앱·웹에서 본다. **실주문 금지.**

## 실서버 재확인 목록 (21-35-SUMMARY 「실서버 재확인 대상」 전부 · push 완료 후 실서버 앱·웹에서)

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

**B. dev UAT 에서 보려던 21-36 UAT 항목 1~8**

| # | 항목 | 확인 내용 |
|---|---|---|
| B1 | 키보드 (G-21-R3-1 · D-12a) | /search 입력 포커스 → 탭바가 키보드 위에 걸린 순간 없이 사라지고, 입력칸 이동 시 깜빡임이 없다. 키보드를 내리면 곧 다시 나타난다. iPad 하드웨어 키보드면 탭바가 유지된다 |
| B2 | 첫 로그인 (G-21-R3-4 · D-12b) | 새 설치 앱(저장값 없음) → 로그인 → 홈: 탭바가 로그인 잔상·빈 화면 위에 먼저 뜨지 않는다. 콜드 스타트도 같다. 기본 다크. **iOS 시뮬레이터는 먼저 앱 안에서 로그아웃**(위 Issues — 기기 전역 쿠키). Android 에뮬레이터는 이미 새 설치 · `/login` 상태 |
| B3 | 탭 왕복 (G-21-R3-11 · D-32 축소) | 홈 스크롤 → 검색 → AI → 마이 → 홈: 스크롤 위치가 돌아오고 스켈레톤이 없다. 같은 탭을 다시 탭하면 맨 위로 간다 |
| B4 | 뉴스·토론 전체 (G-21-R3-8 · D-29) | 전체 보기 → 탭 안 전체목록 → 화면 안 ← · Android 뒤로가기 · 브라우저 뒤로 · 탭 재클릭 → 요약 + 원래 스크롤. 옛 `/stocks/005930/news` → 탭 안 전체목록 |
| B5 | 트레이딩 버튼 · 3탭 (G-21-R3-9 · R3-10) | 폰 하단 「트레이딩」 · 넓은 폭 히어로 알약(스케치 008 ② A) · 매매 불가 종목(ETF 등)에는 버튼이 없다 · 종목상세 3탭 · `?tab=orderbook` → 트레이딩/차트 |
| B6 | /me 전략 로그 (G-21-R3-2 · D-25a) | 배치 = 스케치 008 ① B 「현황 \| 로그」 + 실데이터(A1 과 함께) |
| B7 | 리뷰 사람 확인 (G-21-CR) | Android 팝오버 뒤로가기(WR-04) · /search 빠른 타이핑 때 엉뚱한 「없습니다」 번쩍임 없음(WR-05) · iPhone Safari 기본 다크 크롬 색 `#17171c`(IN-06) · 비행기 모드 → 오프라인 폴백 → 복구 시 **운영 `https://trade.jx1.io`** 로 복귀(IN-02) · 폴백에서 뒤로가기 1회에 종료(IN-03) |
| B8 | 회귀 한 바퀴 | 탭바 모양·활성 · 당겨서 새로고침 · 시트를 열면 탭바 숨김 · 인앱 브라우저 · 로그아웃 → 로그인 · 테마 전환 |

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: `.planning/phases/21-gh-trade-mobile-app/21-36-SUMMARY.md`
- FOUND: push 범위 커밋 `7fc86b9f` · `8e0fe57c` · 배포 기준 `2fe94209`
- 측정 `git rev-list --count 8e0fe57c..HEAD` = 0 (SUMMARY 작성 시점 · 코드 변경 없음)
- 21-UAT.md · 21-VERIFICATION.md · 21-REVIEW.md `git diff --quiet` 통과 · PROD CONFIG OK · :8080 LISTEN 0 · adb reverse tcp 0
