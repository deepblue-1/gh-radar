---
phase: 21-gh-trade-mobile-app
plan: 30
subsystem: ui
tags: [nextjs, react, history-api, pushState, radix-tabs, playwright, vitest, news, discussions]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-25 D-29 결정 · 리다이렉트 사용자 동의(재확인 답 5) · 21-26 stock-info-modal 선행 수정"
provides:
  - "NewsFullList({code, onBack?}) — 최근 7일 전체 뉴스 목록(100 캡 · 무한 스크롤 · 상태 testid) 페이지·팝업 공용"
  - "DiscussionFullList({code, onBack?}) — 최근 7일 전체 토론 목록(50 · 무한 스크롤 · 필터 로컬 · CLASSIFY_PAUSED 유지)"
  - "news-view.ts — NEWS_VIEWS · toNewsView · useNewsView(code, headRef?) → {view, showAll, back} · exitNewsView(code)"
  - "StockNewsTabPanel({code}) — 종목상세 뉴스토론 탭 요약 ↔ 전체목록 전환 · Esc = 요약"
  - "StockNewsSection · StockDiscussionSection onShowAll?: () => void (있으면 버튼, 없으면 기존 Link)"
  - "StockDetailTabs T9 — 전체목록 중 활성 뉴스토론 탭 재클릭 = 요약"
  - "옛 /stocks/{code}/news · /discussions → /stocks/{code}?tab=news&view=news|discussions 서버 리다이렉트"
affects: [21-33, 21-36]

actuals:
  tokens: 21700
  tasks: 3
  commits: 3
  plan_head_before: 89f5680d67d1d3ccc113f33bd79b3e11f316f5f3
  ledger_rev_list_count: 5

tech-stack:
  added: []
  patterns:
    - "우리가 쌓은 기록 표식은 history.state 에 둔다({ghNewsView: code}) — Next 15 패치된 pushState 가 __NA/트리를 합쳐 보존하고, 브라우저 뒤로가기로 pop 되면 표식도 같이 사라진다(모듈 변수는 낡는다)"
    - "Radix Tabs 는 이미 활성인 탭 재클릭에 onValueChange 를 부르지 않는다 — 재클릭 규칙은 트리거 onClick 이 같은 핸들러로 넘긴다"
    - "요약은 숨긴 채(hidden) 마운트 유지 — 전체목록에서 돌아와도 재조회·스켈레톤 없음(탭 T8 keepMounted 와 같은 규칙)"

key-files:
  created:
    - webapp/src/components/stock/news-view.ts
    - webapp/src/components/stock/news-full-list.tsx
    - webapp/src/components/stock/discussion-full-list.tsx
    - webapp/src/components/stock/stock-news-tab-panel.tsx
    - webapp/src/components/stock/__tests__/discussion-full-list.test.tsx
  modified:
    - webapp/src/components/stock/stock-news-section.tsx
    - webapp/src/components/stock/stock-discussion-section.tsx
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx
    - webapp/src/app/stocks/[code]/news/page.tsx
    - webapp/src/app/stocks/[code]/discussions/page.tsx
    - webapp/e2e/specs/news.spec.ts
    - webapp/e2e/specs/discussions.spec.ts
    - webapp/e2e/specs/discussion-filter.spec.ts
  deleted:
    - webapp/src/components/stock/news-page-client.tsx
    - webapp/src/components/stock/discussion-page-client.tsx
    - webapp/src/components/stock/__tests__/discussion-page-client.test.tsx (git mv → discussion-full-list.test.tsx)

key-decisions:
  - "D-29 리다이렉트는 21-25 재확인 답(동의) 그대로 — 옛 /news · /discussions 는 서버 컴포넌트 redirect, 옛 ?filter 는 버림"
  - "우리가 쌓은 기록 판정은 모듈 상태 대신 history.state 표식({ghNewsView: code}) — 브라우저 뒤로가기·새로고침 뒤에도 기록과 함께 정확"
  - "탭 재클릭 = 요약은 handleValueChange 에 두고 TabsTrigger onClick 이 넘긴다 — Radix 가 활성 탭 재클릭을 삼키기 때문(useControllableState value !== prop)"
  - "창 스크롤 복원은 같은 뉴스토론 탭에서 view 값 → null 일 때만 — 다른 탭으로 떠나면 탭 셸 스크롤에 맡기고 저장값은 남긴다"

patterns-established:
  - "탭 안 서브뷰: URL(?tab=…&view=…) 정본 + history.state 표식 + back() = 표식이면 history.back, 아니면 replaceState"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "종목상세 「전체 뉴스 보기」 → 탭 안 전체목록(?tab=news&view=news pushState) · 브라우저 뒤로 = 요약 + 창 스크롤 복원(±2) · 화면 안 ← = history.back(앞으로 가기로 재확인) · 딥링크 ← = ?tab=news 같은 경로 · Esc = 요약 · 활성 뉴스토론 탭 재클릭 = 요약"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/news.spec.ts#G-21-R3-8 탭 안 전체 뉴스 — 열기 · 뒤로가기 = 요약 + 창 스크롤 복원 · ← · 딥링크 ←"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/news.spec.ts#G-21-R3-8 허용 목록 밖 view 는 요약으로 떨어진다(T-21-82)"
        status: pass
    human_judgment: false
  - id: D2
    description: "종목상세 「전체 토론 보기」 → 탭 안 전체목록(?view=discussions) · 뒤로 = 요약 · 50건 · 새로고침 버튼 없음 · 무한 스크롤 before 커서 · axe 0 · ← = 요약(페이지 이탈 없음)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/discussions.spec.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "DiscussionFullList 필터 로컬 · 분류 정지(토글 disabled · filter all · URL 쓰기 0) · onBack 머리 줄"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/discussion-full-list.test.tsx (5 tests)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/discussion-filter.spec.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "StockDetailTabs T9 — 전체목록(표식 있음) 재클릭 history.back 1회 · 딥링크 재클릭 replaceState(?tab=news) 1회 · 다른 탭 클릭은 기존 pushState 1회 · view 없는 재클릭 pushState 0회"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx#Test 4 · Test 9 · Test 10 · Test 11"
        status: pass
    human_judgment: false
  - id: D5
    description: "옛 /stocks/{code}/news · /discussions(+ ?filter) → ?tab=news&view=news|discussions 리다이렉트 · 탭 안 100 캡"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/news.spec.ts#옛 /news → ?tab=news&view=news 리다이렉트 · 탭 안 전체목록 · ← = 요약"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/discussion-filter.spec.ts#옛 ?filter=all 진입 — 리다이렉트가 filter 를 버림"
        status: pass
    human_judgment: false
  - id: D6
    description: "앱 셸 체감 — iOS 화면 안 ← · Android 네이티브 뒤로가기(WebView goBack → popstate) · 스크롤 복원 체감 · 당겨서 새로고침이 전체목록에서 GET 만 재조회"
    requirement: MOBILE-01
    verification: []
    human_judgment: true
    rationale: "실기 WebView 뒤로가기·당김 제스처는 Playwright 데스크톱 크롬으로 재현되지 않는다 — 21-36 UAT 3차 재검증 항목"

duration: 12min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 30: 종목상세 뉴스·토론 탭 안 전체목록 Summary

**「전체 뉴스/토론 보기」가 페이지를 떠나지 않고 `?tab=news&view=news|discussions`(pushState · history.state 표식)로 탭 안 전체목록을 열고, 브라우저/Android 뒤로 · Esc · 화면 안 ← · 탭 재클릭이 요약과 창 스크롤을 되돌린다. 옛 전체 페이지는 서버 리다이렉트.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-26T10:55:43Z
- **Completed:** 2026-09-26T11:07:30Z
- **Tasks:** 3
- **Files modified:** 21 (신규 5 · 수정 11 · 삭제 3 · 이동 1 포함)

## Accomplishments

- 공용 전체목록 `NewsFullList` · `DiscussionFullList` — 옛 페이지 목록부(100/50 캡 · 무한 스크롤 · 로딩/빈/오류/페이지네이션 testid)를 그대로 옮기고, 당김 = GET 재조회만(D-18). 21-33 팝업이 `onBack` 으로 그대로 쓴다.
- `useNewsView` / `exitNewsView` — URL 정본 + 허용 목록(T-21-82) + history.state 표식으로 뒤로가기 네 경로를 한 규칙으로. 창(window) 스크롤 저장·복원.
- `StockNewsTabPanel` — 요약은 숨긴 채 마운트 유지(재조회·스켈레톤 없음), Esc = 요약(열린 다이얼로그가 있으면 양보).
- 탭 셸 T9 — 전체목록 중 활성 뉴스토론 탭 재클릭 = 요약(Radix 가 삼키는 재클릭을 트리거 onClick 이 넘김).
- 옛 `/stocks/{code}/news` · `/discussions` → 서버 컴포넌트 `redirect`(CODE_RE → encodeURIComponent · 불일치 notFound · T-21-83). 페이지 클라이언트 두 개 삭제, 남은 참조 0.

## 훅 · 컴포넌트 계약

```text
NEWS_VIEWS = ['news','discussions'] · toNewsView(raw) → NewsView | null
useNewsView(code, headRef?) → { view, showAll(v), back() }
  view      = tab==='news' 일 때만 toNewsView(?view)
  showAll   = savedScrollY[code] = window.scrollY → pushState({ghNewsView: code}, '', '?tab=news&view='+v) → 목록 머리(탭 바)를 헤더 아래로
  back      = exitNewsView(code)
exitNewsView(code): 실시간 URL 에 view 없음 → no-op · history.state.ghNewsView === code → history.back() · 아니면 replaceState(null,'','?tab=news')
복원: 같은 뉴스토론 탭에서 view 값 → null 인 레이아웃 effect 에서 window.scrollTo(0, saved) 후 삭제
NewsFullList({code, onBack?}) · DiscussionFullList({code, onBack?}) — onBack 있으면 「요약으로 돌아가기」 ← + h2
StockNewsSection / StockDiscussionSection onShowAll?: () => void — 있으면 같은 클래스 <button>, 없으면 기존 Link
```

## Task Commits

1. **Task 1: 트레이서 — NewsFullList · useNewsView · 섹션 onShowAll · 탭 패널 · e2e 왕복(뉴스)** — `a2a2aed2` (feat)
2. **Task 2: DiscussionFullList · 토론 onShowAll · 활성 탭 재클릭 = 요약** — `eb4a4e9d` (feat)
3. **Task 3: 옛 페이지 리다이렉트 · 페이지 클라이언트 삭제 · e2e 이전** — `bea4ba40` (feat)

## 리다이렉트 답

21-25-SUMMARY 재확인 답 5 = **동의** → 플랜 그대로 `/stocks/{code}?tab=news&view=news|discussions`. 옛 토론 `?filter=` 는 버린다(분류 정지 중 · 필터는 이제 로컬 상태).

## 옮긴 테스트

- `__tests__/discussion-page-client.test.tsx` → `git mv` → `__tests__/discussion-full-list.test.tsx` — 라우터 목 제거, URL 불변을 history 스파이 + 실제 `window.location` 으로 잠금, onBack 머리 줄 2건 추가(5 tests).
- `stock-detail-tabs.test.tsx` — Test 9(표식 → history.back) · Test 10(딥링크 → replaceState ?tab=news) · Test 11(다른 탭 = 기존 pushState). 기존 Test 4(view 없는 재클릭 pushState 0) 유지.
- e2e `news.spec` 옛 V-18 두 건 → 리다이렉트 + 탭 안 단언 · G-21-R3-8 두 건 신규 · V-17 링크 href → 버튼
- e2e `discussions.spec` 옛 전체 페이지 4건 → 리다이렉트 뒤 탭 안(50건 · 헤더 · 새로고침 버튼 없음은 전체목록 안으로 좁힘 · 무한 스크롤 · axe) · 「← back link navigates」 → 「← = 요약 복귀(페이지 이탈 없음)」 · 더보기 → 버튼 + 뒤로 = 요약
- e2e `discussion-filter.spec` 4건 — 리다이렉트 URL 단언 추가 · 토글 disabled · URL 불변 · 빈 배열 카피

## e2e 결과

- `playwright test news.spec discussions.spec discussion-filter.spec stock-detail-tabs.spec` → **32 passed** (setup 1 포함)
- 이후 G-21-R3-8 에 ⑥(활성 탭 재클릭 = 요약, 실제 Radix) 추가 → news G-21-R3-8 묶음 **3 passed**
- vitest `stock-detail-tabs · discussion-full-list · stock-detail-client` → **29 passed** · `src/components/stock/` + `src/app/stocks` 전체 **112 passed**
- `pnpm --filter @gh-radar/webapp run typecheck` → 통과(최종)

## Decisions Made

- 「우리가 쌓음」 표식을 모듈 변수가 아니라 `history.state`(`{ghNewsView: code}`)에 뒀다 — 플랜 문구는 `pushState(null, …)` + 모듈 상태였지만, 브라우저 뒤로가기로 기록이 pop 되면 모듈 변수는 낡는다. Next 15 가 패치한 pushState 는 넘긴 객체에 `__NA`/트리를 합쳐 넣으므로 popstate 재로드 함정도 없다(e2e 앞으로 가기로 history.back 경로 확인).
- 스크롤 복원은 같은 뉴스토론 탭 안 전이에서만 — 전체목록에서 다른 탭을 누른 경우 탭 셸 `scrollIntoView` 와 겨루지 않는다.
- 전체목록은 `DetailBands` 로 감싸지 않고 `py-6 lg:py-7` 로만 — 목록 카드(`--card`)가 띠 규칙(`--card: var(--muted)`)으로 회색 박스가 되는 것을 피했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 활성 탭 재클릭이 handleValueChange 에 도달하지 않음**
- **Found during:** Task 2
- **Issue:** 플랜은 `handleValueChange` 안에서 재클릭을 잡으라 했지만, Radix `useControllableState` 는 `value === prop` 이면 `onValueChange` 를 부르지 않는다(node_modules 확인) — 그 자리에만 넣으면 동작하지 않는다.
- **Fix:** 규칙은 `handleValueChange` 에 두고(T9) `TabsTrigger onClick={() => handleValueChange(t.v)}` 로 넘김. 다른 탭 클릭은 mousedown 이 이미 전환해 실시간 URL 가드에서 no-op.
- **Files modified:** webapp/src/components/stock/stock-detail-tabs.tsx
- **Verification:** 옛 구현 대비 RED(Test 9·10 실패: back/replaceState 0회) → 새 구현 GREEN · e2e ⑥(실제 브라우저 Radix)
- **Committed in:** eb4a4e9d

**2. [Rule 1 - Bug] 옛 전체 페이지 e2e 「새로고침 버튼 0」 이 탭 안에서는 요약(숨김)의 버튼을 셈**
- **Found during:** Task 3
- **Issue:** 요약 섹션은 숨긴 채 마운트 유지라 `discussion-refresh-button` 이 DOM 에 남는다.
- **Fix:** 단언을 `discussion-full-list` 안으로 좁힘(뉴스 100 캡 단언도 `news-list` 안으로).
- **Files modified:** webapp/e2e/specs/discussions.spec.ts, webapp/e2e/specs/news.spec.ts
- **Committed in:** bea4ba40

**3. [Acceptance] 남은 참조 0 — 새 파일 머리 주석의 옛 이름**
- **Found during:** Task 3 acceptance
- **Fix:** 새 파일 주석의 `NewsPageClient`/`DiscussionPageClient` 를 옛 파일명 표기로 바꿔 grep 0 달성(동작 변화 없음). bea4ba40 에 포함.

**4. [추가 커버리지] e2e 에 Esc · 앞으로 가기(history.back 증명) · 허용 목록 밖 view · 탭 재클릭 단계를 더함** — 플랜 ⑦ 의 최소 시나리오보다 넓다. 새 스위트는 만들지 않았다(기존 describe 안).

---

**Total deviations:** 2 auto-fixed(Rule 1) + 1 acceptance 정리 + 1 커버리지 확대
**Impact on plan:** 플랜 계약(파일 · 훅 이름 · URL · 리다이렉트)은 그대로. 재클릭 경로만 Radix 동작에 맞췄다.

## TDD (Task 2 `tdd="true"`)

구현과 테스트를 같은 태스크 안에서 작성했고 RED 는 **옛 구현에 새 테스트를 돌려** 확인했다(`git show HEAD:stock-detail-tabs.tsx` 로 잠시 되돌림): Test 9 `expected "back" to be called 1 times, but got 0` · Test 10 `expected "replaceState" to be called 1 times, but got 0` — 대상 단언 실패(INVALID_RED 아님). 새 구현으로 GREEN. 별도 `test(...)` 커밋은 없다(플랜 type=execute · tdd_mode=false).

## Issues Encountered

- 동시 세션(quick-260926-rcc 돌파감지 NXT)이 작업 중 `use-breakout-quotes.test.tsx` · `breakout-strip.test.tsx` 를 고치는 동안 `pnpm typecheck` 가 그 파일에서만 실패 — 내 파일을 제외한 tsc 로 확인하며 진행했고, 그 세션이 커밋한 뒤 최종 `pnpm typecheck` 는 통과. 그 파일은 건드리지 않았다.
- 플랜 원장(`plan_head_before` 89f5680) 이후 rev-list 는 5 — 그중 2 개(`4d62ba70` · `d6ea261b`)는 같은 master 에 끼어든 quick-260926-rcc 커밋이다. 이 플랜 커밋은 3 개.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-33 이 트레이딩 ⓘ 팝업(`stock-info-modal.tsx`)에 `NewsFullList` · `DiscussionFullList` · 섹션 `onShowAll` 을 로컬 state(`newsView`)로 붙이면 된다 — 팝업은 URL 불변(pushState 금지), `DialogContent onEscapeKeyDown` 에서 전체목록이면 preventDefault 후 요약. `StockNewsTabPanel` 의 Esc 는 열린 `[role="dialog"]` 가 있으면 양보한다.
- 사람 확인(iOS 화면 안 ← · Android 뒤로가기 · 스크롤 복원 체감 · 당김 GET)은 21-36 UAT.
- push 하지 않았다(21-36).

## Self-Check: PASSED

- FOUND: news-view.ts · news-full-list.tsx · discussion-full-list.tsx · stock-news-tab-panel.tsx · __tests__/discussion-full-list.test.tsx
- DELETED(의도): news-page-client.tsx · discussion-page-client.tsx
- FOUND commits: a2a2aed2 · eb4a4e9d · bea4ba40

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
