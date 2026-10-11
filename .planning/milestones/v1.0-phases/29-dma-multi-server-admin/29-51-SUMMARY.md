---
phase: 29-dma-multi-server-admin
plan: 51
subsystem: relay
tags: [relay, dma, g-1, vi, hub, fanout, gap-closure, gc-05, tdd]
requires:
  - phase: 29-49
    provides: "hub 세션 대여(lendSession · #lent · 배수 #drainViGets · 반납 #endLease) — VI 원천 판정을 따라가도록 이 플랜이 소유 키 단위로 넓혔다"
  - phase: 29-45
    provides: "fanout (사용자, 서버) sweep 레인 · StrategySweeper releaseSession"
  - phase: 29-35
    provides: "hub primary 선호 서버 · 소유 뷰 필터 ownedAccountsOf · 같은 증권사 두 서버 세션 공존"
provides:
  - "hub #viSourceOwners(userId) — VI 원천 = 사용자의 KB 세션 각각(결선 순 · KB 세션이 없으면 primary)"
  - "hub VI 캐시 소유 키 단위 — #viTriggers(`${owner}|거래소`) · #viTriggerSeq · #pendingViGets(소유 키) · #viOrders(`${owner}|주문번호`)"
  - "hub 거래소 병합 — getViTrigger(userId, exchange) = 켜진 등록본(둘 이상이면 primary + warn) → 마지막 에코 등록본 → 기다리는 원천 없이 전부 미등록 null → 모름"
  - "hub viRunningElsewhere(userId, exchange, session) · viOrderSessionOf(userId, orderNo) · getViOrders 합집합"
  - "fanout #viSessionFor(계좌 소유 세션이 KB 면 그것 · 아니면 primary) · vi.set(run:true) 다른 서버 켜진 VI 먼저 run:false · vi.confirm 주문 소유 세션"
affects: [29-52, 29-54, ADMIN-06]
actuals:
  tokens: 14741
  tasks: 2
  commits: 4
plan_head_before: 8a17ed326103d46be980a299e41929e962ecdb7d
plan_head_after: b93dac50c590a762835c265ab525d86b38c8052e
tech-stack:
  added: []
  patterns:
    - "원천 여럿의 병합 팬아웃 — 원천 칸은 소유 키별로 두고, 브라우저 프레임은 사용자 단위 병합값 하나. 그 61 을 낸 원천 칸이 곧 병합값이면 같은 값이어도 매번 내고(사용자 조작 에코), 아니면 병합값이 바뀔 때만 낸다"
    - "3상태 병합 — 「모름」 은 답을 기다리는 원천(그 거래소 21 이 대기열에 있거나 대여로 21 을 미룸)이 있을 때만. 묻지 않은 원천 · Ready 전 원천은 기다리지 않는다"
    - "세션 경계 너머 단일 슬롯 — 다른 서버 세션의 같은 슬롯 켜진 값을 먼저 끄고(실패하면 켜기 미송신) 대상 세션에 켠다"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-51-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-51-task2-red.json
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/fanout-multi-session.test.ts
key-decisions:
  - "29-51: VI 원천은 사용자의 KB 세션 각각이다(서버 축만 계좌 소유로 넓힘 · 증권사 축 KB 그대로). KB 세션이 하나도 없는 사용자(교보만)는 종전대로 primary 가 원천이다 — 교보만 사용자의 VI 동작 무변경"
  - "29-51: 소유 뷰 밖 61 본문은 캐시 · 팬아웃하지 않는다. 다만 그 61 이 그 세션 21 의 답이거나 그 칸에 소유 계좌 등록본이 있었으면 그 세션 몫 그 칸을 미등록(null)으로 둔다 — 서버 칸은 거래소당 1건이라 다른 계좌가 차지했다는 사실이고, 그래야 병합 3상태가 끝난다"
  - "29-51: 병합 「모름」 은 그 거래소 21 답을 기다리는 원천이 있을 때만이다(Ready 인데 묻지 않은 원천은 기다리지 않는다) — 결선 전에 이미 Ready 인 세션 등 프리페치가 없는 원천이 null 을 영영 막지 않게"
  - "29-51: primary 교체는 primary 몫(43 · 84 · 76/78 · 77)만 정리 · 요청한다. VI 원천은 primary 와 무관(KB 세션 각각)이라 21 · 34 재요청 · VI 캐시 폐기가 없다"
  - "29-51: vi.set 가드는 run:true 일 때만 · 다른 VI 원천 세션에만 · 그 세션 61 에코로 아는 값 그대로 run 만 false. 끄기 송신이 실패하면 거부 프레임 뒤 켜기도 보내지 않는다(두 서버 동시 켜짐보다 안전)"
patterns-established:
  - "VI 같은 사용자 단위 표시 원천이 서버 축으로 여럿이 될 때 — 캐시는 소유 키 단위 · 브라우저 계약은 그대로 · hub 가 병합"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "GC-05 트레이서 — vi.set(A) 는 계좌 소유 KB121 세션으로(KB120 0 · 거부 0) · KB121 61 에코가 브라우저 vi KRX = A 로 · 두 KB 세션 각각 21 KRX · NXT · B 의 vi.set 은 KB120"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#GC-05 (29-51) 트레이서 — vi.set(A) 는 계좌 소유 KB121 세션으로 · KB121 61 에코 → 브라우저 vi KRX = A · 두 KB 세션 각각 21 KRX · NXT · vi.set(B, NXT) 는 KB120"
        status: pass
    human_judgment: false
  - id: D2
    description: "VI 원천 = KB 세션 각각 · 소유 뷰 필터 · 거래소 병합 3상태(켜진 우선 · 마지막 에코 · 둘 다 켜짐 primary + warn · 전부 미등록 null · 모름 무송신) · 교보 세션 원천 아님"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 Ready 프리페치 — KB 세션 각각 21(KRX · NXT) · 34 · 43 은 primary(KB120)만 · 교보 세션은 24 만 · 교보 61 은 원천 아님"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 소유 뷰 밖 61 은 원천 아님"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 거래소 병합 3상태"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 병합 — 켜진 등록본 우선 · 둘 다 꺼짐이면 마지막으로 에코가 온 세션의 등록본"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 병합 — 두 세션 모두 켜짐 → primary 것 + warn 1줄"
        status: pass
    human_judgment: false
  - id: D3
    description: "세션 경계 너머 거래소당 켜진 VI 1건 — KB120 KRX 켜진 B 인 채 vi.set(A, run:true) → KB120 11{B 같은 값 · run:false} 먼저 · KB121 11{A, run:true} · 브라우저 (B false) 뒤 (A true) · run:false 무가드 · 같은 세션 무가드"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#GC-05 가드 — KB120 에 KRX 켜진 B 인 채 vi.set(A, KRX, run:true)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#GC-05 가드 없음 — run:false"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#GC-05 가드 없음 — 같은 세션"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 viRunningElsewhere"
        status: pass
    human_judgment: false
  - id: D4
    description: "72/73 소유 세션별 캐시 합집합(vi.list 스냅샷 = 합집합 · 73 증분 · 소유 밖 항목 버림) · 56 소유 세션 계좌만 · vi.confirm 주문 소유 세션(모르면 primary) · KB121 분리 시 그 몫 정리 · 병합 · 합집합 재팬아웃"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 72/73 — 소유 세션별 캐시의 합집합"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 56 — VI 발동 통보는 그 계좌의 소유 세션 것만 팬아웃"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#GC-05 vi.confirm — 그 주문번호가 든 VI 주문 추적의 소유 세션(KB121)으로"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#GC-05 KB121 분리(retainSessions)"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 보존 — KB 세션 1개 사용자(지금 운영 전부)의 VI 프리페치 · 귀속 · vi.set · vi.confirm · 브라우저 vi 프레임 종전과 같음 · 교보 세션 VI 요청 0 · relay 전량 회귀"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#① 두 증권사 계좌 사용자 — … 교보는 24 만(21 · 34 · 43 은 KB) (무수정)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts · relay/tests/strategy-hub.test.ts · relay/tests/fanout.test.ts ⑰-c · ⑱ (무수정)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1467)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실 게이트웨이 두 서버(KB120 · KB121)에서 지정 계좌 VI 설정 · 「옮기기」 · 가드 끄기가 VI 카드에 의도대로 보이는지(에코 도착 순서 포함)"
    verification: []
    human_judgment: true
    rationale: "스텁 게이트웨이 · 가짜 세션으로 고정했지만 두 실서버 61 에코의 도착 순서와 운영 지정 계좌 화면은 운영 관찰이 필요하다(지금 운영은 지정 0 · 두 번째 서버 꺼짐 · 배포는 메인 세션 몫)"
duration: 19min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 51: 지정 계좌 VI — 계좌 소유 세션 원천 · 거래소 병합 (GC-05) Summary

**`vi.set` 은 그 계좌의 소유 KB 세션(KB121 지정이면 KB121)으로 가고, hub 는 사용자의 KB 세션 각각에서 VI(61 · 72/73 · 56)를 받아 소유 뷰로 거른 뒤 거래소마다 하나로 병합해 같은 VI 카드 칸에 보낸다. 두 서버에 같은 거래소 VI 가 동시에 켜지지 않게, 켜기 전에 다른 서버의 켜진 VI 를 같은 값 run:false 로 먼저 끈다.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-11T01:19:06Z
- **Completed:** 2026-10-11T01:37:57Z
- **Tasks:** 2 (TDD — 커밋 4)
- **Files modified:** 4 (+ RED 증거 2)

## Accomplishments

- **GC-05 닫음 — 지정 계좌가 VI 기능을 잃지 않는다.**
  - `vi.set(A)` 의 세션은 계좌 소유 KB 세션이다(`#viSessionFor`). 그래서 KB121 로 지정한 A 는 KB121 로 가고, 「이 세션에서 사용할 수 없는 계좌」 거부가 없다.
  - 계좌 대조는 그 세션의 `allowedAccounts`(소유 뷰)로 종전처럼 한다(T-16-01).
  - KB121 의 61 에코가 hub 소유 키 칸을 거쳐 브라우저 `{t:"vi", x:"KRX", cfg:A}` 로 온다. 트레이서는 실 WsFanout · SessionManager · hub 와 스텁 두 대로 고정했다.
- **VI 원천 = 사용자의 KB 세션 각각.**
  - Ready 마다 KB 세션 각각이 21(KRX · NXT) · 34 를 보낸다. 21 대기열은 소유 키별이다. 43 은 primary 만이고, 교보 세션은 24 만 보낸다.
  - 61 본문 계좌가 그 세션 소유 뷰 밖이면(옛 서버에 남은 지정 계좌 VI) 원천이 아니다.
  - 브라우저 계약 `{t:"vi", x, cfg}` 는 거래소당 1건 그대로다. 병합 순서는 켜진 등록본 → 마지막 에코의 등록본 → 전부 미등록 null 이다. 아무도 답하지 않았으면 보내지 않는다.
- **세션 경계 너머 거래소당 켜진 VI 1건.**
  - `vi.set(run:true)` 를 보낼 때 다른 서버 세션에 같은 거래소 켜진 VI 가 있으면, 그 세션에 같은 값 run:false 를 먼저 보낸다.
  - 브라우저는 run:false 에코 뒤 run:true 에코를 받는다. 웹 「옮기기」 흐름과 같은 결과다.
  - run:false 로 보내는 vi.set 과 같은 세션 안의 교체에는 가드가 없다.
- **72/73 · 56 · vi.confirm.**
  - 72/73 은 소유 세션별 캐시이고 `vi.list` 스냅샷은 그 합집합이다. 소유 밖 항목은 버린다.
  - 56 은 통보 계좌의 소유 세션 것만 브라우저로 간다.
  - `vi.confirm` 은 그 주문번호를 추적하는 소유 세션으로 간다. 모르는 주문번호는 primary 로 간다(종전).
- **정리.** 세션 분리 · 원천 전환 때는 그 소유 키의 VI 설정 · 순번 · 주문 · 21 대기열을 지운다. 남은 원천 기준 병합값과 추적 합집합을 다시 내보낸다.
  - primary 교체는 primary 몫(43 · 84 · 76/78 · 77)만 처리한다.
  - 29-49 대여 배수 · 반납 재요청 판정은 「그 소유 키가 VI 원천」 · 소유 키 대기열을 따른다(29-49 인계 메모 반영).
- **운영 보존.** 지금 운영은 사용자마다 KB 세션이 하나라 「원천 1개짜리 병합」이고 종전과 같다. relay 전량 57 파일 · 1467 건이 green 이다.

## Task Commits

1. **Task 1 RED:** GC-05 트레이서 실패 테스트 — vi.set(A) 계좌 소유 KB121 · KB 세션 각각 21 · 소유 뷰 필터 · 병합 3상태 — `80e1e8f1` (test)
2. **Task 1 GREEN:** 지정 계좌 VI — 명령은 계좌 소유 세션 · 원천은 KB 소유 세션 병합 — `2a70a499` (fix)
3. **Task 2 RED:** 병합 정책 · 가드 · 72/73 · 56 · vi.confirm · 분리 정리 실패 테스트 — `1674549a` (test)
4. **Task 2 GREEN:** VI 거래소 병합 · 세션 경계 너머 켜진 VI 1건 · 72/73 · 56 · vi.confirm 소유 세션 — `b93dac50` (fix)

## TDD Gate Compliance

- **Task 1 RED** (`80e1e8f1`): 트레이서가 계획된 첫 GC-05 단언(두 KB 세션 각각 21)에서 실패했다. KB121 에 21 이 0 건이었다(VI 원천이 primary 전용). hub 단위 GC-05 3건과 29-35 갱신 케이스 3건도 같은 원인으로 실패했다. 증거는 `.red/29-51-task1-red.json` 이고 판정은 RED_EVIDENCE_OK 다.
- **Task 2 RED** (`1674549a`): 타깃 hub 72/73 케이스가 합집합 단언에서 AssertionError 로 실패했다(`[O1]` ≠ `[O1, O2]` — KB121 72 가 primary 전용 규칙으로 버려짐).
  - 병합 2건 · 56 · fanout 가드 · vi.confirm 도 계획된 단언에서 실패했다.
  - `viRunningElsewhere` · `viOrderSessionOf` 미구현 2건은 TypeError 로 실패했다. 타깃이 아닌 보조 실패다.
  - 무가드 2건(run:false · 같은 세션)은 지금 코드에서도 green 이라 회귀 가드로 남겼다.
  - 증거는 `.red/29-51-task2-red.json` 이고 판정은 RED_EVIDENCE_OK 다.
- **GREEN:** `2a70a499` · `b93dac50` 이다. 이 phase 관례대로 `fix(29-51)` 이다. REFACTOR 커밋은 없다.
- **Tracer feedback gate:** interactive · end-of-phase · `<automated>` 만이라 verify 를 끝에서 끝까지 재실행했고 통과했다(4 파일 · 162). 그 뒤 Task 2 로 확장했다.

## D-18 개정 기록

29-CONTEXT.md 는 고치지 않았다. 결정 원문은 사용자 확인 기록이라, 개정 사실은 이 실행 기록에 남긴다.

- **개정 전 (29-CONTEXT D-18 원문):** 「VI · 사용자 설정(84) · 돌파 집합(76/78) 은 KB(사용자의 첫 증권사) 세션만 원천」. 구현은 hub 의 「61 · 72/73 · 56 = primary 전용」 이었고, `vi.set` · `vi.confirm` 세션은 `primaryOf` 였다.
- **개정 후 (이 플랜 · 오케스트레이터 결정 4 · GC-05):** VI 만 「사용자의 **KB 세션 각각**」 으로 넓혔다. 대상은 61 · 72/73 · 56 원천과 `vi.set` · `vi.confirm` 세션이다(계좌 소유 세션 · 소유 뷰 필터 · 거래소 병합).
  - **증권사 축은 KB 그대로다.** 서버 축만 계좌 소유로 넓혔다.
  - 구현 위치는 hub `#viSourceOwners` · `#mergeVi` 와 fanout `#viSessionFor` · `#stopViElsewhere` · `vi.confirm` 의 `viOrderSessionOf` 다.
- **그대로인 것:**
  - 84 사용자 설정 · 76/78 돌파 · 77 예약 창은 primary 원천이다(D-18 원문 그대로). 43 요청도 primary 세션만이다.
  - **교보 VI 무변경.** KB 세션이 있는 사용자의 교보 세션으로는 21 · 34 · 11 을 보내지 않는다. 교보 계좌 `vi.set` 은 종전대로 primary 로 가서 「이 세션에서 사용할 수 없는 계좌」 로 거부된다.
    - 근거 테스트(무수정 green): fanout-multi-session 29-20 「① 두 증권사 계좌 사용자 — … 교보는 24 만(21 · 34 · 43 은 KB)」, hub-multi-session 29-20 「교보(primary 아님) 세션의 같은 프레임은 캐시 0 · 팬아웃 0 · 프레임마다 debug 로그 1 · default 계수 0」 · 「Ready 프리페치 — 24 · 25 는 세션마다, 21 · 34 · 43 은 primary 만」.
    - 근거 테스트(이 플랜): 「GC-05 Ready 프리페치 — … 교보 세션은 24 만 · 교보 61 은 원천 아님」.
  - KB 세션이 하나도 없는 사용자(교보만)는 종전대로 primary(교보)가 VI 원천이다. 근거 테스트(무수정 green): 「KB 세션이 없는 사용자(교보만) → 교보가 primary 라 반영된다」 · 「KB 분리 → primary = 교보 · … Ready 교보로 21 · 34 · 43 요청」.
- **운영 영향:** KB 세션 1개 사용자(지금 운영 전부 — 지정 0)는 종전과 같다. VI 프리페치 · 귀속 · `vi.set` 세션 · 브라우저 `vi` 프레임 모두 「원천 1개짜리 병합」 이다.
  - 근거 테스트(무수정 green): `hub.test.ts` 전량 · `strategy-hub.test.ts` 전량 · `fanout.test.ts` ⑰-c · ⑱(단일 세션 vi.set · vi.confirm).
- **N-01(「전부 정지」 가 primary 세션으로만 감)은 이 플랜이 건드리지 않았다.** `strategies.disable` 분기는 무변경이고, 29-54 가 고친다.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — 머리 표 61 · 72/73 · 56 줄과 「Phase 29-51 VI 계좌 소유 세션 원천」 문단을 고쳤다.
  - 추가: `#viSourceOwners` · `#isViSource` · `#fromViSource` · `#syncViSources` · `#lastViSources` · `#mergeVi` · `#emitVi` · `#reemitVi` · `#clearViOwner` · `#viEmitted` · `#viTriggerSeq` · `#viListDirty` · `viRunningElsewhere` · `viOrderSessionOf`.
  - 고친 것: VI 캐시 · 21 대기열 · 주문 키를 소유 키로 바꿨다. `requestStrategySnapshot` 을 VI 원천 · primary 로 나눴고(`#requestViSnapshot` · `#requestPrimarySnapshot` = 43), `#onViOrderList` 에 소유 필터 · 합집합 스냅샷을 넣었다. 56 소유 필터와 29-49 대여 배수 · 반납의 VI 원천 판정도 고쳤다.
- `relay/src/ws/fanout.ts` — `VI_BROKER` · `#viSessionFor` · `#readySession`(① 확인 공용) · `#stopViElsewhere`(가드) · `#entrySessionOf` 를 넣었다. `vi.set` · `vi.confirm` 분기도 고쳤다.
- `relay/tests/hub-multi-session.test.ts` — describe 「VI 계좌 소유 세션 원천 (GC-05 · 29-51)」 9건을 넣었다.
  - 29-35 primary 선호 2건을 VI 원천 KB 세션 각각으로 갱신했다.
  - 29-49 분리 케이스는 되돌아온 KB121 Ready 가 자기 21 을 보내도록 갱신했다.
- `relay/tests/fanout-multi-session.test.ts` — G-1 describe 에 트레이서 · 가드 · 무가드 2건 · vi.confirm 을 넣었다. 29-35 「생성 순서」 케이스는 갱신했다.

## Decisions Made

- 위 frontmatter key-decisions 5건이다. 플래너 재량 (1)~(3) 은 그대로 따랐다: VI 원천 증권사 KB · 거래소 병합 · 세션 경계 너머 가드.
- 병합 팬아웃 규칙: 그 61 을 보낸 원천 칸이 곧 병합값이면 같은 값이어도 낸다(사용자 조작 에코는 종전처럼 매번). 다른 원천의 61 이나 원천 정리는 병합값이 바뀔 때만 낸다. 그래서 다른 서버의 미등록 · 꺼진 칸이 카드 칸을 흔들지 않는다.
- 되돌아온 Ready 세션 결선(`attach` rewired)은 `#afterPrimaryChange` 에 `readyHandled` 를 넘긴다. 원천 정리 · primary 43 이 곧 오는 `#onReady` 와 겹쳐 보내지 않게 하려는 것이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] KB 세션이 없는 사용자의 VI 원천 = primary(교보) 유지**
- **Found during:** Task 1 (hub `#viSourceOwners`)
- **Issue:** 계획 문구는 「broker 가 KB 인 결선 소유 키」 다. 그대로 두면 교보만 가진 사용자의 VI 가 사라진다. 기존 29-20 테스트(「KB 세션이 없는 사용자(교보만)」 · 「KB 분리 → primary = 교보 … 21 · 34 · 43」)가 지키는 종전 동작이 깨진다.
- **Fix:** KB 세션이 하나도 없으면 primary 하나를 원천으로 둔다. KB 세션이 있는 사용자의 교보 세션은 계획대로 원천이 아니다. `#syncViSources` 가 원천 전환(KB 결선 · 분리)을 정리한다.
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** hub-multi-session 29-20 케이스 무수정 green
- **Committed in:** 2a70a499

**2. [Rule 1 - Bug] 소유 뷰 밖 61 이 그 세션 21 의 답이면 그 칸을 미등록으로 기록**
- **Found during:** Task 1
- **Issue:** 본문을 그냥 버리면 그 세션은 그 거래소를 영영 답하지 않은 원천으로 남는다. 그래서 다른 원천이 미등록이어도 병합 null 이 나가지 않고, 운영에서 카드 칸이 「모름」 에 멈춘다.
- **Fix:** 본문은 캐시 · 팬아웃하지 않는다(계획대로). 다만 그 61 이 그 세션 21 의 답이거나 그 칸에 소유 등록본이 있었으면 그 칸을 null 로 둔다. 묻지 않은 칸의 에코는 무변경이다 — 계획 단위 케이스 「캐시 · 팬아웃 0」 그대로다.
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** 「GC-05 소유 뷰 밖 61 은 원천 아님」 · fanout 「생성 순서」 green
- **Committed in:** 2a70a499

**3. [Rule 1 - Bug] 병합 「모름」 판정 = 그 거래소 21 을 기다리는 원천이 있을 때만**
- **Found during:** Task 1 (29-49 대여 케이스 회귀)
- **Issue:** 「Ready 인데 아직 답 없는 원천」 을 기다리면, 결선 전에 이미 Ready 인 세션처럼 hub 프리페치가 없는 원천이 null 을 영영 막는다.
- **Fix:** 기다리는 원천 = 그 거래소가 21 대기열에 있거나, 대여로 21 을 미룬(`refetchVi`) 원천이다.
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** hub-multi-session 29-49 「GC-04 primary 아닌 세션 대여」 무수정 green · 「GC-05 거래소 병합 3상태」 green
- **Committed in:** 2a70a499

**4. [Rule 3 - Blocking] 기존 테스트 2건 갱신 (계획 명시 밖)**
- **Found during:** Task 1
- **Issue:** fanout-multi-session 29-35 「생성 순서」(KB121 21 · 34 = 0 · VI 61 은 KB120 것만)와 hub-multi-session 29-49 「교체 · 분리 · closeAll」 (2)(되돌아온 KB121 21 = 0)는 옛 「VI = primary 전용」 규칙을 단언한다. 계획은 hub 쪽 29-35 케이스 갱신만 적었다.
- **Fix:** 새 규칙으로 갱신했다. 「생성 순서」 는 KB121 이 hub 결선 전에 이미 Ready 라 hub 프리페치가 없다. 그래서 KB121 21 수는 단언하지 않고 트레이서가 본다. 소유 뷰 안/밖 61 은 단언한다. 29-49 (2)는 KB121 자기 Ready 21 을 단언하고, 반납이 21 을 더 보내지 않는지를 단언한다.
- **Files modified:** relay/tests/fanout-multi-session.test.ts · relay/tests/hub-multi-session.test.ts
- **Committed in:** 80e1e8f1 · 2a70a499

---

**Total deviations:** 4 auto-fixed (Rule 1 ×2 · Rule 3 ×2)
**Impact on plan:** 모두 계획 목표(GC-05 · 운영 보존 · 3상태 규율)를 지키는 데 필요했다. 브라우저 계약 · webapp · 84/76/78/77 원천 · `strategies.disable` 은 무변경이다.

## Issues Encountered

- `relay/src/dma/session-manager.ts:26` 머리 주석이 아직 「사용자 단위 명령(VI 설정 · …)의 세션은 `primaryOf`」 다. 이 플랜 files_modified 밖의 문서 한 줄이라 고치지 않았다. 동작 영향은 없다(VI 세션 선택은 fanout `#viSessionFor`). 다음에 그 파일을 고치는 플랜이 주석을 맞추면 된다.
- RED 증거를 만들 때 JUnit 보고서 사본을 저장소 루트 `scratchpad/` 에 잠깐 만들었다. 커밋 전에 지웠다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- relay 코드 · 테스트만 바뀌었다. 배포(relay VM)는 메인 세션 몫이다. 지금 운영은 지정 0 이라 동작이 종전과 같다.
- 29-52 가 fanout 을, 29-54(N-01 전부 정지)가 hub · fanout · 이 플랜의 두 테스트 파일을 다시 고친다.
  - 29-54 의 「전부 정지」 를 세션마다 보내는 일은 이 플랜의 VI 원천 목록(`#viSourceOwners`)과 같은 축이다.
  - 65 집계도 소유 키 단위로 보면 된다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 변경 파일 4 · RED 증거 2 존재 (FOUND)
- 커밋 80e1e8f1 · 2a70a499 · 1674549a · b93dac50 HEAD 조상 (FOUND) · evaluation-scope resolved · 삭제 0
- 수용 기준: hub `#viSourceOwners` 9 · fanout `#viSessionFor` 3 · hub `viRunningElsewhere` 2 · fanout `viRunningElsewhere` 1 · fanout `viOrderSessionOf` 2
- verify: Task 1(shared build · typecheck · typecheck:tests · 4 파일 162) · Task 2(7 파일 334) · relay 전량(57 파일 · 1467) green
