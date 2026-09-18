---
phase: 17-gh-trade-led
plan: 08
subsystem: ui
tags: [webapp, react, orderbook, trade-tape, relay, tdd, a11y]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-02 가 브라우저 계약까지 결선한 호가 `RelayQuote.kc` · 체결 `RelayTapeEntry.bs`"
  - phase: 17-gh-trade-led
    provides: "17-01 의 `serverMsgBadge(src)` — `RelayServerMsg.src` 어휘의 동등비교 정본"
provides:
  - "`tapeSidesOf(entries, bestAsk, bestBid)` — 서버 체결구분 우선 판정 + `usedFallback` 근거 플래그"
  - "체결 테이프 하단 고지 2종 상수 `SIDE_NOTE_SERVER` / `SIDE_NOTE_FALLBACK`"
  - "호가 종목정보 `종가` 항목(`kc > 0` 갈래) — `stock-orderbook-section.tsx`"
  - "호가 상태바 서버 메시지 출처 배지(`data-testid=\"relay-alert-src\"`)"
  - "자동 게이트 2종: 이 파일들의 시각 기반 판정 0 · 상태바 `src ===` 직접 비교 0"
affects: [17-09, 17-10, 17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 7338
  tasks: 3
  commits: 6
plan_head_before: 236346f7e95e3aae68e9887740c2ee0176200f51

tech-stack:
  added: []
  patterns:
    - "화면이 말하는 **근거**는 실제로 쓴 경로에서 나온다 — 고지 문구의 입력은 `usedFallback` 한 값뿐이고, 분기 인라인 리터럴을 두지 않는다"
    - "서버 진실과 추정이 **어긋나는** 픽스처로만 단언한다 — 둘이 같으면 「서버값을 썼다」와 「추정이 우연히 맞았다」가 구분되지 않는다"
    - "「불필요한 계산을 하지 않는다」는 결과로 증명되지 않는다 — 기본값이 있는 주입 이음매로 **호출 여부**를 스파이한다"
    - "권위값 `0` 은 폴백 대상이 아니다 — 스냅샷 props 로 메우면 서버의 「아니다」가 「모른다」로 퇴행한다"

key-files:
  created: []
  modified:
    - webapp/src/components/orderbook/trade-tape.tsx
    - webapp/src/components/orderbook/relay-status-bar.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
    - webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx
    - webapp/src/components/stock/__tests__/orderbook.test.tsx

key-decisions:
  - "`tapeSidesOf` 에 기본값이 `deriveTapeSides` 인 4번째 인자 `derive` 를 뒀다 — vitest/ESM 에서 모듈 **내부** 호출은 네임스페이스 스파이로 가로챌 수 없어, 「전량 서버값이면 추정을 돌리지 않는다」를 증명할 다른 수단이 없었다. 3인자 호출 계약은 불변이다"
  - "`kc > 0` 갈래에서 종목정보 항목이 4 → 5 가 된다 — 계획서가 「하락VI 자리 대체」와 「상승VI 는 어느 갈래에서도 사라지지 않는다」를 동시에 요구했고, 현행 `VI` 한 칸이 `viu / vid` 를 함께 담고 있었기 때문이다. `dl` 이 `flex-wrap` 이라 §2.2b 밴드 경계와 무관하다"
  - "`closePrice` 는 스냅샷 props 로 폴백하지 않는다 — `0` 은 「아직 안 왔다」가 아니라 「오늘 종가가 아니다」라는 서버의 답이다"
  - "`msg` 볼륨 경로는 확인만 하고 코드를 바꾸지 않았다 — 없는 병목을 고치지 않는다(T-17-29 accept)"
  - "e2e `orderbook.spec.ts` 는 갱신할 셀렉터가 없었다 — 체결 구분 단언이 `/매수|매도/` 라 두 갈래 모두에서 참이고, 고지 문구·종목정보를 짚는 단언이 애초에 없다"

patterns-established:
  - "Pattern 1: RED 커밋은 **구 동작을 그대로 돌려주는 스켈레톤**을 동반한다 — 임포트가 되어야 단언이 assertion 으로 실패하고, 그 실패가 「무엇이 달라져야 하는가」를 그대로 보여준다"
  - "Pattern 2: 자기 경고 주석이 자기 grep 게이트를 깨뜨릴 수 있다 — 금지 패턴을 주석에 **리터럴로** 적지 않는다"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "체결 테이프의 매수/매도 색·sr-only 가 서버 체결구분(`bs`)을 먼저 쓰고, 값이 없는 원소에서만 추정으로 떨어진다 (D-10)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/trade-tape.test.tsx#⓪-1 모든 원소가 서버 체결구분을 실어 오면 전부 서버값을 따르고 `deriveTapeSides` 를 **호출하지 않는다**"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/trade-tape.test.tsx#⓪-2 `bs === \"2\"` 는 매수 · `bs === \"1\"` 은 매도다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/trade-tape.test.tsx#⓪-3 `bs` 가 빈 원소가 섞이면 **그 원소만** 추정으로 채우고 나머지는 서버값 그대로다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/trade-tape.test.tsx#⑫ 서버 체결구분이 전부 오면 수량 색·sr-only 가 그 값을 따르고 고지가 「서버 기준」이라 말한다"
        status: pass
    human_judgment: false
  - id: D2
    description: "하단 고지가 실제로 쓴 근거를 말한다 — 폴백을 한 건도 안 썼으면 「추정」이라고 하지 않는다 (D-10 / T-17-27)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/trade-tape.test.tsx#⑫ … 고지가 「서버 기준」이라 말한다 (`queryByText(/추정했어요/)` 가 null)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/trade-tape.test.tsx#⑬ 체결구분이 없는 체결이 하나라도 섞이면 고지가 **일부 추정**임을 함께 말한다"
        status: pass
      - kind: integration
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#⑫ 체결 행의 매수/매도는 수량 색 + sr-only 라벨로 간다"
        status: pass
    human_judgment: false
  - id: D3
    description: "호가 종목정보의 하락VI 자리가 `kc > 0` 이면 종가로 바뀌고, `0` 이면 종전 표기를 유지한다. NXT 프레임에도 라벨은 `종가` 다 (D-11)"
    requirement: TRADE-04
    verification:
      - kind: integration
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#㉠ `kc > 0` 이면 하락VI 자리가 라벨 `종가` + 값으로 바뀌고 하락VI 값은 사라진다"
        status: pass
      - kind: integration
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#㉡ `kc === 0` 이면 종전 표기(VI 상승 / 하락 두 값) 그대로다"
        status: pass
      - kind: integration
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#㉢ **NXT** 프레임에도 라벨은 `종가` 다"
        status: pass
      - kind: integration
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#㉣ 같은 종가가 다시 와도 표시가 바뀌지 않는다 (no-op)"
        status: pass
    human_judgment: false
  - id: D4
    description: "종가 표기를 벽시계로 판정하지 않는다 — `0` 도 권위값이다 (T-17-28)"
    requirement: TRADE-04
    verification:
      - kind: integration
        ref: "webapp/src/components/stock/__tests__/orderbook.test.tsx#㉤ 벽시계로 판정하지 않는다 — 장 마감 한참 뒤에도 `kc === 0` 이면 종전 표기다 (`vi.setSystemTime` 20:00 KST 이후)"
        status: pass
      - kind: other
        ref: "grep -cE 'new Date\\(|isAfterMarketClose|MARKET_CLOSE' webapp/src/components/stock/stock-orderbook-section.tsx → 0 (작업 전 0, 후 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "호가 상태바의 서버 메시지에 `[상따]`/`[VI]`/`[서버]` 배지가 텍스트로 붙고, 판정은 `serverMsgBadge` 하나만 쓴다 (D-09 · D-17)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx#⑫ 서버 메시지 줄에 출처 배지가 붙는다 — LimitChaser `[상따]` · VITrigger `[VI]`"
        status: pass
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx#⑬ `Account` · 빈 값 · 미상 출처는 전부 `[서버]` 로 떨어진다"
        status: pass
      - kind: other
        ref: "grep -c 'src ===' webapp/src/components/orderbook/relay-status-bar.tsx → 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "상따 사유 줄이 늘어도 상태바 상한 경로가 그대로다 — 최근 3건 렌더·누적 20건 상한 (Pitfall 12 / T-17-29 accept)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx#⑭ 메시지가 20건 쌓여도 상태 바는 최근 3건만 그린다"
        status: pass
      - kind: other
        ref: "코드 읽기 — `use-relay-socket.ts` `case \"msg\"` 는 ≤20 배열 스프레드 + `slice(0,20)` 로 프레임당 상한 20 의 상수 작업이고, `relay-status-bar` 는 `slice(0,3)` + 3행 map 이라 매 프레임 O(n) 경로가 없다"
        status: pass
    human_judgment: false
  - id: D7
    description: "호가주문 탭 왕복(인증 → 구독 → 사다리·테이프 렌더 → 주문 통보 → 회선 단절)이 이 변경 뒤에도 그대로다"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/orderbook.spec.ts (11 tests, 로컬 relay + 스텁 게이트웨이) → 11 passed"
        status: pass
    human_judgment: false
  - id: D8
    description: "실계좌/모의 게이트웨이에서 `bs_code` · `krx_close_price` · `ServerMessage.source` 가 기대한 어휘·시점으로 오는지, 그리고 폰 폭에서 `종가` 항목이 실제로 어떻게 보이는지"
    verification: []
    human_judgment: true
    rationale: "세 값 모두 목 프레임으로만 확인했다. 실서버가 `bs_code` 를 비워 보내면 화면은 계속 「일부 추정」 고지를 띄우며 조용히 옛 동작으로 머물고, `krx_close_price` 가 장중에 0 이 아닌 값을 보내면 장중에 `종가` 라벨이 뜬다 — 둘 다 테스트가 통과한 채로만 드러난다. 시각 확인도 jsdom 으로는 닫히지 않는다(항목 4 → 5 가 폰 밴드에서 어떻게 접히는지). D-26 대로 장 마감 후 배포·관찰로만 닫힌다."

# Metrics
duration: 17 min
completed: 2026-09-18
status: complete
---

# Phase 17 Plan 08: 호가 표면에 서버 진실 드러내기 Summary

**호가주문 표면이 서버가 이미 보내던 두 사실을 말하기 시작했다 — 체결 테이프의 매수/매도가 거래소 원문(`bs`)을 먼저 쓰고 값이 없는 체결에서만 추정으로 떨어지며, 하단 고지가 **그때 실제로 쓴 근거**를 말한다. 종목정보의 하락VI 자리는 `kc > 0` 일 때 KRX 정규장 종가로 바뀌고, 상태바 서버 메시지에는 `[상따]`/`[VI]`/`[서버]` 출처 배지가 붙었다.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-18T02:39:00Z
- **Completed:** 2026-09-18T02:56:24Z
- **Tasks:** 3 (tracer 1 · auto 2, 전부 `tdd="true"`)
- **Files modified:** 6
- **테스트:** webapp 885 → **899** (+14), relay 436 · shared 108 회귀 0, e2e orderbook 11 passed

## Accomplishments

- **체결 색이 추정을 그만뒀다.** `tapeSidesOf` 가 `bs` 를 먼저 읽어 `"2"` 매수 · `"1"` 매도로 확정하고, `""` 인 원소만 기존 `deriveTapeSides` 로 채운다. `deriveTapeSides` 는 지우지 않았다 — 구 서버·낯선 값에서 여전히 필요하고 zero-tick 상속 규칙이 그 안에 있다. **폴백이 한 건도 필요 없으면 추정을 호출조차 하지 않는다.**
- **화면이 자기 근거를 사실대로 말한다.** 하단 고지가 `usedFallback` 하나로 갈린다. 폴백 0건이면 「거래소 체결구분 기준이에요」, 1건 이상이면 「… 구분이 없는 체결만 최우선호가·직전 체결가로 추정했어요」. 서버가 준 값을 「추정」이라 부르는 것도, 추정을 확정 사실처럼 그리는 것도 똑같이 화면이 거짓말하는 것이다(T-17-27).
- **단언이 실제로 무언가를 잠근다.** 모든 체결구분 케이스에서 **서버값과 추정이 어긋나는** 픽스처를 썼다(`p = 98,200` 은 추정상 매수인데 `bs:"1"`, `p = 97,900` 은 추정상 매도인데 `bs:"2"`). 둘이 같은 픽스처였다면 「서버값을 썼다」와 「추정이 우연히 맞았다」가 구분되지 않는다.
- **KRX 정규장 종가가 나타난다.** `kc > 0` 이면 `VI` 항목이 상승VI 단독이 되고 그 옆에 `종가` 항목이 선다. 판정 입력은 `quote.kc` **하나**이고 시각 기반 판정 grep 카운트는 전·후 모두 **0** 이다. `vi.setSystemTime` 으로 장 마감 한참 뒤를 박아도 `kc === 0` 이면 종전 표기라는 **행동 증명**까지 함께 두었다(T-17-28) — grep 은 이름만 보고 이 테스트는 동작을 본다.
- **서버 메시지가 누가 보낸 것인지 말한다.** 배지 판정은 shared `serverMsgBadge` 하나뿐이고 컴포넌트 안 `src ===` 직접 비교는 0건이다. 부분일치 함정 픽스처(`"SetLimitChaserResp"`)가 `[상따]` 로 새지 않음을 단언했다.
- **없는 병목을 고치지 않았다.** `msg` 볼륨 경로를 읽어 상한이 상수 작업임을 확인하고 코드를 바꾸지 않았다(아래 「msg 볼륨 확인」).

## msg 볼륨 확인 (Pitfall 12 / T-17-29 — Task 3 ② 요구 기록)

**결론: 변경 없음. 상따 사유 줄이 100ms 드레인으로 늘어도 상한 경로는 누적 이력 길이에 무관하다.**

- `webapp/src/lib/use-relay-socket.ts` `case "msg":` — `[{...frame, receivedAt}, ...state.messages].slice(0, MAX_MESSAGES)`. 스프레드 대상 배열이 **항상 ≤ 20**(`MAX_MESSAGES`)이라 프레임당 작업량이 상한 20 의 **상수**다. 누적 수신 건수에 비례하지 않는다.
- `webapp/src/components/orderbook/relay-status-bar.tsx` — `messages.slice(0, VISIBLE_MESSAGES = 3)` 뒤 3행 map. 이번에 더한 `serverMsgBadge(msg.src)` 는 행당 동등비교 2회로 O(1) 이고, 렌더당 최대 3회 호출된다. 매 프레임 O(n) 작업이 새로 생기지 않았다.
- 남는 비용은 프레임당 `dispatch` 1회(React 18 자동 배칭 대상)로, 이 plan 이전과 같다.

## Task Commits

1. **Task 1 (tracer, TDD): 체결 테이프 서버 체결구분 우선**
   - RED — `06d2b5c` (test)
   - GREEN — `67e6af2` (feat)
   - REFACTOR — 없음 (구현이 이미 최소)
2. **Task 2 (TDD): 호가 종목정보 KRX 종가 표기**
   - RED — `d7c8855` (test)
   - GREEN — `175b7fb` (feat)
   - REFACTOR — 없음
3. **Task 3 (TDD): 호가 상태바 출처 배지**
   - RED — `3702f54` (test)
   - GREEN — `e532a03` (feat)
   - REFACTOR — 없음

**Plan metadata:** 이 SUMMARY 커밋.

`commits: 6` 은 서술이 아니라 `git rev-list --count 236346f..HEAD` 로 **측정**한 값이다.

## Files Created/Modified

- `webapp/src/components/orderbook/trade-tape.tsx` — `tapeSidesOf` + `TapeSidesResult` 신설, 고지 상수 2종, 렌더 경로 전환, 헤더 주석의 「매수/매도 플래그가 없다」 서술 갱신
- `webapp/src/components/stock/stock-orderbook-section.tsx` — `closePrice` 파생값 + 종목정보 `dl` 의 `kc` 분기(`종가` 항목)
- `webapp/src/components/orderbook/relay-status-bar.tsx` — `serverMsgBadge` import + 메시지 줄 출처 배지 span
- `webapp/src/components/orderbook/__tests__/trade-tape.test.tsx` — `tapeSidesOf` 4케이스 + 렌더 2케이스, 기존 고지 단언 2건 갱신
- `webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx` — 배지 3케이스(⑫·⑬·⑭)
- `webapp/src/components/stock/__tests__/orderbook.test.tsx` — 종가 5케이스(㉠~㉤), 기존 고지 단언 1건 갱신

## Decisions Made

1. **`tapeSidesOf` 에 주입 이음매를 뒀다.** 4번째 선택 인자 `derive`(기본값 `deriveTapeSides`). vitest 2 + ESM 에서 모듈 **내부** 호출은 네임스페이스 `vi.spyOn` 으로 가로챌 수 없다(내부 참조가 지역 바인딩이다). 「전량 서버값이면 추정을 돌리지 않는다」는 결과만 봐서는 「돌려놓고 버린 구현」과 구분되지 않으므로, 호출 여부를 직접 스파이할 수 있는 이음매가 유일한 증명 수단이었다. 호출부 계약(`tapeSidesOf(entries, bestAsk, bestBid)`)은 그대로다.
2. **추정은 배열 전체를 한 번만 돈다.** 원소마다 `deriveTapeSides` 를 부르면 zero-tick 상속이 이웃을 못 봐 규칙 자체가 달라진다. `⓪-3` 이 `toHaveBeenCalledTimes(1)` 로 이 성질을 잠갔다.
3. **`closePrice` 는 폴백하지 않는다.** `quote?.kc ?? 0` 까지가 전부다. 스냅샷 props(`basePrice`/`lowerLimit` 류)로 메우면 서버의 「오늘 종가가 아니다」가 「모른다, 그러니 다른 값을 쓰자」로 퇴행한다.
4. **배지는 텍스트 노드다.** 이 표면은 방향색 전면 금지라 색으로 출처를 가를 수도 없거니와, 가능해도 색 단독 구분은 WCAG 1.4.1 위반이다. 테스트가 문자열로 찾는다.
5. **e2e 를 실제로 돌려 확인했다.** 계획서 Task 3 ④ 는 「깨지면 갱신한다」였다. 깨지는지 알려면 돌려야 한다 — 11 passed 였고 갱신할 셀렉터가 없었다(체결 구분 단언이 `/매수|매도/` 라 두 갈래 모두에서 참, 고지 문구·종목정보를 짚는 단언 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 내가 쓴 경고 주석이 내가 세운 grep 게이트를 깨뜨렸다**
- **Found during:** Task 2 (GREEN 직후 acceptance 재실행)
- **Issue:** 「벽시계로 판정하지 말 것」이라는 경고 주석에 금지 패턴을 **리터럴로** 적었더니(`new Date()`), Task 2 acceptance 의 `grep -cE 'new Date\(|isAfterMarketClose|MARKET_CLOSE'` 카운트가 작업 전 `0` → 작업 후 `1` 이 됐다. 게이트가 잡으려던 것(시각 기반 판정 코드)은 한 줄도 들어가지 않았는데 게이트는 정확히 실패했다 — 게이트가 **틀린 것이 아니라** 주석이 게이트의 시야에 들어간 것이다.
- **Fix:** 주석 문구를 「현재 시각·장 시간 상수를 들이지 말 것」으로 바꾸고, 그 아래에 「이 파일의 시각 기반 판정 건수 0 은 17-08 이 grep 게이트로 잠근 값이다」를 남겨 다음 사람이 같은 함정에 빠지지 않게 했다.
- **Files modified:** `webapp/src/components/stock/stock-orderbook-section.tsx`
- **Verification:** 재측정 `0` (작업 전과 동일), webapp 896 green
- **Committed in:** `175b7fb` (커밋 전에 수정)

### 계획서와의 차이

**2. [범위] 종목정보 항목 수가 `kc > 0` 갈래에서 4 → 5 가 된다**
- 계획서 ①은 「하락VI 값이 놓인 자리를 라벨 `종가` · 값 `kc` 로」이면서 동시에 「상승VI 값은 어느 갈래에서도 사라지지 않는다」를 요구했다. 현행 `VI` 항목은 **한 칸이 `viu / vid` 를 함께** 담고 있으므로, 하락VI 만 빼고 종가를 넣으면 `VI` 항목은 `viu` 단독이 되고 종가는 **새 항목**이 된다. 한 칸을 통째로 `종가` 로 바꾸는 해석은 상승VI 를 지우게 되어 요구와 모순된다.
- `dl` 은 `flex-wrap` 이고 이 표면은 컨테이너 쿼리 대상이 아니다. **`webapp/src/styles/globals.css` 는 손대지 않았고** §2.2b 밴드 경계 리터럴(`700px`·`830px`·`992px`) 카운트는 전·후 모두 4 다.
- D-11 의 「칸 수가 바뀌지 않으므로 §2.2b 재측정 불필요」는 **상따 헤더 10칸**에 대한 문장이다(그쪽은 17-09 이후 소관). 이 표면의 §2.2b 불변은 그대로 지켰다.

**3. [추가] 계획서 `files_modified` 에 없던 테스트 파일 2건을 고쳤다**
- `webapp/src/components/stock/__tests__/orderbook.test.tsx`(Task 2 의 「기존 테스트 파일」이자 Task 1 의 고지 문구 단언 보유처), `webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx`(Task 3 의 「없으면 신규」 — 있었다).
- 고지 문구가 바뀌었으므로 기존 단언 3건(trade-tape 2 · orderbook 섹션 1)을 **RED 커밋에서 함께** 갱신했다. 문구를 바꾸면서 옛 단언을 남겨두면 GREEN 이 영영 오지 않는다.

**4. [추가] e2e 를 실제로 실행했다**
- 계획서는 「깨지면 갱신한다」였고 실행 지시는 없었다. 로컬 relay + 스텁 게이트웨이로 11건 전량 통과를 확인했고 갱신할 것이 없었다. 「아마 안 깨질 것」과 「돌려 보니 안 깨졌다」는 다르다.

---

**Total deviations:** 1 auto-fixed (Rule 1 버그) + 3 범위 기록
**Impact on plan:** 범위를 넓히지 않았다. #2 는 계획서의 두 요구를 동시에 만족시키는 유일한 해석이고, #3·#4 는 acceptance 를 실제로 닫기 위한 최소 작업이다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 (tracer) | ✓ `06d2b5c` | ✓ `67e6af2` | — (변경 없음) | Pass |
| 2 | ✓ `d7c8855` | ✓ `175b7fb` | — (변경 없음) | Pass |
| 3 | ✓ `3702f54` | ✓ `e532a03` | — (변경 없음) | Pass |

**RED 증거 (#3770 실질 요건 — 세 사이클 모두 「대상 테스트가 계획된 behavior 에 대한 단언으로 실패」)**

| 사이클 | command | exit | 대상 테스트 | 실패 형태 | 집계 |
|---|---|---|---|---|---|
| Task 1 | `pnpm --filter @gh-radar/webapp test` | `1` | `tapeSidesOf > ⓪-1 · ⓪-2 · ⓪-3`, `TradeTape > ⑫ · ⑬ · ⑧`, `compact > 하단 고지 라벨`, `StockOrderbookSection > ⑫` | **단언 실패** — `expected [ 'B', 'S' ] to deeply equal [ 'S', 'B' ]`, `expected 'mono num font-semibold text-[var(--up…' to contain 'text-[var(--down)]'` + **문구 미발견** `Unable to find an element with the text: 수량 색… 거래소 체결구분 기준이고…` | 892 중 **8 실패 / 883 통과 / 1 skip** |
| Task 2 | `pnpm --filter @gh-radar/webapp test` | `1` | `종목정보 — KRX 정규장 종가 > ㉠ · ㉢ · ㉣` | **문구 미발견** — `Unable to find an element with the text: 종가`, `… 12,625` | 897 중 **3 실패 / 893 통과 / 1 skip** |
| Task 3 | `pnpm --filter @gh-radar/webapp test` | `1` | `RelayStatusBar > ⑫ · ⑬ · ⑭` | **문구·요소 미발견 + 단언 실패** — `Unable to find an element with the text: [상따]`, `Unable to find an element by: [data-testid="relay-alert-src"]`, `expected to have a length of 3 but got +0` | 900 중 **3 실패 / 896 통과 / 1 skip** |

로드 실패·0건 발견·unexpected green 어느 쪽도 아니다. 실패한 테스트는 전부 계획된 `<behavior>` 에 대한 단언이고, 나머지 880+ 건이 정상 통과했다는 것이 「픽스처가 깨진 게 아니다」의 증거다.

**RED 단계에서도 통과한 케이스(의도된 green — 회귀 그물):** `⓪-4`(zero-tick 상속이 `deriveTapeSides` 안에 남는다) · `㉡`(`kc === 0` 종전 표기) · `㉤`(벽시계 판정 부재). 셋 다 **새 동작이 아니라 깨지지 말아야 할 성질**이라 RED 에서 초록인 것이 맞다.

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다 (17-01·17-02·17-03·17-07 이 보고한 도구 갭 그대로).**
`bin/lib/tdd-red-evidence.cjs` 의 `parseNodeTestSummary` 가 `node --test` 의 `# tests/# pass/# fail` 푸터로만 집계를 읽는데 vitest 는 그 푸터를 내지 않아 어떤 입력이든 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내는 것은 게이트가 검사하려던 증거의 위조라 하지 않았고, 대신 위 표로 실질 증거를 남긴다.

## Issues Encountered

- **자기 주석이 자기 게이트를 깨뜨리는 함정**(위 Deviation 1). grep 게이트를 세울 때는 금지 패턴을 **주석에도** 적지 않아야 한다는 교훈을 `patterns-established` 에 남겼다.
- `pnpm … test -- trade-tape` 의 필터 인자가 vitest 에 파일 필터로 전달되지 않아 71개 파일을 전부 돈다(17-02 가 보고한 것과 동일). 판정에는 영향이 없다 — 전량 green 이 더 강한 조건이다.
- 그 밖의 문제 없음. baseline(webapp 885+1skip · relay 436 · shared 108) 대비 회귀 0.

## Known Stubs

없음. 이 plan 이 그리는 값은 전부 relay 가 실제로 나르는 필드(`RelayTapeEntry.bs` · `RelayQuote.kc` · `RelayServerMsg.src`)에서 오고, 하드코딩된 빈 값·플레이스홀더 문구를 새로 넣지 않았다.

## User Setup Required

없음 — 신규 의존성 0건, 외부 서비스 설정 변경 없음.

## Next Phase Readiness

**바로 시작 가능:**
- **17-09 이후 상따 화면 plan** — `tapeSidesOf` 가 공개 함수라 상따 좌측 칼럼의 compact 테이프도 같은 판정을 이미 쓰고 있다(같은 컴포넌트다). 상따 헤더 10칸의 `하한 → 종가` 대체(D-11 ②)는 **아직 안 했다** — 이 plan 의 범위는 호가 종목정보뿐이다.
- **17-11 래치 LED** — 이 plan 은 `relay-status-bar` 의 메시지 줄만 건드렸고 `VISIBLE_MESSAGES` · 상한 경로 · 톤 규칙을 바꾸지 않았다. 상따 사유 줄이 늘어도 이 표면은 그대로다.

**주의:**
- **`bs_code` 가 실서버에서 비어 오면 화면은 조용히 옛 동작으로 머문다** — 「일부 추정」 고지를 계속 띄우며 테스트는 전부 통과한다. D-26 장 마감 후 관찰에서 **고지 문구가 어느 쪽인지**를 먼저 보는 것이 이 plan 의 실기 검증 포인트다.
- **`krx_close_price` 가 장중에 0 이 아니면 장중에 `종가` 라벨이 뜬다.** 그것이 서버 진실이면 그대로 두는 것이 맞다(벽시계로 덮지 않는다). 다만 실기 관찰에서 이상하게 보이면 **서버 쪽 값**을 확인할 일이지 클라 분기를 늘릴 일이 아니다.
- 배포는 D-26 대로 장 마감(20:00 KST) 이후, 사용자 확인 뒤에 한다. 이 plan 은 webapp 만 바꿨으므로 relay 재배포는 필요 없다.
- `TRADE-04` 는 형제 plan 이 아직 선언 중이라 REQUIREMENTS.md 체크는 마지막 선언 plan 이 끝날 때 닫힌다(#2388 공유 ID 게이트, 정상 동작).

## Self-Check: PASSED

- 수정 파일 6건 전부 디스크에 존재 확인
- 커밋 6건 전부 `git log` 에서 확인: `06d2b5c` · `67e6af2` · `d7c8855` · `175b7fb` · `3702f54` · `e532a03`
- `commits: 6` 은 `git rev-list --count 236346f..HEAD` 로 **측정**한 값이다
- 모든 태스크 `<acceptance_criteria>` 최종 재실행 통과 (Task 1: 6/6 · Task 2: 6/6 · Task 3: 6/6)
- plan `<verification>` 재실행 통과: webapp test **899 passed / 1 skipped**, `pnpm typecheck` exit 0 · `error TS` 0건, §2.2b 밴드 경계 리터럴 카운트 4(불변), e2e `orderbook.spec.ts` **11 passed**
- 회귀 확인: relay 436 passed · shared 108 passed — baseline 동일

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-18*
