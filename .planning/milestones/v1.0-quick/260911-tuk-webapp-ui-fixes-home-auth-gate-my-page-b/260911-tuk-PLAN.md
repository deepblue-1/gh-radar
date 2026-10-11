---
phase: quick-260911-tuk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/supabase/middleware.ts
  - webapp/src/app/login/page.tsx
  - webapp/src/app/auth/callback/route.ts
  - webapp/e2e/specs/auth-guards.spec.ts
  - webapp/e2e/specs/home.spec.ts
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/layout/app-shell.tsx
  - webapp/src/components/layout/app-header.tsx
  - webapp/src/components/layout/center-shell.tsx
  - webapp/src/components/layout/theme-toggle.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/app/design/page.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  - webapp/e2e/specs/trading-limit-chaser.spec.ts
autonomous: true
requirements: [AUTH-02, TRADE-01]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "비로그인 사용자가 `/` 로 들어가면 `/login?next=%2F` 로 302 되고, 로그인 직후 착지점은 `/scanner` 가 아니라 홈(`/`) 이다"
    - "`/me` 잔고 표의 5번째 칸이 계좌 전용 모드에서 「매입금액」 헤더 아래 보유수량×평단가 숫자를 보여준다 — `—` 가 아니다"
    - "종목 축이 있는 표면(호가주문·상따)의 그 칸은 여전히 「평가금액」 헤더 + 현재가 기반 값이다 — 헤더와 셀의 의미가 절대 어긋나지 않는다"
    - "데스크톱에서 본문을 끝까지 스크롤해도 사이드바 하단 유저 섹션이 뷰포트 안에 남는다"
    - "탑바에 테마 토글이 없다 — 사이드바 하단 유저 섹션과 같은 줄에 있다. 사이드바가 없는 화면(CenterShell · `hideSidebar`)에서는 토글이 사라지지 않는다"
    - "모바일(<lg)에서 검색 아이콘 버튼이 탑바 오른쪽 끝에 붙고, 데스크톱(lg+)에서는 검색 입력이 지금처럼 가운데다"
    - "상따 폼에서 파생값 3행·부제 1개·hint 2개가 사라지고, 제목을 뺀 매수가격·매도가격 그룹에 빈 헤더 줄이 남지 않는다"
    - "자동취소·체결 체크박스 행의 입력 칸이 위쪽 NumField 입력과 좌우 끝·폭이 일치하고, 4글자 라벨(「잔량추적」·「취소잔량」)이 잘리지 않는다"
    - "동작을 바꾼 파일의 상단 JSDoc·주석이 바뀐 동작과 일치한다 — 주석이 코드보다 낡은 채로 남지 않는다"
  artifacts:
    - webapp/src/lib/supabase/middleware.ts
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/e2e/specs/auth-guards.spec.ts
  key_links:
    - "middleware 의 공개 판정 ↔ `auth-guards.spec.ts` 단언 — 같은 계약의 양면이다. 한쪽만 바꾸면 E2E 가 옛 동작을 고정한 채로 남는다"
    - "`stockScoped`(= `code` 유무) ↔ 5번째 칸의 헤더 문구 + 셀 값 — 이 둘은 **항상 같은 분기**를 읽어야 한다"
    - "`aside` 의 sticky ↔ 부모 `div.flex.flex-1` 의 `overflow-hidden` 제거 ↔ `main` 의 `min-w-0` — 셋이 한 묶음이다. 하나라도 빠지면 sticky 가 죽거나 본문이 넘친다"
    - "`AppHeader` 의 테마 토글 노출 ↔ 사이드바 없는 화면(CenterShell · `AppShell hideSidebar`) — 토글의 새 집이 사이드바라서, 사이드바가 없는 화면은 별도 보장이 필요하다"
    - "`CheckRow` 그리드 ↔ `Card` 의 `--lw` — 체크박스(18px)+간격이 라벨과 같은 1열을 쓰므로 `--lw` 를 올리지 않으면 4글자 라벨이 잘린다"
---

<objective>
webapp UI 수정 5건을 한 번에 정리한다 — ① 홈(`/`)을 로그인 필수 표면으로 승격, ② `/me` 잔고의 항상 `—` 인 금액 칸을 매입금액으로 채움, ③ 데스크톱 사이드바 하단 유저 섹션 고정, ④ 테마 토글을 탑바에서 사이드바로 이사 + 모바일 검색 아이콘 우측 정렬, ⑤ 상따 폼의 군더더기 제거와 체크박스 행 정렬.

Purpose: 다섯 건 모두 「지금 화면이 사실과 다르거나, 손이 닿지 않거나, 읽을 값이 비어 있다」는 한 종류의 문제다. 새 기능이 아니라 이미 있는 표면의 결함 제거다.

Output: 인증 게이트 계약(코드+E2E 단언) 갱신, 계좌 전용 모드 전용 「매입금액」 칸, sticky 사이드바, 사이드바 하단 테마 토글, 군더더기 없는 상따 폼 + 정렬된 체크박스 행. 태스크당 원자적 커밋 1개(한글 메시지).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@webapp/src/lib/supabase/middleware.ts
@webapp/src/app/login/page.tsx
@webapp/src/app/auth/callback/route.ts
@webapp/e2e/specs/auth-guards.spec.ts
@webapp/src/components/orderbook/account-panel.tsx
@webapp/src/components/layout/app-shell.tsx
@webapp/src/components/layout/app-header.tsx
@webapp/src/components/layout/app-sidebar.tsx
@webapp/src/components/layout/theme-toggle.tsx
@webapp/src/components/layout/center-shell.tsx
@webapp/src/components/layout/user-section.tsx
@webapp/src/components/trading/limit-chaser-form.tsx
@webapp/src/components/trading/limit-chaser-client.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 홈을 로그인 필수로 + `/me` 잔고 금액 칸 채우기</name>
  <files>webapp/src/lib/supabase/middleware.ts, webapp/src/app/login/page.tsx, webapp/src/app/auth/callback/route.ts, webapp/e2e/specs/auth-guards.spec.ts, webapp/e2e/specs/home.spec.ts, webapp/src/components/orderbook/account-panel.tsx, webapp/src/components/orderbook/__tests__/account-panel.test.tsx</files>
  <behavior>
    - 계좌 전용 모드(`code` prop 미전달)로 `AccountPanel` 을 잔고 탭에 렌더하면 데스크톱 표 5번째 헤더가 「매입금액」 이고, 그 셀이 `qty * avgPrice` 반올림값의 천단위 포맷 숫자다(빈 값 대시가 아니다).
    - 종목 축이 있는 모드(`code` + `currentPrice` 전달)에서는 5번째 헤더가 「평가금액」 이고 셀은 현재가 기반 평가금액이다 — 기존 단언 유지.
    - 두 모드 모두에서 「평가손익」·「수익률」 칸의 동작은 변하지 않는다(현재가를 모르면 대시).
  </behavior>
  <action>
요구사항 ①②를 한 커밋으로 처리한다. 인증 게이트 쪽이 먼저다.

**① 홈 로그인 게이트 — `webapp/src/lib/supabase/middleware.ts`**
- `PUBLIC_EXACT` 상수와 그 JSDoc 블록을 삭제하고, `isPublic` 계산에서 `PUBLIC_EXACT.includes(pathname) ||` 항을 뺀다. 공개 판정은 `PUBLIC_PREFIXES` 하나만 남는다(`/login`, `/auth`).
- D-12 분기 `if (user && pathname === "/login")` 의 목적지를 `/scanner` 에서 `/` 로 바꾼다. 홈이 인증 표면이 됐으므로 로그인 직후 착지점은 홈이다. `/` 는 인증 사용자에게 통과되므로 리다이렉트 루프는 없다.
- 파일 상단 `updateSession` JSDoc 의 3번 항목(`PUBLIC_PREFIXES / PUBLIC_EXACT` 서술)과 D-12 줄을 새 사실에 맞게 고친다. 이 저장소에서 상단 JSDoc 은 계약 서술이다 — 조용히 어긋나게 두지 않는다.

**① 폴백 착지점 — `webapp/src/app/login/page.tsx`, `webapp/src/app/auth/callback/route.ts`**
- `login/page.tsx` 45행 부근 `safeNext` 의 폴백 문자열을 `"/"` 로 바꾼다. open-redirect 가드 로직(`rawNext` 검사)은 그대로 둔다.
- `auth/callback/route.ts` 36행 부근의 같은 폴백과 16행 부근 JSDoc 의 `fallback:` 서술을 함께 `/` 로 맞춘다.

**① E2E 계약 뒤집기 — `webapp/e2e/specs/auth-guards.spec.ts` (실행하지 않는다. 수정만)**
- 79행 부근 테스트는 현재 「미인증 루트는 200 유지」를 고정하고 있다. 이름·본문 주석·단언을 전부 뒤집어 「미인증 `/` → `/login?next=%2F`」 를 고정한다. 같은 파일 위쪽 `middleware-guard` 테스트들과 같은 형태(`await page.goto("/"); await expect(page).toHaveURL(/\/login\?next=%2F$/);`)로 맞추고, 더 이상 쓰지 않는 `baseURL` fixture 인자와 `response.status()` 단언은 제거한다.
- 파일 상단 describe JSDoc 의 검증 목록에서 `public whitelist: "/" 루트는 미인증도 접근 가능` 줄을 새 계약 서술로 교체한다.
- `webapp/e2e/specs/home.spec.ts` 는 로그인 storageState 로 돌아 동작상 영향이 없다. 다만 「`/` 는 비로그인도 공개」 취지의 주석 한 줄이 사실과 어긋나므로 그 줄만 고친다.

**② 잔고 금액 칸 — `webapp/src/components/orderbook/account-panel.tsx`**
- 게이트웨이가 주는 `RelayHolding` 에는 현재가가 없다. 계좌 전용 모드(`stockScoped === false`)는 모든 행이 미가격이라 평가금액·평가손익·수익률 3칸이 전부 대시다. 진짜 평가금액은 계산 불가이므로, **계좌 전용 모드에서만 칸의 의미를 매입금액으로 바꾼다.**
- `HoldingView` 인터페이스(167행 부근)에 `cost: number` 를 추가하고 JSDoc 을 갱신한다. holdings 파생 `useMemo` 에서 `cost: row.qty * row.avgPrice` 로 채운다 — 이 값은 현재가와 무관하므로 항상 채워진다.
- 데스크톱 표(579행 부근) 5번째 `TableHead` 문구를 `stockScoped ? '평가금액' : '매입금액'` 으로, 같은 열 `TableCell` 값을 `stockScoped ? (view.value == null ? '—' : KRW.format(Math.round(view.value))) : KRW.format(Math.round(view.cost))` 로 바꾼다. 헤더와 셀은 **같은 분기**를 읽어야 한다.
- 모바일 카드 ①줄(652행 부근)의 `RowKey` 「평가」도 같은 규칙으로 `stockScoped ? '평가' : '매입'`, 값도 같은 규칙으로 바꾼다.
- 「평가손익」·「수익률」 칸은 건드리지 않는다. 계좌 전용 모드에서 계속 대시다 — 현재가 없이 손익을 지어내지 않는다.
- 종목 축이 있는 표면에서 「평가금액」 헤더 아래 매입금액을 섞는 일은 하지 않는다.
- 파일 상단 주석 ⑤(평가금액·평가손익·수익률은 현재가를 아는 행에서만 계산한다)에 이 예외 규칙을 한 줄로 반영한다.
- `webapp/src/components/orderbook/__tests__/account-panel.test.tsx` 를 읽고, 위 `behavior` 3줄을 잠그는 단언을 추가·갱신한다. 기존 종목 축 케이스의 「평가금액」 단언이 있으면 그대로 유지한다.

작업 후 `fix(quick-260911-tuk): 홈을 로그인 필수로 바꾸고 계좌 전용 잔고에 매입금액을 채운다` 형태의 **한글** 메시지로 커밋 1개.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp typecheck && pnpm -C webapp test src/components/orderbook/__tests__/account-panel.test.tsx</automated>
  </verify>
  <done>`pnpm -C webapp typecheck`(tsc + tsconfig.e2e.json) 이 exit 0. 계좌 전용 모드에서 「매입금액」 헤더와 수량×평단 숫자를 잠그는 테스트가 통과. middleware 에 공개 exact 경로가 남아 있지 않고 로그인 사용자의 `/login` 목적지가 홈이다. `auth-guards.spec.ts` 가 「미인증 `/` → `/login?next=%2F`」 를 단언한다(실행은 하지 않는다). 변경된 4개 파일의 상단 JSDoc 이 새 동작과 일치한다. 커밋 1개.</done>
</task>

<task type="auto">
  <name>Task 2: 사이드바 하단 고정 + 테마 토글 이사 + 모바일 검색 우측 정렬</name>
  <files>webapp/src/components/layout/app-shell.tsx, webapp/src/components/layout/app-header.tsx, webapp/src/components/layout/center-shell.tsx, webapp/src/components/layout/theme-toggle.tsx, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/layout/__tests__/app-sidebar.test.tsx, webapp/src/app/design/page.tsx</files>
  <action>
요구사항 ③④를 한 커밋으로 처리한다.

**③ sticky 사이드바 — `app-shell.tsx`**
- 지금은 문서 스크롤이라 본문이 길면 `aside` 도 같이 길어지고, `AppSidebar` 의 `justify-between` 하단 유저 섹션이 페이지 맨 아래로 내려간다.
- `aside` 에 `lg:sticky lg:top-14 lg:self-start lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto` 를 더해 뷰포트 높이로 고정한다(헤더 56px = 3.5rem).
- ★ 함정: 부모 `div.flex.flex-1.overflow-hidden` 의 `overflow-hidden` 은 스크롤 컨테이너를 만들어 sticky 를 죽인다. **그 클래스를 제거한다.**
- 제거하면 flex 자식의 자동 최소 크기가 되살아나 긴 콘텐츠가 레이아웃을 밀어낸다. `main` 에 `min-w-0` 을 명시한다(`tasks/lessons.md` 에 등재된 함정). `main` 의 `overflow-auto` 와 `p-6` 는 유지한다.
- 모바일 Drawer(`Sheet`) 경로는 건드리지 않는다.
- `AppShell` 상단 JSDoc 의 Desktop 레이아웃 설명에 sticky 사이드바 사실을 한 줄 더한다.

**④ 탑바에서 토글 제거 + 검색 우측 정렬 — `app-header.tsx`**
- 우측 `<div className="flex items-center gap-2"><ThemeToggle /></div>` 를 상시 렌더에서 뺀다.
- 단, `CenterShell`(`/design`·`error.tsx`·`not-found.tsx`)과 `AppShell hideSidebar`(`stocks/[code]/error.tsx`·`not-found.tsx`)는 **사이드바가 없는 화면**이라 토글의 새 집이 없다. `AppHeaderProps` 에 `themeToggle?: boolean`(기본 `false`)을 추가해 `true` 일 때만 우측 토글을 렌더한다. `AppShell` 은 `themeToggle={!showSidebar}` 로, `CenterShell` 은 `themeToggle` 로 넘긴다. 사이드바가 있는 일반 화면에서는 탑바에서 사라진다.
- 중앙 nav 컨테이너를 `flex flex-1 items-center justify-end lg:justify-center` 로 바꾼다 → 모바일(<lg)은 `SearchTrigger` 아이콘 버튼이 탑바 오른쪽, 데스크톱(lg+)은 readonly 입력이 지금처럼 가운데.
- 파일 상단 JSDoc 의 「우측: `<ThemeToggle />` 고정」 서술을 새 규칙(사이드바 없는 화면에서만 우측 토글 · 중앙 slot 은 <lg 에서 우측 정렬)으로 고친다.

**④ 토글 스타일 주입 — `theme-toggle.tsx`**
- `className?: string` prop 을 받아 `cn()`(`@/lib/utils`)으로 병합한다. 기본값은 지금의 `h-11 w-11` 을 유지해 기존 호출부 동작·hit target 이 변하지 않게 한다. `aria-label`·`title`·`suppressHydrationWarning`·아이콘(`h-5 w-5`)은 그대로.

**④ 사이드바 하단 한 줄 — `app-sidebar.tsx`**
- 마지막 `<UserSection />` 을 `<div className="flex min-w-0 items-center gap-1">` 로 감싸고, 그 안에 `<div className="min-w-0 flex-1"><UserSection /></div>` 와 `<ThemeToggle className="size-9 shrink-0" />` 를 둔다. `user-section.tsx` 는 건드리지 않는다(트리거의 `w-full` 이 래퍼 안에서만 늘어나므로 토글을 밀어내지 않는다 — 덜 침습적인 쪽).
- `UserSection` 은 `user == null` 이면 `null` 을 돌려준다. 그 경우 토글만 남는 것이 정상이다.
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` 를 돌려 보고 깨지면 갱신한다. 이 테스트는 이미 `UserSection` 을 모킹하고 있으므로, `ThemeToggle` 이 트리 계약과 무관하면 같은 방식으로 모킹하거나 하단 줄 단언을 추가한다.

**④ 주석 정합 — `webapp/src/app/design/page.tsx`**
- 4행·41행 부근 주석이 「CenterShell 은 이미 AppHeader 에 `<ThemeToggle />` 을 고정 배치」라고 말한다. `CenterShell` 이 `themeToggle` 을 켜서 토글을 유지한다는 새 사실로 고친다.

작업 후 `fix(quick-260911-tuk): 사이드바 하단을 화면에 고정하고 테마 토글을 사이드바로 옮긴다` 형태의 **한글** 메시지로 커밋 1개.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp typecheck && pnpm -C webapp test src/components/layout && pnpm -C webapp lint</automated>
  </verify>
  <done>typecheck exit 0, `src/components/layout` 하위 vitest 전부 통과, `pnpm lint` 가 기존 warning 수준을 유지하고 새 error 를 만들지 않는다. 사이드바를 쓰는 화면의 탑바에는 테마 토글이 없고 사이드바 하단 유저 섹션 줄에 있다. `CenterShell`·`AppShell hideSidebar` 화면은 탑바 우측 토글을 유지한다. `aside` 가 sticky 이고 부모의 스크롤 컨테이너 클래스가 제거됐으며 `main` 에 `min-w-0` 이 있다. 커밋 1개.</done>
</task>

<task type="auto">
  <name>Task 3: 상따 폼 군더더기 제거 + 체크박스 행 정렬</name>
  <files>webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/limit-chaser-client.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx, webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx, webapp/e2e/specs/trading-limit-chaser.spec.ts</files>
  <action>
요구사항 ⑤를 한 커밋으로 처리한다. 삭제가 대부분이라 **딸려 죽는 변수·prop 까지 끝까지 따라간다.**

**5-1 부제 삭제 — `limit-chaser-client.tsx` 394행 부근**
- 신규 진입 시 부제 문자열 `'종목을 고르면 아래 값이 상한가 기준으로 채워져요'` 를 렌더하지 않는다(문구만 비우는 것이 아니라 그 분기에서 부제 자체를 렌더하지 않는다).
- 이 문구를 단언하는 테스트 2곳을 갱신한다: `__tests__/limit-chaser-client.test.tsx` 204행 부근, `webapp/e2e/specs/trading-limit-chaser.spec.ts` 121행 부근(E2E 는 수정만 하고 실행하지 않는다).

**5-2 매수 파생값 2행 삭제 — `limit-chaser-form.tsx` 670~674행**
- `slot="buy-price"` 그룹의 `<Derived label="산출 주문수량" …/>` 과 `<Derived label="실제 주문금액" …/>` 두 행을 지운다.
- `buyQty` 변수는 무장 판정 `canArmBuy` 가 계속 쓰므로 **남긴다.**

**5-3 매도 파생값 1행 삭제 + 딸린 배선 제거 — 824행 부근**
- `slot="sell-price"` 그룹의 예상 매도수량 `<Derived …/>` 행을 지운다.
- 그 결과 미사용이 되는 것들을 전부 제거한다: `limit-chaser-form.tsx` 의 `estimatedSellQty` import(97행), `sellQty` 파생값(414행), `sellableQty` prop(타입 선언 228행 + 구조분해).
- `limit-chaser-client.tsx` 의 `sellableQty` 계산(361~362행)과 `sellableQty={sellableQty}` 전달(575행)을 제거한다. **`accountState` 변수는 589행 `<AccountPanel account={accountState}>` 가 계속 쓰므로 남긴다.**
- `webapp/src/lib/limit-chaser.ts` 의 `estimatedSellQty` 함수 자체는 **삭제하지 않는다** — `webapp/src/lib/__tests__/limit-chaser.test.ts` 가 단위 테스트로 고정하고 있다.
- 409행·414행·418~425행 부근 주석 서사가 사라진 `sellQty` 를 가리키게 된다. `canArmSell` 이 예상 매도수량을 조건으로 쓰지 않는다는 **논지는 유지**하되, 없는 변수를 지목하지 않도록 문장을 고친다(정본은 서버가 Set 시점에 스냅샷하는 값이라는 사실은 남긴다).

**5-4 제목 없는 그룹 허용 — `Group`(978행)**
- `title` 을 `title?: string` 으로 바꾸고, 헤더 줄(`<div className="flex min-h-6 …">`)은 보여 줄 것(`title`·`status`·`caption`·`led`·`switchProps`)이 **하나도 없으면 렌더하지 않는다** — 빈 24px 줄이 남으면 안 된다. 내부에서도 `title` 이 없으면 그 `<span>` 을 렌더하지 않는다.
- `slot="buy-price"`(651행)와 `slot="sell-price"`(804행) 호출부에서 `title` prop 을 뺀다. 두 그룹은 첫 `NumField` 라벨이 각각 「매수가격」·「매도가격」이라 제목이 중복이었다.

**5-5 / 5-6 hint 제거**
- `slot="sweep"` 그룹(678행)에서 `hint="N건 연속 …"` 과 `showHint` 를 제거한다.
- `slot="cancel"` 그룹(835행)에서 `hint="비교가격은 …"` 과 `showHint` 를 제거한다.
- `hint` 는 `<section title={hint}>` 툴팁도 겸하므로 두 그룹에서 툴팁도 함께 사라진다. 의도된 삭제다. `Group` 의 `hint`/`showHint` prop 자체는 다른 호출부가 남아 있으면 유지하고, 남은 호출부가 하나도 없으면 prop 과 렌더 분기(1055행 부근)까지 제거한다.

**5-7 체크박스 라벨 축약 — `slot="cancel"` 그룹**
- `label="매도 「체결」 값 재사용"` → `label="체결"`, `label="매도 「비율」 값 재사용"` → `label="잔량추적"`.
- **동작은 그대로다** — `cancelQtyTrackEnabled` 가 `cancelQtyEnabled` 에 종속되는 `dimmed`/`disabled` 규율과 그 위 주석을 유지한다.
- `__tests__/limit-chaser-form.test.tsx` 의 `getByLabelText(/매도 「비율」 값 재사용/)`(541~543행 부근)을 새 라벨로 갱신한다. 449~470행·640행 부근에서 삭제된 파생값 행을 단언하는 케이스도 함께 정리한다.

**5-8 ★ CheckRow 를 Row 와 같은 그리드로 — 1210행 부근**
- 현재 `CheckRow` 는 `flex flex-wrap` 이라 입력이 라벨 뒤에 붙고, 입력의 `w-[104px] flex-none` 때문에 위쪽 `NumField` 입력과 좌우 끝·폭이 어긋난다.
- 바깥 `div` 를 `Row` 와 동일한 `mt-[var(--s-1)] grid min-h-8 min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-[var(--s-2)]` 로 바꾼다(`dimmed && 'opacity-45'` 는 유지).
- 1열: `<span className="flex min-w-0 items-center gap-[var(--s-1)]">` 안에 체크박스 `<input>` 과 `<label htmlFor={id}>` 를 묶는다. 2열: `children` 을 그대로 둔다(입력이 없는 행은 2열이 비어도 무방하다).
- 호출부 4곳의 `NumInput className="w-[104px] flex-none"`(646·772·792·859행)을 **제거**해 `NumField` 입력과 같은 폭이 되게 한다.
- `Card`(962행)의 `[--lw:60px] min-[1280px]:[--lw:72px]` 를 `[--lw:76px] min-[1280px]:[--lw:88px]` 로 올린다 — 체크박스 18px + 간격 4px + 4글자 라벨(「잔량추적」·「취소잔량」) 이 60px 에 들어가지 않는다. `NumInput` 은 `min-w-0` 이라 좁은 폭(1280 미만, 카드 1열)에서도 줄어들 뿐 넘치지 않는다.
- `dimmed` opacity 규율, `dirty` 의 `●` 문자 접두, `<label htmlFor>` 연결은 전부 유지한다.
- `CheckRow` 상단 주석(「입력이 있으면 오른쪽 끝으로 민다」)을 새 그리드 사실로 고치고, `Card`·`Row` 주석의 `--lw` 서사와 모순이 없는지 확인한다.

작업 후 `fix(quick-260911-tuk): 상따 폼의 파생값·힌트를 걷어내고 체크박스 행을 입력 그리드에 맞춘다` 형태의 **한글** 메시지로 커밋 1개.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp typecheck && pnpm -C webapp test src/components/trading src/lib/__tests__/limit-chaser.test.ts && pnpm -C webapp lint</automated>
  </verify>
  <done>typecheck(tsc + tsconfig.e2e.json) exit 0 — E2E 스펙 수정분 포함. `src/components/trading` 전체 vitest 와 `limit-chaser.test.ts` 통과. lint 가 새 error·새 unused 경고를 만들지 않는다(삭제된 배선의 잔재가 없다는 증거). 매수가격·매도가격 그룹에 `title` 이 없고 빈 헤더 줄도 없다. 자동취소 체크박스 행이 `NumField` 와 같은 grid 를 쓰고 입력의 고정폭 클래스가 4곳 모두 사라졌다. 커밋 1개.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → Next.js middleware | 미인증 요청이 보호 경로에 도달하려 시도하는 지점. Task 1 이 이 경계의 공개 whitelist 를 좁힌다 |
| OAuth provider → `/auth/callback` | `?next=` 파라미터가 외부에서 주입될 수 있는 지점 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-tuk-01 | Elevation of Privilege | `src/lib/supabase/middleware.ts` 공개 판정 | medium | mitigate | 공개 exact 경로를 없애 기본 차단만 남긴다. `PUBLIC_PREFIXES` 는 `/login`·`/auth` 로 유지 — 새 공개 경로를 추가하지 않는다 |
| T-tuk-02 | Spoofing | `/login` 리다이렉트 루프 | low | mitigate | D-12 분기 목적지를 `/` 로 바꾸되 `/` 는 인증 사용자에게 통과되는 경로임을 확인 — 루프 조건(목적지가 다시 차단 경로) 이 성립하지 않는다 |
| T-tuk-03 | Tampering | `?next=` open redirect | low | accept | `safeNext` 가드와 callback 의 상대경로 검사를 **건드리지 않는다.** 이번 변경은 폴백 문자열만 `/scanner` → `/` 로 바꾼다 |
| T-tuk-04 | Information Disclosure | `AccountPanel` 매입금액 노출 | low | accept | 이미 같은 표에 보유수량·평단가가 나와 있다. 곱셈 결과는 새 정보가 아니며 새 조회 경로도 만들지 않는다 |
</threat_model>

<verification>
- `cd /Users/alex/repos/gh-radar && pnpm -C webapp typecheck` — `tsc --noEmit` + `tsc -p tsconfig.e2e.json`. 착수 전 baseline 이 exit 0 임을 확인했다. E2E 스펙 수정분의 타입 오류까지 여기서 잡힌다.
- `pnpm -C webapp test` — vitest 전체. 착수 전 `app-sidebar.test.tsx` 단일 실행으로 명령 형태를 확인했다.
- `pnpm -C webapp lint` — 착수 전 baseline 에 기존 warning 이 존재한다. 기준은 「새 error 없음 + 삭제 잔재로 인한 새 unused 경고 없음」이다.
- **Playwright(E2E)는 실행하지 않는다** — 로컬 relay/DMA·Supabase 세션이 필요하다. `webapp/e2e/specs/*.ts` 는 수정만 하고 타입체크로만 검증한다.
</verification>

<success_criteria>
- 커밋 3개(태스크당 1개), 전부 한글 메시지.
- `pnpm -C webapp typecheck` 와 `pnpm -C webapp test` 가 전부 exit 0.
- 5개 요구사항의 관측 가능한 결과가 `must_haves.truths` 9줄과 일치한다.
- 동작을 바꾼 파일의 상단 JSDoc·인라인 주석이 새 동작과 어긋나지 않는다.
- 새 파일을 만들지 않았고, `files_modified` 밖의 파일을 건드리지 않았다.
</success_criteria>

<output>
Create `.planning/quick/260911-tuk-webapp-ui-fixes-home-auth-gate-my-page-b/260911-tuk-SUMMARY.md` when done
</output>
