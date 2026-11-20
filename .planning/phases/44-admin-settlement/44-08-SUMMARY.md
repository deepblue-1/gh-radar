---
phase: 44-admin-settlement
plan: 08
subsystem: admin-settlement
tags: [express, zod, relay, settlement, op6, tdd]

requires:
  - phase: 44-02
    provides: settlePlan · poolAccountRows · cumProfit · settledSum · reflectEffect · appliedEffect · effectDiff · addEffects · formatEokMan · SETTLEMENT_POOLS
  - phase: 44-03
    provides: settlement_settle_confirm(p_pool, p_expect_prev, p_settle, p_outs, p_by) → {settleId, rowIds} · settlement_settle_cancel(p_id, p_by) → {rows} · 오류 코드 STALE_SETTLE · NOT_LATEST · NO_SUCH_ROW
  - phase: 44-05
    provides: readSettlement · planReflect · reflectRows · assertRevertable · pendMessage · unrevertedMessage · settlement_set_pend 기록(recordPend) · parseSettlement
provides:
  - 라우트 POST /api/admin/settlement/settles(정산 확정) · POST /api/admin/settlement/settles/:id/cancel(정산 취소)
  - zod SettlementSettleBodySchema · SettlementCancelBodySchema
  - 오류 코드 CANNOT_SETTLE(409) · STALE_SETTLE(409) · NOT_LATEST(409) · NOT_FOUND 「없는 정산이에요」(404)
  - 내부 함수 settleBlockMessage · settleSnapshot · settleRpcError · sumPends
affects: [44-10, 44-11, 44-12, 44-13]

actuals:
  tokens: 13100
  tasks: 2
  commits: 4
plan_head_before: 51e4e2f19fb9aa8884cac4849e2f17d5d8d6310e
plan_head_after: c290730f41598fc43e015709b0ff3703299857b3

tech-stack:
  added: []
  patterns:
    - "정산 숫자는 server 가 확정 요청 안에서 readSettlement 한 벌로 settlePlan 을 돌려 만든다 — 바디는 고른 것(묶음 · 바로 출금 사람 · 메모 · 반영 · 기대값)만 받는다(.strict)"
    - "여러 줄 반영(정산 바로 출금 · 취소 되돌림)은 reflectRows 로 같은 계좌를 합쳐 한 번 보내고, 줄마다 자기 증감 + 합친 목표값으로 pend 를 나눈다 · 응답 pend 는 계좌별 합(sumPends)"

key-files:
  created:
    - server/tests/routes/admin-settlement-settle.test.ts
  modified:
    - server/src/routes/admin-settlement.ts
    - server/src/schemas/settlement.ts

key-decisions:
  - "확정 스냅샷(snapshot.accounts · cumKrw · prevKrw)과 readAt 은 바로 출금을 보내기 전 읽기 한 벌로 만든다 — 예수금은 반영 전 값 · readAt 은 그 묶음 계좌 중 가장 최근 읽은 시각(없으면 지금 — 표 열 NOT NULL)"
  - "확정 RPC 에 싣는 줄별 처음 pend 는 합친 계획(planReflect(addEffects(줄 증감들)))의 목표값 · 사유(block ?? failed)에 그 줄 자기 증감을 붙인 것 — 보내기 전에 server 가 죽어도 다시 반영이 목표값 대조로 두 번 빼지 않는다"
  - "정산 확정 응답 pend 는 줄별 남은 pend 의 계좌별 합(증감은 더하고 목표값 · 사유는 합쳐 보낸 한 번의 값) · 남은 것이 있으면 pendMessage"
  - "정산 취소 반영 켬은 읽은 정산 목록에서 같은 묶음에 더 최근 정산이 있으면 RPC 전에 409 NOT_LATEST — 그 계좌를 못 읽은 경우에도 「못 읽어 되돌릴 수 없어요」 대신 맞는 문장이 먼저 나온다(RPC 가 같은 검사를 다시 한다)"
  - "정산 취소의 set_pend 는 보내기만 실패한 줄이 있을 때만 부른다(거래 지우기와 같은 꼴) · 반영 끔이면 감사 대상 묶음은 \"settle\"(정산을 읽지 않아 모른다)"
  - "바디 검증 문장 2개 추가 — 「그 묶음에 몫이 없는 사람은 바로 출금을 고를 수 없어요」 · 「바로 출금에 같은 사람이 두 번 있어요」(custom 이슈라 경로 접두 없이 문장만)"

patterns-established:
  - "정산 RPC 오류 옮김(settleRpcError): STALE_SETTLE · NOT_LATEST → 409 · NO_SUCH_ROW → 404 · 23514 → 400 · 그 밖 DB_ERROR — 업무 코드는 error.message 로 판정"

requirements-completed: []

coverage:
  - id: D1
    description: "정산 확정 — 검산 p1 정산 수익 1,049,000,000 · 몫 524,500,000 · 반영 전 스냅샷 · kyH 159,500,000 한 번 · set_pend {} / 바로 출금 없음 · 반영 끔 / 앞 정산 있음(expectPrev 7 · prevKrw 49,000,000)"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-settle.test.ts#POST /api/admin/settlement/settles — 정산 확정"
        status: pass
    human_judgment: false
  - id: D2
    description: "4 : 3 : 3 끝전 — 정산 수익 100,000,004 · 바로 출금 40,000,000 · 30,000,000 · 30,000,000 · kbH 400,000,005 한 번 · 보내기 실패 시 줄별 pend + 응답 계좌 합"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-settle.test.ts#4 : 3 : 3 kbH 500,000,005 · 4 : 3 : 3 보내기 실패"
        status: pass
    human_judgment: false
  - id: D3
    description: "확정 불가 409 CANNOT_SETTLE 3가지(쥬니 손실 이월 · 미설정 · 나눌 수익 없음) · 못 읽음 확정(stale · unreachable) · STALE_SETTLE 409 · 확정 RPC 일반 오류 → relay 쓰기 0 · 바디 400 · 비관리자 403"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-settle.test.ts#확정할 수 없음 · (D-16) · (Pitfall 5) · 확정 RPC 오류 → relay 쓰기 0 · 바디 검증 · 비관리자"
        status: pass
    human_judgment: false
  - id: D4
    description: "정산 취소 — 되돌림 kyH 684,000,000 · 4 : 3 : 3 되돌림 kbH 합쳐 한 번 · 반영 안 된 줄은 되돌릴 것 없음 · D-30 사전 거부(못 읽음 · 대응 없음) · NOT_LATEST · NO_SUCH_ROW · 취소 RPC 일반 오류 → relay 쓰기 0 · 보내기만 실패(unreverted · 문장) · 반영 끔 · 400 · 403"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-settle.test.ts#POST /api/admin/settlement/settles/:id/cancel — 정산 취소"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 08: 정산 확정 · 취소 라우트 Summary

**server 가 확정을 누른 순간 예수금으로 shared `settlePlan` 을 돌려 몫(원 미만 버림) · 바로 출금 줄(만원 미만 버림)을 만들고 반영 전 스냅샷과 함께 기록한 뒤, 같은 계좌 여러 줄은 합쳐 한 번만 예수금에 반영한다. 취소는 묶음의 가장 최근 정산만 되고, 되돌릴 수 없으면 미리 409 로 막는다.**

## Performance

- **Duration:** 약 25분
- **Completed:** 2026-11-20
- **Tasks:** 2 / 2
- **Files modified:** 3

## Accomplishments

- `POST /api/admin/settlement/settles` — 바디 검증 → 그 순간 읽기 → `settlePlan` → 확정 불가 409 → 줄별 증감 · 처음 pend → 확정 RPC(기대값 대조) → RPC 성공 뒤에만 합쳐 한 번 보내기 → 줄별 남은 것 기록.
- `POST /api/admin/settlement/settles/:id/cancel` — (반영 켬) 읽기 → 없는 정산 404 · 더 최근 정산 409 → D-30 사전 확인 → 취소 RPC → RPC 성공 뒤에만 되돌림 → 보내기만 실패한 줄 기록 · `unreverted` · `message`.
- 테스트 33건(확정 19 · 취소 14) — 기존 정산 테스트 2파일 포함 94건 통과 · server typecheck 0.

## 상태 코드 · 문장 표

| 경로 | 경우 | 상태 · 코드 | 문장 |
|---|---|---|---|
| 확정 | 성공(남은 것 없음) | 200 `{ ok, id, pend: {} }` | — |
| 확정 | 성공 · 보내기 일부 실패 · 못 읽음 | 200 `{ ok, id, pend, message }` | `pendMessage` — 「교보 김현중 미반영 — 매매 서버에 보내지 못했어요」 |
| 확정 | 예수금 미설정 계좌 | 409 `CANNOT_SETTLE` | 「예수금이 설정되지 않은 계좌가 있어요. 계좌 메뉴에서 설정한 뒤 정산할 수 있어요.」 |
| 확정 | 쥬니 손실 이월 | 409 `CANNOT_SETTLE` | 「원금 4억까지 2,800만 남았습니다. 회복한 뒤부터 4 : 3 : 3 로 나눕니다.」(금액 · 비율 라벨은 계산 · 정의값) |
| 확정 | 그 밖(정산 전 수익 0 이하) | 409 `CANNOT_SETTLE` | 「나눌 수익이 없습니다.」 |
| 확정 | 기대값 어긋남(RPC `STALE_SETTLE`) | 409 `STALE_SETTLE` | 「다른 곳에서 먼저 정산했어요 — 화면을 다시 불러와 주세요」 |
| 확정 | 그 밖 RPC 오류 | 500 `DB_ERROR` | (원문 미노출) |
| 확정 · 취소 | 바디 · 경로 위반 | 400 `VALIDATION_FAILED` | 업무 규칙은 문장만(「그 묶음에 몫이 없는 사람은 바로 출금을 고를 수 없어요」 · 「바로 출금에 같은 사람이 두 번 있어요」) |
| 확정 · 취소 | 비관리자 | 403 | — |
| 취소 | 성공 | 200 `{ ok, pend: {}, unreverted: [] }` | — |
| 취소 | 되돌릴 계좌 못 읽음 · 대응 · 서버 없음 | 409 `REVERT_UNREADABLE` | 「교보 김현중 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요」 |
| 취소 | 되돌린 값 1원 미만 | 409 `REVERT_UNREADABLE` | 「교보 김현중 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 취소해요」(44-05 `assertRevertable`) |
| 취소 | 더 최근 정산 있음(읽은 값 · RPC `NOT_LATEST`) | 409 `NOT_LATEST` | 「더 최근 정산부터 차례로 취소할 수 있어요」 |
| 취소 | 없는 · 이미 취소한 정산 | 404 `NOT_FOUND` | 「없는 정산이에요」 |
| 취소 | 취소 뒤 보내기만 실패 | 200 `{ ok, pend, unreverted, message }` | 「교보 김현중 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요」 |

## 확정 기록에 남는 값

- `p_settle.profitKrw` = 몫의 합(끝전은 정산 전 수익에 남음) · `shares` = 사람별 몫(`Math.trunc`).
- `p_settle.snapshot.accounts` = 그 묶음 계좌마다 `budgetKrw`(바로 출금 반영 **전**) · `putKrw` · `inKrw` · `outKrw` · `profitKrw` · `stale` · `readAt` — 검산 p1: kbG 845,000,000 / −220,000,000 / 1,065,000,000 · kyH 684,000,000 / 700,000,000 / −16,000,000 · kyG 20,000,000 / 20,000,000 / 0.
- `snapshot.cumKrw` = 묶음 누적 수익 · `snapshot.prevKrw` = 이미 정산한 수익의 합 · `readAt` = 그 묶음 가장 최근 읽은 시각(못 읽은 계좌는 DB 마지막 값의 시각).
- `p_outs` = `[{ who, fromAcc(payAccount), amountKrw(만원 미만 버림), reflect, pend }]` · `p_by` = 관리자 이메일.

## 같은 계좌 합쳐 보내기 결과

- 4 : 3 : 3 · kbH 500,000,005 · 세 사람 바로 출금 → 줄 금액 40,000,000 · 30,000,000 · 30,000,000(모두 kbH) → relay 쓰기 **kbH 1회 `{ budgetKrw: 400,000,005 }`**.
- 같은 경우 보내기 실패 → 줄마다 `{ kbH: { deltaKrw: 자기 증감, targetKrw: 400,000,005, reason: failed } }` 를 set_pend · 응답 pend 는 `{ kbH: { deltaKrw: −100,000,000, targetKrw: 400,000,005 } }`.
- 취소 되돌림도 같다 — 세 줄 kbH 400,000,005 → **kbH 1회 500,000,005**.

## Task Commits

1. **Task 1: 정산 확정** — RED `cf00e226` (test) → GREEN `1179db56` (feat)
2. **Task 2: 정산 취소** — RED `da80366f` (test) → GREEN `c290730f` (feat)

## Files Created/Modified

- `server/src/routes/admin-settlement.ts` — 두 라우트 · `settleRpcError` · `settleBlockMessage` · `settleSnapshot` · `sumPends` · `confirmResult` · `cancelRows`
- `server/src/schemas/settlement.ts` — `SettlementSettleBodySchema` · `SettlementCancelBodySchema` · 문장 상수 2
- `server/tests/routes/admin-settlement-settle.test.ts` — 확정 19 · 취소 14

## Decisions Made

- 위 frontmatter `key-decisions` 6건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 빠진 검증] 취소 전 「더 최근 정산」 을 읽은 값으로 먼저 본다**
- **Found during:** Task 2
- **Issue:** 플랜은 `NOT_LATEST` 를 RPC 에만 맡겼다. 그러면 최근이 아닌 정산을 반영 켬으로 취소할 때 그 계좌를 못 읽으면 D-30 사전 확인이 먼저 돌아 「읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 …취소해요」 를 보이는데, 스위치를 꺼도 결국 `NOT_LATEST` 로 막혀 안내가 틀린다.
- **Fix:** 읽은 `raw.settles` 에 같은 묶음 · 더 큰 id 가 있으면 사전 확인 전에 409 `NOT_LATEST`(RPC 0). RPC 의 검사는 그대로 남는다(경합 대비).
- **Files modified:** server/src/routes/admin-settlement.ts · 테스트 「같은 묶음에 더 최근 정산이 있으면 …」
- **Commit:** c290730f

**2. [Rule 2 - 계약 방어] 정산 RPC 반환 모양 검사**
- **Found during:** Task 1 · Task 2
- **Issue:** 확정 반환 `rowIds` 의 길이가 `p_outs` 와 다르거나 취소 반환 `rows` 가 배열이 아니면 줄별 pend 를 엉뚱한 id 에 적을 수 있다.
- **Fix:** `confirmResult` · `cancelRows` — 모양이 어긋나면 relay 쓰기 전에 `DB_ERROR`.
- **Commit:** 1179db56 · c290730f

---

**Total deviations:** 2 (모두 빠진 검증)
**Impact on plan:** 범위 확대 없음. 경로 · 오류 코드 · 문장은 플랜 그대로다.

## TDD Gate Compliance

- Task 1: `test(44-08)` cf00e226 → `feat(44-08)` 1179db56 — RED `RED_EVIDENCE_OK`(junit · 19건 중 18 실패 · 1 통과). 대상 「POST /api/admin/settlement/settles — 정산 확정 > 검산 p1 · 김현중 바로 출금 · 반영 켬 → …」 이 `expected 404 to be 200` 로 실패. 의미 판정: 대상이 실제로 돌았고 라우트가 없어 계획한 상태 단언에서 떨어졌다 — 불러오기 · 문법 · 픽스처 오류 없음. 통과한 1건은 「비관리자 403」(44-01 의 `/settlement` 경로 관문이 이미 막음 — 의도된 기존 동작).
- Task 2: `test(44-08)` da80366f → `feat(44-08)` c290730f — RED `RED_EVIDENCE_OK`(33건 중 13 실패). 대상 「… 정산 취소 > (D-30) kyH 를 그 순간 못 읽음 → 409 REVERT_UNREADABLE …」 이 `expected 404 to be 409` 로 실패. 의미 판정 같음. 미리 통과한 것은 Task 1 의 19건과 취소 「비관리자 403」(관문).
- 첫 RED 기록은 대상 이름을 junit 의 「describe > it」 꼴로 적지 않아 `no_target_test_failure` 로 거부됐다 — 같은 명령을 다시 돌려 이름만 고친 기록으로 `RED_EVIDENCE_OK`.
- REFACTOR 커밋 없음.

## Issues Encountered

- server 전체 `vitest run --maxWorkers=2` 첫 실행 — 1137건 중 3건 실패: 알려진 `news.test.ts` V-news-cursor-a(날짜 고정 픽스처) 외에 `admin-servers.test.ts` 「모르는 DB 오류 → 500」 · `teamflow-report.test.ts` 「⑥ RPC {access:false} → 403」. 확인 실행 세 번: 두 파일만 → 49건 통과 / 새 테스트 파일 빼고 전체 → news 1건만 실패 / 새 테스트 파일 넣고 전체 다시 → news 1건만 실패(1136 통과). 새 파일과 무관한 흔들림으로 확정 — 고치지 않았다. 최종 상태: 알려진 news 1건 외 실패 0.

## Known Stubs

- 없음.

## User Setup Required

None — 배포 · 원격 DB 는 44-13(메인 세션).

## Next Phase Readiness

- webapp 정산 시트(44-10 · 44-11)는 `POST /settles` 에 `{ pool, outs, memo, reflect, expectPrev }` 만 보내고, 409 `CANNOT_SETTLE` · `STALE_SETTLE` · `NOT_LATEST` · `REVERT_UNREADABLE` 의 `error.message` 를 그대로 보이면 된다. 취소 응답 `unreverted` 가 비어 있지 않으면 확인 창을 닫지 않고 `message` 를 보인 채 「정산 취소」 를 잠근다.
- `expectPrev` 는 화면이 본 그 묶음 최신 정산 id(`settles` 가 id 내림차순이라 그 묶음 첫 줄) · 없으면 null.

## Self-Check: PASSED
