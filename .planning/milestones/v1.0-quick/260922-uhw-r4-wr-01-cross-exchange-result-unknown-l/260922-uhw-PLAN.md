---
phase: quick-260922-uhw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md
autonomous: true
requirements: [R4-WR-01]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "종목상세 호가 탭(상태줄 KRX)에서 같은 종목 · 같은 계좌의 NXT 미체결 원주문을 정정하다 timeout 이 나면, 결과 모름 배너가 뜬 채 매수 · 매도 · 정정 · 취소 4버튼이 전부 비활성이고 같은 원주문을 곧바로 다시 정정할 수 없다 (R4-WR-01)"
    - "그 뒤 선택이 풀려도(칩 ✕ · 원주문이 미체결에서 사라짐) 같은 폼의 매수 · 매도는 잠긴 채다 — 잠금은 여전히 RelayProvider 규칙(로그아웃 · 새로고침)에서만 풀린다 (R4-WR-01)"
    - "다른 표면이 잠근 키의 원주문 행을 선택하면 폼이 잠기고 3-b 잠금 문구(RESULT_UNKNOWN_LOCKED_TEXT)가 선다. 아무 행도 선택하지 않았고 이 폼이 그 키로 보낸 적도 없으면, 18-34 규칙대로 다른 거래소 · 다른 계좌 · 다른 종목의 잠금은 이 폼을 잠그지 않는다"
    - "잠금의 원천은 RelayProvider.orderLocks 하나다. 폼에는 로컬 잠금 불리언이 없고, 폼은 어느 키를 읽을지만 안다. 취소는 여전히 잠금을 등록하지 않고, 폼이 읽을 키로도 기억되지 않는다"
    - "여러 키가 잠겨 있으면 결과 모름이 진행 중보다 우선한다. 잠금 문구가 뜨고, 이 폼이 보내는 중이 아니면 「주문 전송 중…」 은 뜨지 않는다"
    - "작업대 카드 동작 · relay · RelayProvider · 작업대 ✕ 다이얼로그 · 호가 탭 미체결 필터(stock-orderbook-section)는 바뀌지 않는다"
  artifacts:
    - path: "webapp/src/components/trading/card/manual-order-form.tsx"
      provides: "폼 잠금 = 폼 키 ∪ 선택 원주문 행 키 ∪ 이 폼이 보낸 신규 · 정정 요청 키(같은 종목 · 계좌) · 우선순위 판정 순수 함수"
      exports: ["formOrderLockOf"]
    - path: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx"
      provides: "교차 거래소 정정 timeout 버튼 잠금 · 선택 해제 뒤 유지 · 선택 행 키 잠금 · 우선순위 · 취소 비기억 회귀"
  key_links:
    - from: "webapp/src/components/trading/card/manual-order-form.tsx"
      to: "webapp/src/lib/relay-provider.tsx"
      via: "useRelayContext().orderLocks 를 formOrderLockOf 로 세 키에 대해 조회"
      pattern: "formOrderLockOf\\(orderLocks"
    - from: "webapp/src/components/trading/card/manual-order-form.tsx"
      to: "webapp/src/lib/limit-chaser.ts"
      via: "strategyKey(selected.isin, accountNo, selected.exchange) — 정정 요청이 Provider 에 등록하는 바로 그 키"
      pattern: "strategyKey\\(selected\\.isin, accountNo, selected\\.exchange\\)"
---

<objective>
R4-WR-01 을 닫는다(18-REVIEW-R4 · 18-VERIFICATION-R4 advisory · 18-UAT-R4 #11). 이 회귀는 18-34 가 만들었다.

결함: 18-34 가 폼의 로컬 잠금을 지우고 잠금 판정을 `orderLocks.get(strategyKey(isin, accountNo, exchange))` 하나로 줄였다. 이 식은 **폼 자신의** 거래소 키만 읽는다(`manual-order-form.tsx:306-307`). 그런데 정정 요청은 **선택 행의** 거래소로 나가고(`:473` `exchange: selected.exchange`), Provider 도 **요청의** 키로 잠근다(`relay-provider.tsx:422`). 호가 탭은 미체결을 ISIN 으로만 거른다(`stock-orderbook-section.tsx:157` · `:170`). 그래서 KRX 보기 폼이 NXT 원주문을 선택할 수 있다. 이 경로에서 정정이 timeout 나면 폼은 「결과 모름」 배너를 띄운 채 4버튼을 다시 연다. 사용자는 같은 원주문을 곧바로 다시 정정할 수 있다.

수정 원칙: **폼은 자기 요청이 Provider 에 등록하는(또는 이미 등록한) 키를 전부 읽는다.** 잠금은 세 키 중 하나라도 잠겨 있으면 성립한다.
- (a) 폼 키: 이 폼이 신규를 보내면 등록될 키
- (b) 선택 행 키: 지금 정정을 보내면 등록될 키
- (c) 이 폼이 실제로 보낸 마지막 신규 · 정정 요청의 키. 폼의 현재 종목 · 계좌와 같을 때만 읽는다.

잠금의 단일 원천은 `RelayProvider.orderLocks` 그대로다(18-35 결정: prop 배선 없음 · 폼 로컬 잠금 불리언 없음). 이 수정은 **교차 거래소 방향으로만 넓힌다.** 18-34 의 「같은 계좌 · 종목 · 거래소」 must_haves 는 그대로 성립한다. TRADE-07 수동주문 오조작 방지 규율(파일 헤더 ②-4 「결과 모름이면 버튼을 다시 열지 않는다」)을 호가 탭에서 다시 성립시키는 작업이다.

Purpose: 결과를 모르는 정정 뒤에 같은 원주문으로 재전송하는 경로(R3-WR-02 가 막으려던 범주)를 코드와 회귀 테스트로 닫는다.
Output: `manual-order-form.tsx`(합집합 잠금 + `formOrderLockOf`) · `manual-order-form.test.tsx`(RED→GREEN 회귀 5건) · `18-VALIDATION.md` §Gap Closure R4 종결 기록 1단락(append-only).

**하지 않는 것:**
- 리뷰어 대안 2(호가 탭 미체결을 거래소로도 거르기)는 하지 않는다. 호가 탭 UX 가 바뀌고, 이번 수정으로 불필요하다.
- relay · `RelayProvider` · 작업대 ✕ 다이얼로그 · `stock-orderbook-section.tsx` · `card-body.tsx` · `trading-workbench.tsx` 는 건드리지 않는다.
- 취소 의미는 바꾸지 않는다. 취소는 잠그지 않는다.
- 새 e2e 는 추가하지 않는다. 근거: e2e specs 어디에도 「미체결 행 선택 → 정정」 경로가 없다(`grep -c "정정 주문" webapp/e2e/specs/*.ts` = 0). 스텁 게이트웨이의 정정 경로도 검증된 적이 없다. 그래서 싸게 붙일 수 없다. 단위 회귀와 기존 Playwright 회귀(orderbook 7 · GC5 · GC6)로 충분하다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/18-gh-trade-ui-nxt-vi/18-REVIEW-R4.md
@.planning/phases/18-gh-trade-ui-nxt-vi/18-34-SUMMARY.md
@webapp/src/components/trading/card/manual-order-form.tsx
@webapp/src/components/trading/__tests__/manual-order-form.test.tsx

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 필요한 계약을 여기 적는다. -->

webapp/src/lib/relay-provider.tsx (변경 금지):
- `export type OrderLockKind = "in-flight" | "result-unknown";`
- `useRelayContext()` → `{ sendOrder, orderLocks: ReadonlyMap<string, OrderLockKind>, ... }`
- `sendOrder(req)` 는 `req.kind === "cancel"` 이면 잠금을 등록하지 않는다. 신규 · 정정이면 `strategyKey(req.isin, req.accountNo, req.exchange)` 를 동기로 start(in-flight) 한다. 결과가 오면 **결과를 돌려주기 전에** settle 한다(timeout 이면 result-unknown). 호출자가 `await` 한 뒤의 렌더는 이미 새 잠금을 본다.
- `RelayOrderRequest` 는 kind 별 union 이다. 모든 variant 에 `isin` · `accountNo` · `exchange` 가 있다.

webapp/src/lib/limit-chaser.ts:
- `export function strategyKey(isin: string, accountNo: string, exchange: RelayExchange): string` → `${isin.slice(0,12)}:${accountNo.slice(0,12)}:${exchange}`

manual-order-form.tsx 현재 구조(줄 번호는 HEAD 4bd7f16 기준):
- `:301` `const { sendOrder, orderLocks } = useRelayContext();`
- `:306-307` `const lock = accountNo.length > 0 ? orderLocks.get(strategyKey(isin, accountNo, exchange)) : undefined;` — **`selected`(`:319-322`)보다 앞에 있다.** 재배치가 필요하다.
- `:329-336` isin 변경 효과: 가격 · 수량 · result · confirm · validation · pendingReqRef 를 리셋한다(잠금은 풀지 않는다).
- `:396-400` `locked = lock !== undefined` · `sending = submitting || lock === 'in-flight'` · `busy = submitting || locked`
- `:549-599` `handleConfirmed`: `:579-582` 에서 최종 `req` 를 만든다. `:583` `setSubmitting(true)` · `:587` `await sendOrder(req)` · `:588-591` timeout 이면 `setResult({ kind: 'unknown' })`.
- `:828` 잠금 문구 조건: `lock === 'result-unknown' && result?.kind !== 'unknown'`

manual-order-form.test.tsx 하니스:
- `lockMock.locks` 는 모의 Provider 의 `orderLocks` 다. `beforeEach` 가 null 로 되돌린다. 모의 `providerSend` 는 신규 · 정정이 timeout 이면 요청 키를 `'result-unknown'` 으로 넣는다(취소는 넣지 않는다).
- 헬퍼: `baseProps(over)`(기본 KRX · 계좌 `12345678-01` · ISIN `KR7042700005` · variant card) · `renderForm(over)` → `{ rerender, ... }` · `unf(over)`(기본 `exchange: 'NXT'` · `orderNo: '3407000064'` · `unfilledQty: 40`) · `btn(name)` · `qtyInput()` · `fill(user, price, qty)`
- describe 「잠금 원천 = RelayProvider (R3-WR-02 · R3-IN-01 · R3-IN-02)」(`:862`~) 안에서 쓰는 것: `KEY` · `lockWith(entries)` · `allButtons()` · `TIMEOUT()`. 확장 대상 케이스는 `:944-957` 「정정 timeout → 원주문 **행의** 키(NXT)가 잠긴다 — 폼 키(KRX)가 아니다」 이다.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: [tracer] 교차 거래소 정정 timeout → Provider 잠금(NXT) → 폼 합집합 판정 → 4버튼 잠김 (RED 먼저)</name>
  <files>webapp/src/components/trading/__tests__/manual-order-form.test.tsx, webapp/src/components/trading/card/manual-order-form.tsx</files>
  <behavior>
    - A(기존 `:944-957` 확장). 폼 KRX · 선택 행 NXT(`unf()`)에서 정정 timeout. 기존 단언(잠금 맵 = NXT 키 하나)을 유지하고 다음을 더한다. `allButtons()` 4개 전부 `toBeDisabled()`. `manual-order-result` 의 `data-kind` 가 `unknown`. `manual-order-locked` 없음(배너가 있으면 겹치지 않는다). `fireEvent.click(btn('정정'))` 을 해도 `order-confirm-dialog` 가 없고 `sendOrderMock` 은 여전히 1회. 케이스 이름에 「폼(KRX)의 4버튼도 잠긴다 — 같은 원주문을 곧바로 다시 정정할 수 없다 (R4-WR-01)」 을 붙인다.
    - B(신규). variant `orderbook` · 폼 KRX · 선택 행 NXT. 정정 timeout → `rerender` 로 `selectedUnfilled: null` 을 준다(칩 ✕ / 행 사라짐 흉내). 매수 · 매도가 disabled 이고 결과 배너 `unknown` 이 그대로다. → `rerender` 로 다른 종목(`isin: 'KR7005930003'`) → 매수 enabled(18-34 종목 전환 의미 유지). → 원래 종목으로 `rerender`(선택 없음) → 매수 disabled, `manual-order-locked` 가 `RESULT_UNKNOWN_LOCKED_TEXT`(배너는 종목 전환에서 리셋됐다). → `rerender` 로 다른 계좌(`accountNo: '99999999-01'`) → 매수 enabled(교차 거래소 방향으로만 넓힌다).
    - 두 케이스 모두 수정 전 코드에서 **실패해야 한다**. 실패 원인은 「버튼 enabled」 단언이다.
  </behavior>
  <action>
    **RED 먼저.** 시작할 때 저장소 루트에서 `git rev-parse HEAD` 값을 `PLAN_HEAD_BEFORE` 로 기록한다(SUMMARY 에 적는다). 셸 상태는 호출 사이에 유지되지 않는다. 그래서 이후 이 변수를 쓰는 명령(Task 3 범위 가드 · numstat)에는 `PLAN_HEAD_BEFORE=<기록한 해시>` 를 명령 앞에 다시 붙인다. 빈 값으로 `git diff` 를 돌리면 게이트가 틀린 기준으로 통과한다. `webapp/.git` 중첩 저장소가 있다. 모든 git 명령은 `/Users/alex/repos/gh-radar` 에서 실행한다.

    1. `manual-order-form.test.tsx` describe 「잠금 원천 = RelayProvider」 안에 `<behavior>` A · B 를 작성한다. A 는 기존 `:944` 케이스를 **확장**한다. 기존 단언은 지우지 않는다. B 는 A 바로 뒤에 새 `it` 으로 둔다. B 의 `rerender` 는 `rerender(<ManualOrderForm {...baseProps({ variant: 'orderbook', ... })} />)` 형태로 같은 인스턴스를 유지한다. `cd /Users/alex/repos/gh-radar/webapp && npx vitest run manual-order-form` 를 돌려 A · B 가 **버튼 enabled 로 실패**하는지 확인한다. 실패 줄 원문을 SUMMARY 「수정 전 RED 증거」 에 적는다. 다른 이유(import · 문법)로 실패하면 RED 로 치지 않는다. 테스트를 고친다.

    2. `manual-order-form.tsx` 수정(GREEN). 이 파일만 고친다.
       - 모듈 수준에 순수 함수 `export function formOrderLockOf(orderLocks: ReadonlyMap<string, OrderLockKind>, keys: ReadonlyArray<string | null>): OrderLockKind | undefined` 를 추가한다. `null` 키는 건너뛴다. 하나라도 `'result-unknown'` 이면 그것을 돌려준다. 아니면 하나라도 `'in-flight'` 이면 그것, 아니면 `undefined` 다. 결과 모름 우선이다. 판정 이유(한 줄): 결과 모름은 해제되지 않는 잠금이고, 사용자가 확인할 것(미체결)을 알려야 한다. JSDoc 을 붙인다. `OrderLockKind` 는 기존 `@/lib/relay-provider` import 에 `type` 으로 더한다.
       - 상태 `sentTarget` 을 추가한다. 타입은 `Pick<RelayOrderRequest, 'isin' | 'accountNo' | 'exchange'> | null`, 초기값 `null` 이다. `useState` 로 만든다. 렌더 중에 ref 를 읽지 않는다. `handleConfirmed` 에서 최종 `req` 를 만든 뒤, `setSubmitting(true)` 와 같은 자리(`await sendOrder(req)` **이전**)에서 `req.kind !== 'cancel'` 일 때만 `setSentTarget({ isin: req.isin, accountNo: req.accountNo, exchange: req.exchange })` 한다. 취소는 기억하지 않는다. 사용자 결정 2 에 따라 취소는 잠그지 않는다. 이 상태는 **잠금 여부가 아니라 「어느 키를 읽을지」** 다. 잠금 여부는 늘 Provider 가 답한다. 접수 · 거부로 Provider 가 키를 풀면 이 키를 읽어도 잠금이 없다. isin 리셋 효과(`:329-336`)에서는 지우지 않는다. 종목 · 계좌 범위는 아래 파생 조건이 가른다.
       - 기존 `:302-307` 의 잠금 조회(주석 포함)를 **`selected` 계산(`:319-322`) 뒤로** 옮긴다. 식은 다음으로 바꾼다. `accountNo.length === 0` 이면 키 배열은 비어 있다(18-34: 계좌가 빈 폼은 잠금을 읽지 않는다). 아니면 세 키를 담는다.
         - (a) `strategyKey(isin, accountNo, exchange)`
         - (b) `selected` 가 있으면 `strategyKey(selected.isin, accountNo, selected.exchange)`, 없으면 `null`. 정정 요청(`:468-478`)이 Provider 에 등록할 바로 그 키다.
         - (c) `sentTarget` 이 있고 `sentTarget.isin === isin && sentTarget.accountNo === accountNo` 이면 `strategyKey(isin, accountNo, sentTarget.exchange)`, 아니면 `null`. 교차 거래소 방향으로만 넓힌다. 다른 종목 · 다른 계좌는 18-34 대로 독립 키다.
         그 결과를 `const lock = formOrderLockOf(orderLocks, keys)` 로 얻는다. `locked` · `sending` · `busy` · 잠금 문구 조건(`:396-400` · `:828`)은 이 `lock` 을 그대로 쓴다. 식은 바꾸지 않는다.
       - 폼 로컬 잠금 불리언 state 는 다시 만들지 않는다. 잠금 판정에 `result` 를 섞지도 않는다. 원천은 Provider 하나다(18-35).
       - 주석 갱신. 파일 헤더 ②-4 의 「이 폼은 `orderLocks` 에서 자기 키를 **읽기만** 한다」 를 이렇게 고친다: 폼은 **자기 요청이 등록하는(할) 키** — (a) 폼 키 · (b) 선택한 원주문 행 키 · (c) 이 폼이 보낸 마지막 신규 · 정정 요청 키(같은 종목 · 계좌일 때) — 를 읽기만 한다. 한 줄 이력도 더한다: 「정정은 원주문 행의 거래소로 나가므로 폼 키만 읽으면 호가 탭의 교차 거래소 정정 timeout 뒤 버튼이 다시 열렸다 — quick-260922-uhw · R4-WR-01」. 옮긴 조회 위 주석도 같은 내용으로 짧게 쓴다. `RESULT_UNKNOWN_LOCKED_TEXT` JSDoc 의 「배너가 없을 때」 예시에 「잠긴 키의 원주문 행을 선택한 폼」 을 더한다.

    3. `cd /Users/alex/repos/gh-radar/webapp && npx vitest run manual-order-form` 전체가 green 인지 확인한다. 기존 케이스를 고치지 않고 통과해야 한다. 특히 다음 네 케이스다. 「다른 키(다른 계좌 · 다른 거래소 · 다른 종목)의 잠금 → 이 폼은 열려 있다」(선택 없음), 「계좌가 빈 폼은 잠금을 읽지 않는다」, 「취소 timeout → 잠금 등록 0 · … 버튼 잠기지 않음」, 「컨텍스트 키 잠금(호가 탭) — 다른 종목으로 바꾸면 …」. 하나라도 깨지면 설계를 잘못 옮긴 것이다. 테스트를 고치지 말고 구현을 고친다.

    4. 커밋. 스테이징 직전에 `git status --short` 와 `git log -1 --oneline` 을 다시 본다(동시 세션 경합). 두 파일만 경로로 지정해 `git add` 한다. `git add -A` 는 금지다. `.planning/state.json` 은 스테이징하지 않는다. 한글 메시지 예: `fix(quick-260922-uhw): 호가 탭 교차 거래소 정정 timeout 뒤 수동주문 4버튼이 다시 열리던 결과 모름 잠금 틈 수정 (R4-WR-01)`. 본문에 원인 1줄과 판정 3키를 적는다. Co-Authored-By 는 넣지 않는다. push 하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/webapp && npx vitest run manual-order-form</automated>
    <automated>cd /Users/alex/repos/gh-radar && grep -c "export function formOrderLockOf" webapp/src/components/trading/card/manual-order-form.tsx && grep -c "strategyKey(selected.isin, accountNo, selected.exchange)" webapp/src/components/trading/card/manual-order-form.tsx && grep -v '^[[:space:]]*//' webapp/src/components/trading/card/manual-order-form.tsx | grep -c "setBlocked" || true</automated>
  </verify>
  <done>
    수정 전 A · B 가 「버튼 enabled」 로 실패했다(원문을 SUMMARY 에 기록). 수정 후 `manual-order-form` 스위트 전체가 green 이고 기존 케이스는 무수정 통과다. grep 결과는 `formOrderLockOf` export 1 · 선택 행 키 식 ≥1 · `setBlocked` 0 이다. fix 커밋 1개가 두 파일만 담는다.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 확장 회귀 — 선택 행 키 단독 · 결과 모름 우선 · 취소 비기억 + 변이 확인</name>
  <files>webapp/src/components/trading/__tests__/manual-order-form.test.tsx</files>
  <behavior>
    - C(선택 행 키 단독). 이 폼은 아무것도 보내지 않았다. `lockWith([[`${ISIN}:12345678-01:NXT`, 'result-unknown']])` 로 다른 표면의 잠금을 흉내 내고, 폼 KRX 로 `unf()`(NXT) 를 선택한다. 4버튼이 disabled 이고 `manual-order-locked` 가 `RESULT_UNKNOWN_LOCKED_TEXT` 를 보인다. → `rerender` 로 선택을 해제한다. 매수 · 매도 enabled, 잠금 문구 없음. 선택이 없으면 18-34 「다른 거래소 키 잠금은 이 폼을 잠그지 않는다」 가 그대로다. 같은 케이스 안에서 NXT 키를 `'in-flight'` 로 바꾸고 다시 선택한다. 4버튼 disabled · 「주문 전송 중…」 · 잠금 문구 없음.
    - D(우선순위). 순수 함수: `formOrderLockOf(new Map([[k1,'in-flight'],[k2,'result-unknown']]), [k1, k2])` = `'result-unknown'`. 순서를 바꿔도 같다. `[null, k1]` = `'in-flight'`. `[]` = `undefined`. `[null]` = `undefined`. 잠기지 않은 키만 주면 `undefined`. 렌더 판정: 폼 키 KRX `'in-flight'` + 선택 행 NXT `'result-unknown'` → 잠금 문구가 보이고 「주문 전송 중…」 은 없다.
    - E(취소는 읽을 키로 남지 않는다). 폼 KRX · `unf()`(NXT) 선택 · 취소 timeout(잠금 등록 0) → `lockMock.locks` 에 NXT 키 `'result-unknown'` 을 넣는다(다른 표면) → `rerender` 로 선택을 해제한다. 매수 enabled. 취소가 (c) 로 기억됐다면 잠겼을 것이다.
  </behavior>
  <action>
    1. describe 「잠금 원천 = RelayProvider」 에 `<behavior>` C · D · E 를 새 `it` 으로 추가한다. `formOrderLockOf` 는 기존 `../card/manual-order-form` import 목록에 더한다. 기존 케이스는 고치지 않는다. `cd /Users/alex/repos/gh-radar/webapp && npx vitest run manual-order-form` green 을 확인한다. 이번 태스크는 테스트만 더하므로 제품 코드는 바꾸지 않는다. C · D · E 중 하나가 Task 1 코드에서 실패하면 Task 1 구현 결함이다. 원인을 고친 뒤 이 태스크 커밋에 **그 수정도 명시**해 담는다(Deviation 으로 SUMMARY 에 기록).

    2. **변이 확인**(각각 적용 → `npx vitest run manual-order-form` → 실패 케이스 이름 기록 → 반드시 되돌림). 기록은 SUMMARY 「변이 확인」 표에 적는다.
       - (i) 키 배열에서 (b) 선택 행 키를 뺀다 → C 가 실패해야 한다.
       - (ii) (c) 보낸 요청 키를 뺀다 → B 가 실패해야 한다.
       - (iii) (c) 의 종목 · 계좌 일치 조건을 없앤다(항상 `sentTarget` 거래소로 폼 isin · 계좌 키를 만드는 대신 `sentTarget` 자체의 isin · 계좌로 키를 만든다) → B 의 「다른 종목/다른 계좌면 열린다」 단언 또는 기존 「컨텍스트 키 잠금(호가 탭) — 다른 종목으로 바꾸면 …」 이 실패해야 한다.
       - (iv) 취소도 `sentTarget` 에 기록한다 → E 가 실패해야 한다.
       - (v) `formOrderLockOf` 우선순위를 뒤집는다(in-flight 먼저) → D 가 실패해야 한다.
       되돌린 뒤 `git diff --stat -- webapp/src/components/trading/card/manual-order-form.tsx` 가 비어 있는지 확인한다(Task 1 커밋 이후 변경 0). 변이가 실패를 만들지 못하면 그 테스트는 가드가 아니다. 테스트를 강화한다.

    3. 커밋. 스테이징 직전 `git status --short` · `git log -1 --oneline` 을 다시 본다. 테스트 파일만 경로로 지정해 add 한다(Task 1 결함 수정이 있었다면 그 파일도 명시). 한글 메시지 예: `test(quick-260922-uhw): 결과 모름 잠금 합집합 회귀 — 선택 행 키 단독 · 결과 모름 우선 · 취소 비기억 (R4-WR-01)`. Co-Authored-By 없음. push 없음.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/webapp && npx vitest run manual-order-form</automated>
    <automated>cd /Users/alex/repos/gh-radar && git diff --quiet -- webapp/src/components/trading/card/manual-order-form.tsx && echo MUTATIONS_REVERTED</automated>
  </verify>
  <done>
    C · D · E 가 green 이다. 변이 (i)~(v) 는 각각 지정한 케이스를 실패시켰고, 모두 되돌렸다(제품 파일 작업 트리 diff 0). SUMMARY 에 변이 표가 있다. test 커밋 1개가 있다.
  </done>
</task>

<task type="auto">
  <name>Task 3: 전량 게이트 · 범위 가드 · 18-VALIDATION §Gap Closure R4 종결 기록(append-only)</name>
  <files>.planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md</files>
  <action>
    1. 전량 게이트. 각 명령의 요약줄 원문을 SUMMARY 「검증 결과」 에 적는다.
       - `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — tsc + e2e tsconfig, `error TS` 0.
       - `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run test` — failed 0. passed 수를 기록한다(quick-260922-tqr 기준선 1456 passed / 1 skipped + 이번 신규 4).
       - `cd /Users/alex/repos/gh-radar/webapp && pnpm exec eslint src/components/trading/card/manual-order-form.tsx src/components/trading/__tests__/manual-order-form.test.tsx` — 오류 · 경고 0.
       - `cd /Users/alex/repos/gh-radar/webapp && pnpm exec playwright test trading-workbench orderbook` — failed 0. dev 서버는 :3100 이다(`dev.sh` · playwright `webServer` 가 띄우거나 재사용한다). 3000 을 가정하지 않는다. GC5 · GC6 · orderbook 7(결과 모름 잠김)이 pass 인지 확인한다. 실패하면 이번 변경과의 관련성을 가르고, 관련 있으면 고친다. 무관한 선재 실패면 원문과 근거를 SUMMARY 에 적는다.
    2. 범위 가드: `git diff --quiet "$PLAN_HEAD_BEFORE" -- webapp/src/lib/relay-provider.tsx webapp/src/components/stock/stock-orderbook-section.tsx webapp/src/components/trading/card/card-body.tsx webapp/src/components/trading/workbench/trading-workbench.tsx relay/` 가 exit 0 이어야 한다. `PLAN_HEAD_BEFORE` 는 Task 1 에서 기록했다.
    3. `18-VALIDATION.md` **파일 끝**에 한 단락을 **추가만** 한다. §Gap Closure R4 가 마지막 절이다. 기존 줄은 삭제하거나 수정하지 않는다. `18-REVIEW-R4.md` · `18-VERIFICATION-R4.md` · `18-UAT-R4.md` · `deferred-items.md` 도 고치지 않는다(종결 기록 보존). 단락 내용(한국어):
       - 머리: `**R4-WR-01 후속 (2026-09-22, quick-260922-uhw):**`
       - 판정: **닫힘**. 원인 한 줄: 18-34 폼 잠금이 폼 거래소 키만 읽고, 정정은 원주문 행 거래소로 잠겼다.
       - 수정 한 줄: 폼 잠금 = 폼 키 ∪ 선택 원주문 행 키 ∪ 이 폼이 보낸 신규 · 정정 요청 키(같은 종목 · 계좌), 결과 모름 우선. 잠금 원천 `RelayProvider.orderLocks` · relay · 작업대 · 호가 탭 미체결 필터는 무변경이다.
       - 회귀: `manual-order-form.test.tsx` A~E(RED→GREEN · 변이 5종)와 Task 1 · 2 커밋 해시.
       - 게이트 요약줄: webapp vitest passed 수 · Playwright trading-workbench + orderbook 결과.
       - escalation 응답: 18-UAT-R4 #11 · 18-VERIFICATION-R4 advisory 의 「Round 5 등록 또는 위험 수용」 에 대해 **코드로 고쳤다**. 원본 파일은 고치지 않았다. 실 브라우저 재현 확인은 UAT-R4 #11 에 그대로 남는다.
       - 배포: relay 변경 0 이라 새 배포 결합은 없다. 같은 push 에 실려 나가므로 Sign-Off 「배포 순서 (R4 반영)」 를 따른다.
    4. 커밋. 스테이징 직전 `git status --short` · `git log -1 --oneline` 을 다시 본다. `18-VALIDATION.md` 만 경로 지정해 add 한다. 한글 메시지 예: `docs(quick-260922-uhw): 18-VALIDATION §Gap Closure R4 에 R4-WR-01 종결 기록 추가`. Co-Authored-By 없음. push 없음. 이 문서 편집은 **실행자가 이 docs 커밋으로 포함**한다. 오케스트레이터의 docs 커밋은 quick PLAN · SUMMARY · STATE 만 다룬다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test</automated>
    <automated>cd /Users/alex/repos/gh-radar/webapp && pnpm exec eslint src/components/trading/card/manual-order-form.tsx src/components/trading/__tests__/manual-order-form.test.tsx && pnpm exec playwright test trading-workbench orderbook</automated>
    <automated>cd /Users/alex/repos/gh-radar && test -n "$PLAN_HEAD_BEFORE" && git diff --quiet "$PLAN_HEAD_BEFORE" -- webapp/src/lib/relay-provider.tsx webapp/src/components/stock/stock-orderbook-section.tsx webapp/src/components/trading/card/card-body.tsx webapp/src/components/trading/workbench/trading-workbench.tsx relay/ && echo SCOPE_OK && git diff --numstat "$PLAN_HEAD_BEFORE" -- .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md && grep -c "R4-WR-01 후속 (2026-09-22, quick-260922-uhw)" .planning/phases/18-gh-trade-ui-nxt-vi/18-VALIDATION.md</automated>
  </verify>
  <done>
    typecheck 오류 0 · webapp vitest failed 0 · eslint 0 · Playwright trading-workbench + orderbook failed 0(GC5 · GC6 · orderbook 7 pass)이다. `SCOPE_OK` 가 출력된다. 18-VALIDATION numstat 은 「추가 N · 삭제 0」 이고 종결 머리 grep 은 1 이다. docs 커밋 1개가 있다. 3개 커밋 모두 push 하지 않았다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 수동주문 폼 → relay wss 주문 경로 | 사용자의 클릭이 실돈 주문(신규 · 정정 · 취소)으로 넘어가는 경계다. 결과 모름 뒤의 재전송은 이 경계를 넘는 중복 주문이다 |
| 폼 인스턴스 메모리 → RelayProvider 잠금 맵 | 잠금 판정은 Provider 맵 하나를 읽는다. 폼은 읽을 키만 고른다(로컬 판정 없음) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-uhw-01 | Tampering (주문 무결성 — 결과 모름 뒤 같은 원주문 재정정 · 중복 주문) | `manual-order-form.tsx` 잠금 판정 | high | mitigate | 폼 키 ∪ 선택 행 키(정정이 등록할 키) ∪ 보낸 신규 · 정정 요청 키로 합집합 판정한다(`formOrderLockOf`). 회귀 A(선택 유지) · B(선택 해제 뒤 유지) · C(다른 표면 잠금 + 선택)와 변이 (i)(ii) 가 가드한다 |
| T-uhw-02 | Denial of Service (과잠금으로 정상 주문 차단) | 같은 판정 | low | accept | 잠그는 방향이다. 넓힘은 같은 종목 · 계좌의 교차 거래소로 한정한다(B 의 다른 종목 · 계좌 열림 단언 · 변이 iii). 선택 해제로 (b) 는 풀린다. 해제 규칙(로그아웃 · 새로고침)은 18-34 사용자 결정 1 그대로다. 위험을 줄이는 동작(공용 미체결 패널의 행별 취소)은 막히지 않는다(R3-IN-01 판정과 같음) |
| T-uhw-03 | Information Disclosure (계좌번호가 든 키 · `sentTarget`) | 폼 상태 | low | accept | 메모리 상태만 쓴다. 브라우저 저장소를 쓰지 않고 송신 프레임도 추가하지 않는다(18-34 규율과 같음) |
| T-uhw-04 | Tampering (취소 의미 변질 — 취소가 잠금을 만들거나 넓힘) | `handleConfirmed` | medium | mitigate | `sentTarget` 은 `req.kind !== 'cancel'` 에서만 기록한다. Provider 의 취소 무등록 규칙은 무변경이다. 회귀 E 와 변이 (iv) 가 가드한다 |
</threat_model>

<verification>
- 수정 전 RED: A · B 가 「버튼 enabled」 로 실패(원문 기록)
- `npx vitest run manual-order-form` green(A~E 포함, 기존 케이스 무수정)
- 변이 (i)~(v) 각각 지정 케이스 실패 → 전부 되돌림
- typecheck(tsc + e2e) 0 · webapp vitest failed 0 · eslint(변경 2파일) 0 · Playwright `trading-workbench orderbook` failed 0
- 범위 가드: relay-provider · stock-orderbook-section · card-body · trading-workbench · relay/ 무변경
- 18-VALIDATION 추가만(삭제 0)
</verification>

<success_criteria>
- 호가 탭 교차 거래소 정정 timeout 뒤 4버튼이 잠긴 채이고, 선택이 풀려도 매수 · 매도가 열리지 않는다(R4-WR-01 닫힘)
- 18-34 · 18-35 의 기존 잠금 회귀(같은 키 잠금 · 다른 키 무잠금 · 계좌 빈 폼 · 취소 무잠금 · 종목 전환)가 무수정으로 green 이다
- 잠금 원천은 `RelayProvider.orderLocks` 하나다. relay · Provider · 작업대 · 호가 탭 미체결 필터에는 diff 가 없다
- 커밋 3개(fix · test · docs), 한글 메시지, Co-Authored-By 없음, push 없음
</success_criteria>

<output>
Create `.planning/quick/260922-uhw-r4-wr-01-cross-exchange-result-unknown-l/260922-uhw-SUMMARY.md` when done.
SUMMARY 에 반드시 둘 절: `PLAN_HEAD_BEFORE` · 수정 전 RED 증거(원문) · 변이 확인 표 · 검증 결과 요약줄 원문 · 커밋 해시 3개 · 18-VALIDATION 편집은 실행자 docs 커밋에 포함했다는 사실.
</output>
