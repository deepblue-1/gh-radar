---
phase: 37-tick-viewer
plan: 08
subsystem: webapp
tags: [nextjs, react, cmdk, polling, url-state, sidebar, playwright, tick-viewer]
status: complete

requires:
  - phase: 37-tick-viewer (37-07)
    provides: "server GET /api/ticks/day · today · open · POST /api/ticks/convert · convert/cancel · shared tick-api 계약 · 429/502/503 코드"
provides:
  - "/analytics/ticks 페이지(AppShell + Suspense) · TickViewerPage(URL 상태 · 게이트 · 진입/열기/변환/자료 없음 분기 · useConvertPolling)"
  - "TickHeader(mode entry|loaded · 공급 배지 · 피커 자리 · 날짜 알약 · KRX|NXT · tickLabel 자리) — 37-10 이 tickLabel 을 넘긴다"
  - "TickEntry(그날 격자 목록 · 오늘 목록 · 등락률순/이름순 · 출처 칩 · 캡션)"
  - "TickStockPicker(제안 행 상태 칩 · isin 없음 흐림 · WR-05 · / 키 포커스)"
  - "TickStateCard(converting · live-loading · nodata · live-unavailable · error)"
  - "lib/ticks: tick-api(fetchTickDay · fetchTickToday · fetchTickOpen · postTickConvert · postTickCancel) · tick-url(TickUrlState · parseTickUrl · tickUrlOf · defaultTickDateOf · nodataReasonOf · NodataReason · kstNowOf · isTradingDay) · tick-format(fmtAmountC · fmtRate · fmtQty · fmtBytes)"
  - "DmaGateSurface 「틱 전문 뷰어」 · 사이드바 NAV_TICKS(item=ticks)"
  - "globals.css --vi · --vi-bg 토큰(라이트/다크) · tick-indeterminate 유틸"
  - "e2e 픽스처 webapp/e2e/fixtures/ticks.ts(tickDayFixture · tickTodayFixture · tickOpenFixture · mockTickApi · recentTradingDay · lastSaturday)"
affects: [37-10, 37-12, 37-13, 37-14, 37-19]

actuals:
  tokens: 33000
  tasks: 3
  commits: 4
plan_head_before: 657af8172ae3057d3931bf816b67a7b7aa941037
plan_head_after: 18a45b986c1773e2512578798d78ae806e9edd7f

tech-stack:
  added: []
  patterns:
    - "열기 분기는 open 1회 응답에서 결정 — grid · 진행 중 요청 · NOT_UPLOADED · failed · 사유 · 당일 · convert 순"
    - "변환 폴링은 setTimeout 체인(5초) + visibilitychange — 숨으면 멈추고 보이면 즉시 1회 · 진행 중 tick 과 겹치지 않음"
    - "열기 실행 단위 Run{alive, converting} — 날짜/종목/거래소가 바뀌거나 취소하면 alive=false 로 늦은 응답 무시 · convert 동시 1건"

key-files:
  created:
    - webapp/src/app/analytics/ticks/page.tsx
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/components/ticks/tick-header.tsx
    - webapp/src/components/ticks/tick-entry.tsx
    - webapp/src/components/ticks/tick-stock-picker.tsx
    - webapp/src/components/ticks/tick-state-card.tsx
    - webapp/src/lib/ticks/tick-api.ts
    - webapp/src/lib/ticks/tick-url.ts
    - webapp/src/lib/ticks/tick-format.ts
    - webapp/src/lib/ticks/__tests__/tick-url.test.ts
    - webapp/src/lib/ticks/__tests__/tick-format.test.ts
    - webapp/src/components/ticks/__tests__/tick-entry.test.tsx
    - webapp/src/components/ticks/__tests__/tick-stock-picker.test.tsx
    - webapp/src/components/ticks/__tests__/tick-state-card.test.tsx
    - webapp/e2e/fixtures/ticks.ts
    - webapp/e2e/specs/ticks-viewer.spec.ts
  modified:
    - webapp/src/components/trading/dma-gate.tsx
    - webapp/src/components/analytics/limitup-date-nav.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts
    - webapp/src/styles/globals.css

key-decisions:
  - "열린 화면에서 오늘(D-15 장중)은 open 이 격자를 주지 않으면 today.live 를 본다 — false 면 「당일 자료 준비 중」 · true 면 live-loading 카드(대기 0 · 37-19 가 결선)"
  - "폴링 중 request 가 failed(NOT_UPLOADED 제외) · cancelled · done(격자 없음)이면 멈추고 「변환에 실패했어요 · 다시 시도」 — convert 는 사람이 누를 때만"
  - "취소는 누르는 즉시 폴링을 멈추고(leaving) cancel 실패여도 목록으로 — Job 은 끝까지 돌고 격자는 남는다"
  - "「최근 거래일로」 = 날짜 목록에서 오늘보다 앞선 첫 날(격자가 있는 최근 날짜) · 지금 보는 날과 같으면 버튼 없음"
  - "URL 직렬화에서 기본 거래소 KRX 는 뺀다 — `?isin&d` 와 `?isin&d&ex=KRX` 는 같은 화면이라 짧은 쪽이 정본"
  - "fmtAmountC 의 1만 미만은 「4,000원」 — 「0만」 표기를 피한다(스케치 010 은 1만 미만을 정하지 않았다)"

patterns-established:
  - "틱 뷰어 상태 카드 문구는 TickStateCard 한 곳 — 페이지는 variant · 사유만 넘긴다"

requirements-completed: [D-03, D-08, D-14, D-15, D-16, D-18]

duration: 75min
completed: 2026-11-02
---

# Phase 37 Plan 08: 틱 전문 뷰어 진입 화면(목업 A) · 요청 변환 흐름 · 사이드바 · URL Summary

**`/analytics/ticks` 진입 화면을 만들었다. 머리에는 종목 검색(칩 「격자 있음 · 변환 필요 · 약 N분 · 오늘 · 라이브」)과 날짜 알약, KRX|NXT 세그먼트가 있다. 본문은 그날 격자 종목 목록과 상태 카드 5종이다. 격자 없는 종목을 열면 convert 를 1회 부르고, 「변환 중」 카드를 띄운 채 5초마다 open 을 보다가 격자가 생기면 자동으로 연다. stale 이면 convert 를 1회 다시 부른다. 업로드 전(`NOT_UPLOADED`)이면 폴링을 멈추고 「자료 없음 · 원본 업로드 전」 카드를 띄운다. 이 경우 재시도 루프는 생기지 않는다. 사이드바 「분석」 에는 「매집감지 보고서」 다음에 「틱 전문 뷰어」 를 넣었다. 단위 시험은 틱 60건과 사이드바 93건이 모두 통과했다. e2e 는 이 worktree 에 env 가 없어서 돌리지 못했다. 메인 세션에서 실행해야 한다.**

## Performance

- **Duration:** 약 75분
- **Completed:** 2026-11-02
- **Tasks:** 3/3 (Task 1 tracer · Task 2 TDD RED → GREEN · Task 3)
- **Files:** 16개 생성 · 6개 수정

## 화면 분기 표

| 조건 | 화면 | 호출 |
|---|---|---|
| 게이트(`useDmaGateReason` · 401/403) | `DmaGate surface="틱 전문 뷰어"` 만 | — |
| isin 없음 · d 없음 · KST 거래일 08:00~20:00 | 오늘 목록(「라이브」 칩 · 캡션 없음) | day(today) + today |
| isin 없음 · d 없음 · 그 밖 | 최근 격자 날짜 목록 | day(d 없이) |
| isin 없음 · 행 없음 · 사유 있음(휴장 · 미래 · 업로드 전 · 90일 밖) | 「자료 없음」 카드 + 「최근 거래일로」 | day |
| isin 없음 · 행 없음 · 사유 없음 | 목록 「이 날짜 격자 종목이 없어요」 | day |
| open grid | 머리(종목명 · 공급 배지) + 본문 자리 `data-slot="tick-body"` | open 1 |
| open request pending/running | 「변환 중」 + 5초 폴링(stale → convert 1회) | open · (convert) |
| open request failed `NOT_UPLOADED` | convert 1회 → `not_uploaded` 면 업로드 전 카드 · 아니면 변환 중 | open · convert 1 |
| open request failed(그 밖) | 「변환에 실패했어요」 · 다시 시도 = convert | open |
| open 없음 · 사유 있음 | 「자료 없음」 카드 — 90일 밖은 「이 종목만 변환(약 N분)」 도 | open |
| open 없음 · 오늘 | today.live false → 「당일 자료 준비 중」 · true → live-loading 카드 | open · today |
| open 없음 · 그 밖 | convert 1회 → 변환 중 | open · convert 1 |
| convert 429 / 503 / 그 밖 | 「오늘 요청 변환 한도에 도달했어요」 / 「요청 변환을 지금 쓸 수 없어요」 / 「변환을 시작하지 못했어요 · 다시 시도」 | — |
| 폴링 중 grid | 카드를 걷고 열림 · 폴링 정지 | — |
| 폴링 중 failed `NOT_UPLOADED` | 폴링 정지 · 업로드 전 카드(재시도 버튼 없음) | — |
| 폴링 중 탭 숨김 / 다시 보임 | 정지 / 즉시 1회 후 5초 주기 | — |
| 취소 | 폴링 즉시 정지 → cancel → 목록(`?d`) | cancel 1 |

**플래너 해석(90일 밖 두 버튼) 적용:** 적용했다. 열린 화면에서 사유가 `retention` 이면 카드에 「최근 거래일로」 와 「이 종목만 변환(약 N분)」 이 둘 다 나온다. 변환 버튼을 누르기 전에는 convert 를 부르지 않는다(시험으로 잠금). 진입 목록에서 날짜만 90일 밖이고 종목을 고르지 않았을 때는 변환할 대상이 없다. 그래서 「최근 거래일로」 만 둔다.

## 테스트

- 플랜 Task 1 verify: `shared build && typecheck && vitest tick-url · tick-format · tick-entry` → **28/28 통과**
- 플랜 Task 2 verify: `vitest tick-stock-picker · tick-state-card · tick-entry` → **40/40 통과**
  - 카드 9건(5 variant · 업로드 전 · 버튼 콜백 · `motion-reduce:animate-none`)
  - 페이지 흐름 16건: convert 1회 → 변환 중 → 폴링 grid 자동 열림 · stale 재요청 1회 · 취소 · 429 · 503 · 숨김 탭 정지/복귀 즉시 1회 · 폴링 중 NOT_UPLOADED 정지(convert 누계 1 · 실패 문구 0) · NOT_UPLOADED 재열기 not_uploaded/triggered · failed 사람 재시도 · 90일 밖 두 버튼 · 토요일 · 언마운트 정리 · 장중/장 밖 기본 날짜 · 당일 live=false
  - 피커 7건: 칩 3종 · NXT eta · isin 없음 흐림 · 클릭 · Enter · 늦은 응답 무시
- Task 3 단위: `app-sidebar.test.tsx` **93/93 통과**(순서 · item 배열 · `/analytics/ticks` 활성 · tradingVisible 거짓 미렌더)
- 회귀: `src/components/analytics` + `dma-gate` 207/207 · `layout · ticks · lib/ticks · dma-gate` 172/172 · `typecheck`(tsc + e2e tsconfig) 통과 · eslint 새 파일 0건
- **e2e 미실행** — `ticks-viewer.spec.ts`(진입 · 변환 · 게이트 · 자료 없음) · `sidebar-tree.spec.ts`. 아래 Issues 참조. `typecheck:e2e` 는 통과했다.

## TDD Gate Compliance

- RED `0d817b42` (test): 시험 32건 중 29건 실패(3건은 RED 전부터 참인 불변식: 버튼 없음 · /today 0 · 언마운트). 컴포넌트 2개는 `null` 뼈대로 두어 import 실패가 아니라 단언 실패가 되게 했다. 대상 시험 「격자 없음 → convert 1회 → 「변환 중」 → 5초 폴링에서 grid → 자동으로 열린다」 를 `-t` 로 단독 실행해 TAP 증거를 남겼고, `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK(target_test_failed)** 였다. 실패 이유는 `expected "spy" to be called 1 times, but got 0 times` 다. 트레이서 페이지에 변환 흐름이 없어서 생긴, 의도한 실패다.
- GREEN `229e382e` (feat): 40/40 통과.
- REFACTOR: 없음.

## Task Commits

1. **Task 1 (tracer): 진입 트레이서 — 그날 격자 목록 → 열기 → 머리 · URL 계약** — `f6b5a53f` (feat). 트레이서 게이트로 verify 를 끝에서 끝까지 다시 돌렸고 28/28 통과를 확인한 뒤 넘어갔다.
2. **Task 2 RED: 상태 카드 · 변환 흐름 · 피커 실패 시험** — `0d817b42` (test)
3. **Task 2 GREEN: 검색 피커 상태 칩 · 요청 변환 흐름 · 상태 카드 · 기본 날짜** — `229e382e` (feat)
4. **Task 3: 사이드바 틱 전문 뷰어(D-14) · e2e 진입 흐름** — `18a45b98` (feat)

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] `--vi` · `--vi-bg` 토큰이 globals.css 에 없었다**
- **Found during:** Task 2
- **Issue:** 플랜(그리고 37-10 · 37-13 · 37-14)은 「globals.css 의 `--vi` 토큰」 을 전제한다. 실제로는 그 토큰이 없다. 목업 사본에만 있다.
- **Fix:** 목업 사본 값을 그대로 globals.css 에 더했다. 라이트는 `#d97706` / `#fff4e6`, 다크는 `#ffb020` / `rgba(255,176,32,.16)` 이다. 진행 바 `@keyframes tick-indeterminate` · `@utility tick-indeterminate` 도 함께 더했다. `@utility` 로 둔 것은 `motion-reduce:animate-none` 이 이기게 하려는 것이다(accum-blink 와 같은 이유). 뒤 플랜들은 이 토큰을 그대로 쓰면 된다.
- **Commit:** 229e382e

**2. [Rule 2 - 접근성] 날짜 알약 ‹ › 의 접근성 이름**
- **Issue:** 플랜은 `LimitupDateNav` 를 재사용하라고 했다. 그런데 그 컴포넌트의 aria-label 은 「이전 보고서 · 다음 보고서」 로 고정돼 있다.
- **Fix:** 선택 prop `prevLabel` · `nextLabel` 을 더했다. 기본값이 기존 문구라 다른 보고서 화면과 시험은 바뀌지 않는다. 틱 뷰어는 「이전 날짜 · 다음 날짜」 를 넘긴다.
- **Commit:** f6b5a53f

**3. [Rule 2 - 계약 보강] TickHeader 에 prev · next prop**
- **Issue:** 플랜의 TickHeader 시그니처에는 날짜 이동 대상이 없다. 그런데 알약 ‹ › 는 day 응답 dates 로 판정해야 한다.
- **Fix:** `prev` · `next` 를 받는다. 페이지가 `dateNavOf` 로 계산하고, 장중이면 오늘을 목록 맨 앞에 더한다.
- **Commit:** f6b5a53f

**4. [Rule 2 - 계약 보강] TickStateCard props 확장**
- **Issue:** 목업 문구 「{종목} · {날짜} 변환 중」 · 「{날짜} 자료가 없어요」 를 그리려면 주어와 날짜 라벨이 필요하다. 또 날짜 이력이 없을 때 「최근 거래일로」 를 숨길 수 있어야 한다.
- **Fix:** `subject?` · `dateLabel?` 를 더했다. `onLatest` 는 `(() => void) | null` 이다. error variant 에는 `onBack?`(목록으로)을 더했다. `onRetry` 는 선택이다. 429 · 503 에는 재시도 버튼이 없다.
- **Commit:** 229e382e

**5. [Rule 2 - 견고성] e2e 날짜를 실행일에서 계산**
- **Issue:** 변환 · 자료 없음 케이스를 고정 날짜로 두면 90일 뒤 「보관 밖」 카드로 바뀌어 시험이 깨진다.
- **Fix:** `recentTradingDay()`(7일 이상 전 거래일) · `lastSaturday()` 를 픽스처에 두었다. 진입 케이스만 고정 20261016 을 쓴다. 이 날짜는 격자가 있어 보관 판정을 타지 않는다.
- **Commit:** 18a45b98

**6. [Rule 2] `fmtBytes` 추가** — 「격자 준비됨 · 레코드 n건 · 크기」 줄에 쓴다(`fmtAmountC` 는 원 단위라 맞지 않는다). Commit f6b5a53f.

## Known Stubs

| 파일 | 위치 | 이유 · 해소 플랜 |
|---|---|---|
| webapp/src/components/ticks/tick-viewer-page.tsx | `renderOpen` `case 'loaded'` (`data-slot="tick-body"`) | 플랜이 정한 본문 자리 — 지금은 「격자 준비됨 · 레코드 n건 · 크기」 한 줄. 37-10 이 `TickViewer` 로 바꾼다 |
| webapp/src/components/ticks/tick-viewer-page.tsx | `case 'live-loading'` `queued={0}` · `progress={null}` | server `today.live` 는 37-15 결선 전까지 늘 false 라 지금은 도달하지 않는다. 대기열 · 진행은 37-19 가 결선한다 |

두 자리 모두 이 플랜의 목표(진입 · 열기 · 변환 · URL)를 막지 않는다.

## Issues Encountered

- **e2e 미실행:** 이 worktree 에는 `.env.local` · `.env.test.local` 이 없다. 이 둘이 있어야 Supabase 테스트 사용자 로그인(`auth.setup`)과 dev 서버가 돈다. 메인 트리 파일을 복사하거나 심볼릭 링크로 걸려고 했지만 비밀 파일 가드(`Secret read guard`)가 둘 다 막았다. 가드를 우회하지 않았다. **메인 세션에서 실행해야 한다:** `cd webapp && pnpm exec playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1`. 포트 3100 · relay 8090 이 다른 세션과 겹치지 않을 때 돌려야 한다. `reuseExistingServer` 가 남의 dev 서버를 재사용하면 이 코드가 아니게 된다.
- `.planning/WINDOWS.md` 장부에 위 미실행 항목을 추가하려 했지만 실패했다. `gsd-tools windows append` 가 「Ledger counts disagree with entries: 4/0/13/17 vs 3/0/14/17」 로 거부했다. 기존 장부의 frontmatter 집계가 실제 항목과 어긋나 있어서다. 이 플랜 밖의 문제라 고치지 않았다.
- worktree 격리 쉘이 복합 git 명령을 거부했다. 그래서 커밋 기록 파일(`gsd-plan-head-before-37-08`)은 만들지 않았다. plan_head_before 에는 dispatch base `657af817` 을 썼고, `git rev-list --count 657af817..HEAD` = 4 로 실측했다.
- 실화면을 시각 확인하지 못했다. env 가 없어 dev 서버를 띄울 수 없었다. 레이아웃은 목업 A 치수를 옮겼다. 폭 1280 가로 넘침은 e2e(`expectNoHorizontalScroll`)에 단언으로 넣어 두었다.

## User Setup Required

없음. 배포는 하지 않았다. webapp push 가 곧 프로덕션 배포이고, 그 순서는 D-22 로 메인 세션이 정한다.

## Next Phase Readiness

- 37-10: `tick-viewer-page.tsx` `case 'loaded'` 자리에 `TickViewer` 를 넣는다. `TickHeader` 의 `tickLabel` 에 현재 틱 시각/seq 를 넘긴다. `t` 는 `parseTickUrl` 이 이미 파싱한다. replaceState 직렬화에는 `tickUrlOf` 를 쓴다.
- 37-13 · 37-14: `--vi` · `--vi-bg` 토큰이 생겼다.
- 37-19: `TickStateCard variant="live-loading"` 의 `queued` · `progress` 를 결선한다.

## Self-Check: PASSED

- FOUND: 16개 생성 파일 · 6개 수정 파일
- FOUND: f6b5a53f · 0d817b42 · 229e382e · 18a45b98 (HEAD 조상)
- 수락 기준 grep: `"틱 전문 뷰어"`(dma-gate) · `export function parseTickUrl` · `export function fmtAmountC` · `Suspense`(page) · `surface="틱 전문 뷰어"` · `변환 필요`(picker) · `최근 거래일로` · `당일 자료 준비 중` · `업로드 전`(state-card) · `NOT_UPLOADED`(page) · `href: "/analytics/ticks", label: "틱 전문 뷰어"` · `item="ticks"` · `'틱 전문 뷰어'`(sidebar-tree · 「매집감지 보고서」 다음 원소) — 전부 OK
