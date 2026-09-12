---
phase: quick-260912-mvo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/chat/__tests__/chat-fab.test.tsx
  - webapp/src/components/trading/dirty-action-bar.tsx
  - webapp/e2e/specs/chat.spec.ts
  - webapp/e2e/specs/trading-limit-chaser.spec.ts
  - webapp/e2e/specs/trading-vi.spec.ts
  - webapp/src/styles/globals.css
  - webapp/src/components/ui/input.tsx
  - webapp/src/components/ui/textarea.tsx
  - webapp/src/components/trading/vi-settings-card.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
  - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-buysell-ladder.html
  - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-chaser-breakpoints.html
  - .planning/WINDOWS.md
autonomous: true
requirements: [TRADE-01]
quick_id: 260912-mvo

estimate:
  tokens: 190000
  raw_tokens: 190000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Q-01 — AI FAB 은 `/stocks/{code}` 종목상세에서만 렌더되고, 상따·VI·홈·로그인 어느 경로에서도 DOM 에 없다"
    - "Q-02 — `Input`·`Textarea`·VI 금액 입력·상따 종목검색·상따 `NumInput` 다섯 텍스트 입력은 포커스 시 **테두리 색 변화 한 겹**만 보이고 전역 박스섀도 링이 없다"
    - "Q-02 — 체크박스·버튼·링크·`<select>`·`type=range` 슬라이더는 전역 이중 링을 그대로 유지한다(포커스가 사라지지 않는다)"
    - "Q-03 — 「감시 대상」 세그먼트가 `Row`/`CheckRow` 와 같은 2열 그리드의 **오른쪽 입력 칸**에 들어가고, `role=group` + `aria-label=감시 대상` + 더티 테두리는 그대로다"
    - "Q-04 — 데스크톱(≥992) 거래소 콤보가 글자·높이 모두 커지고 좁은 폭 크기는 변하지 않으며 `appearance-none` 이 없다"
    - "Q-05 — 종목 트리거는 행의 빈 공간을 먹지 않고, lucide 아이콘 + 옅은 테두리로 눌리는 컨트롤임을 드러내며, Esc 와 바깥 blur 로 원래 종목으로 돌아오고, 검색이 열려도 종목정보 10칸과 현재가가 계속 보인다"
    - "Q-05 — 검색 결과 항목을 클릭하는 도중에는 목록이 닫히지 않는다"
    - "Q-06 — 2열(≥700)일 때 매수 카드는 `--up` 5% · 매도 카드는 `--down` 5% 배경을 갖고, 폰(≤699 탭 모드)에는 틴트가 없다"
    - "Q-07 — 컴팩트 2단 호가가 240px 스크롤 박스 안에서 **20행 전부**를 유지하고, 박스는 `tabIndex=0` 이며, 체결 테이프 10건은 박스 밖에 그대로 있다"
    - "회귀 0 — webapp 유닛 테스트가 785 passed / 1 skipped / 63 files 아래로 내려가지 않고 단언 삭제가 0건이다"
  artifacts:
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/styles/globals.css
    - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-buysell-ladder.html
    - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-chaser-breakpoints.html
  key_links:
    - "`chat-fab.tsx` 의 `usePathname()` 게이트 ↔ `dirty-action-bar.tsx` ⑥ 주석 ↔ `trading-limit-chaser.spec.ts` 케이스 4 / `trading-vi.spec.ts` FAB 좌표 단언 — 셋이 같은 사실을 말해야 한다"
    - "`globals.css §8.5.5` 의 `data-focus-ring=\"seamless\"` ↔ 다섯 텍스트 입력의 포커스 테두리색 — 링만 걷고 테두리가 안 바뀌면 포커스가 보이지 않는다(WCAG 2.4.7)"
    - "`orderbook-ladder.tsx` 2단 트리 박스 높이 240px ↔ `twoRow` 의 `h-6`(24px) — 한쪽만 고치면 마지막 행이 반쯤 잘린다"
    - "`Card` 의 `--card-base` 변수 ↔ `@min-[992px]/lc:` 카드 크롬 — 배경 선언이 하나여야 데스크톱에서 틴트와 `--card` 가 캐스케이드로 다투지 않는다"
---

<objective>
상따 화면 후속 7건(Q-01 ~ Q-07)을 구현한다. 사용자 목업 승인이 끝난 **잠긴 결정**이며 대안을 제시하지 않는다.

Purpose: 폼 마지막 행을 가리는 FAB, 두 겹으로 보이는 포커스, 행 전체를 먹는 세그먼트, 작은 거래소 콤보, 되돌릴 수 없는 종목 변경, 구분되지 않는 매수/매도 카드, 480px 을 쓰는 컴팩트 호가 — 일곱 개의 관측된 결함을 한 번에 닫는다.

Output: webapp 소스 8파일 + 테스트 4파일 + e2e 3파일 수정, 목업 정본 2건 박제, 미검증 항목의 WINDOWS 등재.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@webapp/src/styles/globals.css
@webapp/src/components/trading/limit-chaser-client.tsx
@webapp/src/components/trading/limit-chaser-form.tsx
@webapp/src/components/orderbook/orderbook-ladder.tsx
@webapp/src/components/chat/chat-fab.tsx
@webapp/src/app/layout.tsx
</context>

<observed_facts>
계획 시점(2026-09-12)에 저장소에서 **직접 확인한** 사실이다. 실행 전에 어긋나면 멈추고 보고하라.

- 유닛 기준선: `pnpm -C webapp test` → **Test Files 63 passed · Tests 785 passed | 1 skipped (786)** · exit 0.
- lint 기준선: `pnpm -C webapp lint` → error 0 · **warning 정확히 3건**
  (`theme-detail-client.tsx:9` `ScannerEmpty` · `strategy-status-card.test.tsx:360` `_msg` · `use-relay-socket.ts:808` exhaustive-deps).
- `globals.css:251-264` — `*:focus-visible` 이 `--focus-outline` / `--focus-outline-offset` / `--focus-shadow`
  세 변수를 읽고, `[data-focus-ring="seamless"]` 가 셋을 전부 무력화한다. 해제 장치는 **이미 있다**.
- 텍스트 입력 전수(`grep '<input\|<textarea' src` 실측 6곳):
  `ui/input.tsx` · `ui/textarea.tsx` · `vi-settings-card.tsx:704` · `limit-chaser-client.tsx:1013` ·
  `limit-chaser-form.tsx:1298`(`NumInput`) — 그리고 **텍스트 입력이 아닌 2곳**:
  - `home-header.tsx:228` = `<input type="range">` (`h-1 … rounded-full bg-[var(--border)]`, 테두리 없음)
  - `limit-chaser-form.tsx:1413` = `<input type="checkbox">`
- **포커스 테두리 채널(= 링을 걷은 자리를 대신할 표시)의 현재 상태** — 주석 줄을 걸러낸 실측:
  - `ui/textarea.tsx` = **이미 있다** (`focus-visible:border-ring`) → Task 2 는 **보존**만 하면 된다
  - `limit-chaser-form.tsx` `NumInput` 래퍼 = **이미 있다** (`focus-within:border-[var(--ring)]`, `:1292`) → 추가 변경 없음
  - `ui/input.tsx` · `vi-settings-card.tsx` 래퍼 · `limit-chaser-client.tsx` 검색 입력 = **없다(0건)** → 이번에 세워야 한다
  이 다섯은 전부 「링 제거 ↔ 테두리 확보」 한 쌍이고, **쌍이 깨지면 포커스가 통째로 보이지 않는다**
  (T-mvo-01, severity high). 그래서 Task 2·3 의 게이트는 `data-focus-ring="seamless"` 와 테두리
  유틸리티를 **파일마다 함께** 센다 — 한쪽만 세면 회귀가 조용히 난다.
- `textarea.tsx` 는 Tailwind `focus-visible:ring-3 focus-visible:ring-ring/50` 을 **직접** 갖고 있다.
  이 유틸리티는 `.class:focus-visible`(특이도 0,2,0)이라 `*:focus-visible`(0,1,0)을 이긴다 —
  `seamless` 변수만으로는 이 링이 안 걷힌다.
- `limit-chaser-client.tsx:563` — `{isin !== '' && !searching && (` 가 검색 중 종목정보 10칸을 숨기는 지점.
- `limit-chaser-client.tsx:506` — 종목 트리거의 `flex-1`. `:517-519` 에 캐럿 문자 span. `:524` 현재가 블록 `ml-auto`.
- `limit-chaser-client.tsx:475` — 거래소 `<select>` 의 `text-[10px] … px-1 py-0.5`. `appearance-none` 없음(유지 규율).
- `limit-chaser-client.tsx:1012-1019` — `StockSearchField` 루트 `relative min-w-0 flex-1`, 입력 `h-10`, 결과 `<ul>` `top-11`.
- `orderbook-ladder.tsx:740` `twoRow` — 가격 셀 `<th className="h-6 …">` = **행 높이 24px**. `:923-963` 2단 트리.
  `:646-653` 1단 트리의 초기 중앙정렬 장치(`centeredRef` 1회 · `row.offsetTop - box.clientHeight / 2`).
  `:986-989` 1단 스크롤 박스(`tabIndex={0}` · `h-[340px]`).
- `limit-chaser-form.tsx:1059-1065` `Card` — 크롬이 `@min-[992px]/lc:` 에만 있고 `bg-[var(--card)]` 를 건다.
  `:622`·`:782` 가 `buyCard`/`sellCard` 호출부, `:983-1010` 이 탭/2열 그리드.
- `limit-chaser-form.tsx:665-697` — 「감시 대상」 세그먼트(`Row` 밖 단독 행, `w-full`).
- `dirty-action-bar.tsx:33-41` ⑥ 주석 + `:86` `pr-[128px]`. 소비처는 `limit-chaser-form.tsx:1026` 과
  `vi-settings-card.tsx:600` **둘뿐**이고 **둘 다 `/trading/*`** 이다.
- FAB 전역 존재를 전제한 e2e: `trading-limit-chaser.spec.ts:240` · `trading-vi.spec.ts:288`
  (좌표 단언) · `chat.spec.ts:41` (`/login`) · `chat.spec.ts:67` (`/`).
  `chat.spec.ts:92-96` 의 종목상세 테스트만 새 계약과 이미 일치한다.
- `/stocks` 하위 라우트는 셋이다: `[code]/page.tsx` · `[code]/news/page.tsx` · `[code]/discussions/page.tsx`.
- `usePathname` 모킹 선례: `layout/__tests__/app-sidebar.test.tsx:32` (`usePathname: () => mockPathname`).
- 목업 정본 실재:
  `/private/tmp/claude-501/-Users-alex-repos-gh-radar/1b3d46a2-faeb-4b26-bc7c-a5eb99c27c51/scratchpad/260912-buysell-ladder.html`
  (`:186-188` = `.vC .fcard{border-radius:var(--r-md);padding:6px 8px}` + `--up`/`--down` 5% 믹스) 및
  `…/260912-chaser-breakpoints.html`.
</observed_facts>

<planning_findings>
계획 중 **코드에서 직접 확인**해 계획에 반영한 두 가지다. 결정을 바꾸는 것이 아니라 결정의 자기 규칙을 적용한 것이다.

1. **`home-header.tsx:228` 은 텍스트 입력이 아니다 — `type="range"` 슬라이더다.**
   Q-02 의 대상 목록에 이름이 올라 있으나, 같은 Q-02 가 「테두리로 포커스를 말할 수 없는 컨트롤은
   건드리지 마라 — 전역 링이 유일한 표시다」를 명시한다. 이 슬라이더는 트랙이 `h-1` 배경뿐이고
   테두리가 없어 그 예외에 **정확히** 해당한다. `seamless` 를 걸면 포커스 표시가 통째로 사라져
   WCAG 2.4.7 위반이 된다. → **건드리지 않는다.** (`limit-chaser-form.tsx:1413` 체크박스도 같은 이유로 제외.)

2. **`dirty-action-bar.tsx` 의 `pr-[128px]` 은 이번에 지우지 않는다.**
   Q-01 이 승인한 것은 「주석을 현실에 맞게 갱신」이고, 회피 코드 제거는 「그 주석이 무엇을 지키는지
   읽고 판단하라」였다. 읽은 결과: 소비처 두 곳이 모두 `/trading/*` 이라 오늘은 겹치지 않지만,
   `DirtyActionBar` 는 **공용 컴포넌트**이고 여백을 지우는 것은 승인 목록에 없는 두 화면의 시각 변경이다.
   → 여백 유지 + 주석을 사실에 맞게 재작성 + SUMMARY 에 후속 후보로 남긴다.
</planning_findings>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Q-01 — AI FAB 을 종목상세 경로로 게이트하고, 깨지는 계약 5건을 새 계약으로 다시 쓴다</name>

  <files>
    webapp/src/components/chat/chat-fab.tsx
    webapp/src/components/chat/__tests__/chat-fab.test.tsx
    webapp/src/components/trading/dirty-action-bar.tsx
    webapp/e2e/specs/chat.spec.ts
    webapp/e2e/specs/trading-limit-chaser.spec.ts
    webapp/e2e/specs/trading-vi.spec.ts
    .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-buysell-ladder.html
    .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-chaser-breakpoints.html
  </files>

  <behavior>
    - `usePathname()` 이 `/stocks/005930` → FAB 버튼이 렌더된다 (기존 세 케이스의 단언이 전부 그대로 성립).
    - `usePathname()` 이 `/trading/limit-chaser` → FAB 이 DOM 에 **없다**.
    - `usePathname()` 이 `/` → FAB 이 DOM 에 없다.
    - `usePathname()` 이 `/stocks/005930/news` → FAB 이 DOM 에 없다 (종목상세 본문만이 대상이다).
  </behavior>

  <action>
    이 태스크가 이번 quick 의 트레이서다 — 한 결정(Q-01)을 컴포넌트 → 유닛 계약 → 주석 → e2e 계약까지
    **끝에서 끝까지** 관통시켜, 「계약을 다시 쓴다」가 이 저장소에서 실제로 어떤 모양인지 먼저 증명한다.

    (1) **목업 박제 (먼저)** — `observed_facts` 에 적힌 scratchpad 경로의 HTML 2건을
    `.planning/quick/260912-mvo-7-5-ai-fab-ux/` 로 `cp` 한다. 파일명은 그대로.

    (2) **`chat-fab.tsx` 경로 게이트.** `next/navigation` 의 `usePathname` 을 import 하고, 모듈 상단에
    상수 정규식 하나를 둔다 — 세그먼트가 **정확히 하나**인 `/stocks/…` 만 통과시킨다
    (`/stocks/{code}` 및 말미 슬래시 허용, `/stocks/{code}/news`·`/stocks/{code}/discussions` 는 불통과).
    컴포넌트 본문 최상단에서 `usePathname()` 을 읽고 불일치면 `null` 을 반환한다.
    ★ 훅 순서 규칙 — `useAuth`/`useChat`/`useState` **뒤**가 아니라, 이른 반환이 훅 호출 개수를 바꾸지
      않도록 **모든 훅 호출이 끝난 다음** 줄에서 반환하라. 훅 위로 올리면 경로가 바뀌는 순간
      React 가 훅 순서 위반으로 터진다.
    ★ `app/layout.tsx` 의 **JSX 는 한 줄도 고치지 마라.** 레이아웃은 서버 컴포넌트 경계이고, 거기서
      경로를 판정하면 클라이언트 경계가 하나 더 생긴다. 판정은 이미 클라이언트인 `ChatFab` 안에서만 한다.
      다만 `:47-48` 주석의 「모든 페이지 우하단에서 접근한다」는 이제 **거짓**이 되므로 그 줄만
      사실로 고쳐라 — 거짓이 된 주석을 남기는 것이 이 계획이 닫으려는 결함 그 자체다.
      `'use client'` 지시어를 넣지 말고 import 도 늘리지 마라.
    파일 상단 JSDoc 의 「모든 페이지 우하단 고정 진입점」을 새 사실로 고쳐 쓰되, **왜 전역에서
    좁혔는지**(상따 우하단에서 폼 마지막 행과 「켤 수 없는 이유」를 가렸다 — 사용자 스크린샷)와
    **AI 진입점이 사라지지 않는다는 사실**(사이드바 「AI 애널리스트」 항목이 `/chat` 으로 남는다)을
    함께 남겨라.

    (3) **`chat-fab.test.tsx` 재작성 — 단언 삭제 0건.** 이 파일에는 케이스가 **4개** 있다(Test 1~4).
    `app-sidebar.test.tsx:32` 선례를 그대로 따라
    `vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }))` + `let mockPathname` 을 두고
    `beforeEach` 에서 `'/stocks/005930'` 으로 초기화한다. 기존 Test 1~4 의 단언은 **한 줄도 바꾸지 말고**
    이 기본 경로 위에서 그대로 돌게 한다. 이어서 새 케이스를 더한다:
      Test 5 — `/trading/limit-chaser` 에서 FAB 이 렌더되지 않는다
      Test 6 — `/` 에서 렌더되지 않는다
      Test 7 — `/stocks/005930/news` 에서 렌더되지 않는다 (하위 라우트 경계를 못박는다)
    비렌더 단언은 `queryByRole('button', { name: /AI/ })` 가 `null` 인 것 **과** 렌더 결과 컨테이너가
    비어 있는 것, 둘 다로 잠근다 — 라벨만 보면 다이얼로그 잔재를 놓친다.

    (4) **`dirty-action-bar.tsx` ⑥ 주석 재작성.** 현재 ⑥ 은 「`app/layout.tsx` 의 `ChatFab` 은
    `fixed right-6 bottom-6 z-40` 이라 이 바와 정확히 같은 구석을 쓴다」는 **이제 거짓인 전제**에
    기대어 있다. 다음 네 사실로 바꿔 써라: ⓐ FAB 은 `chat-fab.tsx` 안에서 종목상세 경로로 게이트됐다
    ⓑ 오늘의 소비처 둘(`limit-chaser-form.tsx` · `vi-settings-card.tsx`)은 전부 `/trading/*` 이라
    FAB 과 **더 이상 공존하지 않는다** ⓒ 그럼에도 `pr-[128px]` 을 남기는 이유는 이 바가 공용
    컴포넌트여서 종목상세류 표면에 새 소비처가 붙는 순간 같은 충돌이 되살아나기 때문이다
    ⓓ e2e 좌표 단언은 부재 단언으로 바뀌었으므로 **이 여백은 더 이상 테스트로 잠겨 있지 않다**.
    `pr-[128px]` 값 자체와 그 옆 한 줄 주석의 128 = 24 + 83 + 21 산식은 **그대로 둔다**
    (`planning_findings` 2 참조).

    (5) **e2e 3파일을 새 계약으로.** `trading-limit-chaser.spec.ts` 케이스 4 와 `trading-vi.spec.ts`
    의 같은 블록에서, FAB `boundingBox()` 기반 좌표 비교 3줄을 **지우지 말고 대체**한다 —
    ⓐ 그 표면에 FAB 이 **없다**(`toHaveCount(0)`) ⓑ 「수정」 버튼의 `boundingBox()` 가 non-null 이다
    (바가 실제로 레이아웃에 올라와 있다는 기존 사실은 유지) ⓒ 그 다음 `.click()` 이 성공한다(기존 줄).
    단언 개수가 줄지 않아야 한다. 위 주석 블록도 **왜 좌표에서 부재로 바뀌었는지**로 고쳐 쓴다.
    `chat.spec.ts` 의 두 테스트(`/login` 진입 · `/` 진입)는 **같은 파일 안의 종목상세 테스트가 쓰는
    라우트와 mock 설정을 그대로 재사용**해 종목상세에서 FAB 을 누르도록 옮긴다 — 검증 대상
    (비로그인 게이트 / 시트 open + SSE 스트리밍)은 한 글자도 바꾸지 않는다. 그 테스트가 이미
    e2e 에서 `/stocks/{code}` 의 FAB 가시성을 증명하고 있으므로 새 전제를 만들지 않는다.
    ★ Playwright 는 이 세션에서 실행하지 않는다 — `pnpm -C webapp typecheck` 의 `tsconfig.e2e.json`
      패스가 유일한 기계 검증이고, 그 사실을 Task 3 에서 WINDOWS 에 등재한다.
  </action>

  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm -C webapp test src/components/chat/__tests__/chat-fab.test.tsx &amp;&amp; pnpm -C webapp typecheck &amp;&amp; ! grep -q "use client" webapp/src/app/layout.tsx &amp;&amp; ls .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-buysell-ladder.html .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-chaser-breakpoints.html</automated>
  </verify>

  <done>
    `chat-fab.test.tsx` 가 7케이스(기존 4 + 신규 3) 전부 통과하고, 기존 4케이스의 단언이 한 줄도
    삭제되지 않았다. `webapp/src/app/layout.tsx` 는 서버 컴포넌트로 남았고(클라이언트 지시어 없음)
    JSX 변경이 0줄이며 주석 한 줄만 사실로 갱신됐다.
    `pnpm -C webapp typecheck` 가 exit 0 (e2e tsconfig 포함).
    목업 HTML 2건이 `${QUICK_DIR}` 에 존재한다.
    `dirty-action-bar.tsx` 의 `pr-[128px]` 는 값이 그대로이고 ⑥ 주석만 새 사실을 말한다.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Q-02(공용·VI·폼) · Q-03 세그먼트 2열 · Q-06 방향색 카드 틴트</name>

  <files>
    webapp/src/styles/globals.css
    webapp/src/components/ui/input.tsx
    webapp/src/components/ui/textarea.tsx
    webapp/src/components/trading/vi-settings-card.tsx
    webapp/src/components/trading/limit-chaser-form.tsx
    webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  </files>

  <behavior>
    - `Input` · `Textarea` 렌더 결과에 `data-focus-ring="seamless"` 속성이 있고, 클래스에 포커스 테두리색 유틸리티가 있다.
    - VI 금액 입력의 **래퍼**가 `focus-within` 테두리색 유틸리티를 갖고, **안쪽 input** 이 `seamless` 를 갖는다.
    - 상따 `NumInput` 안쪽 input 이 `seamless` 를 갖는다(래퍼의 `focus-within:border-[var(--ring)]` 은 이미 있다).
    - `limit-chaser-form.tsx` 안에서 `type="checkbox"` 인 input 에는 `seamless` 가 **없다**.
    - 「감시 대상」 그룹의 **부모 요소**가 `Row`/`CheckRow` 와 같은 2열 그리드 클래스를 갖고, 그 부모의 첫 자식은 비어 있으며 그룹은 두 번째 칸에 있다.
    - 그룹의 `role="group"` · `aria-label="감시 대상"` · 더티 시 `--primary` 테두리가 그대로다.
    - `buyCard` 래퍼에 `data-side="buy"`, `sellCard` 래퍼에 `data-side="sell"` 이 있고, 각각 `--up` / `--down` 5% 믹스 배경 클래스를 `@min-[700px]/lc:` 로만 건다.
  </behavior>

  <action>
    **Q-02 (이 태스크가 맡는 4곳).** 나머지 1곳(상따 종목검색 입력)은 파일 경합을 피해 Task 3 이 맡는다 —
    Q-02 의 완결은 두 태스크가 함께 낸다.

    ⓐ `globals.css` §8.5.5 헤더 주석에 **규약 한 줄**을 더한다: 텍스트 입력류는 `data-focus-ring="seamless"`
    + 포커스 테두리색 변화로 **한 겹**만 쓰고, 체크박스·버튼·링크·`<select>`·슬라이더는 전역 이중 링이
    **유일한 포커스 표시**이므로 걷지 않는다. 다음 사람이 되돌리지 않게 「왜」를 함께 적어라
    (입력에 `outline-none` 이 있어도 `box-shadow` 는 살아남아 테두리 위에 사각형이 하나 더 그려졌다).
    규칙 셀렉터(`*:focus-visible` · `[data-focus-ring="seamless"]`)는 **한 글자도 고치지 마라** — 이미
    필요한 해제 장치를 갖추고 있고, 고치면 앱 전체의 포커스 표시가 흔들린다.

    ⓑ `ui/input.tsx` — `<input>` 엘리먼트에 `data-focus-ring="seamless"` 속성을 추가하고,
    `inputVariants` 기본 클래스 배열에 포커스 테두리색 유틸리티를 더한다(토큰은 `--ring`).
    `transition-[border-color,box-shadow]` 는 이미 있으니 그대로. JSDoc 의 「focus 는 globals.css
    §8.5.5 Double-Ring 전역 규칙에 위임」 줄을 새 사실로 고쳐라.

    ⓒ `ui/textarea.tsx` — `data-focus-ring="seamless"` 를 더하고, **Tailwind 자체 포커스 링 유틸리티
    두 개(`focus-visible:ring-3` · `focus-visible:ring-ring/50`)를 제거한다.**
    ★ 이것이 이 파일의 유일한 함정이다 — 그 유틸리티는 `.class:focus-visible`(특이도 0,2,0)이라
      `*:focus-visible`(0,1,0)을 이기고, `seamless` 가 바꾸는 것은 후자의 변수뿐이라 링이 안 걷힌다.
      `focus-visible:border-ring` 은 **남긴다**(이 컴포넌트의 테두리 채널이다).
      `aria-invalid:ring-*` 은 포커스가 아니라 오류 신호이므로 **건드리지 마라.**
    ★ 제거를 설명하는 주석에 그 유틸리티 이름을 **글자 그대로 쓰지 마라** — 아래 게이트가 파일 전체를
      세기 때문에 주석이 게이트를 스스로 무효로 만든다. 「Tailwind 자체 포커스 링 유틸리티를 걷었다」로 적어라.
    <!-- planner-discipline-allow: focus-visible:ring -->
    이 컴포넌트를 쓰는 소비처는 `chat/composer.tsx` 하나다 — 챗 입력의 포커스가 테두리 변화로
    **여전히 보이는지** 코드에서 확인하고, 안 보이면 그 사실을 SUMMARY 에 적어라.

    ⓓ `vi-settings-card.tsx:704` 금액 입력 — 안쪽 `<input>` 에 `data-focus-ring="seamless"`,
    **래퍼 div** 의 기본 클래스 문자열(더티 분기보다 앞)에 `focus-within:border-[var(--ring)]` 을 넣는다.
    `NumInput` 과 **같은 배치**여야 한다: 의사클래스가 붙어 특이도가 높으므로 더티 테두리와 동시에
    걸려도 포커스색 하나가 이긴다. 래퍼의 더티 `shadow-[0_0_0_2px_…]` 는 포커스가 아니라 더티 신호이니
    **손대지 마라**(다만 상따 `NumInput` 과 규율이 다르다는 사실은 SUMMARY 에 관찰로 남겨라).

    ⓔ `limit-chaser-form.tsx:1298` `NumInput` 안쪽 `<input>` 에 `data-focus-ring="seamless"`.
    래퍼는 이미 `focus-within:border-[var(--ring)]` 을 갖고 있으므로 **추가 변경 없음**.
    ★ 같은 파일 `:1413` 의 체크박스에는 **절대 걸지 마라** — 테두리로 포커스를 말할 수 없는 컨트롤이다.

    **Q-03 세그먼트를 입력 칸 폭으로.** 현재 `Row` 밖 단독 행인 「감시 대상」 그룹을, `Row`(`:1242`)·
    `CheckRow`(`:1408`)와 **완전히 같은** 2열 그리드 래퍼로 감싼다
    (`mt-[var(--s-1)] grid min-h-[38px] min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-1.5 @min-[992px]/lc:gap-[var(--s-2)]`).
    첫 칸은 **빈 요소 하나**로 비우고(시각 라벨 없음), 그룹은 두 번째 칸에 놓는다.
    그룹 자신의 `mt-[var(--s-1)]` 은 래퍼로 옮겼으니 **제거**한다 — 남기면 행 간격이 두 배가 된다.
    `w-full` 은 그대로 둔다(이제 칸 폭을 채운다는 뜻이 된다).
    ★ `role="group"` · `aria-label="감시 대상"` · 더티 `border-[var(--primary)]` 분기 · 선택 버튼의
      방향색(`--down-bg`/`--up-bg`) — **네 가지 전부 그대로**다.
    옛 주석의 「`Row` 안에 있으면 390px 에서 4글자가 두 줄로 접힌다」는 못을 갱신하라: 그 조건은
    실측으로 해소됐다(폼 칸 217px[폰]에서 버튼 67px · 240px[와이드]에서 78px · 접힘·잘림 0).
    **「왜 예전엔 접혔는가」의 이력은 지우지 말고 남겨라** — 라벨 글꼴이 11px → 13px 로 오르기 전의
    폭 예산이었다는 사실이 다음 사람이 되돌릴 유혹을 막는다.

    **Q-06 2열 카드 방향색 틴트 (사용자 채택 C안).** `Card` 에 `side: 'buy' | 'sell'` 프롭을 더하고
    `data-side={side}` 를 내보낸다. `buyCard`(`:622`) / `sellCard`(`:782`) 호출부에서 각각 넘긴다.
    클래스는 **2열일 때만**(`@min-[700px]/lc:`) 걸린다:
      · `rounded-[var(--r-md)]` · `px-2` · `py-1.5`  ← 목업 `.vC .fcard{border-radius:var(--r-md);padding:6px 8px}` 동형
      · 배경 = `color-mix(in oklch, var(--up) 5%, var(--card-base))` (매수) / `var(--down)` (매도)
    ★ **배경 선언은 하나여야 한다.** 지금 `@min-[992px]/lc:bg-[var(--card)]` 가 있어 두 배경이
      ≥992 에서 캐스케이드로 다툰다(어느 쪽이 이기는지 클래스 문자열 순서로 결정되지 않는다).
      그 유틸리티를 **변수 스위치로 교체**하라 — `Card` 기본에 `[--card-base:transparent]`,
      `@min-[992px]/lc:[--card-base:var(--card)]`. 그러면 배경 선언은 위 한 줄뿐이고, 폰은 틴트 없음
      (700 미만은 클래스가 아예 안 걸린다) · 컴팩트/와이드는 투명 위 5% · 데스크톱은 `--card` 위 5% 가 된다.
      결과적으로 데스크톱에서 **배경만 틴트가 되고 테두리는 `--border` 그대로**다 — Q-06 이 요구한 그대로이며,
      더티 테두리(`--primary`)와 충돌하지 않는다.
    ★ 5% 를 **올리지 마라.** 목업에서 검증된 값이고, 그 위에 흰 입력칸이 얹힌다.
    ★ 색이 유일한 채널이 아님을 유지하라 — 그룹 제목(「매수주문」/「매도주문」)과 폰 탭 문구를
      **한 글자도 건드리지 마라**(WCAG 1.4.1 의 비색 경로다).
    `Card` 의 JSDoc 에 ⓐ 틴트가 왜 2열부터인지(폰은 탭이 이미 어느 쪽인지 말한다) ⓑ `--card-base`
    변수를 쓴 이유(배경 선언 하나) ⓒ 가로 패딩 8px×2 가 카드 안쪽 폼 폭을 16px 줄인다는 사실을
    적어라 — ⓒ 는 본문 700px 경계의 잘림 여유를 갉아먹을 수 있고, jsdom 에는 레이아웃이 없어
    유닛으로 증명할 수 없다(Task 3 이 WINDOWS 에 등재한다).

    **테스트 추가 (`limit-chaser-form.test.tsx`)** — 기존 단언은 **한 줄도 지우지 마라.**
    새 케이스 4개:
      · `NumInput` 안쪽 input 이 `data-focus-ring="seamless"` 를 갖는다
      · 같은 폼의 체크박스 input 에는 그 속성이 **없다**
      · 「감시 대상」 그룹의 `parentElement` 가 `Row` 와 같은 2열 그리드 클래스를 갖고, 그룹이
        그 부모의 **두 번째** 자식이며, `role`/`aria-label`/더티 테두리 분기가 그대로다
      · `data-side="buy"` / `data-side="sell"` 카드가 각각 `--up` / `--down` 5% 배경 클래스를
        `@min-[700px]/lc:` 접두로만 갖는다 (접두 없는 배경 클래스가 없다는 것까지 확인 — 폰 틴트 금지)
  </action>

  <verify>
    <automated>cd /Users/alex/repos/gh-radar &amp;&amp; pnpm -C webapp test src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/vi-settings-card.test.tsx &amp;&amp; pnpm -C webapp typecheck &amp;&amp; test "$(grep -cE 'focus-visible:ring-[0-9]' webapp/src/components/ui/textarea.tsx || true)" = 0 &amp;&amp; for f in webapp/src/components/ui/input.tsx webapp/src/components/ui/textarea.tsx webapp/src/components/trading/vi-settings-card.tsx webapp/src/components/trading/limit-chaser-form.tsx; do src=$(grep -vE '^[[:space:]]*(\*|//|/\*)' "$f"); n=$(printf '%s\n' "$src" | grep -cF 'data-focus-ring="seamless"' || true); b=$(printf '%s\n' "$src" | grep -cE 'focus-(visible|within):border-(\[var\(--ring\)\]|ring)' || true); echo "$f seamless=$n border=$b"; [ "$n" -ge 1 ] &amp;&amp; [ "$b" -ge 1 ] || exit 1; done &amp;&amp; test "$(grep -cF 'grid-cols-[var(--lw)_minmax(0,1fr)]' webapp/src/components/trading/limit-chaser-form.tsx || true)" -ge 3 &amp;&amp; test "$(grep -cF 'data-side=' webapp/src/components/trading/limit-chaser-form.tsx || true)" -ge 1</automated>
  </verify>

  <done>
    네 대상 파일 **각각**이 「`data-focus-ring="seamless"` 1건 이상 **그리고** 포커스 테두리 유틸리티
    1건 이상」을 **쌍으로** 만족한다(루프가 파일별로 주석 줄을 걸러내고 둘 다 센다) —
    링을 걷은 자리에 테두리 변화가 실재함이 기계로 확인된다(T-mvo-01).
    `textarea.tsx` 전체에 Tailwind 포커스 링 유틸리티가 0건이고, 그 파일의 기존
    `focus-visible:border-ring` 은 **살아 있다**(과삭제 방지).
    `limit-chaser-form.tsx` 의 2열 그리드 선언이 3건 이상이다(`Row` · `CheckRow` · 새 세그먼트 래퍼).
    「감시 대상」 그룹이 2열 그리드의 두 번째 칸에 있고 접근성 이름·더티 테두리가 보존됐다.
    매수/매도 카드가 `data-side` 를 내보내고 방향색 5% 배경이 `@min-[700px]/lc:` 접두로만 걸린다.
    `limit-chaser-form.test.tsx` 신규 4케이스 + 기존 전 케이스 통과, `typecheck` exit 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Q-04 거래소 콤보 · Q-05 종목 변경 4가지 · Q-02(검색 입력) · Q-07 컴팩트 호가 스크롤 박스 + 전량 게이트</name>

  <files>
    webapp/src/components/trading/limit-chaser-client.tsx
    webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    webapp/src/components/orderbook/orderbook-ladder.tsx
    webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    .planning/WINDOWS.md
  </files>

  <behavior>
    - Esc → `searching` 이 닫히고 종목명 트리거가 돌아오며 선택된 종목명이 **그대로**다.
    - 검색 컨테이너 밖으로 포커스가 나가면 닫힌다.
    - 검색 결과 항목으로 포커스가 옮겨가는 동안에는 **닫히지 않는다**(항목을 고를 수 있다).
    - `searching` 중에도 `lc-quote-grid` 10칸과 현재가 블록이 계속 렌더된다.
    - 종목 트리거가 `flex-1` 을 갖지 않고, lucide svg 아이콘을 가지며, 텍스트 캐럿 문자를 갖지 않는다.
    - 2단 호가 트리에 `tabIndex=0` 인 240px 스크롤 박스가 있고 그 안의 행 수가 **20개 그대로**다.
    - 체결 테이프가 그 스크롤 박스 **밖**에 있다.
    - 3단 표 트리와 1단 사다리 트리는 구조가 변하지 않는다.
  </behavior>

  <action>
    **Q-04 데스크톱 거래소 콤보.** `:470-482` 의 `<select>` 에 데스크톱 전용 유틸리티만 더한다 —
    `@min-[992px]/lc:text-[14px]` · 높이를 명시하는 `@min-[992px]/lc:h-7` · `@min-[992px]/lc:px-1.5` ·
    그리고 기본 `py-0.5` 가 높이와 다투지 않도록 `@min-[992px]/lc:py-0`.
    ★ 좁은 폭의 `text-[10px] px-1 py-0.5` 는 **한 글자도 바꾸지 마라** — 폰 헤더는 이미 빡빡하다.
    ★ 종목명(데스크톱 20px)과 **같은 크기로 만들지 마라.** 같은 줄에 선 보조 컨트롤로 읽혀야 한다.
    ★ `appearance-none` 을 넣지 마라 — 네이티브 캐럿과 OS 선택 UI 를 잃는다(기존 주석의 규율).
    계좌 칩(`:440`)은 대상이 아니다.

    **Q-05 (a) 눌리는 컨트롤로 보이게.** `lc-stock-trigger` 의 마지막 자식인 캐럿 문자 span(`▾`,
    `aria-hidden`, `text-[10px]`)을 지우고 lucide `ChevronDown` 으로 바꾼다
    (`aria-hidden="true"` · `flex-none` · 좁은 폭 `size-3.5` / `@min-[992px]/lc:size-4` ·
    `text-[var(--muted-fg)]`). 아이콘만으로는 약하므로 트리거에 **옅은 테두리**를 더한다 —
    `border border-[var(--border-subtle)]`(기존 `hover:bg-[var(--muted)]` 과 `disabled:*` 는 유지).
    `sr-only` 「종목 변경」과 `aria-label` 을 걸지 않는 규율(WCAG 2.5.3)은 **그대로**다.

    **Q-05 (b) 터치 영역 축소.** 트리거의 `flex-1` 을 제거한다. `min-w-0` 은 남겨 긴 종목명이
    `truncate` 로 줄어들 수 있게 하고, 다른 폭 유틸리티를 새로 넣지 마라 — flex 기본값이
    「내용 폭, 필요하면 축소」다. 현재가 블록의 `ml-auto`(`:524`)는 **그대로 둔다**.

    **Q-05 (d) 하단이 바뀌지 않게 + 레이아웃 점프 방지.** 헤더 행 구조를 다음으로 바꾼다:
      · 왼쪽 자리 = `isin === '' || searching` 이면 `StockSearchField`, 아니면 종목명 트리거
      · 오른쪽 현재가 블록 = **`isin !== ''` 이면 항상 렌더** (검색 중에도 남는다)
      · `:563` 의 `{isin !== '' && !searching && (` 에서 **`!searching` 조건을 제거**한다 —
        이것이 「하단 내용이 바뀐다」의 원인이다
    ★ Q-05 의 문장 그대로 「검색 입력은 **종목명 자리에** in-place 로」다 — 현재가까지 사라지면
      그것이 가장 큰 점프다.
    점프를 더 줄이기 위해 `StockSearchField` 의 입력 높이를 `h-10` → `h-9` 로 낮추고 결과 `<ul>` 의
    `top-11` 을 `top-10` 으로 함께 내려 목록이 입력에 붙어 있게 한다.
    ★ 둘은 한 쌍이다 — 한쪽만 고치면 목록이 4px 떠서 마우스가 그 틈을 지날 때 닫힌 것처럼 보인다.
      그 커플링을 주석 한 줄로 남겨라.
    ★ 정확한 높이 일치는 jsdom 으로 증명할 수 없다 — 아래 WINDOWS 등재 대상이다.

    **Q-05 (c) Esc · 바깥 blur 로 복귀.** `StockSearchField` 에 `onCancel: () => void` 프롭을 더하고
    호출부에서 `() => setSearching(false)` 를 넘긴다(이미 고른 `picked` 는 **건드리지 않는다** —
    그래서 취소해도 종목이 바뀌지 않는다). 루트 `<div>`(`:1012`)에:
      · `onKeyDown` — `Escape` 면 `onCancel()`. 전파는 멈추되 기본 동작은 막지 마라.
      · `onBlur` — `e.currentTarget.contains(e.relatedTarget)` 이 **거짓일 때만** `onCancel()`.
    ★ 결과 목록을 클릭하는 도중 닫히면 항목을 영영 못 고른다. `relatedTarget` 포함 판정만으로는
      부족하다 — 일부 브라우저는 버튼 mousedown 에서 포커스를 옮기지 않아 `relatedTarget` 이
      `null` 로 온다. 결과 `<ul>` 에 `onMouseDown` 기본동작 차단을 함께 걸어 클릭 중 포커스가
      입력에서 떠나지 않게 하라(click 은 그대로 발생한다). **두 장치가 함께여야 이 실패가 닫힌다** —
      그 이유를 주석에 남겨라.
    ★ `isin === ''`(신규 진입)에서는 `searching` 이 이미 `false` 라 `onCancel` 이 무해한 no-op 이다.
      새 분기를 만들지 마라.
    ★ 편집 진입(`parsedKey !== null`)의 잠금은 **그대로**다 — 트리거가 `disabled` 라 검색이 열리지 않는다.

    **Q-02 (남은 1곳).** `StockSearchField` 의 `<input>`(`:1013`)에 `data-focus-ring="seamless"` 를 더하고,
    같은 요소 클래스에 `focus-visible:border-[var(--ring)]` 을 더한다.
    ★ 이 입력은 래퍼가 아니라 **자기 자신이 테두리를 갖는다**(`border-[var(--input)]`) — `focus-within:`
      이 아니라 `focus-visible:` 이다. 링만 걷고 테두리가 안 바뀌면 포커스가 보이지 않는다(WCAG 2.4.7).

    **Q-07 컴팩트 2단 호가 → 5단 높이 스크롤 박스.** `orderbook-ladder.tsx` 의 **2단 트리
    (`data-tree="two"`)만** 고친다. 3단 표(`data-tree="three"`)와 1단 사다리(`data-tree="one"`)는
    **한 줄도 건드리지 마라** — 와이드는 체결이 매수 10단 왼쪽 칸에 들어가 아래로 밀리지 않고
    폼과 이미 27px 차이다(5단으로 줄이면 267px 가 빈다).
      · `ChaserLadder` 에 2단 전용 ref 3개를 새로 둔다: 스크롤 박스(`HTMLDivElement`),
        매수 1호가 행(`HTMLTableRowElement`), 1회 정렬 플래그. **기존 `scrollRef`/`bidTopRef`/
        `centeredRef` 를 재사용하지 마라** — 세 트리가 동시에 DOM 에 있고(숨김은 CSS) 하나의 ref 가
        마지막 마운트에 덮어씌워진다.
      · `twoRow(row, isBidTop)` 의 `<tr>` 에 `ref={isBidTop ? <새 행 ref> : undefined}` 를 단다.
        `isBidTop` 인자는 이미 매수 1호가에만 `true` 로 온다(`:947`).
      · `<table>` 을 스크롤 박스 `<div>` 로 감싼다 — `ref` · `tabIndex={0}` ·
        `data-slot="ladder-scroll-two"` · `relative h-[240px] overflow-x-hidden overflow-y-auto`.
        `<hr>` 과 `<TradeTape compact …>` 는 **박스 밖**(아래)에 그대로 둔다 — 체결 10건은 유지된다.
      · 초기 스크롤은 1단 사다리의 장치(`:646-653`)를 **그대로 따른다**: 최초 1회만,
        `row.offsetTop - box.clientHeight / 2`, `offsetHeight / 2` 를 **더하지 않는다**
        (맞추는 것은 행의 중앙이 아니라 매도1/매수1 **위 경계**다).
        ★ 한 가지만 더한다 — `box.clientHeight === 0` 이면 **아무것도 하지 않고 플래그도 세우지 말고**
          반환하라. 숨겨진 트리(`display:none`)는 높이가 0 이라, 없으면 밴드를 건너오는 순간
          정렬 기회가 이미 소진돼 사용자가 매도 10단 한가운데서 시작하게 된다.
          1단 트리의 기존 effect 는 **고치지 마라**(이번 승인 범위 밖이다) — 대신 두 effect 가
          왜 다른지 주석 한 줄로 남겨라.
      · **단수를 자르지 마라.** `asks`/`bids` 매핑은 그대로 20행 전부를 렌더한다. 박스 높이만 자른다.
      · 주석에 커플링을 못박아라: **240 = 24 × 10** 이고 24px 은 `twoRow` 가격 셀의 `h-6` 이다 —
        한쪽만 고치면 마지막 행이 반쯤 잘린다. 그리고 `tabIndex={0}` 이 필요한 이유
        (박스 안에 포커스 가능한 자식이 없어 박스가 포커스를 못 받으면 키보드 사용자는 매수 10단을
        영영 볼 수 없다 — axe `scrollable-region-focusable`, serious. 1단 사다리가 같은 이유로 이미 그렇다).
      · `aria-label` 은 안쪽 `<table>` 이 이미 갖고 있으므로 박스에 **중복 라벨을 달지 마라**.

    **테스트 (기존 단언 삭제 0건).**
    `limit-chaser-client.test.tsx` ⑰ describe 에 추가:
      · Esc → 검색이 닫히고 종목명이 바뀌지 않는다
      · 컨테이너 밖으로 blur → 닫힌다 / 결과 목록 항목으로 포커스가 갈 때는 닫히지 않는다
      · 검색 중에도 `lc-quote-grid` 가 살아 있고 칸이 10개이며 현재가 블록이 남아 있다
      · 트리거가 `flex-1` 클래스를 갖지 않고 svg 아이콘을 가지며 텍스트 캐럿 문자를 갖지 않는다
        (`textContent` 기반으로 확인 — 소스 grep 이 아니라 렌더 결과로 잠근다)
      · 거래소 `<select>` 가 `@min-[992px]/lc:` 접두 크기 유틸리티를 갖고 `appearance-none` 이 없으며
        좁은 폭 `text-[10px]` 이 그대로다
      · 검색 입력이 `data-focus-ring="seamless"` 를 갖는다
    `orderbook-ladder-chaser.test.tsx` ⑰ 계열에 추가:
      · ⑰e — 2단 트리에 `ladder-scroll-two` 박스가 있고 `tabIndex=0` · `h-[240px]` · `overflow-y-auto`,
        그 안의 `ladder-row-two` 행이 **20개 그대로**다
      · ⑰f — 체결 테이프가 그 박스 **밖**에 있다(`box.contains(tape)` 이 거짓)
      · ⑰g — 3단 표 트리와 1단 사다리 트리에는 `ladder-scroll-two` 가 없고 1단의 `h-[340px]` 박스가
        그대로다(와이드·폰 불변 회귀 잠금)

    **전량 게이트 + 미검증 등재 (마지막).**
    ① `pnpm -C webapp test` → **785 passed / 1 skipped / 63 files 아래로 내려가지 않는다**(신규 증가는 정상)
    ② `pnpm -C webapp typecheck` exit 0 ③ `pnpm -C webapp lint` error 0 · warning 정확히 3건
    ④ 루트 `pnpm build` exit 0
    ⑤ **WINDOWS 등재** — jsdom 에 레이아웃이 없어 증명하지 못한 항목을 `gsd_run windows append`
    (`--kind unrun-verify --phase quick-260912-mvo --file <경로> --description "…"`)로 한 건씩 넣어라.
    최소 다섯 건이다:
      ⓐ Playwright 미실행 — e2e 3파일의 새 계약은 `tsconfig.e2e.json` 타입 통과로만 확인했다
      ⓑ Q-03 세그먼트 버튼 폭(폰 67px · 와이드 78px, 접힘·잘림 0)은 목업 실측일 뿐 실기기 미확인
      ⓒ Q-06 카드 가로 패딩 8px×2 가 본문 700px 경계의 잘림 여유를 16px 갉아먹는다 — 미측정
      ⓓ Q-07 240px 박스 안 초기 스크롤이 매도1/매수1 경계를 정중앙에 놓는지는 브라우저 미확인
        (jsdom `offsetTop`·`clientHeight` 는 0)
      ⓔ Q-05 검색 입력(`h-9`)과 종목명 블록의 높이 차로 인한 잔여 점프량 미측정
    ★ **없는 검증을 했다고 적지 마라.** 게이트 숫자는 실제 출력에서 옮겨라.
  </action>

  <verify>
    <automated>set -o pipefail; cd /Users/alex/repos/gh-radar &amp;&amp; OUT="${TMPDIR:-/tmp}/mvo" &amp;&amp; mkdir -p "$OUT" &amp;&amp; pnpm -C webapp test 2>&amp;1 | tee "$OUT/test.out" &amp;&amp; pnpm -C webapp typecheck &amp;&amp; pnpm -C webapp lint 2>&amp;1 | tee "$OUT/lint.out" &amp;&amp; pnpm build &amp;&amp; TF=$(grep -oE 'Test Files +[0-9]+ passed' "$OUT/test.out" | grep -oE '[0-9]+') &amp;&amp; TP=$(grep -oE 'Tests +[0-9]+ passed' "$OUT/test.out" | grep -oE '[0-9]+') &amp;&amp; W=$(grep -c 'Warning:' "$OUT/lint.out" || true) &amp;&amp; E=$(grep -c 'Error:' "$OUT/lint.out" || true) &amp;&amp; echo "files=$TF passed=$TP warnings=$W errors=$E" &amp;&amp; [ "$TF" -ge 63 ] &amp;&amp; [ "$TP" -ge 785 ] &amp;&amp; [ "$W" -eq 3 ] &amp;&amp; [ "$E" -eq 0 ] &amp;&amp; test "$(grep -cF 'ladder-scroll-two' webapp/src/components/orderbook/orderbook-ladder.tsx || true)" -ge 1 &amp;&amp; CSRC=$(grep -vE '^[[:space:]]*(\*|//|/\*)' webapp/src/components/trading/limit-chaser-client.tsx) &amp;&amp; CN=$(printf '%s\n' "$CSRC" | grep -cF 'data-focus-ring="seamless"' || true) &amp;&amp; CB=$(printf '%s\n' "$CSRC" | grep -cE 'focus-(visible|within):border-(\[var\(--ring\)\]|ring)' || true) &amp;&amp; echo "limit-chaser-client seamless=$CN border=$CB" &amp;&amp; [ "$CN" -ge 1 ] &amp;&amp; [ "$CB" -ge 1 ] &amp;&amp; test "$(grep -cF 'quick-260912-mvo' .planning/WINDOWS.md || true)" -ge 5</automated>
  </verify>

  <done>
    `pnpm -C webapp test` 가 exit 0 이고 Test Files ≥ 63 · Tests passed ≥ 785 · skipped 1 이다(감소 0).
    `pnpm -C webapp typecheck` exit 0 · `pnpm -C webapp lint` 가 Error 0 · Warning 정확히 3 ·
    루트 `pnpm build` exit 0.
    2단 호가 트리에 `ladder-scroll-two` 박스가 있고 그 안의 행이 20개이며, 3단·1단 트리 구조가 불변이다.
    검색 중 `lc-quote-grid` 10칸과 현재가가 살아 있고, Esc·바깥 blur 가 종목을 바꾸지 않고 닫는다.
    종목 검색 입력이 `data-focus-ring="seamless"` 와 포커스 테두리 유틸리티를 **쌍으로** 갖는다
    (주석 줄을 걸러낸 grep 이 둘 다 1건 이상) — 링을 걷은 자리에 테두리 변화가 실재한다(T-mvo-01).
    `.planning/WINDOWS.md` 에 이번 quick 의 `unrun-verify` 항목이 5건 이상 등재됐다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 DOM → 사용자 | 상따는 실계좌 발주 설정 화면이다. 잘못 읽힌 숫자·잘못 눌린 컨트롤이 곧 오발주다 |
| 키보드/스크린리더 → 화면 | 포커스·스크롤 가능 영역이 접근성 트리에서 사라지면 그 정보는 그 사용자에게 존재하지 않는다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-mvo-01 | Information Disclosure (역: 정보 소실) | `globals.css` §8.5.5 + 5개 텍스트 입력 | high | mitigate | `seamless` 로 링만 걷고 테두리 변화를 넣지 않으면 포커스가 **보이지 않는다**(WCAG 2.4.7). Task 2·3 이 대상마다 테두리 채널을 같이 넣고, 체크박스·버튼·링크·`<select>`·`type=range` 는 제외한다 |
| T-mvo-02 | Denial of Service (키보드 사용자) | `orderbook-ladder.tsx` 2단 스크롤 박스 | high | mitigate | 박스에 포커스 가능한 자식이 없다 — `tabIndex={0}` 누락 시 매수 6~10단이 키보드로 도달 불가(axe `scrollable-region-focusable`, serious). ⑰e 가 속성을 잠근다 |
| T-mvo-03 | Denial of Service (기능 상실) | `StockSearchField` blur 취소 | high | mitigate | 결과 항목 클릭 도중 목록이 닫히면 종목을 영영 못 고른다. `relatedTarget` 포함 판정 + 결과 `<ul>` mousedown 기본동작 차단, 두 장치를 함께 건다 |
| T-mvo-04 | Tampering (정보 은폐) | `orderbook-ladder.tsx` 2단 트리 | high | mitigate | 5단만 렌더하면 6~10단을 볼 방법이 사라진다. 박스 **높이만** 자르고 20행 전부 렌더 — ⑰e 가 행 수 20을 잠근다 |
| T-mvo-05 | Elevation of Privilege (UI 오조작) | `limit-chaser-client.tsx` 헤더 | medium | mitigate | 검색 중 종목정보 10칸이 사라지면 사용자가 「종목이 바뀌었다」고 오독한다. `!searching` 조건 제거 + 현재가 유지, 유닛으로 잠근다 |
| T-mvo-06 | Repudiation (색 단독 전달) | `Card` 방향색 틴트 | medium | accept | 5% 틴트는 색이지만 유일 채널이 아니다 — 그룹 제목(「매수주문」/「매도주문」)과 폰 탭 문구가 글자로 말한다(WCAG 1.4.1). 그 문구를 건드리지 않는 것이 수용 조건이다 |
| T-mvo-07 | Tampering (시각 회귀) | `Card` 가로 패딩 8px×2 | medium | accept | 본문 700px 경계의 잘림 여유를 16px 줄인다. jsdom 에 레이아웃이 없어 유닛 증명 불가 — WINDOWS ⓒ 로 등재하고 실기기 확인 전까지 열어 둔다 |
| T-mvo-08 | Denial of Service (CTA 상실) | `dirty-action-bar.tsx` | low | accept | FAB 이 `/trading/*` 에서 사라지면 겹침이 물리적으로 불가능해진다. `pr-[128px]` 은 공용 컴포넌트의 방어로 남기고, 좌표 단언을 부재 단언으로 대체해 새 사실을 잠근다 |
| T-mvo-SC | Tampering | npm/pip/cargo installs | n/a | accept | **패키지 설치 0건.** `lucide-react` 는 이미 의존성에 있고(`package.json`), `ChevronDown` 은 그 패키지의 기존 export 다 — 새 공급망 표면이 없다 |
</threat_model>

<verification>
전량 게이트는 Task 3 마지막에 한 번 돈다. 각 명령은 저장소에서 실제로 실행해 기준선을 측정한 것이다.

| 명령 | 기준선 | 허용 |
|------|--------|------|
| `pnpm -C webapp test` | 63 files · 785 passed · 1 skipped | **감소 0** (신규 테스트로 증가는 정상) |
| `pnpm -C webapp typecheck` | exit 0 (`tsc --noEmit` + `tsconfig.e2e.json`) | exit 0 |
| `pnpm -C webapp lint` | Error 0 · Warning 3 (`ScannerEmpty` · `_msg` · `use-relay-socket`) | 동일 |
| `pnpm build` (루트) | exit 0 | exit 0 |
| `git diff --name-only -- webapp/src/app/layout.tsx` | 비어 있음 | 비어 있음 |

Playwright 는 **이 세션에서 실행하지 않는다.** e2e 3파일의 새 계약은 `tsconfig.e2e.json` 타입 통과가
유일한 기계 검증이고, 그 사실은 WINDOWS ⓐ 로 등재된다.
</verification>

<success_criteria>
- Q-01 ~ Q-07 일곱 항목이 전부 구현됐고, 어느 것도 「v1」·「임시」·「나중에」로 축소되지 않았다.
- 기존 단언 **삭제 0건**. 깨진 계약은 전부 새 계약으로 다시 쓰였다(chat-fab 3케이스 · e2e 4블록).
- `webapp/src/app/layout.tsx` 무변경.
- 계획이 제외한 두 대상(`home-header.tsx` range 슬라이더 · 폼 체크박스)에 `seamless` 가 걸리지 않았다.
- 목업 정본 HTML 2건이 `${QUICK_DIR}` 에 박제됐다.
- jsdom 으로 증명 불가한 항목이 WINDOWS 에 5건 이상 등재됐고, SUMMARY 는 **하지 않은 검증을 했다고 적지 않았다.**
- 전량 게이트 4종 통과.
</success_criteria>

<output>
Create `.planning/quick/260912-mvo-7-5-ai-fab-ux/260912-mvo-SUMMARY.md` when done.

SUMMARY 에 반드시 포함:
- 게이트 숫자는 **실제 출력에서 옮긴 값** (test files/passed/skipped · lint warning 3건 목록 · build exit)
- `planning_findings` 두 건의 최종 처리 결과 (range 슬라이더 제외 사유 · `pr-[128px]` 존치 사유)
- `dirty-action-bar.tsx` 의 `pr-[128px]` 를 **후속 후보**로 명시 (오늘 소비처 둘 다 FAB 과 공존하지 않음)
- `vi-settings-card.tsx` 래퍼의 더티 `shadow-[0_0_0_2px_…]` 가 상따 `NumInput` 규율(테두리 한 겹)과
  다르다는 관찰 (이번 범위 밖 — 고치지 않았음)
- `chat/composer.tsx` 의 챗 입력 포커스가 테두리 변화로 보이는지에 대한 코드 확인 결과
- WINDOWS 등재 항목 전체 목록
</output>
