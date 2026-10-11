---
phase: 29-dma-multi-server-admin
plan: 50
subsystem: relay
tags: [relay, dma, registry, journal-access, effective-owner-tracker, gap-closure, gc-07, gc-08, tdd]
requires:
  - phase: 29-46
    provides: "JournalAccess.loaded · 라우팅 mappingLoaded(기본 서버 등록 모름 = 기본) · resolveEffectiveOrderServer"
  - phase: 29-44
    provides: "EffectiveOwnerTracker(전 사용자 유효 주문 서버 스냅샷 · OwnerMove) · fanout.sweepMoved"
provides:
  - "JournalAccess.seedProvisional(from) — 옛 벌 매핑 깊은 사본을 잠정으로(loaded 참 · provisional 참 · DB 동기화 예약 없음 · 옛 벌 미적재면 무동작)"
  - "JournalAccess.provisional getter · health().provisional — 첫 유효 replace 가 거짓으로(빈 스냅샷 거부는 종전 · 잠정 유지)"
  - "ServerPipelines.sync — needsRebuild(주소 변경)로 내린 같은 키만 옛 access 를 기억해 새 벌 onCreated · start 전에 seedProvisional · info 1줄(서버 키 · 잠정 DMA 유저 수)"
  - "EffectiveOwnerTracker.#lastOwner — 계좌별 마지막 정의 소유 서버 · move from = p.owner ?? 기억 · X 복귀 0 · 사라진 계좌 기억 삭제"
affects: [29-51, 29-55, ADMIN-04, ADMIN-06]
actuals:
  tokens: 7600
  tasks: 2
  commits: 4
plan_head_before: 19c87f214dc3d1382b7e1adae935d7d30e873dd7
plan_head_after: 3f28c28aef2c611ae83c55f0673845a5148e60fd
tech-stack:
  added: []
  patterns:
    - "판정 원천에서 「직전 값」 유지 — 재생성으로 생긴 「모름」 을 소비자(fanout 서명 · 라우팅 · 트래커 · 저널 푸시)마다 보류 갈래로 다루지 않고, 원천(매핑)이 잠정 사본을 들어 모든 소비자가 같은 값을 본다"
    - "잠정 매핑은 메모리 전용 — DB 정본은 첫 실제 스냅샷이 종전 규칙으로 덮는다"
    - "이동 추적의 기억 소비 — (없음) 이동이 옛 서버를 실제로 끄는 경우(지금 유효 ≠ from)에만 기억을 버려 같은 from 을 두 번 내지 않는다"
key-files:
  created: []
  modified:
    - relay/src/journal/access.ts
    - relay/src/journal/types.ts
    - relay/src/registry/pipelines.ts
    - relay/src/dma/effective-owner-tracker.ts
    - relay/tests/journal-push.test.ts
    - relay/tests/pipelines.test.ts
    - relay/tests/effective-owner-tracker.test.ts
key-decisions:
  - "29-50: GC-07 — 서버 주소 변경으로 같은 키 파이프라인을 다시 만들면 옛 벌 매핑을 새 벌에 잠정으로 옮긴다(onCreated · start 전). serversFor · 소유 판정 · 트래커 · fanout 서명 · 저널 푸시가 같은 직전 값을 본다. fanout · index 무수정(판정 두 벌 금지)"
  - "29-50: 잠정 매핑은 DB 에 쓰지 않는다 — 새 주소의 첫 유효 79/87 이 교체하며 provisional 을 끝낸다. 빈 스냅샷 거부 규칙은 그대로라 빈 79 는 잠정을 지우지 않는다. 행 제거 · 꺼짐으로 내린 벌은 잠정 대상이 아니다(다시 켜면 loaded 거짓부터)"
  - "29-50: 옛 벌이 한 번도 적재되지 않았으면 seedProvisional 은 무동작 — 「모름」 그대로가 사실이고 29-46 loaded 갈래가 다룬다"
  - "29-50: GC-08 — 트래커가 계좌별 마지막 정의 소유 서버를 기억해 X → (없음) → Y 의 두 번째 단계에서 from = X 로 낸다. 단 X → (없음) move 가 그때 이미 실행 가능했으면(지금 유효 ≠ X — 소비자가 X 를 끈다) 기억을 소비한다. 그래서 29-44 「소유자 없음 → KB121 은 from undefined」 단언이 무수정으로 남는다"
patterns-established:
  - "같은 키 재생성은 상태(매핑)를 잠정으로 승계한다 — 연결 · 커서 · 기록기는 새로, 판정 원천은 직전 값으로"
requirements-completed: [ADMIN-06, ADMIN-04]
coverage:
  - id: D1
    description: "GC-07 — KYOBO119 port 변경 sync → 새 벌 매핑이 79 전부터 옛 집합(loaded · provisional) · createOrderServerRouting serversFor 전후 같음 · 새 79 가 잠정을 실제 매핑으로 교체 · DB 동기화는 실제 스냅샷만"
    requirement: "ADMIN-04"
    verification:
      - kind: integration
        ref: "relay/tests/pipelines.test.ts#⑧ (29-50 GC-07) 주소 변경 재생성 → 새 벌 매핑이 79 전부터 옛 매핑(잠정) · serversFor 전후 같음 · 새 79 가 잠정을 교체"
        status: pass
      - kind: integration
        ref: "relay/tests/pipelines.test.ts#⑧-b (29-50 GC-07) 끄기 · 행 제거로 내린 벌은 잠정 대상이 아니다"
        status: pass
    human_judgment: false
  - id: D2
    description: "GC-07 — JournalAccess.seedProvisional 사본 · DB 동기화 0 · 빈 스냅샷은 잠정 유지 · 첫 유효 replace 가 교체 · health().provisional"
    requirement: "ADMIN-04"
    verification:
      - kind: unit
        ref: "relay/tests/journal-push.test.ts#29-50 GC-07 — seedProvisional: 옛 매핑 사본 · loaded · provisional · DB 동기화 0 · 첫 유효 replace 가 교체 · 빈 스냅샷은 잠정 유지"
        status: pass
    human_judgment: false
  - id: D3
    description: "GC-08 — 트래커 X → (없음) → Y = from X · X → (없음) → X = 0 · 모든 매핑에서 사라지면 기억 삭제 · 29-44 기존 6케이스 · order-server-resync 무수정 green"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/effective-owner-tracker.test.ts#GC-08 X → (없음) → Y"
        status: pass
      - kind: unit
        ref: "relay/tests/effective-owner-tracker.test.ts#GC-08 X → (없음) → X"
        status: pass
      - kind: unit
        ref: "relay/tests/effective-owner-tracker.test.ts#GC-08 기억 정리"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/relay exec vitest run tests/order-server-resync.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "운영에서 /admin/servers 로 서버 주소를 고쳐도 그 서버 사용자가 1012 로 끊기거나 계좌가 숨지 않는다(실 relay · 실 게이트웨이)"
    requirement: "ADMIN-04"
    verification: []
    human_judgment: true
    rationale: "실 운영 relay 배포 · 실 게이트웨이 주소 편집은 이 플랜 범위 밖(코드 · 테스트만 · 장 시간 VM 무접촉) — 배포 뒤 확인"
duration: 6min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 50: 주소 편집 재생성 잠정 매핑 (GC-07) · 트래커 두 단계 이동 (GC-08) Summary

**서버 주소를 고쳐 같은 키 파이프라인을 다시 만들면 옛 매핑을 새 벌에 잠정(메모리 전용)으로 옮겨 79/87 전에도 serversFor · 재수립 서명이 그대로다. EffectiveOwnerTracker 는 계좌별 마지막 정의 소유 서버를 기억해 X → (없음) → Y 이동에서도 옛 서버 X 를 from 으로 낸다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-10-11T01:10:59Z
- **Completed:** 2026-10-11T01:16:43Z
- **Tasks:** 2 (트레이서 1 + auto 1, 둘 다 TDD)
- **Files modified:** 7

## Accomplishments

- **GC-07 닫음.** `/admin/servers` 주소 편집 → `needsRebuild` 재생성 → 새 `JournalAccess` 가 79/87 전부터 옛 매핑을 잠정으로 든다(`loaded` 참 · `provisional` 참). 그래서 `createOrderServerRouting().serversFor` 결과가 재생성 전후 같다. 이어지는 `resyncChangedUsers("registry")` 서명 비교도 그 서버 사용자를 1012 로 끊지 않고, 계좌도 숨지 않는다. 새 주소의 첫 유효 79 가 잠정을 실제 매핑으로 바꾼다.
- **잠정 매핑은 DB 에 쓰지 않는다.** 통합 테스트에서 KYOBO119 의 `dma_journal_sync_access` 호출은 옛 벌 1번과 새 79 1번, 합 2번뿐이다. 마지막 `p_rows` 는 새 주소의 실제 계좌 2개다.
- **GC-08 닫음.** 지정 서버 KB121 에서 계좌 A 등록을 빼는 순서는 두 단계다(87 → 지정 재적재). 이제 두 번째 단계가 `{ from: KB121, to: KB120 }` move 를 낸다(종전 0). 연결 없는 사용자의 옛 서버 전략도 `sweepMoved` 가 끈다. X 로 돌아오면 move 0 이다. 모든 매핑에서 사라진 계좌의 기억은 지운다.
- **운영 보존.** 주소를 편집하지 않는 경로는 종전과 같다. pipelines ①~⑦, tracker 기존 6케이스, order-server-resync 를 고치지 않았고 모두 green 이다. relay 전체 스위트 57파일 · 1453 테스트도 green 이다.

## Task Commits

1. **Task 1 (트레이서): 주소 변경 재생성 → 잠정 매핑 → serversFor 무변화 → 첫 79 교체**
   - RED `99d81650` (test): journal-push GC-07 단위 · pipelines ⑧/⑧-b · WR-04 health 단언에 `provisional` 키
   - GREEN `3b998c99` (fix): `seedProvisional` · `provisional` · `health().provisional` · `sync` 결선
2. **Task 2: 트래커 마지막 정의 소유 서버 기억 (GC-08)**
   - RED `22971718` (test): GC-08 세 케이스
   - GREEN `3f28c28a` (fix): `#lastOwner` · `rememberOwners` · from 대체값 · 기억 소비

## TDD 기록

- **Task 1 RED:** pipelines ⑧ 은 334행 `expect(fresh?.access.loaded).toBe(true)` 에서 실패했다(받은 값 false). 재생성 직후 새 벌 매핑이 비어 있다는 GC-07 결함 그대로다. ⑧-b 와 journal-push 단위 케이스는 `provisional` 이 아직 없어서(undefined · `seedProvisional is not a function`) 실패했다. WR-04 세 단언은 `provisional` 키가 없어서 실패했다. 모두 계획한 단언에서 실패했다. 구문 · 로드 오류는 없다.
- **Task 1 GREEN:** 4파일 55테스트 green. tracer 게이트(interactive · end-of-phase · automated-only)는 verify 를 다시 돌려 통과한 뒤 진행했다.
- **Task 2 RED:** 「X → 없음 → Y」 는 `from: undefined` 를 받아 실패했다(기대 KB121). 「X → 없음 → X」 는 `{ from: undefined, to: KB121 }` move 를 받아 실패했다(기대 0). 둘 다 GC-08 결함 그대로다. 「기억 정리」 케이스는 종전 코드에서도 통과한다. 기억이 생긴 뒤 계좌가 사라졌을 때 기억이 되살아나지 않는지 보는 회귀 가드다.
- **Task 2 GREEN:** tracker 9 · order-server-resync 포함 31테스트 green.
- REFACTOR 커밋 없음.

## Files Created/Modified

- `relay/src/journal/access.ts` — `#provisional` · `get provisional` · `seedProvisional(from)`(깊은 사본 · DB 예약 없음 · 옛 벌 미적재면 무동작) · `replace` 유효 적용 때 잠정 끝 · `health().provisional` · 머리 주석 GC-07 문단
- `relay/src/journal/types.ts` — `JournalMappingHealth.provisional?`(선택 키 · `/healthz` 표시 신호)
- `relay/src/registry/pipelines.ts` — `sync` 가 `needsRebuild` 갈래의 옛 access 를 기억해 두고, 새 벌 생성 직후 `onCreated` 전에 `seedProvisional` 을 부르고 info 1줄을 남긴다 · `needsRebuild` 주석(증권사 접두 키 → 주소 변경이 재생성의 전부)
- `relay/src/dma/effective-owner-tracker.ts` — `#lastOwner` · `rememberOwners` · `from = p.owner ?? 기억` · `from === to` 면 move 아님 · 실행 가능한 (없음) 이동은 기억 소비 · 머리 주석 GC-08
- `relay/tests/journal-push.test.ts` — GC-07 단위 케이스 1 · WR-04 health 단언 3곳에 `provisional: false`
- `relay/tests/pipelines.test.ts` — ⑧ · ⑧-b (실 `ServerPipelines` · 스텁 게이트웨이 3대 · 실 `createOrderServerRouting`)
- `relay/tests/effective-owner-tracker.test.ts` — GC-08 케이스 3

## Decisions Made

- 위 frontmatter `key-decisions` 4건. 핵심은 「모름」 을 판정 원천(매핑)에서 직전 값으로 채운다는 것이다. 그래서 fanout 에 보류 갈래를 따로 두지 않았다. 잠정 매핑의 수명은 첫 유효 스냅샷까지다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 트래커 기억 규칙을 「실행 가능한 (없음) 이동이면 기억 소비」 로 좁혔다**
- **Found during:** Task 2
- **Issue:** 플랜 문자 그대로 「소유 서버가 undefined 인 계좌는 직전 기억을 그대로 둔다」 를 따르면 29-44 기존 케이스 「지정 서버 매핑에 계좌가 없으면 소유자 없음」 의 두 번째 단계가 `{ from: undefined, to: KB121 }` 에서 `{ from: KB120, to: KB121 }` 로 바뀐다. 그 케이스에서는 첫 move(KB120 → 없음)가 그때 유효 서버가 이미 KB121 이라 소비자가 KB120 을 실제로 끈다. 같은 from 을 두 번 내는 중복이고, 「기존 6케이스 무수정 green」 수용 기준과도 부딪힌다.
- **Fix:** (없음)으로 가는 move 의 `from` 이 그때 유효 서버와 다르면(소비자 `sweepMoved` 가 그 서버를 실제로 끈다) 그 기억을 소비한다. 그때 유효 서버가 아직 from 이면(GC-08 — 소비자가 건너뜀) 기억을 남긴다. 이 판정은 소비자 규칙(`#sweepMovedUser` — 「지금 유효 = from 은 끄지 않음」)과 같다. 소유자 없음 → 없음 구간에서 유효 서버가 바뀌어도 move 를 내지 않았으니 기억은 남는다.
- **Files modified:** relay/src/dma/effective-owner-tracker.ts
- **Verification:** tracker 9케이스(기존 6 무수정) · order-server-resync 무수정 green
- **Committed in:** 3f28c28a

**2. [Rule 3 - Blocking] `JournalMappingHealth` 에 `provisional?` 추가 · WR-04 health 단언 3곳 갱신**
- **Found during:** Task 1
- **Issue:** 플랜이 `health()` 에 `provisional` 키를 더하라고 했다. 그러면 journal-push WR-04 의 `toEqual` 세 단언이 키 하나 차이로 깨진다. `/healthz` 형(`JournalMappingHealth`, types.ts — 플랜 files_modified 밖)에도 그 키가 없다.
- **Fix:** WR-04 단언에 `provisional: false` 를 더했다(의미 불변). `JournalMappingHealth.provisional` 은 선택 키로 두었다. 그래서 journal-status 테스트 스텁(3키)은 고치지 않았다.
- **Files modified:** relay/src/journal/types.ts, relay/tests/journal-push.test.ts
- **Verification:** typecheck · typecheck:tests · journal-status/boot/observer 86테스트 green
- **Committed in:** 99d81650 (테스트) · 3b998c99 (형)

---

**Total deviations:** 2 auto-fixed (Rule 1 1건 · Rule 3 1건)
**Impact on plan:** 둘 다 수용 기준(기존 케이스 무수정 green)과 플랜 산출물(health 키)을 함께 지키려고 필요했다. 범위는 넓히지 않았다. fanout · index 는 고치지 않았다.

## Issues Encountered

None

## Known Stubs

None

## User Setup Required

None - 외부 서비스 설정 없음. 배포는 하지 않았다. relay 배포는 메인 세션 몫이다(장 시간 VM 무접촉).

## Next Phase Readiness

- 같은 wave 의 29-51(hub · fanout) · 29-55(webapp Admin · order-api · index)와 파일이 겹치지 않는다.
- 운영 확인(D4)은 relay 배포 뒤 `/admin/servers` 에서 주소를 편집해 해야 한다. 확인할 것은 세 가지다: 사용자가 1012 로 끊기지 않는지, `/healthz` `journal.mapping.provisional` 이 참에서 거짓으로 바뀌는지, `[registry] 재생성 벌에 직전 매핑을 잠정으로` info 가 1줄 찍히는지.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*
