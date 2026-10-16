---
phase: 32-account-axis
plan: 11
subsystem: relay
tags: [relay, hub, fanout, vi, flatbuffers, websocket, webapp-reducer, d-17, slot-only]

requires:
  - phase: 32-account-axis
    provides: "32-06 계좌 끄기(strategies.disable.account · beginAccountStop VI 몫) · 32-07 소유 키 단위 hub 캐시 패턴 · 32-10 웨이브 ①~③ 배포"
  - phase: gh-trade 33 (외부)
    provides: "61 SetVITrigger.unregistered(vtable 16) · 21 → 선언 계좌마다 61 n 프레임 · 생성물 ecd62f33(마커 acb8182d)"
provides:
  - "shared RelayViSlotMsg { t: \"vi.slot\", a, x, cfg } (RelayOutbound)"
  - "parseViTrigger 슬롯 파싱 — unregistered → cfg null + slot · 등록본 → cfg + slot · 빈 Envelope → slot 없음"
  - "hub (소유 키, 계좌, 거래소) 슬롯 캐시 #viSlots · getViSlot · getViSlotsAll · 원천 = 모든 결선 세션 · 구 서버 21 귀속 호환"
  - "fanout vi.set = 계좌 소유 세션 · 서버 간 거래소당 1건 가드 삭제 · replay = vi.slot 전량 · 계좌 끄기 VI 몫 = 그 계좌 슬롯"
  - "fake gateway 슬롯 모드 respondViSlots / viSlot · frames unregistered 옵션"
  - "webapp viSlots 리듀서 · viSlotOf · slot-only 다리(viTriggers 칸을 슬롯 위 병합으로 유지 — 32-13 이 지움)"
affects: [32-12, 32-13, 32-14]

actuals:
  tokens: 45738
  tasks: 3
  commits: 3
plan_head_before: 369d9ff1d574c1bb50ed572ef9bf5333b6179eda
plan_head_after: eb2c36bb59a886103cd9700c7464682435f6bcc2
relay_commit: eb2c36bb

tech-stack:
  added: []
  patterns:
    - "VI 슬롯 키 `${owner}|${accountNo}|${exchange}` — ownerPrefix 정리가 그대로 동작"
    - "21 대기열 머리는 한 21 에 한 번 소비 · 그 순간 그 세션 소유 계좌의 모르는 슬롯 = 미등록(구 서버 호환)"
    - "슬롯 61 은 같은 값이어도 매번 vi.slot 1건(웹 VI 행 잠금 해제가 에코 도착에 기대므로)"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/fanout-multi-session.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/strategy-hub.test.ts
    - relay/tests/strategy-sweeper.test.ts
    - relay/tests/ws-latch.test.ts
    - relay/tests/ws-autosell.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts

key-decisions:
  - "D-17 브라우저 VI 계약 = slot-only (사용자 결정) — relay 는 (계좌, 거래소)마다 vi.slot 만 내고 구 거래소 병합 vi 는 내지 않는다"
  - "slot-only 사유(사용자): gh-trade Phase 33 새 버전이 이미 모든 서버에 배포됐다 · relay 배포 ~ webapp push 사이 새로고침 안 한 구 탭은 VI 「모름」 — 32-14 에서 메인 세션이 relay 배포와 push 를 연달아 한다"
  - "웹 slot-only 다리 — 아직 슬롯으로 옮기지 않은 소비처(사이드바 · 상태줄 · /me · 작업대 VI 행)가 그 사이 「모름」 으로 굳지 않게 vi.slot 리듀서가 viTriggers 거래소 칸을 슬롯 위 병합(켜짐 → 최근 등록본 → 미등록 null)으로 다시 계산 — 32-13 이 viTriggers 와 함께 지운다"
  - "VI 원천 정리 — #viSourceOwners · #fromViSource · #lastViSources · #syncViSources 의 원천 전환 21 요청 갈래를 지웠다. 원천 = 모든 결선 세션이라 원천이 바뀌는 길은 결선 · 분리뿐이고, 새 세션의 21 · 34 는 그 세션 Ready(되돌아온 Ready 세션은 attach)가 보낸다"
  - "슬롯 vi.slot 은 직전 값과 같아도 낸다(플랜의 「같으면 생략」 대신) — 슬롯은 원천이 하나라 종전 isOwn 규율과 같고, 웹 VI 행이 에코 도착으로 「반영 중」 잠금을 푼다"

patterns-established:
  - "구 gh-trade 서버 호환: 21 답 첫 프레임(본문 거래소 == 대기열 머리)에서 그 세션 소유 계좌의 모르는 슬롯만 null · 빈 Envelope 는 소유 계좌 전부 null · 소유 목록 없는 세션은 채우지 않음"
  - "소유 뷰 밖 61(초집합 · 옛 지정)은 #logForeign 후 버림 — 단 21 답 첫 프레임이면 머리 소비 · 모르는 슬롯 귀속은 한다"

requirements-completed: [AXIS-01]

coverage:
  - id: D1
    description: "61 unregistered 슬롯 파싱 — unregistered → cfg null + slot(stub 무시) · 등록본 → cfg + slot · 빈 Envelope → slot 없음 · 깨진 계좌번호는 드롭"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#P32 61 unregistered 슬롯 (D-17 · gh-trade Phase 33 vtable 16)"
        status: pass
    human_judgment: false
  - id: D2
    description: "트레이서 — 같은 세션 A · B 의 KRX VI 가 hub 슬롯 캐시 · vi.slot 2건 · 웹 viSlots 두 칸으로 각자 남는다(덮어쓰기 없음)"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#SubscriptionHub — P32 VI 슬롯 트레이서 (D-17)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#P32 viSlots 리듀서 (D-17 · vi.slot)"
        status: pass
    human_judgment: false
  - id: D3
    description: "hub 슬롯 규칙 — 소유 뷰 밖 버림 · 새 서버 n 프레임 · 구 서버 21 귀속 · 교보 세션도 원천 · 두 서버 동시 run · 분리 시 슬롯 삭제(재송신 없음)"
    requirement: AXIS-01
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#SubscriptionHub — P32 VI 슬롯 다세션 (D-17)"
        status: pass
    human_judgment: false
  - id: D4
    description: "fanout — vi.set 은 계좌 소유 세션(교보 포함)으로 · 다른 서버 VI 먼저 끄는 11 없음 · replay vi.slot 전량(구 vi 0) · 계좌 끄기 VI 몫은 그 계좌 run 슬롯만 11 run:false"
    requirement: AXIS-01
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#P32 vi.set 소유 세션 · 가드 없음 (D-17)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#P32 VI 슬롯 replay · 계좌 끄기 VI 몫 (D-17)"
        status: pass
    human_judgment: false
  - id: D5
    description: "기존 웹 VI 흐름이 slot-only relay + 구 서버 모드 스텁에서 그대로 동작(웹 다리 경유)"
    requirement: AXIS-01
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"VI\" --workers=1 (14 passed)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/sidebar-tree.spec.ts --workers=1 (12 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "라이브 — 교보119 VI 실증 · 새로고침 안 한 구 탭의 VI 「모름」 창(relay 배포 ~ push) 확인"
    requirement: AXIS-01
    verification: []
    human_judgment: true
    rationale: "실 gh-trade 서버 · 배포 순서(32-14 메인 세션)가 필요하다 — 단위 · E2E 는 스텁 게이트웨이만 본다"

duration: 23min
completed: 2026-10-16
status: complete
---

# Phase 32 Plan 11: 웨이브 ④ relay 계약 — VI 계좌별 슬롯 Summary

**relay 가 VI 를 (소유 키, 계좌, 거래소) 슬롯으로 캐시하고 브라우저에 `vi.slot` 만 낸다(slot-only). 원천은 모든 결선 세션(교보 포함)이고 서버 간 1건 가드는 없앴다. `vi.set` 과 계좌 끄기 VI 몫은 그 계좌 소유 세션으로 간다. 구 gh-trade 서버의 21 답(한 프레임)도 호환한다.**

## D-17 결정 (Task 1 · checkpoint:decision — 사용자 결정 반영)

- **선택: `slot-only`** — relay 는 (계좌, 거래소)마다 `vi.slot` 을 내고, 구 거래소 병합 `vi` 프레임은 **내지 않는다**.
- **사용자 사유:** gh-trade Phase 33(VI 계좌별)은 이미 모든 서버에 배포됐다. relay 배포와 webapp push 사이에 새로고침하지 않은 구 탭은 VI 가 「모름」 으로 보인다. 그래서 32-14 에서 메인 세션이 relay 배포와 push 를 **연달아** 한다.
- 플랜 Flagged assumptions 의 `slot-only` 갈래를 적용했다. Task 2 · 3 의 hub 슬롯 캐시, 원천 해제, 가드 제거는 그대로 했다. 차이는 호환용 병합 `vi` 를 송출하지 않는다는 것 하나다. 32-13 Flagged assumptions 에 따르면 `slot-only` 는 32-13 에서 바뀌는 것이 없다.
- 체크포인트는 돌려보내지 않았다. 오케스트레이터가 사용자 결정을 프롬프트로 넘겼다.

## Performance

- **Duration:** 23 min
- **Started:** 2026-10-16T08:31:23Z
- **Completed:** 2026-10-16T08:54:22Z
- **Tasks:** 3 (1 결정 기록 · 2 트레이서 · 3 TDD)
- **Files modified:** 18

## Accomplishments

- **계약:** shared 에 `RelayViSlotMsg { t: "vi.slot", a, x, cfg }` 를 더했다. `RelayViTriggerMsg` 에는 「relay 는 더 내지 않는다」 고 적었다. 웹 `case "vi"` 갈래가 남아 있는 동안만 타입을 둔다.
- **파서:** `parseViTrigger` 는 `unregistered()` 이면 `cfg: null` 에 slot 을 붙여 돌려주고, 금액 · run 같은 stub 은 읽지 않는다. 등록본은 cfg 와 slot 을 함께 돌려주고, 빈 Envelope 는 종전대로 slot 없이 둔다.
- **hub:**
  - VI 를 `#viSlots`(`viSlotKey(owner, accountNo, exchange)`)로 캐시한다. 슬롯 61 이 오면 같은 값이어도 그때마다 `vi.slot` 을 1건 낸다.
  - 병합(`#mergeVi` · `#emitVi` · `#viEmitted` · `#viTriggerSeq` · `getViTrigger`)을 지웠다. 원천을 KB 로 한정하던 코드(`#viSourceOwners` · `#fromViSource`)와 `viRunningElsewhere` 도 지웠다.
  - 21 대기열 머리는 21 하나에 한 번만 소비한다. 그 순간 그 세션 소유 계좌 중 아직 모르는 슬롯은 미등록으로 둔다(구 서버 호환). 빈 Envelope 가 오면 그 세션 소유 계좌 전부를 미등록으로 둔다.
  - `getViSlot` · `getViSlotsAll` 을 더했다. 세션을 분리하면 그 소유 키의 슬롯을 지우고 다시 보내지 않는다.
- **fanout:**
  - `VI_BROKER` · `#viSessionFor` · `#stopViElsewhere` 를 지웠다. `vi.set` 은 이제 `#strategySession(accountNo)`, 곧 계좌 소유 세션으로 간다(증권사 무관).
  - 인증 replay 는 `getViSlotsAll` 전량을 `vi.slot` 으로 보낸다.
  - 계좌 끄기의 VI 몫은 그 계좌 슬롯 중 run 인 거래소마다 11 run:false 를 소유 세션으로 보낸다.
- **테스트 헬퍼:** fake gateway 에 슬롯 모드 `respondViSlots` 를 더했다. 21 이 오면 선언 계좌마다 61 을 1건씩 내고 선언 밖 등록 슬롯을 덧붙이며(초집합), 선언 계좌가 0 이면 빈 Envelope 를 낸다. 11 이 오면 그 슬롯에 저장하고 에코한다. 테스트용 `viSlot` 과 frames 의 `unregistered` 옵션도 더했다.
- **webapp:** 상태에 `viSlots` 를 두고 `viSlotOf` 와 `case "vi.slot"` 을 더했다. vi.slot 리듀서는 slot-only 다리로 `viTriggers` 거래소 칸도 슬롯 위 병합값으로 다시 계산한다. `relay-provider` 기본값도 맞췄다.

## Task Commits

1. **Task 1: D-17 공개 계약** — 커밋 없음. 사용자가 `slot-only` 로 결정했고 위 「D-17 결정」 에 기록했다.
2. **Task 2 (tracer): 61 슬롯 한 경로** — `4e2b5596` (feat). 트레이서 게이트에서 `<verify>` 를 다시 돌려 통과했고 확장 단계로 넘어갔다.
3. **Task 3 (TDD): relay ④ 완성**
   - RED `18265270` (test) — 새 describe 3개, 9 fail · 1 pass(소유 뷰 밖 버림은 Task 2 에서 이미 성립).
   - GREEN `eb2c36bb` (feat) — 구현과 기존 테스트 이행. REFACTOR 는 변경이 없어 커밋하지 않았다.

**relay_commit:** `eb2c36bb` (Task 3 relay 코드 커밋 직후 `git rev-parse --short HEAD`)

## TDD Gate Compliance (Task 3)

- **RED:** `test(32-11)` `18265270`. 증거 명령은 `pnpm exec vitest run tests/hub-multi-session.test.ts -t "P32 VI 슬롯 다세션" --reporter=junit` 이다. 대상 테스트는 「교보 세션 61 · 72/73 · 56 도 원천 — KB 세션이 있어도 21 · 34 를 보내고 받아들인다(KB 한정 해제)」 이다. `gsd_run check tdd-red-evidence` 결과는 `RED_EVIDENCE_OK` (target_test_failed · junit · tests 71 · fail 5)였다.
  - **의미 평가:** 대상 테스트는 실제로 실행됐고, 계획한 단언(`expected [ 25, 24, 43 ] to include 21`)에서 의도한 이유로 실패했다. 교보 세션이 VI 원천이 아니어서 21 을 보내지 않았기 때문이다. 같은 실행의 다른 실패도 단언 실패이거나 미구현 API(`getViSlotsAll`)였고, 설정 · 수집 · 구문 오류는 없었다.
- **GREEN:** `feat(32-11)` `eb2c36bb` — relay 전체 1617/1617 통과.

## Files Created/Modified

- `packages/shared/src/relay.ts` · `index.ts` — `RelayViSlotMsg` · `RelayOutbound` · `RelayViTrigger.exchange` 주석 · `RelayViTriggerMsg` 의 slot-only 주석
- `relay/src/dma/envelope.ts` — `ParsedViTrigger.slot` · `unregistered()` 갈래
- `relay/src/hub/subscription-hub.ts` — 슬롯 캐시 · 원천 = 모든 세션 · `#onViTrigger` 귀속 재작성 · `#fillViSlots` · `getViSlot` / `getViSlotsAll` · `#syncViList` · 머리 표 VI 줄
- `relay/src/ws/fanout.ts` — 소유 세션 `vi.set` · 가드 삭제 · `vi.slot` replay · 계좌 끄기 VI 몫 슬롯화
- `relay/tests/helpers/fake-gateway.ts` · `frames.ts` — 슬롯 모드 · `unregistered`
- `relay/tests/*` — 새 describe(P32 VI 슬롯 트레이서 · 다세션 · vi.set 소유 세션 · replay/계좌 끄기)와 기존 VI 단언 이행
- `webapp/src/lib/use-relay-socket.ts` · `relay-provider.tsx` · `__tests__/relay-socket.test.ts` — `viSlots` · `viSlotOf` · 다리 · P32 리듀서 테스트

## Decisions Made

- 위 「D-17 결정」 그대로다(`slot-only` · 사용자 사유).
- **같은 값 슬롯 에코도 낸다:** 플랜은 「직전 팬아웃 값과 같으면 생략」 이라고 했다. 하지만 슬롯은 원천이 하나라 종전 `#emitVi` 의 isOwn(늘 냄)과 같다. 게다가 웹 VI 행은 에코 객체가 도착해야 「반영 중」 잠금을 푼다. 그래서 늘 낸다.
- **원천 전환 21 요청 갈래를 지웠다:** 원천이 모든 결선 세션이므로 새 원천은 곧 새로 결선된 세션이다. 그 세션은 자기 Ready(또는 attach 의 되돌아온 Ready)에서 21 · 34 를 보낸다. 갈래를 남겨 두면 Ready 인 채 처음 결선된 세션에 21 을 겹쳐 보낸다. 플랜의 「추가된 원천에 21 · 34 프리페치」 는 Ready 경로가 지킨다.
- **소유 뷰 밖 프레임도 21 머리는 소비한다:** 구 서버에서는 그 거래소 칸을 다른 계좌가 차지했다는 뜻이다. 그래서 소유 계좌의 모르는 슬롯을 미등록으로 채운다(종전 의미와 같다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 웹 slot-only 다리 (`viLegacyOf`)**
- **Found during:** Task 2 (slot-only 적용 설계)
- **Issue:** slot-only 라 relay 가 구 `vi` 를 내지 않는다. 그런데 이 플랜은 웹 `viTriggers` · `case "vi"` 를 지우지 않는다(32-12 · 32-13 몫). 그러면 32-11 ~ 32-13 사이 커밋에서 웹 VI 소비처 전부가 「모름」 이 된다. 플랜 verification 의 E2E(`-g "VI"`)와 32-12 의 E2E 도 깨진다.
- **Fix:** `case "vi.slot"` 리듀서가 `viSlots` 와 함께 `viTriggers[x]` 를 슬롯 위 병합값으로 다시 계산하게 했다. 순서는 켜진 등록본 → 가장 최근 등록본 → 미등록 null 이다. relay 와이어 계약(slot-only)은 그대로다. 32-13 이 `viTriggers` 를 지울 때 함께 사라진다.
- **Files modified:** `webapp/src/lib/use-relay-socket.ts` · `__tests__/relay-socket.test.ts`(다리 단언 1건)
- **Verification:** relay-socket 154/154, 작업대 VI E2E 14/14, sidebar-tree 12/12
- **Committed in:** `4e2b5596`

**2. [Rule 3 - Blocking] 기존 VI 테스트 이행 (플랜 Task 3 파일 목록 밖 4개)**
- **Found during:** Task 3 GREEN
- **Issue:** `strategy-hub.test.ts` · `strategy-sweeper.test.ts` · `ws-latch.test.ts` · `ws-autosell.test.ts` 가 구 `vi` 프레임과 `getViTrigger` 를 단언했다.
- **Fix:** 단언을 `vi.slot` · `getViSlot` 으로 옮겼다. `strategy-hub` FakeSession 에는 기본 계좌 소유 뷰를 줬다(빈 61 귀속이 소유 계좌를 알아야 한다). 지운 단언에는 사유를 주석 한 줄로 남겼다.
- **Committed in:** `eb2c36bb`

**3. [Rule 2 - 계약 일관] shared `RelayViTriggerMsg` 주석 (Task 3 파일 목록 밖)**
- relay 가 더 내지 않는다는 사실을 타입 문서에 적었다. 코드 변경은 없다. 커밋은 `eb2c36bb` 이다.

**4. [플랜 해석] 「직전 값과 같으면 생략」 → 늘 냄** — 「Decisions Made」 참조.

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2 · Rule 2 ×1) + 1 플랜 해석
**Impact on plan:** 모두 slot-only 결정과 중간 커밋을 녹색으로 유지하는 데 필요했다. 와이어 계약이나 범위는 늘지 않았다.

## Issues Encountered

- **범위 밖 · 안전 결함 후보 — `strategy-sweeper` `#readActive` 가 21 → 61 n 프레임을 모른다.** `deferred-items.md` 「32-11 실행 중」 에 기록했다.
  - 문제: 옛 서버 계좌 전략 끄기는 거래소마다 첫 61 한 프레임만 답으로 본다. 끌 계좌가 첫 선언 계좌가 아니면 그 VI 를 못 보고 `ok` 로 끝날 수 있다.
  - 원인: 와이어(gh-trade Phase 33 — 사용자 말로 이미 전 서버 배포)이고, 이 플랜의 변경 때문은 아니다.
  - 권고: 32-14 relay 배포 전에 같은 배포에 묶을지 판단한다. 재현은 fake gateway 슬롯 모드로 「대상이 둘째 선언 계좌」 케이스를 만들면 된다.

## Known Stubs

없음. 웹 `viTriggers` 다리는 의도한 과도기 코드이고, 32-13 이 소비처를 슬롯으로 옮기면서 지운다.

## User Setup Required

None. 배포(relay 20:00 KST 뒤 → push 연달아)는 32-14 에서 메인 세션이 한다.

## Next Phase Readiness

- 32-12(작업대 VI 설정 행 = 고른 계좌 슬롯)는 `viSlots` · `viSlotOf` · fake gateway `respondViSlots` 를 쓸 수 있다. 결정 안과 무관하다.
- 32-13 은 `slot-only` 라 Flagged assumptions 대로 바뀌는 것이 없다. `case "vi"` 를 지울 때 `viLegacyOf` 다리도 같이 지운다.
- 32-14: 인박스 `done_commit` 에는 `relay_commit: eb2c36bb` 를 쓴다. sweeper n 프레임 결함을 배포에 묶을지 먼저 판단한다.

## Self-Check: PASSED

- 파일: 수정 파일 18개가 디스크에 있다. 새로 만든 파일은 없다.
- 커밋: `4e2b5596` · `18265270` · `eb2c36bb` 가 HEAD 의 조상이다(`git merge-base --is-ancestor`).
- Task 2 acceptance: `"vi.slot"`(shared) 1 · `unregistered()`(envelope) 1 · `function viSlotKey(` 1 · `getViSlot(userId: string, accountNo: string, exchange: RelayExchange)` 1 · `respondViSlots` 2 · `export function viSlotOf(` 1
- Task 3 acceptance: `viRunningElsewhere|stopViElsewhere|VI_BROKER` (relay/src) 0줄 · fanout `getViSlotsAll(` 1 · `getViSlot(` 1 · relay typecheck · typecheck:tests exit 0 · relay 전체 1617/1617 · 「P32 VI 슬롯 다세션」 · 「P32 vi.set 소유 세션」 passed · `relay_commit: eb2c36bb` 커밋 존재
- Plan verification: shared build · relay typecheck ×2 · webapp typecheck exit 0 · relay test FAIL 0 · 작업대 E2E `-g "VI"` 14 passed
