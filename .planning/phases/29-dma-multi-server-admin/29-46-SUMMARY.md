---
phase: 29-dma-multi-server-admin
plan: 46
subsystem: relay
tags: [relay, shared, dma, g-1, order-server, gap-closure, gc-06, tdd, tracer]
requires:
  - phase: 29-33
    provides: "createOrderServerRouting(effectiveOrderServer · ownerOf · serversFor) — 세션 소유 · 대상 원천"
  - phase: 29-44
    provides: "EffectiveOwnerTracker — 같은 effectiveOrderServer 주입으로 move 계산 · 로그인 백스톱"
  - phase: 29-45
    provides: "order-server-resync.test.ts 하네스(⑥ 기본 서버 전환 케이스)"
provides:
  - "shared resolveEffectiveOrderServer({ designated, defaultKey, registered, defaultUnknown }) · EffectiveOrderServer = { key, via: 'designated' | 'default' | 'only-registered' } — 29-55 Admin 계좌 줄이 소비"
  - "JournalAccess.loaded(getter) — 유효 스냅샷을 한 번이라도 적용했나(빈 스냅샷 거부는 세지 않음)"
  - "OrderServerRoutingDeps.mappingLoaded?(serverKey) — 미주입 = 늘 적재됨 · index 결선 = pipelines.get(key)?.access.loaded === true"
  - "relay effectiveOrderServer = shared 규칙 — 기본 서버에 없는 계좌는 유일 등록 서버 · 두 비기본 등록 = 소유자 없음 · 기본 매핑 미적재 = 종전 기본"
affects: [29-55, 29-50, ADMIN-06, ADMIN-04]
actuals:
  tokens: 8100
  tasks: 1
  commits: 2
plan_head_before: 00c9cd5bcd7f939674bb298b1c4579b709e5ae9a
plan_head_after: a501381e9bf4c41ca8ee16411aff3d920d43b322
tech-stack:
  added: []
  patterns:
    - "규칙 한 벌은 shared 순수 함수 — 소비자는 등록 목록만 달리 넣는다(relay = 서버 매핑 79/87, Admin = DB 의도 active 행)"
    - "등록 모름(defaultUnknown)은 등록으로 본다 — 부팅 · 재생성 직후 매핑 미적재가 계좌를 숨기지 않게 종전 동작 유지"
key-files:
  created:
    - packages/shared/src/order-server.ts
    - packages/shared/src/__tests__/order-server.test.ts
    - .planning/phases/29-dma-multi-server-admin/.red/29-46-task1-red.json
  modified:
    - packages/shared/src/index.ts
    - relay/src/access/account-order-servers.ts
    - relay/src/journal/access.ts
    - relay/src/index.ts
    - relay/tests/account-order-servers.test.ts
    - relay/tests/journal-push.test.ts
    - relay/tests/effective-owner-tracker.test.ts
    - relay/tests/order-server-resync.test.ts
key-decisions:
  - "29-46: 유효 주문 서버 = 지정 ?? (기본 서버 매핑에 계좌가 있거나 그 매핑 미적재면 기본) ?? (등록 서버가 정확히 1대면 그 서버) ?? 없음 — 규칙 정본은 shared resolveEffectiveOrderServer(relay · Admin 한 벌)"
  - "29-46: 기본 서버 매핑이 적재됐는데 계좌가 어디에도 없으면 기본으로 떨어뜨리지 않고 소유자 없음(규칙 문장 그대로) — 종전에도 serversFor 는 그 세션을 열지 않았으므로 바뀌는 것은 ownerOf 값뿐"
  - "29-46: 유효한 지정(켜짐 · 같은 증권사)은 매핑 등록 여부와 무관하게 이긴다(종전) — 등록 판정은 지정이 없을 때만 계산"
patterns-established:
  - "유효 주문 서버 판정은 shared resolveEffectiveOrderServer 하나 — 새 소비자는 등록 목록 원천만 정하고 규칙을 다시 쓰지 않는다"
requirements-completed: [ADMIN-06, ADMIN-04]
coverage:
  - id: D1
    description: "shared 규칙 한 벌 resolveEffectiveOrderServer — 지정 · 기본 · 유일 등록 · 없음 · 등록 모름 표 7행 + 보강 2"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/order-server.test.ts#resolveEffectiveOrderServer — 유효 주문 서버 규칙 한 벌 (29-46 GC-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay 트레이서 — KB121 에만 등록된 지정 없는 계좌 A 는 유효 · 소유 KB121 · serversFor [KB120, KB121] · 기본 매핑 미적재면 종전 KB120 · 두 비기본 등록이면 소유자 없음"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/account-order-servers.test.ts#createOrderServerRouting — 기본 서버에 없는 계좌는 유일 등록 서버 (29-46 GC-06)"
        status: pass
      - kind: integration
        ref: "relay/tests/session-routing.test.ts (무수정 green — 지정 우선 · 꺼진 지정)"
        status: pass
    human_judgment: false
  - id: D3
    description: "JournalAccess.loaded — 생성 직후 false · 빈 스냅샷 거부는 false 유지 · 유효 스냅샷 1회 → true"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#29-46 GC-06 — loaded"
        status: pass
    human_judgment: false
  - id: D4
    description: "의도된 단언 변경 — 기본 서버 KB120 → KB121 에서 KB120 에만 등록된 계좌는 이동 없음(트래커 move 1 · resync ⑥ 재수립 1명)"
    requirement: ADMIN-04
    verification:
      - kind: unit
        ref: "relay/tests/effective-owner-tracker.test.ts#레지스트리 KB 기본 KB120 → KB121 … (GC-06 — 유일 등록 서버 유지)"
        status: pass
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑥ … (GC-06 — 유일 등록 서버 유지)"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 보존 — 지정 0 · 두 번째 서버 꺼짐 · 계좌는 기본 서버에만 등록이면 유효 서버 · serversFor 무변경"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/account-order-servers.test.ts#운영 모양 보존 — 지정 0 · 계좌는 기본 서버에만 등록"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1438 green)"
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 46: 유효 주문 서버 규칙 한 벌(GC-06 relay · shared) Summary

**shared `resolveEffectiveOrderServer` 한 벌(지정 ?? 기본 등록 · 등록 모름이면 기본 ?? 유일 등록 서버 ?? 없음)을 relay `effectiveOrderServer` 에 꽂았다. KB121 에만 등록된 지정 없는 계좌가 더는 무소유로 사라지지 않는다. 기본 서버 매핑이 미적재일 때(`JournalAccess.loaded` 거짓)는 종전대로 기본 서버다.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-11T00:48:20Z
- **Completed:** 2026-10-11T00:53:10Z
- **Tasks:** 1 (트레이서 · TDD — RED/GREEN 두 커밋)
- **Files modified:** 11 (신규 3 · 수정 8)

## Accomplishments

- **규칙 한 벌(shared).** `packages/shared/src/order-server.ts` 에 `resolveEffectiveOrderServer` · `EffectiveOrderServer`(`via` = designated · default · only-registered)를 두고 `index.ts` 에서 재수출했다. 29-55 Admin 계좌 줄이 같은 함수를 DB 의도 active 행으로 부른다.
- **relay 라우팅(트레이서).** `effectiveOrderServer` 의 동작:
  - 지정이 유효(켜짐 · 같은 증권사)하면 지정이 이긴다(종전).
  - 지정이 없으면 등록을 계산해 shared 규칙에 넘긴다. 등록 = 그 증권사 켜진 서버 중 매핑에 계좌가 있는 키(레지스트리 순)다.
  - `serversFor` · `ownerOf` · `EffectiveOwnerTracker` 셋이 함께 따른다. 그래서 KB121 에만 등록된 A 는 KB121 세션이 열리고 KB121 이 소유한다.
  - 로그인 백스톱도 KB121 을 「주문 서버가 아닌 등록 서버」 로 보고 끄던 판정을 하지 않는다(트래커 effective = KB121).
- **부팅 회귀 방지.** `JournalAccess.loaded`(유효 스냅샷 적용 1회 이상)를 더했다. index 가 `mappingLoaded: (key) => pipelines.get(key)?.access.loaded === true` 로 결선한다. 기본 서버 매핑이 미적재면 `defaultUnknown` 이라 종전처럼 기본 서버다.
- **운영 보존.** 지금 운영(지정 0 · KB121 · KYOBO127 꺼짐 · 계좌는 기본 서버에만 등록)에서는 유효 서버와 세션 대상이 바뀌지 않는다. 전용 케이스와, 기존 session-routing · fanout-multi-session 무수정 green 으로 확인했다.

## Task Commits

1. **Task 1 RED: GC-06 실패 테스트** — `27a8d5c3` (test) — shared 골격(종전 규칙) · 규칙 표 · relay 라우팅 7케이스 · `loaded` · 의도된 단언 변경 2곳
2. **Task 1 GREEN: 유효 주문 서버 규칙 한 벌** — `a501381e` (fix)

REFACTOR 없음.

## TDD Gate Compliance

- **RED** `27a8d5c3`: 증거는 `.planning/phases/29-dma-multi-server-admin/.red/29-46-task1-red.json` 이다.
  - 형식은 JUnit · `gsd-tools check tdd-red-evidence` 판정 `RED_EVIDENCE_OK` 이다. 결과는 73 수집 · 실패 8 · errors 0 이다.
  - 목표 테스트는 「KB121 에만 등록 → KB121」 이다. `effectiveOrderServer(d1, KB, A)` 가 KB121 대신 KB120 을 돌려 계획 단언 지점에서 실패했다.
  - 의미 평가: 같은 미구현 때문에 GC-06 라우팅 5건, 트래커 1건(move 3 ≠ 1), resync ⑥(재수립 2 ≠ 1), `loaded`(getter 없음) 가 실패했다. 로드 · 문법 · 픽스처 오류는 없다. 운영 보존 · 지정 우선 케이스는 처음부터 green 이다(회귀 고정).
  - shared 표는 골격으로 9 중 5 가 실패했다(only-registered · null 행).
- **GREEN** `a501381e`: 계획 verify 전부 green(아래). 커밋 접두는 계획 action ⑥ 예시대로 `fix(29-46)` 다. TDD 게이트의 `feat(...)` 패턴 대신 쓴 것이고, 29-45 · 29-48 과 같은 관례다.

## Verification

- `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/order-server.test.ts` → 9/9
- `pnpm --filter @gh-radar/shared build` · `relay typecheck` · `relay typecheck:tests` → 오류 0
- `relay vitest run tests/account-order-servers · session-routing · effective-owner-tracker · journal-push · order-server-resync`(+ fanout-multi-session) → 6 파일 82 green
- 전체 relay → 57 파일 1438 green(`--maxWorkers=2`, 끝에 한 번). shared 전체는 19 파일 464 green · shared typecheck 0
- 이 플랜 커밋에 webapp · `relay/src/order/order-api.ts` 변경이 없다(`git show --stat` 확인 — 29-55 몫)
- 수용 기준 grep:
  - `export function resolveEffectiveOrderServer` = 1 · `from "./order-server"` = 1
  - relay 라우팅의 `resolveEffectiveOrderServer` = 3 · index `mappingLoaded` = 1 · `get loaded` = 1
  - session-routing.test.ts diff 0줄
  - resync ⑥ · 트래커 케이스 이름에 「GC-06」 있음

## Files Created/Modified

- `packages/shared/src/order-server.ts` — 규칙 한 벌 · 머리 주석에 GC-06 근거와 「등록 목록만 달리 넣는다」 를 적었다
- `packages/shared/src/index.ts` — `export * from "./order-server"`
- `packages/shared/src/__tests__/order-server.test.ts` — behavior 표 7행 + 「적재됐는데 미등록 → 없음」 · 「중복 1대」
- `relay/src/journal/access.ts` — `#loaded` · `get loaded()`. 빈 스냅샷 거부 갈래에서는 세우지 않는다
- `relay/src/access/account-order-servers.ts` — `mappingLoaded?` deps 와 shared 규칙 사용 · 머리 주석 규칙 문장 갱신 · `serversFor` 주석 1줄
- `relay/src/index.ts` — `mappingLoaded` 결선 · 220행대 주석을 shared 규칙 문장으로
- `relay/tests/account-order-servers.test.ts` — `createOrderServerRouting` describe 7케이스(대역 레지스트리 · 매핑)
- `relay/tests/journal-push.test.ts` — `loaded` 케이스(WR-04 옆)
- `relay/tests/effective-owner-tracker.test.ts` · `relay/tests/order-server-resync.test.ts` — 의도된 단언 변경(아래)

## 의도된 단언 변경

규칙이 바뀌면서 두 단언이 의도대로 바뀌었다. 기본 서버에만 등록된 계좌는, 기본 서버가 다른 서버로 바뀌어도 유일 등록 서버에 남는다.

- **트래커 「레지스트리 KB 기본 KB120 → KB121 … (GC-06 — 유일 등록 서버 유지)」**
  - 종전: move 3(A → KB121 · D1 의 B · D2 의 B → undefined)
  - 지금: A → KB121 1건. B 는 D1 · D2 모두 KB120 유일 등록이라 이동이 없다.
- **resync ⑥ 「… (GC-06 — 유일 등록 서버 유지)」**
  - 종전: u1 · u2 둘 다 KB120 에서 끄고 1012
  - 지금: `resyncChangedUsers("registry")` = 1(u1 만) · t2 열린 채 · dropUser 1 · KB120 끈 키 = A 만 · `dk:KB120:D` 없음 · u2 세션은 KB120 그대로
  - 나머지 단언은 그대로다(u3 0 · u1 재접속 KB121 · 25 → 66).

## Decisions Made

- **적재된 기본 매핑에 계좌가 없고 등록 0대면 「없음」.** 플랜 must_haves 의 규칙 문장(「?? 없음」)을 그대로 따랐다.
  - 종전에도 `serversFor` 는 그 계좌로 세션을 열지 않았다(유효 서버 매핑에 계좌가 있을 때만). 그래서 바뀌는 것은 `ownerOf` 값뿐이다.
  - 영향 범위: 로그인 응답에는 있는데 relay 매핑(79/87)이 아직 싣지 않은 계좌는 87 반영 전까지 소유되지 않는다. 지정 서버 미반영의 종전 처리와 같은 fail closed 다.
- **등록 판정은 지정이 없을 때만 계산한다.** 유효한 지정은 매핑 무관하게 이긴다(금지 조항 · session-routing ⑨ ⑪ 무수정 green).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-55(wave 24): Admin 계좌 줄(GC-06 표시)이 `resolveEffectiveOrderServer` 를 DB 의도 active 행으로 부른다. healthz(GC-13) · index `serverDisabled` 결선도 29-55 몫이다.
- 29-50(wave 24): 같은 `relay/src/journal/access.ts` 에 잠정 매핑을 더한다. `#loaded` 는 「유효 스냅샷 적용」 에서만 세워지니 잠정 매핑 갈래가 이것을 세울지 그때 정한다.
- 배포 안 함 — 코드 · 테스트만. 운영 판정 결과는 그대로다(운영 보존 truth).

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*
