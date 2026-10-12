---
phase: quick-261012-mig
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - docs/inbox/from-gh-trade/261012-phase32-review-fix-wr06-in07.md
autonomous: true
---

# Quick 261012-mig — 상따 줄매수 「최소 > 최대」·「최대 0주」 검사를 C# 동형으로 정렬

## 근거

gh-trade 인박스 `261012-phase32-review-fix-wr06-in07.md` (서버 WR-06 · f6e176e5) 와 C# `LimitChaserForm.cs` e4a66ae2:

- `addBuyLive = ☐줄매수 ∨ 줄매수 ☐자동` — 「최대 0주」(addMaxFloored)와 「최소 > 최대」를 **등록마다** 이 조건으로 본다.
- 「최소 > 최대」는 **제출 주끼리**(`addBuyMaxQtyRaw ≠ 0 ∧ addBuyMinQtyRaw > addBuyMaxQtyRaw`) — 만원 비교 폐기.
- 서버는 이제 ☐자동만 켠 최소 > 최대 등록에 54 ERROR + 줄매수·자동 둘 다 OFF.

웹 현황: 「최소 > 최대」는 ☐줄매수 켜는 순간 사전 검증에만 있고(금액 ∨ 제출 주), 전송 직전 `armBlockOf` 5 행은 `extraBuyEnabled` 만 본다.

## Task 1 — `limit-chaser-form.tsx`

1. `extraBuyMinOverMax` → 제출 주끼리만: `maxQty ≠ 0 ∧ minQty > maxQty`. `groupPrechecksOf` 의 `extraBuyMaxAmount !== 0` 가드는 함수 안으로 흡수.
2. `armBlockOf` 5 행 조건 `extraBuyEnabled` → `extraBuyEnabled ∨ extraBuyAuto`. 바로 뒤 5b 행: 같은 조건 ∧ `extraBuyMinOverMax` → `ARM_BLOCKED_TEXT.extraBuyMinOverMax`(C# 모달 원문).
3. 머리 주석 표 · 함수 주석 갱신.

## Task 2 — 테스트 (`limit-chaser-form.test.tsx` P31 묶음)

- ☐줄매수 OFF · ☐자동 ON 에코 · 최소 > 최대(주) → 아무 칸 확정 = 전송 0 · 5b 문장.
- ☐자동 켜기 체크 · 최소 > 최대 → 전송 0.
- 금액은 최소 > 최대지만 같은 주로 내림 → 줄매수 켜기 통과(전송 1).
- 기존 (c) · (c2) 유지.

## Task 3 — 인박스 노트 `status: done` · `done_commit`

## 검증

`vitest --maxWorkers=2` 로 `limit-chaser-form.test.tsx` · `card-body.test.tsx` · `lc/__tests__` · webapp typecheck.
