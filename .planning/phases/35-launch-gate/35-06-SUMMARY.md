---
phase: 35-launch-gate
plan: 06
subsystem: webapp admin
tags: [launch-gate, admin, nextjs, react, tabs, playwright, vitest, rtl, css-tokens]
status: complete

requires:
  - phase: 35-launch-gate
    provides: "35-05 GET /api/admin/launch/orders · /map (requireAdmin · RPC 값 그대로) · 사이드바 Admin › 발사 링크"
  - phase: 35-launch-gate
    provides: "35-03 shared launch.ts — LaunchOrdersResponse · LaunchMapResponse · LAUNCH_ORDER · launchDaysOf · isLaunchAccept/Reject · launchFireBaseOf"
  - phase: 35-launch-gate
    provides: "35-02 launch_orders_for_admin 응답 모양(dates · date · heads · pieces — snake_case · stock_name/stock_code 조인)"
provides:
  - "/admin/launch 페이지(서버 컴포넌트 + Suspense) · LaunchClient(?tab · ?d · ?fire 진실 원본) · Tabs 「주문 내역」"
  - "LaunchOrdersTab(받기 · 상태) · LaunchOrdersView(순수) · LaunchHeadCard — 머리 카드 4장 + 서버 · 시장별 조각 표(16:00 / 09:00:30)"
  - "launch-api.ts fetchLaunchOrders · fetchLaunchMap(shared 타입 그대로 · 진행 중 요청 합침)"
  - "launch-format.ts MINUS · fmtUs · fmtAcceptTime · resultToneOf · sideLabelOf · pieceKeyLabelOf · fireLegLabelOf · brokerMarketLabelOf · orderTabPiecesOf · launchHeadCardOf · launchTabOf · launchFireParamOf"
  - "발사 색 축 토큰 8개 --launch-ok/-ok-bg/-bad/-bad-bg/-gate/-gate-bg/-other/-grid (:root · .dark · hex) — 35-07 지도도 쓴다"
  - "e2e mockLaunchApi(**/api/admin/launch/** 전용) · 주문 내역 픽스처(첨부 16:00 + 10/26 09:00:30 로그 N + 합성 A 다리 · 머리)"
affects: [35-07, 35-08, 35-10, 35-11]

actuals:
  tokens: 22500
  tasks: 2
  commits: 3
plan_head_before: 640b2bdc5a9843a1cd4dbca227beeccced3a301e
plan_head_after: 35663024

tech-stack:
  added: []
  patterns:
    - "어드민 쿼리 진실 원본 — 잘못된 키만 router.replace 로 지우고, 갱신은 언제나 현재 URLSearchParams 를 복제해 다른 키를 보존"
    - "탭 노출 목록(AVAILABLE_TABS) — 파싱은 'orders' | 'map' 을 다 받되, 아직 그리지 않는 탭 값은 잘못된 값으로 정본화(35-08 이 'map' 추가)"
    - "API 클라이언트 진행 중 요청 합침(캐시 아님) — 개발 서버 StrictMode effect 이중 실행이 같은 요청을 두 번 내지 않게"

key-files:
  created:
    - webapp/src/app/admin/launch/page.tsx
    - webapp/src/components/admin/launch-client.tsx
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/lib/launch-api.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
    - webapp/e2e/fixtures/launch.ts
    - webapp/e2e/specs/admin-launch.spec.ts
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts

key-decisions:
  - "35-06: 카드 모델은 머리 우선 · 조각 폴백 — q16 경계는 머리 gate_lo/hi 중 하나라도 있으면 머리, 둘 다 null 이면 shared launchDaysOf 그날 1개. 결과 수는 언제나 탭 조각에서 센다(표와 같은 수)"
  - "35-06: n0930 카드의 오프셋 · 다음 오프셋은 N 머리만 본다(A 다리 머리 무시) · 오프셋 폴백 = N NXT 최소 wire rel · 재전송 = 탭 조각(N + A 두 다리) retry 합"
  - "35-06: fetchLaunchOrders/Map 은 같은 경로 진행 중 요청만 합친다(캐시 없음 · 끝나면 지움) — StrictMode 이중 effect 로 첫 진입 요청이 2건이 되지 않게"
  - "35-06: 탭은 AVAILABLE_TABS(['orders'])에 든 값만 그린다 — ?tab=map 은 35-08 전까지 잘못된 값으로 지운다(빈 패널 방지)"
  - "35-06: 출처 칩은 목업대로 세그먼트별 적재 시각 하나(16:00 예약 → 16:00:01 · 09:00:30 개장차익 → 09:00:31)"

patterns-established:
  - "발사 표 열 계약: 16:00 = wire · 예약 · 조각 · 라운드 · 송신 µs · 결과 · 접수 시각 · 종목 · 구분 · 가격 · 수량/체결 · 계좌 · 사용자 · 주문번호 / 09:00:30 = 키 · idx 와 결과 사이에 발사, 결과 뒤에 재전송, 접수 시각 → 응답 시각"
  - "발사 색 축 토큰 --launch-* 는 결과 알약 · 카드 결과 수에만 쓴다 — --up/--down 은 구분(매수/매도)에만"

requirements-completed: []

coverage:
  - id: D1
    description: "표기 · 카드 모델 — fmtUs(U+2212 · 천 단위) · fmtAcceptTime(8자리 패딩) · fireLegLabelOf · pieceKeyLabelOf · brokerMarketLabelOf · orderTabPiecesOf(거름 · LAUNCH_ORDER 정렬) · launchHeadCardOf q16(머리 우선 · launchDaysOf 폴백 · 전부 접수/101) · n0930(재전송 합 · 고정 · 거부)"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/launch-format.test.ts (29 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "LaunchOrdersView 렌더 — 16:00 카드 4 순서 · 빈 카드 · 학습 줄 · 계좌 마스킹 없음 · 알약 tone/토큰 · 09:00:30 발사/재전송 열 · 두 다리 · 고정 −245µs · 빈 상태 3종 · 세그먼트 콜백"
    requirement: "LAUNCH-06"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx (7 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "발사 색 축 토큰 8개 :root · .dark hex · oklch 0"
    verification:
      - kind: unit
        ref: "webapp/src/styles/__tests__/tds-tokens.test.ts (85 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/admin/launch 실브라우저 — 1280 16:00 카드 4 순서 · 2열 · 18행 · 첫 진입 요청 1건 · 날짜 알약 push 요청 1건 · 09:00:30 전환(다시 받지 않음) · 390 카드 1열 · 표 래퍼만 가로 스크롤 · 페이지 가로 스크롤 0 · 빈 상태 3종(이력 0 · 행 없는 날 → 최신 보기 · 형식 오류 d 제거)"
    requirement: "LAUNCH-06"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin-launch.spec.ts (P35-L1~L6 · 6 passed · --workers=1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "화면이 채택 목업 변형 A 와 같은 느낌인지(밀도 · 색 · 여백) — 실데이터(journal 적재 후)로 어드민이 읽기 쉬운지"
    verification:
      - kind: automated_ui
        ref: "playwright:launch-orders-1280.png · launch-orders-n0930-1280.png · launch-orders-390.png"
        status: pass
    human_judgment: true
    rationale: "시각 품질 · 가독성은 사람 판단. 스크린샷은 다크 테마 · 목 데이터 기준이다."

duration: 약 13분
completed: 2026-10-27
---

# Phase 35 Plan 06: 발사 주문 내역 어드민 화면 Summary

**`/admin/launch` 「주문 내역」 탭을 만들었다. 날짜 알약 · 16:00/09:00:30 세그먼트 · 출처 칩 아래에 머리 카드 4장(LAUNCH_ORDER 순 · 머리 우선 · 조각 폴백)과 서버 · 시장별 조각 표(N · A 두 다리 · 발사 · 재전송 열)가 나온다. 폰 390 에서는 표 래퍼 안에서만 가로 스크롤한다.**

## Performance

- **Duration:** 약 13분 (2026-10-27T12:16Z → 12:29Z)
- **Tasks:** 2/2 (Task 1 트레이서 · Task 2 TDD)
- **Files:** 신규 9 · 수정 2

## Accomplishments

- **페이지 · 쿼리 규칙(D-11 · D-12).** `page.tsx` 는 서버 컴포넌트에서 `Suspense` 로 `LaunchClient` 를 감싼다. 쿼리 규칙은 아래와 같다.
  - `tab`: 기본 orders. 그리지 않는 값(지금은 map 포함)은 `router.replace` 로 지운다.
  - `d`: `parseYmdParam` 을 쓴다. 형식 오류는 replace 로 d 만 지운다. 날짜 이동은 `router.push` 다.
  - `fire`: q16(기본) · n0930. 전환은 `router.replace` 이고 다시 받지 않는다.
  - 갱신은 모두 다른 키를 보존한다. `document.title` 은 「발사 · Admin」 이고, d 가 있으면 「· MM/DD」 를 붙인다.
- **카드 모델(launchHeadCardOf).**
  - q16 오프셋은 Q16 머리 offset_used_us, 없으면 최소 wire rel 이다.
  - q16 경계는 머리 gate_lo/hi, 없으면 `launchDaysOf` 결과로 정한다: 「lo ~ hi」 · 「전부 접수 (첫 접수 hiµs)」 · 「전부 101 (마지막 loµs)」 · 「판단 불가」.
  - q16 학습 줄은 「before → after · 다음 nextµs (step s)」 이고, 머리가 없으면 「—」 다.
  - n0930 은 결과 라벨이 「거부」 다. 오프셋은 N 머리, 없으면 N NXT 최소 wire rel 이다. 재전송은 탭 조각 retry 합이고, 다음 오프셋은 「고정 Xµs」(N 머리 없음 「—」)다.
  - 탭 조각 0 · 머리 0 이면 null 이고, 화면에는 「{브로커 시장} · 이 날 발사 없음」 빈 카드가 나온다.
- **조각 표(D-13).** 16:00 표 열은 12개(예약 · 조각 · 라운드는 한 칸)다. 09:00:30 표는 「키 · idx」 · 발사 · 재전송 열을 더하고, N · A 두 다리가 한 표에 실린다(09:00:27 다리가 먼저).
  - 결과 알약 색: 접수 `--launch-ok`, 101/515 `--launch-bad`, 기타 `--launch-other`.
  - 구분 색: 매수 `--up`, 매도 `--down`.
  - 계좌 · 사용자는 마스킹하지 않는다. null 은 전부 「—」 다.
- **빈 상태 · 오류(D-20).**
  - dates [] 이면 「아직 적재된 발사가 없어요 · 첫 적재는 16:00:01」 을 보여 준다.
  - 행 없는 날은 「이 날은 발사가 없어요」 와 「최신 보기」(d 없는 주소로 push) 버튼을 보여 준다.
  - 오류는 「발사 기록을 불러오지 못했어요」 와 「다시 시도」 를 보여 준다.
  - 로딩 중에는 스켈레톤 카드 4장을 그린다.
- **토큰(D-16).** `--launch-ok` 등 8개를 `:root` · `.dark` 양쪽에 hex(목업 값)로 두었다. 다른 축과 서로 대체하지 말라는 주석을 달았고, `THEME_COLOR_TOKENS` 에 넣었다.

## e2e 픽스처 구성 (`webapp/e2e/fixtures/launch.ts`)

- `mockLaunchApi(page, { ordersEmpty?, orders?, map? })` 는 `page.route('**/api/admin/launch/**')` 하나만 건다. `/orders` · `/map` 외 경로는 404 다. `requests` · `orders()` 로 요청을 기록한다. `mockAdminApi` 는 쓰지 않는다.
- 기본 응답은 shared `launch-pieces-1012-1026.json`(196조각 · dates 11개)을 `LaunchPieceRow` 로 바꾼 것이다(source backfill · 주문 속성 null). 목록 밖 날짜는 빈 heads/pieces 를 돌려준다.
- 10/26 에만 아래 값을 더한다.
  - 합성 KB120 코스닥 Q16 머리: −146 → −151 · step 5 · 다음 −337 · offset −332.
  - 합성 wire 0 주문 속성: 삼성전자 · 1234567801 · e2e-user · 3404000288 · 155959999.
  - 로그 N 10줄(pieces120/119.txt 그대로).
  - 합성 A 두 다리(KB120 코스닥).
  - 합성 N 머리 2개(KB120 Q −245 · KYOBO119 Q −200).
- 머리 주석에 「합성 값 표시 · 실서버 값 아님(가짜 계좌)」 을 적었다.

## 테스트 수

- `launch-format.test.ts` 29건 · `launch-orders-tab.test.tsx` 7건 · `tds-tokens.test.ts` 85건: 합 121 passed.
- `admin-launch.spec.ts` 6건(P35-L1~L6, `--workers=1`): 6 passed. 여기에 auth setup 1건이 함께 돈다.
- webapp typecheck: 기존 frames.ts 외 0건(`relay/tests/helpers/frames.ts:490` · `:1618` 은 알려진 기존 오류다).

## Task Commits

1. **Task 1 (tracer): 16:00 주문 내역 한 경로**: `b8e29bae` (feat). 트레이서 게이트에서 `<verify>`(shared build · typecheck · E2E 1280)를 다시 돌려 통과를 확인한 뒤 Task 2 로 넘어갔다.
2. **Task 2 RED: 표기 · 카드 모델 테스트**: `9116af63` (test)
3. **Task 2 GREEN: 09:00:30 · 폰 · 빈 상태 · 토큰**: `35663024` (feat)

REFACTOR 커밋은 없다(정리할 것이 없었다).

## TDD Gate Compliance

- RED `9116af63` 가 GREEN `35663024` 보다 앞선다.
- RED 증거는 `gsd-tools check tdd-red-evidence` 에서 **RED_EVIDENCE_OK** 가 나왔다(format junit · target_test_failed). 타깃 테스트는 `launchHeadCardOf(n0930) › 10/26 KB 코스닥 — 5조각 · 재전송 2+1+1 = 4 · 「고정 −245µs」 · 「거부」` 다.
  - 처음에는 TAP(`--reporter=tap-flat`)으로 냈는데, vitest 의 여러 줄 diff 메시지가 YAML 들여쓰기 밖으로 나와 `invalid_record`(Malformed TAP) 판정을 받았다. 같은 대상을 JUnit reporter 로 다시 돌린 기록으로 판정받았다.
- 의미 판정: 타깃이 실행됐고, 계획된 `toMatchObject` 단언에서 실패했다(Task 1 모델에 n0930 분기가 없었다). 로드 · 구문 · 픽스처 오류는 없었고, 같은 파일의 21건은 통과했다.
- 증거 기록 파일은 files_modified 밖이라 커밋하지 않았다.

## Decisions Made

- frontmatter key-decisions 5건을 보라. 그중 진행 중 요청 합침과 AVAILABLE_TABS 는 플랜에 적혀 있지 않은 선택이다(아래 편차 1 · 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StrictMode 이중 effect 로 첫 진입 orders 요청이 2건이 됨**
- **Found during:** Task 1
- **Issue:** `next.config` 의 `reactStrictMode: true` 때문에 개발 서버는 effect 를 두 번 돈다. alive 플래그는 응답만 버리고 요청은 2건 나간다. 그래서 must_haves 의 「요청 1건」 이 깨진다.
- **Fix:** `launch-api.ts` 에서 같은 경로의 진행 중 요청만 하나로 합친다. 캐시는 아니다. 끝나거나 실패하면 지우므로 「다시 시도」 는 새 요청이다.
- **Files modified:** webapp/src/lib/launch-api.ts
- **Verification:** E2E P35-L1 에서 `api.orders()` 가 `[{}]` 이고, ‹ 클릭 뒤 d=20261023 은 1건이다.
- **Committed in:** b8e29bae

**2. [Rule 1 - Bug] `?tab=map` 이 35-08 전에는 빈 패널을 그림**
- **Found during:** Task 1
- **Issue:** `launchTabOf` 는 플랜대로 'map' 도 받는다. 그런데 이 플랜에는 map 트리거 · 패널이 없어서, map 값이면 빈 화면이 된다.
- **Fix:** `AVAILABLE_TABS = ['orders']` 를 두고, 밖 값은 잘못된 값처럼 replace 로 지운다. 35-08 은 배열에 'map' 을 더하면 된다.
- **Files modified:** webapp/src/components/admin/launch-client.tsx
- **Committed in:** b8e29bae

**3. [플랜 문구 정정] 「KB 코스닥 표에 09:00:30.046」 → 로그 값 그대로**
- **Found during:** Task 2
- **Issue:** 첨부 로그에서 accept_time 90030046 은 **KB120 코스피**(market=K) wire 0 이다. KB 코스닥 wire 0 은 90030092 다. 플랜은 픽스처에 로그 값을 그대로 쓰라고 했다.
- **Fix:** E2E 는 KB 코스피 표 첫 행에서 「09:00:30.046」 을, KB 코스닥 N wire 0 에서 「09:00:30.092」 를 단언한다. RTL 은 합성 응답이라 「09:00:30.046」 을 그대로 단언한다.
- **Committed in:** 35663024

**4. [순서] 빈 상태 · 오류 · 로딩 렌더를 Task 1 에 먼저 넣음**
- 플랜은 이것들을 Task 2 몫으로 두었다. 그러나 Task 1 의 탭 컴포넌트가 로딩 · 오류 상태 없이는 그릴 수 없어서 같이 썼다. 검증(RTL · E2E 3종)은 Task 2 에서 했다. 커밋 범위는 files_modified 안이다.

---

**Total deviations:** 4 (Rule 1 버그 2 · 플랜 문구 정정 1 · 순서 1)
**Impact on plan:** must_haves 를 그대로 만족시키기 위한 수정이다. 범위는 늘지 않았다.

## 시각 결함 수정

- 없음. 1280 · 390 스크린샷(다크)에서 줄바꿈 · 잘림 · 겹침을 찾지 못했다. 390 에서는 컨트롤 줄이 알약 → 세그먼트 → 출처 칩으로 접혀 내려가고, 표는 래퍼 안에서만 스크롤한다.
- 390 스크린샷 왼쪽 아래의 둥근 「N」 은 Next 개발 도구 배지다. 페이지 UI 가 아니다.

## Issues Encountered

- webapp typecheck 오류 2건은 이 플랜과 무관하다(`relay/tests/helpers/frames.ts:490` · `:1618` — 다른 세션의 relay/src/generated 미커밋 변경). 이 둘을 빼면 0건이다.

## Next Phase Readiness

- 35-07 · 35-08(경계 지도): `--launch-*` 토큰 8개와 `fetchLaunchMap(fire, range)` 가 준비돼 있다. 35-08 이 할 일은 아래와 같다.
  - `launch-client.tsx` 의 `AVAILABLE_TABS` 에 'map' 을 더한다.
  - `TabsTrigger value="map"`「경계 지도」 와 `TabsContent` 를 같은 Tabs 에 더한다.
  - e2e 는 `mockLaunchApi(page, { map })` 로 지도 응답을 준다.
- 배포(webapp)는 push 가 곧 배포다. 메인 세션 몫이다.

## Self-Check: PASSED

- 생성 파일 9개가 모두 디스크에 있다.
- 커밋 b8e29bae · 9116af63 · 35663024 가 모두 HEAD 의 조상이다.
- acceptance:
  - Task 1: page.tsx 에 Suspense · LaunchClient 가 있고 `use client` 가 0건이다. launch-client 에 data-slot admin-launch · title 발사 · 「주문 내역」 이 있다. spec 의 mockAdminApi 는 0건이고 fixture 는 `**/api/admin/launch/**` route 를 건다. E2E L1 은 failed 0 이다.
  - Task 2: `--launch-ok:` 정의가 2줄이고 `--launch-` 줄의 oklch 는 0건이다. vitest 3파일 121 passed, E2E 6 passed 다. RED 가 GREEN 보다 앞서고, 플랜 커밋 11경로가 전부 files_modified 안이다.
