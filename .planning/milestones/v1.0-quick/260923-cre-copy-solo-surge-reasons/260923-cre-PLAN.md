---
phase: quick-260923-cre
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/home/home-format.ts
  - webapp/src/components/home/solo-card.tsx
  - webapp/src/components/home/home-client.tsx
  - webapp/src/components/home/__tests__/home-format.test.ts
  - webapp/src/components/home/__tests__/solo-card.test.tsx
  - webapp/src/components/home/__tests__/home-client.test.tsx
  - webapp/e2e/specs/home.spec.ts
autonomous: true
requirements:
  - QUICK-260923-cre

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "각 개별 급등 카드(SoloCard) 헤더의 등락% 오른쪽에 aria-label '{종목명} 급등이유 복사' 32px 아이콘 버튼이 있다. 클릭하면 '{종목명} {+x.x%}' 한 줄과, reason 이 truthy 일 때만 reason 한 줄이 클립보드로 복사된다. 번호·날짜 헤더·종목코드·뉴스 제목/URL 은 없다 (D-01 B, D-02)"
    - "카드 복사 버튼을 눌러도 종목상세(/stocks/{code})로 이동하지 않는다. 버튼은 stretched-link 오버레이 Link 의 형제(자손 아님)이고 z-20 으로 오버레이(z-10) 위에 있어, 실제 브라우저 hit-test 에서 버튼이 클릭을 받는다 (D-06)"
    - "reason 이 null 이거나 '' 인 카드에도 복사 버튼이 있고, 복사하면 '{종목명} {+x.x%}' 한 줄만 나온다 (D-05)"
    - "'개별 급등 N' 제목 행 오른쪽에 '전체 복사' 버튼(aria-label '개별 급등 전체 복사')이 있다. 클릭하면 '[개별 급등] {tradeDate} {capturedAt 의 KST HH:MM}' + 빈 줄 + 화면 카드 순서대로 번호 붙은 블록(빈 줄 1개 구분)이 복사된다. 주도 테마가 0개인 스냅샷에서도 동작한다 (D-01 A, D-02)"
    - "주도 테마 '전체 복사' 출력은 한 글자도 바뀌지 않고 개별 급등을 포함하지 않는다. 두 제목 행 버튼은 각자 자기 섹션만 복사한다 (D-07)"
    - "피드백·접근성은 기존 CopyTextButton 그대로다('복사됨'/'복사 실패' 1.8초, sr-only role=status 안내, navigator.clipboard.writeText 일반 텍스트). 새 의존성은 없다 (D-03, D-04)"
    - "390px 에서 SoloCard 헤더는 종목명·등락%·아이콘이 한 행에 있고 카드 밖으로 밀리는 요소가 없다. '복사됨' 말풍선은 등락%도, '개별 급등' 제목 행의 '전체 복사' 버튼도 가리지 않는다"
  artifacts:
    - path: "webapp/src/components/home/home-format.ts"
      provides: "개별 급등 복사 포매터 (화면과 같은 formatChange 사용)"
      exports: ["formatChange", "avgChange", "sortStocksByChangeDesc", "toKstHhmm", "formatThemeBlock", "formatThemesSummary", "formatSingleBlock", "formatSinglesSummary"]
    - path: "webapp/src/components/home/solo-card.tsx"
      provides: "카드별 급등이유 복사 아이콘 버튼 (오버레이 위 z-20)"
      contains: "formatSingleBlock(single)"
    - path: "webapp/src/components/home/home-client.tsx"
      provides: "개별 급등 제목 행 '전체 복사' 버튼"
      contains: "formatSinglesSummary(snapshot, singles)"
    - path: "webapp/src/components/home/__tests__/solo-card.test.tsx"
      provides: "카드 복사 텍스트·reason 없음·오버레이 비자손 구조 테스트"
    - path: "webapp/e2e/specs/home.spec.ts"
      provides: "실제 Chromium 클립보드·hit-test·390px 레이아웃 E2E"
  key_links:
    - from: "webapp/src/components/home/solo-card.tsx"
      to: "webapp/src/components/home/home-format.ts"
      via: "formatChange(화면 등락%)와 formatSingleBlock(복사 텍스트)이 같은 모듈 — 둘이 어긋나지 않는다"
      pattern: "formatSingleBlock\\(single\\)"
    - from: "webapp/src/components/home/solo-card.tsx"
      to: "webapp/src/components/home/copy-text-button.tsx"
      via: "아이콘 변형 CopyTextButton, wrapper className 에 z-20 (stretched-link 오버레이 위)"
      pattern: "급등이유 복사"
    - from: "webapp/src/components/home/home-client.tsx"
      to: "webapp/src/components/home/home-format.ts"
      via: "제목 행 CopyTextButton getText → formatSinglesSummary(snapshot, singles) (lazy, 보고 있는 스냅샷)"
      pattern: "formatSinglesSummary\\(snapshot, singles\\)"
    - from: "webapp/src/components/home/home-format.ts formatSinglesSummary"
      to: "webapp/src/components/home/home-format.ts formatThemesSummary"
      via: "비공개 헤더 헬퍼 하나를 공유 — '[제목] {tradeDate} {KST HH:MM}' 형식이 한 곳에서 나온다"
      pattern: "개별 급등"
---

<objective>
홈(`/`, "오늘의 급등 테마")의 "개별 급등" 섹션에서 종목별 급등이유를 클립보드로 복사한다. 주도 테마 복사(quick-260914-jtj)와 같은 모양이다. 섹션 제목 행의 '전체 복사'는 지금 보고 있는 스냅샷의 개별 급등 전체를, 각 SoloCard 의 아이콘 버튼은 그 종목만 복사한다.

사용자 요청 원문: "오늘의 급등테마에서, 개별 급등의 각 종목들의 급등이유도 복사할 수 있게 해줘."

Purpose: 트레이더가 개별 급등 종목의 급등이유(Claude 요약)를 메신저·메모에 바로 붙여넣을 수 있게 한다. 주도 테마 복사와 형식·버튼·피드백을 맞춰 한 화면 안에서 동작이 같게 한다.

Output: home-format.ts 에 formatSingleBlock·formatSinglesSummary 를 추가한다. SoloCard 에 카드별 아이콘 버튼을, HomeClient 개별 급등 제목 행에 '전체 복사'를 단다. vitest 단위·컴포넌트 테스트와 home.spec.ts E2E 1건(실제 클립보드·hit-test·390px)을 추가한다.

Decisions (이 quick 의 결정. 선례 260914-jtj 의 D-02/D-03/D-04 를 그대로 따른다):
- D-01: 버튼은 두 군데다. (A) "개별 급등 N" 제목 행 → 보고 있는 스냅샷의 개별 급등 전체. (B) 각 SoloCard 헤더의 등락% 오른쪽 아이콘 버튼 → 그 종목만. 주도 테마 쪽과 같은 배치.
- D-02: 뉴스 링크 없는 일반 텍스트다. 종목 블록은 `{N. }{종목명} {+x.x%}` 한 줄 + reason 이 truthy 일 때만 reason 한 줄이다. (B)는 번호가 없다. (A)는 `[개별 급등] {tradeDate} {capturedAt 의 KST HH:MM}` 헤더, 빈 줄, 그다음 번호 블록들을 빈 줄 하나로 구분한다. 종목코드·뉴스 제목·URL 은 넣지 않는다(선례 D-02 와 같음). 등락% 는 카드가 렌더하는 formatChange 와 같은 함수다. 끝 개행은 없다. 번호 순서는 화면 카드 순서(payload 순서)이고 다시 정렬하지 않는다.
- D-03 (선례 계승): 토스트 라이브러리를 추가하지 않는다. 기존 CopyTextButton 의 '복사됨'/'복사 실패' 1.8초와 sr-only role=status 안내를 그대로 쓴다. CopyTextButton 은 고치지 않는다.
- D-04 (선례 계승): navigator.clipboard.writeText 를 CopyTextButton 을 통해 쓴다.
- D-05 (재량): reason 이 없는 카드에도 버튼을 항상 렌더한다. 이유 셋. ① 버튼이 카드마다 있다 없다 하면 등락% 열의 오른쪽 끝이 카드마다 32px 씩 어긋난다. ② 이유가 없어도 '{종목명} {+x.x%}' 는 목록 공유에 쓸모 있다. ③ ThemeCard 도 reason 과 무관하게 버튼을 항상 렌더한다.
- D-06 (재량, 코드 근거): SoloCard 는 투명 오버레이 Link(absolute inset-0 z-10)로 카드 전체를 덮는 stretched-link 다. 복사 버튼은 오버레이의 형제로 두고(`<a>` 안에 버튼을 넣지 않는다 — 중첩 interactive 무효) CopyTextButton wrapper 에 z-20 을 준다(wrapper 는 이미 relative). 오버레이의 자손이 아니므로 클릭이 링크로 전파되지 않는다. preventDefault·stopPropagation 은 필요 없다. article 이 이미 `isolate` 라서 z-20 과 말풍선은 카드 스택 컨텍스트에 갇히고 sticky 탑바(z-10) 위로 새지 않는다.
- D-07 (재량): 주도 테마 '전체 복사'는 그대로 둔다(개별 급등을 섞지 않음). 섹션마다 자기 내용만 복사한다. 선례 D-02 의 잠긴 형식을 바꾸지 않는다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260914-jtj-copy-rising-theme-summary-text-on-themes/260914-jtj-SUMMARY.md
@webapp/src/components/home/home-format.ts
@webapp/src/components/home/copy-text-button.tsx
@webapp/src/components/home/solo-card.tsx
@webapp/src/components/home/home-client.tsx
@webapp/src/components/home/__tests__/solo-card.test.tsx
@webapp/src/components/home/__tests__/home-format.test.ts
@webapp/src/components/home/__tests__/home-client.test.tsx
@webapp/e2e/specs/home.spec.ts
@webapp/e2e/fixtures/home.ts
@webapp/e2e/overflow.ts

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 미리 뽑아 둔 계약. -->

From packages/shared/src/home.ts (import type from '@gh-radar/shared'):
- HomeSurgeSingle { code: string; name: string; changeRate: number; reason: string | null; news: HomeNewsRef[] }
- HomeThemeSnapshot { tradeDate: string /* YYYY-MM-DD KST */; capturedAt: string /* ISO */; ...; payload: { themes: HomeSurgeTheme[]; singles: HomeSurgeSingle[]; ... } }

From webapp/src/components/home/home-format.ts (현재 export):
- toKstHhmm(iso): string / formatChange(rate): string / avgChange(theme) / sortStocksByChangeDesc(stocks) / formatThemeBlock(theme, order?) / formatThemesSummary(snapshot: Pick<HomeThemeSnapshot,'tradeDate'|'capturedAt'>, themes)
- formatThemesSummary 는 지금 header 문자열 `[주도 테마] ${tradeDate} ${toKstHhmm(capturedAt)}` 를 직접 만들고 [header, ...blocks].join('\n\n') 한다.

From webapp/src/components/home/copy-text-button.tsx (변경 금지, 재사용만):
- CopyTextButton({ getText: () => string; ariaLabel: string; label?: string; className?: string })
- wrapper = `<span className={cn('relative inline-flex', className)}>` — className 으로 z-20·음수 마진을 넘길 수 있다.
- label 없음 = 32px(size-8) 아이콘 버튼 + 상태가 idle 이 아닐 때 aria-hidden 말풍선(absolute right-0 bottom-full mb-1, 아이콘 **위**, z-index 없음).
- label 있음 = 캡션 텍스트 버튼. 보이는 텍스트 idle=label / '복사됨' / '복사 실패'.
- sr-only role=status 문구 '클립보드에 복사했습니다' / '클립보드 복사에 실패했습니다'.

From webapp/src/components/home/solo-card.tsx (현재):
- 'use client' 없음(HomeClient 가 'use client' 라 클라이언트 번들에 들어감). article = `group card-shadow relative isolate flex flex-col gap-2 ... px-[var(--s-4)] py-[var(--s-3)]`.
- 오버레이 `<Link href=/stocks/{code} aria-label="{name} 종목 상세 보기" className="absolute inset-0 z-10 ...">`.
- 헤더 행 `<div className="flex items-center justify-between gap-3">` = 종목명 span(min-w-0 truncate, 안에 코드 mono span) | 등락% span(`mono shrink-0 text-[length:var(--t-lg)] font-extrabold text-[var(--up)]`, formatChange(single.changeRate)).
- reason 은 `{single.reason && ...}` (truthy 일 때만 렌더). 뉴스 블록은 `relative z-20` div.

From webapp/src/components/home/home-client.tsx (현재):
- themes = payload?.themes ?? [], singles = payload?.singles ?? [], isEmpty = !snapshot || (둘 다 비어있음).
- 주도 테마 섹션: `snapshot && themes.length > 0` + 제목 행(`mt-[var(--s-2)] flex items-center gap-2`) 에 CopyTextButton label '전체 복사' ariaLabel '주도 테마 전체 복사' className 'ml-auto'.
- 개별 급등 섹션: `singles.length > 0` + 같은 모양의 제목 행(h2 '개별 급등' + count badge), 버튼 없음. 카드 = singles.map → `<SoloCard key={single.code} single={single} />` (payload 순서 그대로).

Test infra:
- vitest 2 + jsdom, setupFiles tests/setup.ts (jest-dom, RTL cleanup, 테스트마다 query cache 비움).
- jsdom 에는 navigator.clipboard 가 없다. Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }) 로 넣고 afterEach 에서 delete. user-event 금지(setup() 이 clipboard 를 바꿔치기) — fireEvent 사용.
- home-client.test.tsx 에 DATE='2026-09-14', SLOT_B='2026-09-14T01:00:00.000Z'(10:00 KST), THEMED_RESPONSE(themes T1 2차전지·T2 원전, singles []), fetchHomeMock, 기존 describe 2개('HomeClient 자동 갱신 (최신 보기에서만)', '주도 테마 전체 복사 (quick-260914-jtj)')가 있다.
- E2E fixture HOME_POPULATED: tradeDate '2026-07-02', capturedAt SLOT_1530(15:30 KST), singles 1건 = { code '035720', name '카카오', changeRate 22.8, reason '신규 AI 서비스 출시 소식', news 1건 }.
- e2e/overflow.ts 의 leavesOverflowing(scope: Locator, right: number) → 오른쪽 경계 밖으로 밀린 잎 요소 배열(없으면 []).
- 게이트 명령: `pnpm -C webapp test`(vitest --run), `pnpm -C webapp typecheck`(app + tsconfig.e2e), `pnpm --filter @gh-radar/webapp lint`(next lint), E2E `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/home.spec.ts`(webServer PORT=3100 pnpm dev, setup 프로젝트가 로그인 storageState 생성).
</interfaces>

## Source Coverage Audit

| Source | Item | Covered by |
|--------|------|------------|
| GOAL | 개별 급등 각 종목의 급등이유 복사 | Task 1 (카드별), Task 2 (섹션 전체), Task 3 (실브라우저 검증) |
| CONTEXT | D-01 (A) 제목 행 '전체 복사' | Task 2 |
| CONTEXT | D-01 (B) 카드별 아이콘 버튼 | Task 1 |
| CONTEXT | D-02 텍스트 형식(헤더·번호·reason 생략·코드/뉴스 없음·화면 순서·같은 formatChange) | Task 1 (블록), Task 2 (섹션 + 정확 문자열), Task 3 (실제 클립보드) |
| CONTEXT | D-03/D-04 기존 CopyTextButton 재사용, 새 의존성 없음 | Task 1·2 (재사용), Task 3 (게이트) |
| CONTEXT | D-05 reason 없어도 버튼 렌더 | Task 1 |
| CONTEXT | D-06 오버레이 위 z-20, 이동 없음 | Task 1 (구조 테스트), Task 3 (hit-test + URL 불변) |
| CONTEXT | D-07 주도 테마 복사 불변·섹션 독립 | Task 2 (혼합 스냅샷 테스트 + 기존 테스트 무변경 통과) |
| Discretion | 390px 헤더 한 행·말풍선 겹침 없음 | Task 3 (E2E 단언 + 시각 점검) |
| REQ / RESEARCH | 없음 (quick 모드, research 없음) | — |
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 카드별 급등이유 복사를 끝까지 한 경로로 연결 — formatSingleBlock → CopyTextButton → SoloCard(오버레이 위) → 클립보드</name>
  <files>webapp/src/components/home/home-format.ts, webapp/src/components/home/solo-card.tsx, webapp/src/components/home/__tests__/solo-card.test.tsx, webapp/src/components/home/__tests__/home-format.test.ts</files>
  <behavior>
    Fixtures for home-format.test.ts (define once at file top, reused by Task 2):
    - S1 = { code: '042700', name: '한미반도체', changeRate: 29.9, reason: 'HBM 장비 수주 공시', news: [{ title: '한미반도체 수주 기사', url: 'https://example.com/hm', source: '연합뉴스' }] }
    - S2 = { code: '035720', name: '카카오', changeRate: 22.8, reason: null, news: [] }

    Formatter cases (home-format.test.ts, new describe 'formatSingleBlock'):
    - formatSingleBlock(S1, 1) === "1. 한미반도체 +29.9%\nHBM 장비 수주 공시"
    - formatSingleBlock(S2) === "카카오 +22.8%" (null reason omitted, no number, single line).
    - A reason of '' is also omitted: formatSingleBlock({ ...S1, reason: '' }) === "한미반도체 +29.9%".
    - formatSingleBlock(S1) contains none of '042700', 'https://', '한미반도체 수주 기사' (per D-02).

    SoloCard cases (solo-card.test.tsx, new describe 'SoloCard — 급등이유 복사 (quick-260923-cre)', clipboard stubbed in beforeEach, deleted in afterEach):
    - With the existing makeSingle() (삼성전자 21.3, reason '반도체 업황 회복 기대'), the button with exact name '삼성전자 급등이유 복사' exists. fireEvent.click → writeText called once with exactly "삼성전자 +21.3%\n반도체 업황 회복 기대". Then `await screen.findByText('복사됨')` resolves.
    - reason null (per D-05): render with { ...makeSingle(), reason: null }. The button still exists, and clicking copies exactly "삼성전자 +21.3%".
    - Overlay structure (per D-06): the link named '삼성전자 종목 상세 보기' does NOT contain the button (expect(link).not.toContainElement(button)); the button's parentElement className contains 'z-20'; the link's closest('article') contains the button; window.location.href is the same before and after the click.
    - Regression: the 3 existing SoloCard tests pass unchanged.
  </behavior>
  <action>
Start red: add the new home-format and SoloCard test cases from the behavior block first, run them, and watch them fail (formatSingleBlock missing, button missing). Then implement.

1. `webapp/src/components/home/home-format.ts`:
   - Add HomeSurgeSingle to the existing `import type` from '@gh-radar/shared'.
   - Add the exported `formatSingleBlock(single: HomeSurgeSingle, order?: number): string` right after formatThemeBlock, with a short Korean JSDoc citing quick-260923-cre D-02 in the same style as formatThemeBlock's comment.
   - Body mirrors formatThemeBlock: the prefix is "{order}. " when order is given, otherwise empty. The first line is prefix + single.name + " " + formatChange(single.changeRate). Push single.reason as a second line only when it is truthy (the same check SoloCard uses to render it, so '' is omitted too). Join with a single newline and add no trailing newline. Leave out code, news titles and URLs (per D-02).
   - Extend the module header JSDoc with one line noting quick-260923-cre added the 개별 급등 formatters.

2. `webapp/src/components/home/solo-card.tsx`:
   - Add `'use client';` as the first line. SoloCard now passes a function prop (getText) to a client component, and the directive keeps that valid even if SoloCard is ever imported from a server component. Rendering is unchanged.
   - Import CopyTextButton from './copy-text-button' and add formatSingleBlock to the './home-format' import.
   - Header row (per D-01 B): wrap the existing change% span in a new div with `flex shrink-0 items-center gap-1`. Move `shrink-0` from the change% span onto this wrapper and keep all other change% classes as they are. Inside the wrapper, put the change% span first, then CopyTextButton in the icon variant (no label) with ariaLabel = single.name + ' 급등이유 복사', getText returning formatSingleBlock(single) with no order, and className "z-20 -my-1 -mr-1".
     - z-20 lifts the button above the z-10 overlay Link (the CopyTextButton wrapper is already relative). The button stays a sibling of the Link, not a descendant, so its click never reaches the link. Add no preventDefault or stopPropagation (per D-06).
     - -my-1 cancels the 32px box height so the header row does not grow taller than the 18px change% line. -mr-1 tucks the icon toward the card's right edge like ThemeCard's "-mr-1 -mt-1".
   - Render the button for every card, including when reason is null or '' (per D-05).
   - Update the component JSDoc: in the header structure line, mention the copy icon button (32px, aria-label "{종목명} 급등이유 복사", copies that stock's block only, quick-260923-cre). In the stretched-link paragraph, add that the copy button also sits above the overlay at z-20 as a sibling of the Link, confined by the article's isolate.
   - Do not touch the overlay Link, the reason span or the news block.

3. `webapp/src/components/home/__tests__/solo-card.test.tsx`: add the new describe from the behavior block.
   - Import vi, beforeEach and afterEach from vitest, and fireEvent from @testing-library/react.
   - In beforeEach, define navigator.clipboard with writeText = vi.fn().mockResolvedValue(undefined) via Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }). In afterEach, delete it and call vi.restoreAllMocks().
   - Update the file header comment's 계약 list with the copy button contract. Leave the existing 3 tests as they are.

4. `webapp/src/components/home/__tests__/home-format.test.ts`: import formatSingleBlock and the HomeSurgeSingle type, add the S1/S2 fixtures near T1/T2, and add the describe 'formatSingleBlock'. Compare against exact string literals, not snapshots.

Commit after green (Korean message, e.g. `feat(quick-260923-cre): 개별 급등 카드별 급등이유 복사 버튼 추가`, no Co-Authored-By line).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp exec vitest run src/components/home/__tests__/solo-card.test.tsx src/components/home/__tests__/home-format.test.ts && pnpm -C webapp typecheck</automated>
  </verify>
  <done>Every SoloCard shows a '{종목명} 급등이유 복사' icon button to the right of its change%, including cards with no reason. Clicking it writes '{종목명} {+x.x%}' plus the reason line (only when present) to the clipboard, shows '복사됨', and does not navigate: the button is a z-20 sibling of the overlay Link, not inside it. formatSingleBlock is exported from home-format.ts. SoloCard (3 old + new) and home-format tests pass, and webapp typecheck passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 개별 급등 제목 행 '전체 복사' — formatSinglesSummary + 헤더 헬퍼 공유 + HomeClient 배선</name>
  <files>webapp/src/components/home/home-format.ts, webapp/src/components/home/home-client.tsx, webapp/src/components/home/__tests__/home-format.test.ts, webapp/src/components/home/__tests__/home-client.test.tsx</files>
  <behavior>
    Formatter cases (home-format.test.ts, new describe 'formatSinglesSummary', reusing S1/S2 from Task 1):
    - formatSinglesSummary({ tradeDate: '2026-09-23', capturedAt: '2026-09-23T01:32:00.000Z' }, [S1, S2]) === "[개별 급등] 2026-09-23 10:32\n\n1. 한미반도체 +29.9%\nHBM 장비 수주 공시\n\n2. 카카오 +22.8%". No trailing newline, and none of 'https://', '042700', '한미반도체 수주 기사' appears.
    - Order is preserved, not re-sorted: formatSinglesSummary(same snapshot, [S2, S1]) === "[개별 급등] 2026-09-23 10:32\n\n1. 카카오 +22.8%\n\n2. 한미반도체 +29.9%\nHBM 장비 수주 공시".
    - KST time: capturedAt '2026-09-22T23:05:00.000Z' with tradeDate '2026-09-23' gives a header starting '[개별 급등] 2026-09-23 08:05'. The date comes from tradeDate and the time is converted to KST.
    - The existing formatThemesSummary tests pass unchanged (the header-helper refactor must not change its output).

    HomeClient cases (home-client.test.tsx, new describe '개별 급등 전체 복사 (quick-260923-cre)', real timers):
    - Singles only: fetchHome resolves a snapshot with tradeDate DATE, capturedAt SLOT_B, themes [] and singles [S1, S2] (define S1/S2 locally in this test file with the same values as Task 1). queryByRole('button', { name: '주도 테마 전체 복사' }) is null. The button found by `await screen.findByRole('button', { name: '개별 급등 전체 복사' })` has text content '전체 복사'. After fireEvent.click, writeText is called once with exactly "[개별 급등] 2026-09-14 10:00\n\n1. 한미반도체 +29.9%\nHBM 장비 수주 공시\n\n2. 카카오 +22.8%", and `await screen.findByText('복사됨')` resolves.
    - Both sections (per D-07): the snapshot is THEMED_RESPONSE's themes plus singles [S1, S2]. Buttons '한미반도체 급등이유 복사' and '카카오 급등이유 복사' exist. Clicking '개별 급등 전체 복사' makes writeText call #1 the exact singles literal above, and it contains no '[주도 테마]'. Clicking '주도 테마 전체 복사' makes call #2 exactly the existing themes literal from the jtj describe ("[주도 테마] 2026-09-14 10:00\n\n1. 2차전지 (평균 +26.1%)\n…- 한전기술 +20.0%"), and it contains no '[개별 급등]'. Do not assert on '복사됨' in this case: two buttons may show it at once.
    - The existing 'HomeClient 자동 갱신' and '주도 테마 전체 복사 (quick-260914-jtj)' describes and their fixtures are unchanged and still pass.
  </behavior>
  <action>
Start red: add the formatter cases and the new HomeClient describe first, run them, and watch them fail. Then implement.

1. `webapp/src/components/home/home-format.ts`:
   - Add a NON-exported helper `snapshotHeader(title: string, snapshot: Pick<HomeThemeSnapshot, 'tradeDate' | 'capturedAt'>): string` returning "[" + title + "] " + snapshot.tradeDate + " " + toKstHhmm(snapshot.capturedAt).
   - Refactor formatThemesSummary to build its header with snapshotHeader('주도 테마', snapshot). The output must stay byte-identical (per D-07); the existing exact-literal tests guard this.
   - Add the exported `formatSinglesSummary(snapshot: Pick<HomeThemeSnapshot, 'tradeDate' | 'capturedAt'>, singles: HomeSurgeSingle[]): string`. It returns snapshotHeader('개별 급등', snapshot) followed by singles.map((s, i) => formatSingleBlock(s, i + 1)), all joined with '\n\n'. Keep the given order and do NOT sort: the numbers must match the on-screen card order, which renders payload order (per D-02). No trailing newline.
   - Give it a Korean JSDoc in the same style as formatThemesSummary's, citing quick-260923-cre D-02.

2. `webapp/src/components/home/home-client.tsx` (per D-01 A):
   - Add formatSinglesSummary to the './home-format' import.
   - Change the 개별 급등 section render condition from `singles.length > 0` to `snapshot && singles.length > 0`. At runtime this is the same (isEmpty already guarantees a snapshot whenever singles exist), but it narrows snapshot for TypeScript. Add a one-line comment mirroring the 주도 테마 section's narrowing comment.
   - In that section's heading row, add CopyTextButton after the count badge, mirroring the 주도 테마 row exactly: label "전체 복사", ariaLabel "개별 급등 전체 복사" (contains the visible label, WCAG 2.5.3), getText returning formatSinglesSummary(snapshot, singles), className "ml-auto". Because getText is lazy, it copies whichever snapshot the user is viewing, including past slots.
   - Do not change the 주도 테마 section (per D-07).
   - Update the populated-state line of the JSDoc: "개별 급등"(count-badge + 우측 '전체 복사' — 보고 있는 스냅샷의 개별 급등 전체, quick-260923-cre) SoloCard(카드별 급등이유 복사 아이콘).

3. `webapp/src/components/home/__tests__/home-format.test.ts`: import formatSinglesSummary and add the describe 'formatSinglesSummary' with the cases above.

4. `webapp/src/components/home/__tests__/home-client.test.tsx`: add the new describe with its own beforeEach/afterEach, using the same clipboard stub pattern as the jtj describe (Object.defineProperty configurable, delete in afterEach, vi.restoreAllMocks, fetchHomeMock.mockReset + mockResolvedValue). Build the two responses from the existing DATE, SLOT_B and THEMED_RESPONSE, spreading THEMED_RESPONSE's snapshot and payload so you do not copy the themes. Set themeCount/stockCount to plausible values. Use fireEvent.click. Do not edit the two existing describes or their fixtures.

Commit after green (Korean message, e.g. `feat(quick-260923-cre): 개별 급등 제목 행 전체 복사 추가`, no Co-Authored-By line).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp exec vitest run src/components/home/__tests__/home-format.test.ts src/components/home/__tests__/home-client.test.tsx src/components/home/__tests__/solo-card.test.tsx && pnpm -C webapp typecheck</automated>
  </verify>
  <done>The "개별 급등 N" heading row has a right-aligned '전체 복사' button (aria-label '개별 급등 전체 복사'). It copies '[개별 급등] {tradeDate} {KST HH:MM}', a blank line, then numbered blocks in on-screen order separated by blank lines, with no codes or links. It works when there are no themes. The 주도 테마 copy output is byte-identical and each section copies only itself. formatThemesSummary and formatSinglesSummary share one header helper. Formatter, HomeClient and SoloCard tests pass, and typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 3: 실제 브라우저 E2E(클립보드·hit-test·390px) + webapp 전체 게이트 + 시각 점검</name>
  <files>webapp/e2e/specs/home.spec.ts</files>
  <action>
1. In `webapp/e2e/specs/home.spec.ts`, add one test inside the existing describe 'Phase 13 — 홈 승격 (HOME-01)', named '개별 급등 복사 — 카드 버튼은 상세로 이동하지 않고 그 종목만, 제목 행은 섹션 전체 (quick-260923-cre)'. Import leavesOverflowing from '../overflow'. Do not change any existing test.
   - Setup: destructure { page, context }. Call context.grantPermissions(['clipboard-read', 'clipboard-write']). Set the viewport to 390x900 BEFORE page.goto. Then mockHomeApi(page, { response: HOME_POPULATED }) and page.goto('/'). Wait for the heading '개별 급등' to be visible (timeout 10_000).
   - Locators: cardBtn = the button named '카카오 급등이유 복사'. card = page.locator('article').filter({ has: cardBtn }). pct = card.getByText('+22.8%'). sectionBtn = the button named '개별 급등 전체 복사'.
   - 390px layout, before any click: call cardBtn.scrollIntoViewIfNeeded(), then read the bounding boxes of card, pct and cardBtn. Assert all three:
     - Same row: the vertical centers of pct and cardBtn differ by at most 8px.
     - cardBtn's right edge is at or inside card's right edge.
     - leavesOverflowing(card, cardBox.x + cardBox.width) equals [].
   - Card click (per D-06): call cardBtn.click() WITHOUT force. Playwright's actionability check fails with "intercepts pointer events" if the overlay link covers the button, so this click is the real hit-test proof. Then:
     - Clipboard: expect.poll on page.evaluate(() => navigator.clipboard.readText()) to equal "카카오 +22.8%\n신규 AI 서비스 출시 소식".
     - Bubble: bubble = card.getByText('복사됨') is visible. Without scrolling in between, read the boxes of bubble, pct and sectionBtn, and assert with a small local rectangle-intersection helper that the bubble intersects neither pct nor sectionBtn. This is the failure mode 260914-jtj found at 390px.
     - No navigation: new URL(page.url()).pathname is still '/', and the heading '개별 급등' is still visible.
   - Section click: call sectionBtn.click(), then expect.poll readText to equal "[개별 급등] 2026-07-02 15:30\n\n1. 카카오 +22.8%\n신규 AI 서비스 출시 소식".
   - If the bubble-overlap or same-row assertion fails, fix it in SoloCard's placement classes (the className passed to CopyTextButton or the wrapper div). Do NOT move CopyTextButton's bubble, because ThemeCard depends on its current above-icon placement. Record the change in SUMMARY as a deviation. Never weaken the assertion.

2. Run the full webapp gates from the repo root:
   - `pnpm -C webapp test`
   - `pnpm -C webapp typecheck` (app + e2e tsconfig)
   - `pnpm --filter @gh-radar/webapp lint`
   - the home E2E: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/home.spec.ts`. Its webServer boots `PORT=3100 pnpm dev`, and the setup project creates the login storageState. If auth or env is unavailable in this session, write "not run (reason)" in SUMMARY. Never report it as passed.

3. Visual check (not a blocking checkpoint): take temporary screenshots of the 개별 급등 section at 390px and 1280px, idle and right after a card click, then delete any temporary spec or files. Confirm three things:
   - The header row still shows the name, code and change% on one line with the icon, and is not visibly taller than before (the -my-1 margin cancels the 32px box).
   - The bubble floats above the icon without covering the change% or the heading's '전체 복사' button.
   - The heading '전체 복사' sits right-aligned in the "개별 급등 N" row, the same as the 주도 테마 row.
   Fix any wrapping, clipping or overlap on these surfaces directly (SoloCard / HomeClient classes only) and note it in one line.

Commit the E2E (Korean message, e.g. `test(quick-260923-cre): 개별 급등 복사 E2E — 클립보드·오버레이 hit-test·390 레이아웃`, no Co-Authored-By line).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp test && pnpm -C webapp typecheck && pnpm --filter @gh-radar/webapp lint && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/home.spec.ts</automated>
  </verify>
  <done>home.spec.ts has the quick-260923-cre test. In real Chromium it clicks the per-card copy button without force: the button is not intercepted by the overlay link, and the URL stays '/'. The clipboard receives the exact card block, then the exact section summary. At 390px the header row stays single-line with no overflow, and the bubble covers neither change% nor the heading '전체 복사'. `pnpm -C webapp test`, `pnpm -C webapp typecheck` and `pnpm --filter @gh-radar/webapp lint` exit 0. The home E2E passes, or the SUMMARY states "not run (reason)" when the environment blocks it.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API payload → clipboard | 종목명·등락률·상승 이유(Claude 생성)가 사용자 클립보드로 나간다. 값은 이미 화면에 렌더된 공개 데이터다. |
| browser Clipboard API | 권한 거부·비보안 컨텍스트·API 부재에서 writeText 가 reject 되거나 API 가 없을 수 있다. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-cre-01 | Tampering | solo-card.tsx / home-client.tsx → CopyTextButton → clipboard | low | mitigate | 기존 CopyTextButton 을 그대로 재사용해 일반 텍스트만 navigator.clipboard.writeText 로 쓴다. HTML ClipboardItem 과 dangerouslySetInnerHTML 을 쓰지 않으므로, AI 생성 reason 이 붙여넣는 쪽에서 마크업으로 해석될 경로가 없다. |
| T-cre-02 | Information Disclosure | home-format.ts formatSingleBlock / formatSinglesSummary | low | accept | 복사 내용은 같은 화면에 보이는 종목명·등락률·이유뿐이다. 뉴스 제목·URL 과 종목코드는 뺀다(D-02). 원본 뉴스 콘텐츠를 재배포하지 않는다(CLAUDE.md 5원칙 #5 취지). 새 데이터 노출은 없다. |
| T-cre-03 | Denial of Service | Clipboard API 부재/거부 | low | mitigate | CopyTextButton 의 기존 가드(API 부재 → throw → catch)와 reject catch → '복사 실패' 표시 + 에러만 console.error(복사 텍스트는 로그 금지). 260914-jtj 의 copy-text-button.test.tsx 가 이미 검증하며, 이번에 컴포넌트는 바꾸지 않는다. |

패키지 설치 없음 (새 dependency 0개). 공급망(SC) 위협 해당 없음.
</threat_model>

<verification>
- Unit/component: `pnpm -C webapp exec vitest run src/components/home/__tests__/` is green, covering the new formatSingleBlock/formatSinglesSummary exact literals, the SoloCard copy/no-reason/overlay-structure cases, the HomeClient singles-only and both-sections cases, and all pre-existing home tests unchanged.
- Full gates (Task 3 verify): `pnpm -C webapp test`, `pnpm -C webapp typecheck` and `pnpm --filter @gh-radar/webapp lint` exit 0.
- E2E: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/home.spec.ts` passes, including the new real-clipboard, hit-test and 390px test. If the environment blocks it, SUMMARY says "not run (reason)".
- Grep: `grep -n "formatSingleBlock(single)" webapp/src/components/home/solo-card.tsx` and `grep -n "formatSinglesSummary(snapshot, singles)" webapp/src/components/home/home-client.tsx` each return one line. `git diff <plan_head_before> -- webapp/src/components/home/copy-text-button.tsx` is empty, where plan_head_before is the HEAD recorded before Task 1 (currently 25cf420): the component is reused, not modified (per D-03). If Task 3 fixed placement, it touched only SoloCard or HomeClient.
</verification>

<success_criteria>
- D-01: both placements exist. The 개별 급등 heading button copies every single in the viewed snapshot; each SoloCard icon button copies only its own stock.
- D-02: the copied text matches the format exactly, proven by exact-literal unit tests and a real-Chromium clipboard read. Change % comes from the same formatChange the card renders. No code, news title or URL. On-screen order.
- D-03/D-04: CopyTextButton is reused unchanged ('복사됨'/'복사 실패', sr-only status, writeText), and no dependency is added.
- D-05: cards with a null or '' reason still show the button and copy '{종목명} {+x.x%}'.
- D-06: clicking the card copy button never navigates. It is a z-20 sibling of the overlay Link, proven by the jsdom structure test and the Playwright non-forced click with the URL unchanged.
- D-07: the 주도 테마 '전체 복사' output is byte-identical, and each section copies only itself.
- 390px: the SoloCard header stays one row with no overflow, and the bubble covers neither change% nor the heading '전체 복사'.
- webapp test, typecheck, lint and home E2E are green, or the E2E is honestly reported as "not run (reason)".
</success_criteria>

<output>
Create `.planning/quick/260923-cre-copy-solo-surge-reasons/260923-cre-SUMMARY.md` when done.
Commits: one per task on the main tree (no worktree), Korean messages formatted like `feat(quick-260923-cre): …` / `test(quick-260923-cre): …`, and NO Co-Authored-By line.
</output>
