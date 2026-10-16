---
phase: 32-account-axis
plan: 07
subsystem: relay
tags: [relay, websocket, zod, hub-cache, user-settings, server-axis, vitest]

requires:
  - phase: 32-account-axis
    provides: "32-06 — relay/hub 다세션 패턴(소유 키 FIFO · forAccount 소유 세션 · 거부 프레임 소켓 유지 규율)"
  - phase: 31
    provides: "D-14 보정 — 구 탭 user.settings.set 후매수 최소 84 캐시 되싣기 · USER_SETTINGS_FLOOR_UNKNOWN_TEXT"
  - phase: 29
    provides: "29-20 소유 키 ownerKey(userId, serverKey) · 29-35 primary 선호 서버 · 29-51 VI 원천 KB 세션 각각"
provides:
  - "shared 계약 RelayUserSettingsSetMsg.serverKey? (부재 = primary) · RelayUserSettingsMsg.serverKey? (새 relay 는 늘 실음)"
  - "relay zod RelayUserSettingsSetSchema 최상위 serverKey: z.string().min(1).max(16).optional()"
  - "fanout 42 지정 서버 라우팅 — users.get(userId).sessions.get(serverKey) · 없음/미준비 = USER_SETTINGS_SERVER_GONE_TEXT 거부(소켓 유지 · 0바이트 · primary 폴백 없음)"
  - "금액 되싣기 = getUserSettings(userId, session.serverKey) — 그 서버 84 만"
  - "hub #userSettings 키 = 소유 키 · 84 모든 세션에서 받음(76/78 · 77 primary 게이트 유지) · 값에 serverKey"
  - "hub 43 Ready 된 세션마다 · 세션 교체/분리는 그 소유 키 84 만 폐기 · primary 변경은 84 를 지우지 않고 43 재요청 없음"
  - "hub getUserSettings(userId, serverKey) · getUserSettingsAll(userId)(결선 순 · primary 마지막) → fanout 인증 replay 서버마다 1프레임"
affects: [32-08, 32-09, 32-10]

actuals:
  tokens: 20500
  tasks: 2
  commits: 3
plan_head_before: 2675b6a75c7e652312110c753928e5251049b921
plan_head_after: d4046ece7b947f01b260d9e97e63180642836d19

tech-stack:
  added: []
  patterns:
    - "사용자 단위였던 캐시를 서버 축으로 올릴 때: 캐시 키를 소유 키로 · 값에 serverKey 를 실어 팬아웃 · 세션 수명(#clearCaches)이 그 소유 키를 늘 지우고 primary 수명(#clearPrimaryCaches)에서는 뺀다"
    - "지정 서버 명령은 사용자 세션 맵(users.get(userId).sessions.get(serverKey))으로 찾고, 없거나 미준비면 primary 로 떨어뜨리지 않고 전용 거부 문구 1건(소켓 유지)"
    - "구 클라이언트 관용 replay 순서 — 여러 프레임 중 구 클라가 쓰는 「마지막 프레임」 자리에 primary 값을 둔다"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/fanout.test.ts
    - relay/tests/fanout-multi-session.test.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/ws-autosell.test.ts

key-decisions:
  - "지정 서버 세션이 있어도 Ready 가 아니면 #readySession 의 상태 프레임이 아니라 USER_SETTINGS_SERVER_GONE_TEXT 거부 프레임(kind user.settings.set)으로 답한다 — must_haves 「없거나 Ready 가 아니면 … 거부 프레임 USER_SETTINGS_SERVER_GONE_TEXT」 문자 그대로. 웹 비행 잠금이 kind 로 풀린다. serverKey 부재(구 탭)는 종전대로 #readySession"
  - "USER_SETTINGS_SERVER_GONE_TEXT 는 protocol.ts 의 USER_SETTINGS_FLOOR_UNKNOWN_TEXT 옆에 정의하고 fanout 이 import 한다(플랜 「기존 상수 옆에」 · fanout grep 2줄 = import + 사용)"
  - "#afterPrimaryChange 의 「새 primary 로 43」 은 지웠다(무해하게 남기는 대신) — 43 은 각 세션 자기 Ready 에서 보내고 84 캐시는 primary 변경으로 지워지지 않는다. 결선 전에 이미 Ready 였던 세션이 hub Ready 프리페치를 못 받는 기존 공백(24 · 25 와 같음)은 그대로다"
  - "#requestPrimarySnapshot 은 #requestUserSettings 로 이름을 바꿨다(43 만 보내고 이제 primary 전용이 아니다)"
  - "getUserSettingsAll 의 「결선 순」 = hub #sessions 삽입 순 · primary = #primaryOwner(선호 서버 → 첫 KB → 첫 세션)"

patterns-established:
  - "hub 캐시 서버 축 승격 체크리스트(RESEARCH Pattern 4 9곳) — 선언 · 머리 표 · 수신 갈래 게이트 · on 핸들러 · 요청 · primary 변경 · primary 폐기 · 세션 폐기 · getter/replay"

requirements-completed: [AXIS-05]

coverage:
  - id: D1
    description: "(트레이서) user.settings.set{serverKey} → zod → fanout 42 그 세션 → 84 → hub 소유 키 캐시 → user.settings{serverKey} 끝에서 끝까지 · 없는 serverKey 거부(문구 = 상수 · 소켓 열림) · 부재 = primary 42"
    requirement: AXIS-05
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#P32 user.settings 서버 축 트레이서 (D-14a)"
        status: pass
    human_judgment: false
  - id: D2
    description: "다세션 42 라우팅 — serverKey KYOBO119 는 교보 스텁으로만 · 부재는 KB(primary)로만 · 지정 서버 미준비는 거부 프레임 · 두 스텁 0바이트 · primary 폴백 없음"
    requirement: AXIS-05
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#P32 42 지정 서버 · replay (D-14a)"
        status: pass
    human_judgment: false
  - id: D3
    description: "구 탭 되싣기(후매수 최소 부재)는 그 서버 84 금액만 — 교보 지정이면 교보 500(KB 300 아님) · 그 서버 84 없으면 FLOOR_UNKNOWN 거부(다른 서버 값으로 안 채움)"
    requirement: AXIS-05
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#P32 42 지정 서버 · replay (D-14a)"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-autosell.test.ts#P31 user.settings.set 후매수 최소 (D-13 · D-14 보정) > P32 구 탭 11값 + serverKey"
        status: pass
    human_judgment: false
  - id: D4
    description: "인증 replay — 서버마다 user.settings 1프레임 · primary(KB120) 것이 마지막(RESEARCH A3)"
    requirement: AXIS-05
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#인증 replay — 서버마다 user.settings 1프레임 · primary(KB120) 것이 마지막"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#P32 84 서버별 (D-14a) > getUserSettingsAll"
        status: pass
    human_judgment: false
  - id: D5
    description: "hub 84 수명 — 두 세션 84 각자 캐시 · 43 Ready 세션마다 · 분리/교체는 그 소유 키만 · 브라우저 지움 프레임 없음(Pitfall 13) · primary 변경이 84 를 지우지 않고 43 재요청 0 · 76/78 · 77 은 여전히 primary 전용(Pitfall 11)"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#SubscriptionHub — D-18 다중 세션 병합 규칙 (29-20) > P32 84 서버별 (D-14a)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#SubscriptionHub — primary 선호 서버 (29-35) > 기본 서버가 바뀌면 …"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#Phase 27 사용자 설정 84"
        status: pass
    human_judgment: false
  - id: D6
    description: "zod — serverKey 부재 통과(키 안 만듦) · 「KB」 · 「KYOBO119」 · 16자 통과 · \"\" · 17자 · 숫자 · null 실패(4400)"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#P32 user.settings.set serverKey (D-14a)"
        status: pass
    human_judgment: false
  - id: D7
    description: "shared 필드가 optional 이라 webapp 무변경 컴파일 · 구 탭 · 구 relay 호환"
    requirement: AXIS-05
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck (error TS 0)"
        status: pass
    human_judgment: false
  - id: D8
    description: "라이브 relay(32-10 · 20:00 KST 뒤 배포)에서 실제 KB · 교보 서버 84 · 42 왕복과 relay 배포 ~ push 사이 구 /me 가 primary 값을 보는지"
    verification: []
    human_judgment: true
    rationale: "실서버 user_settings.toml 저장 · 서버별 84 브로드캐스트와 배포 창 동작은 가짜 게이트웨이로 재현할 수 없다 — 32-10 배포 뒤 확인 몫"

duration: 15min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 07: 매매설정 서버 축 relay · 계약(84 · 42) Summary

**relay 가 매매설정(84)을 서버마다 소유 키로 캐시하고, `user.settings.set{serverKey}` 를 그 서버 세션으로만 보내며(없거나 미준비면 primary 폴백 없이 거부), 인증 replay 를 서버마다 1프레임 · primary 마지막으로 낸다.**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-10-16T06:40Z
- **Completed:** 2026-10-16T06:55Z
- **Tasks:** 2 (tracer 1 · tdd 1)
- **Files modified:** 10

## Accomplishments

- **트레이서(Task 1):** 브라우저 `{ t: "user.settings.set", serverKey, s }` → zod(1~16자 optional) → fanout 42 가 `users.get(userId).sessions.get(serverKey)` 세션으로 → 그 세션 84 → hub `#userSettings[ownerKey]` 에 `{ ...settings, serverKey }` → `user.settings{serverKey}` 팬아웃. relay 통합 테스트로 끝에서 끝까지 확인.
- **거부(prohibition):** 지정한 serverKey 의 세션이 없거나 Ready 가 아니면 primary 로 떨어뜨리지 않는다. 새 상수 `USER_SETTINGS_SERVER_GONE_TEXT = "고른 서버 세션이 없어 저장하지 않았어요 — 계좌를 다시 골라 주세요"` 로 거부 프레임 1건만 보내고, 소켓은 유지하며 게이트웨이로는 0바이트다.
- **되싣기:** 구 탭(후매수 최소 부재)의 금액은 **그 서버** 84 에서만 채운다. 그 서버 84 가 없으면 다른 서버 값으로 채우지 않고 기존 `USER_SETTINGS_FLOOR_UNKNOWN_TEXT` 로 거부한다.
- **hub 84 수명(Task 2):** 43 은 Ready 된 세션마다 보낸다. 세션 교체 · 분리는 그 소유 키의 84 만 지우고 브라우저에는 지움 프레임을 보내지 않는다(Pitfall 13). primary 변경은 84 를 지우지 않고 43 도 다시 보내지 않는다. 76/78 · 77 은 `#fromPrimary` 게이트를 그대로 둔다(Pitfall 11).
- **replay:** `getUserSettingsAll(userId)` 가 결선 순으로 모으되 primary 것을 맨 뒤에 둔다. 그래서 relay 배포 ~ push 사이 구 webapp /me 는 primary 값을 본다(RESEARCH A3).

## Task Commits

1. **Task 1 (tracer): 설정 저장 한 경로 서버 축** — `4330fbcb` (feat)
2. **Task 2 RED: 84 서버 축 완성 테스트** — `353aa00f` (test)
3. **Task 2 GREEN: 43 세션마다 · 소유 키 폐기 · 서버별 replay** — `d4046ece` (feat)

REFACTOR 커밋은 없다(정리할 것이 없었다).

## TDD Gate Compliance (Task 2)

- **RED** (`353aa00f`): 6개 파일 중 16건이 실패했다. hub 쪽(43 세션마다 · 분리 · 교체 · primary 변경 43 재요청 · 프리페치 기대 · getUserSettingsAll 없음 TypeError)과 fanout-multi-session 쪽(「두 세션 43」 대기 미충족)이다. 문법 · 임포트 · 픽스처 오류는 0이다. 분류기는 vitest junit 보고서(`--outputFile`)로 돌렸고 결과는 **RED_EVIDENCE_OK**(target 「P32 84 서버별 > Ready 마다 43 — 두 세션 모두 GetUserSettingsReq 1건」 · 63 tests · fail 1 · format junit)다. **의미 판정:** target 은 `expected [] to have a length of 1 but got +0` 로 실패했다. Task 1 hub 가 43 을 아직 primary 에만 보내던, 계획한 결손이다. 42 라우팅 · zod · 서버별 되싣기 케이스는 Task 1 구현으로 이미 통과한다(의도된 회귀 잠금).
- **GREEN** (`d4046ece`): 6개 파일 408/408 통과 · relay typecheck · typecheck:tests 의 error TS 0.

## Files Created/Modified

- `packages/shared/src/relay.ts` — `serverKey?` 두 곳 · 「계좌 축은 없고 서버 축이 있다」 주석
- `relay/src/ws/protocol.ts` — zod `serverKey` · `USER_SETTINGS_SERVER_GONE_TEXT`
- `relay/src/ws/fanout.ts` — 42 지정 서버 라우팅 · 그 서버 되싣기 · 서버별 replay
- `relay/src/hub/subscription-hub.ts` — 84 소유 키 캐시 · 43 세션마다 · 폐기 규칙 · `getUserSettings(userId, serverKey)` · `getUserSettingsAll` · 머리 표
- `relay/tests/*.test.ts` 6개 — 트레이서 · P32 describe 들 · 새 규칙에 맞춘 기대

## Decisions Made

frontmatter `key-decisions` 참고. 요점은 세 가지다.
1. 지정 서버가 미준비일 때도 상태 프레임이 아니라 GONE 거부 프레임으로 답한다(must_haves 문자 그대로).
2. 상수는 protocol.ts 의 기존 상수 옆에 둔다.
3. `#afterPrimaryChange` 의 43 은 지웠다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 수락 기준 grep 이 주석 단어에 걸림**
- **Found during:** Task 2 수락 기준 확인
- **Issue:** `grep "case MSG.UserSettingsResp" -A 4 | grep -c fromPrimary` 가 1을 냈다. 호출은 없었고, 84 갈래 주석에 쓴 「`#fromPrimary` 해제」 단어가 걸렸다.
- **Fix:** 주석을 「primary 게이트 해제」 로 바꿨다(동작 무변경).
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** 그 grep 0 · `this.#fromPrimary(` 3 · 테스트 재통과
- **Committed in:** `d4046ece`

---

**Total deviations:** 1건 자동 수정(Rule 3 1건). **Impact:** 주석 문구만 바뀌었고 범위 확장은 없다.

## Issues Encountered

- Task 1 커밋(`4330fbcb`) 시점에는 hub 의 84 폐기 규칙이 아직 사용자 키 기준이었다. 그래서 세션 교체 · 분리 때 84 가 남는 중간 상태였고, Task 2 GREEN(`d4046ece`)이 닫았다. 커밋은 로컬에만 있고 relay 배포는 32-10 이라 운영 영향은 없다.
- 플랜 검증: `pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2` 결과 57 파일 · 1602 테스트 통과 · webapp typecheck error TS 0. 알려진 범위 밖 실패(trading-workbench.spec P31-3)는 이 플랜이 webapp/E2E 를 건드리지 않아 돌리지 않았다.

## Known Stubs

없음.

## User Setup Required

None - 외부 서비스 설정 없음. relay 배포는 32-10(20:00 KST 뒤 · 메인 세션)이다.

## Next Phase Readiness

- 32-08(웹 `userSettingsByServer` · 서버별 조회 · 상따 폼 시딩 D-14b)이 쓸 계약은 준비됐다. `user.settings.serverKey` 는 늘 실리고, `user.settings.set.serverKey` 를 보내면 그 서버로 간다. 거부 프레임은 `kind: "user.settings.set"` 이고 문구는 `USER_SETTINGS_SERVER_GONE_TEXT` 다.
- 웹 리듀서는 구 relay(serverKey 부재) 84 를 primary 것으로 읽어야 한다(RESEARCH Pattern 5).
- 32-10 배포 순서: relay 를 먼저 배포하고 push 는 그 뒤에 한다. 구 webapp 은 serverKey 를 보내지 않아 primary 로 가고, replay 순서상 primary 값을 본다.

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*
