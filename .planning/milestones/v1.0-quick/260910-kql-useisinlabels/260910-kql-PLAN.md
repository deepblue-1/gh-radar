---
phase: quick-260910-kql
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
  - webapp/e2e/specs/me.spec.ts
autonomous: true
requirements: [RELAY-02]

estimate:
  tokens: 34000
  raw_tokens: 34000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "/me 「오늘 주문」 카드의 종목 칸이 relay 가 이름을 아는 종목에 대해 종목명을 보여준다"
    - "종목명이 보이는 행에도 식별자(단축코드 또는 ISIN)가 함께 남는다 — 이름이 코드를 대체하지 않는다"
    - "이름 미해석·계좌 프레임 도착 전·상장폐지 어느 경우에도 종목 칸이 비지 않는다 (이름 → 코드 → ISIN)"
    - "모바일 390px 에서 긴 종목명이 들어와도 같은 행의 다른 칸을 잘라내거나 목록 밖으로 밀어내지 않는다"
    - "종목명을 얻기 위한 새 조회 경로(REST·Supabase·fetch)가 생기지 않는다 — 원천은 relay wss 스냅샷 하나뿐이다"
  artifacts:
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/e2e/specs/me.spec.ts
  key_links:
    - "useIsinLabels() → TodayOrdersCard — 라벨 원천은 useRelayContext() 하나. 이 훅은 네트워크를 타지 않는다"
    - "row.stockCode → 코드 칸 — DB 가 아는 단축코드가 라벨 코드보다 우선한다(주문 이력의 식별자는 기록된 값이다)"
    - "모바일 ①줄의 유일한 신축 항목 = 종목명 span — 코드 span 은 flex:none 이어야 조용한 잘림이 안 생긴다"
---

<objective>
`/me` 「오늘 주문」 카드의 종목 칸에 **종목명**을 넣는다. 지금은 단축코드(`row.stockCode ?? row.isin`)만 나온다.

Purpose: 트레이더가 주문 이력을 읽을 때 `005930` 을 머릿속에서 「삼성전자」로 번역하고 있다. 이름은 이미 relay 가 실어 보내고 있고 `useIsinLabels()` 라는 단일 정본이 Phase 16 에서 만들어졌다 — 없는 것을 만드는 작업이 아니라 **이미 있는 것을 이 표면에 연결하는** 작업이다.

Output: 이름+코드 병기 종목 칸(데스크톱 표 · 모바일 카드 행 두 형태), 3단 폴백을 잠그는 컴포넌트 테스트 3건, 이름 표시와 390px 잘림 0 을 잠그는 E2E 단언.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@webapp/src/components/trading/today-orders-card.tsx
@webapp/src/lib/isin-labels.ts
@webapp/src/components/trading/strategy-status-card.tsx
@webapp/src/components/trading/__tests__/today-orders-card.test.tsx
@webapp/src/lib/__tests__/isin-labels.test.tsx
@webapp/e2e/specs/me.spec.ts
@webapp/e2e/fixtures/relay.ts
</context>

<interface_context>

플래너가 **직접 읽어 확인한** 사실이다. 실행자는 이것을 전제로 시작하되, 편집 전 해당 파일을 열어 대조한다.

**`webapp/src/lib/isin-labels.ts` (재사용할 훅)**

- 시그니처: `useIsinLabels(): ReadonlyMap<string, IsinLabel>`
- `interface IsinLabel { name?: string; code?: string }` — **둘 다 모를 수 있다.** 모르는 값을 지어내지 않는 것이 이 타입의 계약이다.
- 원천: `useRelayContext()` 의 `accountStates`(각 계좌의 `hold`·`unf`) + `viOrders`(이름만) + `limitChasers`. **네트워크 호출이 없다** — REST·Supabase 를 타지 않는다(T-16-02).
- 「로딩 상태」라는 별도 신호가 없다. 아직 프레임이 안 왔으면 Map 이 그냥 비어 있고, `labels.get(isin)` 이 `undefined` 다. **소비자가 `?? 폴백` 으로 처리하는 것이 이 훅의 규약**이다(파일 주석 (a)(b)).
- 병합 규칙: 나중 프레임의 빈 값이 이전 값을 지우지 않는다 → 저장된 `name`/`code` 는 빈 문자열일 수 없다. `undefined` 검사만으로 충분하다.
- `useMemo` 로 Map 을 캐시한다 — 매 렌더 호출해도 안전하다.

**`strategy-status-card.tsx` 의 `StrategyRow` (같은 문제의 선례)**

- 이름/코드 결정 (114–124행): `const name = label?.name ?? item.isin;` / `const code = label?.code ?? (label?.name !== undefined ? item.isin : null);`
  → 핵심 규율: **이름 칸이 이미 ISIN 인 행은 코드 칸에 같은 값을 두 번 쓰지 않는다.**
- 배치 (142–148행): 이름은 `min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]`, 코드는 그 **바로 뒤**에 `mono shrink-0 text-[11px] text-[var(--muted-fg)]`.
  → 이름만 신축, 코드는 고정. 이번 작업이 그대로 따를 배치다.

**`today-orders-card.tsx` 현황**

- 77–80행 `stockLabel(row)` 이 `row.stockCode ?? row.isin` 을 돌려주고, 데스크톱 표 196행 · 모바일 233행 **두 곳**에서 쓰인다.
- 헤더 주석 ⑤(30–33행): 「flex 자식 중 `flex:1 1 auto; min-width:0` 은 종목 칸 하나뿐이고 나머지는 전부 `flex-none`」. 어기면 스크롤이 아니라 **조용한 잘림**이다.
- 모바일 ②줄(243–259행)은 시각·수량·가격·주문번호가 **전부 `flex-none`** 이다. 여기에 항목을 더하면 넘침을 흡수할 신축 항목이 없다.
- `cn` 은 이미 import 되어 있다(55행). `Table` 은 `.tbl-wrap relative w-full overflow-x-auto` 로 자기 자신을 감싼다 — 데스크톱 표의 가로 스크롤은 **설계된 동작**이다(me.spec 헤더 ④).

**E2E 픽스처 (`webapp/e2e/fixtures/relay.ts`)**

- `E2E_STOCK_ROWS` 가 `/rest/v1/stocks` 스텁으로 나가고, relay `SymbolMap` 이 그것으로 ISIN → 이름·코드를 푼 뒤 `acct` 프레임에 실어 브라우저로 보낸다.
- `E2E_ISIN = 'KR7005930003'` → `삼성전자` / `005930`
- `E2E_LONG_NAME_ISIN = 'KR7000660001'` → `한국제7호기업인수목적우선주식회사` / `000660` (390px 스트레스 데이터)
- `me.spec.ts` 의 `TODAY_ORDERS`: `ord-a`·`ord-c` = `E2E_ISIN`, `ord-b`(주문번호 `0000900002`) = `E2E_LONG_NAME_ISIN`.

</interface_context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 종목 칸에 이름을 붙인다 — useIsinLabels 재사용 · 3단 폴백 · 신축 항목은 여전히 하나</name>
  <files>
    webapp/src/components/trading/today-orders-card.tsx
    webapp/src/components/trading/__tests__/today-orders-card.test.tsx
  </files>
  <read_first>
    webapp/src/lib/isin-labels.ts (시그니처·`IsinLabel`·병합 규칙),
    webapp/src/components/trading/strategy-status-card.tsx 114–150행 (`StrategyRow` 의 이름/코드 결정과 배치),
    webapp/src/components/trading/today-orders-card.tsx 30–33행·77–80행·190–262행,
    webapp/src/lib/__tests__/isin-labels.test.tsx 90–118행 (`heldAccountStates()` — `RelayAccountState` 픽스처 본)
  </read_first>
  <behavior>
    - Test 1 (이름 표시): `accountStates` 에 `isin: KR7005930003` · `name: "삼성전자"` · `code: "005930"` 인 `hold` 한 벌이 들어 있고 그 ISIN 의 주문이 복원되면, 그 행의 텍스트에 `삼성전자` 와 `005930` 이 **둘 다** 들어 있다.
    - Test 2 (이름 미해석 폴백): `accountStates` 가 비어 있으면(`EMPTY_RELAY_VALUE` 그대로 = 계좌 프레임 도착 전) 그 행에 `005930` 이 보이고, 행 텍스트가 비지 않는다.
    - Test 3 (상장폐지 폴백): `stockCode` 가 `null` 이고 라벨도 없는 행은 `KR7005930003` 이 보인다.
    - 기존 5 케이스(3줄 복원 · 라이브 병합 · 실패 수렴 · 빈 상태 · 재조회 1회)는 **한 건도 바뀌지 않는다**.
  </behavior>
  <action>
    ① 훅 연결 — `@/lib/isin-labels` 에서 `useIsinLabels` 와 타입 `IsinLabel` 을 import 하고, `TodayOrdersCard` 본문에서 `useIsinLabels()` 를 한 번 호출해 `labels` 로 받는다. 새 조회 경로를 만들지 않는다: `fetch`·Supabase 클라이언트·`orders-api` 확장 모두 금지다. 이 훅은 `useRelayContext()` 밖을 보지 않으며 그것이 T-16-02 의 취지다. `restored`·`orders` 와 무관하므로 기존 `useMemo`/`useEffect` 순서를 건드리지 않고 `useRelayContext()` 호출 근처에 둔다.

    ② 폴백 헬퍼 — 기존 `stockLabel(row)` 을 `stockLabel(row, label)` 로 바꾼다. 둘째 인자 타입은 `IsinLabel | undefined`. 반환은 필드 두 개짜리 객체다(이름 칸 문자열 하나, 코드 칸 문자열 또는 `null`).
      - 코드 칸 값 = `row.stockCode` → `label?.code` → `row.isin` 순으로 무너진다. **언제나 값이 있다.** `row.stockCode` 를 맨 앞에 두는 이유: 주문 이력에 기록된 단축코드가 그 주문 시점의 사실이고, 라벨은 지금 relay 가 아는 값이다.
      - 이름 칸 값 = `label?.name` 이 정의돼 있으면 그것, 아니면 **코드 칸 값을 이름 자리로 올리고 코드 칸은 `null`** 로 둔다. `strategy-status-card` 의 `StrategyRow` 가 쓰는 「이름 칸이 이미 코드/ISIN 인 행은 같은 값을 두 번 쓰지 않는다」 규율과 같은 판단이다.
      - 결과가 요구된 3단 폴백이다: **이름 → 코드 → ISIN**. `label` 이 `undefined` 여도(로딩 중·미해석) 이름 자리가 코드로 채워지므로 행이 비는 경우가 없다. 훅에는 로딩 신호가 따로 없고 소비자가 `?? 폴백` 으로 처리하는 것이 규약이므로, 로딩 분기를 새로 만들지 않는다.
      - 77행의 기존 한 줄 주석을 3단 폴백을 설명하는 문장으로 다시 쓴다 — 「단축코드가 없으면 ISIN 으로 폴백한다」는 이제 사실의 일부만 말한다.

    ③ 데스크톱 표 「종목」 셀 — `TableCell` 안에 `flex items-center gap-1.5 whitespace-nowrap` 인 span 을 두고, 이름 span(`text-[length:var(--t-caption)] font-semibold text-[var(--fg)]`)과 코드 span(`mono text-[11px] text-[var(--muted-fg)]`)을 나란히 둔다. 코드 칸이 `null` 이면 이름 span 하나만 그린다. 이름 자리에 코드/ISIN 이 올라온 행(=코드 칸이 `null` 인 행)에서만 이름 span 에 `mono` 를 붙인다 — 한글 종목명에 mono 를 씌우지 않기 위해서다. `cn` 은 이미 import 돼 있다. **셀에 `truncate` 를 쓰지 않는다**: 표 셀에는 폭 제약이 없어 truncate 가 동작하지 않고, 표는 `Table` 이 감싸는 `.tbl-wrap overflow-x-auto` 안이라 폭이 늘면 **가로 스크롤**이 된다(me.spec 헤더 ④ 가 「표 자체의 가로 스크롤은 설계된 동작」이라고 못박은 그 동작). 기존 `TableCell` 의 `className` 에서 `mono` 는 떼고 위 구조로 옮긴다.

    ④ 모바일 카드 행 ①줄 — 헤더 ⑤ 의 규율을 **그대로 유지**한다. `min-w-0` + 신축 + `truncate` 는 **이름 span 에만** 남기고(지금 233행 span 의 클래스에서 `mono` 만 조건부로 바꾼다), 새로 넣는 코드 span 은 이름 **바로 뒤**에 `mono` · `flex-none` · `whitespace-nowrap` · `text-[11px]` · `text-[var(--muted-fg)]` 로 둔다. `SideTag`·`StatusTag` 를 감싼 span 들은 지금의 `flex-none` 그대로 둔다. 이름 span 은 코드 칸이 `null` 일 때만 `mono` 를 쓴다(③ 과 같은 판단).

    ⑤ 긴 종목명 처리(명시) — 390px ①줄에서 고정 항목(코드 약 42px + 매매구분 약 55px + 상태 배지 약 48px + gap·padding 약 48px)을 뺀 나머지를 이름이 가져가고, 넘치면 **말줄임으로 잘린다**. 이것이 채택안이다: 잘려도 **식별자인 코드 칸은 온전히 남으므로** 주문 이력으로서의 기능이 유지된다. **코드를 ②줄로 내리지 않는다** — ②줄은 시각·수량·가격·주문번호가 전부 `flex-none` 이라 넘침을 흡수할 신축 항목이 없고, 7자리 가격·6자리 수량이 실린 스트레스 행에서 항목을 하나 더하면 390px 를 넘겨 truncate 가 아니라 **조용한 잘림**이 된다(헤더 ⑤ 가 지목한 `tasks/lessons.md` 함정). 이름을 두 줄로 wrap 시키지도 않는다 — 행 높이가 종목명 길이에 따라 들쭉날쭉해지면 목록으로서 훑기 어려워진다.

    ⑥ 헤더 주석 — 파일 상단 주석 블록에 항목 하나를 더한다: 종목명의 원천은 `useIsinLabels` 단일 정본이고 별도 조회 경로가 없다는 사실, 이름 미해석 시 코드 → ISIN 으로 무너진다는 사실, 그리고 신축 항목이 **여전히 종목명 하나뿐**이라는 사실. 주석 안에서 Tailwind 클래스명을 그대로 쓰지 말고 파일이 이미 쓰는 CSS 표기(`flex:1 1 auto; min-width:0`)를 유지한다 — 주석이 클래스 검색을 오염시키지 않게 하는 이 파일의 기존 습관이다.

    ⑦ 테스트 — 같은 파일의 기존 하네스를 재사용한다(`vi.mock("@/lib/relay-provider")` + `mockRelay`). `useIsinLabels` 를 따로 mock 하지 않는다: 실물 훅이 `mockRelay` 를 그대로 읽으므로 **훅과 컴포넌트의 연결까지 함께 잠긴다**. `RelayAccountState` 픽스처는 `isin-labels.test.tsx` 의 `heldAccountStates()` 가 본이다 — `t: "acct"`, `a`, `snap`, `hold`, `unf`, `rm`, `st` 를 채우고 `new Map([[state.a, state]])` 로 `accountStates` 에 넣는다. `<behavior>` 의 세 케이스를 추가한다. 기존 케이스와 `beforeEach` 는 손대지 않는다(`mockRelay = { ...EMPTY_RELAY_VALUE }` 가 곧 「라벨 없음」이므로 기존 5 케이스는 자동으로 코드 폴백 경로를 탄다 — 그래서 깨지지 않는다). 단언은 모바일 카드 행(`[data-slot="today-order-row"]`) 기준으로 하고 표 행은 세지 않는다(같은 정보의 두 벌).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm --filter @gh-radar/webapp run test &amp;&amp; pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>
    webapp 단위 스위트가 exit 0 이고 `today-orders-card.test.tsx` 의 케이스가 5 → 8 로 늘었다. 기존 5 케이스가 한 건도 깨지지 않았다.
    `typecheck`(tsc --noEmit + e2e tsconfig) 가 exit 0.
    `today-orders-card.tsx` 에 새 네트워크 호출이 없다 — import 는 `useIsinLabels` 하나만 늘었다.
    모바일 ①줄에서 신축(`flex:1 1 auto; min-width:0`) 항목은 여전히 종목명 span 하나이고, 새 코드 span 을 포함해 나머지는 전부 고정이다.
  </done>
  <reversibility rating="reversible">표시 계층 한 파일의 렌더 변경. 되돌리면 원래 코드 표시로 돌아간다 — 저장 데이터·API 계약에 흔적이 남지 않는다.</reversibility>
</task>

<task type="auto">
  <name>Task 2: E2E 회귀 확인 — 이름 표시와 390px 잘림 0 을 me.spec 에 잠근다</name>
  <files>
    webapp/e2e/specs/me.spec.ts
  </files>
  <read_first>
    webapp/e2e/specs/me.spec.ts 15–42행(헤더 ①~④) · 217–260행(조회구·`boxOf`) · 280–306행(`beforeEach` 라우트) · 364–386행(오늘 주문 카드 단언) · 580–640행(케이스 8 모바일 390),
    webapp/e2e/fixtures/relay.ts 119–160행(`E2E_STOCK_ROWS`) · `/rest/v1/stocks` 스텁
  </read_first>
  <action>
    ① 숨은 함정에 대한 **확정된 답을 먼저 기록한다.** 플래너가 실측한 결과: `useIsinLabels` 는 `useRelayContext()` 밖을 보지 않는다 — **라벨용 REST/Supabase 호출이 존재하지 않는다.** 따라서 「스텁이 라벨 API 를 안 막아 테스트가 네트워크에 의존한다」는 함정은 이 경로에 **성립하지 않는다.** 이름은 로컬 relay 가 `acct` 프레임에 실어 보내고, 그 이름의 원천은 이미 스텁된 `/rest/v1/stocks`(`E2E_STOCK_ROWS`)다. **새 라우트 스텁을 추가하지 않는다.** 이 사실을 오늘 주문 카드 단언 블록 주석에 한 줄로 남겨, 다음 사람이 같은 의심을 반복하며 없는 스텁을 찾지 않게 한다. 실행자는 편집 전 이 전제를 직접 대조한다 — `isin-labels.ts` 의 import 목록에 `useRelayContext` 외의 데이터 소스가 없는지 확인하는 것으로 충분하다.

    ② 케이스 1 에 이름 단언을 더한다. 현재 `ordersCard` 를 잡고 `0000900003`·`취소` 를 보는 블록(364–380행 부근)은 `relay.pushAccountState(ACCOUNT_A_STATE)`·`(ACCOUNT_B_STATE)` **뒤**에 있으므로 두 ISIN 의 이름이 이미 풀려 있다. 카드 안에서 `삼성전자` 와 `005930`(= `E2E_ISIN` 주문 `ord-a`/`ord-c`), 그리고 `한국제7호기업인수목적우선주식회사` 와 `000660`(= `E2E_LONG_NAME_ISIN` 주문 `ord-b`)이 보이는지 단언한다. 이름은 계좌 상태 프레임 도착 후에 채워지므로 같은 파일이 전략 행 이름에 쓰는 것과 같은 `{ timeout: 15_000 }` 을 준다. **이름과 코드를 함께 단언하는 것이 핵심**이다 — 이름만 보면 코드가 사라진 회귀를 통과시킨다.

    ③ 케이스 8(모바일 390) 에 오늘 주문 카드의 잘림 단언을 더한다. 이 케이스는 이미 `setViewportSize(MOBILE_VIEWPORT)` 뒤에 `relay.pushAccountState(ACCOUNT_B_STATE)` 를 밀고 있으므로 `E2E_LONG_NAME_ISIN` 의 **긴 이름이 실제로 렌더된다** — 스트레스 데이터의 존재 이유가 그것이다. 같은 케이스 끝의 `.rlist` 잘림 단언(`account-unfilled-row` 를 `account-unfilled-list` 의 `right` 와 대조하는 `evaluate` 블록)과 **같은 방식**으로 잰다: 행이 아니라 **잎 요소**의 `right` 를 목록 오른쪽 끝과 대조한다(헤더 ④ — 행은 `overflow-hidden` 이라 폭·`scrollWidth` 가 조용하다). 대상은 `[data-slot="today-orders-list"]` 와 그 안에서 `0000900002` 를 담은 `[data-slot="today-order-row"]`(`filter({ hasText: '0000900002' })` 로 좁힌다 — `nth(0)` 은 정렬이 바뀌면 애먼 행을 잰다). 1px 반올림 여유도 기존 블록과 같게 둔다. 넘치는 잎이 하나도 없어야 한다.

    ④ 케이스 1 의 기존 단언(행 3개 · `0000900003` · `취소` · GET 전용 · 세로 순서)과 케이스 8 의 기존 단언은 **하나도 지우지 않는다.** 이번 변경은 더하기만 한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm --filter @gh-radar/webapp run typecheck &amp;&amp; pnpm --filter @gh-radar/webapp exec playwright test specs/me.spec.ts</automated>
  </verify>
  <done>
    `me.spec.ts` 전 케이스가 exit 0 — 오늘 주문 카드를 보는 케이스 1 이 종목명·코드를 함께 확인하고, 케이스 8 이 390px 에서 긴 종목명 주문 행의 넘치는 잎이 0 임을 확인한다.
    `typecheck:e2e`(tsconfig.e2e.json) 가 exit 0.
    라벨 조회용 `page.route` 스텁이 **추가되지 않았다** — 라벨 경로에 네트워크가 없다는 사실이 spec 주석으로 남았다.
  </done>
  <reversibility rating="reversible">테스트 단언 추가. 되돌리면 이전 커버리지로 복귀한다.</reversibility>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay wss → 브라우저 렌더 | relay 가 `acct`/`lc` 프레임에 실어 보낸 종목명 문자열이 이번 변경으로 **새 표면**(오늘 주문 카드)에 렌더된다 |
| Supabase `dma_orders` → 브라우저 | `row.stockCode`·`row.isin` 은 이번 변경 전에도 같은 행에 렌더되던 값이다(신규 노출 없음) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-kql-01 | Tampering | `TodayOrdersCard` 종목명 렌더 | low | mitigate | 이름을 JSX 텍스트 노드로만 그린다. `dangerouslySetInnerHTML`·`innerHTML` 을 쓰지 않는다 — React 가 이스케이프한다. 같은 문자열을 이미 `strategy-status-card`·`app-sidebar` 가 같은 방식으로 그리고 있다 |
| T-kql-02 | Information Disclosure | 오늘 주문 카드 | low | accept | 새로 노출되는 데이터가 없다. 종목명은 공개 정보이고 이미 같은 페이지의 전략·계좌 카드가 표시한다 |
| T-kql-03 | Denial of Service | 라벨 조회 | low | mitigate | 새 조회 경로를 만들지 않는 것이 곧 완화다. `useIsinLabels` 는 이미 받은 프레임만 읽고 `useMemo` 로 캐시하므로 표면이 늘어도 호출량이 늘지 않는다(T-16-02) |
| — | Supply chain | 패키지 설치 | — | n/a | 이번 작업에 `pnpm add` 가 없다. 새 의존성 0 — 패키지 적법성 게이트 대상이 아니다 |
</threat_model>

<verification>
1. `pnpm --filter @gh-radar/webapp run test` exit 0 — `today-orders-card.test.tsx` 케이스 5 → 8, 기존 케이스 무손상.
2. `pnpm --filter @gh-radar/webapp run typecheck` exit 0 (`tsc --noEmit` + `tsconfig.e2e.json`).
3. `pnpm --filter @gh-radar/webapp exec playwright test specs/me.spec.ts` exit 0 — 케이스 1(이름+코드 병기) · 케이스 8(390px 넘치는 잎 0) 포함.
4. `today-orders-card.tsx` 의 import 증가분이 `useIsinLabels`(+ 타입 `IsinLabel`) 하나뿐이다 — 새 조회 경로 0.
</verification>

<success_criteria>
- 「오늘 주문」 카드의 데스크톱 표와 모바일 카드 행 **양쪽** 종목 칸에 종목명이 나오고, 그 옆에 단축코드(또는 ISIN)가 함께 남는다.
- 이름 미해석·계좌 프레임 도착 전·`stockCode` 가 `null` 인 상장폐지 — 세 경우 모두 종목 칸이 비지 않는다(이름 → 코드 → ISIN).
- 390px 에서 긴 종목명이 실린 주문 행의 어떤 잎 요소도 목록 오른쪽 끝을 넘지 않는다.
- 종목명을 위한 새 조회 경로·새 API 호출이 0 건이다.
- 위 `<verification>` 4 항목 전부 통과.
</success_criteria>

<output>
Create `.planning/quick/260910-kql-useisinlabels/260910-kql-SUMMARY.md` when done.
</output>

<notes>
- 커밋 메시지는 한글, `Co-Authored-By` 를 넣지 않는다.
- **배포하지 않는다** — 오케스트레이터가 main tree 에서 처리한다. `.planning/STATE.md` 도 건드리지 않는다.
- 실계좌 주문·relay 배포·서버 변경 없음. webapp 프론트만이다.
</notes>
