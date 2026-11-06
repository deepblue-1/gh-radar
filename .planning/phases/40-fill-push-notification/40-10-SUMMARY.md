---
phase: 40-fill-push-notification
plan: 10
subsystem: webapp
status: complete
tags: [webapp, react, capacitor, push, me-settings, sc-1, sc-4]

requires:
  - phase: 40-03
    provides: "@capacitor/push-notifications 8.1.3 앱 빌드 · 웹→네이티브 openSettings"
  - phase: 40-07
    provides: "/api/push-devices GET · PUT · PATCH · DELETE"
  - phase: 40-13
    provides: "iOS AppDelegate 원격 알림 등록 → registration 이벤트"
provides:
  - "webapp/src/lib/push/native-push.ts — isPushPluginAvailable · checkPushPermission · requestPushPermission · registerPushToken · createFillsChannel · addPushTapListener · openAppNotificationSettings · PushPermission · pushErrorText"
  - "webapp/src/lib/push/device-key.ts — PUSH_DEVICE_KEY_STORAGE(gh-radar:push-device-key) · getOrCreatePushDeviceKey · readPushDeviceKey · pushDeviceLabel"
  - "webapp/src/lib/push/push-devices-api.ts — fetchPushDevices · registerThisPushDevice · disablePushDevice · deletePushDevice · unregisterThisDeviceBeforeSignOut · SIGN_OUT_UNREGISTER_TIMEOUT_MS"
  - "webapp/src/lib/push/use-push-devices.ts — usePushDevices · pushDevicesSnapshot · refreshPushDevices · subscribePushDevices · updatePushDevicesLocal · PUSH_DEVICES_STALE_MS"
  - "PushDevicesCard · PUSH_DEVICES_TEXT · formatPushLastSeen — /me 설정 탭 「이 기기」 카드 아래"
  - "auth-context signOut 이 supabase signOut 전에 이 기기 푸시 행 DELETE(3초 상한)"
affects: [40-11, 40-12]

actuals:
  tokens: 20600
  tasks: 3
  commits: 5
plan_head_before: 857a2fdbba376dd7d2fdabd34b001e00d3c88bf8
plan_head_after: 66df152a2931d4aa94eaf2805c893b6c47b662c6

tech-stack:
  added: []
  patterns:
    - "Capacitor 플러그인 이벤트는 주입된 window.Capacitor.addListener(plugin, event, cb) → {remove} — 리스너 먼저 붙이고 register()"
    - "모듈 저장소 + useSyncExternalStore(서버 스냅숏 = 빈 목록) — 로컬 반영 때 세대를 올려 그 전에 시작한 읽기 응답을 버린다"

key-files:
  created:
    - webapp/src/lib/push/native-push.ts
    - webapp/src/lib/push/device-key.ts
    - webapp/src/lib/push/push-devices-api.ts
    - webapp/src/lib/push/use-push-devices.ts
    - webapp/src/lib/push/__tests__/native-push.test.ts
    - webapp/src/lib/push/__tests__/device-key.test.ts
    - webapp/src/components/me/push-devices-card.tsx
    - webapp/src/components/me/__tests__/push-devices-card.test.tsx
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-10-task2-red.json
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-10-task3-red.json
  modified:
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/lib/auth-context.tsx

key-decisions:
  - "권한 확인은 스위치를 켤 때마다 새로 한다(설정 앱에서 바꿨을 수 있다) · 마운트 때 이미 denied 면 거부 안내를 미리 띄우고, 설정 앱에서 돌아오면(visibilitychange) 다시 확인해 걷는다"
  - "「설정 열기」 는 눌러서 postNative 가 false(채널 없음)일 때 숨긴다 — 보내기 전에는 채널 유무를 알 수 없다"
  - "Android 채널 만들기 실패(API 24·25 는 채널 없음 → 플러그인 unavailable)는 등록을 막지 않고 warn 한 줄"
  - "끄기 · 지우기의 404 는 「이미 없는 행」 으로 보고 목록에서 뺀다(실패 안내 없음)"
  - "목록 읽기 실패는 빈 목록으로 감추지 않는다 — 한 번도 못 읽었으면 「기기 목록을 읽지 못했어요.」"
  - "마지막 확인 시각은 hour12:false 대신 hourCycle h23 — 일부 ICU 의 자정 「24」 표기를 막는다"
  - "기기 키 메모리 사본은 localStorage 저장이 실패한 탭에서만 둔다(저장값을 가리지 않게)"

patterns-established:
  - "웹 푸시 래퍼는 lib/push 한 곳 — 40-11(탭 착지 · 토스트 숨김 · 시작 갱신)이 같은 함수 · 같은 저장소를 쓴다"

requirements-completed: [SC-1, SC-4]

coverage:
  - id: D1
    description: "앱 안 「이 기기 체결 알림」 스위치 켜기 — 권한(prompt 면 요청) → (Android) 채널 fills → registration 리스너 먼저 · register → 토큰 → PUT → 켜짐 (D-12 · D-14)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/push-devices-card.test.tsx#권한 prompt → request granted → (android) 채널 → registration 리스너가 register 보다 먼저 → PUT → 켜짐"
        status: pass
      - kind: unit
        ref: "webapp/src/components/me/__tests__/push-devices-card.test.tsx#iOS 는 채널을 만들지 않는다 · 이미 granted 면 다시 묻지 않는다"
        status: pass
    human_judgment: true
    rationale: "실기기 권한 프롬프트 · 실제 APNs/FCM 토큰 · 푸시 수신은 40-12 UAT 에서만 확인된다"
  - id: D2
    description: "권한 거부 → 꺼짐 · 거부 안내 · 「설정 열기」(못 보내면 숨김) · 옛 앱 → 스위치 막힘 + 업데이트 안내 (D-14 · Pitfall 11)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/push-devices-card.test.tsx#권한 request 결과 denied → 꺼짐 · 거부 안내 · 「설정 열기」 → openSettings 송신"
        status: pass
      - kind: unit
        ref: "webapp/src/components/me/__tests__/push-devices-card.test.tsx#옛 앱(플러그인 없음) → 스위치 disabled · 「앱을 업데이트하면 켤 수 있어요」 · 플러그인 호출 0"
        status: pass
    human_judgment: true
    rationale: "설정 앱이 실제로 열리는지 · 옛 앱 빌드에서의 모습은 실기기(40-12)에서만 확인된다"
  - id: D3
    description: "PC 기기 목록(기기명 · 플랫폼 · 마지막 확인 KST MM/DD HH:mm) · 끄기 PATCH · 지우기 두 번 확인 · 빈 목록 · 앱 안 다른 기기 목록 (D-13)"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/push-devices-card.test.tsx#PushDevicesCard — PC 기기 목록 · 끄기 · 지우기 (D-13)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/me-client.test.tsx (34 회귀 없음)"
        status: pass
    human_judgment: true
    rationale: "카드 시각(간격 · 줄바꿈 · 색 대비)은 UI-SPEC 없이 기존 카드 꼴만 따랐다 — 40-12 UAT 시각 확인"
  - id: D4
    description: "로그아웃 때 supabase signOut 전에 이 기기 행 DELETE — 3초 상한 · throw 없음 · 404 정상 · 로그에 키 · 토큰 없음 (D-15)"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "webapp/src/lib/push/__tests__/native-push.test.ts#unregisterThisDeviceBeforeSignOut (D-15)"
        status: pass
      - kind: other
        ref: "awk '/const signOut = async/,/};/' webapp/src/lib/auth-context.tsx → unregister 5행 · auth.signOut 6행"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-07
---

# Phase 40 Plan 10: 웹 「알림 받는 기기」 카드 · 앱 권한/등록 흐름 · 로그아웃 정리 Summary

**Capacitor npm 패키지 없이 주입된 `window.Capacitor` 로 푸시 플러그인을 부르는 `lib/push` 4파일과, /me 설정 탭 「알림 받는 기기」 카드(앱 = 이 기기 스위치 + 다른 기기 목록 · PC = 목록 · 끄기 · 지우기)를 넣고, 로그아웃이 이 기기 푸시 행을 3초 안에서 먼저 지우게 했다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-11-06T23:47:36Z
- **Completed:** 2026-11-06T23:57:16Z
- **Tasks:** 3
- **Files:** 신규 10 · 수정 2

## Accomplishments

- **켜기 한 길(D-12 · D-14):** 스위치 켜기 → `checkPermissions`(prompt 면 `requestPermissions`) → granted 면 Android `createChannel {id:'fills', name:'체결 알림', importance:4, visibility:1}`(sound 키 없음 = 기본 소리 D-17) → `registration` · `registrationError` 리스너를 먼저 붙이고 `register()` → 토큰 → `PUT /api/push-devices/:deviceKey {platform, token, label}` → 켜짐. 10초 안에 토큰이 안 오면 실패 안내. 끝나면 리스너 2개를 뗀다.
- **거부 · 옛 앱:** denied(클릭 때 또는 마운트 때) → 꺼짐 + 「설정 앱에서 GH Trade 알림을 허용해 주세요」 + 「설정 열기」(못 보내면 숨김). 설정 앱에서 돌아오면 다시 확인해 안내를 걷는다. 플러그인이 없는 옛 빌드는 스위치를 막고 「앱을 업데이트하면 켤 수 있어요」.
- **목록(D-13):** 기기명 · iOS/Android · 「마지막 확인 11/06 09:00」(KST) · 켜짐/꺼짐 · 켜진 기기 「끄기」(PATCH) · 「지우기」(첫 클릭 「한 번 더 누르면 지워요」 · 5초 뒤 원래대로 · 두 번째 DELETE). 앱 안에서는 이 기기 행을 빼고 스위치가 대표한다. 끄기는 PATCH 만(네이티브 등록 해제 없음).
- **저장소:** 모듈 저장소 한 벌(40-11 이 같이 읽는다) · 진행 중 읽기 공유 · 로컬 반영 때 세대를 올려 옛 응답이 끄기 결과를 덮지 않게 · 60초 낡음 기준 · 서버 스냅숏은 빈 목록(하이드레이션).
- **로그아웃(D-15):** `signOut` 첫 줄이 `await unregisterThisDeviceBeforeSignOut()` — 앱 · 기기 키 있을 때만 DELETE · 3초 넘으면 포기 · throw 없음 · 404 정상 · warn 에 키 · 토큰 없음.
- **배치:** me-client 설정 탭 `<DeviceSettingsCard />` 바로 아래 `<PushDevicesCard />` + 주석.

## Task Commits

1. **Task 1 (tracer): 앱 안 스위치 켜기 한 길** — `982e7106` (feat) · tracer 게이트: 자동 모드 아님 · `end-of-phase` + 자동 verify → 커밋 전 verify(카드 테스트 4/4 · typecheck) 재실행 통과 → 확장 진행
2. **Task 2 (TDD): 목록 · 끄기 · 지우기 · 거부 · 옛 앱 · 배치**
   - RED `f27a4492` (test)
   - GREEN `c3dd77fb` (feat)
3. **Task 3 (TDD): 로그아웃 정리 · 래퍼/기기명 단위 테스트**
   - RED `d1f7e4bf` (test)
   - GREEN `66df152a` (feat)

## TDD Gate Compliance

- **Task 2 RED** `f27a4492` — `pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/push-devices-card.test.tsx --maxWorkers=2 --reporter=tap-flat -t "PC: 웹 캡션"` · exit 1 · 대상 `PC: 웹 캡션 · 기기명 · …` 가 `expected [] to have a length of 2 but got +0` 로 실패 · 분류기 `RED_EVIDENCE_OK`(`target_test_failed`). 증거 `tdd-evidence/40-10-task2-red.json`.
  - semanticAssessment: 대상 테스트가 실제로 실행돼 계획한 단언(기기 줄 2개)에서 0 으로 실패 — 카드가 아직 PC 목록을 그리지 않는 것이 원인. `use-push-devices.ts` 는 인터페이스 스텁(빈 값)이라 import 오류 없음. 파일 전체 실행(17 중 13 실패 · 통과 4 = Task 1 켜기 경로)은 testing-library DOM 덤프가 TAP YAML 을 깨서 분류기가 `invalid_record` 로 읽지 못했다 → 대상만 `-t` 로 다시 돌린 기록을 남겼다(기록 `note` 칸).
- **Task 2 GREEN** `c3dd77fb` — 카드 17/17 · me-client 34/34.
- **Task 3 RED** `d1f7e4bf` — `pnpm --filter @gh-radar/webapp exec vitest run src/lib/push --maxWorkers=2 --reporter=tap-flat` · exit 1 · 대상 `앱 · 기기 키 있음 → DELETE /api/push-devices/:key` 가 `expected "spy" to be called 1 times, but got 0 times` 로 실패 · `RED_EVIDENCE_OK`. 증거 `tdd-evidence/40-10-task3-red.json`.
  - semanticAssessment: unregister 가 빈 스텁이라 서버를 부르지 않는 것이 원인 — 계획한 동작 그 자체. 통과 15건은 Task 1 이 이미 구현한 래퍼 · 기기명 · 기기 키 규칙을 잠그는 케이스와 「호출 0」 케이스(스텁이 우연히 만족)다 — 새 동작이 아니라 RED 대상이 아니다.
- **Task 3 GREEN** `66df152a` — lib/push 18/18.
- **REFACTOR** — 없음.

## 검증

- 플랜 verification: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && vitest run src/lib/push src/components/me src/components/trading/__tests__/me-client.test.tsx src/lib/native --maxWorkers=2` → 14 파일 267 테스트 통과 · typecheck 0 오류.
- Task 3 verify(`src/lib/push src/components/me src/components/layout`) → 11 파일 265 통과.
- 수용 기준: `@capacitor/` in webapp/package.json 0 · `export const PUSH_DEVICES_TEXT` 1 · 테스트 `register` 17 · `<PushDevicesCard />` 1 · `openAppNotificationSettings` 2 · `updateNeeded` 2 · 색 리터럴 0 · auth-context `unregisterThisDeviceBeforeSignOut` 2 · signOut 안 unregister(5행) < auth.signOut(6행) · `console.(warn|error)(…token` 0.
- 전체 webapp 회귀는 돌리지 않았다(병렬 실행 규칙 — 머지 뒤 오케스트레이터 몫).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 카드 문구에 3개 추가 — `actionFailed` · `loadFailed` · `unknownDevice`**
- **Found during:** Task 2
- **Issue:** 계획 표의 `failed` 는 「켜지 못했어요」 라 끄기 · 지우기 실패에 쓰면 틀린 말이 되고, 목록 읽기 실패를 빈 목록(「등록된 기기가 없어요」)으로 보이면 거짓 안내가 된다. 서버 label 이 빈 문자열인 행도 이름이 비었다.
- **Fix:** 「처리하지 못했어요. 잠시 뒤 다시 해 주세요.」 · 「기기 목록을 읽지 못했어요.」 · 「알 수 없는 기기」 를 같은 상수에 더했다(계획 키는 그대로).
- **Files modified:** webapp/src/components/me/push-devices-card.tsx
- **Commit:** `c3dd77fb`

**2. [Rule 1 - 버그] 진행 중 읽기 공유가 끄기 결과를 덮는 경합**
- **Found during:** Task 2
- **Issue:** 「진행 중 공유」 만 하면 끄기 직후 `refreshPushDevices()` 가 끄기 전에 시작한 요청(켜짐 목록)을 돌려받아 스위치가 되돌아간다.
- **Fix:** `updatePushDevicesLocal` 이 세대를 올리고, 다른 세대의 응답은 버리며, 세대가 바뀐 뒤 refresh 는 새 요청을 시작한다.
- **Files modified:** webapp/src/lib/push/use-push-devices.ts
- **Commit:** `c3dd77fb`

**3. [Rule 1 - 버그] 마지막 확인 시각 자정 「24」 표기**
- **Found during:** Task 2
- **Issue:** 계획의 `hour12: false` 는 일부 ICU 에서 00시를 「24」 로 낸다.
- **Fix:** `hourCycle: 'h23'` + `formatToParts` 로 「MM/DD HH:mm」 을 조립(테스트로 09:00 · 23:05 잠금).
- **Commit:** `c3dd77fb`

**4. [Rule 1 - 버그] 기기 키 메모리 사본이 저장값을 가릴 수 있음**
- **Found during:** Task 3
- **Issue:** Task 1 구현은 새 키를 만들 때마다 메모리에도 두어, 저장이 되는 탭에서도 저장값이 지워진 뒤 옛 키를 돌려줄 수 있었다.
- **Fix:** 메모리 사본은 localStorage 저장이 실패한 때만 둔다.
- **Files modified:** webapp/src/lib/push/device-key.ts
- **Commit:** `66df152a`

**5. [Rule 2 - 견고성] Android 7(API 24·25) 채널 만들기 거부가 켜기를 막지 않게**
- **Found during:** Task 1
- **Issue:** minSdk 24 인데 플러그인 `createChannel` 은 API 26 미만에서 unavailable 로 거부한다 — 그대로 두면 그 기기는 영영 켤 수 없다.
- **Fix:** `createFillsChannel` 이 거부를 warn 한 줄로 남기고 false 를 돌려준 뒤 등록을 이어 간다.
- **Commit:** `982e7106`

### 계획보다 넓힌 부분

- 마운트 때 이미 denied 면 거부 안내를 미리 띄우고, 설정 앱에서 돌아오면(visibilitychange) 권한을 다시 봐서 안내를 걷는다.
- 끄기 · 지우기 404 는 실패가 아니라 「이미 없는 행」 으로 보고 목록에서 뺀다.
- `pushDeviceLabel` 은 iPad 를 「iPad · iOS …」 로, 모델이 없는 Android UA 를 「Android 15」 로 쓴다(계획은 iPhone/iPad 를 한 낱말로 적었으나 실제 기기 낱말이 더 알아보기 쉽다).
- Task 1 테스트의 가짜 서버를 Task 2 에서 보정했다 — 켜기 뒤 목록 다시 읽기가 켜진 행을 돌려주게(실서버 동작과 같게). 보정 전에는 다시 읽기가 빈 목록을 돌려줘 스위치가 꺼짐으로 돌아갔다.

**Total deviations:** 5 auto-fixed (Rule 1 ×3 · Rule 2 ×2). **Impact:** 계획 계약(함수 이름 · 문구 키 · 흐름 순서)은 그대로이고, 잘못된 안내 · 경합 · 표기 결함을 막는 쪽으로만 넓혔다.

## Issues Encountered

- me-client 테스트는 `authFetch` 를 목으로 바꾸지 않아 새 카드의 목록 읽기가 「Supabase URL 없음」 으로 실패하고 warn 을 3줄 남긴다(테스트는 34/34 통과 · 카드는 실패를 삼키지 않고 「기기 목록을 읽지 못했어요.」 를 보인다). me-client 테스트 파일은 이 플랜 범위 밖이라 그대로 두었다.

## Known Stubs

없음(두 RED 커밋의 인터페이스 스텁은 각 GREEN 커밋에서 구현으로 바뀌었다).

## User Setup Required

없음 — 실기기 확인(권한 프롬프트 · 토큰 · 설정 열기 · 카드 시각)은 40-12 UAT.

## Next Phase Readiness

- 40-11 은 `addPushTapListener` · `isPushPluginAvailable` · `checkPushPermission` · `registerPushToken` · `registerThisPushDevice` · `readPushDeviceKey` · `pushDevicesSnapshot` · `refreshPushDevices` · `subscribePushDevices` 를 그대로 쓰면 된다.
- 웹이 먼저 배포돼도 옛 앱은 「앱을 업데이트하면 켤 수 있어요」 로 막혀 깨지지 않는다.

## Self-Check: PASSED

- FOUND: native-push.ts · device-key.ts · push-devices-api.ts · use-push-devices.ts · native-push.test.ts · device-key.test.ts · push-devices-card.tsx · push-devices-card.test.tsx · tdd-evidence/40-10-task2-red.json · tdd-evidence/40-10-task3-red.json
- FOUND: 982e7106 · f27a4492 · c3dd77fb · d1f7e4bf · 66df152a (HEAD 조상)
