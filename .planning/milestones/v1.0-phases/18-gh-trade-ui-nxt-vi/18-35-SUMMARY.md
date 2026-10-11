---
phase: 18-gh-trade-ui-nxt-vi
plan: 35
subsystem: webapp-trading-workbench
tags: [gap-closure, round-4, relay-provider, order-lock, workbench, tracer, R3-WR-02, R3-IN-02, R3-IN-03, R3-IN-04]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-34)
    provides: "RelayProvider.orderLocks (앱 수명 잠금) — 이 플랜이 유일한 원천으로 만든다"
  - phase: 18-gh-trade-ui-nxt-vi (18-31)
    provides: "fillAccountCards · GC-IN-05 정리 경로(forgetCardState) — 이 플랜이 cards 파생으로 바꾼다"
provides:
  - "주문 잠금 단일 원천 — 작업대 · 카드 본문 · 수동주문 폼에 18-30 페이지 잠금 배선(상태 · prop · 콜백 · 키 타입) 0"
  - "TradingWorkbench.closeCard 는 RelayProvider.orderLocks 하나로 unknown 판정"
  - "카드 정리(더티 키 · 직전 로그 문장) = 커밋된 cards 의존 효과 한 곳"
  - "isOffhoursOrder 근거 2 범위 주석 · deferred 「18-35 발견」"
affects: [18-36, gsd-verifier -R4]

actuals:
  tokens: 16900
  tasks: 3
  commits: 3
plan_head_before: 15cfaff31ac2e73c8578cdd64a9e9bfd07cbc710

tech-stack:
  added: []
  patterns:
    - "잠금 같은 교차 표면 상태는 원천 하나(Provider)만 두고, 소비처는 읽기만 한다 — prop 경로를 병행하지 않는다"
    - "파생 정리: 여러 제거 경로가 있으면 제거된 id 를 계산하지 말고 커밋된 집합과의 차집합으로 정리한다"

key-files:
  created:
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-35-SUMMARY.md
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/orderbook/order-confirm-dialog.tsx
    - .planning/phases/18-gh-trade-ui-nxt-vi/deferred-items.md

key-decisions:
  - "주문 잠금의 원천은 RelayProvider.orderLocks 하나 — 작업대는 ✕ 판정에만 읽고, 카드 폼 · 호가 탭 폼은 스스로 읽는다(사용자 결정 1 마무리)"
  - "카드 정리는 cards 커밋에서 파생 — removeCard · 계좌 채움은 setCards 만 부른다(R3-IN-03)"
  - "isOffhoursOrder 판정식은 유지(보수적 잠금) — 중립 표기는 서버 주문유형 필드가 필요해 deferred"

requirements-completed: []

duration: 8min
completed: 2026-09-22
---

# Phase 18 Plan 35: 주문 잠금 단일 원천 · 카드 정리 파생 · 가격 0 근거 주석 Summary

18-30 의 페이지 단위 잠금 배선(작업대 키 집합 · 카드 본문/폼 prop · 콜백 · 키 타입)을 전부 걷어냈다. 이제 주문 잠금은 `RelayProvider.orderLocks` 하나뿐이다. 작업대 ✕ 는 그 값을 읽기만 하고, 카드 폼은 같은 컨텍스트를 스스로 읽는다. 계좌 채움의 `cardsRef` 이중 계산은 커밋된 `cards` 에서 파생하는 정리 효과 하나로 바꿨다. `isOffhoursOrder` 근거 주석은 relay 발 주문으로 범위를 좁혔다.

## Performance

- **Duration:** 약 8분
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- **R3-WR-02 마무리:** `grep -rnE "resultUnknownLocked|onResultUnknown|markResultUnknown|resultUnknownKeys|ResultUnknownKey" webapp/src` 결과가 **0** 이다. `orderLocks` 는 trading-workbench 에 4줄, manual-order-form 에 3줄 있고 card-body 에는 **0** 줄이다(본문은 잠금을 모른다).
- **R3-IN-02 작업대 회귀:** 진행 중 키 카드와 결과 모름 키 카드 모두, ✕ 를 누르면 `unknown` 다이얼로그가 뜨고 「카드 닫기」로 닫힌다. 그 뒤 돌파 칩 · 종목 추가 · 미체결 선택 세 경로로 다시 열면 새 id 의 카드가 선다. 새 카드의 본문 props 에는 잠금 키가 없고, `orderLocks` 참조와 내용은 그대로다. 이 과정 전체에서 `send` · `sendOrder` 호출은 0 이다.
- **R3-IN-03:** 정리 코드는 이제 `cards` 의존 효과 한 곳에만 있다. `removeCard` 와 계좌 채움 효과 본문에는 정리 호출이 없다. `cardDirtySum` · `dirtyCardCount` 줄은 diff 0 이다.
- **R3-IN-04:** 주석과 deferred 기록만 바꿨다. 동작 변경은 0 이다.

## Task Commits

1. **Task 1: [tracer] 잠금 단일 원천 — 18-30 배선 제거 + 작업대 회귀 재작성** — `fd6f6ef` (fix)
2. **Task 2: R3-IN-03 — 카드 정리를 커밋된 cards 에서 파생** — `3107a49` (refactor)
3. **Task 3: R3-IN-04 — isOffhoursOrder 근거 주석 · deferred 기록** — `9fa1b14` (docs)

## Tracer 게이트

- 변경 뒤 `playwright test trading-workbench -g "GC5|GC6"` 결과는 **3 passed**(setup · GC5 · GC6)다. 단일 원천으로 옮긴 뒤에도 재추가 카드와 호가 탭 잠금이 유지된다. 대화형 모드이고 `<verify>` 가 모두 자동 검증이라, 통과를 확인하고 확장 태스크로 넘어갔다.
- 변이 확인(되돌림 완료): `closeCard` 의 `orderLocks` 판정을 `if (false)` 로 바꾸면 새 describe 12건 중 **8건이 실패**한다(①②③×2 ⑤ ⑦ ⑦-c ⑦-d). 나머지 4건(④ ⑥ ⑦-b ⑧)은 「잠기지 않았을 때의 동작」과 「본문 props」를 단언하므로 이 변이에 실패하지 않는 것이 맞다.

## 옛 → 새 대응표 (trading-workbench.test.tsx · 옛 GC-WR-03 10건 → 새 R3-WR-02 12건)

| 옛 케이스 (GC-WR-03) | 새 케이스 (R3-WR-02) |
|---|---|
| 잠긴 카드 ✕ → unknown · 취소/카드 닫기 → 돌파 칩 재추가 잠긴 채 · 송신 0 | ① 결과 모름 키 ✕ → unknown · 제목 · 본문 원문 · 취소/카드 닫기 · 송신 0 + ③ 돌파 칩 경로 |
| 종목 추가로 재추가해도 잠긴 채 | ③ 종목 추가 경로(result-unknown · in-flight 각각) |
| 미체결 행 선택으로 재추가해도 잠긴 채 | ③ 미체결 선택 경로(각각) |
| 키 범위 — NXT · 다른 계좌 카드는 잠기지 않는다 | ⑦ 다른 거래소 · 다른 계좌 키 잠금은 이 카드 ✕ 에 영향 없음 |
| 요청의 키를 따른다 — KRX 카드에서 NXT 정정 timeout 이면 NXT 키 | ⑦-b NXT 키만 잠기면 KRX 미등록 카드는 즉시 닫힘 (요청 키 등록 자체는 폼 describe 「정정 timeout → 행의 키(NXT)」로 이관) |
| 접기/펴기 · 계좌 A→B→A 뒤에도 잠금 남음 | ⑦-c 같은 조작 뒤 ✕ 가 여전히 컨텍스트 잠금을 읽음 |
| DMA 게이트가 섰다 걷혀도 잠금이 남는다 | ⑦-d 게이트 왕복 뒤 다시 연 카드의 ✕ 가 컨텍스트 잠금을 읽음 · orderLocks 참조 불변 |
| 잠김 + 등록 전략 → 등록 전략 문장 추가 | ⑤ 동일 |
| 잠기지 않은 등록 전략 → registered 그대로 | ⑥ 동일 |
| 카드 본문 콜백 안정 참조 — 불리언 + 안정 콜백 (prop 전용 단언) | ⑧ 본문 props 에 잠금 키 · Map · 배열이 없고 잠금 유무와 무관하게 props 키 집합이 같음 · 송신 0 |
| (신규) | ② 진행 중(in-flight) 키 ✕ → 같은 unknown (R3-IN-02) · ④ 잠기지 않은 미등록 카드 즉시 제거 · ③ in-flight 변형 |

## manual-order-form.test.tsx — 제어형 prop describe 삭제 (7건) → 성질 이관

| 옛 케이스 | 처리 |
|---|---|
| prop 잠금 → 4버튼 · 문구(role=status) · 전송 0 | 이미 있음: 「컨텍스트 result-unknown → …」 + 「variant=orderbook … role=status」 |
| 신규 timeout → 요청 키로 1회 · 배너와 문구 비중복 | 이미 있음: 「신규 timeout 은 배너가 있으면 잠금 문구를 겹쳐 보이지 않는다」(KEY 등록 단언) |
| 정정 timeout → 행의 키(NXT) | **추가:** 「정정 timeout → 원주문 행의 키(NXT)가 잠긴다」 |
| 취소 timeout → 콜백 0 · 배너만 | **이관:** 「취소 timeout → 잠금 등록 0 · 배너만 · 버튼 잠기지 않음」 |
| 접수 · 거부는 콜백 없음 | **추가:** 「접수 · 거부는 잠금을 등록하지 않는다」 |
| 상위 잠금은 종목 전환으로 풀리지 않는다 (prop 전용) | 대체: 아래 컨텍스트 종목 전환 케이스 |
| 컨텍스트 키 잠금(호가 탭) 종목 전환 | **이동:** 그대로 Provider describe 로 |

폼 파일은 60건에서 57건이 됐다.

## R3-IN-03 — RED 없음 (관찰 결과가 없는 정합성 결함)

18-REVIEW-R3 의 판정대로 합산은 `cards` 를 순회한다. 그래서 사라진 id 의 더티 키가 남아도 사용자가 볼 수 있는 결과는 없다. `<behavior>` 3건(같은 렌더의 계좌 + 등록 전략 유입 · 치운 더티 2 카드 · 치운 카드의 로그 문장)은 불변식 회귀를 고정하는 테스트다. **수정 전 코드에서 `vitest run trading-workbench shared-panels` 결과는 93 passed** 였고, 수정 뒤에도 **93 passed** 다. 기존 `fillAccountCards` · GC-IN-05 · GC-IN-01 · 카드 제거 describe 는 고치지 않았고 모두 통과한다.

diff 발췌(`trading-workbench.tsx`):

```diff
-  const forgetCardState = useCallback((ids: readonly string[]) => { … }, []);
-  const removeCard = useCallback(
-    (id: string) => {
-      setCards((prev) => prev.filter((c) => c.id !== id));
-      forgetCardState([id]);
-    },
-    [forgetCardState],
-  );
+  useEffect(() => {
+    const live = new Set(cards.map((c) => c.id));
+    setCardDirty((prev) => { …사라진 id 만 삭제 · 없으면 prev… });
+    for (const id of [...lastLogText.current.keys()]) {
+      if (!live.has(id)) lastLogText.current.delete(id);
+    }
+  }, [cards]);
+  const removeCard = useCallback((id: string) => {
+    setCards((prev) => prev.filter((c) => c.id !== id));
+  }, []);
…
   useEffect(() => {
     if (accountNo === "") return;
-    forgetCardState(fillAccountCards(cardsRef.current, accountNo).dropped);
     setCards((prev) => fillAccountCards(prev, accountNo).next);
-  }, [accountNo, forgetCardState]);
+  }, [accountNo]);
```

`grep -c "fillAccountCards(cardsRef.current" trading-workbench.tsx` 결과는 0 이다. `fillAccountCards` 의 `dropped` 반환은 남겨 두었다. 이제 이 값을 쓰는 곳은 순수 함수 테스트뿐이며, 함수 주석에 그렇게 적었다.

## 검증 결과

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`: 클린(tsc + e2e tsconfig)
- `vitest run trading-workbench manual-order-form card-body stock-orderbook-section strategy-card-flow`: 5 files · **184 passed**(Task 1 시점)
- `vitest run trading-workbench shared-panels`: **93 passed**(Task 2, 수정 전과 후 모두)
- `vitest run order-confirm-dialog manual-order-form account-panel`: 3 files · **134 passed**(Task 3)
- webapp 전체: **92 files · 1472 passed · 1 skipped**(직전 1470 대비 +2: 작업대 +5, 폼 −3)
- `playwright test trading-workbench -g "GC5|GC6"`: **3 passed**
- eslint(변경 파일 5개): 경고 0
- 게이트 grep: 18-30 이름 0 · `다른 단말` 1 · `18-35 발견` 1 · numstat 기준 order-confirm-dialog 는 8 추가 / 0 삭제(모두 주석), deferred-items 는 9 추가 / 0 삭제

## Decisions Made

- 작업대 describe 의 하네스는 `mockRelay = { ...mockRelay, orderLocks }` 로 바꾼 뒤 다시 렌더하는 방식이다. 같은 `send` · `sendOrder` 스파이를 계속 쓰므로 송신 0 단언이 전 과정을 덮는다.
- 폼 쪽 정정 요청 키 단언은 모의 Provider 등록을 거친다. 폼이 원주문 행의 거래소로 요청을 만든다는 사실을 잠그는 테스트다. 진짜 등록 규칙은 `relay-provider.test.tsx` ⑩ 계열이 잠근다.
- `order-confirm-dialog.tsx` 주석에는 「정정만 막고 취소는 연다」를 덧붙였다. 기존 테스트 「board 빈 값 · price 0 행 → 정정 disabled · 취소 활성」 과 같은 사실이다.

## Deviations from Plan

None - plan executed exactly as written.

Task 2 는 테스트와 구현을 한 커밋(`refactor`)으로 묶었다. 계획이 RED 를 기대하지 않는다고 명시했기 때문에 따로 `test` 커밋을 만들지 않았다.

## Issues Encountered

- `requirements.mark-complete` 는 호출하지 않았다. 저장소 관례에 따라 TRADE-07 · TRADE-09 는 갭 클로징 동안 Pending 으로 둔다(`requirements-completed: []`).
- webapp 전체 실행 로그에 `at startTests` 스택이 보인다. 기존 테스트가 의도한 에러 경로에서 stderr 로 찍는 출력이며, 실패한 테스트는 0 건이다.

## Threat Flags

없다. 새 네트워크 · 저장소 · 송신 표면이 없다. T-18-144 는 grep 0 · 단일 판정 · e2e GC5/GC6 로 완화했다. T-18-145 는 계산식 diff 0 과 불변식 회귀 3건으로 완화했다. T-18-146 은 주석과 deferred 기록으로 accept 했다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/workbench/trading-workbench.tsx · card-body.tsx · manual-order-form.tsx · order-confirm-dialog.tsx · deferred-items.md
- FOUND commits: fd6f6ef · 3107a49 · 9fa1b14
