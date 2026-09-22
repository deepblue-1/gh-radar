---
phase: 18-gh-trade-ui-nxt-vi
plan: 14
subsystem: trading-order-path
status: complete
tags: [gap-closure, CR-01, TRADE-07, relay, webapp, supabase-migration, cancel-order]
gap_closure: true
requires:
  - 18-13
provides:
  - "가격 0 취소(시간외종가 원주문)가 webapp 번역기 · relay zod · 조립기 세 코드 층을 통과"
  - "DB CHECK 교체 마이그레이션 파일 20260922120000_dma_orders_cancel_price_zero.sql (미적용)"
affects:
  - 18-18 (원격 DB 반영 — 이 파일이 적용 대상)
tech-stack:
  added: []
  patterns:
    - "취소 가격 = 원주문 가격의 사본 → 네 층이 같은 한 문장(0 이상 정수)으로 검증"
key-files:
  created:
    - supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql
  modified:
    - webapp/src/lib/relay-provider.tsx
    - relay/src/ws/protocol.ts
    - relay/src/dma/envelope.ts
    - relay/tests/ws-order.test.ts
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - relay/src/ws/__tests__/protocol.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - packages/shared/src/relay.ts
key-decisions:
  - "취소 가격은 주문 조건이 아니라 원주문 가격의 사본 — 세 코드 층과 DB CHECK 가 취소에 한해 「0 이상 정수」 한 규칙을 쓴다. 신규 전용 offHours 조건을 취소에 재사용하지 않음 (CR-01)"
  - "마이그레이션은 명시 이름 dma_orders_price_check 를 IF EXISTS 없이 DROP 후 재생성 — 원격이 예상과 다르면 트랜잭션째 실패하는 편이 CHECK 중복보다 낫다"
  - "새 CHECK 의 0 허용은 price = 0 AND (order_type = 'C' OR krx_session IN ('G2','G3')) 안에 가둠 — 취소 음수 통과 방지"
requirements-completed: [TRADE-07]
metrics:
  duration: "3 min"
  started: "2026-09-22T06:42:50Z"
  completed: "2026-09-22T06:45:52Z"
  tasks: 2
  files: 9
estimate:
  tokens: 60000
  tasks: 2
actuals:
  tokens: 5800
  tasks: 2
  commits: 3
plan_head_before: d383862f6dab0262924dc13c532dbdc5f690153f
coverage:
  - deliverable: "가격 0 취소가 relay 를 지나 게이트웨이까지 order_type C · price 0 으로 송신·감사 기록·cancelled 정산"
    human_judgment: false
    verification:
      - kind: test
        ref: "relay/tests/ws-order.test.ts#㊵ 가격 0 취소(시간외종가 원주문)가 orderType C · price 0 으로 기록·송신되고 취소확인으로 정산된다 (CR-01)"
        status: pass
  - deliverable: "취소 −1 · 정정 0 은 relay 스키마에서 끊기고 게이트웨이 0바이트"
    human_judgment: false
    verification:
      - kind: test
        ref: "relay/tests/ws-order.test.ts#㊶ 취소 가격 −1 과 정정 가격 0 은 스키마에서 끊긴다 — 게이트웨이로 0바이트 (CR-01)"
        status: pass
  - deliverable: "층별 경계 단위 테스트 (webapp 번역기 · zod · 조립기)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/lib/__tests__/relay-provider.test.tsx#⑨-j, ⑨-k"
        status: pass
      - kind: test
        ref: "relay/src/ws/__tests__/protocol.test.ts#parseInbound — order.cancel price 0 (CR-01)"
        status: pass
      - kind: test
        ref: "relay/src/dma/__tests__/envelope.test.ts#취소 0 조립 · 취소 −1 · 신규 0 · 정정 0 (CR-01)"
        status: pass
  - deliverable: "DB CHECK 교체 마이그레이션 파일 (미적용)"
    human_judgment: true
    rationale: "파일은 grep 으로 구조만 검증됨(취소 갈래 존재 · 정책/권한 구문 0). 실제 원격 적용과 기존 행 호환은 18-18 체크포인트에서 확인"
---

# Phase 18 Plan 14: 가격 0 취소(CR-01) 코드 3층 개방 + DB CHECK 마이그레이션 파일 Summary

**시간외종가(G2/G3) 원주문의 취소가 막히던 문제(CR-01)를 고쳤다. 원인은 취소 가격을 신규 주문 규칙으로 검증한 것이었다. 취소의 가격은 원주문 가격을 그대로 옮겨 온 사본이므로, webapp 번역기 · relay zod · 조립기 세 층과 새 DB CHECK 파일이 모두 「취소는 0 이상의 정수」라는 같은 규칙을 쓰도록 바꿨다. 신규 주문과 정정 주문의 가격 규칙은 한 글자도 넓어지지 않았다.**

## 성과

- **webapp `buildOrderFrame`**: 가격 검사를 주문 종류별로 나눴다. 취소는 `Number.isInteger ∧ >= 0`, 신규는 양수이거나 G2/G3 세션일 때 0, 정정은 양수만 통과한다. 거부 문구는 기존 「주문 가격을 확인해 주세요.」 그대로다.
- **relay `RelayOrderCancelSchema.price`**: `positive()` → `nonnegative()`로 바꿨다. 신규·정정 스키마는 diff 가 없고, `.strict()`로 만들지 않았다.
- **조립기 `buildDirectOrderReq`**: 가격 하한 `priceFloor = orderType === "C" || krxSession !== null ? 0 : 1`. 거부 문구를 지정가 · 시간외종가 · 취소 세 갈래로 나눴다.
- **마이그레이션 파일** `20260922120000_dma_orders_cancel_price_zero.sql`: 한 트랜잭션 안에서 `dma_orders_price_check`를 떨어뜨리고 `price > 0 OR (price = 0 AND (order_type = 'C' OR krx_session IN ('G2','G3')))`로 다시 건다. **적용하지 않았다** — 원격 반영은 18-18 에서 한다.
- **회귀 테스트**: relay 쪽은 ws-order ㊵·㊶, protocol 에 새 describe 1개, envelope 에 4케이스를 넣었다. webapp 쪽은 ⑨-j·⑨-k 를 넣었다.

## 태스크 커밋

| Task | Name | Commit |
|------|------|--------|
| 1 | [tracer] 가격 0 취소 한 경로 — 번역기 · zod · 조립기 · 마이그레이션 파일 · relay 왕복 테스트 | 096e24b |
| 2 | 층별 경계 회귀 — webapp 번역기 · zod · 조립기 단위 테스트 + shared 계약 주석 | a97f193 |

`commits: 3`은 `plan_head_before..HEAD`를 실측한 값이다. 이 중 `a7174d6`(docs(relay): netcut 측정기 비활성 전환 기록 — infra/relay/README.md)은 실행 중에 **다른 세션**이 만든 커밋이라 이 플랜의 것이 아니다. 이 플랜의 커밋은 2개다.

## 검증

- Tracer verify: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay test -- ws-order` → 20 files / 502 passed. relay typecheck · typecheck:tests · webapp typecheck 에서 오류가 없었다.
- `grep -c "order_type = 'C'"` 결과는 2(CHECK 본문 1줄 + 머리 주석 1줄)다. 주석을 뺀 SQL 에서 policy/grant/revoke 구문은 0건이다.
- `git diff d383862..HEAD -- relay/src/ws/protocol.ts`를 보면 바뀐 줄이 `RelayOrderCancelSchema` 머리 주석(+6)과 `price` 한 줄뿐이다.
- Task 2 verify: webapp 92 files / 1325 passed (1 skipped, 기존) · relay 전량 20 files / **509 passed**(기준선 500 이상)다.
- **RED 증거(변이 검사)**: 소스 3개를 수정 전(`096e24b^`)으로 되돌리고 새 단위 테스트를 돌렸다. 0 을 여는 케이스(webapp ⑨-j · zod ① · 조립기 취소 0 · 취소 −1 문구)는 4건 모두 실패했다. 막는 쪽 케이스(⑨-k · 정정 0 · 신규 0)는 수정 전과 후 모두 통과했는데, 넓어짐을 막는 경비 테스트라 의도한 결과다. 확인 뒤 `git checkout -- <3파일>`로 되돌렸다.
- Acceptance: 세 테스트 파일의 `CR-01` 카운트는 2 / 2 / 5 로 모두 1 이상이다. `RelayOrderCancelMsg` 필드 목록은 바뀌지 않았다(주석 2줄만 추가).

## 계획과 달라진 점

### TDD 순서

- Task 2 는 `tdd="true"`지만, 고치는 코드는 앞선 tracer(Task 1)가 이미 커밋해 둔 상태였다. 그래서 Task 2 의 테스트는 처음부터 green 으로 들어왔다. 그 대신 위의 변이 검사로 「수정 전 코드에서는 실패한다」는 RED 증거를 확보했다. 코드는 바뀌지 않았다.

그 밖에는 계획대로 실행했다. 자동 수정은 0건이다.

## 알려진 스텁

없음.

## 위협 표면 점검

플랜 `<threat_model>` 밖의 새 표면은 없다. T-18-66/67/68/69 의 mitigate 항목은 모두 코드와 테스트로 반영했다. DB 쪽 T-18-69(원격 CHECK 가 열리기 전에는 insert 가 실패해 송신하지 않음)는 기존 ⑯ 경로 그대로다.

## 다음 단계

18-15 를 진행할 수 있다. 마이그레이션 파일은 18-18 의 원격 반영 체크포인트를 기다린다. 그 전까지 프로덕션에서 가격 0 취소를 보내면, 소켓이 끊기지 않고 「주문 기록에 실패했습니다」로 끝난다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260922120000_dma_orders_cancel_price_zero.sql
- FOUND: 096e24b, a97f193 (git log)
