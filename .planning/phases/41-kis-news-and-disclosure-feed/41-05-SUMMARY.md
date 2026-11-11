---
phase: 41-kis-news-and-disclosure-feed
plan: 05
subsystem: ui
tags: [react, nextjs, polling, context, tailwind-container-queries, vitest]

requires:
  - phase: 41-01
    provides: "shared NewsByStockResponse · StockFeedEntry · STOCK_FEED_DEFAULT_DAYS/LIMIT · NEWS_BY_STOCK_MAX_CODES · GET /api/news/by-stock"
  - phase: 41-03
    provides: "by-stock 5초 캐시 · IP 당 분 600 리미터(10초 폴링 · 100코드 묶음이 그 안에 든다)"
  - phase: 41-04
    provides: "FeedKindBadge(full · mini) · --feed-* 토큰"
provides:
  - "fetchNewsByStock(codes, {days, limit}, signal) — /api/news/by-stock?codes=a,b&days=3&limit=20"
  - "formatFeedTime(publishedAt, kind, now) — KST 같은 날 공시 HH:MM:SS · 뉴스 HH:MM · 다른 날 MM/DD"
  - "useStockFeedPolling(codes) → { entries, firstSeen } · STOCK_FEED_POLL_MS 10_000 · STOCK_FEED_NEW_MS 30_000 · STOCK_FEED_CHUNK 100 · feedBadgesOf · isFeedItemNew"
  - "StockFeedProvider · StockFeedEntriesContext(export) · useStockFeedEntries · useStockFeedEntry · useStockFeedIsNew · useStockFeedAvailable"
  - "FeedRows({ items, band: 'wb' | 'lc', emptyText? }) · FEED_ROWS_EMPTY_TEXT · data-slot feed-row / feed-row-source / feed-row-source-sub"
  - "돌파 칩 · 표 「공」「뉴」 배지(data-slot breakout-feed-badges) · 표 행 선택(data-selected) → 표 아래 상세(data-slot breakout-feed-detail)"
  - "작업대 루트 <StockFeedProvider codes={돌파 코드 ∪ 카드 코드}>"
affects: [41-07, 41-09]

actuals:
  tokens: 23000
  tasks: 2
  commits: 4
plan_head_before: ba6c3aeeea2eee7b77b03d61e6134458bcfd689d
plan_head_after: c55f4a49aa4388ad40057796c4c70e09179d7520

tech-stack:
  added: []
  patterns:
    - "문맥 둘로 나누기 — entries(10초 응답 때만 바뀜)와 강조 시계(now · firstSeen, 강조 중일 때만 1초 타이머 하나). 5Hz 가격 경로(칩 · 표)는 entries 만 읽는다"
    - "폴링 effect 의존 = 형식 통과 · 중복 제거 · 정렬한 코드 결합 문자열 — 같은 집합 새 배열로는 재요청 없음"
    - "새 글 = 코드별 첫 응답을 기준선으로 잡고 그 뒤 처음 보인 id 만 firstSeen 에 시각 기록 · 바뀐 게 없으면 firstSeen 신원 유지"
    - "FeedRows 컨테이너 클래스는 band 별 리터럴 두 벌(wb 700 · lc 685) — Tailwind 스캔 · 새 경계 없음"

key-files:
  created:
    - webapp/src/lib/news-by-stock-api.ts
    - webapp/src/lib/format-feed-time.ts
    - webapp/src/lib/use-stock-feed.ts
    - webapp/src/components/trading/feed/stock-feed-context.tsx
    - webapp/src/components/trading/feed/feed-rows.tsx
    - webapp/src/lib/__tests__/use-stock-feed.test.tsx
    - webapp/src/lib/__tests__/format-feed-time.test.ts
    - webapp/src/components/trading/__tests__/feed-rows.test.tsx
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-05-T1-red.json
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-05-T2-red.json
  modified:
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx

key-decisions:
  - "돌파 표 행 클릭 = 카드 열기 → 선택 토글로 바뀜(D-17 · 목업 ②). 카드 추가 · 포커스는 「추가」 버튼과 칩이 그대로 맡는다"
  - "실패한 묶음만 건너뛴다 — 그 코드들은 마지막 entries 유지, 다음 10초 주기가 다시 시도(재시도로 두드리지 않음)"
  - "코드 집합에서 빠진 코드는 기준선을 버린다 — 다시 들어오면 그 첫 응답이 다시 기준선(새 글 오강조 방지)"
  - "작업대 카드 코드는 카드 렌더와 같은 폴백(c.code → 라벨 역매핑)으로 모은다 — 숨은 계좌 카드까지 전수"
  - "상세 머리는 「{종목명} 최근 3일 뉴스·공시 {n}건」(상한 도달 「n건+」) · 첫 응답 전은 「불러오는 중」 · 받은 뒤 0건은 「최근 3일 뉴스·공시 없음」"
  - "코드 없는(⑥ 이름 없는) 행은 조회할 종목이 없어 선택되지 않는다 · 선택 행이 목록에서 사라지면 선택을 버린다(돌아와도 닫힌 채)"

patterns-established:
  - "작업대 피드 문맥: StockFeedProvider 하나가 폴링 — 41-07 상따 카드 띠는 useStockFeedEntry(code) · useStockFeedAvailable() · FeedRows band='lc' 를 바로 쓴다"

requirements-completed: [SC-6]

coverage:
  - id: D1
    description: "작업대 뉴스·공시 폴링 — 10초 · 100코드 묶음 차례 호출 · 숨김 정지/복귀 즉시 · 실패 유지 · 코드 변경 시 abort 후 즉시 · 코드 0개 무요청"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-stock-feed.test.tsx#useStockFeedPolling — 묶음 · 주기"
        status: pass
    human_judgment: false
  - id: D2
    description: "새 글 강조 — 코드별 첫 응답 기준선 · 새 id 첫 발견 30초 · 강조 중일 때만 1초 타이머 하나(setTimeout 없음)"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-stock-feed.test.tsx#StockFeedProvider · 문맥 훅"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/feed-rows.test.tsx#공급자 안에서 새로 나타난 글은 data-new 와 --new-bg 로 칠해진다"
        status: pass
    human_judgment: false
  - id: D3
    description: "formatFeedTime KST 표기 · fetchNewsByStock 경로"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/format-feed-time.test.ts"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-stock-feed.test.tsx#fetchNewsByStock"
        status: pass
    human_judgment: false
  - id: D4
    description: "FeedRows — 시각 · 배지 · 링크/글자 제목 · 「↗」 링크 줄만 · 자료원 칸(넓은 폭)/제목 아래 줄(좁은 폭) · band 경계 wb 700 · lc 685 · 빈 문구"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/feed-rows.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "돌파 칩 · 표 「공」「뉴」 배지 · 행 선택 토글 → 표 아래 글 목록 · 행 클릭은 카드를 열지 않음 · 「추가」/칩은 카드 · 거래중 행 선택 · 사라지면 닫힘"
    requirement: "SC-6"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/breakout-strip.test.tsx#BreakoutStrip — 뉴스·공시 배지 (Phase 41 D-17) · 행 선택 → 표 아래 뉴스·공시"
        status: pass
    human_judgment: false
  - id: D6
    description: "작업대 공급자 코드 = 돌파 ∪ 카드(중복 없이 · 코드 없는 행 제외)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/trading-workbench.test.tsx#묶음 조회 코드 = 돌파 항목 코드 ∪ 카드 코드"
        status: pass
    human_judgment: false
  - id: D7
    description: "목업 ② 와 같은 모양 — 칩 · 표 배지 배치, 상세 줄 그리드, 폰 밴드 줄바꿈 · 잘림 · 겹침 없음"
    verification: []
    human_judgment: true
    rationale: "시각 확인은 41-09 UAT 몫(실행 환경 메모 7) — 이 플랜은 브라우저 렌더를 보지 않았다"

duration: 12min
completed: 2026-11-12
status: complete
---

# Phase 41 Plan 05: 작업대 피드 + ② 돌파 목록 Summary

**작업대 한 곳의 10초 묶음 조회 폴링(`StockFeedProvider`)이 돌파 칩 · 표에 「공」「뉴」 배지를 달고, 표 행을 누르면 표 아래에 그 종목의 최근 3일 뉴스·공시(`FeedRows`)를 펼친다 — 새 글은 1초 타이머 하나로 30초 강조.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-11-11T15:20:06Z
- **Completed:** 2026-11-11T15:31:53Z
- **Tasks:** 2
- **Files modified:** 14 (생성 10 · 수정 4)

## Accomplishments

- `useStockFeedPolling` — 형식 통과 코드만 정렬 · 결합 키로 의존, 100코드씩 차례로 `fetchNewsByStock`, 숨김이면 건너뛰고 다시 보이면 바로 1번, 실패한 묶음은 마지막 entries 유지, 코드 집합이 바뀌면 진행 중 요청 abort 후 바로 1번.
- `StockFeedProvider` — entries 문맥(10초 응답 때만 바뀜)과 강조 시계 문맥을 나눔. 강조할 글이 있을 때만 `setInterval` 1초 하나, 없으면 멈춤(`setTimeout` 0).
- `FeedRows` — 목업 `.fr` 그리드. 링크 줄만 새 창 · 「↗」, 자료원은 넓은 폭 오른쪽 칸 · 좁은 폭 제목 아래 줄로 늘 보임(D-20). 경계는 기존 `wb` 700 · `lc` 685 그대로.
- 돌파 스트립 — 칩 · 표 종목명 옆 「공」「뉴」 mini 배지(공 → 뉴), 표 행 선택 토글 → 표 아래 「{종목명} 최근 3일 뉴스·공시 {n}건」 상세. 칩 · 표는 원시값 / 10초 갱신 맵만 받아 5Hz 경로에 강조 시계가 섞이지 않는다.
- 작업대 루트 자식 전체를 `<StockFeedProvider codes={돌파 코드 ∪ 카드 코드}>` 로 감쌈.

## 문맥 API (41-07 이 바로 쓴다)

| 훅 | 반환 | 공급자 밖 |
|---|---|---|
| `useStockFeedEntries()` | `ReadonlyMap<code, StockFeedEntry>` | 빈 Map |
| `useStockFeedEntry(code)` | `StockFeedEntry \| undefined`(첫 응답 전 undefined) | undefined |
| `useStockFeedIsNew()` | `(id) => boolean` — 강조 시계를 읽어 1초마다 다시 그림(글 목록에서만) | 항상 false |
| `useStockFeedAvailable()` | 공급자 안이면 true | false |

`StockFeedEntriesContext` 는 export — 테스트가 entries 를 직접 주입한다(`breakout-strip.test.tsx` 의 `setupFeed`).

**행 클릭 동작 변경:** 돌파 표의 행 클릭은 이제 카드를 열지 않고 선택을 토글한다(D-17) — 카드는 「추가」 버튼 · 칩이 연다.

## Task Commits

1. **Task 1: 피드 데이터 층** — `6c4ac61a` (test · RED) → `837c3db1` (feat · GREEN)
2. **Task 2: ② 돌파 배지 · 행 선택 상세 · 작업대 결선** — `b85412c7` (test · RED) → `c55f4a49` (feat · GREEN)

## TDD Gate Compliance

- T1 RED: `tdd-red/41-05-T1-red.json` — `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `코드 150개면 100 · 50 두 번으로 나눠 …` · 19건 전부 스텁 not implemented 로 실패 · 모듈 로드 성공). GREEN 19/19.
- T2 RED: `tdd-red/41-05-T2-red.json` — `RED_EVIDENCE_OK`(target `행을 누르면 data-selected 가 붙고 …` · `data-selected` null). 전체 실행에서는 새 동작 17건이 단언 실패 · 기존 회귀 0 · 부재를 단언하는 4건은 구현 전에도 참이라 통과. GREEN 220/220.
- 처음 T2 증거는 vitest tap 리포터가 여러 줄 오류 메시지를 따옴표 안에 그대로 내보내 분류기가 `invalid_record`(Malformed TAP)로 거절했다 — 대상 단언을 한 줄 메시지 꼴(`getAttribute(...)).toBe('true')`)로 바꿔 대상 하나만 다시 돌렸다(단언 뜻은 같다).

## 테스트 수

- `use-stock-feed.test.tsx` 14 · `format-feed-time.test.ts` 5 (T1 합 19)
- `feed-rows.test.tsx` 7 · `breakout-strip.test.tsx` 57(새 11 · 바뀐 2) · `trading-workbench.test.tsx` 156(새 1)

## Files Created/Modified

- `webapp/src/lib/news-by-stock-api.ts` — 묶음 조회 함수(shared 응답 타입)
- `webapp/src/lib/format-feed-time.ts` — KST 시각 표기
- `webapp/src/lib/use-stock-feed.ts` — 폴링 훅 · 상수 · `feedBadgesOf` · `isFeedItemNew`
- `webapp/src/components/trading/feed/stock-feed-context.tsx` — 공급자 · 문맥 훅
- `webapp/src/components/trading/feed/feed-rows.tsx` — 글 줄 부품
- `webapp/src/components/trading/workbench/breakout-strip.tsx` — 설계 주석 ⑨ · 배지 · 행 선택 · 상세
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `feedCodes` · 공급자 결선
- 테스트 4개 파일 · RED 증거 2개

## Decisions Made

frontmatter `key-decisions` 참고. 요점: 행 클릭 = 선택 토글 · 실패 묶음만 건너뜀 · 빠진 코드 기준선 폐기 · 카드 코드 폴백은 카드 렌더와 같음 · 첫 응답 전 상세 문구 「불러오는 중」.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 작업대 테스트에 `@/lib/news-by-stock-api` 목 추가**
- **Found during:** Task 2
- **Issue:** 작업대가 공급자를 품으면서 기존 작업대 테스트가 실제 `apiFetch` 네트워크 경로를 타게 된다. 또 behavior 「공급자 codes = 돌파 ∪ 카드」 를 잠글 자리가 필요했다.
- **Fix:** `trading-workbench.test.tsx` 에 `fetchNewsByStock` 목(빈 응답 · 부른 코드 기록)과 케이스 1개 추가. 플랜의 Task 2 files 목록에는 없지만 verify 명령이 이 파일을 돌린다.
- **Files modified:** webapp/src/components/trading/__tests__/trading-workbench.test.tsx
- **Committed in:** b85412c7

**2. [Rule 2 - Missing Critical] 카드 코드 폴백(라벨 역매핑)**
- **Found during:** Task 2
- **Issue:** 플랜은 「`cards` 의 `code`」 라고 했으나 카드의 `code` 는 추가 시점에만 채워지고(복원 카드 등은 비어 있음) 카드 렌더는 `labels.get(isin)?.code` 로 폴백한다. 그대로 두면 그런 카드는 피드를 받지 못한다(41-07 띠가 빈다).
- **Fix:** `feedCodes` 가 카드 렌더와 같은 폴백으로 코드를 모은다.
- **Files modified:** webapp/src/components/trading/workbench/trading-workbench.tsx
- **Committed in:** c55f4a49

**3. [Rule 1 - 테스트 계약 갱신] 기존 행 클릭 케이스 2건을 새 동작으로 바꿈**
- **Found during:** Task 2 (RED)
- **Issue:** 「표의 행 클릭과 「거래 추가」 버튼도 onAddCard 1회씩이다」 · 「카드 있는 종목 행 클릭 → onFocusCard」 는 D-17 로 뜻이 바뀐 동작이다.
- **Fix:** 「행 클릭은 카드를 열지 않는다 — 「추가」 버튼은 카드를 연다」 · 「칩이 onFocusCard · 행 클릭은 포커스하지 않는다」 로 갱신(플랜 acceptance 의 케이스 이름과 일치).
- **Committed in:** b85412c7

---

**Total deviations:** 3 auto-fixed (Rule 1 · 2 · 3 각 1)
**Impact on plan:** 모두 플랜 동작을 정확히 잠그거나 41-07 띠가 비지 않게 하는 범위. 범위 확장 없음.

## Issues Encountered

- vitest `--reporter=tap-flat` 의 여러 줄 오류 메시지가 TAP 분류기에서 Malformed 로 거절됨 — TDD Gate Compliance 절에 처리 기록.
- `trading-workbench.tsx:1006` 의 `dirtyCardCount` 미사용 경고는 이 플랜 전부터 있던 것(손대지 않음).

## Known Stubs

없음. (RED 단계 스텁은 같은 태스크의 GREEN 커밋에서 모두 실제 구현으로 바뀜.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 41-07(상따 카드 띠)은 `useStockFeedEntry(code)` · `useStockFeedAvailable()` · `FeedRows band="lc"` 를 바로 쓴다 — 공급자는 이미 작업대 루트에 있다.
- 시각 확인(목업 ② 와 같은 모양 · 폰 밴드 줄바꿈/잘림)은 41-09 UAT.

## Verification

- `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/use-stock-feed.test.tsx src/lib/__tests__/format-feed-time.test.ts --maxWorkers=2` → 2 files · 19 passed
- `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/feed-rows.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` → 3 files · 220 passed
- `pnpm --filter @gh-radar/webapp run typecheck` → 통과(오류 0)
- acceptance grep: `STOCK_FEED_POLL_MS = 10_000` 1 · `STOCK_FEED_NEW_MS = 30_000` 1 · `NewsByStockResponse` 4 · 문맥 파일 `setInterval` 1 · `setTimeout` 0 · `breakout-feed-detail` 1 · `breakout-feed-badges` 1 · 작업대 `StockFeedProvider` 3 · `@min-[700px]/wb` 3 · `@min-[685px]/lc` 3 · T1 `it(` 19

## Self-Check: PASSED

- 생성 파일 5개 + SUMMARY 존재 확인
- 커밋 `6c4ac61a` · `837c3db1` · `b85412c7` · `c55f4a49` · `7fc3a30d` 모두 HEAD 조상(`git log ba6c3aee..HEAD`)
- 작업 트리 깨끗 · STATE.md / ROADMAP.md 손대지 않음

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-12*
