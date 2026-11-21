---
phase: 44-admin-settlement
verified: 2026-11-21T11:20:00+09:00
status: gaps_found
score: 10/13 must-haves verified
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
  - "packages/shared/src/admin.ts"
  - "packages/shared/src/index.ts"
  - "packages/shared/src/settlement.ts"
  - "server/src/app.ts"
  - "server/src/routes/admin-accounts.ts"
  - "server/src/routes/admin-settlement.ts"
  - "server/src/routes/admin.ts"
  - "server/src/schemas/settlement.ts"
  - "server/src/services/settlement-budget.ts"
  - "supabase/migrations/20261120100000_settlement.sql"
  - "supabase/migrations/20261120110000_settlement_ledger_rpc.sql"
  - "supabase/migrations/20261120120000_settlement_settle_rpc.sql"
  - "supabase/migrations/20261120130000_settlement_seed.sql"
  - "webapp/src/app/admin/settlement/page.tsx"
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
covered_digest: "v4:sha256:c3b4ec1bcff0ae4044fff884e9371bc5fe0bf2874867bcc297b943e9a8ea31a3"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "거래 고치기 · 지우기 · 정산 취소가 예수금을 두 번 넣거나 되돌리지 못하는 일 없이 맞춘다 (D-19 · D-23 · D-26 · 리서치 Pitfall 2)"
    status: failed
    reason: "「보냈는데 응답만 못 받은(timeout)」 반영을 걸러내는 목표값 대조가 「다시 반영」(retryPend) 에만 있다. 고치기 · 지우기 · 정산 취소는 pend 가 남은 계좌를 무조건 「안 들어감」 으로 계산한다(appliedEffect 가 pend.deltaKrw 를 조건 없이 뺀다). 실제로 들어갔다면 고치기는 같은 증감을 한 번 더 보내고, 지우기 · 취소는 되돌리지 않아 매매 서버 예수금(주문 가능 금액 기준)에 거래 금액이 그대로 남는다. 코드 리뷰 CR-01(critical)이 아직 처분 open 이다. 검증자가 코드를 직접 읽어 같은 결함을 확인했다."
    artifacts:
      - path: "packages/shared/src/settlement.ts"
        issue: "appliedEffect(843-854) 가 row.pend[acc].deltaKrw 를 targetKrw 대조 없이 뺀다"
      - path: "server/src/routes/admin-settlement.ts"
        issue: "고치기(:261) · 지우기(:351) · 정산 취소(:529 · :542) 가 appliedEffect(old) 를 목표값 대조 없이 쓴다"
      - path: "server/src/services/settlement-budget.ts"
        issue: "목표값 대조(now === targetKrw)가 retryPend(216-225) 한 곳에만 있다"
      - path: "webapp/src/components/settlement/ledger-row.tsx"
        issue: "canEdit(175) 가 hasPend 를 보지 않아 「예수금 미반영」 줄에도 고치기 · 지우기가 열려 있다"
    missing:
      - "retryPend 의 목표값 대조를 한 함수로 빼서 고치기 · 지우기 · 정산 취소가 appliedEffect 를 부르기 전에 쓴다(리뷰 CR-01 Fix 의 settlePendByTarget) — 이번 요청에서 읽은 값 = 목표값인 계좌는 「들어감」 으로 보고 pend 에서 뺀다"
      - "또는 pend 가 남은 줄은 「다시 반영」 이 끝날 때까지 고치기 · 지우기(반영 켬)를 409 로 막고 화면도 단추 대신 「먼저 다시 반영해 주세요」 를 보인다(반영 끔 고치기도 pend 를 덮어쓰므로 함께 막는다)"
      - "회귀 테스트: timeout 이 난 거래 → 고치기 · 지우기 · 정산 취소 각각에서 현재 예수금 = 목표값일 때 이중 반영 · 미되돌림이 없다는 단언 (지금 admin-settlement-ledger.test.ts 의 timeout 테스트는 저장 직후 pend 모양만 잠근다)"
behavior_unverified_items:
  - truth: "운영 매매 서버에서 실제 예수금 반영 · 되돌림과 실제 숫자가 CONTEXT 검산과 맞는다"
    test: "정산 화면에서 소액 거래를 「예수금에도 반영」 켠 채 저장 → 계좌 메뉴 예수금 확인 → 그 거래 지우기(되돌림) → 값 복귀 확인. 첫 화면 숫자를 CONTEXT 검산(계좌 수익 · 지금 몫 전체 · 명의 대 몫)과 대조"
    expected: "저장 직후 해당 계좌 예수금이 거래 금액만큼 바뀌고, 지우면 원래 값으로 돌아온다. 계좌이체 4억 · 7억 · 법인 용역 3억 은 검산과 정확히 같고, 나머지는 예수금 차이만큼만 다르다"
    why_human: "운영 relay · 매매 서버 · 운영 DB 가 필요하다(VALIDATION Manual-Only). 이 검증은 운영에 접속하지 않았다. 44-13-SUMMARY 가 사용자 pass(소액 반영 · 되돌림 · 폭 눈 확인)를 기록했으나 검증자가 재현할 수 없는 사용자 진술이다"
---

# Phase 44: 어드민 정산 검증 보고서

**Phase Goal:** 어드민이 `/admin/settlement` 한 화면에서 ① 세 사람이 각자 수익 중 얼마가 자기 몫인지 ② 정산을 확정해 날짜 찍힌 기록으로 남기고 ③ 계좌에서 돈이 들고 난 내역을 적고 ④ 김현중 ↔ 정근형 사이의 명의 대 몫과 실제 오간 계좌이체 누적을 본다.
**Verified:** 2026-11-21 11:20 KST
**Status:** gaps_found
**Re-verification:** No — 최초 검증
**요구사항 ID:** 없음(모든 PLAN `requirements: []`) — ROADMAP 「확정된 규칙」 1 ~ 6 · CONTEXT D-01 ~ D-30 · 각 PLAN must_haves 로 검증했다. REQ-ID 누락은 실패로 세지 않았다.

## 한 줄 결론

화면 · 계산 · 정산 확정 · 거래 기록 · 명의 대 몫 · 계좌이체 · 배포는 모두 코드와 테스트로 확인됐다. 그러나 **매매 서버 예수금을 건드리는 길 하나(「예수금 미반영」 줄의 고치기 · 지우기 · 정산 취소)에 이중 반영 · 미되돌림 결함이 열려 있다(CR-01).** 설계가 약속한 Pitfall 2 장치가 「다시 반영」 한 길에만 있고, 이 결함은 검증자가 코드를 직접 읽어 재확인했다. 그래서 `gaps_found` 다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ① 세 사람 카드가 각자 수익 몫을 보인다 — 몫 = 정산한 몫 + 정산 전 몫 − 수익 출금 · 쥬니 묶음 손실 1억 넘는 부분은 현중 · 근형 반반 (규칙 1 · 3 · 4 · D-06) | ✓ VERIFIED | `packages/shared/src/settlement.ts` `personSummary`(586-630) 가 `dueKrw = settled − taken` · `openSum` · `lossKrw` 를 계산하고 `person-cards.tsx` 가 그대로 그린다(계산을 화면이 새로 만들지 않음). shared 테스트 75 통과(내가 재실행). CONTEXT 검산(지금 몫 전체 9억 2,450만 · 9억 2,450만 · 7,200만)이 `settlement.test.ts` 픽스처로 잠겨 있다 |
| 2 | 수익 = 계좌 예수금 − 그 계좌에 넣은 돈, 시작값 · 경계 날짜 · 손익 보정 없음 (규칙 2 · D-01 · D-02) | ✓ VERIFIED | `poolAccountRows` · `cumProfit` · `openProfit`(418-503) 가 `budget − putKrw` 만 쓴다. 시드 9건으로 손계산해도 KB 정근형 넣은 돈 = 8억 − 10억 2,000만 = −2억 2,000만(CONTEXT 와 일치). D-02 정적 검사: 정산 shared · server · 마이그레이션 · webapp 파일에서 `realized_pnl` · `dma_journal_events` · `admin/pnl` 이름 0건(내가 grep) |
| 3 | 「정산 전 수익」 카드: 묶음별 계좌 표 · 미설정 「—」 + 확정 잠금 · 못 읽은 계좌는 마지막 값 · D-28 안내 한 줄 (D-24 · D-25 · D-28) | ✓ VERIFIED | `account-table.tsx` · `open-pools-card.tsx` 존재 · `settlement-client.tsx` 에 연결 · `settlePlan` 이 `unset`/`carry`/`none` 으로 확정을 막는다(763-789). webapp 컴포넌트 테스트 녹색(오케스트레이터 실행 253건) · D-03 대조 테스트(`account-linked-summary.test.ts`)가 계좌 메뉴 판정과 정산 판정이 같다고 단언 |
| 4 | ② 정산 확정 — 누른 순간 예수금으로 서버가 계산 · 날짜 찍힌 기록 · 묶음별 최근 것만 취소 · 바로 출금 줄 함께 처리 (규칙 3 · D-15 ~ D-17) | ✓ VERIFIED | `settlement_settle_confirm` RPC 가 묶음 advisory lock(`hashtext('settlement_settle:' \|\| pool)`) 안에서 `STALE_SETTLE` · `NOT_LATEST` 를 다시 본다(`20261120120000_settlement_settle_rpc.sql:73-81 · :143`). server `POST /settlement/settles` · `.../cancel`, 브라우저가 계산한 숫자를 서버에 보내지 않는다. server 94 통과 · pgTAP 192(오케스트레이터 실행) |
| 5 | ③ 계좌 거래 4종(출자 · 수익 출금 · 원금 회수 · 계좌 옮김 + 경로 계좌이체 / 법인 용역) 기록 · 날짜 · 예수금 반영 저장 · 시드 9건 · D-29 심쥬니 제한 (규칙 5 · D-10 ~ D-12 · D-14 · D-29) | ✓ VERIFIED | `settlement_ledger_save` RPC · `POST /settlement/ledger`. 시드 함수 `settlement_seed` 가 9건을 목업 순서 그대로 넣고(`20261120130000_settlement_seed.sql:100-117`) 없는 계좌면 `SETTLEMENT_ACCOUNT_MISSING` · seeded 0 일 때만(멱등). D-29 는 표 CHECK `settlement_ledger_person_pool` + zod + RPC 세 곳. pgTAP `settlement_seed` 27 통과 |
| 6 | ③ 거래 고치기 · 지우기 · 정산 취소가 예수금을 두 번 넣거나 되돌리지 못하는 일 없이 맞춘다 (D-19 · D-23 · D-26 · Pitfall 2) | ✗ FAILED | **CR-01 — 아래 「Gaps Summary」.** `appliedEffect`(shared 843-854)가 `pend[acc].deltaKrw` 를 목표값 대조 없이 뺀다. 목표값 대조는 `retryPend`(`settlement-budget.ts:216-225`)에만 있다. 고치기(`admin-settlement.ts:261`) · 지우기(`:351`) · 정산 취소(`:529 · :542`)는 모두 `appliedEffect` 를 직접 쓴다 |
| 7 | ④ 명의 대 몫 — 「김현중 → 정근형 N원이면 맞음」 · 사실 관계만, 증여 판단 문구 없음 (규칙 6) | ✓ VERIFIED | `nameVs`(700-721) `xKrw = 정근형 지금 몫 전체 − 정근형 명의 예수금`. `name-vs-card.tsx` 연결. 「증여」 문자열은 화면 코드에 0건(내가 grep). 검산 5,950만 은 `settlement.test.ts` 로 잠김 |
| 8 | ④ 현중 ↔ 정근형 계좌이체 누적 — 4억(1건) · 7억(4건) · 법인 용역 3억 별도 · 법인 용역은 개인 이체에서 빠진다 (규칙 5 · 6) | ✓ VERIFIED | `hgOf` · `hgSum`(637-686) 이 `via === "corp_service"` 를 `corpKrw` 로 따로 센다. `transfer-card.tsx` 연결. 운영 화면에서도 4억 · 7억 · 법인 용역 3억 이 검산과 정확히 같았다고 44-13-SUMMARY 가 기록(사용자 진술) |
| 9 | 관리자만 보고 적는다 (D-18) | ✓ VERIFIED | `adminSettlementRouter.use("/settlement", requireAuth(), requireAdmin())`(`admin-settlement.ts:94`) 가 `adminRouter` 앞에 마운트(`app.ts:168`). webapp 은 `/admin` 접두 미들웨어 + 사이드바 「정산」(매매손익 다음). server 테스트가 비관리자 403 · RPC 0회 · relay 0회 를 잠근다 |
| 10 | D-30 — 지우기 · 정산 취소에서 되돌릴 수 없으면 미리 409 로 막고 안내, 보내기만 실패하면 창을 닫지 않고 확정 잠금 | ✓ VERIFIED | `assertRevertable`(`settlement-budget.ts:232-246`) 이 `REVERT_UNREADABLE` + 문장 글자 그대로. `unrevertedMessage` · webapp `settle-confirm.tsx`. server · 컴포넌트 테스트가 잠금(VALIDATION 55행). 단, 이 판정 입력인 `appliedEffect` 에 Truth 6 의 결함이 들어 있다 — D-30 의 문장 · 흐름 자체는 맞다 |
| 11 | D-02 · 금지 사항: relay · gh-trade · pnpm-lock · 계좌 메뉴 화면을 고치지 않고, 새 포커스 링 · 토스트 · alert 없음 | ✓ VERIFIED | `git diff a459e845..HEAD -- relay` 0 · `pnpm-lock.yaml` 0 · `account-linked-summary.ts` 본문 무변경(테스트만 추가). `webapp/src/components/settlement` 에서 `focus-visible:ring` · `toast` · `alert(` · `window.confirm` 0건. 행 물리 DELETE RPC 없음(마이그레이션의 `DELETE FROM` 은 주석 속 수동 되돌리기 안내 2줄뿐) |
| 12 | 사람 카드 큰 숫자 값이 UI-SPEC ② 계약(「9억 2,450만 · 9억 2,450만 · 7,200만」 = 지금 몫 전체)과 같다 | ? UNCERTAIN | 구현은 `totalKrw`(내 수익 몫)를 그려 실화면은 「5억 2,450만 · 5억 2,450만 · 0」 이다(`person-cards.tsx:88`). 라벨 「내 수익 몫 · 아직 계좌에 두고 있는 돈」 과 채택 목업 `fm(x.total)` 에는 맞고 UI-SPEC 표에는 어긋난다. 44-13-SUMMARY 는 「사용자 답 2026-11-21 — totalKrw 유지」 를 기록했지만 **그 답은 이 문서 한 곳에만 있고** UI-SPEC · 44-UI-REVIEW(그 뒤에 쓰임, 아직 「사용자 결정 필요」) · e2e 주석(「열린 질문」)은 갱신되지 않았다. 코드 결함이 아니라 계약 문서 정리 + 결정 확인 문제다 → 사용자 확인 요청 |
| 13 | 운영 실제 동작 — 실제 예수금 반영 · 되돌림 · 운영 숫자가 검산과 맞음 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 코드 · 서버 통합 테스트(가짜 relay) · 배포(SCHEMA-PUSHED · REMOTE-SCHEMA-OK · SERVER-LIVE 287c3fe5)는 확인됐으나 실제 op 6 쓰기는 이 검증이 재현할 수 없다(VALIDATION Manual-Only). 44-13-SUMMARY 에 사용자 pass 기록은 있다 → `behavior_unverified_items` 참고 |

**Score:** 10/13 truths verified (실패 1 · 불확실 1 · 현장 확인 대기 1)

### Deferred Items

없음 — ROADMAP 에 44 보다 뒤 phase 가 없어 CR-01 을 이월할 곳이 없다(Step 9b). 정산 확정 요청 바디도 `pool · outs · memo · reflect · expectPrev` 뿐(zod `.strict()`)이라 브라우저가 계산한 수익 · 몫을 보내지 않는다는 Truth 4 의 주장도 확인했다.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/settlement.ts` (990줄) | 계산 한 벌 | ✓ VERIFIED | 몫 · 원금 · 사람 · 이체 · 명의 대 몫 · 뺄 계좌 · 정산 계획 · 반영 증감 · 장중 판정 전부 실구현. 스텁 · 부채 표지 0 |
| `server/src/routes/admin-settlement.ts` (565줄) · `services/settlement-budget.ts` (262줄) · `schemas/settlement.ts` | 조회 · 거래 쓰기 · 정산 확정 · 취소 · 다시 반영 | ⚠️ 연결됨 · 결함 1 | 모든 라우트 실구현 · 관문 연결. 위 Truth 6 결함 |
| `supabase/migrations/20261120{10,11,12,13}0000_*.sql` | 표 5 · 거래 RPC · 정산 RPC · 시드 | ✓ VERIFIED | 원격 반영(SCHEMA-PUSHED · REMOTE-SCHEMA-OK) · 권한 REVOKE · RLS 켬 · 정책 없음(리뷰가 확인 · 내가 advisory lock · CHECK · 시드 본문을 직접 읽음) |
| `webapp/src/app/admin/settlement/page.tsx` + `components/settlement/*` (15개 파일) | 화면 한 벌 | ✓ VERIFIED | 서버 메타데이터 제목 · `SettlementClient` 연결 · 카드 · 시트 · 확인 창 전부 호출됨(고아 파일 없음). 예외: `AccountTable` 의 `labels` prop 은 쓰는 곳 없음(WR-02 · 경미) |
| `webapp/src/components/layout/app-sidebar.tsx` | Admin 하위 「정산」 | ✓ VERIFIED | `NAV_ADMIN_SETTLEMENT` · 사이드바 테스트 통과 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `person-cards.tsx` | `shared/settlement.ts` | `personSummary` | ✓ WIRED | 계산을 화면이 새로 만들지 않음 |
| `open-pools-card.tsx` | `account-table.tsx` | `AccountTable rows={poolAccountRows(...)}` | ✓ WIRED | |
| `server app.ts` | `adminSettlementRouter` | 경로 한정 관문 `/settlement` | ✓ WIRED | `adminRouter` 앞 마운트 |
| `settlement-client.tsx` | server API | `admin-api.ts` `authFetch` | ✓ WIRED | 읽기 · 쓰기 각각 40초 상한 |
| server 거래 · 정산 쓰기 | relay op 6 | `sendReflect` → `fanoutOne` → `setAccountBudget` | ✓ WIRED | 저장 → 보내기 → pend 기록 순서 · 병렬 |
| 고치기 · 지우기 · 취소 | 목표값 대조(Pitfall 2) | `appliedEffect` ← pend | ✗ NOT_WIRED | Truth 6 — 대조가 `retryPend` 에만 연결됨 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| 계좌 표 예수금 | `accounts[].budgetKrw` | relay `account-costs`(`fetchAccountCosts`) → `buildSettlementAccounts`, 실패 시 `settlement_budget_reads` 마지막 값(stale) | 예 | ✓ FLOWING |
| 넣은 돈 · 수익 | `ledger` | RPC `admin_settlement_raw` → `settlement_ledger`(지운 줄 제외) | 예 | ✓ FLOWING |
| 사람 카드 · 명의 대 몫 · 이체 | `ctx` = 위 두 값 + `settles` | shared 순수 함수 | 예 — 하드코딩 · 빈 prop 없음 | ✓ FLOWING |
| 운영 값 | 네 계좌 예수금 · 시드 9건 | 운영 DB · relay | 44-13 SUMMARY 에 운영 숫자 기록(사용자 확인) | ? 재현 불가(Truth 13) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| shared 정산 계산 · 반영 증감 | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts src/__tests__/settlement-reflect.test.ts --maxWorkers=2` | 2 파일 · 75 통과 | ✓ PASS |
| server 조회 · 거래 · 정산 | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-settlement{,-ledger,-settle}.test.ts --maxWorkers=2` | 3 파일 · 94 통과(로그의 「읽은 예수금 기록 실패」 경고는 실패 경로 테스트가 일부러 내는 것) | ✓ PASS |
| webapp 화면 · pgTAP · Playwright | 오케스트레이터가 같은 날 실행한 결과를 가져옴(webapp 253 · pgTAP 192 / 27 · e2e 9) — 검증자는 재실행하지 않았다 | 전부 녹색 | ? 간접 증거 |
| 이중 반영 회귀(timeout 뒤 고치기 · 지우기) | — | 이 길을 겨냥한 테스트가 없다(`admin-settlement-ledger.test.ts:256` 은 저장 직후 pend 모양만 단언) | ✗ 테스트 부재 |

server 전체 스위트의 1건 실패(`tests/routes/news.test.ts` `V-news-cursor-a`)는 Phase 41 테스트의 날짜 시한폭탄이다. `a459e845..HEAD` 에서 `news.ts` · 그 테스트의 diff 가 비어 있음을 확인했다 — Phase 44 와 무관.

### Probe Execution

해당 없음 — 이 phase 는 `probe-*.sh` 를 선언하지 않았고 `scripts/*/tests/probe-*.sh` 도 대상이 아니다.

### Requirements Coverage

REQ-ID 없음(위 「요구사항 ID」). ROADMAP 확정 규칙 대조:

| 규칙 | 내용 | 상태 | 근거 |
|------|------|------|------|
| 1 | 묶음 2개 · 비율 5 : 5 / 4 : 3 : 3 | ✓ | `SETTLEMENT_POOLS` · `SETTLEMENT_ACCOUNTS` · 검산 |
| 2 | 수익 = 예수금 − 넣은 돈 | ✓ | Truth 2 |
| 3 | 확정은 몫만 고정 · 바로 출금 선택 · 몫 = 정산한 몫 + 정산 전 몫 − 수익 출금 | ✓ | Truth 1 · 4 |
| 4 | 쥬니 묶음 4억 회복 전 정산 없음 · 손실 −1억까지 심쥬니 혼자 | ✓ | `settlePlan` carry · `personSummary` loss |
| 5 | 거래 4종 · 8/10 법인 용역 3억은 계좌 옮김(몫 영향 0 · 개인 이체 제외) | ✓ | Truth 5 · 8 |
| 6 | 명의 대 몫 · 실제 이체 누적 · 증여 판단 없음 | ✓ | Truth 7 · 8 |

고아 요구사항: 없음.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/shared/src/settlement.ts` · `server/src/routes/admin-settlement.ts` | 843-854 · 261 · 351 · 529 | pend 를 목표값 대조 없이 「안 들어감」 으로 가정 | 🛑 Blocker | Truth 6 · CR-01 |
| `webapp/src/components/settlement/ledger-sheet.tsx` | 188 | 시트 「오늘」 이 마지막으로 불러온 시각에 고정 (WR-01) | ⚠️ Warning | 자정을 넘긴 탭에서 오늘 날짜 거래를 막고 지난 날짜 거래에 반영이 켜진 채 열림 |
| `webapp/src/components/settlement/account-table.tsx` | 36 · 51 | 넘기는 곳 없는 `labels` prop (WR-02) | ⚠️ Warning | 죽은 분기 하나 |
| 그 밖 | — | 리뷰 IN-01 ~ IN-08 (멱등 키 없음 · 음수 예수금 · 문구 부정확 · 미리 보기와 서버 불일치 등) | ℹ️ Info | 전부 처분 `open`. 목표 달성을 막지 않음 |

`TBD` · `FIXME` · `XXX` · `TODO` · `HACK` 표지: 정산 shared · server · 마이그레이션 · webapp 파일에서 0건(내가 grep) — 부채 표지 게이트는 통과.

### Human Verification Required

#### 1. 운영 예수금 실반영 · 되돌림 · 검산 대조 (Truth 13)

**Test:** 정산 화면에서 소액 거래를 「예수금에도 반영」 켠 채 저장 → 계좌 메뉴 예수금 확인 → 그 거래 지우기(되돌림 켠 채) → 값 복귀 확인. 첫 화면 숫자를 CONTEXT 검산과 대조.
**Expected:** 반영 · 복귀가 거래 금액만큼 정확하다. 계좌이체 4억 · 7억 · 법인 용역 3억 은 검산과 정확히 같다.
**Why human:** 운영 relay · 매매 서버가 필요하다. 44-13-SUMMARY 는 사용자 pass 를 기록했다(검증자 재현 불가 — 사용자 진술).

#### 2. 사람 카드 큰 숫자 계약 정리 (Truth 12)

**Test:** 큰 숫자를 「내 수익 몫(5억 2,450만 · 5억 2,450만 · 0)」 으로 확정할지 「지금 몫 전체(9억 2,450만 · 9억 2,450만 · 7,200만)」 로 바꿀지 확인. 44-13-SUMMARY 의 「totalKrw 유지」 답이 맞다면 UI-SPEC ② 표 · 44-UI-REVIEW 의 「사용자 결정 필요」 · e2e 머리 주석을 그 답에 맞게 고쳐 문서를 정리한다.
**Expected:** 코드와 계약 문서가 같은 값을 가리킨다. 바꾸는 쪽을 고르면 `person-cards.tsx:88` 한 줄(`x.totalKrw` → `x.stakeKrw`)과 테스트 기대값만 바뀐다.
**Why human:** 제품 판단이다. 심쥬니 카드가 「0원」 큰 숫자 아래 「지금 몫 전체 7,200만」 을 함께 보여 독자가 두 숫자를 혼동할 수 있다는 UI 감사(17/24)의 지적도 함께 판단해야 한다.

### Gaps Summary

**단 하나의 막는 결함 — CR-01.** 이 phase 는 「예수금에도 반영」 이라는, 운영 매매 서버 예수금을 실제로 바꾸는 길을 새로 열었다. 매매 서버 명령(op 6)은 「값을 얼마로 정해라」 뿐이라 증감을 「읽은 값 + 증감」 으로 흉내 내고, timeout 은 「들어갔는지 모름」 이다. 설계(리서치 Pitfall 2 · 44-05 must_haves)는 그래서 `pend` 에 목표값을 남기고 「지금 값 = 목표값이면 들어간 것」 으로 판정하기로 했는데, 그 대조가 「다시 반영」 에만 구현됐다. `appliedEffect` 는 `pend` 가 남은 계좌를 무조건 「안 들어감」 으로 뺀다.

- 발생 경로 둘: ① relay 가 `timeout` 으로 답했지만 실제로는 적용된 경우 ② 저장 RPC 가 「failed」 pend 를 먼저 적은 뒤 relay 는 성공했는데 `settlement_set_pend` 만 실패한 경우(경고 로그만 남고 넘어감).
- 결과: 줄에는 「예수금 미반영」 이 붙고 고치기 · 지우기는 그대로 열려 있다. 고치기(반영 켬)는 이미 들어간 증감을 한 번 더 보낸다(메모만 고쳐도). 지우기 · 정산 취소(반영 켬)는 되돌리지 않아, 그 계좌만 걸린 거래는 확인 창에 상자도 안 나오고 줄만 사라지며 예수금에 금액이 남는다.
- 위험: 예수금은 주문 가능 금액의 기준이라 정산 화면 숫자만 어긋나는 데서 끝나지 않고 실계좌에 없는 돈을 있는 것으로 보고 주문할 수 있다.
- 완화 요인(정직하게): 발생에 timeout-이지만-적용됨 또는 기록 실패라는 드문 사건이 먼저 필요하고, D-02 전제(사용자가 예수금을 실계좌에 맞춰 고침)로 나중에 바로잡힌다. 이 점이 「미룰 수 있다」 의 근거가 될 수는 있으나 처분(`fixed` / `deferred`)이 기록되지 않은 채 open 이고, 수정이 작다(리뷰 Fix 몇 줄 또는 pend 줄 고치기 · 지우기 409 차단).

**처리 선택지:** ① `/gsd-plan-phase 44 --gaps` 로 수정 + 회귀 테스트 후 server 재배포 후 재검증 ② 사용자가 위험을 감수하기로 하면 44-REVIEW-DISPOSITION.md 의 CR-01 을 사유와 함께 `deferred` 로 처분하고 이 항목에 `overrides:` 를 더한 뒤 재검증(수용은 사용자 몫이며 검증자는 대신 수락하지 않는다).

**Phase 44 에 속하지 않는 것(차단 아님):** server `news.test.ts` `V-news-cursor-a` 시한폭탄 1건(Phase 41) · 옆 세션 커밋 287c3fe5(iOS 사이드바)가 같은 push 에 실린 것(사용자 승인).

UI 감사(17/24)의 나머지 지적(다크 확인 창 구분선 순백 · 금액 8자리 이상 붙여넣기 안내 · 계약 밖 2px · 6px 간격 · 라이트 경고 글자 대비 2.05 : 1 · 줄 버튼 터치 크기)은 목표 달성을 막지 않는 품질 항목으로 분류했다. 계약 문구 대조는 UI 감사가 화면 실물로 전부 일치함을 확인했다.

---

_Verified: 2026-11-21T11:20:00+09:00_
_Verifier: Claude (gsd-verifier)_
