---
phase: 36-account-budget
plan: 03
subsystem: admin
tags: [server, webapp, admin, account-budget, fee, op6, op7, e2e]

requires:
  - phase: 36-01
    provides: "shared account-budget.ts(formatManwonFloor) · 생성물 SYNC"
  - phase: 36-10
    provides: "summarizeAccountCosts · AdminAccountView.costs · AdminAccountBudgetBody/FeeBody · parseBudgetManwon · parseCostPct · ppmToPct"
  - phase: 36-02
    provides: "relay PUT /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/budget|fee · 409 NO_SUCH_ACCOUNT · code 1 failed(범위 밖 · 구 서버)"
provides:
  - "server: AdminAccountBudgetSchema · AdminAccountFeeSchema · RelayAdminClient.setAccountBudget · .setAccountFee"
  - "server: PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/budget { budgetKrw } → { results }"
  - "server: PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/fee { feePpm, sellTaxPpm } → { results }"
  - "webapp: admin-api setAccountBudget · setAccountFee"
  - "webapp: account-editor AccountCostRow · josaEunNeun · ACCOUNT_EDITOR_TEXT 비용 키"
  - "e2e: ADMIN_USERS_FIXTURE_P36 · 목 PUT …/budget|fee(costs 갱신) · P36-B1 · P36-B2"
affects: [36-04, 36-09]

actuals:
  tokens: 22700
  tasks: 3
  commits: 5
plan_head_before: 2720336ae10426619506428691cdf9bbf7a3ba55
plan_head_after: c50e20bb5606bc3631a16eeed765c44f8dc4159a

tech-stack:
  added: []
  patterns:
    - "칸 초안 훅 useCostDraft — 포커스 순간 표시값을 붙잡고(재조회가 덮지 않음) · edited(이탈 저장 조건) · hold(실패 · 범위 밖이면 입력값 유지)"
    - "「변경 없음」 판정은 개요 값(summary)과 비교 — 저장 직후 쥔 의도 값과 비교하면 실패 뒤 재시도가 「변경 없음」 으로 접힌다"
    - "비용 행 결과 칩은 users.toml 반영 칩(overlay · BusyLines)과 다른 줄 — onResults 를 부르지 않는다(D-04)"
    - "440px 시트 안 행 배치는 카드 폭 컨테이너 쿼리(@container/cost · 464px)"

key-files:
  created:
    - .planning/phases/36-account-budget/36-03-SUMMARY.md
  modified:
    - server/src/schemas/admin.ts
    - server/src/services/relay-admin-client.ts
    - server/src/routes/admin.ts
    - server/tests/routes/admin-dma.test.ts
    - webapp/src/lib/admin-api.ts
    - webapp/src/components/admin/account-editor.tsx
    - webapp/src/components/admin/__tests__/account-editor.test.tsx
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts

key-decisions:
  - "「변경 없음」 비교 기준 = 개요 값(summarizeAccountCosts) — 저장 성공 직후 · 재조회 전 같은 값 Enter 는 다시 보낸다(서버가 ok 로 답한다 · 무해). 실패 뒤 재시도가 접히지 않는 쪽을 골랐다"
  - "포커스 이탈은 이번 포커스 뒤 고쳤을 때만(edited) 저장 · Enter 는 늘 저장 시도(값이 개요와 같고 불일치가 없으면 「변경 없음」)"
  - "실패 · 미반영 · 범위 밖이면 입력값을 붙잡는다(hold) — 재조회가 와도 칸이 서버 값으로 돌아가지 않는다. 다음 전부-ok 저장에서 놓는다"
  - "HTTP 오류(409 NO_SUCH_ACCOUNT · 502 등)는 useFieldSave 기본 문구 「저장하지 못했어요 · <message>」 를 role=alert 줄로 — 다른 계좌 라우트와 같은 분기"
  - "비용 칩 「실패」 낱말은 새 키 costFailed — 기존 REFLECT_LABEL.err(「실패 · BUSY」)는 users.toml 반영 칩 전용이라 RESULT_CHIP 경로는 그대로 뒀다"
  - "행 배치는 뷰포트 sm 이 아니라 카드 폭 쿼리 — 편집 시트가 데스크톱에서도 440px 이라 한 줄을 시도하면 줄 끝 「·」 이 매달렸다(아래 Deviation 1)"
  - "Express 감사 줄은 broker · 값 · 서버 결과만(계좌번호 없음) — DELETE 계좌 · order-server 와 같은 모양"

patterns-established:
  - "어드민 즉시 저장 칸의 공통 규칙(Enter = 시도 · 이탈 = 고쳤을 때만 · 재조회가 포커스 칸을 덮지 않음 · 실패면 입력 유지)"

requirements-completed: []

coverage:
  - id: D1
    description: "server PUT …/budget — requireAdmin · strict zod(원 정수 0~MAX_SAFE) · relay 1:1 · { results } 그대로 · 409/502 · 감사 줄 마스킹"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#P36 PUT …/budget (D-01 · D-06) (12 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "server PUT …/fee — uint32 구조 검사만(20000 · 4294967295 통과) · 400 6종 · 401/403 · 409 · 감사 줄"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#P36 PUT …/fee (D-02 · D-06) (11 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "예수금 칸 트레이서 — 표시 · Enter → setAccountBudget(원) → 서버별 칩 · 0 = 빈 칸 + 미설정 꼬리 · 87 전용 줄 없음 · op 3 바디 무변경"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P36 예수금 칸 (7 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "비용률 · 상태 6종 — 범위 · 두 값 함께 · 변경 없음 · 이탈 규칙 · code 1 서버 미지원 · offline · 비행 중 readOnly · 불일치 줄(은/는) · 확인 전 · D-04 · 배치 · 재조회 고정"
    verification:
      - kind: unit
        ref: "webapp/src/components/admin/__tests__/account-editor.test.tsx#P36 비용률 · 상태 6종 (19 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "실브라우저 흐름 — 1080 저장 · 범위 · 서버 미지원 · 다름 줄 · 교보 확인 전 · 알약 칩 무변경 / 390 2줄 · 넘침 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/admin.spec.ts#Phase 36 예수금 · 비용률 (D-01 ~ D-06) (P36-B1 · P36-B2) — admin.spec 전체 25 passed"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-10-27
status: complete
---

# Phase 36 Plan 03: 어드민 계좌 카드 예수금 · 수수료 · 매도세 행 Summary

**어드민 계좌 카드(KB · 교보)에 「예수금 [ ] 만원 · 수수료 [ ] % · 매도세 [ ] %」 행이 늘 보인다. 칸마다 즉시 저장된다(Enter · 고친 뒤 이탈). 예수금은 Express `PUT …/budget`(op 6)으로, 비용률은 두 값을 함께 `PUT …/fee`(op 7)로 relay 에 1:1 프록시된다. 결과는 등록 서버마다 칩 1개로 보인다. code 1 「서버 미지원」 · 범위 밖 · 서버별 다름 · 확인 전 · 보내는 중 상태를 단위 테스트와 실브라우저 E2E 로 잠갔다.**

## Performance

- **Duration:** 약 16분
- **Started:** 2026-10-27T14:39:17Z
- **Completed:** 2026-10-27T14:55:03Z
- **Tasks:** 3 (Task 1 tracer · Task 2 TDD RED → GREEN · Task 3 E2E)
- **Files modified:** 9

## 라우트 2개 (Express · requireAuth → requireAdmin)

| 경로 | 바디(strict) | relay | 응답 |
|---|---|---|---|
| `PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/budget` | `{ budgetKrw }` 정수 0 ~ `Number.MAX_SAFE_INTEGER` | 같은 경로 `/internal/admin/…/budget` | `{ results }` 그대로 |
| `PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/fee` | `{ feePpm, sellTaxPpm }` uint32 각각(범위 검사 없음) | 같은 경로 `/internal/admin/…/fee` | `{ results }` 그대로 |

relay 409(`NO_SUCH_ACCOUNT` 등)는 그대로 넘기고, 못 닿음 · 5xx 는 502 `RELAY_FAILED`, 클라이언트가 없으면 503 이다(`relayResults` 한 벌). 감사 op 는 `dma-account-budget` · `dma-account-fee` 이고 DMA id 는 마스킹, 계좌번호는 남기지 않는다.

## ACCOUNT_EDITOR_TEXT 에 더한 키

`budgetLabel` 「예수금」 · `budgetUnit` 「만원」 · `feeLabel` 「수수료」 · `sellTaxLabel` 「매도세」 · `pctUnit` 「%」 · `costCaption` · `costCaptionUnsetSuffix` 「 · 비우면 미설정」 · `costFailed` 「실패」 · `costMismatchBudget(key, v)` · `costMismatchFee(key, fee, tax)` · `costBudgetUnset` 「미설정」 · `costRangeInvalid` 「수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요」 · `costUnchanged` 「변경 없음」 · `costBusy` 「보내는 중」 · `costUnsupported` 「서버 미지원」 · `costUnsupportedLine(key, message)`. 조사는 `josaEunNeun(serverKey)` 가 고른다(끝 숫자 2·4·5·9 → 「는」, 그 밖 → 「은」).

## 상태 6종 ↔ 테스트

| 상태(UI-SPEC ①) | 단위 테스트(`account-editor.test.tsx`) | E2E |
|---|---|---|
| 쉬는 상태 · populated | 「P36 예수금 칸 › costs 1억 … 쉬는 칩 KB120 ok」 · 「(E1 partial) KB121 만 87 모름」 | P36-B1 ① |
| empty | 「값 0 → 빈 칸 · 「—」 · 미설정 꼬리」 · 「(E1 empty) 87 미확인 서버만」 | P36-B1 ⑤(KYOBO127 확인 전) |
| 반영됨(ok) | 「「1,500」 입력 + Enter → … 칩 KB120 KB121」(code 0 message 「변경 없음」도 ok) | P36-B1 ② |
| 저장 중(busy) | 「(behavior 6) 비행 중 — 예수금 칸만 readOnly · 보내는 중 칩(스피너)」 · 「카드 편집 저장 비행 중 → 세 칸 readOnly」 | — |
| 변경 없음(same) | 「(behavior 3) 표시값과 같은 값 Enter + 불일치 없음 → 요청 0」 · 「불일치가 있으면 같은 값이어도 보낸다」 | — |
| 실패 · 서버 미지원 | 「(behavior 5) failed code 1 「BAD_OP」 → 칩 title · role=alert 줄 · 입력값 유지」 · 「failed code 5 · offline」 | P36-B1 ④ |
| 서버 연결 안 됨(off) | 「(behavior 5) … offline → WARN 「KB120 미반영: 서버 연결 안 됨」」 | — |
| 서버별 다름(diff) | 「(behavior 7) 서버별 다름 — 두 줄」 · 「조사 은/는 — KYOBO119 는」 | P36-B1 ① · ②(재조회 뒤 예수금 줄 사라짐) |
| 범위 밖 | 「(behavior 1) 「1.5」 Enter → aria-invalid」 · 「소수 다섯째 자리 · 숫자 아님 · 이탈」 | P36-B1 ③(계산된 테두리색 = --destructive) |
| overflow · 폰 | 「(E1 overflow) 배치 — 카드 폭 컨테이너 쿼리」 | P36-B2(390 · 2줄 · 구분점 숨김 · 36px · 넘침 0 · 9자리 값) |
| D-04 · 재조회 | 「(D-04) 서버 알약 반영 칩 무변경」 · 「(E1 loading) 포커스 칸 고정」 · 「(D-05) 재조회가 오면 개요 값」 | P36-B1 알약 칩 전후 동일 · 토스트 0 |

## 검증 결과

- server `typecheck` exit 0 · `admin-dma.test.ts` **120 passed**(이 플랜 +23: budget 12 · fee 11)
- webapp `typecheck`(+ e2e tsconfig) exit 0 · `account-editor.test.tsx` **113 passed**(이 플랜 +26: 예수금 칸 7 · 비용률/상태 19 · 기존 1케이스 단언 좁힘) · `src/components/admin` + `src/lib` 80 파일 1879 passed
- Playwright `e2e/specs/admin.spec.ts --workers=1` **25 passed**(setup 1 · Phase 36 2 · 기존 22 회귀 0). 3100 포트가 비어 있어 이 worktree 의 dev 서버를 Playwright 가 직접 띄웠다(다른 트리 서버 재사용 없음)

## Task Commits

1. **Task 1 (tracer):** `01e2f9fd` feat(36-03): 어드민 예수금 칸 — 즉시 저장 → PUT budget 프록시 → 서버별 칩 (트레이서)
2. **Task 2 RED:** `f582bd99` test(36-03): 어드민 수수료·매도세 · 범위 · 서버 미지원 · 상태 6종 실패 테스트
3. **Task 2 GREEN:** `41d15c11` feat(36-03): 어드민 수수료·매도세 · 범위 · 서버 미지원 · 상태 6종 · 불일치 줄
4. **Task 3 중 배치 수정:** `4c39393b` fix(36-03): 예수금 행 배치를 카드 폭 쿼리로 — 440px 시트에서 줄 끝 「·」 매달림 제거
5. **Task 3:** `c50e20bb` test(36-03): 어드민 예수금·비용률 E2E — 저장 · 범위 · 서버 미지원 · 서버별 다름 · 폰 390

트레이서 게이트: auto 모드가 아니고 human_verify_mode 는 end-of-phase(기본)이며 `<verify>` 는 자동 검사뿐이다. 그래서 Task 1 verify(server 97 · webapp 94 pass)를 다시 돌려 통과를 확인한 뒤 Task 2 로 넘어갔다.

## TDD Gate Compliance (Task 2)

- RED `f582bd99`: server fee 10 실패(라우트가 없어 404 · 무토큰/trader 케이스는 인증 관문에서 먼저 막혀 통과) · webapp 15 실패(수수료 · 매도세 칸이 없음, 불일치 · 변경 없음 · 보내는 중 · 배치 data-slot 없음 — 계획한 동작 단언에서 실패). 구문 · 로드 오류는 없었다. 「단독 DMA · relay 클라이언트 없음」 1건이 한 번 실패했지만 단독 실행과 재실행에서 통과했다(이 플랜과 무관한 흔들림).
- GREEN `41d15c11`: server 108 · webapp 111 pass(GREEN 에서 재조회 고정 · D-05 2케이스를 더해 113).
- REFACTOR 커밋 없음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] 행 배치를 뷰포트 `sm` 에서 카드 폭 컨테이너 쿼리로**
- **Found during:** Task 3(E2E 1080 스크린샷)
- **Issue:** 플랜 · UI-SPEC 은 「폰(<640) 2줄 · 데스크톱 한 줄」 을 뷰포트 기준으로 적었다. 그런데 편집 시트는 데스크톱에서도 440px 패널이다(본문 ≈ 370px). 세 칸 한 줄에는 약 440px 가 필요하다. 그래서 1080 에서는 「예수금 [ ] 만원 · 수수료 [ ] % ·」 처럼 줄 끝에 구분점이 매달린 채 꺾였다.
- **Fix:** 행 바깥에 `@container/cost` 를 두었다. 464px 부터는 한 줄(`@min-[464px]/cost:basis-auto` · 구분점 `@min-[464px]/cost:inline`)이고, 그보다 좁으면 예수금 / 수수료 · 매도세 2줄이다. 수수료 · 매도세는 한 묶음(`admin-account-cost-rates`)으로 묶어 그 사이 구분점이 줄 끝에 남지 않게 했다. 폰 터치 높이(`h-9 sm:h-8`)는 기기 문제라 뷰포트 기준을 그대로 뒀다. 단위 테스트(E1 overflow)와 E2E(B1 배치 단언 · B2)로 잠갔다.
- **Files modified:** webapp/src/components/admin/account-editor.tsx · webapp/src/components/admin/__tests__/account-editor.test.tsx
- **Commit:** 4c39393b

**2. [Rule 3 - Blocking] 기존 교보 카드 단언 좁힘**
- **Found during:** Task 1
- **Issue:** `AccountEditor — 계좌 줄` 첫 케이스가 교보 카드에 `textbox` 가 하나도 없다고 단언했다. 원래 뜻은 「지점 · 트레이더 입력칸 없음」 인데, 이제 비용 행 입력칸이 생겨 이 단언이 맞지 않게 됐다.
- **Fix:** `queryByRole('textbox', { name: /지점|트레이더/ })` 로 원래 의도만 단언하게 좁혔다.
- **Commit:** 01e2f9fd

**3. [Rule 3 - Blocking] E2E 목에 `PUT …/budget|fee` 처리 추가**
- **Found during:** Task 3
- **Issue:** 기존 목의 `accounts` PUT 분기가 `…/budget` 경로까지 받아 `{ results: [] }` 를 돌려줬다(경로 접두가 같다).
- **Fix:** 더 긴 경로를 먼저 받는 분기를 넣었다. 값을 아는 active 등록 서버의 `costs` 를 바꾸고(예수금은 live) 서버마다 ok 를 돌려준다. 없는 계좌는 409 `NO_SUCH_ACCOUNT` 다. 이 목으로 재조회 뒤 다름 줄이 사라지는 것까지 E2E 에서 본다.
- **Commit:** c50e20bb

**Total deviations:** 3 auto-fixed (Rule 1 · Rule 3 ×2). **Impact:** 범위 확장은 없다. 1번은 UI-SPEC 문구(뷰포트 기준)와 구현이 다르므로 36-UI-SPEC ① 「배치」 를 「카드 폭 464px」 로 고쳐 읽어야 한다.

## Issues Encountered

- `admin-dma.test.ts` 의 기존 케이스 「단독 DMA · relay 클라이언트 없음 → 503 …」 가 전체 실행 중 한 번 실패했다. 단독 실행과 이후 전체 실행 2회에서는 통과했다. 이 플랜이 건드리지 않은 경로다.

## Next Phase Readiness

- 36-04: 개요 `costs` 공급(relay 87 · 67 live)이 들어오면 이 행이 실제 값을 그린다. 지금 실서버 개요에는 `costs` 가 없어서 모든 카드가 「— · 확인 전」 이다.
- 36-09(배포): Express 라우트 2개는 server 새 revision 이 필요하다. 구 gh-trade 서버에서는 저장할 때 「<키> 실패: 서버 미지원 · <message> — 서버 업데이트 뒤 다시 저장」 이 보인다(D-06 설계대로).

## Self-Check: PASSED

- FOUND: server/src/routes/admin.ts(`/accounts/:broker/:accountNo/budget"` · `/accounts/:broker/:accountNo/fee"`) · webapp/src/lib/admin-api.ts(`export function setAccountBudget` · `export function setAccountFee`) · webapp/src/components/admin/account-editor.tsx(`function AccountCostRow` · `summarizeAccountCosts(` · 범위 문구 · 「저장하면 등록 서버가 모두 같아져요」) · webapp/e2e/fixtures/admin.ts(`ADMIN_USERS_FIXTURE_P36`) · webapp/e2e/specs/admin.spec.ts(「Phase 36 예수금」)
- FOUND commits: 01e2f9fd · f582bd99 · 41d15c11 · 4c39393b · c50e20bb
