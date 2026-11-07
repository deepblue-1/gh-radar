---
phase: 40-fill-push-notification
plan: 11
subsystem: webapp
status: complete
tags: [webapp, react, capacitor, push, order-log, workbench, toast, sc-1]

requires:
  - phase: 40-10
    provides: "lib/push 래퍼(addPushTapListener · isPushPluginAvailable · checkPushPermission · registerPushToken) · 기기 키 · 기기 목록 저장소 · registerThisPushDevice"
  - phase: 40-02
    provides: "탭 경로 계약 /trading/order-log?stock=<ISIN>&date=<YYYY-MM-DD> · PUSH_ORDER_LOG_PATH"
  - phase: 40-03
    provides: "@capacitor/push-notifications 8.1.3 앱 빌드(pushNotificationActionPerformed 이벤트)"
provides:
  - "webapp/src/lib/push/push-tap.ts — resolvePushTapPath(data, orders, today) · parsePushTapPath(data, today)"
  - "webapp/src/lib/push/push-session.ts — startPushSession({ push, fetchOrders?, now? }) → 정리 함수 · TAP_ORDERS_TIMEOUT_MS(3000) · __resetPushSessionForTest"
  - "webapp/src/lib/push/toast-suppression.ts — orderToastSuppressed(state) · useOrderToastSuppression() · OrderToastSuppressionState"
  - "UseTradingAlertsInput.suppressOrderToasts — 돌파 밖 6종 토스트 · 소리 숨김(onNew 유지)"
  - "NativeBridgeProvider 6번 effect — 앱에서만 마운트 때 startPushSession"
affects: [40-12]

actuals:
  tokens: 14300
  tasks: 3
  commits: 5
plan_head_before: c786d9ff23078028b741866c66c5420b9aca5275
plan_head_after: d713fff761f5cf4ca5765c791123c8e679d098bf

tech-stack:
  added: []
  patterns:
    - "탭 착지 = 순수 함수(검증 · 쿼리 교정 · 계좌 해석) + 얇은 세션(리스너 · 주문 읽기 상한) — 경로 정본 문자열은 주문로그 창과 같은 orderLogQueryString"
    - "D-20 숨김은 판단 훅(모르면 보인다) → useTradingAlerts 입력 한 칸 — emit 에서 병합 판정 전에 갈라 이력 재생 · 숨김 뒤 병합을 구조적으로 막는다"
    - "앱 시작 부수 작업은 모듈 플래그로 페이지 로드당 1회 · 탭 리스너와 독립(실패가 탭을 막지 않는다)"

key-files:
  created:
    - webapp/src/lib/push/push-tap.ts
    - webapp/src/lib/push/push-session.ts
    - webapp/src/lib/push/toast-suppression.ts
    - webapp/src/lib/push/__tests__/push-tap.test.ts
    - webapp/src/lib/push/__tests__/push-session.test.ts
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-11-task2-red.json
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-11-task3-red.json
  modified:
    - webapp/src/lib/native/native-bridge-provider.tsx
    - webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx
    - webapp/src/lib/use-trading-alerts.ts
    - webapp/src/lib/__tests__/use-trading-alerts.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx

key-decisions:
  - "탭 payload 에 account 가 실려 와도 쓰지 않는다 — 계좌는 늘 웹이 오늘 주문(그 종목 · 오늘 tradeDate · updatedAt 최댓값)에서 정한다(D-24)"
  - "오늘 주문은 날짜가 오늘이고 종목이 정해진 탭에서만 읽는다 — 검증 실패 · 다른 날 탭은 GET /api/orders 0"
  - "탭 세션 정리 뒤에도 진행 중이던 탭 처리는 이동한다 — 개발 모드 이중 마운트 사이에 냉시작 탭(retain)이 소비돼도 잃지 않게"
  - "D-20 판단은 「모르면 보인다」 — 권한 미확인 · 목록 읽기 실패 · 다른 기기만 켜짐이면 토스트를 그대로 낸다(알림 공백 없음)"
  - "숨김 판단 훅은 기기 키를 렌더마다 읽고, 화면이 다시 보일 때(visibilitychange) 권한을 다시 본다 — 같은 세션에서 켜기 · 설정 앱 변경을 바로 따라간다"
  - "시작 갱신은 PUT 결과로 저장소를 먼저 고친 뒤(updatePushDevicesLocal) 목록을 다시 읽는다 — 카드 켜기와 같은 순서"

patterns-established:
  - "앱 전용 부수 작업은 NativeBridgeProvider effect 번호 하나 + lib 쪽 start 함수(정리 함수 반환) — Provider 테스트는 start 함수를 목으로 호출 수 · 정리만 잠근다"

requirements-completed: [SC-1]

coverage:
  - id: D1
    description: "알림 탭 → data.path 검증(isSafeInternalPath + /trading/order-log 정확 일치) → 오늘이면 그 종목 최근 주문 계좌를 붙여 router.push · 못 찾음 · 다른 날은 계좌 없이 · 검증 실패는 무동작 (D-21 · D-24)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/lib/push/__tests__/push-tap.test.ts#resolvePushTapPath (14 케이스) · startPushSession — 탭 리스너 (5 케이스)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx#푸시 세션(Phase 40 D-21 · D-24) 15a~15c"
        status: pass
    human_judgment: true
    rationale: "실제 iOS 냉시작 탭(retain) · Android 탭 · 주문로그 화면 착지는 실기기(40-12 UAT)에서만 확인된다"
  - id: D2
    description: "앱 · 플러그인 · 권한 granted · 이 기기 켜짐이면 작업대 주문 토스트 6종과 알림음을 숨긴다 · 돌파 토스트 · 카드 표시는 그대로 · 브라우저 · 토글 꺼진 앱은 종전 그대로 (D-20)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-trading-alerts.test.tsx#useTradingAlerts — D-20 주문 토스트 숨김 (5) · orderToastSuppressed 진리표 (8) · useOrderToastSuppression (4)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/alert-toasts.test.tsx (16) · trading-alerts.test.ts (36) · trading-workbench.test.tsx (155) 회귀 없음"
        status: pass
    human_judgment: true
    rationale: "배너와 토스트가 실제로 겹치지 않는지(앱 포그라운드 체결 시)는 실기기 40-12 UAT 에서만 보인다"
  - id: D3
    description: "앱이 열릴 때 켜진 기기 · 권한 granted 면 register 토큰을 같은 키로 PUT 해 토큰 · 마지막 확인 갱신(세션당 1회 · 권한 묻지 않음 · 실패는 warn 1줄) (D-15 · D-13 · D-14)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/lib/push/__tests__/push-session.test.ts#startPushSession — 시작 갱신 (12)"
        status: pass
      - kind: other
        ref: "grep -c requestPushPermission webapp/src/lib/push/push-session.ts → 0"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-11-07
---

# Phase 40 Plan 11: 웹 탭 착지 · 작업대 토스트 숨김 · 앱 시작 토큰 갱신 Summary

**알림 탭이 `data.path` 를 검증한 뒤 오늘 주문에서 그 종목의 최근 계좌를 찾아 주문로그(`/trading/order-log?account=…&stock=…`)로 열고, 앱에서 이 기기 체결 알림이 켜져 있으면 작업대 주문 토스트 6종과 알림음을 숨기며(돌파 · 카드 표시 유지), 앱이 열릴 때마다 켜진 기기의 토큰 · 마지막 확인을 조용히 다시 등록한다.**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-11-07T00:00Z 무렵
- **Completed:** 2026-11-07T00:12:25Z
- **Tasks:** 3 (tracer 1 · TDD 2)
- **Files:** 신규 7(소스 3 · 테스트 2 · TDD 증거 2) · 수정 5

## Accomplishments

- **탭 착지(D-21 · D-24):** `resolvePushTapPath` — `isSafeInternalPath` + 경로가 정확히 `/trading/order-log` 인지 검사(`//evil` · `/\evil` · `/trading/orders` · `/trading/order-log-x` · 하위 경로 → null) → 주문로그 창과 같은 `parseOrderLogQuery` 로 쿼리 교정 → 날짜가 오늘이고 종목이 있으면 오늘 주문 중 그 ISIN · 오늘 거래일의 updatedAt 최댓값 행 계좌 → `orderLogQueryString` 정본(오늘 날짜 생략). payload 에 계좌가 실려 와도 버린다.
- **탭 세션:** `startPushSession` — 앱 · 플러그인 있음일 때만 `pushNotificationActionPerformed` 리스너 1개. 오늘 주문은 필요한 탭에서만 읽고(실패 · 3초 초과면 빈 목록 → 계좌 없이 연다 · warn 1줄), 검증 실패 탭은 주문도 이동도 0. `NativeBridgeProvider` 6번 effect 가 앱에서만 마운트 때 시작하고 언마운트 때 리스너를 뗀다.
- **토스트 숨김(D-20):** `orderToastSuppressed` = 앱 · 플러그인 · 권한 granted · 이 기기 행 enabled 넷 다. `useOrderToastSuppression` 은 기기 목록 저장소를 구독하고(카드에서 켜고 끄면 즉시) 화면 복귀 때 권한을 다시 본다. 브라우저는 서버 호출 0 · 늘 false. `useTradingAlerts` 의 `emit` 이 병합 판정 전에 돌파 밖 6종을 갈라 `onNew`(카드 표시)만 부르고 alerts · 톤은 건너뛴다 — 숨김 중 통보는 풀린 뒤에도 되살아나지 않고, 뒤 조각과 병합되지도 않는다.
- **시작 갱신(D-15 · D-13):** 리스너를 붙인 뒤 비동기로 — 기기 키 · 플랫폼 → `checkPushPermission`(묻지 않음) granted → 목록(낡았으면 읽기) → 이 기기 행 enabled → `registerPushToken` → `registerThisPushDevice(키, {platform, token, label})` → 저장소 반영 → 목록 다시 읽기. 모듈 플래그로 페이지 로드당 1회. 실패는 warn 1줄(토큰 · 키 없음) · 탭 리스너 유지.

## Task Commits

1. **Task 1 (tracer): 탭 한 길** — `5089b8fd` (feat) · tracer 게이트: 자동 모드 아님 · `end-of-phase` + 자동 verify 만 → 커밋 뒤 verify 재실행(push-tap · provider 42/42 · typecheck 0 오류) 통과 → 확장 진행
2. **Task 2 (TDD): D-20 토스트 숨김**
   - RED `43541d4b` (test)
   - GREEN `470c4750` (feat)
3. **Task 3 (TDD): 앱 시작 토큰 · 마지막 확인 갱신**
   - RED `356bb870` (test)
   - GREEN `d713fff7` (feat)

## TDD Gate Compliance

- **Task 2 RED** `43541d4b` — `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/use-trading-alerts.test.tsx --maxWorkers=2 --reporter=tap-flat -t "넷 다 참"` · exit 1 · 대상 `orderToastSuppressed — 진리표 (D-20) > 넷 다 참(permission granted)일 때만 true` 가 `expected false to be true` 로 실패 · 분류기 `RED_EVIDENCE_OK`(`target_test_failed`). 증거 `tdd-evidence/40-11-task2-red.json`.
  - semanticAssessment: 대상이 실제로 실행돼 계획한 단언(넷 다 참 → true)에서 false 로 실패 — `toast-suppression.ts` 가 인터페이스 스텁(늘 false)인 것이 원인. import · 구문 · 픽스처 오류 없음. 파일 전체로는 숨김 갈래 3건 · 훅 2건도 같은 원인으로 실패(7 실패 / 21 통과). 통과분은 진리표 false 갈래 · 숨김 해제 · 돌파 유지 · 브라우저 false 처럼 스텁이 우연히 만족하거나 종전 동작을 잠그는 케이스. 파일 전체 TAP 는 객체 diff 가 YAML 을 깨므로 대상 하나로 좁혀 기록했고, pnpm 이 stdout 끝에 붙이는 실패 배너는 `consoleOther` 로 따로 보존했다.
- **Task 2 GREEN** `470c4750` — use-trading-alerts 28/28 · trading-alerts 36/36 · alert-toasts 16/16 · trading-workbench 155/155.
- **Task 3 RED** `356bb870` — `pnpm --filter @gh-radar/webapp exec vitest run src/lib/push/__tests__/push-session.test.ts --maxWorkers=2 --reporter=tap-flat -t "두 번 불려도"` · exit 1 · 대상 `같은 세션에서 두 번 불려도(Provider 재마운트) 갱신은 1회 · 탭 리스너는 세션마다` 가 `expected "spy" to be called 1 times, but got 0 times` 로 실패 · `RED_EVIDENCE_OK`. 증거 `tdd-evidence/40-11-task3-red.json`.
  - semanticAssessment: 시작 갱신이 아직 없어(Task 1 은 탭 리스너만) PUT 이 0회 — 계획한 동작 그 자체가 원인. 파일 전체 4 실패 / 8 통과 — 통과분은 「PUT 0 · 권한 묻지 않음」 갈래와 브라우저 무동작(갱신이 없으니 우연히 만족).
- **Task 3 GREEN** `d713fff7` — push-session 12/12 · lib/push + lib/native 132/132.
- **REFACTOR** — 없음.

## 검증

- 플랜 verification: `pnpm --filter @gh-radar/shared build`(시작 때) · `pnpm --filter @gh-radar/webapp run typecheck` 0 오류 · `vitest run src/lib/push src/lib/native src/lib/__tests__/use-trading-alerts.test.tsx src/components/trading/__tests__/alert-toasts.test.tsx src/components/me --maxWorkers=2` → 17 파일 311 테스트 통과.
- 추가 회귀: `trading-alerts.test.ts` 36 · `trading-workbench.test.tsx` 155 통과(작업대 파일을 고쳤으므로).
- 수용 기준: provider `startPushSession` 3 · push-tap `isSafeInternalPath` 3 · 주문로그 피드 · 창 불변 게이트(`git log 743784bb..HEAD -- order-log-feed.ts order-log-window.tsx` 중 `(40-` 0) · use-trading-alerts `suppressOrderToasts` 5 · workbench `useOrderToastSuppression` 2 · `"breakout"` 1 · push-session `requestPushPermission` 0 · `registerThisPushDevice` 2.
- 전체 webapp 회귀는 돌리지 않았다(병렬 실행 규칙 — 머지 뒤 오케스트레이터 몫).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] payload 의 `account` 를 버린다**
- **Found during:** Task 1
- **Issue:** `parseOrderLogQuery` 는 `account` 쿼리도 받아들여, 조작되거나 옛 형식의 payload 에 계좌가 있으면 그대로 실린다 — D-21 「payload 에는 계좌가 없다」 · D-24 「계좌는 웹이 찾아 붙인다」 와 어긋난다.
- **Fix:** 교정 뒤 `account` 를 늘 null 로 두고 오늘 주문 해석 결과만 쓴다(테스트 잠금).
- **Files modified:** webapp/src/lib/push/push-tap.ts
- **Commit:** `5089b8fd`

**2. [Rule 2 - 정확성] 계좌 해석이 오늘 거래일 행만 본다**
- **Found during:** Task 1
- **Issue:** `GET /api/orders` 는 오늘 행만 주지만, 계좌 해석이 tradeDate 를 보지 않으면 다른 날 행이 섞여 들어오는 경우(자정 경계 등) 엉뚱한 계좌를 고를 수 있다.
- **Fix:** `latestAccountOf` 가 `tradeDate === today` · `accountNo` 있음 행만 비교한다. updatedAt 은 `Date.parse` 로 비교(형식 차이 무관 · 해석 불가는 가장 오래된 것으로).
- **Commit:** `5089b8fd`

### 계획보다 넓힌 부분

- `parsePushTapPath` 를 따로 내보내 세션이 검증 실패 · 다른 날 · 종목 없는 탭에서는 `GET /api/orders` 를 부르지 않는다(계획은 탭마다 읽기).
- 탭 세션은 정리 뒤에도 진행 중이던 탭 처리를 이동까지 마친다 — 처음에는 정리 뒤 무시(`active` 가드)로 썼다가, 개발 모드 이중 마운트 사이에 iOS 냉시작 탭(retain)이 첫 리스너에 소비되면 착지를 잃는 길이 생겨 뺐다(커밋 전 수정).
- 숨김 판단 훅은 기기 키를 렌더마다 읽고 `visibilitychange` 로 권한을 다시 본다 — 계획은 「저장소가 바뀌면 다시 계산」 까지였다.
- 시작 갱신은 PUT 결과로 저장소를 먼저 반영(`updatePushDevicesLocal`)한 뒤 다시 읽는다 — 카드 켜기 흐름과 같은 순서.
- `useOrderToastSuppression` 훅 테스트 4건은 계획 파일 목록대로 `use-trading-alerts.test.tsx` 안에 두었다(새 테스트 파일 없음).
- 세션당 1회 플래그 리셋용 `__resetPushSessionForTest` 를 내보냈다(40-10 `__resetPushDevicesForTest` 관례).

**Total deviations:** 2 auto-fixed (Rule 2 ×2). **Impact:** 계획 계약(함수 이름 · 입력 칸 · 흐름 순서)은 그대로이고, 계좌 누설 · 오해석을 막고 불필요한 호출을 줄이는 쪽으로만 넓혔다.

## Issues Encountered

- vitest TAP 리포터 실패 때 pnpm 이 stdout 끝에 `undefined` + 경로 + `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` 배너를 붙여 분류기가 `invalid_record`(Non-TAP data)로 거부했다 — 배너는 리포터 출력이 아니므로 `consoleOther` 로 옮겨 보존하고 TAP 본문만 `output` 에 남겨 다시 기록 → `RED_EVIDENCE_OK`.

## Known Stubs

없음(두 RED 커밋의 인터페이스 스텁 — 늘 false 훅 · 빈 리셋 함수 — 은 각 GREEN 커밋에서 구현으로 바뀌었다).

## User Setup Required

없음 — 실기기 확인(냉시작 · 백그라운드 탭 착지 · 포그라운드 배너와 토스트 겹침 없음 · 앱 재실행 뒤 마지막 확인 갱신)은 40-12 UAT.

## Next Phase Readiness

- 40-12 UAT 항목: ① 앱 종료 상태에서 알림 탭 → 주문로그가 그 종목 · 최근 계좌로 열림 ② 같은 날 두 계좌로 같은 종목 주문 → 나중 계좌 ③ 앱 포그라운드 체결 → 배너만 · 작업대 주문 토스트 없음 · 돌파 토스트는 뜸 ④ 스위치 끈 앱 · PC 브라우저 → 토스트 그대로 ⑤ 앱 재실행 뒤 PC 기기 목록 「마지막 확인」 이 갱신됨.
- 웹이 먼저 배포돼도 옛 앱(플러그인 없음)은 탭 리스너 · 시작 갱신 · 토스트 숨김이 모두 꺼져 종전 그대로다.

## Self-Check: PASSED

- FOUND: push-tap.ts · push-session.ts · toast-suppression.ts · push-tap.test.ts · push-session.test.ts · tdd-evidence/40-11-task2-red.json · tdd-evidence/40-11-task3-red.json
- FOUND: 5089b8fd · 43541d4b · 470c4750 · 356bb870 · d713fff7 (HEAD 조상)
