---
phase: 44-admin-settlement
fixed_at: 2026-11-21T02:42:25Z
review_path: .planning/phases/44-admin-settlement/44-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 44: 코드 리뷰 수정 보고서

**수정 시각:** 2026-11-21T02:42:25Z
**원본 리뷰:** .planning/phases/44-admin-settlement/44-REVIEW.md
**회차:** 1

**요약:**
- 범위 안 발견: 11 (critical 1 · warning 2 · info 8 · 범위 `all`)
- 고침: 11
- 건너뜀: 0

마이그레이션은 하나도 더하지 않았다(`supabase/migrations/20261120*.sql` 그대로 · `relay/` 그대로). 그래서 `supabase db push` 는 필요 없다.
반영하려면 **server 재배포**(CR-01 · IN-01 · IN-02 · IN-03 · IN-05)와 **webapp push**(CR-01 · WR-01 · WR-02 · IN-02 · IN-03 · IN-04 · IN-05 · IN-06 · IN-07 · IN-08)가 필요하다.
shared 를 고쳤으므로 server 이미지는 새 shared `dist` 로 다시 빌드해야 한다.

## Fixed Issues

### CR-01: 「다시 반영」 을 거치지 않은 고치기 · 지우기 · 정산 취소에서 예수금이 두 번 들어가거나 되돌려지지 않는다

**상태:** fixed: requires human verification (돈 경로의 판정 논리 변경)
**수정 파일:** `packages/shared/src/settlement.ts`, `server/src/services/settlement-budget.ts`, `server/src/routes/admin-settlement.ts`, `webapp/src/components/settlement/settlement-client.tsx`, `webapp/src/components/settlement/ledger-sheet.tsx`, `webapp/src/components/settlement/reflect-box.tsx`, 테스트 4개
**커밋:** 8ba37647
**적용한 수정:**
- shared 에 목표값 대조를 한 벌로 뺐다 — `reconcilePend(pend, 지금 값)`(지금 값 = 기록한 목표값 → 「들어감」 으로 pend 에서 뺌 · 목표값 없음 → 늘 「안 들어감」 · 보냈지만 지금 못 읽음 → `unknown`) · `appliedEffectAt(row, 지금 값, { unknownApplied })` · `nowBudgetsOfReads`(server — 이번 요청에서 읽은 값만) · `nowBudgetsOfAccounts`(webapp — known 만).
- server 네 경로가 같은 판정을 쓴다. 다시 반영(`retryPend`)은 이 함수로 바꿨다. 고치기는 `appliedEffectAt(옛 줄)` 으로 차이를 낸다. 지우기 · 정산 취소는 `revertOf` 를 쓴다(사전 점검 + 취소 RPC 뒤 되돌림 두 곳 모두).
- 「보냈지만 지금 못 읽어 모름」 처리: 고치기(반영 켬)는 409 `REFLECT_UNKNOWN`(아무것도 바꾸지 않음) — 그대로 두면 새 값을 통째로 다시 보내거나 새 pend 가 목표값 기록을 덮는다. 지우기 · 정산 취소는 그 계좌를 「들어갔을 수 있음」 으로 되돌림에 넣어 기존 D-30 `REVERT_UNREADABLE`(「… 읽지 못해 되돌릴 수 없어요」)로 막는다. 다시 반영은 그 계좌를 보내지 않고 원래 항목(목표값 포함)을 그대로 남긴다. 예전에는 `unreachable · targetKrw null` 로 덮어 근거가 사라졌다.
- webapp 지우기 · 정산 취소 확인 창은 상자 표시 · 보낼 `reflect` · 미리 보기를 같은 판정(화면이 이번 조회 때 읽은 값)으로 정한다. 그래서 timeout 계좌만 걸린 거래에도 ⑩ 상자가 나오고 `reflect: true` 가 간다. 고치기 미리 보기도 같은 판정이다.
- 회귀 테스트: 고치기(실제로 들어간 timeout · 메모만 → 안 보냄 · 금액 변경 → 차이만 · 안 들어감 → 다시 보냄 · 못 읽음 → 409) · 지우기(계좌 옮김 kyH 가 들어감 → 두 계좌 되돌림 · 한 계좌 timeout 줄 → 되돌림 · 못 읽음 → 409) · 정산 취소(timeout 바로 출금 줄 들어감 → 되돌림 · 못 읽음 → 409) · 다시 반영(못 읽음 → 목표값 유지) · shared 단위 · webapp 확인 창 2건.
- 사람이 확인할 점: 목표값 대조는 「그 사이 다른 반영이 그 계좌를 바꾸지 않았다」 를 전제로 한다(다시 반영과 같은 전제 · 설계 Pitfall 2). 같은 계좌를 그 사이 다시 반영했다면 지금 값 ≠ 목표값이라 「안 들어감」 으로 본다. 반영 끔 고치기는 목업대로 `pend {}` 로 저장하므로 「들어갔을 수 있다」 는 흔적도 함께 지운다(IN-04 에서 안내 줄로 알린다 · 동작은 그대로).

### WR-01: 거래 시트의 「오늘」 이 마지막으로 불러온 시각에 고정돼, 자정을 넘긴 탭에서는 오늘 날짜를 저장할 수 없다

**수정 파일:** `webapp/src/components/settlement/ledger-sheet.tsx`, `webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx`, `webapp/src/components/settlement/__tests__/settlement-client-ledger.test.tsx`, `webapp/e2e/specs/admin-settlement.spec.ts`
**커밋:** c8230d10
**적용한 수정:** 「오늘」 = 응답 `now` 와 브라우저 시계 중 늦은 KST 날짜(`openedToday`)로 바꿨다. 시트를 열 때마다 다시 정한다(세션 맞추기 블록). 날짜 기본값 · `max` · 미래 검증 · 스위치 기본값이 모두 이 값을 쓴다. 시계가 늦게 가도 응답 날 아래로 내려가지 않는다. 테스트 · e2e(P44-F2)는 시계를 응답 `now` 에 고정했다(vitest `toFake: ['Date']` · Playwright `page.clock.setFixedTime`). 자정을 넘긴 탭 · 시계가 늦은 경우 · 닫힌 채 날이 바뀐 경우 테스트 3건을 더했다. e2e 는 이번에 돌리지 않았다(typecheck 만).

### WR-02: Generality without instantiation — `AccountTable` 의 `labels` prop 을 넘기는 곳이 없다

**상태:** fixed: requires human verification (necessity — 코드 제거)
**수정 파일:** `webapp/src/components/settlement/account-table.tsx`
**커밋:** 7094f5b7
**적용한 수정:** 쓰는 곳 없는 `labels` prop 과 `labelOf` 의 바꿔 쓰기 분기를 지우고 shared 라벨을 바로 쓴다. 호출부 · 테스트는 바뀌지 않았다.

### IN-01: 지우기 · 정산 취소는 되돌릴 증감을 보내기 전에 남기지 않는다(저장 경로와 다름)

**수정 파일:** `server/src/routes/admin-settlement.ts`, `server/src/services/settlement-budget.ts`, 테스트 2개
**커밋:** 674fc8fe
**적용한 수정:** 리뷰 제안(RPC 에 `p_pend` 인자 추가)은 DB 변경이 필요해 따르지 않고, 같은 뜻을 마이그레이션 없이 냈다. 지우기 · 취소 RPC 가 성공하면 곧바로 `settlement_set_pend`(지운 줄도 받는다 · 기존 함수)로 되돌릴 증감(목표값 포함 · reason failed)을 남긴다. 그다음 보내고, 남은 것(전부 성공이면 `{}`)으로 덮는다. 정산 취소는 `reflectRows` 의 새 `beforeSend` 로 줄별 계획 pend 를 받는다. 남는 틈은 RPC 커밋과 첫 기록 사이의 DB 왕복 하나다(예전에는 relay 보내기 최대 15초까지였다). 대가로 성공 경로에 RPC 가 두 번 더 늘었다(드문 관리자 동작). 테스트: 호출 순서 · 기록 내용 갱신 + 「보내는 순간 이미 기록돼 있음」 1건.

### IN-02: 쥬니 묶음 「원금 4억까지 … 남음」 문구가 0 일 때와 지난 정산이 있을 때 사실과 다르다

**수정 파일:** `packages/shared/src/settlement.ts`, `server/src/routes/admin-settlement.ts`, `webapp/src/components/settlement/open-pools-card.tsx`, `webapp/src/components/settlement/settle-sheet.tsx`, 테스트 4개
**커밋:** beb29ca8
**적용한 수정:** shared `carryBasisLabel` 을 만들었다. 쥬니를 정산한 적이 있으면 「지난 정산 수준」, 없으면 「원금 <그 묶음 계좌 넣은 돈 합>」 이다. 남은 금액이 바로 「넣은 돈 − 예수금」 이라 같은 기준이고, 시드 상태에서는 지금처럼 「원금 4억」 이 나와 UI-SPEC 문구와 같다. 고정값 `baseKrw` 대신 계산한 값이라 원금 회수 · 추가 출자에도 맞는다. 리뷰가 든 `principalCaps` 합 대신 넣은 돈 합을 쓴 것은 남은 금액 계산과 기준을 같게 하려는 것이다. shared `carryShown` 은 만으로 내린 값이 0 이면 「나눌 수익이 없습니다」 로 바꾼다. 카드 l3 · 정산 시트 · server `CANNOT_SETTLE` 세 곳에 같게 적용했다.

### IN-03: 음수 예수금 하나가 읽은 값 기록 전체를 실패시키고, 화면에는 「미설정」 으로 보인다

**수정 파일:** `packages/shared/src/settlement.ts`, `server/src/routes/admin-settlement.ts`, 테스트 2개
**커밋:** ec8af1aa
**적용한 수정:** DB CHECK 는 그대로 두었다(마이그레이션 없음). GET 라우트가 음수 계좌만 `settlement_record_reads` 에서 빼고 경고 한 줄을 남겨, 다른 계좌 기록은 살린다. `buildSettlementAccounts` 는 0 만 「미설정」 으로 보고 음수는 known 음수 그대로 보인다(표는 이미 `formatEokManMinus` 로 부호를 그린다). `read.reads` 에는 음수가 남으므로 반영 계획은 실제 값으로 판정한다(지금 + 증감 < 1 이면 below_one).

### IN-04: 반영했던 거래를 「예수금에도 반영」 을 끄고 고치면, 예수금에 들어간 증감의 기록이 사라진다

**수정 파일:** `webapp/src/components/settlement/reflect-box.tsx`, `webapp/src/components/settlement/ledger-sheet.tsx`, `webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx`
**커밋:** cfe7f094
**적용한 수정:** 저장 동작(반영 끔 = `reflect false` · `pend {}`)은 채택 목업(`a-real.html:676`)과 같은 확정 동작이라 바꾸지 않았다. 리뷰 제안대로 반영했던 거래(들어갔을 수 있는 것 포함 · CR-01 판정)의 스위치를 끄면 「예수금은 그대로 둬요」 아래에 경고 색 「이전 반영분은 예수금에 그대로 남아요」 한 줄을 보인다. 옛 값은 지금도 `settlement_ledger_history.before` 에 남는다.

### IN-05: 쓰기 요청에 멱등 키가 없고, 같은 계좌 동시 반영은 읽고-고치고-쓰기 경합이다

**수정 파일:** `server/src/routes/admin-settlement.ts`, `webapp/src/components/settlement/ledger-sheet.tsx`, `webapp/src/components/settlement/settlement-client.tsx`, 테스트 2개
**커밋:** 0c22e7c1, f50b3eab
**적용한 수정:**
- 동시 반영: 정산 라우터에 쓰기 줄 세우기(`serializeSettlementWrites`)를 더했다. 이 인스턴스에서 GET 밖 정산 쓰기를 한 번에 하나씩 처리하고, 응답이 끝나거나(finish) 연결이 끊기거나(close) 60초가 지나면 푼다. 관문은 관리자 확인 뒤라 비관리자는 기다리지 않는다. 테스트: 두 번째 저장의 읽기가 첫 저장의 보내기 · 기록 뒤에 일어남 · 오류로 끝나도 줄이 풀림.
- 중복 저장: 멱등 키는 하지 않았다. 키를 기억할 표 · 유니크 제약이 필요하고, 사용자가 DB 변경을 피하라고 했다. 정산 확정은 `expectPrev` 로, 지우기는 404 로, 고치기 · 다시 반영은 차이 · 목표값 대조로 이미 두 번 반영되지 않는다. 남는 것은 「거래 기록」 새 줄뿐이다. 응답을 못 받은 저장(시간 초과 · 네트워크)은 「저장하지 못했어요」 대신 「저장됐는지 확인하지 못했어요 — 목록을 다시 불러왔어요. 같은 거래가 생겼는지 확인한 뒤 다시 저장해 주세요」 를 보이고 목록을 다시 불러온다.
- 줄 상한(60초)은 줄을 얻은 순간부터 잰다. 다음 쓰기는 앞 쓰기와 이 쓰기가 모두 끝나야 시작하므로, 기다리다 끊긴 요청 때문에 앞 쓰기를 건너뛰지 않는다(f50b3eab).
- 남은 한계(라우트 머리 주석에 적음): 줄은 인스턴스 메모리라 Cloud Run 인스턴스 사이(최대 3)는 겹칠 수 있다. 관리자 1 ~ 2명 · 최소 인스턴스 1 이라 보통은 같은 인스턴스가 받는다. 한 쓰기가 60초를 넘기면 안전 상한으로 줄이 풀린다.

### IN-06: `settlementBudgetOf` 의 `as unknown as` 캐스트가 계좌 메뉴 입력 모양 검사를 끈다

**수정 파일:** `packages/shared/src/order-endpoint.ts`, `packages/shared/src/settlement.ts`
**커밋:** b46ecc9a
**적용한 수정:** `SummarizeAccountCostsInput["account"].servers` 와 `registeredServersOf` 인자를 판정이 읽는 `{ serverKey, state }` 로 좁혔다. `AdminAccountView` 는 그대로 맞는다. 정산 쪽은 캐스트 없이 같은 타입으로 값을 만든다. shared 전체 테스트(1,467) · server · webapp typecheck 가 통과했다.

### IN-07: `SETTLEMENT_WRITE_TIMEOUT_MS` 주석이 실제 보내기 순서와 다르다

**수정 파일:** `webapp/src/lib/admin-api.ts`
**커밋:** bee48ce4
**적용한 수정:** 주석을 「두 계좌를 병렬로 — relay 쓰기 상한 15초 + 읽기 2초 + DB 왕복이면 최악 약 20초 · 남는 몫은 쓰기 줄 세우기 대기와 느린 망 여유」 로 고쳤다. 값 40초는 그대로다.

### IN-08: 미리 보기는 못 읽은(stale) 계좌도 바뀔 값으로 보이지만, server 는 그 계좌를 보내지 않는다

**수정 파일:** `webapp/src/components/settlement/reflect-box.tsx`, `webapp/src/components/settlement/__tests__/reflect-box.test.tsx`, `webapp/src/components/settlement/__tests__/settle-confirm.test.tsx`
**커밋:** 633350da
**적용한 수정:** `ReflectLine` 에 `stale` 을 더했다. 못 읽어 마지막 값을 보이는 계좌의 줄은 경고 색 「KB 정근형 예수금 8억 4,500만 — 매매 서버에서 못 읽어 지금은 보내지 못해요」 로 보인다. ⑦ 거래 시트 · ⑧ 정산 시트 · ⑨ 확인 창이 같은 함수를 쓰므로 세 곳 모두 적용된다.

## 검증

검증은 모두 **격리 worktree**(`.claude/worktrees/rf-44-*` · 오프라인 `pnpm install`)에서 돌렸다. worktree 를 지운 뒤에도 main checkout 의 같은 커밋에서 같은 명령으로 다시 낼 수 있다. server · webapp 은 shared 를 `dist` 로 읽는다. 그래서 병합 뒤 main checkout 에서도 `pnpm --filter @gh-radar/shared build` 를 한 번 돌려 `dist` 를 새로 만들어 두었다. 다른 checkout 에서 재현할 때도 먼저 이 빌드를 돌린다.

| 항목 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| shared `settlement.test.ts` · `settlement-reflect.test.ts` | 84 통과 |
| shared 전체(IN-06 확인) | 1,467 통과 · 2 건너뜀(기존) |
| server `admin-settlement*.test.ts` 3개 | 110 통과(마지막 커밋 f50b3eab 뒤 다시 돌림) |
| webapp `src/components/settlement` | 151 통과 |
| webapp `typecheck`(본체 + e2e tsconfig) · server `typecheck` · shared `typecheck` | 통과 |
| e2e(Playwright) | 실행 안 함 — P44-F2 에 시계 고정만 더했고 typecheck 로 확인 |
| pgTAP | 해당 없음(마이그레이션 없음) |

## 배포 메모

- `supabase db push`: 필요 없음.
- server 재배포: 필요(CR-01 · IN-01 · IN-02 · IN-03 · IN-05 — 새 shared `dist` 포함).
- webapp push: 필요(CR-01 · WR-01 · WR-02 · IN-02 · IN-03 · IN-04 · IN-05 · IN-06 · IN-07 · IN-08).
- 순서: server 를 먼저 배포하고 webapp 은 나중에 push 한다. webapp 이 먼저 나가면 timeout 계좌만 걸린 거래의 지우기 확인 창이 `reflect: true` 를 보내는데, 옛 server 는 그 계좌를 되돌리지 않는다(지금과 같은 결과라 더 나빠지지는 않는다).

---

_수정 시각: 2026-11-21T02:42:25Z_
_수정자: Claude (gsd-code-fixer)_
_회차: 1_
