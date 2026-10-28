---
phase: 36-account-budget
fixed_at: 2026-10-28T02:32:00Z
review_path: .planning/phases/36-account-budget/36-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 36: 코드 리뷰 수정 보고서

**수정 시각:** 2026-10-28T02:32:00Z
**대상 리뷰:** .planning/phases/36-account-budget/36-REVIEW.md
**회차:** 1

**요약:**
- 범위 안 경고: 5건 (WR-01 ~ WR-05 · IN-* 는 범위 밖)
- 수정: 4건
- 건너뜀: 1건 (WR-04)

**작업 위치:** 오케스트레이터가 준비한 격리 worktree `.claude/worktrees/phase-36-fix`(브랜치 `gsd/phase-36-fix`, master `a24203bd` 에서 갈라짐)에서 직접 고치고 커밋했다. 이 에이전트가 따로 worktree 를 만들지 않았다. push · 배포 · `supabase db push` · 마이그레이션 수정은 하지 않았다.

## 고친 경고

### WR-01: Enter 만 눌러도(고치지 않은 칸) op 6 가 나가 서버가 조정한 예수금을 만원 단위로 잘라 덮어쓴다

**고친 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`
**커밋:** 3feb08dc
**적용한 수정:** `budgetKrwToSave(text, serverKrw)` 를 새로 두었다. 칸 글자가 서버 값의 화면 표기(만원 내림 · `budgetFieldText`)와 같으면 만원 내림 값이 아니라 서버 원 값을 그대로 돌려준다. `saveBudget` 은 이 값으로 「변경 없음」 을 판정하고 op 6 도 이 값으로 보낸다. 결과는 세 가지다.
- 안 고친 칸에서 Enter 를 치거나 같은 숫자를 다시 치면 「변경 없음」 으로 끝나고 요청을 보내지 않는다.
- 불일치를 맞추려고 Enter 를 치면 출처 서버의 원 값 그대로(예: 99,987,654) 등록 서버 전부에 op 6 를 보낸다. D-03 「저장하면 등록 서버가 모두 같아져요」 는 유지되고, 만원 미만 끝자리도 깎이지 않는다.
- 예수금이 1만원 미만이라 빈 칸으로 보이는 경우(서버 하한 1원)에 안 고친 Enter 를 쳐도 해제(0)를 보내지 않는다. 「0」 을 직접 치면 해제된다.

Enter 저장 트리거(D-02)는 바꾸지 않았다.
**회귀 테스트:** 3건(`(WR-01)` 접두). 소스를 되돌리면 3건 모두 실패하는 것을 확인했다(RED → GREEN).
**상태:** fixed: requires human verification — 판정 규칙을 바꾼 수정이다. 표기가 같은 값(예: 서버 9,987,654원일 때 「998」)을 일부러 쳐서 정확히 9,980,000원으로 맞추는 것은 이제 안 된다. 다른 값을 쓰거나 「0」 → 재설정 순서로 해야 한다. 이 동작이 운영 의도와 맞는지 확인이 필요하다.

### WR-02: 67 live 예수금을 87 보다 무조건 우선 — op 6 저장 직후 재조회에 옛 값이 보일 수 있다

**고친 파일:** `relay/src/admin/types.ts`, `relay/src/hub/subscription-hub.ts`, `relay/src/admin/admin-conn.ts`, `relay/src/admin/admin-api.ts`, `relay/src/admin/dispatcher.ts`, `relay/src/index.ts`(주석만), `relay/tests/account-state.test.ts`, `relay/tests/admin-api.test.ts`, `relay/tests/admin-dispatcher.test.ts`
**커밋:** e1f352a8
**적용한 수정:** 리뷰 권고대로 「더 최근에 받은 값」 을 쓴다.
- hub 가 계좌마다 66/67 수신 시각(`#accountStateAtMs`)을 `#accountStates` 와 함께 두고 지운다. `liveBudgetOf` 는 `{ krw, atMs }` 를 돌려준다. 세션이 여럿이면 가장 최근 값을 고른다.
- `AdminConn.snapshotReceivedAtMs()` 는 `currentSnapshot()` 과 같은 조건(ready · 같은 세대)에서 87 수신 시각을 내준다.
- `freshLiveBudget(live, snapshotAtMs)` 한 벌을 두었다. live 가 그 서버 87 보다 늦게(같은 ms 포함) 왔을 때만 live 값을 쓰고, 아니면 null 이라 87 로 내려간다. 87 시각을 모르면 종전처럼 live 를 우선한다.
- 이 규칙은 `GET /account-costs` 의 `liveBudgetKrw` 와 op 3 뒤 되싣기 출처 예수금(`#reloadCosts`) 두 곳에 같이 적용했다.

D-05/D-14 와의 관계는 이렇다. 체결 조정은 87 없이 67 로만 오므로 평소에는 live 가 계속 이긴다. op 6 저장이나 op 5 재조회로 받은 87 은 인박스 261027-account-pnl 39행 「다음 87(op 5 등)은 현재 값을 싣는다」 에 따라 서버의 현재 값이라, 87 이 더 최근이면 그 값을 쓰는 것이 맞다. 웹 · shared `accountCostOf` 계약(`liveBudgetKrw` null → 87)은 그대로다.
**회귀 테스트:** hub 수신 시각 1건, admin-api C2b, dispatcher ⑤-b. 시각 비교를 끄면 C2b · ⑤-b 가 실패하는 것을 확인했다. 기존 C1 · C2 · ⑤ 는 새 반환 모양에 맞췄다.
**상태:** fixed: requires human verification — 원천을 고르는 규칙을 바꾼 수정이다. 라이브에서 「저장 → 재조회」 와 「체결 → 재조회」 를 한 번씩 확인하기를 권한다.

### WR-03: D-07 예수금 · 비용률 되싣기가 같은 서버 계획의 다른 op 실패에 묶여 영구히 빠진다

**고친 파일:** `relay/src/admin/dispatcher.ts`, `relay/tests/admin-dispatcher.test.ts`
**커밋:** c3a6bd74
**적용한 수정:** `#applyServer` 의 되싣기 조건을 `failure === null` 에서 `failure === null || failure.outcome === "failed"` 로 바꿨다. 이제 이미 ok 로 생긴 계좌는 뒤 op 가 code 실패(예: op 4 BUSY 9 · 비밀번호 못 꺼냄)를 내도 되싣는다. 연결 실패(timeout · offline)일 때만 건너뛴다. 되싣기는 원래 비치명이라 서버 결과와 기록은 바뀌지 않는다.
**회귀 테스트:** ⑥-b(op 3 ok → op 4 BUSY → op 6 · op 7 되싣기, 결과는 failed 9 그대로)와 ⑥-c(op 4 offline → 되싣기 없음). 소스를 되돌리면 ⑥-b 가 실패하는 것을 확인했다.
**상태:** fixed

### WR-05: `/me` 계좌 패널만 `priceOf` 가 없어 주문가능이 작업대 · 수동주문과 다른 값이 된다

**고친 파일:** `webapp/src/components/trading/me-client.tsx`, `webapp/src/components/trading/__tests__/me-client.test.tsx`
**커밋:** 22dd07c7
**적용한 수정:** `MeTabs` 가 relay 컨텍스트의 `quotes` 로 `priceOf = useCallback(isin => holdingQuotePrice(quotes, isin), [quotes])` 를 만들어 잔고 탭 `<AccountPanel>` 에 넘긴다. 작업대(`trading-workbench.tsx:1314`)와 같은 규칙 한 벌이다(D-11). 시장가 매수 미체결은 현재가로 세고, 시세가 없으면 종전처럼 undefined(0 · 평가 「—」)다. 덤으로 `/me` 잔고 평가도 같은 현재가를 쓴다. CONTEXT 재량 항목(「/me 에 priceOf 를 넘길지 — 둘 다 허용」)에서 「넘김」 을 고른 것이다.
**회귀 테스트:** B4c(패널에 넘긴 `priceOf` 가 KRX 우선 · NXT 폴백 · 없으면 undefined). 소스를 되돌리면 실패하는 것을 확인했다.
**상태:** fixed

## 건너뛴 경고

### WR-04: 공유 계좌의 op 6/7 · 되싣기가 「그 DMA 유저의 등록 서버」 에만 닿는다

**파일:** `relay/src/admin/dispatcher.ts:319-327, 488-490` (`costTargetRows` 798)
**사유:** 건너뜀 — 설계 범위 결정과 부딪쳐 이번 수정 회차에서 안전하게 고칠 수 없다. 이유는 셋이다.
1. 리뷰 권고(대상 = 그 (증권사, 정규화 계좌)를 active 로 가진 **모든** DMA 유저의 등록 서버 합집합)를 하려면 의도 저장소에 계좌 기준 조회가 필요하다. 지금 `AdminIntentStore.intent` 는 `dma_admin_intent(p_dma_user_id)` RPC 하나뿐이다. 새 RPC(마이그레이션)를 만들거나, service role 직접 select 로 의도 표 구조에 새로 기대야 한다. 지시대로 DB 변경은 하지 않는다.
2. 대상을 넓히면 D-07(「fan-out 대상 = DB 등록 서버 전부(`#serverKeysOf` 현행)」)과 D-03(카드 불일치 판정 = 그 카드 등록 서버끼리)의 범위가 같이 바뀐다. B 카드 저장이 A 만 등록한 서버를 쓰고, 그 서버는 B 카드의 칩 · 불일치 줄에 보이지 않는다. 이는 서버별 칩 화면 계약(D-06)까지 건드리는 설계 결정이다.
3. 리뷰의 대안(비용 행에 `sharedAccountNote` 같은 경고 줄)은 새 UI 문구 · 배치 결정이다. 프로젝트 규칙(UI 는 목업 먼저)상 사용자 확인 없이 넣지 않았다.

**원래 지적:** 예수금 · 비용률은 서버의 **계좌** 값인데, 대상 서버 집합은 `store.intent(dmaUserId)` 곧 그 DMA 유저의 active 행에서만 고른다. 그래서 공유 계좌를 유저 A 는 KB120 · KB121 에, 유저 B 는 KB120 에만 등록했다면, B 카드에서 저장해도 KB121 은 옛 값으로 남는다. 불일치 줄도 뜨지 않는다. `#reloadCosts` 출처 후보도 같은 유저 행으로 제한된다.
**제안 처리:** 넓히기(새 RPC + D-07 · D-03 개정)와 경고 줄(목업) 중 하나를 사용자가 고른 뒤 후속 quick/phase 로 처리한다.

## 검증

- **어디서 돌렸나:** 격리 worktree `.claude/worktrees/phase-36-fix`(node_modules · env 준비됨). 메인 체크아웃이 아니다. 이 브랜치를 master 에 합친 뒤에는 같은 커밋에서 그대로 재현된다.
- **typecheck:** `relay` `tsc --noEmit -p .` 통과, `webapp` `tsc --noEmit -p .` 통과. shared · server 는 변경 없음.
- **lint:** `webapp` eslint(account-editor.tsx · me-client.tsx) 통과.
- **단위(수정마다):** 고친 파일 관련 vitest `--maxWorkers=2`. 4건 모두 수정 전 RED · 수정 뒤 GREEN 을 확인했다.
- **전체 스위트(패키지당 1회 · `--maxWorkers=2`):** relay 60 파일 1776 passed. webapp 192 파일 4968 passed + 1 skipped. Playwright 는 지시대로 돌리지 않았다.

---

_Fixed: 2026-10-28T02:32:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
