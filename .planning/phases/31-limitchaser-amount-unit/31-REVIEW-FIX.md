---
phase: 31-limitchaser-amount-unit
fixed_at: 2026-10-12T00:00:00Z
review_path: .planning/phases/31-limitchaser-amount-unit/31-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-10-12
**Source review:** .planning/phases/31-limitchaser-amount-unit/31-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01 · WR-02 — fix_scope critical_warning, Info 5건 제외)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: 구 탭 `lc.set`(금액 8필드 부재)을 relay가 금액 0으로 조립해 서버에 저장된 C# 만원 원값을 지운다

**Files modified:** `relay/src/ws/fanout.ts`, `relay/src/ws/protocol.ts`, `relay/tests/fanout.test.ts`
**Commit:** d023526f
**Applied fix:**
- `fanout.ts`에 `#withEchoAmounts(userId, cfg)`를 추가했다. `lc.set` 분기에서 buy3 판정·중립값 채움 바로 뒤에 부른다.
  - 금액 키가 **없는** 쌍만 채운다. 그 키의 최신 에코는 `getLimitChasers`에서 `strategyKey()`로 대조한다.
  - 보낼 주가 에코 주와 같으면(`echo[p.qty] === cfg[p.qty]`) 에코 금액 원값을 싣고, 아니면 0을 싣는다.
  - 새 탭이 실은 값은 0이어도 덮지 않는다.
- 리뷰 스니펫의 isin·account·exchange 3필드 비교는 쓰지 않았다. 기존 `#teardownMarket`의 키 대조 규율(`strategyKey()` 한 곳)을 따랐다.
- `LC_AMOUNT_PAIRS`와 `LcAmountKey`는 shared에서 가져온다.
- `protocol.ts`의 금액 8필드 zod 주석을 「부재 = 에코 원값(짝 일치) 또는 0」으로 고쳤다.
- relay 테스트 2건을 추가했다.
  - 구 탭 cfg(금액 없음)에서 짝이 맞는 칸은 buyWatch 100주가 원값 300으로 되실린다. 주가 바뀐 칸(sellWatch 777→800)은 0이다.
  - 새 탭이 명시한 0은 캐시 에코 1000이 있어도 0 그대로 간다.
- 기존 「캐시 없는 구 탭 → 0」 테스트는 그대로 통과한다. 수정 전 코드에서는 새 테스트 1건이 실패하는 것을 확인했다.

### WR-02: 두 줄 행 아래 줄 · 시트 환산 안내가 비교가 0 갈래에서 에코 메모를 무시한다 — 제출 주와 다른 글자를 보인다

**Files modified:** `webapp/src/components/trading/lc/lc-fields.ts`, `webapp/src/components/trading/lc/__tests__/lc-fields.test.ts`
**Commit:** 694d1f06
**Applied fix:**
- `lcQtyRowSubOf`는 제출 주(`submitQtyOf` → `qtyForSubmit`, 에코 메모 포함)를 먼저 계산한다. 「비교가격 필요」는 금액 > 0 ∧ 비교가 0 ∧ 제출 주 0일 때만 보인다.
- `lcAmountHintOf`는 비교가 0이어도 제출 주 > 0이거나 값이 0이면 「= {주}주」를 보인다. 값 > 0 ∧ 제출 주 0이면 `null`이다(잠금 자리).
- C# `SetQtyAmountTip`(LimitChaserForm.cs 5790~5806, feature/limitchaser-amount-unit)의 원문과 대조했다. 갈래 순서와 문구가 같다.
- 두 함수의 JSDoc을 함께 고쳤다.
- 단위 테스트 3건을 추가했다. 수정 전 코드에서는 앞의 2건이 실패하는 것을 확인했다.
  - 구 서버 에코(금액 0 · 주 500 · 가격 0): 행은 「500주」, 시트는 「= 500주」를 보인다.
  - 짝 원값 에코(가격 0 · 1000만 · 777주): 행은 「777주」, 시트는 「= 777주」를 보인다.
  - 가격 0에서 에코와 다른 금액(1500만): 행은 「비교가격 필요」(alert)를 보이고 시트 안내는 `null`이다.
- 사람 확인 필요: 이 수정은 로직 변경이다(fixed: requires human verification).
  - 시트 확정 잠금 `amountLockTextOf`(limit-chaser-form.tsx)는 바꾸지 않았다. 그래서 값 > 0 ∧ 비교가 0이면 에코 보존 중이어도 잠금 문구가 선다.
  - C# 등록 차단(5163~5196)도 값 기준이라 동형이다. 시트 상태 줄은 잠금이 안내보다 우선이라 한 시트에 두 문구가 같이 보이지 않는다.

## Verification

검증은 모두 **격리 worktree**(`.claude/worktrees/rf-31-*`)에서 돌렸다. 정리 단계에서 그 worktree를 지우므로, 아래 수치는 main checkout에서 그대로 재현되지 않는다. worktree 안에서는 `pnpm install --offline --frozen-lockfile`(relay·webapp·shared 필터)와 shared build를 한 뒤 실행했다. vitest는 모두 `--maxWorkers=2`로 돌렸다.

- relay
  - `typecheck`와 `typecheck:tests` 모두 통과했다.
  - `tests/fanout.test.ts`, `tests/protocol.test.ts`, `tests/ws-autosell.test.ts`는 183/183 통과했다.
- webapp
  - `typecheck`(tsc + e2e tsconfig)를 통과했다.
  - `limit-chaser-form`, `card-body`, `lc/__tests__` 전체, `lib/limit-chaser`는 11파일 891/891 통과했다.
- e2e·playwright와 전체 회귀는 돌리지 않았다(지시 범위 밖).

---

_Fixed: 2026-10-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
