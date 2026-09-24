---
phase: 19-account-order-journal
plan: 06
subsystem: webapp
tags: [webapp, relay-reducer, journal, today-orders, D-03, D-04, D-05, D-08, T-19-16, T-19-26, T-19-27]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-04 shared JournalOrderRow · RelayJournalRowsMsg · RelayJournalStateMsg · server GET /api/orders → JournalOrderRow[]"
  - phase: 19-account-order-journal
    provides: "19-05 relay deliverJournalRows — 계좌 권한 사용자에게만 journal.rows 푸시"
provides:
  - "RelayConnectionState.journalRows (id upsert · lastSeq 큰 쪽 · createdAt 내림차순 · MAX_JOURNAL_ROWS=2000) · journalState(최신 journal.state)"
  - "use-relay-socket upsertJournalRows · MAX_JOURNAL_ROWS export"
  - "relay-provider EMPTY_RELAY_VALUE.journalRows(EMPTY_JOURNAL_ROWS 고정 참조) · journalState null"
  - "orders-api fetchTodayOrders(): Promise<JournalOrderRow[]> · mergeJournalRows(restored, pushed, today) · compareJournalNewestFirst · orderDisplayStatus(JournalOrderRow)"
  - "order-notices mergeKeyOf(JournalOrderRow) — 자동주문 = origin limit_chaser|vi 이고 requester !== Manual · MergedOrderNotice.qty/priceMin/priceMax nullable"
  - "TodayOrdersCard — 원천 REST + journal.rows, journal.state delayed→live 재조회, 모르는 수량·가격 「—」"
affects: [19-08, 19-12]

actuals:
  tokens: 26000
  tasks: 3
  commits: 3
plan_head_before: 47a4b81cc3f461b2a866c721329c09a14b4f9110

tech-stack:
  added: []
  patterns:
    - "리듀서 보관과 카드 병합이 같은 비교 함수(compareJournalNewestFirst) — 시각은 epoch 로 비교해 Z/+00:00 표기 차이에 흔들리지 않음"
    - "전이 트리거 재조회는 직전 값을 ref 로 들고 전이만 본다(ready 재진입 ⑦ 과 같은 판정)"
    - "변화 없는 프레임은 같은 state 참조를 돌려 소비자 memo 를 보호"

key-files:
  created: []
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/orders-api.ts
    - webapp/src/lib/order-notices.ts
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/src/lib/__tests__/orders-api.test.ts
    - webapp/src/lib/__tests__/order-notices.test.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - packages/shared/src/journal.ts
    - webapp/e2e/specs/me.spec.ts

key-decisions:
  - "정렬 비교 함수 compareJournalNewestFirst 를 orders-api 에 두고 리듀서가 import — 리듀서 보관 순서와 카드 병합 순서가 두 벌로 갈라지지 않게"
  - "mergeJournalRows 는 lastSeq 동률이면 복원 행을 유지(같은 사실 — 교체할 이유 없음), 리듀서도 기존 lastSeq >= 새 lastSeq 면 기존 유지"
  - "journal.state 재조회는 prev === delayed && now === live 일 때만 — 마운트 시 null→live, live→live 는 재조회 0"
  - "가격 0(취소)·null 은 범위에서 빠져 단건 취소 행의 가격 칸이 「0」 대신 「—」 가 된다(plan 명시 규칙)"
  - "e2e 픽스처 ord-a 의 requester 는 null — 'Manual' 로 두면 「· 수동」 꼬리가 새로 붙어 19-08 이 다룰 표시가 앞당겨진다"

requirements-completed: [D-03, D-04, D-05, D-08]

coverage:
  - id: D1
    description: "REST 행 X(lastSeq 3 accepted) + 푸시 X(lastSeq 5 filled) → 1줄 「체결」 · 복원에 없는 오늘 푸시 행은 줄을 만든다 · 어제 푸시 행은 없음 · {t:order} 만 있는 주문번호는 줄·재조회 변화 없음"
    requirement: D-03
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑨-1~⑨-4"
        status: pass
    human_judgment: false
  - id: D2
    description: "리듀서 journal.rows — 7 뒤 6 버림 · 새 id 추가 · 변화 없는 프레임 같은 참조 · 상한 2000 · journal.state 보관 · reset 뒤 둘 다 비움 · {t:order} 는 journalRows 불변"
    requirement: D-03
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#journal.rows / journal.state (7 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "journal.state delayed→live 1회 재조회 · live→live 0 · 마운트 직후 첫 live 0 · ready 재진입 재조회 유지(⑧-1~3)"
    requirement: D-04
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑩-1~⑩-3 · ⑧-1~⑧-3"
        status: pass
    human_judgment: false
  - id: D4
    description: "mergeJournalRows lastSeq 규칙·오늘 필터·정렬(epoch) · orderDisplayStatus 6종 표 · 모르는 값 muted"
    requirement: D-03
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/orders-api.test.ts (14 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "묶기 — origin null 묶지 않음 · vi 는 자기 축 · requester '' 는 자동 · 로컬 거부끼리 안 묶임 · qty null 합계 0 · 전부 null 이면 null · 가격 null/0 범위 제외 · 카드 「—」"
    requirement: D-08
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑤-5~⑤-8 · 모르는 수량·가격 ⑦-1~⑦-4"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑦-3b · ⑩-4"
        status: pass
    human_judgment: false
  - id: D6
    description: "shared 에서 DmaOrderRow·DmaOrderOrigin 삭제 — 저장소 참조 0 · e2e 픽스처 JournalOrderRow · My page e2e green"
    requirement: D-05
    verification:
      - kind: typecheck
        ref: "shared build · relay typecheck + typecheck:tests · webapp typecheck(+e2e) · server typecheck"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts → 9 passed"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-25
---

# Phase 19 Plan 06: webapp 「오늘 주문」 원천을 저널로 전환 Summary

**「오늘 주문」 카드가 이제 REST 복원(`JournalOrderRow[]`)과 relay `journal.rows` 푸시 두 가지만 `id`·`lastSeq` 로 병합한다. 푸시 행이 복원에 없던 줄도 만들고, 기록 연결이 `delayed → live` 로 복구되면 한 번 다시 불러 빠진 줄을 채운다. 옛 라이브 join·unmatched 재조회 루프와 shared `DmaOrderRow` 계약은 사라졌다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-24T16:09:30Z
- **Completed:** 2026-09-24T16:19:49Z (KST 2026-09-25 01:19)
- **Tasks:** 3/3
- **Files modified:** 13

## Accomplishments

- **리듀서**: `journalRows`(id upsert · 같거나 작은 `lastSeq` 는 버림 · `createdAt` 내림차순 · 상한 2000)와 `journalState` 를 보관한다. 아무 행도 바뀌지 않는 프레임은 같은 state 참조를 돌린다. `reset` 이 둘 다 비운다(T-19-16). `{t:"order"}` 처리는 그대로이고, 토스트·전략 로그 전용이라는 주석을 달았다.
- **병합(`orders-api`)**: `mergeJournalRows(restored, pushed, today)` 는 푸시 행 중 오늘 것만 받는다. 정렬 비교 함수 `compareJournalNewestFirst` 하나를 리듀서와 함께 쓴다. `orderDisplayStatus` 는 DB `status` 6종 표만 본다. 옛 `NOTICE_*`·`STATUS_RANK` 격자는 지웠다.
- **카드**: 오늘 날짜는 shared `kstDateIso` 로 정한다. `noticeFactsOf` 는 행의 통보 사실만 읽고, `requestKind` 가 없으면 `orderType` C·M 으로 대신한다. `delayed → live` 전이에서만 재조회한다(⑧). ready 재진입 재조회(⑦)는 유지했다. 수량·가격을 모르면 「—」 로 그린다.
- **묶기**: `origin` 이 `limit_chaser`·`vi` 이고 `requester` 가 `Manual` 이 아닌 행만 자동주문으로 보고 묶는다. origin null 은 증거가 없으므로 묶지 않는다(D-08 보충). `qty`·`priceMin`·`priceMax` 는 null 을 허용한다.
- **shared 정리**: `DmaOrderRow`·`DmaOrderOrigin` 을 지웠다(D-05). `DmaOrderStatus` 는 `order.result` 가 쓰므로 유지했다. e2e `TODAY_ORDERS` 는 `JournalOrderRow[]` 로 바꿨다.

## Task Commits

1. **Task 1: [tracer] journal.rows → 리듀서 → 컨텍스트 → 카드 병합** — `fb12cdd` (feat)
2. **Task 2: 옛 라이브 join 제거 · journal.state 복구 재조회 · 묶기 키를 행 사실로** — `8da2395` (feat)
3. **Task 3: shared DmaOrderRow 삭제 · e2e 픽스처 저널 행 모양** — `d8db495` (refactor)

## Tracer 게이트

Task 1 뒤 `-t "journal"` 4건이 통과하고 webapp typecheck 0 error 였다. 확장(Task 2) 전에 end-to-end 슬라이스가 동작함을 확인했다. 자동 모드는 꺼져 있었다(`auto_advance=false`). `human_verify_mode` 는 기본값(end-of-phase)이고 `<verify>` 는 자동 검증뿐이라 체크포인트 없이 진행했다.

## 삭제·대체한 카드 테스트 (D-03)

Task 1 커밋(`fb12cdd`)에서 아래 6건이 런타임 실패로 남았다(plan 지시: skip 하지 않고 Task 2 에서 삭제·대체). Task 2 커밋(`8da2395`)에서 전부 정리했다.

| 옛 케이스 | 처리 | 사유 |
|-----------|------|------|
| ② 같은 orderNo 의 라이브 프레임은 상태만 바꾼다 | 삭제 → ⑨-1 로 대체 | D-03: `{t:"order"}` 는 카드 병합에서 빠졌다. 같은 주문의 갱신은 같은 `id` 의 더 큰 `lastSeq` 푸시 행으로 온다 |
| 라이브에만 있는 주문번호 → 번호당 재조회 1회 | 삭제 → ⑨-4 로 대체 | D-03: unmatched 재조회 루프 제거. 이제 `{t:"order"}` 만 있는 번호는 줄도 재조회도 만들지 않는다 |
| ⑥-1 취소확인 라이브 프레임 → 「취소」·방향색 없음 | 대체(같은 단언 유지) | 입력을 라이브 프레임 대신 `noticeType:"C"`·`lastSeq` 가 더 큰 푸시 행으로 |
| ⑥-2 시간외종가 + 「수동」 메타 | 대체(단언 유지) | 입력을 행의 `board:"G2"`·`requester:"Manual"` 로. 「수동」 꼬리 제거는 19-08(D-08) |
| ⑦-2 묶기 뒤에도 재조회 루프는 묶기 전 번호를 본다 (T-17-35) | 삭제 | D-03: 재조회 루프 자체가 사라져 지킬 대상이 없다 |
| ⑦-3 relay 프레임 없으면 묶기가 아무것도 안 바꾼다 | 삭제 → ⑦-3(푸시 행도 같은 규칙으로 묶임) · ⑦-3b(origin null 은 묶지 않음)로 대체 | 저널 행은 모두 통보 사실을 가진다 — 복원·푸시가 같은 규칙으로 묶인다 |

`⑧-1`(ready 재진입 재조회)은 끊기기 전 입력만 라이브 프레임에서 푸시 행(lastSeq 1)으로 바꿨다. 재조회한 「체결」(lastSeq 2)이 이긴다는 단언은 그대로다.

## Verification

- `pnpm --filter @gh-radar/shared build` — 성공
- relay `typecheck` · `typecheck:tests` · webapp `typecheck`(+e2e tsconfig) · server `typecheck` — 전부 0 error
- `pnpm --filter @gh-radar/webapp run test` — **98 files / 1695 passed · 1 skipped**(기준 1678 passed → +17. 새로 추가한 skip 은 없다)
- 대상 5파일(orders-api · order-notices · relay-socket · trading-alerts · today-orders-card) — 197 passed. `trading-alerts.test.ts` 는 고치지 않았다(`git diff --stat` 출력 없음)
- `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts` — **9 passed**(15.6s. Playwright 가 dev 3100 을 띄우고 relay 픽스처는 8090. 종료 뒤 두 포트 모두 비어 있음을 확인)
- acceptance grep: `mergeTodayOrders|unmatchedOrderNos|requestedRef|TodayOrderRow` in webapp/src 0줄 · `row.live` in order-notices 0줄 · `DmaOrderRow|DmaOrderOrigin` in shared/relay/server/webapp src·e2e 0줄 · `case "journal.rows"`/`"journal.state"` 존재 · 카드에 `mergeJournalRows`·`kstDateIso` 존재 · me.spec `JournalOrderRow` 3회

## Decisions Made

- 비교 함수는 하나만 둔다. 리듀서는 `orders-api` 의 `compareJournalNewestFirst` 를 import 한다. 시각은 `Date.parse` epoch 로 비교한다. REST(PostgREST)와 푸시(jsonb)의 ISO 표기가 다를 수 있기 때문이다(테스트로 고정).
- `lastSeq` 가 같으면 기존 행(복원)을 유지한다. 같은 사실이라 교체할 이유가 없고, 참조를 유지해야 memo 가 헛돌지 않는다.
- 단건 취소 행(가격 0)의 가격 칸이 「0」 에서 「—」 로 바뀐다. plan 의 「null·0 은 범위에서 제외, 전부 없으면 null → —」 규칙을 그대로 따른 결과다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] orders-api·order-notices 테스트 픽스처 이관을 Task 1 로 앞당김**
- **Found during:** Task 1
- **Issue:** webapp `typecheck` 가 `src/**` 의 테스트 파일도 검사한다(`tsconfig.json include`). Task 1 에서 `TodayOrderRow`·`mergeTodayOrders` 를 대체하자 `orders-api.test.ts`·`order-notices.test.ts` 가 컴파일되지 않았다. 그래서 Task 1 verify(typecheck 0 error)를 통과할 수 없었다.
- **Fix:** Task 1 커밋에서 옛 함수·타입을 지우고(카드가 더는 쓰지 않는다) 두 테스트를 `JournalOrderRow` 기준으로 옮겼다. `orders-api.test.ts` 는 이때 새 계약으로 다시 썼다. Task 2 는 묶기 규칙 완성(origin null · qty/price null)과 그 테스트 · 리듀서 테스트 · 카드 정리를 맡았다.
- **Files modified:** webapp/src/lib/__tests__/orders-api.test.ts, webapp/src/lib/__tests__/order-notices.test.ts
- **Commit:** fb12cdd

**2. [Rule 3 - Blocking] unmatched 재조회 효과를 Task 1 에서 제거**
- **Found during:** Task 1
- **Issue:** `unmatchedOrderNos` 는 삭제한 `mergeTodayOrders` 의 반환값이다. 카드가 새 병합 함수만 쓰면 이 효과는 컴파일될 수 없다.
- **Fix:** `requestedRef` 와 재조회 효과를 Task 1 에서 함께 지웠다. 헤더 ③ 은 Task 1 에서, ⑦·⑧ 은 Task 2 에서 고쳤다.
- **Commit:** fb12cdd

**3. [Rule 3 - Blocking] `packages/shared/src/journal.ts` 주석 수정 (Task 3 files 목록 밖)**
- **Found during:** Task 3
- **Issue:** journal.ts 머리 주석에 `DmaOrderRow` 문자열이 남아 있어 acceptance grep(`packages/shared/src` 0줄)이 통과하지 않았다.
- **Fix:** 그 줄을 삭제 경위(「19-06 에서 shared 에서 삭제됐다」)로 바꿨다.
- **Commit:** d8db495

**4. [Rule 3] 카드 테스트 ⑥-3 픽스처 status `requested` → `accepted`**
- **Issue:** `JournalOrderStatus` 에 `requested` 가 없다. 이 케이스의 뜻(「통보가 없는 신규 매도 행은 방향색 매도」)은 `noticeType: null` 이 나타내므로 status 는 그 뜻과 무관하다.
- **Commit:** fb12cdd

## Issues Encountered

- Task 1 커밋 시점에 카드 테스트 6건이 런타임 실패 상태였다. plan 이 명시적으로 허용했고(skip 금지 · Task 2 에서 삭제·대체) Task 2 커밋에서 전부 green 이 됐다(위 표).
- `git.base-branch --is-protected master` 는 `true` 를 반환한다. 하지만 오케스트레이터가 순차 실행 · master 직접 커밋 · push 금지를 명시했으므로 그대로 따랐다(19-05 까지와 같은 운용).

## Notes for Later Plans

- **19-08(B′ 표시)**: 계좌별 묶음 · 출처 칩 · NXT 태그 · 「기록 지연」 표식을 붙인다. `journalState`(리듀서·컨텍스트에 이미 있음)를 읽어 표식을 띄우면 된다. 카드 테스트 ⑥-2 의 「수동」 메타 단언은 D-08 꼬리 제거 때 바꿀 것. e2e 픽스처에는 origin null 행(`ord-c`)이 이미 있다.
- **19-12 배포 순서**: 이 변경은 server `GET /api/orders` 의 새 응답 모양(19-04)에 결합돼 있다. **push 하지 않았다.** server 배포 직후에만 push 할 것(Pitfall 12).

## Self-Check: PASSED

- FOUND: webapp/src/lib/use-relay-socket.ts (`case "journal.rows"` · `case "journal.state"` · `MAX_JOURNAL_ROWS`)
- FOUND: webapp/src/lib/orders-api.ts (`mergeJournalRows` · `orderDisplayStatus` · `fetchTodayOrders`)
- FOUND: webapp/src/components/trading/today-orders-card.tsx (`mergeJournalRows` · `kstDateIso`)
- FOUND: fb12cdd · 8da2395 · d8db495
