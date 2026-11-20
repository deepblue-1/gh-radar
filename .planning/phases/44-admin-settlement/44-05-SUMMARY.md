---
phase: 44-admin-settlement
plan: 05
subsystem: admin-settlement
tags: [express, zod, relay, settlement, op6, tdd]

requires:
  - phase: 44-01
    provides: readSettlement(RPC ∥ relay 읽기) · GET /settlement · 경로 한정 관문 · shared 정산 타입
  - phase: 44-02
    provides: reflectEffect · appliedEffect · effectDiff · addEffects · pendAccKeys · personAllowedFor
  - phase: 44-03
    provides: settlement_ledger_save · settlement_ledger_delete · settlement_set_pend RPC · 오류 코드 FUTURE_DATE · PERSON_NOT_IN_POOL · NO_SUCH_ROW · SETTLE_LINKED
provides:
  - server 반영 서비스 — SETTLEMENT_FANOUT_OP · ReflectPlanItem · planReflect · planPend · sendReflect · reflectDeltas · reflectRows · retryPend · assertRevertable · pendMessage · unrevertedMessage
  - 라우트 POST /settlement/ledger · PUT /settlement/ledger/:id · DELETE /settlement/ledger/:id · POST /settlement/ledger/:id/retry
  - zod SettlementLedgerBodySchema · SettlementDeleteBodySchema · settlementIdParam
  - 오류 코드 REVERT_UNREADABLE(409)
  - admin-accounts fanoutOne · fanoutAudit export
affects: [44-08, 44-09, 44-10, 44-12, 44-13]

actuals:
  tokens: 19212
  tasks: 2
  commits: 4
plan_head_before: 4ed20388fd3b6f1a6e9fa343148cc364e3bcb06d
plan_head_after: 3fe58c4ef1b5cdec83cae3e3d202791ba0c8e5cc

tech-stack:
  added: []
  patterns:
    - "예수금 반영 = 이번 요청에서 relay 로 읽은 값(read.reads) + 증감 → 절댓값 op 6 · 저장 RPC 에 목표값 pend 를 먼저 남기고 보낸 뒤 남은 것만 set_pend"
    - "반영됨 = 사용자 1명 이상 · 항목 error 없음 · 결과 1건 이상 · 모든 outcome ok — 하나라도 아니면 미반영(timeout 있으면 timeout)"
    - "업무 규칙 zod 이슈는 custom — 라우트 parseSettlement 가 경로 접두 없이 문장만 돌려준다"

key-files:
  created:
    - server/src/schemas/settlement.ts
    - server/tests/routes/admin-settlement-ledger.test.ts
  modified:
    - server/src/services/settlement-budget.ts
    - server/src/routes/admin-settlement.ts
    - server/src/routes/admin-accounts.ts

key-decisions:
  - "planReflect 는 「서버 없음」 을 「못 읽음」 보다 먼저 본다 — active 서버가 없으면 읽은 값도 없어 순서를 바꾸면 늘 unreachable 로 보인다(behavior 「active 서버 0 → no_server」)"
  - "보내지 않는 계좌(below_one · unreachable · no_server)의 pend targetKrw 는 null — 다시 반영은 지금 + deltaKrw 로 다시 계산한다"
  - "settlement_set_pend 실패는 비치명(경고 한 줄 · 응답 200) — relay 쓰기가 이미 끝났고, DB 에 남은 저장 때 목표값 pend 를 다시 반영이 목표값 대조로 두 번 더하지 않고 정리한다"
  - "pendMessage 는 사유 묶음별 한 문장(못 보냄 → 0 이하 순) · 문장끼리는 「 / 」 — UI-SPEC 의 계좌 라벨 「 · 」 이음과 구분"
  - "planPend(보낼 모든 계좌의 목표값 pend)를 export — 44-08 정산 확정 · 취소가 저장 RPC 에 같은 모양을 싣는다"
  - "DELETE 반영 끔 · 되돌릴 것 없는 줄의 감사 대상은 종류(반영 끔은 옛 줄을 읽지 않아 \"ledger\")"

patterns-established:
  - "돈 경로 순서: 검증 → (읽기 · 지우기는 D-30 사전 확인) → DB RPC → RPC 성공일 때만 relay 쓰기 → set_pend — RPC 오류는 어느 것이든 그 자리에서 throw"
  - "server 라우트 RED 증거는 vitest junit 리포터 + --outputFile(tap-flat 은 --outputFile 을 무시하고, gcp-pino 진단 줄이 stdout TAP 을 깨 invalid_record)"

requirements-completed: []

coverage:
  - id: D1
    description: "거래 저장(POST) — 반영 성공 · 한 서버 failed · relay 409 · timeout · 빈 fan-out · 1원 미만 · 못 읽음 · 대응 없음 · 서버 0 · 계좌 옮김 병렬 · 한쪽 실패 · 반영 끔 · 장중 무관 · 저장 RPC 오류 → relay 쓰기 0 · 업무 오류 400"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-ledger.test.ts#POST /api/admin/settlement/ledger — 거래 저장 · 예수금 반영 (14 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "바디 검증(D-09 · D-12 · D-29 · 칸 모양 · strict) · 비관리자 403 — RPC 0 · relay 0"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-ledger.test.ts#바디 검증 (11 tests) · 쓰기 경로 관문 · 지우기 · 다시 반영 관문"
        status: pass
    human_judgment: false
  - id: D3
    description: "거래 고치기(PUT) — 차이 한 벌만 · 반영 끔 · 저장 RPC 오류 → relay 쓰기 0 · 정산 줄 409 · 없는 id 404 · 경로 id 400"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-ledger.test.ts#PUT /api/admin/settlement/ledger/:id — 고치기 (6 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "거래 지우기(DELETE) — 되돌림 · 못 보낸 계좌 제외 · D-30 409 REVERT_UNREADABLE 세 문장 · 지운 뒤 보내기 실패 unreverted · message · 지우기 RPC 오류 → relay 쓰기 0"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-ledger.test.ts#DELETE /api/admin/settlement/ledger/:id — 지우기 · 되돌림 (11 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "다시 반영(RETRY) — 목표값 대조로 두 번 더하지 않음 · 다시 보냄 · 다시 실패 message · unreachable · 0 이하 · 없는 id"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement-ledger.test.ts#POST /api/admin/settlement/ledger/:id/retry — 다시 반영(목표값 대조) (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "reflectRows — 같은 계좌 증감 합쳐 한 번 · 실패 시 줄마다 자기 deltaKrw · 합친 targetKrw(44-08 몫)"
    verification:
      - kind: unit
        ref: "server/tests/routes/admin-settlement-ledger.test.ts#reflectRows (2 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/server run typecheck"
        status: pass
    human_judgment: false
  - id: D7
    description: "실제 relay · 매매 서버에서 op 6 반영이 계좌 메뉴 예수금과 같은 값으로 보이는지(운영)"
    verification: []
    human_judgment: true
    rationale: "가짜 relay 로만 검증 — 실제 매매 서버 반영 · timeout 뒤 늦은 반영 · 4계좌 등록 서버 수(RESEARCH A1)는 44-13 배포 날 확인 몫"

duration: 22min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 05: 거래 쓰기 + 예수금 반영(server) Summary

**거래 저장 · 고치기 · 지우기 · 다시 반영 라우트 4개가 「그 순간 relay 로 읽은 예수금 + 증감 → op 6 절댓값」 으로 예수금을 같이 고치고, 못 보낸 계좌는 사유 · 목표값과 함께 거래 pend 에 남기며(1원 미만 · 못 읽음 · 서버 없음 · 실패 · timeout · 빈 fan-out), 지우기는 되돌릴 수 없을 것을 미리 알면 D-30 문장으로 409 를 돌려준다 — 라우트 테스트 53건으로 잠갔다.**

## Performance

- **Duration:** 약 22분
- **Started:** 2026-11-20T01:13:00Z
- **Completed:** 2026-11-20T01:35:00Z
- **Tasks:** 2 (LEDGER-WRITE-OK · LEDGER-DELETE-RETRY-OK 도달)
- **Files modified:** 5 (새 파일 2 · 고친 파일 3)

## Accomplishments

- 반영 서비스 한 벌(`server/src/services/settlement-budget.ts`) — 계획(`planReflect`) · 목표값 pend(`planPend`) · 병렬 보내기(`sendReflect`) · 여러 줄 합쳐 보내기(`reflectRows`) · 다시 반영(`retryPend`) · D-30 사전 확인(`assertRevertable`) · 문장 2개.
- 거래 쓰기 라우트 4개 — 돈 경로 순서(검증 → 읽기 → RPC → 성공일 때만 보내기 → set_pend)를 POST · PUT · DELETE 모두 지킨다.
- zod 입력 검증 — 종류별 칸 모양 · 만원 배수 · 7자리 만원 상한 · D-29 사람-묶음 · D-12 미래 날짜 · 없는 날짜.

## Task Commits

1. **Task 1: 반영 서비스 + 거래 저장 · 고치기 + zod** — RED `64ae6c3a` (test) → GREEN `8138c518` (feat)
2. **Task 2: 거래 지우기(되돌림 · D-30) · 다시 반영** — RED `823b0635` (test) → GREEN `3fe58c4e` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 라우트 · 상태 코드

| 라우트 | 성공 응답 | 오류 |
|---|---|---|
| `POST /api/admin/settlement/ledger` | 200 `{ ok, id, pend }` | 400 `VALIDATION_FAILED`(zod · FUTURE_DATE · PERSON_NOT_IN_POOL · 23514) · 500 `DB_ERROR` · 403 |
| `PUT /api/admin/settlement/ledger/:id` | 200 `{ ok, id, pend }` | 400 · 404 `NOT_FOUND` · 409 `SETTLE_LINKED` · 500 · 403 |
| `DELETE /api/admin/settlement/ledger/:id` 바디 `{ reflect }` | 200 `{ ok, pend, unreverted, message? }` | 409 `REVERT_UNREADABLE` · 404 · 409 `SETTLE_LINKED` · 400 · 500 · 403 |
| `POST /api/admin/settlement/ledger/:id/retry` | 200 `{ ok, id, pend, message? }` | 404 · 500 · 403 |

- 반영 켬일 때 RPC 순서: `admin_settlement_raw` → `settlement_ledger_save`(또는 `_delete`) → `settlement_set_pend`(DELETE 는 남은 계좌가 있을 때만 · RETRY 는 pend 가 있던 줄만).
- 반영 끔: POST · PUT 은 `settlement_ledger_save` 1회만(relay 0 · 읽기 0) · DELETE 는 `settlement_ledger_delete` 1회만.
- 저장 · 지우기 RPC 가 어떤 오류든 실패하면 relay 예수금 쓰기 0 · `settlement_set_pend` 0(테스트 이름 「… RPC 오류 → relay 쓰기 0」 3건).

## 오류 문장

| 코드 | 문장 | 출처 |
|---|---|---|
| 400 (zod · FUTURE_DATE) | 미래 날짜는 적을 수 없어요 | D-12 |
| 400 (zod · PERSON_NOT_IN_POOL) | 심쥬니는 현중 · 근형 묶음 계좌에 출자 · 원금 회수를 적을 수 없어요 | D-29 |
| 400 (zod 칸 모양 · 23514) | 거래 값이 규칙에 맞지 않아요 | D-30 끝 재량 |
| 400 (zod 계좌 옮김 같은 계좌) | 보낸 계좌와 받은 계좌가 같아요 | UI-SPEC 오류 줄 |
| 400 (zod 금액) | 금액은 만원 단위예요 | 재량 |
| 404 `NOT_FOUND` | 없는 거래예요 | D-30 끝 재량 |
| 409 `SETTLE_LINKED` | 정산 때 만든 줄은 그 정산을 취소해야 사라져요 | D-30 끝 재량 |
| 409 `REVERT_UNREADABLE`(못 읽음 · 대응 · 서버 없음) | KB 정근형 예수금을 읽지 못해 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요 | D-30 글자 그대로 |
| 409 `REVERT_UNREADABLE`(1원 미만) | KB 정근형 예수금이 0 이하가 되어 되돌릴 수 없어요 — 스위치를 끄면 예수금은 그대로 두고 지워요 | D-30 글자 그대로 |
| 200 DELETE `message` | KB 정근형 예수금은 되돌리지 못했어요 — 계좌 메뉴에서 맞춰 주세요 | D-30 글자 그대로 |
| 200 RETRY `message` | 교보 김현중 미반영 — 매매 서버에 보내지 못했어요 / KB 정근형 미반영 — 예수금이 0 이하가 되어 보내지 않았어요 | UI-SPEC |

「KB 정근형」 자리는 그 계좌 라벨 · 여러 계좌면 화면 순서로 「 · 」 이음. 정산 취소(44-08)는 `assertRevertable(…, "취소해요")` · `unrevertedMessage` 를 그대로 쓴다.

## pend 사유별 처리

| 사유 | 언제 | 보냄 | targetKrw |
|---|---|---|---|
| `no_server` | 계좌 대응 없음 · active 등록 서버가 있는 연결 사용자 0 | 안 함 | null |
| `unreachable` | 이번 요청에서 그 계좌 예수금을 relay 로 못 읽음(DB 의 마지막 값으로는 계산하지 않음) | 안 함 | null |
| `below_one` | 지금 + 증감 < 1(op 6 의 0 = 해제 · Pitfall 1) | 안 함 | null |
| `failed` | 사용자 항목 error(relay 409 · 502 · 클라이언트 없음) · outcome 이 ok 아님 · **결과 0건(빈 fan-out · Pitfall 8)** | 함 | 보낸 값 |
| `timeout` | 결과 중 timeout 이 하나라도 있음(모름 · Pitfall 2) | 함 | 보낸 값 |

- 저장 RPC 의 pend = 보낼 모든 계좌(`planPend` — 막힌 계좌는 그 사유 · 보낼 계좌는 `failed` + 목표값) → 보낸 뒤 `settlement_set_pend` 가 남은 것만으로 덮는다. 그 사이 server 가 죽어도 다시 반영이 목표값 대조로 두 번 더하지 않는다.
- 다시 반영: 지금 값 = `targetKrw` 면 보내지 않고 반영됨 · 아니면 지금 + `deltaKrw`.
- 빈 fan-out: relay 가 `{ results: [] }` 로 답하면 `setAccountBudget` 은 1회 불렸지만 그 계좌는 미반영(`failed`) — `every` 가 빈 배열에서 참이 되는 것을 `results.length > 0` 이 막는다. 연결 사용자 0(fan-out 대상 0)은 보내기 전에 `no_server`.

## D-30 구현 요약

- **미리 막고 안내:** DELETE 반영 켬 → 읽기 → 옛 줄(`raw.ledger`)의 `appliedEffect` 를 되돌릴 증감으로 → `assertRevertable` 이 계획에 막힌 계좌가 하나라도 있으면 409 `REVERT_UNREADABLE`(지우기 RPC 0 · relay 쓰기 0 · set_pend 0). 못 읽음 · 서버 없음이 하나라도 있으면 「읽지 못해」, 전부 1원 미만이면 「0 이하가 되어」.
- **지운 뒤 보내기 실패:** 지우기 RPC 성공 → 보내기 → 남은 계좌를 지운 줄 pend 에 기록(D-21 추적) · 응답 `unreverted`(계좌 키) · `message`. 화면(44-10)은 이 응답으로 확인 창을 닫지 않고 확정 단추를 잠근다.
- 되돌릴 것이 없는 줄(반영 안 함 · 이미 전부 못 보낸 줄)은 반영 끔과 같게 지운다.

## Files Created/Modified

- `server/src/services/settlement-budget.ts` — 반영 서비스(+217줄)
- `server/src/routes/admin-settlement.ts` — POST · PUT · DELETE · RETRY 라우트 · RPC 오류 옮김 · 반영 결과 기록
- `server/src/schemas/settlement.ts` — 거래 바디 · 지우기 바디 · 경로 id zod(새 파일)
- `server/src/routes/admin-accounts.ts` — `fanoutOne` · `fanoutAudit` 에 export 만
- `server/tests/routes/admin-settlement-ledger.test.ts` — 라우트 · 서비스 테스트 53건(새 파일)

## Decisions Made

- 위 frontmatter `key-decisions` 6건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그 예방] `planReflect` 판정 순서 — 서버 없음을 못 읽음보다 먼저**
- **Found during:** Task 1
- **Issue:** 플랜 글은 「대응 없음 → 읽은 값 없음 → 1원 미만 → 서버 0」 순서인데, active 서버가 0 이면 relay 판정도 unknown 이라 읽은 값이 없어 늘 `unreachable` 이 되고 behavior 「active 서버 0 → no_server」 를 만족할 수 없다.
- **Fix:** 대응 없음 · 서버 0 → `no_server` 를 먼저, 그다음 `unreachable` · `below_one`.
- **Files modified:** server/src/services/settlement-budget.ts
- **Committed in:** 8138c518

**2. [Rule 2 - 빠진 검증] 없는 날짜 거부 · 7자리 만원 상한 상수**
- **Found during:** Task 1
- **Issue:** 정규식만으로는 `2026-02-30` 이 통과해 DB 에서 22007 → 500 이 된다.
- **Fix:** `TxDateSchema` 에 실제 날짜 확인 refine(「없는 날짜예요」). 상한 `SETTLEMENT_MAX_AMOUNT_KRW` 99,999,990,000.
- **Committed in:** 8138c518

**3. [작은 판단] 업무 규칙 문장에 경로 접두 없음**
- `parseOrThrow` 는 `who: 심쥬니는 …` 꼴이라 화면 「저장하지 못했어요 · <message>」 에 필드 이름이 보인다. 라우트 안 `parseSettlement` 가 `custom` 이슈만 문장 그대로 돌려준다(그 밖은 `parseOrThrow` 와 같은 꼴).
- **Committed in:** 8138c518

**4. [작은 판단] `planPend` export 추가**
- 플랜 이름 목록 밖의 export 하나. 저장 RPC 에 싣는 목표값 pend 를 POST · PUT 과 44-08 이 같은 함수로 만들게 했다.
- **Committed in:** 8138c518

**5. [작은 판단] `settlement_set_pend` 실패는 비치명**
- 플랜은 실패 처리를 정하지 않았다. relay 쓰기가 끝난 뒤라 500 을 주면 화면이 「저장 실패」 로 오해한다 — 경고 로그 한 줄(`settlement.op = "set-pend"` · id · 코드) 뒤 200. DB 에는 저장 때 남긴 목표값 pend 가 남아 다시 반영이 정리한다.
- **Committed in:** 8138c518

**6. [Rule 3 - 막힘 · 환경] RED 증거 리포터**
- **Issue:** `--reporter=tap-flat` stdout 첫 줄에 gcp-pino 진단 JSON 이 끼어(LOG_LEVEL=silent 로도 안 꺼짐) 분류기가 `invalid_record`(Unsupported report format). `tap-flat` 은 `--outputFile` 을 무시한다.
- **Fix:** vitest `--reporter=junit --outputFile=…` 로 리포터 자체 파일을 받아 `reportPath` · `runStartedAt` · `reportModifiedAt` 을 함께 기록 → 두 RED 모두 `RED_EVIDENCE_OK`. 보고서는 고치지 않았다. 증거 파일은 커밋하지 않고 scratchpad 로 옮겼다.

**7. [환경] 하네스가 복합 git · heredoc 명령을 거절**
- git 호출을 한 줄씩 나누고, 파일 덧붙이기는 Edit 로 했다. 플랜 시작 HEAD 는 지시받은 기준 `4ed20388` 을 그대로 썼다(원장 파일 대신).

---

**Total deviations:** 7 (버그 예방 1 · 빠진 검증 1 · 작은 판단 3 · 막힘 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 파일은 플랜 files_modified 5개뿐 · relay/ · shared · DB 손대지 않음.

## TDD Gate Compliance

- Task 1: `test(44-05)` 64ae6c3a → `feat(44-05)` 8138c518 — RED `RED_EVIDENCE_OK`(junit · 34건 중 33 실패 · 1 통과). 대상 「POST … > 반영 켬 출자 H → kbG 1억 → kbG 945,000,000 한 번 · …」 이 `expected 404 to be 200` 로 실패. 의미 판정: 대상이 실제로 돌았고 라우트가 없어 계획한 상태 단언에서 떨어졌다 — 불러오기 · 문법 · 픽스처 오류 없음. 통과한 1건은 「비관리자 403」(44-01 의 `/settlement` 경로 관문이 이미 막음 — 의도된 기존 동작).
- Task 2: `test(44-05)` 823b0635 → `feat(44-05)` 3fe58c4e — RED `RED_EVIDENCE_OK`(53건 중 17 실패). 대상 「DELETE … > (D-30) kbG 를 그 순간 못 읽음 → 409 REVERT_UNREADABLE …」 이 `expected 404 to be 409` 로 실패. 의미 판정 같음. 미리 통과한 것은 「없는 id → 404」 · 「비관리자 403」(라우트 없음 · 관문이 같은 결과를 냄 — GREEN 뒤에도 같은 단언으로 잠김).
- REFACTOR 커밋 없음.

## Issues Encountered

- server 전체 vitest 에서 `tests/routes/news.test.ts` V-news-cursor-a 1건 실패 — 오케스트레이터가 알려 준 날짜 의존 기존 실패(이 플랜과 무관 · 고치지 않음). 그 밖 59 파일 · 1103 통과.

## Known Stubs

- 없음.

## User Setup Required

None — 배포 · 원격 DB 는 44-13(메인 세션).

## Next Phase Readiness

- 44-08(정산 확정 · 취소)은 `planReflect` · `planPend` · `reflectRows`(바로 출금 여러 줄) · `assertRevertable(…, "취소해요")` · `unrevertedMessage` · `sendReflect` 를 그대로 쓴다. `fanoutOne` · `fanoutAudit` 는 admin-accounts 에서 export 됨.
- 44-10 화면: DELETE 409 `REVERT_UNREADABLE` 의 `message` 를 확인 창 오류 줄에 · 200 의 `unreverted` 가 비어 있지 않으면 창을 닫지 않고 `message` + 확정 잠금. RETRY 200 `message` 는 실패 줄 문장.
- 44-13: 4계좌 각각 active 등록 서버 수(RESEARCH A1) 확인 — 서버가 둘 이상이면 「한 대라도 실패면 미반영」 의 다시 반영이 성공한 서버 값으로 목표값 대조를 할 수 있다.

## Verification

- Task 1 `<automated>` — shared build · vitest 3 파일 87 통과 · server typecheck 0 → LEDGER-WRITE-OK
- Task 2 `<automated>` — vitest 2 파일 61 통과 · typecheck 0 → LEDGER-DELETE-RETRY-OK
- 플랜 `<verification>` — server vitest 전체 60 파일 중 59 통과 · 1104 중 1103 통과(실패 1 = 위 기존 news 실패)
- 인수 기준: T1 8항목(export 2 · 8 · below_one 7 · no_server 4 · targetKrw 14 · `results: []` 1 · activeLinkUsers 0 · personAllowedFor 3 · kstDateIso 3 · 「RPC 오류 → relay 쓰기 0」 2) · T2 6항목(delete 1 · retry 1 · REVERT_UNREADABLE 2 · unrevertedMessage 2 · D-30 세 조각 각 1 · 테스트 「지워요」 2 · 「맞춰 주세요」 1 · 「보내지 못했어요」 1 · 「보내지 않았어요」 1 · 「RPC 오류 → relay 쓰기 0」 3) 전부 통과

## Self-Check: PASSED

- 새 파일 2개 · 고친 파일 3개 있음 · 커밋 4개(`64ae6c3a` · `8138c518` · `823b0635` · `3fe58c4e`) 이 브랜치에 있음 · `git rev-list --count 4ed20388..HEAD` = 4 · STATE.md · ROADMAP.md 손대지 않음 · 마이그레이션 손대지 않음.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
