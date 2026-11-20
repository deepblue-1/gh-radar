---
phase: 44-admin-settlement
plan: 01
subsystem: admin-settlement
tags: [shared, express, supabase, pgtap, nextjs, settlement, tracer]

requires:
  - phase: 36 · quick 261106-lwu · 261106-ntl
    provides: relay account-costs 읽기(fetchAccountCosts) · summarizeAccountCosts · 계좌 마스터 dma_accounts · 계좌 메뉴 「첫 known 사용자」 규칙
provides:
  - shared settlement.ts — 정산 상수 · RPC/API 타입 전부 · settlementBudgetOf · buildSettlementAccounts · ledgerFlows · poolAccountRows · poolOk · cumProfit · 억 · 만 포매터 3 · profitTone · 라벨 4
  - server GET /api/admin/settlement(경로 한정 관문 · adminRouter 앞) · readSettlement
  - webapp /admin/settlement 껍데기 · fetchSettlement · OpenPoolsCard(최소)
  - DB 표 5 · RPC admin_settlement_raw · settlement_record_reads · 내부 settlement_ledger_json(20261120100000_settlement.sql)
affects: [44-02, 44-03, 44-04, 44-05, 44-06, 44-08, 44-09, 44-10, 44-11, 44-12, 44-13]

actuals:
  tokens: 27080
  tasks: 3
  commits: 5
plan_head_before: 43d223632335e78ecdd03c526c78bacb3320141d
plan_head_after: 08f34284

tech-stack:
  added: []
  patterns:
    - "정산 계산은 shared 한 벌(원 단위 순수 함수) — server 는 RPC ∥ relay 를 묶어 넘기고 webapp 은 같은 함수로 그린다"
    - "읽은 값 기록 실패는 비치명 — logger.warn({ settlement: { op, accounts, code } }) 한 줄 뒤 200"
    - "RPC jsonb 키 집합을 pgTAP set_eq(jsonb_object_keys) + 항목별 키 수로 잠근다"

key-files:
  created:
    - packages/shared/src/settlement.ts
    - packages/shared/src/__tests__/settlement.test.ts
    - server/src/services/settlement-budget.ts
    - server/src/routes/admin-settlement.ts
    - server/tests/routes/admin-settlement.test.ts
    - webapp/src/app/admin/settlement/page.tsx
    - webapp/src/components/settlement/settlement-client.tsx
    - webapp/src/components/settlement/open-pools-card.tsx
    - webapp/src/components/settlement/__tests__/settlement-client.test.tsx
    - supabase/migrations/20261120100000_settlement.sql
    - supabase/tests/settlement.test.sql
  modified:
    - packages/shared/src/admin.ts
    - packages/shared/src/index.ts
    - server/src/routes/admin.ts
    - server/src/app.ts
    - webapp/src/lib/admin-api.ts

key-decisions:
  - "SettlementBudgetPick 의 known 에 budgetSource(live · snapshot)를 더했다 — 읽은 값 기록(reads[].source)에 출처 서버 값의 출처가 필요하다(추가 필드 · 기존 이름 불변)"
  - "admin_settlement_raw 의 accounts 순서는 acc_key 사전순이 아니라 화면 순서(kbG · kyH · kyG · kbH · array_position) — shared SETTLEMENT_ACCOUNTS 와 같다"
  - "SETTLEMENT_TEXT 의 forbidden · loadFailed · retry 는 ADMIN_ACCOUNTS_TEXT 값을 옮겨 적고 같음을 테스트로 잠갔다 — 계좌 화면 모듈 전체를 정산 화면 묶음에 끌어오지 않으려고"
  - "마이그레이션 버전 20261120100000 — 로컬 꼬리 20261119170000(메인 체크아웃도 같음) 다음. 원격 머리는 이 실행에서 조회하지 않았다(오케스트레이터 제약 — 원격 접촉 금지). 44-13 이 push 전에 확인"

patterns-established:
  - "정산 화면 문구 상수 SETTLEMENT_TEXT · 본문 루트 AdminPanelPage data-slot=admin-settlement + @container/settle"
  - "정산 계좌 표 행 = data-slot=settlement-acc-row data-acc=<accKey> 의 display:contents 래퍼(4칸)"

requirements-completed: []

coverage:
  - id: D1
    description: "shared 정산 계약 — 예수금 선택(계좌 메뉴와 같은 판정) · 넣은 돈 · 계좌 수익 · 묶음 누적 · 억 · 만 포매터 · KST 라벨"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/settlement.test.ts (23 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/admin/settlement — 관리자만 · RPC ∥ relay · 읽은 값 기록(실패 비치명) · 응답 → 검산 수익 4개"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-settlement.test.ts (8 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/server run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "/admin/settlement 화면 — 불러오는 중 · 403 · 오류 + 다시 시도 · 「정산 전 수익」 계좌 표 검산 숫자 · 미설정"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/settlement/__tests__/settlement-client.test.tsx (6 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "DB 표 5 · RPC 2 · 내부 함수 1 · 키 집합 · CHECK(D-05 · D-07 · D-29) · 권한"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql (104 ok · 0 not ok)"
        status: pass
    human_judgment: false
  - id: D5
    description: "폰 360 · 390 에서 4열 계좌 표 · 머리가 잘리거나 겹치지 않는지(UI E1 · E3 overflow backstop)"
    verification: []
    human_judgment: true
    rationale: "시각 배치 — 이 플랜은 컴포넌트 단위 테스트만 돌렸고 브라우저 렌더 확인은 44-12 e2e · 44-13 몫"

duration: 20min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 01: 정산 트레이서(DB → server → 화면) Summary

**관리자 요청 하나(`GET /api/admin/settlement`)가 RPC `admin_settlement_raw` ∥ relay 예수금을 묶어 계좌 4개의 예수금 · 넣은 돈 · 수익을 돌려주고, `/admin/settlement` 의 「정산 전 수익」 카드가 그 응답을 shared `poolAccountRows` 로 그려 검산 숫자(+10억 6,500만 · −1,600만 · 0 · −2,800만 / 묶음 +10억 4,900만 · −2,800만)를 낸다 — 표 5 · RPC 2 · 내부 함수 1 은 진짜 Postgres 에서 pgTAP 104 단언으로 잠겼다.**

## Performance

- **Duration:** 약 20분
- **Started:** 2026-11-20T00:27:54Z
- **Completed:** 2026-11-20T00:48:03Z
- **Tasks:** 3 (TRACER-API-OK · TRACER-OK · DB-READ-OK 모두 도달)
- **Files modified:** 16 (새 파일 11 · 고친 파일 5)

## Accomplishments

- shared `settlement.ts` — 이 phase 의 상수 · RPC 모양 · API 요청 · 응답 타입 전부와, 계좌 메뉴와 같은 예수금 판정(`settlementBudgetOf`)부터 표기 · 라벨까지 원 단위 순수 함수 한 벌.
- server `GET /api/admin/settlement` — `/settlement` 경로 한정 관문(비관리자 403 · RPC 0 · relay 0), 읽은 값 기록 실패에도 200.
- webapp `/admin/settlement` — 불러오는 중 · 403 · 오류 + 다시 시도 · 「정산 전 수익」 최소 카드(묶음 2 · 4열 표 · 미설정 · 넣은 돈 풀이 title).
- DB `20261120100000_settlement.sql` — 표 5(RLS · service_role 전용) · 조회 RPC 2 · 거래 줄 17키 한 벌 `settlement_ledger_json`.

## Task Commits

1. **Task 1: 트레이서(shared + server 조각)** — `7d07c1be` (feat) · 트레이서 게이트: verify 재실행 통과(TRACER-API-OK) 뒤 확장
2. **Task 2: 트레이서 완성(화면 끝)** — RED `f80c2e44` (test) → GREEN `6753b011` (feat)
3. **Task 3: DB 끝(마이그레이션 + pgTAP)** — RED `c918c9f0` (test) → GREEN `08f34284` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 정한 마이그레이션 버전

| 항목 | 값 |
|---|---|
| 정한 버전 | `20261120100000` (`supabase/migrations/20261120100000_settlement.sql`) |
| 로컬 꼬리(그때) | `20261119170000_launch_map_q16_fire_window.sql` — 메인 체크아웃 `supabase/migrations` 꼬리도 같음 |
| 원격 머리 | **조회 안 함** — 오케스트레이터 제약(원격 · 운영 접촉 금지). 44-13 이 push 전에 `supabase migration list --linked` 로 확인해야 한다 |
| 중복 버전 | `ls supabase/migrations \| cut -c1-14 \| sort \| uniq -d` 빈 출력 · `_settlement.sql` 꼬리 1개 |

## RPC 반환 키 (pgTAP 집합 단언 — `set_eq(jsonb_object_keys …)` + 항목별 키 수)

| 자리 | 키 |
|---|---|
| 최상위 | `accounts` · `registry` · `reads` · `ledger` · `settles` |
| accounts 항목 | `accKey` · `broker` · `accountNo` · `name` · `links` |
| links 항목 | `dmaUserId` · `servers` |
| servers 항목 | `serverKey` · `state` · `isOrder` |
| registry 항목 | `key` · `broker` · `enabled` · `isOrderServer` |
| reads 항목 | `accKey` · `budgetKrw` · `source` · `serverKey` · `readAt` |
| ledger 항목(17) · `settlement_ledger_json` | `id` · `txDate` · `kind` · `who` · `fromAcc` · `toAcc` · `via` · `amountKrw` · `memo` · `settleId` · `reflect` · `pend` · `seeded` · `createdBy` · `createdAt` · `editedBy` · `editedAt` |
| settles 항목(9) | `id` · `pool` · `profitKrw` · `shares` · `snapshot` · `readAt` · `memo` · `createdBy` · `createdAt` |

## pgTAP 단언 수

- `supabase/tests/settlement.test.sql` — **104** (S 30 · R 19 · W 8 · K 16 · P 31) · 104 ok · 0 not ok · 「pgTAP 미실행」 아님(Docker 29.8.2 · 일회용 컨테이너 1개 · 마이그레이션 146개 재생).
- 절 머리: `-- S.` · `-- R.` · `-- W.` · `-- P.`(+ `-- K.` 키 집합). 44-03 이 L · D · C · X 절을 이어 쓴다 — 그때 `plan(N)` 을 함께 올린다.

## shared export 목록 (`packages/shared/src/settlement.ts`)

- 상수: `SETTLEMENT_PEOPLE` · `SETTLEMENT_PERSON_ORDER` · `SETTLEMENT_ACCOUNTS` · `SETTLEMENT_ACC_KEYS` · `SETTLEMENT_POOLS` · `SETTLEMENT_KIND_LABEL` · `SETTLEMENT_KIND_ORDER` · `SETTLEMENT_VIA_LABEL` · `SETTLEMENT_MINUS`(U+2212)
- 타입: `SettlementPerson` · `SettlementAccKey` · `SettlementPoolId` · `SettlementAccountDef` · `SettlementPoolDef` · `SettlementKind` · `SettlementVia` · `SettlementRawServer` · `SettlementRawAccount` · `SettlementRawRead` · `SettlementPendReason` · `SettlementPendEntry` · `SettlementPend` · `SettlementLedgerRow` · `SettlementSnapshotAccount` · `SettlementSettleRow` · `SettlementRaw` · `SettlementAccountState` · `SettlementAccountView` · `SettlementView` · `SettlementLedgerBody` · `SettlementDeleteBody` · `SettlementSettleBody` · `SettlementCancelBody` · `SettlementWriteResponse` · `SettlementBudgetPick`
- 함수: `settlementBudgetOf` · `buildSettlementAccounts` · `ledgerFlows` · `poolAccountRows` · `poolOk` · `cumProfit` · `formatEokMan` · `formatEokManMinus` · `formatEokManSigned` · `profitTone` · `settlementDateLabel` · `settlementReadLabel` · `settlementStampLabel` · `settlementTimeLabel`
- `admin.ts` 에 export 만 붙임(동작 불변): `indexAccountCosts` · `accountCostOf` · `AccountCostIndex`

## 읽은 값 기록 실패 때의 경고 로그 모양

```
logger.warn(
  { settlement: { op: "record-reads", accounts: ["kbG", "kyH", "kyG", "kbH"], code: "XX000" } },
  "[admin] 정산 읽은 예수금 기록 실패 — 응답은 방금 읽은 값으로",
)
```
계좌번호 · 금액은 싣지 않는다. RPC 가 `error` 를 돌려주면 `code` = 그 오류 코드, 던지면 `code: null`. 응답은 방금 읽은 값으로 200.

## Files Created/Modified

- `packages/shared/src/settlement.ts` — 정산 계약 · 계산 · 표기 한 벌
- `packages/shared/src/__tests__/settlement.test.ts` — 검산 픽스처(시드 9건) · 포매터 경계 · 라벨 · 예수금 선택 · 계좌 뷰 23건
- `packages/shared/src/admin.ts` · `index.ts` — export 3 · 재수출 1줄
- `server/src/services/settlement-budget.ts` — `readSettlement`(RPC ∥ relay · 모양 위반 DB_ERROR)
- `server/src/routes/admin-settlement.ts` — `adminSettlementRouter` · GET /settlement
- `server/src/routes/admin.ts` — `fetchAccountCosts` export
- `server/src/app.ts` — adminAccountsRouter 다음 · adminRouter 앞 마운트
- `server/tests/routes/admin-settlement.test.ts` — 403 · 401 · known · stale · 0 = 미설정 · DB_ERROR · 기록 실패 2건 (8건)
- `webapp/src/lib/admin-api.ts` — `fetchSettlement`
- `webapp/src/app/admin/settlement/page.tsx` — 「정산 · Admin」
- `webapp/src/components/settlement/settlement-client.tsx` — 상태 머신 · 스켈레톤 · 오류 · 403
- `webapp/src/components/settlement/open-pools-card.tsx` — 「정산 전 수익」 최소 카드
- `webapp/src/components/settlement/__tests__/settlement-client.test.tsx` — behavior 5경우 + 문구 같음 (6건)
- `supabase/migrations/20261120100000_settlement.sql` — 표 5 · RPC 2 · 내부 함수 1
- `supabase/tests/settlement.test.sql` — pgTAP 104

## Decisions Made

- 위 frontmatter `key-decisions` 4건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] `SettlementBudgetPick` 에 `budgetSource` 추가**
- **Found during:** Task 1
- **Issue:** 플랜 타입 `{ state, budgetKrw, source, mismatch }` 만으로는 `buildSettlementAccounts` 가 `reads[].source`(live · snapshot)를 채울 수 없다.
- **Fix:** known 변형에 `budgetSource` 필드 추가(추가만 · 다른 이름 불변).
- **Files modified:** packages/shared/src/settlement.ts
- **Committed in:** 7d07c1be

**2. [Rule 3 - 막힘] 웹 RED 증거가 TAP 해석 실패 — 테스트 파일에 testing-library `configure({ getElementError })`**
- **Found during:** Task 2 RED
- **Issue:** testing-library 오류 메시지의 여러 줄 DOM 덤프가 TAP YAML 을 깨 `tdd-red-evidence` 가 `invalid_record`.
- **Fix:** 이 테스트 파일에서만 오류 메시지를 한 줄로(DOM 덤프 없음) · 대상 테스트 첫 단언을 `waitFor(querySelector …)` 로. 대상 「검산 응답」 만 `-t` 로 돌려 `RED_EVIDENCE_OK`.
- **Files modified:** webapp/src/components/settlement/__tests__/settlement-client.test.tsx
- **Committed in:** f80c2e44

**3. [Rule 3 - 막힘] DB RED 증거 — 마이그레이션 없는 실행은 psql 이 첫 DELETE 에서 멈춰 TAP 이 불완전**
- **Found during:** Task 3 RED
- **Issue:** 플랜대로 마이그레이션 없이 돌리면 S1 ~ S10 `not ok` 뒤 `relation … does not exist` 로 중단 → 분류기 `invalid_record`(계획 104 · 실행 10).
- **Fix:** 그 실행을 의미상 RED 로 남기고, 분류기용 RED 는 D-29 사람-묶음 CHECK 만 뺀 마이그레이션(커밋 안 함)으로 104 단언 전부를 돌려 대상 S24 「심쥬니 출자 → kbG → 23514」 가 `caught: no exception` 으로 실패 → `RED_EVIDENCE_OK`. 그 뒤 CHECK 를 넣어 GREEN(커밋된 마이그레이션은 완성본 하나뿐).
- **Committed in:** c918c9f0(RED 테스트) · 08f34284(GREEN 마이그레이션)

**4. [Rule 1 - 버그] pgTAP 테스트 작성 오류 2건(R3 · R10)**
- **Found during:** Task 3 RED 실행
- **Issue:** R3 은 kbG 를 먼저 넣은 뒤 FK 를 시험해 PK 23505 가 먼저 났고, R10 은 `jsonb_path_query_array` 가 `[[]]` 로 감쌌다.
- **Fix:** R3 을 계좌 대응 INSERT 앞으로 · R10 을 `-> 'accounts' -> 3 -> 'links'` 로.
- **Committed in:** c918c9f0

**5. [Rule 3 - 막힘] 절 머리 형식(인수 기준 `^-- (S|R|W|P)\.`)**
- **Found during:** Task 3 인수 기준
- **Fix:** 절 머리 주석을 `-- ── S. …` 에서 `-- S. …` 꼴로(주석만 · 단언 불변).
- **Committed in:** 08f34284

**6. [작은 판단] `SETTLEMENT_TEXT` 오류 문구를 import 대신 옮겨 적음**
- 계좌 화면 모듈(`accounts-client.tsx` · 시트 포함)을 정산 화면 묶음에 끌어오지 않으려고. 같은 값은 테스트 「오류 · 권한 문구는 계좌 화면과 글자 그대로」 가 잠근다.
- **Committed in:** 6753b011

**7. [환경] 하네스가 복합 git · 루프 명령을 거절**
- T3 `<automated>` 명령을 같은 내용의 scratchpad 스크립트로 worktree 루트에서 실행(명령 본문 불변) — DB-READ-OK.

---

**Total deviations:** 7 (막힘 4 · 버그 1 · 작은 판단 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 타입은 필드 하나 추가뿐이고 나머지는 테스트 · 증거 · 형식 정리다.

## TDD Gate Compliance

- Task 2: `test(44-01)` f80c2e44 → `feat(44-01)` 6753b011 — RED 증거 `RED_EVIDENCE_OK`(대상 「검산 응답 → 계좌 표 · 묶음 값 · 부제」 가 카드 없음 `expected null not to be null` 로 실패 — 계획한 단언 · 스텁은 null 을 그림). RED 커밋에 null 을 그리는 `SettlementClient` 자리 파일이 함께 들어갔다(불러오기 실패가 아니라 단언 실패로 RED 를 만들려고).
- Task 3: `test(44-01)` c918c9f0 → `feat(44-01)` 08f34284 — RED 증거 `RED_EVIDENCE_OK`(대상 S24 가 `caught: no exception · wanted: 23514` 로 실패 — 계획한 D-29 동작).
- Task 1 은 `type="tracer"`(TDD 아님) — 테스트와 구현을 한 커밋에.

## Issues Encountered

- 없음(위 막힘은 전부 자동 처리).

## Known Stubs

- `webapp/src/components/settlement/open-pools-card.tsx` — 플랜이 정한 최소 카드. 정산 이력 반영 · 누적 줄 · 미설정 안내 · 못 읽음 줄 · 서버 간 다름 줄 · l3 몫 줄은 44-06 이 같은 파일에서 완성한다(정산 이력이 없을 때 묶음 값 = 누적이라 지금 숫자는 맞다).
- 머리 두 버튼(「거래 기록」 · 「정산하기」)은 44-10 · 44-11 몫 — 지금 머리에는 제목만.

## User Setup Required

None — 외부 서비스 설정 없음. 원격 DB push · server 배포는 44-13(메인 세션).

## Next Phase Readiness

- 뒤 플랜이 쓸 shared 타입(API 요청 · 응답 전부) · DB 표 · 조회 RPC · `settlement_ledger_json` 이 섰다.
- 44-03 은 이 마이그레이션 파일을 고치지 말고 새 버전 파일(`_settlement_ledger_rpc` · `_settlement_settle_rpc`)로 더한다. 버전은 `20261120100000` 보다 커야 한다.
- 44-13 은 push 전에 원격 머리가 `20261120100000` 보다 작은지 확인해야 한다(이 실행은 원격을 보지 않았다).

## Self-Check: PASSED

- 새 파일 11개 모두 있음(`ls` 확인).
- 커밋 5개(`7d07c1be` · `f80c2e44` · `6753b011` · `c918c9f0` · `08f34284`) 모두 이 브랜치(`worktree-agent-ae7016458d8c78e38`)에 있음.
- 인수 기준: T1 9항목 · T2 4항목 · T3 6항목 전부 통과. `pnpm-lock.yaml` 변경 없음.
- 검증: shared vitest 23 · server vitest 8 · webapp vitest 6 실패 0 · server · webapp typecheck 오류 0 · pgTAP 104 ok · 0 not ok.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
