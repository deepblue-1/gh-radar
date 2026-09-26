---
phase: 21-gh-trade-mobile-app
plan: 24
subsystem: mobile
tags: [capacitor, ios, android, uat, push, vercel, verify-prod, gap-closure]

requires:
  - phase: 21-gh-trade-mobile-app (21-23)
    provides: "갭 클로징 뒤 전 자동 게이트 green · push 전 UAT 환경(dev 웹 :3100 · UAT 프록시 PID 36151 · 저장값 없는 dev 빌드 세 기기)"
provides:
  - "UAT 재검증 결정 — 재개 신호 push-then-recheck (항목별 기기 결과 미제공 · 실서버 재확인으로 이관)"
  - "push 이행 — origin/master bac3746 → 5f91e1a (Phase 21 커밋 30개) · 운영 CSS --native-body-reserve:98px 반영 확인 2026-09-26T05:17:02Z"
  - "세 기기(iPhone 17 · iPad Pro 11 (M5) · emulator-5554)에 운영 빌드(https://trade.jx1.io · cleartext 없음 · 새 네이티브 탭바 60) 재설치 · ready 확인"
  - "UAT 정리 — 프록시 PID 36151 종료 · adb reverse 0개 · 생성 설정 PROD CONFIG OK"
affects: [/gsd-verify-work 21 (실서버 앱에서 UAT 항목 1~5 재확인)]

actuals:
  tokens: 4200     # chars/4 — 이 SUMMARY 한 파일(코드 변경 없음)
  tasks: 2
  commits: 0       # 측정값: git rev-list --count 5f91e1a..HEAD (SUMMARY 작성 시점). 검증·배포 전용 플랜이라 태스크 커밋 없음 — 이 SUMMARY·STATE docs 커밋은 별도
plan_head_before: 5f91e1a49dd6a4a44d42ae9a7f0bfb95eaaac716

tech-stack:
  added: []
  patterns:
    - "push 뒤 운영 반영은 HTML 의 /_next/static/css 링크를 받아 토큰 문자열(--native-body-reserve:98px)로 판정한다 — 배포 대시보드 없이 실제 서빙 자산으로 확인"

key-files:
  created:
    - .planning/phases/21-gh-trade-mobile-app/21-24-SUMMARY.md
  modified: []

key-decisions:
  - "사용자 선택 push-then-recheck — dev 에서 못 본 항목이 있어 Claude 가 push 하고, 남은 UAT 항목 1~5 전부를 실서버 앱에서 /gsd-verify-work 21 로 받는다"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "사용자 UAT 결정과 push 여부 — blocking-human 체크포인트에서 사용자가 push-then-recheck 선택"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "Task 1 재개 신호 = push-then-recheck (사용자 답 원문)"
        status: pass
    human_judgment: true
    rationale: "갭 네 건의 실제 모양 판정은 사람 몫이며, 이번에는 항목별 결과 없이 실서버 재확인으로 이관됐다 — 판정은 /gsd-verify-work 21"
  - id: D2
    description: "push 이행과 운영 반영 — 앞선 커밋이 전부 Phase 21 임을 확인하고 push · 운영 CSS 98 확인"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "git log origin/master..HEAD = 30개 전부 Phase 21(21-16 UAT docs · sketch-007 · 갭 플랜 · 21-17~21-23) → git push origin master bac3746..5f91e1a"
        status: pass
      - kind: other
        ref: "https://trade.jx1.io/login → /_next/static/css/f1c6e8c8f578d631.css 에 --native-body-reserve:98px (05:17:02Z · 5번째 시도, push 뒤 약 2분)"
        status: pass
    human_judgment: false
  - id: D3
    description: "운영 설정 복원 · UAT 정리 · 운영 빌드 재설치"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:verify-prod → PROD CONFIG OK (UAT 정리 직후 · 재설치 뒤 두 번)"
        status: pass
      - kind: other
        ref: "lsof -iTCP:8080 -sTCP:LISTEN 0줄 · adb reverse --list tcp 0개 · git diff --quiet 21-UAT.md exit 0"
        status: pass
      - kind: other
        ref: "iOS 두 UDID get_app_container capacitor.config.json server = https://trade.jx1.io · cleartext false · ready platform=ios 14:17:30 · APK assets server 동일 · GHTrade ready platform=android 14:18:19"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 24: UAT 재검증 · push 결정과 이행 Summary

**사용자가 `push-then-recheck` 를 골랐다. Phase 21 커밋 30개(bac3746 → 5f91e1a)를 push 했고, 약 2분 뒤 운영 CSS 에서 `--native-body-reserve:98px` 를 확인했다(05:17:02Z). 이어서 세 기기(iPhone 17 · iPad Pro 11 (M5) · Android 에뮬레이터)에 운영 빌드(`https://trade.jx1.io`, 새 네이티브 탭바 60)를 다시 설치했다. UAT 프록시는 종료했고 adb reverse 는 비웠으며, 생성 설정은 PROD CONFIG OK 로 복원했다. UAT 항목 1~5 는 실서버 앱에서 `/gsd-verify-work 21` 로 확인한다.**

## Performance

- **Duration:** 5 min (Task 2 기준. Task 1 체크포인트는 오케스트레이터가 사용자에게 제시)
- **Started:** 2026-09-26T05:14:24Z
- **Completed:** 2026-09-26T05:19:19Z
- **Tasks:** 2/2
- **Files modified:** 0 (코드 변경 없음 — 이 SUMMARY 만)

## UAT 결과 (Task 1)

| 항목 | iPhone 17 | iPad Pro 11 (M5) | Android 에뮬레이터 | 데스크톱 브라우저 |
|---|---|---|---|---|
| 1 탭바 (G-21-1 · D-27b) | 미제공 | 미제공 | 미제공 | — |
| 2 기본 다크 (G-21-N1 · D-23a) | 미제공 | 미제공 | 미제공 | 미제공 |
| 3 테마 아이콘 (G-21-N2 · D-08b) | 미제공 | 미제공 | 미제공 | 미제공 |
| 4 인앱 브라우저 (G-21-N3 · D-28) | 미제공 | 미제공 | 미제공 | — |
| 5 회귀 한 바퀴 | 미제공 | 미제공 | 미제공 | — |

- **사용자 답: push-then-recheck (항목별 기기 결과 미제공 — 실서버 재확인으로 이관)**
- 체크포인트를 띄우기 전 오케스트레이터가 UAT 환경을 확인했다: `:3100/login` 200 · `127.0.0.1:8080/api/health` 200 · iPhone 17 · iPad Pro 11 (M5) 부팅 · emulator-5554 앱 프로세스 실행 중.
- 21-UAT.md 는 수정하지 않았다(`git diff --quiet` exit 0). 결과 반영은 `/gsd-verify-work 21` 이 한다.

## 마무리 기록 (Task 2)

### ① UAT 정리

| 대상 | 조치 | 확인 |
|---|---|---|
| UAT 프록시 PID 36151 (21-23 기동) | `kill 36151` | 프로세스 없음 · `lsof -iTCP:8080 -sTCP:LISTEN` 0줄 |
| dev 서버 PID 97752 (21-20 재기동) | **끄지 않음** — 21-23 이 띄우지 않았다 | 실행 중 그대로 |
| Android `adb reverse` (tcp:3100 · tcp:8080) | `adb -s emulator-5554 reverse --remove-all` | `--list` 에 tcp 항목 0개(빈 줄 1개만) |

### ② 운영 sync 복원

- `native:sync` → `native:verify-prod` → **PROD CONFIG OK — https://trade.jx1.io · cleartext 없음 · appId com.ghtrade.app (ios · android)**

### ③ push → 운영 반영 → 운영 빌드 재설치

| 단계 | 결과 |
|---|---|
| push 직전 확인 | `git fetch` 뒤 `git status -sb` = `ahead 30` · 작업 트리 미커밋은 다른 세션 파일 3개(`.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock`, 건드리지 않음) · `origin/master..HEAD` 30개 전부 Phase 21: 21-16 UAT docs(a2df9f6 · a0b3ee5) · sketch-007(ff6b867) · 갭 플랜(bfd56f1) · 21-17~21-23 feat/test/docs |
| push | `git push origin master` → **`bac3746..5f91e1a`** (05:14:50Z) · 이후 `git status -sb` = `## master...origin/master` |
| 운영 반영 | 30초 간격 폴링 5번째에 `https://trade.jx1.io/login` 의 `/_next/static/css/f1c6e8c8f578d631.css` 에서 `--native-body-reserve:98px` 확인 — **2026-09-26T05:17:02Z** (push 뒤 약 2분 · 수동 prebuilt 배포 불필요) |
| iOS 운영 빌드 | `native:build:ios` (CAP_SERVER_URL 미설정 = 운영 sync) → **BUILD SUCCEEDED** · SIM ENTITLEMENTS OK `954QPCS3F5.com.ghtrade.app` |
| iPhone 17 `3B11B38C-DDE2-40F7-AA65-2163A581A6B9` | `simctl install` → `launch` (PID 68979) · 설치본 `server` = `https://trade.jx1.io` · cleartext false · `14:17:30 ready platform=ios nativeApp=true` |
| iPad Pro 11 (M5) `52DD0C30-86BB-4374-89E8-748F6DE00998` | `simctl install` → `launch` (PID 69011) · 설치본 `server` 동일 · `14:17:29 ready platform=ios nativeApp=true` |
| Android 운영 빌드 | `native:build:android` → BUILD SUCCESSFUL · APK(14:17 KST 생성) assets `server` = `https://trade.jx1.io` · cleartext false 직접 확인 |
| emulator-5554 | `adb install -r` → Success · `am start` (PID 9528) · `14:18:19 GHTrade ready platform=android nativeApp=true` |
| 재설치 뒤 재검사 | `native:verify-prod` → **PROD CONFIG OK** |

- 세 기기 설치본은 **운영 URL + 새 네이티브(탭바 60)** 이다. 운영 웹 여백 98 과 짝이 맞는다.
- 재설치 뒤 스크린샷(`…/scratchpad/u24-3B11B38C.png` · `u24-52DD0C30.png` · `u24-android.png`)을 보면 세 기기 모두 다크 `/login` 이다. dev 빌드에서 보이던 Next dev 인디케이터(「N」)는 없다.
- iOS 는 `simctl install` 로 덮어써서 앱 데이터 컨테이너가 남아 있다. 21-24 dev UAT 중 저장한 네이티브 테마 값이 있다면 이어진다. 웹 저장소는 출처가 바뀌었으므로(`localhost:3100` → `trade.jx1.io`) 로그인은 새로 해야 한다. 「첫 실행 기본 다크」를 다시 보려면 앱을 삭제하고 다시 설치해야 한다.
- 실기기에 옛 빌드(탭바 70)가 깔려 있다면 사용자가 다시 설치해야 본문 여백이 맞는다.
- 서버·relay 변경은 없다. 백엔드 배포 순서 제약도 없다.

## Task Commits

1. **Task 1: UAT 재검증 + push 결정** — 커밋 없음(사용자 결정 체크포인트)
2. **Task 2: 마무리 · push · 재설치** — 커밋 없음(저장소 밖 · gitignore 대상만 변경). push 범위 `bac3746..5f91e1a`

**Plan metadata:** 이 SUMMARY · STATE · ROADMAP docs 커밋(커밋 뒤 다시 push 해서 ahead 0 을 유지)

## Files Created/Modified

- `.planning/phases/21-gh-trade-mobile-app/21-24-SUMMARY.md` — UAT 결정 · push/반영/재설치 기록

## Decisions Made

- 사용자가 `push-then-recheck` 를 선택했다. 확인 전 배포라는 점을 받아들인 선택이다. 남은 판정은 실서버 앱에서 `/gsd-verify-work 21` 이 받는다.

## Deviations from Plan

None - plan executed exactly as written.

- 참고: 플랜 순서는 「SUMMARY → 커밋 → push」다. 하지만 운영 반영 시각과 재설치 결과를 SUMMARY 에 적으려면 push 가 먼저여야 한다. 그래서 코드 커밋 30개를 먼저 push 했고, SUMMARY·STATE docs 커밋은 뒤에 한 번 더 push 한다(오케스트레이터 지시와 같다).

## Issues Encountered

- `native:build:android` 가 1초 만에 끝나 설정 반영 여부가 불분명했다. APK 생성 시각(14:17 KST)과 assets `capacitor.config.json` 의 `server` 가 운영값인지 직접 확인했다.

## Known Stubs

없음.

## User Setup Required

없음. 실기기에 옛 빌드가 있으면 재설치해야 한다.

## Next Phase Readiness

**실서버 앱에서 확인할 남은 UAT 항목** (세 기기에 운영 빌드 설치 · 로그인 필요, 데스크톱은 `https://trade.jx1.io`):

1. **탭바 (G-21-1 · D-27b)** — 세 기기 · 다크와 라이트 둘 다 본다. 확인할 것:
   - 모양: 글자 없음 · 아이콘 세로 가운데 · 활성 탭 가로 캡슐(파란 16%) · 테두리 없음 · 유리 느낌(Android 불투명 근사를 받아들일 수 있는지) · 넓고 옅은 그림자
   - 치수: 높이 60 · 바닥 20(인셋 없는 기기 14) · iPad 폭 560 가운데
   - 다크에서 유리 면과 아이콘이 또렷한지
   - VoiceOver/TalkBack 이 탭 이름을 읽는지
   - 「주문하기」 · /trading 하단 패널이 탭바 위에 서는지 · 목록 끝 항목이 탭바에 가리지 않는지(웹 여백 98)
   - Android 제스처 내비와 3버튼 내비 둘 다
2. **기본 다크 (G-21-N1 · D-23a)** — 새로 설치한 앱의 첫 화면이 다크여야 한다(흰 번쩍임 없음). 앱: /me 에서 라이트로 바꾸고 완전 종료 → 재실행 → 라이트 유지. 브라우저: 새 시크릿 창 `https://trade.jx1.io/login` 이 다크 → 라이트로 바꾸고 새로고침 → 유지.
3. **테마 아이콘 (G-21-N2 · D-08b)** — 데스크톱 /me 에서 사이드바 토글과 계정 카드 버튼이 같은 목적지 아이콘을 쓰는지(다크=해 · 라이트=달), 툴팁이 「라이트/다크 모드로 전환」인지 본다. 앱 /me 도 같은 규칙이어야 한다.
4. **인앱 브라우저 (G-21-N3 · D-28)** — 뉴스 · 종목상세 뉴스 · 종토방 원문 · AI 챗 인용 링크가 인앱으로 열려야 한다(iOS Safari 시트, Android Custom Tab — 21-17 선택 a). 닫으면 원래 화면 그대로. 같은 사이트 링크는 앱 안에서 이동. Android 뒤로가기로 닫힘.
5. **회귀** — 탭 이동(새로고침 없이) · 당겨서 새로고침 · 시트 열면 탭바 숨김 · 비행기 모드 → 오프라인 폴백(현재 테마) → 복구 시 자동 복귀. 실서버라 DMA 실시간도 함께 볼 수 있다.

- **다음 단계:** `/gsd-verify-work 21`
- ROADMAP 의 21-16 체크박스는 오케스트레이터가 처리한다.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- `21-24-SUMMARY.md` 존재 · push 범위 커밋 bac3746 · 5f91e1a 존재, 5f91e1a 는 origin/master 에 있다
- 태스크 커밋 0(측정값 `git rev-list --count 5f91e1a..HEAD` = 0 — 검증·배포 전용, 코드 변경 없음이 정당한 0)
- PROD CONFIG OK · :8080 LISTEN 0줄 · adb reverse tcp 0개 · 21-UAT.md 무수정 · 세 기기 운영 ready 로그
