---
phase: quick-261006-pey
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 트레이서: ?tab= 공용 훅 → 종목상세 재사용 → /me 4탭 셸 · 라벨 건수
  - webapp/src/lib/use-url-tab.ts
  - webapp/src/components/stock/stock-detail-tabs.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/components/trading/__tests__/me-client.test.tsx
  # Task 2 — 설정 탭 S1 묶음 카드 4장
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
  # Task 3 — e2e 재배선 + 새 탭 e2e + 건수 콜백 단위
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/unfilled-progress.spec.ts
  - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
autonomous: true
requirements: [PEY-TABS, PEY-COUNTS, PEY-SETTINGS, PEY-TESTS]

estimate:
  tokens: 155000
  raw_tokens: 155000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "/me 계정 카드 아래에 탭 바 「현황 · 잔고 · 주문 · 설정」이 이 순서로 서고, `?tab=` 이 없거나 화이트리스트 밖 값이면 현황(status)이 활성이다 (D-1)"
    - "탭 클릭은 라우터 왕복 없이 `?tab=status|accounts|orders|settings` 를 한 클릭당 기록 1개로 push 하고, 브라우저 뒤로가기 한 번이 이전 탭으로 돌아가며, `/me?tab=settings` 같은 딥링크는 그 탭으로 바로 연다 (D-1)"
    - "현황 = 상태줄 + 전략 현황 카드 · 잔고 = 계좌마다 AccountPanel(stack) 세로 반복(계좌 0개면 「계좌 정보를 불러오는 중이에요…」) · 주문 = 오늘 주문 카드 · 설정 = 상따 기본설정 — 각 표면의 내부 동작은 그대로다 (D-1)"
    - "한 번 연 탭은 떠나도 마운트가 유지되고, 열지 않은 탭은 마운트되지 않는다 — GET /api/orders 는 주문 탭을 처음 열 때 시작되고, 탭을 오가도 다시 부르지 않는다 (D-1 · T-16-02)"
    - "잔고 탭 라벨 숫자 = 잔고 탭에 그리는 계좌들의 미체결(unf) 합(0 이면 숫자 없음) · 주문 탭 라벨 숫자 = 오늘 주문 카드 헤더 「N건」 과 같은 수(미방문·0 이면 숫자 없음) (D-1)"
    - "설정 탭은 제목 「상따 기본설정」+칩+안내가 격자 위에 한 번, 묶음 4개(매수 금액 · 후매수 · 매도 · 자동매도)가 카드 한 장씩이고, 본문 폭 ≥700 에서 2열 · 미만 1열이며, 행은 SettingRow·ChoiceRow 44px 그대로에 확정 즉시 42 저장이 그대로다 (D-2)"
    - "DMA 게이트 분기는 계정 카드 + DmaGate 뿐이고 탭이 없다 · 종목상세 3탭은 같은 공용 훅을 쓰며 동작(클릭당 기록 1개 · 뒤로가기 · 딥링크 · 한 번 연 패널 유지 · 뉴스토론 재클릭 요약 복귀 · 옛 orderbook 딥링크)이 그대로다 (D-1)"
  artifacts:
    - path: webapp/src/lib/use-url-tab.ts
      provides: "`?tab=` 탭 메커니즘 정본 — useUrlTab(화이트리스트 파싱 · 방문 집합/keepMounted · 실시간 URL 가드 + pushState + 탭 바 스크롤) + 탭 바·목록·트리거 클래스 상수 3종"
    - path: webapp/src/components/trading/me-client.tsx
      provides: "MeTabs 4탭 셸(Suspense 경계 안) · ME_TABS · unfilledCountOf · 계정 카드는 탭 위 공통"
    - path: webapp/src/components/stock/stock-detail-tabs.tsx
      provides: "공용 훅 소비 — 종목상세 고유 규칙(T9 재클릭 · 옛 orderbook 딥링크 · 폰 CTA)만 남김"
    - path: webapp/src/components/trading/today-orders-card.tsx
      provides: "선택 prop onCountChange — rows.length(헤더 「N건」) 만 올림, 조회 경로 무변경"
    - path: webapp/src/components/me/limit-chaser-defaults.tsx
      provides: "S1 묶음 카드 4장 · 섹션 컨테이너 @container/me · 700 이상 2열 격자 · 카드마다 행 목록 @container/lc"
  key_links:
    - from: webapp/src/components/trading/me-client.tsx
      to: webapp/src/lib/use-url-tab.ts
      via: "useUrlTab(ME_TAB_VALUES, 'status') — 탭 값이 URL 단일 진실"
      pattern: "useUrlTab\\("
    - from: webapp/src/components/stock/stock-detail-tabs.tsx
      to: webapp/src/lib/use-url-tab.ts
      via: "useUrlTab(STOCK_TAB_VALUES, DEFAULT_TAB) — 두 벌이 갈리지 않게 같은 구현"
      pattern: "useUrlTab\\("
    - from: webapp/src/components/trading/me-client.tsx
      to: webapp/src/components/trading/today-orders-card.tsx
      via: "onCountChange={setOrdersCount} — 주문 탭 라벨 숫자"
      pattern: "onCountChange"
    - from: webapp/src/components/me/limit-chaser-defaults.tsx
      to: "섹션 루트 컨테이너"
      via: "@container/me 선언 + 격자 @min-[700px]/me:grid-cols-2 — 같은 이름이어야 2열이 걸린다"
      pattern: "@min-\\[700px\\]/me:grid-cols-2"
---

<objective>
`/me` 마이페이지를 계정 카드 아래 상단 4탭(현황 · 잔고 N · 주문 N · 설정)으로 재구성하고(D-1), 「설정」 탭의 상따 기본설정을
묶음 카드 4장(데스크톱 본문 2열)으로 바꾼다(D-2). 탭 메커니즘은 종목상세 3탭의 `?tab=` 구현을 **공용 훅으로 뽑아 두 화면이 같은
코드**를 쓰게 한다 — 사본을 두지 않는다.

Purpose: 현행 /me 는 상태줄 → 상따 기본설정(11행 펼침) → 전략 → 계좌별 미체결·잔고 → 오늘 주문이 한 세로 열에 쌓여 어느 것도 빨리
읽히지 않는다. 한 번에 한 표면(sketch 013 변형 A)과 설정 카드화(변형 S1)로 세로 길이와 탐색 비용을 줄인다.

Output: `webapp/src/lib/use-url-tab.ts`(신규) · `me-client.tsx` 4탭 셸 · `stock-detail-tabs.tsx` 훅 소비 · `today-orders-card.tsx`
건수 콜백 · `limit-chaser-defaults.tsx` S1 카드 · 단위/e2e 갱신과 새 탭 e2e. **이동 + 래핑만** — 카드·패널 내부 로직, 데이터 경로,
relay 계약, 조회 횟수는 바꾸지 않는다(CONTEXT 「범위 밖」 · T-16-02).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/261006-pey-mypage-redesign/261006-pey-CONTEXT.md
@.planning/sketches/013-mypage-ia/README.md
@webapp/src/components/trading/me-client.tsx
@webapp/src/components/stock/stock-detail-tabs.tsx

# 큰 파일은 범위만 읽는다 (각 task 의 read_first)
# 목업 정본: .planning/sketches/013-mypage-ia/index.html `function A()`(243-250) · `.tabs4`(85-88) · `.sgrid`(100-101)
#            .planning/sketches/013-mypage-ia/settings.html `function S1()`(100) · `.sgrid/.sg`(47-50)
</context>

<locked_decisions>
사용자 결정(2026-10-06, CONTEXT.md — 다시 묻지 않는다):

- **D-1 정보 구조 = A 상단 4탭.** 계정 카드 아래 탭 바 「현황 · 잔고 N · 주문 N · 설정」. 종목상세 4탭과 같은 문법·같은 메커니즘 —
  `?tab=` 단일 진실 · pushState(뒤로가기 = 이전 탭) · 화이트리스트 밖은 기본 탭 · 한 번 방문한 탭 계속 마운트(forceMount +
  `data-[state=inactive]:hidden`) · sticky 탭 바. 기본 탭 `status`. 값 `status·accounts·orders·settings`, 라벨 현황·잔고·주문·설정.
  현황 = 상태줄(`MeStatusBar`) + 전략 현황 카드(현황|로그 세그먼트 그대로). 상태줄은 현황 탭 **안**(전 탭 공통 아님).
  잔고 = 계좌마다 `AccountPanel`(stack · 계좌 전용) 세로 반복 + 로딩 문구, 라벨 = 미체결 합(0 이면 생략).
  주문 = `TodayOrdersCard` 그대로, 조회 페이지당 1회(미방문 탭은 조회 0), 라벨 = 헤더 「N건」 과 같은 수(미방문이면 생략), 콜백 하나만 추가.
  설정 = `LimitChaserDefaultsSection`(D-2 모양). 계정 카드(테마·로그아웃)는 탭 위 공통. DMA 게이트 분기 무변경(탭 없음).
  세로 순서 계약(D-20)은 탭 순서로 승계 — 현황(상태줄·전략) → 잔고(계좌) → 주문 → 설정.
- **D-2 설정 행 모양 = S1 묶음 카드 4장.** 묶음(`USER_SETTINGS_GROUPS`)마다 `CARD` 한 장(radius 16), 카드 머리 = 묶음 이름 13px/600 muted.
  행은 `SettingRow`·`ChoiceRow` 44px 그대로(새 입력 컴포넌트 0), 각 카드 행 목록에 `LC_CONTAINER_CLASS`. 데스크톱(본문 ≥ ~700) 2열
  `align-items:start` · 폰 1열. 제목+칩+안내는 격자 위에 한 번(`USER_SETTINGS_STATUS_TEXT` 문구 그대로 · D-13). 거부 줄 · 키패드 시트 ·
  `useUserSettingsSave` 무변경(행 확정 즉시 42, 저장 버튼 없음).
- **범위 밖.** 데이터 경로·relay 계약·조회 횟수 변경 금지(T-16-02). 표면 **내부**는 이동+래핑만(설정 섹션만 카드 재배치). 계좌 선택 UI
  금지(D-21). 전체 비활성화는 현황 탭 전략 카드 안 그대로(D-09).

플래너 재량 결정(Claude's Discretion — 실행자는 이대로 구현하고 SUMMARY 에 재량 결정으로 적는다):

- **P-1 공용 훅으로 추출한다.** `webapp/src/lib/use-url-tab.ts` 가 종목상세의 메커니즘(T3 pushState·가드 · T8 방문 유지 · T-15-37
  화이트리스트 · 탭 바 스크롤)을 **옮겨 받은** 정본이고, 종목상세와 /me 가 둘 다 import 한다. 종목상세 고유 규칙(T9 뉴스토론 재클릭 →
  요약 복귀 · D-31 옛 `?tab=orderbook` 딥링크 · 폰 「트레이딩」 CTA)은 종목상세에 남긴다. 탭 바·목록·트리거 클래스도 공용 상수로 둔다.
- **P-2 탭 바 배경만 호출부가 정한다.** 종목상세 `bg-[var(--bg)]`(plain 면), /me `bg-[var(--surface)]`(라이트 회색 본문면 — 다크는 `--bg`
  와 같다). 목록 폭 제한도 호출부(종목상세 `mx-auto max-w-4xl`, /me 는 PAGE_WRAP 900 이 이미 제한).
- **P-3 Suspense 경계는 MeClient 안 탭 영역(MeTabs)만.** `/me` 는 정적 라우트라 `useSearchParams` 에 Suspense 경계가 필요하다(Next 15 —
  `/trading` · `/scanner` 관례). `me-page` 래퍼 · 제목 · 계정 카드는 경계 **밖**이라 서버 HTML 에 그대로 남는다(me.spec 6 「서버 응답에
  `data-slot="me-page"`」 계약). 폴백은 `null`(스켈레톤 위장 금지 — `/trading` 관례). `app/me/page.tsx` 는 건드리지 않는다.
- **P-4 설정 2열 = 섹션 컨테이너 쿼리.** `/me` 본문 폭은 사이드바(240/64/없음)·앱 셸에 따라 뷰포트와 어긋나므로 뷰포트 bp 가 아니라
  본문 폭으로 판정한다(CLAUDE.md 상따 컨테이너 규율과 같은 결). 섹션 루트에 `@container/me`, 격자에 `@min-[700px]/me:grid-cols-2`.
  700 = 목업 「본문 ≥ ~700」 = 작업대 `@min-[700px]/wb`(card-grid) 선례. 컨테이너는 **섹션 루트에만** 단다 — 페이지 루트에 달면
  `container-type` 이 `position:fixed` 자손의 컨테이닝 블록이 되는 §2.2b 함정에 /me 전체가 걸린다. 섹션 안 fixed 요소는 `Dialog.Portal`
  로 body 에 서는 `NumberPadSheet` 뿐이라 안전하다.
- **P-5 잔고 건수 = 잔고 탭에 그리는 계좌(`accounts`)마다 `accountStates.get(accountNo)?.unf.length ?? 0` 의 합.** 각 계좌 패널의
  「미체결 (N)」 합과 같은 수다(`account-panel` 의 `unfilled` 는 `account.unf` 1:1). relay 컨텍스트만 읽으므로 조회가 아니다 —
  잔고 탭 미방문이어도 숫자가 선다.
- **P-6 패널 글자 크기 보존.** shadcn `TabsContent` 기본 `text-sm` 이 옮겨 넣은 표면의 상속 글자 크기를 바꾸지 않도록 /me 패널 클래스에
  `text-[length:var(--t-base)]`(body 와 같은 값)를 둔다 — twMerge 가 `text-sm` 을 대체한다(내부 무변경 원칙).
- **P-7 탭 전환 스크롤은 공용 동작 그대로.** 전환 시 탭 바 기준 `scrollIntoView({ block: 'start' })` — 종목상세와 같은 문법이라 /me 에서도
  탭을 바꾸면 탭 바가 화면 위로 온다(계정 카드는 위로 지나간다). 옵션으로 갈라 두 벌을 만들지 않는다.
- **K-1 알려진 선행 제약(고치지 않는다 — 기록만).** AppShell `<main>` 이 `overflow-auto` 이고 실제 스크롤 주체는 창(window)이다
  (`webapp/src/lib/tab-scroll-memory.ts` 헤더). `main` 이 스크롤 컨테이너이면서 스스로 스크롤하지 않으므로 그 안의 CSS `sticky` 는 실제로
  고정되지 않는 것으로 보인다(종목상세 탭 바도 같다 · 메모 「sticky 함정」). 이 quick 은 종목상세와 **같은 sticky 클래스**로 D-1 을
  이행하고 `app-shell.tsx` 는 건드리지 않는다(전 페이지 영향 셸 변경 = 범위 밖). Task 3 이 관찰값만 SUMMARY 에 남긴다 → 사용자 결정.
</locked_decisions>

<interfaces>
공용 훅 계약(Task 1 이 만든다 — 시그니처 고정, 내부 구현은 종목상세 현행 코드를 옮긴다):

```ts
// webapp/src/lib/use-url-tab.ts
export interface UrlTab<T extends string> {
  active: T;                                   // parse(useSearchParams().get('tab'))
  parse: (raw: string | null) => T;            // values 밖이면 defaultValue (T-15-37)
  keepMounted: (v: T) => true | undefined;     // 방문한 탭이면 true (TabsContent forceMount 용)
  select: (next: string) => void;              // 가드 → pushState(null, '', `?tab=${value}`) → tabBarRef 스크롤
  tabBarRef: React.RefObject<HTMLDivElement | null>;
}
export function useUrlTab<T extends string>(values: readonly T[], defaultValue: T): UrlTab<T>;
// values 는 모듈 상수로 넘긴다 — 매 렌더 새 배열이면 parse/select 가 매번 바뀐다.

export const URL_TAB_BAR_CLASS =   // 배경 없음 — 호출부가 bg 를 붙인다(P-2)
  'sticky top-0 z-20 -mx-2 border-b border-[var(--border-subtle)] px-2 md:-mx-4 md:px-4 lg:-mx-6 lg:px-6';
export const URL_TAB_LIST_CLASS =  // 폭 제한 없음 — 호출부가 붙인다(P-2)
  'h-auto w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const URL_TAB_TRIGGER_CLASS =
  'h-[50px] flex-none rounded-none border-b-2 border-transparent px-3 text-[17px] font-semibold text-[var(--muted-fg)] shadow-none after:hidden hover:text-[var(--fg)] data-[state=active]:border-b-[var(--nav-on-line)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--nav-on-fg)] data-[state=active]:shadow-none';
```

/me 탭 상수와 건수(Task 1 — me-client.tsx):

```ts
const ME_TABS = [
  { v: 'status', label: '현황' }, { v: 'accounts', label: '잔고' },
  { v: 'orders', label: '주문' }, { v: 'settings', label: '설정' },
] as const;
export function unfilledCountOf(
  accounts: readonly { accountNo: string }[],
  accountStates: ReadonlyMap<string, RelayAccountState>,
): number;   // P-5
// TodayOrdersCard: export function TodayOrdersCard({ onCountChange }: { onCountChange?: (count: number) => void } = {})
```

이미 있는 것(재사용 — 변경 없음): `Tabs/TabsList/TabsTrigger/TabsContent`(`webapp/src/components/ui/tabs.tsx` — TabsTrigger 는
`inline-flex gap-1.5`, TabsContent 기본 `flex-1 text-sm`, 두 컴포넌트 모두 `data-slot` 을 먼저 박고 props 를 펼치므로 `data-slot` 을 넘기면
덮인다 → 패널 식별은 `data-testid`) · `PAGE_WRAP`/`CARD`/`SECTION_COUNT`(`webapp/src/components/layout/page-layout.ts`) ·
`LC_CONTAINER_CLASS`(`webapp/src/components/trading/card/constants.ts`) · `SettingRow`/`ChoiceRow`(`webapp/src/components/trading/lc/setting-group.tsx`).
</interfaces>

<tasks>

<task type="tracer">
  <name>Task 1 (트레이서): `?tab=` 공용 훅 추출 → 종목상세 재사용 → /me 4탭 셸 · 라벨 건수 결선</name>
  <files>webapp/src/lib/use-url-tab.ts, webapp/src/components/stock/stock-detail-tabs.tsx, webapp/src/components/trading/me-client.tsx, webapp/src/components/trading/today-orders-card.tsx, webapp/src/components/trading/__tests__/me-client.test.tsx</files>
  <read_first>
    - webapp/src/components/stock/stock-detail-tabs.tsx 전체(266줄 — 옮길 메커니즘의 원본과 주석)
    - webapp/src/components/trading/me-client.tsx 전체(352줄 — 헤더 주석 ①~⑥ · MeStatusBar · MeClient 본문 270-352)
    - webapp/src/components/trading/today-orders-card.tsx 1-30 · 240-432(헤더 ②⑨ · 함수 머리 · rows · 헤더 「N건」 419-430)
    - webapp/src/components/ui/tabs.tsx 57-95 · webapp/src/components/layout/page-layout.ts · webapp/src/lib/tab-scroll-memory.ts 1-30(K-1 근거)
    - webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx 1-135 · 277-285(회귀 게이트 — 이 파일은 수정하지 않는다)
    - webapp/src/components/trading/__tests__/me-client.test.tsx 전체(목 구성)
    - 이 PLAN 의 `<locked_decisions>` · `<interfaces>`
  </read_first>
  <action>
이 태스크가 한 경로 전부다: URL `?tab=` → 공용 훅 → (종목상세 3탭 · /me 4탭) 탭 셸 → 패널. 이동 + 래핑만 한다(D-1 · CONTEXT 범위 밖).

(A) 신규 `webapp/src/lib/use-url-tab.ts` (P-1 · D-1). 맨 위 `'use client'`. `<interfaces>` 의 시그니처·클래스 문자열 그대로. 구현은
종목상세의 현행 코드를 **옮긴다**: active = parse(검색 파라미터 tab) — URL 이 단일 진실이라 초기 state 없음 · 방문 집합은 렌더 중 갱신
(현행 `if (!visited.has(active)) setVisited(...)` 그대로) · select 는 parse → 실시간 `window.location.search` 의 tab 을 parse 해 같으면
즉시 반환(한 클릭 = 기록 1개 가드 · Radix mousedown+focus 이중 호출) → 쿼리만 쓰는 상대 URL 로 pushState 호출 → 탭 바
scrollIntoView({ block: 'start' }). parse·select 는 useCallback([values, defaultValue] / [parse]). 파일 머리 한국어 주석: ① 이 파일이
`?tab=` 탭 셸의 정본이고 종목상세 3탭 · /me 4탭(quick-261006-pey D-1)이 함께 쓴다 — 새 탭 셸은 사본을 만들지 말고 이 훅을 쓴다
② 옮겨 온 계약 T3(push 계열 · 라우터 왕복 제거 · 260913-v2e 가드) · T8(한 번 연 패널 유지) · T-15-37(화이트리스트)의 원문 설명
③ 클래스 상수 — 바의 `-mx/px` 상쇄가 AppShell 본문 패딩 램프(8/16/24)와 같은 bp 로 갈려야 한다는 기존 T4 주석 이전, 배경·폭은
호출부 몫(P-2) ④ K-1 선행 제약 한 단락(main overflow-auto · 창 스크롤 → sticky 실효 의문 · 셸 변경은 범위 밖).

(B) `webapp/src/components/stock/stock-detail-tabs.tsx` 를 훅 소비로 바꾼다 — **동작 변화 0**. `TABS` · `DEFAULT_TAB` 는 두고 모듈 상수
`STOCK_TAB_VALUES` 를 더한다. 옛 화이트리스트 파서 함수 · visited state · keepMounted · 가드/푸시/스크롤 본문 · tabBarRef 를 지우고
`const tab = useUrlTab(STOCK_TAB_VALUES, DEFAULT_TAB)` 로 대신한다. handleValueChange 는 T9 판정만 남긴다: 다음 값이 news 이고 실시간
URL 의 tab(`tab.parse` 로 읽음)이 news 이며 `toNewsView(view) !== null` 이면 `exitNewsView(code)` 후 반환, 아니면 `tab.select(next)`.
옛 orderbook useEffect(검색 파라미터 · 라우터 사용) · CTA · TabsContent 3개(data-testid · NARROW_PANEL) · 트리거 onClick 은 그대로.
바 = cn(URL_TAB_BAR_CLASS, 'bg-[var(--bg)]'), 목록 = cn('mx-auto max-w-4xl', URL_TAB_LIST_CLASS), 트리거 = URL_TAB_TRIGGER_CLASS.
헤더 주석 T3·T4·T8 항목 끝에 「메커니즘 정본은 `lib/use-url-tab.ts`(quick-261006-pey — /me 4탭과 공유)」 한 줄. 이 파일에 pushState 를
직접 부르는 코드가 남으면 안 된다(replaceState 는 옛 딥링크 경로라 남는다).

(C) `webapp/src/components/trading/today-orders-card.tsx` — 선택 prop `onCountChange?: (count: number) => void` 하나만 더한다(D-1).
`rows.length`(헤더 「N건」 과 같은 값 — 묶기 전 전체 행)가 바뀔 때 effect 로 알린다(deps `[rows.length, onCountChange]`). 조회 ·
재조회 · 캐시 · 렌더 무변경. 헤더 주석에 ⑭ 한 단락: /me 주문 탭 라벨 숫자용 — 수만 올리고 조회 경로를 늘리지 않는다(②의
「페이지당 1회」 유지 · 주문 탭이 처음 마운트될 때 1회).

(D) `webapp/src/components/trading/me-client.tsx` (D-1).
  - 모듈 상수 `ME_TABS`(`<interfaces>`) · `ME_TAB_VALUES` · 패널 클래스 `ME_PANEL` = `flex flex-col gap-[var(--s-3)] pt-[var(--s-3)]
    text-[length:var(--t-base)] data-[state=inactive]:hidden`(P-6 · 간격 12 는 현행 D-08a 리듬).
  - export `unfilledCountOf(accounts, accountStates)`(P-5).
  - 내부 컴포넌트 `MeTabs`: useRelayContext 에서 accounts · accountStates · status, `tab = useUrlTab(ME_TAB_VALUES, 'status')`,
    `const [ordersCount, setOrdersCount] = useState<number | null>(null)`. `<Tabs value={tab.active} onValueChange={tab.select}
    className="flex-col gap-0">` → 바 div(ref = tab.tabBarRef · cn(URL_TAB_BAR_CLASS, 'bg-[var(--surface)]')) → `TabsList variant="line"
    aria-label="My page 탭" className={URL_TAB_LIST_CLASS}` → ME_TABS 순서 트리거(className URL_TAB_TRIGGER_CLASS). 트리거 내용 = 라벨,
    그리고 숫자가 0 보다 크면 `<span data-slot="me-tab-count" className={SECTION_COUNT}>` 숫자(트리거 gap-1.5 가 간격 — ml 없음).
    숫자 = accounts → unfilledCountOf, orders → ordersCount(null 이면 없음), 나머지 없음.
  - TabsContent 4개: value 별 `data-testid="me-tab-panel-{value}"` · `forceMount={tab.keepMounted(v)}` · `className={ME_PANEL}`.
    status = `<MeStatusBar />` + `<StrategyStatusCard />`. accounts = 현행 `accounts.length === 0` 로딩 `<p data-slot="me-accounts-loading">` /
    `accounts.map` → `<section data-slot="me-account-card" …><AccountPanel … stack stockHref={tradingCardHref} /></section>` 블록을 주석째
    **그대로 이동**. orders = `<TodayOrdersCard onCountChange={setOrdersCount} />`. settings = `<LimitChaserDefaultsSection />`.
  - `MeClient`: 게이트 분기 무변경. 본문은 `me-page` div(PAGE_WRAP + gap) → PageHeader → `mb-1` AccountCard → `<Suspense fallback={null}>
    <MeTabs /></Suspense>`(P-3 주석 한 줄). MeClient 는 `probeNow` · useNativeRefresh 만 남기고 계좌 관련 구조분해는 MeTabs 로 옮긴다.
  - 헤더 주석 갱신: ① 세로 순서 계약은 탭 순서로 승계(D-1 · 현황(상태줄→전략) → 잔고(계좌 A→B…) → 주문 → 설정; 계정 카드는 탭 위 공통)
    ⑤ⓑ 끝에 「주문 탭을 처음 열 때 1회 — 열지 않으면 0회」 ⑦ 신설: 4탭 셸 — 메커니즘 정본 `lib/use-url-tab.ts`, 라벨 숫자 규칙(P-5 ·
    onCountChange), P-3 Suspense 위치 이유, P-6 패널 글자 크기, 상태줄은 현황 탭 안(D-1 — 전 탭 공통 아님).
  - 사용자 대면 문구는 한글 그대로. 이 파일에도 pushState 를 직접 부르는 코드를 두지 않는다(훅만).

(E) `webapp/src/components/trading/__tests__/me-client.test.tsx`.
  - `next/navigation` 목에 `useSearchParams: () => mockSearchParams` 추가. beforeEach(각 describe 공통)에서 `mockSearchParams = new
    URLSearchParams()` 와 `window.history.replaceState(null, '', '/me')`.
  - `TodayOrdersCard` 목을 바꾼다: 렌더마다 마운트 카운터(모듈 let, mock 접두)를 effect 로 올리고, `onCountChange` 가 있으면 마운트 시
    `mockOrdersCount` 로 부르며, `<div data-slot="today-orders-card" />` 를 그린다(React 훅은 factory 안 `await import('react')`).
  - 기존 「Phase 27 /me 상따 기본설정 배치 (D-10)」 의 순서 테스트는 D-1 로 대체되었으므로 지우고, 게이트 테스트는 새 describe 로 옮긴다.
  - 새 describe 「261006-pey /me 4탭 (D-1)」 — `<behavior>` 6항을 그대로 테스트로.
  - 기존 전략 로그 · 상태줄 테스트는 기본 탭(현황)에서 **수정 없이** 통과해야 한다(로그 세그먼트는 `within(card)` 라 상단 「현황」 탭과
    이름이 겹쳐도 안전).
  </action>
  <behavior>
    - B1: 기본 렌더 — tablist 「My page 탭」 의 탭 이름이 순서대로 현황·잔고·주문·설정(정규식 `^라벨`), 현황 aria-selected=true, 현황 패널에 me-status-bar · strategy-status-card, 미방문 패널 내용(me-account-card · me-accounts-loading · today-orders-card · me-lc-defaults) 0, 오늘 주문 목 마운트 0회
    - B2: `?tab=settings` → 설정 활성 · me-lc-defaults 존재 · me-status-bar 없음 / `?tab=zzz` → 현황 활성
    - B3: 잔고 탭 클릭 → pushState 정확히 1회 `(null, '', '?tab=accounts')`(call-through 스파이) · 같은 탭 재클릭은 0회 추가
    - B4: `?tab=accounts` + 계좌 2개(unf 2건·1건) → me-account-card 2개가 계좌 순서대로 · 잔고 탭 me-tab-count = 3 / 계좌 0개 → 로딩 문구 / unf 합 0 → me-tab-count 없음 · `unfilledCountOf` 직접 단언(목록 밖 계좌의 accountStates 는 세지 않는다)
    - B5: 주문 탭 미방문이면 숫자 없음 · `?tab=orders`(mockOrdersCount 7) → 주문 탭 me-tab-count = 7 · 오늘 주문 목 마운트 1회 · rerender 로 `?tab=status` 이동 후에도 today-orders-card 가 DOM 에 남고(숨김 패널 data-state inactive) 마운트 1회 유지
    - B6: DMA 게이트(unmapped) → dma-gate 있음 · tablist 「My page 탭」 없음 · me-lc-defaults 없음
  </behavior>
  <verify>
    <automated>
grep -q "export function useUrlTab" webapp/src/lib/use-url-tab.ts \
&& grep -q "history.pushState(" webapp/src/lib/use-url-tab.ts \
&& grep -q "useUrlTab(" webapp/src/components/stock/stock-detail-tabs.tsx \
&& grep -q "useUrlTab(" webapp/src/components/trading/me-client.tsx \
&& grep -q "<Suspense" webapp/src/components/trading/me-client.tsx \
&& grep -q "onCountChange" webapp/src/components/trading/today-orders-card.tsx \
&& test "$(grep -vE '^[[:space:]]*(\*|//)' webapp/src/components/stock/stock-detail-tabs.tsx | grep -c 'history.pushState(')" = 0 \
&& test "$(grep -vE '^[[:space:]]*(\*|//)' webapp/src/components/trading/me-client.tsx | grep -c 'history.pushState(')" = 0 \
&& pnpm --filter @gh-radar/webapp exec vitest run stock-detail stock-native-refresh me-client today-orders-card \
&& pnpm --filter @gh-radar/webapp run typecheck \
&& pnpm --filter @gh-radar/webapp exec playwright test webapp/e2e/specs/stock-detail-tabs.spec.ts \
&& echo "TASK1 ALL OK"
    </automated>
  </verify>
  <done>공용 훅 하나가 두 탭 셸의 `?tab=` 동작을 소유한다. 종목상세 단위·e2e(stock-detail-tabs.test 무수정 · stock-detail-tabs.spec 전부)가 그대로 통과한다. /me 는 계정 카드 아래 4탭으로 서고 표면 4종이 해당 패널로 옮겨졌으며(내부 무변경), 잔고·주문 라벨 숫자가 P-5 · onCountChange 규칙대로 붙는다. me-client.test B1~B6 통과, 기존 상태줄·전략 로그 테스트 무수정 통과, typecheck 0. 커밋 1개(경로 지정 add · 한국어 · Co-Authored-By 없음 · 예: `feat(quick-261006-pey): /me 상단 4탭 — ?tab= 공용 훅(종목상세와 공유) · 잔고/주문 라벨 건수`), push 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 설정 탭 — 상따 기본설정을 S1 묶음 카드 4장(본문 ≥700 2열)으로</name>
  <files>webapp/src/components/me/limit-chaser-defaults.tsx, webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx</files>
  <read_first>
    - webapp/src/components/me/limit-chaser-defaults.tsx 1-60(헤더 ①~⑤) · 440-631(렌더 — 바꿀 곳은 섹션 루트 · 묶음 map 래퍼뿐)
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx 1-130(셀렉터 · 표시 테스트)
    - .planning/sketches/013-mypage-ia/settings.html 47-50 · 93-100(S1 `.sgrid`/`.sg`/`.gh` · 제목줄 `.ch`)
    - webapp/src/components/trading/workbench/card-grid.tsx 17-21(`@container/wb` 700 선례 주석)
  </read_first>
  <action>
행 내부와 저장 기계는 그대로 두고 섹션 껍데기와 묶음 래퍼만 바꾼다(D-2 · P-4).

- 섹션 루트(`data-slot="me-lc-defaults"` · aria-labelledby 유지): `CARD` 면을 걷고 `@container/me flex min-w-0 flex-col` 로 — 이 섹션이
  2열 판정 컨테이너다(P-4 — 페이지 루트가 아니라 여기만).
- 제목줄(h2 「상따 기본설정」 + `me-lc-defaults-chip`) · 안내(`me-lc-defaults-note`) — data-slot · 문구(`USER_SETTINGS_STATUS_TEXT` · D-13) ·
  칩 톤 그대로, 격자 **위**에 한 번. 카드 밖이 되었으므로 좌우 패딩만 목업 `.ch` 처럼 카드 가장자리 선에 맞춘다(px-1 안팎).
- `data-slot="me-lc-defaults-rows"` 는 격자 래퍼가 된다: `grid min-w-0 grid-cols-1 items-start gap-3 @min-[700px]/me:grid-cols-2` + 현행
  data-dim · aria-busy · 로딩 흐림(opacity-45) 그대로. 여기서 `LC_CONTAINER_CLASS` 는 빠진다(카드 안으로 이동).
- `USER_SETTINGS_GROUPS` 마다 카드 한 장: 현행 role="group" aria-label={group} 래퍼에 `data-slot="me-lc-defaults-group-card"` 와
  cn(CARD, 'min-w-0 px-2.5 pt-2.5 pb-1')(목업 `.sg` 10/14/4 근사). 카드 머리 `me-lc-defaults-group` 은 13px/600 muted(D-2 — 현행 12px 에서)
  · 좌우 패딩은 행 글자선에 맞춘 현행 px-1.5 유지. 그 아래 행 목록 div = cn(LC_CONTAINER_CLASS, 'min-w-0') 안에 현행 행 map 을 **그대로**
  (`me-lc-defaults-row` · data-label · data-field · data-flash · data-failed · ChoiceRow/SettingRow props · InlineValueEditor 무변경).
- 거부 줄(`me-lc-defaults-reject` · role=alert) · `NumberPadSheet` · `useUserSettingsSave` · activate/navigate 무변경. 거부 줄은 격자 아래 섹션
  안 그대로(패딩만 제목줄과 같은 선).
- 헤더 주석: ① 자리 → 「/me 「설정」 탭(quick-261006-pey D-1) · DMA 게이트 화면에는 그리지 않는다」 ③ 컨테이너 선언은 묶음 카드마다 행
  목록에(`LC_CONTAINER_CLASS` 재기재 금지 규칙 유지) ⑥ 신설: S1 묶음 카드(D-2 · sketch 013 settings.html S1) — 2열 판정이 섹션
  `@container/me` 700 인 이유(P-4 · 본문 폭 ≠ 뷰포트 · 작업대 `/wb` 700 선례 · 페이지 루트에 컨테이너를 달지 않는 §2.2b 이유 ·
  키패드 시트는 포털이라 안전).
- 손보는 표면 안의 시각 결함(줄바꿈 · 잘림 · 겹침)이 보이면 바로 고치고 SUMMARY 에 한 줄.

테스트(`limit-chaser-defaults.test.tsx`) — RED 먼저: 아래 behavior 를 새 it 로 쓰고 실패 확인 후 구현. 기존 표시·저장 테스트는 무수정 통과
(11행 순서 · data-dim 은 rows 래퍼에 그대로 있다). jsdom 은 컨테이너 쿼리를 계산하지 않으므로 여기서는 클래스만, 실제 2열/1열은 Task 3 e2e.
  </action>
  <behavior>
    - S1-1: `me-lc-defaults-group-card` 4장이 role=group 이름 순서 매수 금액·후매수·매도·자동매도, 각 카드 className 에 `rounded-[16px]` · `bg-[var(--card)]`, 카드별 `me-lc-defaults-row` 수 3·3·1·4
    - S1-2: 각 카드 안 행 목록 요소의 className 에 `@container/lc`(카드마다 하나) · 섹션 루트 className 에 `@container/me` 가 있고 `bg-[var(--card)]` 가 없다
    - S1-3: `me-lc-defaults-rows` className 에 `grid-cols-1` · `@min-[700px]/me:grid-cols-2` · `items-start`, 84 미수신이면 그 요소에 data-dim="true"(기존 단언 유지)
    - S1-4: 제목(h2) · 칩 · 안내가 `me-lc-defaults-rows` 보다 DOM 앞(compareDocumentPosition FOLLOWING), 각각 한 번씩만
  </behavior>
  <verify>
    <automated>
grep -q '@container/me' webapp/src/components/me/limit-chaser-defaults.tsx \
&& grep -q '@min-\[700px\]/me:grid-cols-2' webapp/src/components/me/limit-chaser-defaults.tsx \
&& grep -q 'me-lc-defaults-group-card' webapp/src/components/me/limit-chaser-defaults.tsx \
&& test "$(grep -c 'LC_CONTAINER_CLASS' webapp/src/components/me/limit-chaser-defaults.tsx)" -ge 2 \
&& pnpm --filter @gh-radar/webapp exec vitest run limit-chaser-defaults me-client \
&& pnpm --filter @gh-radar/webapp run typecheck \
&& echo "TASK2 ALL OK"
    </automated>
  </verify>
  <done>설정 탭 상따 기본설정이 제목·칩·안내 1벌 + 묶음 카드 4장(격자 1열, 섹션 본문 ≥700 에서 2열)이고, 행 · 저장 · 거부 줄 · 키패드는 그대로다. S1-1~4 + 기존 테스트 통과, typecheck 0. 커밋 1개(예: `feat(quick-261006-pey): /me 설정 탭 상따 기본설정 묶음 카드 4장 — 본문 700 이상 2열`), push 0.</done>
</task>

<task type="auto">
  <name>Task 3: e2e 재배선(탭 활성화 후 단언) · 새 탭 e2e(전환 · 딥링크 · 뒤로가기 · 미방문 무조회) · 건수 콜백 단위</name>
  <files>webapp/e2e/specs/me.spec.ts, webapp/e2e/specs/a11y.spec.ts, webapp/e2e/specs/unfilled-progress.spec.ts, webapp/src/components/trading/__tests__/today-orders-card.test.tsx</files>
  <read_first>
    - webapp/e2e/specs/me.spec.ts 56-130(픽스처 ACCOUNTS · ACCOUNT_A/B_STATE) · 228-240 · 340 · 394-480(조회구 · beforeEach · ordersRequestMethods) · 이후 케이스는 `grep -n "test(\|waitForAccounts\|boxOf(\|page.goto" ` 로 범위를 잡아 필요한 곳만
    - webapp/e2e/specs/a11y.spec.ts 803-810 · 918-932 · 950-980
    - webapp/e2e/specs/unfilled-progress.spec.ts 115-125
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx 1-60 · 160-200(하네스 · fetchTodayOrdersMock)
  </read_first>
  <action>
기존 단언의 **의미는 유지**하고, 표면이 탭 안으로 옮겨졌으므로 해당 탭을 연 뒤 단언하게 바꾼다. 새 케이스로 D-1 메커니즘을 실브라우저에서 잠근다.

(A) `today-orders-card.test.tsx` — 새 it 1개: `onCountChange` 스파이를 넘기고 복원 3건 → 스파이 마지막 인자 3 이며 헤더에 「3건」, 0건 →
마지막 인자 0. prop 없이 렌더하는 기존 테스트는 무수정.

(B) `me.spec.ts` 조회구 추가: `meTabList(page)` = tablist 이름 「My page 탭」 · `meTab(page, label)` = 그 안의 tab(이름 정규식 `^label` —
라벨 뒤 숫자가 붙는다) · `openMeTab(page, label, value)` = 클릭 → URL 이 `[?&]tab=value(&|$)` → 그 탭 aria-selected true ·
`waitForReady(page, n)` = 상태줄 data-status ready + 「계좌 n개」(30s — 현황 탭에서만 쓰는 준비 동기점) · `meTabCount(page, label)` =
그 탭 안 `me-tab-count`.
재배선 규칙: ① `waitForAccounts` 를 「relay 준비」 동기점으로만 쓰던 자리 → waitForReady. ② 계좌 카드 단언 직전 openMeTab('잔고',
'accounts') → waitForAccounts. ③ 오늘 주문 단언 직전 openMeTab('주문', 'orders')(openP25 포함 — waitForReady 뒤). ④ 상따 기본설정 단언 직전
openMeTab('설정', 'settings'). ⑤ boxOf · leavesOverflowing · 스크린샷은 **그 표면의 탭이 활성일 때만** — 숨은 패널은 박스가 없다. 한
케이스가 여러 표면을 보면(1 · 4 · 8 · 11) 단언을 탭 순서(현황 → 잔고 → 주문)로 재배열한다. 단언 값 · 타임아웃 · 픽스처는 바꾸지 않는다.
케이스별: 1 — 끝의 세로 순서 ys 단언(상태줄<전략<계좌A<계좌B<오늘 주문)을 D-1 승계 단언으로 교체: 탭 이름 순서 [현황, 잔고, 주문, 설정]
+ 잔고 탭 안 cardA.y < cardB.y(헤더 주석도 「세로 순서 → 탭 순서 승계(quick-261006-pey D-1)」로). 5 — 게이트 분기에 meTabList 0개 추가.
P27-M1 1280 — D-10 위치 단언(상태줄<섹션<전략)을 S1 격자 단언으로 교체(D-2): 설정 탭에서 상태줄 비가시 · `me-lc-defaults-group-card`
4장 · 매수 금액 카드와 후매수 카드의 y 차 ≤2 이고 x 가 다름 · 매도 카드 y > 매수 금액 카드 y · 카드마다 leavesOverflowing(카드, 카드 right)
= [] · 기존 흐름(84 → 42 → 플래시 → 거부) 그대로 · `page.screenshot({ path: 'test-results/me-settings-1280.png', fullPage: true })`.
P27-M1 폰 390 — 설정 탭 · 카드 4장 x 차 ≤1 이고 y 증가(1열) · 기존 잘림 · 시트 단언 그대로.
새 케이스(같은 relay describe 안 · 이름 접두 `PEY-` · 서술 한글):
  PEY-1 기본 = 현황 · 미방문 탭 비마운트 · 조회 0 — goto /me → waitForReady(2) → 탭 이름 순서 · 현황 selected · 상태줄 · 전략 카드 가시 ·
    accountCards · todayOrdersCard · me-lc-defaults 모두 0개 · 500ms 대기 후 ordersRequestMethods 길이 0 · 주문 탭 숫자 없음.
  PEY-2 전환 · 라벨 숫자 · 재방문 무재조회 — A/B 계좌 상태 push → 잔고 탭 숫자 = ACCOUNT_A_STATE.unfilled.length +
    ACCOUNT_B_STATE.unfilled.length → openMeTab 잔고 → 카드 2 → openMeTab 주문 → 헤더 `h2 + span` 의 「N건」 과 주문 탭 숫자가 같음 ·
    ordersRequestMethods > 0 (길이 n 기록) → openMeTab 현황 → openMeTab 주문 → 500ms 후 길이 여전히 n.
  PEY-3 딥링크 — goto /me?tab=settings → 설정 selected · me-lc-defaults 가시 · me-status-bar 0개(미마운트) · goto /me?tab=zzz → 현황 selected ·
    goto /me?tab=orders → 주문 selected · 오늘 주문 카드 가시.
  PEY-4 뒤로가기 — goto /me → waitForReady → openMeTab 잔고 → openMeTab 주문 → goBack → URL tab=accounts · 잔고 selected · 계좌 카드
    가시 → goBack → URL 에 tab 없음 · 현황 selected(클릭당 기록 1개 증명).
  PEY-5 폰 390 스크린샷 + K-1 관찰(단언 없음) — MOBILE_VIEWPORT · goto /me → waitForReady → 스크린샷 `test-results/me-tabs-390.png` →
    openMeTab 설정 → 창을 끝까지 스크롤 → 탭 바(tablist 의 부모 요소) getBoundingClientRect().top 을 test.info().annotations 와 console 에
    `[PEY-K1] tabbar top=…` 로 남긴다. 값으로 실패시키지 않는다(K-1 은 사용자 결정 사항).

(C) `a11y.spec.ts` — Phase 25 axe 매트릭스의 B 구간: 상태줄 ready 단언 뒤 주문 탭(tablist 「My page 탭」 의 `^주문` tab) 클릭 → 이하
그대로(스캔 수 24 · 폭 기록 유지). 「/me — 위반 0」: 현황(전략 행 2)에서 scanSurface → 잔고 탭 → pushAccountState → 계좌 카드 1 →
scanSurface → 설정 탭 → scanSurface, 세 번 모두 blocking [] · 사이드바 aria-current · 상태줄 aria-live 단언 유지(상태줄은 숨은 패널에
남아 속성 단언 가능).

(D) `unfilled-progress.spec.ts` openMe — `page.goto('/me?tab=accounts')`(딥링크로 잔고 탭) 한 줄만 바꾼다. 나머지 무변경.

실행 메모: e2e 는 기존 방식 그대로(Playwright webServer `PORT=3100 pnpm dev` · reuseExistingServer · spec 픽스처가 relay 8090 기동 ·
단일 워커). webServer 기동 타임아웃이 NextFontGoogleFontFileReplacer 반복이면 `webapp/.next` 를 지우고 재실행(코드 문제 아님).
`pnpm --filter @gh-radar/webapp run build` 는 돌리지 않는다 — dev 서버와 `.next` 를 공유해 캐시를 깨뜨린다. P-3 Suspense 경계는 Task 1
grep 게이트로 잠그고, SUMMARY 「push 전 메인 세션 확인」 에 build 1회를 적는다.
  </action>
  <verify>
    <automated>
grep -q "PEY-1" webapp/e2e/specs/me.spec.ts \
&& grep -q "PEY-4" webapp/e2e/specs/me.spec.ts \
&& grep -q "me-settings-1280.png" webapp/e2e/specs/me.spec.ts \
&& grep -q "/me?tab=accounts" webapp/e2e/specs/unfilled-progress.spec.ts \
&& pnpm --filter @gh-radar/webapp run typecheck \
&& pnpm --filter @gh-radar/webapp lint \
&& pnpm --filter @gh-radar/webapp run test \
&& pnpm --filter @gh-radar/webapp exec playwright test webapp/e2e/specs/a11y.spec.ts -g "Phase 25 axe 매트릭스|/me — 위반 0" \
&& pnpm --filter @gh-radar/webapp exec playwright test webapp/e2e/specs/me.spec.ts webapp/e2e/specs/unfilled-progress.spec.ts webapp/e2e/specs/stock-detail-tabs.spec.ts \
&& test -f webapp/test-results/me-settings-1280.png \
&& test -f webapp/test-results/me-tabs-390.png \
&& echo "TASK3 ALL OK"
    </automated>
    <human-check>오케스트레이터가 `webapp/test-results/me-tabs-390.png`(390 현황 · 4탭 바 · 숫자) · `webapp/test-results/me-settings-1280.png`(1280 설정 2열 카드)를 열어 목업 A · S1 과 대조한다. PEY-5 의 `[PEY-K1] tabbar top` 값은 SUMMARY 에 그대로 옮긴다.</human-check>
  </verify>
  <done>기존 me.spec 21케이스가 탭 활성화 후 단언으로 재배선되어 전부 통과하고, PEY-1~5 가 추가되어 통과한다(미방문 탭 조회 0 · 재방문 무재조회 · 딥링크 · 뒤로가기 · 라벨 숫자 일치). a11y 2케이스 · unfilled-progress 전부 · stock-detail-tabs.spec 전부 통과, webapp 단위 전체 · typecheck · lint 0. 스크린샷 2장 생성. 커밋 1개(예: `test(quick-261006-pey): /me 4탭 e2e — 탭 활성화 후 단언 · 전환 · 딥링크 · 뒤로가기 · 미방문 무조회`), push 0.</done>
</task>

</tasks>

<source_audit>
| 출처 | 항목 | 담당 |
|------|------|------|
| GOAL | /me 상단 4탭 + 설정 탭 묶음 카드 4장(목업 A + S1) | Task 1 · 2 |
| CONTEXT D-1 | 탭 바 위치 · 값/라벨 · 기본 status · `?tab=` · pushState · 화이트리스트 · 방문 유지 · sticky | Task 1 (A)(D) · e2e Task 3 PEY-1~4 |
| CONTEXT D-1 | 「같은 메커니즘」 — 공용 훅 vs 사본 판단 | Task 1 (A)(B) · P-1 |
| CONTEXT D-1 | 현황 = 상태줄(탭 안) + 전략 현황 카드 | Task 1 (D) · B1 |
| CONTEXT D-1 | 잔고 = AccountPanel stack 반복 + 로딩 문구 · 라벨 = unf 합(0 생략) | Task 1 (D) · P-5 · B4 · PEY-2 |
| CONTEXT D-1 | 주문 = TodayOrdersCard · 조회 페이지당 1회(미방문 0) · 라벨 = 「N건」(미방문 생략) · 콜백 하나 | Task 1 (C)(D) · B5 · PEY-1/2 · Task 3 (A) |
| CONTEXT D-1 | 설정 = LimitChaserDefaultsSection · 계정 카드는 탭 위 공통 | Task 1 (D) · Task 2 |
| CONTEXT D-1 | 게이트 분기 무변경(탭 없음) | Task 1 (D) · B6 · me.spec 5 |
| CONTEXT D-1 | 세로 순서 계약 → 탭 순서 승계 | Task 1 (D) 주석 · me.spec 1 |
| CONTEXT D-2 | 묶음마다 CARD 한 장 · 머리 13px/600 muted | Task 2 · S1-1 |
| CONTEXT D-2 | 행 SettingRow/ChoiceRow 그대로 · 카드마다 LC_CONTAINER_CLASS | Task 2 · S1-2 |
| CONTEXT D-2 | 데스크톱 2열 · 폰 1열 · 판정 기준(플래너 결정) | Task 2 · P-4 · S1-3 · P27-M1 1280/390 |
| CONTEXT D-2 | 제목+칩+안내 격자 위 1회(문구 그대로) | Task 2 · S1-4 |
| CONTEXT D-2 | 거부 줄 · 키패드 · 저장 기계 무변경 | Task 2 · 기존 저장 테스트 · P27-M1 흐름 |
| CONTEXT 범위 밖 | 데이터 경로 · relay 계약 · 조회 횟수 · 표면 내부 · 계좌 선택 UI · 전체 비활성화 위치 | 전 Task 제약 · PEY-1/2(조회 횟수 실측) |
| CONTEXT 테스트 | me-client.test · limit-chaser-defaults.test · me.spec 갱신 + 새 e2e(전환 · 딥링크 · 뒤로가기) | Task 1 (E) · Task 2 · Task 3 |
| 오케스트레이터 | a11y · theme-default · brand-account · unfilled-progress · sidebar-tree 영향 확인 | 조사 결과: a11y(2케이스) · unfilled-progress(openMe) 만 영향 → Task 3 (C)(D). theme-default(로그인 리다이렉트 URL) · brand-account(계정 카드 — 탭 위) · sidebar-tree(게이트 분기) 는 무영향 |
| REQ / RESEARCH | quick 이라 요구사항 ID · RESEARCH 없음 — PEY-TABS(Task 1) · PEY-COUNTS(Task 1) · PEY-SETTINGS(Task 2) · PEY-TESTS(Task 3) 로 합성 | — |
</source_audit>

<verification>
- Task 1·2·3 의 `<automated>` 블록이 최종 상태에서 모두 `TASK* ALL OK` 로 끝난다(Task 3 이 webapp 단위 전체 · typecheck · lint · 영향 e2e 4파일을 다시 돈다).
- `git log --grep='quick-261006-pey' --stat` 에 커밋 3개, 파일은 frontmatter `files_modified` 11개뿐. 작업 트리의 무관한 변경(`.planning/sketches/MANIFEST.md` · 각 quick `shots/` · `.planning/milestone.lock` 등)은 add 하지 않는다 — 경로 지정 add.
- push 0(이 저장소에서 push = webapp 프로덕션 배포).
</verification>

<success_criteria>
- /me 가 목업 A 대로 계정 카드 아래 4탭이고, `?tab=` 딥링크 · 뒤로가기 · 한 번 연 탭 유지 · 미방문 탭 무조회가 실브라우저에서 증명된다(D-1).
- 탭 메커니즘 구현이 저장소에 한 벌(`lib/use-url-tab.ts`)이고 종목상세가 무회귀로 같은 훅을 쓴다(P-1).
- 설정 탭이 목업 S1 대로 묶음 카드 4장 · 본문 ≥700 2열이며 저장 동작이 그대로다(D-2).
- 표면 내부 · 데이터 경로 · relay 계약 · 조회 횟수 변화 0.
</success_criteria>

<output>
`.planning/quick/261006-pey-mypage-redesign/261006-pey-SUMMARY.md` 를 쓴다(커밋은 오케스트레이터). 포함: 재량 결정 P-1~P-7 · K-1 관찰값(PEY-5 `[PEY-K1] tabbar top`)과 「sticky 는 셸 overflow 때문에 실효가 없어 보인다 — 고칠지 사용자 결정」 한 줄 · 스크린샷 경로 2개 · 「push 전 메인 세션 확인: `pnpm --filter @gh-radar/webapp run build`(P-3 Suspense 경계 — dev 서버를 멈춘 뒤)」 · 손본 시각 결함 목록(있으면).
</output>
