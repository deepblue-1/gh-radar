---
phase: 18-gh-trade-ui-nxt-vi
plan: 01
subsystem: api
tags: [relay, zod, flatbuffers, supabase, dma, order-contract, websocket]

requires:
  - phase: 17
    provides: fbs piece_count/krx_session 슬롯 재동기화(미송신), 76/78 돌파 캐시·팬아웃, 위치 인자 금지 조립기
provides:
  - "order.modify(정정) end-to-end 경로 — DB CHECK 'M' · RelayOrderModifyMsg · RelayOrderModifySchema · toWireOrderType M · order-handler 3분기 · buildOrderFrame modify"
  - "order.new pieceCount(1..64)/krxSession(G2|G3) 조건부 송신 — 부재·1·\"\" 는 와이어 바이트 무변경"
  - "price 0 네 겹(webapp·zod·조립기·DB CHECK) 조건부 완화 — krxSession G2/G3 한 경로만"
  - "dma_orders.piece_count / krx_session 감사 컬럼 + OrderInsertRow 매핑"
  - "RelayRateCrossItem.name?/code? relay 보강 (76·78 팬아웃 + 인증 직후 스냅샷)"
affects: [18-02, 18-03, 18-04, 18-05, 18-06, 18-07, trading-workbench, manual-order-form, breakout-strip]

actuals:
  tokens: 21300
  tasks: 3
  commits: 5
plan_head_before: c6d15940e9cec200183c470560433c3da0bcf140

tech-stack:
  added: []
  patterns:
    - "조건부 슬롯 송신: 값 없으면 add* 호출 자체를 건너뛰고 문자열도 만들지 않는다 → 바이트 동일성 테스트로 잠금"
    - "vtable 오프셋(__offset)으로 슬롯 부재를 단언 — 접근자 기본값에 속지 않는다"
    - "감사 컬럼은 값 있을 때만 insert 키에 싣는다 — 마이그레이션 적용 전 DB 에서도 기존 주문이 막히지 않는다"
    - "보강(enrich)은 팬아웃·getter 사본에만, 캐시는 서버 원본"

key-files:
  created:
    - supabase/migrations/20260921120000_dma_orders_modify_offhours.sql
    - relay/src/ws/__tests__/protocol.test.ts
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/ws/protocol.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/order-handler.ts
    - relay/src/ws/fanout.ts
    - relay/src/store/orders.ts
    - relay/src/hub/subscription-hub.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/use-relay-socket.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/ws-order.test.ts
    - relay/tests/rate-cross.test.ts
    - webapp/src/lib/__tests__/relay-provider.test.tsx

key-decisions:
  - "정정 대기(PendingOrder)는 isCancel:true(원주문 참조 대기)로 등록 — 신규로 두면 정정확인(M) 통보가 원주문번호 하드 필터에 걸려 5초 timeout 으로 기록된다 (변이 주입으로 테스트 실효 확인)"
  - "DB price CHECK 는 price > 0 OR (price = 0 AND krx_session IN ('G2','G3')) — 계획 문안(price > 0 OR krx_session IN …)은 G2/G3 에서 음수를 통과시킨다"
  - "조립기는 pieceCount 1..64 범위 정책을 두지 않는다(정본은 zod 한 곳, toWireUint 규율) — 정수·음수·표현 범위만 BAD_PIECE_COUNT/UINT_RANGE 로 거부"
  - "krx_session 화이트리스트 가드 toWireKrxSession(BAD_KRX_SESSION) 신설 — 서버 거부에 기대지 않는다"
  - "webapp 번역기는 pieceCount 1 을 싣지 않고, 정수 1..64 밖이면 「조각 수를 확인해 주세요.」로 로컬 거부 — relay zod 위반은 소켓 close(4400)로 끝나기 때문"
  - "getRateCrossItems(인증 직후 스냅샷 원천)도 보강 사본을 반환 — 76/78 만 보강하면 새로고침 시 이름이 사라진다"

patterns-established:
  - "주문 3분기: kind = C|M|N, needsOrg = C|M, side 는 취소만 \"S\" — 게이트는 3종 모두 같은 순서"
  - "정정 dupKey dup:{accountNo}|{isin}|M|{orgOrderNo}|{price}|{qty}"

requirements-completed: [TRADE-06, TRADE-07]

coverage:
  - id: D1
    description: "order.modify 가 zod → order-handler(계좌 게이트 포함) → dma_orders insert(M) → DirectOrderReq(order_type M, org_order_no) 로 한 경로로 나가고 정정확인으로 정산된다"
    requirement: TRADE-07
    verification:
      - kind: unit
        ref: "relay/src/ws/__tests__/protocol.test.ts#parseInbound — order.modify (Phase 18 D-21)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#정정(\"M\") 왕복"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-order.test.ts#㉟~㊳ (정정 송신·정산, dupKey, 계좌 게이트, 원주문번호 부재)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑨-e ⑨-f"
        status: pass
    human_judgment: false
  - id: D2
    description: "pieceCount/krxSession 조건부 송신 — 부재·0·1·\"\" 는 슬롯 부재 + 기존 바이트 동일, 2·64·G2·G3 는 송신, zod 65·0.5·G1 거부"
    requirement: TRADE-07
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#조각 수·세션 경계 7건"
        status: pass
      - kind: unit
        ref: "relay/src/ws/__tests__/protocol.test.ts#order.new pieceCount / krxSession"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-order.test.ts#㊴ 감사 기록·와이어 일치"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑨-g ⑨-i"
        status: pass
    human_judgment: false
  - id: D3
    description: "price 0 은 krxSession G2/G3 에서만 webapp·zod·조립기 세 층을 통과하고 음수는 전부 거부"
    requirement: TRADE-07
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#price 0 은 세션 G2/G3 일 때만 통과한다 — 4조합"
        status: pass
      - kind: unit
        ref: "relay/src/ws/__tests__/protocol.test.ts#price 0 조건부"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑨-h"
        status: pass
    human_judgment: false
  - id: D4
    description: "마이그레이션 20260921120000 — order_type M · piece_count/krx_session · price 조건부 CHECK (pg_constraint 조회로 제약 이름 해석)"
    requirement: TRADE-07
    verification: []
    human_judgment: true
    rationale: "로컬 Postgres 가 없어 SQL 을 실행하지 못했다. 원격 적용(relay 배포보다 먼저) 시 DO 블록이 기존 CHECK 두 개를 찾아 떨어뜨리는지, 새 CHECK 가 price 0/G2·음수/G2 를 의도대로 가르는지 실 DB 에서 확인해야 한다."
  - id: D5
    description: "RelayRateCrossItem name/code 를 relay 가 76·78 팬아웃과 인증 직후 스냅샷에 채우고, lookup 실패 시 필드 부재, 캐시·전량 교체 불변"
    requirement: TRADE-06
    verification:
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#76/78 돌파 항목 name/code 보강 ①~⑤"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-22
status: complete
---

# Phase 18 Plan 01: 주문·돌파 계약 수직 슬라이스 Summary

**정정(order.modify)을 DB CHECK부터 webapp 번역기까지 한 경로로 열고, 예약 조각 수·시간외종가 세션을 값 있을 때만 와이어에 싣고(기존 주문 바이트 동일), price 0 을 G2/G3 한 경로로만 네 겹에서 열었으며, 돌파 항목에 relay 가 종목명·단축코드를 채운다.**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-09-22T08:29:20+09:00 무렵 (epoch 1790033360)
- **Completed:** 2026-09-22T08:44:04+09:00 무렵 (epoch 1790034244)
- **Tasks:** 3 / 3
- **Files modified:** 16 (신규 2)

## Accomplishments
- 정정 경로 7곳 + DB CHECK + fanout 결선을 한 번에 열었다 — `order.modify` 가 zod → 계좌 게이트 → `dma_orders` insert(`order_type='M'`, 요청 side) → `DirectOrderReq(M, org_order_no)` 로 나가고, 정정확인("M") 통보로 정산된다.
- `pieceCount`/`krxSession` 조건부 송신 — 부재·0·1·`""` 는 슬롯 호출 자체를 건너뛰어 기존 수동주문 바이트가 **완전히 동일**함을 바이트 비교 테스트로 잠갔다.
- `price 0` 은 webapp 번역기 · zod superRefine · 조립기 · DB CHECK 네 곳 모두 `krxSession` G2/G3 조건부로만 열렸고 음수·비정수는 전부 거부다.
- 돌파 76/78 팬아웃과 인증 직후 스냅샷에 `name`/`code` 보강, lookup 실패는 필드 부재 — 캐시는 서버 원본 그대로.
- relay 테스트 467 → 500, webapp 1010 → 1013 (전량 통과).

## Task Commits

1. **Task 1: order.modify 한 경로 (tracer)** — `1836566` (feat)
2. **Task 2: pieceCount·krxSession 조건부 송신 + price 0 조건부 완화** — `87b1889` (test, RED) → `4a60ded` (feat, GREEN)
3. **Task 3: 돌파 항목 name/code relay 보강 (D-30)** — `c54af35` (test, RED) → `94a6518` (feat, GREEN)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

Tracer 게이트: `human_verify_mode` 기본(end-of-phase) + 자동 verify 전용이라 Task 1 verify 를 재실행해 통과 확인 후 확장했다.

## Files Created/Modified
- `supabase/migrations/20260921120000_dma_orders_modify_offhours.sql` — order_type M, piece_count/krx_session, price 조건부 CHECK (pg_constraint 조회로 기존 제약 해석)
- `packages/shared/src/relay.ts` / `index.ts` — `RelayOrderModifyMsg`, `RelayKrxSession`, `OrderType "M"`, `RelayOrderNewMsg.pieceCount?/krxSession?`, `RelayRateCrossItem.name?/code?`
- `relay/src/ws/protocol.ts` — `RelayOrderModifySchema`, 공용 `OrderSideSchema`, `RelayOrderNewSchema` 확장 + superRefine
- `relay/src/dma/envelope.ts` — `toWireOrderType` M, `toWireKrxSession`, 원주문번호 가드 C/M, 조건부 슬롯, price 조건부 가드
- `relay/src/ws/order-handler.ts` — 3분기, 정정 dupKey, 정정 대기 원주문 참조 등록, 조각/세션 insert·조립 전달 + 조립 직전 info 로그
- `relay/src/ws/fanout.ts` — 주문 분기에 `order.modify` 결선
- `relay/src/store/orders.ts` — `OrderInsertRow.pieceCount?/krxSession?` + insert 매핑(값 있을 때만)
- `relay/src/hub/subscription-hub.ts` — `#enrichRateCross`, 76/78 팬아웃·getter 적용
- `webapp/src/lib/relay-provider.tsx` / `use-relay-socket.ts` — modify 분기, 조건부 싣기, 가격·조각 가드, sendOrder 타입 확장
- 테스트 4파일 (+ `relay/src/ws/__tests__/protocol.test.ts` 신설)

## Decisions Made
frontmatter `key-decisions` 참조. 핵심은 (1) 정정 대기를 원주문 참조 대기로 등록, (2) DB price CHECK 를 `price = 0 AND …` 로 좁혀 음수 차단, (3) 1..64 정책은 zod 단일 정본, (4) 인증 직후 스냅샷도 보강.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 계획 문안의 DB price CHECK 가 G2/G3 에서 음수를 통과시킴**
- **Found during:** Task 1
- **Issue:** `CHECK (price > 0 OR krx_session IN ('G2','G3'))` 는 `price=-1, krx_session='G2'` 를 허용 — must_haves 「음수는 krxSession 과 무관하게 거부」와 충돌
- **Fix:** `CHECK (price > 0 OR (price = 0 AND krx_session IN ('G2','G3')))`
- **Files modified:** supabase/migrations/20260921120000_dma_orders_modify_offhours.sql
- **Committed in:** 1836566

**2. [Rule 3 - Blocking] 계획이 누락한 결선 3곳**
- **Found during:** Task 1
- **Issue:** `relay/src/ws/fanout.ts` 주문 분기가 `order.new|order.cancel` 만 핸들러로 보냄(정정은 zod 통과 후 시세 분기로 떨어짐), `webapp/src/lib/use-relay-socket.ts` `sendOrder` 타입이 정정 프레임을 받지 않음, `packages/shared/src/index.ts` 가 새 타입을 export 하지 않음
- **Fix:** 세 곳 모두 확장
- **Committed in:** 1836566 (index.ts 는 4a60ded 에서 `RelayKrxSession` 추가)

**3. [Rule 1 - Bug] 정정 대기가 신규처럼 등록되면 정정확인 통보가 정산되지 않음**
- **Found during:** Task 1
- **Issue:** `narrowPending` 의 원주문번호 하드 필터는 `p.isCancel` 대기만 남긴다. 정정을 `isCancel:false` 로 두면 정정확인("M")이 후보 0건 → 5초 뒤 `timeout` 으로 감사 기록
- **Fix:** 정정 대기를 `isCancel: needsOrg`(원주문 참조 대기)로 등록, 필드 docstring 갱신. ws-order ㉟ 가 이를 잠그며 변이 주입(되돌리면 실패)으로 실효 확인
- **Committed in:** 1836566

**4. [Rule 2 - Missing Critical] 감사 컬럼을 늘 `?? null` 로 실으면 마이그레이션 미적용 창에서 모든 주문이 막힘**
- **Found during:** Task 1
- **Issue:** PostgREST 는 모르는 컬럼 키가 있으면 insert 를 거부 → 기존 신규·취소까지 「주문 기록에 실패했습니다」
- **Fix:** 값이 있을 때만 `piece_count`/`krx_session` 키를 싣는다(컬럼 기본값 NULL 과 동일 결과)
- **Committed in:** 1836566

**5. [Rule 2 - Missing Critical] 조립기 조각 수·세션 가드 및 webapp 조각 수 로컬 가드**
- **Found during:** Task 2
- **Issue:** `pieceCount > 1` 조건만으로는 0.5 가 조용히 미송신(절사와 같은 효과), `krxSession` 화이트리스트 부재. webapp 이 0·65 를 그대로 보내면 relay zod 위반 → 소켓 close(4400)
- **Fix:** `BAD_PIECE_COUNT`(비정수·음수), `toWireKrxSession`(`BAD_KRX_SESSION`), webapp 「조각 수를 확인해 주세요.」 로컬 거부 + 1 은 미송신
- **Committed in:** 4a60ded

**6. [Rule 2 - Missing Critical] 인증 직후 스냅샷 경로의 이름 보강**
- **Found during:** Task 3
- **Issue:** `fanout.ts` 가 인증 직후 `getRateCrossItems` 를 그대로 내린다 — 76/78 만 보강하면 새로고침 시 돌파 칩 이름이 사라진다
- **Fix:** getter 가 보강 **사본**을 반환(캐시 원본 불변)
- **Committed in:** 94a6518

**7. [파일 위치] Task 3 테스트를 `relay/tests/rate-cross.test.ts` 에 추가**
- 계획은 `relay/src/hub/__tests__/subscription-hub.test.ts`(없으면 신설)를 가리켰지만 76/78 허브 테스트 하네스(FakeSession·프레임 빌더)가 이미 `rate-cross.test.ts` 에 있어 「기존 허브 테스트에 케이스를 더한다」 문구를 따랐다. 정정 핸들러 통합 테스트도 기존 `relay/tests/ws-order.test.ts` 에 추가했다.

---

**Total deviations:** 7 (Rule 1: 2 · Rule 2: 3 · Rule 3: 1 · 위치 1)
**Impact on plan:** 전부 정확성·배포 안전성에 필요한 것. 범위 확장 없음.

## Issues Encountered
- `pnpm --filter … test -- protocol` 식 필터는 relay/webapp 스크립트에서 적용되지 않고 전체 스위트가 돈다(통과 판정에는 영향 없음). 개별 파일 검증은 `pnpm --filter … exec vitest run <path>` 로 했다.
- `master` 가 보호 브랜치로 판정되지만, 오케스트레이터가 main working tree(master) 순차 실행·일반 커밋을 명시 지시했고 이 저장소의 `git.branching_strategy: none` 관행을 따랐다. push 는 하지 않았다.
- `.planning/WINDOWS.md` 원장 append 는 기존 카운트 불일치(`frontmatter 4/0/13/17 vs entries 3/0/14/17`)로 거부됐다 — best-effort 이라 건너뛰었다. 기록하려던 항목: 마이그레이션 SQL 미실행(아래 참조).

## User Setup Required
**배포 순서 필수:** `supabase/migrations/20260921120000_dma_orders_modify_offhours.sql` 을 원격 DB 에 **relay 배포보다 먼저** 적용해야 정정·조각·시간외종가 주문이 기록된다(미적용 상태에서도 기존 신규·취소는 영향 없음 — 감사 컬럼을 조건부로 싣는다). 로컬 Postgres 가 없어 SQL 자체는 실행 검증하지 못했다(coverage D4).

## Next Phase Readiness
- 18-02 이후 UI 가 올라탈 주문·돌파 계약(`kind:"modify"`, `pieceCount`, `krxSession`, `price 0`, `RelayRateCrossItem.name/code`)이 전부 준비됐다.
- 정정 잠금(예약 Q-ID · 시간외종가 G2/G3 원주문 · 취소 보관 행)은 UI 판정 몫이다 — relay 는 판정하지 않는다.

---
*Phase: 18-gh-trade-ui-nxt-vi*
*Completed: 2026-09-22*

## Self-Check: PASSED

- 생성 파일 2건 존재, 커밋 5건(1836566 87b1889 4a60ded c54af35 94a6518) 존재
- build_command exit 0 · test_command exit 0 (relay 500 · webapp 1013 통과)
