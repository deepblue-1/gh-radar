---
phase: 21-gh-trade-mobile-app
plan: 25
subsystem: ui
tags: [mockup, sketch, gap-closure, decisions, mobile, me, stock-detail, trading, android-webkit]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-24 UAT 재검증 뒤 UAT 3차 갭(G-21-R3-1~11 · G-21-CR) 과 21-UAT.md decision 줄"
provides:
  - "스케치 008 (세 표면 × 변형 A/B/C × 다크/라이트) 과 채택안 ①B ②A ③A"
  - "21-CONTEXT UAT 3차 결정 D-12a · D-12b · D-25a · D-29 · D-30 · D-31 · D-32 + WR-03 선택 a 줄"
  - "D-06 · D-12 · D-25 원문 보존 + 대체 포인터"
affects: [21-26, 21-27, 21-28, 21-29, 21-30, 21-31, 21-32, 21-33, 21-34, 21-36]

actuals:
  tokens: 17000
  tasks: 3
  commits: 1
plan_head_before: 7fc86b9f5494484f212bc515a79e823022fe2783

tech-stack:
  added: []
  patterns:
    - "목업 게이트: 사용자 답 전 스케치·CONTEXT 커밋 없음, 답 뒤 한 커밋에 목업 + 채택안 + 결정"
    - "결정 대체 = 원문 보존 + 끝에 「→ D-xx」 포인터"

key-files:
  created:
    - .planning/sketches/008-uat3-surfaces/index.html
    - .planning/sketches/008-uat3-surfaces/README.md
  modified:
    - .planning/sketches/MANIFEST.md
    - .planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md

key-decisions:
  - "① /me 전 종목 전략 로그 = 스케치 008 B — 전략 현황 카드 안 「현황 | 로그」 전환(기본 현황 · /me 세로 길이 불변) (D-25a)"
  - "② 종목상세 넓은 폭 「트레이딩」 = 스케치 008 A — 히어로 첫 줄 끝 32 알약(--up) · 폰은 하단 바 라벨만 「트레이딩」 (D-30)"
  - "③ 카드 수동주문 주문유형 = 스케치 008 A — 주문금액 위 44px 행 「주문유형 지정가 ›」(호가주문 탭 UI 이동) (D-31)"
  - "R3-2 잃는 동작(잔고 행 → 카드 생성·포커스 · 카드 없는 종목 미체결 정정)은 앱에서 범위 밖 — 사용자 동의"
  - "R3-8 옛 URL /stocks/{code}/news · /discussions → /stocks/{code}?tab=news&view=news|discussions 리다이렉트 — 사용자 동의 (D-29)"
  - "WR-03 Android 브리지 = 선택 a — androidx.webkit 1.14.0 app 모듈 선언(variables.gradle androidxWebkitVersion 공유) + WebMessageListener, 허용 출처 · 메인 프레임만"
  - "D-32: G-21-R3-11 은 탭 루트 스크롤 복원 + 스켈레톤 없는 재방문(기존 lib/query-cache) 로 축소, keep-alive · 탭별 웹뷰 기각"

patterns-established:
  - "UAT 라운드 결정은 CONTEXT 에 「갭 클로징 결정 (UAT N차)」 소제목으로, 각 항목 끝에 근거 = gap id"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "스케치 008 standalone 목업 — 세 표면 × A/B/C × 다크/라이트, globals.css 토큰 인라인, 외부 URL 0"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "Task 1 verify — SKETCH 008 OK (variant markers 18 · .dark 3 · http(s):// 0 · webapp/mobile 상태 스냅숏 동일)"
        status: pass
    human_judgment: true
    rationale: "목업의 시각 적합성은 사용자 검토로만 판정된다 — Task 2 에서 사용자가 열어 보고 채택안을 답했다"
  - id: D2
    description: "채택안 ①B ②A ③A 와 재확인 3건이 README Winner · MANIFEST 008 행 · CONTEXT 에 기록"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "Task 3 verify — UAT3 DECISIONS OK · README winner pending 0 · 결정 머리 7건 각 1줄 · 포인터 3개 각 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-32 가 R3-11 축소 범위를 적고 D-06 · D-12 · D-25 원문이 보존됨"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "grep -c '스켈레톤 없이 바로' = 1 · grep -c 'keep-alive(React Activity · 화면 보존)와 탭별 웹뷰는 기각' = 1 · 원문 grep 3건 통과"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 25: UAT 3차 목업 게이트 · 재확인 · 결정 기록 Summary

**스케치 008 로 세 표면의 자리를 정했다: /me 전략 로그는 전략 현황 카드 안 「현황 | 로그」 전환(B), 넓은 폭 「트레이딩」은 히어로 첫 줄 끝 32 알약(A), 카드 주문유형은 주문금액 위 44px 행(A). WR-03 은 androidx.webkit 1.14.0 선언 + WebMessageListener(a). 이 채택안과 UAT 3차 결정 7건(D-12a~D-32)을 21-CONTEXT 에 기록했다. 코드 변경은 없다.**

## Performance

- **Duration:** 약 19분 (사용자 답 대기 포함, 두 executor 세션)
- **Started:** 2026-09-26T09:42:50Z
- **Completed:** 2026-09-26T10:01:51Z
- **Tasks:** 3/3 (Task 2 = blocking-human 체크포인트)
- **Files modified:** 4

## Accomplishments
- 스케치 008 `uat3-surfaces`: ① /me 로그 · ② 넓은 폭 「트레이딩」 · ③ 카드 주문유형, 각각 A/B/C 를 다크/라이트로 그림. globals.css 토큰을 그대로 인라인했고 외부 리소스는 없다.
- 사용자 답 6건(채택 3 · 재확인 3)과 Android 클래스패스 실측 2건을 기록했다.
- 21-CONTEXT 에 「### 갭 클로징 결정 (UAT 3차 · 2026-09-26 사용자 확정)」 소제목을 새로 두고 D-12a · D-12b · D-25a · D-29 · D-30 · D-31 · D-32 와 WR-03 줄을 넣었다. D-06 · D-12 · D-25 는 원문을 두고 끝에 대체 포인터만 붙였다.
- MANIFEST 에 008 행을 추가했다.

## Task Commits

1. **Task 1: 스케치 008 목업 작성 · open** — 태스크 커밋 없음. 플랜이 사용자 답 전 커밋을 금지하므로 Task 3 커밋에 포함했다.
2. **Task 2: 목업 검토 + 재확인 3건** — 체크포인트. 사용자 답만 받았고 커밋은 없다.
3. **Task 3: 채택안 박제 · CONTEXT 결정 7건 · 커밋** — `5778550` (docs)

**Plan metadata:** 이 SUMMARY 와 STATE/ROADMAP 은 별도 docs 커밋으로 올린다.

## Files Created/Modified
- `.planning/sketches/008-uat3-surfaces/index.html` — 세 표면 × A/B/C × 다크/라이트 standalone 목업
- `.planning/sketches/008-uat3-surfaces/README.md` — 디자인 질문 · 변형 · Winner(①B ②A ③A + 재확인 답)
- `.planning/sketches/MANIFEST.md` — 008 행
- `.planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md` — UAT 3차 결정 7건 + WR-03 줄 + 포인터 3개

## Decisions Made

### 사용자 답 원문 (Task 2 · 질문마다 다이얼로그 하나, 순서대로)
재개 신호: `①B ②A ③A 잃는동작:동의 리다이렉트:동의 webkit:a`

1. **① /me 전 종목 전략 로그 (G-21-R3-2): B** — 전략 현황 카드 안 「현황 | 로그」 스위치 (페이지 높이 불변, 기본값 현황)
2. **② 종목상세 넓은 폭 「트레이딩」 버튼 (G-21-R3-9): A** — 히어로 첫 줄 끝 32 필 버튼 (--up). 폰은 하단 바 라벨만 「트레이딩」
3. **③ 카드 수동주문 주문유형 (G-21-R3-10): A** — 주문금액 위 44px 행 「주문유형 지정가 ›」 (현재 호가주문 탭 UI 이동)
4. **재확인 · 잃는 동작** (앱에서 /trading 하단 패널을 숨기면 보유종목 행 탭 → 카드 생성·포커스, 그리고 카드 없는 종목의 미체결 정정 진입이 사라짐): **동의** (범위 밖)
5. **재확인 · 리다이렉트 G-21-R3-8** (`/stocks/{code}/news` · `/discussions` → `/stocks/{code}?tab=news&view=news|discussions`): **동의**
6. **재확인 · WR-03 Android 브리지: a** — androidx.webkit 1.14.0 app 모듈 선언(variables.gradle androidxWebkitVersion 공유) + WebMessageListener, 허용 출처·메인 프레임만

### 클래스패스 실측 (질문 6 전에 이전 executor 가 실행 · `mobile/android`)
- `./gradlew :app:dependencies --configuration debugRuntimeClasspath -q | grep -n 'androidx.webkit'` →
  ```
  242:|    +--- androidx.webkit:webkit:1.14.0            (under project :capacitor-android)
  248:|         +--- androidx.webkit:webkit:1.12.1 -> 1.14.0 (*)   (under org.apache.cordova:framework:14.0.1)
  ```
- 같은 명령을 `--configuration debugCompileClasspath` 로 → **0줄** (앱 모듈 컴파일 클래스패스에는 없다. 그래서 선택 a 는 선언 1줄이 필요하고, APK 런타임 의존 집합은 그대로다)

### CONTEXT 에 기록한 결정 (21-CONTEXT.md 「갭 클로징 결정 (UAT 3차)」)
- **D-12a** (G-21-R3-1): 키보드 때문에 탭바를 숨길 때 기다리지 않고 바로 숨긴다. 페이드는 키보드보다 짧고, 다시 보일 때 90ms 디바운스를 둔다.
- **D-12b** (G-21-R3-4): 전체 문서 로드가 시작되면 탭바를 대기시킨다. 첫 `route` 메시지나 1.5초가 지나면 280ms 동안 나타난다.
- **D-25a** (G-21-R3-2): 앱에서 /trading 공용 패널과 spacer 를 숨긴다. 전략 로그는 /me 의 「현황 | 로그」(①B)로 옮기고, 잃는 동작에는 동의를 받았다.
- **D-29** (G-21-R3-8): 전체목록은 탭 안 `?tab=news&view=…` 로 연다. 옛 URL 은 리다이렉트한다(동의).
- **D-30** (G-21-R3-9): 버튼 이름은 「트레이딩」 → `/trading?code=` 이다. 넓은 폭은 히어로 첫 줄 끝 32 알약(②A), 매매 불가 종목에서는 숨긴다.
- **D-31** (G-21-R3-10): 호가주문 탭을 제거한다. 시간외종가는 카드의 44px 주문유형 행(③A)에서 고른다.
- **D-32** (G-21-R3-11): 탭 루트마다 스크롤 위치를 복원하고, 스켈레톤 없이 바로 보여 준 뒤 조용히 갱신한다. 상태 초기화는 허용하고, keep-alive 와 탭별 웹뷰는 기각했다.
- WR-03 줄: 선택 a. 21-29 가 이 줄을 읽는다.

## Deviations from Plan

### 절차 메모

**1. 보호 브랜치 가드 판정 무시 (master 직접 커밋)**
- **Found during:** Task 3 커밋 직전
- **Issue:** `gsd-tools query git.base-branch --is-protected master` 가 `true` 를 돌려줬다. executor 기본 규칙대로라면 커밋을 멈춰야 한다.
- **Resolution:** 오케스트레이터가 「main working tree · branch master 순차 executor · 일반 커밋」 으로 명시 지시했다. 이 프로젝트의 phase 21 플랜 21-01~21-24 도 모두 master 에 직접 커밋했으므로 그 관례를 따랐다. push 는 하지 않았다.
- **Committed in:** 5778550

**2. 커밋 메시지 범위 표기**
- 플랜 문구는 `docs(21): …` 였지만 오케스트레이터 지시(`type(21-25): …`)에 맞춰 `docs(21-25): …` 로 적었다. 내용은 같다.

---

**Total deviations:** 자동 수정 0건, 절차 메모 2건
**Impact on plan:** 없음. 산출물과 검증은 플랜 그대로다.

## Issues Encountered
- 이전 executor 가 Task 1 에서 목업 헤더의 「에코프로」 줄바꿈 결함을 고쳤다(손보는 표면 안 시각 결함 · 목업 파일만).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 21-26~21-34 는 여기 채택안과 D-12a~D-32 를 정본으로 쓴다. 특히 21-29 는 WR-03 선택 a, 21-30 은 D-29 리다이렉트, 21-31 은 D-32 축소 범위, 21-32 는 ①B, 21-33 은 ③A, 21-34 는 ②A 를 쓴다.
- webapp/ · mobile/ 은 한 줄도 바뀌지 않았다(시작 스냅숏과 끝 상태 동일). push 는 하지 않았다(21-36 에서만).

## Self-Check: PASSED
- FOUND: .planning/sketches/008-uat3-surfaces/index.html
- FOUND: .planning/sketches/008-uat3-surfaces/README.md
- FOUND: .planning/sketches/MANIFEST.md (008 행)
- FOUND: .planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md (D-12a~D-32 · WR-03 줄)
- FOUND commit: 5778550
- Task 3 verify: UAT3 DECISIONS OK · acceptance 전부 통과 · webapp/mobile 스냅숏 동일

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
