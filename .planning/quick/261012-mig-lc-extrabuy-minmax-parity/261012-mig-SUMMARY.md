---
phase: quick-261012-mig
plan: 01
status: complete
completed: 2026-10-12
commits:
  - 708c4772
  - ef9e5173
key_files:
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - docs/inbox/from-gh-trade/261012-phase32-review-fix-wr06-in07.md
---

# Quick 261012-mig — 상따 줄매수 「최소 > 최대」·「최대 0주」 C# 동형 정렬 Summary

gh-trade 인박스 `261012-phase32-review-fix-wr06-in07` (서버 WR-06 f6e176e5 · C# e4a66ae2) 처리.

## 바뀐 것

- `extraBuyMinOverMax` — 금액 비교를 버리고 **제출 주끼리**(`maxQty ≠ 0 ∧ minQty > maxQty`)만 본다. `groupPrechecksOf` 의 `extraBuyMaxAmount !== 0` 가드는 함수 안으로 들어갔다.
- `armBlockOf` 5 행 「줄매수 최대 0주」 조건 `extraBuyEnabled` → `extraBuyEnabled ∨ extraBuyAuto`. 바로 뒤 5b 행 「최소 > 최대」를 같은 조건으로 추가했다(C# 같은 if · 순서 addMaxFloored → 최소 > 최대). 문장은 C# 모달 원문 `ARM_BLOCKED_TEXT.extraBuyMinOverMax`.
- 결과: ☐줄매수 OFF · ☐자동 ON 의 최소 > 최대 등록이 전송 직전에 막힌다(서버라면 54 ERROR + 줄매수 · 자동 OFF). 금액은 최소 > 최대여도 같은 주로 내림되면 이제 통과한다(C# · 서버와 같음).

## 검증

- 새 테스트 (c3) ☐자동 켜기 차단 · (c4) ☐자동만 켜진 에코에서 무관한 칸 확정 차단 · (c5) 같은 주 내림 통과 — 수정 전 코드에서 3건 모두 실패 확인.
- webapp typecheck(tsc + e2e tsconfig) 통과. `vitest --maxWorkers=2`: `limit-chaser-form` · `card-body` · `strategy-card-flow` · `lc/__tests__` 11파일 853/853 통과.
- e2e · 전체 회귀는 돌리지 않았다.

## Deviations

- planner/executor 없이 인라인 실행(작은 조정 · 사용자 지정 범위 상한).

## 코드 리뷰 (quick depth · `261012-mig-REVIEW.md`)

C# f6e176e5 · e4a66ae2 와 판정 · 순서 · 문장 일치. BLOCKER 0 · WARNING 2 · INFO 4.

- 반영(ef9e5173): WR-01 ☐자동만 켠 「최대 0주」 차단 테스트(확장 되돌리면 실패 확인) · WR-02 같은 에코에서 ☐자동 끄기 · 최대 0 확정이 나가는지 고정 · IN-01 `armBlockOf` 「끄는 방향」 주석 정정 · IN-04 테스트 (c) 제목 정정.
- 그대로 둠: IN-02(구서버 · 비교가 0 에서 「최대를 0 으로」 안내가 풀이가 아님 — C# 동형) · IN-03(사전 검증은 웹 어조 `LC_COMMIT_TEXT.minOverMax`, 전송 직전은 C# 원문 — 기존 UI-SPEC 문장 체계).
- 대상 파일 289/289 통과 · typecheck 통과.
