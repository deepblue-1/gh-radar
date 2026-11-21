---
phase: 44-admin-settlement
verified: 2026-11-21T16:05:00+09:00
status: human_needed
score: 12/13 must-haves verified
covered_files:
  - ".planning/phases/44-admin-settlement/44-01-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-01-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-02-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-02-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-03-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-03-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-04-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-04-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-05-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-05-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-06-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-06-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-07-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-07-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-08-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-08-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-09-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-09-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-10-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-10-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-11-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-11-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-12-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-12-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-13-PLAN.md"
  - ".planning/phases/44-admin-settlement/44-13-SUMMARY.md"
  - ".planning/phases/44-admin-settlement/44-REVIEW-DISPOSITION.md"
  - ".planning/phases/44-admin-settlement/44-REVIEW-FIX.md"
  - ".planning/phases/44-admin-settlement/44-UI-REVIEW.md"
  - ".planning/phases/44-admin-settlement/44-UI-SPEC.md"
  - "packages/shared/src/__tests__/settlement-reflect.test.ts"
  - "packages/shared/src/admin.ts"
  - "packages/shared/src/index.ts"
  - "packages/shared/src/order-endpoint.ts"
  - "packages/shared/src/settlement.ts"
  - "server/src/app.ts"
  - "server/src/routes/admin-accounts.ts"
  - "server/src/routes/admin-settlement.ts"
  - "server/src/routes/admin.ts"
  - "server/src/schemas/settlement.ts"
  - "server/src/services/settlement-budget.ts"
  - "server/tests/routes/admin-settlement-ledger.test.ts"
  - "server/tests/routes/admin-settlement-settle.test.ts"
  - "supabase/migrations/20261120100000_settlement.sql"
  - "supabase/migrations/20261120110000_settlement_ledger_rpc.sql"
  - "supabase/migrations/20261120120000_settlement_settle_rpc.sql"
  - "supabase/migrations/20261120130000_settlement_seed.sql"
  - "webapp/e2e/specs/admin-settlement.spec.ts"
  - "webapp/src/app/admin/settlement/page.tsx"
  - "webapp/src/components/admin/admin-sheet.tsx"
  - "webapp/src/components/layout/app-sidebar.tsx"
  - "webapp/src/components/settlement/account-table.tsx"
  - "webapp/src/components/settlement/activity-card.tsx"
  - "webapp/src/components/settlement/ledger-row.tsx"
  - "webapp/src/components/settlement/ledger-sheet.tsx"
  - "webapp/src/components/settlement/name-vs-card.tsx"
  - "webapp/src/components/settlement/open-pools-card.tsx"
  - "webapp/src/components/settlement/person-cards.tsx"
  - "webapp/src/components/settlement/reflect-box.tsx"
  - "webapp/src/components/settlement/settle-confirm.tsx"
  - "webapp/src/components/settlement/settle-row.tsx"
  - "webapp/src/components/settlement/settle-sheet.tsx"
  - "webapp/src/components/settlement/settlement-client.tsx"
  - "webapp/src/components/settlement/settlement-format.ts"
  - "webapp/src/components/settlement/transfer-card.tsx"
  - "webapp/src/lib/admin-api.ts"
  - "webapp/src/styles/globals.css"
covered_digest: "v4:sha256:48acd44310ef8887d9b8d0988d51838147bf98c32b28363a6351160c3d3e08da"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_report: 44-VERIFICATION.md
  previous_status: gaps_found
  previous_score: 10/13
  gaps_closed:
    - "거래 고치기 · 지우기 · 정산 취소가 예수금을 두 번 넣거나 되돌리지 못하는 일 없이 맞춘다 (D-19 · D-23 · D-26 · 리서치 Pitfall 2) — CR-01 · 8ba37647"
    - "사람 카드 큰 숫자 값이 UI-SPEC ② 계약과 같다 — totalKrw 결정이 UI-SPEC · UI-REVIEW · e2e 주석에 반영됨(1891bf5a · a3ec92d0)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "운영 매매 서버에서 실제 예수금 반영 · 되돌림과 실제 숫자가 CONTEXT 검산과 맞는다 — CR-01 수정 뒤 server(a3ec92d0) 기준"
    test: "수정 뒤 배포된 운영 server 에서 정산 화면 소액 거래를 「예수금에도 반영」 켠 채 저장 → 계좌 메뉴 예수금 확인 → 그 거래 고치기(금액 변경) → 차이만큼만 바뀌는지 확인 → 지우기(되돌림 켬) → 원래 값 복귀 확인. 첫 화면 숫자를 CONTEXT 검산과 대조"
    expected: "저장 직후 그 계좌 예수금이 거래 금액만큼, 고치기 뒤 차이만큼만 바뀌고, 지우면 원래 값으로 돌아온다. 계좌이체 4억 · 7억 · 법인 용역 3억 은 검산과 같다"
    why_human: "운영 relay · 매매 서버 op 6 쓰기가 필요하다(VALIDATION Manual-Only). 44-13-SUMMARY 의 사용자 pass 는 CR-01 수정(8ba37647) 이전 코드 기준이고, 44-REVIEW-FIX 도 CR-01 을 「fixed: requires human verification」 으로 표시했다. timeout-이지만-적용됨 자체는 운영에서 일부러 만들 수 없으므로 정상 경로(반영 → 고치기 → 되돌림)가 수정 뒤에도 그대로인지만 본다"
human_verification:
  - test: "수정 뒤 운영 server 에서 소액 거래 반영 저장 → 고치기(금액 변경) → 지우기(되돌림 켬), 각 단계 뒤 계좌 메뉴 예수금 확인 · 첫 화면 숫자 검산 대조"
    expected: "반영 · 차이 반영 · 복귀가 거래 금액만큼 정확하다. 계좌이체 4억 · 7억 · 법인 용역 3억 은 검산과 같다"
    why_human: "운영 relay · 매매 서버 필요. 이전 사용자 pass 는 CR-01 수정 전 코드였다"
---

# Phase 44: 어드민 정산 재검증 보고서 (R2)

**Phase Goal:** 어드민이 `/admin/settlement` 한 화면에서 ① 세 사람이 각자 수익 중 얼마가 자기 몫인지 ② 정산을 확정해 날짜 찍힌 기록으로 남기고 ③ 계좌에서 돈이 들고 난 내역을 적고 ④ 김현중 ↔ 정근형 사이의 명의 대 몫과 실제 오간 계좌이체 누적을 본다.
**Verified:** 2026-11-21 16:05 KST
**Status:** human_needed
**Re-verification:** Yes — 갭 클로징 뒤 재검증. 이전 보고서 `44-VERIFICATION.md`(gaps_found · 10/13 · 커밋 d897f0f7 시점). 이전 보고서는 덮어쓰지 않았다.

## 한 줄 결론

이전에 막았던 CR-01(Truth 6)은 **고쳐졌다** — 목표값 대조가 이제 다시 반영 · 고치기 · 지우기 · 정산 취소 네 길 모두에 걸려 있고, 「보냈는데 지금 못 읽음」 은 409 로 막는다. 네 길 각각에 「timeout 이었지만 실제로 들어감(지금 값 = 목표값)」 회귀 테스트가 있고 검증자가 직접 돌려 통과했다. Truth 12(큰 숫자)도 코드 · UI-SPEC · UI-REVIEW · e2e 주석이 `totalKrw` 로 맞춰졌다. 남은 것은 **수정 뒤 운영 server 에서의 실반영 확인(Truth 13) 하나**라 `human_needed` 다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ① 세 사람 카드 몫 계산 (규칙 1 · 3 · 4 · D-06) | ✓ VERIFIED (회귀) | shared 정산 테스트 84 통과(내가 재실행 · 이전 75 + CR-01 · IN-02 추가분). `personSummary` 무변경 계산 · `person-cards.tsx` 연결 유지 |
| 2 | 수익 = 예수금 − 넣은 돈 · 손익 보정 없음 (규칙 2 · D-01 · D-02) | ✓ VERIFIED (회귀) | D-02 grep: 정산 shared · server · schemas · webapp 정산 컴포넌트 · 마이그레이션에서 `realized_pnl` · `dma_journal_events` · `admin/pnl` 0건(내가 재실행) |
| 3 | 「정산 전 수익」 카드 · 미설정 「—」 · 확정 잠금 · D-28 (D-24 · D-25 · D-28) | ✓ VERIFIED (회귀) | webapp 정산 컴포넌트 156 통과 · D-03 대조 테스트 `account-linked-summary.test.ts` 19 통과(내가 재실행). IN-02 가 쥬니 「원금 4억까지 … 남음」 문장 기준을 `carryBasisLabel` 로 바꿨으나 시드 상태 문구는 같다(`open-pools-card.test.tsx` 추가 단언) |
| 4 | ② 정산 확정 — 서버 계산 · 기록 · 최근 것만 취소 (규칙 3 · D-15 ~ D-17) | ✓ VERIFIED (회귀) | server 정산 3파일 110 통과(내가 재실행). 확정 라우트 변경 없음(`admin-settlement.ts:515-579`) · 마이그레이션 diff 0 |
| 5 | ③ 거래 4종 기록 · 시드 9건 · D-29 | ✓ VERIFIED (회귀) | 마이그레이션 · zod 무변경(`git diff d897f0f7..HEAD -- supabase` 0). server 검증 테스트 통과 |
| 6 | ③ 거래 고치기 · 지우기 · 정산 취소가 예수금을 두 번 넣거나 되돌리지 못하는 일 없이 맞춘다 (D-19 · D-23 · D-26 · Pitfall 2) | ✓ VERIFIED | **아래 「Truth 6 상세」.** shared `reconcilePend` · `appliedEffectAt`(`settlement.ts:933-970`) 한 판정을 네 길이 모두 쓴다. 이 truth 는 상태 전이 · 순서 불변식이라 존재만으로 VERIFIED 하지 않았다 — 길마다 실제 보낸 `budgetKrw` 를 단언하는 named 테스트 10건을 검증자가 직접 돌려 통과 |
| 7 | ④ 명의 대 몫 · 증여 판단 없음 (규칙 6) | ✓ VERIFIED (회귀) | `name-vs-card.tsx` 변경은 대비 색 클래스 1줄. e2e 는 5,950만 · 9억 2,450만 단언 유지 |
| 8 | ④ 계좌이체 누적 4억 · 7억 · 법인 용역 3억 (규칙 5 · 6) | ✓ VERIFIED (회귀) | `transfer-card.tsx` 변경은 색 · 간격만. shared `hgOf` · `hgSum` 무변경 |
| 9 | 관리자만 (D-18) | ✓ VERIFIED (회귀) | 관문 그대로. IN-05 의 쓰기 줄 세우기(`serializeSettlementWrites`)는 관리자 확인 뒤에 걸린다(REVIEW-FIX). 비관리자 403 테스트 통과 |
| 10 | D-30 — 되돌릴 수 없으면 미리 409 · 보내기만 실패하면 확정 잠금 | ✓ VERIFIED | `assertRevertable`(`settlement-budget.ts:268-282`) 문장 그대로. 이전 보고서의 단서(「판정 입력 `appliedEffect` 에 Truth 6 결함」)는 해소됐다 — 입력이 이제 `revertOf`(목표값 대조 · `unknownApplied: true`)다 |
| 11 | D-02 · 금지 사항: relay · pnpm-lock · 계좌 메뉴 판정 무변경 · 새 포커스 링 · 토스트 · alert 없음 | ✓ VERIFIED (회귀) | `git diff a459e845..HEAD -- relay` · `pnpm-lock.yaml` · `packages/shared/src/account-linked-summary.ts` 모두 0(내가 재실행). `webapp/src/components/settlement`(테스트 제외)에서 `focus-visible:ring` · `toast` · `alert(` · `window.confirm` 0건. `ACTIVITY_SMALL_BUTTON` 의 `ring-1 ring-inset` 은 이전부터 있던 테두리이지 포커스 링이 아니다 |
| 12 | 사람 카드 큰 숫자 값이 UI-SPEC ② 계약과 같다 | ✓ VERIFIED | 코드 `person-cards.tsx:88` `formatEokManMinus(x.totalKrw)` · 합계 줄 `:124` `x.stakeKrw`. UI-SPEC ② 표 `:222` 「값은 `personSummary().totalKrw` … 검산 5억 2,450만 · 5억 2,450만 · 0 … 사용자 결정 2026-11-21」 · 합계 `:229` 「지금 몫 전체 9억 2,450만」 · 시선 앵커 `:333` 「값 = `totalKrw` — 사용자 결정」. 44-UI-REVIEW `:40` 「[결정됨 2026-11-21 · totalKrw 유지]」. e2e `admin-settlement.spec.ts:16` · `:143` 「totalKrw 유지 — 사용자 결정」. 네 곳이 같은 값을 가리킨다 |
| 13 | 운영 실제 동작 — 실제 예수금 반영 · 되돌림 · 운영 숫자가 검산과 맞음 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 오케스트레이터 보고(검증자 미관측): server Cloud Run `gh-radar-server-00100-rzk` · APP_VERSION a3ec92d0 · 스모크 15/15 · webapp push 287c3fe5..a3ec92d0 · Vercel Ready · 비인증 GET 401. 실제 op 6 쓰기는 이 검증이 재현할 수 없다. 44-13-SUMMARY 의 사용자 pass 는 CR-01 수정 **전** 코드 기준이다 → 아래 Human Verification |

**Score:** 12/13 truths verified (1 present, behavior-unverified — 운영 확인)

### Truth 6 상세 — CR-01 수정 독립 확인

**판정 한 벌(shared).** `reconcilePend(pend, now)`(`settlement.ts:933-950`) — pend 계좌마다 `targetKrw !== null` 이면 지금 값을 본다: 지금 값 없음 → `unknown`(pend 에 남김), 지금 값 = 목표값 → `landed`(pend 에서 뺌 = 들어감), 다름 → 남김. 목표값 없음(못 읽음 · 1원 미만 · 서버 없음으로 안 보냄)은 늘 남김. `appliedEffectAt(row, now, { unknownApplied })`(`:957-970`) 가 이 결과로 `appliedEffect` 를 부르고, `unknownApplied: true` 면 unknown 계좌도 「들어갔을 수 있음」 으로 센다. 「지금 값」 은 server 에서 `nowBudgetsOfReads`(이번 요청에서 relay 로 읽은 값만 · stale 제외), webapp 에서 `nowBudgetsOfAccounts`(known 만).

**네 길 연결(server).**

| 길 | 코드 | 판정 | 「보냈는데 지금 못 읽음」 |
|---|---|---|---|
| 다시 반영 | `retryPend`(`settlement-budget.ts:236-246`) | `reconcilePend` — landed 는 안 보냄 · 나머지만 `deltaKrw` 로 | 보내지 않고 원래 항목(목표값 포함) 그대로 남김 |
| 고치기(반영 켬) | `saveLedger`(`admin-settlement.ts:328-330`) | `assertReconcilable` 후 `effectDiff(appliedEffectAt(old, nowOf(read)), reflectEffect(body))` | 409 `REFLECT_UNKNOWN`(`settlement-budget.ts:253-261`) · 저장 RPC 0 · relay 0 |
| 지우기(반영 켬) | `admin-settlement.ts:431-432` | `revertOf(read, [old])`(`:219-222` = `appliedEffectAt(…, { unknownApplied: true })` 의 반대) | unknown 계좌가 되돌림에 들어가고 그 계좌는 못 읽음이라 `assertRevertable` 이 409 `REVERT_UNREADABLE` · 지우기 RPC 0 |
| 정산 취소(반영 켬) | `admin-settlement.ts:614-618`(사전 점검) · `:628-630`(RPC 뒤 줄별 되돌림) | 두 곳 모두 `revertOf` | 같은 409 `REVERT_UNREADABLE` · 취소 RPC 0 |

`grep` 결과 server 에서 맨 `appliedEffect(` 를 목표값 대조 없이 부르는 곳은 남아 있지 않다(쓰임은 `appliedEffectAt` · `revertOf` · `reconcilePend` 뿐).

**webapp 연결.** `settlement-client.tsx` `revertApplied`(`:123-126`)가 server `revertOf` 와 같은 판정으로 지우기 확인 창 상자 표시(`:456`) · 보낼 `reflect`(`:245`) · 미리 보기(`:462`) · 정산 취소(`:298`)를 정한다. `ledger-sheet.tsx:246-252` 고치기 미리 보기도 `appliedEffectAt`. 그래서 timeout 계좌만 걸린 줄도 상자가 나오고 `reflect: true` 가 간다.

**이전 gap 의 네 번째 artifact(`ledger-row.tsx canEdit`).** 바뀌지 않았다(diff 는 터치 히트 44 · 태그 색뿐). 이전 보고서가 제시한 두 선택지 중 ①(목표값 대조를 네 길에 적용)이 채택됐으므로 「pend 줄 고치기 · 지우기 막기」(선택지 ②)는 필요 없다 — pend 가 남은 줄을 고치거나 지워도 server 가 대조하고, 판정할 수 없으면 409 로 막는다.

**설계 전제(정직하게).** 「지금 값 = 목표값이면 들어감」 은 「그 사이 다른 반영이 그 계좌를 바꾸지 않았다」 를 전제로 한다. 이는 리서치 Pitfall 2 · 44-05 must_haves 에 선언된 설계 전제이고 REVIEW-FIX CR-01 절도 다시 적었다(숨은 전제 아님). 반영 끔 고치기가 `pend {}` 로 저장하는 것은 채택 목업 동작이며 IN-04 의 경고 줄로 알린다.

### Advisory (New Scope, Unevidenced)

없음.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/settlement.ts` | 계산 한 벌 + 목표값 대조 | ✓ VERIFIED | `reconcilePend` · `appliedEffectAt` · `nowBudgetsOfReads` · `nowBudgetsOfAccounts` · `carryBasisLabel` 실구현. dist(`dist/index.js` 15:30) 에 `reconcilePend` 포함 확인 |
| `server/src/routes/admin-settlement.ts` · `services/settlement-budget.ts` | 조회 · 거래 쓰기 · 정산 확정 · 취소 · 다시 반영 | ✓ VERIFIED | 이전 「결함 1」 해소 — 네 길 모두 대조 연결 |
| `supabase/migrations/20261120{10,11,12,13}0000_*.sql` | 표 · RPC · 시드 | ✓ VERIFIED (무변경) | `d897f0f7..HEAD` diff 0 — db push 불필요 |
| `webapp/src/app/admin/settlement/page.tsx` + `components/settlement/*` | 화면 한 벌 | ✓ VERIFIED | WR-02 로 쓰는 곳 없던 `AccountTable.labels` 제거 — 이전 「예외」 해소 |
| `webapp/src/components/admin/admin-sheet.tsx` | 정산 시트 첫 포커스 컨테이너(quick 261121-gdx) | ✓ VERIFIED | 공용 시트 변경 — `admin-sheet.test.tsx` + `tds-tokens.test.ts` 114 통과(내가 재실행) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `person-cards.tsx` | `shared/settlement.ts` | `personSummary` | ✓ WIRED | 큰 숫자 `totalKrw` · 합계 `stakeKrw` |
| `server app.ts` | `adminSettlementRouter` | 경로 한정 관문 | ✓ WIRED | |
| `settlement-client.tsx` | server API | `admin-api.ts` `authFetch` | ✓ WIRED | |
| server 거래 · 정산 쓰기 | relay op 6 | `sendReflect` · `reflectRows` | ✓ WIRED | IN-01 로 지우기 · 취소도 보내기 전 pend 선기록 |
| 고치기 · 지우기 · 취소 · 다시 반영 | 목표값 대조(Pitfall 2) | `assertReconcilable` · `appliedEffectAt` · `revertOf` · `retryPend` → `reconcilePend` | ✓ WIRED | 이전 NOT_WIRED → 해소 |
| webapp 지우기 · 취소 확인 창 | 목표값 대조 | `revertApplied` → `appliedEffectAt(…, { unknownApplied: true })` | ✓ WIRED | server 와 같은 판정 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| 계좌 표 예수금 | `accounts[].budgetKrw` | relay `account-costs` → `buildSettlementAccounts`(IN-03: 음수는 known 음수 그대로 · 0 만 미설정) | 예 | ✓ FLOWING |
| 목표값 대조의 지금 값 | `nowOf(read)` | 이번 요청 relay 읽기만(stale 제외) | 예 | ✓ FLOWING |
| 사람 카드 · 명의 대 몫 · 이체 | `ctx` | shared 순수 함수 | 예 | ✓ FLOWING |
| 운영 값 | 실제 예수금 | 운영 DB · relay | 재현 불가 | ? Truth 13 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| shared 정산 계산 · 반영 · 목표값 대조 | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts src/__tests__/settlement-reflect.test.ts --maxWorkers=2` | 2 파일 · 84 통과 | ✓ PASS |
| server 조회 · 거래 · 정산 | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-settlement{,-ledger,-settle}.test.ts --maxWorkers=2` | 3 파일 · 110 통과(로그의 VALIDATION 경고는 실패 경로 테스트가 일부러 냄) | ✓ PASS |
| CR-01 회귀 named 테스트 | 위 server 명령 + `-t "CR-01" --reporter=verbose` | 10 통과 — 고치기 4(들어감 · 메모만 → 안 보냄 · 저장 pend {} / 들어감 · 금액 변경 → 995,000,000 차이만 / 안 들어감 → 945,000,000 다시 보냄 / 못 읽음 → 409 REFLECT_UNKNOWN · 저장 RPC 0) · 지우기 3(계좌 옮김 kyH 들어감 → 두 계좌 되돌림 / timeout 출자 들어감 → kbG 845,000,000 / 못 읽음 → 409 REVERT_UNREADABLE · 지우기 RPC 0) · 정산 취소 2(들어감 → kyH 684,000,000 / 못 읽음 → 409 · 취소 RPC 0) · 다시 반영 1(못 읽음 → 목표값 유지) | ✓ PASS |
| webapp 정산 컴포넌트(CR-01 확인 창 2건 포함) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement --maxWorkers=2` | 11 파일 · 156 통과 | ✓ PASS |
| 공용 시트 · 토큰 · D-03 · order-endpoint(IN-06) | `admin-sheet.test.tsx` · `tds-tokens.test.ts` · `account-linked-summary.test.ts` · shared `order-endpoint.test.ts` | 114 · 19 · 67 통과 | ✓ PASS |
| 타입 | `pnpm --filter @gh-radar/server typecheck` · `pnpm --filter @gh-radar/webapp typecheck`(본체 + e2e) | 오류 0 | ✓ PASS |
| Playwright e2e | 재실행 안 함 — REVIEW-FIX 도 typecheck 만(P44-F2 시계 고정 · quick 의 히트 44 단언 추가) | — | ? SKIP |

### Probe Execution

해당 없음 — 이 phase 는 `probe-*.sh` 를 선언하지 않았다.

### Requirements Coverage

REQ-ID 없음(모든 PLAN `requirements: []`). ROADMAP 확정 규칙 1 ~ 6 은 이전 보고서와 같이 ✓ — 이번 수정은 계산 규칙을 바꾸지 않았다(shared 검산 픽스처 테스트 통과). 고아 요구사항 없음.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` · `FIXME` · `XXX` · `TODO` · `HACK` | — | 이번에 바뀐 정산 shared · server · webapp · `order-endpoint.ts` · `admin-api.ts` 에서 0건(내가 grep) — 부채 표지 게이트 통과 |
| `.planning/phases/44-admin-settlement/44-UI-REVIEW.md` | 16 | 점수 표 Visuals 행에 「미결 판단」 문구가 남음(같은 문서 40행은 「결정됨」) | ℹ️ Info | 문서 한 칸의 낡은 표현. 계약 정합은 40행 · UI-SPEC · e2e 로 확인 |
| 이전 WR-01 · WR-02 · IN-01 ~ IN-08 | — | 44-REVIEW-DISPOSITION 에서 전부 `fixed` | — | 이전 보고서의 ⚠️ Warning 2건 해소 |

### Human Verification Required

#### 1. 수정 뒤 운영 server 에서 예수금 실반영 · 고치기 · 되돌림 (Truth 13)

**Test:** 운영 정산 화면(server a3ec92d0 · 오케스트레이터 보고)에서 소액 거래를 「예수금에도 반영」 켠 채 저장 → 계좌 메뉴 예수금 확인 → 그 거래 금액을 고쳐 저장 → 차이만큼만 바뀌었는지 확인 → 지우기(되돌림 켬) → 원래 값 복귀 확인. 첫 화면 숫자를 CONTEXT 검산과 대조.
**Expected:** 각 단계가 거래 금액 · 차이만큼 정확하다. 계좌이체 4억 · 7억 · 법인 용역 3억 은 검산과 같다.
**Why human:** 운영 relay · 매매 서버 op 6 쓰기가 필요하다. 44-13-SUMMARY 의 사용자 pass 는 CR-01 수정 전 코드였고, 44-REVIEW-FIX 가 CR-01 을 「fixed: requires human verification」 으로 남겼다. timeout-이지만-적용됨 경로는 운영에서 일부러 만들 수 없으므로 그 경로는 위 named 테스트 10건이 증거다.

### Gaps Summary

**막는 갭 없음.** 이전의 유일한 BLOCKER(CR-01)는 목표값 대조를 shared 한 함수(`reconcilePend`)로 빼서 네 길(다시 반영 · 고치기 · 지우기 · 정산 취소)과 webapp 확인 창이 같은 판정을 쓰게 해 닫혔고, 「보냈는데 지금 못 읽음」 은 고치기 409 `REFLECT_UNKNOWN` · 지우기 · 취소 409 `REVERT_UNREADABLE` 로 아무것도 바꾸기 전에 막힌다. 이전 「불확실」 이던 Truth 12 는 사용자 결정(`totalKrw`)이 계약 문서 세 곳에 반영돼 정합이 확인됐다. 회귀 점검(D-02 · 금지 사항 · relay · pnpm-lock · 계좌 메뉴 판정 · 공용 시트 · 타입)에서 퇴행은 없었다.

남은 것은 운영 확인(Truth 13) 하나다. 수정 뒤 server 에서 정상 경로 반영 · 고치기 · 되돌림을 사람이 한 번 확인하면 phase 를 닫을 수 있다.

Phase 44 에 속하지 않는 것(차단 아님): server `news.test.ts` `V-news-cursor-a` 날짜 시한폭탄(Phase 41) — 이번 재검증 범위 밖이라 재실행하지 않았다.

---

_Verified: 2026-11-21T16:05:00+09:00_
_Verifier: Claude (gsd-verifier)_
