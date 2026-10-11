---
phase: quick-260914-jtj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/home/home-format.ts
  - webapp/src/components/home/copy-text-button.tsx
  - webapp/src/components/home/theme-card.tsx
  - webapp/src/components/home/home-client.tsx
  - webapp/src/components/home/home-header.tsx
  - webapp/src/components/home/solo-card.tsx
  - webapp/src/components/home/__tests__/home-format.test.ts
  - webapp/src/components/home/__tests__/copy-text-button.test.tsx
  - webapp/src/components/home/__tests__/theme-card.test.tsx
  - webapp/src/components/home/__tests__/home-client.test.tsx
  - webapp/e2e/specs/home.spec.ts
autonomous: true
requirements:
  - QUICK-260914-jtj

must_haves:
  truths:
    - "홈 '주도 테마 N' 제목 행 오른쪽에 '전체 복사' 버튼이 있고, 클릭하면 지금 보고 있는 스냅샷의 모든 테마가 '[주도 테마] {tradeDate} {KST HH:MM}' 헤더 + 번호 붙은 테마 블록(빈 줄 구분) 형식으로 클립보드에 복사된다 (D-01 A, D-02)"
    - "각 ThemeCard 헤더의 평균 등락 옆에 aria-label '{테마명} 요약 복사' 아이콘 버튼이 있고, 클릭하면 그 테마 블록만(번호·날짜 헤더 없이) 복사된다 (D-01 B, D-02)"
    - "복사 텍스트는 reason 이 null 이면 그 줄을 생략하고, 소속 종목을 등락률 내림차순으로 전부(TOP 4 아님) '- {종목명} {+x.x%}' 로 나열하며, 뉴스 링크·제목은 포함하지 않는다. 등락% 문자열은 화면과 같은 함수에서 나온다 (D-02)"
    - "클릭 성공 시 버튼이 약 1.8초 동안 '복사됨' + 체크 아이콘을 보였다가 원래대로 돌아가고, 클립보드 실패(권한 거부·API 없음) 시 '복사 실패'를 보이며 role=status 로 안내된다. 토스트 라이브러리는 추가하지 않는다 (D-03, D-04)"
    - "ThemeCard 헤더는 390px 폭에서도 32px 아이콘 버튼 하나가 늘어난 것 외에는 줄바꿈이나 겹침이 없다. 피드백 말풍선은 absolute 로 떠서 레이아웃을 밀지 않는다 (D-03)"
  artifacts:
    - path: "webapp/src/components/home/home-format.ts"
      provides: "등락%·평균·정렬·KST 시각의 단일 원천과 복사 텍스트 포매터"
      exports: ["formatChange", "avgChange", "sortStocksByChangeDesc", "toKstHhmm", "formatThemeBlock", "formatThemesSummary"]
    - path: "webapp/src/components/home/copy-text-button.tsx"
      provides: "상태(idle/copied/failed)와 정리되는 타이머를 가진 재사용 복사 버튼 (label·icon 두 가지)"
      exports: ["CopyTextButton"]
    - path: "webapp/src/components/home/__tests__/home-format.test.ts"
      provides: "포매터 단위 테스트 (정확한 문자열 비교)"
    - path: "webapp/src/components/home/__tests__/copy-text-button.test.tsx"
      provides: "복사 버튼 상태 머신 테스트 (성공·복귀·실패·API 없음·unmount)"
  key_links:
    - from: "webapp/src/components/home/theme-card.tsx"
      to: "webapp/src/components/home/home-format.ts"
      via: "formatChange/avgChange/sortStocksByChangeDesc/formatThemeBlock import — 화면과 복사 텍스트가 같은 함수를 쓴다"
      pattern: "from './home-format'"
    - from: "webapp/src/components/home/home-client.tsx"
      to: "webapp/src/components/home/copy-text-button.tsx"
      via: "제목 행 CopyTextButton getText → formatThemesSummary(snapshot, themes)"
      pattern: "formatThemesSummary\\(snapshot, themes\\)"
    - from: "webapp/src/components/home/copy-text-button.tsx"
      to: "navigator.clipboard.writeText"
      via: "클릭 시 getText() 결과를 일반 텍스트로 쓰기"
      pattern: "clipboard"
    - from: "webapp/src/components/home/home-header.tsx"
      to: "webapp/src/components/home/home-format.ts"
      via: "toKstHhmm import (로컬 사본 제거)"
      pattern: "toKstHhmm"
---

<objective>
홈(`/`, "오늘의 급등 테마")의 "주도 테마" 요약을 클립보드로 복사하는 기능. 버튼은 두 군데다. 섹션 제목 행의 '전체 복사'는 지금 보고 있는 스냅샷의 모든 테마를, 각 테마 카드 헤더의 아이콘 버튼은 그 테마만 복사한다 (D-01).

Purpose: 트레이더가 오늘의 급등 테마 요약(테마명·평균 등락·상승 이유·소속 종목 등락률)을 메신저나 메모에 바로 붙여넣을 수 있게 한다. 복사 텍스트의 등락% 문자열은 화면 표시와 같은 함수에서 나오게 해서 둘이 어긋나지 않게 한다 (D-02).

Output: 순수 포매터 모듈 `home-format.ts`, 재사용 복사 버튼 `copy-text-button.tsx`, ThemeCard·HomeClient 배선, 로컬 헬퍼 사본 3개 제거(theme-card·solo-card·home-header), vitest 단위·컴포넌트 테스트, 테마명 버튼을 찾던 기존 테스트 쿼리를 정확 일치로 수정.

User decisions (LOCKED, 사용자 확인 완료. 다시 묻지 않는다):
- D-01: 복사 버튼은 두 군데다. (A) "주도 테마 N" 제목 행 → 현재 스냅샷의 모든 테마. (B) 각 ThemeCard 헤더의 평균 등락 근처 아이콘 버튼 → 그 테마만.
- D-02: 뉴스 링크 없는 일반 텍스트. (A)는 `[주도 테마] {tradeDate} {capturedAt 의 KST HH:MM}` 헤더, 빈 줄, 그다음 테마 블록들을 빈 줄 하나로 구분한다. 테마 블록 = `N. {name} (평균 {avg})` / reason 이 null 이 아닐 때만 reason 줄 / 소속 종목 전부를 changeRate 내림차순으로 `- {name} {+x.x%}`. (B)는 같은 블록에서 번호와 날짜 헤더를 뺀 것. 등락% 는 UI 와 같은 부호 + toFixed(1) 로직을 쓰고, 평균은 카드의 avgChange 와 같다.
- D-03: 토스트 라이브러리는 추가하지 않는다. 성공하면 약 1.5~2초 동안 "복사됨 ✓" 을 보였다가 원래대로 돌아간다. 실패하면 짧게 "복사 실패" 를 보이고 조용히 삼키지 않는다. 카드 아이콘 버튼에는 aria-label("{테마명} 요약 복사")을 달고, 상태 변화는 aria-live 로 안내한다.
- D-04: 기존 클립보드 헬퍼가 없으므로 `navigator.clipboard.writeText` 를 쓴다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@webapp/src/components/home/home-client.tsx
@webapp/src/components/home/theme-card.tsx
@webapp/src/components/home/home-header.tsx
@webapp/src/components/home/solo-card.tsx
@packages/shared/src/home.ts
@webapp/src/components/home/__tests__/theme-card.test.tsx
@webapp/src/components/home/__tests__/home-client.test.tsx
@webapp/tests/setup.ts

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 미리 뽑아 둔 계약. -->

From packages/shared/src/home.ts (import type from '@gh-radar/shared'):
- HomeSurgeStock { code: string; name: string; changeRate: number }
- HomeSurgeTheme { name: string; reason: string | null; stocks: HomeSurgeStock[]; news: HomeNewsRef[] }
- HomeThemeSnapshot { tradeDate: string /* YYYY-MM-DD KST */; capturedAt: string /* ISO */; themeCount; stockCount; isCarried; payload: HomeSnapshotPayload }
- HomeSnapshotResponse { snapshot: HomeThemeSnapshot | null; index: HomeSnapshotIndexEntry[] }

Current local helpers to be moved (identical logic today):
- theme-card.tsx: formatChange(rate) = (rate > 0 ? '+' : '') + rate.toFixed(1) + '%'; avgChange(theme) = mean of finite stock changeRates, 0 if none; inline sort = copy of theme.stocks sorted by (a, b) => b.changeRate - a.changeRate
- solo-card.tsx: formatChange (same body as theme-card's)
- home-header.tsx: toKstHhmm(iso) = Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); also used by slotPhaseLabel and the slider labels

Existing utilities:
- cn(...inputs) from '@/lib/utils' (shadcn standard)
- lucide-react icons Copy, Check, X
- Tailwind v4 `sr-only` utility (already used in components/ui/sheet.tsx)
- Tokens: --muted-fg, --primary, --destructive, --ring, --border, --card, --r-sm, --t-caption

Test infra:
- vitest 2 + jsdom, include 'src/**/*.test.{ts,tsx}', setupFiles tests/setup.ts (jest-dom matchers; RTL cleanup + clearQueryCache() after each test, so a second describe in home-client.test.tsx starts from an empty cache)
- jsdom does NOT implement navigator.clipboard, and setup.ts does not stub it. Tests must define it with Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }) and remove it in afterEach.
- Existing tests use fireEvent, not user-event. Keep fireEvent: userEvent.setup() swaps in its own navigator.clipboard stub, which would bypass the mock.
</interfaces>

## Source Coverage Audit

| Source | Item | Covered by |
|--------|------|------------|
| GOAL | 홈 주도 테마 요약을 클립보드로 복사 | Task 1 (카드), Task 2 (섹션) |
| CONTEXT | D-01 (A) 섹션 버튼, 현재 스냅샷 전체 | Task 2 |
| CONTEXT | D-01 (B) 카드별 아이콘 버튼 | Task 1 |
| CONTEXT | D-02 텍스트 형식 (헤더·번호·reason 생략·종목 전부 내림차순·링크 없음·UI 와 같은 등락%) | Task 1 (블록), Task 2 (섹션 + 정확한 문자열 테스트) |
| CONTEXT | D-03 복사됨/복사 실패 상태·토스트 미추가·aria-label·aria-live | Task 1 (구현), Task 3 (상태 테스트 + 토스트 없음 grep) |
| CONTEXT | D-04 navigator.clipboard.writeText | Task 1 (구현), Task 3 (API 없음 → 실패) |
| Discretion | 헬퍼 단일 원천(사본 제거)·390px 레이아웃·토큰 스타일 | Task 1–3 |
| REQ / RESEARCH | 없음 (quick 모드, research 없음) | — |
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 카드 요약 복사를 끝까지 한 경로로 연결 — 포매터 → 복사 버튼 → ThemeCard → 클립보드</name>
  <files>webapp/src/components/home/home-format.ts, webapp/src/components/home/copy-text-button.tsx, webapp/src/components/home/theme-card.tsx, webapp/src/components/home/__tests__/theme-card.test.tsx, webapp/e2e/specs/home.spec.ts</files>
  <behavior>
    - Card copy (D-01 B, D-02): render ThemeCard with theme { name: '원전', reason: null, stocks: [{ code: '052690', name: '한전기술', changeRate: 20 }, { code: '034020', name: '두산에너빌리티', changeRate: 23 }], news: [{ title: '원전 기사', url: 'https://example.com/n', source: '연합뉴스' }] }. Click the button named exactly '원전 요약 복사'. navigator.clipboard.writeText must be called once with the literal "원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%". That means no reason line, stocks sorted desc, no number prefix, no date header, no news title or URL.
    - All stocks, not just the top 4 (D-02): with the existing makeTheme() fixture (17 stocks), the copied text has exactly 17 lines starting with '- '. It includes '- 종목16 +28.0%' and '- 종목0 +20.0%', its first line is '2차전지 (평균 +24.0%)', and it contains no 'https://'.
    - Feedback (D-03): after the click, `await screen.findByText('복사됨')` resolves.
    - Regression: all existing ThemeCard tests still pass. Their theme-name trigger queries are switched to exact names (see action step 4).
  </behavior>
  <action>
Start red: write the new ThemeCard copy tests from the behavior block first, run them, and watch them fail. Then implement.

1. Create `webapp/src/components/home/home-format.ts`. It is plain TypeScript: no 'use client', no React. Give it a short Korean JSDoc header like its sibling files, citing quick-260914-jtj, and use `import type { HomeSurgeStock, HomeSurgeTheme } from '@gh-radar/shared'`. Export these functions:
   - `formatChange(rate: number): string`, moved from theme-card.tsx with the logic unchanged.
   - `avgChange(theme: HomeSurgeTheme): number`, moved unchanged (mean of finite rates, 0 when there are none).
   - `sortStocksByChangeDesc(stocks: HomeSurgeStock[]): HomeSurgeStock[]`. Sort a copy with the comparator ThemeCard uses today. Never mutate the input.
   - `formatThemeBlock(theme: HomeSurgeTheme, order?: number): string`. Join lines with a single newline and add no trailing newline. The title line is an optional "{order}. " prefix, then the theme name, a space, and "(평균 " + formatChange(avgChange(theme)) + ")". Add the reason line only when theme.reason is truthy; this is the same check the card uses to render the reason, so an empty string is also omitted. Then add one line per stock from sortStocksByChangeDesc(theme.stocks), formatted as "- " + stock name + " " + formatChange(changeRate). Include ALL stocks (ignore the card's TOP_N). Leave out stock codes, news titles and URLs (per D-02).

2. Create `webapp/src/components/home/copy-text-button.tsx` ('use client') and export `CopyTextButton`.
   - Props:
     - `getText: () => string`. Called lazily at click time, so the text always matches what is on screen.
     - `ariaLabel: string`. The constant accessible name.
     - `label?: string`. Visible idle text. When omitted, the button is icon-only.
     - `className?: string`. Merged onto the wrapper with `cn` from '@/lib/utils'.
   - State: a status of 'idle' | 'copied' | 'failed' and a module constant RESET_MS = 1800 (inside D-03's 1.5–2s window). Keep the reset timer in a useRef, and add a useEffect cleanup that clears it on unmount.
   - Async click handler:
     - Clear any pending reset timer.
     - Inside try: if navigator.clipboard or its writeText is missing, throw an Error("clipboard API unavailable"). This covers insecure contexts and old browsers. Otherwise await navigator.clipboard.writeText(getText()) (plain text only, per D-04) and set 'copied'.
     - In catch: call console.error('[CopyTextButton] clipboard write failed', err) and set 'failed'. Log only the error, never the copied text. Never swallow the error silently (per D-03).
     - After either branch, schedule the reset to 'idle' after RESET_MS.
   - Markup:
     - Wrapper: a span with `relative inline-flex` plus className.
     - Button: `type="button"` with aria-label={ariaLabel}.
     - Icon: lucide, aria-hidden, size-4. Copy when idle, Check with text-[var(--primary)] when copied, X with text-[var(--destructive)] when failed.
   - Label variant (label given):
     - Button classes, the same caption-button tokens as ThemeCard's overflow toggle: `inline-flex items-center gap-1 rounded-[var(--r-sm)] px-[6px] py-[2px] text-[length:var(--t-caption)] text-[var(--muted-fg)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`.
     - Visible text span inside the button: label when idle, '복사됨' when copied, '복사 실패' when failed. Its colour follows the status (primary or destructive).
   - Icon variant (no label):
     - Button classes, the same 32px size as HomeHeader's icon buttons: `inline-flex size-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--muted-fg)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`. No text inside the button.
     - While status is not idle, render an aria-hidden feedback bubble next to the button with classes `pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--card)] px-[6px] py-[2px] text-[length:var(--t-caption)] font-extrabold`. Its text is '복사됨' in primary or '복사 실패' in destructive.
     - Absolute positioning means the card header never reflows. Give the bubble NO z-index utility: the ThemeCard article is not `isolate`, so a z-index could paint over the sticky top bar (the SoloCard isolate note describes the same problem).
   - Both variants: always render a sibling span with role="status", aria-live="polite" and className "sr-only" (per D-03). Its text is empty when idle, '클립보드에 복사했습니다' when copied, and '클립보드 복사에 실패했습니다' when failed. This wording is deliberately different from the visible '복사됨' / '복사 실패', so exact getByText queries still match only one element.
   - Document in the JSDoc that label-variant callers must pick an ariaLabel that contains the visible label (WCAG 2.5.3 label-in-name).

3. Edit `webapp/src/components/home/theme-card.tsx`.
   - Delete the local formatChange and avgChange helpers. Import avgChange, formatChange, formatThemeBlock and sortStocksByChangeDesc from './home-format'.
   - Replace the inline sorted computation with sortStocksByChangeDesc(theme.stocks). StockRow, the avg label and the sheet then share one formatter with the copied text (per D-02).
   - Header right side (per D-01 B): wrap the existing avg block in a div with `flex shrink-0 items-start gap-1`. Move shrink-0 from the avg block to this new wrapper and keep text-right on the avg block. Inside the wrapper, put the avg block first, then CopyTextButton (icon variant) with ariaLabel = theme.name + ' 요약 복사', getText returning formatThemeBlock(theme) with no order, and className "-mr-1 -mt-1" so the icon tucks into the card's top-right corner.
   - Add the copy button to the structure description in the component JSDoc.
   - Do not touch the sheet, the news block or the expand toggle.

4. Edit `webapp/src/components/home/__tests__/theme-card.test.tsx`.
   - The existing trigger queries use regex names (2차전지, 초전도체). These would now also match the new "… 요약 복사" buttons and throw on multiple matches, so change them to exact string names '2차전지' and '초전도체'.
   - Add a describe block 'ThemeCard — 요약 복사 (quick-260914-jtj)' with the behavior cases above.
   - In beforeEach, define navigator.clipboard with writeText = vi.fn().mockResolvedValue(undefined) via Object.defineProperty(..., configurable: true). Remove it in afterEach.
   - Use fireEvent.click and import vi, beforeEach and afterEach from vitest.

5. Edit `webapp/e2e/specs/home.spec.ts` near line 165. The theme trigger locator uses a regex name for 'AI 반도체'. Playwright name matching is substring-based and strict, so it would now also match 'AI 반도체 요약 복사'. Change it to the exact name 'AI 반도체' with `exact: true`. Change nothing else in the spec.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp exec vitest run src/components/home/__tests__/theme-card.test.tsx && pnpm -C webapp typecheck</automated>
  </verify>
  <done>Clicking a ThemeCard's '{테마명} 요약 복사' icon button writes that theme's block to the clipboard: no number, no date header, all stocks sorted desc, no links. The button shows '복사됨' feedback. theme-card.tsx has no local formatChange or avgChange. All ThemeCard tests (old and new) pass, and webapp typecheck passes, including the e2e tsconfig that covers home.spec.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 섹션 '전체 복사' — 현재 스냅샷 전체 테마 + KST 헤더 (toKstHhmm 단일 원천화)</name>
  <files>webapp/src/components/home/home-format.ts, webapp/src/components/home/home-header.tsx, webapp/src/components/home/home-client.tsx, webapp/src/components/home/__tests__/home-format.test.ts, webapp/src/components/home/__tests__/home-client.test.tsx</files>
  <behavior>
    Fixtures shared by the cases below:
    - T1 = { name: '2차전지', reason: '리튬 가격 반등·수주 공시', stocks: [{ code: '003670', name: '포스코퓨처엠', changeRate: 22.3 }, { code: '086520', name: '에코프로', changeRate: 29.9 }], news: [{ title: '리튬 반등 기사', url: 'https://example.com/li', source: '연합뉴스' }] }
    - T2 = { name: '원전', reason: null, stocks: [{ code: '052690', name: '한전기술', changeRate: 20 }, { code: '034020', name: '두산에너빌리티', changeRate: 23 }], news: [] }

    Formatter cases (home-format.test.ts):
    - formatChange: formatChange(24.06) === '+24.1%', formatChange(0) === '0.0%', formatChange(-3.24) === '-3.2%'.
    - avgChange skips non-finite rates: stocks with rates [NaN, 20, 30] give 25. A theme with no stocks gives 0.
    - sortStocksByChangeDesc returns the desc order and leaves the input array order unchanged.
    - formatThemeBlock(T1, 1) === "1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%"
    - formatThemeBlock(T2) === "원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%" (null reason omitted, no number).
    - A reason of '' is also omitted.
    - formatThemesSummary({ tradeDate: '2026-09-14', capturedAt: '2026-09-14T01:32:00.000Z' }, [T1, T2]) === "[주도 테마] 2026-09-14 10:32\n\n1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%\n\n2. 원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%". No trailing newline, and neither 'https://' nor '리튬 반등 기사' appears.
    - KST time: capturedAt '2026-09-13T23:05:00.000Z' with tradeDate '2026-09-14' gives a header starting '[주도 테마] 2026-09-14 08:05'. The date comes from tradeDate and the time is converted to KST.

    HomeClient case (home-client.test.tsx, new describe, real timers):
    - fetchHome resolves a snapshot with tradeDate '2026-09-14', capturedAt SLOT_B ('2026-09-14T01:00:00.000Z', 10:00 KST), payload.themes [T1, T2] and singles [].
    - After `await screen.findByRole('button', { name: '주도 테마 전체 복사' })` and a click, writeText is called once with "[주도 테마] 2026-09-14 10:00\n\n1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%\n\n2. 원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%".
    - The button's visible text '전체 복사' becomes '복사됨' (findByText).
    - The existing auto-refresh test is unchanged and still passes.
  </behavior>
  <action>
Start red: write home-format.test.ts and the new HomeClient describe first, run them, and watch them fail. Then implement.

1. `webapp/src/components/home/home-format.ts`:
   - Move toKstHhmm out of home-header.tsx with the Intl options unchanged, and export it.
   - Add `formatThemesSummary(snapshot: Pick<HomeThemeSnapshot, 'tradeDate' | 'capturedAt'>, themes: HomeSurgeTheme[]): string`, importing the type from '@gh-radar/shared'. It returns the header line "[주도 테마] " + snapshot.tradeDate + " " + toKstHhmm(snapshot.capturedAt), then an empty line, then each theme formatted with formatThemeBlock(theme, index + 1), with blocks joined by one empty line. No trailing newline (per D-02).
   - The header date comes from tradeDate, not from capturedAt (per D-02).

2. `webapp/src/components/home/home-header.tsx`: delete the local toKstHhmm and import it from './home-format'. slotPhaseLabel and the slider labels keep calling it, so rendering is unchanged.

3. `webapp/src/components/home/home-client.tsx` (per D-01 A):
   - Import CopyTextButton from './copy-text-button' and formatThemesSummary from './home-format'.
   - Change the 주도 테마 section render condition to require both a non-null snapshot and themes.length > 0. At runtime this is the same, since themes is empty whenever snapshot is null, but it narrows snapshot for TypeScript.
   - In that section's heading row (the flex items-center gap-2 div), add CopyTextButton after the count badge in the label variant: label "전체 복사", ariaLabel "주도 테마 전체 복사" (it contains the visible label), getText returning formatThemesSummary(snapshot, themes), and className "ml-auto" so it sits right-aligned in the existing row.
   - Because getText is lazy, it copies whichever snapshot the user is viewing, including past slots.
   - Do not add a button to the 개별 급등 section (not requested).
   - Mention the copy button on the populated-state line of the JSDoc.

4. Create `webapp/src/components/home/__tests__/home-format.test.ts` with the formatter cases from the behavior block. Compare the multi-line outputs to exact string literals, not to snapshots.

5. `webapp/src/components/home/__tests__/home-client.test.tsx`: add a separate describe '주도 테마 전체 복사 (quick-260914-jtj)' with its own beforeEach/afterEach. Keep real timers. Stub navigator.clipboard with Object.defineProperty(configurable: true) and remove it in afterEach. Reset fetchHomeMock and have it resolve the themed response. Use fireEvent.click. Do not change the existing auto-refresh describe or its fixtures.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp exec vitest run src/components/home/__tests__/home-format.test.ts src/components/home/__tests__/home-client.test.tsx src/components/home/__tests__/theme-card.test.tsx && pnpm -C webapp typecheck</automated>
  </verify>
  <done>The 주도 테마 heading row has a right-aligned '전체 복사' button. It copies the full locked-format summary of the snapshot being viewed: tradeDate plus KST HH:MM header, numbered blocks separated by blank lines, null reasons omitted, all stocks desc, no links. home-header.tsx imports toKstHhmm instead of defining it. Formatter, HomeClient and ThemeCard tests pass, and typecheck passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 복사 버튼 상태 머신 테스트 + SoloCard 헬퍼 사본 제거 + webapp 전체 게이트</name>
  <files>webapp/src/components/home/__tests__/copy-text-button.test.tsx, webapp/src/components/home/solo-card.tsx</files>
  <behavior>
    - Success, label variant: render CopyTextButton with label '전체 복사', ariaLabel '주도 테마 전체 복사', and getText = vi.fn(() => 'hello'). Before the click, getText has not been called (it is lazy). After the click, writeText has been called with 'hello', the text '복사됨' is visible, and getByRole('status') has text '클립보드에 복사했습니다'.
    - Reset: with vi.useFakeTimers({ shouldAdvanceTime: true }), after the '복사됨' state, advancing 1800ms brings back '전체 복사'. '복사됨' is gone and the status text is empty.
    - Failure: writeText rejects with new Error('denied'). '복사 실패' is visible, the status text is '클립보드 복사에 실패했습니다', and console.error was called (spy it with mockImplementation(() => {}) to keep output quiet). This proves the error is not swallowed silently (D-03).
    - API unavailable: with navigator.clipboard undefined, clicking gives '복사 실패' and does not throw (D-04 guard).
    - Icon variant: without label, the button has accessible name ariaLabel and empty text content while idle. After a successful click, the bubble text '복사됨' appears.
    - Unmount: while in the copied state, unmounting the component clears the pending reset timer. Assert that vi.getTimerCount() after unmount returns to the value measured right after render and before the click. If React's own timers make that count unstable, advance fake timers past 1800ms after unmount and assert that console.error was not called.
    - SoloCard regression: the existing solo-card tests pass after the helper is deduplicated.
  </behavior>
  <action>
1. Create `webapp/src/components/home/__tests__/copy-text-button.test.tsx` with the behavior cases above.
   - Follow the existing conventions: a `/// <reference types="@testing-library/jest-dom" />` header, vitest imports, @testing-library/react render/screen/fireEvent/act, and `await screen.findByText(...)` for async state.
   - Define navigator.clipboard per test with Object.defineProperty(navigator, 'clipboard', { value, configurable: true }). In afterEach, remove it, call vi.useRealTimers() and vi.restoreAllMocks().
   - Do not use user-event: its setup() replaces navigator.clipboard.
   - If a case fails because of a real bug in CopyTextButton, fix the component and do not weaken the test.

2. Edit `webapp/src/components/home/solo-card.tsx`: delete its local copy of the change formatter and import formatChange from './home-format'. Rendering stays identical. This removes the last duplicate, so home change% has a single source of truth.

3. From the repo root, run the full webapp gates: the whole vitest suite, typecheck (app + e2e tsconfig), and lint. Also run the two grep gates in verify:
   - No local helper definitions remain in the three home components.
   - No toast/notification package was added to webapp/package.json (per D-03).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C webapp exec vitest run src/components/home/__tests__/copy-text-button.test.tsx src/components/home/__tests__/solo-card.test.tsx && ! grep -nE '^function (formatChange|avgChange|toKstHhmm)\(' webapp/src/components/home/theme-card.tsx webapp/src/components/home/solo-card.tsx webapp/src/components/home/home-header.tsx && ! grep -nE '"(sonner|react-hot-toast|react-toastify)"' webapp/package.json && pnpm -C webapp test && pnpm -C webapp typecheck && pnpm --filter @gh-radar/webapp lint</automated>
  </verify>
  <done>The CopyTextButton tests cover success, the 1.8s reset, failure with logging, missing clipboard API, the icon variant and timer cleanup on unmount, and all pass. solo-card.tsx imports formatChange from './home-format'. No home component defines formatChange, avgChange or toKstHhmm locally. No toast dependency was added. `pnpm -C webapp test`, `pnpm -C webapp typecheck` and `pnpm --filter @gh-radar/webapp lint` all exit 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API payload → clipboard | 테마명·상승 이유(Claude 생성)·종목명이 사용자 클립보드로 나간다. 값은 이미 화면에 렌더된 공개 데이터다. |
| browser Clipboard API | 권한 거부·비보안 컨텍스트·API 부재에서 writeText 가 reject 되거나 API 가 없을 수 있다. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-jtj-01 | Tampering | copy-text-button.tsx → clipboard | low | mitigate | 일반 텍스트만 navigator.clipboard.writeText 로 쓴다. HTML ClipboardItem 은 쓰지 않으므로 AI 생성 문자열이 붙여넣는 쪽에서 마크업으로 해석될 경로가 없다. 페이지에 dangerouslySetInnerHTML 도 추가하지 않는다. |
| T-jtj-02 | Information Disclosure | home-format.ts 복사 텍스트 | low | accept | 복사 내용은 같은 화면에 이미 보이는 테마·종목·등락률뿐이다. 뉴스 URL·제목은 빼서(D-02) 원본 콘텐츠를 재배포하지 않는다(CLAUDE.md 5원칙 #5 취지). 새 데이터 노출은 없다. |
| T-jtj-03 | Information Disclosure | CopyTextButton catch 로깅 | low | mitigate | console.error 에는 에러 객체만 넘기고 복사 텍스트는 로그에 남기지 않는다. |
| T-jtj-04 | Denial of Service | Clipboard API 부재/거부 | low | mitigate | API 가 없는지 확인하고, reject 는 catch 해서 '복사 실패' 상태로 보여준다. 처리되지 않은 promise rejection 이나 렌더 크래시가 나지 않는다. Task 3 에서 테스트한다. |

패키지 설치 없음 (새 dependency 0개). 공급망(SC) 위협 해당 없음.
</threat_model>

<verification>
- Gates (Task 3 verify): `pnpm -C webapp test`, `pnpm -C webapp typecheck` and `pnpm --filter @gh-radar/webapp lint` exit 0. Both grep gates pass: no local helper copies, no toast dependency.
- E2E regression on the edited home spec: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/home.spec.ts`. This is the same command quick-260913-g4c used. Its webServer boots `PORT=3100 pnpm dev` and needs the seeded login storageState. If auth or env is unavailable in this session, write "not run (reason)" in the SUMMARY. Never report it as passed.
- Visual check (not a blocking checkpoint): at 390px width with the populated home mock, confirm three things. The ThemeCard header shows the theme name, the avg metric and the 32px copy icon on one row without clipping or overlap. The '복사됨' bubble floats below the icon without moving content and without covering the sticky top bar. The '전체 복사' button sits right-aligned in the "주도 테마 N" row. Fix any wrapping, clipping or overlap in these surfaces directly and note it in one line.
</verification>

<success_criteria>
- D-01: both placements exist. The section button copies every theme in the viewed snapshot; the card icon button copies only its own theme.
- D-02: copied text matches the locked format exactly, proven by exact-literal tests. Change % strings come from the same formatChange/avgChange functions the UI renders.
- D-03: shows '복사됨' plus a check for 1.8s and then resets, shows '복사 실패' on error with console.error, announces through role=status, has aria-label on the icon button, and adds no toast library.
- D-04: uses navigator.clipboard.writeText, with a guard for a missing API.
- formatChange, avgChange and toKstHhmm each have one definition (home-format.ts).
- The webapp test, typecheck and lint gates are green.
</success_criteria>

<output>
Create `.planning/quick/260914-jtj-copy-rising-theme-summary-text-on-themes/260914-jtj-SUMMARY.md` when done
</output>
