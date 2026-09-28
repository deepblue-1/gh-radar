---
phase: 24-limitchaser-buy3
plan: 10
subsystem: webapp-trading
tags: [limit-chaser, buy3, gap-closure, react, vitest, playwright]

requires:
  - phase: 24-limitchaser-buy3
    provides: "24-09 배포된 buy3 스키마(에코 buy3Schema 1) · relay 가 buy3Schema 를 읽어 「판정은 UI 몫」으로 넘김"
provides:
  - "lib isLegacyBuySchema · isLegacyAmountUnknown — 구서버 판별 단일 지점(24-12 · 24-13 재사용)"
  - "formFromServer 선매수 금액 prev 보존을 구서버 ∧ 금액 0 으로 좁힘"
  - "훅 amountRequired · 전송 직전 금액 가드 · 금액 확정 특례 · 금액 앎 해제가 isLegacyAmountUnknown 을 읽음"
  - "선매수 사전 검증이 D-03 금액 규칙(IN-04) · 한방가격 0 카드 한 줄(IN-03)"
  - "e2e P24-9 — buy3 선매수 금액 0 전략의 첫 마운트 · 새로고침 뒤 편집"
  - "죽은 더티 판정(dirtyFieldsOf · DIRTY_COMPARED_FIELDS · LimitChaserDirtyField) 삭제"
affects: [24-12, 24-13, 24-15, 24-16]

actuals:
  tokens: 15000
  tasks: 3
  commits: 4
plan_head_before: f2afd64cd3027a4b58e2412a616bf13e8a2f0884

tech-stack:
  added: []
  patterns:
    - "구서버 판별은 lib isLegacyBuySchema 하나 — 훅 · 폼 · 카드는 buy3Schema 를 직접 비교하지 않는다"

key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/src/components/trading/strategy-log.tsx
    - packages/shared/src/relay.ts

key-decisions:
  - "WR-01: 선매수 금액 0 = 「서버가 모른다」(D-04a) 특례는 구서버 에코(buy3Schema 0)에서만 — buy3 에코의 0 은 「선매수 금액 미입력」(D-03 추가 · 후매수와 같은 규칙). 재해석 확인은 24-16 체크포인트 몫"
  - "IN-04: 선매수 켜기 사전 검증 금액 갈래 = 구서버 amountRequired 면 그 문구, 아니면 세 그룹 모두 lcGroupAmountBlockOf(GROUP_AMOUNT_FIELD 에 preBuyEnabled 추가)"
  - "IN-03: 한방 체크 ON ∧ 한방가격 0 은 선매수 카드 사전 검증 줄(ARM_BLOCKED_TEXT.sweepPrice 원문 재사용 · 새 문구 없음)"
  - "IN-02: 제품 소비처 0 인 더티 판정을 삭제하고, S→C 전용 필드 계약 단언만 formFromServer describe 로 옮김"

patterns-established:
  - "구서버 판별 단일 지점: isLegacyBuySchema / isLegacyAmountUnknown (webapp/src/lib/limit-chaser.ts)"

requirements-completed: []

coverage:
  - id: D1
    description: "buy3 선매수 금액 0 전략이 첫 마운트 · 재마운트 뒤에도 값 확정을 보낸다(WR-01)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#WR-01 — buy3 선매수 금액 0 전략은 새 마운트 · 재마운트 뒤에도 편집된다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#WR-01 — buy3 에코(`buy3Schema 1`)의 선매수 금액 0 은 미입력이다"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-9 WR-01"
        status: pass
    human_judgment: false
  - id: D2
    description: "구서버 판별 lib 단일 지점 · formFromServer 좁힌 특례(buy3 → 0 · 구서버 → prev)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#isLegacyBuySchema · isLegacyAmountUnknown — 구서버 판별 단일 지점"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#WR-01 — buy3 에코(`buy3Schema 1`)의 선매수 금액 0 은 0 그대로 들어온다"
        status: pass
    human_judgment: false
  - id: D3
    description: "선매수 사전 검증 — 금액 0(buy3 · 구서버) · 한방가격 0 을 선매수 카드 한 줄로(IN-04 · IN-03)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑱ IN-04 · IN-03 케이스 3건"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#IN-04 — 선매수도 같다"
        status: pass
    human_judgment: false
  - id: D4
    description: "죽은 더티 코드 삭제 · lib · shared · strategy-log 주석 정정(IN-02 · IN-01 lib 분)"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && relay typecheck && webapp typecheck · vitest src/lib + strategy-log.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-04a 를 구서버 에코로 좁힌 CONTEXT D-03 재해석이 사용자 의도와 맞는가"
    verification: []
    human_judgment: true
    rationale: "결정 재해석은 테스트로 증명할 수 없다 — 플랜이 24-16 체크포인트에서 사용자 확인 항목으로 묻는다고 명시"

duration: 11min
completed: 2026-09-28
status: complete
---

# Phase 24 Plan 10: WR-01 buy3 선매수 금액 0 전략 잠김 갭 클로징 Summary

**레거시 「선매수 금액 0 = 서버가 모른다」 특례를 lib `isLegacyAmountUnknown`(구서버 `buy3Schema 0` ∧ 금액 0) 한 곳으로 좁혀, 후매수 · 추가매수 전용 buy3 전략이 새로고침 뒤에도 편집되고 선매수 켜기만 카드 한 줄로 막힌다**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-28T04:03:43Z
- **Completed:** 2026-09-28T04:14:47Z
- **Tasks:** 3 (tracer 1 + auto 2)
- **Files modified:** 9

## Accomplishments

- WR-01: `formFromServer` · 훅 `amountUnknownNow` · `amountRequired` · 금액 앎 해제 · 금액 확정 특례 다섯 곳이 모두 lib `isLegacyAmountUnknown` 을 읽는다. buy3 에코의 선매수 금액 0 은 0 그대로 폼에 들어와 행 「—」 · 접근성 「선매수 금액 미입력」으로 보이고, 다른 행 확정은 자유롭다.
- 구서버 판별 단일 지점 `isLegacyBuySchema` 신설 — 제품 코드에서 `buy3Schema` 비교는 lib 한 파일뿐이다(24-12 · 24-13 이 재사용).
- IN-04: 선매수 켜기 사전 검증이 추가 · 후매수와 같은 금액 규칙(`lcGroupAmountBlockOf`)을 따른다 — 수량 0 문구로 떨어지지 않는다.
- IN-03: 한방 체크 ON ∧ 한방가격 0 을 선매수 카드 사전 검증 줄로 말한다(폼 맨 위 한 줄로 새지 않는다).
- IN-02: 제품 소비처 0 이던 `dirtyFieldsOf` · `DIRTY_COMPARED_FIELDS` · `LimitChaserDirtyField` 삭제. S→C 전용 필드 계약 단언은 `formFromServer` describe 로 옮겼다.
- IN-01(lib · shared 분): lib 머리 · `LimitChaserFormValues` JSDoc 의 필드 수를 정본(Omit 목록 · `LIMIT_CHASER_SERVER_ONLY_FIELDS`) 참조로, shared `buyOrderAmount` 0 의미를 「구서버 에코에서만」으로 정정했다(주석만 — relay 재배포 불필요).

## Task Commits

1. **Task 1 (tracer) RED:** `015bf371` test(24-10) — buy3 선매수 금액 0 새 마운트 편집 회귀 테스트
2. **Task 1 (tracer) GREEN:** `c4bcdb5c` fix(24-10) — 레거시 선매수 금액 특례를 구서버 에코로 좁힘
3. **Task 2:** `dec9289c` fix(24-10) — 선매수 사전 검증 D-03 규칙 + 한방가격 0 카드 한 줄 + e2e P24-9
4. **Task 3:** `99ed28af` refactor(24-10) — 죽은 더티 판정 삭제 + lib · shared 주석 정정

## TDD Gate Compliance

- **RED (Task 1):** `vitest --run limit-chaser-form.test.tsx -t "WR-01 — buy3"` → `× 첫 마운트 … → expected [] to have a length of 1 but got +0` · `× 재마운트 … → expected [] to have a length of 1 but got +0` (3 tests · 2 failed · 선매수 금액 300 확정 케이스는 원래 정상 경로라 통과). `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK target_test_failed` (vitest tap-flat 출력에서 실행된 줄만 추리고 node-test 요약 줄 `# tests/# pass/# fail` 을 붙여 판정기에 넣었다).
- **GREEN (Task 1):** 단위 3파일 307 tests pass · typecheck 0 error. 트레이서 게이트(auto 비활성 · end-of-phase · automated-only verify) — verify 재실행 통과 후 확장.
- **Task 2:** 구현 뒤 새 단위 3건(훅 IN-04 선매수 · 폼 IN-04 buy3 · 폼 IN-03)이 구현 전 코드(HEAD 파일 임시 복원)에서 실패함을 확인한 뒤 원복 — 3 failed / 236 passed → 구현 후 239 passed.
- **REFACTOR:** Task 3 가 별도 refactor 커밋(동작 변화 없음 · 죽은 코드 삭제).

## Verification

- `vitest --run` limit-chaser.test.ts · use-lc-field-commit.test.tsx · limit-chaser-form.test.tsx — 307 passed
- `playwright test trading-workbench.spec.ts -g "P24-9|P24-5|P24-3"` — 4 passed (setup 포함 · 18.2s)
- `vitest --run src/lib src/components/trading/__tests__/strategy-log.test.tsx` — 45 files · 841 passed · 1 skipped
- 전체: webapp test 125 files · 2687 passed · 1 skipped / relay test 28 files · 651 passed
- 빌드: shared build · relay typecheck · relay typecheck:tests · webapp typecheck(e2e 포함) — error TS 0
- 제품 코드 `buy3Schema` 비교는 `webapp/src/lib/limit-chaser.ts` 한 파일뿐(주석 제외 grep 0)

## Files Created/Modified

- `webapp/src/lib/limit-chaser.ts` — `isLegacyBuySchema` · `isLegacyAmountUnknown` 신설 · `formFromServer` 좁힌 특례 · 더티 블록 삭제 · 머리 주석 정정
- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — 금액 판정 4곳 `isLegacyAmountUnknown` · `GROUP_AMOUNT_FIELD` 에 선매수 · JSDoc
- `webapp/src/components/trading/limit-chaser-form.tsx` — `groupPrechecksOf` 금액 갈래 · 한방가격 0 · 머리 ④ 주석
- `webapp/e2e/specs/trading-workbench.spec.ts` — P24-9
- `webapp/src/components/trading/strategy-log.tsx` — 지운 더티 상수 이름을 규율 예시에서 제거
- `packages/shared/src/relay.ts` — `buyOrderAmount` 0 의미 주석(주석만)
- 테스트 3파일 — 기존 D-04a 픽스처에 `buy3Schema: 0` 명시 · 새 케이스

## Decisions Made

- 레거시 금액 특례의 판정 지점은 lib 두 함수뿐이고 훅 · 폼은 그 결과만 읽는다(판정이 둘이면 한쪽만 고쳐진다).
- buy3 에코의 선매수 금액 0 을 이전 폼 값(기본 4,000만원)으로 메우지 않는다 — 메우면 다음 확정이 사용자가 두지 않은 금액 · 수량을 조용히 싣는다(T-24-45).
- 구서버 에코의 D-04a 동작(금액 행 「—」 · 금액 외 확정 차단 · 끄기 cfg 는 서버 금액 · 수량)은 그대로 둔다 — 읽기 전용화는 24-12 몫.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug(문서 정확성)] 폼 머리 ④ 주석의 금액 0 판정 위치**
- **Found during:** Task 2
- **Issue:** `limit-chaser-form.tsx` 머리 ④ 가 「`buyOrderAmount === 0`(=서버가 모른다) … 판단은 `formFromServer` 한 곳」이라 적어 Task 1 뒤 사실과 달라졌다(폼 IN-01 전체 정리는 24-15 몫이지만 이 줄은 이 플랜이 바꾼 규칙 자체다).
- **Fix:** 「구서버 에코의 선매수 금액 0 · 판단은 lib `isLegacyAmountUnknown`」으로 두 줄만 고쳤다. 나머지 폼 필드 수 주석은 손대지 않았다(24-15).
- **Files modified:** webapp/src/components/trading/limit-chaser-form.tsx
- **Commit:** dec9289c

**2. [Rule 1 - Bug(문서 정확성)] lib `formFromServer` JSDoc 의 「더티 필드도 덮어쓴다」**
- **Found during:** Task 3
- **Issue:** 더티 모델 삭제 뒤 「더티 필드」라는 말이 가리킬 대상이 없어졌다.
- **Fix:** 「사용자가 고치던 필드도 덮어쓴다」로 한 단어 교체(뜻 동일).
- **Files modified:** webapp/src/lib/limit-chaser.ts
- **Commit:** 99ed28af

**3. [Rule 3 - Blocking] 수용 기준 grep 에 걸린 한 줄 JSDoc**
- **Found during:** Task 1 수용 기준 확인
- **Issue:** 훅 반환 타입의 `amountRequired` 한 줄 JSDoc(`/** … buy3Schema 0 … */`)이 「제품 코드 buy3Schema 비교는 lib 한 파일」 grep(주석 줄 판정이 `//` · `*` 시작만 인정)에 1건으로 잡혔다.
- **Fix:** 같은 문장을 여러 줄 JSDoc 으로 나눴다(코드 변화 없음).
- **Files modified:** webapp/src/components/trading/lc/use-lc-field-commit.ts
- **Commit:** c4bcdb5c

**Total deviations:** 3 auto-fixed (주석 정확성 2 · 수용 기준 형식 1). **Impact:** 동작 변화 없음 — 문서가 코드 사실과 맞게 됐다.

## Issues Encountered

- `gsd-tools check tdd-red-evidence` 는 node-test TAP 요약(`# tests N`)을 기대하는데 vitest `tap-flat` 은 요약 줄을 내지 않는다 — 실행된 줄만 추려 요약 줄을 붙여 넣어 `RED_EVIDENCE_OK` 를 받았다(같은 실행 출력 · 판정 형식 맞춤).

## Known Stubs

None.

## Next Phase Readiness

- 24-12(WR-02)가 `isLegacyBuySchema` 를 그대로 재사용해 구서버 에코 읽기 전용화를 얹을 수 있다.
- CONTEXT D-03 · D-04a 재해석(구서버 에코로 좁힘)은 24-16 체크포인트에서 사용자 확인 항목이다.
- 배포 없음 — 커밋만(push · relay · Vercel 배포는 메인 세션 몫). shared 변경은 주석뿐이라 relay 재배포 불필요.

## Self-Check: PASSED

- FOUND: webapp/src/lib/limit-chaser.ts · use-lc-field-commit.ts · limit-chaser-form.tsx · trading-workbench.spec.ts · strategy-log.tsx · packages/shared/src/relay.ts
- FOUND commits: 015bf371 · c4bcdb5c · dec9289c · 99ed28af
- Task 1~3 수용 기준 전부 PASS(위 Verification)
