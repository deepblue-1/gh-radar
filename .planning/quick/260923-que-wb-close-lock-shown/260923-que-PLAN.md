---
phase: quick-260923-que
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
autonomous: true
requirements: [QUE-A]

estimate:
  tokens: 25000
  raw_tokens: 25000
  tasks: 1
  confidence: high

must_haves:
  truths:
    - "카드 ✕ 「결과 모름」 판정(`lockedExchangesOf`)은 그 카드의 계좌·ISIN 에 대해 KRX·NXT 두 키를 보되, **다른 카드(id 가 다른 카드)가 지금 그 키를 보여주고 있으면 그 거래소는 제외**한다 — 잠긴 주문이 시야에서 사라지지 않으니 물을 것이 없다 (QUE-A)"
    - "카드 자신의 현재 키 잠금은 언제나 포함된다(같은 키를 두 카드가 동시에 볼 수 없으므로 제외 규칙에 걸리지 않는다) (QUE-A)"
    - "제외 뒤 잠긴 거래소가 0이면 기존 순서대로 등록 전략 여부(`registered`) → 즉시 제거로 흐른다. 잠금 자체(`relay.orderLocks`, 앱 수명)는 변경 0 (QUE-A)"
    - "기존 테스트 ⑦ 의 첫 단언(KRX 카드 ✕ → 「잠긴 거래소: NXT」)은 새 규칙으로 갱신된다: NXT 카드가 옆에 있으므로 KRX 카드 ✕ 는 unknown 이 아니라 `registered` 다이얼로그 · NXT 카드 ✕ 는 여전히 unknown 「NXT」. ⑦-b(NXT 카드 없음 → 경고) · ⑦-e · ⑦-f 는 그대로 초록 (QUE-A)"
    - "게이트: `pnpm --filter @gh-radar/webapp run typecheck` 0 · `pnpm --filter @gh-radar/webapp run test` 전량 초록 · `cd webapp && pnpm exec playwright test trading-workbench` 0 fail (QUE-A)"
  artifacts:
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "`lockedExchangesOf(locks, card, cards)` — 다른 카드가 보여주는 키 제외 · ⑧ 주석 갱신"
      contains: "quick-260923-que"
    - path: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx"
      provides: "⑦ 갱신 + 신규 ⑦-g(다른 카드가 그 키를 보여주면 제외 · 그 카드를 닫은 뒤에는 다시 경고)"
      contains: "quick-260923-que"
  key_links:
    - from: "workbench `closeCard`"
      to: "`lockedExchangesOf(orderLocksRef.current, card, cardsRef.current)`"
      via: "카드 배열(`cardsRef`)을 세 번째 인자로 — 다른 카드의 `keyOf` 와 대조"
---

<objective>
✕ 「결과 모름」 경고의 과잉 1건 제거(quick-260923-pgv 가 두 거래소 키로 넓힌 판정의 부작용). 같은 종목·계좌의 다른 카드가 그 거래소 키를 이미 보여주고 있으면, 이 카드를 닫아도 잠긴 주문이 시야에서 사라지지 않으므로 그 거래소는 경고에서 뺀다.

사용자 결정(2026-09-23): 「규칙을 넣어줘」.
</objective>

<context>
- 현재 코드: `trading-workbench.tsx` 의 `lockedExchangesOf(locks, c)` 는 `EXCHANGES.filter(ex => locks.has(strategyKey(c.isin, c.accountNo, ex)))`. 호출은 `closeCard` 한 곳(`cardsRef.current` 가 같은 스코프에 있다).
- 카드 키는 유일하다(`withCardOpen`·`changeExchange` 충돌 규칙 · T-18-94) — 같은 키를 두 카드가 동시에 볼 수 없다.
- 테스트 파일 `trading-workbench.test.tsx` 의 describe 「✕ 결과 모름」 계열 ⑦ · ⑦-b · ⑦-e · ⑦-f(위치는 `⑦` grep). ⑦ 은 KRX·NXT·다른 계좌 카드 3장에 NXT 잠금을 걸고 첫 카드(KRX) ✕ 가 「NXT」 경고를 내는 것을 단언한다 — 이것이 바로 이번에 바꾸는 동작이다.
</context>

<tasks>

<task id="1" type="tdd">
<title>✕ 판정에서 다른 카드가 보여주는 잠긴 거래소 제외</title>
<files>
webapp/src/components/trading/workbench/trading-workbench.tsx
webapp/src/components/trading/__tests__/trading-workbench.test.tsx
</files>
<action>
RED 먼저:
1. ⑦ 을 새 계약으로 고친다(제목에 `quick-260923-que` 추가). 첫 카드(KRX, 등록 전략 있음) ✕ → `data-reason` 이 `registered`(unknown 아님) 이고 `closeLockedExchangesLine(['NXT'])` 문구가 **없다**. 두 번째 카드(NXT) ✕ 는 그대로 unknown 「NXT」. 나머지 단언(카드 3장 유지 · `lockPropsOf` 빈 배열)은 유지.
2. 신규 ⑦-g `(quick-260923-que)`: 미등록 KRX 카드 + 같은 종목 NXT 카드(거래소 토글 또는 두 번째 추가로 만든다 — 파일의 기존 헬퍼 `addBtn`·`'삼성전자 NXT'` 버튼 활용) · NXT 키 잠금. (a) KRX 카드 ✕ → 다이얼로그 없이 즉시 닫힘(카드 1장 남음, `sendCalls()` 0). (b) 이어서 남은 NXT 카드 ✕ → unknown 「NXT」(자기 키). 추가로 (c) 반대 순서: NXT 카드를 먼저 닫아(다이얼로그 확인) 없앤 뒤 KRX 카드 ✕ → 이제 「잠긴 거래소: NXT」 경고(보여주는 카드가 없어졌으므로). (c) 는 별도 it 로 나눠도 된다.
3. `pnpm --filter @gh-radar/webapp test src/components/trading/__tests__/trading-workbench.test.tsx` 로 ⑦·⑦-g 가 빨간 것을 확인한다.

GREEN:
4. `lockedExchangesOf(locks, c, cards: readonly WorkbenchCard[])` 로 바꾼다: 거래소 `ex` 마다 `key = strategyKey(c.isin, c.accountNo, ex)`; `locks.has(key)` 이고 **`cards.some(o => o.id !== c.id && keyOf(o) === key)` 가 거짓**일 때만 포함. `closeCard` 호출부에 `cardsRef.current` 를 넘긴다. ⑧ 주석에 규칙과 이유(「다른 카드가 보여주는 잠금은 시야에서 사라지지 않는다 · quick-260923-que」) 한 줄.
5. 같은 테스트 파일 전체 초록 확인.

게이트:
6. `pnpm --filter @gh-radar/webapp run typecheck` · `pnpm --filter @gh-radar/webapp run test` · `cd webapp && pnpm exec playwright test trading-workbench`.
7. 커밋 1건: `fix(quick-260923-que): ✕ 결과 모름 경고 — 같은 종목·계좌의 다른 카드가 보여주는 거래소 키는 제외` (코드 2파일만 경로 지정 stage · .planning 제외 · push 없음 · Co-Authored-By 없음).
</action>
<verify>
<automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp test src/components/trading/__tests__/trading-workbench.test.tsx && grep -n "quick-260923-que" webapp/src/components/trading/workbench/trading-workbench.tsx webapp/src/components/trading/__tests__/trading-workbench.test.tsx</automated>
</verify>
<done>
`lockedExchangesOf` 가 카드 배열을 받아 다른 카드가 보여주는 키를 제외한다 · ⑦ 갱신 · ⑦-g 신규(제외 · 자기 키 유지 · 보여주던 카드가 사라지면 다시 경고) · typecheck 0 · webapp 전량 초록 · Playwright trading-workbench 0 fail · 커밋 1건.
</done>
</task>

</tasks>

<verification>
- `relay.orderLocks` 변경 0 (`git diff --stat` 에 relay-provider.tsx 없음).
- e2e spec 무수정(기존 GC 케이스로 회귀만 확인).
</verification>

<success_criteria>
must_haves.truths 5줄 전부 참. SUMMARY(`260923-que-SUMMARY.md`, `status: complete`, 한국어)에 게이트 수치 원문과 ⑦ 계약 갱신을 기록.
</success_criteria>
