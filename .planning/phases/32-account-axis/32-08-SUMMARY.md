---
phase: 32-account-axis
plan: 08
subsystem: webapp
tags: [webapp, relay-socket, user-settings, server-axis, limit-chaser, me, vitest, playwright]

requires:
  - phase: 32-account-axis
    provides: "32-07 — relay 84 서버 축(user.settings{serverKey} 서버마다 1프레임 · primary 마지막 replay) · user.settings.set{serverKey} 지정 서버 42 · 부재 = primary"
  - phase: 32-account-axis
    provides: "32-01~03 — /me 계좌 칩(choices · meAccountNo · MeAccountChoice.serverKey)"
  - phase: 27
    provides: "/me 상따 기본설정 섹션 · 42 저장 기계 · 새 폼 84 시딩(seedFromUserSettings)"
provides:
  - "webapp 상태 userSettingsByServer: ReadonlyMap<string, RelayUserSettingsMsg>(키 frame.serverKey ?? \"\" · reset 이 비움) — 단일 userSettings 필드 삭제"
  - "webapp/src/lib/user-settings-server.ts — userSettingsForServer(/me · 구 relay 첫 서버 관용) · userSettingsForAccount(폼 · 관용 없음) · firstServerKeyOf"
  - "LimitChaserDefaultsSection({ serverKey? }) — 그 서버 84 를 읽고 user.settings.set 에 serverKey 를 싣는다(없으면 키 없음)"
  - "me-client 설정 탭 → 고른 계좌의 serverKey"
  - "상따 폼 시딩 · preBuyWatchFixedOf · 「줄매수도 같이 켜기」 = 카드 계좌 서버 84(모르면 빈 패치)"
  - "E2E P32-settings · 단위 테스트 P32 describe 4개"
affects: [32-09, 32-10]

actuals:
  tokens: 11800
  tasks: 2
  commits: 3
plan_head_before: 0f45423ecb9a75a1bcc77287ff731c8049c3f5d3
plan_head_after: 0ed35c21eedbcd15861184ad7521318f085abdf3

tech-stack:
  added: []
  patterns:
    - "서버 축 캐시 조회는 단일 출입구 모듈(user-settings-server.ts)로만 — 관용 규칙(구 relay \"\" 칸)이 소비처마다 흩어지지 않게"
    - "같은 Map 을 읽는 두 규칙을 의도적으로 갈라 둔다: 표시 · 저장(/me)은 primary 관용, 시딩(폼)은 관용 없음(fail-safe = 빈 패치)"

key-files:
  created:
    - webapp/src/lib/user-settings-server.ts
    - webapp/src/lib/__tests__/user-settings-server.test.ts
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/e2e/specs/me.spec.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx

key-decisions:
  - "user-settings-server.ts 함수 인자는 RelayAccount 전체가 아니라 Pick<RelayAccount, 'serverKey'>(· 'accountNo') — MeAccountChoice 같은 부분 모양도 넘길 수 있게"
  - "firstServerKeyOf 를 export 했다(테스트 · 32-09 의 서버키 칩이 같은 「첫 서버」 판정을 쓸 수 있게)"
  - "/me 설정 탭 serverKey 는 choices.find(meAccountNo)?.serverKey 인라인 — 목록 밖 계좌 · meAccountNo \"\" 이면 undefined → \"\" 칸"
  - "LimitChaserDefaultsSection 기본 인자 {} — 기존 <LimitChaserDefaultsSection /> 호출(테스트 다수)이 그대로 컴파일 · 동작"

patterns-established:
  - "84 프레임 표지(serverKey)는 42 본문 s 에 넣지 않는다 — 테스트 기대값 헬퍼(VALUES_OF)도 serverKey 를 걷어 낸다"

requirements-completed: [AXIS-05]

coverage:
  - id: D1
    description: "(트레이서) /me 설정 탭 행 확정 → 브라우저 user.settings.set{serverKey: 고른 계좌 서버} → relay 42 → 게이트웨이 1건 → 84{serverKey} → userSettingsByServer 그 칸 → 설정 탭 값 반영"
    requirement: AXIS-05
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P32-settings 설정 탭 = 고른 계좌의 서버 — 행 확정 → 게이트웨이 42 1건 · 84 뒤 값 반영 (D-14a · D-24)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/me.spec.ts#P27-M1 · P31-5 · P27-M1 폰 390 (회귀)"
        status: pass
    human_judgment: false
  - id: D2
    description: "리듀서 — 서버별 칸 · 같은 서버 교체(다른 칸 참조 유지) · serverKey 부재 = \"\" 칸 · reset 빈 Map"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#P32 userSettingsByServer 리듀서 (D-14a — 84 는 서버마다 따로)"
        status: pass
    human_judgment: false
  - id: D3
    description: "조회 규칙 — /me 는 첫 서버만 \"\" 칸 관용 · 폼은 관용 없음(primary · \"\" 칸 대신 채움 금지 · Pitfall 14)"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/user-settings-server.test.ts#P32 서버별 84 조회 (D-14a · D-14b · Pitfall 14)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/me 섹션 serverKey prop — 그 서버 미수신 = 「불러오는 중」 잠금 · 송신 serverKey · prop 없음 = 키 없음 · 계좌 전환 시 그 서버 값"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P32 serverKey prop (D-24 — 설정 탭 서버 = 고른 계좌의 서버)"
        status: pass
    human_judgment: false
  - id: D5
    description: "폼 시딩 = 카드 계좌 서버 — 교보 카드 KB 값 미사용(빈 패치) · 도착 뒤 재시딩 · preBuyWatchFixedOf · 「줄매수도 같이 켜기」 같은 서버"
    requirement: AXIS-05
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P32 시딩 = 카드 계좌 서버 (D-14b)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-4 · P31-7 새 폼 84 시딩 (relay 84{serverKey KB} → 카드 계좌 serverKey KB)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실서버 두 게이트웨이(KB120 · KYOBO119)에서 계좌별 설정 탭 · 폼 시딩이 서로 다른 값을 보이는지"
    verification: []
    human_judgment: true
    rationale: "E2E 스텁 게이트웨이는 세션 1개(서버키 KB)라 2서버 실증은 relay fanout-multi-session.test.ts(32-07)와 32-10 라이브 UAT 몫(RESEARCH A6)"

duration: 19min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 08: 웹 매매설정 서버 축(userSettingsByServer · 상따 폼 시딩 D-14b) Summary

**웹이 84 를 서버별 Map(`userSettingsByServer`)으로 따로 쥐고, /me 설정 탭은 고른 계좌의 서버 값을 읽어 그 서버로 42 를 보낸다. 상따 폼 시딩은 카드 계좌 서버의 84 만 쓰고, 모르면 빈 패치로 둔다.**

## Performance

- **Duration:** 약 19분(E2E 포트 대기 포함)
- **Started:** 2026-10-16T06:58Z
- **Completed:** 2026-10-16T07:17Z
- **Tasks:** 2 (tracer 1 · tdd 1)
- **Files modified:** 11 (신규 2)

## Accomplishments

- **트레이서(Task 1):** /me 설정 탭에서 행을 확정하면 브라우저가 `{ t: "user.settings.set", serverKey: "KB", s }` 를 보낸다. relay(32-07)가 그 서버 세션으로 42 를 보내고, 게이트웨이는 1건을 받는다. 84 가 `user.settings{serverKey}` 로 돌아오면 Map 의 그 칸이 바뀌고, 행이 「7초」 와 플래시로 바뀐다. 이 경로를 E2E `P32-settings` 가 끝에서 끝까지 증명한다.
- **상태 모양 전환:** 단일 `userSettings` 필드를 컨텍스트에서 지웠다. 그래서 typecheck 가 소비처를 모두 잡았고, 테스트 파일도 typecheck 범위에 든다.
- **조회 규칙 한 곳(`user-settings-server.ts`):**
  - /me(`userSettingsForServer`)는 구 relay 관용이 있다. 고른 서버가 첫 서버(primary)일 때만 `""` 칸을 그 서버 값으로 본다.
  - 폼(`userSettingsForAccount`)은 관용이 없다. 카드 계좌의 serverKey 가 없거나 그 서버 칸이 없으면 undefined, 곧 시딩 생략이다.
- **폼 시딩 소비처 3곳**(초기 시딩 · 재시딩 이펙트 · `userSettingsRef` 로 읽는 `preBuyWatchFixedOf` 와 「줄매수도 같이 켜기」)이 모두 같은 `userSettings` 지역값 하나를 본다. `seedFromUserSettings` · `preBuyWatchFixedOf` 시그니처는 바꾸지 않았다.

## Task Commits

1. **Task 1 (tracer): 웹 서버 축 트레이서** — `a8cdbebb` (feat)
2. **Task 2: 서버별 조회 · 리듀서 · 시딩 테스트 잠금** — `490e0a7a` (test)
3. **Task 2 후속: 테스트 리터럴 타입 수정(typecheck)** — `0ed35c21` (fix)

## TDD Gate Compliance (Task 2)

- **순서:** 플랜이 트레이서(Task 1, 구현) → tdd(Task 2, 테스트 잠금) 순서라 `feat(32-08)`(a8cdbebb)가 `test(32-08)`(490e0a7a)보다 앞선다. 「RED commit 이 feat 보다 먼저」 규칙과 다른 점을 여기 적는다. 플랜 frontmatter `type: execute` 라 플랜 단위 게이트 대상은 아니다.
- **Unexpected GREEN 조사:** Task 2 의 새 테스트 27건(user-settings-server 12 · 리듀서 4 · /me 6 · 폼 5 — P32 describe)은 작성 즉시 통과했다. 원인은 기능이 Task 1 트레이서에 이미 있었기 때문이다(테스트 오류 아님).
- **RED 대체 증거(변이 실행):** 테스트가 행동을 실제로 지키는지 보려고 구현에 회귀 변이 4개를 넣고 같은 4개 파일을 junit 으로 돌렸다.
  - 변이 ①: 폼 조회의 primary · `""` 폴백
  - 변이 ②: /me 첫 서버 판정 삭제
  - 변이 ③: 리듀서가 serverKey 를 무시
  - 변이 ④: 송신에서 serverKey 를 뺌
  - 결과: 514 tests 중 fail 15이고, 실패는 모두 P32 describe 다. 기존 테스트 실패는 0이다. 분류기 `gsd_run check tdd-red-evidence` 는 **RED_EVIDENCE_OK** 를 냈다(target 「userSettingsForAccount — 상따 폼 시딩(관용 없음) > 그 서버 칸이 없으면 undefined — primary(KB120) · "" 칸으로 대신 채우지 않는다(Pitfall 14)」 · format junit).
  - 의미 판정: target 은 `expected { t: 'user.settings', …(14) } to be undefined` 로 실패했다. Pitfall 14 회귀(교보 카드가 KB 값을 받음)를 정확히 잡은 것이다. 변이는 `git checkout -- <3파일>` 로 되돌렸고 커밋하지 않았다.
- **GREEN:** 원 구현으로 5개 파일 659/659 통과.

## Files Created/Modified

- `webapp/src/lib/user-settings-server.ts` (신규): `firstServerKeyOf` · `userSettingsForServer` · `userSettingsForAccount`. JSDoc 에 두 규칙의 차이와 쓰는 곳을 적었다.
- `webapp/src/lib/use-relay-socket.ts`: `userSettingsByServer` 상태 · 초기 빈 Map · `case "user.settings"` 서버별 set · 컨텍스트 노출.
- `webapp/src/lib/relay-provider.tsx`: Provider 밖 기본값을 빈 Map 고정 참조로 바꿨다.
- `webapp/src/components/me/limit-chaser-defaults.tsx`: `serverKey` prop을 추가했다. 읽기는 `userSettingsForServer` 로 하고, 42 송신에 `serverKey` 를 조건부로 싣는다(`useUserSettingsSave` 인자 · `dispatchOne` deps).
- `webapp/src/components/trading/me-client.tsx`: 설정 탭이 고른 계좌의 serverKey 를 넘긴다.
- `webapp/src/components/trading/limit-chaser-form.tsx`: `userSettings` 를 `userSettingsForAccount(userSettingsByServer, accountNo, accounts)` 로 바꿨다.
- `webapp/e2e/specs/me.spec.ts`: `P32-settings` 를 추가했다(브라우저 `framesent` 로 serverKey 단언).
- 단위 테스트 4개 파일: Map 목으로 바꾸고 P32 describe 들을 추가했다.

## Decisions Made

frontmatter `key-decisions` 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 기존 단위 테스트 목 전환을 Task 1 로 당김**
- **Found during:** Task 1
- **Issue:** webapp `tsconfig` 가 `src/**/*` 를 포함해 테스트 파일도 typecheck 대상이다. 단일 `userSettings` 를 지우면 `relay-socket.test.ts` 의 `result.current.userSettings` 단언이 TS 오류가 되어 Task 1 의 typecheck 검증이 막힌다. 또 /me · 폼 테스트 목이 `userSettings` 를 주면 Task 1 커밋에서 기존 케이스가 런타임에 깨진다.
- **Fix:** 플랜이 Task 2 에 둔 「기존 단언 · 목 전환」(Map · `""` 칸 / 기본 계좌 서버 칸)을 Task 1 커밋에 넣었다. 새 P32 케이스는 Task 2 에 그대로 두었다.
- **Files modified:** relay-socket.test.ts · limit-chaser-defaults.test.tsx · limit-chaser-form.test.tsx
- **Commit:** `a8cdbebb`

**2. [Rule 1 - Bug] 새 테스트의 계좌 리터럴 TS2353**
- **Found during:** 플랜 검증(typecheck)
- **Issue:** `firstServerKeyOf([{ accountNo, name }])` 리터럴이 `Pick<RelayAccount, "serverKey">` 의 초과 속성 검사에 걸렸다. vitest 는 타입을 보지 않아 통과했었다.
- **Fix:** 서버키 없는 계좌를 `RelayAccount` 상수로 두었다.
- **Commit:** `0ed35c21`

**3. [Rule 1 - Test helper] VALUES_OF 가 serverKey 를 42 본문 기대값에 남김**
- **Found during:** Task 2
- **Fix:** /me 테스트 헬퍼가 `t` · `present` 와 함께 `serverKey` 도 걷어 낸다(84 프레임 표지 · 42 `s` 에 없음).
- **Commit:** `490e0a7a`

---

**Total deviations:** 3건 자동 수정(Rule 3 1건 · Rule 1 2건). **Impact:** 커밋 경계와 테스트 코드만 달라졌고, 제품 동작 범위는 플랜 그대로다.

## Issues Encountered

- **E2E 포트 경합:** 첫 실행에서 옆 세션(phase-33 worktree)의 E2E relay 가 :8090 을 쥐고 있어 두 spec 의 beforeAll 이 실패했다. 포트가 비기를 기다려 다시 돌렸다.
- **NextFont 캐시:** 재실행은 `NextFontGoogleFontFileReplacer` 반복으로 webServer 120s 타임아웃이 났다. 알려진 증상이라 `webapp/.next` 를 지우고, 그 사이 :3100 을 잡은 phase-33 dev 서버가 내려가기를 기다린 뒤(재사용하면 남의 코드를 시험한다) 다시 돌렸다.
- **플랜 검증 결과:**
  - typecheck: error TS 0
  - vitest `src/lib src/components/me src/components/trading`: 104 파일 · 3240 통과 · 1 skip
  - playwright `me.spec` + `trading-workbench.spec`: 112 통과 · 1 실패 · 3 미실행(serial)
  - 실패 1건은 알려진 범위 밖 `P31-3 폰 시트 환산`(`lc-sell-watch-qty` 아래 줄 「777주」 · deferred-items.md 32-03 항목과 같은 단언)이다. 이 플랜은 매도 비교가 0 에코 표시 규칙(`lc-fields`)을 건드리지 않았고, 원인도 시딩 경로 밖이라 고치지 않았다.
  - 작업대 시딩 회귀 P27-4 · P31-7 은 통과했다. relay 84 의 serverKey KB 와 카드 계좌 serverKey KB 가 맞물린다는 실증이다.

## Observations (플랜 Flagged assumptions)

- **목록 밖 계좌(행에만 있는 계좌)를 고른 /me 설정 탭:** `MeAccountChoice.serverKey` 가 없어 `userSettingsForServer(map, undefined, …)` 가 `""` 칸을 본다. 새 relay 는 `""` 칸을 만들지 않으므로 그 탭은 「불러오는 중」 잠금으로 남는다(저장 불가 = fail-safe). UI-SPEC 에 이 경우의 문구가 없어 새 문구는 만들지 않았다. 32-09(서버키 칩 · 「아직 못 받음」)에서 문구를 정할 때 이 경우를 함께 다루면 된다.
- **배포 창:** 새 webapp 이 구 relay 를 만나면 /me 는 첫 서버만 `""` 칸 관용으로 값이 보인다. 폼 시딩은 비고(빈 패치), 송신 프레임에는 `serverKey` 가 실린다. 32-10 순서(relay 먼저 · push 나중)를 지키면 이 조합은 생기지 않는다.

## Known Stubs

없음.

## User Setup Required

None. relay 배포 · push 는 32-10(메인 세션)이 맡는다.

## Next Phase Readiness

- 32-09(설정 탭 UI — 서버키 칩 · 「아직 못 받음」 · 캡션 · 칩 잠금)는 `LimitChaserDefaultsSection({ serverKey })` · `userSettingsForServer` · `firstServerKeyOf` · `relay.userSettingsByServer.has(serverKey)` 위에 얹으면 된다.
- 32-07 의 거부 프레임(`kind: "user.settings.set"` · `USER_SETTINGS_SERVER_GONE_TEXT`)은 기존 비행 잠금이 `kind` 로 풀리는 경로를 그대로 탄다. 이 플랜에서는 문구 표시를 바꾸지 않았다.

---
*Phase: 32-account-axis*
*Completed: 2026-10-16*

## Self-Check: PASSED

- 커밋 a8cdbebb · 490e0a7a · 0ed35c21 이 HEAD 조상에 있음
- 신규 파일 2개 + SUMMARY 존재
- 수락 기준 grep: `userSettingsByServer` use-relay-socket 6줄 · relay-provider 1줄 · `export function userSettingsForAccount(` 1줄 · 폼 `userSettingsForAccount(` 1줄 · `LimitChaserDefaultsSection serverKey=` 1줄 · 폼 테스트 `userSettingsByServer` 1 이상
- typecheck error TS 0 · 플랜 vitest 5파일 FAIL 0 · E2E P32-settings · P27-M1 · P31-5 통과
