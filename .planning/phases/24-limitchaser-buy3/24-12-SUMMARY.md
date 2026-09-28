---
phase: 24-limitchaser-buy3
plan: 12
subsystem: webapp-trading
tags: [limit-chaser, buy3, gap-closure, legacy-server, react, vitest, playwright]
status: complete

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-10 lib isLegacyBuySchema · isLegacyAmountUnknown — 구서버 판별 단일 지점"
provides:
  - "훅 export lcLegacyBlockOf(legacy, field, value, next) — 구서버 에코 편집 제한 판정 지점 하나"
  - "LC_COMMIT_TEXT.legacyReadOnly · legacyMasterFirst 문구 원천 · 실패 사유 'legacySchema'"
  - "훅 sendNow 전송 직전 구서버 가드(범위 가드 뒤 · 금액 · 무장 가드 앞 · 대기열 꺼내기 포함)"
  - "폼 validateCommit = lcLegacyBlockOf ?? armBlockOf — 시트 · 인라인 확정 전 검증과 훅이 같은 함수"
  - "폼 맨 위 한 줄(SUBMIT_ERROR_REASONS)이 'legacySchema' 를 말한다"
  - "D-04a 금액 확정 특례(lcAmountBlockOf · 금액 앎 상태 · 수량 일치 에코 성공 · sentBuyOrderQty · 'amountRequired' 사유) 제거"
  - "e2e P24-10(구서버 끄기만 · 매수주문부터 · 철거까지) · P24-5 신필드 0(buy3) 시드 · 사건 기반 개수 단언 재작성"
affects: [24-13, 24-15, 24-16]

actuals:
  tokens: 16900
  tasks: 2
  commits: 4
plan_head_before: 9556c1a324980fe050a71c9b6eed17c825a77549

tech-stack:
  added: []
  patterns:
    - "구서버 에코 편집 제한 = 끄는 방향(값 false) ∧ 결과 cfg 매수주문 OFF 만 전송 — 훅 전송 직전 가드와 폼 확정 전 검증이 lcLegacyBlockOf 하나를 읽는다"
    - "e2e 전송 0 은 고정 대기 없이 「다음 허용 확정의 10 이 게이트웨이에 보인 순간 누적 = 기준 + 1」로 증명(같은 소켓 · 송신 순서)"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "WR-02 허용 규칙: 구서버 에코에서는 「끄는 방향 ∧ 결과 매수주문(마스터) OFF」만 보낸다 — 매수주문 끄기는 늘 허용, 그 뒤 매도 · 취소 · 체크 끄기와 철거(crud D) 허용. 두 번 누르면 완전 해제(T-16-44)"
  - "구서버 가드는 금액 가드 앞 — 구서버 ∧ 금액 0 에서 금액 외 확정의 문구가 「주문금액을 먼저 입력해 주세요」가 아니라 구서버 읽기 전용 문장이 된다"
  - "D-04a 금액 확정 특례 제거(도달 불가) — 남는 것은 금액 행 「—」(amountRequired = isLegacyAmountUnknown) · 끄기 cfg 의 서버 금액 · 수량. CONTEXT D-03 「D-04a 는 선매수에 그대로 적용」이 가리키던 금액 확정 경로가 사라진 것 → 24-16 체크포인트 사용자 확인 항목"
  - "구서버 선매수 켜기는 사전 검증 줄이 아니라 폼 맨 위 구서버 문장(훅 가드) — groupPrechecksOf 는 amountRequired 인자 없이 세 그룹 모두 lcGroupAmountBlockOf 로 판정"

patterns-established:
  - "구서버 편집 제한 판정 지점 하나: lcLegacyBlockOf (webapp/src/components/trading/lc/use-lc-field-commit.ts)"

requirements-completed: []

coverage:
  - id: D1
    description: "구서버 에코에서 매수가 켜진 채 매도 끄기 = 전송 0 + 「구서버 전략이라 매수주문부터 꺼 주세요」 · 매수주문 끄기 = 10 한 건(buy_watch_side 슬롯 없음) · 이어서 매도 끄기 = 철거(crud D)"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-10 WR-02"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-02 — 구서버 에코(buy3Schema 0)는 끄기만 · 매수주문부터"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-02 — 매수가 켜진 채 매도 끄기 → 전송 0 · 폼 맨 위 …"
        status: pass
    human_judgment: false
  - id: D2
    description: "구서버 에코의 값 확정 · 금액 확정 · 켜는 토글 · 대기열 꺼내기 = 전송 0 + legacyReadOnly(낙관 표시 없음 · 조용한 드롭 없음)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#값 확정 · 금액 확정 · 켜는 토글 = 모두 blocked / 대기열 — 꺼낼 때 같은 가드로 전송 0"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-02 · D-04a 잔여 — 구서버 에코(buy3Schema 0) (인라인 · 시트 · 켜는 스위치 · 선매수 켜기)"
        status: pass
    human_judgment: false
  - id: D3
    description: "buy3 에코(buy3Schema 1)에서는 제한 없음 — 기존 확정 · 동반 · 자동 끔 · 사전 검증 테스트 전부 통과"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test — 125 files · 2700 passed · 1 skipped"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-4 · P24-5 · P24-9 · P20-1"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-04a 금액 확정 특례 제거 — 금액 행 「—」 · 끄기 cfg 서버 금액 · 수량은 유지"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#구서버 ∧ 금액 0 에서 매수주문 끄기 cfg 는 금액 · 수량을 서버 값 그대로"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#선매수 금액 행 「—」 · 끄기(매수주문 끄기)는 늘 허용"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-04a 금액 확정 경로 제거가 CONTEXT D-03 「D-04a 는 선매수에 그대로 적용」의 사용자 의도와 맞는가"
    verification: []
    human_judgment: true
    rationale: "결정 재해석은 테스트로 증명할 수 없다 — 플랜이 24-16 체크포인트에서 사용자 확인 항목으로 묻는다고 명시"

duration: 13min
completed: 2026-09-28
---

# Phase 24 Plan 12: WR-02 ① 구서버 에코 편집 제한(전송 경로) Summary

**구서버 에코(`buy3Schema 0`)에서는 「끄는 방향 ∧ 결과 매수주문 OFF」 cfg 만 나가도록 `lcLegacyBlockOf` 를 훅 전송 직전(대기열 포함)과 폼 시트 · 인라인 확정 전 검증에 걸어, `buy_watch_side` 없이 구서버에 닿는 cfg 가 살아 있는 매수 감시 기준을 조용히 뒤집는 경로를 없앴다 — 매수주문 끄기는 늘 나가고 두 번의 끄기로 철거까지 닿는다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-28T04:26:07Z
- **Completed:** 2026-09-28T04:39:00Z
- **Tasks:** 2 (tracer 1 + auto 1)
- **Files modified:** 5

## Accomplishments

- `lcLegacyBlockOf(legacy, field, value, next)` 신설 — 구서버가 아니면 null · 값 `false` 가 아니면 legacyReadOnly · `false` 인데 결과 마스터 ON 이면 legacyMasterFirst · 그 외 null. 판별은 24-10 lib `isLegacyBuySchema` 로만(제품 코드 `buy3Schema` 비교는 여전히 lib 한 파일).
- 훅 `sendNow` 가 범위 가드 바로 뒤에서 이 함수를 부른다 — 즉시 확정과 대기열 꺼내기가 같은 경로라 대기 건도 같은 가드. 막히면 `'legacySchema'` 실패 · 낙관 표시 되돌림 · `'blocked'`.
- 폼 맨 위 한 줄(`SUBMIT_ERROR_REASONS`)이 `'legacySchema'` 를 말한다 — 막힌 토글이 조용히 되돌아가지 않는다.
- 폼 `validateCommit` = `lcLegacyBlockOf(isLegacyBuySchema(server), field, v, next) ?? armBlockOf(next)` — 인라인 말풍선 · 시트 상태 줄이 훅과 같은 문장을 말한다.
- D-04a 금액 확정 특례(금액 먼저 가드 `lcAmountBlockOf` · 금액 앎 ref/state · 수량 일치 에코 성공 · 성공 뒤 폼 금액 주입 · `Inflight.sentBuyOrderQty` · `'amountRequired'` 사유)를 걷어냈다. `amountRequired` 는 「—」 표기용 `isLegacyAmountUnknown(server)` 로 남고, 끄기 cfg 는 서버 금액 · 수량을 싣는다.
- 훅 머리 주석 IN-01 훅 분: ① 「32필드」 → 「cfg 조립 정본 = 폼 `buildCfg`」 · ⑥ 「그룹 스위치 4개」 → 「`LC_GATE_FIELDS`」 · ⑨-2 「32필드 전부」 → 「전략 전체」 · ⑧ 금액 특례 문단 삭제 · ⑨-3 WR-02 로 재작성.
- e2e P24-10 신설(진짜 브라우저 → relay → 스텁 게이트웨이) · P24-5 를 신필드 0(buy3) 시드 · 사건 기반 개수 단언(고정 대기 0)으로 재작성(IN-07 부분).

## Task Commits

1. **Task 1 (tracer) RED:** `f5fbcd32` test(24-12) — 훅 · 폼 단위 · e2e P24-10
2. **Task 1 (tracer) GREEN:** `b1df171e` fix(24-12) — 전송 직전 lcLegacyBlockOf 가드 · 문구 · 사유 · 폼 맨 위 한 줄 · P24-5 재작성
3. **Task 2 RED:** `2bfd37e5` test(24-12) — 시트 · 인라인 확정 전 검증과 선매수 켜기가 구서버 문장
4. **Task 2 GREEN:** `e9aa0da1` fix(24-12) — validateCommit 통일 · D-04a 금액 확정 특례 제거 · 훅 머리 주석

## TDD Gate Compliance

- **RED (Task 1 · e2e):** `playwright test -g "P24-10"` → `P24-10 … trading-workbench.spec.ts:3246 — expect(locator('[data-slot="lc-submit-error"]')).toHaveText("구서버 전략이라 매수주문부터 꺼 주세요") failed · Error: element(s) not found` (1 failed — 매도 끄기가 막히지 않고 그대로 나갔다).
- **RED (Task 1 · 단위):** 훅 · 폼 2파일 13 failed / 231 passed — 모두 대상 테스트의 단언 실패(`expected 'sent' to be 'blocked'` · `expected 'amountRequired' to be 'legacySchema'` · `expected [ 'sent', 'queued', 'queued' ] to deeply equal [ 'blocked', 'blocked', 'blocked' ]` · 폼 `expected [ {…} ] to have a length of +0 but got 1`). 표 단언 1건만 `lcLegacyBlockOf is not a function`(아직 export 없음).
- **GREEN (Task 1):** `vitest --run src/components/trading/lc src/components/trading/__tests__/limit-chaser-form.test.tsx` 8 files · 453 passed · typecheck 0 error · e2e `P24-10|P24-9|P24-5|P24-4` 5 passed(setup 포함). 트레이서 게이트(auto 비활성 · end-of-phase · automated-only verify) — verify 재실행 통과 후 확장.
- **RED (Task 2):** 폼 1파일 3 failed / 163 passed — 인라인 · 시트 문구(`toHaveTextContent` 구서버 문장 불일치) · 구서버 선매수 켜기(`expected <p …> to be null` — 사전 검증 줄이 섰다).
- **GREEN (Task 2):** `vitest --run src/components/trading src/lib` 77 files · 2090 passed · 1 skipped · shared build · typecheck 0 error · e2e `P24-10|P24-9|P24-5|P20-1` 5 passed.
- `gsd-tools check tdd-red-evidence` 는 쓰지 않았다 — vitest 출력에 node-test 요약 줄이 없어 zero_tests_discovered 가 나오는 도구라, 대상 테스트 이름 + 단언 실패 줄로 위에 기록했다.

## Verification

- 빌드: shared build · relay typecheck · relay typecheck:tests · webapp typecheck(e2e 포함) — exit 0
- webapp 전체 `pnpm --filter @gh-radar/webapp run test` — 125 files · 2700 passed · 1 skipped
- e2e `P24-10|P24-9|P24-5|P24-4|P20-1` — 6 passed(setup 포함 · 25.1s)
- 제품 코드 `buy3Schema` 비교는 `webapp/src/lib/limit-chaser.ts` 한 파일뿐(다른 파일은 주석만)
- relay 는 변경 없음 — relay test 미실행(변경 파일 0)

## Files Created/Modified

- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — `lcLegacyBlockOf` · 문구 2 · `'legacySchema'` · 전송 직전 가드 · D-04a 금액 확정 특례 제거 · 머리 주석
- `webapp/src/components/trading/limit-chaser-form.tsx` — `validateCommit` 통일 · `SUBMIT_ERROR_REASONS` · 사전 검증 `amountRequired` 인자 제거 · 머리 ④ 두 줄
- `webapp/e2e/specs/trading-workbench.spec.ts` — P24-10 신설 · P24-5 재작성
- 단위 테스트 2파일 — WR-02 describe · D-04a 케이스를 구서버 차단 기대로 · describe 이름 「WR-02 · D-04a 잔여 — 구서버 에코(buy3Schema 0)」

## Decisions Made

- 허용 규칙은 「끄는 방향 ∧ 결과 마스터 OFF」 — 「철거 한 방만」 허용은 게이트가 둘 이상 켜진 전략을 끌 수 없게 만들고(교착), 「게이트 하나씩 끄기 전부 허용」은 매수가 켜진 채 매도만 끄는 cfg 로 이 갭을 다시 연다.
- 체크 끄기(`cancelTradeEnabled` 등)도 마스터 OFF 뒤 허용 — 판정은 `isDisarm` 이 아니라 값 `false` 로 한다(철거의 `isDeleteIntent` 가 `cancelTradeEnabled` 를 본다).
- 구서버 가드는 금액 가드 앞, 무장 가드 앞 — 구서버에서는 어떤 켜기도 나가지 않으므로 무장 문구보다 구서버 문구가 사실에 가깝다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 에서 CR-03 금액 특례 케이스 3건과 D-04a 「⑧ 특례 수량 일치」 케이스를 함께 고쳤다**
- **Found during:** Task 1 ④ 단위 테스트
- **Issue:** 플랜은 이 케이스들을 Task 2(특례 제거)에서 지우라고 했지만, Task 1 가드만으로 구서버 금액 확정이 `'blocked'` 가 되어 Task 1 GREEN 이 불가능했다(훅 결과가 바뀌는 케이스).
- **Fix:** Task 1 에서 CR-03 3건을 「구서버 금액 0 에서 주문금액 확정 = `legacySchema` 차단」 1건으로, D-04a 의 「금액 확정 정상 경로」 · 「⑧ 특례로 잠금 해제」 · 「금액 확정 대기 뒤 토글」을 「금액 확정도 차단」 · 「매수주문 끄기 대기 뒤 켜는 토글 = 꺼낼 때 차단」으로 바꿨다. Task 2 는 제품 코드 제거만 남았다.
- **Files modified:** webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
- **Commit:** f5fbcd32

**2. [Rule 1 - Bug(문서 정확성)] 폼 머리 ④ 두 줄 · 훅 `LC_COMMIT_TEXT.amountRequired` · `GROUP_AMOUNT_FIELD` · `isDisarm` JSDoc**
- **Found during:** Task 2
- **Issue:** 「금액 외 확정은 주문금액을 먼저 입력해 주세요로 막힌다(판정은 훅 amountRequired)」 · 「lcAmountBlockOf 와 같은 모양」 · 「금액 먼저 가드를 지나지 않는다」가 제거된 코드를 가리키게 됐다.
- **Fix:** 구서버 편집 제한(WR-02 · `lcLegacyBlockOf`) 기준으로 문장만 고쳤다. 폼 머리의 필드 수 주석(IN-01 폼 분)은 손대지 않았다(24-15 몫).
- **Files modified:** use-lc-field-commit.ts · limit-chaser-form.tsx
- **Commit:** e9aa0da1

**3. [Rule 1 - 정확성] 훅 D-04a describe 이름도 바꿨다**
- **Found during:** Task 2 ④
- **Issue:** 플랜은 폼 describe 이름만 바꾸라고 했지만 훅 describe 이름 「… 금액부터 받는다」가 제거된 동작을 말했다.
- **Fix:** 「WR-02 · D-04a 잔여 — 구서버 에코(buy3Schema 0) 금액 0 — 금액 행 「—」 표기 · 끄기 cfg 는 서버 금액 · 수량」.
- **Commit:** e9aa0da1

**Total deviations:** 3 auto-fixed (차단 해소 1 · 문서 정확성 2). **Impact:** 제품 동작은 플랜 그대로 — 테스트 정리 시점이 Task 1 로 당겨졌고 주석이 코드 사실과 맞게 됐다.

## Issues Encountered

None.

## Known Stubs

None.

## Decisions Left for 24-16 Checkpoint

- D-04a 금액 확정 경로 제거 — CONTEXT D-03 「D-04a 는 선매수에 그대로 적용」이 가리키던 「금액부터 받는」 경로가 구서버 에코 읽기 전용화로 사라졌다(남는 것: 금액 행 「—」 · 끄기 cfg 서버 금액 · 수량). 사용자 확인 항목.
- 허용 규칙 「끄는 방향 ∧ 결과 매수주문 OFF」(매수주문 끄기 먼저 → 나머지 끄기 · 철거)가 오케스트레이터 범위 「철거만 허용」의 구체화로 맞는가.

## Next Phase Readiness

- 24-13 이 `LC_COMMIT_TEXT.legacyReadOnly` · `legacyMasterFirst` 를 UI-SPEC 에 박제하고, 카드 상태 한 줄 · 켜는 스위치 비활성 · 사유 패널로 화면 표시를 얹을 수 있다(판정은 `isLegacyBuySchema` · 차단은 `lcLegacyBlockOf`).
- 배포 없음 — 커밋만(push · relay · Vercel 은 메인 세션 몫). relay · shared 변경 0.

## Self-Check: PASSED

- FOUND: use-lc-field-commit.ts · limit-chaser-form.tsx · trading-workbench.spec.ts · use-lc-field-commit.test.tsx · limit-chaser-form.test.tsx
- FOUND commits: f5fbcd32 · b1df171e · 2bfd37e5 · e9aa0da1
- Task 1 · Task 2 수용 기준 전부 PASS(grep 결과 1/1·1/1/1/0/1/1 · P24-5 구서버 시드 0 · 고정 대기 0 · 0/0·0/1/5/0) · 두 automated 명령 exit 0
